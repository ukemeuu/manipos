import React, { useState, useEffect, Suspense, lazy } from 'react';
import { supabase, setTenantContext, getTenantContext } from './lib/supabase';
import { PinLogin } from './components/PinLogin';
import { LandingPage } from './components/LandingPage';
import { RetailLandingPage } from './components/RetailLandingPage';
import { AuthenticatedHome } from './components/AuthenticatedHome';
import { StatusPage, LegalPage } from './components/PublicPages';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { IncomingOrderAlarmOverlay } from './components/IncomingOrderAlarmOverlay';
import {
  getTenantInfo,
  getPosLoginUrl,
  getRetailPosLoginUrl,
} from './lib/tenant';
import { loadTenant, getActiveTenantSlug, getMicrositeUrl } from './lib/tenantConfig';
import { can } from './lib/permissions';
import { isAdminAccount, buildAppUrl } from './lib/posRouting';
import {
  writeActivePortalCookie,
  readActivePortalCookie,
  clearActivePortalCookie,
  writePendingSessionHandoffCookie,
  consumePendingSessionHandoffCookie,
  broadcastAuthEvent,
  subscribeAuthEvents,
} from './lib/crossTabSession';
import { unregisterNativeOrderPush } from './lib/nativePushService';

const RetailPosTerminal = lazy(() => import('./components/RetailPosTerminal').then(m => ({ default: m.RetailPosTerminal })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const MenuMicrosite = lazy(() => import('./components/MenuMicrosite').then(m => ({ default: m.MenuMicrosite })));
const UberEatsMicrosite = lazy(() => import('./components/UberEatsMicrosite').then(m => ({ default: m.UberEatsMicrosite })));
const FeedbackForm = lazy(() => import('./components/FeedbackForm').then(m => ({ default: m.FeedbackForm })));
const RestaurantLinkHub = lazy(() => import('./components/RestaurantLinkHub').then(m => ({ default: m.RestaurantLinkHub })));
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
const KitchenDisplay = lazy(() => import('./components/KitchenDisplay').then(m => ({ default: m.KitchenDisplay })));
const FloorPlanView = lazy(() => import('./components/FloorPlanView').then(m => ({ default: m.FloorPlanView })));
const InventoryView = lazy(() => import('./components/InventoryView').then(m => ({ default: m.InventoryView })));
const RestaurantDirectory = lazy(() => import('./components/RestaurantDirectory').then(m => ({ default: m.RestaurantDirectory })));
const HrAndStaffPortalView = lazy(() => import('./components/orda/HrAndStaffPortalView').then(m => ({ default: m.HrAndStaffPortalView })));
const PojOperationsView = lazy(() => import('./components/orda/PojOperationsView').then(m => ({ default: m.PojOperationsView })));
const TraderInvoicesApp = lazy(() => import('./components/invoices/TraderInvoicesApp').then(m => ({ default: m.TraderInvoicesApp })));
const PublicTraderInvoiceView = lazy(() => import('./components/invoices/PublicTraderInvoiceView').then(m => ({ default: m.PublicTraderInvoiceView })));

const RouteFallback = () => (
  <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 text-slate-400">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400" />
    <span className="text-xs font-bold uppercase tracking-widest">Loading workspace…</span>
  </div>
);

const PAGE_ROUTES = {
  superadmin: 'superadmin',
  app: 'app',
  onboarding: 'onboarding',
  dashboard: 'dashboard',
  feedback: 'feedback',
  links: 'links',
  'retail-terminal': 'retail-terminal',
  retail: 'retail-home',
  pos: 'terminal',
  terminal: 'terminal',
  menu: 'microsite',
  microsite: 'microsite',
  restaurants: 'restaurants',
  directory: 'restaurants',
  kds: 'kds',
  kitchen: 'kds',
  floor: 'floor',
  tables: 'floor',
  reservations: 'floor',
  inventory: 'inventory',
  stock: 'inventory',
  status: 'status',
  privacy: 'privacy',
  terms: 'terms',
  'menu-builder': 'menu-builder',
  'menu-build': 'menu-builder',
  login: 'terminal',
  portal: 'terminal',
  'staff-portal': 'staff-portal',
  hr: 'staff-portal',
  accountant: 'accountant',
  expenses: 'expenses',
  receiving: 'receiving',
  waste: 'waste',
  'store-ops': 'store-ops',
  'qr-vault': 'qr-vault',
};

function resolveRoute() {
  const info = getTenantInfo();
  const params = new URLSearchParams(window.location.search);
  const page = (params.get('page') || '').toLowerCase();
  const mode = (params.get('mode') || params.get('type') || '').toLowerCase();
  const path = window.location.pathname;
  const hash = window.location.hash;

  // Explicit page routing wins so new modules work on every host.
  if (page && PAGE_ROUTES[page]) return PAGE_ROUTES[page];

  if (path === '/superadmin' || hash === '#/superadmin') return 'superadmin';
  if (path === '/invoices' || hash === '#/invoices') return 'trader-invoices';
  if (path.startsWith('/inv/') || hash.startsWith('#/inv/')) return 'trader-invoice-public';
  if (path === '/app' || hash === '#/app') return 'app';
  if (hash === '#/onboarding') return 'onboarding';
  if (path === '/dashboard' || hash === '#/dashboard') return 'dashboard';
  if (info.isFeedbackDomain || path === '/feedback' || hash === '#/feedback') return 'feedback';
  if (path === '/links' || hash === '#/links') return 'links';
  if (info.isLinkHubDomain) return 'links';
  if (info.isRetailPosDomain || path === '/retail-terminal' || hash === '#/retail-terminal') return 'retail-terminal';
  if (info.isRetailMarketingDomain || mode === 'retail' || path === '/retail' || hash === '#/retail') return 'retail-home';
  if (info.isPosDomain || path === '/terminal' || hash === '#/terminal' || hash === '#/pos') return 'terminal';
  if (info.isGuestMicrosite || path === '/menu' || hash === '#/menu') return 'microsite';
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) return 'terminal';
  return 'home';
}

const OPERATIONAL_ROUTES = new Set(['kds', 'floor', 'inventory']);

// Legacy #menu-builder route: the catalog now lives in the Orda admin menu.
// Rewrite the location in place (keeping ?tenant=...) and let the router
// re-render. A full window.location.replace() here dropped the tenant param,
// and pos.manipos.com treats a URL without it as the generic login host — which
// wiped the staff session and bounced the user back to the dashboard.
function LegacyMenuBuilderRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('page', 'dashboard');
      url.searchParams.set('tab', 'menu');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      try {
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (_) {
        window.dispatchEvent(new Event('popstate'));
      }
    } catch (_) { }
  }, []);
  return null;
}

