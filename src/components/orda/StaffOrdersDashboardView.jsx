import React, { useMemo, useState } from 'react';
import { BarChart3, ClipboardList, CheckCircle2, Clock, CreditCard, Store } from 'lucide-react';
import { getBusinessDayStartIso } from '../../lib/posShiftService';
import {
  normalizeChannelLabel,
  formatChannelDisplayName,
  normalizePaymentMethodLabel,
} from '../../lib/orderChannel';
import { isExcludedFromSales, isOrderPaid } from '../../lib/execDashboardMetrics';

export function StaffOrdersDashboardView({
  orders = [],
  staffName = 'Staff',
  staffId = null,
  staffRole = 'cashier',
  canViewPreviousDays = false,
}) {
  const [dateScope, setDateScope] = useState('today'); // 'today' | '7d' | 'all'
  const effectiveDateScope = canViewPreviousDays ? dateScope : 'today';

  const myOrders = useMemo(() => {
    const normalizedStaff = String(staffName || '').trim().toLowerCase();
    const todayStartMs = new Date(getBusinessDayStartIso()).getTime();
    const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return (Array.isArray(orders) ? orders : []).filter((o) => {
      if (!o) return false;
      const matchesStaffId = staffId && o.staff_id && String(o.staff_id) === String(staffId);
      const orderCashier = String(o.cashier_name || o.staff_name || '').trim().toLowerCase();
      const matchesName = normalizedStaff && orderCashier && orderCashier === normalizedStaff;
      if (!matchesStaffId && !matchesName) return false;

      const t = new Date(o.created_at || 0).getTime();
      if (effectiveDateScope === 'today') return t >= todayStartMs;
      if (effectiveDateScope === '7d') return t >= sevenDaysAgoMs;
      return true;
    });
  }, [orders, staffId, staffName, effectiveDateScope]);

  const summary = useMemo(() => {
    let validCount = 0;
    let excludedCount = 0;
    let pendingReturnCount = 0;
    let totalSales = 0;
    let paidTotal = 0;
    let unpaidTotal = 0;
    const byPayment = {};
    const byChannel = {};

    for (const o of myOrders) {
      const amt = Number(o.total_amount || 0);
      const st = String(o.status || '').toLowerCase().trim();
      if (st === 'return pending' || st === 'return_pending' || st === 'return requested') {
        pendingReturnCount += 1;
      }
      if (isExcludedFromSales(o)) {
        excludedCount += 1;
        continue;
      }
      validCount += 1;
      totalSales += amt;
      const paid = isOrderPaid(o);
      if (paid) paidTotal += amt;
      else unpaidTotal += amt;

      const pm = normalizePaymentMethodLabel(o);
      if (!byPayment[pm]) byPayment[pm] = { method: pm, count: 0, amount: 0 };
      byPayment[pm].count += 1;
      byPayment[pm].amount += amt;

      const ch = formatChannelDisplayName(normalizeChannelLabel(o));
      if (!byChannel[ch]) byChannel[ch] = { channel: ch, count: 0, amount: 0 };
      byChannel[ch].count += 1;
      byChannel[ch].amount += amt;
    }

    return {
      validCount,
      excludedCount,
      pendingReturnCount,
      totalSales,
      paidTotal,
      unpaidTotal,
      avgOrder: validCount > 0 ? Math.round(totalSales / validCount) : 0,
      byPayment: Object.values(byPayment).sort((a, b) => b.amount - a.amount),
      byChannel: Object.values(byChannel).sort((a, b) => b.amount - a.amount),
    };
  }, [myOrders]);

  return (
    <div className="space-y-5" data-testid="staff-orders-dashboard">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-black flex items-center justify-center">
            <BarChart3 size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">
              My Orders Dashboard · {staffName}
            </h2>
            <p className="text-xs font-semibold text-slate-500 capitalize">
              Role: {staffRole || 'Staff'} · Personal shift &amp; order breakdown
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setDateScope('today')}
            className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              effectiveDateScope === 'today' ? 'bg-amber-400 text-black shadow-xs' : 'text-slate-600'
            }`}
          >
            Today&apos;s Shift
          </button>
          {canViewPreviousDays && (
            <>
              <button
                type="button"
                onClick={() => setDateScope('7d')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  effectiveDateScope === '7d' ? 'bg-amber-400 text-black shadow-xs' : 'text-slate-600'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setDateScope('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  effectiveDateScope === 'all' ? 'bg-amber-400 text-black shadow-xs' : 'text-slate-600'
                }`}
              >
                All Loaded
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <ClipboardList size={12} /> My Orders
          </p>
          <p className="text-xl font-black text-slate-900 mt-1">{summary.validCount}</p>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
            {summary.excludedCount} void/returned · {summary.pendingReturnCount} pending approval
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">My Total Sales</p>
          <p className="text-xl font-black text-amber-700 mt-1">KES {summary.totalSales.toLocaleString()}</p>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
            Avg: KES {summary.avgOrder.toLocaleString()}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-600" /> Collected / Paid
          </p>
          <p className="text-xl font-black text-emerald-700 mt-1">KES {summary.paidTotal.toLocaleString()}</p>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Settled orders</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Clock size={12} className="text-amber-600" /> Unpaid / Open
          </p>
          <p className="text-xl font-black text-slate-900 mt-1">KES {summary.unpaidTotal.toLocaleString()}</p>
          <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Awaiting settlement</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <CreditCard size={13} /> Payment Methods Breakdown
          </h3>
          {summary.byPayment.length === 0 ? (
            <p className="text-xs text-slate-400">No orders punched in this window yet.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {summary.byPayment.map((p) => (
                <div key={p.method} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-b-0">
                  <span className="font-bold text-slate-800">
                    {p.method} <span className="text-slate-400 font-semibold">({p.count})</span>
                  </span>
                  <span className="font-black text-slate-900">KES {p.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Store size={13} /> Sales Channels Breakdown
          </h3>
          {summary.byChannel.length === 0 ? (
            <p className="text-xs text-slate-400">No orders punched in this window yet.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {summary.byChannel.map((c) => (
                <div key={c.channel} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-b-0">
                  <span className="font-bold text-slate-800">
                    {c.channel} <span className="text-slate-400 font-semibold">({c.count})</span>
                  </span>
                  <span className="font-black text-slate-900">KES {c.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-600">
            My Order History ({myOrders.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Ticket</th>
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Channel</th>
                <th className="py-2.5 px-3">Payment</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myOrders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-black text-slate-900">
                    #{o.ticket_number || String(o.id).slice(0, 6)}
                  </td>
                  <td className="py-2 px-3 text-slate-500">
                    {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-2 px-3 font-semibold text-slate-800">{o.customer_name || 'Guest'}</td>
                  <td className="py-2 px-3 text-slate-600">{formatChannelDisplayName(normalizeChannelLabel(o))}</td>
                  <td className="py-2 px-3 text-slate-600">
                    {normalizePaymentMethodLabel(o)} ({o.payment_status || 'Pending'})
                  </td>
                  <td className="py-2 px-3 font-bold text-slate-700">{o.status || 'Pending'}</td>
                  <td className="py-2 px-3 text-right font-black text-slate-900">
                    KES {Number(o.total_amount || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
              {myOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No orders recorded under your account for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
