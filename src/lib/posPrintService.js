import { FEEDBACK_QR_CODE } from './feedbackQrBase64';
import { printOrFallback } from './qzPrint';
import { supabase } from './supabase';

const FRONT_DESK_PRINTER_KEY = 'pos_front_desk_printer';
const KITCHEN_PRINTER_KEY = 'pos_kitchen_printer';

let receiptBrand = {};

export function setReceiptBrand(brand) {
  receiptBrand = brand || {};
}

export function getReceiptBrand() {
  return receiptBrand;
}

/**
 * The receipt header should carry the brand the cashier actually selected
 * (e.g. "LITTLE LAGOS"), not the legal store name. Contact details and the
 * logo stay from the store profile.
 */
function brandOverrideFromReceipt(receipt) {
  const raw = String(receipt?.brand || '').trim();
  if (!raw || ['MANIPOS', 'ALL'].includes(raw.toUpperCase())) return null;
  const base = getReceiptBrand() || {};
  return { ...base, name: raw };
}

export function getPrinterPrefs() {
  try {
    return {
      frontDeskPrinter: localStorage.getItem(FRONT_DESK_PRINTER_KEY) || '',
      kitchenPrinter: localStorage.getItem(KITCHEN_PRINTER_KEY) || '',
    };
  } catch {
    return { frontDeskPrinter: '', kitchenPrinter: '' };
  }
}

export function setPrinterPrefs({ frontDeskPrinter, kitchenPrinter }) {
  try {
    if (frontDeskPrinter !== undefined) {
      localStorage.setItem(FRONT_DESK_PRINTER_KEY, String(frontDeskPrinter || '').trim());
    }
    if (kitchenPrinter !== undefined) {
      localStorage.setItem(KITCHEN_PRINTER_KEY, String(kitchenPrinter || '').trim());
    }
  } catch (_) {}
}

export async function loadReceiptBrandForTenant(restaurantId, fallbackName = 'ManiPOS') {
  if (!restaurantId) return getReceiptBrand();
  try {
    const [{ data: rest }, { data: setting }] = await Promise.all([
      supabase.from('restaurants').select('id, name, slug, tagline, logo_url').eq('id', restaurantId).maybeSingle(),
      supabase.from('restaurant_settings').select('*').eq('restaurant_id', restaurantId).limit(1).maybeSingle(),
    ]);
    const merged = {
      id: restaurantId,
      name: rest?.name || fallbackName,
      slug: rest?.slug || '',
      tagline: rest?.tagline || '',
      logo: setting?.logo_url || rest?.logo_url || '',
      address: setting?.address || '',
      phone: setting?.phone || '',
      kraPin: setting?.kra_pin || '',
      website: setting?.website || '',
      tillNumber: setting?.till_number || '',
      paybill: setting?.mpesa_paybill || '',
      account: setting?.mpesa_account || '',
    };
    setReceiptBrand(merged);
    return merged;
  } catch {
    return getReceiptBrand();
  }
}

export function obfuscateTicket(ticketNum) {
  if (!ticketNum) return '';
  const num = parseInt(String(ticketNum).replace(/\D/g, ''), 10);
  if (Number.isNaN(num)) return String(ticketNum);
  const P = 382373;
  const M = 1000000;
  return String((num * P) % M).padStart(6, '0');
}

function escapeReceiptHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCustomerName(name) {
  if (!name || !String(name).trim() || String(name).trim().toUpperCase() === 'WALK-IN GUEST') {
    return '___________________';
  }
  return escapeReceiptHtml(String(name).toUpperCase());
}

function normalizeItems(rawItems = []) {
  const list = Array.isArray(rawItems) ? rawItems : [];
  return list.map((item) => ({
    item_name: item.item_name || item.title || item.name || 'Menu Item',
    quantity: Number(item.quantity || 1),
    price: Number(item.price ?? item.unitPrice ?? item.unit_price ?? 0),
    instructions: item.instructions || item.summary || item.note || item.modifiers || '',
  }));
}