const POJ_PORTAL_ROUTES = new Set(['staff-portal', 'accountant', 'expenses', 'receiving', 'waste', 'store-ops', 'qr-vault']);
const ROLE_HOME_ROUTE = {
  kds: 'kds',
  staff: 'staff-portal',
  accountant: 'accountant',
  expense_clerk: 'expenses',
  chef: 'waste',
  receiver: 'receiving',
  stock_controller: 'store-ops',
  store_clerk: 'store-ops',
  issuer: 'store-ops',
};

function isGenericPosHost() {
  if (typeof window === 'undefined' || window.location.hostname !== 'pos.manipos.com') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('logout') === '1' || params.get('neutral') === '1') return true;
    const tenantParam = (params.get('tenant') || '').toLowerCase().trim();
    return !tenantParam || tenantParam === 'pos';
  } catch (_) {
    return true;
  }
}

// manipos.com / www.manipos.com are the neutral SaaS marketing site. A staff
// session cached on this origin (for example by the landing-page sign-in
// modal) must never auto-open a tenant workspace after the user signs out.
function isNeutralMarketingHost() {
  return typeof window !== 'undefined' && (
    window.location.hostname === 'manipos.com' ||
    window.location.hostname === 'www.manipos.com'
  );
}

// Staff-only session artifacts. Removed on every origin that must not keep a
// signed-in staff member across a sign-out.
function wipeStaffSessionStorage() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('pin_staff_user');
    localStorage.removeItem('manipos_selected_brand');
    localStorage.removeItem('manipos_poj_session_v1');
    localStorage.removeItem('manipos_offline_staff_credentials');
    sessionStorage.removeItem('manipos_pending_supa_session');
  } catch (_) {}
}

function wipeLocalSessionStorage() {
  wipeStaffSessionStorage();
  if (typeof window === 'undefined') return;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        localStorage.removeItem(k);
      }
    }
  } catch (_) {}
}

