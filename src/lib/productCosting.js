/**
 * Product costing helpers.
 *
 * Each order line snapshots the cost/commission it was sold at so COGS and
 * per-product profit stay accurate even after the menu changes.
 */

export const STANDARD_SALES_CHANNELS = [
  'Web POS',
  'Microsite',
  'Glovo',
  'Ubereats',
  'Bolt Food',
  'Whatsapp',
  'Instagram',
  'Phone Call',
  'Walk-in',
];

export const STANDARD_PAYMENT_METHODS = [
  'Card',
  'M-Pesa',
  'M-Pesa STK',
  'Cash',
  'Bank Transfer',
  'Paid to App',
  'Store Credit',
  'Voucher',
];

export const DEFAULT_FOOD_COST_PERCENT = 25;

export function normalizePaymentKey(value) {
  const s = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!s) return '';
  if (s.includes('card') || s.includes('visa') || s.includes('mastercard') || s.includes('pdq')) return 'card';
  if (s.includes('stk')) return 'm-pesa stk';
  if (s.includes('mpesa') || s.includes('m-pesa') || s.includes('paybill') || s.includes('till')) return 'm-pesa';
  if (s.includes('cash')) return 'cash';
  if (s.includes('bank') || s.includes('transfer') || s.includes('eft')) return 'bank transfer';
  if (s.includes('paid to app') || s.includes('prepaid')) return 'paid to app';
  if (s.includes('credit')) return 'store credit';
  if (s.includes('voucher')) return 'voucher';
  return s;
}

export function resolvePaymentCommissionPercent(methodCommissionsMap, paymentMethod) {
  if (!methodCommissionsMap || typeof methodCommissionsMap !== 'object') return 0;
  const target = normalizePaymentKey(paymentMethod);
  if (!target) return 0;
  for (const [key, val] of Object.entries(methodCommissionsMap)) {
    if (normalizePaymentKey(key) === target) {
      const num = Number(val);
      return Number.isFinite(num) && num > 0 ? num : 0;
    }
  }
  return 0;
}

export function resolveChannelCommissionWithFallback(configs, channelCommissionsMap, channel, brand = '') {
  const fromTable = resolveChannelCommission(configs, channel, brand);
  if (fromTable > 0) return fromTable;
  if (!channelCommissionsMap || typeof channelCommissionsMap !== 'object') return 0;
  const ch = normChannel(channel);
  if (!ch) return 0;
  for (const [key, val] of Object.entries(channelCommissionsMap)) {
    if (normChannel(key) === ch) {
      const num = Number(val);
      return Number.isFinite(num) && num > 0 ? num : 0;
    }
  }
  return 0;
}

export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Cost of goods sold for one order line.
 * Prefers an exact cost price per unit; otherwise falls back to the item's
 * COGS % of the sold price, then the store's base COGS %.
 */
export function lineCostPrice(item, { baseCogsPercent = 0 } = {}) {
  const exact = Number(item?.cost_price || 0);
  if (exact > 0) return exact;
  const price = Number(item?.unitPrice ?? item?.price ?? 0);
  const percent = Number(item?.cogs_percent || 0) || Number(baseCogsPercent || 0);
  return round2((price * percent) / 100);
}

export function computeLineCosting(item, { baseCogsPercent = 0, discountAmount = 0, commissionPercent = null } = {}) {
  const qty = Number(item?.quantity || 1);
  const price = Number(item?.unitPrice ?? item?.price ?? 0);
  const unitCost = lineCostPrice(item, { baseCogsPercent });
  const commissionPercentValue = commissionPercent != null
    ? Number(commissionPercent)
    : Number(item?.commission_percent || 0);
  const revenue = round2(price * qty);
  const cogsAmount = round2(unitCost * qty);
  const commissionAmount = round2((revenue * commissionPercentValue) / 100);
  const discount = round2(Number(discountAmount || 0));
  const profit = round2(revenue - discount - cogsAmount - commissionAmount);
  return {
    cost_price: round2(unitCost),
    commission_percent: commissionPercentValue,
    cogs_amount: cogsAmount,
    commission_amount: commissionAmount,
    discount_amount: discount,
    revenue,
    profit,
    margin_percent: revenue > 0 ? round2((profit / revenue) * 100) : 0,
  };
}

export function attachLineCosting(items, { baseCogsPercent = 0, commissionPercent = null } = {}) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => {
    const costing = computeLineCosting(item, {
      baseCogsPercent,
      discountAmount: item?.discount_amount || 0,
      commissionPercent,
    });
    return {
      ...item,
      cost_price: costing.cost_price,
      commission_percent: costing.commission_percent,
      cogs_amount: costing.cogs_amount,
      commission_amount: costing.commission_amount,
      discount_amount: costing.discount_amount,
    };
  });
}

const COSTING_COLS = ['cost_price', 'cogs_percent', 'commission_percent', 'cogs_amount', 'commission_amount', 'discount_amount'];

function normChannel(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/\s*(uber\s*eats|ubereats)\s*/, 'ubereats')
    .replace(/\s*bolt\s*food\s*/, 'bolt food')
    .trim();
}

/**
 * Resolve the platform commission for an order from the owner's channel rates.
 * Prefers an exact (channel, brand) row, then a channel-wide fallback.
 */
export function resolveChannelCommission(configs, channel, brand) {
  const list = Array.isArray(configs) ? configs : [];
  const ch = normChannel(channel);
  const br = normChannel(brand);
  if (!ch) return 0;
  const match = (rowBrand) => list.find((row) => {
    if (row?.is_active === false) return false;
    if (normChannel(row.channel) !== ch) return false;
    const rowBrandNorm = normChannel(rowBrand);
    if (rowBrandNorm) return normChannel(row.brand) === rowBrandNorm;
    return !row.brand || normChannel(row.brand) === '';
  });
  const row = match(br) || match('');
  return row ? Number(row.commission_percent) || 0 : 0;
}

function isMissingColumnError(error) {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '') + ' ' + String(error.details || '');
  return (
    code === 'PGRST204' ||
    code === '42703' ||
    /column .* does not exist/i.test(msg) ||
    /could not find .* column/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

/**
 * Insert order lines, gracefully dropping the costing columns when the
 * COGS/commission migration has not been run yet. Never let a reporting-only
 * schema gap block a sale or drop order items.
 */
export async function insertOrderItems(supabaseClient, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return { error: null };

  const firstRes = await supabaseClient.from('pos_order_items').insert(list);
  if (!firstRes.error) return firstRes;

  if (isMissingColumnError(firstRes.error)) {
    const stripped = list.map((row) => {
      const next = { ...row };
      COSTING_COLS.forEach((col) => delete next[col]);
      return next;
    });
    const secondRes = await supabaseClient.from('pos_order_items').insert(stripped);
    if (!secondRes.error) return secondRes;

    if (isMissingColumnError(secondRes.error)) {
      const minimal = list.map((row) => ({
        order_id: row.order_id,
        item_name: row.item_name || row.name || 'Item',
        quantity: Number(row.quantity ?? 1),
        price: Number(row.price ?? 0),
        instructions: row.instructions || null,
      }));
      return supabaseClient.from('pos_order_items').insert(minimal);
    }
    return secondRes;
  }

  return firstRes;
}
