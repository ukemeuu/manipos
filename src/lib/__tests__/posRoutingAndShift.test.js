import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isAdminAccount,
  resolveOrdaEntryState,
  getVisibleOrdaRailIds,
} from '../posRouting';
import {
  getBusinessDayStartIso,
  summarizeShiftSales,
} from '../posShiftService';
import {
  buildCashierSlipsHTML,
  buildKitchenSlipsHTML,
  buildZReportHTML,
  setReceiptBrand,
} from '../posPrintService';

describe('Interface B (Orda) Routing & RBAC', () => {
  it('routes non-admin cashiers and waiters directly into Web POS Create Order regardless of requested tab/route', () => {
    const cashier = { id: 'u1', name: 'Ronaldo', role: 'cashier' };
    const res1 = resolveOrdaEntryState({ staffUser: cashier, requestedRoute: 'dashboard', tabParam: 'wallet' });
    expect(res1).toEqual({
      isAdmin: false,
      activeModule: 'orders',
      activeTab: 'orders',
      initialWebPos: true,
    });

    const waiter = { id: 'u2', name: 'Grace', role: 'waiter' };
    const res2 = resolveOrdaEntryState({ staffUser: waiter, requestedRoute: 'app', tabParam: 'settings' });
    expect(res2.isAdmin).toBe(false);
    expect(res2.initialWebPos).toBe(true);
    expect(res2.activeModule).toBe('orders');
  });

  it('routes admin to Orders by default, or Web POS when ?page=pos / terminal is requested', () => {
    const admin = { id: 'a1', name: 'Owner', role: 'admin' };
    expect(resolveOrdaEntryState({ staffUser: admin })).toEqual({
      isAdmin: true,
      activeModule: 'orders',
      activeTab: 'orders',
      initialWebPos: false,
    });

    expect(resolveOrdaEntryState({ staffUser: admin, requestedRoute: 'pos' }).initialWebPos).toBe(true);
    expect(resolveOrdaEntryState({ staffUser: admin, requestedRoute: 'terminal' }).initialWebPos).toBe(true);
    expect(resolveOrdaEntryState({ staffUser: admin, tabParam: 'hr-admin' })).toMatchObject({
      isAdmin: true,
      activeModule: 'settings',
      activeTab: 'hr-admin',
      initialWebPos: false,
    });
  });

  it('resolves every Orda module tab deterministically so URL deep links and refreshes match clicked buttons', () => {
    const admin = { id: 'a1', name: 'Owner', role: 'admin' };
    const cases = [
      ['wallet', 'wallet'],
      ['subscriptions', 'wallet'],
      ['paystack', 'wallet'],
      ['menu', 'menu'],
      ['reports', 'dashboard'],
      ['analytics', 'dashboard'],
      ['fpa-expenses', 'dashboard'],
      ['customers', 'customers'],
      ['promotions', 'customers'],
      ['feedback', 'customers'],
      ['settings', 'settings'],
      ['locations', 'settings'],
      ['staff', 'settings'],
      ['inventory', 'inventory'],
      ['receiving', 'inventory'],
      ['account', 'account'],
      ['staff-portal', 'account'],
      ['orders', 'orders'],
    ];

    for (const [tabParam, expectedModule] of cases) {
      expect(resolveOrdaEntryState({ staffUser: admin, requestedRoute: 'dashboard', tabParam })).toEqual({
        isAdmin: true,
        activeModule: expectedModule,
        activeTab: tabParam,
        initialWebPos: false,
      });
    }
  });

  it('hides Admin modules (dashboard, wallet, account, settings, menu) from cashiers on the Orda icon rail', () => {
    const cashier = { id: 'u1', name: 'Ronaldo', role: 'cashier' };
    const cashierRail = getVisibleOrdaRailIds({ staffUser: cashier, permissions: ['view_orders'] });
    expect(cashierRail).toEqual(['orders']);
    expect(cashierRail).not.toContain('wallet');
    expect(cashierRail).not.toContain('account');
    expect(cashierRail).not.toContain('dashboard');
    expect(cashierRail).not.toContain('settings');
    expect(cashierRail).not.toContain('menu');

    const admin = { id: 'a1', name: 'Owner', role: 'admin' };
    const adminRail = getVisibleOrdaRailIds({ staffUser: admin, permissions: [] });
    expect(adminRail).toEqual([
      'orders',
      'dashboard',
      'customers',
      'menu',
      'settings',
      'wallet',
      'inventory',
      'account',
    ]);
    expect(isAdminAccount(admin)).toBe(true);
    expect(isAdminAccount(cashier)).toBe(false);
  });
});

