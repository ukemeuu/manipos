import { describe, expect, it } from 'vitest';
import {
  buildTraderWhatsAppShareUrl,
  computeMonthlyQuotaStatus,
  computeTraderInvoiceTotals,
  nextTraderDocumentNumber,
  resolveInvoiceDisplayStatus,
} from '../traderInvoices';

describe('traderInvoices helpers', () => {
  it('enforces Free (10 total), Starter KES 290 (30 invoices + 30 receipts), and Unlimited KES 700', () => {
    const now = new Date('2026-11-19T12:00:00Z');
    const tenDocs = Array.from({ length: 10 }, (_, i) => ({
      id: `d-${i}`,
      doc_type: i % 2 === 0 ? 'invoice' : 'receipt',
      created_at: '2026-11-10T10:00:00Z',
    }));

    const freeQuota = computeMonthlyQuotaStatus(tenDocs, { plan: 'free' }, now);
    expect(freeQuota.canCreateInvoice).toBe(false);
    expect(freeQuota.canCreateReceipt).toBe(false);

    const starterInvoicesFull = Array.from({ length: 30 }, (_, i) => ({
      id: `i-${i}`,
      doc_type: 'invoice',
      created_at: '2026-11-10T10:00:00Z',
    }));
    const starterQuota = computeMonthlyQuotaStatus(starterInvoicesFull, { plan: 'starter' }, now);
    expect(starterQuota.canCreateInvoice).toBe(false);
    expect(starterQuota.canCreateReceipt).toBe(true);

    const unlimitedQuota = computeMonthlyQuotaStatus(starterInvoicesFull, { plan: 'unlimited' }, now);
    expect(unlimitedQuota.canCreateInvoice).toBe(true);
    expect(unlimitedQuota.canCreateReceipt).toBe(true);
  });

  it('computes subtotal, optional 16% VAT, overdue status, and sequential doc numbers', () => {
    const totals = computeTraderInvoiceTotals(
      [
        { name: 'Beef Sirloin', quantity: 5, unit_price: 850 },
        { name: 'Goat Meat', quantity: 2, unit_price: 900 },
      ],
      true
    );
    expect(totals).toEqual({
      subtotal: 6050,
      taxAmount: 968,
      totalAmount: 7018,
    });

    expect(
      resolveInvoiceDisplayStatus(
        { status: 'pending', due_date: '2026-11-10' },
        new Date('2026-11-19T10:00:00Z')
      )
    ).toBe('overdue');

    expect(
      nextTraderDocumentNumber(
        [{ invoice_number: 'INV-0004' }, { invoice_number: 'RCT-0002' }],
        'invoice'
      )
    ).toBe('INV-0005');
  });

  it('builds WhatsApp share link with Till/Paybill and public invoice URL', () => {
    const url = buildTraderWhatsAppShareUrl(
      {
        invoice_number: 'INV-0007',
        doc_type: 'invoice',
        buyer_name: 'Pot of Jollof',
        buyer_phone: '254712345678',
        total_amount: 8500,
        amount_paid: 0,
        due_date: '2026-11-25',
        public_token: 'abc-123',
      },
      {
        business_name: 'Prime Meats Ltd',
        currency: 'KES',
        mpesa_till_no: '551122',
      }
    );
    expect(url).toContain('https://wa.me/254712345678?text=');
    expect(decodeURIComponent(url)).toContain('M-Pesa Till No: 551122');
    expect(decodeURIComponent(url)).toContain('https://manipos.com/#/inv/abc-123');
  });
});