function normalizeReceipt(receipt = {}) {
  return {
    ...receipt,
    ticket_number: receipt.ticket_number || receipt.ticketNumber || receipt.order_number || String(receipt.id || '').slice(0, 6),
    total_amount: Number(receipt.total_amount ?? receipt.totalAmount ?? 0),
    discount: Number(receipt.discount ?? 0),
    created_at: receipt.created_at || receipt.createdAt || Date.now(),
    dining_option: receipt.dining_option || receipt.diningOption || 'Dine In',
    table_number: receipt.table_number || receipt.tableNumber || '',
    cashier_name: receipt.cashier_name || receipt.cashier || receipt.staff_name || 'STAFF',
    customer_name: receipt.customer_name || receipt.customerName || '',
    delivery_address: receipt.delivery_address || receipt.deliveryAddress || '',
    payment_method: receipt.payment_method || receipt.paymentMethod || 'CASH',
    payment_status: receipt.payment_status || receipt.paymentStatus || 'PAID',
  };
}

function receiptBrandHeader(brandOverride = null) {
  const brand = brandOverride || receiptBrand || {};
  const name = escapeReceiptHtml((brand.name || 'ManiPOS').toUpperCase());
  const tagline = brand.tagline ? escapeReceiptHtml(String(brand.tagline).toUpperCase()) : '';
  const address = brand.address ? escapeReceiptHtml(brand.address) : '';
  const phone = brand.phone ? escapeReceiptHtml(brand.phone) : '';
  const kraPin = brand.kraPin ? escapeReceiptHtml(brand.kraPin) : '';
  const website = brand.website ? escapeReceiptHtml(brand.website) : '';

  let logo = '';
  if (brand.logo) {
    const raw = String(brand.logo);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const absolute = /^https?:\/\//i.test(raw) ? raw : `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
    logo = `<img src="${escapeReceiptHtml(absolute)}" alt="${name}" style="max-height:56px;max-width:160px;object-fit:contain;margin:0 auto 6px;" />`;
  }

  return `
    <div class="center">
      <div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;">
        ${logo}
        <div style="font-size:22px;font-weight:200;letter-spacing:0.2em;line-height:1;text-transform:uppercase;">${name}</div>
        ${tagline ? `<div style="width:170px;height:1px;background:#000;margin:5px 0 4px 0;"></div><div style="font-size:9px;font-weight:400;letter-spacing:0.45em;text-indent:0.45em;text-transform:uppercase;line-height:1;">${tagline}</div>` : ''}
      </div>
      ${address ? `<p class="sub">${address}</p>` : ''}
      ${phone ? `<p class="sub">Tel: ${phone}</p>` : ''}
      ${kraPin ? `<p style="font-size:10px;font-weight:700;color:#000;white-space:nowrap;">PIN: ${kraPin}</p>` : ''}
      ${website ? `<p class="sub">${website}</p>` : ''}
    </div>
    <div class="divider"></div>
  `;
}

function receiptPaybillBlock(brandOverride = null) {
  const brand = brandOverride || receiptBrand || {};
  const paybill = String(brand.paybill || '').trim();
  const account = String(brand.account || '').trim();
  const till = String(brand.tillNumber || '').trim();
  if (!paybill && !account && !till) return '';

  const rows = [];
  if (till) rows.push(`<div class="meta" style="font-size:13px;font-weight:900;"><span>TILL NO:</span><span>${escapeReceiptHtml(till)}</span></div>`);
  if (paybill) rows.push(`<div class="meta" style="font-size:13px;font-weight:900;"><span>PAYBILL NO:</span><span>${escapeReceiptHtml(paybill)}</span></div>`);
  if (account) rows.push(`<div class="meta" style="font-size:13px;font-weight:900;"><span>ACCT NO:</span><span>${escapeReceiptHtml(account)}</span></div>`);

  return `
    <div style="border:2px solid #000;margin-top:6px;padding:5px 6px;border-radius:2px;">
      <div style="font-size:10px;font-weight:900;text-align:center;margin-bottom:4px;letter-spacing:0.05em;">— PAY VIA MPESA —</div>
      ${rows.join('')}
    </div>
  `;
}

