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

export function computeLineCosting(item, { baseCogsPercent = 0, discountAmount = 0 } = {}) {
  const qty = Number(item?.quantity || 1);
  const price = Number(item?.unitPrice ?? item?.price ?? 0);
  const unitCost = lineCostPrice(item, { baseCogsPercent });
  const commissionPercent = Number(item?.commission_percent || 0);
  const revenue = round2(price * qty);
  const cogsAmount = round2(unitCost * qty);
  const commissionAmount = round2((revenue * commissionPercent) / 100);
  const discount = round2(Number(discountAmount || 0));
  const profit = round2(revenue - discount - cogsAmount - commissionAmount);
  return {
    cost_price: round2(unitCost),
    commission_percent: commissionPercent,
    cogs_amount: cogsAmount,
    commission_amount: commissionAmount,
    discount_amount: discount,
    revenue,
    profit,
    margin_percent: revenue > 0 ? round2((profit / revenue) * 100) : 0,
  };
}

export function attachLineCosting(items, { baseCogsPercent = 0 } = {}) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => {
    const costing = computeLineCosting(item, { baseCogsPercent, discountAmount: item?.discount_amount || 0 });
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
