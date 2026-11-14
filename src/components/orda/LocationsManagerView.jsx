import React, { useEffect, useState } from 'react';
import {
  MapPin, Plus, Edit3, Check, Loader2, Building2, Store, Globe, Clock, Lock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SlideOverDrawer } from './SlideOverDrawer';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-600';
const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1';

export function LocationsManagerView({ restaurantId, restaurantName, tenantSlug, onBranchesUpdated }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState(null);

  const fetchBranches = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });
      if (!error && data) {
        setBranches(data);
        onBranchesUpdated?.(data);
      }
    } catch (err) {
      console.warn('Branches load notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, [restaurantId]);

  const defaultHours = DAYS.map((day) => ({
    day,
    enabled: true,
    open: '08:00',
    close: '22:00',
  }));

  const saveBranch = async () => {
    if (!drawer?.name?.trim() || !restaurantId) return;
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: drawer.name.trim(),
        slug: (drawer.slug || drawer.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''),
        phone: drawer.phone || null,
        address: drawer.address || null,
        city: drawer.city || 'Nairobi',
        country: drawer.country || 'Kenya',
        landmark: drawer.landmark || null,
        status: drawer.status || 'active',
        is_default: drawer.is_default === true || branches.length === 0,
        delivery_enabled: drawer.delivery_enabled !== false,
        pickup_enabled: drawer.pickup_enabled !== false,
        dine_in_enabled: drawer.dine_in_enabled !== false,
        pin_login_enabled: drawer.pin_login_enabled !== false,
        virtual_store_enabled: drawer.virtual_store_enabled !== false,
        omnichannel_enabled: drawer.omnichannel_enabled === true,
        opening_hours: Array.isArray(drawer.opening_hours) ? drawer.opening_hours : defaultHours,
      };
      const op = drawer.id
        ? supabase.from('branches').update(payload).eq('id', drawer.id).eq('restaurant_id', restaurantId)
        : supabase.from('branches').insert([payload]);
      const { error } = await op;
      if (error) throw error;
      setDrawer(null);
      await fetchBranches();
    } catch (err) {
      alert('Could not save location (ensure Wave 1 migration is applied): ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Locations & Branches</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage store outlets, fulfillment channels (`Delivery`, `Pickup`, `Dine In`), PIN login, and opening hours.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setDrawer({
              name: `${restaurantName || 'Main'} Branch`,
              slug: '',
              phone: '',
              address: '',
              city: 'Nairobi',
              country: 'Kenya',
              landmark: '',
              status: 'active',
              delivery_enabled: true,
              pickup_enabled: true,
              dine_in_enabled: true,
              pin_login_enabled: true,
              virtual_store_enabled: true,
              omnichannel_enabled: false,
              opening_hours: defaultHours,
            })
          }
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer"
        >
          <Plus size={14} /> Add Location
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-emerald-700" size={22} /></div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Location Name</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Delivery</th>
                <th className="py-3 px-4">Pickup</th>
                <th className="py-3 px-4">Dine In</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branches.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <Building2 size={15} className="text-emerald-700" />
                      <div>
                        <p className="font-bold text-slate-900">{b.name} {b.is_default ? '(Primary)' : ''}</p>
                        <p className="text-[11px] text-slate-500">{b.address || b.city || `${tenantSlug}.manipos.com`}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${b.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-bold">{b.delivery_enabled ? 'Enabled' : 'Off'}</td>
                  <td className="py-3.5 px-4 font-bold">{b.pickup_enabled ? 'Enabled' : 'Off'}</td>
                  <td className="py-3.5 px-4 font-bold">{b.dine_in_enabled ? 'Enabled' : 'Off'}</td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => setDrawer({ ...b, opening_hours: Array.isArray(b.opening_hours) && b.opening_hours.length ? b.opening_hours : defaultHours })}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                    >
                      <Edit3 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {branches.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <Store size={20} className="mx-auto mb-2 text-slate-300" />
                    Using single primary outlet ({restaurantName}). Click <strong>Add Location</strong> to configure multiple branches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <SlideOverDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        title={drawer?.id ? `Edit Location · ${drawer.name}` : 'New Location'}
        subtitle="Configure multi-branch outlet details, fulfillment modes & opening hours."
        footer={(
          <>
            <span />
            <div className="flex gap-2">
              <button type="button" onClick={() => setDrawer(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold cursor-pointer">Cancel</button>
              <button type="button" disabled={saving || !drawer?.name?.trim()} onClick={saveBranch} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black cursor-pointer">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Location
              </button>
            </div>
          </>
        )}
      >
        {drawer && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Location Name *</label>
                <input className={inputCls} value={drawer.name || ''} onChange={(e) => setDrawer({ ...drawer, name: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={drawer.status || 'active'} onChange={(e) => setDrawer({ ...drawer, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Phone</label>
                <input className={inputCls} value={drawer.phone || ''} onChange={(e) => setDrawer({ ...drawer, phone: e.target.value })} placeholder="2547..." />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input className={inputCls} value={drawer.city || ''} onChange={(e) => setDrawer({ ...drawer, city: e.target.value })} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Street Address</label>
              <input className={inputCls} value={drawer.address || ''} onChange={(e) => setDrawer({ ...drawer, address: e.target.value })} />
            </div>

            <div>
              <label className={labelCls}>Landmark</label>
              <input className={inputCls} value={drawer.landmark || ''} onChange={(e) => setDrawer({ ...drawer, landmark: e.target.value })} />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs font-semibold text-slate-700">
              {[
                { key: 'delivery_enabled', label: 'Delivery Enabled' },
                { key: 'pickup_enabled', label: 'Pickup Enabled' },
                { key: 'dine_in_enabled', label: 'Dine In Enabled' },
                { key: 'pin_login_enabled', label: 'Enable PIN Login' },
                { key: 'virtual_store_enabled', label: 'Enable Virtual Store' },
                { key: 'omnichannel_enabled', label: 'Omnichannel Gateway' },
              ].map((flag) => (
                <label key={flag.key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={drawer[flag.key] === true} onChange={(e) => setDrawer({ ...drawer, [flag.key]: e.target.checked })} className="accent-emerald-700 w-4 h-4" />
                  <span>{flag.label}</span>
                </label>
              ))}
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Clock size={13} /> Opening Times
              </span>
              {(drawer.opening_hours || []).map((row, idx) => (
                <div key={row.day} className="flex items-center gap-2 text-xs">
                  <label className="w-28 flex items-center gap-1.5 font-semibold text-slate-700">
                    <input type="checkbox" checked={row.enabled !== false} onChange={(e) => {
                      const next = [...drawer.opening_hours];
                      next[idx] = { ...next[idx], enabled: e.target.checked };
                      setDrawer({ ...drawer, opening_hours: next });
                    }} className="accent-emerald-700" />
                    {row.day}
                  </label>
                  <input type="time" className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1" value={row.open || '08:00'} onChange={(e) => {
                    const next = [...drawer.opening_hours];
                    next[idx] = { ...next[idx], open: e.target.value };
                    setDrawer({ ...drawer, opening_hours: next });
                  }} />
                  <span className="text-slate-400">to</span>
                  <input type="time" className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1" value={row.close || '22:00'} onChange={(e) => {
                    const next = [...drawer.opening_hours];
                    next[idx] = { ...next[idx], close: e.target.value };
                    setDrawer({ ...drawer, opening_hours: next });
                  }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </SlideOverDrawer>
    </div>
  );
}

/**
 * Orda-style Close Store (End of Day) modal:
 * Temporarily closes online ordering on storefront & records Next Opening Time.
 */
export function CloseStoreModal({ open, onClose, restaurantId, restaurantName, currentlyClosed, nextOpeningAt, onUpdated }) {
  const [nextOpen, setNextOpen] = useState(() => (nextOpeningAt ? nextOpeningAt.slice(0, 16) : ''));
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleToggleStore = async (closeStore) => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const patch = {
        store_closed: closeStore,
        next_opening_at: closeStore && nextOpen ? new Date(nextOpen).toISOString() : null,
      };
      const { error } = await supabase
        .from('restaurant_settings')
        .update(patch)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
      await onUpdated?.(patch);
      onClose?.();
    } catch (err) {
      alert('Could not update store open state (ensure Wave 1 migration is applied): ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 text-slate-900">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${currentlyClosed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
            <Lock size={18} />
          </div>
          <div>
            <h3 className="text-base font-black">{currentlyClosed ? 'Reopen Storefront' : 'Close Store (End of Day)'}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {currentlyClosed
                ? `${restaurantName} is currently paused for online ordering. Reopen to accept customer orders again.`
                : 'Clicking Confirm pauses storefront checkout and displays your next opening time to guests.'}
            </p>
          </div>
        </div>

        {!currentlyClosed && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Store to Close</label>
              <input disabled className={`${inputCls} opacity-75`} value={restaurantName || 'Main Location'} />
            </div>
            <div>
              <label className={labelCls}>Next Opening Date / Time</label>
              <input type="datetime-local" className={inputCls} value={nextOpen} onChange={(e) => setNextOpen(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>EOD Report Email (Optional)</label>
              <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@restaurant.com" />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleToggleStore(!currentlyClosed)}
            className={`px-5 py-2 rounded-xl text-white text-xs font-black cursor-pointer ${
              currentlyClosed ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-600 hover:bg-rose-700'
            }`}
          >
            {saving ? 'Updating...' : currentlyClosed ? 'Reopen Store' : 'Confirm Close Store'}
          </button>
        </div>
      </div>
    </div>
  );
}
