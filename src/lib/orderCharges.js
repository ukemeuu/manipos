import { supabase } from './supabase';

function normToken(val) {
  return String(val || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Fetch active tenant dynamic charges/taxes safely.
 * Returns [] if the order_charges table has not been migrated yet.
 */
export async function fetchActiveOrderCharges(restaurantId) {
  if (!restaurantId) return [];
  try {
    const { data, error } = await supabase
      .from('order_charges')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Compute dynamic tax & additional charge lines scoped by fulfillment method and tender.
 * Items flagged `exclude_from_tax` are excluded from `taxableSubtotal` when `is_tax_charge` is true.
 */
export function computeOrderCharges({
  subtotal = 0,
  taxableSubtotal = null,
  discountAmount = 0,
  diningOption = 'Pickup',
  paymentMethod = 'Cash',
  charges = [],
}) {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const effectiveTaxableBase = Math.max(
    0,
    (taxableSubtotal === null ? safeSubtotal : Number(taxableSubtotal) || 0) - Number(discountAmount || 0)
  );
  const netBase = Math.max(0, safeSubtotal - Number(discountAmount || 0));

  const orderNorm = normToken(diningOption === 'Takeaway' ? 'Pickup' : diningOption);
  const payNorm = normToken(paymentMethod);

  const lines = [];
  let taxTotal = 0;
  let otherChargesTotal = 0;

  (charges || []).forEach((ch) => {
    if (ch.is_active === false) return;
    const allowedOrder = Array.isArray(ch.order_methods) ? ch.order_methods : [];
    const allowedPay = Array.isArray(ch.payment_methods) ? ch.payment_methods : [];

    if (allowedOrder.length > 0 && !allowedOrder.some((m) => normToken(m) === orderNorm)) {
      return;
    }
    if (allowedPay.length > 0 && !allowedPay.some((m) => normToken(m) === payNorm)) {
      return;
    }

    const base = ch.is_tax_charge ? effectiveTaxableBase : netBase;
    const rawVal = Number(ch.charge_value) || 0;
    const isPercent = ch.charge_type === 'percent';
    const amount = isPercent ? Math.round((base * rawVal) / 100) : Math.round(rawVal);

    if (amount <= 0) return;

    lines.push({
      charge_id: ch.id || null,
      title: ch.title,
      is_tax_charge: Boolean(ch.is_tax_charge),
      is_percentage_charge: isPercent,
      charge_percent: isPercent ? rawVal : 0,
      base_charge_value: rawVal,
      amount,
    });

    if (ch.is_tax_charge) taxTotal += amount;
    else otherChargesTotal += amount;
  });

  return {
    lines,
    taxTotal,
    otherChargesTotal,
    totalChargesAndTax: taxTotal + otherChargesTotal,
  };
}

/**
 * Persist applied charge breakdown lines to order_charge_lines (best-effort).
 */
export async function recordOrderChargeLines({
  restaurantId,
  orderId,
  lines = [],
  grandTotal = 0,
  source = 'POS',
}) {
  if (!restaurantId || !orderId || !Array.isArray(lines) || lines.length === 0) return;
  try {
    const payload = lines.map((line) => ({
      restaurant_id: restaurantId,
      order_id: orderId,
      charge_id: line.charge_id || null,
      title: line.title,
      is_tax_charge: Boolean(line.is_tax_charge),
      is_percentage_charge: Boolean(line.is_percentage_charge),
      charge_percent: Number(line.charge_percent || 0),
      base_charge_value: Number(line.base_charge_value || 0),
      charge_value: Number(line.amount || 0),
      base_grand_total: Number(grandTotal || 0),
      source,
    }));
    await supabase.from('order_charge_lines').insert(payload);
  } catch {
    // Graceful no-op if Wave 2 SQL migration is pending
  }
}

export const DEFAULT_TENDERS = [
  { code: 'Cash', name: 'Cash', pos_enabled: true, microsite_enabled: false, is_custom: false },
  { code: 'MPESA Paybill', name: 'M-PESA Paybill', pos_enabled: true, microsite_enabled: true, is_custom: false },
  { code: 'MPESA TILL', name: 'M-PESA Till', pos_enabled: true, microsite_enabled: true, is_custom: false },
  { code: 'CARD', name: 'Card / PDQ', pos_enabled: true, microsite_enabled: true, is_custom: false },
  { code: 'GLOVO', name: 'Glovo', pos_enabled: true, microsite_enabled: false, is_custom: false },
  { code: 'UBER EATS', name: 'Uber Eats', pos_enabled: true, microsite_enabled: false, is_custom: false },
  { code: 'BOLT FOOD', name: 'Bolt Food', pos_enabled: true, microsite_enabled: false, is_custom: false },
  { code: 'Transfer', name: 'Bank Transfer', pos_enabled: true, microsite_enabled: false, is_custom: false },
  { code: 'Prepaid', name: 'Prepaid', pos_enabled: true, microsite_enabled: false, is_custom: false },
  { code: 'Voucher', name: 'Voucher', pos_enabled: true, microsite_enabled: true, is_custom: false },
  { code: 'Store Credit', name: 'Store Credit', pos_enabled: true, microsite_enabled: true, is_custom: false },
  { code: 'Split Payment', name: 'Split Payment', pos_enabled: true, microsite_enabled: false, is_custom: false },
  { code: 'Paid to App', name: 'Paid to App', pos_enabled: true, microsite_enabled: true, is_custom: false },
];
