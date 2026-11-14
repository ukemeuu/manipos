import React, { useEffect, useState } from 'react';
import {
  CreditCard, Plus, Trash2, Save, Loader2, Percent, Truck, ShieldAlert,
  Building2, Clock, Check, Globe, Monitor, Smartphone
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DEFAULT_TENDERS } from '../../lib/orderCharges';
import { SlideOverDrawer } from './SlideOverDrawer';

const KENYA_BANKS_AND_WALLETS = [
  'KCB Bank Kenya',
  'Equity Bank Kenya',
  'Co-operative Bank of Kenya',
  'I&M Bank Kenya',
  'NCBA Bank Kenya',
  'Absa Bank Kenya',
  'Standard Chartered Kenya',
  'Stanbic Bank Kenya',
  'DTB (Diamond Trust Bank)',
  'Family Bank',
  'Prime Bank',
  'Bank of Baroda Kenya',
  'Citibank Kenya',
  'Guaranty Trust Bank (GTBank)',
  'Sidian Bank',
  'Gulf African Bank',
  'First Community Bank',
  'Credit Bank',
  'Victoria Commercial Bank',
  'M-PESA Paybill',
  'M-PESA Till',
  'Airtel Money Kenya',
];

const ORDER_METHODS = ['Delivery', 'Pickup', 'Dine In'];
const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600';
const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1';

