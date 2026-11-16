import { createClient } from '@supabase/supabase-js';
import { supabase, setTenantContext } from '../../lib/supabase';
import { computeEffectiveMinSelected, normalizeMenuText } from '../../lib/webPosCatalog';

export const POJ_DEFAULT_URL = 'https://bfrvzwmckuiafkgwemdt.supabase.co';
export const POJ_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcnZ6d21ja3VpYWZrZ3dlbWR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjE1NTUsImV4cCI6MjA4Mzg5NzU1NX0.RfrrfzR9nlJH6ZC_Jz5Sy8EByobAnXL-VOuP0onVWfE';

const POJ_SESSION_STORAGE_KEY = 'manipos_poj_session_v1';

export function savePojSession(authData, pojUrl = POJ_DEFAULT_URL) {
  if (typeof window === 'undefined' || !authData?.access_token) return;
  try {
    const cleanUrl = String(pojUrl || POJ_DEFAULT_URL).replace(/\/+$/, '');
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = authData.expires_at
      ? Number(authData.expires_at)
      : nowSec + Number(authData.expires_in || 3600);
    window.localStorage.setItem(
      POJ_SESSION_STORAGE_KEY,
      JSON.stringify({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token || null,
        expires_at: expiresAt,
        poj_url: cleanUrl,
      })
    );
  } catch (_) { }
}

export function clearPojSession() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(POJ_SESSION_STORAGE_KEY);
  } catch (_) { }
}

export async function getValidPojAccessToken(pojUrl = POJ_DEFAULT_URL) {
  if (typeof window === 'undefined') return POJ_ANON_KEY;
  const cleanUrl = String(pojUrl || POJ_DEFAULT_URL).replace(/\/+$/, '');
  try {
    const raw = window.localStorage.getItem(POJ_SESSION_STORAGE_KEY);
    if (!raw) return POJ_ANON_KEY;
    const session = JSON.parse(raw);
    if (!session?.access_token) return POJ_ANON_KEY;
    if (session.poj_url && String(session.poj_url).replace(/\/+$/, '') !== cleanUrl) {
      return POJ_ANON_KEY;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Number(session.expires_at || 0) > nowSec + 60) {
      return session.access_token;
    }

    if (session.refresh_token) {
      const res = await fetch(`${cleanUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          apikey: POJ_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (res.ok) {
        const refreshed = await res.json();
        if (refreshed?.access_token) {
          savePojSession(refreshed, cleanUrl);
          return refreshed.access_token;
        }
      }
    }
  } catch (_) { }
  return POJ_ANON_KEY;
}

export async function tryAcquirePojSession(email, password, pojUrl = POJ_DEFAULT_URL) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) return false;
  const cleanUrl = String(pojUrl || POJ_DEFAULT_URL).replace(/\/+$/, '');
  try {
    const res = await fetch(`${cleanUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: POJ_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: cleanEmail, password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.access_token) return false;
    savePojSession(data, cleanUrl);
    return true;
  } catch (_) {
    return false;
  }
}

function makePojClient(pojUrl = POJ_DEFAULT_URL, serviceOrAnonKey = POJ_ANON_KEY) {
  return createClient(pojUrl, serviceOrAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'poj_isolated_sync_client',
    },
  });
}

export function normalizePojRole(pojRole, jobTitle) {
  const r = String(pojRole || '').toLowerCase().trim();
  const jt = String(jobTitle || '').toLowerCase();
  if (r === 'admin' || r === 'superadmin' || r === 'owner') return 'admin';
  if (r === 'manager') return 'manager';
  if (r === 'accountant' || jt.includes('accountant')) return 'accountant';
  if (r === 'chef' || jt.includes('chef')) return 'chef';
  if (r === 'receiver' || jt.includes('receiver')) return 'receiver';
  if (r === 'stock_controller') return 'stock_controller';
  if (r === 'store_clerk') return 'store_clerk';
  if (r === 'expense_clerk') return 'expense_clerk';
  if (r === 'cashier') return 'cashier';
  if (r === 'waiter') return 'waiter';
  if (r === 'kds') return 'kds';
  return 'staff';
}

async function fetchAllPojTable(client, tableName, pageSize = 1000) {
  const all = [];
  let from = 0;
  try {
    while (true) {
      const { data, error } = await client
        .from(tableName)
        .select('*')
        .range(from, from + pageSize - 1);
      if (error) return { rows: all, error: error.message };
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return { rows: all, error: null };
  } catch (err) {
    return { rows: all, error: err?.message || 'Query failed' };
  }
}

async function syncRowsByPojId(table, mappedRows, restaurantId) {
  if (!mappedRows.length) return { inserted: 0, updated: 0, skipped: 0, error: null };

  const existingRes = await supabase
    .from(table)
    .select('id, source_poj_id')
    .eq('restaurant_id', restaurantId)
    .not('source_poj_id', 'is', null);

  if (existingRes.error) {
    return { inserted: 0, updated: 0, skipped: mappedRows.length, error: existingRes.error.message };
  }

  const existingMap = new Map();
  for (const row of existingRes.data || []) {
    if (row.source_poj_id) existingMap.set(String(row.source_poj_id), row.id);
  }

  const toInsert = [];
  const toUpdate = [];
  for (const row of mappedRows) {
    const pojId = String(row.source_poj_id || '');
    if (!pojId) continue;
    const existingId = existingMap.get(pojId);
    if (existingId) {
      toUpdate.push({ id: existingId, row });
    } else {
      toInsert.push(row);
    }
  }

  let inserted = 0;
  let updated = 0;
  let lastErr = null;

  for (let i = 0; i < toInsert.length; i += 200) {
    const chunk = toInsert.slice(i, i + 200);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      lastErr = error.message;
    } else {
      inserted += chunk.length;
    }
  }

  for (let i = 0; i < toUpdate.length; i += 50) {
    const batch = toUpdate.slice(i, i + 50);
    await Promise.all(
      batch.map(async ({ id, row }) => {
        const { restaurant_id: _r, source_poj_id: _s, ...patch } = row;
        const { error } = await supabase
          .from(table)
          .update(patch)
          .eq('id', id)
          .eq('restaurant_id', restaurantId);
        if (error) lastErr = error.message;
        else updated += 1;
      })
    );
  }

  return { inserted, updated, skipped: 0, error: lastErr };
}

/**
 * Authenticates against POJ Management (bfrvzwmckuiafkgwemdt.supabase.co)
 * and extracts every table snapshot into memory.
 */
export async function exportSnapshotFromPoj({
  pojUrl = POJ_DEFAULT_URL,
  email,
  password,
  serviceRoleKey = '',
  onProgress,
}) {
  const cleanUrl = String(pojUrl || POJ_DEFAULT_URL).replace(/\/+$/, '');
  const client = makePojClient(cleanUrl, serviceRoleKey ? serviceRoleKey.trim() : POJ_ANON_KEY);

  if (!serviceRoleKey) {
    if (!email || !password) throw new Error('Enter your POJ Management email and password.');
    onProgress?.('Signing in to pojmanagement.com…');
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data?.session) {
      throw new Error(error?.message || 'POJ Management authentication failed.');
    }
    savePojSession(data.session, cleanUrl);
  }

  const tables = [
    'profiles',
    'staff_access',
    'staff_details',
    'leave_requests',
    'loan_requests',
    'salary_advances',
    'overtime_records',
    'warnings',
    'hr_documents',
    'shifts',
    'daily_checklists',
    'expenses',
    'accountant_monthly_overheads',
    'fpa_department_budgets',
    'delivery_fees',
    'guests',
    'guest_tags',
    'guest_visits',
    'pos_feedback',
    'saved_qrcodes',
    'suppliers',
    'inventory_items',
    'purchase_orders',
    'pos_categories',
    'pos_menu',
    'menu_modifier_groups',
    'pos_orders',
    'pos_order_items',
  ];

  const snapshot = {
    exportedAt: new Date().toISOString(),
    sourceUrl: cleanUrl,
    tables: {},
    errors: {},
  };

  for (const tbl of tables) {
    onProgress?.(`Exporting ${tbl} from POJ Management…`);
    const { rows, error } = await fetchAllPojTable(client, tbl);
    snapshot.tables[tbl] = rows;
    if (error) snapshot.errors[tbl] = error;
  }

  return snapshot;
}

