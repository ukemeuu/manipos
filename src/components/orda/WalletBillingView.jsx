import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet, CreditCard, Plus, ArrowUpRight, ArrowDownLeft, CheckCircle2,
  Receipt, Smartphone, Laptop, X, Building2, Download, ShieldCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const WALLET_ENTRY_TYPES = ['All', 'Credit', 'Debit', 'Topup', 'Remittance', 'Withdrawal', 'Invoice'];

export function WalletBillingView({
  mode = 'payments', // 'subscriptions' | 'payments' | 'paystack'
  restaurantId,
  restaurantName = 'ManiPOS Store',
  settings = {},
  orders = [],
  staffName = 'Admin',
}) {
  const [subTab, setSubTab] = useState(mode);
  useEffect(() => {
    setSubTab(mode);
  }, [mode]);

  const [paystackSubTab, setPaystackSubTab] = useState('transactions'); // 'transactions' | 'payouts'
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loanRequests, setLoanRequests] = useState([]);
  const [entryFilter, setEntryFilter] = useState('All');
  const [billingCycle, setBillingCycle] = useState('monthly');

  const [depositModal, setDepositModal] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '5000', channel: 'Paystack', reference: '' });
  const [loanModal, setLoanModal] = useState(false);
  const [loanForm, setLoanForm] = useState({
    request_type: 'POS Hardware',
    device_model: 'Sunmi V2s Handheld POS Terminal',
    quantity: '1',
    amount_kes: '28000',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadWalletData = async () => {
    if (!restaurantId) return;
    try {
      const [pRes, sRes, invRes, ledRes, loanRes] = await Promise.all([
        supabase.from('saas_plans').select('*').eq('is_active', true).order('monthly_kes', { ascending: true }),
        supabase.from('subscriptions').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
        supabase.from('subscription_invoices').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('merchant_wallet_ledger').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(200),
        supabase.from('device_loan_requests').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
      ]);
      if (!pRes.error && pRes.data?.length) setPlans(pRes.data);
      else {
        setPlans([
          { id: 'starter', name: 'Starter Plan', monthly_kes: 3500, annual_kes: 35000, max_locations: 1, features: ['Live POS Register', 'Digital Menu Microsite', 'M-Pesa STK Push'] },
          { id: 'growth', name: 'Growth Plan', monthly_kes: 7500, annual_kes: 75000, max_locations: 3, features: ['Multi-Location', 'Inventory ERP', 'Customers CRM & Loyalty', '6am-6am PDF EOD'] },
          { id: 'enterprise', name: 'Enterprise Fleet', monthly_kes: 15000, annual_kes: 150000, max_locations: 15, features: ['Unlimited Registers', 'Omnichannel Aggregators', 'Tevin KRA & Dispatch', 'Custom Webhooks'] },
        ]);
      }
      if (!sRes.error && sRes.data) {
        setSubscription(sRes.data);
        setBillingCycle(sRes.data.billing_cycle || 'monthly');
      }
      if (!invRes.error) setInvoices(invRes.data || []);
      if (!ledRes.error) setLedger(ledRes.data || []);
      if (!loanRes.error) setLoanRequests(loanRes.data || []);
    } catch (err) {
      console.warn('Wallet load note:', err);
    }
  };

  useEffect(() => {
    loadWalletData();
  }, [restaurantId]);

  const walletBalance = useMemo(() => {
    if (ledger.length > 0 && ledger[0]?.balance_after_kes !== undefined) {
      return Number(ledger[0].balance_after_kes || 0);
    }
    return Number(settings.wallet_balance_kes || 0);
  }, [ledger, settings.wallet_balance_kes]);

  const handleDeposit = async (e) => {
    e.preventDefault();
    const amt = Number(depositForm.amount || 0);
    if (!restaurantId || amt <= 0) return;
    setSaving(true);
    try {
      const nextBal = walletBalance + amt;
      const { error } = await supabase.from('merchant_wallet_ledger').insert([
        {
          restaurant_id: restaurantId,
          entry_type: 'Topup',
          amount_kes: amt,
          balance_after_kes: nextBal,
          channel: depositForm.channel,
          reference: depositForm.reference.trim() || `TOP-${Date.now().toString().slice(-6)}`,
          description: `Wallet Deposit via ${depositForm.channel}`,
          status: 'completed',
        },
      ]);
      if (error) throw error;
      setDepositModal(false);
      setNotice(`Wallet topped up with KES ${amt.toLocaleString()}.`);
      await loadWalletData();
    } catch (err) {
      alert('Deposit note (apply Wave 5 migration if table missing): ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitLoan = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('device_loan_requests').insert([
        {
          restaurant_id: restaurantId,
          request_type: loanForm.request_type,
          device_model: loanForm.device_model.trim(),
          quantity: Number(loanForm.quantity || 1),
          amount_kes: Number(loanForm.amount_kes || 0),
          notes: loanForm.notes.trim() || null,
          status: 'submitted',
          created_by: staffName,
        },
      ]);
      if (error) throw error;
      setLoanModal(false);
      setNotice('Hardware / Loan request submitted for review.');
      await loadWalletData();
    } catch (err) {
      alert('Request error: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchPlan = async (plan) => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const amt = billingCycle === 'annual' ? Number(plan.annual_kes) : Number(plan.monthly_kes);
      const { data: subRow, error } = await supabase
        .from('subscriptions')
        .upsert(
          {
            restaurant_id: restaurantId,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: new Date(Date.now() + (billingCycle === 'annual' ? 365 : 30) * 86400000).toISOString(),
          },
          { onConflict: 'restaurant_id' }
        )
        .select('*')
        .single();
      if (error) throw error;

      const invNum = `INV-${Date.now().toString().slice(-6)}`;
      await supabase.from('subscription_invoices').insert([
        {
          restaurant_id: restaurantId,
          subscription_id: subRow?.id || null,
          invoice_number: invNum,
          plan_id: plan.id,
          amount_kes: amt,
          status: 'paid',
          payment_method: 'Paystack',
          paid_at: new Date().toISOString(),
        },
      ]);
      await supabase.rpc('activate_tenant_subscription', {
        p_restaurant_id: restaurantId,
        p_plan: plan.id,
        p_billing_cycle: billingCycle,
        p_payment_ref: invNum,
      });
      setNotice(`Subscribed to ${plan.name} (${billingCycle}). Active immediately.`);
      await loadWalletData();
    } catch (err) {
      alert('Plan change note: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const paystackTransactions = useMemo(
    () =>
      orders.filter((o) =>
        ['paid to app', 'prepaid', 'card', 'mpesa paybill'].includes(String(o.payment_method || '').toLowerCase())
      ),
    [orders]
  );

  const payoutAcc = settings.payout_account || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">Subscriptions &amp; Payouts</h2>
            <div className="inline-flex bg-slate-100 rounded-xl p-0.5 text-xs font-bold">
              {[
                { id: 'subscriptions', label: 'Subscriptions & Billing' },
                { id: 'payments', label: 'Wallet & Ledger' },
                { id: 'paystack', label: 'Settlement & Payouts' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={`px-3 py-1 rounded-lg ${subTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Active ManiPOS subscription plan, billing invoices, and settlement ledger.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
          Billing Cycle: <span className="uppercase font-black text-slate-900">{billingCycle}</span>
        </div>
      </div>

      {notice && (
        <div className="bg-amber-50 border border-amber-200 text-slate-900 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="hover:underline">Dismiss</button>
        </div>
      )}

      {/* TAB 1: WALLET & LEDGER */}
      {subTab === 'payments' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#0d0d0d] text-white rounded-2xl p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase text-amber-300">Merchant Wallet Balance</p>
              <p className="text-3xl font-black mt-1 font-mono">KES {walletBalance.toLocaleString()}</p>
              <p className="text-[11px] text-amber-300/80 mt-2">Settled Paystack & SMS/Subscription credits</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-[11px] font-bold uppercase text-slate-400">Online Transactions Recorded</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{paystackTransactions.length}</p>
              <p className="text-[11px] text-slate-500 mt-2">
                Volume: KES {paystackTransactions.reduce((s, o) => s + Number(o.total_amount || 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-[11px] font-bold uppercase text-slate-400">Hardware / Loan Requests</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{loanRequests.length}</p>
              <p className="text-[11px] text-slate-500 mt-2">
                Latest: {loanRequests[0]?.status || 'No active requests'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs font-bold">
            {WALLET_ENTRY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setEntryFilter(t)}
                className={`px-3 py-1.5 rounded-xl border ${
                  entryFilter === t ? 'bg-amber-50 border-amber-400 text-slate-900' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Reference & Channel</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger
                  .filter((l) => entryFilter === 'All' || l.entry_type === entryFilter)
                  .map((l) => {
                    const isDebit = ['Debit', 'Withdrawal', 'Invoice'].includes(l.entry_type);
                    return (
                      <tr key={l.id}>
                        <td className="py-3 px-4 text-slate-500">{new Date(l.created_at).toLocaleString('en-KE')}</td>
                        <td className="py-3 px-4 font-bold">{l.entry_type}</td>
                        <td className="py-3 px-4 font-mono">{l.reference || '—'} · {l.channel || ''}</td>
                        <td className="py-3 px-4 text-slate-600">{l.description || '—'}</td>
                        <td className={`py-3 px-4 text-right font-mono font-bold ${isDebit ? 'text-rose-700' : 'text-amber-700'}`}>
                          {isDebit ? '-' : '+'}KES {Number(l.amount_kes || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          KES {Number(l.balance_after_kes || 0).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                {ledger.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400">No wallet ledger transactions yet. Use <strong>Deposit Funds</strong> to record a Topup.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SUBSCRIPTIONS & BILLING HISTORY */}
      {subTab === 'subscriptions' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 text-xs">
            <div>
              <p className="font-black text-slate-900 text-sm">
                Active Plan: {(subscription?.plan_id || 'growth').toUpperCase()} ({subscription?.status || 'active'})
              </p>
              <p className="text-slate-500">
                Renews: {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString('en-KE') : 'Monthly Cycle'}
              </p>
            </div>
            <div className="inline-flex bg-slate-100 rounded-xl p-1 font-bold">
              <button type="button" onClick={() => setBillingCycle('monthly')} className={`px-3 py-1 rounded-lg ${billingCycle === 'monthly' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>Monthly</button>
              <button type="button" onClick={() => setBillingCycle('annual')} className={`px-3 py-1 rounded-lg ${billingCycle === 'annual' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>Annual (2 mos free)</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((p) => {
              const isCurrent = (subscription?.plan_id || 'growth') === p.id;
              const price = billingCycle === 'annual' ? Number(p.annual_kes) : Number(p.monthly_kes);
              return (
                <div key={p.id} className={`rounded-2xl border p-5 space-y-4 bg-white ${isCurrent ? 'border-amber-400 ring-2 ring-emerald-600/20' : 'border-slate-200'}`}>
                  <div>
                    <p className="text-xs font-bold uppercase text-amber-700">{p.max_locations} Location(s)</p>
                    <h3 className="text-lg font-black text-slate-900 mt-0.5">{p.name}</h3>
                    <p className="text-2xl font-black text-slate-900 mt-2 font-mono">
                      KES {price.toLocaleString()} <span className="text-xs font-semibold text-slate-400">/{billingCycle === 'annual' ? 'yr' : 'mo'}</span>
                    </p>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {(p.features || []).map((f) => (
                      <li key={f} className="flex items-center gap-2"><CheckCircle2 size={13} className="text-amber-600 shrink-0" /> {f}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={saving || isCurrent}
                    onClick={() => handleSwitchPlan(p)}
                    className={`w-full py-2.5 rounded-xl text-xs font-black ${
                      isCurrent ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'bg-slate-900 hover:bg-amber-400 text-black'
                    }`}
                  >
                    {isCurrent ? 'Current Plan' : `Switch to ${p.name}`}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 font-black text-sm text-slate-900">Billing & Invoice History</div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 px-4 font-mono font-bold">{inv.invoice_number}</td>
                    <td className="py-3 px-4 uppercase font-bold">{inv.plan_id}</td>
                    <td className="py-3 px-4 text-slate-500">{new Date(inv.created_at).toLocaleDateString('en-KE')}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">KES {Number(inv.amount_kes || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 uppercase font-bold text-amber-700">{inv.status}</td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">No subscription invoices billed yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PAYSTACK SUB-ACCOUNT */}
      {subTab === 'paystack' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl p-4 text-xs">
            <div className="inline-flex bg-slate-100 rounded-xl p-1 font-bold">
              <button type="button" onClick={() => setPaystackSubTab('transactions')} className={`px-3 py-1 rounded-lg ${paystackSubTab === 'transactions' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>Transactions ({paystackTransactions.length})</button>
              <button type="button" onClick={() => setPaystackSubTab('payouts')} className={`px-3 py-1 rounded-lg ${paystackSubTab === 'payouts' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}>Payout Schedule</button>
            </div>
            <div className="text-slate-500">
              Payout Account: <strong className="text-slate-900">{payoutAcc.bank_name || 'Not configured'} {payoutAcc.account_number ? `(${payoutAcc.account_number})` : ''}</strong>
            </div>
          </div>

          {paystackSubTab === 'transactions' ? (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <tr>
                    <th className="py-3 px-4">Order / Ticket #</th>
                    <th className="py-3 px-4">Channel & Method</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paystackTransactions.slice(0, 60).map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 px-4 font-mono font-bold">#{o.ticket_number || String(o.id).slice(0, 8)}</td>
                      <td className="py-3 px-4">{o.sales_channel || o.order_channel || 'Online'} · {o.payment_method}</td>
                      <td className="py-3 px-4 text-slate-500">{new Date(o.created_at).toLocaleString('en-KE')}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">KES {Number(o.total_amount || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 uppercase font-bold">{o.payment_status || 'Settled'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-xs space-y-2 max-w-xl">
              <h3 className="text-sm font-black text-slate-900">Automated Payout Account & Frequency</h3>
              <p className="text-slate-500">Configured under Settings → Payment & Charges:</p>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <p><strong>Bank / Mobile Money:</strong> {payoutAcc.bank_name || 'Configure in Payment Settings'}</p>
                <p><strong>Account Number:</strong> <span className="font-mono">{payoutAcc.account_number || '—'}</span></p>
                <p><strong>Account Holder:</strong> {payoutAcc.account_name || restaurantName}</p>
                <p><strong>Payout Frequency:</strong> {payoutAcc.frequency || 'Daily (T+1)'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
