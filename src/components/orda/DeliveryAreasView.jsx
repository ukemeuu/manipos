import React, { useEffect, useMemo, useState } from 'react';
import {
  MapPin, Plus, Trash2, Edit3, CheckCircle2, Search, Compass, Power, X
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { matchDeliveryZoneOrBracket } from '../../lib/promoEngine';
import { SlideOverDrawer } from './SlideOverDrawer';

const PRESET_NAIROBI_ZONES = [
  {
    caption: 'Westlands / Kilimani Core',
    fee: 200,
    center_lat: -1.275,
    center_lng: 36.795,
    polygon: [
      { lat: -1.255, lng: 36.775 },
      { lat: -1.255, lng: 36.820 },
      { lat: -1.300, lng: 36.820 },
      { lat: -1.300, lng: 36.775 },
    ],
  },
  {
    caption: 'Nairobi CBD / Upper Hill',
    fee: 250,
    center_lat: -1.288,
    center_lng: 36.822,
    polygon: [
      { lat: -1.275, lng: 36.805 },
      { lat: -1.275, lng: 36.840 },
      { lat: -1.305, lng: 36.840 },
      { lat: -1.305, lng: 36.805 },
    ],
  },
  {
    caption: 'Karen / Langata Ring',
    fee: 450,
    center_lat: -1.330,
    center_lng: 36.735,
    polygon: [
      { lat: -1.305, lng: 36.695 },
      { lat: -1.305, lng: 36.775 },
      { lat: -1.365, lng: 36.775 },
      { lat: -1.365, lng: 36.695 },
    ],
  },
];

function parseVerticesText(txt) {
  return String(txt || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [latStr, lngStr] = line.split(/[,\s]+/).map((s) => s.trim());
      return { lat: Number(latStr), lng: Number(lngStr) };
    })
    .filter((pt) => Number.isFinite(pt.lat) && Number.isFinite(pt.lng));
}

function formatVerticesText(pts = []) {
  return (pts || [])
    .map((p) => (Array.isArray(p) ? `${p[1]}, ${p[0]}` : `${p.lat}, ${p.lng}`))
    .join('\n');
}

