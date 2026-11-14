import React, { useMemo, useState } from 'react';
import {
  Search, Clock, User, Package, MapPin, Truck, Store, UtensilsCrossed,
  Check, X, CheckCircle2, Ban, Printer, RefreshCw, ExternalLink, AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SlideOverDrawer } from './SlideOverDrawer';

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

function normalizeChannelLabel(order) {
  const raw = String(order?.sales_channel || order?.order_channel || order?.channel || 'POS').trim();
  const lower = raw.toLowerCase();
  if (lower.includes('microsite') || lower === 'skg') return 'MICROSITE';
  if (lower.includes('web')) return 'WEB POS';
  if (lower.includes('whatsapp')) return 'WHATSAPP';
  if (lower.includes('glovo')) return 'GLOVO';
  if (lower.includes('bolt')) return 'BOLT';
  if (lower.includes('uber')) return 'UBER EATS';
  if (lower.includes('call')) return 'CALL CENTER';
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

export function LiveOrdersView({
  orders = [],
  restaurantId,
  restaurantName,
  activeBranch,
  statusFilter = 'active',
  onRefresh,
  onCreateOrder,
  onResumeOpenOrder,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('All Channels');
  const [sortOrder, setSortOrder] = useState('newest');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const filteredOrders = useMemo(() => {
    let list = orders;
    if (activeBranch?.id) {
      list = list.filter((o) => !o.branch_id || o.branch_id === activeBranch.id);
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
  }, [orders, activeBranch, statusFilter, channelFilter, searchQuery, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pagedOrders = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, page, totalPages]);

  const updateOrderStatus = async (order, nextStatus, extraPatch = {}) => {
    if (!order?.id || !restaurantId) return;
    setUpdatingId(order.id);
    try {
      const patch = { status: nextStatus, ...extraPatch };
      if (nextStatus === 'Preparing' && !order.kitchen_started_at) {
        patch.kitchen_started_at = new Date().toISOString();
      }
      if (nextStatus === 'Ready' && !order.kitchen_ready_at) {
        patch.kitchen_ready_at = new Date().toISOString();
      }
      if (nextStatus === 'Completed' && !order.completed_at) {
        patch.completed_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('pos_orders')
        .update(patch)
        .eq('id', order.id)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
      if (selectedOrder?.id === order.id) {
        setSelectedOrder((prev) => (prev ? { ...prev, ...patch } : null));
      }
      await onRefresh?.();
    } catch (err) {
      alert('Failed to update order status: ' + (err.message || err));
    } finally {
      setUpdatingId(null);
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
                    <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                      <Clock size={12} />
                      {relativeTimeLabel(order.created_at)}
                    </span>
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
                      onClick={() => updateOrderStatus(order, 'Voided')}
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
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer"
            >
              <Printer size={14} /> Print Receipt
            </button>
            <div className="flex items-center gap-2">
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
              <div className="flex justify-between font-black text-sm text-slate-900 pt-2 border-t border-slate-200">
                <span>Grand Total</span>
                <span className="font-mono text-emerald-700">KES {Number(selectedOrder.total_amount || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </SlideOverDrawer>
    </div>
  );
}
