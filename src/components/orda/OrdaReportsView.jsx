import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Download, FileText, Filter, Calendar, Receipt, Percent,
  CreditCard, Monitor, Printer, ChevronDown, ChevronUp, Loader2, X, Mail, Check
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import jsPDF from 'jspdf';
import { supabase } from '../../lib/supabase';
import { SlideOverDrawer } from './SlideOverDrawer';
import {
  getDatePresetRange,
  isExcludedFromSales,
  isCompletedOrderStatus,
  getOrderItemsList,
  computeExecDashboardMetrics,
} from '../../lib/execDashboardMetrics';
import {
  normalizeChannelLabel,
  formatChannelDisplayName,
  normalizePaymentMethodLabel,
} from '../../lib/orderChannel';

const DATE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 Days' },
  { id: 'month', label: 'This Month' },
];

const EOD_SECTIONS = [
  'Report Summary',
  'Profit And Loss Statement',
  'Tax & Charges Report',
  'Payment Collection Report',
  'Transaction Channels Report',
  'Discount Report',
  'Modifier Item Options Report',
  'Order Item Sales Report',
];

function downloadCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getBusinessDayBounds(dateStr) {
  // 6:00 AM on selected date through 5:59:59 AM next day
  const start = new Date(`${dateStr}T06:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1000);
  return { start, end };
}

function defaultDateRange() {
  return getDatePresetRange('today');
}

const orderItemsOf = getOrderItemsList;
const isCompletedOrder = isCompletedOrderStatus;
const isSalesValidOrder = (o) => !isExcludedFromSales(o);

export function OrdaReportsView({
  reportKey = 'overview', // 'overview' | 'transactions' | 'sales' | 'tax' | 'eod' | 'discounts' | 'pos'
  onSelectReport,
  onDateRangeChange,
  orders = [],
  menuItems = [],
  discounts = [],
  branches = [],
  activeBranch = 'all',
  restaurantId,
  restaurantName = 'ManiPOS Store',
}) {
  const initRange = defaultDateRange();
  const [datePreset, setDatePreset] = useState('today');
  const [startDate, setStartDate] = useState(initRange.start);
  const [endDate, setEndDate] = useState(initRange.end);
  const [deliveryFilter, setDeliveryFilter] = useState('All');

  const notifyDateRange = (sDate, eDate) => {
    if (!onDateRangeChange || !sDate || !eDate) return;
    try {
      const startIso = new Date(`${sDate}T00:00:00`).toISOString();
      const endIso = new Date(`${eDate}T23:59:59.999`).toISOString();
      onDateRangeChange(startIso, endIso);
    } catch (_) { }
  };

  const applyDatePreset = (presetId) => {
    const next = getDatePresetRange(presetId);
    setDatePreset(presetId);
    setStartDate(next.start);
    setEndDate(next.end);
    notifyDateRange(next.start, next.end);
  };
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [channelFilter, setChannelFilter] = useState('All');
  const [clerkFilter, setClerkFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Sub-tabs
  const [salesSubTab, setSalesSubTab] = useState('items'); // 'items' | 'modifiers' | 'combos'
  const [discountSubTab, setDiscountSubTab] = useState('discounts'); // 'discounts' | 'promotions' | 'loyalty'
  const [expandedTxId, setExpandedTxId] = useState(null);

  // Tax & EOD & Devices backend data
  const [chargeLines, setChargeLines] = useState([]);
  const [eodHistory, setEodHistory] = useState([]);
  const [devices, setDevices] = useState([]);
  const [posRefFilter, setPosRefFilter] = useState('');
  const [posStatusFilter, setPosStatusFilter] = useState('All');
  const [posDrawerOrder, setPosDrawerOrder] = useState(null);

  // Custom EOD Report Modal
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [eodEmail, setEodEmail] = useState('');
  const [eodLocation, setEodLocation] = useState('all');
  const [selectedSections, setSelectedSections] = useState([...EOD_SECTIONS]);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    (async () => {
      try {
        const [clRes, eodRes, devRes] = await Promise.all([
          supabase.from('order_charge_lines').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(500),
          supabase.from('eod_reports').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(50),
          supabase.from('pos_devices').select('*').eq('restaurant_id', restaurantId).order('last_seen', { ascending: false }),
        ]);
        if (!active) return;
        if (!clRes.error) setChargeLines(clRes.data || []);
        if (!eodRes.error) setEodHistory(eodRes.data || []);
        if (!devRes.error) setDevices(devRes.data || []);
      } catch (_) { }
    })();
    return () => { active = false; };
  }, [restaurantId]);

  const branchName = (branchId) => {
    const found = branches.find((b) => b.id === branchId);
    return found?.name || restaurantName;
  };

  const menuCostMap = useMemo(() => {
    const m = new Map();
    menuItems.forEach((it) => {
      m.set(String(it.name || '').toLowerCase(), {
        cost: Number(it.cost_price || it.unit_cost || 0),
        category: it.category || 'General',
      });
    });
    return m;
  }, [menuItems]);

  const filterLists = useMemo(() => {
    const payments = new Set();
    const channels = new Set();
    const clerks = new Set();
    const cats = new Set();
    orders.forEach((o) => {
      payments.add(normalizePaymentMethodLabel(o));
      channels.add(formatChannelDisplayName(normalizeChannelLabel(o)));
      if (o.cashier_name) clerks.add(o.cashier_name);
    });
    menuItems.forEach((m) => m.category && cats.add(m.category));
    return {
      payments: ['All', ...Array.from(payments)],
      channels: ['All', ...Array.from(channels)],
      clerks: ['All', ...Array.from(clerks)],
      categories: ['All', ...Array.from(cats)],
    };
  }, [orders, menuItems]);

  const scopedOrders = useMemo(() => {
    const sTime = new Date(`${startDate}T00:00:00`).getTime();
    const eTime = new Date(`${endDate}T23:59:59.999`).getTime();
    return orders.filter((o) => {
      if (activeBranch !== 'all' && o.branch_id && o.branch_id !== activeBranch) return false;
      const t = new Date(o.created_at || 0).getTime();
      if (t < sTime || t > eTime) return false;
      if (deliveryFilter !== 'All' && String(o.dining_option || '').toLowerCase() !== deliveryFilter.toLowerCase()) return false;
      if (paymentFilter !== 'All' && normalizePaymentMethodLabel(o) !== paymentFilter) return false;
      if (channelFilter !== 'All' && formatChannelDisplayName(normalizeChannelLabel(o)) !== channelFilter) return false;
      if (clerkFilter !== 'All' && (o.cashier_name || '') !== clerkFilter) return false;
      return true;
    });
  }, [orders, activeBranch, startDate, endDate, deliveryFilter, paymentFilter, channelFilter, clerkFilter]);

  // Executive Dashboard Metrics (valid non-cancelled/voided/returned orders + Processing Stages + Channels + Payment Methods)
  const execMetrics = useMemo(
    () => computeExecDashboardMetrics(scopedOrders, menuCostMap),
    [scopedOrders, menuCostMap]
  );

  // Sales Report Aggregations (Items, Modifiers, Combos)
  const salesBreakdown = useMemo(() => {
    const itemsMap = {};
    const modMap = {};
    const comboMap = {};

    scopedOrders.filter(isSalesValidOrder).forEach((o) => {
      const loc = branchName(o.branch_id);
      orderItemsOf(o).forEach((it) => {
        const name = it.item_name || 'Item';
        if (name === 'Delivery Fee') return;
        const meta = menuCostMap.get(name.toLowerCase()) || { cost: 0, category: 'General' };
        if (categoryFilter !== 'All' && meta.category !== categoryFilter) return;

        const qty = Number(it.quantity || 1);
        const unitP = Number(it.unit_price ?? it.price ?? 0);
        const lineTotal = Number(it.total_price ?? unitP * qty);
        const lineCost = meta.cost * qty;

        const key = `${name}::${loc}`;
        if (!itemsMap[key]) {
          itemsMap[key] = { name, category: meta.category, location: loc, qty: 0, orderIds: new Set(), total: 0, cost: 0 };
        }
        itemsMap[key].qty += qty;
        itemsMap[key].orderIds.add(o.id);
        itemsMap[key].total += lineTotal;
        itemsMap[key].cost += lineCost;

        const instr = String(it.instructions || '');
        if (instr.toLowerCase().includes('combo')) {
          if (!comboMap[key]) comboMap[key] = { id: it.id || key, name, orderIds: new Set(), qty: 0, total: 0, location: loc };
          comboMap[key].orderIds.add(o.id);
          comboMap[key].qty += qty;
          comboMap[key].total += lineTotal;
        }
        if (instr) {
          instr.split('|').forEach((segment) => {
            const cleaned = segment.trim();
            if (!cleaned || cleaned.startsWith('Note:')) return;
            const [groupTitle, rawOpts] = cleaned.includes(':') ? cleaned.split(':', 2) : ['Option', cleaned];
            String(rawOpts || '').split(',').forEach((optStr) => {
              const optName = optStr.trim();
              if (!optName) return;
              const mKey = `${groupTitle.trim()}::${optName}`;
              if (!modMap[mKey]) modMap[mKey] = { title: groupTitle.trim(), option: optName, count: 0, location: loc };
              modMap[mKey].count += qty;
            });
          });
        }
      });
    });

    return {
      items: Object.values(itemsMap).map((x) => ({
        ...x,
        orderCount: x.orderIds.size,
        margin: x.total - x.cost,
      })).sort((a, b) => b.total - a.total),
      modifiers: Object.values(modMap).sort((a, b) => b.count - a.count),
      combos: Object.values(comboMap).map((c) => ({ ...c, orderCount: c.orderIds.size })),
    };
  }, [scopedOrders, categoryFilter, menuCostMap, branches]);

  // Tax & Charges rows (combines explicit order_charge_lines + pos_orders.charges_breakdown fallback)
  const taxRows = useMemo(() => {
    if (chargeLines.length > 0) {
      const sTime = new Date(`${startDate}T00:00:00`).getTime();
      const eTime = new Date(`${endDate}T23:59:59`).getTime();
      return chargeLines.filter((c) => {
        const t = new Date(c.created_at || 0).getTime();
        return t >= sTime && t <= eTime;
      });
    }
    const derived = [];
    scopedOrders.filter(isSalesValidOrder).forEach((o) => {
      const b = Array.isArray(o.charges_breakdown) ? o.charges_breakdown : [];
      b.forEach((line, idx) => {
        derived.push({
          id: `${o.id}_${idx}`,
          order_id: o.id,
          increment_id: o.ticket_number || o.id?.slice(0, 6),
          title: line.title,
          is_tax_charge: line.is_tax_charge,
          charge_percent: line.charge_percent,
          charge_value: line.amount,
          base_grand_total: o.total_amount,
          source: formatChannelDisplayName(normalizeChannelLabel(o)),
          created_at: o.created_at,
        });
      });
    });
    return derived;
  }, [chargeLines, scopedOrders, startDate, endDate]);

  // Custom 8-section EOD PDF Generator using jsPDF
  const handleGenerateCustomEodPdf = async (e) => {
    e.preventDefault();
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const { start } = getBusinessDayBounds(startDate);
      const dayOrders = orders.filter((o) => {
        const t = new Date(o.created_at || 0).getTime();
        return t >= start.getTime() && t <= new Date(`${endDate}T23:59:59.999`).getTime();
      });
      const done = dayOrders.filter(isSalesValidOrder);
      const gross = done.reduce((s, o) => s + Number(o.total_amount || 0), 0);
      const disc = done.reduce((s, o) => s + Number(o.discount || 0), 0);
      const tax = done.reduce((s, o) => s + Number(o.tax_amount || 0), 0);

      let y = 48;
      doc.setFontSize(16);
      doc.text(`${restaurantName} — End of Day Report`, 40, y);
      y += 18;
      doc.setFontSize(10);
      doc.text(`Hospitality Window: ${startDate} 06:00 AM to ${endDate} (Next Day 06:00 AM)`, 40, y);
      y += 22;

      const writeHeading = (title) => {
        if (y > 750) { doc.addPage(); y = 48; }
        doc.setFontSize(12);
        doc.text(title, 40, y);
        y += 16;
        doc.setFontSize(9.5);
      };

      if (selectedSections.includes('Report Summary')) {
        writeHeading('1. Report Summary');
        doc.text(`Completed Orders: ${done.length}  |  Gross Sales: KES ${gross.toLocaleString()}  |  Avg Order: KES ${done.length ? Math.round(gross / done.length).toLocaleString() : 0}`, 40, y);
        y += 20;
      }
      if (selectedSections.includes('Profit And Loss Statement')) {
        writeHeading('2. Profit & Loss Summary');
        doc.text(`Gross Revenue: KES ${gross.toLocaleString()}  |  Discounts: KES ${disc.toLocaleString()}  |  Ideal COGS: KES ${execMetrics.idealFoodCost.toLocaleString()}`, 40, y);
        y += 20;
      }
      if (selectedSections.includes('Tax & Charges Report')) {
        writeHeading('3. Tax & Charges');
        doc.text(`Recorded Tax / Levies: KES ${tax.toLocaleString()}`, 40, y);
        y += 20;
      }
      if (selectedSections.includes('Payment Collection Report')) {
        writeHeading('4. Payment Collection');
        execMetrics.byPayment.forEach((p) => {
          if (y > 760) { doc.addPage(); y = 48; }
          doc.text(`- ${p.method}: ${p.count} orders — KES ${p.amount.toLocaleString()}`, 48, y);
          y += 14;
        });
        y += 8;
      }
      if (selectedSections.includes('Transaction Channels Report')) {
        writeHeading('5. Transaction Channels');
        execMetrics.byChannel.forEach((c) => {
          if (y > 760) { doc.addPage(); y = 48; }
          doc.text(`- ${c.channel}: ${c.count} orders — KES ${c.amount.toLocaleString()}`, 48, y);
          y += 14;
        });
        y += 8;
      }
      if (selectedSections.includes('Discount Report')) {
        writeHeading('6. Discounts');
        doc.text(`Discounted Orders: ${done.filter((o) => Number(o.discount || 0) > 0).length}  |  Total Discounts: KES ${disc.toLocaleString()}`, 40, y);
        y += 20;
      }
      if (selectedSections.includes('Modifier Item Options Report')) {
        writeHeading('7. Top Modifier Options');
        salesBreakdown.modifiers.slice(0, 12).forEach((m) => {
          if (y > 760) { doc.addPage(); y = 48; }
          doc.text(`- ${m.title} / ${m.option}: ${m.count}x`, 48, y);
          y += 14;
        });
        y += 8;
      }
      if (selectedSections.includes('Order Item Sales Report')) {
        writeHeading('8. Top Order Items');
        salesBreakdown.items.slice(0, 15).forEach((it) => {
          if (y > 760) { doc.addPage(); y = 48; }
          doc.text(`- ${it.name} (${it.qty}x): KES ${it.total.toLocaleString()}`, 48, y);
          y += 14;
        });
      }

      const fileName = `manipos-eod-${startDate}-to-${endDate}.pdf`;
      doc.save(fileName);

      try {
        const res = await supabase.from('eod_reports').insert([{
          restaurant_id: restaurantId,
          branch_id: eodLocation === 'all' ? null : eodLocation,
          report_date: endDate,
          generated_by: 'Dashboard Operator',
          email_sent_to: eodEmail || null,
          file_name: fileName,
          sections_included: selectedSections,
          summary_json: { completed: done.length, gross_sales: gross, discounts: disc, tax },
        }]).select().single();
        if (!res.error && res.data) setEodHistory((prev) => [res.data, ...prev]);
      } catch (_) { }

      setCustomModalOpen(false);
    } catch (err) {
      alert('Failed generating PDF: ' + err.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const posFilteredOrders = useMemo(() => {
    return scopedOrders.filter((o) => {
      if (posRefFilter.trim()) {
        const q = posRefFilter.toLowerCase();
        if (!String(o.ticket_number || o.id || '').toLowerCase().includes(q)) return false;
      }
      if (posStatusFilter !== 'All') {
        const s = String(o.status || '').toLowerCase();
        if (posStatusFilter === 'Settled' && !isCompletedOrder(o)) return false;
        if (posStatusFilter === 'Open' && s !== 'open') return false;
        if (posStatusFilter === 'Voided' && !s.includes('void')) return false;
      }
      return true;
    });
  }, [scopedOrders, posRefFilter, posStatusFilter]);

  const REPORT_TABS = [
    { id: 'overview', label: 'Executive Dashboard' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'sales', label: 'Sales (Items/Mods/Combos)' },
    { id: 'tax', label: 'Tax & Charges' },
    { id: 'eod', label: 'End of Day (6am–6am)' },
    { id: 'discounts', label: 'Discounts & Loyalty' },
    { id: 'pos', label: 'POS Devices & Audit' },
  ];

  return (
    <div className="space-y-5">
      {/* Top Report Switcher Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-3">
        <div className="flex flex-wrap gap-1.5">
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectReport && onSelectReport(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${reportKey === t.id
                ? 'bg-amber-400 text-black shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDatePreset(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${datePreset === p.id
                  ? 'bg-amber-400 text-black shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              const nextStart = e.target.value;
              setDatePreset('custom');
              setStartDate(nextStart);
              notifyDateRange(nextStart, endDate);
            }}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              const nextEnd = e.target.value;
              setDatePreset('custom');
              setEndDate(nextEnd);
              notifyDateRange(startDate, nextEnd);
            }}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold"
          />
        </div>
      </div>

      {/* 1. EXECUTIVE DASHBOARD (/dashboard) */}
      {reportKey === 'overview' && (
        <div className="space-y-5" data-testid="executive-dashboard-overview">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              {
                label: 'Total Sales',
                value: `KES ${execMetrics.totalSales.toLocaleString()}`,
                sub: `${execMetrics.validCount} active / valid orders`,
                accent: 'text-amber-700',
              },
              {
                label: 'Collected / Paid',
                value: `KES ${execMetrics.paidSales.toLocaleString()}`,
                sub: `${execMetrics.paidCount} paid · Unpaid KES ${execMetrics.unpaidSales.toLocaleString()}`,
                accent: 'text-slate-900',
              },
              {
                label: 'Total Net Sales',
                value: `KES ${execMetrics.netSales.toLocaleString()}`,
                sub: 'After tax & commission',
                accent: 'text-slate-900',
              },
              {
                label: 'Total Discount',
                value: `KES ${execMetrics.totalDiscount.toLocaleString()}`,
                sub: 'Promos & markdowns',
                accent: 'text-amber-700',
              },
              {
                label: 'Total Tax',
                value: `KES ${execMetrics.totalTax.toLocaleString()}`,
                sub: `After comm: KES ${execMetrics.taxAfterCommission.toLocaleString()}`,
                accent: 'text-slate-900',
              },
              {
                label: 'Aggregator Commission',
                value: `KES ${execMetrics.totalCommission.toLocaleString()}`,
                sub: '3rd-party delivery fees',
                accent: 'text-slate-700',
              },
              {
                label: 'Avg Order Value',
                value: `KES ${execMetrics.avgOrder.toLocaleString()}`,
                sub: 'Across valid orders',
                accent: 'text-amber-700',
              },
              {
                label: 'Ideal Food Cost',
                value: `KES ${execMetrics.idealFoodCost.toLocaleString()}`,
                sub: 'Recipe / item COGS',
                accent: 'text-indigo-700',
              },
              {
                label: 'Cancelled / Returned / Void',
                value: `${execMetrics.voidCount + execMetrics.cancelledCount + execMetrics.failedCnt} · KES ${(execMetrics.voidAmount + execMetrics.cancelledAmount).toLocaleString()}`,
                sub: 'Excluded from Total Sales',
                accent: 'text-rose-600',
              },
              { label: 'Top Business Day', value: execMetrics.topDay, accent: 'text-slate-900' },
              { label: 'Top Meal Time', value: execMetrics.topMealTime, accent: 'text-slate-900' },
              {
                label: 'Processed Rate',
                value: `${execMetrics.totalCount ? Math.round((execMetrics.processedCount / execMetrics.totalCount) * 100) : 0}%`,
                sub: `${execMetrics.processedCount} of ${execMetrics.totalCount} kitchen/done`,
                accent: 'text-amber-700',
              },
            ].map((k) => (
              <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{k.label}</p>
                <p className={`text-lg font-black mt-1 ${k.accent}`}>{k.value}</p>
                {k.sub && <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Order Processing Breakdown & Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3" data-testid="exec-processing-breakdown">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">How Orders Were Processed</h3>
                <span className="text-[11px] font-bold text-slate-500">{execMetrics.totalCount} total</span>
              </div>
              {execMetrics.processingBreakdown.map((f) => (
                <div key={f.key} className="space-y-1">
                  <div className="flex justify-between items-baseline text-xs font-bold gap-2">
                    <span className="text-slate-700 truncate">{f.label}</span>
                    <span className="text-slate-900 whitespace-nowrap">
                      {f.count} ({f.pct}%) · <span className="font-black">KES {f.amount.toLocaleString()}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${f.color}`} style={{ width: `${f.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
              <h3 className="text-sm font-black text-slate-900 mb-3">
                Total Valid Sales Trend (KES) · {startDate === endDate ? startDate : `${startDate} → ${endDate}`}
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={execMetrics.trend}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val) => [`KES ${Number(val).toLocaleString()}`, 'Sales']} />
                    <Area type="monotone" dataKey="sales" stroke="#047857" fill="#d1fae5" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* 3 Bottom Breakdown Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5" data-testid="exec-payment-breakdown">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase text-slate-500">Payment Method Breakdown</h4>
                <span className="text-[11px] font-bold text-amber-700">KES {execMetrics.totalSales.toLocaleString()}</span>
              </div>
              {execMetrics.byPayment.length === 0 ? (
                <p className="text-xs text-slate-400">No valid sales in selected range.</p>
              ) : (
                <div className="space-y-2.5 text-xs">
                  {execMetrics.byPayment.map((p) => (
                    <div key={p.method} className="space-y-1 pb-2 border-b border-slate-100 last:border-b-0 last:pb-0">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-slate-800">
                          {p.method} <span className="text-slate-400 font-semibold">({p.count} · {p.sharePct}%)</span>
                        </span>
                        <span className="font-black text-slate-900">KES {p.amount.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400" style={{ width: `${p.sharePct}%` }} />
                      </div>
                      {p.pendingAmount > 0 && (
                        <p className="text-[10px] font-semibold text-amber-700">
                          Paid: KES {p.paidAmount.toLocaleString()} · Pending: KES {p.pendingAmount.toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5" data-testid="exec-channel-breakdown">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase text-slate-500">Sales Channels Breakdown</h4>
                <span className="text-[11px] font-bold text-amber-700">{execMetrics.validCount} orders</span>
              </div>
              {execMetrics.byChannel.length === 0 ? (
                <p className="text-xs text-slate-400">No valid sales in selected range.</p>
              ) : (
                <div className="space-y-2.5 text-xs">
                  {execMetrics.byChannel.map((c) => (
                    <div key={c.channel} className="space-y-1 pb-2 border-b border-slate-100 last:border-b-0 last:pb-0">
                      <div className="flex justify-between items-baseline">
                        <span className="font-bold text-slate-800">
                          {c.channel} <span className="text-slate-400 font-semibold">({c.count} · {c.sharePct}%)</span>
                        </span>
                        <span className="font-black text-slate-900">KES {c.amount.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-600" style={{ width: `${c.sharePct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <h4 className="text-xs font-black uppercase text-slate-500 mb-2">Cancelled / Voided / Failed Reasons</h4>
              {execMetrics.failureReasons.length === 0 ? (
                <p className="text-xs text-slate-400">Zero cancelled, returned, or failed orders in selected range.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {execMetrics.failureReasons.map((fr) => (
                    <div key={fr.reason} className="flex justify-between py-1 border-b border-slate-100">
                      <span className="font-semibold text-slate-700 truncate">{fr.reason}</span>
                      <span className="font-black text-rose-600">{fr.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. TRANSACTION REPORT (/dashboard/transactions) */}
      {reportKey === 'transactions' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold">
                <option value="All">All Delivery Methods</option>
                <option value="Delivery">Delivery</option>
                <option value="Takeaway">Pickup / Takeaway</option>
                <option value="Dine In">Dine In</option>
              </select>
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold">
                {filterLists.payments.map((p) => <option key={p} value={p}>{p === 'All' ? 'All Payment Methods' : p}</option>)}
              </select>
              <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold">
                {filterLists.channels.map((c) => <option key={c} value={c}>{c === 'All' ? 'All Order Channels' : c}</option>)}
              </select>
              <select value={clerkFilter} onChange={(e) => setClerkFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold">
                {filterLists.clerks.map((cl) => <option key={cl} value={cl}>{cl === 'All' ? 'All Sales Clerks' : cl}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadCsv(
                  `transaction-summary-${startDate}-${endDate}.csv`,
                  ['Order #', 'Order Date', 'Customer', 'Order Status', 'Payment Method', 'Source', 'Location', 'Subtotal', 'Tax', 'Clerk', 'Delivery Method'],
                  scopedOrders.map((o) => [
                    o.ticket_number || o.id, o.created_at, o.customer_name || 'Guest', o.status, normalizePaymentMethodLabel(o),
                    formatChannelDisplayName(normalizeChannelLabel(o)), branchName(o.branch_id), o.total_amount, o.tax_amount || 0,
                    o.cashier_name || '', o.dining_option || '',
                  ])
                )}
                className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1"
              >
                <Download size={13} /> Export Order Summary
              </button>
              <button
                type="button"
                onClick={() => {
                  const rows = [];
                  scopedOrders.forEach((o) => orderItemsOf(o).forEach((it) => rows.push([o.ticket_number || o.id, o.created_at, it.item_name, it.quantity, it.price, it.instructions || ''])));
                  downloadCsv(`order-items-${startDate}-${endDate}.csv`, ['Order #', 'Date', 'Item', 'Qty', 'Price', 'Instructions'], rows);
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1"
              >
                <Download size={13} /> Export Order Items
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Order #</th>
                  <th className="py-2.5 px-3">Order Date</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Payment</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Subtotal</th>
                  <th className="py-2.5 px-3">Clerk</th>
                  <th className="py-2.5 px-3">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scopedOrders.slice(0, 120).map((o) => (
                  <React.Fragment key={o.id}>
                    <tr onClick={() => setExpandedTxId(expandedTxId === o.id ? null : o.id)} className="hover:bg-slate-50 cursor-pointer">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">#{o.ticket_number || o.id?.slice(0, 6)}</td>
                      <td className="py-2.5 px-3 text-slate-600">{new Date(o.created_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="py-2.5 px-3 font-semibold">{o.customer_name || 'Guest'}</td>
                      <td className="py-2.5 px-3">{normalizePaymentMethodLabel(o)}</td>
                      <td className="py-2.5 px-3"><span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold">{o.status}</span></td>
                      <td className="py-2.5 px-3 font-bold text-amber-700">{formatChannelDisplayName(normalizeChannelLabel(o))}</td>
                      <td className="py-2.5 px-3">{branchName(o.branch_id)}</td>
                      <td className="py-2.5 px-3 font-black">KES {Number(o.total_amount || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-slate-500">{o.cashier_name || '—'}</td>
                      <td className="py-2.5 px-3">{o.dining_option}</td>
                    </tr>
                    {expandedTxId === o.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={10} className="px-6 py-3">
                          <div className="space-y-1 text-[11px]">
                            {orderItemsOf(o).map((it, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span>{it.quantity}x <strong>{it.item_name}</strong> {it.instructions ? `(${it.instructions})` : ''}</span>
                                <span>KES {(Number(it.price || 0) * Number(it.quantity || 1)).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. SALES REPORT (Order Items | Modifiers | Combos) */}
      {reportKey === 'sales' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'items', label: 'Order Item Report' },
                { id: 'modifiers', label: 'Modifier Item Report' },
                { id: 'combos', label: 'Combo Item Report' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSalesSubTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${salesSubTab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {salesSubTab === 'items' && (
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold">
                  {filterLists.categories.map((c) => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
                </select>
              )}
              <button
                type="button"
                onClick={() => {
                  if (salesSubTab === 'items') {
                    downloadCsv(`sales-items-${startDate}.csv`, ['Item Name', 'Category', 'Location', 'Qty Sold', 'Order Count', 'Total Amount', 'Product Cost', 'Margin'],
                      salesBreakdown.items.map((x) => [x.name, x.category, x.location, x.qty, x.orderCount, x.total, x.cost, x.margin]));
                  } else if (salesSubTab === 'modifiers') {
                    downloadCsv(`sales-modifiers-${startDate}.csv`, ['Modifier Title', 'Modifier Option', 'Modifier Count', 'Location'],
                      salesBreakdown.modifiers.map((m) => [m.title, m.option, m.count, m.location]));
                  } else {
                    downloadCsv(`sales-combos-${startDate}.csv`, ['Combo Name', 'Order Count', 'Qty Sold', 'Total', 'Location'],
                      salesBreakdown.combos.map((c) => [c.name, c.orderCount, c.qty, c.total, c.location]));
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-400 text-black text-xs font-bold flex items-center gap-1"
              >
                <Download size={13} /> Export Sales
              </button>
            </div>
          </div>

          {salesSubTab === 'items' && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Item Name</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Location</th>
                    <th className="py-2.5 px-4">Qty Sold</th>
                    <th className="py-2.5 px-4">Order Count</th>
                    <th className="py-2.5 px-4">Total Amount</th>
                    <th className="py-2.5 px-4">Product Cost</th>
                    <th className="py-2.5 px-4">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesBreakdown.items.map((r) => (
                    <tr key={`${r.name}-${r.location}`}>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{r.name}</td>
                      <td className="py-2.5 px-4 text-slate-600">{r.category}</td>
                      <td className="py-2.5 px-4">{r.location}</td>
                      <td className="py-2.5 px-4 font-bold">{r.qty}</td>
                      <td className="py-2.5 px-4">{r.orderCount}</td>
                      <td className="py-2.5 px-4 font-black text-amber-700">KES {r.total.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-slate-500">KES {r.cost.toLocaleString()}</td>
                      <td className="py-2.5 px-4 font-bold">KES {r.margin.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {salesSubTab === 'modifiers' && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Modifier Title</th>
                    <th className="py-2.5 px-4">Modifier Option</th>
                    <th className="py-2.5 px-4">Count</th>
                    <th className="py-2.5 px-4">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesBreakdown.modifiers.map((m, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{m.title}</td>
                      <td className="py-2.5 px-4 text-slate-700">{m.option}</td>
                      <td className="py-2.5 px-4 font-black text-amber-700">{m.count}</td>
                      <td className="py-2.5 px-4">{m.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {salesSubTab === 'combos' && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Combo Name</th>
                    <th className="py-2.5 px-4">Order Count</th>
                    <th className="py-2.5 px-4">Quantity Sold</th>
                    <th className="py-2.5 px-4">Total</th>
                    <th className="py-2.5 px-4">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesBreakdown.combos.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-400">No combo sales recorded in selected range.</td></tr>
                  ) : (
                    salesBreakdown.combos.map((c, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 px-4 font-bold">{c.name}</td>
                        <td className="py-2.5 px-4">{c.orderCount}</td>
                        <td className="py-2.5 px-4 font-bold">{c.qty}</td>
                        <td className="py-2.5 px-4 font-black text-amber-700">KES {c.total.toLocaleString()}</td>
                        <td className="py-2.5 px-4">{c.location}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. TAX & CHARGES REPORT (/dashboard/tax) */}
      {reportKey === 'tax' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Total Tax & Charges Collected</p>
              <p className="text-2xl font-black text-amber-700">
                KES {taxRows.reduce((s, r) => s + Number(r.charge_value || 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => downloadCsv(
                  `tax-report-${startDate}-${endDate}.csv`,
                  ['Order #', 'Charge Title', 'Is Tax', 'Charge %', 'Charge Amount (KES)', 'Grand Total', 'Source', 'Date'],
                  taxRows.map((r) => [r.increment_id || r.order_id, r.title, r.is_tax_charge ? 'Yes' : 'No', r.charge_percent || 0, r.charge_value, r.base_grand_total, r.source, r.created_at])
                )}
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download size={13} /> Export Tax Report
              </button>
              <button
                type="button"
                onClick={() => {
                  const byTitle = {};
                  taxRows.forEach((r) => { byTitle[r.title] = (byTitle[r.title] || 0) + Number(r.charge_value || 0); });
                  downloadCsv(`tax-summary-${startDate}-${endDate}.csv`, ['Charge Title', 'Total Collected (KES)'], Object.entries(byTitle));
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-bold flex items-center gap-1.5"
              >
                <Download size={13} /> Export Tax Summary
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Order #</th>
                  <th className="py-2.5 px-4">Charge Title</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Rate %</th>
                  <th className="py-2.5 px-4">Collected (KES)</th>
                  <th className="py-2.5 px-4">Order Total</th>
                  <th className="py-2.5 px-4">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {taxRows.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-400">No tax or additional charge lines recorded in this period. Configure rules under Settings → Payment Settings.</td></tr>
                ) : (
                  taxRows.slice(0, 120).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-4 font-mono font-bold">#{r.increment_id || String(r.order_id || '').slice(0, 6)}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{r.title}</td>
                      <td className="py-2.5 px-4">{r.is_tax_charge ? 'Tax' : 'Additional Fee'}</td>
                      <td className="py-2.5 px-4">{r.charge_percent ? `${r.charge_percent}%` : 'Fixed'}</td>
                      <td className="py-2.5 px-4 font-black text-amber-700">KES {Number(r.charge_value || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-4">KES {Number(r.base_grand_total || 0).toLocaleString()}</td>
                      <td className="py-2.5 px-4">{r.source}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. END OF DAY 6AM-6AM REPORT (/dashboard/eod) */}
      {reportKey === 'eod' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900">End of Day (EOD) Reports — 6:00 AM to 6:00 AM Hospitality Day</h3>
              <p className="text-xs text-slate-500">Compile and download customizable 8-section PDF closing reports.</p>
            </div>
            <button
              type="button"
              onClick={() => setCustomModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black flex items-center gap-1.5"
            >
              <FileText size={14} /> Generate Custom Reports
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Report Date</th>
                  <th className="py-2.5 px-4">Time Generated</th>
                  <th className="py-2.5 px-4">File Name</th>
                  <th className="py-2.5 px-4">Location</th>
                  <th className="py-2.5 px-4">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eodHistory.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">No archived EOD PDF runs yet. Click "Generate Custom Reports" to create your first PDF.</td></tr>
                ) : (
                  eodHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-4 font-bold">{h.report_date}</td>
                      <td className="py-2.5 px-4 text-slate-500">{new Date(h.created_at).toLocaleTimeString('en-KE')}</td>
                      <td className="py-2.5 px-4 font-mono">{h.file_name}</td>
                      <td className="py-2.5 px-4">{branchName(h.branch_id)}</td>
                      <td className="py-2.5 px-4 font-bold text-amber-700">
                        {h.summary_json?.completed || 0} orders · KES {Number(h.summary_json?.gross_sales || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. DISCOUNTS / PROMOTIONS / LOYALTY REPORTS (/dashboard/discounts) */}
      {reportKey === 'discounts' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'discounts', label: 'Discounts Report' },
                { id: 'promotions', label: 'Promotions Report' },
                { id: 'loyalty', label: 'Loyalty Report' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDiscountSubTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${discountSubTab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const discOrders = scopedOrders.filter((o) => Number(o.discount || 0) > 0);
                downloadCsv(`discounts-${startDate}-${endDate}.csv`, ['Order #', 'Date', 'Customer', 'Discount (KES)', 'Order Total'],
                  discOrders.map((o) => [o.ticket_number || o.id, o.created_at, o.customer_name || 'Guest', o.discount, o.total_amount]));
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1"
            >
              <Download size={13} /> Export Report
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(() => {
              const discOrders = scopedOrders.filter(isCompletedOrder).filter((o) => Number(o.discount || 0) > 0);
              const pct = execMetrics.completedCount ? Math.round((discOrders.length / execMetrics.completedCount) * 100) : 0;
              return (
                <>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-bold uppercase text-slate-400">Orders With Discounts</p>
                    <p className="text-lg font-black text-slate-900 mt-0.5">{discOrders.length}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-bold uppercase text-slate-400">Total Discount Amount</p>
                    <p className="text-lg font-black text-amber-700 mt-0.5">KES {execMetrics.totalDiscount.toLocaleString()}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-[11px] font-bold uppercase text-slate-400">% Discounted Orders</p>
                    <p className="text-lg font-black text-slate-900 mt-0.5">{pct}%</p>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Code / Program</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Value</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {discounts.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2.5 px-4 font-mono font-bold">{d.code || d.name}</td>
                    <td className="py-2.5 px-4">{d.type || d.discount_type}</td>
                    <td className="py-2.5 px-4 font-bold">{d.type === 'percentage' ? `${d.value}%` : `KES ${Number(d.value || 0).toLocaleString()}`}</td>
                    <td className="py-2.5 px-4">{d.is_active !== false ? 'Active' : 'Paused'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. POS TERMINAL & DEVICE REPORT (/dashboard/pos) */}
      {reportKey === 'pos' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Open Orders', count: scopedOrders.filter((o) => String(o.status || '').toLowerCase() === 'open').length },
              { label: 'Settled Orders', count: execMetrics.completedCount },
              { label: 'Voided Orders', count: execMetrics.voidCount },
              { label: 'Connected Devices', count: devices.length },
            ].map((k) => (
              <div key={k.label} className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase text-slate-400">{k.label}</p>
                <p className="text-xl font-black text-slate-900 mt-1">{k.count}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={posRefFilter}
                  onChange={(e) => setPosRefFilter(e.target.value)}
                  placeholder="Order Reference..."
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                />
                <select value={posStatusFilter} onChange={(e) => setPosStatusFilter(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold">
                  <option value="All">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="Settled">Settled</option>
                  <option value="Voided">Voided</option>
                </select>
              </div>
              <span className="text-xs text-slate-400">Click any row for `POS Receipt Details`</span>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Ticket #</th>
                    <th className="py-2.5 px-4">Clerk</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Payment</th>
                    <th className="py-2.5 px-4">KDS Sync</th>
                    <th className="py-2.5 px-4">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {posFilteredOrders.slice(0, 80).map((o) => (
                    <tr key={o.id} onClick={() => setPosDrawerOrder(o)} className="hover:bg-slate-50 cursor-pointer">
                      <td className="py-2.5 px-4 font-mono font-bold">#{o.ticket_number || o.id?.slice(0, 6)}</td>
                      <td className="py-2.5 px-4">{o.cashier_name || 'POS Staff'}</td>
                      <td className="py-2.5 px-4 font-bold">{o.status}</td>
                      <td className="py-2.5 px-4">{o.payment_method}</td>
                      <td className="py-2.5 px-4">{o.sync_to_kds !== false ? 'Synced' : 'Off'}</td>
                      <td className="py-2.5 px-4 font-black text-amber-700">KES {Number(o.total_amount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Custom 8-Section EOD PDF Modal */}
      {customModalOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 flex items-center justify-center p-4">
          <form onSubmit={handleGenerateCustomEodPdf} className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Generate Custom EOD Report</h3>
              <button type="button" onClick={() => setCustomModalOpen(false)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Email Copy To (optional)</label>
                <input type="email" value={eodEmail} onChange={(e) => setEodEmail(e.target.value)} placeholder="owner@restaurant.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Location</label>
                <select value={eodLocation} onChange={(e) => setEodLocation(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs">
                  <option value="all">{restaurantName} (All)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-2">Select 8 Report Sections</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EOD_SECTIONS.map((sec) => {
                  const checked = selectedSections.includes(sec);
                  return (
                    <label key={sec} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedSections((prev) => checked ? prev.filter((x) => x !== sec) : [...prev, sec])
                        }
                      />
                      <span>{sec}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <button type="submit" disabled={generatingPdf || selectedSections.length === 0} className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black disabled:opacity-50">
              {generatingPdf ? 'Building PDF...' : 'Generate & Download PDF Report'}
            </button>
          </form>
        </div>
      )}

      {/* POS Receipt Details Drawer */}
      <SlideOverDrawer
        open={Boolean(posDrawerOrder)}
        onClose={() => setPosDrawerOrder(null)}
        title={`POS Receipt #${posDrawerOrder?.ticket_number || ''}`}
        subtitle={`Clerk: ${posDrawerOrder?.cashier_name || 'Staff'}`}
      >
        {posDrawerOrder && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <p><strong>Customer:</strong> {posDrawerOrder.customer_name || 'Guest'}</p>
              <p><strong>Payment:</strong> {posDrawerOrder.payment_method} ({posDrawerOrder.payment_status})</p>
              <p><strong>Channel:</strong> {posDrawerOrder.sales_channel || posDrawerOrder.order_channel || 'POS'}</p>
            </div>
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {orderItemsOf(posDrawerOrder).map((it, i) => (
                <div key={i} className="p-2.5 flex justify-between">
                  <span>{it.quantity}x {it.item_name}</span>
                  <span className="font-bold">KES {(Number(it.price || 0) * Number(it.quantity || 1)).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-black pt-2 border-t border-slate-200">
              <span>Grand Total</span>
              <span>KES {Number(posDrawerOrder.total_amount || 0).toLocaleString()}</span>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-1.5"
            >
              <Printer size={14} /> View / Print Receipt
            </button>
          </div>
        )}
      </SlideOverDrawer>
    </div>
  );
}
