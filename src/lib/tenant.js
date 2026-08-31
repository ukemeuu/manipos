/**
 * Tenant & Subdomain Helper for ManiPOS (Restaurant & Retail)
 * 
 * Domain Structure:
 * - manipos.com -> Restaurant Marketing Landing Page
 * - retail.manipos.com -> Retail Marketing Landing Page
 * - pos.manipos.com -> General POS Staff Login & Terminal
 * - retail.pos.manipos.com / <slug>.retail.manipos.com -> Retail Store POS Terminal
 * - <slug>.pos.manipos.com -> Restaurant Scoped POS Terminal
 * - <slug>.manipos.com / <slug>.restaurant.manipos.com -> Guest Public Menu Microsite
 * - <slug>.manipos.com/feedback or <slug>.feedback.manipos.com -> Guest Feedback Form
 * 
 * Local Development Fallback (localhost:5173):
 * - Supports ?mode=retail or ?type=retail or ?tenant=demostore or ?page=retail-terminal
 */

export function getTenantInfo() {
  const hostname = window.location.hostname;
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  // Query parameter overrides (helpful for testing in local dev)
  const queryTenant = searchParams.get('tenant');
  const queryPage = searchParams.get('page');
  const queryMode = searchParams.get('mode') || searchParams.get('type');

  let tenantSlug = null;
  let isPosDomain = false;
  let isGuestMicrosite = false;
  let isFeedbackDomain = false;
  let isLinkHubDomain = false;
  let isMarketingDomain = false;
  let isRetailMarketingDomain = false;
  let isRetailPosDomain = false;
  let isRetailMode = false;

  // 1. Check Query Params / Hash overrides first
  if (queryTenant) {
    tenantSlug = queryTenant.toLowerCase().trim();
  }

  if (queryMode === 'retail' || queryPage === 'retail' || queryPage === 'retail-terminal' || hash === '#/retail' || hash === '#/retail-terminal') {
    isRetailMode = true;
  }

  // 2. Check Hostname / Subdomains
  const parts = hostname.split('.');

  // e.g. retail.manipos.com or retail.pos.manipos.com or mystore.retail.manipos.com
  if (hostname.includes('manipos.com') || hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    if (parts.length >= 3) {
      if (parts[1] === 'retail') {
        tenantSlug = parts[0];
        isRetailPosDomain = true;
        isRetailMode = true;
      } else if (parts[1] === 'pos' && parts[0] === 'retail') {
        isRetailPosDomain = true;
        isRetailMode = true;
      } else if (parts[1] === 'pos') {
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
      } else if (parts[0] === 'retail') {
        isRetailMarketingDomain = true;
        isRetailMode = true;
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
    } else if (parts[0] === 'retail') {
      isRetailMarketingDomain = true;
      isRetailMode = true;
    } else if (parts[0] === 'pos') {
      isPosDomain = true;
    } else if (parts[0] === 'feedback') {
      isFeedbackDomain = true;
    } else if (parts[0] === 'links') {
      isLinkHubDomain = true;
    }
  }

  // Explicit query / path retail routing
  if (queryPage === 'retail' || window.location.pathname === '/retail' || hash === '#/retail' || queryMode === 'retail') {
    isRetailMarketingDomain = true;
    isRetailMode = true;
    isMarketingDomain = false;
  }

  if (queryPage === 'retail-terminal' || window.location.pathname === '/retail-terminal' || hash === '#/retail-terminal') {
    isRetailPosDomain = true;
    isRetailMode = true;
    isRetailMarketingDomain = false;
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
    isRetailMarketingDomain = false;
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
    isRetailMarketingDomain = false;
  }

  // Path or query fallback for guest microsite
  if (!isFeedbackDomain && (queryPage === 'menu' || queryPage === 'microsite' || window.location.pathname.startsWith('/menu') || hash === '#/menu')) {
    isGuestMicrosite = true;
    isRetailMarketingDomain = false;
  }

  // POS explicit overrides
  if (hash === '#/pos' || hash === '#/terminal' || window.location.pathname === '/terminal' || queryPage === 'pos' || queryPage === 'terminal') {
    isPosDomain = true;
    isGuestMicrosite = false;
    isFeedbackDomain = false;
    isRetailMarketingDomain = false;
  }

  if (!isPosDomain && !isGuestMicrosite && !isFeedbackDomain && !isLinkHubDomain && !isRetailMarketingDomain && !isRetailPosDomain && !tenantSlug) {
    isMarketingDomain = true;
  }

  return {
    hostname,
    tenantSlug: tenantSlug || (isGuestMicrosite || isFeedbackDomain || isLinkHubDomain ? 'demo' : null),
    isPosDomain,
    isGuestMicrosite,
    isFeedbackDomain,
    isLinkHubDomain,
    isMarketingDomain,
    isRetailMarketingDomain,
    isRetailPosDomain,
    isRetailMode,
  };
}

export function getFeedbackUrl(tenantSlug = 'demo') {
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

export function getRetailPosLoginUrl(tenantSlug = null) {
  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

  if (isLocal) {
    const port = window.location.port ? `:${window.location.port}` : '';
    if (tenantSlug) {
      return `http://${window.location.hostname}${port}/?page=retail-terminal&tenant=${tenantSlug}`;
    }
    return `http://${window.location.hostname}${port}/?page=retail-terminal`;
  }

  if (tenantSlug) {
    return `https://${tenantSlug}.retail.manipos.com`;
  }

  return `https://retail.manipos.com/?page=retail-terminal`;
}

export function getRetailMarketingUrl() {
  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

  if (isLocal) {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `http://${window.location.hostname}${port}/?mode=retail`;
  }

  return `https://retail.manipos.com`;
}

export function getMarketingUrl() {
  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

  if (isLocal) {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `http://${window.location.hostname}${port}/`;
  }

  return `https://manipos.com`;
}
