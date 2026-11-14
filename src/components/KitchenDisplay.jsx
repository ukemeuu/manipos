import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChefHat, Clock, CheckCircle2, RotateCcw, Volume2, VolumeX, Maximize2,
  Minimize2, RefreshCw, Wifi, WifiOff, Flame, Bell, UtensilsCrossed,
  Bike, ShoppingBag, ArrowLeft, AlertTriangle, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const ACTIVE_STATUSES = ['Pending', 'Accepted', 'Preparing', 'Ready'];
const COLUMNS = [
  { key: 'new', title: 'New Orders', statuses: ['Pending', 'Accepted'], tone: 'amber', icon: Bell },
  { key: 'cooking', title: 'Cooking', statuses: ['Preparing'], tone: 'orange', icon: Flame },
  { key: 'ready', title: 'Ready to Serve', statuses: ['Ready'], tone: 'emerald', icon: CheckCircle2 },
];

function ageMinutes(dateString) {
  const then = new Date(dateString || Date.now()).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 60000));
}

function ageLabel(minutes) {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function orderItems(order) {
  if (Array.isArray(order.items)) return order.items;
  if (Array.isArray(order.pos_order_items)) return order.pos_order_items;
  return [];
}

function itemName(item) {
  return item.item_name || item.name || 'Item';
}

function itemQuantity(item) {
  return item.quantity || 1;
}

function itemNotes(item) {
  return item.instructions || item.notes || '';
}

function channelIcon(order) {
  const channel = String(order.order_channel || order.channel || order.dining_option || '').toLowerCase();
  if (channel.includes('delivery')) return Bike;
  if (channel.includes('take')) return ShoppingBag;
  return UtensilsCrossed;
}

function notifyNewOrder() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1180, 1480].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.25);
    });
    setTimeout(() => ctx.close?.(), 1200);
  } catch (_) {
    // Audio is a progressive enhancement.
  }
}

