import React, { useState, useEffect } from 'react';
import { supabase, setTenantContext } from './lib/supabase';
import { PosTerminal } from './components/PosTerminal';
import { PinLogin } from './components/PinLogin';
import { LandingPage } from './components/LandingPage';
import { RetailLandingPage } from './components/RetailLandingPage';
import { RetailPosTerminal } from './components/RetailPosTerminal';
import { AdminDashboard } from './components/AdminDashboard';
import { MenuMicrosite } from './components/MenuMicrosite';
import { UberEatsMicrosite } from './components/UberEatsMicrosite';
import { FeedbackForm } from './components/FeedbackForm';
import { RestaurantLinkHub } from './components/RestaurantLinkHub';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { AuthenticatedHome } from './components/AuthenticatedHome';
import { KitchenDisplay } from './components/KitchenDisplay';
import { FloorPlanView } from './components/FloorPlanView';
import { InventoryView } from './components/InventoryView';
import { RestaurantDirectory } from './components/RestaurantDirectory';
import { StatusPage, LegalPage } from './components/PublicPages';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { MenuBuilder } from './components/MenuBuilder';
import {
  getTenantInfo,
  getPosLoginUrl,
  getRetailPosLoginUrl,
} from './lib/tenant';
import { loadTenant, getActiveTenantSlug, getMicrositeUrl } from './lib/tenantConfig';
import { can } from './lib/permissions';

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
  return 'home';
}

const OPERATIONAL_ROUTES = new Set(['kds', 'floor', 'inventory']);

