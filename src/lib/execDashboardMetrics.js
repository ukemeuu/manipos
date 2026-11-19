/**
 * Pure aggregation helpers for OrdaReportsView Executive Dashboard.
 * Ensures today's active kitchen/POS orders (Preparing, Accepted, Ready, Paid App)
 * are included accurately alongside Completed orders, while excluding only
 * Cancelled / Declined / Returned / Voided / Failed orders from gross sales.
 */
import {
  normalizeChannelLabel,
  formatChannelDisplayName,
  normalizePaymentMethodLabel,
} from './orderChannel';
import { resolveChannelCommissionWithFallback } from './productCosting';

export function toLocalDateKey(input = new Date()) {
  const dt = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDatePresetRange(presetId = 'today', now = new Date()) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStr = toLocalDateKey(base);

  if (presetId === 'yesterday') {
    const yest = new Date(base.getTime() - 24 * 60 * 60 * 1000);
    const yStr = toLocalDateKey(yest);
    return { start: yStr, end: yStr };
  }
  if (presetId === '7d') {
    const startDt = new Date(base.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { start: toLocalDateKey(startDt), end: todayStr };
  }
  if (presetId === 'month') {
    const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
    return { start: toLocalDateKey(monthStart), end: todayStr };
  }
  return { start: todayStr, end: todayStr };
}

const EXCLUDED_SALES_STATUSES = new Set([
  'void',
  'voided',
  'cancelled',
  'canceled',
  'declined',
  'rejected',
  'returned',
  'refunded',
  'failed',
  'payment failed',
  'payment_failed',
]);

export function isExcludedFromSales(order) {
  const st = String(order?.status || '').toLowerCase().trim();
  const pay = String(order?.payment_status || '').toLowerCase().trim();
  return EXCLUDED_SALES_STATUSES.has(st) || st.includes('void') || pay === 'failed' || pay === 'refunded';
}

export function isCompletedOrderStatus(order) {
  const st = String(order?.status || '').toLowerCase().trim();
  return ['completed', 'settled', 'delivered', 'approved'].includes(st);
}

export function isOrderPaid(order) {
  const pay = String(order?.payment_status || '').toLowerCase().trim();
  const st = String(order?.status || '').toLowerCase().trim();
  return pay === 'paid' || pay === 'settled' || pay === 'completed' || isCompletedOrderStatus({ status: st });
}

export const PROCESSING_STAGE_DEFS = [
  { key: 'completed', label: 'Completed / Settled', color: 'bg-emerald-600' },
  { key: 'ready_dispatched', label: 'Ready / Dispatched', color: 'bg-indigo-600' },
  { key: 'in_kitchen', label: 'Accepted / Preparing', color: 'bg-sky-600' },
  { key: 'pending_approval', label: 'New / Pending Approval', color: 'bg-amber-500' },
  { key: 'open', label: 'Open Bills', color: 'bg-slate-600' },
  { key: 'cancelled_returned', label: 'Cancelled / Declined / Returned', color: 'bg-rose-500' },
  { key: 'void_failed', label: 'Voided / Failed', color: 'bg-red-700' },
];

export function classifyProcessingStage(order) {
  const st = String(order?.status || '').toLowerCase().trim();
  const pay = String(order?.payment_status || '').toLowerCase().trim();

  if (st.includes('void') || st === 'failed' || st === 'payment failed' || st === 'payment_failed' || pay === 'failed') {
    return 'void_failed';
  }
  if (['cancelled', 'canceled', 'declined', 'rejected', 'returned', 'refunded'].includes(st) || pay === 'refunded') {
    return 'cancelled_returned';
  }
  if (['completed', 'settled', 'delivered', 'approved'].includes(st)) {
    return 'completed';
  }
  if (['ready', 'shipped', 'dispatched', 'out for delivery'].includes(st)) {
    return 'ready_dispatched';
  }
  if (['accepted', 'preparing', 'in progress', 'in_progress', 'processing'].includes(st)) {
    return 'in_kitchen';
  }
  if (['open', 'saved'].includes(st)) {
    return 'open';
  }
  return 'pending_approval';
}

export function getOrderItemsList(order) {
  if (Array.isArray(order?.pos_order_items) && order.pos_order_items.length > 0) return order.pos_order_items;
  if (Array.isArray(order?.items) && order.items.length > 0) return order.items;
  return [];
}

export function computeExecDashboardMetrics(scopedOrders = [], menuCostMap = new Map(), options = {}) {
  const list = Array.isArray(scopedOrders) ? scopedOrders : [];
  const {
    channelCommRows = [],
    channelCommMap = {},
    defaultFoodCostPct = 0,
    defaultTaxPct = 16,
  } = options || {};

  const validOrders = [];
  const voided = [];
  const cancelledReturned = [];
  const failed = [];
  const stageAccum = new Map(
    PROCESSING_STAGE_DEFS.map((def) => [
      def.key,
      { ...def, count: 0, amount: 0, paidAmount: 0 },
    ])
  );

  for (const o of list) {
    if (!o) continue;
    const amt = Number(o.total_amount || 0);
    const stageKey = classifyProcessingStage(o);
    const bucket = stageAccum.get(stageKey);
    if (bucket) {
      bucket.count += 1;
      bucket.amount += amt;
      if (isOrderPaid(o)) bucket.paidAmount += amt;
    }

    if (stageKey === 'void_failed') {
      const st = String(o.status || '').toLowerCase();
      if (st.includes('void')) voided.push(o);
      else failed.push(o);
      continue;
    }
    if (stageKey === 'cancelled_returned') {
      cancelledReturned.push(o);
      continue;
    }
    validOrders.push(o);
  }

  let totalSales = 0;
  let paidSales = 0;
  let paidCount = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let totalCommission = 0;
  let idealFoodCost = 0;

  const dayCounts = {};
  const hourBuckets = {
    'Breakfast (6am–11am)': 0,
    'Lunch (11am–4pm)': 0,
    'Dinner (4pm–10pm)': 0,
    'Late Night (10pm–6am)': 0,
  };
  const dailyTrend = {};
  const byPayment = {};
  const byChannel = {};
  const failureReasons = {};

  for (const o of validOrders) {
    const amt = Number(o.total_amount || 0);
    const paid = isOrderPaid(o);

    totalSales += amt;
    if (paid) {
      paidSales += amt;
      paidCount += 1;
    }
    totalDiscount += Number(o.discount || 0);

    const chDisplay = formatChannelDisplayName(normalizeChannelLabel(o));
    const items = getOrderItemsList(o);

    let orderTax = Number(o.tax_amount || 0);
    if (orderTax <= 0 && Number(defaultTaxPct) > 0) {
      if (items.length > 0) {
        let taxableItemsTotal = 0;
        for (const it of items) {
          const itemName = String(it.item_name || it.name || '');
          if (/delivery fee|package fee|packaging fee/i.test(itemName)) continue;
          const meta = menuCostMap.get(itemName.toLowerCase());
          const qty = Number(it.quantity || 1);
          const unitPrice = Number(it.unit_price ?? it.price ?? meta?.price ?? 0);
          const rev = Number(it.total_price ?? unitPrice * qty);
          taxableItemsTotal += rev;
        }
        orderTax = Math.round(taxableItemsTotal * (Number(defaultTaxPct) / 100) * 100) / 100;
      } else {
        orderTax = Math.round(amt * (Number(defaultTaxPct) / 100) * 100) / 100;
      }
    }
    totalTax += orderTax;

    const explicitAggComm = Number(o.aggregator_commission || 0);
    if (explicitAggComm > 0) {
      totalCommission += explicitAggComm;
    } else {
      const chRate = resolveChannelCommissionWithFallback(
        channelCommRows,
        channelCommMap,
        chDisplay,
        o.brand || ''
      );
      if (chRate > 0) {
        totalCommission += Math.round(amt * (chRate / 100) * 100) / 100;
      }
    }

    if (Number(o.ideal_food_cost || 0) > 0) {
      idealFoodCost += Number(o.ideal_food_cost);
    } else {
      if (items.length > 0) {
        for (const it of items) {
          const itemName = String(it.item_name || it.name || '');
          if (/delivery fee|package fee|packaging fee/i.test(itemName)) continue;
          const meta = menuCostMap.get(itemName.toLowerCase());
          const qty = Number(it.quantity || 1);
          const unitPrice = Number(it.unit_price ?? it.price ?? meta?.price ?? 0);
          const rev = Number(it.total_price ?? unitPrice * qty);
          const explicitCogs = Number(it.cogs_amount || 0);
          const costPrice = Number(it.cost_price || meta?.cost_price || meta?.cost || 0);
          const pct = Number(it.cogs_percent || meta?.cogs_percent || defaultFoodCostPct || 0);
          idealFoodCost += explicitCogs > 0
            ? explicitCogs
            : (costPrice > 0 ? costPrice * qty : rev * (pct / 100));
        }
      } else if (Number(defaultFoodCostPct) > 0) {
        idealFoodCost += amt * (Number(defaultFoodCostPct) / 100);
      }
    }

    const dt = new Date(o.created_at || Date.now());
    if (!Number.isNaN(dt.getTime())) {
      const dayName = dt.toLocaleDateString('en-US', { weekday: 'long' });
      dayCounts[dayName] = (dayCounts[dayName] || 0) + amt;

      const hr = dt.getHours();
      if (hr >= 6 && hr < 11) hourBuckets['Breakfast (6am–11am)'] += 1;
      else if (hr >= 11 && hr < 16) hourBuckets['Lunch (11am–4pm)'] += 1;
      else if (hr >= 16 && hr < 22) hourBuckets['Dinner (4pm–10pm)'] += 1;
      else hourBuckets['Late Night (10pm–6am)'] += 1;

      const dateKey = toLocalDateKey(dt);
      if (dateKey) {
        if (!dailyTrend[dateKey]) dailyTrend[dateKey] = { date: dateKey, sales: 0, count: 0 };
        dailyTrend[dateKey].sales += amt;
        dailyTrend[dateKey].count += 1;
      }
    }

    const pm = normalizePaymentMethodLabel(o);
    if (!byPayment[pm]) {
      byPayment[pm] = { method: pm, count: 0, amount: 0, paidAmount: 0, pendingAmount: 0 };
    }
    byPayment[pm].count += 1;
    byPayment[pm].amount += amt;
    if (paid) byPayment[pm].paidAmount += amt;
    else byPayment[pm].pendingAmount += amt;

    const chDisplayKey = chDisplay;
    if (!byChannel[chDisplayKey]) {
      byChannel[chDisplayKey] = { channel: chDisplayKey, count: 0, amount: 0, paidAmount: 0, tax: 0 };
    }
    byChannel[chDisplayKey].count += 1;
    byChannel[chDisplayKey].amount += amt;
    byChannel[chDisplayKey].tax = Math.round((byChannel[chDisplayKey].tax + orderTax) * 100) / 100;
    if (paid) byChannel[chDisplayKey].paidAmount += amt;
  }

  for (const o of [...cancelledReturned, ...failed]) {
    const r = o.failure_reason || o.cancelled_reason || o.void_reason || 'Cancelled / Returned / Timeout';
    failureReasons[r] = (failureReasons[r] || 0) + 1;
  }

  totalTax = Math.round(totalTax * 100) / 100;
  totalCommission = Math.round(totalCommission * 100) / 100;
  idealFoodCost = Math.round(idealFoodCost * 100) / 100;
  const netSales = Math.max(0, totalSales - totalTax - totalCommission);
  const avgOrder = validOrders.length > 0 ? Math.round(totalSales / validOrders.length) : 0;
  const unpaidSales = Math.max(0, totalSales - paidSales);
  const unpaidCount = Math.max(0, validOrders.length - paidCount);
  const voidAmount = voided.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const cancelledAmount = cancelledReturned.reduce((s, o) => s + Number(o.total_amount || 0), 0);

  const completedBucket = stageAccum.get('completed');
  const readyBucket = stageAccum.get('ready_dispatched');
  const kitchenBucket = stageAccum.get('in_kitchen');
  const pendingBucket = stageAccum.get('pending_approval');

  const processedCount =
    (completedBucket?.count || 0) +
    (readyBucket?.count || 0) +
    (kitchenBucket?.count || 0);

  const totalCount = list.length;
  const processingBreakdown = Array.from(stageAccum.values()).map((row) => ({
    ...row,
    pct: totalCount > 0 ? Math.round((row.count / totalCount) * 100) : 0,
  }));

  const enrichShares = (arr) =>
    arr
      .sort((a, b) => b.amount - a.amount || b.count - a.count)
      .map((row) => ({
        ...row,
        sharePct: totalSales > 0 ? Math.round((row.amount / totalSales) * 100) : 0,
      }));

  const topDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
  const topMealTime = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  return {
    totalCount,
    validCount: validOrders.length,
    completedCount: completedBucket?.count || 0,
    processedCount,
    newCnt: pendingBucket?.count || 0,
    procCnt: (kitchenBucket?.count || 0) + (readyBucket?.count || 0),
    readyCnt: readyBucket?.count || 0,
    declinedCnt: cancelledReturned.length,
    failedCnt: failed.length,
    totalSales,
    paidSales,
    paidCount,
    unpaidSales,
    unpaidCount,
    netSales,
    totalDiscount,
    totalTax,
    totalCommission,
    taxAfterCommission: Math.max(0, totalTax - Math.round(totalCommission * 0.16)),
    avgOrder,
    idealFoodCost,
    voidCount: voided.length,
    voidAmount,
    cancelledCount: cancelledReturned.length,
    cancelledAmount,
    topDay,
    topMealTime,
    processingBreakdown,
    trend: Object.values(dailyTrend).sort((a, b) => a.date.localeCompare(b.date)),
    byPayment: enrichShares(Object.values(byPayment)),
    byChannel: enrichShares(Object.values(byChannel)),
    failureReasons: Object.entries(failureReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count })),
  };
}
