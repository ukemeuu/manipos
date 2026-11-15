import React, { useMemo, useState } from 'react';
import {
  Search, Clock, User, Package, MapPin, Truck, Store, UtensilsCrossed,
  Check, X, CheckCircle2, Ban, Printer, RefreshCw, ExternalLink, AlertCircle, Calendar
} from 'lucide-react';
import { supabase, setTenantContext } from '../../lib/supabase';
import { SlideOverDrawer } from './SlideOverDrawer';
import {
  processOrderInventoryDepletion,
  processVoidOrderInventoryDisposition,
} from '../../lib/inventoryErpEngine';
import { printCashierSlips, printKitchenSlips } from '../../lib/posPrintService';
import { getBusinessDayStartIso } from '../../lib/posShiftService';
import { updatePojOrderStatus } from '../../services/data/pojSyncService';

const CHANNEL_OPTIONS = [
  'All Channels',
  'Microsite',
  'Web POS',
  'POS',
  'Call Center',
  'WhatsApp',
  'Glovo',
  'Bolt',
  'Uber Eats',
];

function classifyOrderBucket(order) {
  const status = String(order?.status || 'Pending').toLowerCase().trim();
  const pay = String(order?.payment_status || 'Pending').toLowerCase().trim();

  if (status === 'open' || status === 'saved') return 'open';
  if (status === 'void' || status === 'voided') return 'voided';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'declined' || status === 'rejected') return 'declined';
  if (status === 'failed' || pay === 'failed') return 'failed';
  if (status === 'completed' || status === 'settled' || status === 'delivered') return 'completed';
  if (status === 'shipped' || status === 'dispatched') return 'shipped';
  if (status === 'ready') return 'ready';
  if (status === 'preparing' || status === 'in progress' || status === 'in_progress' || status === 'processing' || status === 'accepted') return 'processing';
  if (status === 'verifying') return 'verifying';
  if (status === 'pending' || status === 'new') return 'new';
  return 'unknown';
}

export function computeOrderBucketCounts(orders = []) {
  const counts = {
    active: 0,
    new: 0,
    verifying: 0,
    processing: 0,
    cancelled: 0,
    declined: 0,
    failed: 0,
    ready: 0,
    shipped: 0,
    completed: 0,
    voided: 0,
    unknown: 0,
    open: 0,
  };
  orders.forEach((o) => {
    const b = classifyOrderBucket(o);
    if (counts[b] !== undefined) counts[b] += 1;
    if (['new', 'verifying', 'processing', 'ready', 'shipped'].includes(b)) {
      counts.active += 1;
    }
  });
  return counts;
}

