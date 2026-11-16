import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  snoozeOrderAlarm,
  clearAlarmSnooze,
  isOrderAlarmSnoozed,
  triggerNativeOrderAlert,
} from '../orderAlarm';
import { isOnlineIncomingOrder } from '../../components/IncomingOrderAlarmOverlay';
import {
  normalizeChannelLabel,
  classifyOrderBucket,
  canReturnOrder,
  summarizeOrdersCumulativeTotals,
} from '../../components/orda/LiveOrdersView';
import {
  buildCashierSlipsHTML,
  buildKitchenSlipsHTML,
  printAllOrderSlips,
} from '../posPrintService';
import {
  applyOrderStatusUpdate,
  mergeOrdersWithPoj,
  remapPojModifierGroupForManiPos,
  fetchPojOrdersForRange,
  updatePojOrderStatus,
  resetPojEdgeProxyCache,
  clearPojSession,
} from '../../services/data/pojSyncService';
import { supabase } from '../supabase';
import {
  writeActivePortalCookie,
  readActivePortalCookie,
  clearActivePortalCookie,
} from '../crossTabSession';
import { syncExpenseToGoogleSheet, syncDailySalesToGoogleSheet } from '../googleSheetsSyncService';

describe('orderAlarm & IncomingOrderAlarmOverlay detection', () => {
  beforeEach(() => {
    clearAlarmSnooze();
  });

  it('detects pending microsite/delivery/whatsapp orders for continuous ringing', () => {
    expect(
      isOnlineIncomingOrder({
        status: 'Pending',
        order_channel: 'Microsite',
        cashier_name: 'Self-Service Microsite',
      })
    ).toBe(true);

    expect(
      isOnlineIncomingOrder({
        status: 'Pending',
        order_channel: 'Online',
        sales_channel: 'Microsite',
        payment_status: 'pending_verification',
        cashier_name: 'Self-Service Microsite',
      })
    ).toBe(true);

    expect(
      isOnlineIncomingOrder({
        status: 'Verifying',
        sales_channel: 'Microsite',
        cashier_name: 'Staff',
      })
    ).toBe(true);

    expect(
      isOnlineIncomingOrder({
        status: 'Preparing',
        order_channel: 'Microsite',
      })
    ).toBe(false);

    expect(
      isOnlineIncomingOrder({
        status: 'Pending',
        order_channel: 'Walk-in',
        dining_option: 'Dine-in',
        cashier_name: 'Alice',
      })
    ).toBe(false);

    // Regression: sales_channel defaults to 'pos' in SQL while order_channel = 'Online'
    expect(
      isOnlineIncomingOrder({
        status: 'Pending',
        sales_channel: 'pos',
        order_channel: 'Online',
        cashier_name: 'Self-Service Microsite',
      })
    ).toBe(true);

    expect(
      normalizeChannelLabel({
        sales_channel: 'pos',
        order_channel: 'Online',
        cashier_name: 'Self-Service Microsite',
      })
    ).toBe('MICROSITE');

    expect(
      isOnlineIncomingOrder({
        status: 'Pending',
        sales_channel: 'pos',
        order_channel: 'POS',
        cashier_name: 'Ronaldo',
      })
    ).toBe(false);
  });

  it('tracks explicit 30s snooze and clearAlarmSnooze cleanly', () => {
    expect(isOrderAlarmSnoozed()).toBe(false);
    snoozeOrderAlarm(30000);
    expect(isOrderAlarmSnoozed()).toBe(true);
    clearAlarmSnooze();
    expect(isOrderAlarmSnoozed()).toBe(false);
  });
});