export function OrderAndPaymentSettingsView({
  mode = 'payment-settings', // 'order-settings' | 'payment-settings'
  restaurantId,
  settings = {},
  onSettingsUpdated,
}) {
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  // Order Methods State
  const [orderCfg, setOrderCfg] = useState({
    delivery_enabled: true,
    pickup_enabled: true,
    dine_in_enabled: true,
    prep_time_minutes: 35,
    whatsapp_forwarding_enabled: false,
    whatsapp_forwarding_number: '',
    allow_negative_store_credit: false,
    void_completed_allowed: true,
    void_window_hours: 168,
    delivery_fee_brackets: [],
  });

  // Payment Tenders + Payout State
  const [tenders, setTenders] = useState(DEFAULT_TENDERS);
  const [customTenderModal, setCustomTenderModal] = useState(null);
  const [payout, setPayout] = useState({
    method: 'Bank Transfer',
    bank_name: 'I&M Bank Kenya',
    account_name: '',
    account_number: '',
    paybill_number: '',
    frequency: 'Daily',
    interval_hours: 24,
  });
  const [payoutFreqModal, setPayoutFreqModal] = useState(false);

  // Dynamic Charges State
  const [charges, setCharges] = useState([]);
  const [loadingCharges, setLoadingCharges] = useState(false);
  const [chargeDrawer, setChargeDrawer] = useState(null);

  useEffect(() => {
    setOrderCfg({
      delivery_enabled: settings.delivery_enabled !== false,
      pickup_enabled: settings.pickup_enabled !== false,
      dine_in_enabled: settings.dine_in_enabled !== false,
      prep_time_minutes: Number(settings.prep_time_minutes || 35),
      whatsapp_forwarding_enabled: Boolean(settings.whatsapp_forwarding_enabled),
      whatsapp_forwarding_number: settings.whatsapp_forwarding_number || '',
      allow_negative_store_credit: Boolean(settings.allow_negative_store_credit),
      void_completed_allowed: settings.void_completed_allowed !== false,
      void_window_hours: Number(settings.void_window_hours ?? 168),
      delivery_fee_brackets: Array.isArray(settings.delivery_fee_brackets) ? settings.delivery_fee_brackets : [],
    });

    if (Array.isArray(settings.payment_tenders_config) && settings.payment_tenders_config.length > 0) {
      setTenders(settings.payment_tenders_config);
    } else {
      setTenders(DEFAULT_TENDERS);
    }

    if (settings.payout_account && typeof settings.payout_account === 'object') {
      setPayout((prev) => ({ ...prev, ...settings.payout_account }));
    }
  }, [settings]);

  const loadCharges = async () => {
    if (!restaurantId) return;
    setLoadingCharges(true);
    try {
      const { data, error } = await supabase
        .from('order_charges')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) setCharges(data);
    } catch (_) {}
    setLoadingCharges(false);
  };

  useEffect(() => {
    loadCharges();
  }, [restaurantId]);

  const persistSettingsPatch = async (patch, successMessage) => {
    if (!restaurantId) return;
    setSaving(true);
    setNotice('');
    try {
      const { error } = await supabase
        .from('restaurant_settings')
        .update(patch)
        .eq('restaurant_id', restaurantId);
      if (error) {
        if (String(error.message || '').toLowerCase().includes('column')) {
          throw new Error('Please run Wave 2 migration (20261113_wave2_finance_reports.sql) in Supabase first.');
        }
        throw error;
      }
      if (onSettingsUpdated) onSettingsUpdated(patch);
      setNotice(successMessage);
    } catch (err) {
      alert(err.message || 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCharge = async (e) => {
    e.preventDefault();
    if (!restaurantId || !chargeDrawer?.title?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        title: chargeDrawer.title.trim().slice(0, 30),
        charge_type: chargeDrawer.charge_type || 'percent',
        charge_value: Number(chargeDrawer.charge_value || 0),
        is_tax_charge: Boolean(chargeDrawer.is_tax_charge),
        order_methods: chargeDrawer.order_methods || [],
        payment_methods: chargeDrawer.payment_methods || [],
        is_active: chargeDrawer.is_active !== false,
      };
      const res = chargeDrawer.id
        ? await supabase.from('order_charges').update(payload).eq('id', chargeDrawer.id).eq('restaurant_id', restaurantId)
        : await supabase.from('order_charges').insert([payload]);
      if (res.error) throw res.error;
      setChargeDrawer(null);
      await loadCharges();
    } catch (err) {
      alert(err.message || 'Failed to save charge.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCharge = async (id) => {
    if (!window.confirm('Delete this charge rule?')) return;
    await supabase.from('order_charges').delete().eq('id', id).eq('restaurant_id', restaurantId);
    await loadCharges();
  };

  if (mode === 'order-settings') {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h2 className="text-xl font-black text-slate-900">Order Methods, Delivery Tiers & Void Controls</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Orda `/settings/orders` parity: fulfillment availability, prep duration, distance fee tiers, and void rules.
          </p>
        </div>

        {notice && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
            {notice}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-xs">
          <div>
            <h3 className="text-sm font-black text-slate-900 mb-3">1. Fulfillment Methods & Storefront Rules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: 'delivery_enabled', label: 'Enable Delivery' },
                { key: 'pickup_enabled', label: 'Enable Pickup' },
                { key: 'dine_in_enabled', label: 'Enable Dine In' },
              ].map((t) => (
                <label key={t.key} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <span className="text-xs font-bold text-slate-800">{t.label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(orderCfg[t.key])}
                    onChange={(e) => setOrderCfg((p) => ({ ...p, [t.key]: e.target.checked }))}
                    className="rounded text-emerald-700"
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div>
                <label className={labelCls}>Average Preparation Time (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  value={orderCfg.prep_time_minutes}
                  onChange={(e) => setOrderCfg((p) => ({ ...p, prep_time_minutes: Number(e.target.value || 0) }))}
                  className={inputCls}
                />
              </div>
              <div className="flex items-end">
                <label className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <span className="text-xs font-bold text-slate-800">Allow Negative Store Credit Orders</span>
                  <input
                    type="checkbox"
                    checked={orderCfg.allow_negative_store_credit}
                    onChange={(e) => setOrderCfg((p) => ({ ...p, allow_negative_store_credit: e.target.checked }))}
                    className="rounded text-emerald-700"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-sm font-black text-slate-900">2. WhatsApp Order Forwarding</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <span className="text-xs font-bold text-slate-800">Forward Microsite Orders via WhatsApp</span>
                <input
                  type="checkbox"
                  checked={orderCfg.whatsapp_forwarding_enabled}
                  onChange={(e) => setOrderCfg((p) => ({ ...p, whatsapp_forwarding_enabled: e.target.checked }))}
                  className="rounded text-emerald-700"
                />
              </label>
              <div>
                <label className={labelCls}>Forwarding WhatsApp Phone</label>
                <input
                  type="text"
                  placeholder="+2547..."
                  value={orderCfg.whatsapp_forwarding_number}
                  onChange={(e) => setOrderCfg((p) => ({ ...p, whatsapp_forwarding_number: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">3. Distance Delivery Fee Brackets (`Set Delivery Charge`)</h3>
                <p className="text-[11px] text-slate-500">Tiered delivery pricing in KES matched by km radius from store.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setOrderCfg((p) => ({
                    ...p,
                    delivery_fee_brackets: [
                      ...(p.delivery_fee_brackets || []),
                      { caption: 'Zone Tier', from_km: 0, to_km: 5, rate: 150 },
                    ],
                  }))
                }
                className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1"
              >
                <Plus size={13} /> Add Bracket
              </button>
            </div>

            {orderCfg.delivery_fee_brackets.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No tiered distance brackets defined yet.</p>
            ) : (
              <div className="space-y-2">
                {orderCfg.delivery_fee_brackets.map((br, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <input
                      type="text"
                      placeholder="Caption"
                      value={br.caption || ''}
                      onChange={(e) => {
                        const next = [...orderCfg.delivery_fee_brackets];
                        next[idx] = { ...next[idx], caption: e.target.value };
                        setOrderCfg((p) => ({ ...p, delivery_fee_brackets: next }));
                      }}
                      className="col-span-4 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="From km"
                      value={br.from_km ?? 0}
                      onChange={(e) => {
                        const next = [...orderCfg.delivery_fee_brackets];
                        next[idx] = { ...next[idx], from_km: Number(e.target.value || 0) };
                        setOrderCfg((p) => ({ ...p, delivery_fee_brackets: next }));
                      }}
                      className="col-span-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="To km"
                      value={br.to_km ?? 5}
                      onChange={(e) => {
                        const next = [...orderCfg.delivery_fee_brackets];
                        next[idx] = { ...next[idx], to_km: Number(e.target.value || 0) };
                        setOrderCfg((p) => ({ ...p, delivery_fee_brackets: next }));
                      }}
                      className="col-span-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="KES"
                      value={br.rate ?? 0}
                      onChange={(e) => {
                        const next = [...orderCfg.delivery_fee_brackets];
                        next[idx] = { ...next[idx], rate: Number(e.target.value || 0) };
                        setOrderCfg((p) => ({ ...p, delivery_fee_brackets: next }));
                      }}
                      className="col-span-3 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setOrderCfg((p) => ({
                          ...p,
                          delivery_fee_brackets: p.delivery_fee_brackets.filter((_, i) => i !== idx),
                        }))
                      }
                      className="col-span-1 text-rose-500 hover:text-rose-700 flex justify-center"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <ShieldAlert size={15} className="text-amber-600" /> 4. Void Completed Order Policy
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <span className="text-xs font-bold text-slate-800">Allow Voiding Completed Orders</span>
                <input
                  type="checkbox"
                  checked={orderCfg.void_completed_allowed}
                  onChange={(e) => setOrderCfg((p) => ({ ...p, void_completed_allowed: e.target.checked }))}
                  className="rounded text-emerald-700"
                />
              </label>
              <div>
                <label className={labelCls}>Void Window in Hours (Orda default: 168 hrs)</label>
                <input
                  type="number"
                  min="1"
                  value={orderCfg.void_window_hours}
                  onChange={(e) => setOrderCfg((p) => ({ ...p, void_window_hours: Number(e.target.value || 168) }))}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => persistSettingsPatch(orderCfg, 'Order Methods & Void settings saved.')}
            className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Order Settings
          </button>
        </div>
      </div>
    );
  }

  // PAYMENT SETTINGS & DYNAMIC ADDITIONAL CHARGES
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-black text-slate-900">Payment Settings, Tenders Matrix & Additional Charges</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Orda `/settings/payment` parity: POS vs Microsite tenders, tax/service charge rules, and settlement payout account.
        </p>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
          {notice}
        </div>
      )}

      {/* 1. POS vs Microsite Payment Tender Matrix */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">1. Payment Methods (Available on POS vs Microsite)</h3>
            <p className="text-xs text-slate-500">Control independently which tenders appear on Web/POS vs Customer Storefront.</p>
          </div>
          <button
            type="button"
            onClick={() => setCustomTenderModal({ name: '', code: '', pos_enabled: true, microsite_enabled: false })}
            className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Payment
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Tender Name</th>
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4 text-center">Available on POS</th>
                <th className="py-2.5 px-4 text-center">Available on Microsite</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenders.map((t, idx) => (
                <tr key={t.code} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-bold text-slate-900">{t.name}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500">{t.code}</td>
                  <td className="py-2.5 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(t.pos_enabled)}
                      onChange={(e) =>
                        setTenders((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, pos_enabled: e.target.checked } : row))
                        )
                      }
                      className="rounded text-emerald-700"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(t.microsite_enabled)}
                      onChange={(e) =>
                        setTenders((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, microsite_enabled: e.target.checked } : row))
                        )
                      }
                      className="rounded text-emerald-700"
                    />
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {t.is_custom && (
                      <button
                        type="button"
                        onClick={() => setTenders((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() =>
            persistSettingsPatch(
              {
                payment_tenders_config: tenders,
                enabled_payment_methods: tenders.filter((t) => t.pos_enabled).map((t) => t.code),
              },
              'Payment tender visibility matrix saved.'
            )
          }
          className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black inline-flex items-center gap-1.5"
        >
          <Save size={14} /> Save Tender Matrix
        </button>
      </div>

      {/* 2. Dynamic Additional Charges & Taxes Engine */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">2. Additional Charges & Tax Rules</h3>
            <p className="text-xs text-slate-500">
              Configure VAT (16%), Catering Levy (2%), Packaging Fee, or Service Charges scoped by order & payment method.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setChargeDrawer({
                title: '',
                charge_type: 'percent',
                charge_value: 16,
                is_tax_charge: true,
                order_methods: [],
                payment_methods: [],
                is_active: true,
              })
            }
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Charge Rule
          </button>
        </div>

        {loadingCharges ? (
          <div className="py-6 text-xs text-slate-400">Loading charge rules...</div>
        ) : charges.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            No dynamic charges configured yet. Click "+ Add Charge Rule" to create VAT, Levy, or Service Charges.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {charges.map((ch) => (
              <div key={ch.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-900">{ch.title}</span>
                    {ch.is_tax_charge && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Tax Charge
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-emerald-700 mt-1">
                    {ch.charge_type === 'percent' ? `${ch.charge_value}%` : `KES ${Number(ch.charge_value).toLocaleString()} fixed`}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Orders: {ch.order_methods?.length ? ch.order_methods.join(', ') : 'All'} · Tenders:{' '}
                    {ch.payment_methods?.length ? ch.payment_methods.join(', ') : 'All'}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 items-end">
                  <button
                    type="button"
                    onClick={() => setChargeDrawer(ch)}
                    className="text-xs font-bold text-slate-700 hover:text-emerald-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCharge(ch.id)}
                    className="text-xs font-bold text-rose-500 hover:text-rose-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Payout Account & Frequency */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">3. Settlement Payout Account & Frequency</h3>
            <p className="text-xs text-slate-500">Destination bank or mobile wallet for online Microsite/Paystack settlements.</p>
          </div>
          <button
            type="button"
            onClick={() => setPayoutFreqModal(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800 flex items-center gap-1.5"
          >
            <Clock size={13} /> Payout Frequency: {payout.frequency || 'Daily'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Bank / Mobile Network</label>
            <select
              value={payout.bank_name || ''}
              onChange={(e) => setPayout((p) => ({ ...p, bank_name: e.target.value }))}
              className={inputCls}
            >
              {KENYA_BANKS_AND_WALLETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Account Holder Name</label>
            <input
              type="text"
              value={payout.account_name || ''}
              onChange={(e) => setPayout((p) => ({ ...p, account_name: e.target.value }))}
              placeholder="e.g. Pot of Jollof Ltd"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Account / Paybill Number</label>
            <input
              type="text"
              value={payout.account_number || ''}
              onChange={(e) => setPayout((p) => ({ ...p, account_number: e.target.value }))}
              placeholder="e.g. 992422"
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => persistSettingsPatch({ payout_account: payout }, 'Settlement payout account saved.')}
          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black inline-flex items-center gap-1.5"
        >
          <Save size={14} /> Save Payout Account
        </button>
      </div>

      {/* Add/Edit Charge Drawer */}
      <SlideOverDrawer
        open={Boolean(chargeDrawer)}
        onClose={() => setChargeDrawer(null)}
        title={chargeDrawer?.id ? 'Edit Additional Charge' : 'New Additional Charge'}
        subtitle="Max 30 characters. Scoped dynamically on Web POS & Microsite."
      >
        {chargeDrawer && (
          <form onSubmit={handleSaveCharge} className="space-y-4">
            <div>
              <label className={labelCls}>Charge Name (Max 30 chars)</label>
              <input
                type="text"
                required
                maxLength={30}
                value={chargeDrawer.title}
                onChange={(e) => setChargeDrawer((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. VAT 16% or Catering Levy"
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Calculation Type</label>
                <select
                  value={chargeDrawer.charge_type}
                  onChange={(e) => setChargeDrawer((p) => ({ ...p, charge_type: e.target.value }))}
                  className={inputCls}
                >
                  <option value="percent">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (KES)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Value</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={chargeDrawer.charge_value}
                  onChange={(e) => setChargeDrawer((p) => ({ ...p, charge_value: Number(e.target.value || 0) }))}
                  className={inputCls}
                />
              </div>
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
              <span className="text-xs font-bold text-slate-800">Count as Tax Charge (exempts `Exclude from Tax` items)</span>
              <input
                type="checkbox"
                checked={Boolean(chargeDrawer.is_tax_charge)}
                onChange={(e) => setChargeDrawer((p) => ({ ...p, is_tax_charge: e.target.checked }))}
                className="rounded text-emerald-700"
              />
            </label>

            <div>
              <label className={labelCls}>Order Methods Scope (leave empty for All)</label>
              <div className="flex flex-wrap gap-2">
                {ORDER_METHODS.map((om) => {
                  const checked = (chargeDrawer.order_methods || []).includes(om);
                  return (
                    <label key={om} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setChargeDrawer((p) => ({
                            ...p,
                            order_methods: checked
                              ? (p.order_methods || []).filter((x) => x !== om)
                              : [...(p.order_methods || []), om],
                          }))
                        }
                      />
                      {om}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className={labelCls}>Payment Methods Scope (leave empty for All)</label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
                {tenders.map((t) => {
                  const checked = (chargeDrawer.payment_methods || []).includes(t.code);
                  return (
                    <label key={t.code} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setChargeDrawer((p) => ({
                            ...p,
                            payment_methods: checked
                              ? (p.payment_methods || []).filter((x) => x !== t.code)
                              : [...(p.payment_methods || []), t.code],
                          }))
                        }
                      />
                      {t.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black"
            >
              {saving ? 'Saving...' : 'Save Additional Charge'}
            </button>
          </form>
        )}
      </SlideOverDrawer>

      {/* Custom Tender Modal */}
      {customTenderModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-black text-slate-900">Add Custom Payment Tender</h3>
            <div>
              <label className={labelCls}>Payment Name</label>
              <input
                type="text"
                value={customTenderModal.name}
                onChange={(e) => setCustomTenderModal((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. MPESA TILL 5329489"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Payment Code</label>
              <input
                type="text"
                value={customTenderModal.code}
                onChange={(e) => setCustomTenderModal((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. TILL_5329489"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={customTenderModal.pos_enabled}
                  onChange={(e) => setCustomTenderModal((p) => ({ ...p, pos_enabled: e.target.checked }))}
                />
                Available on POS
              </label>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={customTenderModal.microsite_enabled}
                  onChange={(e) => setCustomTenderModal((p) => ({ ...p, microsite_enabled: e.target.checked }))}
                />
                Available on Microsite
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCustomTenderModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!customTenderModal.name.trim()) return;
                  const code = customTenderModal.code.trim() || customTenderModal.name.trim().toUpperCase();
                  setTenders((prev) => [...prev, { ...customTenderModal, code, is_custom: true }]);
                  setCustomTenderModal(null);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black"
              >
                Add to Matrix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payout Frequency Modal */}
      {payoutFreqModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-black text-slate-900">Edit Payout Frequency</h3>
            <div>
              <label className={labelCls}>Schedule</label>
              <select
                value={payout.frequency}
                onChange={(e) => setPayout((p) => ({ ...p, frequency: e.target.value }))}
                className={inputCls}
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Settlement Interval (Hours)</label>
              <input
                type="number"
                min="1"
                value={payout.interval_hours || 24}
                onChange={(e) => setPayout((p) => ({ ...p, interval_hours: Number(e.target.value || 24) }))}
                className={inputCls}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayoutFreqModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
