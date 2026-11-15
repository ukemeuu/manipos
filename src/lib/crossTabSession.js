/**
 * Cross-tab and cross-subdomain session continuity helpers for *.manipos.com.
 *
 * Security notes:
 * - Only non-secret routing hints (tenantSlug, restaurantName, staffName, role, isAdmin)
 *   are stored in the .manipos.com cookie so an already-signed-in tab on
 *   <slug>.pos.manipos.com is recognized by manpos.com and pos.manipos.com without
 *   exposing PINs, passwords, or JWT bearer tokens in cookies.
 * - Full Supabase & POJ tokens live per-origin on <slug>.pos.manipos.com localStorage
 *   and are synced immediately across tabs on the same origin via BroadcastChannel
 *   and window 'storage' events.
 */

const ACTIVE_PORTAL_COOKIE = 'manipos_active_portal';
const PORTAL_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const AUTH_CHANNEL_NAME = 'manipos_auth_sync';

function getCookieDomainAttr(hostname = '') {
  const host = String(hostname || '').toLowerCase().trim();
  if (!host || host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return '';
  }
  if (host === 'manipos.com' || host.endsWith('.manipos.com')) {
    return '; Domain=.manipos.com';
  }
  return '';
}

export function writeActivePortalCookie({
  tenantSlug,
  restaurantName = '',
  staffName = '',
  role = '',
  isAdmin = false,
} = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const cleanSlug = String(tenantSlug || '').toLowerCase().trim();
  if (!cleanSlug || cleanSlug === 'pos' || cleanSlug === 'www') return;

  try {
    const payload = {
      tenantSlug: cleanSlug,
      restaurantName: String(restaurantName || '').trim(),
      staffName: String(staffName || '').trim(),
      role: String(role || '').toLowerCase().trim(),
      isAdmin: Boolean(isAdmin) || String(role || '').toLowerCase().trim() === 'admin',
      updatedAt: Date.now(),
    };
    const encoded = encodeURIComponent(JSON.stringify(payload));
    const domainAttr = getCookieDomainAttr(window.location?.hostname);
    const secureAttr = window.location?.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ACTIVE_PORTAL_COOKIE}=${encoded}; Path=/; Max-Age=${Math.floor(PORTAL_TTL_MS / 1000)}; SameSite=Lax${domainAttr}${secureAttr}`;
  } catch (_) {
    // Ignore cookie errors in restricted environments
  }
}

export function readActivePortalCookie() {
  if (typeof document === 'undefined') return null;
  try {
    const pairs = String(document.cookie || '').split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx <= 0) continue;
      const key = pair.slice(0, idx).trim();
      if (key !== ACTIVE_PORTAL_COOKIE) continue;
      const raw = pair.slice(idx + 1).trim();
      if (!raw) return null;
      const parsed = JSON.parse(decodeURIComponent(raw));
      if (!parsed?.tenantSlug) return null;
      if (parsed.updatedAt && Date.now() - Number(parsed.updatedAt) > PORTAL_TTL_MS) {
        return null;
      }
      return {
        tenantSlug: String(parsed.tenantSlug).toLowerCase().trim(),
        restaurantName: String(parsed.restaurantName || '').trim(),
        staffName: String(parsed.staffName || '').trim(),
        role: String(parsed.role || '').toLowerCase().trim(),
        isAdmin: Boolean(parsed.isAdmin) || String(parsed.role || '').toLowerCase().trim() === 'admin',
        updatedAt: Number(parsed.updatedAt || Date.now()),
      };
    }
  } catch (_) {
    return null;
  }
  return null;
}

export function clearActivePortalCookie() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  try {
    const domainAttr = getCookieDomainAttr(window.location?.hostname);
    const secureAttr = window.location?.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${ACTIVE_PORTAL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secureAttr}`;
    if (domainAttr) {
      document.cookie = `${ACTIVE_PORTAL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${domainAttr}${secureAttr}`;
    }
  } catch (_) {
    // Ignore cookie clear errors
  }
}

export function broadcastAuthEvent(type, payload = {}) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(AUTH_CHANNEL_NAME);
    ch.postMessage({ type, ...payload, ts: Date.now() });
    ch.close();
  } catch (_) {
    // Ignore BroadcastChannel unavailability
  }
}

export function subscribeAuthEvents(onMessage) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined' || typeof onMessage !== 'function') {
    return () => {};
  }
  try {
    const ch = new BroadcastChannel(AUTH_CHANNEL_NAME);
    ch.onmessage = (evt) => {
      if (evt?.data) onMessage(evt.data);
    };
    return () => {
      try {
        ch.close();
      } catch (_) {}
    };
  } catch (_) {
    return () => {};
  }
}
