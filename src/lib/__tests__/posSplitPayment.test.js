import { describe, it, expect } from 'vitest';
import {
  splitTotalEqually,
  buildGuestReceipts,
  buildGuestReceiptItems,
  buildSplitNote,
  isPaybillMethod,
} from '../posSplitPayment';

describe('posSplitPayment', () => {
  it('splits a total so the shares always add back up', () => {
    expect(splitTotalEqually(1000, 2)).toEqual([500, 500]);
    const three = splitTotalEqually(1000, 3);
    expect(three).toEqual([333, 333, 334]);
    expect(three.reduce((s, v) => s + v, 0)).toBe(1000);
  });

  it('recognises I&M Paybill style tenders', () => {
    expect(isPaybillMethod('I&M Paybill')).toBe(true);
    expect(isPaybillMethod('M-Pesa')).toBe(true);
    expect(isPaybillMethod('Cash')).toBe(false);
  });

  it('builds one receipt per guest with unique ids and their own total', () => {
    const baseReceipt = { id: 'order-1', ticketNumber: 'A12', total_amount: 2000, cashier: 'Alex' };
    const receipts = buildGuestReceipts({
      baseReceipt,
      guests: [
        { name: 'Wanjiku', amount: '1200', method: 'Cash', reference: '' },
        { name: 'Otieno', amount: '800', method: 'I&M Paybill', reference: 'abc123' },
      ],
      orderTotal: 2000,
    });

    expect(receipts).toHaveLength(2);
    expect(receipts[0].id).not.toBe(receipts[1].id);
    expect(receipts[0].total_amount).toBe(1200);
    expect(receipts[1].total_amount).toBe(800);
    expect(receipts[1].payment_method).toBe('I&M Paybill');
    expect(receipts[1].splitDetails).toContain('Ref ABC123');
    // The summary line is priced at the guest share so the printed TOTAL matches.
    expect(receipts[0].items).toEqual([
      expect.objectContaining({ price: 1200 }),
    ]);
  });

  it('needs at least two guests with an amount before receipts are produced', () => {
    const receipts = buildGuestReceipts({
      baseReceipt: { id: 'order-2' },
      guests: [{ amount: '2000', method: 'Cash' }, { amount: '', method: 'Cash' }],
      orderTotal: 2000,
    });
    expect(receipts).toEqual([]);
  });

  it('derives item lines from guest assignments and shared dishes', () => {
    const cart = [
      { key: 'a', title: 'Nyama Choma', unitPrice: 600, quantity: 1 },
      { key: 'b', title: 'Ugali', unitPrice: 200, quantity: 2 },
      { key: 'c', title: 'Soda', unitPrice: 100, quantity: 1 },
    ];
    const assignments = { a: 0, b: 1 };

    const guestOne = buildGuestReceiptItems({
      cart,
      guestIndex: 0,
      guestCount: 2,
      assignments,
      guestAmount: 650,
    });
    // Nyama Choma + half of the shared Soda, scaled to what guest 1 paid.
    const names = guestOne.map((i) => i.item_name);
    expect(names).toContain('Nyama Choma');
    expect(names).toContain('Share of shared items');
    expect(names).not.toContain('Ugali');

    const total = guestOne.reduce((s, i) => s + i.price * i.quantity, 0);
    expect(Math.round(total)).toBe(650);
  });

  it('formats guest notes with the tender names the shift parser expects', () => {
    const note = buildSplitNote({
      mode: 'guests',
      guests: [
        { amount: '1200', method: 'Cash' },
        { amount: '800', method: 'I&M Paybill', reference: 'abc123' },
      ],
    });
    expect(note).toContain('Guest 1: Cash (KES 1,200)');
    expect(note).toContain('Guest 2: I&M Paybill (KES 800, Ref ABC123)');
  });

  it('formats a tender split including the Paybill reference', () => {
    const note = buildSplitNote({
      mode: 'tender',
      cash: '1000',
      paybill: '750',
      paybillRef: 'xyz9',
      card: '250',
      notes: 'guest paid at counter',
    });
    expect(note).toBe(
      'Cash (KES 1,000) + I&M Paybill (KES 750, Ref XYZ9) + Card (KES 250) · guest paid at counter'
    );
  });
});
