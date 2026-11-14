import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Printer,
  PenTool,
  UserCheck,
  Shield,
  ChevronLeft,
  ChevronRight,
  Lock,
  LayoutDashboard,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DEFAULT_CHECKLIST_ITEMS = [
  'Sanitize prep counters & handwash stations',
  'Verify cold-chain fridge & freezer temperatures',
  'Check POS register float & M-Pesa Till/Paybill connection',
  'Confirm Kitchen Display & printer paper roll stock',
  'Review 86d / out-of-stock menu items before service',
];

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonday(dateInput) {
  const d = new Date(dateInput || Date.now());
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDaysIso(monday, offset) {
  const d = new Date(monday);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function badgeStyle(status) {
  const s = String(status || 'Pending').toLowerCase();
  if (s === 'approved' || s === 'completed' || s === 'signed' || s === 'logged') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (s === 'rejected' || s === 'declined') {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function printHtmlDocument(title, htmlBody) {
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>${title}</title>
    <style>
      body{font-family:Inter,system-ui,-apple-system,sans-serif;padding:40px;color:#0f172a;line-height:1.5}
      h1,h2{margin:0 0 8px}
      .meta{font-size:12px;color:#64748b;margin-bottom:24px;border-bottom:2px solid #0b3b24;padding-bottom:12px}
      .box{border:1px solid #cbd5e1;border-radius:10px;padding:18px;margin-top:16px}
      .badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#ecfdf5;color:#065f46;font-size:11px;font-weight:700}
      img.sig{max-height:90px;margin-top:12px;border-bottom:1px solid #334155}
    </style></head><body>${htmlBody}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function SignatureModal({ docTitle, onClose, onSave, saving }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const moveDraw = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Sign &amp; Accept Document</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-600 font-semibold">{docTitle}</p>
        <p className="text-[11px] text-slate-500">Terms of Agreement — Draw your signature below:</p>
        <canvas
          ref={canvasRef}
          width={380}
          height={150}
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
          className="w-full h-36 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 touch-none cursor-crosshair"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clearCanvas}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            Clear
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave(canvasRef.current.toDataURL('image/png'))}
              className="px-4 py-2 rounded-xl bg-[#0B3B24] hover:bg-emerald-800 text-white text-xs font-black cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Signing…' : 'Sign & Accept'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [subTab, setSubTab] = useState(isAdminMode ? 'requests' : 'overview');
  const [reqFilter, setReqFilter] = useState('Pending');
  const [dirFilter, setDirFilter] = useState('active');
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
  const [shifts, setShifts] = useState([]);
  const [selfProfile, setSelfProfile] = useState(null);

  const [weekMonday, setWeekMonday] = useState(() => getMonday(new Date()));
  const [rosterDept, setRosterDept] = useState('FOH');
  const [signingDoc, setSigningDoc] = useState(null);

  const [leaveForm, setLeaveForm] = useState({
    leave_type: 'Annual Leave',
    start_date: '',
    end_date: '',
    days_count: 1,
    reason: '',
  });
  const [otEntries, setOtEntries] = useState([{ work_date: '', start_time: '18:00', end_time: '20:00', hours: 2, notes: '' }]);
  const [advForm, setAdvForm] = useState({ amount: '', repayment_month: '', reason: '' });
  const [loanForm, setLoanForm] = useState({ amount: '', installments_months: 3, repayment_plan: 'Monthly Payroll Deduction', reason: '' });
  const [warnForm, setWarnForm] = useState({ staff_name: '', severity: '1st Written Warning', reason: '', details: '' });
  const [docForm, setDocForm] = useState({
    staff_name: '',
    document_type: 'Offer Letter',
    category: 'Contract',
    title: '',
    file_url: '',
    notes: '',
    expires_at: '',
  });
  const [checklistTicks, setChecklistTicks] = useState(() => DEFAULT_CHECKLIST_ITEMS.map((t) => ({ label: t, done: false })));
  const [shiftType, setShiftType] = useState('Opening');

  const [profileForm, setProfileForm] = useState({
    title: '',
    gender: '',
    name: '',
    phone: '',
    job_title: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    bank_name: '',
    bank_account_number: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    next_of_kin_address: '',
  });
  const [pwdForm, setPwdForm] = useState({ password: '', confirm: '' });

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
      const [lv, ot, ad, ln, wn, dc, ck, sh] = await Promise.all([
        supabase.from('leave_requests').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('overtime_records').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('salary_advances').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('loan_requests').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('warnings').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('hr_documents').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('daily_checklists').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('shifts').select('*').eq('restaurant_id', restaurantId).order('shift_date', { ascending: true }),
      ]);
      setLeaves(lv.data || []);
      setOvertimes(ot.data || []);
      setAdvances(ad.data || []);
      setLoans(ln.data || []);
      setWarnings(wn.data || []);
      setDocs(dc.data || []);
      setChecklists(ck.data || []);
      setShifts(sh.data || []);

      if (actorId) {
        const { data: prof } = await supabase.rpc('staff_self_profile_get', { p_actor_id: actorId });
        if (prof && typeof prof === 'object') {
          setSelfProfile(prof);
          setProfileForm({
            title: prof.title || '',
            gender: prof.gender || '',
            name: prof.name || actorName,
            phone: prof.phone || '',
            job_title: prof.job_title || '',
            emergency_contact_name: prof.emergency_contact_name || '',
            emergency_contact_phone: prof.emergency_contact_phone || '',
            bank_name: prof.bank_name || '',
            bank_account_number: prof.bank_account_number || '',
            next_of_kin_name: prof.next_of_kin_name || '',
            next_of_kin_phone: prof.next_of_kin_phone || '',
            next_of_kin_address: prof.next_of_kin_address || '',
          });
        }
      }
    } catch (_) {
      // Migration pending safe fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [restaurantId, actorId]);

  const scopeMine = (rows) => {
    if (isAdminMode) return rows;
    return rows.filter(
      (r) =>
        (actorId && r.staff_id === actorId) ||
        (actorEmail && String(r.staff_email || '').toLowerCase() === actorEmail.toLowerCase()) ||
        String(r.staff_name || '').toLowerCase() === actorName.toLowerCase()
    );
  };

  const myDocs = useMemo(() => {
    if (isAdminMode) return docs;
    return docs.filter(
      (d) =>
        !d.staff_name ||
        (actorId && d.staff_id === actorId) ||
        (actorEmail && String(d.staff_email || '').toLowerCase() === actorEmail.toLowerCase()) ||
        String(d.staff_name || '').toLowerCase() === actorName.toLowerCase()
    );
  }, [docs, isAdminMode, actorId, actorEmail, actorName]);

  const insertRecord = async (table, payloadOrRows, resetCb, msg) => {
    if (!restaurantId) return;
    setSaving(true);
    setNotice('');
    try {
      const rows = Array.isArray(payloadOrRows) ? payloadOrRows : [payloadOrRows];
      const { error } = await supabase.from(table).insert(rows.map((r) => ({ restaurant_id: restaurantId, ...r })));
      if (error) throw error;
      resetCb?.();
      setNotice(msg);
      await loadAll();
    } catch (err) {
      setNotice(err.message || `Apply SQL migrations 20261117 & 20261118 to enable ${table}.`);
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
      setNotice(`Updated request status to ${nextStatus}.`);
      await loadAll();
    } catch (err) {
      setNotice(err.message || 'Could not update request');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSignature = async (signatureDataUrl) => {
    if (!signingDoc || !restaurantId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('hr_documents')
        .update({
          status: 'Signed',
          signature_data: signatureDataUrl,
          signed_at: new Date().toISOString(),
        })
        .eq('id', signingDoc.id)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
      setSigningDoc(null);
      setNotice('Document signed and accepted.');
      await loadAll();
    } catch (err) {
      setNotice(err.message || 'Failed to save signature');
    } finally {
      setSaving(false);
    }
  };

  const handleUpsertShift = async (staffRow, shiftDate, nextType) => {
    if (!restaurantId || !staffRow?.name) return;
    setSaving(true);
    try {
      const existing = shifts.find(
        (s) => s.shift_date === shiftDate && String(s.staff_name || '').toLowerCase() === staffRow.name.toLowerCase()
      );
      if (existing) {
        await supabase
          .from('shifts')
          .update({ shift_type: nextType, department: rosterDept })
          .eq('id', existing.id)
          .eq('restaurant_id', restaurantId);
      } else {
        await supabase.from('shifts').insert([{
          restaurant_id: restaurantId,
          staff_id: staffRow.id || null,
          staff_name: staffRow.name,
          staff_email: staffRow.email || null,
          shift_date: shiftDate,
          shift_type: nextType,
          department: rosterDept,
        }]);
      }
      await loadAll();
    } catch (err) {
      setNotice(err.message || 'Could not save shift');
    } finally {
      setSaving(false);
    }
  };

  const printRequestSlip = (kind, row) => {
    printHtmlDocument(
      `${kind} - ${row.staff_name}`,
      `<div class="meta"><h1>${restaurantName} — Official HR Request Record</h1>
      <p>Generated ${new Date().toLocaleString()} · Staff Member: <strong>${row.staff_name}</strong></p></div>
      <div class="box">
        <p><span class="badge">${row.status || 'Pending'}</span></p>
        <h2>${kind}</h2>
        <p><strong>Details:</strong> ${row.detailsLabel || row.reason || '—'}</p>
        ${row.amount ? `<p><strong>Amount:</strong> KES ${Number(row.amount).toLocaleString()}</p>` : ''}
        ${row.reviewed_by ? `<p><strong>Reviewed By:</strong> ${row.reviewed_by}</p>` : ''}
        <p><strong>Submitted:</strong> ${new Date(row.created_at).toLocaleString()}</p>
      </div>`
    );
  };

  const printStaffIdCard = (member) => {
    const m = member || selfProfile || { name: actorName, role: staffUser?.role, staff_code: 'STF-MANI', job_title: 'Team Member' };
    printHtmlDocument(
      `ID Card - ${m.name}`,
      `<div style="max-width:340px;margin:20px auto;border:2px solid #0b3b24;border-radius:18px;padding:24px;text-align:center">
        <p style="font-size:11px;font-weight:900;letter-spacing:2px;color:#0b3b24;text-transform:uppercase">${restaurantName}</p>
        <div style="width:76px;height:76px;border-radius:50%;background:#0b3b24;color:#fff;font-size:28px;font-weight:900;display:flex;align-items:center;justify-content:center;margin:14px auto">${String(m.name || 'S').slice(0, 1).toUpperCase()}</div>
        <h2 style="margin:4px 0">${m.name}</h2>
        <p style="margin:0;color:#475569;font-weight:700;font-size:13px">${m.job_title || String(m.role || 'Staff').toUpperCase()}</p>
        <p style="margin:10px 0 0;font-family:monospace;font-size:12px;background:#f1f5f9;padding:6px;border-radius:8px">ID: ${m.staff_code || String(m.id || '').slice(0, 8).toUpperCase() || 'MANI-STAFF'}</p>
      </div>`
    );
  };

  const myLeaves = useMemo(() => scopeMine(leaves), [leaves, isAdminMode, actorId, actorEmail, actorName]);
  const myAdvances = useMemo(() => scopeMine(advances), [advances, isAdminMode, actorId, actorEmail, actorName]);
  const myLoans = useMemo(() => scopeMine(loans), [loans, isAdminMode, actorId, actorEmail, actorName]);
  const myOvertimes = useMemo(() => scopeMine(overtimes), [overtimes, isAdminMode, actorId, actorEmail, actorName]);

  const annualLimit = Number(selfProfile?.annual_leave_limit || 21);
  const sickLimit = Number(selfProfile?.sick_leave_limit || 15);
  const annualUsed = myLeaves
    .filter((r) => String(r.status).toLowerCase() === 'approved' && !String(r.leave_type).toLowerCase().includes('sick'))
    .reduce((acc, r) => acc + Number(r.days_count || 1), 0);
  const sickUsed = myLeaves
    .filter((r) => String(r.status).toLowerCase() === 'approved' && String(r.leave_type).toLowerCase().includes('sick'))
    .reduce((acc, r) => acc + Number(r.days_count || 1), 0);

  const unifiedRequests = useMemo(() => {
    const list = [
      ...myLeaves.map((r) => ({
        ...r,
        _kind: r.leave_type || 'Leave',
        _table: 'leave_requests',
        detailsLabel: `${r.start_date} -> ${r.end_date} (${r.days_count}d)${r.reason ? ` · ${r.reason}` : ''}`,
      })),
      ...myAdvances.map((r) => ({
        ...r,
        _kind: 'Salary Advance',
        _table: 'salary_advances',
        detailsLabel: `KES ${Number(r.amount || 0).toLocaleString()} · Repay ${r.repayment_month || 'Next Payroll'}${r.reason ? ` · ${r.reason}` : ''}`,
      })),
      ...myLoans.map((r) => ({
        ...r,
        _kind: 'Loan Request',
        _table: 'loan_requests',
        detailsLabel: `KES ${Number(r.amount || 0).toLocaleString()} (${r.installments_months || 3}m)${r.reason ? ` · ${r.reason}` : ''}`,
      })),
      ...myOvertimes.map((r) => ({
        ...r,
        _kind: 'Overtime',
        _table: 'overtime_records',
        detailsLabel: `${r.work_date} · ${r.hours} hrs${r.reason || r.notes ? ` · ${r.reason || r.notes}` : ''}`,
      })),
    ];
    return list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [myLeaves, myAdvances, myLoans, myOvertimes]);

  const pendingCounts = useMemo(() => {
    const countPending = (arr) => arr.filter((r) => String(r.status || 'Pending').toLowerCase() === 'pending').length;
    return {
      total: countPending(leaves) + countPending(advances) + countPending(loans),
      leave: countPending(leaves),
      advance: countPending(advances),
      loan: countPending(loans),
      overtime: countPending(overtimes),
    };
  }, [leaves, advances, loans, overtimes]);

  const loansDisbursedKes = useMemo(
    () =>
      loans
        .filter((r) => String(r.status).toLowerCase() === 'approved')
        .reduce((acc, r) => acc + Number(r.amount || 0), 0),
    [loans]
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const onLeaveToday = useMemo(
    () =>
      leaves.filter(
        (r) =>
          String(r.status).toLowerCase() === 'approved' &&
          ((r.start_date <= todayIso && r.end_date >= todayIso) ||
            (Array.isArray(r.dates) && r.dates.includes(todayIso)))
      ).length,
    [leaves, todayIso]
  );

  const unsignedDocsCount = myDocs.filter(
    (d) => d.staff_name && String(d.status || 'Pending').toLowerCase() === 'pending'
  ).length;

  const weekDates = useMemo(() => WEEK_DAYS.map((label, idx) => ({ label, date: addDaysIso(weekMonday, idx) })), [weekMonday]);

  const tabs = isAdminMode
    ? [
        { id: 'requests', label: `Staff Requests (${pendingCounts.total})`, icon: Users },
        { id: 'directory', label: `Staff Directory (${staffList.length})`, icon: UserCheck },
        { id: 'shifts', label: 'Shift Scheduler', icon: Calendar },
        { id: 'overtime', label: `Overtime (${overtimes.reduce((a, b) => a + Number(b.hours || 0), 0).toFixed(1)}h)`, icon: Clock },
        { id: 'warnings', label: 'Issue Warnings', icon: AlertTriangle },
        { id: 'docs', label: `HR Docs (${docs.length})`, icon: FileText },
        { id: 'checklists', label: 'Checklists', icon: CheckSquare },
      ]
    : [
        { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'leave', label: 'Leave', icon: Calendar },
        { id: 'advance', label: 'Salary Advance', icon: Wallet },
        { id: 'loan', label: 'Loans', icon: CreditCard },
        { id: 'overtime', label: 'Overtime', icon: Clock },
        { id: 'shifts', label: 'My Shifts', icon: Calendar },
        { id: 'docs', label: `Docs & Sign${unsignedDocsCount ? ` (${unsignedDocsCount})` : ''}`, icon: FileText },
        { id: 'warnings', label: 'Warnings', icon: AlertTriangle },
        { id: 'checklists', label: 'Checklists', icon: CheckSquare },
        { id: 'profile', label: 'Profile & Password', icon: Shield },
      ];

  const filteredRequests = useMemo(() => {
    if (reqFilter === 'All') return unifiedRequests;
    return unifiedRequests.filter((r) => String(r.status || 'Pending').toLowerCase() === reqFilter.toLowerCase());
  }, [unifiedRequests, reqFilter]);

  const totalOtDraftHours = otEntries.reduce((s, r) => s + Number(r.hours || 0), 0);

  const computeOtHours = (start, end) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return Number((mins / 60).toFixed(2));
  };

  return (
    <div className={isAdminMode ? 'space-y-5' : 'min-h-screen bg-slate-50 text-slate-900'}>
      {signingDoc && (
        <SignatureModal
          docTitle={signingDoc.title}
          saving={saving}
          onClose={() => setSigningDoc(null)}
          onSave={handleSaveSignature}
        />
      )}

      {!isAdminMode && (
        <header className="bg-[#0B3B24] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
              {restaurantName} · POJ Staff Portal
            </p>
            <h1 className="text-lg font-black">
              {greetingText()}, {selfProfile?.name || actorName}
            </h1>
            <p className="text-[11px] text-emerald-200">
              {selfProfile?.job_title || String(staffUser?.role || 'staff').toUpperCase()} · ID:{' '}
              {selfProfile?.staff_code || (actorId ? String(actorId).slice(0, 8).toUpperCase() : 'MANI-STAFF')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => printStaffIdCard()}
              className="px-3 py-2 rounded-xl bg-emerald-900/70 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
            >
              ID Card
            </button>
            <button
              type="button"
              onClick={() => setSubTab('profile')}
              className="px-3 py-2 rounded-xl bg-emerald-900/70 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer"
            >
              Profile &amp; Settings
            </button>
            {onOpenPos && ['cashier', 'waiter', 'manager', 'admin'].includes(staffUser?.role) && (
              <button
                type="button"
                onClick={onOpenPos}
                className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black cursor-pointer"
              >
                Open POS Terminal
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
        {/* Top 4 KPI Cards (Admin HR or Staff Self-Service) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isAdminMode ? (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Staff</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{staffList.length}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">On Leave Today</p>
                <p className="text-2xl font-black text-amber-600 mt-1">{onLeaveToday}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Loans Disbursed</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">KES {loansDisbursedKes.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Requests</p>
                <p className="text-2xl font-black text-rose-600 mt-1">{pendingCounts.total}</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Annual Leave Used</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">
                  {annualUsed} / {annualLimit} <span className="text-xs font-bold text-slate-400">days</span>
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sick Leave Used</p>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {sickUsed} / {sickLimit} <span className="text-xs font-bold text-slate-400">days</span>
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Approved Requests</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">
                  {unifiedRequests.filter((r) => String(r.status).toLowerCase() === 'approved').length}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending Requests</p>
                <p className="text-2xl font-black text-amber-600 mt-1">
                  {unifiedRequests.filter((r) => String(r.status).toLowerCase() === 'pending').length}
                </p>
                <p className="text-[10px] text-slate-400">Awaiting approval</p>
              </div>
            </>
          )}
        </div>

        {/* Navigation Pill Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border ${
                  subTab === t.id
                    ? 'bg-[#0B3B24] text-white border-[#0B3B24]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon size={13} /> {t.label}
              </button>
            );
          })}
        </div>

        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-3 rounded-xl">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 flex items-center justify-center gap-2 text-slate-500 text-xs font-bold">
            <Loader2 className="animate-spin" size={16} /> Loading HR records…
          </div>
        ) : subTab === 'overview' && !isAdminMode ? (
          <div className="space-y-5">
            {unsignedDocsCount > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <PenTool size={18} className="text-amber-700" />
                  <div>
                    <p className="text-xs font-black text-amber-950">
                      Action Required: {unsignedDocsCount} HR document{unsignedDocsCount === 1 ? '' : 's'} awaiting your signature
                    </p>
                    <p className="text-[11px] text-amber-800">Open Docs &amp; Sign to review and sign digitally.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSubTab('docs')}
                  className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black cursor-pointer"
                >
                  Review &amp; Sign →
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { id: 'leave', label: 'Request Leave', sub: 'Annual or sick leave', Icon: Calendar, color: 'text-emerald-700 bg-emerald-50' },
                { id: 'advance', label: 'Salary Advance', sub: 'Get paid early', Icon: Wallet, color: 'text-sky-700 bg-sky-50' },
                { id: 'loan', label: 'Apply for Loan', sub: 'Installment repayment', Icon: CreditCard, color: 'text-violet-700 bg-violet-50' },
                { id: 'overtime', label: 'Log Overtime', sub: 'Submit extra hours', Icon: Clock, color: 'text-amber-700 bg-amber-50' },
              ].map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSubTab(q.id)}
                  className="bg-white border border-slate-200 hover:border-emerald-400 rounded-2xl p-4 text-left transition-all cursor-pointer space-y-2"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${q.color}`}>
                    <q.Icon size={17} />
                  </div>
                  <p className="text-sm font-black text-slate-900">{q.label}</p>
                  <p className="text-[11px] text-slate-500">{q.sub}</p>
                </button>
              ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-slate-900">Recent Request History</h3>
                <div className="flex gap-1.5">
                  {['All', 'Pending', 'Approved', 'Rejected'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setReqFilter(f)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                        reqFilter === f ? 'bg-[#0B3B24] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              {filteredRequests.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">No requests in this filter.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 text-[10px] uppercase text-slate-400">
                      <tr>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Submitted</th>
                        <th className="py-2 pr-3">Details</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 text-right">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRequests.slice(0, 30).map((r) => (
                        <tr key={`${r._table}-${r.id}`}>
                          <td className="py-2.5 pr-3 font-black text-slate-900">{r._kind}</td>
                          <td className="py-2.5 pr-3 text-slate-500">{String(r.created_at || '').slice(0, 10)}</td>
                          <td className="py-2.5 pr-3 text-slate-700">{r.detailsLabel}</td>
                          <td className="py-2.5 pr-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => printRequestSlip(r._kind, r)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Printer size={12} /> PDF
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : subTab === 'requests' && isAdminMode ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">Unified Staff Requests Queue</h3>
                <p className="text-[11px] text-slate-500">Leave, Salary Advances &amp; Loans across team (plus imported POJ history).</p>
              </div>
              <div className="flex gap-1.5">
                {['Pending', 'Approved', 'Rejected', 'All'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setReqFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      reqFilter === f ? 'bg-[#0B3B24] text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No {reqFilter.toLowerCase()} requests found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="py-2 pr-3">Staff Member</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Submitted</th>
                      <th className="py-2 pr-3">Details</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests.map((r) => (
                      <tr key={`${r._table}-${r.id}`}>
                        <td className="py-3 pr-3 font-black text-slate-900">{r.staff_name}</td>
                        <td className="py-3 pr-3 font-semibold text-slate-700">{r._kind}</td>
                        <td className="py-3 pr-3 text-slate-500">{String(r.created_at || '').slice(0, 10)}</td>
                        <td className="py-3 pr-3 text-slate-600">{r.detailsLabel}</td>
                        <td className="py-3 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {String(r.status).toLowerCase() === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => reviewRequest(r._table, r.id, 'Approved')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => reviewRequest(r._table, r.id, 'Rejected')}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => printRequestSlip(r._kind, r)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-bold cursor-pointer"
                            >
                              PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : subTab === 'directory' && isAdminMode ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-black text-slate-900">Staff Directory &amp; Compliance</h3>
              <div className="flex gap-1.5">
                {[
                  { id: 'active', label: `Active (${staffList.filter((s) => s.active !== false).length})` },
                  { id: 'inactive', label: `Inactive (${staffList.filter((s) => s.active === false).length})` },
                  { id: 'all', label: `All (${staffList.length})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDirFilter(f.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer ${
                      dirFilter === f.id ? 'bg-[#0B3B24] text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffList
                .filter((s) => (dirFilter === 'all' ? true : dirFilter === 'active' ? s.active !== false : s.active === false))
                .map((s) => {
                  const docsMap = s.compliance_docs || {};
                  const pills = [
                    { k: 'ID', ok: Boolean(docsMap.id_front_url) },
                    { k: 'NHIF', ok: Boolean(docsMap.nhif_url) },
                    { k: 'NSSF', ok: Boolean(docsMap.nssf_url) },
                    { k: 'Police', ok: Boolean(docsMap.police_clearance_url) },
                    { k: 'Hygiene', ok: Boolean(docsMap.food_hygiene_url) },
                  ];
                  return (
                    <div key={s.id} className="border border-slate-200 rounded-2xl p-4 space-y-3 bg-slate-50/50">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-black text-slate-900">{s.name}</p>
                          <p className="text-[11px] text-slate-500">{s.job_title || s.role}</p>
                          {s.email && <p className="text-[10px] text-slate-400">{s.email}</p>}
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${s.active !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {s.role}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {pills.map((p) => (
                          <span key={p.k} className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${p.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-400 border-slate-200'}`}>
                            {p.k}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px]">
                        <span className="text-slate-500">
                          Annual: {s.annual_leave_limit || 21}d · Sick: {s.sick_leave_limit || 15}d
                        </span>
                        <button
                          type="button"
                          onClick={() => printStaffIdCard(s)}
                          className="font-black text-emerald-700 hover:underline cursor-pointer"
                        >
                          ID Card
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : subTab === 'shifts' ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekMonday((m) => new Date(m.getTime() - 7 * 86400000))}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs font-black text-slate-900">
                  {weekDates[0].date} — {weekDates[6].date}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekMonday((m) => new Date(m.getTime() + 7 * 86400000))}
                  className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              {isAdminMode && (
                <div className="flex gap-1.5">
                  {['FOH', 'BOH'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setRosterDept(d)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                        rosterDept === d ? 'bg-[#0B3B24] text-white' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {d} Roster
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-[10px] uppercase text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Staff Member</th>
                    {weekDates.map((d) => (
                      <th key={d.date} className="py-2 px-2 text-center">
                        {d.label} <span className="block font-normal">{d.date.slice(5)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(isAdminMode ? staffList : [{ id: actorId, name: actorName, email: actorEmail }]).map((member) => (
                    <tr key={member.id || member.name}>
                      <td className="py-2.5 pr-3 font-black text-slate-900 whitespace-nowrap">{member.name}</td>
                      {weekDates.map((wd) => {
                        const cell = shifts.find(
                          (s) =>
                            s.shift_date === wd.date &&
                            String(s.staff_name || '').toLowerCase() === String(member.name || '').toLowerCase()
                        );
                        const val = cell?.shift_type || 'Off';
                        return (
                          <td key={wd.date} className="py-2 px-1 text-center">
                            {isAdminMode ? (
                              <select
                                value={val}
                                onChange={(e) => handleUpsertShift(member, wd.date, e.target.value)}
                                className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold bg-slate-50"
                              >
                                <option value="Off">Off</option>
                                <option value="FOH">FOH</option>
                                <option value="BOH">BOH</option>
                                <option value="Opening">Opening</option>
                                <option value="Closing">Closing</option>
                                <option value="Double">Double</option>
                              </select>
                            ) : (
                              <span
                                className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                                  val === 'Off' ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {val}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : subTab === 'profile' && !isAdminMode ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!actorId) return;
                setSaving(true);
                try {
                  const { error } = await supabase.rpc('staff_self_profile_update', {
                    p_actor_id: actorId,
                    p_payload: profileForm,
                  });
                  if (error) throw error;
                  setNotice('Personal details & bank/NOK saved.');
                  await loadAll();
                } catch (err) {
                  setNotice(err.message || 'Could not update profile.');
                } finally {
                  setSaving(false);
                }
              }}
              className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
            >
              <h3 className="text-sm font-black text-slate-900">Personal Details, Emergency Contact &amp; Bank</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select value={profileForm.title} onChange={(e) => setProfileForm((p) => ({ ...p, title: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                  <option value="">Title</option>
                  <option>Mr.</option>
                  <option>Mrs.</option>
                  <option>Ms.</option>
                  <option>Dr.</option>
                </select>
                <select value={profileForm.gender} onChange={(e) => setProfileForm((p) => ({ ...p, gender: e.target.value }))} className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                  <option value="">Gender</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
                <input type="text" value={profileForm.job_title} onChange={(e) => setProfileForm((p) => ({ ...p, job_title: e.target.value }))} placeholder="Job Title" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} placeholder="Full Name" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                <input type="text" value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone Number" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                <input type="text" value={profileForm.emergency_contact_name} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_name: e.target.value }))} placeholder="Emergency Contact Name" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                <input type="text" value={profileForm.emergency_contact_phone} onChange={(e) => setProfileForm((p) => ({ ...p, emergency_contact_phone: e.target.value }))} placeholder="Emergency Contact Phone" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                <input type="text" value={profileForm.bank_name} onChange={(e) => setProfileForm((p) => ({ ...p, bank_name: e.target.value }))} placeholder="Bank Name" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                <input type="text" value={profileForm.bank_account_number} onChange={(e) => setProfileForm((p) => ({ ...p, bank_account_number: e.target.value }))} placeholder="Bank Account Number" className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              </div>
              <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-[#0B3B24] hover:bg-emerald-800 text-white text-xs font-black cursor-pointer">
                Save All Details
              </button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (pwdForm.password.length < 6 || pwdForm.password !== pwdForm.confirm) {
                  setNotice('Passwords must match and be at least 6 characters.');
                  return;
                }
                setSaving(true);
                try {
                  const { error } = await supabase.auth.updateUser({ password: pwdForm.password });
                  if (error) throw error;
                  setPwdForm({ password: '', confirm: '' });
                  setNotice('Password updated cleanly.');
                } catch (err) {
                  setNotice(err.message || 'Password update requires active session.');
                } finally {
                  setSaving(false);
                }
              }}
              className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
            >
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Lock size={15} className="text-emerald-700" /> Security &amp; Password
              </h3>
              <input type="password" value={pwdForm.password} onChange={(e) => setPwdForm((p) => ({ ...p, password: e.target.value }))} placeholder="New Password" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              <input type="password" value={pwdForm.confirm} onChange={(e) => setPwdForm((p) => ({ ...p, confirm: e.target.value }))} placeholder="Confirm New Password" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
              <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black cursor-pointer">
                Update Password
              </button>
            </form>
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
                    <input
                      type="date"
                      required
                      value={leaveForm.start_date}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLeaveForm((p) => {
                          const end = p.end_date || v;
                          const days = v && end ? Math.max(1, Math.round((new Date(end) - new Date(v)) / 86400000) + 1) : 1;
                          return { ...p, start_date: v, end_date: end, days_count: days };
                        });
                      }}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    />
                    <input
                      type="date"
                      required
                      value={leaveForm.end_date}
                      onChange={(e) => {
                        const v = e.target.value;
                        setLeaveForm((p) => {
                          const days = p.start_date && v ? Math.max(1, Math.round((new Date(v) - new Date(p.start_date)) / 86400000) + 1) : 1;
                          return { ...p, end_date: v, days_count: days };
                        });
                      }}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    />
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
                    const payload = otEntries
                      .filter((r) => r.work_date && Number(r.hours) > 0)
                      .map((r) => ({
                        work_date: r.work_date,
                        start_time: r.start_time,
                        end_time: r.end_time,
                        hours: Number(r.hours),
                        reason: r.notes || '',
                        notes: r.notes || '',
                        staff_id: actorId,
                        staff_name: actorName,
                        staff_email: actorEmail,
                        status: 'Logged',
                      }));
                    if (!payload.length) return;
                    insertRecord(
                      'overtime_records',
                      payload,
                      () => setOtEntries([{ work_date: '', start_time: '18:00', end_time: '20:00', hours: 2, notes: '' }]),
                      `Logged ${payload.length} overtime shift(s).`
                    );
                  }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900">Log Overtime Hours</h3>
                    <span className="text-[11px] font-black text-emerald-700">Total: {totalOtDraftHours.toFixed(2)}h</span>
                  </div>
                  {otEntries.map((row, idx) => (
                    <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                      <input
                        type="date"
                        required
                        value={row.work_date}
                        onChange={(e) => setOtEntries((prev) => prev.map((it, i) => (i === idx ? { ...it, work_date: e.target.value } : it)))}
                        className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs font-bold"
                      />
                      <div className="grid grid-cols-3 gap-1.5">
                        <input
                          type="time"
                          value={row.start_time}
                          onChange={(e) => {
                            const st = e.target.value;
                            setOtEntries((prev) => prev.map((it, i) => (i === idx ? { ...it, start_time: st, hours: computeOtHours(st, it.end_time) } : it)));
                          }}
                          className="border border-slate-200 bg-white rounded-lg px-2 py-1 text-[11px] font-bold"
                        />
                        <input
                          type="time"
                          value={row.end_time}
                          onChange={(e) => {
                            const et = e.target.value;
                            setOtEntries((prev) => prev.map((it, i) => (i === idx ? { ...it, end_time: et, hours: computeOtHours(it.start_time, et) } : it)));
                          }}
                          className="border border-slate-200 bg-white rounded-lg px-2 py-1 text-[11px] font-bold"
                        />
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={row.hours}
                          onChange={(e) => setOtEntries((prev) => prev.map((it, i) => (i === idx ? { ...it, hours: Number(e.target.value) || 0 } : it)))}
                          className="border border-slate-200 bg-white rounded-lg px-2 py-1 text-[11px] font-bold"
                        />
                      </div>
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(e) => setOtEntries((prev) => prev.map((it, i) => (i === idx ? { ...it, notes: e.target.value } : it)))}
                        placeholder="Shift / Duty Notes"
                        className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOtEntries((prev) => [...prev, { work_date: '', start_time: '18:00', end_time: '20:00', hours: 2, notes: '' }])}
                    className="w-full py-2 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    + Add Another Day
                  </button>
                  <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black cursor-pointer">
                    Confirm Overtime Submission
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
                      () => setLoanForm({ amount: '', installments_months: 3, repayment_plan: 'Monthly Payroll Deduction', reason: '' }),
                      'Staff loan request submitted.'
                    );
                  }}
                  className="space-y-3"
                >
                  <h3 className="text-sm font-black text-slate-900">Apply for Staff Loan (KES)</h3>
                  <input type="number" min="500" required value={loanForm.amount} onChange={(e) => setLoanForm((p) => ({ ...p, amount: e.target.value }))} placeholder="Loan Amount (KES)" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <input type="number" min="1" max="24" value={loanForm.installments_months} onChange={(e) => setLoanForm((p) => ({ ...p, installments_months: Number(e.target.value) || 3 }))} placeholder="Repayment Months" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  {Number(loanForm.amount) > 0 && (
                    <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
                      Est. Monthly Deduction: KES {Math.ceil(Number(loanForm.amount) / Math.max(1, Number(loanForm.installments_months || 3))).toLocaleString()}/mo
                    </p>
                  )}
                  <input type="text" value={loanForm.repayment_plan} onChange={(e) => setLoanForm((p) => ({ ...p, repayment_plan: e.target.value }))} placeholder="Repayment Plan" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                  <textarea rows={2} value={loanForm.reason} onChange={(e) => setLoanForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Reason for Loan" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
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
                          status: checklistTicks.every((i) => i.done) ? 'Completed' : 'Pending',
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
                        () => setWarnForm({ staff_name: '', severity: '1st Written Warning', reason: '', details: '' }),
                        'Official warning issued.'
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
                    <select value={warnForm.severity} onChange={(e) => setWarnForm((p) => ({ ...p, severity: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                      <option>Verbal Warning</option>
                      <option>1st Written Warning</option>
                      <option>Final Written Warning</option>
                      <option>Suspension Notice</option>
                    </select>
                    <input type="text" required value={warnForm.reason} onChange={(e) => setWarnForm((p) => ({ ...p, reason: e.target.value }))} placeholder="Reason / Subject" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    <textarea rows={3} value={warnForm.details} onChange={(e) => setWarnForm((p) => ({ ...p, details: e.target.value }))} placeholder="Incident Details & Corrective Action" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                    <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer">
                      Issue Official Warning
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2 text-xs text-slate-600">
                    <h3 className="text-sm font-black text-slate-900">Disciplinary &amp; Warning Record</h3>
                    <p>Any formal HR warnings or disciplinary notices issued to you appear on the right.</p>
                  </div>
                )
              )}

              {subTab === 'docs' && (
                isAdminMode ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const matched = staffList.find((s) => s.name === docForm.staff_name);
                      insertRecord(
                        'hr_documents',
                        {
                          title: docForm.title,
                          document_type: docForm.document_type,
                          category: docForm.category,
                          file_url: docForm.file_url || null,
                          notes: docForm.notes,
                          expires_at: docForm.expires_at || null,
                          staff_id: matched?.id || null,
                          staff_name: docForm.staff_name || null,
                          staff_email: matched?.email || null,
                          status: docForm.staff_name ? 'Pending' : 'Published',
                          issued_by: actorName,
                        },
                        () => setDocForm({ staff_name: '', document_type: 'Offer Letter', category: 'Contract', title: '', file_url: '', notes: '', expires_at: '' }),
                        'HR document issued.'
                      );
                    }}
                    className="space-y-3"
                  >
                    <h3 className="text-sm font-black text-slate-900">Issue HR Letter / Policy</h3>
                    <select value={docForm.staff_name} onChange={(e) => setDocForm((p) => ({ ...p, staff_name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                      <option value="">All Staff (Company Policy / SOP)</option>
                      {staffList.map((s) => (
                        <option key={s.id || s.name} value={s.name}>{s.name} ({s.role})</option>
                      ))}
                    </select>
                    <select value={docForm.document_type} onChange={(e) => setDocForm((p) => ({ ...p, document_type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold">
                      <option>Offer Letter</option>
                      <option>Performance Review</option>
                      <option>Policy</option>
                      <option>SOP</option>
                      <option>Summary Dismissal</option>
                    </select>
                    <input type="text" required value={docForm.title} onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))} placeholder="Document Title / Subject" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    <input type="url" value={docForm.file_url} onChange={(e) => setDocForm((p) => ({ ...p, file_url: e.target.value }))} placeholder="Optional PDF / File Link" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold" />
                    <textarea rows={3} value={docForm.notes} onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Letter Body / Terms & Conditions" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs" />
                    <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center justify-center gap-1 cursor-pointer">
                      <Plus size={14} /> Issue &amp; Send Document
                    </button>
                  </form>
                ) : (
                  <div className="space-y-2 text-xs text-slate-600">
                    <h3 className="text-sm font-black text-slate-900">HR Documents &amp; Digital Signatures</h3>
                    <p>Review Offer Letters, Performance Reviews, and SOPs. Click <strong>Sign &amp; Accept</strong> on pending letters.</p>
                  </div>
                )
              )}
            </div>

            {/* RIGHT LEDGER / HISTORY */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 capitalize flex items-center gap-2">
                  <Users size={15} className="text-emerald-700" />
                  <span>{isAdminMode ? 'Team Queue & Records' : 'My History'}</span>
                </h3>
              </div>

              {subTab === 'leave' && (
                <div className="space-y-2">
                  {myLeaves.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No leave requests recorded.</p>
                  ) : myLeaves.map((r) => (
                    <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.staff_name} · {r.leave_type}</p>
                        <p className="text-[11px] text-slate-500">{r.start_date} -&gt; {r.end_date} ({r.days_count}d)</p>
                        {r.reason && <p className="text-[11px] text-slate-600 mt-0.5">{r.reason}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>{r.status}</span>
                        <button type="button" onClick={() => printRequestSlip(r.leave_type || 'Leave', r)} className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold cursor-pointer">PDF</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'overtime' && (
                <div className="space-y-2">
                  {myOvertimes.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No overtime records yet.</p>
                  ) : myOvertimes.map((r) => (
                    <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.staff_name} · {r.hours} hrs</p>
                        <p className="text-[11px] text-slate-500">
                          {r.work_date} {r.start_time && r.end_time ? `(${r.start_time}–${r.end_time})` : ''} {r.reason || r.notes ? `· ${r.reason || r.notes}` : ''}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>{r.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'advance' && (
                <div className="space-y-2">
                  {myAdvances.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No salary advances logged.</p>
                  ) : myAdvances.map((r) => (
                    <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.staff_name} · KES {Number(r.amount || 0).toLocaleString()}</p>
                        <p className="text-[11px] text-slate-500">Repay: {r.repayment_month || 'Next Payroll'} {r.reason ? `· ${r.reason}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>{r.status}</span>
                        <button type="button" onClick={() => printRequestSlip('Salary Advance', r)} className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold cursor-pointer">PDF</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'loan' && (
                <div className="space-y-2">
                  {myLoans.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No loan applications logged.</p>
                  ) : myLoans.map((r) => (
                    <div key={r.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-slate-900">{r.staff_name} · KES {Number(r.amount || 0).toLocaleString()}</p>
                        <p className="text-[11px] text-slate-500">{r.installments_months} installments · {r.repayment_plan || 'Payroll Deduction'} {r.reason ? `· ${r.reason}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(r.status)}`}>{r.status}</span>
                        <button type="button" onClick={() => printRequestSlip('Loan Application', r)} className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-bold cursor-pointer">PDF</button>
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
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${badgeStyle(c.status || 'Completed')}`}>
                          {c.status || `${done}/${items.length} Done`}
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
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-black text-slate-900">
                          {w.staff_name} · <span className="text-rose-700">{w.severity || 'Warning'}</span> · {w.reason}
                        </p>
                        <span className="text-[10px] font-bold text-rose-700">Issued by {w.issued_by || 'Admin'}</span>
                      </div>
                      {w.details && <p className="text-[11px] text-slate-600 mt-1">{w.details}</p>}
                    </div>
                  ))}
                </div>
              )}

              {subTab === 'docs' && (
                <div className="space-y-2">
                  {myDocs.length === 0 ? (
                    <p className="text-xs text-slate-400 py-8 text-center">No HR documents uploaded yet.</p>
                  ) : myDocs.map((d) => (
                    <div key={d.id} className="p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-slate-900">{d.title}</p>
                          {d.status && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${badgeStyle(d.status)}`}>
                              {d.status}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {d.document_type || d.category} {d.staff_name ? `· For ${d.staff_name}` : ''} {d.expires_at ? `· Expires: ${d.expires_at}` : ''}
                        </p>
                        {d.notes && <p className="text-[11px] text-slate-600 mt-1">{d.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {!isAdminMode && d.staff_name && String(d.status).toLowerCase() === 'pending' && (
                          <button
                            type="button"
                            onClick={() => setSigningDoc(d)}
                            className="px-3 py-1.5 rounded-lg bg-[#0B3B24] hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1 cursor-pointer"
                          >
                            <PenTool size={12} /> Sign &amp; Accept
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            printHtmlDocument(
                              d.title,
                              `<div class="meta"><h1>${restaurantName} — ${d.document_type || d.category}</h1>
                              <p>${d.staff_name ? `Recipient: ${d.staff_name} · ` : ''}Status: ${d.status || 'Published'}</p></div>
                              <div class="box"><h2>${d.title}</h2><p>${d.notes || d.content?.text || 'Official HR document.'}</p>
                              ${d.signature_data ? `<div><p><strong>Signed:</strong> ${d.signed_at ? new Date(d.signed_at).toLocaleString() : ''}</p><img class="sig" src="${d.signature_data}" /></div>` : ''}</div>`
                            )
                          }
                          className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold cursor-pointer"
                        >
                          PDF
                        </button>
                        {d.file_url && (
                          <a href={d.file_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800">
                            Open
                          </a>
                        )}
                      </div>
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