/**
 * Imports a POJ snapshot object (either fresh from POJ Management or uploaded JSON archive)
 * cleanly into ManiPOS for the given restaurantId & actorId.
 */
export async function importPojSnapshotToManiPos({
  snapshot,
  restaurantId,
  actorId,
  actorName = 'Admin',
  onProgress,
}) {
  if (!restaurantId) throw new Error('Missing ManiPOS restaurant_id.');
  if (!actorId) throw new Error('Missing ManiPOS staff actor id.');

  const t = snapshot?.tables || {};
  const summary = {};

  // 1. Resolve POJ profiles + staff_details + terminal staff_access -> ManiPOS staff_access via SECURITY DEFINER RPC
  onProgress?.('Importing staff profiles & terminal PINs…');
  const profiles = t.profiles || [];
  const staffDetails = t.staff_details || [];
  const terminalPins = t.staff_access || [];

  const detailsByEmail = new Map();
  const detailsByName = new Map();
  for (const d of staffDetails) {
    if (d.email) detailsByEmail.set(String(d.email).toLowerCase().trim(), d);
    if (d.full_name || d.name) detailsByName.set(String(d.full_name || d.name).toLowerCase().trim(), d);
  }

  const pojUserMap = new Map(); // poj user UUID -> { name, email, id }
  let staffSynced = 0;
  let staffErrors = 0;

  for (const p of profiles) {
    const email = p.email ? String(p.email).toLowerCase().trim() : null;
    const name = p.full_name || p.name || (email ? email.split('@')[0] : 'Staff');
    const detail = (email && detailsByEmail.get(email)) || detailsByName.get(String(name).toLowerCase().trim()) || {};
    const complianceDocs = {
      id_front_url: p.id_front_url || detail.id_front_url || p.id_card_url || null,
      id_back_url: p.id_back_url || detail.id_back_url || null,
      nhif_url: p.nhif_url || detail.nhif_url || null,
      nhif_expiry: p.nhif_expiry || null,
      nssf_url: p.nssf_url || detail.nssf_url || null,
      nssf_expiry: p.nssf_expiry || null,
      police_clearance_url: p.police_clearance_url || detail.good_conduct_url || null,
      police_clearance_expiry: p.police_clearance_expiry || null,
      food_hygiene_url: p.food_hygiene_url || detail.hygiene_cert_url || null,
      food_hygiene_expiry: p.food_hygiene_expiry || null,
      bank_proof_url: detail.bank_proof_url || null,
    };

    const payload = {
      source_poj_id: `profile:${p.id}`,
      source_poj_user_id: String(p.id),
      name,
      email,
      role: normalizePojRole(p.role, p.job_title),
      active: p.is_active !== false && !p.deleted_at,
      title: p.title || null,
      gender: p.gender || null,
      phone: p.phone || null,
      job_title: p.job_title || null,
      staff_code: p.staff_id || null,
      avatar_url: p.avatar_url || null,
      emergency_contact_name: p.emergency_contact_name || detail.next_of_kin_name || null,
      emergency_contact_phone: p.emergency_contact_phone || detail.next_of_kin_phone || null,
      annual_leave_limit: Number(p.annual_leave_limit || 21),
      sick_leave_limit: Number(p.sick_leave_limit || 15),
      bank_name: detail.bank_name || p.bank_name || null,
      bank_account_number: detail.account_number || detail.bank_account_number || p.bank_account_number || null,
      next_of_kin_name: detail.next_of_kin_name || p.emergency_contact_name || null,
      next_of_kin_phone: detail.next_of_kin_phone || p.emergency_contact_phone || null,
      next_of_kin_address: detail.next_of_kin_address || detail.home_address || null,
      compliance_docs: complianceDocs,
    };

    const { data: rpcRes, error } = await supabase.rpc('poj_upsert_staff_profile', {
      p_actor_id: actorId,
      p_payload: payload,
    });
    if (error) {
      staffErrors += 1;
      pojUserMap.set(String(p.id), { id: p.id, name, email });
    } else {
      staffSynced += 1;
      pojUserMap.set(String(p.id), { id: rpcRes?.id || p.id, name, email });
    }
  }

  for (const tp of terminalPins) {
    const payload = {
      source_poj_id: `terminal:${tp.id || tp.name}`,
      name: tp.name || 'Terminal User',
      role: normalizePojRole(tp.role, tp.name),
      pin: tp.pin ? String(tp.pin) : null,
      active: tp.is_active !== false,
      today_yesterday_only: Boolean(tp.today_yesterday_only),
      can_view_revenue_breakdown: tp.can_view_revenue_breakdown !== false,
    };
    const { error } = await supabase.rpc('poj_upsert_staff_profile', {
      p_actor_id: actorId,
      p_payload: payload,
    });
    if (error) staffErrors += 1;
    else staffSynced += 1;
  }
  summary.staff = { inserted: staffSynced, updated: 0, errors: staffErrors };

  const resolveStaff = (row) => {
    const matched = row.user_id ? pojUserMap.get(String(row.user_id)) : null;
    return {
      staff_id: matched?.id || row.staff_id || row.user_id || null,
      staff_name: row.staff_name || row.requester_name || matched?.name || row.full_name || 'Staff',
      staff_email: row.staff_email || matched?.email || null,
    };
  };

  // 2. Leave requests
  onProgress?.('Importing leave requests…');
  summary.leave_requests = await syncRowsByPojId(
    'leave_requests',
    (t.leave_requests || []).map((r) => {
      const s = resolveStaff(r);
      const datesArr = Array.isArray(r.dates) ? r.dates : [];
      const fallbackDate = String(r.created_at || new Date().toISOString()).slice(0, 10);
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        staff_email: s.staff_email,
        leave_type: String(r.leave_type || 'annual').toLowerCase().includes('sick') ? 'Sick Leave' : 'Annual Leave',
        start_date: r.start_date || datesArr[0] || fallbackDate,
        end_date: r.end_date || datesArr[datesArr.length - 1] || r.start_date || fallbackDate,
        days_count: Number(r.days_count || datesArr.length || 1),
        dates: datesArr,
        reason: r.reason || '',
        status: r.status || 'Pending',
        reviewed_by: r.reviewed_by || null,
        created_at: r.created_at || new Date().toISOString(),
      };
    }),
    restaurantId
  );

  // 3. Loan requests
  onProgress?.('Importing loan requests…');
  summary.loan_requests = await syncRowsByPojId(
    'loan_requests',
    (t.loan_requests || []).map((r) => {
      const s = resolveStaff(r);
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        staff_email: s.staff_email,
        amount: Number(r.amount || 0),
        installments_months: Number(r.installments_months || 3),
        repayment_plan: r.repayment_plan || null,
        reason: r.reason || '',
        status: r.status || 'Pending',
        reviewed_by: r.reviewed_by || null,
        created_at: r.created_at || new Date().toISOString(),
      };
    }),
    restaurantId
  );

  // 4. Salary advances
  onProgress?.('Importing salary advances…');
  summary.salary_advances = await syncRowsByPojId(
    'salary_advances',
    (t.salary_advances || []).map((r) => {
      const s = resolveStaff(r);
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        staff_email: s.staff_email,
        amount: Number(r.amount || 0),
        repayment_month: r.repayment_month || '',
        reason: r.reason || '',
        status: r.status || 'Pending',
        reviewed_by: r.reviewed_by || null,
        created_at: r.created_at || new Date().toISOString(),
      };
    }),
    restaurantId
  );

  // 5. Overtime records
  onProgress?.('Importing overtime records…');
  summary.overtime_records = await syncRowsByPojId(
    'overtime_records',
    (t.overtime_records || []).map((r) => {
      const s = resolveStaff(r);
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        staff_email: s.staff_email,
        work_date: r.work_date || r.date || String(r.created_at || new Date().toISOString()).slice(0, 10),
        start_time: r.start_time || null,
        end_time: r.end_time || null,
        hours: Number(r.hours || 0),
        reason: r.reason || r.notes || '',
        notes: r.notes || r.reason || '',
        status: r.status || 'Logged',
        logged_at: r.logged_at || r.created_at || new Date().toISOString(),
        created_at: r.created_at || new Date().toISOString(),
      };
    }),
    restaurantId
  );

  // 6. Warnings & HR documents
  onProgress?.('Importing warnings & HR documents…');
  summary.warnings = await syncRowsByPojId(
    'warnings',
    (t.warnings || []).map((r) => {
      const s = resolveStaff(r);
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        severity: r.severity || '1st Written Warning',
        reason: r.reason || 'Disciplinary Notice',
        details: r.details || '',
        status: r.status || 'Issued',
        issued_by: actorName,
        created_at: r.created_at || new Date().toISOString(),
      };
    }),
    restaurantId
  );

  summary.hr_documents = await syncRowsByPojId(
    'hr_documents',
    (t.hr_documents || []).map((r) => {
      const s = resolveStaff(r);
      const contentObj = typeof r.content === 'object' && r.content !== null ? r.content : {};
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        staff_email: s.staff_email,
        title: contentObj.subject || r.title || r.category || 'HR Document',
        document_type: r.document_type || 'Letter',
        category: r.category || 'Policy',
        content: contentObj,
        file_url: contentObj.file_url || r.file_url || null,
        notes: contentObj.text || r.notes || '',
        status: r.status || 'Pending',
        signature_data: r.signature_data || null,
        signed_at: r.signed_at || null,
        expires_at: r.expires_at || null,
        created_at: r.created_at || new Date().toISOString(),
      };
    }),
    restaurantId
  );

  // 7. Shifts & daily checklists
  onProgress?.('Importing shifts & daily checklists…');
  summary.shifts = await syncRowsByPojId(
    'shifts',
    (t.shifts || []).map((r) => {
      const s = resolveStaff(r);
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id || `${r.user_id}:${r.shift_date}`),
        staff_id: s.staff_id,
        staff_name: s.staff_name,
        staff_email: s.staff_email,
        shift_date: r.shift_date,
        shift_type: r.shift_type || r.shift || 'FOH',
        department: r.department || 'FOH',
        start_time: r.start_time || null,
        end_time: r.end_time || null,
        notes: r.notes || '',
      };
    }),
    restaurantId
  );

  summary.daily_checklists = await syncRowsByPojId(
    'daily_checklists',
    (t.daily_checklists || []).map((r) => {
      const s = resolveStaff(r);
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        staff_id: s.staff_id,
        staff_name: r.staff_name || s.staff_name,
        checklist_date: r.checklist_date || String(r.created_at || new Date().toISOString()).slice(0, 10),
        shift_type: r.shift_type || 'Opening',
        items: Array.isArray(r.items) ? r.items : [],
        notes: r.notes || '',
        status: r.status || 'Pending',
        completed_at: r.completed_at || null,
      };
    }),
    restaurantId
  );

  // 8. Expenses, Overheads, FP&A Budgets & Delivery Fees
  onProgress?.('Importing expenses, budgets & delivery fees…');
  summary.expenses = await syncRowsByPojId(
    'expenses',
    (t.expenses || []).map((r) => ({
      restaurant_id: restaurantId,
      source_poj_id: String(r.id),
      category: r.category || 'Operating Expense',
      department: r.department || 'Operations',
      description: r.description || r.item_name || 'Expense',
      amount: Number(r.amount || r.total_amount || 0),
      payment_method: r.payment_method || 'Cash',
      vendor_name: r.supplier || r.vendor_name || null,
      expense_date: r.purchase_date || r.expense_date || String(r.created_at || new Date().toISOString()).slice(0, 10),
      recorded_by: r.recorded_by || r.captured_by || actorName,
      status: r.status || 'Recorded',
      expense_type: r.expense_type || r.type || 'OPEX',
      po_id: r.po_id ? String(r.po_id) : null,
      is_vatted: Boolean(r.is_vatted),
      vat_amount: Number(r.vat_amount || 0),
      delivery_fee_incurred: Boolean(r.delivery_fee_incurred),
      delivery_fee_amount: Number(r.delivery_fee_amount || 0),
      receipt_url: r.receipt_url || null,
      payment_status: r.payment_status || 'Paid',
      qty: Number(r.qty || 1),
      created_at: r.created_at || new Date().toISOString(),
    })),
    restaurantId
  );

  summary.accountant_monthly_overheads = await syncRowsByPojId(
    'accountant_monthly_overheads',
    (t.accountant_monthly_overheads || []).map((r) => ({
      restaurant_id: restaurantId,
      source_poj_id: String(r.id || `${r.month_key}:${r.category}`),
      month_key: r.month_key,
      category: r.category,
      budget_amount: Number(r.budget_amount || 0),
      actual_amount: Number(r.actual_amount || 0),
      notes: r.notes || '',
    })),
    restaurantId
  );

  summary.fpa_department_budgets = await syncRowsByPojId(
    'fpa_department_budgets',
    (t.fpa_department_budgets || []).map((r) => ({
      restaurant_id: restaurantId,
      source_poj_id: String(r.id || `${r.month_key}:${r.category}`),
      month_key: r.month_key,
      category: r.category,
      budget_amount: Number(r.budget_amount || 0),
    })),
    restaurantId
  );

  summary.delivery_fees = await syncRowsByPojId(
    'delivery_fees',
    (t.delivery_fees || []).map((r) => ({
      restaurant_id: restaurantId,
      source_poj_id: String(r.id),
      fee_date: r.fee_date || r.date || String(r.created_at || new Date().toISOString()).slice(0, 10),
      logistics_type: r.logistics_type || r.type || 'Inbound Supplies',
      provider: r.provider || r.rider_name || '',
      cost_amount: Number(r.cost_amount || r.amount || r.fee || 0),
      customer_charged: Number(r.customer_charged || 0),
      order_ref: r.order_id || r.order_ref || null,
      po_ref: r.po_ref || r.po_id || null,
      supplier_name: r.supplier_name || null,
      payment_status: r.payment_status || 'Paid',
      notes: r.notes || '',
    })),
    restaurantId
  );

  // 9. Guests, Feedback, QR Vault
  onProgress?.('Importing Guest CRM, feedback & QR codes…');
  summary.guests = await syncRowsByPojId(
    'guests',
    (t.guests || []).map((r) => ({
      restaurant_id: restaurantId,
      source_poj_id: String(r.id),
      first_name: r.first_name || r.name || 'Guest',
      last_name: r.last_name || '',
      phone: r.phone || null,
      email: r.email || null,
      delivery_address: r.delivery_address || r.address || null,
      visit_count: Number(r.visit_count || 0),
      lifetime_spend: Number(r.lifetime_spend || 0),
      notes: r.notes || null,
      created_at: r.created_at || new Date().toISOString(),
    })),
    restaurantId
  );

  // Build POJ guest id -> ManiPOS guest id map so tags & visits attach cleanly
  if ((t.guest_tags || []).length || (t.guest_visits || []).length) {
    const { data: maniGuests } = await supabase
      .from('guests')
      .select('id, source_poj_id')
      .eq('restaurant_id', restaurantId)
      .not('source_poj_id', 'is', null);
    const guestIdMap = new Map((maniGuests || []).map((g) => [String(g.source_poj_id), g.id]));

    summary.guest_tags = await syncRowsByPojId(
      'guest_tags',
      (t.guest_tags || [])
        .filter((r) => guestIdMap.get(String(r.guest_id)))
        .map((r) => ({
          restaurant_id: restaurantId,
          source_poj_id: String(r.id),
          guest_id: guestIdMap.get(String(r.guest_id)),
          tag_name: r.tag_name,
          color: r.color || '#18A07A',
        })),
      restaurantId
    );

    summary.guest_visits = await syncRowsByPojId(
      'guest_visits',
      (t.guest_visits || [])
        .filter((r) => guestIdMap.get(String(r.guest_id)))
        .map((r) => ({
          restaurant_id: restaurantId,
          source_poj_id: String(r.id),
          guest_id: guestIdMap.get(String(r.guest_id)),
          visit_date: r.visit_date || String(r.created_at || '').slice(0, 10),
          spend: Number(r.spend || 0),
          table_number: r.table_number || null,
          notes: r.notes || null,
        })),
      restaurantId
    );
  }

  summary.pos_feedback = await syncRowsByPojId(
    'pos_feedback',
    (t.pos_feedback || []).map((r) => ({
      restaurant_id: restaurantId,
      source_poj_id: String(r.id),
      rating: r.rating || 5,
      category: r.category || 'General',
      comment: r.comment || r.feedback || '',
      customer_name: r.customer_name || 'Guest',
      customer_contact: r.customer_contact || r.phone || null,
      created_at: r.created_at || new Date().toISOString(),
    })),
    restaurantId
  );

  summary.saved_qrcodes = await syncRowsByPojId(
    'saved_qrcodes',
    (t.saved_qrcodes || []).map((r) => ({
      restaurant_id: restaurantId,
      source_poj_id: String(r.id),
      label: r.label || 'POJ QR',
      url: r.url || '',
      qr_url: r.qr_url || null,
      category: r.category || 'Menu',
    })),
    restaurantId
  );

  // 10. Inventory & Purchase Orders (safe column mapping)
  onProgress?.('Importing inventory items & purchase orders…');
  summary.inventory_items = await syncRowsByPojId(
    'inventory_items',
    (t.inventory_items || []).map((r) => ({
      restaurant_id: restaurantId,
      source_poj_id: String(r.id),
      name: r.name || 'Item',
      category: r.category || 'Other',
      sku: r.sku || null,
      unit: r.unit || 'piece',
      quantity: Number(r.quantity || r.current_stock || 0),
      reorder_threshold: Number(r.reorder_threshold || r.reorder_level || 0),
      cost_price: Number(r.cost_price || r.unit_cost || 0),
      supplier: r.supplier || r.supplier_name || null,
      is_active: true,
    })),
    restaurantId
  );

  summary.purchase_orders = await syncRowsByPojId(
    'purchase_orders',
    (t.purchase_orders || []).map((r) => {
      const rawStatus = String(r.approval_status || r.status || 'ordered').toLowerCase();
      const normalizedStatus =
        rawStatus === 'received' ? 'received' :
          rawStatus === 'partial' ? 'partial' :
            rawStatus === 'cancelled' || rawStatus === 'rejected' ? 'cancelled' :
              rawStatus === 'draft' ? 'draft' : 'ordered';
      return {
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        po_number: r.po_number || `POJ-${String(r.id).slice(0, 6).toUpperCase()}`,
        supplier_name: r.supplier_name || r.supplier || 'Supplier',
        status: normalizedStatus,
        total_cost: Number(r.total_cost || r.total_amount || 0),
        notes: r.notes || null,
        created_by: r.created_by || actorName,
        created_at: r.created_at || new Date().toISOString(),
      };
    }),
    restaurantId
  );

  // 10b. Categories, Menu Items & Modifier Groups (e.g. Preference / Spice Level, Protein Add-on, etc.)
  onProgress?.('Importing menu categories, items & all modifier groups…');
  const catalogSummary = await syncPojCatalogAndModifiersToManiPos({
    restaurantId,
    snapshotTables: t,
    onProgress,
  });
  summary.pos_categories = catalogSummary.pos_categories;
  summary.pos_menu = catalogSummary.pos_menu;
  summary.menu_modifier_groups = catalogSummary.menu_modifier_groups;

  // 11. POS Orders & Line Items (when pos_orders.source_poj_id exists)
  if ((t.pos_orders || []).length) {
    onProgress?.('Importing POS order history…');
    summary.pos_orders = await syncRowsByPojId(
      'pos_orders',
      (t.pos_orders || []).map((r) => ({
        restaurant_id: restaurantId,
        source_poj_id: String(r.id),
        ticket_number: r.ticket_number != null ? String(r.ticket_number) : '',
        customer_name: r.customer_name || 'Walk-in Guest',
        dining_option: r.dining_option || 'Dine In',
        payment_method: r.payment_method || 'Cash',
        payment_status: r.payment_status || 'Paid',
        status: r.status || 'Completed',
        total_amount: Number(r.total_amount || 0),
        discount: Number(r.discount || 0),
        cashier_name: r.cashier_name || 'Staff',
        notes: r.notes || null,
        brand: r.brand || 'POT OF JOLLOF',
        order_channel: r.order_channel || 'Walk-in',
        delivery_address: r.delivery_address || null,
        delivery_fee: Number(r.delivery_fee || 0),
        created_at: r.created_at || new Date().toISOString(),
      })),
      restaurantId
    );

    if ((t.pos_order_items || []).length) {
      onProgress?.('Importing POS order line items…');
      try {
        const orderMapRes = await supabase
          .from('pos_orders')
          .select('id, source_poj_id')
          .eq('restaurant_id', restaurantId)
          .not('source_poj_id', 'is', null);

        if (!orderMapRes.error && Array.isArray(orderMapRes.data)) {
          const pojOrderIdToManiId = new Map();
          for (const o of orderMapRes.data) {
            if (o.source_poj_id) pojOrderIdToManiId.set(String(o.source_poj_id), o.id);
          }

          const maniOrderIds = Array.from(new Set(pojOrderIdToManiId.values()));
          const existingItemPojIds = new Set();
          for (let i = 0; i < maniOrderIds.length; i += 200) {
            const chunkIds = maniOrderIds.slice(i, i + 200);
            const exItems = await supabase
              .from('pos_order_items')
              .select('source_poj_id')
              .in('order_id', chunkIds)
              .not('source_poj_id', 'is', null);
            if (!exItems.error && Array.isArray(exItems.data)) {
              for (const row of exItems.data) {
                if (row.source_poj_id) existingItemPojIds.add(String(row.source_poj_id));
              }
            }
          }

          const newItemRows = [];
          for (const r of t.pos_order_items || []) {
            const pojItemId = r?.id != null ? String(r.id) : '';
            const maniOrderId = pojOrderIdToManiId.get(String(r?.order_id || ''));
            if (!pojItemId || !maniOrderId || existingItemPojIds.has(pojItemId)) continue;
            existingItemPojIds.add(pojItemId);
            newItemRows.push({
              order_id: maniOrderId,
              source_poj_id: pojItemId,
              item_name: r.item_name || r.name || 'Item',
              quantity: Number(r.quantity || 1),
              price: Number(r.price || 0),
              instructions: r.instructions || null,
              modifiers: Array.isArray(r.modifiers) ? r.modifiers : [],
              notes: r.notes || null,
              status: r.status || 'Completed',
              created_at: r.created_at || new Date().toISOString(),
            });
          }

          let itemInserted = 0;
          let itemErr = null;
          for (let i = 0; i < newItemRows.length; i += 200) {
            const chunk = newItemRows.slice(i, i + 200);
            const { error } = await supabase.from('pos_order_items').insert(chunk);
            if (error) itemErr = error.message;
            else itemInserted += chunk.length;
          }
          summary.pos_order_items = {
            inserted: itemInserted,
            updated: 0,
            skipped: (t.pos_order_items || []).length - newItemRows.length,
            error: itemErr,
          };
        }
      } catch (err) {
        summary.pos_order_items = { inserted: 0, updated: 0, skipped: 0, error: err?.message || 'Failed importing order items' };
      }
    }
  }

  // Record sync timestamp in restaurant_poj_links
  try {
    await supabase.from('restaurant_poj_links').upsert(
      {
        restaurant_id: restaurantId,
        poj_supabase_url: snapshot.sourceUrl || POJ_DEFAULT_URL,
        last_synced_at: new Date().toISOString(),
        last_synced_by: actorName,
        sync_summary: summary,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'restaurant_id' }
    );
  } catch (_) { }

  return summary;
}

