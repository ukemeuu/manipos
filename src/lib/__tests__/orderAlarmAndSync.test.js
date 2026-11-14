import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  snoozeOrderAlarm,
  clearAlarmSnooze,
  isOrderAlarmSnoozed,
} from '../orderAlarm';
import { isOnlineIncomingOrder } from '../../components/IncomingOrderAlarmOverlay';
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