function App() {
  const [session, setSession] = useState(() => {
    try {
      // pos.manipos.com is the shared login portal; never boot into another
      // tenant's leftover session from localStorage (prevents redirect hijacks).
      if (isGenericPosHost()) {
        wipeLocalSessionStorage();
        return null;
      }

      // The marketing homepage is always neutral: never boot into a staff
      // session cached on manipos.com (the landing-page sign-in modal stores
      // one before handing off to the tenant POS). The superadmin console is
      // exempt because it signs in with its own Supabase session.
      if (isNeutralMarketingHost()) {
        wipeStaffSessionStorage();
        return null;
      }

      // 1. Check short-lived .manipos.com handoff cookie (or legacy URL hash/query)
      if (typeof window !== 'undefined') {
        const handoffPayload = consumePendingSessionHandoffCookie();
        const hash = window.location.hash || '';
        const params = new URLSearchParams(window.location.search);
        let sessionParam = params.get('session');
        if (!sessionParam && hash.includes('session=')) {
          const match = hash.match(/session=([^&]+)/);
          if (match) sessionParam = decodeURIComponent(match[1]);
        }
        if (handoffPayload || sessionParam) {
          try {
            const parsed = handoffPayload || JSON.parse(decodeURIComponent(escape(atob(sessionParam))));
            if (parsed && (parsed.staffUser || parsed.id || parsed.role)) {
              const staffUser = parsed.staffUser || parsed;
              localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
              if (staffUser.restaurantId || staffUser.restaurant_id) {
                setTenantContext(staffUser.restaurantId || staffUser.restaurant_id);
              }
              if (parsed.supabaseSession?.access_token && parsed.supabaseSession?.refresh_token) {
                sessionStorage.setItem('manipos_pending_supa_session', JSON.stringify(parsed.supabaseSession));
              }
              if (parsed.pojSession?.access_token) {
                localStorage.setItem('manipos_poj_session_v1', JSON.stringify(parsed.pojSession));
              }
              writeActivePortalCookie({
                tenantSlug: staffUser.tenantSlug || getActiveTenantSlug(),
                restaurantName: staffUser.restaurantName,
                staffName: staffUser.name,
                role: staffUser.role,
                isAdmin: isAdminAccount(staffUser),
              });
              const url = new URL(window.location.href);
              url.searchParams.delete('session');
              if (url.hash && url.hash.includes('session=')) {
                const newHash = url.hash
                  .replace(/^#/, '')
                  .split('&')
                  .filter((part) => !part.startsWith('session='))
                  .join('&');
                url.hash = newHash ? `#${newHash}` : '';
              }
              window.history.replaceState(null, '', (url.pathname + url.search + url.hash) || '/');
              return { staffUser };
            }
          } catch (e) {
            console.warn('Failed to parse transferred session:', e);
          }
        }

        // On pos.manipos.com/?tenant=<slug>, enforce tenant isolation against any
        // leftover localStorage session from a different store.
        if (window.location.hostname === 'pos.manipos.com') {
          const reqTenant = (params.get('tenant') || '').toLowerCase().trim();
          const rawCached = localStorage.getItem('pin_staff_user');
          if (reqTenant && rawCached) {
            try {
              const cachedUser = JSON.parse(rawCached);
              const cachedSlug = (cachedUser?.tenantSlug || '').toLowerCase().trim();
              if (cachedSlug && cachedSlug !== reqTenant) {
                wipeLocalSessionStorage();
                return null;
              }
            } catch (_) {}
          }
        }
      }

      const stored = localStorage.getItem('pin_staff_user');
      return stored ? { staffUser: JSON.parse(stored) } : null;
    } catch (e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [tenantInfo, setTenantInfo] = useState(() => getTenantInfo());
  const [tenant, setTenant] = useState(null);
  // The microsite must not render until the tenant is known: rendering with a
  // null tenant shows an empty "menu coming soon" page and a broken logo for a
  // moment before the real menu arrives.
  const [tenantLoading, setTenantLoading] = useState(true);
  const [currentRoute, setCurrentRoute] = useState(() => resolveRoute());
  const [storeStatus, setStoreStatus] = useState('approved');
  const [trialExpired, setTrialExpired] = useState(false);
  const [businessType, setBusinessType] = useState('restaurant');
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Load tenant configuration (DB first, static registry fallback).
  useEffect(() => {
    let cancelled = false;
    const slug = getActiveTenantSlug() || tenantInfo.tenantSlug || session?.staffUser?.tenantSlug || null;
    let staffTid = null;
    try {
      const p = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
      staffTid = p.restaurantId || p.restaurant_id || null;
    } catch (_) {}
    if (!slug) {
      setTenant(null);
      setTenantContext(staffTid);
      setTenantLoading(false);
      return undefined;
    }
    setTenantLoading(true);
    loadTenant(slug).then((resolved) => {
      if (!cancelled) {
        setTenant(resolved);
        setTenantContext(resolved?.id || staffTid || null);
        setTenantLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [tenantInfo.tenantSlug, currentRoute]);

  // Keep the browser title tenant-aware for shared menu links.
  useEffect(() => {
    if (tenant?.name && (currentRoute === 'microsite')) {
      document.title = `${tenant.name} · Order online`;
    } else if (currentRoute === 'restaurants') {
      document.title = 'Restaurant Directory · ManiPOS';
    } else if (!tenant?.name || currentRoute === 'home') {
      document.title = 'ManiPOS · Cloud POS for African restaurants';
    }
  }, [tenant?.name, currentRoute]);

  useEffect(() => {
    const fetchStoreStatus = async () => {
      try {
        const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
        const storeSlug = tenantInfo.tenantSlug || pinUser.tenantSlug;
        const storeId = pinUser.restaurantId || pinUser.restaurant_id;

        if (!storeSlug && !storeId) {
          if (session && currentRoute !== 'home' && currentRoute !== 'retail-home' && currentRoute !== 'superadmin' && currentRoute !== 'feedback' && currentRoute !== 'links' && currentRoute !== 'microsite' && currentRoute !== 'restaurants' && currentRoute !== 'status' && currentRoute !== 'privacy' && currentRoute !== 'terms') {
            handleGlobalSignOut();
          }
          return;
        }

        let query = supabase.from('restaurants').select('id, name, slug, status, is_active, business_type, trial_ends_at, subscription_status, plan');
        if (storeId) {
          query = query.eq('id', storeId);
        } else {
          query = query.eq('slug', storeSlug);
        }
        const { data, error } = await query.maybeSingle();

        if (error || !data) {
          console.warn('[Security Guard] Store record not found on server:', error);
          if (session) {
            localStorage.removeItem('pin_staff_user');
            localStorage.removeItem('manipos_selected_brand');
            setSession(null);
          }
          return;
        }

        const activeStatus = (data.is_active === false) ? 'suspended' : (data.status || 'approved');
        setStoreStatus(activeStatus);
        if (data.business_type) {
          setBusinessType(data.business_type);
        }

        const expired =
          activeStatus === 'trial' &&
          data.subscription_status !== 'active' &&
          data.trial_ends_at &&
          new Date(data.trial_ends_at).getTime() < Date.now();
        setTrialExpired(Boolean(expired));

        // SERVER-SIDE APPROVAL GUARD: Allow active/approved/trial stores; block suspended/rejected
        if (!['approved', 'trial', 'active'].includes(activeStatus)) {
          console.warn(`[Security Guard] Revoking access for tenant ${data.slug}. Status: ${activeStatus}`);
          if (session) {
            localStorage.removeItem('pin_staff_user');
            localStorage.removeItem('manipos_selected_brand');
            setSession(null);
          }
        }
      } catch (e) {
        console.warn('Store status check notice:', e);
      }
    };

    fetchStoreStatus();
  }, [tenantInfo.tenantSlug, currentRoute, session]);

  // Redirect generic pos.manipos.com (or mismatched <other>.pos.manipos.com) sessions
  // to the authenticated staff member's own <slug>.pos.manipos.com domain.
  const redirectToTenantPosIfGenericHost = async (staffUser, explicitRoute = null) => {
    if (typeof window === 'undefined' || !staffUser) return false;
    const host = window.location.hostname;
    const isPosFamilyHost = host === 'pos.manipos.com' || host.endsWith('.pos.manipos.com');
    if (!isPosFamilyHost || window.Capacitor?.isNativePlatform?.()) return false;

    let slug = staffUser.tenantSlug;
    if (!slug && (staffUser.restaurantId || staffUser.restaurant_id)) {
      try {
        const { data } = await supabase
          .from('restaurants')
          .select('slug')
          .eq('id', staffUser.restaurantId || staffUser.restaurant_id)
          .maybeSingle();
        if (data?.slug) slug = data.slug;
      } catch (_) {}
    }

    if (!slug || slug === 'pos') return false;
    const currentParams = new URLSearchParams(window.location.search);
    const currentTenantParam = (currentParams.get('tenant') || '').toLowerCase().trim();
    if (host === 'pos.manipos.com' && currentTenantParam === slug) return false;
    if (host === `${slug}.pos.manipos.com`) return false;

    const updatedStaffUser = { ...staffUser, tenantSlug: slug };
    const transferPayload = { staffUser: updatedStaffUser };

    try {
      const pojRaw = localStorage.getItem('manipos_poj_session_v1');
      if (pojRaw) {
        const parsedPoj = JSON.parse(pojRaw);
        if (parsedPoj?.access_token) transferPayload.pojSession = parsedPoj;
      }
    } catch (_) {}

    try {
      const { data: { session: supaSess } } = await supabase.auth.getSession();
      if (supaSess?.access_token && supaSess?.refresh_token) {
        transferPayload.supabaseSession = {
          access_token: supaSess.access_token,
          refresh_token: supaSess.refresh_token,
        };
      }
    } catch (_) {}

    writeActivePortalCookie({
      tenantSlug: slug,
      restaurantName: updatedStaffUser.restaurantName,
      staffName: updatedStaffUser.name,
      role: updatedStaffUser.role,
      isAdmin: isAdminAccount(updatedStaffUser),
    });
    writePendingSessionHandoffCookie(transferPayload);
    broadcastAuthEvent('login', { staffUser: updatedStaffUser });

    const destPage = explicitRoute || (isAdminAccount(updatedStaffUser) ? 'dashboard' : 'pos');
    const targetPath = window.location.pathname && window.location.pathname !== '/' ? window.location.pathname : '/';
    if (host !== 'pos.manipos.com') {
      wipeLocalSessionStorage();
    }
    window.location.replace(`https://pos.manipos.com${targetPath}?tenant=${encodeURIComponent(slug)}&page=${encodeURIComponent(destPage)}`);
    return true;
  };

  useEffect(() => {
    // Safety timer: guarantee loading spinner dismisses within 500ms
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    // On generic pos.manipos.com login host, keep the login portal clean instead
    // of restoring any cached tenant session from another store — EXCEPT when an
    // active .manipos.com session cookie points directly to the user's open portal.
    if (isGenericPosHost()) {
      wipeLocalSessionStorage();
      const params = new URLSearchParams(window.location.search);
      if (params.get('logout') === '1') {
        clearActivePortalCookie();
        setLoading(false);
        return () => clearTimeout(timer);
      }
      if (params.get('switch') !== '1') {
        const portal = readActivePortalCookie();
        if (portal?.tenantSlug && portal.tenantSlug !== 'pos') {
          const destPage = portal.isAdmin ? 'dashboard' : 'pos';
          window.location.replace(`https://pos.manipos.com/?tenant=${encodeURIComponent(portal.tenantSlug)}&page=${destPage}`);
          return () => clearTimeout(timer);
        }
      }
      setLoading(false);
      return () => clearTimeout(timer);
    }

    // If user lands on manipos.com/?page=login|dashboard|pos|app while already
    // authenticated in another browser tab, jump straight into their open portal.
    const hostLower = window.location.hostname.toLowerCase();
    if ((hostLower === 'manipos.com' || hostLower === 'www.manipos.com')) {
      const params = new URLSearchParams(window.location.search);
      const qPage = (params.get('page') || '').toLowerCase();
      if (
        ['login', 'pos', 'terminal', 'dashboard', 'app'].includes(qPage) &&
        params.get('logout') !== '1' &&
        params.get('switch') !== '1'
      ) {
        const portal = readActivePortalCookie();
        if (portal?.tenantSlug && portal.tenantSlug !== 'pos') {
          const destPage = portal.isAdmin ? 'dashboard' : 'pos';
          window.location.replace(`https://pos.manipos.com/?tenant=${encodeURIComponent(portal.tenantSlug)}&page=${destPage}`);
          return () => clearTimeout(timer);
        }
      }
    }

    // Restore transferred Supabase Auth session if arriving from pos.manipos.com redirect
    const restoreOrGetSession = async () => {
      // Never auto-restore a Supabase session on the neutral marketing site
      // (staff sign in on the tenant POS subdomain, not on manipos.com).
      if (isNeutralMarketingHost() && currentRoute !== 'superadmin' && currentRoute !== 'trader-invoices' && currentRoute !== 'trader-invoice-public') {
        setLoading(false);
        return;
      }
      try {
        const pendingRaw = sessionStorage.getItem('manipos_pending_supa_session');
        if (pendingRaw) {
          sessionStorage.removeItem('manipos_pending_supa_session');
          const pending = JSON.parse(pendingRaw);
          if (pending?.access_token && pending?.refresh_token) {
            const { data } = await supabase.auth.setSession(pending);
            if (data?.session) {
              const pinFallback = (() => {
                try {
                  const p = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
                  return p.restaurantId || p.restaurant_id || null;
                } catch (_) { return null; }
              })();
              setSession(prev => ({ ...prev, ...data.session }));
              const nextTid = data.session.user?.app_metadata?.tenant_id || pinFallback || getTenantContext();
              if (nextTid) setTenantContext(nextTid);
              setLoading(false);
              return;
            }
          }
        }
      } catch (_) {}

      try {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession) {
          const pinFallback = (() => {
            try {
              const p = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
              return p.restaurantId || p.restaurant_id || null;
            } catch (_) { return null; }
          })();
          setSession(prev => ({ ...prev, ...activeSession }));
          const nextTid = activeSession.user?.app_metadata?.tenant_id || pinFallback || getTenantContext();
          if (nextTid) setTenantContext(nextTid);
        }
      } catch (_) {}
      setLoading(false);
    };

    restoreOrGetSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, activeSession) => {
      if (isGenericPosHost()) return;
      if (isNeutralMarketingHost() && currentRoute !== 'superadmin' && currentRoute !== 'trader-invoices' && currentRoute !== 'trader-invoice-public') return;
      if (activeSession) {
        const pinFallback = (() => {
          try {
            const p = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
            return p.restaurantId || p.restaurant_id || null;
          } catch (_) { return null; }
        })();
        setSession(prev => ({ ...prev, ...activeSession }));
        const nextTid = activeSession.user?.app_metadata?.tenant_id || pinFallback || getTenantContext();
        if (nextTid) setTenantContext(nextTid);
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  // Persist cross-subdomain portal cookie whenever an authenticated staff session
  // is active on a tenant POS subdomain, and sync logins/logouts across open tabs.
  useEffect(() => {
    if (isGenericPosHost()) return undefined;
    if (isNeutralMarketingHost()) return undefined;
    if (session?.staffUser) {
      const slug = session.staffUser.tenantSlug || tenantInfo.tenantSlug || tenant?.slug;
      if (slug && slug !== 'pos') {
        writeActivePortalCookie({
          tenantSlug: slug,
          restaurantName: tenant?.name || session.staffUser.restaurantName,
          staffName: session.staffUser.name,
          role: session.staffUser.role,
          isAdmin: isAdminAccount(session.staffUser),
        });
      }
    } else if (!loading && tenantInfo.isPosDomain && tenantInfo.tenantSlug) {
      const portal = readActivePortalCookie();
      if (portal?.tenantSlug === tenantInfo.tenantSlug) {
        clearActivePortalCookie();
      }
    }
    return undefined;
  }, [session?.staffUser, loading, tenantInfo.isPosDomain, tenantInfo.tenantSlug, tenant?.name, tenant?.slug]);

  useEffect(() => {
    const syncFromStorage = () => {
      if (isGenericPosHost() || isNeutralMarketingHost()) return;
      try {
        const raw = localStorage.getItem('pin_staff_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          setSession((prev) => ({ ...(prev || {}), staffUser: parsed }));
          if (parsed?.restaurantId || parsed?.restaurant_id) {
            setTenantContext(parsed.restaurantId || parsed.restaurant_id);
          }
        } else {
          setSession(null);
        }
      } catch (_) {}
    };

    const onStorage = (e) => {
      if (!e || e.key === null || e.key === 'pin_staff_user') {
        syncFromStorage();
      }
    };
    window.addEventListener('storage', onStorage);
    const unsub = subscribeAuthEvents((msg) => {
      if (msg?.type === 'logout') {
        wipeLocalSessionStorage();
        // Every open tab must drop the cross-subdomain portal cookie, not
        // just the tab that initiated the sign-out.
        clearActivePortalCookie();
        setSession(null);
      } else if (msg?.type === 'login') {
        syncFromStorage();
      }
    });
    return () => {
      window.removeEventListener('storage', onStorage);
      unsub();
    };
  }, []);

  // A manipos.com tab that was already open when the user signed out on the
  // tenant POS must also drop its cached staff session when it regains focus.
  // (localStorage/BroadcastChannel are origin-scoped, so the logout tab cannot
  // clear this origin directly.)
  useEffect(() => {
    if (!isNeutralMarketingHost()) return undefined;
    const dropCachedStaffSession = () => {
      if (currentRoute === 'superadmin') return;
      wipeStaffSessionStorage();
      setSession(null);
    };
    window.addEventListener('focus', dropCachedStaffSession);
    return () => window.removeEventListener('focus', dropCachedStaffSession);
  }, [currentRoute]);

  // Force migrated staff to set a new password on first sign-in.
  useEffect(() => {
    const staff = session?.staffUser || JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    setMustChangePassword(staff?.mustChangePassword === true);
  }, [session?.staffUser]);

  // Listen to browser navigation changes
  useEffect(() => {
    const handleLocationChange = () => {
      setTenantInfo(getTenantInfo());
      setCurrentRoute(resolveRoute());
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const goTo = (route, url) => {
    setCurrentRoute(route);
    if (url) window.history.pushState({}, '', url);
  };

  const navigateToHome = () => goTo('home', '/');

  const navigateToRetailHome = () => goTo('retail-home', '/?mode=retail');

  const navigateToLogin = (slug = null) => {
    const url = getPosLoginUrl(slug);
    window.location.href = url;
  };

  const navigateToRetailLogin = (slug = null) => {
    const url = getRetailPosLoginUrl(slug);
    window.location.href = url;
  };

  const openModule = (page) => {
    // Menu Builder is now the "menu" tab of the Orda admin shell, not a
    // standalone page. Route straight to it and keep the tenant param.
    if (page === 'menu-builder' || page === 'menu-build') {
      goTo('dashboard', buildAppUrl('dashboard', { tab: 'menu' }));
      return;
    }
    goTo(page, buildAppUrl(page, { tab: null }));
  };

  const openMicrosite = (slug) => {
    const url = getMicrositeUrl(slug);
    if (url.startsWith('/')) {
      goTo('microsite', url);
    } else {
      window.location.href = url;
    }
  };

  const handleGlobalSignOut = async () => {
    await unregisterNativeOrderPush().catch(() => {});
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    setTenantContext(null);
    clearActivePortalCookie();
    broadcastAuthEvent('logout');
    wipeLocalSessionStorage();
    setSession(null);
    setCurrentRoute('home');

    // Leave via a real navigation (replace, not push) so the signed-in screens
    // stay out of the browser history. On localhost, Capacitor Android, or an
    // installed standalone PWA, stay on the same origin with ?page=login&logout=1
    // so Android doesn't jump to Chrome or re-lock onto a tenant subdomain.
    try {
      sessionStorage.setItem('manipos_neutral_login', '1');
    } catch (_) {}
    const host = window.location.hostname;
    const isStandalonePwa =
      Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches) ||
      window.navigator?.standalone === true;
    const isLocalOrNative =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^(127|10|192\.168)\./.test(host) ||
      Boolean(window.Capacitor?.isNativePlatform?.()) ||
      isStandalonePwa;
    if (isLocalOrNative) {
      window.location.replace('/?page=login&logout=1');
      return;
    }

    window.location.replace('https://pos.manipos.com/?logout=1');
  };

  const renderContent = () => {
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  // Migrated staff must set a new password before using the terminal.
  if (mustChangePassword) {
    return <ChangePasswordModal onDone={() => setMustChangePassword(false)} />;
  }

  // ROUTE -2: Standalone Trader Invoice & Receipt Generator (manipos.com/#/invoices & #/inv/<token>)
  if (currentRoute === 'trader-invoices') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <TraderInvoicesApp />
      </Suspense>
    );
  }
  if (currentRoute === 'trader-invoice-public') {
    const hashToken = (window.location.hash || '').replace(/^#\/inv\//, '').split('?')[0];
    const pathToken = (window.location.pathname || '').replace(/^\/inv\//, '').split('?')[0];
    return (
      <Suspense fallback={<RouteFallback />}>
        <PublicTraderInvoiceView publicToken={hashToken || pathToken} />
      </Suspense>
    );
  }

  // ROUTE -1: Platform Owner Super Admin Console (manipos.com?page=superadmin)
  if (currentRoute === 'superadmin') {
    return <SuperAdminDashboard />;
  }

  // ROUTE 0: Guest Feedback Form (e.g. potofjollof.manipos.com/feedback or manipos.com?page=feedback)
  if (currentRoute === 'feedback' || tenantInfo.isFeedbackDomain) {
    return <FeedbackForm />;
  }

  // ROUTE 0.5: Restaurant Link Hub (e.g. potofjollof.manipos.com/links or manipos.com?page=links)
  if (currentRoute === 'links' || tenantInfo.isLinkHubDomain) {
    return <RestaurantLinkHub />;
  }

  // ROUTE 0.6: Public restaurant marketplace
  if (currentRoute === 'restaurants') {
    return (
      <RestaurantDirectory
        onBack={navigateToHome}
        onOpenTenant={(restaurant) => openMicrosite(restaurant.slug)}
        onListRestaurant={() => {
          goTo('home', '/');
          setTimeout(() => window.dispatchEvent(new CustomEvent('manipos:open-onboarding')), 150);
        }}
      />
    );
  }

  // ROUTE 0.65: Legacy menu builder redirect (consolidated into Orda catalog)
  if (currentRoute === 'menu-builder') {
    return <LegacyMenuBuilderRedirect />;
  }

  // ROUTE 0.7: Trust, legal and status pages
  if (currentRoute === 'status') {
    return <StatusPage onBack={navigateToHome} />;
  }
  if (currentRoute === 'privacy' || currentRoute === 'terms') {
    return <LegalPage kind={currentRoute} onBack={navigateToHome} />;
  }

  // STRICT DOMAIN BOUNDARY (GEMINI.md Rule 1):
  // manipos.com and www.manipos.com must exclusively serve the ManiPOS SaaS marketing landing page
  // and must NEVER route to tenant microsites unless explicitly scoped by subdomain or tenant query.
  if ((tenantInfo.hostname === 'manipos.com' || tenantInfo.hostname === 'www.manipos.com') && (currentRoute === 'microsite' || tenantInfo.isGuestMicrosite)) {
    const queryTenant = new URLSearchParams(window.location.search).get('tenant');
    if (!queryTenant) {
      return (
        <LandingPage 
          onProceedToLogin={(slug) => navigateToLogin(slug)} 
          onSwitchToRetail={navigateToRetailHome}
          onBrowseRestaurants={() => goTo('restaurants', '/?page=restaurants')}
        />
      );
    }
  }

  // ROUTE 1: Guest Digital Menu Microsite (e.g. potofjollof.manipos.com or manipos.com?page=menu)
  if (currentRoute === 'microsite' || tenantInfo.isGuestMicrosite) {
    if (tenantLoading) {
      return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-[#e2e2e2] border-t-black rounded-full animate-spin" />
          <p className="text-[11px] font-bold text-[#757575] uppercase tracking-widest">Loading menu…</p>
        </div>
      );
    }
    const queryParams = new URLSearchParams(window.location.search);
    const wantsLegacy = queryParams.get('view') === 'legacy' || queryParams.get('mode') === 'classic';
    if (wantsLegacy && (tenantInfo.tenantSlug === 'potofjollof' || tenant?.slug === 'potofjollof')) {
      return <MenuMicrosite onBack={navigateToHome} tenantSlug={tenantInfo.tenantSlug || 'potofjollof'} />;
    }
    return (
      <UberEatsMicrosite
        tenant={tenant}
        onBack={navigateToHome} 
        onStaffLogin={() => navigateToLogin(tenantInfo.tenantSlug)}
        onAdminLogin={() => navigateToLogin(tenantInfo.tenantSlug)}
      />
    );
  }

  // ROUTE 1.5: Standalone Retail POS Register Terminal
  if (currentRoute === 'retail-terminal') {
    const staffUser = session?.staffUser || JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    return (
      <RetailPosTerminal
        staffName={staffUser.name || 'Cashier'}
        staffRole={staffUser.role || 'cashier'}
        tenantSlug={tenantInfo.tenantSlug || 'demo'}
        onSignOut={handleGlobalSignOut}
        onOpenDashboard={() => setCurrentRoute('dashboard')}
        onOpenAppHome={() => setCurrentRoute('app')}
      />
    );
  }

  // AUTHENTICATED SESSION ROUTING ENGINE
  if (session) {
    const staffUser = session.staffUser || JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    // Management Dashboard / workspace launcher is strictly for admin accounts;
    // all other staff go straight to the POS terminal or their operational station.
    const isAdmin = isAdminAccount(staffUser);

    // If store is retail, route to retail terminal by default
    if (businessType === 'retail' && currentRoute === 'terminal') {
      return (
        <RetailPosTerminal
          staffName={staffUser.name}
          staffRole={staffUser.role}
          tenantSlug={tenantInfo.tenantSlug}
          onSignOut={handleGlobalSignOut}
          onOpenDashboard={isAdmin ? () => setCurrentRoute('dashboard') : null}
          onOpenAppHome={() => setCurrentRoute('app')}
        />
      );
    }

    // RBAC Security Check: Route specialized POJ & POS roles cleanly
    const roleHome = ROLE_HOME_ROUTE[staffUser.role];
    const resolvedRestId = staffUser.restaurantId || staffUser.restaurant_id || tenant?.id || null;
    const resolvedRestName = tenant?.name || staffUser.restaurantName || 'ManiPOS Store';
    const resolvedSlug = tenantInfo.tenantSlug || staffUser.tenantSlug || '';

    if (POJ_PORTAL_ROUTES.has(currentRoute) && (isAdmin || roleHome === currentRoute || currentRoute === 'staff-portal')) {
      if (currentRoute === 'staff-portal') {
        return (
          <HrAndStaffPortalView
            mode="self-service"
            restaurantId={resolvedRestId}
            restaurantName={resolvedRestName}
            staffUser={staffUser}
            onSignOut={handleGlobalSignOut}
            onOpenPos={isAdmin ? () => goTo('app', buildAppUrl('app')) : (can('view_pos', staffUser) ? () => setCurrentRoute('terminal') : null)}
          />
        );
      }
      return (
        <PojOperationsView
          mode={currentRoute}
          standalone
          restaurantId={resolvedRestId}
          restaurantName={resolvedRestName}
          tenantSlug={resolvedSlug}
          staffUser={staffUser}
          onSignOut={isAdmin ? () => goTo('app', buildAppUrl('app')) : handleGlobalSignOut}
        />
      );
    }

    if (!isAdmin && (currentRoute === 'dashboard' || currentRoute === 'app' || currentRoute === 'onboarding' || currentRoute === 'home' || roleHome)) {
      if (roleHome === 'kds') {
        return (
          <KitchenDisplay
            tenant={tenant}
            staffName={staffUser.name}
            onBack={handleGlobalSignOut}
          />
        );
      }
      if (roleHome === 'staff-portal' || currentRoute === 'staff-portal') {
        return (
          <HrAndStaffPortalView
            mode="self-service"
            restaurantId={resolvedRestId}
            restaurantName={resolvedRestName}
            staffUser={staffUser}
            onSignOut={handleGlobalSignOut}
            onOpenPos={can('view_pos', staffUser) ? () => setCurrentRoute('terminal') : null}
          />
        );
      }
      if (roleHome && POJ_PORTAL_ROUTES.has(roleHome)) {
        return (
          <PojOperationsView
            mode={roleHome}
            standalone
            restaurantId={resolvedRestId}
            restaurantName={resolvedRestName}
            tenantSlug={resolvedSlug}
            staffUser={staffUser}
            onSignOut={handleGlobalSignOut}
          />
        );
      }
      return (
        <AdminDashboard
          initialView="pos"
          staffUser={staffUser}
          onOpenAppHome={null}
          onOpenModule={openModule}
          onSignOut={handleGlobalSignOut}
          tenantSlug={tenantInfo.tenantSlug}
          tenantId={resolvedRestId}
        />
      );
    }

    // Operational modules: Kitchen Display, Floor & Reservations, Inventory & Recipes
    if (OPERATIONAL_ROUTES.has(currentRoute)) {
      if (!isAdmin) {
        return (
          <AdminDashboard
            initialView="pos"
            staffUser={staffUser}
            onOpenAppHome={null}
            onOpenModule={openModule}
            onSignOut={handleGlobalSignOut}
            tenantSlug={tenantInfo.tenantSlug}
            tenantId={resolvedRestId}
          />
        );
      }
      if (currentRoute === 'kds') {
        return (
          <KitchenDisplay
            tenant={tenant}
            staffName={staffUser.name}
            onBack={() => goTo('app', buildAppUrl('app'))}
          />
        );
      }
      if (currentRoute === 'floor') {
        return (
          <FloorPlanView
            tenant={tenant}
            staffName={staffUser.name}
            onBack={() => goTo('app', buildAppUrl('app'))}
            onOpenPos={() => goTo(businessType === 'retail' ? 'retail-terminal' : 'terminal')}
          />
        );
      }
      return (
        <InventoryView
          tenant={tenant}
          staffName={staffUser.name}
          onBack={() => goTo('app', buildAppUrl('app'))}
        />
      );
    }

    // Authenticated Home / Workspace Selector
    if (currentRoute === 'app' || currentRoute === 'home') {
      // Scoped per restaurant: a new tenant must not inherit the previous
      // tenant's "setup completed" flag on a shared device.
      const setupKey = staffUser?.restaurantId
        ? `manipos_setup_completed_${staffUser.restaurantId}`
        : 'manipos_setup_completed';
      const isSetupCompleted = localStorage.getItem(setupKey) === 'true';
      if (!isSetupCompleted) {
        return (
          <AdminDashboard 
            staffUser={staffUser}
            onOpenAppHome={() => setCurrentRoute('app')}
            onOpenModule={openModule}
            onSignOut={handleGlobalSignOut}
            tenantSlug={tenantInfo.tenantSlug} 
            tenantId={resolvedRestId}
          />
        );
      }

      return (
        <AuthenticatedHome
          restaurantName={tenant?.name || staffUser.restaurantName}
          tenantSlug={tenantInfo.tenantSlug}
          staffName={staffUser.name}
          staffRole={staffUser.role}
          onOpenDashboard={() => setCurrentRoute('dashboard')}
          onOpenPOS={() => setCurrentRoute(businessType === 'retail' ? 'retail-terminal' : 'terminal')}
          onOpenModule={openModule}
          onSignOut={handleGlobalSignOut}
        />
      );
    }

    // Admin Dashboard / Setup Checklist
    if (currentRoute === 'dashboard' || currentRoute === 'onboarding') {
      return (
        <AdminDashboard 
          staffUser={staffUser}
          onOpenAppHome={() => setCurrentRoute('app')}
          onOpenModule={openModule}
          onSignOut={handleGlobalSignOut}
          tenantSlug={tenantInfo.tenantSlug} 
          tenantId={resolvedRestId}
        />
      );
    }

    // Operational Live POS Register
    if (currentRoute === 'terminal') {
      if (storeStatus === 'pending' || trialExpired) {
        const storeName = staffUser.restaurantName || 'Your Store';
        return (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center font-sans">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-black">
                🔒
              </div>
              <div className="space-y-2">
                <span className="px-3 py-1 bg-amber-400/10 text-amber-400 text-xs font-bold rounded-full uppercase tracking-wider inline-block">
                  {trialExpired ? '14-Day Free Trial Ended' : 'Account Approval Required'}
                </span>
                <h2 className="text-2xl font-black text-white">{storeName} POS Locked</h2>
                <p className="text-slate-400 text-xs leading-relaxed">
                  {trialExpired
                    ? 'Your 14-day free trial has ended. Activate a paid subscription in Billing & Subscriptions to continue ringing POS & microsite orders.'
                    : 'Your store registration is complete! POS operational access requires account verification.'}
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left text-xs space-y-2 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Store Name:</span>
                  <span className="text-white font-bold">{storeName}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Approval Status:</span>
                  <span className="text-amber-400 font-bold uppercase">Pending Super Admin Review</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  onClick={() => setCurrentRoute('dashboard')}
                  className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs py-3.5 rounded-xl transition-all shadow-lg shadow-amber-400/10 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Management Dashboard (Configure Store) &rarr;</span>
                </button>
                <button
                  onClick={() => window.location.href = `mailto:support@manipos.com?subject=Approval Request for ${storeName}`}
                  className="w-full bg-slate-950 hover:bg-slate-800 text-slate-300 font-bold text-xs py-3 rounded-xl transition-all border border-slate-800 cursor-pointer"
                >
                  Contact ManiPOS Onboarding Team
                </button>
              </div>
            </div>
          </div>
        );
      }

      return (
        <AdminDashboard
          initialView="pos"
          staffUser={staffUser}
          onOpenAppHome={isAdmin ? () => setCurrentRoute('app') : null}
          onOpenModule={openModule}
          onSignOut={handleGlobalSignOut}
          tenantSlug={tenantInfo.tenantSlug}
          tenantId={resolvedRestId}
        />
      );
    }
  }

  // ROUTE 2: Unified Workspace / Staff Terminal Login (manipos.com/?page=login, pos.manipos.com, <tenant>.pos.manipos.com)
  if (currentRoute === 'terminal' || currentRoute === 'dashboard' || currentRoute === 'app' || currentRoute === 'onboarding' || OPERATIONAL_ROUTES.has(currentRoute) || POJ_PORTAL_ROUTES.has(currentRoute)) {
    const isNeutralLogout = (() => {
      try {
        const sp = new URLSearchParams(window.location.search);
        return sp.get('logout') === '1' || sp.get('neutral') === '1' || sessionStorage.getItem('manipos_neutral_login') === '1';
      } catch (_) {
        return false;
      }
    })();
    const loginTenantSlug = isNeutralLogout ? null : tenantInfo.tenantSlug;
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative font-sans">
        <button
          // A real navigation to the marketing site: pushing '/' used to show
          // the landing page while still on the tenant subdomain.
          onClick={() => { window.location.href = 'https://manipos.com/'; }}
          className="absolute top-6 left-6 text-xs font-bold text-slate-400 hover:text-white uppercase tracking-wider border border-slate-800 px-4 py-2 rounded-xl transition-colors cursor-pointer bg-slate-900/50 backdrop-blur-sm"
        >
          &larr; Back to ManiPOS Home
        </button>
        <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-block bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs px-3 py-1 rounded-full uppercase tracking-widest mb-3">
              {loginTenantSlug ? `${loginTenantSlug}.pos.manipos.com` : 'ManiPOS · Workspace'}
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Mani<span className="text-orange-500">POS</span></h2>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-1">Staff, Admin, CRM &amp; Operations Login</p>
          </div>
          <PinLogin 
            tenantSlug={loginTenantSlug}
            onLoginSuccess={async (userSession, userTenantSlug) => {
              try {
                sessionStorage.removeItem('manipos_neutral_login');
              } catch (_) {}
              const staffRole = userSession?.staffUser?.role;
              const targetRoute = isAdminAccount(userSession?.staffUser)
                ? 'app'
                : (ROLE_HOME_ROUTE[staffRole] || 'terminal');
              const staffWithSlug = {
                ...(userSession?.staffUser || {}),
                tenantSlug: userSession?.staffUser?.tenantSlug || userTenantSlug || tenantInfo.tenantSlug || '',
              };

              writeActivePortalCookie({
                tenantSlug: staffWithSlug.tenantSlug,
                restaurantName: tenant?.name || staffWithSlug.restaurantName,
                staffName: staffWithSlug.name,
                role: staffWithSlug.role,
                isAdmin: isAdminAccount(staffWithSlug),
              });
              broadcastAuthEvent('login', { staffUser: staffWithSlug });

              const redirected = await redirectToTenantPosIfGenericHost(staffWithSlug, targetRoute);
              if (redirected) return;

              setSession(userSession);
              setCurrentRoute(targetRoute);
            }} 
          />
        </div>
      </div>
    );
  }

  // ROUTE 3: Retail Marketing Portal (retail.manipos.com or ?mode=retail)
  if (currentRoute === 'retail-home' || tenantInfo.isRetailMarketingDomain) {
    return (
      <RetailLandingPage
        onProceedToLogin={(slug) => navigateToRetailLogin(slug)}
        onLaunchRetailDemo={() => setCurrentRoute('retail-terminal')}
        onSwitchToRestaurant={navigateToHome}
      />
    );
  }

  // ROUTE 4: Public Marketing / Product Landing Page (manipos.com)
  return (
    <LandingPage 
      onProceedToLogin={(slug) => navigateToLogin(slug)} 
      onSwitchToRetail={navigateToRetailHome}
      onBrowseRestaurants={() => goTo('restaurants', '/?page=restaurants')}
    />
  );
  };

  const activeStaff = session?.staffUser || (() => {
    try { return JSON.parse(localStorage.getItem('pin_staff_user') || '{}'); } catch { return {}; }
  })();
  const alarmRestaurantId =
    session &&
    !tenantInfo.isGuestMicrosite &&
    currentRoute !== 'microsite' &&
    currentRoute !== 'feedback' &&
    currentRoute !== 'links'
      ? (activeStaff?.restaurantId || activeStaff?.restaurant_id || tenant?.id || getTenantContext() || null)
      : null;

  return (
    <Suspense fallback={<RouteFallback />}>
      {alarmRestaurantId && (
        <IncomingOrderAlarmOverlay
          restaurantId={alarmRestaurantId}
          tenantSlug={tenant?.slug || activeStaff?.tenantSlug || tenantInfo?.slug || ''}
          staffName={activeStaff?.name || 'Staff'}
          staffRole={activeStaff?.role || 'cashier'}
        />
      )}
      {renderContent()}
    </Suspense>
  );
}

export default App;
