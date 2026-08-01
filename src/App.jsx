import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { PosTerminal } from './components/PosTerminal';
import { PinLogin } from './components/PinLogin';
import { LandingPage } from './components/LandingPage';
import { AdminDashboard } from './components/AdminDashboard';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('terminal'); // 'terminal' or 'dashboard'
  
  // Clean router supporting subpaths, hashes, and search queries
  const [currentRoute, setCurrentRoute] = useState(() => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    
    if (path === '/terminal' || hash === '#/terminal' || searchParams.get('page') === 'terminal') {
      return 'terminal';
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
      const path = window.location.pathname;
      const hash = window.location.hash;
      const searchParams = new URLSearchParams(window.location.search);
      
      if (path === '/terminal' || hash === '#/terminal' || searchParams.get('page') === 'terminal') {
        setCurrentRoute('terminal');
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

  const navigateTo = (route) => {
    if (route === 'terminal') {
      window.history.pushState({}, '', '/terminal');
      setCurrentRoute('terminal');
    } else {
      window.history.pushState({}, '', '/');
      setCurrentRoute('home');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // ROUTE 1: Standalone POS Terminal Software
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
          <AdminDashboard onBackToTerminal={() => setViewMode('terminal')} />
        );
      }

      return (
        <div className="min-h-screen bg-gray-50 relative">
          <PosTerminal 
            staffName={staffUser.name} 
            staffRole={staffUser.role} 
            onSignOut={handleSignOut} 
          />
          {/* Floating Admin Switcher Button */}
          {isAdmin && (
            <button
              onClick={() => setViewMode('dashboard')}
              className="fixed bottom-6 right-6 bg-slate-900 text-white font-black text-xs uppercase tracking-wider py-3 px-5 rounded-2xl shadow-xl hover:bg-black transition-all border border-slate-800 z-50 hover:-translate-y-0.5 cursor-pointer"
            >
              Owner Dashboard &rarr;
            </button>
          )}
        </div>
      );
    }

    // Not logged in: Show the clean full-screen register terminal login page
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 relative font-sans">
        {/* Subtle return link for admin convenience */}
        <button
          onClick={() => navigateTo('home')}
          className="absolute top-6 left-6 text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-wider border border-zinc-800 px-3 py-1.5 rounded transition-colors cursor-pointer"
        >
          &larr; Public Site
        </button>
        <div className="w-full max-w-md bg-zinc-950 p-8 rounded border border-zinc-900 shadow-2xl">
          <div className="text-center mb-6">
            <h2 className="text-lg font-black tracking-wider text-white uppercase">ManiPOS</h2>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Terminal Login</p>
          </div>
          <PinLogin onLoginSuccess={(userSession) => setSession(userSession)} />
        </div>
      </div>
    );
  }

  // ROUTE 2: Public Marketing / Product Landing Page
  return <LandingPage onProceedToLogin={() => navigateTo('terminal')} />;
}

export default App;