export function KitchenDisplay({ tenant, staffName = 'Kitchen', onBack }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(navigator.onLine);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('manipos_kds_sound') !== 'off');
  const [fullscreen, setFullscreen] = useState(false);
  const [station, setStation] = useState(() => new URLSearchParams(window.location.search).get('station') || 'all');
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const knownIds = useRef(new Set());
  const initialLoad = useRef(true);

  const tenantId = tenant?.id;
  const brand = tenant?.name;

  const fetchOrders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('pos_orders')
        .select('*')
        .in('status', ACTIVE_STATUSES)
        .order('created_at', { ascending: true })
        .limit(80);
      if (tenantId) query = query.eq('restaurant_id', tenantId);
      else if (brand) query = query.eq('brand', brand);

      const { data, error: ordersError } = await query;
      if (ordersError) throw ordersError;

      let rows = data || [];

      // Attach line items when the relational table exists.
      if (rows.length > 0) {
        const ids = rows.map((o) => o.id);
        const { data: items, error: itemsError } = await supabase
          .from('pos_order_items')
          .select('*')
          .in('order_id', ids);
        if (!itemsError && items) {
          const grouped = items.reduce((acc, item) => {
            (acc[item.order_id] = acc[item.order_id] || []).push(item);
            return acc;
          }, {});
          rows = rows.map((order) => ({ ...order, items: grouped[order.id] || [] }));
        }
      }

      const incoming = rows.filter((o) => !knownIds.current.has(o.id));
      if (!initialLoad.current && incoming.length > 0 && soundOn) {
        notifyNewOrder();
      }
      initialLoad.current = false;
      rows.forEach((o) => knownIds.current.add(o.id));
      setOrders(rows);
      setLastSync(new Date());
    } catch (err) {
      setError(err?.message || 'Unable to load kitchen tickets.');
    } finally {
      setLoading(false);
    }
  }, [brand, soundOn, tenantId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const online = () => setConnected(true);
    const offline = () => setConnected(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOrders({ silent: true });
    }, 12000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    if (!tenantId && !brand) return undefined;
    const channelConfig = tenantId
      ? { event: '*', schema: 'public', table: 'pos_orders', filter: `restaurant_id=eq.${tenantId}` }
      : { event: '*', schema: 'public', table: 'pos_orders' };
    const channel = supabase
      .channel(`manipos-kds-${tenantId || brand}`)
      .on(
        'postgres_changes',
        channelConfig,
        () => fetchOrders({ silent: true })
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [brand, fetchOrders, tenantId]);

  useEffect(() => {
    localStorage.setItem('manipos_kds_sound', soundOn ? 'on' : 'off');
  }, [soundOn]);

  const updateStatus = async (order, nextStatus) => {
    setBusyId(order.id);
    const timestamp = new Date().toISOString();
    const patch = { status: nextStatus };
    if (nextStatus === 'Preparing') patch.kitchen_started_at = timestamp;
    if (nextStatus === 'Ready') patch.kitchen_ready_at = timestamp;
    if (nextStatus === 'Completed') patch.completed_at = timestamp;

    // Optimistic UI first so the kitchen is never blocked by the network.
    setOrders((prev) =>
      nextStatus === 'Completed'
        ? prev.filter((o) => o.id !== order.id)
        : prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o))
    );

    try {
      let updQuery = supabase.from('pos_orders').update(patch).eq('id', order.id);
      if (tenantId) updQuery = updQuery.eq('restaurant_id', tenantId);
      const { error: updateError } = await updQuery;
      if (updateError) throw updateError;
      await supabase
        .from('pos_order_items')
        .update({ status: nextStatus })
        .eq('order_id', order.id);
    } catch (err) {
      console.warn('[KDS] Falling back to status-only update:', err?.message || err);
      try {
        let fbQuery = supabase.from('pos_orders').update({ status: nextStatus }).eq('id', order.id);
        if (tenantId) fbQuery = fbQuery.eq('restaurant_id', tenantId);
        await fbQuery;
      } catch (fallbackErr) {
        setError(`Could not update ticket: ${fallbackErr.message}`);
        fetchOrders({ silent: true });
      }
    } finally {
      setBusyId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    if (station === 'all') return orders;
    const stationTerms = {
      kitchen: ['rice', 'soup', 'grill', 'chicken', 'beef', 'fish', 'goat', 'shawarma', 'burger', 'steak', 'platter', 'stew', 'pasta'],
      bar: ['drink', 'juice', 'cocktail', 'water', 'soda', 'beer', 'wine', 'coffee', 'tea', 'smoothie', 'shake'],
      pastry: ['cake', 'pie', 'pastry', 'dessert', 'bread', 'muffin', 'cookie', 'ice cream'],
    }[station] || [];
    return orders.filter((order) =>
      orderItems(order).some((item) => stationTerms.some((term) => itemName(item).toLowerCase().includes(term)))
    );
  }, [orders, station]);

  const stats = useMemo(() => {
    const all = filteredOrders;
    return {
      open: all.length,
      late: all.filter((o) => ageMinutes(o.created_at) >= 20).length,
      ready: all.filter((o) => o.status === 'Ready').length,
    };
  }, [filteredOrders]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch (_) {
      setFullscreen((v) => !v);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/95 backdrop-blur-xl">
        <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" aria-label="Back">
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-slate-950 flex items-center justify-center">
              <ChefHat size={22} />
            </div>
            <div>
              <h1 className="font-black text-lg leading-tight">Kitchen Display</h1>
              <p className="text-[11px] text-slate-400 font-semibold">
                {tenant?.name || 'ManiPOS'} · {staffName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border ${connected ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
              {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
              {connected ? 'Live' : 'Offline'}
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-black">
              <Bell size={13} /> {stats.open} open
            </div>
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border ${stats.late > 0 ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-white/5 border-white/10 text-slate-400'}`}>
              <Clock size={13} /> {stats.late} late
            </div>
            <button
              onClick={() => setSoundOn((v) => !v)}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
              title={soundOn ? 'Mute new-order sound' : 'Enable new-order sound'}
            >
              {soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button onClick={toggleFullscreen} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" title="Toggle fullscreen">
              {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            <button onClick={() => fetchOrders()} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer" title="Refresh">
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="px-4 sm:px-6 pb-3 flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'all', label: 'All stations' },
            { id: 'kitchen', label: 'Hot kitchen' },
            { id: 'bar', label: 'Bar & drinks' },
            { id: 'pastry', label: 'Pastry' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStation(s.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-colors cursor-pointer ${station === s.id ? 'bg-white text-slate-950 border-white' : 'bg-white/5 text-slate-400 border-white/10 hover:text-white'}`}
            >
              {s.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-slate-500 font-semibold whitespace-nowrap">
            {lastSync ? `Synced ${lastSync.toLocaleTimeString()}` : 'Connecting…'}
          </span>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-xs font-bold uppercase tracking-widest">Loading tickets…</span>
          </div>
        </div>
      ) : (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 sm:p-6 overflow-x-hidden">
          {COLUMNS.map((column) => {
            const columnOrders = filteredOrders.filter((o) => column.statuses.includes(o.status));
            const Icon = column.icon;
            const tone = {
              amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              orange: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
              emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
            }[column.tone];
            return (
              <section key={column.key} className="min-h-[40vh] lg:min-h-0 rounded-3xl border border-white/10 bg-white/[0.02] flex flex-col overflow-hidden">
                <div className={`px-4 py-3 border-b flex items-center justify-between ${tone}`}>
                  <div className="flex items-center gap-2">
                    <Icon size={17} />
                    <h2 className="font-black text-sm uppercase tracking-wider">{column.title}</h2>
                  </div>
                  <span className="text-xs font-black px-2 py-1 rounded-lg bg-black/20">{columnOrders.length}</span>
                </div>

                <div className="p-3 space-y-3 overflow-y-auto flex-1">
                  {columnOrders.length === 0 && (
                    <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center text-slate-600 gap-2">
                      <ChefHat size={26} />
                      <p className="text-xs font-bold">No tickets here</p>
                    </div>
                  )}

                  {columnOrders.map((order) => {
                    const mins = ageMinutes(order.created_at);
                    const late = mins >= 20;
                    const ChannelIcon = channelIcon(order);
                    const items = orderItems(order);
                    return (
                      <article
                        key={order.id}
                        className={`rounded-2xl border bg-slate-900/90 p-4 space-y-3 shadow-xl transition-all ${late ? 'border-red-500/60' : 'border-white/10'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-lg font-black">#{order.ticket_number || String(order.id).slice(0, 6)}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${late ? 'bg-red-500/15 text-red-300 border-red-500/30' : 'bg-white/5 text-slate-300 border-white/10'}`}>
                                {ageLabel(mins)}
                              </span>
                              {order.status === 'Ready' && <CheckCircle2 size={16} className="text-emerald-400" />}
                            </div>
                            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                              {order.customer_name || 'Walk-in'} · {order.dining_option || order.order_channel || 'Dine-in'}
                            </p>
                          </div>
                          <div className="text-slate-400 flex items-center gap-1.5">
                            <ChannelIcon size={15} />
                          </div>
                        </div>

                        <div className="space-y-1.5 border-y border-white/10 py-2.5">
                          {items.length === 0 && <p className="text-xs text-slate-500 italic">No line items attached to this ticket.</p>}
                          {items.map((item, index) => (
                            <div key={item.id || index} className="flex items-start gap-2 text-sm">
                              <span className="min-w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center font-black text-xs">
                                {itemQuantity(item)}×
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-100 leading-tight">{itemName(item)}</p>
                                {itemNotes(item) && <p className="text-[11px] text-amber-300/90 font-medium leading-snug">{itemNotes(item)}</p>}
                              </div>
                            </div>
                          ))}
                        </div>

                        {order.notes && !String(order.notes).startsWith('Delivery Address') && (
                          <p className="text-[11px] text-slate-400 bg-white/5 rounded-xl px-3 py-2 leading-snug">{order.notes}</p>
                        )}

                        <div className="flex gap-2">
                          {column.key === 'new' && (
                            <button
                              onClick={() => updateStatus(order, 'Preparing')}
                              disabled={busyId === order.id}
                              className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                              <Flame size={14} /> Start cooking
                            </button>
                          )}
                          {column.key === 'cooking' && (
                            <button
                              onClick={() => updateStatus(order, 'Ready')}
                              disabled={busyId === order.id}
                              className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                            >
                              <CheckCircle2 size={14} /> Mark ready
                            </button>
                          )}
                          {column.key === 'ready' && (
                            <>
                              <button
                                onClick={() => updateStatus(order, 'Completed')}
                                disabled={busyId === order.id}
                                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-slate-200 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                              >
                                <CheckCircle2 size={14} /> Bump
                              </button>
                              <button
                                onClick={() => updateStatus(order, 'Preparing')}
                                disabled={busyId === order.id}
                                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
                                title="Recall ticket"
                              >
                                <RotateCcw size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </main>
      )}

      <footer className="px-6 py-3 border-t border-white/10 text-[10px] text-slate-500 font-semibold flex flex-wrap gap-3 justify-between">
        <span>Tickets auto-refresh every 12s · Realtime enabled</span>
        <span>{tenant?.name || 'ManiPOS'} Kitchen Operations</span>
      </footer>
    </div>
  );
}