/**
 * Optionally pushes an HR approval status change (Approve/Reject) back to pojmanagement.com
 * when the admin has active POJ credentials linked in session.
 */
export async function pushPojRequestStatus({
  pojUrl = POJ_DEFAULT_URL,
  email,
  password,
  table,
  sourcePojId,
  status,
}) {
  if (!email || !password || !sourcePojId || !table) return { ok: false };
  try {
    const client = makePojClient(pojUrl, POJ_ANON_KEY);
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data?.session) return { ok: false, error: error?.message };
    const { error: updErr } = await client
      .from(table)
      .update({ status })
      .eq('id', sourcePojId);
    await client.auth.signOut().catch(() => { });
    return { ok: !updErr, error: updErr?.message };
  } catch (err) {
    return { ok: false, error: err?.message };
  }
}

async function resolvePojBridgeUrl(tenantSlug, restaurantId) {
  const cleanSlug = String(tenantSlug || '').toLowerCase().trim();
  if (restaurantId) {
    try {
      const { data: linkRow } = await supabase
        .from('restaurant_poj_links')
        .select('poj_supabase_url, link_auth_enabled')
        .eq('restaurant_id', restaurantId)
        .limit(1)
        .maybeSingle();
      if (linkRow) {
        if (linkRow.link_auth_enabled === false) return null;
        return String(linkRow.poj_supabase_url || POJ_DEFAULT_URL).replace(/\/+$/, '');
      }
    } catch (_) { }
  }
  return cleanSlug === 'potofjollof' ? POJ_DEFAULT_URL : null;
}

