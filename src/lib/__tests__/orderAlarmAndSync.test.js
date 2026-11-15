import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  snoozeOrderAlarm,
  clearAlarmSnooze,
  isOrderAlarmSnoozed,
} from '../orderAlarm';
import { isOnlineIncomingOrder } from '../../components/IncomingOrderAlarmOverlay';
import {
  normalizeChannelLabel,
  classifyOrderBucket,
  summarizeOrdersCumulativeTotals,
} from '../../components/orda/LiveOrdersView';
import { applyOrderStatusUpdate, mergeOrdersWithPoj } from '../../services/data/pojSyncService';
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
});
