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
  if (rawLower.includes('bolt')) return 'BOLT';
  if (rawLower.includes('uber')) return 'UBER EATS';
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
