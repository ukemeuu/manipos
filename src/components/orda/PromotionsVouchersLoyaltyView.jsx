import React, { useEffect, useState } from 'react';
import {
  Tag, Gift, Award, Plus, Trash2, Edit3, CheckCircle2, X, Power, Copy, Users
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SlideOverDrawer } from './SlideOverDrawer';

const PROMO_RULES = [
  { id: 'cart_percent', label: 'Percentage Discount On Cart (Subtotal)' },
  { id: 'cart_fixed', label: 'Fixed Discount On Cart' },
  { id: 'delivery_percent', label: 'Percentage Discount On Delivery' },
  { id: 'grand_total_percent', label: 'Percentage Discount On Cart Total (Grand Total)' },
  { id: 'product_percent', label: 'Percentage Discount On Specific Products' },
  { id: 'product_fixed', label: 'Fixed Discount On Specific Products' },
  { id: 'loyalty', label: 'Loyalty Program' },
];

const PRODUCT_RULES = new Set(['product_percent', 'product_fixed']);

const FULFILMENT_OPTIONS = ['Pickup', 'Delivery', 'Dine In'];
const PAYMENT_OPTIONS = ['Cash', 'MPESA Paybill', 'MPESA TILL', 'CARD', 'Paid to App', 'Store Credit', 'Transfer'];

