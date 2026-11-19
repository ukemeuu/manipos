/**
 * posSplitPayment.js — helpers for the two split-payment modes in Web POS.
 *
 *  guests -> one bill shared by several diners, one receipt per guest
 *  tender -> one guest paying part cash/card and part I&M Paybill
 *
 * The helpers are pure so they can be unit tested without a browser.
 */

export const GUEST_SPLIT_METHODS = [
  { id: 'Cash', label: 'Cash' },
  { id: 'I&M Paybill', label: 'I&M Paybill' },
  { id: 'Card', label: 'Card' },
];

export function isPaybillMethod(method) {
  return /paybill|i&m|m-?pesa|mpesa|till/i.test(String(method || ''));
}

export function cartLineKey(line) {
  return String(line?.key ?? line?.id ?? line?.title ?? '');
}

export function makeGuestRow(index) {
  return { name: `Guest ${index + 1}`, amount: '', method: 'Cash', reference: '' };
}

/**
 * Splits an order total across the guests. Amounts are rounded to whole
 * shillings and the last guest absorbs the rounding remainder so the printed
 * shares always add back to the bill.
 */
export function splitTotalEqually(total, count) {
  const n = Math.max(1, Number(count) || 1);
  const rounded = Math.round(Math.max(0, Number(total) || 0));
  const base = Math.floor(rounded / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? rounded - base * (n - 1) : base));
}

export function buildGuestReceiptItems({ cart = [], guestIndex, guestCount, assignments = {}, guestAmount }) {
  const label = `Share of order (Guest ${guestIndex + 1} of ${guestCount})`;
  const anyAssigned = Object.values(assignments || {}).some((v) => v != null);
  if (!anyAssigned || cart.length === 0) {
    return [{ item_name: label, quantity: 1, price: guestAmount }];
  }

  const items = [];
  let sharedTotal = 0;
  cart.forEach((line) => {
    const lineTotal = Number(line.unitPrice || 0) * Number(line.quantity || 1);
    const owner = assignments[cartLineKey(line)];
    if (owner === guestIndex) {
      items.push({
        item_name: line.title || line.name || 'Item',
        quantity: Number(line.quantity || 1),
        price: Number(line.unitPrice || 0),
        instructions: line.summary || '',
      });
    } else if (owner == null) {
      sharedTotal += lineTotal;
    }
  });

  if (sharedTotal > 0) {
    items.push({
      item_name: 'Share of shared items',
      quantity: 1,
      price: Math.round(sharedTotal / Math.max(1, guestCount)),
    });
  }

  if (items.length === 0) {
    return [{ item_name: label, quantity: 1, price: guestAmount }];
  }

  // Discounts/taxes move the guest's real payment away from the raw item sum,
  // so scale the lines to reconcile with the amount they actually paid.
  const raw = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 1), 0);
  if (raw > 0 && guestAmount > 0 && Math.abs(raw - guestAmount) > 0.5) {
    const scale = guestAmount / raw;
    items.forEach((it) => {
      it.price = Math.round(Number(it.price || 0) * scale * 100) / 100;
    });
  }
  return items;
}

/**
 * Builds the printable receipt for every guest in a split bill. Each slip is a
 * normal receipt whose total is that guest's share, so the printed TOTAL
 * always matches what the guest handed over.
 */
export function buildGuestReceipts({ baseReceipt, guests = [], orderTotal = 0, cart = [], assignments = {} }) {
  // Keep each guest's original index so item assignments stay pointed at the
  // right person even when a row is skipped.
  const indexed = (Array.isArray(guests) ? guests : [])
    .map((guest, index) => ({ guest, index }))
    .filter(({ guest }) => Number(guest?.amount || 0) > 0);
  const count = indexed.length;
  if (count < 2) return [];
  const ticket = baseReceipt?.ticketNumber || baseReceipt?.ticket_number || '';

  return indexed.map(({ guest, index }, position) => {
    const amount = Number(guest.amount || 0);
    const method = isPaybillMethod(guest.method) ? 'I&M Paybill' : String(guest.method || 'Cash');
    const reference = String(guest.reference || '').trim().toUpperCase();
    const meta = [
      `Guest ${position + 1} of ${count}`,
      `Bill KES ${Number(orderTotal || 0).toLocaleString()}`,
    ];
    if (reference) meta.push(`Ref ${reference}`);

    return {
      ...baseReceipt,
      // Unique per guest so the print cooldown does not swallow guest 2 and 3.
      id: `${baseReceipt?.id || ticket || 'guest'}-g${position + 1}`,
      customer_name: String(guest.name || '').trim() || `Guest ${position + 1}`,
      total_amount: amount,
      discount: 0,
      payment_method: method,
      payment_status: 'paid',
      splitDetails: meta.join(' · '),
      items: buildGuestReceiptItems({
        cart,
        guestIndex: index,
        guestCount: count,
        assignments,
        guestAmount: amount,
      }),
    };
  });
}

/**
 * Formats the split detail stored on the order so shift reconciliation can
 * allocate the sale per tender. Keep the tender names ("Cash", "I&M Paybill",
 * "Card") intact — posShiftService parses them back out.
 */
export function buildSplitNote({ mode, guests = [], cash = 0, paybill = 0, paybillRef = '', card = 0, notes = '' }) {
  if (mode === 'guests') {
    const parts = (Array.isArray(guests) ? guests : [])
      .filter((g) => Number(g?.amount || 0) > 0)
      .map((guest, index) => {
        const method = isPaybillMethod(guest.method) ? 'I&M Paybill' : String(guest.method || 'Cash');
        const ref = String(guest.reference || '').trim().toUpperCase();
        return `Guest ${index + 1}: ${method} (KES ${Number(guest.amount).toLocaleString()}${ref ? `, Ref ${ref}` : ''})`;
      })
      .join('; ');
    return [parts, String(notes || '').trim()].filter(Boolean).join(' · ');
  }

  const ref = String(paybillRef || '').trim().toUpperCase();
  const parts = [
    Number(cash || 0) > 0 ? `Cash (KES ${Number(cash).toLocaleString()})` : '',
    Number(paybill || 0) > 0 ? `I&M Paybill (KES ${Number(paybill).toLocaleString()}${ref ? `, Ref ${ref}` : ''})` : '',
    Number(card || 0) > 0 ? `Card (KES ${Number(card).toLocaleString()})` : '',
  ].filter(Boolean).join(' + ');
  return [parts, String(notes || '').trim()].filter(Boolean).join(' · ');
}