describe('POS Shift Reconciliation & Business Day Window', () => {
  it('computes 7:00 AM EAT business day cutoff correctly before and after 7am', () => {
    const morningBeforeCut = new Date('2026-11-15T06:30:00.000+03:00');
    const dayStartBefore = getBusinessDayStartIso(morningBeforeCut);
    expect(dayStartBefore).toBe('2026-11-14T04:00:00.000Z'); // 2026-11-14 07:00 EAT

    const middayAfterCut = new Date('2026-11-15T13:15:00.000+03:00');
    const dayStartAfter = getBusinessDayStartIso(middayAfterCut);
    expect(dayStartAfter).toBe('2026-11-15T04:00:00.000Z'); // 2026-11-15 07:00 EAT
  });

  it('summarizes paid Cash, M-Pesa, Card, and Split orders while excluding voided/cancelled orders', () => {
    const shiftStart = '2026-11-15T04:00:00.000Z';
    const summary = summarizeShiftSales({
      openingCash: 2000,
      staffName: 'Ronaldo',
      shiftStartIso: shiftStart,
      orders: [
        {
          id: '1',
          total_amount: 1200,
          payment_method: 'Cash',
          payment_status: 'paid',
          status: 'Completed',
          cashier_name: 'Ronaldo',
          created_at: '2026-11-15T08:00:00.000Z',
        },
        {
          id: '2',
          total_amount: 3500,
          payment_method: 'MPESA Paybill',
          payment_status: 'paid',
          status: 'Completed',
          cashier_name: 'Ronaldo',
          created_at: '2026-11-15T09:00:00.000Z',
        },
        {
          id: '3',
          total_amount: 1500,
          payment_method: 'Split Payment',
          notes: 'Split: Cash 500 + MPESA 1000',
          payment_status: 'paid',
          status: 'Completed',
          cashier_name: 'Ronaldo',
          created_at: '2026-11-15T09:30:00.000Z',
        },
        {
          id: '4',
          total_amount: 9999,
          payment_method: 'Cash',
          payment_status: 'paid',
          status: 'Voided',
          cashier_name: 'Ronaldo',
          created_at: '2026-11-15T10:00:00.000Z',
        },
        {
          id: '5',
          total_amount: 800,
          payment_method: 'Cash',
          payment_status: 'paid',
          status: 'Completed',
          cashier_name: 'DifferentStaff',
          created_at: '2026-11-15T10:15:00.000Z',
        },
      ],
    });

    expect(summary.ordersCount).toBe(3);
    expect(summary.cashSales).toBe(1700);
    expect(summary.mpesaSales).toBe(4500);
    expect(summary.cardSales).toBe(0);
    expect(summary.totalSales).toBe(6200);
    expect(summary.expectedCash).toBe(3700); // 2000 float + 1700 cash
  });
});

describe('Thermal Receipt, Kitchen KOT & Z-Report Print Builders', () => {
  beforeEach(() => {
    setReceiptBrand({
      name: 'Pot of Jollof',
      paybill: '542542',
      account: '992422',
      phone: '+254700000000',
    });
  });

  it('builds KES 80mm receipt & kitchen KOT HTML with Paybill 542542 / Account 992422 from camelCase snapshot', () => {
    const receipt = {
      ticketNumber: '7421',
      customerName: 'Amara',
      diningOption: 'Dine In',
      tableNumber: 'T4',
      totalAmount: 1500,
      paymentMethod: 'MPESA Paybill',
      paymentStatus: 'paid',
      cashier: 'Ronaldo',
      items: [{ name: 'Smoky Party Jollof', quantity: 2, price: 750, note: 'Extra spicy' }],
      createdAt: '2026-11-15T11:00:00.000Z',
    };

    const cashierHtml = buildCashierSlipsHTML(receipt);
    expect(cashierHtml).toContain('POT OF JOLLOF');
    expect(cashierHtml).toContain('KES 1,500');
    expect(cashierHtml).toContain('542542');
    expect(cashierHtml).toContain('992422');
    expect(cashierHtml).toContain('Smoky Party Jollof');
    expect(cashierHtml).toContain('Extra spicy');
    expect(cashierHtml).toContain('AMARA');

    const kotHtml = buildKitchenSlipsHTML(receipt);
    expect(kotHtml).toContain('KITCHEN ORDER TICKET (KOT)');
    expect(kotHtml).toContain('Smoky Party Jollof');
    expect(kotHtml).toContain('2x');
  });

  it('builds Z-Report HTML in KES', () => {
    const html = buildZReportHTML({
      shift: {
        staff_name: 'Ronaldo',
        opened_at: '2026-11-15T05:00:00.000Z',
        closed_at: '2026-11-15T17:00:00.000Z',
        opening_cash: 2000,
        expected_cash: 3700,
        closing_cash: 3700,
        discrepancy: 0,
      },
      ordersCount: 3,
      cashSales: 1700,
      mpesaSales: 4500,
      cardSales: 0,
      otherSales: 0,
      totalSales: 6200,
    });

    expect(html).toContain('END OF SHIFT Z-REPORT');
    expect(html).toContain('KES 6,200');
    expect(html).toContain('KES 3,700');
    expect(html).toContain('RONALDO');
  });
});
