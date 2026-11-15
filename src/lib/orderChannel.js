/**
 * Shared order sales-channel classification helpers.
 * Used by both IncomingOrderAlarmOverlay and LiveOrdersView without circular imports.
 */

export function normalizeChannelLabel(order) {
  const sc = String(order?.sales_channel || '').trim();
  const oc = String(order?.order_channel || '').trim();
  const ch = String(order?.channel || '').trim();
  const raw = (sc && sc.toLowerCase() !== 'pos' ? sc : (oc || ch || sc || 'POS')).trim();
  const rawLower = raw.toLowerCase();

  if (rawLower.includes('whatsapp')) return 'WHATSAPP';
  if (rawLower.includes('glovo')) return 'GLOVO';
  if (rawLower.includes('bolt')) return 'BOLT FOOD';
  if (rawLower.includes('uber')) return 'UBER EATS';
  if (rawLower.includes('dine')) return 'DINE-IN';
  if (rawLower.includes('takeaway') || rawLower.includes('pickup') || rawLower.includes('pick-up')) return 'TAKEAWAY';
  if (rawLower.includes('call')) return 'CALL CENTER';
  if (rawLower.includes('web')) return 'WEB POS';

  const combined = [sc, oc, ch, order?.order_source, order?.cashier_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    combined.includes('microsite') ||
    combined.includes('online') ||
    combined.includes('self-service') ||
    oc.toLowerCase() === 'skg' ||
    sc.toLowerCase() === 'skg' ||
    ch.toLowerCase() === 'skg'
  ) {
    return 'MICROSITE';
  }
  return raw.toUpperCase();
}

/**
 * Only genuine guest self-service / microsite orders require explicit cashier/kitchen
 * Accept/Decline confirmation. Normal POS, Web POS, Walk-in, and waiter orders flow
 * straight into kitchen preparation without triggering acceptance alarms or prompts.
 */
export function isMicrositeOrder(order) {
  if (!order) return false;
  if (normalizeChannelLabel(order) === 'MICROSITE') return true;
  const dining = String(order.dining_option || '').toLowerCase();
  const cashier = String(order.cashier_name || '').toLowerCase();
  return dining.includes('self-service') || cashier.includes('microsite') || cashier.includes('self-service');
}

export function formatChannelDisplayName(normChannel) {
  const key = String(normChannel || '').trim().toUpperCase();
  if (!key) return 'POS';
  const labels = {
    POS: 'POS',
    'DINE-IN': 'Dine-in',
    TAKEAWAY: 'Takeaway',
    'WEB POS': 'Web POS',
    'WALK-IN': 'Walk-in',
    MICROSITE: 'Microsite',
    GLOVO: 'Glovo',
    'UBER EATS': 'Uber Eats',
    UBEREATS: 'Uber Eats',
    'BOLT FOOD': 'Bolt Food',
    BOLT: 'Bolt Food',
    WHATSAPP: 'WhatsApp',
    'CALL CENTER': 'Call Center',
  };
  if (labels[key]) return labels[key];
  return key
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function normalizePaymentMethodLabel(orderOrMethod) {
  const rawMethod =
    typeof orderOrMethod === 'string'
      ? orderOrMethod
      : orderOrMethod?.payment_method;
  const clean = String(rawMethod || '').trim();
  const low = clean.toLowerCase();

  if (!clean) {
    const payStatus = String(orderOrMethod?.payment_status || '').toLowerCase().trim();
    if (payStatus === 'paid' || payStatus === 'settled') return 'Paid (Other)';
    return 'Unassigned / Pending';
  }
  if (low === 'cash') return 'Cash';
  if (low === 'card' || low === 'credit card' || low === 'debit card') return 'Card';
  if (low === 'paid to app' || low === 'app' || low === 'online app') return 'Paid to App';
  if (low.includes('paybill') || low.includes('i&m')) return 'I&M Paybill';
  if (low.includes('mpesa') || low.includes('m-pesa') || low.includes('stk')) return 'M-Pesa';
  if (low.includes('split')) return 'Split Payment';
  if (low.includes('bank') || low.includes('eft') || low.includes('transfer')) return 'Bank Transfer';
  return clean;
}
