import React, { useEffect, useState } from 'react';
import {
  Armchair, Plus, Trash2, QrCode, CheckCircle2, Power, ExternalLink
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function TableManagementView({
  restaurantId,
  tenantSlug = '',
  branches = [],
  settings = {},
  onSettingsUpdated,
  onOpenFloorPlan,
}) {
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [enableMicrositeTables, setEnableMicrositeTables] = useState(
    Boolean(settings.enable_table_selection_microsite)
  );
  const [areaName, setAreaName] = useState('');
  const [tableForm, setTableForm] = useState({ name: '', zone: 'Main floor', seats: '4', floor_area_id: '' });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setEnableMicrositeTables(Boolean(settings.enable_table_selection_microsite));
  }, [settings.enable_table_selection_microsite]);

  const loadData = async () => {
    if (!restaurantId) return;
    try {
      const [aRes, tRes] = await Promise.all([
        supabase.from('floor_areas').select('*').eq('restaurant_id', restaurantId).order('display_order', { ascending: true }),
        supabase.from('pos_tables').select('*').eq('restaurant_id', restaurantId).order('display_order', { ascending: true }),
      ]);
      if (!aRes.error) setAreas(aRes.data || []);
      if (!tRes.error) setTables(tRes.data || []);
    } catch (err) {
      console.warn('Table management load note:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [restaurantId]);

  const toggleMicrositeTableSelection = async () => {
    const next = !enableMicrositeTables;
    setEnableMicrositeTables(next);
    try {
      await supabase
        .from('restaurant_settings')
        .update({ enable_table_selection_microsite: next })
        .eq('restaurant_id', restaurantId);
      setNotice(`Storefront Table Selection set to ${next ? 'ON' : 'OFF'}.`);
      await onSettingsUpdated?.();
    } catch (_) {}
  };

  const handleAddArea = async (e) => {
    e.preventDefault();
    if (!areaName.trim() || !restaurantId) return;
    const { error } = await supabase.from('floor_areas').insert([
      { restaurant_id: restaurantId, name: areaName.trim(), display_order: areas.length },
    ]);
    if (!error) {
      setAreaName('');
      setNotice('Floor Area added.');
      await loadData();
    } else {
      alert('Add area note: ' + error.message);
    }
  };

  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!tableForm.name.trim() || !restaurantId) return;
    const areaObj = areas.find((a) => a.id === tableForm.floor_area_id);
    const basePayload = {
      restaurant_id: restaurantId,
      name: tableForm.name.trim(),
      zone: areaObj?.name || tableForm.zone || 'Main floor',
      seats: Number(tableForm.seats || 4),
      status: 'available',
      display_order: tables.length,
    };
    let res = await supabase.from('pos_tables').insert([
      { ...basePayload, floor_area_id: tableForm.floor_area_id || null },
    ]);
    if (res.error && String(res.error.message || '').toLowerCase().includes('floor_area_id')) {
      res = await supabase.from('pos_tables').insert([basePayload]);
    }
    if (!res.error) {
      setTableForm({ name: '', zone: 'Main floor', seats: '4', floor_area_id: '' });
      setNotice('Table added cleanly to floor plan.');
      await loadData();
    } else {
      alert('Failed to add table: ' + res.error.message);
    }
  };

  const micrositeBase = tenantSlug
    ? `${window.location.protocol}//${window.location.host}/?tenant=${tenantSlug}`
    : `${window.location.origin}/`;

  return (
    <div className="space-y-5 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900">Table Management & QR Ordering</h2>
          <p className="text-slate-500 mt-0.5">
            Floor zones, table QR ordering links, and live sync with ManiPOS Visual Floor Plan Canvas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleMicrositeTableSelection}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-black ${
              enableMicrositeTables ? 'bg-emerald-50 border-emerald-600 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <Power size={13} /> Microsite Table Picker: {enableMicrositeTables ? 'ON' : 'OFF'}
          </button>
          {onOpenFloorPlan && (
            <button
              type="button"
              onClick={onOpenFloorPlan}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black"
            >
              <Armchair size={14} /> Open Interactive Floor Canvas →
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2.5 font-bold flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="hover:underline">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm">
          <h3 className="text-sm font-black text-slate-900">Floor Areas / Sections</h3>
          <form onSubmit={handleAddArea} className="flex gap-2">
            <input
              type="text"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              placeholder="e.g. Terrace / VIP Lounge"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
            <button type="submit" className="px-3 py-2 rounded-xl bg-slate-900 text-white font-black">Add</button>
          </form>
          <div className="space-y-1.5">
            {areas.map((a) => (
              <div key={a.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                <span className="font-bold text-slate-800">{a.name}</span>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.from('floor_areas').delete().eq('id', a.id);
                    await loadData();
                  }}
                  className="text-rose-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <h3 className="text-sm font-black text-slate-900">Dining Tables & QR Direct Links</h3>
          <form onSubmit={handleAddTable} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="text"
              required
              value={tableForm.name}
              onChange={(e) => setTableForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Table Name (e.g. T-12)"
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
            <select
              value={tableForm.floor_area_id}
              onChange={(e) => setTableForm((p) => ({ ...p, floor_area_id: e.target.value }))}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            >
              <option value="">Main floor</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input
              type="number"
              min="1"
              value={tableForm.seats}
              onChange={(e) => setTableForm((p) => ({ ...p, seats: e.target.value }))}
              placeholder="Seats"
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
            <button type="submit" className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-black">+ Add Table</button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-2.5 px-3">Table</th>
                  <th className="py-2.5 px-3">Area</th>
                  <th className="py-2.5 px-3 text-right">Seats</th>
                  <th className="py-2.5 px-3">QR Table URL</th>
                  <th className="py-2.5 px-3 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tables.map((t) => {
                  const qrUrl = `${micrositeBase}${micrositeBase.includes('?') ? '&' : '?'}table=${encodeURIComponent(t.name)}`;
                  return (
                    <tr key={t.id}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{t.name}</td>
                      <td className="py-2.5 px-3">{t.zone || 'Main floor'}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{t.seats || 2}</td>
                      <td className="py-2.5 px-3">
                        <a href={qrUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline">
                          <QrCode size={12} /> Open QR Menu
                        </a>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            await supabase.from('pos_tables').delete().eq('id', t.id);
                            await loadData();
                          }}
                          className="text-rose-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
