/**
 * Tenant & Subdomain Helper for ManiPOS
 * 
 * Domain Structure:
 * - manipos.com -> Marketing Landing Page
 * - pos.manipos.com -> Staff/POS App Login & General Terminal
 * - <slug>.pos.manipos.com -> Restaurant-specific Scoped POS Terminal (e.g. littlelagos.pos.manipos.com)
 * - <slug>.manipos.com / <slug>.restaurant.manipos.com -> Guest Public Menu Microsite (e.g. mutekitchens.manipos.com)
 * 
 * Local Development Fallback (localhost:5173):
 * - Supports ?tenant=mutekitchens or ?page=menu or #menu or subdomains (mutekitchens.localhost:5173)
 */

export function getTenantInfo() {
  const hostname = window.location.hostname;
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  // Query parameter overrides (helpful for testing in local dev)
  const queryTenant = searchParams.get('tenant');
  const queryPage = searchParams.get('page');

  let tenantSlug = null;
  let isPosDomain = false;
  let isGuestMicrosite = false;
  let isMarketingDomain = false;

  // 1. Check Query Params / Hash overrides first
  if (queryTenant) {
    tenantSlug = queryTenant.toLowerCase().trim();
  }

  // 2. Check Hostname / Subdomains
  const parts = hostname.split('.');

  // e.g. mutekitchens.pos.manipos.com or mutekitchens.manipos.com or mutekitchens.restaurant.manipos.com
  if (hostname.includes('manipos.com') || hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    if (parts.length >= 3) {
      if (parts[1] === 'pos') {
        tenantSlug = parts[0];
        isPosDomain = true;
      } else if (parts[1] === 'restaurant') {
        tenantSlug = parts[0];
        isGuestMicrosite = true;
      } else if (parts[0] === 'pos') {
        isPosDomain = true;
      } else if (parts[0] !== 'www') {
        tenantSlug = parts[0];
        isGuestMicrosite = true;
      }
    } else if (parts[0] === 'pos') {
      isPosDomain = true;
    }
  }

  // Path or query fallback for guest microsite
  if (queryPage === 'menu' || queryPage === 'microsite' || window.location.pathname.startsWith('/menu') || hash === '#/menu') {
    isGuestMicrosite = true;
  }

  // POS explicit overrides
  if (hash === '#/pos' || hash === '#/terminal' || window.location.pathname === '/terminal' || queryPage === 'pos' || queryPage === 'terminal') {
    isPosDomain = true;
    isGuestMicrosite = false;
  }

  if (!isPosDomain && !isGuestMicrosite && !tenantSlug) {
    isMarketingDomain = true;
  }

  return {
    hostname,
    tenantSlug: tenantSlug || (isGuestMicrosite ? 'potofjollof' : null),
    isPosDomain,
    isGuestMicrosite,
    isMarketingDomain,
  };

}

export function getPosLoginUrl(tenantSlug = null) {
  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

  if (isLocal) {
    const port = window.location.port ? `:${window.location.port}` : '';
    if (tenantSlug) {
      return `http://${window.location.hostname}${port}/?page=pos&tenant=${tenantSlug}`;
    }
    return `http://${window.location.hostname}${port}/?page=pos`;
  }

  if (tenantSlug) {
    return `https://${tenantSlug}.pos.manipos.com`;
  }

  return `https://pos.manipos.com`;
}

export function getMarketingUrl() {
  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

  if (isLocal) {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `http://${window.location.hostname}${port}/`;
  }

  return `https://manipos.com`;
}