const BASE_80MM_STYLE = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; color: #000; width: 80mm; padding: 5mm 4mm; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { page-break-after: always; padding-bottom: 8mm; }
  .page:last-child { page-break-after: avoid; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  .divider-solid { border-top: 2px solid #000; margin: 4px 0; }
  .badge { display: inline-block; border: 2px solid #000; padding: 1px 6px; font-size: 11px; font-weight: 900; letter-spacing: 1px; margin-bottom: 4px; }
  .sub { font-size: 11px; font-weight: 600; color: #000; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { font-size: 11px; font-weight: 800; color: #000; text-align: left; padding: 2px 0; }
  th.r, td.r { text-align: right; }
  th.c, td.c { text-align: center; }
  td { font-size: 11px; font-weight: 700; color: #000; padding: 2px 0; }
  .meta { display: flex; justify-content: space-between; margin: 2px 0; font-size: 11px; font-weight: 700; gap: 6px; }
  .big { font-size: 14px; font-weight: 900; }
  .footer { text-align: center; margin-top: 6px; font-size: 11px; font-weight: 800; }
  @media print { body { width: 80mm; } @page { margin: 0; size: 80mm auto; } }
`;

function buildOrderMetaBlock(receipt, dateFormatted) {
  const rawTicket = receipt.ticket_number || receipt.order_number || String(receipt.id || '').slice(0, 6);
  const ticketDisplay = escapeReceiptHtml(obfuscateTicket(rawTicket));
  const brandLabel = escapeReceiptHtml(
    (!receipt.brand || ['MANIPOS', 'ALL'].includes(String(receipt.brand).toUpperCase())
      ? (receiptBrand?.name || 'ManiPOS')
      : receipt.brand
    ).toUpperCase()
  );
  const cashier = escapeReceiptHtml(String(receipt.cashier_name || 'STAFF').toUpperCase());
  const mos = escapeReceiptHtml(String(receipt.dining_option || 'Dine In').toUpperCase());
  const deliveryAddr = receipt.delivery_address || receipt.notes?.match(/Delivery Address:\s*([^|\n]*)/)?.[1] || '';

  return `
    <div class="meta"><span>BRAND:</span><span>${brandLabel}</span></div>
    <div class="meta"><span>TICKET #:</span><span>${ticketDisplay}</span></div>
    <div class="meta"><span>TIME IN:</span><span>${escapeReceiptHtml(dateFormatted)}</span></div>
    <div class="meta"><span>CASHIER:</span><span>${cashier}</span></div>
    <div class="meta"><span>CUSTOMER:</span><span>${formatCustomerName(receipt.customer_name)}</span></div>
    <div class="meta"><span>MOS:</span><span>${mos}${receipt.table_number ? ` · ${escapeReceiptHtml(receipt.table_number)}` : ''}</span></div>
    ${deliveryAddr ? `<div class="meta" style="font-weight:900;font-size:11px;background:#f0f0f0;padding:2px 4px;margin:2px 0;"><span>DELIVERY TO:</span><span>${escapeReceiptHtml(deliveryAddr.trim())}</span></div>` : ''}
    <div class="divider"></div>
  `;
}

export function buildCashierSlipsHTML(rawReceipt, brandOverride = null, { includeKot = false } = {}) {
  const receipt = normalizeReceipt(rawReceipt);
  const items = normalizeItems(receipt.items || receipt.pos_order_items);
  const totalAmount = receipt.total_amount;
  const discount = receipt.discount;
  const netBase = totalAmount / 1.18;
  const vatAmount = netBase * 0.16;
  const cateringLevy = netBase * 0.02;
  const parsedDate = new Date(receipt.created_at);
  const dateFormatted = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
  const hdrBrand = receiptBrandHeader(brandOverride);
  const hdrMeta = buildOrderMetaBlock(receipt, dateFormatted);

  const effectiveItems = items.length > 0
    ? items
    : [{ item_name: 'Order Items (Summary)', quantity: 1, price: totalAmount, instructions: '' }];

  const itemRowsFull = effectiveItems.map((item) => `
    <tr>
      <td style="width:50%;word-break:break-word;">${escapeReceiptHtml(item.item_name)}${item.instructions ? `<br><span style="font-size:9px;font-weight:700;">* ${escapeReceiptHtml(item.instructions)}</span>` : ''}</td>
      <td class="c" style="width:10%;">${item.quantity}</td>
      <td class="r" style="width:20%;">${item.price.toLocaleString()}</td>
      <td class="r" style="width:20%;">${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

  const itemRowsPack = effectiveItems.map((item) => `
    <tr>
      <td class="c" style="font-size:12px;font-weight:900;width:15%;vertical-align:top;">[ &nbsp; ]</td>
      <td style="font-size:12px;font-weight:900;word-break:break-word;width:70%;">${escapeReceiptHtml(item.item_name)}${item.instructions ? `<br><span style="font-size:10px;font-weight:700;">➜ ${escapeReceiptHtml(item.instructions)}</span>` : ''}</td>
      <td class="c" style="font-size:14px;font-weight:900;vertical-align:top;width:15%;">${item.quantity}</td>
    </tr>
  `).join('');

  const kotRows = effectiveItems.map((item) => `
    <tr>
      <td style="font-size:13px;font-weight:900;padding:3px 0;word-break:break-word;width:80%;">${escapeReceiptHtml(item.item_name)}${item.instructions ? `<br><span style="font-size:10px;font-weight:700;">[ ${escapeReceiptHtml(item.instructions)} ]</span>` : ''}</td>
      <td class="c" style="font-size:16px;font-weight:900;padding:3px 0;vertical-align:top;width:20%;text-align:right;">${item.quantity}x</td>
    </tr>
  `).join('');

  const totalsHtml = `
    <div class="meta"><span>SUBTOTAL:</span><span>KES ${(totalAmount + discount).toLocaleString()}</span></div>
    ${discount > 0 ? `<div class="meta"><span>DISCOUNT:</span><span>- KES ${discount.toLocaleString()}</span></div>` : ''}
    <div class="divider-solid"></div>
    <div class="meta big"><span>TOTAL:</span><span>KES ${totalAmount.toLocaleString()}</span></div>
    <div class="divider"></div>
    <div class="meta" style="font-size:9px;"><span>TAXABLE AMT:</span><span>KES ${netBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
    <div class="meta" style="font-size:9px;"><span>VAT (16% INCL):</span><span>KES ${vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
    <div class="meta" style="font-size:9px;"><span>CAT. LEVY (2% INCL):</span><span>KES ${cateringLevy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
    <div class="divider"></div>
    <div class="meta"><span>PAYMENT:</span><span>${escapeReceiptHtml(String(receipt.payment_method || 'CASH').toUpperCase())}</span></div>
    <div class="meta"><span>STATUS:</span><span>${escapeReceiptHtml(String(receipt.payment_status || 'PAID').toUpperCase())}</span></div>
    ${receipt.splitDetails ? `<p style="font-size:9px;margin-top:3px;">${escapeReceiptHtml(receipt.splitDetails)}</p>` : ''}
  `;

  const payLower = String(receipt.payment_method || '').toLowerCase();
  const slip1 = `
    <div class="page">
      <div class="center"><div class="badge">CUSTOMER COPY</div></div>
      ${hdrBrand}${hdrMeta}
      <table><thead><tr><th style="width:50%;">ITEM</th><th class="c" style="width:10%;">QTY</th><th class="r" style="width:20%;">PRICE</th><th class="r" style="width:20%;">TOTAL</th></tr></thead>
      <tbody><tr><td colspan="4"><div class="divider"></div></td></tr>${itemRowsFull}<tr><td colspan="4"><div class="divider"></div></td></tr></tbody></table>
      ${totalsHtml}
      ${payLower.includes('app') ? '' : receiptPaybillBlock(brandOverride)}
      <div class="divider"></div>
      <div class="footer">
        <strong>THANK YOU FOR DINING WITH US!</strong><br>
        <div style="font-size:10px;font-weight:900;margin-top:6px;">SHARE YOUR FEEDBACK</div>
        <div style="text-align:center;margin:6px 0;"><img src="${FEEDBACK_QR_CODE}" style="width:110px;height:110px;display:inline-block;" /></div>
        <span style="font-size:9px;">Powered by ManiPOS</span>
      </div>
    </div>
  `;

  const slip3 = `
    <div class="page">
      <div class="center"><div class="badge">PACKER / DISPATCH SLIP</div></div>
      ${hdrBrand}${hdrMeta}
      <table><thead><tr><th class="c" style="width:20%;">PACKED</th><th style="width:65%;">ITEM</th><th class="c" style="width:15%;">QTY</th></tr></thead>
      <tbody><tr><td colspan="3"><div class="divider"></div></td></tr>${itemRowsPack}</tbody></table>
      <div class="divider-solid"></div>
      <div class="footer">PACKER SIGN: _______________</div>
    </div>
  `;

  const slip4 = `
    <div class="page">
      <div class="center"><div class="badge">FRONT DESK — RECORD COPY</div></div>
      ${hdrBrand}${hdrMeta}
      <table><thead><tr><th style="width:50%;">ITEM</th><th class="c" style="width:10%;">QTY</th><th class="r" style="width:20%;">PRICE</th><th class="r" style="width:20%;">TOTAL</th></tr></thead>
      <tbody><tr><td colspan="4"><div class="divider"></div></td></tr>${itemRowsFull}<tr><td colspan="4"><div class="divider"></div></td></tr></tbody></table>
      ${totalsHtml}
      <div class="divider-solid"></div>
      <div class="footer">AUTHORISED BY: _______________</div>
    </div>
  `;

  const ticketDisplay = escapeReceiptHtml(obfuscateTicket(receipt.ticket_number || receipt.id));
  const slipKot = includeKot
    ? `
    <div class="page">
      <div class="center"><div class="badge">★ KITCHEN ORDER TICKET (KOT) ★</div></div>
      ${hdrBrand}${hdrMeta}
      <table><thead><tr><th style="font-size:12px;width:80%;">ITEM</th><th class="r" style="font-size:12px;width:20%;">QTY</th></tr></thead>
      <tbody><tr><td colspan="2"><div class="divider"></div></td></tr>${kotRows}</tbody></table>
      <div class="divider-solid"></div>
      <div class="meta"><span>CHEF NAME:</span><span>___________________</span></div>
      <div class="divider"></div>
      <div class="footer" style="font-size:12px;margin-top:4px;">⚑ FIRE WHEN READY — TICKET #${ticketDisplay}</div>
    </div>
  `
    : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Receipt #${ticketDisplay}</title><style>${BASE_80MM_STYLE}</style></head><body>${slip1}${slip3}${slip4}${slipKot}</body></html>`;
}

export function buildKitchenSlipsHTML(rawReceipt, brandOverride = null) {
  const receipt = normalizeReceipt(rawReceipt);
  const rawItems = normalizeItems(receipt.items || receipt.pos_order_items);
  const items = rawItems.length > 0
    ? rawItems
    : [{ item_name: 'Order Items (Summary)', quantity: 1, price: receipt.total_amount, instructions: '' }];
  const parsedDate = new Date(receipt.created_at);
  const dateFormatted = (Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
  const rawTicket = receipt.ticket_number;
  const ticketDisplay = escapeReceiptHtml(obfuscateTicket(rawTicket));
  const rows = items.map((item) => `
    <tr>
      <td style="font-size:13px;font-weight:900;padding:3px 0;word-break:break-word;width:80%;">${escapeReceiptHtml(item.item_name)}${item.instructions ? `<br><span style="font-size:10px;font-weight:700;">[ ${escapeReceiptHtml(item.instructions)} ]</span>` : ''}</td>
      <td class="c" style="font-size:16px;font-weight:900;padding:3px 0;vertical-align:top;width:20%;text-align:right;">${item.quantity}x</td>
    </tr>
  `).join('');

  const body = `
    <div class="page">
      <div class="center"><div class="badge">★ KITCHEN ORDER TICKET (KOT) ★</div></div>
      ${receiptBrandHeader(brandOverride)}
      ${buildOrderMetaBlock(receipt, dateFormatted)}
      <table><thead><tr><th style="font-size:12px;width:80%;">ITEM</th><th class="r" style="font-size:12px;width:20%;">QTY</th></tr></thead>
      <tbody><tr><td colspan="2"><div class="divider"></div></td></tr>${rows}</tbody></table>
      <div class="divider-solid"></div>
      <div class="meta"><span>CHEF NAME:</span><span>___________________</span></div>
      <div class="divider"></div>
      <div class="footer" style="font-size:12px;margin-top:4px;">⚑ FIRE WHEN READY — TICKET #${ticketDisplay}</div>
    </div>
  `;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kitchen KOT #${ticketDisplay}</title><style>${BASE_80MM_STYLE}</style></head><body>${body}</body></html>`;
}

export function buildZReportHTML(zReport, brandOverride = null) {
  const shift = zReport?.shift || {};
  const closedAt = new Date(shift.closed_at || Date.now()).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' });
  const openedAt = shift.opened_at ? new Date(shift.opened_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'Business Day Start';

  const body = `
    <div class="page">
      <div class="center"><div class="badge">END OF SHIFT Z-REPORT</div></div>
      ${receiptBrandHeader(brandOverride)}
      <div class="meta"><span>CASHIER:</span><span>${escapeReceiptHtml(String(shift.staff_name || 'Staff').toUpperCase())}</span></div>
      <div class="meta"><span>OPENED:</span><span>${escapeReceiptHtml(openedAt)}</span></div>
      <div class="meta"><span>CLOSED:</span><span>${escapeReceiptHtml(closedAt)}</span></div>
      <div class="divider"></div>
      <div class="meta"><span>ORDERS COUNT:</span><span>${Number(zReport?.ordersCount || 0)}</span></div>
      <div class="meta"><span>OPENING FLOAT:</span><span>KES ${Number(shift.opening_cash || 0).toLocaleString()}</span></div>
      <div class="meta"><span>CASH SALES:</span><span>KES ${Number(zReport?.cashSales || 0).toLocaleString()}</span></div>
      <div class="meta"><span>MPESA SALES:</span><span>KES ${Number(zReport?.mpesaSales || 0).toLocaleString()}</span></div>
      <div class="meta"><span>CARD SALES:</span><span>KES ${Number(zReport?.cardSales || 0).toLocaleString()}</span></div>
      <div class="meta"><span>OTHER SALES:</span><span>KES ${Number(zReport?.otherSales || 0).toLocaleString()}</span></div>
      <div class="divider-solid"></div>
      <div class="meta big"><span>TOTAL SALES:</span><span>KES ${Number(zReport?.totalSales || 0).toLocaleString()}</span></div>
      <div class="divider"></div>
      <div class="meta"><span>EXPECTED CASH:</span><span>KES ${Number(shift.expected_cash || 0).toLocaleString()}</span></div>
      <div class="meta"><span>COUNTED CASH:</span><span>KES ${Number(shift.closing_cash || 0).toLocaleString()}</span></div>
      <div class="meta"><span>DISCREPANCY:</span><span>KES ${Number(shift.discrepancy || 0).toLocaleString()}</span></div>
      <div class="divider"></div>
      <div class="footer">SUPERVISOR SIGN: _______________</div>
    </div>
  `;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Shift Z-Report</title><style>${BASE_80MM_STYLE}</style></head><body>${body}</body></html>`;
}

function waitForDocumentImages(doc, maxWaitMs = 900) {
  if (!doc) return Promise.resolve();
  const imgs = Array.from(doc.querySelectorAll('img'));
  if (imgs.length === 0) return Promise.resolve();
  const pending = imgs.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  });
  return Promise.race([
    Promise.all(pending),
    new Promise((resolve) => setTimeout(resolve, maxWaitMs)),
  ]);
}

function printViaHiddenIframe(html) {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '80mm';
      iframe.style.height = '1px';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (_) {}
      };
      const safetyCleanupTimer = setTimeout(cleanup, 60000);

      const trigger = async () => {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument || win?.document;
        if (!win || !doc || typeof win.print !== 'function') {
          clearTimeout(safetyCleanupTimer);
          cleanup();
          resolve(false);
          return;
        }
        await waitForDocumentImages(doc);
        win.addEventListener(
          'afterprint',
          () => {
            clearTimeout(safetyCleanupTimer);
            setTimeout(cleanup, 250);
          },
          { once: true }
        );
        try {
          win.focus();
          win.print();
          resolve(true);
        } catch (_) {
          clearTimeout(safetyCleanupTimer);
          cleanup();
          resolve(false);
        }
      };

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        setTimeout(trigger, 60);
      } else {
        iframe.onload = () => { void trigger(); };
        iframe.srcdoc = html;
      }
    } catch (_) {
      resolve(false);
    }
  });
}

async function openPrintPopup(html) {
  const printedViaIframe = await printViaHiddenIframe(html);
  if (printedViaIframe) return true;

  if (typeof window === 'undefined') return false;
  const win = window.open('', '_blank', 'width=440,height=760,scrollbars=yes');
  if (!win) {
    // Final fallback: render an on-screen printable modal via custom event if browser blocked popups/print
    window.dispatchEvent(new CustomEvent('manipos:receipt-preview', { detail: { html } }));
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  await waitForDocumentImages(win.document);
  win.addEventListener(
    'afterprint',
    () => {
      setTimeout(() => {
        try { win.close(); } catch (_) {}
      }, 250);
    },
    { once: true }
  );
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch (_) {}
  }, 120);
  return true;
}

const activePrintJobs = new Map();
const PRINT_COOLDOWN_MS = 3000;

async function runWithPrintLock(lockKey, task) {
  const now = Date.now();
  const last = activePrintJobs.get(lockKey);
  if (last && (last.inFlight || now - last.finishedAt < PRINT_COOLDOWN_MS)) {
    return false;
  }
  activePrintJobs.set(lockKey, { inFlight: true, finishedAt: 0 });
  try {
    return await task();
  } finally {
    activePrintJobs.set(lockKey, { inFlight: false, finishedAt: Date.now() });
  }
}

export async function printCashierSlips(receipt, printerName = null) {
  const key = `cashier:${receipt?.id || receipt?.ticket_number || 'generic'}`;
  return runWithPrintLock(key, () => {
    const target = printerName ?? getPrinterPrefs().frontDeskPrinter;
    const html = buildCashierSlipsHTML(receipt, brandOverrideFromReceipt(receipt));
    return printOrFallback(target, html, () => openPrintPopup(html));
  });
}

export async function printKitchenSlips(receipt, printerName = null) {
  const key = `kitchen:${receipt?.id || receipt?.ticket_number || 'generic'}`;
  return runWithPrintLock(key, () => {
    const target = printerName ?? getPrinterPrefs().kitchenPrinter;
    const html = buildKitchenSlipsHTML(receipt, brandOverrideFromReceipt(receipt));
    return printOrFallback(target, html, () => openPrintPopup(html));
  });
}

export async function printAllOrderSlips(receipt, prefs = null) {
  const key = `all:${receipt?.id || receipt?.ticket_number || 'generic'}`;
  return runWithPrintLock(key, async () => {
    const { frontDeskPrinter, kitchenPrinter } = prefs || getPrinterPrefs();
    const brandOverride = brandOverrideFromReceipt(receipt);
    if (!frontDeskPrinter && !kitchenPrinter) {
      const combinedHtml = buildCashierSlipsHTML(receipt, brandOverride, { includeKot: true });
      return openPrintPopup(combinedHtml);
    }
    const cashierPrinted = await printCashierSlips(receipt, frontDeskPrinter).catch(() => false);
    const kotPrinted = await printKitchenSlips(receipt, kitchenPrinter).catch(() => false);
    return Boolean(cashierPrinted || kotPrinted);
  });
}

export async function printZReport(zReport, printerName = null) {
  const target = printerName ?? getPrinterPrefs().frontDeskPrinter;
  const html = buildZReportHTML(zReport);
  return printOrFallback(target, html, () => openPrintPopup(html));
}