export function DeliveryAreasView({
  restaurantId,
  branches = [],
  settings = {},
  onSettingsUpdated,
}) {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [enableZones, setEnableZones] = useState(Boolean(settings.enable_delivery_zones));
  const [notice, setNotice] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [form, setForm] = useState({
    caption: '',
    delivery_fee: '200',
    branch_id: '',
    center_lat: '-1.286389',
    center_lng: '36.817223',
    verticesText: '-1.265, 36.785\n-1.265, 36.830\n-1.305, 36.830\n-1.305, 36.785',
    is_active: true,
  });
  const [geoQuery, setGeoQuery] = useState('');
  const [searchingGeo, setSearchingGeo] = useState(false);
  const [saving, setSaving] = useState(false);

  // Point-in-polygon simulator
  const [testLat, setTestLat] = useState('-1.283');
  const [testLng, setTestLng] = useState('36.816');

  useEffect(() => {
    setEnableZones(Boolean(settings.enable_delivery_zones));
  }, [settings.enable_delivery_zones]);

  const loadZones = async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('delivery_zones')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });
      if (!error) setZones(data || []);
    } catch (err) {
      console.warn('Delivery zones load note:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadZones();
  }, [restaurantId]);

  const toggleMasterZones = async () => {
    const next = !enableZones;
    setEnableZones(next);
    try {
      const { error } = await supabase
        .from('restaurant_settings')
        .update({ enable_delivery_zones: next })
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
      setNotice(`Polygon delivery areas ${next ? 'enabled' : 'disabled'} for storefront checkout.`);
      await onSettingsUpdated?.();
    } catch (err) {
      alert('Save toggle note (apply Wave 3 migration first if column missing): ' + (err.message || err));
    }
  };

  const handleFindLocation = async () => {
    if (!geoQuery.trim()) return;
    setSearchingGeo(true);
    try {
      const q = encodeURIComponent(geoQuery.trim());
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
      const rows = await res.json();
      if (Array.isArray(rows) && rows[0]) {
        const lat = Number(rows[0].lat);
        const lng = Number(rows[0].lon);
        const d = 0.018;
        const box = [
          { lat: Number((lat + d).toFixed(5)), lng: Number((lng - d).toFixed(5)) },
          { lat: Number((lat + d).toFixed(5)), lng: Number((lng + d).toFixed(5)) },
          { lat: Number((lat - d).toFixed(5)), lng: Number((lng + d).toFixed(5)) },
          { lat: Number((lat - d).toFixed(5)), lng: Number((lng - d).toFixed(5)) },
        ];
        setForm((p) => ({
          ...p,
          caption: p.caption || geoQuery.trim(),
          center_lat: String(lat.toFixed(6)),
          center_lng: String(lng.toFixed(6)),
          verticesText: formatVerticesText(box),
        }));
      } else {
        alert('Location not found. Try including city/country (e.g. "Westlands, Nairobi").');
      }
    } catch (err) {
      alert('Geocoding unavailable: ' + (err.message || err));
    } finally {
      setSearchingGeo(false);
    }
  };

  const openDrawer = (zone = null) => {
    if (zone) {
      setEditingZone(zone);
      setForm({
        caption: zone.caption || '',
        delivery_fee: String(zone.delivery_fee || 0),
        branch_id: zone.branch_id || '',
        center_lat: String(zone.center_lat ?? '-1.286389'),
        center_lng: String(zone.center_lng ?? '36.817223'),
        verticesText: formatVerticesText(zone.polygon_geojson || []),
        is_active: zone.is_active !== false,
      });
    } else {
      setEditingZone(null);
      setForm({
        caption: '',
        delivery_fee: '200',
        branch_id: selectedBranchId !== 'all' ? selectedBranchId : (branches[0]?.id || ''),
        center_lat: '-1.286389',
        center_lng: '36.817223',
        verticesText: '-1.265, 36.785\n-1.265, 36.830\n-1.305, 36.830\n-1.305, 36.785',
        is_active: true,
      });
    }
    setDrawerOpen(true);
  };

  const handleSaveZone = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    const pts = parseVerticesText(form.verticesText);
    if (pts.length < 3) {
      alert('Polygon needs at least 3 latitude, longitude pairs (one per line).');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        branch_id: form.branch_id || null,
        caption: form.caption.trim(),
        delivery_fee: Number(form.delivery_fee || 0),
        center_lat: Number(form.center_lat || pts[0].lat),
        center_lng: Number(form.center_lng || pts[0].lng),
        polygon_geojson: pts,
        is_active: form.is_active,
      };
      let res;
      if (editingZone?.id) {
        res = await supabase.from('delivery_zones').update(payload).eq('id', editingZone.id).eq('restaurant_id', restaurantId);
      } else {
        res = await supabase.from('delivery_zones').insert([payload]);
      }
      if (res.error) throw res.error;
      setDrawerOpen(false);
      setNotice('Delivery polygon zone saved.');
      await loadZones();
    } catch (err) {
      alert('Could not save delivery zone: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async (zone) => {
    if (!window.confirm(`Delete delivery zone "${zone.caption}"?`)) return;
    const { error } = await supabase.from('delivery_zones').delete().eq('id', zone.id).eq('restaurant_id', restaurantId);
    if (!error) await loadZones();
  };

  const filteredZones = useMemo(() => {
    if (selectedBranchId === 'all') return zones;
    return zones.filter((z) => !z.branch_id || z.branch_id === selectedBranchId);
  }, [zones, selectedBranchId]);

  const simulationMatch = useMemo(() => {
    return matchDeliveryZoneOrBracket({
      lat: Number(testLat),
      lng: Number(testLng),
      zones: filteredZones,
      brackets: settings.delivery_fee_brackets || [],
      fallbackFee: 250,
    });
  }, [testLat, testLng, filteredZones, settings.delivery_fee_brackets]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900">Delivery Areas & Polygon Zones</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Define polygon geofences per store location with custom KES fees checked automatically at microsite checkout.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleMasterZones}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-black ${
              enableZones
                ? 'bg-amber-50 border-amber-400 text-slate-900'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <Power size={14} /> Enable Delivery Area: {enableZones ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => openDrawer(null)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black"
          >
            <Plus size={14} /> Add New Delivery Area
          </button>
        </div>
      </div>

      {notice && (
        <div className="bg-amber-50 border border-amber-200 text-slate-900 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="hover:underline">Dismiss</button>
        </div>
      )}

      {/* Location Switcher & Polygon Coordinate Tester */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
          <p className="font-black text-slate-900 uppercase text-[11px] tracking-wider">Filter by Location</p>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-900"
          >
            <option value="all">All Store Locations</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
          <p className="font-black text-slate-900 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
            <Compass size={13} className="text-amber-700" /> Live Point-in-Polygon Fee Tester
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
            <input
              type="text"
              value={testLat}
              onChange={(e) => setTestLat(e.target.value)}
              placeholder="Latitude e.g. -1.283"
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-900"
            />
            <input
              type="text"
              value={testLng}
              onChange={(e) => setTestLng(e.target.value)}
              placeholder="Longitude e.g. 36.816"
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-slate-900"
            />
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 font-bold text-slate-950">
              {simulationMatch.matchedType === 'polygon'
                ? `${simulationMatch.zoneCaption}: KES ${simulationMatch.fee.toLocaleString()}`
                : `Fallback Fee: KES ${simulationMatch.fee.toLocaleString()}`}
            </div>
          </div>
        </div>
      </div>

      {/* Zones Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="py-3 px-4">Delivery Area Caption</th>
                <th className="py-3 px-4">Branch / Location</th>
                <th className="py-3 px-4 text-right">Delivery Fee</th>
                <th className="py-3 px-4 text-right">Polygon Vertices</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">Loading delivery zones...</td>
                </tr>
              ) : filteredZones.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No polygon delivery zones configured yet. Click <strong>Add New Delivery Area</strong> or use a Nairobi preset inside the drawer.
                  </td>
                </tr>
              ) : (
                filteredZones.map((z) => {
                  const branchName = branches.find((b) => b.id === z.branch_id)?.name || 'All Locations';
                  const pts = Array.isArray(z.polygon_geojson) ? z.polygon_geojson : [];
                  return (
                    <tr key={z.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <MapPin size={14} className="text-amber-700" /> {z.caption}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{branchName}</td>
                      <td className="py-3 px-4 text-right font-mono font-black text-amber-700">
                        KES {Number(z.delivery_fee || 0).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">{pts.length} pts</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          z.is_active !== false ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {z.is_active !== false ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openDrawer(z)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteZone(z)}
                            className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Polygon Zone Drawer */}
      <SlideOverDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingZone ? 'Edit Delivery Area' : 'Add New Delivery Area'}
        subtitle="Search a neighbourhood or paste/pick polygon coordinates"
      >
        <form onSubmit={handleSaveZone} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Quick Nairobi Presets</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_NAIROBI_ZONES.map((preset) => (
                <button
                  key={preset.caption}
                  type="button"
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      caption: preset.caption,
                      delivery_fee: String(preset.fee),
                      center_lat: String(preset.center_lat),
                      center_lng: String(preset.center_lng),
                      verticesText: formatVerticesText(preset.polygon),
                    }))
                  }
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 font-bold text-slate-700"
                >
                  {preset.caption} (KES {preset.fee})
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={geoQuery}
              onChange={(e) => setGeoQuery(e.target.value)}
              placeholder="Find a location (e.g. Kilimani, Nairobi)"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
            />
            <button
              type="button"
              disabled={searchingGeo}
              onClick={handleFindLocation}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white font-bold inline-flex items-center gap-1"
            >
              <Search size={13} /> {searchingGeo ? '...' : 'Locate'}
            </button>
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Caption / Zone Name *</label>
            <input
              type="text"
              required
              value={form.caption}
              onChange={(e) => setForm((p) => ({ ...p, caption: e.target.value }))}
              placeholder="e.g. Westlands Core"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1">Delivery Fee (KES) *</label>
              <input
                type="number"
                required
                min="0"
                value={form.delivery_fee}
                onChange={(e) => setForm((p) => ({ ...p, delivery_fee: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Store Location</label>
              <select
                value={form.branch_id}
                onChange={(e) => setForm((p) => ({ ...p, branch_id: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="">All Store Locations</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">
              Polygon Vertices (`lat, lng` per line — min 3 points)
            </label>
            <textarea
              rows={5}
              required
              value={form.verticesText}
              onChange={(e) => setForm((p) => ({ ...p, verticesText: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono text-[11px]"
            />
          </div>

          <label className="inline-flex items-center gap-2 font-bold text-slate-800">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Zone is Active
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Delivery Area'}
          </button>
        </form>
      </SlideOverDrawer>
    </div>
  );
}