let edgePojOrdersSyncUnavailable = false;

export function resetPojEdgeProxyCache() {
  edgePojOrdersSyncUnavailable = false;
}

function mapRawPojOrders(rows, restaurantId) {
  return (Array.isArray(rows) ? rows : []).map((o) => ({
    ...o,
    restaurant_id: restaurantId,
    source_poj_id: String(o.id),
    ticket_number: o.ticket_number != null ? String(o.ticket_number) : '',
    items: Array.isArray(o.items) ? o.items : [],
    _fromPoj: true,
  }));
}

/**
 * Fetches live pos_orders from linked pojmanagement.com for a date range
 * so Order History and Admin Dashboard show orders placed on either system.
 * Uses the `poj-orders-sync` Edge Function when the staff member signed in via
 * Store Code + 4-digit PIN (no POJ user JWT) so line items are populated too.
 */
export async function fetchPojOrdersForRange({
  tenantSlug,
  restaurantId,
  startIso = null,
  endIso = null,
  limit = 200,
  timeoutMs = 15000,
}) {
  if (!restaurantId) return [];
  const pojUrl = await resolvePojBridgeUrl(tenantSlug, restaurantId);
  if (!pojUrl) return [];

  const bearer = await getValidPojAccessToken(pojUrl);
  const needsEdgeProxy = bearer === POJ_ANON_KEY;

  if (needsEdgeProxy && !edgePojOrdersSyncUnavailable) {
    try {
      const fnRes = await supabase.functions.invoke('poj-orders-sync', {
        body: {
          restaurant_id: restaurantId,
          tenant_slug: tenantSlug,
          startIso,
          endIso,
          limit,
        },
      });
      if (!fnRes?.error && fnRes?.data?.ok && Array.isArray(fnRes.data.orders)) {
        return mapRawPojOrders(fnRes.data.orders, restaurantId);
      }
      if (fnRes?.data?.missingSecret || fnRes?.data?.notLinked || fnRes?.data?.wrongKeyRole) {
        edgePojOrdersSyncUnavailable = true;
      }
    } catch (_) {
      // Transient network/timeout error — do not permanently disable edge proxy
    }
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const params = new URLSearchParams();
    params.set('select', '*,items:pos_order_items(*)');
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    if (startIso) params.append('created_at', `gte.${startIso}`);
    if (endIso) params.append('created_at', `lte.${endIso}`);

    const res = await fetch(`${pojUrl}/rest/v1/pos_orders?${params.toString()}`, {
      headers: {
        apikey: POJ_ANON_KEY,
        Authorization: `Bearer ${bearer}`,
      },
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];

    return mapRawPojOrders(rows, restaurantId);
  } catch (_) {
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Maps a POJ `menu_modifier_groups` record onto a ManiPOS `menu_modifier_groups`
 * payload, resolving `menu_item_ids` across databases by normalized item name and
 * clamping legacy invalid `min_selected` values cleanly.
 */
export function remapPojModifierGroupForManiPos({
  pojGroup,
  pojNameById = new Map(),
  maniIdByName = new Map(),
  existingGroup = null,
}) {
  const sanitizedOptions = (Array.isArray(pojGroup?.options) ? pojGroup.options : [])
    .filter((o) => o && String(o.name || o.label || '').trim() !== '')
    .map((o) => ({
      name: String(o.name || o.label).trim(),
      price: Number(o.price) || 0,
      is_available: o.is_available !== false,
    }));

  const existingOptions = Array.isArray(existingGroup?.options) ? existingGroup.options : [];
  const finalOptions = sanitizedOptions.length > 0 ? sanitizedOptions : existingOptions;

  const mappedIds = [];
  const seenIds = new Set();
  const pushManiId = (id) => {
    if (!id) return;
    const str = String(id);
    if (!seenIds.has(str)) {
      seenIds.add(str);
      mappedIds.push(str);
    }
  };

  for (const id of Array.isArray(existingGroup?.menu_item_ids) ? existingGroup.menu_item_ids : []) {
    pushManiId(id);
  }
  for (const pojItemId of Array.isArray(pojGroup?.menu_item_ids) ? pojGroup.menu_item_ids : []) {
    const normName = pojNameById.get(String(pojItemId));
    if (normName) {
      pushManiId(maniIdByName.get(normName));
    }
  }
  for (const normName of Array.isArray(pojGroup?._matchedItemNames) ? pojGroup._matchedItemNames : []) {
    pushManiId(maniIdByName.get(normalizeMenuText(normName)));
  }

  const hasExistingGroup = Boolean(
    existingGroup && (existingGroup.id || typeof existingGroup.is_required === 'boolean')
  );
  const resolvedIsRequired = hasExistingGroup
    ? Boolean(existingGroup.is_required)
    : Boolean(pojGroup?.is_required);
  const effectiveMin = computeEffectiveMinSelected({
    ...pojGroup,
    is_required: resolvedIsRequired,
    min_selected: hasExistingGroup ? Number(existingGroup.min_selected ?? 0) : pojGroup?.min_selected,
    options: finalOptions,
  });
  const rawMax = Number(pojGroup?.max_selected);
  const effectiveMax = Number.isFinite(rawMax) && rawMax > 0 ? Math.max(effectiveMin || 1, rawMax) : Math.max(1, finalOptions.length);

  return {
    name: String(pojGroup?.name || existingGroup?.name || 'Modifiers').trim(),
    is_required: resolvedIsRequired,
    min_selected: effectiveMin,
    max_selected: effectiveMax,
    allow_multiple: Boolean(pojGroup?.allow_multiple ?? (effectiveMax > 1)),
    options: finalOptions,
    menu_item_ids: mappedIds,
  };
}

/**
 * Exports and imports ALL POJ `pos_categories`, `pos_menu`, and `menu_modifier_groups`
 * (including `Preference` spice levels, `Protein Add-on`, `Swallow Choice`, etc.)
 * into ManiPOS cleanly without duplicates, matching by normalized name.
 */
export async function syncPojCatalogAndModifiersToManiPos({
  tenantSlug,
  restaurantId,
  snapshotTables = null,
  onProgress = null,
}) {
  const result = {
    pos_categories: { inserted: 0, updated: 0, error: null },
    pos_menu: { inserted: 0, updated: 0, error: null },
    menu_modifier_groups: { inserted: 0, updated: 0, error: null },
    error: null,
  };
  if (!restaurantId) return result;

  try {
    setTenantContext(restaurantId);

    let pojCategories = Array.isArray(snapshotTables?.pos_categories) ? snapshotTables.pos_categories : null;
    let pojMenu = Array.isArray(snapshotTables?.pos_menu) ? snapshotTables.pos_menu : null;
    let pojModifiers = Array.isArray(snapshotTables?.menu_modifier_groups) ? snapshotTables.menu_modifier_groups : null;

    if (!pojMenu || !pojModifiers) {
      const pojUrl = await resolvePojBridgeUrl(tenantSlug, restaurantId);
      if (!pojUrl) return result;
      const bearer = await getValidPojAccessToken(pojUrl);
      const headers = {
        apikey: POJ_ANON_KEY,
        Authorization: `Bearer ${bearer}`,
      };
      const [catRes, menuRes, modRes] = await Promise.all([
        pojCategories ? Promise.resolve(null) : fetch(`${pojUrl}/rest/v1/pos_categories?select=*&limit=500`, { headers }).catch(() => null),
        pojMenu ? Promise.resolve(null) : fetch(`${pojUrl}/rest/v1/pos_menu?select=*&limit=1500`, { headers }),
        pojModifiers ? Promise.resolve(null) : fetch(`${pojUrl}/rest/v1/menu_modifier_groups?select=*&limit=500`, { headers }),
      ]);
      if (!pojCategories) pojCategories = catRes?.ok ? (await catRes.json().catch(() => [])) : [];
      if (!pojMenu) pojMenu = menuRes?.ok ? (await menuRes.json().catch(() => [])) : [];
      if (!pojModifiers) pojModifiers = modRes?.ok ? (await modRes.json().catch(() => [])) : [];
    }

    pojCategories = Array.isArray(pojCategories) ? pojCategories : [];
    pojMenu = Array.isArray(pojMenu) ? pojMenu : [];
    pojModifiers = Array.isArray(pojModifiers) ? pojModifiers : [];

    // 1. Categories
    onProgress?.('Syncing menu categories…');
    const existingCatsRes = await supabase
      .from('pos_categories')
      .select('id, name, display_order')
      .eq('restaurant_id', restaurantId);
    const existingCatNames = new Set(
      (existingCatsRes.data || []).map((c) => normalizeMenuText(c.name)).filter(Boolean)
    );
    const catsToInsert = [];
    const seenNewCats = new Set();
    let maxCatOrder = (existingCatsRes.data || []).length;

    for (const c of pojCategories) {
      const name = String(c?.name || '').trim();
      const norm = normalizeMenuText(name);
      if (!norm || existingCatNames.has(norm) || seenNewCats.has(norm)) continue;
      seenNewCats.add(norm);
      catsToInsert.push({
        restaurant_id: restaurantId,
        name,
        display_order: Number.isFinite(Number(c?.display_order)) ? Number(c.display_order) : maxCatOrder++,
      });
    }
    for (const pm of pojMenu) {
      const catName = String(pm?.category || '').trim();
      const norm = normalizeMenuText(catName);
      if (!norm || existingCatNames.has(norm) || seenNewCats.has(norm)) continue;
      seenNewCats.add(norm);
      catsToInsert.push({
        restaurant_id: restaurantId,
        name: catName,
        display_order: maxCatOrder++,
      });
    }
    if (catsToInsert.length > 0) {
      const { error: catErr } = await supabase.from('pos_categories').insert(catsToInsert);
      if (catErr) result.pos_categories.error = catErr.message;
      else result.pos_categories.inserted = catsToInsert.length;
    }

    // 2. Menu items (sync missing items + enrich brand pricing / metadata)
    onProgress?.('Syncing menu items & brands…');
    const existingMenuRes = await supabase
      .from('pos_menu')
      .select('*')
      .eq('restaurant_id', restaurantId);
    if (existingMenuRes.error) {
      result.pos_menu.error = existingMenuRes.error.message;
    }
    const existingMenu = Array.isArray(existingMenuRes.data) ? existingMenuRes.data : [];
    const maniByName = new Map();
    const maniIdByName = new Map();
    for (const m of existingMenu) {
      const key = normalizeMenuText(m?.name);
      if (key && !maniByName.has(key)) {
        maniByName.set(key, m);
        maniIdByName.set(key, String(m.id));
      }
    }

    const pojNameById = new Map();
    const menuItemsToInsert = [];
    for (const pm of pojMenu) {
      if (pm?.id != null && pm?.name) {
        pojNameById.set(String(pm.id), normalizeMenuText(pm.name));
      }
      const key = normalizeMenuText(pm?.name);
      if (!key) continue;

      const existing = maniByName.get(key);
      if (!existing) {
        menuItemsToInsert.push({
          base: {
            restaurant_id: restaurantId,
            name: String(pm.name).trim(),
            description: pm.description || '',
            category: pm.category || 'Uncategorized',
            subcategory: pm.subcategory || null,
            price: Number(pm.price) || 0,
            image_url: pm.image_url || null,
            is_available: pm.is_available !== false,
            show_on_microsite: pm.show_on_microsite !== false,
            is_featured: pm.is_featured === true,
            display_order: Number(pm.display_order) || 0,
          },
          extended: {
            brands: Array.isArray(pm.brands) ? pm.brands : undefined,
            brand: pm.brand || undefined,
            brand_prices: pm.brand_prices && typeof pm.brand_prices === 'object' ? pm.brand_prices : undefined,
            variations: Array.isArray(pm.variations) ? pm.variations : undefined,
            additions: Array.isArray(pm.additions) ? pm.additions : undefined,
          },
        });
      } else {
        // Backfill missing brand/image/variations metadata on existing ManiPOS item
        const patch = {};
        const hasManiBrands = Array.isArray(existing.brands) ? existing.brands.length > 0 : Boolean(existing.brands || existing.brand);
        const hasPojBrands = Array.isArray(pm.brands) ? pm.brands.length > 0 : Boolean(pm.brands || pm.brand);
        if (!hasManiBrands && hasPojBrands) {
          if (pm.brands !== undefined) patch.brands = pm.brands;
          if (pm.brand !== undefined) patch.brand = pm.brand;
        }
        if ((!existing.brand_prices || Object.keys(existing.brand_prices).length === 0) && pm.brand_prices && Object.keys(pm.brand_prices).length > 0) {
          patch.brand_prices = pm.brand_prices;
        }
        if (!existing.image_url && pm.image_url) patch.image_url = pm.image_url;
        if ((!Array.isArray(existing.variations) || existing.variations.length === 0) && Array.isArray(pm.variations) && pm.variations.length > 0) {
          patch.variations = pm.variations;
        }
        if ((!Array.isArray(existing.additions) || existing.additions.length === 0) && Array.isArray(pm.additions) && pm.additions.length > 0) {
          patch.additions = pm.additions;
        }
        if (Object.keys(patch).length > 0) {
          const { error: updErr } = await supabase
            .from('pos_menu')
            .update(patch)
            .eq('id', existing.id)
            .eq('restaurant_id', restaurantId);
          if (!updErr) result.pos_menu.updated += 1;
        }
      }
    }

    if (menuItemsToInsert.length > 0) {
      const extRows = menuItemsToInsert.map(({ base, extended }) => {
        const cleanExt = {};
        for (const [k, v] of Object.entries(extended)) {
          if (v !== undefined) cleanExt[k] = v;
        }
        return { ...base, ...cleanExt };
      });
      let insRes = await supabase.from('pos_menu').insert(extRows).select('id, name');
      if (insRes.error && /column .* does not exist|schema cache/i.test(insRes.error.message || '')) {
        insRes = await supabase
          .from('pos_menu')
          .insert(menuItemsToInsert.map(({ base }) => base))
          .select('id, name');
      }
      if (insRes.error) {
        result.pos_menu.error = insRes.error.message;
      } else {
        result.pos_menu.inserted = (insRes.data || []).length;
        for (const row of insRes.data || []) {
          const key = normalizeMenuText(row?.name);
          if (key) maniIdByName.set(key, String(row.id));
        }
      }
    }

    // 3. Modifier groups (import ALL POJ modifier groups & remap menu_item_ids)
    onProgress?.('Syncing all modifier groups & spice levels…');
    const existingModsRes = await supabase
      .from('menu_modifier_groups')
      .select('*')
      .eq('restaurant_id', restaurantId);
    if (existingModsRes.error) {
      result.menu_modifier_groups.error = existingModsRes.error.message;
      return result;
    }

    const existingModByName = new Map();
    for (const mg of existingModsRes.data || []) {
      const key = normalizeMenuText(mg?.name);
      if (key && !existingModByName.has(key)) existingModByName.set(key, mg);
    }

    const writeModWithFallback = async (existingId, payload) => {
      const run = (body) =>
        existingId
          ? supabase.from('menu_modifier_groups').update(body).eq('id', existingId).eq('restaurant_id', restaurantId)
          : supabase.from('menu_modifier_groups').insert([body]);
      let res = await run(payload);
      if (res.error && /allow_multiple/i.test(res.error.message || '')) {
        const { allow_multiple: _drop, ...compat } = payload;
        res = await run(compat);
      }
      return res;
    };

    for (const pg of pojModifiers) {
      const key = normalizeMenuText(pg?.name);
      if (!key) continue;
      const existingGroup = existingModByName.get(key) || null;
      const mapped = remapPojModifierGroupForManiPos({
        pojGroup: pg,
        pojNameById,
        maniIdByName,
        existingGroup,
      });

      const payload = {
        restaurant_id: restaurantId,
        ...mapped,
      };

      const { error: writeErr } = await writeModWithFallback(existingGroup?.id || null, payload);
      if (writeErr) {
        result.menu_modifier_groups.error = writeErr.message;
      } else if (existingGroup) {
        result.menu_modifier_groups.updated += 1;
      } else {
        result.menu_modifier_groups.inserted += 1;
      }
    }
  } catch (err) {
    result.error = err?.message || 'Catalog & modifier sync failed';
  }

  return result;
}

/**
 * Fetches live POJ menu items & modifier groups (matched cleanly by normalized item name)
 * so Create Order immediately exposes multi-brand menus, brand pricing, and modifier groups.
 */
export async function fetchPojCatalogEnrichment({
  tenantSlug,
  restaurantId,
  timeoutMs = 8000,
}) {
  if (!restaurantId) return { modifierGroups: [], pojMenuItems: [] };
  const pojUrl = await resolvePojBridgeUrl(tenantSlug, restaurantId);
  if (!pojUrl) return { modifierGroups: [], pojMenuItems: [] };

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const bearer = await getValidPojAccessToken(pojUrl);
    const headers = {
      apikey: POJ_ANON_KEY,
      Authorization: `Bearer ${bearer}`,
    };
    const [menuRes, modRes] = await Promise.all([
      fetch(`${pojUrl}/rest/v1/pos_menu?select=*&limit=1000`, {
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      }),
      fetch(`${pojUrl}/rest/v1/menu_modifier_groups?select=*&limit=500`, {
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      }),
    ]);

    const rawMenu = menuRes.ok ? await menuRes.json().catch(() => []) : [];
    const rawMods = modRes.ok ? await modRes.json().catch(() => []) : [];
    const pojMenuItems = Array.isArray(rawMenu) ? rawMenu : [];
    const nameById = new Map();
    for (const item of pojMenuItems) {
      if (item?.id != null && item?.name) {
        nameById.set(String(item.id), normalizeMenuText(item.name));
      }
    }

    const modifierGroups = (Array.isArray(rawMods) ? rawMods : []).map((g) => {
      const ids = Array.isArray(g?.menu_item_ids) ? g.menu_item_ids : [];
      const matchedNames = Array.from(
        new Set(ids.map((id) => nameById.get(String(id))).filter(Boolean))
      );
      return {
        ...g,
        _fromPoj: true,
        _matchedItemNames: matchedNames,
      };
    });

    return {
      modifierGroups,
      pojMenuItems: pojMenuItems.filter((m) => m && m.is_available !== false),
    };
  } catch (_) {
    return { modifierGroups: [], pojMenuItems: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function orderHasLineItems(order) {
  return (
    (Array.isArray(order?.pos_order_items) && order.pos_order_items.length > 0) ||
    (Array.isArray(order?.items) && order.items.length > 0)
  );
}

function orderTicketSignature(order) {
  const ticket = String(order?.ticket_number || '').trim().toUpperCase();
  if (!ticket) return '';
  const total = Math.round(Number(order?.total_amount || 0));
  return `${ticket}::${total}`;
}

/**
 * Applies an optimistic order update event (e.g. immediately after Accept/Decline
 * or Ready/Complete) into the in-memory orders array so the UI moves the order
 * immediately without requiring a browser refresh.
 */
export function applyOrderStatusUpdate(orders = [], detail = null) {
  const list = Array.isArray(orders) ? orders : [];
  const updated = detail?.updatedOrder;
  const targetId = detail?.orderId ? String(detail.orderId) : (updated?.id ? String(updated.id) : '');
  const targetPojId = detail?.sourcePojId
    ? String(detail.sourcePojId)
    : (updated?.source_poj_id ? String(updated.source_poj_id) : '');
  if (!targetId && !targetPojId && !updated) return list;

  let matched = false;
  const nextList = list.map((o) => {
    if (!o) return o;
    const oid = o.id ? String(o.id) : '';
    const opoj = o.source_poj_id ? String(o.source_poj_id) : '';
    const isMatch =
      (targetId && (oid === targetId || opoj === targetId)) ||
      (targetPojId && (opoj === targetPojId || oid === targetPojId));
    if (!isMatch) return o;
    matched = true;
    return {
      ...o,
      ...(updated || {}),
      id: o.id,
      items: orderHasLineItems(o) ? o.items : (updated?.items || o.items || []),
      pos_order_items: Array.isArray(o.pos_order_items) && o.pos_order_items.length > 0
        ? o.pos_order_items
        : (updated?.pos_order_items || o.pos_order_items || []),
    };
  });

  if (!matched && updated?.id) {
    return [updated, ...nextList];
  }
  return nextList;
}

/**
 * Merges ManiPOS pos_orders with linked POJ Management orders without duplicating
 * rows that already carry a matching source_poj_id, id, or ticket signature, while
 * preserving non-empty line items and flagging POJ-origin orders cleanly.
 */
export function mergeOrdersWithPoj(maniOrders = [], pojOrders = []) {
  const maniList = Array.isArray(maniOrders) ? maniOrders : [];
  const pojList = Array.isArray(pojOrders) ? pojOrders : [];
  if (!pojList.length) return maniList;

  const indexById = new Map();
  const indexByPojId = new Map();
  const indexBySig = new Map();
  const merged = maniList.map((o, idx) => {
    if (o?.id) indexById.set(String(o.id), idx);
    if (o?.source_poj_id) indexByPojId.set(String(o.source_poj_id), idx);
    const sig = orderTicketSignature(o);
    if (sig && !indexBySig.has(sig)) indexBySig.set(sig, idx);
    return o;
  });

  for (const po of pojList) {
    const poId = po?.id ? String(po.id) : '';
    const srcId = po?.source_poj_id ? String(po.source_poj_id) : poId;
    const sig = orderTicketSignature(po);
    const matchIdx =
      (poId && indexById.has(poId) ? indexById.get(poId) : undefined) ??
      (srcId && indexByPojId.has(srcId) ? indexByPojId.get(srcId) : undefined) ??
      (sig && indexBySig.has(sig) ? indexBySig.get(sig) : undefined);

    if (matchIdx !== undefined) {
      const existing = merged[matchIdx];
      const poItems = Array.isArray(po.items) && po.items.length > 0
        ? po.items
        : (Array.isArray(po.pos_order_items) ? po.pos_order_items : []);
      const nextItems =
        !orderHasLineItems(existing) && poItems.length > 0
          ? poItems
          : existing.items;
      merged[matchIdx] = {
        ...existing,
        source_poj_id: existing.source_poj_id || srcId || poId || null,
        _fromPoj: Boolean(existing._fromPoj || po._fromPoj),
        ...(nextItems !== existing.items ? { items: nextItems, pos_order_items: nextItems } : {}),
      };
      continue;
    }

    const newIdx = merged.length;
    merged.push(po);
    if (poId) indexById.set(poId, newIdx);
    if (srcId) indexByPojId.set(srcId, newIdx);
    if (sig && !indexBySig.has(sig)) indexBySig.set(sig, newIdx);
  }

  merged.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());
  return merged;
}

/**
 * Updates an order status on the linked pojmanagement.com database when staff
 * Accept, Decline, Ready, Complete, or Void an order synced via the POJ bridge.
 */
export async function updatePojOrderStatus({
  tenantSlug,
  restaurantId,
  pojOrderId,
  patch = {},
  timeoutMs = 8000,
}) {
  if (!restaurantId || !pojOrderId) return { ok: false, error: 'Missing order or restaurant ID' };
  const pojUrl = await resolvePojBridgeUrl(tenantSlug, restaurantId);
  if (!pojUrl) return { ok: false, error: 'No linked POJ bridge configured' };

  const cleanPatch = { ...patch };
  const optionalCols = [
    'accepted_at',
    'kitchen_started_at',
    'kitchen_ready_at',
    'completed_at',
    'return_reason',
    'void_reason',
    'void_disposition',
    'payment_status',
    'mpesa_receipt_number',
  ];

  const bearer = await getValidPojAccessToken(pojUrl);
  const needsEdgeProxy = bearer === POJ_ANON_KEY;

  if (needsEdgeProxy && !edgePojOrdersSyncUnavailable) {
    try {
      const fnRes = await supabase.functions.invoke('poj-orders-sync', {
        body: {
          action: 'patch_order',
          restaurant_id: restaurantId,
          tenant_slug: tenantSlug,
          poj_order_id: String(pojOrderId),
          patch: cleanPatch,
        },
      });
      if (!fnRes?.error && fnRes?.data?.ok) {
        return { ok: true, data: fnRes.data.data || [] };
      }
      if (fnRes?.data?.missingSecret || fnRes?.data?.notLinked || fnRes?.data?.wrongKeyRole) {
        edgePojOrdersSyncUnavailable = true;
      } else if (fnRes?.data?.error) {
        return { ok: false, error: fnRes.data.error };
      }
    } catch (_) {
      // Fall through to direct REST attempt
    }
  }

  const attemptPatch = async (payload) => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;
    try {
      const res = await fetch(
        `${pojUrl}/rest/v1/pos_orders?id=eq.${encodeURIComponent(String(pojOrderId))}`,
        {
          method: 'PATCH',
          headers: {
            apikey: POJ_ANON_KEY,
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify(payload),
          ...(controller ? { signal: controller.signal } : {}),
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
      }
      const rows = await res.json().catch(() => []);
      return { ok: true, data: Array.isArray(rows) ? rows : [] };
    } catch (err) {
      return { ok: false, error: err?.message || 'Network error' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let working = { ...cleanPatch };
  let last = await attemptPatch(working);
  for (let i = 0; i < optionalCols.length && !last.ok; i += 1) {
    const msg = String(last.error || '').toLowerCase();
    const missing = optionalCols.find((col) => col in working && msg.includes(col));
    if (!missing) break;
    const next = { ...working };
    delete next[missing];
    working = next;
    last = await attemptPatch(working);
  }
  return last;
}
