/**
 * Product costing helpers.
 *
 * Each order line snapshots the cost/commission it was sold at so COGS and
 * per-product profit stay accurate even after the menu changes.
 */

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

/**
 * Insert order lines, gracefully dropping the costing columns when the
 * 20261120_cogs_commission migration has not been run yet. Never let a
 * reporting-only schema gap block a sale.
 */
export async function insertOrderItems(supabaseClient, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const { error } = await supabaseClient.from('pos_order_items').insert(list);
  if (error && /column .* does not exist/i.test(String(error.message || ''))) {
    const stripped = list.map((row) => {
      const next = { ...row };
      COSTING_COLS.forEach((col) => delete next[col]);
      return next;
    });
    return supabaseClient.from('pos_order_items').insert(stripped);
  }
  return { error };
}