function App() {
  const [session, setSession] = useState(() => {
    try {
      // 1. Check URL hash/query for session transferred from pos.manipos.com login
      if (typeof window !== 'undefined') {
        const hash = window.location.hash || '';
        const params = new URLSearchParams(window.location.search);
        let sessionParam = params.get('session');
        if (!sessionParam && hash.includes('session=')) {
          const match = hash.match(/session=([^&]+)/);
          if (match) sessionParam = decodeURIComponent(match[1]);
        }
        if (sessionParam) {
          try {
            const parsed = JSON.parse(decodeURIComponent(escape(atob(sessionParam))));
            if (parsed && (parsed.staffUser || parsed.id || parsed.role)) {
              const staffUser = parsed.staffUser || parsed;
              localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
              if (staffUser.restaurantId || staffUser.restaurant_id) {
                setTenantContext(staffUser.restaurantId || staffUser.restaurant_id);
              }
              if (parsed.supabaseSession?.access_token && parsed.supabaseSession?.refresh_token) {
                sessionStorage.setItem('manipos_pending_supa_session', JSON.stringify(parsed.supabaseSession));
              }
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
  const [businessType, setBusinessType] = useState('restaurant');
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Load tenant configuration (DB first, static registry fallback).
  useEffect(() => {
    let cancelled = false;
    const slug = getActiveTenantSlug() || tenantInfo.tenantSlug || session?.staffUser?.tenantSlug || null;
    if (!slug) {
      setTenant(null);
      setTenantContext(null);
      setTenantLoading(false);
      return undefined;
    }
    setTenantLoading(true);
    loadTenant(slug).then((resolved) => {
      if (!cancelled) {
        setTenant(resolved);
        setTenantContext(resolved?.id || null);
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

        let query = supabase.from('restaurants').select('id, name, slug, status, is_active, business_type');
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

        const activeStatus = (data.is_active === false) ? 'suspended' : (data.status || 'pending');
        setStoreStatus(activeStatus);
        if (data.business_type) {
          setBusinessType(data.business_type);
        }

        // SERVER-SIDE APPROVAL GUARD: Revoke session immediately if store is not approved or is inactive
        if (activeStatus !== 'approved') {
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

  // Redirect generic pos.manipos.com sessions to the tenant's own <slug>.pos.manipos.com domain
  const redirectToTenantPosIfGenericHost = async (staffUser, explicitRoute = null) => {
    if (typeof window === 'undefined' || !staffUser) return false;
    if (window.location.hostname !== 'pos.manipos.com') return false;

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

    const updatedStaffUser = { ...staffUser, tenantSlug: slug };
    const transferPayload = { staffUser: updatedStaffUser };

    try {
      const { data: { session: supaSess } } = await supabase.auth.getSession();
      if (supaSess?.access_token && supaSess?.refresh_token) {
        transferPayload.supabaseSession = {
          access_token: supaSess.access_token,
          refresh_token: supaSess.refresh_token,
        };
      }
    } catch (_) {}

    const encodedSession = btoa(unescape(encodeURIComponent(JSON.stringify(transferPayload))));
    const search = explicitRoute
      ? `?page=${encodeURIComponent(explicitRoute)}`
      : (window.location.search || '');
    const targetPath = window.location.pathname && window.location.pathname !== '/' ? window.location.pathname : '/';
    window.location.replace(`https://${slug}.pos.manipos.com${targetPath}${search}#session=${encodeURIComponent(encodedSession)}`);
    return true;
  };

  useEffect(() => {
    if (session?.staffUser) {
      redirectToTenantPosIfGenericHost(session.staffUser);
    }
  }, [session?.staffUser]);

  useEffect(() => {
    // Safety timer: guarantee loading spinner dismisses within 500ms
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    // Restore transferred Supabase Auth session if arriving from pos.manipos.com redirect
    const restoreOrGetSession = async () => {
      try {
        const pendingRaw = sessionStorage.getItem('manipos_pending_supa_session');
        if (pendingRaw) {
          sessionStorage.removeItem('manipos_pending_supa_session');
          const pending = JSON.parse(pendingRaw);
          if (pending?.access_token && pending?.refresh_token) {
            const { data } = await supabase.auth.setSession(pending);
            if (data?.session) {
              setSession(prev => ({ ...prev, ...data.session }));
              setTenantContext(data.session.user?.app_metadata?.tenant_id || null);
              setLoading(false);
              return;
            }
          }
        }
      } catch (_) {}

      try {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (activeSession) {
          setSession(prev => ({ ...prev, ...activeSession }));
          setTenantContext(activeSession.user?.app_metadata?.tenant_id || null);
        }
      } catch (_) {}
      setLoading(false);
    };

    restoreOrGetSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, activeSession) => {
      if (activeSession) {
        setSession(prev => ({ ...prev, ...activeSession }));
        setTenantContext(activeSession.user?.app_metadata?.tenant_id || null);
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

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

  const openModule = (page) => goTo(page, `/?page=${page}`);

  const openMicrosite = (slug) => {
    const url = getMicrositeUrl(slug);
    if (url.startsWith('/')) {
      goTo('microsite', url);
    } else {
      window.location.href = url;
    }
  };

  const handleGlobalSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    setTenantContext(null);
    localStorage.removeItem('pin_staff_user');
    localStorage.removeItem('manipos_selected_brand');
    setSession(null);
    setCurrentRoute('home');

    // Leave via a real navigation (replace, not push) so the signed-in screens
    // stay out of the browser history. Pushing '/' used to land on the
    // marketing page while still on the tenant subdomain, and the browser Back
    // button then bounced back into the session.
    const slug = tenantInfo?.tenantSlug;
    const loginUrl = slug
      ? `https://${slug}.pos.manipos.com/`
      : 'https://pos.manipos.com/';
    window.location.replace(loginUrl);
  };

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

  // ROUTE 0.65: Menu builder (categories, items, images, microsite visibility)
  // Staff-only: without this guard anonymous visitors can render the admin UI
  // (RLS blocks the data, but the screen should not be reachable at all).
  if (currentRoute === 'menu-builder') {
    const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    const menuRestaurantId =
      session?.staffUser?.restaurantId || pinUser?.restaurantId || pinUser?.restaurant_id;

    if (!menuRestaurantId) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-sm text-center shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">Sign in required</h1>
            <p className="text-sm text-slate-600 mt-2">
              The menu builder is only available to signed-in staff.
            </p>
            <button
              type="button"
              onClick={() => navigateToLogin(tenantInfo.tenantSlug)}
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>
      );
    }

    return (
      <MenuBuilder
        restaurantId={menuRestaurantId}
        onBack={() => goTo('app', '/?page=app')}
      />
    );
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
    // Dashboard access is a permission, not a hard-coded role pair.
    const isAdmin = can('view_dashboard', staffUser);

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

    // RBAC Security Check: Cashier attempting dashboard / app selector is redirected to terminal
    if (!isAdmin && (currentRoute === 'dashboard' || currentRoute === 'app' || currentRoute === 'onboarding')) {
      return (
        <div className="min-h-screen bg-slate-50 relative">
          <PosTerminal
            staffName={staffUser.name}
            staffRole={staffUser.role}
            onSignOut={handleGlobalSignOut}
            onBack={isAdmin ? () => setCurrentRoute('app') : null}
            tenantSlug={tenantInfo.tenantSlug}
          />
        </div>
      );
    }

    // Operational modules: Kitchen Display, Floor & Reservations, Inventory & Recipes
    if (OPERATIONAL_ROUTES.has(currentRoute)) {
      if (!isAdmin) {
        return (
          <div className="min-h-screen bg-slate-50 relative">
            <PosTerminal 
              staffName={staffUser.name} 
              staffRole={staffUser.role} 
              onSignOut={handleGlobalSignOut}
            onBack={isAdmin ? () => setCurrentRoute('app') : null} 
              tenantSlug={tenantInfo.tenantSlug}
            />
          </div>
        );
      }
      if (currentRoute === 'kds') {
        return (
          <KitchenDisplay
            tenant={tenant}
            staffName={staffUser.name}
            onBack={() => goTo('app', '/?page=app')}
          />
        );
      }
      if (currentRoute === 'floor') {
        return (
          <FloorPlanView
            tenant={tenant}
            staffName={staffUser.name}
            onBack={() => goTo('app', '/?page=app')}
            onOpenPos={() => goTo(businessType === 'retail' ? 'retail-terminal' : 'terminal')}
          />
        );
      }
      return (
        <InventoryView
          tenant={tenant}
          staffName={staffUser.name}
          onBack={() => goTo('app', '/?page=app')}
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
            onBackToTerminal={() => setCurrentRoute(businessType === 'retail' ? 'retail-terminal' : 'terminal')}
            onOpenAppHome={() => setCurrentRoute('app')}
            onOpenModule={openModule}
            onSignOut={handleGlobalSignOut}
            tenantSlug={tenantInfo.tenantSlug} 
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
          onBackToTerminal={() => setCurrentRoute(businessType === 'retail' ? 'retail-terminal' : 'terminal')}
          onOpenAppHome={() => setCurrentRoute('app')}
          onOpenModule={openModule}
          onSignOut={handleGlobalSignOut}
          tenantSlug={tenantInfo.tenantSlug} 
        />
      );
    }

    // Operational Live POS Register
    if (currentRoute === 'terminal') {
      if (storeStatus === 'pending') {
        const storeName = staffUser.restaurantName || 'Your Store';
        return (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center font-sans">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mx-auto text-2xl font-black">
                🔒
              </div>
              <div className="space-y-2">
                <span className="px-3 py-1 bg-amber-400/10 text-amber-400 text-xs font-bold rounded-full uppercase tracking-wider inline-block">
                  Super Admin Approval Required
                </span>
                <h2 className="text-2xl font-black text-white">{storeName} POS Locked</h2>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Your store registration is complete! As a multi-tenant SaaS safety policy, POS operational access requires approval by a ManiPOS Super Admin.
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
        <div className="min-h-screen bg-slate-50 relative">
          <PosTerminal 
            staffName={staffUser.name} 
            staffRole={staffUser.role} 
            onSignOut={handleGlobalSignOut}
            onBack={isAdmin ? () => setCurrentRoute('app') : null} 
            onOpenDashboard={isAdmin ? () => setCurrentRoute('dashboard') : null}
            onOpenAppHome={() => setCurrentRoute('app')}
            tenantSlug={tenantInfo.tenantSlug}
          />
        </div>
      );
    }
  }

  // ROUTE 2: Standalone POS Terminal Login (pos.manipos.com or <tenant>.pos.manipos.com)
  if (currentRoute === 'terminal' || currentRoute === 'dashboard' || currentRoute === 'app' || currentRoute === 'onboarding' || OPERATIONAL_ROUTES.has(currentRoute)) {
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
              {tenantInfo.tenantSlug ? `${tenantInfo.tenantSlug}.pos.manipos.com` : 'pos.manipos.com'}
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">Mani<span className="text-orange-500">POS</span></h2>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mt-1">Staff Terminal Login</p>
          </div>
          <PinLogin 
            tenantSlug={tenantInfo.tenantSlug}
            onLoginSuccess={async (userSession, userTenantSlug) => {
              const staffRole = userSession?.staffUser?.role;
              const targetRoute = (staffRole === 'admin' || staffRole === 'manager') ? 'app' : 'terminal';
              const staffWithSlug = {
                ...(userSession?.staffUser || {}),
                tenantSlug: userSession?.staffUser?.tenantSlug || userTenantSlug || '',
              };

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
}

export default App;
