import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  Wallet,
  CreditCard,
  AlertTriangle,
  FileText,
  CheckSquare,
  Check,
  X,
  Plus,
  Loader2,
  LogOut,
  Users,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DEFAULT_CHECKLIST_ITEMS = [
  'Sanitize prep counters & handwash stations',
  'Verify cold-chain fridge & freezer temperatures',
  'Check POS register float & M-Pesa Till/Paybill connection',
  'Confirm Kitchen Display & printer paper roll stock',
  'Review 86d / out-of-stock menu items before service',
];

function badgeStyle(status) {
  const s = String(status || 'Pending').toLowerCase();
  if (s === 'approved' || s === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s === 'rejected' || s === 'declined') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export function HrAndStaffPortalView({
  mode = 'self-service', // 'self-service' | 'hr-admin'
  restaurantId,
  restaurantName = 'ManiPOS Store',
  staffUser = {},
  staffList = [],
  onSignOut,
  onOpenPos,
}) {
  const isAdminMode = mode === 'hr-admin';
  const [subTab, setSubTab] = useState('leave');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const [leaves, setLeaves] = useState([]);
  const [overtimes, setOvertimes] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [loans, setLoans] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [docs, setDocs] = useState([]);
  const [checklists, setChecklists] = useState([]);

  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'Annual Leave',
    start_date: '',
    end_date: '',
    days_count: 1,
    reason: '',
  });
  const [otForm, setOtForm] = useState({ work_date: '', hours: 2, reason: '' });
  const [advForm, setAdvForm] = useState({ amount: '', repayment_month: '', reason: '' });
  const [loanForm, setLoanForm] = useState({ amount: '', installments_months: 3, reason: '' });
  const [warnForm, setWarnForm] = useState({ staff_name: '', reason: '', details: '' });
  const [docForm, setDocForm] = useState({ title: '', category: 'Policy', file_url: '', notes: '' });
  const [checklistTicks, setChecklistTicks] = useState(() => DEFAULT_CHECKLIST_ITEMS.map((t) => ({ label: t, done: false })));
  const [shiftType, setShiftType] = useState('Opening');

  const actorName = staffUser?.name || 'Staff';
  const actorEmail = staffUser?.email || '';
  const actorId = staffUser?.id || null;

  const loadAll = async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [lv, ot, ad, ln, wn, dc, ck] = await Promise.all([
        supabase.from('leave_requests').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('overtime_records').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('salary_advances').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('loan_requests').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('warnings').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('hr_documents').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('daily_checklists').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
      ]);
      setLeaves(lv.data || []);
      setOvertimes(ot.data || []);
      setAdvances(ad.data || []);
      setLoans(ln.data || []);
      setWarnings(wn.data || []);
      setDocs(dc.data || []);
      setChecklists(ck.data || []);
    } catch (_) {
      // Migration pending safe fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [restaurantId]);

  const scopeMine = (rows) => {
    if (isAdminMode) return rows;
    return rows.filter(
      (r) =>
        (actorId && r.staff_id === actorId) ||
        (actorEmail && String(r.staff_email || '').toLowerCase() === actorEmail.toLowerCase()) ||
        String(r.staff_name || '').toLowerCase() === actorName.toLowerCase()
    );
  };

  const insertRecord = async (table, payload, resetCb, msg) => {
    if (!restaurantId) return;
    setSaving(true);
    setNotice('');
    try {
      const { error } = await supabase.from(table).insert([{ restaurant_id: restaurantId, ...payload }]);
      if (error) throw error;
      resetCb?.();
      setNotice(msg);
      await loadAll();
    } catch (err) {
      setNotice(err.message || `Apply SQL migration 20261117 to enable ${table}.`);
    } finally {
      setSaving(false);
    }
  };

  const reviewRequest = async (table, id, nextStatus) => {
    if (!restaurantId || !id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from(table)
        .update({ status: nextStatus, reviewed_by: actorName })
        .eq('id', id)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
      await loadAll();
    } catch (err) {
      setNotice(err.message || 'Could not update request');
    } finally {
      setSaving(false);
    }
  };

  const pendingCounts = useMemo(
    () => ({
      leave: leaves.filter((r) => String(r.status).toLowerCase() === 'pending').length,
      overtime: overtimes.filter((r) => String(r.status).toLowerCase() === 'pending').length,
      advance: advances.filter((r) => String(r.status).toLowerCase() === 'pending').length,
      loan: loans.filter((r) => String(r.status).toLowerCase() === 'pending').length,
    }),
    [leaves, overtimes, advances, loans]
  );

  return (
    <div className={isAdminMode ? 'space-y-5' : 'min-h-screen bg-slate-50 text-slate-900'}>
      {!isAdminMode && (
        <header className="bg-[#0B3B24] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
              {restaurantName} · Staff Self-Service & HR Portal
            </p>
            <h1 className="text-lg font-black">
              Welcome, {actorName} ({staffUser?.role || 'staff'})
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {onOpenPos && ['cashier', 'waiter', 'manager', 'admin'].includes(staffUser?.role) && (
              <button
                type="button"
                onClick={onOpenPos}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black cursor-pointer"
              >
                Open POS Register
              </button>
            )}
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="px-3.5 py-2 rounded-xl bg-emerald-900 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut size={14} /> Sign Out
              </button>
            )}
          </div>
        </header>
      )}

      <div className={isAdminMode ? 'space-y-5' : 'max-w-6xl mx-auto p-6 space-y-5'}>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">
              {isAdminMode ? 'HR Approvals, People Requests & Staff Documents' : 'My Staff Portal (Leave, Overtime, Advances, Loans & Checklists)'}
            </h2>
            <p className="text-xs text-slate-500">
              Collapsed from POJ Management directly into ManiPOS multi-tenant workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'leave', label: `Leave${isAdminMode && pendingCounts.leave ? ` (${pendingCounts.leave})` : ''}`, icon: Calendar },
              { id: 'overtime', label: `Overtime${isAdminMode && pendingCounts.overtime ? ` (${pendingCounts.overtime})` : ''}`, icon: Clock },
              { id: 'advance', label: `Salary Advances${isAdminMode && pendingCounts.advance ? ` (${pendingCounts.advance})` : ''}`, icon: Wallet },
              { id: 'loan', label: `Loans${isAdminMode && pendingCounts.loan ? ` (${pendingCounts.loan})` : ''}`, icon: CreditCard },
              { id: 'checklists', label: 'Daily Checklists', icon: CheckSquare },
              { id: 'warnings', label: 'Warnings', icon: AlertTriangle },
              { id: 'docs', label: 'HR Docs', icon: FileText },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
                    subTab === t.id ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-3 rounded-xl">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 flex items-center justify-center gap-2 text-slate-500 text-xs font-bold">
            <Loader2 className="animate-spin" size={16} /> Loading HR records...
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* LEFT FORM */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              {subTab === 'leave' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    insertRecord(
                      'leave_requests',
                      { ...leaveForm, staff_id: actorId, staff_name: actorName, staff_email: actorEmail, status: 'Pending' },
                      () => setLeaveForm({ leave_type: 'Annual Leave', start_date: '', end_date: '', days_count: 1, reason: '' }),
                      'Leave request submitted.'
                    );
                  }}
                  className="space-y-3"
                >
                  <h3 className="text-sm font-black text-slate-900">Request Leave</h3>
                  <select
                    value={leaveForm.leave_type}
                    onChange={(e) => setLeaveForm((p) => ({ ...p, leave_type: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option>Annual Leave</option>
                    <option>Sick Leave</option>
                    <option>Compassionate Leave</option>
                    <option>Maternity / Paternity</option>
                    <option>Unpaid Leave</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" required value={leaveForm.start_date} onChange={(e) => setLeaveForm((p) => ({ ...p, start_date: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    <input type="date" required value={leaveForm.end_date} onChange={(e) => setLeaveForm((p) => ({ ...p, end_date: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  </div>
                  <input type="number" min="0.5" step="0.5" value={leaveForm.days_count} onChange={(e) => setLeaveForm((p) => ({ ...p, days_count: Number(e.target.value) || 1 }))} placeholder="Days" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <textarea rows={2} value={leaveForm.reason} onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Reason / Handover notes" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                  <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer">
                    Submit Leave Request
                  </button>
                </form>
              )}

              {subTab === 'overtime' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    insertRecord(
                      'overtime_records',
                      { ...otForm, staff_id: actorId, staff_name: actorName, staff_email: actorEmail, status: 'Pending' },
                      () => setOtForm({ work_date: '', hours: 2, reason: '' }),
                      'Overtime claim logged.'
                    );
                  }}
                  className="space-y-3"
                >
                  <h3 className="text-sm font-black text-slate-900">Log Overtime Hours</h3>
                  <input type="date" required value={otForm.work_date} onChange={(e) => setOtForm((p) => ({ ...p, work_date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <input type="number" min="0.5" step="0.5" required value={otForm.hours} onChange={(e) => setOtForm((p) => ({ ...p, hours: Number(e.target.value) || 1 }))} placeholder="Extra Hours" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <textarea rows={2} value={otForm.reason} onChange={(e) => setOtForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Shift / Duty notes" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                  <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer">
                    Submit Overtime Claim
                  </button>
                </form>
              )}

              {subTab === 'advance' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    insertRecord(
                      'salary_advances',
                      { ...advForm, amount: Number(advForm.amount || 0), staff_id: actorId, staff_name: actorName, staff_email: actorEmail, status: 'Pending' },
                      () => setAdvForm({ amount: '', repayment_month: '', reason: '' }),
                      'Salary advance request submitted.'
                    );
                  }}
                  className="space-y-3"
                >
                  <h3 className="text-sm font-black text-slate-900">Request Salary Advance (KES)</h3>
                  <input type="number" min="100" required value={advForm.amount} onChange={(e) => setAdvForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Amount in KES" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <input type="month" value={advForm.repayment_month} onChange={(e) => setAdvForm((p) => ({ ...p, repayment_month: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <textarea rows={2} value={advForm.reason} onChange={(e) => setAdvForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Reason" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                  <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer">
                    Request Advance
                  </button>
                </form>
              )}

              {subTab === 'loan' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    insertRecord(
                      'loan_requests',
                      { ...loanForm, amount: Number(loanForm.amount || 0), staff_id: actorId, staff_name: actorName, staff_email: actorEmail, status: 'Pending' },
                      () => setLoanForm({ amount: '', installments_months: 3, reason: '' }),
                      'Staff loan request submitted.'
                    );
                  }}
                  className="space-y-3"
                >
                  <h3 className="text-sm font-black text-slate-900">Apply for Staff Loan (KES)</h3>
                  <input type="number" min="500" required value={loanForm.amount} onChange={(e) => setLoanForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Loan Amount (KES)" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <input type="number" min="1" max="24" value={loanForm.installments_months} onChange={(e) => setLoanForm((p) => ({ ...p, installments_months: Number(e.target.value) || 3 }))} placeholder="Repayment Months" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <textarea rows={2} value={loanForm.reason} onChange={(e) => setLoanForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Purpose" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                  <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer">
                    Submit Loan Application
                  </button>
                </form>
              )}

              {subTab === 'checklists' && (
                <div className="space-y-3">
                  <h3 className="text-sm font-black text-slate-900">Daily Shift Checklist</h3>
                  <select value={shiftType} onChange={(e) => setShiftType(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                    <option>Opening</option>
                    <option>Mid-Shift</option>
                    <option>Closing</option>
                  </select>
                  <div className="space-y-2">
                    {checklistTicks.map((item, idx) => (
                      <label key={item.label} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() =>
                            setChecklistTicks((prev) => prev.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)))
                          }
                          className="mt-0.5 rounded text-emerald-700"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      insertRecord(
                        'daily_checklists',
                        {
                          staff_id: actorId,
                          staff_name: actorName,
                          shift_type: shiftType,
                          items: checklistTicks,
                        },
                        () => setChecklistTicks(DEFAULT_CHECKLIST_ITEMS.map((t) => ({ label: t, done: false }))),
                        'Daily checklist saved.'
                      )
                    }
                    className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer"
                  >
                    Submit Checklist
                  </button>
                </div>
              )}

              {subTab === 'warnings' && (
                isAdminMode ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      insertRecord(
                        'warnings',
                        { ...warnForm, issued_by: actorName, status: 'Issued' },
                        () => setWarnForm({ staff_name: '', reason: '', details: '' }),
                        'Warning issued.'
                      );
                    }}
                    className="space-y-3"
                  >
                    <h3 className="text-sm font-black text-slate-900">Issue Staff Warning</h3>
                    {staffList.length > 0 ? (
                      <select required value={warnForm.staff_name} onChange={(e) => setWarnForm((p) => ({ ...p, staff_name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                        <option value="">Select Staff Member</option>
                        {staffList.map((s) => (
                          <option key={s.id || s.name} value={s.name}>{s.name} ({s.role})</option>
                        ))}
                      </select>
                    ) : (
                      <input type="text" required value={warnForm.staff_name} onChange={(e) => setWarnForm((p) => ({ ...p, staff_name: e.target.value }))} placeholder="Staff Name" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    )}
                    <input type="text" required value={warnForm.reason} onChange={(e) => setWarnForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Warning Reason / Incident" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    <textarea rows={3} value={warnForm.details} onChange={(e) => setWarnForm((p) => ({ ...p, details: e.target.value }))} placeholder="Incident Details & Corrective Action" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                    <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer">
                      Issue Official Warning
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2 text-xs text-slate-600">
                    <h3 className="text-sm font-black text-slate-900">Disciplinary & Warning Record</h3>
                    <p>Any formal HR notices or warnings issued to your account appear on the right.</p>
                  </div>
                )
              )}

              {subTab === 'docs' && (
                isAdminMode ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      insertRecord(
                        'hr_documents',
                        docForm,
                        () => setDocForm({ title: '', category: 'Policy', file_url: '', notes: '' }),
                        'HR document published.'
                      );
                    }}
                    className="space-y-3"
                  >
                    <h3 className="text-sm font-black text-slate-900">Publish HR Policy / Document</h3>
                    <input type="text" required value={docForm.title} onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))} placeholder="Document Title (e.g. Staff Handbook)" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    <select value={docForm.category} onChange={(e) => setDocForm((p) => ({ ...p, category: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                      <option>Policy</option>
                      <option>SOP</option>
                      <option>Contract Template</option>
                      <option>Safety & Hygiene</option>
                    </select>
                    <input type="url" value={docForm.file_url} onChange={(e) => setDocForm((p) => ({ ...p, file_url: e.target.value }))} placeholder="Optional PDF / Drive Link" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    <textarea rows={2} value={docForm.notes} onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Summary / Notes" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                    <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1 cursor-pointer">
                      <Plus size={14} /> Add HR Document
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2 text-xs text-slate-600">
                    <h3 className="text-sm font-black text-slate-900">Company Handbook & SOPs</h3>
                    <p>Review restaurant policies, hygiene guides, and shift procedures shared by management.</p>
                  </div>
                )
              )}
            </div>

            {/* RIGHT LEDGER / APPROVAL QUEUE */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 capitalize flex items-center gap-2">
                  <Users size={15} className="text-emerald-700" />
                  <span>{isAdminMode ? 'Team Queue & Records' : 'My History'}</span>
                </h3>
              </div>

              {subTab === 'leave' && (
                <div className="space-y-2">
                  {scopeMine(leaves).length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No leave requests recorded.</p>
                  ) : scopeMine(leaves).map((r) => (
                    <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.staff_name} · {r.leave_type}</p>
                        <p className="text-[11px] text-slate-500">{r.start_date} → {r.end_date} ({r.days_count} day{Number(r.days_count) === 1 ? '' : 's'})</p>
                        {r.reason && <p className="text-[11px] text-slate-600 mt-0.5">{r.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>{r.status}</span>
                        {isAdminMode && String(r.status).toLowerCase() === 'pending' && (
                          <>
                            <button type="button" onClick={() => reviewRequest('leave_requests', r.id, 'Approved')} className="p-1.5 rounded-lg bg-emerald-700 text-white cursor-pointer"><Check size={13} /></button>
                            <button type="button" onClick={() => reviewRequest('leave_requests', r.id, 'Rejected')} className="p-1.5 rounded-lg bg-rose-600 text-white cursor-pointer"><X size={13} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'overtime' && (
                <div className="space-y-2">
                  {scopeMine(overtimes).length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No overtime records yet.</p>
                  ) : scopeMine(overtimes).map((r) => (
                    <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.staff_name} · {r.hours} hrs</p>
                        <p className="text-[11px] text-slate-500">Date: {r.work_date} {r.reason ? `· ${r.reason}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>{r.status}</span>
                        {isAdminMode && String(r.status).toLowerCase() === 'pending' && (
                          <>
                            <button type="button" onClick={() => reviewRequest('overtime_records', r.id, 'Approved')} className="p-1.5 rounded-lg bg-emerald-700 text-white cursor-pointer"><Check size={13} /></button>
                            <button type="button" onClick={() => reviewRequest('overtime_records', r.id, 'Rejected')} className="p-1.5 rounded-lg bg-rose-600 text-white cursor-pointer"><X size={13} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'advance' && (
                <div className="space-y-2">
                  {scopeMine(advances).length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No salary advances logged.</p>
                  ) : scopeMine(advances).map((r) => (
                    <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.staff_name} · KES {Number(r.amount || 0).toLocaleString()}</p>
                        <p className="text-[11px] text-slate-500">Repay: {r.repayment_month || 'Next Payroll'} {r.reason ? `· ${r.reason}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>{r.status}</span>
                        {isAdminMode && String(r.status).toLowerCase() === 'pending' && (
                          <>
                            <button type="button" onClick={() => reviewRequest('salary_advances', r.id, 'Approved')} className="p-1.5 rounded-lg bg-emerald-700 text-white cursor-pointer"><Check size={13} /></button>
                            <button type="button" onClick={() => reviewRequest('salary_advances', r.id, 'Rejected')} className="p-1.5 rounded-lg bg-rose-600 text-white cursor-pointer"><X size={13} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'loan' && (
                <div className="space-y-2">
                  {scopeMine(loans).length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No loan applications logged.</p>
                  ) : scopeMine(loans).map((r) => (
                    <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.staff_name} · KES {Number(r.amount || 0).toLocaleString()}</p>
                        <p className="text-[11px] text-slate-500">{r.installments_months} monthly installments {r.reason ? `· ${r.reason}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>{r.status}</span>
                        {isAdminMode && String(r.status).toLowerCase() === 'pending' && (
                          <>
                            <button type="button" onClick={() => reviewRequest('loan_requests', r.id, 'Approved')} className="p-1.5 rounded-lg bg-emerald-700 text-white cursor-pointer"><Check size={13} /></button>
                            <button type="button" onClick={() => reviewRequest('loan_requests', r.id, 'Rejected')} className="p-1.5 rounded-lg bg-rose-600 text-white cursor-pointer"><X size={13} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'checklists' && (
                <div className="space-y-2">
                  {scopeMine(checklists).length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No shift checklists submitted yet.</p>
                  ) : scopeMine(checklists).map((c) => {
                    const items = Array.isArray(c.items) ? c.items : [];
                    const done = items.filter((i) => i.done).length;
                    return (
                      <div key={c.id} className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-slate-900">{c.staff_name} · {c.shift_type} Shift</p>
                          <p className="text-[11px] text-slate-500">{c.checklist_date || String(c.created_at || '').slice(0, 10)}</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
                          {done}/{items.length} Done
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {subTab === 'warnings' && (
                <div className="space-y-2">
                  {scopeMine(warnings).length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No warnings on record.</p>
                  ) : scopeMine(warnings).map((w) => (
                    <div key={w.id} className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/40">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-slate-900">{w.staff_name} · {w.reason}</p>
                        <span className="text-[10px] font-bold text-rose-700">Issued by {w.issued_by || 'Admin'}</span>
                      </div>
                      {w.details && <p className="text-[11px] text-slate-600 mt-1">{w.details}</p>}
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'docs' && (
                <div className="space-y-2">
                  {docs.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No HR documents uploaded yet.</p>
                  ) : docs.map((d) => (
                    <div key={d.id} className="p-3.5 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{d.title}</p>
                        <p className="text-[11px] text-slate-500">{d.category} {d.notes ? `· ${d.notes}` : ''}</p>
                      </div>
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800">
                          Open
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
