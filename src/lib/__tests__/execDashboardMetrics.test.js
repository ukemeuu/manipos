import { describe, it, expect } from 'vitest';
import {
  toLocalDateKey,
  getDatePresetRange,
  computeExecDashboardMetrics,
} from '../execDashboardMetrics';
import {
  normalizeChannelLabel,
  formatChannelDisplayName,
  normalizePaymentMethodLabel,
} from '../orderChannel';

describe('execDashboardMetrics & channel/payment normalization', () => {
  it('uses local calendar date keys cleanly for presets', () => {
    const sampleDate = new Date(2026, 10, 15, 18, 50, 0); // 15 Nov 2026 18:50 local
    expect(toLocalDateKey(sampleDate)).toBe('2026-11-15');
    expect(getDatePresetRange('today', sampleDate)).toEqual({ start: '2026-11-15', end: '2026-11-15' });
    expect(getDatePresetRange('yesterday', sampleDate)).toEqual({ start: '2026-11-14', end: '2026-11-14' });
    expect(getDatePresetRange('7d', sampleDate)).toEqual({ start: '2026-11-09', end: '2026-11-15' });
    expect(getDatePresetRange('month', sampleDate)).toEqual({ start: '2026-11-01', end: '2026-11-15' });
  });

  it('includes today Preparing/Accepted/Ready/Paid-Pending orders in Total Sales while excluding Returned/Cancelled/Voided', () => {
    const orders = [
      {
        id: 'o-1',
        status: 'Preparing',
        payment_status: 'Paid',
        payment_method: 'I&M Paybill',
        order_channel: 'Walk-in',
        sales_channel: 'pos',
        total_amount: 3000,
        created_at: '2026-11-15T12:00:00Z',
      },
      {
        id: 'o-2',
        status: 'Accepted',
        payment_status: 'Paid',
        payment_method: 'CASH',
        order_channel: 'Walk-in',
        sales_channel: 'pos',
        total_amount: 1500,
        created_at: '2026-11-15T12:30:00Z',
      },
      {
        id: 'o-3',
        status: 'Pending',
        payment_status: 'Paid',
        payment_method: 'Paid to APP',
        order_channel: 'Glovo',
        sales_channel: 'pos',
        total_amount: 1449,
        created_at: '2026-11-15T13:00:00Z',
      },
      {
        id: 'o-4',
        status: 'Preparing',
        payment_status: 'Pending',
        payment_method: 'Paid to App',
        order_channel: 'Online',
        sales_channel: 'Microsite',
        total_amount: 3990,
        created_at: '2026-11-15T14:00:00Z',
      },
      {
        id: 'o-5',
        status: 'Ready',
        payment_status: 'Paid',
        payment_method: 'CARD',
        order_channel: 'Uber Eats',
        sales_channel: 'pos',
        total_amount: 4745,
        created_at: '2026-11-15T15:00:00Z',
      },
      {
        id: 'o-6',
        status: 'Completed',
        payment_status: 'Paid',
        payment_method: 'Cash',
        order_channel: 'WhatsApp',
        sales_channel: 'pos',
        total_amount: 2000,
        created_at: '2026-11-15T15:30:00Z',
      },
      {
        id: 'o-ret',
        status: 'Returned',
        payment_status: 'Pending',
        payment_method: 'CASH',
        order_channel: 'Walk-in',
        total_amount: 2500,
        created_at: '2026-11-15T15:40:00Z',
      },
      {
        id: 'o-can',
        status: 'Cancelled',
        payment_status: 'Pending',
        payment_method: 'Paid to App',
        order_channel: 'Online',
        sales_channel: 'Microsite',
        total_amount: 1200,
        created_at: '2026-11-15T15:45:00Z',
      },
      {
        id: 'o-void',
        status: 'Voided',
        payment_status: 'Voided',
        payment_method: 'Cash',
        order_channel: 'Walk-in',
        total_amount: 900,
        created_at: '2026-11-15T15:50:00Z',
      },
    ];

    const metrics = computeExecDashboardMetrics(orders);

    // Valid sales sum: 3000 + 1500 + 1449 + 3990 + 4745 + 2000 = 16684
    expect(metrics.totalCount).toBe(9);
    expect(metrics.validCount).toBe(6);
    expect(metrics.totalSales).toBe(16684);
    expect(metrics.paidSales).toBe(12694);
    expect(metrics.unpaidSales).toBe(3990);
    expect(metrics.voidCount).toBe(1);
    expect(metrics.voidAmount).toBe(900);
    expect(metrics.cancelledCount).toBe(2);
    expect(metrics.cancelledAmount).toBe(3700);
    expect(metrics.processedCount).toBe(5); // o-1, o-2, o-4 (kitchen), o-5 (ready), o-6 (completed)

    // Processing stage breakdown includes counts + KES per stage
    const stageByKey = Object.fromEntries(metrics.processingBreakdown.map((s) => [s.key, s]));
    expect(stageByKey.in_kitchen).toMatchObject({ count: 3, amount: 8490 });
    expect(stageByKey.ready_dispatched).toMatchObject({ count: 1, amount: 4745 });
    expect(stageByKey.completed).toMatchObject({ count: 1, amount: 2000 });
    expect(stageByKey.pending_approval).toMatchObject({ count: 1, amount: 1449 });
    expect(stageByKey.cancelled_returned).toMatchObject({ count: 2, amount: 3700 });
    expect(stageByKey.void_failed).toMatchObject({ count: 1, amount: 900 });

    // Payment method case normalization (Paid to APP + Paid to App, CASH + Cash, CARD + Card)
    expect(metrics.byPayment).toEqual([
      expect.objectContaining({ method: 'Paid to App', count: 2, amount: 5439, paidAmount: 1449, pendingAmount: 3990 }),
      expect.objectContaining({ method: 'Card', count: 1, amount: 4745 }),
      expect.objectContaining({ method: 'Cash', count: 2, amount: 3500 }),
      expect.objectContaining({ method: 'I&M Paybill', count: 1, amount: 3000 }),
    ]);

    // Channel normalization preserves Walk-in, Uber Eats, Glovo, Microsite, WhatsApp instead of collapsing to 'pos'
    expect(metrics.byChannel).toEqual([
      expect.objectContaining({ channel: 'Uber Eats', count: 1, amount: 4745 }),
      expect.objectContaining({ channel: 'Walk-in', count: 2, amount: 4500 }),
      expect.objectContaining({ channel: 'Microsite', count: 1, amount: 3990 }),
      expect.objectContaining({ channel: 'WhatsApp', count: 1, amount: 2000 }),
      expect.objectContaining({ channel: 'Glovo', count: 1, amount: 1449 }),
    ]);
  });

  it('normalizes payment methods and channel labels safely on edge inputs', () => {
    expect(normalizePaymentMethodLabel({ payment_method: 'CASH' })).toBe('Cash');
    expect(normalizePaymentMethodLabel({ payment_method: 'Mpesa Paybill' })).toBe('I&M Paybill');
    expect(normalizePaymentMethodLabel({ payment_method: 'Paid to APP' })).toBe('Paid to App');
    expect(normalizePaymentMethodLabel({ payment_method: '', payment_status: 'Pending' })).toBe('Unassigned / Pending');
    expect(formatChannelDisplayName(normalizeChannelLabel({ sales_channel: 'pos', order_channel: 'Uber Eats' }))).toBe('Uber Eats');
    expect(formatChannelDisplayName(normalizeChannelLabel({ sales_channel: 'Ubereats', order_channel: 'Ubereats' }))).toBe('Uber Eats');
    expect(formatChannelDisplayName(normalizeChannelLabel({ sales_channel: 'Dine-in', order_channel: 'Dine-in' }))).toBe('Dine-in');
    expect(formatChannelDisplayName(normalizeChannelLabel({ sales_channel: 'Takeaway', order_channel: 'Takeaway' }))).toBe('Takeaway');
    expect(formatChannelDisplayName(normalizeChannelLabel({ sales_channel: 'Bolt Food', order_channel: 'Bolt Food' }))).toBe('Bolt Food');
    expect(formatChannelDisplayName(normalizeChannelLabel({ sales_channel: 'Microsite', order_channel: 'Online' }))).toBe('Microsite');
  });
});
