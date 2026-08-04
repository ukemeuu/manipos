/**
 * Tenant & Subdomain Helper for ManiPOS
 * 
 * Domain Structure:
 * - manipos.com -> Marketing Landing Page
 * - pos.manipos.com -> Staff/POS App Login & General Terminal
 * - <slug>.pos.manipos.com -> Restaurant-specific Scoped POS Terminal (e.g. littlelagos.pos.manipos.com)
 * - <slug>.manipos.com / <slug>.restaurant.manipos.com -> Guest Public Menu Microsite (e.g. potofjollof.manipos.com)
 * - <slug>.manipos.com/feedback or <slug>.feedback.manipos.com -> Guest Feedback Form (e.g. potofjollof.manipos.com/feedback)
 * 
 * Local Development Fallback (localhost:5173):
 * - Supports ?tenant=potofjollof or ?page=feedback or #feedback or subdomains (potofjollof.localhost:5173)
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
  let isFeedbackDomain = false;
  let isLinkHubDomain = false;
  let isMarketingDomain = false;

  // 1. Check Query Params / Hash overrides first
  if (queryTenant) {
    tenantSlug = queryTenant.toLowerCase().trim();
  }

  // 2. Check Hostname / Subdomains
  const parts = hostname.split('.');

  // e.g. potofjollof.feedback.manipos.com or potofjollof.pos.manipos.com or potofjollof.manipos.com
  if (hostname.includes('manipos.com') || hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    if (parts.length >= 3) {
      if (parts[1] === 'pos') {
        tenantSlug = parts[0];
        isPosDomain = true;
      } else if (parts[1] === 'feedback') {
        tenantSlug = parts[0];
        isFeedbackDomain = true;
      } else if (parts[1] === 'links') {
        tenantSlug = parts[0];
        isLinkHubDomain = true;
      } else if (parts[1] === 'restaurant') {
        tenantSlug = parts[0];
        isGuestMicrosite = true;
      } else if (parts[0] === 'pos') {
        isPosDomain = true;
      } else if (parts[0] === 'feedback') {
        isFeedbackDomain = true;
      } else if (parts[0] === 'links') {
        isLinkHubDomain = true;
      } else if (parts[0] !== 'www') {
        tenantSlug = parts[0];
        isGuestMicrosite = true;
      }
    } else if (parts[0] === 'pos') {
      isPosDomain = true;
    } else if (parts[0] === 'feedback') {
      isFeedbackDomain = true;
    } else if (parts[0] === 'links') {
      isLinkHubDomain = true;
    }
  }

  // Path or query fallback for guest feedback
  if (
    queryPage === 'feedback' || 
    window.location.pathname.startsWith('/feedback') || 
    hash === '#/feedback'
  ) {
    isFeedbackDomain = true;
    isGuestMicrosite = false;
    isLinkHubDomain = false;
  }

  // Path or query fallback for restaurant link hub
  if (
    queryPage === 'links' || 
    window.location.pathname.startsWith('/links') || 
    hash === '#/links'
  ) {
    isLinkHubDomain = true;
    isFeedbackDomain = false;
    isGuestMicrosite = false;
  }

  // Path or query fallback for guest microsite
  if (!isFeedbackDomain && (queryPage === 'menu' || queryPage === 'microsite' || window.location.pathname.startsWith('/menu') || hash === '#/menu')) {
    isGuestMicrosite = true;
  }

  // POS explicit overrides
  if (hash === '#/pos' || hash === '#/terminal' || window.location.pathname === '/terminal' || queryPage === 'pos' || queryPage === 'terminal') {
    isPosDomain = true;
    isGuestMicrosite = false;
    isFeedbackDomain = false;
  }

  if (!isPosDomain && !isGuestMicrosite && !isFeedbackDomain && !isLinkHubDomain && !tenantSlug) {
    isMarketingDomain = true;
  }

  return {
    hostname,
    tenantSlug: tenantSlug || (isGuestMicrosite || isFeedbackDomain || isLinkHubDomain ? 'potofjollof' : null),
    isPosDomain,
    isGuestMicrosite,
    isFeedbackDomain,
    isLinkHubDomain,
    isMarketingDomain,
  };
}

export function getFeedbackUrl(tenantSlug = 'potofjollof') {
  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

  if (isLocal) {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `http://${window.location.hostname}${port}/?page=feedback&tenant=${tenantSlug}`;
  }

  return `https://${tenantSlug}.manipos.com/feedback`;
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
