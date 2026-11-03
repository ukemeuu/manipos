import React, { useEffect, useMemo, useState } from 'react';
import {
  Armchair, Plus, Users, CalendarClock, CheckCircle2, X, Trash2, Edit3,
  Loader2, LayoutGrid, Clock, Phone, User, ArrowLeft, Sparkles, AlertTriangle,
  UtensilsCrossed, RefreshCw, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const TABLE_STATUSES = {
  available: { label: 'Available', dot: 'bg-emerald-400', card: 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-400/60', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  occupied: { label: 'Occupied', dot: 'bg-orange-400', card: 'border-orange-500/30 bg-orange-500/5 hover:border-orange-400/60', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  reserved: { label: 'Reserved', dot: 'bg-sky-400', card: 'border-sky-500/30 bg-sky-500/5 hover:border-sky-400/60', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  cleaning: { label: 'Cleaning', dot: 'bg-slate-400', card: 'border-slate-600 bg-slate-800/40 hover:border-slate-500', badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
};

const DEFAULT_TABLES = [
  { id: 'local-1', name: 'T1', zone: 'Main floor', seats: 2, status: 'available' },
  { id: 'local-2', name: 'T2', zone: 'Main floor', seats: 2, status: 'available' },
  { id: 'local-3', name: 'T3', zone: 'Main floor', seats: 4, status: 'available' },
  { id: 'local-4', name: 'T4', zone: 'Main floor', seats: 4, status: 'available' },
  { id: 'local-5', name: 'T5', zone: 'Window', seats: 4, status: 'available' },
  { id: 'local-6', name: 'T6', zone: 'Window', seats: 6, status: 'available' },
  { id: 'local-7', name: 'B1', zone: 'Bar', seats: 2, status: 'available' },
  { id: 'local-8', name: 'B2', zone: 'Bar', seats: 2, status: 'available' },
  { id: 'local-9', name: 'P1', zone: 'Private room', seats: 8, status: 'available' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Best effort for demo mode.
  }
}

export function FloorPlanView({ tenant, staffName = 'Manager', onBack, onOpenPos }) {
  const [tab, setTab] = useState('floor');
  const [tables, setTables] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [zone, setZone] = useState('all');
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tenantId = tenant?.id;
  const localKey = `manipos_floor_${tenant?.slug || 'default'}`;
  const reservationKey = `manipos_reservations_${tenant?.slug || 'default'}`;

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      let tableQuery = supabase.from('pos_tables').select('*').order('display_order', { ascending: true });
      if (tenantId) tableQuery = tableQuery.eq('restaurant_id', tenantId);
      const { data: tableRows, error: tableError } = await tableQuery;

      if (tableError) {
        setDemoMode(true);
        setTables(readLocal(localKey, DEFAULT_TABLES));
      } else {
        setTables(tableRows || []);
      }

      let reservationQuery = supabase
        .from('reservations')
        .select('*')
        .gte('reservation_date', todayISO())
        .order('reservation_date', { ascending: true })
        .order('reservation_time', { ascending: true });
      if (tenantId) reservationQuery = reservationQuery.eq('restaurant_id', tenantId);
      const { data: reservationRows, error: reservationError } = await reservationQuery;
      if (reservationError) {
        setReservations(readLocal(reservationKey, []));
      } else {
        setReservations(reservationRows || []);
      }
    } catch (err) {
      setDemoMode(true);
      setTables(readLocal(localKey, DEFAULT_TABLES));
      setReservations(readLocal(reservationKey, []));
      setError(err?.message || '');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  useEffect(() => {
    if (demoMode) writeLocal(localKey, tables);
  }, [demoMode, localKey, tables]);

  useEffect(() => {
    if (demoMode) writeLocal(reservationKey, reservations);
  }, [demoMode, reservationKey, reservations]);

  const zones = useMemo(() => ['all', ...Array.from(new Set(tables.map((t) => t.zone || 'Main floor')))], [tables]);
  const visibleTables = useMemo(
    () => tables.filter((t) => zone === 'all' || (t.zone || 'Main floor') === zone),
    [tables, zone]
  );

  const stats = useMemo(() => {
    const totalSeats = tables.reduce((sum, t) => sum + (Number(t.seats) || 0), 0);
    return {
      total: tables.length,
      seats: totalSeats,
      occupied: tables.filter((t) => t.status === 'occupied').length,
      reserved: tables.filter((t) => t.status === 'reserved').length,
      available: tables.filter((t) => t.status === 'available' || !t.status).length,
    };
  }, [tables]);

  const setTableStatus = async (table, status) => {
    setTables((prev) => prev.map((t) => (t.id === table.id ? { ...t, status } : t)));
    if (demoMode || String(table.id).startsWith('local-')) return;
    try {
      const { error: updateError } = await supabase.from('pos_tables').update({ status }).eq('id', table.id);
      if (updateError) throw updateError;
    } catch (err) {
      setError(`Could not update table: ${err.message}`);
      fetchData();
    }
  };

  const saveTable = async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      restaurant_id: tenantId,
      name: form.tableName.value.trim(),
      zone: form.zone.value.trim() || 'Main floor',
      seats: Number(form.seats.value) || 2,
      status: form.status.value,
      notes: form.notes.value.trim() || null,
    };
    if (!payload.name) return;
    setBusy(true);
    if (demoMode || String(editingTable?.id || '').startsWith('local-')) {
      setTables((prev) => {
        if (editingTable?.id) {
          return prev.map((t) => (t.id === editingTable.id ? { ...t, ...payload } : t));
        }
        return [...prev, { ...payload, id: `local-${Date.now()}` }];
      });
    } else {
      try {
        if (editingTable?.id) {
          const { error: updateError } = await supabase.from('pos_tables').update(payload).eq('id', editingTable.id);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase.from('pos_tables').insert([payload]);
          if (insertError) throw insertError;
        }
        await fetchData();
      } catch (err) {
        setError(`Could not save table: ${err.message}`);
      }
    }
    setBusy(false);
    setShowTableModal(false);
    setEditingTable(null);
  };

  const deleteTable = async (table) => {
    if (!window.confirm(`Delete ${table.name}?`)) return;
    if (demoMode || String(table.id).startsWith('local-')) {
      setTables((prev) => prev.filter((t) => t.id !== table.id));
      return;
    }
    try {
      const { error: deleteError } = await supabase.from('pos_tables').delete().eq('id', table.id);
      if (deleteError) throw deleteError;
      await fetchData();
    } catch (err) {
      setError(`Could not delete table: ${err.message}`);
    }
  };

  const saveReservation = async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      restaurant_id: tenantId,
      guest_name: form.guestName.value.trim(),
      phone: form.phone.value.trim() || null,
      party_size: Number(form.partySize.value) || 2,
      reservation_date: form.date.value || todayISO(),
      reservation_time: form.time.value || '19:00',
      table_name: form.table.value || null,
      notes: form.notes.value.trim() || null,
      status: 'confirmed',
    };
    if (!payload.guest_name) return;
    setBusy(true);
    if (demoMode) {
      setReservations((prev) => [...prev, { ...payload, id: `local-res-${Date.now()}` }].sort((a, b) => `${a.reservation_date}${a.reservation_time}`.localeCompare(`${b.reservation_date}${b.reservation_time}`)));
    } else {
      try {
        const { error: insertError } = await supabase.from('reservations').insert([payload]);
        if (insertError) throw insertError;
        await fetchData();
      } catch (err) {
        setError(`Could not save reservation: ${err.message}`);
      }
    }
    setBusy(false);
    setShowReservationModal(false);
  };

  const setReservationStatus = async (reservation, status) => {
    setReservations((prev) => prev.map((r) => (r.id === reservation.id ? { ...r, status } : r)));
    if (demoMode) return;
    try {
      await supabase.from('reservations').update({ status }).eq('id', reservation.id);
    } catch (err) {
      setError(`Could not update reservation: ${err.message}`);
    }
  };

  const statusMeta = (status) => TABLE_STATUSES[status] || TABLE_STATUSES.available;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/95 backdrop-blur-xl">
        <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" aria-label="Back">
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="w-10 h-10 rounded-2xl bg-sky-500 text-slate-950 flex items-center justify-center">
              <LayoutGrid size={21} />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight">Floor & Reservations</h1>
              <p className="text-[11px] text-slate-400 font-semibold">{tenant?.name || 'ManiPOS'} · {staffName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" title="Refresh">
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>
            {tab === 'floor' ? (
              <button
                onClick={() => { setEditingTable(null); setShowTableModal(true); }}
                className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} /> Add table
              </button>
            ) : (
              <button
                onClick={() => setShowReservationModal(true)}
                className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={15} /> New booking
              </button>
            )}
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-3 flex items-center gap-2">
          <button onClick={() => setTab('floor')} className={`px-4 py-2 rounded-xl text-xs font-black border transition-colors cursor-pointer ${tab === 'floor' ? 'bg-white text-slate-950 border-white' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>
            Floor plan
          </button>
          <button onClick={() => setTab('reservations')} className={`px-4 py-2 rounded-xl text-xs font-black border transition-colors cursor-pointer ${tab === 'reservations' ? 'bg-white text-slate-950 border-white' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}>
            Reservations
          </button>
        </div>
      </header>

      {demoMode && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            Demo floor plan: run <code className="font-mono bg-black/30 px-1 rounded">supabase/migrations/20261103_market_ready.sql</code> to persist tables and reservations in your database.
          </span>
        </div>
      )}
      {error && (
        <div className="mx-4 sm:mx-6 mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">{error}</div>
      )}

      <main className="p-4 sm:p-6 space-y-6">
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Tables', value: stats.total, icon: Armchair, tone: 'text-sky-300' },
            { label: 'Seats', value: stats.seats, icon: Users, tone: 'text-indigo-300' },
            { label: 'Occupied', value: stats.occupied, icon: UtensilsCrossed, tone: 'text-orange-300' },
            { label: 'Available', value: stats.available, icon: CheckCircle2, tone: 'text-emerald-300' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className={`flex items-center gap-2 ${stat.tone}`}>
                  <Icon size={15} />
                  <span className="text-[10px] font-black uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-2xl font-black mt-1">{stat.value}</p>
              </div>
            );
          })}
        </section>

        {loading ? (
          <div className="py-24 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={26} />
            <span className="text-xs font-bold uppercase tracking-widest">Loading floor plan…</span>
          </div>
        ) : tab === 'floor' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {zones.map((z) => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer ${zone === z ? 'bg-white text-slate-950 border-white' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}
                >
                  {z === 'all' ? 'All zones' : z}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {visibleTables.map((table) => {
                const meta = statusMeta(table.status);
                return (
                  <article key={table.id} className={`group rounded-3xl border p-4 transition-all ${meta.card}`}>
                    <div className="flex items-start justify-between">
                      <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center">
                        <Armchair size={21} />
                      </div>
                      <span className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${meta.badge}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <h3 className="text-2xl font-black mt-3">{table.name}</h3>
                    <p className="text-[11px] text-slate-400 font-semibold">{table.zone || 'Main floor'} · {table.seats || 2} seats</p>
                    {table.notes && <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{table.notes}</p>}

                    <div className="mt-4 flex items-center gap-1.5">
                      {Object.entries(TABLE_STATUSES).map(([key, value]) => (
                        <button
                          key={key}
                          onClick={() => setTableStatus(table, key)}
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer ${table.status === key ? 'border-white/60 bg-white/15' : 'border-white/10 hover:bg-white/10'}`}
                          title={value.label}
                        >
                          <span className={`w-2 h-2 rounded-full ${value.dot}`} />
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
                      <button
                        onClick={() => onOpenPos && onOpenPos(table)}
                        className="text-[10px] font-black uppercase tracking-wider text-sky-300 hover:text-sky-200 flex items-center gap-1 cursor-pointer"
                      >
                        Open tab <ChevronRight size={12} />
                      </button>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingTable(table); setShowTableModal(true); }} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 cursor-pointer" title="Edit"><Edit3 size={13} /></button>
                        <button onClick={() => deleteTable(table)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-300 cursor-pointer" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  </article>
                );
              })}
              {visibleTables.length === 0 && (
                <div className="col-span-full rounded-3xl border border-dashed border-white/15 p-12 text-center text-slate-400">
                  <Armchair size={30} className="mx-auto mb-2" />
                  <p className="text-sm font-bold">No tables in this zone yet.</p>
                  <button onClick={() => { setEditingTable(null); setShowTableModal(true); }} className="mt-3 text-xs font-black text-sky-300 hover:text-sky-200 cursor-pointer">Add your first table</button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            {reservations.length === 0 && (
              <div className="rounded-3xl border border-dashed border-white/15 p-12 text-center text-slate-400">
                <CalendarClock size={30} className="mx-auto mb-2" />
                <p className="text-sm font-bold">No upcoming reservations.</p>
                <button onClick={() => setShowReservationModal(true)} className="mt-3 text-xs font-black text-sky-300 hover:text-sky-200 cursor-pointer">Take a booking</button>
              </div>
            )}
            {reservations.map((reservation) => (
              <article key={reservation.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex flex-wrap items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex flex-col items-center justify-center">
                  <span className="text-[9px] font-black uppercase text-sky-300">{new Date(`${reservation.reservation_date}T00:00:00`).toLocaleString('en', { month: 'short' })}</span>
                  <span className="text-lg font-black leading-none">{new Date(`${reservation.reservation_date}T00:00:00`).getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-sm">{reservation.guest_name} · {reservation.party_size} guests</h3>
                  <p className="text-[11px] text-slate-400 font-semibold flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-1"><Clock size={11} /> {reservation.reservation_time}</span>
                    {reservation.table_name && <span className="flex items-center gap-1"><Armchair size={11} /> {reservation.table_name}</span>}
                    {reservation.phone && <span className="flex items-center gap-1"><Phone size={11} /> {reservation.phone}</span>}
                  </p>
                  {reservation.notes && <p className="text-[11px] text-slate-500 mt-1">{reservation.notes}</p>}
                </div>
                <span className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider ${reservation.status === 'seated' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : reservation.status === 'cancelled' ? 'bg-red-500/15 text-red-300 border-red-500/30' : 'bg-sky-500/15 text-sky-300 border-sky-500/30'}`}>
                  {reservation.status || 'confirmed'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setReservationStatus(reservation, 'seated')} className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase cursor-pointer">Seat</button>
                  <button onClick={() => setReservationStatus(reservation, 'cancelled')} className="p-1.5 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20 cursor-pointer" title="Cancel"><X size={12} /></button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {showTableModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { setShowTableModal(false); setEditingTable(null); }}>
          <form onSubmit={saveTable} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg">{editingTable ? 'Edit table' : 'Add table'}</h3>
              <button type="button" onClick={() => { setShowTableModal(false); setEditingTable(null); }} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 col-span-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Table name</span>
                <input name="tableName" defaultValue={editingTable?.name || ''} required placeholder="T7" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
              <label className="space-y-1 col-span-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Seats</span>
                <input name="seats" type="number" min="1" defaultValue={editingTable?.seats || 2} className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Zone</span>
                <input name="zone" defaultValue={editingTable?.zone || 'Main floor'} placeholder="Main floor, Terrace, Bar…" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status</span>
                <select name="status" defaultValue={editingTable?.status || 'available'} className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none">
                  {Object.entries(TABLE_STATUSES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Notes</span>
                <input name="notes" defaultValue={editingTable?.notes || ''} placeholder="Window seat, wheelchair access…" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
            </div>
            <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Save table
            </button>
          </form>
        </div>
      )}

      {showReservationModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowReservationModal(false)}>
          <form onSubmit={saveReservation} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg">New reservation</h3>
              <button type="button" onClick={() => setShowReservationModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Guest name</span>
                <input name="guestName" required placeholder="Ada Obi" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Phone</span>
                <input name="phone" placeholder="+254…" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Party size</span>
                <input name="partySize" type="number" min="1" defaultValue="2" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Date</span>
                <input name="date" type="date" defaultValue={todayISO()} className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Time</span>
                <input name="time" type="time" defaultValue="19:00" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Table</span>
                <select name="table" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none">
                  <option value="">Any table</option>
                  {tables.map((t) => <option key={t.id} value={t.name}>{t.name} · {t.seats} seats</option>)}
                </select>
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Notes</span>
                <input name="notes" placeholder="Birthday, allergies, high chair…" className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none" />
              </label>
            </div>
            <button type="submit" disabled={busy} className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />} Save booking
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
