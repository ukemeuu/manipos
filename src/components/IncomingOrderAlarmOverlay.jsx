import React, { useEffect, useRef, useState } from 'react';
import { BellRing, Check, XCircle, Volume2, VolumeX, Clock, ChefHat, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { logAuditEvent } from '../lib/auditLogger';
import {
  startContinuousOrderAlarm,
  stopContinuousOrderAlarm,
  unlockOrderAlarmAudio,
  playSingleOrderRing,
  snoozeOrderAlarm,
  ensureAndroidAlarmChannel,
  triggerNativeOrderAlert,
} from '../lib/orderAlarm';

/**
 * Determines whether a pending pos_orders row came from an online/microsite/table
 * ordering channel that staff must explicitly Accept or Decline with an audible alarm.
 */
export function isOnlineIncomingOrder(order) {
  if (!order) return false;
  const status = String(order.status || '').toLowerCase();
  if (status !== 'pending' && status !== 'new') return false;

  const channel = String(order.order_channel || '').toLowerCase();
  const dining = String(order.dining_option || '').toLowerCase();
  const cashier = String(order.cashier_name || '').toLowerCase();

  return (
    channel.includes('microsite') ||
    channel.includes('online') ||
    channel.includes('self') ||
    channel.includes('uber') ||
    channel.includes('glovo') ||
    channel.includes('bolt') ||
    channel.includes('whatsapp') ||
    dining.includes('self') ||
    cashier.includes('microsite') ||
    cashier.includes('self-service')
  );
}

export function IncomingOrderAlarmOverlay({ restaurantId, staffName = 'Staff', staffRole = 'cashier' }) {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const alertedIdsRef = useRef(new Set());

  // Unlock browser audio cleanly on the first interaction anywhere in the terminal
  useEffect(() => {
    ensureAndroidAlarmChannel();
    const unlock = async () => {
      const ok = await unlockOrderAlarmAudio();
      if (ok) setAudioUnlocked(true);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      stopContinuousOrderAlarm();
    };
  }, []);

  const fetchPendingIncoming = async () => {
    if (!restaurantId) {
      setPendingOrders([]);
      return;
    }
    try {
      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('pos_orders')
        .select('id, ticket_number, customer_name, customer_phone, dining_option, order_channel, payment_method, payment_status, total_amount, delivery_address, notes, status, cashier_name, created_at, pos_order_items(id, item_name, quantity, price, instructions)')
        .eq('restaurant_id', restaurantId)
        .in('status', ['Pending', 'New', 'pending', 'new'])
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error || !Array.isArray(data)) return;
      const incoming = data.filter(isOnlineIncomingOrder);
      setPendingOrders(incoming);

      // Fire native Android push/vibration alert once per newly discovered incoming order
      for (const ord of incoming) {
        if (!alertedIdsRef.current.has(ord.id)) {
          alertedIdsRef.current.add(ord.id);
          triggerNativeOrderAlert(ord);
        }
      }
    } catch (err) {
      console.warn('[OrderAlarm] Poll check failed:', err?.message);
    }
  };

  // Realtime subscription + 5s resilient polling (mobile WiFi drop safe)
  useEffect(() => {
    if (!restaurantId) return undefined;
    fetchPendingIncoming();

    const channel = supabase
      .channel(`manipos-order-alarm-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          fetchPendingIncoming();
        }
      )
      .subscribe();

    const pollId = setInterval(fetchPendingIncoming, 5000);
    return () => {
      clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [restaurantId]);

  // Continuous loud alarm whenever pending incoming queue is non-empty
  useEffect(() => {
    if (pendingOrders.length > 0) {
      startContinuousOrderAlarm();
    } else {
      stopContinuousOrderAlarm();
      setSnoozedUntil(0);
    }
  }, [pendingOrders.length]);

  const handleDecision = async (order, nextStatus) => {
    if (!order?.id || !restaurantId) return;
    await unlockOrderAlarmAudio();
    setAudioUnlocked(true);
    setBusyOrderId(order.id);
    try {
      const { error } = await supabase
        .from('pos_orders')
        .update({ status: nextStatus })
        .eq('id', order.id)
        .eq('restaurant_id', restaurantId);

      if (error) throw error;

      await logAuditEvent({
        action: nextStatus === 'Declined' ? 'order_declined' : 'order_accepted',
        details: {
          order_id: order.id,
          ticket_number: order.ticket_number,
          channel: order.order_channel || order.dining_option,
          total_amount: order.total_amount,
        },
        staff: { name: staffName, role: staffRole, restaurantId },
      });

      setPendingOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      alert(`Could not update order #${order.ticket_number}: ${err?.message || err}`);
    } finally {
      setBusyOrderId(null);
    }
  };

  if (pendingOrders.length === 0) return null;

  const activeOrder = pendingOrders[0];
  const isSnoozed = snoozedUntil > Date.now();
  const items = Array.isArray(activeOrder.pos_order_items) ? activeOrder.pos_order_items : [];

  return (
    <div className="fixed inset-x-0 top-0 z-[9999] p-3 sm:p-5 pointer-events-none">
      <div className="max-w-2xl mx-auto bg-slate-950 text-white border-2 border-amber-400 rounded-3xl shadow-2xl shadow-amber-500/30 p-5 pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center animate-bounce shadow-lg shadow-amber-400/30">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                  Incoming Order ({pendingOrders.length} Waiting)
                </span>
                <span className="text-xs font-mono font-black text-amber-300">
                  #{activeOrder.ticket_number || String(activeOrder.id).slice(0, 6)}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                {activeOrder.customer_name || 'Online Guest'} · KES {Number(activeOrder.total_amount || 0).toLocaleString()}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!audioUnlocked && (
              <button
                type="button"
                onClick={async () => {
                  await unlockOrderAlarmAudio();
                  setAudioUnlocked(true);
                  playSingleOrderRing();
                }}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" /> Unmute Bell
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                snoozeOrderAlarm(30000);
                setSnoozedUntil(Date.now() + 30000);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              {isSnoozed ? <VolumeX className="w-3.5 h-3.5 text-amber-400" /> : <Clock className="w-3.5 h-3.5" />}
              {isSnoozed ? 'Snoozed 30s' : 'Snooze 30s'}
            </button>
          </div>
        </div>

        {/* Order Details & Payment Badge */}
        <div className="py-3.5 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-300">
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-bold">
              {activeOrder.order_channel || activeOrder.dining_option || 'Microsite'}
            </span>
            <span className={`px-2.5 py-1 rounded-lg font-black ${
              String(activeOrder.payment_status || '').toLowerCase() === 'paid'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {activeOrder.payment_method || 'M-Pesa'} — {activeOrder.payment_status || 'Pending'}
            </span>
            {activeOrder.customer_phone && (
              <span className="inline-flex items-center gap-1 text-slate-300 font-mono">
                <Phone className="w-3 h-3 text-slate-400" /> {activeOrder.customer_phone}
              </span>
            )}
          </div>

          {items.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 max-h-36 overflow-y-auto space-y-1">
              {items.map((it) => (
                <div key={it.id} className="flex justify-between gap-2 text-xs">
                  <span className="text-slate-100 font-bold">
                    {it.quantity}× {it.item_name}
                    {it.instructions ? <span className="text-slate-400 font-normal"> ({it.instructions})</span> : null}
                  </span>
                  <span className="font-mono text-amber-300 shrink-0">
                    KES {(Number(it.price || 0) * Number(it.quantity || 1)).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          {activeOrder.delivery_address && (
            <p className="text-[11px] text-slate-300">
              <strong className="text-white">Address:</strong> {activeOrder.delivery_address}
            </p>
          )}
          {activeOrder.notes && (
            <p className="text-[11px] text-amber-200/90">
              <strong>Notes:</strong> {activeOrder.notes}
            </p>
          )}
        </div>

        {/* Accept / Decline Primary Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            disabled={busyOrderId === activeOrder.id}
            onClick={() => handleDecision(activeOrder, 'Declined')}
            className="py-3.5 px-4 rounded-2xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 text-red-200 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" /> Decline Order
          </button>
          <button
            type="button"
            disabled={busyOrderId === activeOrder.id}
            onClick={() => handleDecision(activeOrder, 'Preparing')}
            className="py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-50"
          >
            <ChefHat className="w-4 h-4" />
            <Check className="w-4 h-4" />
            Accept &amp; Send to Kitchen
          </button>
        </div>
      </div>
    </div>
  );
}

export default IncomingOrderAlarmOverlay;
