import React, { useEffect, useMemo, useState } from 'react';
import {
  Save, Loader2, Upload, Trash2, ChevronUp, ChevronDown, Star,
  Eye, EyeOff, Search, ExternalLink, Store, Palette, Clock, ShoppingBag,
  Image as ImageIcon, CheckCircle2,
} from 'lucide-react';
import { supabase, setTenantContext } from '../../lib/supabase';

const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400/25 focus:border-amber-400';
const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1';

function SectionCard({ icon: Icon, title, description, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
          <Icon size={17} />
        </div>
        <div>
          <h3 className="text-sm font-black text-slate-900">{title}</h3>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function OrdaMicrositeView({
  restaurantId,
  restaurantName,
  tenantSlug = '',
  settings = {},
  menuItems = [],
  onSettingsUpdated,
}) {
  const [form, setForm] = useState({
    tagline: settings.tagline || '',
    description: settings.description || '',
    cover_url: settings.cover_url || '',
    logo_url: settings.logo_url || '',
    brand_primary_color: settings.brand_primary_color || '#0B6B3A',
    brand_accent_color: settings.brand_accent_color || '#F97316',
    currency: settings.currency || 'KES',
    currency_symbol: settings.currency_symbol || 'KSh',
    eta_minutes: settings.eta_minutes || '',
    delivery_fee: settings.delivery_fee ?? '',
    min_order: settings.min_order ?? '',
    free_delivery_over: settings.free_delivery_over ?? '',
  });

  const [categoryOrder, setCategoryOrder] = useState([]);
  const [hiddenCategories, setHiddenCategories] = useState([]);
  const [defaultCategory, setDefaultCategory] = useState('Most Popular');
  const [itemOverrides, setItemOverrides] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [notice, setNotice] = useState('');

  // Channel commissions & daily report subscribers
  const [commissions, setCommissions] = useState([]);
  const [commissionForm, setCommissionForm] = useState({ channel: '', brand: '', commission_percent: '' });
  const [commissionBusy, setCommissionBusy] = useState(false);
  const [subscribers, setSubscribers] = useState([]);
  const [subscriberForm, setSubscriberForm] = useState({ email: '', sales_report: true, commission_report: true, inventory_report: false });
  const [subscriberBusy, setSubscriberBusy] = useState(false);

  useEffect(() => {
    setForm({
      tagline: settings?.tagline || '',
      description: settings?.description || '',
      cover_url: settings?.cover_url || '',
      logo_url: settings?.logo_url || '',
      brand_primary_color: settings?.brand_primary_color || '#0B6B3A',
      brand_accent_color: settings?.brand_accent_color || '#F97316',
      currency: settings?.currency || 'KES',
      currency_symbol: settings?.currency_symbol || 'KSh',
      eta_minutes: settings?.eta_minutes || '',
      delivery_fee: settings?.delivery_fee ?? '',
      min_order: settings?.min_order ?? '',
      free_delivery_over: settings?.free_delivery_over ?? '',
      base_cogs_percent: settings?.base_cogs_percent ?? '',
    });

    const cfg = settings?.microsite_config || {};
    setCategoryOrder(Array.isArray(cfg.categoryOrder) ? cfg.categoryOrder : []);
    setHiddenCategories(Array.isArray(cfg.hiddenCategories) ? cfg.hiddenCategories : []);
    setDefaultCategory(cfg.defaultCategory || 'Most Popular');
  }, [settings]);

  useEffect(() => {
    if (!restaurantId) return;
    setTenantContext(restaurantId);
    supabase.from('pos_channel_commissions').select('*').eq('restaurant_id', restaurantId).order('channel')
      .then(({ data }) => setCommissions(Array.isArray(data) ? data : []))
      .catch(() => {});
    supabase.from('report_subscribers').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: true })
      .then(({ data }) => setSubscribers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [restaurantId]);

  const normKey = (value) => String(value || '').trim().toLowerCase();

  const saveCommission = async () => {
    const channel = commissionForm.channel.trim();
    if (!channel) {
      alert('Channel is required (e.g. UberEats, Glovo, Bolt Food).');
      return;
    }
    setCommissionBusy(true);
    try {
      setTenantContext(restaurantId);
      const brand = commissionForm.brand.trim() || null;
      const existing = commissions.find((c) => normKey(c.channel) === normKey(channel) && normKey(c.brand) === normKey(brand));
      const payload = {
        channel,
        brand,
        commission_percent: Number(commissionForm.commission_percent) || 0,
        is_active: true,
      };
      let error = null;
      if (existing) {
        ({ error } = await supabase.from('pos_channel_commissions').update(payload).eq('id', existing.id).eq('restaurant_id', restaurantId));
      } else {
        ({ error } = await supabase.from('pos_channel_commissions').insert([{ restaurant_id: restaurantId, ...payload }]));
      }
      if (error) throw error;
      setCommissionForm({ channel: '', brand: '', commission_percent: '' });
      setNotice('Commission rate saved.');
      const { data } = await supabase.from('pos_channel_commissions').select('*').eq('restaurant_id', restaurantId).order('channel');
      setCommissions(Array.isArray(data) ? data : []);
    } catch (err) {
      alert('Could not save commission: ' + (err.message || err));
    } finally {
      setCommissionBusy(false);
    }
  };

  const toggleCommission = async (row) => {
    setTenantContext(restaurantId);
    const { error } = await supabase.from('pos_channel_commissions')
      .update({ is_active: row.is_active === false })
      .eq('id', row.id)
      .eq('restaurant_id', restaurantId);
    if (!error) setCommissions((prev) => prev.map((c) => (c.id === row.id ? { ...c, is_active: row.is_active === false } : c)));
  };

  const deleteCommission = async (row) => {
    if (!window.confirm('Delete this commission rate?')) return;
    setTenantContext(restaurantId);
    const { error } = await supabase.from('pos_channel_commissions').delete().eq('id', row.id).eq('restaurant_id', restaurantId);
    if (!error) setCommissions((prev) => prev.filter((c) => c.id !== row.id));
  };

  const saveSubscriber = async () => {
    const email = subscriberForm.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      alert('Enter a valid email address.');
      return;
    }
    setSubscriberBusy(true);
    try {
      setTenantContext(restaurantId);
      const { error } = await supabase.from('report_subscribers').insert([{
        restaurant_id: restaurantId,
        email,
        sales_report: subscriberForm.sales_report,
        commission_report: subscriberForm.commission_report,
        inventory_report: subscriberForm.inventory_report,
        is_active: true,
      }]);
      if (error) throw error;
      setSubscriberForm({ email: '', sales_report: true, commission_report: true, inventory_report: false });
      setNotice('Report subscriber added.');
      const { data } = await supabase.from('report_subscribers').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: true });
      setSubscribers(Array.isArray(data) ? data : []);
    } catch (err) {
      alert('Could not add subscriber: ' + (err.message || err));
    } finally {
      setSubscriberBusy(false);
    }
  };

  const toggleSubscriberFlag = async (row, key) => {
    setTenantContext(restaurantId);
    const { error } = await supabase.from('report_subscribers')
      .update({ [key]: !row[key] })
      .eq('id', row.id)
      .eq('restaurant_id', restaurantId);
    if (!error) setSubscribers((prev) => prev.map((s) => (s.id === row.id ? { ...s, [key]: !row[key] } : s)));
  };

  const deleteSubscriber = async (row) => {
    if (!window.confirm(`Remove ${row.email}?`)) return;
    setTenantContext(restaurantId);
    const { error } = await supabase.from('report_subscribers').delete().eq('id', row.id).eq('restaurant_id', restaurantId);
    if (!error) setSubscribers((prev) => prev.filter((s) => s.id !== row.id));
  };

  // Distinct categories that actually have microsite-visible items, in the
  // owner's chosen order (falling back to name order for anything new).
  const categories = useMemo(() => {
    const counts = new Map();
    (menuItems || []).forEach((m) => {
      if (m.is_available === false) return;
      const name = m.category || 'Menu';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const names = Array.from(counts.keys());
    const rank = new Map(categoryOrder.map((n, i) => [n, i]));
    names.sort((a, b) => {
      const ra = rank.has(a) ? rank.get(a) : 999;
      const rb = rank.has(b) ? rank.get(b) : 999;
      if (ra !== rb) return ra - rb;
      return String(a).localeCompare(String(b));
    });
    return names.map((name) => ({ name, count: counts.get(name) }));
  }, [menuItems, categoryOrder]);

  const visibleCategoryNames = useMemo(
    () => categories.map((c) => c.name).filter((n) => !hiddenCategories.includes(n)),
    [categories, hiddenCategories]
  );

  const effectiveItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (menuItems || [])
      .filter((m) => (q ? `${m.name || ''} ${m.category || ''}`.toLowerCase().includes(q) : true))
      .slice(0, 300);
  }, [menuItems, search]);

  const itemState = (item) => {
    const ov = itemOverrides[item.id];
    if (ov) return ov;
    return {
      show_on_microsite: item.show_on_microsite !== false,
      is_featured: item.is_featured === true,
    };
  };

  const toggleItem = (item, key) => {
    const current = itemState(item);
    setItemOverrides((prev) => ({
      ...prev,
      [item.id]: { ...current, [key]: !current[key] },
    }));
  };

  const moveCategory = (name, dir) => {
    const base = categories.map((c) => c.name);
    const idx = base.indexOf(name);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= base.length) return;
    const [row] = base.splice(idx, 1);
    base.splice(next, 0, row);
    setCategoryOrder(base);
  };

  const handleUpload = async (file, kind) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }
    setUploading(kind);
    try {
      const restId = restaurantId || 'shared';
      const path = `public/${restId}/microsite/${kind}-${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
      const { error: uploadError } = await supabase.storage.from('menu_images').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('menu_images').getPublicUrl(path);
      const url = urlData?.publicUrl || '';
      setForm((prev) => ({ ...prev, [kind === 'cover' ? 'cover_url' : 'logo_url']: url }));
      setNotice(`${kind === 'cover' ? 'Cover' : 'Logo'} uploaded — remember to save.`);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading('');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice('');
    try {
      setTenantContext(restaurantId);
      const cfg = { categoryOrder, hiddenCategories, defaultCategory };
      const payload = {
        tagline: form.tagline || null,
        description: form.description || null,
        cover_url: form.cover_url || null,
        logo_url: form.logo_url || null,
        brand_primary_color: form.brand_primary_color || null,
        brand_accent_color: form.brand_accent_color || null,
        brand_colors: { primary: form.brand_primary_color, accent: form.brand_accent_color },
        currency: form.currency || 'KES',
        currency_symbol: form.currency_symbol || 'KSh',
        eta_minutes: form.eta_minutes || null,
        delivery_fee: Number(form.delivery_fee) || 0,
        min_order: Number(form.min_order) || 0,
        free_delivery_over: form.free_delivery_over === '' ? null : Number(form.free_delivery_over),
        base_cogs_percent: Number(form.base_cogs_percent) || 0,
        microsite_config: cfg,
      };

      let { error } = await supabase
        .from('restaurant_settings')
        .update(payload)
        .eq('restaurant_id', restaurantId);
      if (error && /microsite_config/i.test(String(error.message || ''))) {
        // Column not migrated yet — save everything else so the editor still works.
        const { microsite_config: _ignored, ...rest } = payload;
        ({ error } = await supabase.from('restaurant_settings').update(rest).eq('restaurant_id', restaurantId));
        if (!error) {
          setNotice('Saved. Run supabase/migrations/20261119_microsite_editor.sql to enable category ordering.');
        }
      }
      if (error) throw error;

      const ids = Object.keys(itemOverrides);
      for (const id of ids) {
        const ov = itemOverrides[id];
        const { error: itemError } = await supabase
          .from('pos_menu')
          .update({ show_on_microsite: ov.show_on_microsite, is_featured: ov.is_featured })
          .eq('id', id)
          .eq('restaurant_id', restaurantId);
        if (itemError) throw itemError;
      }

      setItemOverrides({});
      setNotice('Storefront saved. Changes are live on your microsite.');
      onSettingsUpdated?.({ silent: true });
    } catch (err) {
      alert('Save failed: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const micrositeUrl = tenantSlug
    ? `https://${tenantSlug}.manipos.com/`
    : (typeof window !== 'undefined' ? window.location.origin + '/' : '/');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Storefront &amp; Microsite</h2>
          <p className="text-xs text-slate-500 mt-1">
            Edit what customers see on {restaurantName || 'your store'}&apos;s ordering page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={micrositeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold"
          >
            <ExternalLink size={14} /> Preview live
          </a>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving…' : 'Save storefront'}
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-4 py-3 rounded-xl">
          <CheckCircle2 size={15} /> {notice}
        </div>
      )}

      {/* ── Storefront content ── */}
      <SectionCard
        icon={Store}
        title="Store content"
        description="Name, tagline and images shown in the microsite hero."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Tagline / subtitle</label>
            <input
              type="text"
              className={inputCls}
              placeholder="e.g. Naija flavour, now now."
              value={form.tagline}
              onChange={(e) => setForm((p) => ({ ...p, tagline: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Currency &amp; symbol</label>
            <div className="flex gap-2">
              <input
                type="text"
                className={`${inputCls} w-24`}
                placeholder="KES"
                value={form.currency}
                onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
              />
              <input
                type="text"
                className={inputCls}
                placeholder="KSh"
                value={form.currency_symbol}
                onChange={(e) => setForm((p) => ({ ...p, currency_symbol: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Store description</label>
          <textarea
            rows={3}
            className={inputCls}
            placeholder="Tell customers what makes your food special."
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { kind: 'logo', label: 'Logo', value: form.logo_url },
            { kind: 'cover', label: 'Cover image', value: form.cover_url },
          ].map((img) => (
            <div key={img.kind} className="space-y-1.5">
              <label className={labelCls}>{img.label}</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                  {img.value
                    ? <img src={img.value} alt={img.label} className="w-full h-full object-cover" />
                    : <ImageIcon size={18} className="text-slate-300" />}
                </div>
                <div className="flex-1 space-y-1.5">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="Paste an image URL"
                    value={img.value}
                    onChange={(e) => setForm((p) => ({ ...p, [img.kind === 'cover' ? 'cover_url' : 'logo_url']: e.target.value }))}
                  />
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl cursor-pointer hover:border-amber-400">
                    {uploading === img.kind ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploading === img.kind ? 'Uploading…' : 'Upload'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUpload(e.target.files?.[0], img.kind)}
                    />
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Branding ── */}
      <SectionCard
        icon={Palette}
        title="Branding"
        description="Accent colours used across the ordering page."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: 'brand_primary_color', label: 'Primary colour' },
            { key: 'brand_accent_color', label: 'Accent colour' },
          ].map((c) => (
            <div key={c.key} className="space-y-1.5">
              <label className={labelCls}>{c.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form[c.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [c.key]: e.target.value }))}
                  className="w-11 h-11 rounded-xl border border-slate-200 bg-white cursor-pointer"
                />
                <input
                  type="text"
                  value={form[c.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [c.key]: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Ordering ── */}
      <SectionCard
        icon={ShoppingBag}
        title="Ordering &amp; delivery"
        description="Fees and timing customers see before checkout."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Delivery time (minutes)</label>
            <input
              type="number"
              min="0"
              className={inputCls}
              placeholder="e.g. 40"
              value={form.eta_minutes}
              onChange={(e) => setForm((p) => ({ ...p, eta_minutes: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Base delivery fee</label>
            <input
              type="number"
              min="0"
              className={inputCls}
              placeholder="e.g. 200"
              value={form.delivery_fee}
              onChange={(e) => setForm((p) => ({ ...p, delivery_fee: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Minimum order</label>
            <input
              type="number"
              min="0"
              className={inputCls}
              placeholder="e.g. 500"
              value={form.min_order}
              onChange={(e) => setForm((p) => ({ ...p, min_order: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Free delivery over</label>
            <input
              type="number"
              min="0"
              className={inputCls}
              placeholder="e.g. 2000"
              value={form.free_delivery_over}
              onChange={(e) => setForm((p) => ({ ...p, free_delivery_over: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Base COGS %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputCls}
              placeholder="e.g. 35"
              value={form.base_cogs_percent}
              onChange={(e) => setForm((p) => ({ ...p, base_cogs_percent: e.target.value }))}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Clock size={12} /> Free delivery threshold is optional. Base COGS % is the store-wide cost fallback for items without an exact cost price.
        </p>
      </SectionCard>

      {/* ── Category display ── */}
      <SectionCard
        icon={Eye}
        title="Category display"
        description="Reorder tabs, hide categories, and choose the tab customers land on."
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Default tab:</span>
          {visibleCategoryNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setDefaultCategory(name)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                defaultCategory === name
                  ? 'bg-amber-400 text-slate-950 border-amber-400'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-300'
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {categories.length === 0 && (
            <p className="text-xs text-slate-400 px-4 py-6 text-center">No categories found in your menu yet.</p>
          )}
          {categories.map((cat, idx) => {
            const hidden = hiddenCategories.includes(cat.name);
            const isDefault = defaultCategory === cat.name;
            return (
              <div key={cat.name} className={`flex items-center gap-3 px-3 py-2.5 ${hidden ? 'bg-slate-50' : 'bg-white'}`}>
                <span className="text-[11px] font-mono text-slate-400 w-6 text-right shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate ${hidden ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                    {cat.name}
                    {isDefault && <span className="ml-2 text-[10px] font-black text-amber-600 uppercase tracking-wider">Default</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">{cat.count} item{cat.count === 1 ? '' : 's'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveCategory(cat.name, -1)}
                    disabled={idx === 0}
                    title="Move up"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ChevronUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCategory(cat.name, 1)}
                    disabled={idx === categories.length - 1}
                    title="Move down"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ChevronDown size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHiddenCategories((prev) => prev.includes(cat.name) ? prev.filter((n) => n !== cat.name) : [...prev, cat.name])}
                    title={hidden ? 'Show category' : 'Hide category'}
                    className={`p-1.5 rounded-lg ${hidden ? 'text-slate-400 hover:bg-slate-100' : 'text-amber-600 hover:bg-amber-50'}`}
                  >
                    {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Menu item display ── */}
      <SectionCard
        icon={Star}
        title="Menu item display"
        description="Control which items appear on the microsite and which are marked Most Popular."
      >
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items..."
            className={`${inputCls} pl-9`}
          />
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
          {effectiveItems.length === 0 && (
            <p className="text-xs text-slate-400 px-4 py-6 text-center">No menu items match your search.</p>
          )}
          {effectiveItems.map((item) => {
            const st = itemState(item);
            return (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{item.category || 'Menu'}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleItem(item, 'show_on_microsite')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${
                      st.show_on_microsite
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                    title="Show on microsite"
                  >
                    {st.show_on_microsite ? <Eye size={12} /> : <EyeOff size={12} />}
                    {st.show_on_microsite ? 'Visible' : 'Hidden'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleItem(item, 'is_featured')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${
                      st.is_featured
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                    title="Mark as Most Popular"
                  >
                    <Star size={12} className={st.is_featured ? 'fill-amber-500 text-amber-500' : ''} />
                    Popular
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400">
          Showing {effectiveItems.length} of {(menuItems || []).length} items. Changes apply when you save.
        </p>
      </SectionCard>

      {/* ── Channel commissions ── */}
      <SectionCard
        icon={ShoppingBag}
        title="Channel commissions"
        description="Platform commission per sales channel (and optionally per brand), captured on every order line."
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Channel</label>
            <input
              className={inputCls}
              list="channel-commission-options"
              placeholder="UberEats, Glovo, Bolt Food…"
              value={commissionForm.channel}
              onChange={(e) => setCommissionForm((p) => ({ ...p, channel: e.target.value }))}
            />
            <datalist id="channel-commission-options">
              {['UberEats', 'Glovo', 'Bolt Food', 'Whatsapp', 'Microsite', 'Dine-in', 'Takeaway'].map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Brand (optional)</label>
            <input
              className={inputCls}
              placeholder="e.g. Little Lagos"
              value={commissionForm.brand}
              onChange={(e) => setCommissionForm((p) => ({ ...p, brand: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Commission %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputCls}
              placeholder="e.g. 20"
              value={commissionForm.commission_percent}
              onChange={(e) => setCommissionForm((p) => ({ ...p, commission_percent: e.target.value }))}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={saveCommission}
              disabled={commissionBusy}
              className="w-full px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-50"
            >
              {commissionBusy ? 'Saving…' : 'Add / Update'}
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {commissions.length === 0 && (
            <p className="text-xs text-slate-400 px-4 py-5 text-center">No commission rates yet. Example: Glovo / Pot of Jollof = 29%.</p>
          )}
          {commissions.map((row) => (
            <div key={row.id} className={`flex items-center gap-3 px-4 py-2.5 ${row.is_active === false ? 'bg-slate-50' : 'bg-white'}`}>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${row.is_active === false ? 'text-slate-400' : 'text-slate-800'}`}>
                  {row.channel}
                  {row.brand ? ` · ${row.brand}` : ' · All brands'}
                </p>
                <p className="text-[11px] text-slate-400">Commission {Number(row.commission_percent) || 0}% per item</p>
              </div>
              <button
                type="button"
                onClick={() => toggleCommission(row)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${
                  row.is_active !== false
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}
              >
                {row.is_active !== false ? 'Active' : 'Inactive'}
              </button>
              <button
                type="button"
                onClick={() => deleteCommission(row)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Daily report emails ── */}
      <SectionCard
        icon={Clock}
        title="Daily report emails"
        description="Choose who receives the daily sales, commission and closing-stock reports."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Email address</label>
            <input
              type="email"
              className={inputCls}
              placeholder="owner@restaurant.com"
              value={subscriberForm.email}
              onChange={(e) => setSubscriberForm((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pb-1">
            {[
              { key: 'sales_report', label: 'Sales breakdown' },
              { key: 'commission_report', label: 'Commission paid' },
              { key: 'inventory_report', label: 'Closing stock & reorder' },
            ].map((f) => (
              <label key={f.key} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(subscriberForm[f.key])}
                  onChange={(e) => setSubscriberForm((p) => ({ ...p, [f.key]: e.target.checked }))}
                  className="accent-emerald-700 w-4 h-4"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={saveSubscriber}
          disabled={subscriberBusy}
          className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-50"
        >
          {subscriberBusy ? 'Adding…' : 'Add recipient'}
        </button>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {subscribers.length === 0 && (
            <p className="text-xs text-slate-400 px-4 py-5 text-center">No report recipients yet.</p>
          )}
          {subscribers.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-white">
              <p className="text-sm font-bold text-slate-800 flex-1 min-w-0 truncate">{row.email}</p>
              <div className="flex flex-wrap items-center gap-3">
                {[
                  { key: 'sales_report', label: 'Sales' },
                  { key: 'commission_report', label: 'Commission' },
                  { key: 'inventory_report', label: 'Inventory' },
                ].map((f) => (
                  <label key={f.key} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(row[f.key])}
                      onChange={() => toggleSubscriberFlag(row, f.key)}
                      className="accent-emerald-700 w-3.5 h-3.5"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => deleteSubscriber(row)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                title="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Clock size={12} /> Reports are emailed automatically every day at 00:17 (Africa/Nairobi).
        </p>
      </SectionCard>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-sm font-black disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save storefront'}
        </button>
      </div>
    </div>
  );
}