describe('googleSheetsSyncService multi-tenant guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('never syncs financial data to Pot of Jollof sheet for other tenants', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchSpy;
    localStorage.setItem('pin_staff_user', JSON.stringify({ tenantSlug: 'otherbistro' }));

    await syncExpenseToGoogleSheet({ description: 'Milk', amount: 500 });
    await syncDailySalesToGoogleSheet({ gross_sales: 10000 });
    expect(fetchSpy).not.toHaveBeenCalled();

    localStorage.setItem('pin_staff_user', JSON.stringify({ tenantSlug: 'potofjollof' }));
    await syncExpenseToGoogleSheet({ description: 'Spices', amount: 1500 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Microsite-only acceptance, immediate Accept update, POJ ticket merge, cumulative totals & cross-tab portal cookie', () => {
  it('routes non-microsite POS/Walk-in/Glovo Pending orders straight to processing without Accept/Decline gate', () => {
    expect(classifyOrderBucket({ status: 'Pending', order_channel: 'POS', cashier_name: 'Ronaldo' })).toBe('processing');
    expect(classifyOrderBucket({ status: 'New', order_channel: 'Walk-in', cashier_name: 'Alice' })).toBe('processing');
    expect(classifyOrderBucket({ status: 'Pending', order_channel: 'Glovo', cashier_name: 'Ronaldo' })).toBe('processing');
    expect(
      isOnlineIncomingOrder({ status: 'Pending', order_channel: 'Glovo', cashier_name: 'Ronaldo' })
    ).toBe(false);

    expect(
      classifyOrderBucket({ status: 'Pending', order_channel: 'Microsite', cashier_name: 'Self-Service Microsite' })
    ).toBe('new');
    expect(
      isOnlineIncomingOrder({ status: 'Pending', order_channel: 'Microsite', cashier_name: 'Self-Service Microsite' })
    ).toBe(true);
  });

  it('applies immediate Accept status patch in-memory and links POJ ticket_number + total without losing items', () => {
    const initial = [
      { id: 'poj-1', source_poj_id: 'poj-1', ticket_number: '1090', total_amount: 2500, status: 'Pending', _fromPoj: true },
      { id: 'mp-2', ticket_number: '6478', total_amount: 1980, status: 'Preparing', items: [] },
    ];
    const updated = applyOrderStatusUpdate(initial, {
      orderId: 'poj-1',
      sourcePojId: 'poj-1',
      updatedOrder: { id: 'poj-1', status: 'Preparing', accepted_at: '2026-11-15T15:00:00Z' },
    });
    expect(updated[0].status).toBe('Preparing');
    expect(classifyOrderBucket(updated[0])).toBe('processing');

    const merged = mergeOrdersWithPoj(
      [{ id: 'mp-2', ticket_number: '6478', total_amount: 1980, status: 'Preparing', items: [] }],
      [{ id: 'c4f4f62c-poj', ticket_number: '6478', total_amount: 1980, status: 'Preparing', items: [], _fromPoj: true }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].source_poj_id).toBe('c4f4f62c-poj');
    expect(merged[0]._fromPoj).toBe(true);
  });

  it('computes cumulative orders total KES, paid KES, and pending KES while excluding voided/cancelled orders', () => {
    const totals = summarizeOrdersCumulativeTotals([
      { status: 'Completed', payment_status: 'Paid', total_amount: 1500 },
      { status: 'Preparing', payment_status: 'Pending', total_amount: 1980 },
      { status: 'Voided', payment_status: 'Voided', total_amount: 9999 },
      { status: 'Cancelled', payment_status: 'Pending', total_amount: 500 },
    ]);
    expect(totals.countedOrdersCount).toBe(2);
    expect(totals.cumulativeTotal).toBe(3480);
    expect(totals.paidTotal).toBe(1500);
    expect(totals.pendingTotal).toBe(1980);
  });

  it('writes, reads, and clears the cross-tab active portal cookie cleanly', () => {
    clearActivePortalCookie();
    expect(readActivePortalCookie()).toBeNull();
    writeActivePortalCookie({
      tenantSlug: 'potofjollof',
      restaurantName: 'Pot of Jollof',
      staffName: 'Ronaldo',
      role: 'cashier',
      isAdmin: false,
    });
    const portal = readActivePortalCookie();
    expect(portal).toMatchObject({
      tenantSlug: 'potofjollof',
      restaurantName: 'Pot of Jollof',
      staffName: 'Ronaldo',
      role: 'cashier',
      isAdmin: false,
    });
    clearActivePortalCookie();
    expect(readActivePortalCookie()).toBeNull();
  });

  it('remaps POJ modifier groups (e.g. Preference spice levels) to ManiPOS UUIDs without duplicates and clamps min_selected', () => {
    const pojNameById = new Map([
      ['poj-item-1', 'JOLLOF RICE & CHICKEN'],
      ['poj-item-2', 'BEEF SUYA'],
      ['poj-item-unmapped', 'SEASONAL SPECIAL'],
    ]);
    const maniIdByName = new Map([
      ['JOLLOF RICE & CHICKEN', 'mani-uuid-1'],
      ['BEEF SUYA', 'mani-uuid-2'],
    ]);

    const pref = remapPojModifierGroupForManiPos({
      pojGroup: {
        name: 'Preference',
        is_required: false,
        min_selected: 0,
        max_selected: 99,
        options: [
          { name: 'Extra Spicy', price: 0, is_available: true },
          { name: 'Mild / Less Spice', price: 0, is_available: true },
          { name: 'No Pepper', price: 0, is_available: true },
        ],
        menu_item_ids: ['poj-item-1', 'poj-item-2', 'poj-item-unmapped'],
      },
      pojNameById,
      maniIdByName,
      existingGroup: {
        id: 'existing-pref',
        name: 'Preference',
        menu_item_ids: ['mani-uuid-1'],
      },
    });

    expect(pref.name).toBe('Preference');
    expect(pref.options.map((o) => o.name)).toEqual(['Extra Spicy', 'Mild / Less Spice', 'No Pepper']);
    expect(pref.menu_item_ids).toEqual(['mani-uuid-1', 'mani-uuid-2']);
    expect(pref.allow_multiple).toBe(true);

    const dirtyLarge = remapPojModifierGroupForManiPos({
      pojGroup: {
        name: 'large',
        is_required: true,
        min_selected: 200,
        max_selected: 1,
        options: [
          { name: 'Regular', price: 0 },
          { name: 'Large', price: 350 },
        ],
        menu_item_ids: ['poj-item-1'],
      },
      pojNameById,
      maniIdByName,
    });
    expect(dirtyLarge.min_selected).toBe(1);
    expect(dirtyLarge.max_selected).toBe(1);
    expect(dirtyLarge.is_required).toBe(true);
    expect(dirtyLarge.menu_item_ids).toEqual(['mani-uuid-1']);

    const preservedOptional = remapPojModifierGroupForManiPos({
      pojGroup: {
        name: 'Starters & Bites',
        is_required: true,
        min_selected: 1,
        max_selected: 1,
        options: [
          { name: 'Small', price: 0 },
          { name: 'Large', price: 655 },
        ],
        menu_item_ids: ['poj-item-1'],
      },
      pojNameById,
      maniIdByName,
      existingGroup: {
        id: 'existing-starters',
        name: 'Starters & Bites',
        is_required: false,
        min_selected: 0,
        menu_item_ids: ['mani-uuid-1'],
      },
    });
    expect(preservedOptional.is_required).toBe(false);
    expect(preservedOptional.min_selected).toBe(0);
  });

  it('uses poj-orders-sync Edge Function for PIN-only sessions and falls back cleanly on missingSecret/404', async () => {
    clearPojSession();
    resetPojEdgeProxyCache();

    const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({
              data: { poj_supabase_url: 'https://bfrvzwmckuiafkgwemdt.supabase.co', link_auth_enabled: true },
              error: null,
            }),
          }),
        }),
      }),
    });

    const invokeSpy = vi
      .spyOn(Object.getPrototypeOf(supabase.functions), 'invoke')
      .mockResolvedValueOnce({
        data: {
          ok: true,
          orders: [
            {
              id: 'poj-6478',
              ticket_number: '6478',
              customer_name: 'Adam',
              total_amount: 1980,
              items: [{ id: 'it-1', item_name: 'Jollof Rice', quantity: 1, unit_price: 1980 }],
            },
          ],
        },
        error: null,
      });

    const edgeOrders = await fetchPojOrdersForRange({
      tenantSlug: 'potofjollof',
      restaurantId: 'd0db680a-7956-45a5-85ae-a4286f3370a0',
    });

    expect(invokeSpy).toHaveBeenCalledWith('poj-orders-sync', expect.objectContaining({
      body: expect.objectContaining({
        tenant_slug: 'potofjollof',
        restaurant_id: 'd0db680a-7956-45a5-85ae-a4286f3370a0',
      }),
    }));
    expect(edgeOrders).toHaveLength(1);
    expect(edgeOrders[0].items).toHaveLength(1);
    expect(edgeOrders[0]._fromPoj).toBe(true);

    // Fallback test when POJ_SERVICE_ROLE_KEY secret is not configured yet
    resetPojEdgeProxyCache();
    invokeSpy.mockResolvedValueOnce({
      data: { ok: false, missingSecret: true },
      error: null,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { id: 'poj-6479', ticket_number: '6479', total_amount: 1200, items: [] },
      ]),
    });

    const fallbackOrders = await fetchPojOrdersForRange({
      tenantSlug: 'potofjollof',
      restaurantId: 'd0db680a-7956-45a5-85ae-a4286f3370a0',
    });
    expect(fetchSpy).toHaveBeenCalled();
    expect(fallbackOrders).toHaveLength(1);
    expect(fallbackOrders[0].ticket_number).toBe('6479');

    // Second call skips cached unavailable edge function without re-invoking
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ([]),
    });
    await fetchPojOrdersForRange({
      tenantSlug: 'potofjollof',
      restaurantId: 'd0db680a-7956-45a5-85ae-a4286f3370a0',
    });
    expect(invokeSpy).toHaveBeenCalledTimes(2);

    invokeSpy.mockRestore();
    fetchSpy.mockRestore();
    fromSpy.mockRestore();
  });

  it('prefers ServiceWorkerRegistration.showNotification for Android Chrome push alerts', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const prevNotification = globalThis.Notification;
    const prevSw = navigator.serviceWorker;

    globalThis.Notification = function MockNotification() {
      throw new TypeError('Illegal constructor');
    };
    globalThis.Notification.permission = 'granted';
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({ showNotification }),
      },
    });

    await triggerNativeOrderAlert({
      id: 'ord-push-1',
      ticket_number: '9912',
      total_amount: 1850,
      customer_name: 'Amina',
      order_channel: 'Microsite',
    });

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringContaining('NEW ORDER #9912'),
      expect.objectContaining({
        tag: 'manipos-order-ord-push-1',
        renotify: true,
        requireInteraction: true,
      })
    );

    globalThis.Notification = prevNotification;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: prevSw,
    });
  });

  it('allows waiters and cashiers to return Completed/Duplicate orders and excludes Returned orders from cumulative totals', () => {
    expect(canReturnOrder({ id: 'o-1', status: 'Completed' })).toBe(true);
    expect(canReturnOrder({ id: 'o-2', status: 'Ready' })).toBe(true);
    expect(canReturnOrder({ id: 'o-3', status: 'Pending', order_channel: 'Microsite' })).toBe(true);
    expect(canReturnOrder({ id: 'o-4', status: 'Returned' })).toBe(false);
    expect(canReturnOrder({ id: 'o-5', status: 'Voided' })).toBe(false);

    expect(classifyOrderBucket({ id: 'o-4', status: 'Returned' })).toBe('returned');

    const totals = summarizeOrdersCumulativeTotals([
      { id: '1', status: 'Completed', payment_status: 'Paid', total_amount: 2500 },
      { id: '2', status: 'Returned', payment_status: 'Refunded', total_amount: 1200 },
      { id: '3', status: 'Voided', payment_status: 'Voided', total_amount: 500 },
    ], 'active');

    expect(totals.countedOrdersCount).toBe(1);
    expect(totals.cumulativeTotal).toBe(2500);
  });

  it('builds combined cashier + KOT receipt HTML cleanly with item instructions and fallback summary', () => {
    const html = buildCashierSlipsHTML({
      ticketNumber: '7102',
      customerName: 'Grace',
      totalAmount: 1400,
      items: [{ name: 'Jollof Rice', quantity: 2, price: 700, instructions: 'Extra Spicy' }],
    }, null, { includeKot: true });

    expect(html).toContain('CUSTOMER COPY');
    expect(html).toContain('KITCHEN ORDER TICKET (KOT)');
    expect(html).toContain('Extra Spicy');

    const kotEmpty = buildKitchenSlipsHTML({ ticketNumber: '7103', totalAmount: 950, items: [] });
    expect(kotEmpty).toContain('Order Items (Summary)');
    expect(typeof printAllOrderSlips).toBe('function');
  });

  it('routes updatePojOrderStatus through poj-orders-sync patch_order for PIN sessions and merges POJ items onto pos_order_items', async () => {
    resetPojEdgeProxyCache();
    window.localStorage.removeItem('manipos_poj_session_v1');

    const fromSpy = vi.spyOn(supabase, 'from').mockReturnValue({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({
              data: { poj_supabase_url: 'https://bfrvzwmckuiafkgwemdt.supabase.co', link_auth_enabled: true },
              error: null,
            }),
          }),
        }),
      }),
    });

    const invokeSpy = vi
      .spyOn(Object.getPrototypeOf(supabase.functions), 'invoke')
      .mockResolvedValueOnce({
        data: { ok: true, data: [{ id: 'poj-6495', status: 'Ready' }] },
        error: null,
      });

    const res = await updatePojOrderStatus({
      tenantSlug: 'potofjollof',
      restaurantId: 'd0db680a-7956-45a5-85ae-a4286f3370a0',
      pojOrderId: 'poj-6495',
      patch: { status: 'Ready', payment_method: 'Cash' },
    });

    expect(res.ok).toBe(true);
    expect(invokeSpy).toHaveBeenCalledWith('poj-orders-sync', expect.objectContaining({
      body: expect.objectContaining({
        action: 'patch_order',
        poj_order_id: 'poj-6495',
        patch: { status: 'Ready', payment_method: 'Cash' },
      }),
    }));

    const merged = mergeOrdersWithPoj(
      [{ id: 'm-6495', source_poj_id: 'poj-6495', ticket_number: '6495', status: 'Ready', items: [], pos_order_items: [] }],
      [{ id: 'poj-6495', source_poj_id: 'poj-6495', ticket_number: '6495', status: 'Preparing', items: [{ id: 'it-1', item_name: 'Egusi Soup', quantity: 1, price: 2200 }], _fromPoj: true }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('Ready');
    expect(merged[0].items).toHaveLength(1);
    expect(merged[0].pos_order_items).toHaveLength(1);

    invokeSpy.mockRestore();
    fromSpy.mockRestore();
  });
});
