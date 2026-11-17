import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { provisionTenant } from '../services/tenantProvisioning';
import {
  Building2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Plus,
  Search,
  Loader2,
  TrendingUp,
  RefreshCw,
  Lock,
  Bell,
  ExternalLink,
  KeyRound,
  Mail,
  Phone,
  LogOut,
  X,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';

function formatKes(value) {
  return `KES ${Math.round(Number(value || 0)).toLocaleString()}`;
}

function formatRelative(iso) {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function SuperAdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authMode, setAuthMode] = useState('email'); // 'email' | 'passcode'
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState('restaurants'); // 'restaurants' | 'signups'
  const [restaurants, setRestaurants] = useState([]);
  const [signupEvents, setSignupEvents] = useState([]);
  const [metrics, setMetrics] = useState({
    orders_count: 0,
    total_revenue: 0,
    total_restaurants: 0,
    pending_count: 0,
    trial_count: 0,
    approved_count: 0,
    deactivated_count: 0,
    signups_today: 0,
    signups_7d: 0,
    unacknowledged_signups: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPlan, setFilterPlan] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [liveToast, setLiveToast] = useState(null);

  // Manage drawer state
  const [selectedStore, setSelectedStore] = useState(null);
  const [editPlan, setEditPlan] = useState('growth');
  const [editSubStatus, setEditSubStatus] = useState('trialing');
  const [editStatus, setEditStatus] = useState('approved');
  const [editActive, setEditActive] = useState(true);
  const [newOwnerPin, setNewOwnerPin] = useState('');
  const [savingDrawer, setSavingDrawer] = useState(false);

  // Create restaurant modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    slug: '',
    managerName: '',
    email: '',
    phone: '',
    password: '',
    plan: 'growth',
    businessType: 'restaurant',
  });
  const [createError, setCreateError] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  // Security passcode modal
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [newMasterPasscode, setNewMasterPasscode] = useState('');
  const [passcodeSaveMsg, setPasscodeSaveMsg] = useState('');

  const fetchPlatformData = useCallback(async () => {
    setLoading(true);
    try {
      const rpcArgs = { p_passcode: passcode || null };
      const [storesRes, metricsRes, signupsRes] = await Promise.all([
        supabase.rpc('admin_list_restaurants', rpcArgs),
        supabase.rpc('admin_platform_metrics', rpcArgs),
        supabase.rpc('admin_list_signup_events', { ...rpcArgs, p_limit: 50 }),
      ]);

      if (storesRes.error) throw storesRes.error;
      setRestaurants(Array.isArray(storesRes.data) ? storesRes.data : []);

      if (!metricsRes.error && metricsRes.data) {
        setMetrics((prev) => ({ ...prev, ...metricsRes.data }));
      }
      if (!signupsRes.error && Array.isArray(signupsRes.data)) {
        setSignupEvents(signupsRes.data);
      }
    } catch (err) {
      console.error('[SuperAdmin] Error fetching platform data:', err);
      setAuthError(err?.message || 'Unable to load platform data.');
    } finally {
      setLoading(false);
    }
  }, [passcode]);

  // Check if already signed in as an authorized platform owner on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          const { data: ok } = await supabase.rpc('admin_is_authorized', { p_passcode: null });
          if (active && ok) {
            setAuthenticated(true);
          }
        }
      } catch (_) {
        // Ignore and show login screen
      } finally {
        if (active) setCheckingSession(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    fetchPlatformData();
  }, [authenticated, fetchPlatformData]);

  // Live Realtime subscription for new restaurant signups
  useEffect(() => {
    if (!authenticated) return;
    const channel = supabase
      .channel('platform-owner-signups')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'platform_signup_events' },
        (payload) => {
          const row = payload?.new;
          if (!row) return;
          setLiveToast(`New restaurant signed up: ${row.restaurant_name} (${row.restaurant_slug})`);
          fetchPlatformData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authenticated, fetchPlatformData]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      if (authMode === 'email') {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: ownerEmail.trim().toLowerCase(),
          password: ownerPassword,
        });
        if (signInErr) throw signInErr;
        const { data: ok, error: authRpcErr } = await supabase.rpc('admin_is_authorized', { p_passcode: null });
        if (authRpcErr || !ok) {
          await supabase.auth.signOut();
          throw new Error('This account is not on the ManiPOS platform owner allow-list.');
        }
        setAuthenticated(true);
      } else {
        const { data: valid, error: rpcErr } = await supabase.rpc('admin_verify_passcode', {
          p_passcode: passcode,
        });
        if (rpcErr || !valid) {
          throw new Error('Invalid Master Passcode.');
        }
        setAuthenticated(true);
      }
    } catch (err) {
      setAuthError(err?.message || 'Sign in failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut().catch(() => {});
    setAuthenticated(false);
    setPasscode('');
    setOwnerPassword('');
  };

  const handleUpdateStatus = async (restaurantId, newStatus, isActive) => {
    setActionLoadingId(restaurantId);
    try {
      const { data, error } = await supabase.rpc('admin_update_restaurant_status', {
        p_restaurant_id: restaurantId,
        p_status: newStatus,
        p_is_active: isActive,
        p_passcode: passcode || null,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Update failed.');
      await fetchPlatformData();
    } catch (err) {
      alert('Error updating status: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExtendTrial = async (restaurantId, daysToAdd = 14) => {
    setActionLoadingId(restaurantId);
    try {
      const { data, error } = await supabase.rpc('admin_extend_trial', {
        p_restaurant_id: restaurantId,
        p_days: daysToAdd,
        p_passcode: passcode || null,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Could not extend trial.');
      await fetchPlatformData();
      alert(`Trial extended by ${daysToAdd} days!`);
    } catch (err) {
      alert('Error extending trial: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcknowledgeSignups = async (eventIds = null) => {
    try {
      const { error } = await supabase.rpc('admin_acknowledge_signups', {
        p_event_ids: eventIds,
        p_passcode: passcode || null,
      });
      if (error) throw error;
      await fetchPlatformData();
    } catch (err) {
      alert('Could not mark signups reviewed: ' + err.message);
    }
  };

  const openManageDrawer = (store) => {
    setSelectedStore(store);
    setEditPlan(store.plan || 'growth');
    setEditSubStatus(store.subscription_status || 'trialing');
    setEditStatus(store.status || (store.is_active === false ? 'deactivated' : 'approved'));
    setEditActive(store.is_active !== false);
    setNewOwnerPin('');
  };

  const handleSaveDrawer = async (e) => {
    e.preventDefault();
    if (!selectedStore) return;
    setSavingDrawer(true);
    try {
      const { data, error } = await supabase.rpc('admin_update_restaurant_account', {
        p_restaurant_id: selectedStore.id,
        p_status: editStatus,
        p_is_active: editActive,
        p_plan: editPlan,
        p_subscription_status: editSubStatus,
        p_passcode: passcode || null,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Update failed.');

      if (newOwnerPin.trim()) {
        const { data: pinData, error: pinErr } = await supabase.rpc('admin_reset_owner_pin', {
          p_restaurant_id: selectedStore.id,
          p_new_pin: newOwnerPin.trim(),
          p_passcode: passcode || null,
        });
        if (pinErr) throw pinErr;
        if (pinData?.success === false) throw new Error(pinData.error || 'PIN reset failed.');
      }

      setSelectedStore(null);
      await fetchPlatformData();
    } catch (err) {
      alert('Failed to update restaurant account: ' + err.message);
    } finally {
      setSavingDrawer(false);
    }
  };

  const handleCreateRestaurant = async (e) => {
    e.preventDefault();
    setCreateError('');
    setCreateSaving(true);
    try {
      const result = await provisionTenant({
        name: createForm.name.trim(),
        slug: createForm.slug.trim(),
        managerName: createForm.managerName.trim() || 'Store Owner',
        email: createForm.email.trim(),
        phone: createForm.phone.trim(),
        password: createForm.password,
        plan: createForm.plan,
        businessType: createForm.businessType,
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Could not create restaurant account.');
      }
      setCreateOpen(false);
      setCreateForm({
        name: '',
        slug: '',
        managerName: '',
        email: '',
        phone: '',
        password: '',
        plan: 'growth',
        businessType: 'restaurant',
      });
      await fetchPlatformData();
    } catch (err) {
      setCreateError(err?.message || 'Provisioning failed.');
    } finally {
      setCreateSaving(false);
    }
  };

  const handleUpdateMasterPasscode = async (e) => {
    e.preventDefault();
    setPasscodeSaveMsg('');
    try {
      const { data, error } = await supabase.rpc('admin_set_passcode', {
        p_new_passcode: newMasterPasscode,
        p_current_passcode: passcode || null,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Failed to update passcode.');
      setPasscode(newMasterPasscode.trim());
      setNewMasterPasscode('');
      setPasscodeSaveMsg('Master passcode updated successfully.');
    } catch (err) {
      setPasscodeSaveMsg(err?.message || 'Error updating passcode.');
    }
  };

  const filteredStores = restaurants.filter((r) => {
    const status = r.is_active === false ? 'deactivated' : (r.status || 'approved');
    const matchesStatus = filterStatus === 'ALL' || status === filterStatus;
    const matchesPlan = filterPlan === 'ALL' || (r.plan || 'growth') === filterPlan;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      (r.name || '').toLowerCase().includes(q) ||
      (r.slug || '').toLowerCase().includes(q) ||
      (r.owner?.email || '').toLowerCase().includes(q) ||
      (r.settings?.phone || '').toLowerCase().includes(q);
    return matchesStatus && matchesPlan && matchesSearch;
  });

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-amber-500" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-950">
        <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md w-full space-y-6 shadow-xl">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-amber-400 text-slate-950 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 uppercase">ManiPOS Owner Console</h2>
            <p className="text-slate-500 text-xs font-semibold">Manage onboarded restaurants &amp; live signups</p>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => { setAuthMode('email'); setAuthError(''); }}
              className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                authMode === 'email' ? 'bg-slate-950 text-amber-400 shadow-sm' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Owner Email
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('passcode'); setAuthError(''); }}
              className={`py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                authMode === 'passcode' ? 'bg-slate-950 text-amber-400 shadow-sm' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Master Passcode
            </button>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {authMode === 'email' ? (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Owner Email</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3.5 text-slate-400"><Mail size={16} /></span>
                    <input
                      type="email"
                      required
                      placeholder="owner@manipos.com"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-950 focus:border-amber-400 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Password</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3.5 text-slate-400"><Lock size={16} /></span>
                    <input
                      type="password"
                      required
                      placeholder="Enter your password"
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-950 focus:border-amber-400 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Master Passcode</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-slate-400"><KeyRound size={16} /></span>
                  <input
                    type="password"
                    required
                    placeholder="Enter platform passcode..."
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-950 focus:border-amber-400 focus:bg-white focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {authError && <p className="text-xs text-red-600 font-semibold">{authError}</p>}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full bg-amber-400 text-slate-950 font-black py-3.5 rounded-xl hover:bg-amber-300 transition-all text-sm uppercase tracking-wider shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {authSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              Sign In to Owner Console
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col font-sans">
      {/* Live signup toast */}
      {liveToast && (
        <div className="bg-slate-950 text-white px-6 py-3 flex items-center justify-between text-xs font-bold border-b border-amber-400/40">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-amber-400" />
            <span>{liveToast}</span>
          </div>
          <button onClick={() => setLiveToast(null)} className="text-slate-400 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-400 text-slate-950 flex items-center justify-center rounded-xl font-black text-lg shadow-sm">
            M
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-950 uppercase">ManiPOS Owner Backend</h1>
            <p className="text-slate-500 text-xs font-semibold">Onboarded Restaurants &amp; Live Signup Feed</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('signups')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border transition-all ${
              metrics.unacknowledged_signups > 0
                ? 'bg-amber-400 border-amber-400 text-slate-950 shadow-sm'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            <Bell size={14} />
            New Signups
            {metrics.unacknowledged_signups > 0 && (
              <span className="bg-slate-950 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                {metrics.unacknowledged_signups}
              </span>
            )}
          </button>

          <button
            onClick={() => setCreateOpen(true)}
            className="bg-slate-950 text-amber-400 hover:bg-slate-900 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
          >
            <Plus size={14} />
            Onboard Restaurant
          </button>

          <button
            onClick={() => setPasscodeModalOpen(true)}
            className="bg-white border border-slate-200 text-slate-700 hover:border-slate-300 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
            title="Set Master Passcode"
          >
            <KeyRound size={14} />
          </button>

          <button
            onClick={fetchPlatformData}
            className="bg-white border border-slate-200 text-slate-700 hover:border-slate-300 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={handleSignOut}
            className="bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Metric Scorecards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Total Restaurants</span>
              <Building2 size={16} className="text-amber-500" />
            </div>
            <p className="text-2xl font-black text-slate-950">{restaurants.length}</p>
            <p className="text-[11px] text-slate-500">{metrics.approved_count} active · {metrics.trial_count} trialing</p>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
              <span>New Signups (7d)</span>
              <Bell size={16} className="text-amber-500" />
            </div>
            <p className="text-2xl font-black text-slate-950">{metrics.signups_7d}</p>
            <p className="text-[11px] text-slate-500">{metrics.signups_today} signed up today</p>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Pending / Suspended</span>
              <Clock size={16} className="text-slate-600" />
            </div>
            <p className="text-2xl font-black text-slate-950">{metrics.pending_count + metrics.deactivated_count}</p>
            <p className="text-[11px] text-slate-500">{metrics.pending_count} pending · {metrics.deactivated_count} off</p>
          </div>

          <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider">
              <span>Platform Orders</span>
              <TrendingUp size={16} className="text-slate-950" />
            </div>
            <p className="text-2xl font-black text-slate-950">{Number(metrics.orders_count || 0).toLocaleString()}</p>
            <p className="text-[11px] text-slate-500">Across all stores</p>
          </div>

          <div className="bg-slate-950 text-white p-5 rounded-2xl space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between text-amber-400 text-[11px] font-bold uppercase tracking-wider">
              <span>Platform GMV</span>
              <CheckCircle2 size={16} className="text-amber-400" />
            </div>
            <p className="text-2xl font-black text-white">{formatKes(metrics.total_revenue)}</p>
            <p className="text-[11px] text-slate-400">Cumulative processed sales</p>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('restaurants')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'restaurants'
                ? 'bg-slate-950 text-amber-400'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-950'
            }`}
          >
            All Restaurants ({restaurants.length})
          </button>
          <button
            onClick={() => setActiveTab('signups')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'signups'
                ? 'bg-slate-950 text-amber-400'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-950'
            }`}
          >
            Signup Feed ({signupEvents.length})
            {metrics.unacknowledged_signups > 0 && (
              <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                {metrics.unacknowledged_signups} new
              </span>
            )}
          </button>
        </div>

        {activeTab === 'signups' ? (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider">New Restaurant Signups</h2>
                <p className="text-xs text-slate-500">Every new storefront registration is logged here in real time.</p>
              </div>
              {metrics.unacknowledged_signups > 0 && (
                <button
                  onClick={() => handleAcknowledgeSignups(null)}
                  className="bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl"
                >
                  Mark All Reviewed
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {signupEvents.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">No restaurant signups recorded yet.</div>
              ) : (
                signupEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      !ev.acknowledged ? 'bg-amber-50/60' : 'bg-white'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {!ev.acknowledged && (
                          <span className="px-2 py-0.5 bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-full">
                            New Signup
                          </span>
                        )}
                        <span className="font-black text-slate-950">{ev.restaurant_name}</span>
                        <span className="font-mono text-xs text-slate-500">/{ev.restaurant_slug}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold uppercase rounded-md">
                          {ev.plan || 'growth'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                        <span>Owner: <strong className="text-slate-900">{ev.owner_name || 'Store Owner'}</strong></span>
                        {ev.owner_email && <span className="font-mono">{ev.owner_email}</span>}
                        {ev.owner_phone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {ev.owner_phone}</span>}
                        <span className="text-slate-400">· {formatRelative(ev.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://${ev.restaurant_slug}.pos.manipos.com`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        POS <ExternalLink size={12} />
                      </a>
                      {!ev.acknowledged && (
                        <button
                          onClick={() => handleAcknowledgeSignups([ev.id])}
                          className="px-3 py-1.5 bg-slate-950 text-amber-400 rounded-xl text-xs font-bold hover:bg-slate-800"
                        >
                          Mark Reviewed
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Filters & Search */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-4 border border-slate-200 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                {['ALL', 'trial', 'approved', 'pending', 'deactivated'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                      filterStatus === status
                        ? 'bg-amber-400 border-amber-400 text-slate-950'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={filterPlan}
                  onChange={(e) => setFilterPlan(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:border-amber-400 focus:outline-none"
                >
                  <option value="ALL">All Plans</option>
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="enterprise">Enterprise</option>
                </select>

                <div className="relative w-full sm:w-72">
                  <span className="absolute left-3.5 top-2.5 text-slate-400"><Search size={15} /></span>
                  <input
                    type="text"
                    placeholder="Search store, slug, email, phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-950 focus:border-amber-400 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Restaurants Management Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-4">Restaurant</th>
                      <th className="p-4">Owner &amp; Contact</th>
                      <th className="p-4">Plan &amp; Billing</th>
                      <th className="p-4">Activity</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Signed Up</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-slate-500 font-semibold">
                          <Loader2 size={26} className="animate-spin mx-auto mb-2 text-amber-500" />
                          Loading onboarded restaurants...
                        </td>
                      </tr>
                    ) : filteredStores.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-slate-500 font-semibold">
                          No restaurants match your current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredStores.map((store) => {
                        const isDeactivated = store.status === 'deactivated' || store.is_active === false;
                        const isTrial = !isDeactivated && (store.status === 'trial' || store.subscription_status === 'trialing');
                        const isPending = !isDeactivated && store.status === 'pending';

                        return (
                          <tr key={store.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-4">
                              <div className="font-black text-slate-950">{store.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-xs text-amber-700 font-bold">{store.slug}</span>
                                <a
                                  href={`https://${store.slug}.pos.manipos.com`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-400 hover:text-slate-950"
                                  title="Open POS Terminal"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              </div>
                            </td>

                            <td className="p-4 text-xs space-y-0.5">
                              <div className="font-bold text-slate-900">{store.owner?.name || 'Store Owner'}</div>
                              <div className="font-mono text-[11px] text-slate-500">{store.owner?.email || 'No email'}</div>
                              {store.settings?.phone && (
                                <div className="text-[11px] text-slate-500">{store.settings.phone}</div>
                              )}
                            </td>

                            <td className="p-4 text-xs space-y-1">
                              <span className="px-2 py-0.5 bg-slate-950 text-amber-400 text-[10px] font-black uppercase rounded-md inline-block">
                                {store.plan || 'growth'}
                              </span>
                              <div className="text-[11px] text-slate-500 capitalize">
                                {store.subscription_status || 'trialing'} · {store.trial_ends_at ? `Ends ${new Date(store.trial_ends_at).toLocaleDateString()}` : 'No expiry'}
                              </div>
                            </td>

                            <td className="p-4 text-xs space-y-0.5">
                              <div className="font-bold text-slate-900">{Number(store.orders_count || 0).toLocaleString()} orders</div>
                              <div className="text-[11px] text-slate-500">{formatKes(store.total_revenue)}</div>
                              <div className="text-[10px] text-slate-400">Last: {formatRelative(store.last_order_at)}</div>
                            </td>

                            <td className="p-4">
                              {isDeactivated ? (
                                <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 text-[10px] font-black rounded-full uppercase inline-flex items-center gap-1">
                                  <XCircle size={12} /> Suspended
                                </span>
                              ) : isPending ? (
                                <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-black rounded-full uppercase inline-flex items-center gap-1">
                                  <Clock size={12} /> Pending
                                </span>
                              ) : isTrial ? (
                                <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black rounded-full uppercase inline-flex items-center gap-1">
                                  <Clock size={12} /> Trial
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black rounded-full uppercase inline-flex items-center gap-1">
                                  <CheckCircle2 size={12} /> Active
                                </span>
                              )}
                            </td>

                            <td className="p-4 text-xs text-slate-500">
                              <div>{new Date(store.created_at).toLocaleDateString()}</div>
                              <div className="text-[10px] text-slate-400">{formatRelative(store.created_at)}</div>
                            </td>

                            <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                              {actionLoadingId === store.id ? (
                                <Loader2 size={16} className="animate-spin inline-block text-amber-500" />
                              ) : (
                                <>
                                  <button
                                    onClick={() => openManageDrawer(store)}
                                    className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-amber-400 text-xs font-bold rounded-xl inline-flex items-center gap-1"
                                  >
                                    <SlidersHorizontal size={12} />
                                    Manage
                                  </button>

                                  <button
                                    onClick={() => handleExtendTrial(store.id, 14)}
                                    className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-slate-950 text-xs font-bold rounded-xl"
                                  >
                                    +14d
                                  </button>

                                  {!isDeactivated ? (
                                    <button
                                      onClick={() => handleUpdateStatus(store.id, 'deactivated', false)}
                                      className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-xl"
                                    >
                                      Suspend
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleUpdateStatus(store.id, 'approved', true)}
                                      className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl"
                                    >
                                      Activate
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Manage Restaurant Slide-Over Drawer */}
      {selectedStore && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-950">{selectedStore.name}</h3>
                <p className="text-xs font-mono text-slate-500">{selectedStore.slug}.pos.manipos.com</p>
              </div>
              <button onClick={() => setSelectedStore(null)} className="p-2 text-slate-400 hover:text-slate-950">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDrawer} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-1">
                <div><span className="text-slate-500">Owner:</span> <strong>{selectedStore.owner?.name || 'Store Owner'}</strong></div>
                <div><span className="text-slate-500">Email:</span> <span className="font-mono">{selectedStore.owner?.email || 'N/A'}</span></div>
                <div><span className="text-slate-500">Phone:</span> {selectedStore.settings?.phone || 'N/A'}</div>
                <div><span className="text-slate-500">Staff:</span> {selectedStore.staff_count || 0} active · <span className="text-slate-500">Orders:</span> {selectedStore.orders_count || 0}</div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Account Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditStatus(val);
                    setEditActive(val !== 'deactivated');
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-950 focus:border-amber-400 focus:outline-none"
                >
                  <option value="approved">Approved / Active</option>
                  <option value="trial">Trial</option>
                  <option value="pending">Pending Review</option>
                  <option value="deactivated">Suspended / Deactivated</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Plan Tier</label>
                <select
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-950 focus:border-amber-400 focus:outline-none"
                >
                  <option value="starter">Starter</option>
                  <option value="growth">Growth</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Subscription Billing Status</label>
                <select
                  value={editSubStatus}
                  onChange={(e) => setEditSubStatus(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-950 focus:border-amber-400 focus:outline-none"
                >
                  <option value="trialing">Trialing</option>
                  <option value="active">Active (Paid)</option>
                  <option value="past_due">Past Due</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Reset Owner PIN / Password (Optional)</label>
                <input
                  type="text"
                  placeholder="Leave blank to keep existing PIN/password"
                  value={newOwnerPin}
                  onChange={(e) => setNewOwnerPin(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-950 focus:border-amber-400 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400">Minimum 4 characters if resetting.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <a
                  href={`https://${selectedStore.slug}.manipos.com`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-center py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Open Menu
                </a>
                <a
                  href={`https://${selectedStore.slug}.pos.manipos.com`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-center py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Open POS
                </a>
              </div>

              <button
                type="submit"
                disabled={savingDrawer}
                className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-3 rounded-xl text-sm uppercase tracking-wider shadow-sm disabled:opacity-60"
              >
                {savingDrawer ? 'Saving...' : 'Save Account Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Onboard New Restaurant Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-950 uppercase">Onboard New Restaurant</h3>
              <button onClick={() => setCreateOpen(false)} className="text-slate-400 hover:text-slate-950">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateRestaurant} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Restaurant Name</label>
                  <input
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="e.g. Mama Put Kitchen"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Subdomain Slug</label>
                  <input
                    required
                    value={createForm.slug}
                    onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="e.g. mamaput"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Owner Name</label>
                  <input
                    required
                    value={createForm.managerName}
                    onChange={(e) => setCreateForm({ ...createForm, managerName: e.target.value })}
                    placeholder="Store Owner"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Owner Email</label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="owner@restaurant.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Phone</label>
                  <input
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="+2547..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Initial Password (8+ chars)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Plan</label>
                  <select
                    value={createForm.plan}
                    onChange={(e) => setCreateForm({ ...createForm, plan: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                  >
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">Business Type</label>
                  <select
                    value={createForm.businessType}
                    onChange={(e) => setCreateForm({ ...createForm, businessType: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                  >
                    <option value="restaurant">Restaurant</option>
                    <option value="retail">Retail</option>
                  </select>
                </div>
              </div>

              {createError && <p className="text-xs text-red-600 font-semibold">{createError}</p>}

              <button
                type="submit"
                disabled={createSaving}
                className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black py-3 rounded-xl text-sm uppercase tracking-wider disabled:opacity-60"
              >
                {createSaving ? 'Creating Store...' : 'Create Restaurant Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Master Passcode Modal */}
      {passcodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-950 uppercase">Master Passcode</h3>
              <button onClick={() => setPasscodeModalOpen(false)} className="text-slate-400 hover:text-slate-950">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Set or rotate the platform Master Passcode (minimum 6 characters).
            </p>
            <form onSubmit={handleUpdateMasterPasscode} className="space-y-3">
              <input
                type="password"
                required
                minLength={6}
                placeholder="New master passcode..."
                value={newMasterPasscode}
                onChange={(e) => setNewMasterPasscode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:border-amber-400 focus:outline-none"
              />
              {passcodeSaveMsg && <p className="text-xs font-semibold text-slate-700">{passcodeSaveMsg}</p>}
              <button
                type="submit"
                className="w-full bg-slate-950 text-amber-400 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider"
              >
                Update Passcode
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
