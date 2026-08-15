import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { PosTerminal } from './components/PosTerminal';
import { PinLogin } from './components/PinLogin';
import { LandingPage } from './components/LandingPage';
import { AdminDashboard } from './components/AdminDashboard';
import { MenuMicrosite } from './components/MenuMicrosite';
import { FeedbackForm } from './components/FeedbackForm';
import { RestaurantLinkHub } from './components/RestaurantLinkHub';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { AuthenticatedHome } from './components/AuthenticatedHome';
import { getTenantInfo, getPosLoginUrl, getMarketingUrl } from './lib/tenant';

function App() {
  const [session, setSession] = useState(() => {
    try {
      const stored = localStorage.getItem('pin_staff_user');
      return stored ? { staffUser: JSON.parse(stored) } : null;
    } catch (e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [tenantInfo, setTenantInfo] = useState(() => getTenantInfo());

  // Clean router supporting subdomain detection, subpaths, hashes, and search queries
  const [currentRoute, setCurrentRoute] = useState(() => {
    const info = getTenantInfo();
    const queryPage = new URLSearchParams(window.location.search).get('page');
    if (queryPage === 'superadmin' || window.location.pathname === '/superadmin' || window.location.hash === '#/superadmin') {
      return 'superadmin';
    }
    if (queryPage === 'app' || window.location.pathname === '/app' || window.location.hash === '#/app') {
      return 'app';
    }
    if (queryPage === 'onboarding' || window.location.hash === '#/onboarding') {
      return 'onboarding';
    }
    if (queryPage === 'dashboard' || window.location.pathname === '/dashboard' || window.location.hash === '#/dashboard') {
      return 'dashboard';
    }
    if (info.isFeedbackDomain || window.location.pathname === '/feedback' || window.location.hash === '#/feedback' || queryPage === 'feedback') {
      return 'feedback';
    }
    if (info.isPosDomain || window.location.pathname === '/terminal' || window.location.hash === '#/terminal' || window.location.hash === '#/pos' || queryPage === 'pos' || queryPage === 'terminal') {
      return 'terminal';
    }
    if (info.isGuestMicrosite || window.location.pathname === '/menu' || window.location.hash === '#/menu' || queryPage === 'menu') {
      return 'microsite';
    }
    return 'home';
  });

  const [storeStatus, setStoreStatus] = useState('approved');

  useEffect(() => {
    const fetchStoreStatus = async () => {
      try {
        const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
        const storeSlug = tenantInfo.tenantSlug || pinUser.tenantSlug;
        const storeId = pinUser.restaurantId || pinUser.restaurant_id;

        if (!storeSlug && !storeId) return;

        let query = supabase.from('restaurants').select('status, is_active');
        if (storeId) {
          query = query.eq('id', storeId);
        } else {
          query = query.eq('slug', storeSlug);
        }
        const { data } = await query.maybeSingle();
        if (data && data.status) {
          setStoreStatus(data.status);
        }
      } catch (e) {
        console.warn('Store status check notice:', e);
      }
    };

    fetchStoreStatus();
  }, [tenantInfo.tenantSlug, currentRoute]);

  useEffect(() => {
    // Safety timer: guarantee loading spinner dismisses within 500ms
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    // Check initial session
    supabase.auth.getSession().then(({ data: { session: activeSession } }) => {
      if (activeSession) {
        setSession(prev => ({ ...prev, ...activeSession }));
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, activeSession) => {
      if (activeSession) {
        setSession(prev => ({ ...prev, ...activeSession }));
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  // Listen to browser navigation changes
  useEffect(() => {
    const handleLocationChange = () => {
      const info = getTenantInfo();
      const queryPage = new URLSearchParams(window.location.search).get('page');
      setTenantInfo(info);
      if (queryPage === 'superadmin' || window.location.pathname === '/superadmin' || window.location.hash === '#/superadmin') {
        setCurrentRoute('superadmin');
      } else if (queryPage === 'app' || window.location.pathname === '/app' || window.location.hash === '#/app') {
        setCurrentRoute('app');
      } else if (queryPage === 'onboarding' || window.location.hash === '#/onboarding') {
        setCurrentRoute('onboarding');
      } else if (queryPage === 'dashboard' || window.location.pathname === '/dashboard' || window.location.hash === '#/dashboard') {
        setCurrentRoute('dashboard');
      } else if (info.isFeedbackDomain || window.location.pathname === '/feedback' || window.location.hash === '#/feedback' || queryPage === 'feedback') {
        setCurrentRoute('feedback');
      } else if (info.isPosDomain || window.location.pathname === '/terminal' || window.location.hash === '#/terminal' || window.location.hash === '#/pos' || queryPage === 'pos' || queryPage === 'terminal') {
        setCurrentRoute('terminal');
      } else if (info.isGuestMicrosite || window.location.pathname === '/menu' || window.location.hash === '#/menu' || queryPage === 'menu') {
        setCurrentRoute('microsite');
      } else {
        setCurrentRoute('home');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigateToHome = () => {
    setCurrentRoute('home');
    window.history.pushState({}, '', '/');
  };

  const navigateToLogin = (slug = null) => {
    const url = getPosLoginUrl(slug);
    window.location.href = url;
  };

  const handleGlobalSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    localStorage.removeItem('pin_staff_user');
    localStorage.removeItem('manipos_selected_brand');
    setSession(null);
    setCurrentRoute('home');
    window.history.pushState({}, '', '/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500"></div>
      </div>
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

  // ROUTE 1: Guest Digital Menu Microsite (e.g. potofjollof.manipos.com or manipos.com?page=menu)
  if (currentRoute === 'microsite' || tenantInfo.isGuestMicrosite) {
    return <MenuMicrosite onBack={navigateToHome} />;
  }

  // AUTHENTICATED SESSION ROUTING ENGINE
  if (session) {
    const staffUser = session.staffUser || JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    const isAdmin = staffUser.role === 'admin' || staffUser.role === 'manager';

    // RBAC Security Check: Cashier attempting dashboard / app selector is redirected to terminal
    if (!isAdmin && (currentRoute === 'dashboard' || currentRoute === 'app' || currentRoute === 'onboarding')) {
      return (
        <div className="min-h-screen bg-slate-50 relative">
          <PosTerminal 
            staffName={staffUser.name} 
            staffRole={staffUser.role} 
            onSignOut={handleGlobalSignOut} 
            tenantSlug={tenantInfo.tenantSlug}
          />
        </div>
      );
    }

    // Authenticated Home / Workspace Selector
    if (currentRoute === 'app' || currentRoute === 'home') {
      const isSetupCompleted = localStorage.getItem('manipos_setup_completed') === 'true';
      if (!isSetupCompleted) {
        return (
          <AdminDashboard 
            onBackToTerminal={() => setCurrentRoute('terminal')}
            onOpenAppHome={() => setCurrentRoute('app')}
            onSignOut={handleGlobalSignOut}
            tenantSlug={tenantInfo.tenantSlug} 
          />
        );
      }

      return (
        <AuthenticatedHome
          restaurantName={staffUser.restaurantName}
          tenantSlug={tenantInfo.tenantSlug}
          staffName={staffUser.name}
          onOpenDashboard={() => setCurrentRoute('dashboard')}
          onOpenPOS={() => setCurrentRoute('terminal')}
          onSignOut={handleGlobalSignOut}
        />
      );
    }

    // Admin Dashboard / Setup Checklist
    if (currentRoute === 'dashboard' || currentRoute === 'onboarding') {
      return (
        <AdminDashboard 
          onBackToTerminal={() => setCurrentRoute('terminal')}
          onOpenAppHome={() => setCurrentRoute('app')}
          onSignOut={handleGlobalSignOut}
          tenantSlug={tenantInfo.tenantSlug} 
        />
      );
    }

    // Operational Live POS Register
    if (currentRoute === 'terminal') {
      if (storeStatus === 'pending') {
        const storeName = staffUser.restaurantName || 'Your Restaurant';
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
                  Your restaurant registration is complete! As a multi-tenant SaaS safety policy, POS operational access requires approval by a ManiPOS Super Admin.
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
            onOpenDashboard={isAdmin ? () => setCurrentRoute('dashboard') : null}
            onOpenAppHome={isAdmin ? () => setCurrentRoute('app') : null}
            tenantSlug={tenantInfo.tenantSlug}
          />
        </div>
      );
    }
  }

  // ROUTE 2: Standalone POS Terminal Login (pos.manipos.com or <tenant>.pos.manipos.com)
  if (currentRoute === 'terminal' || currentRoute === 'dashboard' || currentRoute === 'app' || currentRoute === 'onboarding') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative font-sans">
        <button
          onClick={navigateToHome}
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
            onLoginSuccess={(userSession, userTenantSlug) => {
              setSession(userSession);
              const staffRole = userSession?.staffUser?.role;
              if (staffRole === 'admin' || staffRole === 'manager') {
                setCurrentRoute('app');
              } else {
                setCurrentRoute('terminal');
              }
              if (userTenantSlug && userTenantSlug !== tenantInfo.tenantSlug) {
                navigateToLogin(userTenantSlug);
              }
            }} 
          />
        </div>
      </div>
    );
  }

  // ROUTE 3: Public Marketing / Product Landing Page
  return <LandingPage onProceedToLogin={(slug) => navigateToLogin(slug)} />;
}

export default App;
