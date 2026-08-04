import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { PosTerminal } from './components/PosTerminal';
import { PinLogin } from './components/PinLogin';
import { LandingPage } from './components/LandingPage';
import { AdminDashboard } from './components/AdminDashboard';
import { MenuMicrosite } from './components/MenuMicrosite';
import { FeedbackForm } from './components/FeedbackForm';
import { getTenantInfo, getPosLoginUrl, getMarketingUrl } from './lib/tenant';


function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('terminal'); // 'terminal' or 'dashboard'
  const [tenantInfo, setTenantInfo] = useState(() => getTenantInfo());

  // Clean router supporting subdomain detection, subpaths, hashes, and search queries
  const [currentRoute, setCurrentRoute] = useState(() => {
    const info = getTenantInfo();
    if (info.isFeedbackDomain || window.location.pathname === '/feedback' || window.location.hash === '#/feedback') {
      return 'feedback';
    }
    if (info.isPosDomain || window.location.pathname === '/terminal' || window.location.hash === '#/terminal') {
      return 'terminal';
    }
    if (info.isGuestMicrosite || window.location.pathname === '/menu' || window.location.hash === '#/menu') {
      return 'microsite';
    }
    return 'home';
  });

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Listen to browser navigation changes
  useEffect(() => {
    const handleLocationChange = () => {
      const info = getTenantInfo();
      setTenantInfo(info);
      if (info.isFeedbackDomain || window.location.pathname === '/feedback' || window.location.hash === '#/feedback') {
        setCurrentRoute('feedback');
      } else if (info.isPosDomain || window.location.pathname === '/terminal' || window.location.hash === '#/terminal') {
        setCurrentRoute('terminal');
      } else if (info.isGuestMicrosite || window.location.pathname === '/menu' || window.location.hash === '#/menu') {
        setCurrentRoute('microsite');
      } else {
        setCurrentRoute('home');
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigateToLogin = (slug = null) => {
    const targetUrl = getPosLoginUrl(slug || tenantInfo.tenantSlug);
    // If we're on local dev or same domain, update state directly
    if (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1')) {
      const url = new URL(targetUrl);
      window.history.pushState({}, '', url.pathname + url.search + url.hash);
      setCurrentRoute('terminal');
      setTenantInfo(getTenantInfo());
    } else {
      window.location.href = targetUrl;
    }
  };

  const navigateToHome = () => {
    const targetUrl = getMarketingUrl();
    if (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1')) {
      window.history.pushState({}, '', '/');
      setCurrentRoute('home');
      setTenantInfo(getTenantInfo());
    } else {
      window.location.href = targetUrl;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  // ROUTE 0: Guest Feedback Form (e.g. potofjollof.manipos.com/feedback or manipos.com?page=feedback)
  if (currentRoute === 'feedback' || tenantInfo.isFeedbackDomain) {
    return <FeedbackForm />;
  }

  // ROUTE 1: Guest Digital Menu Microsite (e.g. potofjollof.manipos.com or manipos.com?page=menu)
  if (currentRoute === 'microsite' || tenantInfo.isGuestMicrosite) {
    return <MenuMicrosite onBack={navigateToHome} />;
  }



  // ROUTE 2: Standalone POS Terminal Software (pos.manipos.com or <tenant>.pos.manipos.com)
  if (currentRoute === 'terminal') {
    if (session) {
      const staffUser = session.staffUser || JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
      const isAdmin = staffUser.role === 'admin';

      const handleSignOut = async () => {
        await supabase.auth.signOut();
        localStorage.removeItem('pin_staff_user');
        setSession(null);
        setViewMode('terminal');
      };

      if (isAdmin && viewMode === 'dashboard') {
        return (
          <AdminDashboard onBackToTerminal={() => setViewMode('terminal')} tenantSlug={tenantInfo.tenantSlug} />
        );
      }

      return (
        <div className="min-h-screen bg-slate-50 relative">
          <PosTerminal 
            staffName={staffUser.name} 
            staffRole={staffUser.role} 
            onSignOut={handleSignOut} 
            tenantSlug={tenantInfo.tenantSlug}
          />
          {/* Floating Admin Switcher Button */}
          {isAdmin && (
            <button
              onClick={() => setViewMode('dashboard')}
              className="fixed bottom-6 right-6 bg-slate-900 text-white font-black text-xs uppercase tracking-wider py-3 px-5 rounded-2xl shadow-2xl hover:bg-orange-600 transition-all border border-slate-800 z-50 hover:-translate-y-0.5 cursor-pointer flex items-center gap-2"
            >
              <span>Owner Dashboard</span>
              <span>&rarr;</span>
            </button>
          )}
        </div>
      );
    }

    // Not logged in: Show the bright Toast-styled register terminal login page
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
              if (userTenantSlug && userTenantSlug !== tenantInfo.tenantSlug) {
                navigateToLogin(userTenantSlug);
              }
            }} 
          />
        </div>
      </div>
    );
  }

  // ROUTE 3: Public Marketing / Product Landing Page (Toast POS Styled)
  return <LandingPage onProceedToLogin={(slug) => navigateToLogin(slug)} />;
}

export default App;

