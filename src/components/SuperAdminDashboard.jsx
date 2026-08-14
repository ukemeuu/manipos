import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
  Users, 
  RefreshCw, 
  Power, 
  Calendar,
  Lock
} from 'lucide-react';
import { motion } from 'framer-motion';

export function SuperAdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState('');

  const [restaurants, setRestaurants] = useState([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL', 'pending', 'approved', 'deactivated'
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const fetchPlatformData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all restaurants
      const { data: stores, error: storesErr } = await supabase
        .from('restaurants')
        .select('*')
        .order('created_at', { ascending: false });

      if (storesErr) throw storesErr;
      setRestaurants(stores || []);

      // 2. Fetch total orders across platform
      const { count, error: countErr } = await supabase
        .from('pos_orders')
        .select('*', { count: 'exact', head: true });

      if (!countErr) setOrdersCount(count || 0);
    } catch (err) {
      console.error('[SuperAdmin] Error fetching platform data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) {
      fetchPlatformData();
    }
  }, [authenticated]);

  const handlePasscodeSubmit = (e) => {
    e.preventDefault();
    if (passcode === '7777' || passcode === 'manipos2026' || passcode === 'admin') {
      setAuthenticated(true);
      setPasscodeError('');
    } else {
      setPasscodeError('Invalid Super Admin Master Passcode.');
    }
  };

  const handleUpdateStatus = async (restaurantId, newStatus, isActive) => {
    setActionLoadingId(restaurantId);
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ status: newStatus, is_active: isActive })
        .eq('id', restaurantId);

      if (error) throw error;
      setRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, status: newStatus, is_active: isActive } : r));
    } catch (err) {
      alert('Error updating status: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleExtendTrial = async (restaurantId, daysToAdd = 14) => {
    setActionLoadingId(restaurantId);
    try {
      const targetStore = restaurants.find(r => r.id === restaurantId);
      const currentExpiry = targetStore && targetStore.trial_ends_at ? new Date(targetStore.trial_ends_at) : new Date();
      const newExpiry = new Date(currentExpiry.getTime() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('restaurants')
        .update({ trial_ends_at: newExpiry, status: 'approved', is_active: true })
        .eq('id', restaurantId);

      if (error) throw error;
      setRestaurants(prev => prev.map(r => r.id === restaurantId ? { ...r, trial_ends_at: newExpiry, status: 'approved', is_active: true } : r));
      alert(`Trial extended by ${daysToAdd} days!`);
    } catch (err) {
      alert('Error extending trial: ' + err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredStores = restaurants.filter(r => {
    const matchesStatus = filterStatus === 'ALL' || r.status === filterStatus;
    const matchesSearch = !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.slug.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingCount = restaurants.filter(r => r.status === 'pending').length;
  const approvedCount = restaurants.filter(r => r.status === 'approved' || (!r.status && r.is_active !== false)).length;
  const deactivatedCount = restaurants.filter(r => r.status === 'deactivated' || r.is_active === false).length;

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-white">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-amber-400/10 text-amber-400 border border-amber-400/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white uppercase">ManiPOS Super Admin</h2>
            <p className="text-slate-400 text-xs font-semibold">Platform Owner Master Authorization Console</p>
          </div>

          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Master Passcode</label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-slate-600"><Lock size={16} /></span>
                <input
                  type="password"
                  required
                  placeholder="Enter platform passcode..."
                  value={passcode}
                  onChange={e => setPasscode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-4 py-3 text-sm focus:border-amber-400 focus:outline-none font-mono"
                />
              </div>
              {passcodeError && <p className="text-xs text-red-400 font-semibold pt-1">{passcodeError}</p>}
            </div>

            <button
              type="submit"
              className="w-full bg-amber-400 text-slate-950 font-black py-3.5 rounded-xl hover:bg-amber-300 transition-all text-sm uppercase tracking-wider shadow-lg shadow-amber-400/10"
            >
              Authorize Super Admin Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-900/80 border-b border-slate-900 px-8 py-5 flex items-center justify-between z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-400 text-slate-950 flex items-center justify-center rounded-xl font-black text-xl shadow-lg shadow-amber-400/10">
            S
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase">ManiPOS Super Admin</h1>
            <p className="text-slate-400 text-xs font-semibold">Multi-Tenant Platform Control Console</p>
          </div>
        </div>

        <button
          onClick={fetchPlatformData}
          className="text-xs font-bold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl flex items-center gap-2 hover:border-slate-700 transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh Platform Data
        </button>
      </header>

      <main className="flex-1 p-8 space-y-8 max-w-7xl mx-auto w-full">
        {/* Metric Scorecards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-slate-900/60 border border-slate-900 p-6 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Total Restaurants</span>
              <Building2 size={18} className="text-amber-400" />
            </div>
            <p className="text-3xl font-black text-white">{restaurants.length}</p>
            <p className="text-[11px] text-slate-400">Registered Platform Stores</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-900 p-6 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Active Stores</span>
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <p className="text-3xl font-black text-emerald-400">{approvedCount}</p>
            <p className="text-[11px] text-slate-400">Operating POS Tenants</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-900 p-6 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Pending Approvals</span>
              <Clock size={18} className="text-amber-400" />
            </div>
            <p className="text-3xl font-black text-amber-400">{pendingCount}</p>
            <p className="text-[11px] text-slate-400">Awaiting Platform Review</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-900 p-6 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Total Platform Orders</span>
              <TrendingUp size={18} className="text-blue-400" />
            </div>
            <p className="text-3xl font-black text-white">{ordersCount.toLocaleString()}</p>
            <p className="text-[11px] text-slate-400">System-wide Executed Orders</p>
          </div>
        </div>

        {/* Filters & Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/40 p-4 border border-slate-900 rounded-2xl">
          <div className="flex items-center gap-2">
            {['ALL', 'pending', 'approved', 'deactivated'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
                  filterStatus === status
                    ? 'bg-amber-400 border-amber-400 text-slate-950 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <span className="absolute left-3.5 top-2.5 text-slate-500"><Search size={16} /></span>
            <input
              type="text"
              placeholder="Search store name or slug..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Restaurants Management Table */}
        <div className="bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/80 text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-4">Restaurant Store</th>
                  <th className="p-4">Tenant Slug</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Created Date</th>
                  <th className="p-4">Trial Expiry</th>
                  <th className="p-4 text-right">Platform Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 font-semibold">
                      <Loader2 size={28} className="animate-spin mx-auto mb-2 text-amber-400" />
                      Loading platform restaurant tenants...
                    </td>
                  </tr>
                ) : filteredStores.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-slate-500 font-semibold">
                      No restaurant tenants found matching your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredStores.map(store => {
                    const isDeactivated = store.status === 'deactivated' || store.is_active === false;
                    const isApproved = store.status === 'approved' || (!store.status && store.is_active !== false);

                    return (
                      <tr key={store.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="p-4">
                          <div className="font-black text-white">{store.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">ID: {store.id}</div>
                        </td>

                        <td className="p-4 font-mono text-xs text-amber-400/90 font-bold">
                          {store.slug}
                        </td>

                        <td className="p-4">
                          {isDeactivated ? (
                            <span className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] font-bold rounded-full uppercase inline-flex items-center gap-1">
                              <XCircle size={12} /> Deactivated
                            </span>
                          ) : isApproved ? (
                            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold rounded-full uppercase inline-flex items-center gap-1">
                              <CheckCircle2 size={12} /> Approved & Active
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-amber-400/10 text-amber-400 border border-amber-400/20 text-[10px] font-bold rounded-full uppercase inline-flex items-center gap-1">
                              <Clock size={12} /> Pending Review
                            </span>
                          )}
                        </td>

                        <td className="p-4 text-xs text-slate-400">
                          {new Date(store.created_at).toLocaleDateString()}
                        </td>

                        <td className="p-4 text-xs font-mono">
                          {store.trial_ends_at ? new Date(store.trial_ends_at).toLocaleDateString() : 'N/A'}
                        </td>

                        <td className="p-4 text-right space-x-2">
                          {actionLoadingId === store.id ? (
                            <Loader2 size={16} className="animate-spin inline-block text-amber-400" />
                          ) : (
                            <>
                              {!isApproved && (
                                <button
                                  onClick={() => handleUpdateStatus(store.id, 'approved', true)}
                                  className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl transition-all"
                                >
                                  Approve Store
                                </button>
                              )}

                              <button
                                onClick={() => handleExtendTrial(store.id, 14)}
                                className="px-3 py-1.5 bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 border border-amber-400/30 text-xs font-bold rounded-xl transition-all"
                              >
                                +14 Days Trial
                              </button>

                              {!isDeactivated ? (
                                <button
                                  onClick={() => handleUpdateStatus(store.id, 'deactivated', false)}
                                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold rounded-xl transition-all"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUpdateStatus(store.id, 'approved', true)}
                                  className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold rounded-xl transition-all"
                                >
                                  Re-Activate
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
      </main>
    </div>
  );
}