function randomCode(prefix = 'MANI') {
  return `${prefix}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function PromotionsVouchersLoyaltyView({
  mode = 'promotions', // 'promotions' | 'vouchers' | 'loyalty'
  restaurantId,
  discounts = [],
  menuItems = [],
  onDiscountsChanged,
}) {
  const [subTab, setSubTab] = useState(mode);
  useEffect(() => {
    setSubTab(mode);
  }, [mode]);

  const [vouchers, setVouchers] = useState([]);
  const [loyaltyPrograms, setLoyaltyPrograms] = useState([]);
  const [notice, setNotice] = useState('');

  // Promotion drawer state
  const [promoDrawer, setPromoDrawer] = useState(null);
  const [promoForm, setPromoForm] = useState({
    name: '',
    description: '',
    promo_rule_type: 'cart_percent',
    scope: 'bill',
    menu_item_ids: [],
    value: '10',
    has_min_order: false,
    min_order_amount: '',
    has_max_discount: false,
    max_discount_value: '',
    specify_fulfilment: false,
    fulfilment_types: [],
    specify_payment: false,
    payment_options: [],
    has_usage_per_customer: false,
    usage_per_customer: '1',
    use_custom_code: true,
    code: '',
    has_max_uses: false,
    max_total_uses: '100',
    starts_at: '',
    has_expiry: false,
    expires_at: '',
    is_active: true,
    influencer_name: '',
    influencer_id: null,
  });

  // Voucher drawer state
  const [voucherDrawer, setVoucherDrawer] = useState(false);
  const [voucherForm, setVoucherForm] = useState({
    name: '',
    code: randomCode('VCH'),
    description: '',
    starts_at: '',
    amount: '1000',
    has_expiry: false,
    expires_at: '',
  });

  // Loyalty drawer state
  const [loyaltyDrawer, setLoyaltyDrawer] = useState(false);
  const [loyaltyForm, setLoyaltyForm] = useState({
    name: '',
    description: '',
    starts_at: '',
    has_expiry: false,
    expires_at: '',
    rate_amount: '100',
    points_per_unit: '1',
    min_order_value: '0',
    specify_fulfilment: false,
    fulfilment_types: [],
    specify_payment: false,
    payment_options: [],
    enable_menu_category: false,
    category_names: [],
  });

  const [saving, setSaving] = useState(false);

  const uniqueCategories = Array.from(
    new Set(menuItems.map((m) => m.category).filter(Boolean))
  );

  const loadExtraData = async () => {
    if (!restaurantId) return;
    try {
      const [vRes, lRes] = await Promise.all([
        supabase
          .from('vouchers')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('loyalty_programs')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: false }),
      ]);
      if (!vRes.error) setVouchers(vRes.data || []);
      if (!lRes.error) setLoyaltyPrograms(lRes.data || []);
    } catch (err) {
      console.warn('Wave 3 promo extra load:', err);
    }
  };

  useEffect(() => {
    loadExtraData();
  }, [restaurantId]);

  const openPromoDrawer = (existing = null) => {
    if (existing) {
      setPromoDrawer(existing);
      const fList = Array.isArray(existing.fulfilment_types) ? existing.fulfilment_types : [];
      const pList = Array.isArray(existing.payment_options) ? existing.payment_options : [];
      setPromoForm({
        name: existing.name || existing.code || '',
        description: existing.description || '',
        promo_rule_type: existing.promo_rule_type || (existing.type === 'fixed' ? 'cart_fixed' : 'cart_percent'),
        scope: existing.scope || (PRODUCT_RULES.has(existing.promo_rule_type) ? 'product' : 'bill'),
        menu_item_ids: Array.isArray(existing.menu_item_ids) ? existing.menu_item_ids : [],
        value: String(existing.value ?? existing.discount_percent ?? existing.discount_amount ?? 10),
        has_min_order: Number(existing.min_order_amount || 0) > 0,
        min_order_amount: String(existing.min_order_amount || ''),
        has_max_discount: Number(existing.max_discount_value || 0) > 0,
        max_discount_value: String(existing.max_discount_value || ''),
        specify_fulfilment: fList.length > 0,
        fulfilment_types: fList,
        specify_payment: pList.length > 0,
        payment_options: pList,
        has_usage_per_customer: Number(existing.usage_per_customer || 0) > 0,
        usage_per_customer: String(existing.usage_per_customer || '1'),
        use_custom_code: existing.use_custom_code !== false,
        code: existing.code || '',
        has_max_uses: Number(existing.max_total_uses || 0) > 0,
        max_total_uses: String(existing.max_total_uses || '100'),
        starts_at: existing.starts_at ? existing.starts_at.slice(0, 16) : '',
        has_expiry: Boolean(existing.has_expiry || existing.expires_at),
        expires_at: existing.expires_at ? existing.expires_at.slice(0, 16) : '',
        is_active: existing.is_active !== false,
        influencer_name: existing.influencer_name || '',
        influencer_id: existing.influencer_id || null,
      });
    } else {
      setPromoDrawer('new');
      setPromoForm({
        name: '',
        description: '',
        promo_rule_type: 'cart_percent',
        scope: 'bill',
        menu_item_ids: [],
        value: '10',
        has_min_order: false,
        min_order_amount: '',
        has_max_discount: false,
        max_discount_value: '',
        specify_fulfilment: false,
        fulfilment_types: [],
        specify_payment: false,
        payment_options: [],
        has_usage_per_customer: false,
        usage_per_customer: '1',
        use_custom_code: true,
        code: randomCode('PROMO'),
        has_max_uses: false,
        max_total_uses: '100',
        starts_at: '',
        has_expiry: false,
        expires_at: '',
        is_active: true,
        influencer_name: '',
        influencer_id: null,
      });
    }
  };

  const savePromotion = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaving(true);
    try {
      const rule = promoForm.promo_rule_type;
      const numericVal = Number(promoForm.value || 0);
      const isFixed = rule === 'cart_fixed';
      const generatedCode = promoForm.use_custom_code
        ? (promoForm.code.trim().toUpperCase() || randomCode('PROMO'))
        : randomCode('AUTO');

      const payload = {
        restaurant_id: restaurantId,
        name: promoForm.name.trim() || generatedCode,
        description: promoForm.description.trim() || null,
        code: generatedCode,
        type: isFixed ? 'fixed' : 'percentage',
        value: numericVal,
        discount_percent: isFixed ? null : numericVal,
        discount_amount: isFixed ? numericVal : null,
        min_order_amount: promoForm.has_min_order ? Number(promoForm.min_order_amount || 0) : 0,
        is_active: promoForm.is_active,
        starts_at: promoForm.starts_at ? new Date(promoForm.starts_at).toISOString() : null,
        has_expiry: promoForm.has_expiry,
        expires_at: promoForm.has_expiry && promoForm.expires_at ? new Date(promoForm.expires_at).toISOString() : null,
        promo_rule_type: rule,
        max_discount_value: !isFixed && promoForm.has_max_discount ? Number(promoForm.max_discount_value || 0) : null,
        fulfilment_types: promoForm.specify_fulfilment ? promoForm.fulfilment_types : [],
        payment_options: promoForm.specify_payment ? promoForm.payment_options : [],
        usage_per_customer: promoForm.has_usage_per_customer ? Number(promoForm.usage_per_customer || 1) : null,
        max_total_uses: promoForm.has_max_uses ? Number(promoForm.max_total_uses || 1) : null,
        use_custom_code: promoForm.use_custom_code,
        scope: PRODUCT_RULES.has(rule) ? 'product' : 'bill',
        menu_item_ids: PRODUCT_RULES.has(rule) ? (promoForm.menu_item_ids || []) : [],
      };

      const runWrite = async (obj) => {
        if (promoDrawer && promoDrawer !== 'new' && promoDrawer.id) {
          return supabase.from('pos_discounts').update(obj).eq('id', promoDrawer.id).eq('restaurant_id', restaurantId);
        }
        return supabase.from('pos_discounts').insert([obj]);
      };

      let res = await runWrite(payload);
      if (res.error) {
        const msg = String(res.error.message || '').toLowerCase();
        if (msg.includes('promo_rule_type') || msg.includes('max_discount_value') || msg.includes('fulfilment_types') || msg.includes('scope') || msg.includes('menu_item_ids')) {
          const core = {
            restaurant_id: restaurantId,
            name: payload.name,
            description: payload.description,
            code: payload.code,
            type: payload.type,
            value: payload.value,
            discount_percent: payload.discount_percent,
            discount_amount: payload.discount_amount,
            min_order_amount: payload.min_order_amount,
            is_active: payload.is_active,
            expires_at: payload.expires_at,
          };
          res = await runWrite(core);
        }
      }
      if (res.error) throw res.error;
      setPromoDrawer(null);
      setNotice('Promotion saved.');
      await onDiscountsChanged?.();
    } catch (err) {
      alert('Failed to save promotion: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const toggleDiscountActive = async (d) => {
    const { error } = await supabase
      .from('pos_discounts')
      .update({ is_active: d.is_active === false })
      .eq('id', d.id)
      .eq('restaurant_id', restaurantId);
    if (!error) await onDiscountsChanged?.();
  };

  const deleteDiscount = async (d) => {
    if (!window.confirm(`Delete promotion "${d.name || d.code}"?`)) return;
    const { error } = await supabase
      .from('pos_discounts')
      .delete()
      .eq('id', d.id)
      .eq('restaurant_id', restaurantId);
    if (!error) await onDiscountsChanged?.();
  };

  const saveVoucher = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaving(true);
    try {
      const amt = Number(voucherForm.amount || 0);
      const { error } = await supabase.from('vouchers').insert([
        {
          restaurant_id: restaurantId,
          name: voucherForm.name.trim(),
          code: voucherForm.code.trim().toUpperCase() || randomCode('VCH'),
          description: voucherForm.description.trim() || null,
          amount: amt,
          remaining_amount: amt,
          starts_at: voucherForm.starts_at ? new Date(voucherForm.starts_at).toISOString() : null,
          has_expiry: voucherForm.has_expiry,
          expires_at: voucherForm.has_expiry && voucherForm.expires_at ? new Date(voucherForm.expires_at).toISOString() : null,
          is_active: true,
        },
      ]);
      if (error) throw error;
      setVoucherDrawer(false);
      setVoucherForm({ name: '', code: randomCode('VCH'), description: '', starts_at: '', amount: '1000', has_expiry: false, expires_at: '' });
      setNotice('Voucher created.');
      await loadExtraData();
    } catch (err) {
      alert('Could not create voucher (apply Wave 3 migration first if table missing): ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const saveLoyaltyProgram = async (e) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('loyalty_programs').insert([
        {
          restaurant_id: restaurantId,
          name: loyaltyForm.name.trim(),
          description: loyaltyForm.description.trim() || null,
          starts_at: loyaltyForm.starts_at ? new Date(loyaltyForm.starts_at).toISOString() : null,
          has_expiry: loyaltyForm.has_expiry,
          expires_at: loyaltyForm.has_expiry && loyaltyForm.expires_at ? new Date(loyaltyForm.expires_at).toISOString() : null,
          rate_amount: Number(loyaltyForm.rate_amount || 100),
          points_per_unit: Number(loyaltyForm.points_per_unit || 1),
          min_order_value: Number(loyaltyForm.min_order_value || 0),
          fulfilment_types: loyaltyForm.specify_fulfilment ? loyaltyForm.fulfilment_types : [],
          payment_options: loyaltyForm.specify_payment ? loyaltyForm.payment_options : [],
          enable_menu_category: loyaltyForm.enable_menu_category,
          category_names: loyaltyForm.enable_menu_category ? loyaltyForm.category_names : [],
          is_active: true,
        },
      ]);
      if (error) throw error;
      setLoyaltyDrawer(false);
      setNotice('Loyalty Program created.');
      await loadExtraData();
    } catch (err) {
      alert('Could not create loyalty program: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayItem = (arr, item) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">Growth, Promotions & Loyalty</h2>
            <div className="inline-flex bg-slate-100 rounded-xl p-0.5 text-xs font-bold">
              {[
                { id: 'promotions', label: 'Promotions (5 Rules)' },
                { id: 'vouchers', label: 'Vouchers' },
                { id: 'loyalty', label: 'Loyalty Programs' },
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
            5 Orda promotion rule types, conditional restrictions, KES vouchers, loyalty earn rules, and preserved ManiPOS creator tracking.
          </p>
        </div>

        <div>
          {subTab === 'promotions' && (
            <button
              type="button"
              onClick={() => openPromoDrawer(null)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black"
            >
              <Plus size={14} /> Add New Promotion
            </button>
          )}
          {subTab === 'vouchers' && (
            <button
              type="button"
              onClick={() => setVoucherDrawer(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black"
            >
              <Plus size={14} /> Add New Voucher
            </button>
          )}
          {subTab === 'loyalty' && (
            <button
              type="button"
              onClick={() => setLoyaltyDrawer(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black"
            >
              <Plus size={14} /> Add Loyalty Program
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="bg-amber-50 border border-amber-200 text-slate-900 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="hover:underline">Dismiss</button>
        </div>
      )}

      {/* TAB 1: PROMOTIONS */}
      {subTab === 'promotions' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Promotion & Code</th>
                  <th className="py-3 px-4">Rule Type</th>
                  <th className="py-3 px-4 text-right">Value</th>
                  <th className="py-3 px-4">Conditions / Restrictions</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {discounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No promotions yet. Click <strong>Add New Promotion</strong> above.
                    </td>
                  </tr>
                ) : (
                  discounts.map((d) => {
                    const ruleLabel =
                      PROMO_RULES.find((r) => r.id === d.promo_rule_type)?.label ||
                      (d.type === 'fixed' ? 'Fixed Discount On Cart' : 'Percentage Discount On Cart (Subtotal)');
                    const valNum = Number(d.value ?? d.discount_percent ?? d.discount_amount ?? 0);
                    return (
                      <tr key={d.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{d.name || d.code}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[11px] bg-amber-50 text-slate-900 px-2 py-0.5 rounded font-bold">
                              {d.code}
                            </span>
                            {d.influencer_name && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                <Users size={10} /> Creator: {d.influencer_name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{ruleLabel}</td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                          {d.type === 'fixed' ? `KES ${valNum.toLocaleString()}` : `${valNum}%`}
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-500">
                          {[
                            Number(d.min_order_amount || 0) > 0 ? `Min: KES ${Number(d.min_order_amount).toLocaleString()}` : '',
                            Number(d.max_discount_value || 0) > 0 ? `Cap: KES ${Number(d.max_discount_value).toLocaleString()}` : '',
                            Array.isArray(d.fulfilment_types) && d.fulfilment_types.length > 0 ? d.fulfilment_types.join('/') : '',
                            d.expires_at ? `Exp: ${new Date(d.expires_at).toLocaleDateString('en-KE')}` : 'No expiry',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => toggleDiscountActive(d)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              d.is_active !== false
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-slate-100 border-slate-200 text-slate-500'
                            }`}
                          >
                            {d.is_active !== false ? 'Active' : 'Paused'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openPromoDrawer(d)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                              title="Edit"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDiscount(d)}
                              className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: VOUCHERS */}
      {subTab === 'vouchers' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Voucher Name</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4 text-right">Value</th>
                  <th className="py-3 px-4 text-right">Remaining</th>
                  <th className="py-3 px-4">Validity</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vouchers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No vouchers issued yet. Create gift or compensation vouchers redeemable with the Voucher tender.
                    </td>
                  </tr>
                ) : (
                  vouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{v.name}</p>
                        {v.description && <p className="text-[11px] text-slate-400">{v.description}</p>}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-amber-700">{v.code}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold">KES {Number(v.amount || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">KES {Number(v.remaining_amount ?? v.amount ?? 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {v.has_expiry && v.expires_at ? `Expires ${new Date(v.expires_at).toLocaleDateString('en-KE')}` : 'No expiry'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          v.is_redeemed
                            ? 'bg-slate-100 border-slate-200 text-slate-500'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                          {v.is_redeemed ? 'Redeemed' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LOYALTY PROGRAMS */}
      {subTab === 'loyalty' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Program Name</th>
                  <th className="py-3 px-4">Earn Rate</th>
                  <th className="py-3 px-4 text-right">Min Order</th>
                  <th className="py-3 px-4">Restrictions</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loyaltyPrograms.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No loyalty earn rules configured yet.
                    </td>
                  </tr>
                ) : (
                  loyaltyPrograms.map((lp) => (
                    <tr key={lp.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{lp.name}</p>
                        {lp.description && <p className="text-[11px] text-slate-400">{lp.description}</p>}
                      </td>
                      <td className="py-3 px-4 font-bold text-amber-700">
                        {lp.points_per_unit || 1} pt per KES {Number(lp.rate_amount || 100).toLocaleString()} spent
                      </td>
                      <td className="py-3 px-4 text-right font-mono">KES {Number(lp.min_order_value || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {[
                          Array.isArray(lp.fulfilment_types) && lp.fulfilment_types.length > 0 ? lp.fulfilment_types.join('/') : 'All Fulfilments',
                          lp.enable_menu_category && Array.isArray(lp.category_names) && lp.category_names.length > 0 ? `Categories: ${lp.category_names.join(', ')}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          lp.is_active !== false ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {lp.is_active !== false ? 'Active' : 'Paused'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Promotion Create / Edit Drawer */}
      <SlideOverDrawer
        open={Boolean(promoDrawer)}
        onClose={() => setPromoDrawer(null)}
        title={promoDrawer === 'new' ? 'Create Promotion' : 'Edit Promotion'}
        subtitle="Configure Orda 5-type rule, conditional caps, fulfilment & payment constraints"
      >
        <form onSubmit={savePromotion} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Promotion Name *</label>
            <input
              type="text"
              required
              value={promoForm.name}
              onChange={(e) => setPromoForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Friday Lunch 15% Off"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-600 mb-1">Promotion Type</label>
            <select
              value={promoForm.promo_rule_type}
              onChange={(e) => setPromoForm((p) => ({ ...p, promo_rule_type: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold"
            >
              {PROMO_RULES.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>

          {PRODUCT_RULES.has(promoForm.promo_rule_type) && (
            <div>
              <label className="block font-bold text-slate-600 mb-1">Apply to Products *</label>
              <p className="text-[11px] text-slate-400 mb-2">Only the selected items receive this discount.</p>
              <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
                {menuItems.length === 0 && <p className="text-xs text-slate-400 px-3 py-4 text-center">No menu items.</p>}
                {menuItems.map((m) => {
                  const checked = (promoForm.menu_item_ids || []).includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setPromoForm((p) => ({
                          ...p,
                          menu_item_ids: e.target.checked
                            ? [...(p.menu_item_ids || []), m.id]
                            : (p.menu_item_ids || []).filter((id) => id !== m.id),
                        }))}
                        className="accent-emerald-700 w-4 h-4"
                      />
                      <span className="text-slate-800">{m.name}</span>
                      <span className="text-slate-400 text-[11px] ml-auto">{m.category}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1">
                {promoForm.promo_rule_type === 'cart_fixed' ? 'Discount Amount (KES) *' : 'Discount Percentage (%) *'}
              </label>
              <input
                type="number"
                required
                min="1"
                step="any"
                value={promoForm.value}
                onChange={(e) => setPromoForm((p) => ({ ...p, value: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Description</label>
              <input
                type="text"
                value={promoForm.description}
                onChange={(e) => setPromoForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>
          </div>

          <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <label className="flex items-center gap-2 font-bold text-slate-800">
              <input
                type="checkbox"
                checked={promoForm.has_min_order}
                onChange={(e) => setPromoForm((p) => ({ ...p, has_min_order: e.target.checked }))}
              />
              Set Minimum Order Value
            </label>
            {promoForm.has_min_order && (
              <input
                type="number"
                placeholder="Minimum Order (KES)"
                value={promoForm.min_order_amount}
                onChange={(e) => setPromoForm((p) => ({ ...p, min_order_amount: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
            )}

            {promoForm.promo_rule_type !== 'cart_fixed' && (
              <>
                <label className="flex items-center gap-2 font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={promoForm.has_max_discount}
                    onChange={(e) => setPromoForm((p) => ({ ...p, has_max_discount: e.target.checked }))}
                  />
                  Set Maximum Discount Value
                </label>
                {promoForm.has_max_discount && (
                  <input
                    type="number"
                    placeholder="Max Discount Cap (KES)"
                    value={promoForm.max_discount_value}
                    onChange={(e) => setPromoForm((p) => ({ ...p, max_discount_value: e.target.value }))}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
                  />
                )}
              </>
            )}

            <label className="flex items-center gap-2 font-bold text-slate-800">
              <input
                type="checkbox"
                checked={promoForm.specify_fulfilment}
                onChange={(e) => setPromoForm((p) => ({ ...p, specify_fulfilment: e.target.checked }))}
              />
              Specify Fulfilment Type(s)
            </label>
            {promoForm.specify_fulfilment && (
              <div className="flex flex-wrap gap-1.5 pl-5">
                {FULFILMENT_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setPromoForm((p) => ({ ...p, fulfilment_types: toggleArrayItem(p.fulfilment_types, f) }))}
                    className={`px-2.5 py-1 rounded-lg border font-bold ${
                      promoForm.fulfilment_types.includes(f)
                        ? 'bg-amber-50 border-amber-400 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 font-bold text-slate-800">
              <input
                type="checkbox"
                checked={promoForm.specify_payment}
                onChange={(e) => setPromoForm((p) => ({ ...p, specify_payment: e.target.checked }))}
              />
              Specify Payment Option(s)
            </label>
            {promoForm.specify_payment && (
              <div className="flex flex-wrap gap-1.5 pl-5">
                {PAYMENT_OPTIONS.map((po) => (
                  <button
                    key={po}
                    type="button"
                    onClick={() => setPromoForm((p) => ({ ...p, payment_options: toggleArrayItem(p.payment_options, po) }))}
                    className={`px-2.5 py-1 rounded-lg border font-bold ${
                      promoForm.payment_options.includes(po)
                        ? 'bg-amber-50 border-amber-400 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    {po}
                  </button>
                ))}
              </div>
            )}

            <label className="flex items-center gap-2 font-bold text-slate-800">
              <input
                type="checkbox"
                checked={promoForm.has_usage_per_customer}
                onChange={(e) => setPromoForm((p) => ({ ...p, has_usage_per_customer: e.target.checked }))}
              />
              Usage Per Customer Limit
            </label>
            {promoForm.has_usage_per_customer && (
              <input
                type="number"
                min="1"
                value={promoForm.usage_per_customer}
                onChange={(e) => setPromoForm((p) => ({ ...p, usage_per_customer: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
            )}

            <label className="flex items-center gap-2 font-bold text-slate-800">
              <input
                type="checkbox"
                checked={promoForm.use_custom_code}
                onChange={(e) => setPromoForm((p) => ({ ...p, use_custom_code: e.target.checked }))}
              />
              Use Custom Coupon Code
            </label>
            {promoForm.use_custom_code && (
              <input
                type="text"
                value={promoForm.code}
                onChange={(e) => setPromoForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="WELCOME15"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono uppercase"
              />
            )}

            <label className="flex items-center gap-2 font-bold text-slate-800">
              <input
                type="checkbox"
                checked={promoForm.has_max_uses}
                onChange={(e) => setPromoForm((p) => ({ ...p, has_max_uses: e.target.checked }))}
              />
              Maximum Number of Uses
            </label>
            {promoForm.has_max_uses && (
              <input
                type="number"
                min="1"
                value={promoForm.max_total_uses}
                onChange={(e) => setPromoForm((p) => ({ ...p, max_total_uses: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
            )}

            <label className="flex items-center gap-2 font-bold text-slate-800">
              <input
                type="checkbox"
                checked={promoForm.has_expiry}
                onChange={(e) => setPromoForm((p) => ({ ...p, has_expiry: e.target.checked }))}
              />
              Expires at
            </label>
            {promoForm.has_expiry && (
              <input
                type="datetime-local"
                value={promoForm.expires_at}
                onChange={(e) => setPromoForm((p) => ({ ...p, expires_at: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Promotion'}
          </button>
        </form>
      </SlideOverDrawer>

      {/* Voucher Drawer */}
      <SlideOverDrawer
        open={voucherDrawer}
        onClose={() => setVoucherDrawer(false)}
        title="Add New Voucher"
        subtitle="Issue stored-value KES voucher redeemable via Voucher tender"
      >
        <form onSubmit={saveVoucher} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Voucher Name *</label>
            <input
              type="text"
              required
              value={voucherForm.name}
              onChange={(e) => setVoucherForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. VIP KES 1,000 Gift Voucher"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-600 mb-1">Voucher Code *</label>
            <input
              type="text"
              required
              value={voucherForm.code}
              onChange={(e) => setVoucherForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono uppercase"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-600 mb-1">Voucher Value (KES) *</label>
            <input
              type="number"
              required
              min="1"
              value={voucherForm.amount}
              onChange={(e) => setVoucherForm((p) => ({ ...p, amount: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-600 mb-1">Starts At</label>
            <input
              type="datetime-local"
              value={voucherForm.starts_at}
              onChange={(e) => setVoucherForm((p) => ({ ...p, starts_at: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <label className="flex items-center gap-2 font-bold text-slate-800">
            <input
              type="checkbox"
              checked={voucherForm.has_expiry}
              onChange={(e) => setVoucherForm((p) => ({ ...p, has_expiry: e.target.checked }))}
            />
            Expires at
          </label>
          {voucherForm.has_expiry && (
            <input
              type="datetime-local"
              value={voucherForm.expires_at}
              onChange={(e) => setVoucherForm((p) => ({ ...p, expires_at: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          )}
          <div>
            <label className="block font-bold text-slate-600 mb-1">Description</label>
            <textarea
              rows={2}
              value={voucherForm.description}
              onChange={(e) => setVoucherForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black disabled:opacity-50"
          >
            {saving ? 'Issuing...' : 'Issue Voucher'}
          </button>
        </form>
      </SlideOverDrawer>

      {/* Loyalty Drawer */}
      <SlideOverDrawer
        open={loyaltyDrawer}
        onClose={() => setLoyaltyDrawer(false)}
        title="Add Loyalty Program"
        subtitle="Automatically award guest points on settled orders"
      >
        <form onSubmit={saveLoyaltyProgram} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Program Name *</label>
            <input
              type="text"
              required
              value={loyaltyForm.name}
              onChange={(e) => setLoyaltyForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. VIP Rewards Club"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-600 mb-1">Rate Amount (KES per Point) *</label>
              <input
                type="number"
                required
                min="1"
                value={loyaltyForm.rate_amount}
                onChange={(e) => setLoyaltyForm((p) => ({ ...p, rate_amount: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Minimum Order Value (KES)</label>
              <input
                type="number"
                min="0"
                value={loyaltyForm.min_order_value}
                onChange={(e) => setLoyaltyForm((p) => ({ ...p, min_order_value: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 font-bold text-slate-800">
            <input
              type="checkbox"
              checked={loyaltyForm.specify_fulfilment}
              onChange={(e) => setLoyaltyForm((p) => ({ ...p, specify_fulfilment: e.target.checked }))}
            />
            Specify Fulfilment Type(s)
          </label>
          {loyaltyForm.specify_fulfilment && (
            <div className="flex flex-wrap gap-1.5">
              {FULFILMENT_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLoyaltyForm((p) => ({ ...p, fulfilment_types: toggleArrayItem(p.fulfilment_types, f) }))}
                  className={`px-2.5 py-1 rounded-lg border font-bold ${
                    loyaltyForm.fulfilment_types.includes(f) ? 'bg-amber-50 border-amber-400 text-slate-900' : 'bg-white border-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 font-bold text-slate-800">
            <input
              type="checkbox"
              checked={loyaltyForm.enable_menu_category}
              onChange={(e) => setLoyaltyForm((p) => ({ ...p, enable_menu_category: e.target.checked }))}
            />
            Enable Menu Category Filter
          </label>
          {loyaltyForm.enable_menu_category && (
            <div className="flex flex-wrap gap-1.5">
              {uniqueCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setLoyaltyForm((p) => ({ ...p, category_names: toggleArrayItem(p.category_names, cat) }))}
                  className={`px-2.5 py-1 rounded-lg border font-bold ${
                    loyaltyForm.category_names.includes(cat) ? 'bg-amber-50 border-amber-400 text-slate-900' : 'bg-white border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 font-bold text-slate-800">
            <input
              type="checkbox"
              checked={loyaltyForm.has_expiry}
              onChange={(e) => setLoyaltyForm((p) => ({ ...p, has_expiry: e.target.checked }))}
            />
            Expires at
          </label>
          {loyaltyForm.has_expiry && (
            <input
              type="datetime-local"
              value={loyaltyForm.expires_at}
              onChange={(e) => setLoyaltyForm((p) => ({ ...p, expires_at: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
            />
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-black disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Create Loyalty Program'}
          </button>
        </form>
      </SlideOverDrawer>
    </div>
  );
}