function relativeTimeLabel(iso) {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diffMins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hr${diffHrs === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function normalizeChannelLabel(order) {
  const sc = String(order?.sales_channel || '').trim();
  const oc = String(order?.order_channel || '').trim();
  const ch = String(order?.channel || '').trim();
  const raw = (sc && sc.toLowerCase() !== 'pos' ? sc : (oc || ch || sc || 'POS')).trim();
  const rawLower = raw.toLowerCase();

  if (rawLower.includes('whatsapp')) return 'WHATSAPP';
  if (rawLower.includes('glovo')) return 'GLOVO';
  if (rawLower.includes('bolt')) return 'BOLT';
  if (rawLower.includes('uber')) return 'UBER EATS';
  if (rawLower.includes('call')) return 'CALL CENTER';
  if (rawLower.includes('web')) return 'WEB POS';

  const combined = [sc, oc, ch, order?.order_source, order?.cashier_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    combined.includes('microsite') ||
    combined.includes('online') ||
    combined.includes('self-service') ||
    oc.toLowerCase() === 'skg' ||
    sc.toLowerCase() === 'skg' ||
    ch.toLowerCase() === 'skg'
  ) {
    return 'MICROSITE';
  }
  return raw.toUpperCase();
}

function channelBadgeStyle(label) {
  if (label === 'MICROSITE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (label === 'WHATSAPP') return 'bg-green-50 text-green-700 border-green-200';
  if (label === 'GLOVO') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (label === 'UBER EATS') return 'bg-slate-900 text-white border-slate-900';
  if (label === 'BOLT') return 'bg-lime-50 text-lime-700 border-lime-200';
  if (label === 'WEB POS') return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function statusPillMeta(bucket, order) {
  const pay = String(order?.payment_status || '').toLowerCase();
  switch (bucket) {
    case 'new':
      return {
        label: pay === 'paid' ? 'New · Online Prepayment Successful' : 'New',
        cls: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'verifying':
      return { label: 'Verifying Payment', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    case 'processing':
      return { label: 'In Progress', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'ready':
      return { label: 'Ready for Pickup / Dispatch', cls: 'bg-teal-50 text-teal-700 border-teal-200' };
    case 'shipped':
      return { label: 'Out for Delivery', cls: 'bg-cyan-50 text-cyan-800 border-cyan-200' };
    case 'completed':
      return { label: 'Completed', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'declined':
      return { label: 'Declined', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'cancelled':
      return { label: 'Cancelled', cls: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'voided':
      return { label: 'Voided', cls: 'bg-slate-200 text-slate-700 border-slate-300' };
    case 'failed':
      return { label: 'Payment Failed', cls: 'bg-red-50 text-red-700 border-red-200' };
    case 'open':
      return { label: 'Open Tab (Unsettled)', cls: 'bg-purple-50 text-purple-700 border-purple-200' };
    default:
      return { label: order?.status || 'Unknown', cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  }
}

function computeDateWindow(preset, customStart, customEnd) {
  const now = new Date();
  const todayStartIso = getBusinessDayStartIso(now);
  const todayStartMs = new Date(todayStartIso).getTime();

  if (preset === 'today') {
    return { startIso: todayStartIso, endIso: now.toISOString() };
  }
  if (preset === 'yesterday') {
    const yStart = new Date(todayStartMs - 24 * 3600 * 1000).toISOString();
    return { startIso: yStart, endIso: todayStartIso };
  }
  if (preset === '7days') {
    return {
      startIso: new Date(todayStartMs - 6 * 24 * 3600 * 1000).toISOString(),
      endIso: now.toISOString(),
    };
  }
  if (preset === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 7, 0, 0, 0);
    return { startIso: first.toISOString(), endIso: now.toISOString() };
  }
  if (preset === 'custom' && customStart) {
    const startDate = new Date(`${customStart}T07:00:00+03:00`);
    const endBase = customEnd ? new Date(`${customEnd}T07:00:00+03:00`) : new Date(`${customStart}T07:00:00+03:00`);
    const endDate = new Date(endBase.getTime() + 24 * 3600 * 1000);
    return { startIso: startDate.toISOString(), endIso: endDate.toISOString() };
  }
  return { startIso: null, endIso: null };
}

export function LiveOrdersView({
  orders = [],
  restaurantId,
  restaurantName,
  activeBranch,
  statusFilter = 'active',
  voidCompletedAllowed = true,
  voidWindowHours = 168,
  onRefresh,
  onCreateOrder,
  onResumeOpenOrder,
  onFetchDateRange,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('All Channels');
  const [sortOrder, setSortOrder] = useState('newest');
  const [datePreset, setDatePreset] = useState('all');
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [rangeLoading, setRangeLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Orda Void Order modal state (per-line Return to Stock vs Mark as Wastage)
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('Customer Cancelled');
  const [voidCustomReason, setVoidCustomReason] = useState('');
  const [voidLineDisposition, setVoidLineDisposition] = useState({});
  const [voidSubmitting, setVoidSubmitting] = useState(false);

  const handleSelectDatePreset = async (preset) => {
    setDatePreset(preset);
    setPage(1);
    if (!onFetchDateRange || preset === 'all') return;
    const { startIso, endIso } = computeDateWindow(preset, customStart, customEnd);
    if (!startIso || !endIso) return;
    setRangeLoading(true);
    try {
      await onFetchDateRange(startIso, endIso);
    } finally {
      setRangeLoading(false);
    }
  };

  const applyCustomDateRange = async () => {
    if (!customStart) return;
    setDatePreset('custom');
    setPage(1);
    if (!onFetchDateRange) return;
    const { startIso, endIso } = computeDateWindow('custom', customStart, customEnd);
    if (!startIso || !endIso) return;
    setRangeLoading(true);
    try {
      await onFetchDateRange(startIso, endIso);
    } finally {
      setRangeLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (activeBranch?.id) {
      list = list.filter((o) => !o.branch_id || o.branch_id === activeBranch.id);
    }

    if (datePreset !== 'all') {
      const { startIso, endIso } = computeDateWindow(datePreset, customStart, customEnd);
      if (startIso && endIso) {
        const startMs = new Date(startIso).getTime();
        const endMs = new Date(endIso).getTime();
        list = list.filter((o) => {
          const ts = new Date(o.created_at || 0).getTime();
          return !Number.isNaN(ts) && ts >= startMs && ts < endMs;
        });
      }
    }

    list = list.filter((o) => {
      const bucket = classifyOrderBucket(o);
      if (statusFilter === 'active') {
        return ['new', 'verifying', 'processing', 'ready', 'shipped'].includes(bucket);
      }
      return bucket === statusFilter;
    });

    if (channelFilter !== 'All Channels') {
      const target = channelFilter.toLowerCase();
      list = list.filter((o) => normalizeChannelLabel(o).toLowerCase().includes(target));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((o) =>
        String(o.ticket_number || '').toLowerCase().includes(q) ||
        String(o.order_number || '').toLowerCase().includes(q) ||
        String(o.id || '').toLowerCase().includes(q) ||
        String(o.customer_name || '').toLowerCase().includes(q) ||
        String(o.customer_phone || '').toLowerCase().includes(q) ||
        String(o.mpesa_receipt_number || '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
  }, [orders, activeBranch, datePreset, customStart, customEnd, statusFilter, channelFilter, searchQuery, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pagedOrders = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, page, totalPages]);

  const updateOrderStatus = async (order, nextStatus, extraPatch = {}) => {
    if (!order?.id || !restaurantId) return;
    setTenantContext(restaurantId);
    setUpdatingId(order.id);
    try {
      const patch = { status: nextStatus, ...extraPatch };
      if (nextStatus === 'Declined' && patch.payment_status === undefined && String(order.payment_status || '').toLowerCase() !== 'paid') {
        patch.payment_status = 'Voided';
      }
      if (nextStatus === 'Preparing' && !order.accepted_at) {
        patch.accepted_at = new Date().toISOString();
      }
      if (nextStatus === 'Preparing' && !order.kitchen_started_at) {
        patch.kitchen_started_at = new Date().toISOString();
      }
      if (nextStatus === 'Ready' && !order.kitchen_ready_at) {
        patch.kitchen_ready_at = new Date().toISOString();
      }
      if (nextStatus === 'Completed' && !order.completed_at) {
        patch.completed_at = new Date().toISOString();
      }

      let updatedLocally = false;
      if (!order._fromPoj) {
        const optionalCols = ['accepted_at', 'kitchen_started_at', 'kitchen_ready_at', 'completed_at', 'payment_status'];
        let workingPatch = { ...patch };
        let res = null;
        for (let i = 0; i <= optionalCols.length; i += 1) {
          res = await supabase
            .from('pos_orders')
            .update(workingPatch)
            .eq('id', order.id)
            .eq('restaurant_id', restaurantId)
            .select('id, status');
          if (!res.error) break;
          const msg = String(res.error.message || '').toLowerCase();
          const missingCol = optionalCols.find((col) => col in workingPatch && msg.includes(col));
          if (!missingCol) break;
          const next = { ...workingPatch };
          delete next[missingCol];
          workingPatch = next;
        }
        if (res?.error) throw res.error;
        updatedLocally = Array.isArray(res?.data) && res.data.length > 0;
      }

      let updatedPoj = false;
      if (order._fromPoj || order.source_poj_id || !updatedLocally) {
        const pojId = order.source_poj_id || order.id;
        const pojRes = await updatePojOrderStatus({
          restaurantId,
          pojOrderId: pojId,
          patch,
        });
        updatedPoj = Boolean(pojRes?.ok);
        if (order._fromPoj && !updatedPoj && pojRes?.error) {
          throw new Error(pojRes.error);
        }
      }

      if (!updatedLocally && !updatedPoj) {
        throw new Error('Order update did not match an active order record. Please refresh and try again.');
      }

      if (nextStatus === 'Completed') {
        processOrderInventoryDepletion({
          restaurantId,
          order,
          staffName: order.cashier_name || 'Staff',
        });
      }
      if (selectedOrder?.id === order.id) {
        setSelectedOrder((prev) => (prev ? { ...prev, ...patch } : null));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('manipos:orders-updated'));
      }
      await onRefresh?.();
    } catch (err) {
      alert('Failed to update order status: ' + (err.message || err));
    } finally {
      setUpdatingId(null);
    }
  };

  const canVoidOrder = (order) => {
    const b = classifyOrderBucket(order);
    if (b === 'voided' || b === 'cancelled' || b === 'declined') return false;
    if (b === 'completed') {
      if (!voidCompletedAllowed) return false;
      const hours = Number(voidWindowHours || 168);
      if (hours > 0) {
        const refDate = new Date(order.completed_at || order.created_at || Date.now()).getTime();
        if (Date.now() - refDate > hours * 3600 * 1000) return false;
      }
    }
    return true;
  };

  const openVoidModal = (order) => {
    const lines = renderLines(order);
    const initialMap = {};
    lines.forEach((line, idx) => {
      initialMap[line.id || idx] = 'return_to_stock';
    });
    setVoidLineDisposition(initialMap);
    setVoidReason('Customer Cancelled');
    setVoidCustomReason('');
    setVoidTarget(order);
  };

  const confirmVoidOrder = async () => {
    if (!voidTarget?.id || !restaurantId) return;
    const finalReason = voidReason === 'Other' ? (voidCustomReason.trim() || 'Voided by staff') : voidReason;
    const lines = renderLines(voidTarget);
    const dispositionDetails = lines.map((line, idx) => ({
      item_name: line.item_name || line.name || 'Item',
      quantity: Number(line.quantity || 1),
      disposition: voidLineDisposition[line.id || idx] || 'return_to_stock',
    }));

    setTenantContext(restaurantId);
    setVoidSubmitting(true);
    try {
      const fullPatch = {
        status: 'Voided',
        void_reason: finalReason,
        void_disposition: dispositionDetails,
      };
      let res = null;
      if (!voidTarget._fromPoj) {
        res = await supabase
          .from('pos_orders')
          .update(fullPatch)
          .eq('id', voidTarget.id)
          .eq('restaurant_id', restaurantId);

        // Fail-safe fallback when Wave 2 migration columns have not been applied yet
        if (res.error) {
          const msg = String(res.error.message || '').toLowerCase();
          if (msg.includes('void_disposition') || msg.includes('void_reason')) {
            const fallbackPatch = {
              status: 'Voided',
              notes: [voidTarget.notes, `[VOID: ${finalReason}]`].filter(Boolean).join(' | '),
            };
            res = await supabase
              .from('pos_orders')
              .update(fallbackPatch)
              .eq('id', voidTarget.id)
              .eq('restaurant_id', restaurantId);
          }
        }
        if (res.error) throw res.error;
      }
      if (voidTarget._fromPoj || voidTarget.source_poj_id) {
        await updatePojOrderStatus({
          restaurantId,
          pojOrderId: voidTarget.source_poj_id || voidTarget.id,
          patch: fullPatch,
        });
      }
      processVoidOrderInventoryDisposition({
        restaurantId,
        order: voidTarget,
        dispositionDetails,
        voidReason: finalReason,
        staffName: 'Staff',
      });
      if (selectedOrder?.id === voidTarget.id) {
        setSelectedOrder((prev) => (prev ? { ...prev, ...fullPatch } : null));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('manipos:orders-updated'));
      }
      setVoidTarget(null);
      await onRefresh?.();
    } catch (err) {
      alert('Failed to void order: ' + (err.message || err));
    } finally {
      setVoidSubmitting(false);
    }
  };

  const renderLines = (order) => {
    if (Array.isArray(order?.pos_order_items) && order.pos_order_items.length > 0) {
      return order.pos_order_items;
    }
    if (Array.isArray(order?.items) && order.items.length > 0) {
      return order.items;
    }
    return [];
  };

  const buildPrintableReceipt = (order) => {
    const lines = renderLines(order);
    return {
      ticketNumber: order.ticket_number || order.order_number || String(order.id || '').slice(0, 8),
      customerName: order.customer_name || 'Walk-in Guest',
      customerPhone: order.customer_phone || '',
      diningOption: order.dining_option || 'Dine In',
      tableNumber: order.table_number || '',
      deliveryAddress: order.delivery_address || '',
      deliveryFee: Number(order.delivery_fee || 0),
      totalAmount: Number(order.total_amount || 0),
      paymentMethod: order.payment_method || 'Cash',
      paymentStatus: order.payment_status || 'pending',
      cashier: order.cashier_name || order.staff_name || 'Staff',
      notes: order.notes || '',
      createdAt: order.created_at || new Date().toISOString(),
      branch: activeBranch?.name || restaurantName || 'Main Branch',
      items: lines.map((line) => ({
        name: line.item_name || line.name || 'Item',
        quantity: Number(line.quantity || 1),
        price: Number(line.unit_price ?? line.price ?? 0),
        note: line.note || line.modifiers || '',
        brand: line.brand || '',
      })),
    };
  };

  const titles = {
    active: 'Active Orders',
    new: 'New Orders',
    verifying: 'Verifying Payment Orders',
    processing: 'Orders In Progress',
    ready: 'Ready Orders',
    shipped: 'Out for Delivery',
    completed: 'Completed Orders',
    cancelled: 'Cancelled Orders',
    declined: 'Declined Orders',
    failed: 'Failed Payment Orders',
    voided: 'Voided Orders',
    open: 'Open Pending Orders',
    unknown: 'Other Orders',
  };

  return (
    <div className="space-y-5">
      {/* Header & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">
            {titles[statusFilter] || 'Orders'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {statusFilter === 'open'
              ? 'Unsettled open tabs saved from POS or Web POS.'
              : 'Real-time order pipeline across Digital Storefront, POS, WhatsApp, and Aggregators.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search Order #, customer, M-Pesa receipt..."
              className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 w-64 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <select
            value={channelFilter}
            onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600"
          >
            {CHANNEL_OPTIONS.map((ch) => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-600"
          >
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
          </select>

          <button
            type="button"
            onClick={() => onRefresh?.()}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
            title="Refresh orders"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Business-Day & Historical Date Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400 mr-1">
            <Calendar size={12} /> Window:
          </span>
          {[
            { id: 'all', label: 'All Loaded' },
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: '7days', label: '7 Days' },
            { id: 'month', label: 'This Month' },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectDatePreset(preset.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                datePreset === preset.id
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700"
          />
          <span className="text-slate-400 font-bold">–</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700"
          />
          <button
            type="button"
            onClick={applyCustomDateRange}
            disabled={rangeLoading}
            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {rangeLoading ? 'Loading…' : 'Apply'}
          </button>
        </div>
      </div>

      {/* Empty State */}
      {pagedOrders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
            <Package size={22} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">No orders in {titles[statusFilter] || 'this view'}</p>
            <p className="text-xs text-slate-500 mt-1">
              Incoming digital menu, POS, and phone orders appear here automatically.
            </p>
          </div>
          {onCreateOrder && (
            <button
              type="button"
              onClick={onCreateOrder}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              + Create Order
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {pagedOrders.map((order) => {
            const bucket = classifyOrderBucket(order);
            const pill = statusPillMeta(bucket, order);
            const chLabel = normalizeChannelLabel(order);
            const lines = renderLines(order);
            const itemCount = lines.reduce((sum, l) => sum + (Number(l.quantity) || 1), 0) || lines.length;
            const busy = updatingId === order.id;

            return (
              <div
                key={order.id}
                className="bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl overflow-hidden shadow-xs transition-all flex flex-col md:flex-row"
              >
                {/* Main Order Content */}
                <div
                  onClick={() => setSelectedOrder(order)}
                  className="flex-1 p-5 cursor-pointer space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-black text-slate-900">
                        Order #{order.ticket_number || order.order_number || String(order.id).slice(0, 8)}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${pill.cls}`}>
                        {pill.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black tracking-wider border ${channelBadgeStyle(chLabel)}`}>
                        {chLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          printCashierSlips(buildPrintableReceipt(order));
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer"
                        title="Print Thermal Receipt"
                      >
                        <Printer size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          printKitchenSlips(buildPrintableReceipt(order));
                        }}
                        className="px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold cursor-pointer"
                        title="Print Kitchen KOT"
                      >
                        KOT
                      </button>
                      <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                        <Clock size={12} />
                        {relativeTimeLabel(order.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Customer</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5 truncate">
                        <User size={12} className="text-slate-400 shrink-0" />
                        {order.customer_name || 'Guest Customer'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Items</span>
                      <span className="font-bold text-slate-800 block mt-0.5">
                        {itemCount} {itemCount === 1 ? 'Item' : 'Items'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Fulfillment</span>
                      <span className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                        {order.dining_option === 'Delivery' ? (
                          <Truck size={12} className="text-amber-600" />
                        ) : order.dining_option === 'Takeaway' || order.dining_option === 'Pickup' ? (
                          <Store size={12} className="text-sky-600" />
                        ) : (
                          <UtensilsCrossed size={12} className="text-emerald-600" />
                        )}
                        {order.dining_option || 'Dine-in'}
                        {order.table_number ? ` · ${order.table_number}` : ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Location</span>
                      <span className="font-semibold text-slate-700 flex items-center gap-1 mt-0.5 truncate">
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        {activeBranch?.name || restaurantName || 'Main Location'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">Total</span>
                      <span className="font-black text-emerald-700 font-mono block mt-0.5">
                        KES {Number(order.total_amount || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {Number(order.delivery_fee || 0) > 0 && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-600 pt-1">
                      <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold">
                        Delivery: {order.delivery_provider || 'In-House Delivery'}
                      </span>
                      <span className="font-mono font-bold text-slate-800">
                        KES {Number(order.delivery_fee).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Orda-style Full-Height Action Buttons */}
                {(bucket === 'new' || bucket === 'verifying') && (
                  <div className="flex md:flex-col border-t md:border-t-0 md:border-l border-slate-200 md:w-32 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateOrderStatus(order, 'Preparing')}
                      className="flex-1 py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Check size={14} /> Accept
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateOrderStatus(order, 'Declined')}
                      className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <X size={14} /> Decline
                    </button>
                  </div>
                )}

                {bucket === 'processing' && (
                  <div className="flex md:flex-col border-t md:border-t-0 md:border-l border-slate-200 md:w-32 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateOrderStatus(order, 'Ready')}
                      className="flex-1 py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 size={14} /> Ready
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateOrderStatus(order, 'Cancelled')}
                      className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Ban size={14} /> Cancel
                    </button>
                  </div>
                )}

                {(bucket === 'ready' || bucket === 'shipped') && (
                  <div className="flex md:flex-col border-t md:border-t-0 md:border-l border-slate-200 md:w-36 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => updateOrderStatus(order, 'Completed')}
                      className="flex-1 py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 size={14} /> Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink size={13} /> Details
                    </button>
                  </div>
                )}

                {bucket === 'open' && onResumeOpenOrder && (
                  <div className="flex md:flex-col border-t md:border-t-0 md:border-l border-slate-200 md:w-36 shrink-0">
                    <button
                      type="button"
                      onClick={() => onResumeOpenOrder(order)}
                      className="flex-1 py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      Settle Tab
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openVoidModal(order)}
                      className="flex-1 py-3 px-4 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      Void Tab
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-slate-600">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40 cursor-pointer"
            >
              Prev
            </button>
            <span className="px-2 font-bold">Page {page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Slide-Over Order & Receipt Details Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder ? `Order #${selectedOrder.ticket_number || selectedOrder.order_number || String(selectedOrder.id).slice(0, 8)}` : ''}
        subtitle={selectedOrder ? `${normalizeChannelLabel(selectedOrder)} · ${new Date(selectedOrder.created_at).toLocaleString('en-KE')}` : ''}
        footer={selectedOrder && (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => printCashierSlips(buildPrintableReceipt(selectedOrder))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer"
              >
                <Printer size={14} /> Print Receipt
              </button>
              <button
                type="button"
                onClick={() => printKitchenSlips(buildPrintableReceipt(selectedOrder))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-bold text-amber-900 cursor-pointer"
              >
                <Printer size={14} /> Print KOT
              </button>
            </div>
            <div className="flex items-center gap-2">
              {(classifyOrderBucket(selectedOrder) === 'new' || classifyOrderBucket(selectedOrder) === 'verifying') && (
                <>
                  <button
                    type="button"
                    disabled={updatingId === selectedOrder.id}
                    onClick={() => updateOrderStatus(selectedOrder, 'Declined')}
                    className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={updatingId === selectedOrder.id}
                    onClick={() => updateOrderStatus(selectedOrder, 'Preparing')}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    Accept Order
                  </button>
                </>
              )}
              {canVoidOrder(selectedOrder) && (
                <button
                  type="button"
                  onClick={() => openVoidModal(selectedOrder)}
                  className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                >
                  Void Order
                </button>
              )}
              {classifyOrderBucket(selectedOrder) !== 'completed' && classifyOrderBucket(selectedOrder) !== 'voided' && (
                <button
                  type="button"
                  onClick={() => updateOrderStatus(selectedOrder, 'Completed', { payment_status: 'Paid' })}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
                >
                  Mark Completed
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </>
        )}
      >
        {selectedOrder && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs">
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Status</span>
                <p className="font-bold text-slate-900 mt-0.5">{selectedOrder.status || 'Pending'}</p>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Payment</span>
                <p className="font-bold text-slate-900 mt-0.5">
                  {selectedOrder.payment_method || 'Cash'} ({selectedOrder.payment_status || 'Pending'})
                </p>
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Customer</span>
                <p className="font-bold text-slate-900 mt-0.5">{selectedOrder.customer_name || 'Guest Customer'}</p>
                {selectedOrder.customer_phone && (
                  <p className="text-slate-500 font-mono text-[11px]">{selectedOrder.customer_phone}</p>
                )}
              </div>
              <div>
                <span className="text-slate-400 font-bold uppercase text-[10px]">Clerk / Cashier</span>
                <p className="font-bold text-slate-900 mt-0.5">{selectedOrder.staff_name || selectedOrder.cashier_name || '—'}</p>
              </div>
              {selectedOrder.mpesa_receipt_number && (
                <div className="col-span-2">
                  <span className="text-slate-400 font-bold uppercase text-[10px]">M-Pesa Receipt</span>
                  <p className="font-mono font-bold text-emerald-700 mt-0.5">{selectedOrder.mpesa_receipt_number}</p>
                </div>
              )}
              {selectedOrder.notes && (
                <div className="col-span-2">
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Order Notes</span>
                  <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{selectedOrder.notes}</p>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Cart Items</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Qty</th>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {renderLines(selectedOrder).map((line, i) => (
                      <tr key={line.id || i}>
                        <td className="py-2.5 px-3 font-bold">{line.quantity || 1}x</td>
                        <td className="py-2.5 px-3">
                          <p className="font-bold text-slate-900">{line.item_name || line.name || 'Item'}</p>
                          {Array.isArray(line.modifiers) && line.modifiers.length > 0 && (
                            <p className="text-[11px] text-slate-500">{line.modifiers.join(', ')}</p>
                          )}
                          {line.instructions && (
                            <p className="text-[11px] text-amber-700 italic">{line.instructions}</p>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          KES {((Number(line.price) || 0) * (Number(line.quantity) || 1)).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {renderLines(selectedOrder).length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-4 px-3 text-center text-slate-400">
                          <AlertCircle size={14} className="inline mr-1" /> Line items not loaded for this order.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-mono">KES {Number(selectedOrder.subtotal ?? selectedOrder.total_amount ?? 0).toLocaleString()}</span>
              </div>
              {Number(selectedOrder.discount_amount || selectedOrder.discount || 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-mono">-KES {Number(selectedOrder.discount_amount || selectedOrder.discount).toLocaleString()}</span>
                </div>
              )}
              {Number(selectedOrder.delivery_fee || 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee</span>
                  <span className="font-mono">KES {Number(selectedOrder.delivery_fee).toLocaleString()}</span>
                </div>
              )}
              {Array.isArray(selectedOrder.charges_breakdown) && selectedOrder.charges_breakdown.length > 0 ? (
                selectedOrder.charges_breakdown.map((chg, idx) => (
                  <div key={chg.id || idx} className="flex justify-between text-slate-600">
                    <span>{chg.title || chg.name}{chg.is_inclusive ? ' (Incl.)' : ''}</span>
                    <span className="font-mono">KES {Number(chg.amount || 0).toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <>
                  {Number(selectedOrder.tax_amount || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax / VAT</span>
                      <span className="font-mono">KES {Number(selectedOrder.tax_amount).toLocaleString()}</span>
                    </div>
                  )}
                  {Number(selectedOrder.charges_amount || 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Service & Additional Charges</span>
                      <span className="font-mono">KES {Number(selectedOrder.charges_amount).toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between font-black text-sm text-slate-900 pt-2 border-t border-slate-200">
                <span>Grand Total</span>
                <span className="font-mono text-emerald-700">KES {Number(selectedOrder.total_amount || 0).toLocaleString()}</span>
              </div>
              {selectedOrder.void_reason && (
                <div className="mt-2 pt-2 border-t border-rose-200 text-rose-700 font-bold text-[11px]">
                  Void Reason: {selectedOrder.void_reason}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Void Order Reason & Inventory Disposition Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Void Order #{voidTarget.ticket_number || String(voidTarget.id).slice(0, 8)}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose void reason and specify whether each item returns to inventory stock or is logged as wastage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Void Reason</label>
              <select
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
              >
                <option value="Customer Cancelled">Customer Cancelled</option>
                <option value="Wrong Order Entered">Wrong Order Entered</option>
                <option value="Kitchen Out of Stock">Kitchen Out of Stock</option>
                <option value="Payment Failed / Reversed">Payment Failed / Reversed</option>
                <option value="Duplicate Order">Duplicate Order</option>
                <option value="Test / Training Order">Test / Training Order</option>
                <option value="Other">Other (Specify)</option>
              </select>
              {voidReason === 'Other' && (
                <input
                  type="text"
                  value={voidCustomReason}
                  onChange={(e) => setVoidCustomReason(e.target.value)}
                  placeholder="Enter exact void reason..."
                  className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              )}
            </div>

            {renderLines(voidTarget).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Per-Item Stock Disposition</span>
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        const m = {};
                        renderLines(voidTarget).forEach((l, i) => { m[l.id || i] = 'return_to_stock'; });
                        setVoidLineDisposition(m);
                      }}
                      className="text-emerald-700 hover:underline"
                    >
                      All Return to Stock
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const m = {};
                        renderLines(voidTarget).forEach((l, i) => { m[l.id || i] = 'wastage'; });
                        setVoidLineDisposition(m);
                      }}
                      className="text-rose-700 hover:underline"
                    >
                      All Wastage
                    </button>
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {renderLines(voidTarget).map((line, i) => {
                    const key = line.id || i;
                    const mode = voidLineDisposition[key] || 'return_to_stock';
                    return (
                      <div key={key} className="p-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{line.quantity || 1}x {line.item_name || line.name || 'Item'}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setVoidLineDisposition((prev) => ({ ...prev, [key]: 'return_to_stock' }))}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border ${
                              mode === 'return_to_stock'
                                ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                                : 'bg-white border-slate-200 text-slate-500'
                            }`}
                          >
                            Return to Stock
                          </button>
                          <button
                            type="button"
                            onClick={() => setVoidLineDisposition((prev) => ({ ...prev, [key]: 'wastage' }))}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border ${
                              mode === 'wastage'
                                ? 'bg-rose-50 border-rose-600 text-rose-800'
                                : 'bg-white border-slate-200 text-slate-500'
                            }`}
                          >
                            Mark as Wastage
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={voidSubmitting}
                onClick={confirmVoidOrder}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black disabled:opacity-50"
              >
                {voidSubmitting ? 'Voiding...' : 'Confirm Void Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
