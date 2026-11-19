import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText, Plus, Users, Settings, Download, MessageCircle,
  CheckCircle2, Mail, Copy, Trash2, LogOut, Loader2, Upload,
  Building2, Sparkles, Search, Clock, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  TRADER_PLANS,
  TRADER_PAYMENT_METHODS,
  SEND_MONEY_PROVIDERS,
  buildTraderWhatsAppShareUrl,
  computeMonthlyQuotaStatus,
  computeTraderInvoiceTotals,
  nextTraderDocumentNumber,
  resolveInvoiceDisplayStatus,
} from '../../lib/traderInvoices';
import { generateTraderInvoicePdf } from '../../lib/traderInvoicePdf';
import {
  TraderAuthScreen,
  TraderOnboardingSetup,
  TraderPaymentSetupFields,
} from './TraderAuthAndOnboarding';

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TraderInvoicesApp() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [tab, setTab] = useState('invoices'); // 'invoices' | 'new' | 'settings'
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');

  // List filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Mark Paid modal
  const [payTarget, setPayTarget] = useState(null);
  const [payMode, setPayMode] = useState('full'); // 'full' | 'partial'
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('M-Pesa Till No');
  const [payRef, setPayRef] = useState('');
  const [sendReceiptEmail, setSendReceiptEmail] = useState(true);

  // New Invoice form
  const [docType, setDocType] = useState('invoice');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [dueDate, setDueDate] = useState(() => addDaysIso(7));
  const [includeVat, setIncludeVat] = useState(false);
  const [preferredPayMethod, setPreferredPayMethod] = useState('M-Pesa Till No');
  const [payTillInput, setPayTillInput] = useState('');
  const [payPaybillInput, setPayPaybillInput] = useState('');
  const [payAccountInput, setPayAccountInput] = useState('');
  const [sendMoneyProvInput, setSendMoneyProvInput] = useState('M-Pesa');
  const [sendMoneyNumInput, setSendMoneyNumInput] = useState('');
  const [autoRemind, setAutoRemind] = useState(true);
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState([{ name: '', unit: 'kg', quantity: 1, unit_price: '' }]);
  const [creating, setCreating] = useState(false);
  const [createdDoc, setCreatedDoc] = useState(null);

  // Settings / Vendors / Customers / Catalog forms
  const [vendorForm, setVendorForm] = useState({ vendor_name: '', poc_name: '', vendor_phone: '', address: '' });
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [itemForm, setItemForm] = useState({ name: '', unit: 'kg', unit_price: '' });
  const [profileForm, setProfileForm] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const isNativeIos =
    typeof window !== 'undefined' &&
    Boolean(window.Capacitor?.isNativePlatform?.()) &&
    window.Capacitor?.getPlatform?.() === 'ios';

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? '' : cur)), 4000);
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data?.session || null);
        setAuthLoading(false);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession || null);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const loadTraderWorkspace = useCallback(async (uid) => {
    if (!uid) return;
    setProfileLoading(true);
    try {
      const [profRes, invRes, custRes, vendRes, catRes] = await Promise.all([
        supabase.from('trader_profiles').select('*').eq('id', uid).maybeSingle(),
        supabase.from('trader_invoices').select('*').eq('trader_id', uid).order('created_at', { ascending: false }),
        supabase.from('trader_customers').select('*').eq('trader_id', uid).order('name'),
        supabase.from('trader_vendors').select('*').eq('trader_id', uid).order('vendor_name'),
        supabase.from('trader_catalog_items').select('*').eq('trader_id', uid).order('name'),
      ]);
      const p = profRes.data || null;
      setProfile(p);
      setProfileForm(p);
      if (p) {
        setPayTillInput(p.mpesa_till_no || '');
        setPayPaybillInput(p.mpesa_paybill_no || '');
        setPayAccountInput(p.mpesa_account_no || '');
        setSendMoneyProvInput(p.send_money_provider || 'M-Pesa');
        setSendMoneyNumInput(p.send_money_number || '');
      }
      setInvoices(invRes.data || []);
      setCustomers(custRes.data || []);
      setVendors(vendRes.data || []);
      setCatalogItems(catRes.data || []);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      loadTraderWorkspace(session.user.id);
    } else {
      setProfile(null);
    }
  }, [session?.user?.id, loadTraderWorkspace]);

  const quota = useMemo(() => computeMonthlyQuotaStatus(invoices, profile), [invoices, profile]);
  const currency = profile?.currency || 'KES';

  const summaryStats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    let billed = 0;
    let paid = 0;
    let pending = 0;
    for (const inv of invoices) {
      const st = resolveInvoiceDisplayStatus(inv, now);
      const t = new Date(inv.created_at || 0).getTime();
      const tot = Number(inv.total_amount || 0);
      const amtPaid = Number(inv.amount_paid || 0);
      if (t >= monthStart) billed += tot;
      if (st === 'paid') paid += tot;
      else {
        paid += amtPaid;
        pending += Math.max(0, tot - amtPaid);
      }
    }
    return { billed, paid, pending };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      const st = resolveInvoiceDisplayStatus(inv);
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (q) {
        const hay = `${inv.invoice_number} ${inv.buyer_name} ${inv.buyer_phone || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, searchQuery]);

  const newDocTotals = useMemo(
    () => computeTraderInvoiceTotals(lineItems, includeVat),
    [lineItems, includeVat]
  );

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-500" size={32} />
      </div>
    );
  }

  if (!session?.user) {
    return <TraderAuthScreen onSignedIn={(s) => setSession(s)} />;
  }

  if (!profile) {
    return (
      <TraderOnboardingSetup
        user={session.user}
        onCompleted={(p) => {
          setProfile(p);
          setProfileForm(p);
          loadTraderWorkspace(session.user.id);
        }}
      />
    );
  }

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    const canCreate = docType === 'receipt' ? quota.canCreateReceipt : quota.canCreateInvoice;
    if (!canCreate) {
      setUpgradeOpen(true);
      return;
    }
    const cleanItems = lineItems.filter((it) => it.name.trim() && Number(it.quantity) > 0);
    if (!buyerName.trim() || cleanItems.length === 0) {
      showToast('Enter buyer name and at least one item.');
      return;
    }
    setCreating(true);
    try {
      const invNumber = nextTraderDocumentNumber(invoices, docType);
      const isInstantReceipt = docType === 'receipt';
      const formattedPayRef =
        preferredPayMethod === 'M-Pesa Till No'
          ? (payTillInput.trim() || null)
          : preferredPayMethod === 'M-Pesa Paybill'
          ? ([payPaybillInput.trim(), payAccountInput.trim()].filter(Boolean).join(' / ') || null)
          : preferredPayMethod === 'Send Money'
          ? (sendMoneyNumInput.trim() ? `${sendMoneyProvInput}: ${sendMoneyNumInput.trim()}` : null)
          : null;
      const payload = {
        trader_id: session.user.id,
        customer_id: selectedCustomerId || null,
        invoice_number: invNumber,
        doc_type: docType,
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim() || null,
        buyer_phone: buyerPhone.trim() || null,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: isInstantReceipt ? null : (dueDate || null),
        status: isInstantReceipt ? 'paid' : 'pending',
        items: cleanItems.map((it) => ({
          name: it.name.trim(),
          unit: it.unit || 'kg',
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
        })),
        subtotal: newDocTotals.subtotal,
        tax_amount: newDocTotals.taxAmount,
        total_amount: newDocTotals.totalAmount,
        amount_paid: isInstantReceipt ? newDocTotals.totalAmount : 0,
        payment_method: preferredPayMethod,
        payment_reference: formattedPayRef,
        paid_at: isInstantReceipt ? new Date().toISOString() : null,
        notes: notes.trim() || null,
        auto_remind: isInstantReceipt ? false : autoRemind,
      };
      const { data, error } = await supabase
        .from('trader_invoices')
        .insert([payload])
        .select('*')
        .single();
      if (error) throw error;
      setInvoices((prev) => [data, ...prev]);
      setCreatedDoc(data);
      setBuyerName('');
      setBuyerEmail('');
      setBuyerPhone('');
      setSelectedCustomerId('');
      setNotes('');
      setLineItems([{ name: '', unit: 'kg', quantity: 1, unit_price: '' }]);
      showToast(`${docType === 'receipt' ? 'Receipt' : 'Invoice'} ${data.invoice_number} created.`);
    } catch (err) {
      showToast(err.message || 'Could not create document');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmMarkPaid = async (e) => {
    e.preventDefault();
    if (!payTarget) return;
    setBusyId(payTarget.id);
    try {
      const total = Number(payTarget.total_amount || 0);
      const alreadyPaid = Number(payTarget.amount_paid || 0);
      const added = payMode === 'full' ? Math.max(0, total - alreadyPaid) : Math.max(0, Number(payAmount || 0));
      const newPaid = Math.min(total, alreadyPaid + added);
      const newStatus = newPaid >= total ? 'paid' : 'partial';

      const patch = {
        status: newStatus,
        amount_paid: newPaid,
        payment_method: payMethod,
        payment_reference: payRef.trim() || null,
        paid_at: newStatus === 'paid' ? new Date().toISOString() : payTarget.paid_at,
      };
      const { data, error } = await supabase
        .from('trader_invoices')
        .update(patch)
        .eq('id', payTarget.id)
        .select('*')
        .single();
      if (error) throw error;
      setInvoices((prev) => prev.map((x) => (x.id === data.id ? data : x)));

      if (sendReceiptEmail && data.buyer_email) {
        supabase.functions.invoke('send-trader-invoice-reminders', {
          body: { invoiceId: data.id, mode: 'receipt' },
        }).catch(() => {});
      }
      setPayTarget(null);
      setPayRef('');
      showToast(newStatus === 'paid' ? 'Marked as PAID.' : 'Partial payment recorded.');
    } catch (err) {
      showToast(err.message || 'Could not update payment');
    } finally {
      setBusyId(null);
    }
  };

  const handleSendEmail = async (inv, mode) => {
    if (!inv.buyer_email) {
      showToast('Add buyer email first to send email.');
      return;
    }
    setBusyId(inv.id);
    try {
      const { data, error } = await supabase.functions.invoke('send-trader-invoice-reminders', {
        body: { invoiceId: inv.id, mode },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      showToast(`Email sent to ${inv.buyer_email}`);
      if (mode === 'reminder') loadTraderWorkspace(session.user.id);
    } catch (err) {
      showToast('Email failed: ' + (err.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = (inv) => {
    setDocType(inv.doc_type || 'invoice');
    setBuyerName(inv.buyer_name || '');
    setBuyerEmail(inv.buyer_email || '');
    setBuyerPhone(inv.buyer_phone || '');
    setLineItems(
      Array.isArray(inv.items) && inv.items.length > 0
        ? inv.items.map((it) => ({ ...it }))
        : [{ name: '', unit: 'kg', quantity: 1, unit_price: '' }]
    );
    setIncludeVat(Number(inv.tax_amount || 0) > 0);
    setPreferredPayMethod(inv.payment_method || 'M-Pesa Till No');
    setNotes(inv.notes || '');
    setCreatedDoc(null);
    setTab('new');
  };

  const handleSaveVendor = async (e) => {
    e.preventDefault();
    if (!vendorForm.vendor_name.trim()) return;
    const { data, error } = await supabase
      .from('trader_vendors')
      .insert([{ ...vendorForm, vendor_name: vendorForm.vendor_name.trim(), trader_id: session.user.id }])
      .select('*')
      .single();
    if (!error && data) {
      setVendors((prev) => [...prev, data]);
      setVendorForm({ vendor_name: '', poc_name: '', vendor_phone: '', address: '' });
      showToast('Vendor added.');
    }
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!customerForm.name.trim()) return;
    const { data, error } = await supabase
      .from('trader_customers')
      .insert([{ ...customerForm, name: customerForm.name.trim(), trader_id: session.user.id }])
      .select('*')
      .single();
    if (!error && data) {
      setCustomers((prev) => [...prev, data]);
      setCustomerForm({ name: '', phone: '', email: '', address: '' });
      showToast('Buyer saved.');
    }
  };

  const handleSaveCatalogItem = async (e) => {
    e.preventDefault();
    if (!itemForm.name.trim()) return;
    const { data, error } = await supabase
      .from('trader_catalog_items')
      .insert([{
        trader_id: session.user.id,
        name: itemForm.name.trim(),
        unit: itemForm.unit || 'kg',
        unit_price: Number(itemForm.unit_price || 0),
      }])
      .select('*')
      .single();
    if (!error && data) {
      setCatalogItems((prev) => [...prev, data]);
      setItemForm({ name: '', unit: 'kg', unit_price: '' });
      showToast('Item saved to price list.');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm?.business_name?.trim()) {
      showToast('Business Name is required.');
      return;
    }
    const updatePayload = {
      business_name: profileForm.business_name.trim(),
      logo_url: profileForm.logo_url || null,
      kra_pin: profileForm.kra_pin || null,
      location: profileForm.location || null,
      phone: profileForm.phone || null,
      mpesa_till_no: profileForm.mpesa_till_no || null,
      mpesa_paybill_no: profileForm.mpesa_paybill_no || null,
      mpesa_account_no: profileForm.mpesa_account_no || null,
      send_money_provider: profileForm.send_money_number ? (profileForm.send_money_provider || 'M-Pesa') : null,
      send_money_number: profileForm.send_money_number || null,
      currency: profileForm.currency || 'KES',
    };
    let res = await supabase
      .from('trader_profiles')
      .update(updatePayload)
      .eq('id', session.user.id)
      .select('*')
      .single();
    if (res.error && String(res.error.message || '').toLowerCase().includes('send_money')) {
      const fb = { ...updatePayload };
      delete fb.send_money_provider;
      delete fb.send_money_number;
      res = await supabase
        .from('trader_profiles')
        .update(fb)
        .eq('id', session.user.id)
        .select('*')
        .single();
    }
    if (!res.error && res.data) {
      setProfile(res.data);
      setProfileForm(res.data);
      showToast('Business profile updated.');
    }
  };

  const handleProfileLogoUpload = async (file) => {
    if (!file) return;
    const ext = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const path = `trader-logos/${session.user.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('menu_images').upload(path, file, { upsert: true });
    if (!upErr) {
      const { data } = supabase.storage.from('menu_images').getPublicUrl(path);
      if (data?.publicUrl) setProfileForm((p) => ({ ...p, logo_url: data.publicUrl }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt={profile.business_name} className="w-9 h-9 rounded-xl object-cover border border-slate-200" />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                <FileText size={18} />
              </div>
            )}
            <div>
              <h1 className="text-sm font-black text-slate-900 leading-tight">{profile.business_name}</h1>
              <p className="text-[11px] font-semibold text-slate-500">
                {TRADER_PLANS[quota.planId]?.name} · {quota.limitLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {quota.planId !== 'unlimited' && (
              <button
                type="button"
                onClick={() => setUpgradeOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1 cursor-pointer"
              >
                <Sparkles size={13} /> Upgrade
              </button>
            )}
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-rose-600 cursor-pointer"
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* 3 Simple Tabs */}
        <div className="max-w-5xl mx-auto px-4 flex gap-2 pb-2.5">
          {[
            { id: 'invoices', label: 'Invoices & Receipts', icon: FileText },
            { id: 'new', label: '+ New Invoice / Receipt', icon: Plus },
            { id: 'settings', label: 'Buyers, Vendors & Settings', icon: Users },
          ].map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTab(t.id); setCreatedDoc(null); }}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg">
          {toast}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* TAB 1: INVOICES LIST */}
        {tab === 'invoices' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase text-slate-400">Total Billed (This Month)</p>
                <p className="text-xl font-black text-slate-900 mt-1">{currency} {summaryStats.billed.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase text-slate-400">Paid / Collected</p>
                <p className="text-xl font-black text-emerald-700 mt-1">{currency} {summaryStats.paid.toLocaleString()}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] font-bold uppercase text-slate-400">Pending &amp; Overdue</p>
                <p className="text-xl font-black text-amber-700 mt-1">{currency} {summaryStats.pending.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {['all', 'pending', 'overdue', 'partial', 'paid'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize cursor-pointer ${
                      statusFilter === st ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search buyer or #..."
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="space-y-3">
              {filteredInvoices.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
                  <FileText className="mx-auto text-slate-300" size={32} />
                  <p className="text-sm font-bold text-slate-700">No invoices or receipts yet</p>
                  <button
                    type="button"
                    onClick={() => setTab('new')}
                    className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-black cursor-pointer"
                  >
                    + Create Your First Invoice
                  </button>
                </div>
              ) : (
                filteredInvoices.map((inv) => {
                  const st = resolveInvoiceDisplayStatus(inv);
                  const bal = Math.max(0, Number(inv.total_amount || 0) - Number(inv.amount_paid || 0));
                  return (
                    <div key={inv.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm text-slate-900">#{inv.invoice_number}</span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            {inv.doc_type}
                          </span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            st === 'paid' ? 'bg-emerald-50 text-emerald-700'
                            : st === 'overdue' ? 'bg-rose-50 text-rose-700'
                            : st === 'partial' ? 'bg-sky-50 text-sky-700'
                            : 'bg-amber-50 text-amber-800'
                          }`}>
                            {st}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800">{inv.buyer_name}</p>
                        <p className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                          <span>Total: <strong>{currency} {Number(inv.total_amount || 0).toLocaleString()}</strong></span>
                          {st !== 'paid' && <span>· Balance: <strong className="text-amber-700">{currency} {bal.toLocaleString()}</strong></span>}
                          {inv.due_date && <span>· Due: {inv.due_date}</span>}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => generateTraderInvoicePdf(inv, profile)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Download size={13} /> PDF
                        </button>
                        <a
                          href={buildTraderWhatsAppShareUrl(inv, profile, window.location.origin)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1"
                        >
                          <MessageCircle size={13} /> WhatsApp
                        </a>
                        {st !== 'paid' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setPayTarget(inv);
                                setPayMode('full');
                                setPayAmount(String(bal));
                                setPayMethod(inv.payment_method || 'M-Pesa Till No');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 size={13} /> Mark Paid
                            </button>
                            {inv.buyer_email && (
                              <button
                                type="button"
                                disabled={busyId === inv.id}
                                onClick={() => handleSendEmail(inv, 'reminder')}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Mail size={13} /> Remind
                              </button>
                            )}
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDuplicate(inv)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          title="Duplicate"
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* TAB 2: NEW INVOICE / RECEIPT */}
        {tab === 'new' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            {createdDoc ? (
              <div className="text-center space-y-4 py-4">
                <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
                <h2 className="text-lg font-black">
                  {createdDoc.doc_type === 'receipt' ? 'Receipt' : 'Invoice'} #{createdDoc.invoice_number} Ready!
                </h2>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => generateTraderInvoicePdf(createdDoc, profile)}
                    className="px-4 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={14} /> Download PDF
                  </button>
                  <a
                    href={buildTraderWhatsAppShareUrl(createdDoc, profile, window.location.origin)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center gap-1.5"
                  >
                    <MessageCircle size={14} /> Send via WhatsApp
                  </a>
                  {createdDoc.buyer_email && (
                    <button
                      type="button"
                      onClick={() => handleSendEmail(createdDoc, 'invoice')}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Mail size={14} /> Email to Buyer
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCreatedDoc(null)}
                  className="text-xs font-bold text-slate-500 underline cursor-pointer"
                >
                  Create Another Document
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateInvoice} className="space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                    {['invoice', 'receipt'].map((dt) => (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => setDocType(dt)}
                        className={`px-4 py-1.5 rounded-lg font-black capitalize cursor-pointer ${
                          docType === dt ? 'bg-amber-400 text-slate-950' : 'text-slate-600'
                        }`}
                      >
                        {dt}
                      </button>
                    ))}
                  </div>
                  <span className="text-slate-500 font-semibold">{quota.limitLabel}</span>
                </div>

                {customers.length > 0 && (
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Pick Saved Buyer (Optional)</label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => {
                        const c = customers.find((x) => x.id === e.target.value);
                        setSelectedCustomerId(e.target.value);
                        if (c) {
                          setBuyerName(c.name || '');
                          setBuyerPhone(c.phone || '');
                          setBuyerEmail(c.email || '');
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="">-- Enter New Buyer --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Buyer / Restaurant Name *</label>
                    <input
                      type="text"
                      required
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="e.g. Pot of Jollof Kitchen"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Buyer Phone (WhatsApp)</label>
                    <input
                      type="text"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="e.g. 254712345678"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Buyer Email (For Auto Follow-up)</label>
                    <input
                      type="email"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="accounts@restaurant.co.ke"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-slate-700 uppercase text-[10px]">Items Supplied</label>
                    {catalogItems.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const cat = catalogItems.find((x) => x.id === e.target.value);
                          if (cat) {
                            setLineItems((prev) => [...prev, { name: cat.name, unit: cat.unit || 'kg', quantity: 1, unit_price: cat.unit_price }]);
                          }
                        }}
                        className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg font-bold text-amber-900"
                      >
                        <option value="">+ Quick Add Saved Item</option>
                        {catalogItems.map((it) => (
                          <option key={it.id} value={it.id}>{it.name} ({currency} {it.unit_price}/{it.unit})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {lineItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        required
                        placeholder="Item (e.g. Beef Sirloin)"
                        value={it.name}
                        onChange={(e) => setLineItems((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))}
                        className="col-span-5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) => setLineItems((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))}
                        className="col-span-2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <input
                        type="text"
                        placeholder="Unit"
                        value={it.unit}
                        onChange={(e) => setLineItems((prev) => prev.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r)))}
                        className="col-span-2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="Price"
                        value={it.unit_price}
                        onChange={(e) => setLineItems((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: e.target.value } : r)))}
                        className="col-span-2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => lineItems.length > 1 && setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 p-2 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setLineItems((prev) => [...prev, { name: '', unit: 'kg', quantity: 1, unit_price: '' }])}
                    className="text-xs font-bold text-amber-700 hover:underline cursor-pointer"
                  >
                    + Add Another Line
                  </button>
                </div>

                {/* Payment Method & Due Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div className="space-y-2">
                    <label className="font-bold text-slate-700 block">Payment Option</label>
                    <select
                      value={preferredPayMethod}
                      onChange={(e) => setPreferredPayMethod(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      {TRADER_PAYMENT_METHODS.map((pm) => {
                        let suffix = '';
                        if (pm === 'M-Pesa Till No' && profile?.mpesa_till_no) suffix = ` (${profile.mpesa_till_no})`;
                        if (pm === 'M-Pesa Paybill' && profile?.mpesa_paybill_no) {
                          suffix = ` (${profile.mpesa_paybill_no}${profile.mpesa_account_no ? ` · Acc: ${profile.mpesa_account_no}` : ''})`;
                        }
                        if (pm === 'Send Money' && profile?.send_money_number) {
                          suffix = ` (${profile.send_money_provider || 'M-Pesa'}: ${profile.send_money_number})`;
                        }
                        return <option key={pm} value={pm}>{pm}{suffix}</option>;
                      })}
                    </select>

                    {preferredPayMethod === 'M-Pesa Till No' && (
                      <input
                        type="text"
                        value={payTillInput}
                        onChange={(e) => setPayTillInput(e.target.value)}
                        placeholder="M-Pesa Till No"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      />
                    )}
                    {preferredPayMethod === 'M-Pesa Paybill' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={payPaybillInput}
                          onChange={(e) => setPayPaybillInput(e.target.value)}
                          placeholder="Paybill No"
                          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        />
                        <input
                          type="text"
                          value={payAccountInput}
                          onChange={(e) => setPayAccountInput(e.target.value)}
                          placeholder="Account No"
                          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        />
                      </div>
                    )}
                    {preferredPayMethod === 'Send Money' && (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={sendMoneyProvInput}
                          onChange={(e) => setSendMoneyProvInput(e.target.value)}
                          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                        >
                          {SEND_MONEY_PROVIDERS.map((prov) => (
                            <option key={prov} value={prov}>{prov}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={sendMoneyNumInput}
                          onChange={(e) => setSendMoneyNumInput(e.target.value)}
                          placeholder="Phone Number"
                          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {docType === 'invoice' && (
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Due Date</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                        />
                        {[0, 7, 14, 30].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDueDate(addDaysIso(d))}
                            className="px-2 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold cursor-pointer"
                          >
                            {d === 0 ? 'Today' : `+${d}d`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={includeVat} onChange={(e) => setIncludeVat(e.target.checked)} />
                      Add 16% VAT
                    </label>
                    {docType === 'invoice' && (
                      <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={autoRemind} onChange={(e) => setAutoRemind(e.target.checked)} />
                        Auto-email follow-up while pending
                      </label>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500">Total: <strong className="text-lg text-slate-900">{currency} {newDocTotals.totalAmount.toLocaleString()}</strong></p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm cursor-pointer disabled:opacity-50"
                >
                  {creating ? 'Creating...' : `Generate ${docType === 'receipt' ? 'Receipt' : 'Invoice'}`}
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 3: BUYERS, VENDORS & SETTINGS */}
        {tab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            {/* Vendors */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-black flex items-center gap-2">
                <Building2 size={16} className="text-amber-500" /> Add Vendor
              </h3>
              <form onSubmit={handleSaveVendor} className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Vendor Name *"
                  value={vendorForm.vendor_name}
                  onChange={(e) => setVendorForm((p) => ({ ...p, vendor_name: e.target.value }))}
                  className="col-span-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="POC (Contact Person)"
                  value={vendorForm.poc_name}
                  onChange={(e) => setVendorForm((p) => ({ ...p, poc_name: e.target.value }))}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Vendor Phone No"
                  value={vendorForm.vendor_phone}
                  onChange={(e) => setVendorForm((p) => ({ ...p, vendor_phone: e.target.value }))}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={vendorForm.address}
                  onChange={(e) => setVendorForm((p) => ({ ...p, address: e.target.value }))}
                  className="col-span-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <button type="submit" className="col-span-2 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-black cursor-pointer">
                  + Add Vendor
                </button>
              </form>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {vendors.map((v) => (
                  <div key={v.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="font-black text-slate-900">{v.vendor_name}</p>
                    <p className="text-slate-500">{[v.poc_name, v.vendor_phone, v.address].filter(Boolean).join(' · ')}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Saved Buyers */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-black flex items-center gap-2">
                <Users size={16} className="text-amber-500" /> Saved Buyers (Restaurants)
              </h3>
              <form onSubmit={handleSaveCustomer} className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Buyer Name *"
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))}
                  className="col-span-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <button type="submit" className="col-span-2 py-2.5 rounded-xl bg-slate-900 text-white font-black cursor-pointer">
                  + Save Buyer
                </button>
              </form>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {customers.map((c) => (
                  <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="font-black text-slate-900">{c.name}</p>
                    <p className="text-slate-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Saved Price List */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-black">Saved Item Price List</h3>
              <form onSubmit={handleSaveCatalogItem} className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Item Name"
                  value={itemForm.name}
                  onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Unit (kg)"
                  value={itemForm.unit}
                  onChange={(e) => setItemForm((p) => ({ ...p, unit: e.target.value }))}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <input
                  type="number"
                  required
                  placeholder="Price"
                  value={itemForm.unit_price}
                  onChange={(e) => setItemForm((p) => ({ ...p, unit_price: e.target.value }))}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
                <button type="submit" className="col-span-3 py-2.5 rounded-xl bg-slate-900 text-white font-black cursor-pointer">
                  + Save Item
                </button>
              </form>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {catalogItems.map((it) => (
                  <div key={it.id} className="flex justify-between p-2 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="font-bold">{it.name} ({it.unit})</span>
                    <span className="font-black">{currency} {Number(it.unit_price || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Business Profile Settings */}
            {profileForm && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-black flex items-center gap-2">
                  <Settings size={16} className="text-amber-500" /> Business Profile &amp; Payment Info
                </h3>
                <form onSubmit={handleSaveProfile} className="space-y-2.5">
                  <input
                    type="text"
                    required
                    placeholder="Business Name *"
                    value={profileForm.business_name || ''}
                    onChange={(e) => setProfileForm((p) => ({ ...p, business_name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="KRA PIN (Optional)"
                      value={profileForm.kra_pin || ''}
                      onChange={(e) => setProfileForm((p) => ({ ...p, kra_pin: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                    <input
                      type="text"
                      placeholder="Location (Optional)"
                      value={profileForm.location || ''}
                      onChange={(e) => setProfileForm((p) => ({ ...p, location: e.target.value }))}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <TraderPaymentSetupFields
                    value={profileForm}
                    onChange={setProfileForm}
                    compact
                  />
                  <label className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 border border-dashed border-slate-300 rounded-xl cursor-pointer">
                    <Upload size={14} /> Upload / Change Logo (Optional)
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleProfileLogoUpload(e.target.files[0])} />
                  </label>
                  <button type="submit" className="w-full py-2.5 rounded-xl bg-amber-400 text-slate-950 font-black cursor-pointer">
                    Save Business Settings
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MARK PAID MODAL */}
      {payTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={handleConfirmMarkPaid} className="bg-white border border-slate-200 rounded-2xl p-5 max-w-md w-full space-y-4 text-xs">
            <h3 className="text-base font-black text-slate-900">Mark Paid · #{payTarget.invoice_number}</h3>
            <div className="grid grid-cols-2 gap-2">
              {['full', 'partial'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMode(m)}
                  className={`py-2 rounded-xl font-black capitalize cursor-pointer ${payMode === m ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-600'}`}
                >
                  {m} Payment
                </button>
              ))}
            </div>
            {payMode === 'partial' && (
              <input
                type="number"
                required
                min="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Amount received"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            )}
            <div>
              <label className="font-bold text-slate-700 block mb-1">Payment Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                {TRADER_PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="M-Pesa / Cheque Reference (Optional)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
            />
            {payTarget.buyer_email && (
              <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={sendReceiptEmail} onChange={(e) => setSendReceiptEmail(e.target.checked)} />
                Email Payment Receipt to {payTarget.buyer_email}
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPayTarget(null)} className="px-4 py-2 rounded-xl bg-slate-100 font-bold cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={busyId === payTarget.id} className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 font-black cursor-pointer">
                Confirm Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* UPGRADE PLAN MODAL */}
      {upgradeOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Upgrade Your Invoice Plan</h3>
              <button type="button" onClick={() => setUpgradeOpen(false)} className="text-xs font-bold text-slate-500 cursor-pointer">Close</button>
            </div>
            {isNativeIos ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                <p className="font-bold flex items-center gap-1.5"><AlertCircle size={14} /> Manage Plan on Web</p>
                <p>Visit <strong>manipos.com/#/invoices</strong> in your browser to manage or upgrade your plan.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[TRADER_PLANS.starter, TRADER_PLANS.unlimited].map((plan) => (
                  <div key={plan.id} className="border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <p className="font-black text-sm text-slate-900">{plan.name}</p>
                      <p className="text-lg font-black text-amber-700 mt-1">{plan.priceLabel}</p>
                      <p className="text-slate-500 mt-1">{plan.description}</p>
                    </div>
                    <a
                      href={`https://wa.me/254700000000?text=${encodeURIComponent(`Hi ManiPOS, I want to upgrade my Trader Invoices account (${session.user.email}) to ${plan.name} (${plan.priceLabel}).`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 rounded-xl bg-amber-400 text-slate-950 font-black text-center block"
                    >
                      Activate via M-Pesa / Support
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
