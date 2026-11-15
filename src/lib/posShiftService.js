import { supabase } from './supabase';

function shiftCacheKey(restaurantId, staffName) {
  return `manipos_active_shift_${restaurantId || 'shared'}_${String(staffName || 'staff').toLowerCase()}`;
}

function offlineShiftsQueueKey(restaurantId) {
  return `manipos_offline_shifts_${restaurantId || 'shared'}`;
}

export function getBusinessDayStartIso(nowDate = new Date()) {
  const d = new Date(nowDate);
  if (d.getHours() < 7) {
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T07:00:00.000+03:00`).toISOString();
}

export async function fetchActiveShift(restaurantId, staffName) {
  if (!restaurantId) return null;
  const key = shiftCacheKey(restaurantId, staffName);
  try {
    const { data, error } = await supabase
      .from('pos_shifts')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('staff_name', staffName || 'Cashier')
      .is('closed_at', null)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      localStorage.setItem(key, JSON.stringify(data));
    } else {
      localStorage.removeItem(key);
    }
    return data || null;
  } catch {
    try {
      const cached = localStorage.getItem(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }
}

export async function openStaffShift({ restaurantId, staffName, staffRole = 'cashier', openingCash = 0 }) {
  const floatVal = Number(openingCash || 0);
  const key = shiftCacheKey(restaurantId, staffName);
  try {
    const { data, error } = await supabase
      .from('pos_shifts')
      .insert([{
        restaurant_id: restaurantId,
        staff_name: staffName || 'Cashier',
        staff_role: staffRole || 'cashier',
        opening_cash: floatVal,
        expected_cash: floatVal,
        status: 'open',
      }])
      .select()
      .single();
    if (error) throw error;
    localStorage.setItem(key, JSON.stringify(data));
    return data;
  } catch {
    const offlineShift = {
      id: `offline-shift-${Date.now()}`,
      restaurant_id: restaurantId,
      staff_name: staffName || 'Cashier',
      staff_role: staffRole || 'cashier',
      opening_cash: floatVal,
      expected_cash: floatVal,
      status: 'open',
      opened_at: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(offlineShift));
    try {
      const q = JSON.parse(localStorage.getItem(offlineShiftsQueueKey(restaurantId)) || '[]');
      q.push(offlineShift);
      localStorage.setItem(offlineShiftsQueueKey(restaurantId), JSON.stringify(q));
    } catch (_) {}
    return offlineShift;
  }
}

export function summarizeShiftSales({ orders = [], openingCash = 0, staffName = '', shiftStartIso = null }) {
  const startIso = shiftStartIso || getBusinessDayStartIso();
  const normalizedStaff = String(staffName || '').trim().toLowerCase();

  let cashSales = 0;
  let mpesaSales = 0;
  let cardSales = 0;
  let otherSales = 0;
  let ordersCount = 0;

  for (const order of orders) {
    if (!order) continue;
    const payStatus = String(order.payment_status || '').toLowerCase();
    const status = String(order.status || '').toLowerCase();
    if (payStatus !== 'paid' && status !== 'completed') continue;
    if (['cancelled', 'canceled', 'declined', 'rejected', 'void', 'voided', 'returned'].includes(status)) continue;
    if (order.created_at && new Date(order.created_at).toISOString() < startIso) continue;
    if (normalizedStaff && order.cashier_name && String(order.cashier_name).trim().toLowerCase() !== normalizedStaff) {
      continue;
    }

    const total = Number(order.total_amount || 0);
    const method = String(order.payment_method || '').toLowerCase();
    ordersCount += 1;

    if (method === 'cash') {
      cashSales += total;
    } else if (method.includes('mpesa') || method.includes('m-pesa') || method.includes('paybill') || method.includes('till')) {
      mpesaSales += total;
    } else if (method.includes('card') || method.includes('pdq')) {
      cardSales += total;
    } else if (method.includes('split')) {
      const notes = String(order.notes || '');
      const cashMatch = notes.match(/Cash[^\d]*([\d,.]+)/i);
      const mpesaMatch = notes.match(/M-?Pesa[^\d]*([\d,.]+)/i);
      const cardMatch = notes.match(/Card[^\d]*([\d,.]+)/i);
      const cAmt = cashMatch ? Number(cashMatch[1].replace(/,/g, '')) || 0 : 0;
      const mAmt = mpesaMatch ? Number(mpesaMatch[1].replace(/,/g, '')) || 0 : 0;
      const kAmt = cardMatch ? Number(cardMatch[1].replace(/,/g, '')) || 0 : 0;
      const matchedSum = cAmt + mAmt + kAmt;
      cashSales += cAmt;
      mpesaSales += mAmt;
      cardSales += kAmt;
      if (matchedSum < total) otherSales += Math.max(0, total - matchedSum);
    } else {
      otherSales += total;
    }
  }

  const expectedCash = Number(openingCash || 0) + cashSales;
  const totalSales = cashSales + mpesaSales + cardSales + otherSales;

  return {
    ordersCount,
    cashSales,
    mpesaSales,
    cardSales,
    otherSales,
    expectedCash,
    totalSales,
  };
}

export async function closeStaffShift({
  restaurantId,
  activeShift,
  staffName,
  orders = [],
  closingCash = '',
}) {
  const todayStart = getBusinessDayStartIso();
  const openedIso = activeShift?.opened_at ? new Date(activeShift.opened_at).toISOString() : todayStart;
  const shiftStartIso = openedIso > todayStart ? openedIso : todayStart;

  const summary = summarizeShiftSales({
    orders,
    openingCash: activeShift?.opening_cash || 0,
    staffName,
    shiftStartIso,
  });

  const countedCash = closingCash !== '' && closingCash != null ? Number(closingCash) || 0 : summary.expectedCash;
  const discrepancy = countedCash - summary.expectedCash;
  const closedAt = new Date().toISOString();
  const key = shiftCacheKey(restaurantId, staffName);

  let closedShift = {
    ...(activeShift || {}),
    staff_name: staffName || activeShift?.staff_name || 'Cashier',
    opening_cash: Number(activeShift?.opening_cash || 0),
    expected_cash: summary.expectedCash,
    closing_cash: countedCash,
    discrepancy,
    closed_at: closedAt,
    status: 'closed',
  };

  if (activeShift?.id && !String(activeShift.id).startsWith('offline-')) {
    try {
      const { data, error } = await supabase
        .from('pos_shifts')
        .update({
          closed_at: closedAt,
          closing_cash: countedCash,
          expected_cash: summary.expectedCash,
          discrepancy,
          status: 'closed',
        })
        .eq('id', activeShift.id)
        .select()
        .single();
      if (!error && data) closedShift = data;
    } catch (_) {}
  }

  localStorage.removeItem(key);

  return {
    shift: closedShift,
    ...summary,
  };
}
