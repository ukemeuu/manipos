import React, { useEffect, useState } from 'react';
import {
  Plug, Truck, CreditCard, Globe, Key, Webhook, RefreshCw, CheckCircle2,
  Copy, ShieldCheck, Zap, Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DEFAULT_HOURS = Object.fromEntries(
  DAYS.map((d) => [d, { open: true, start: '08:00', end: '22:00' }])
);

export function IntegrationsAndOmnichannelView({
  mode = 'integrations', // 'integrations' | 'omnichannel' | 'api-webhooks'
  restaurantId,
  restaurantName = 'ManiPOS Store',
  tenantSlug = '',
  settings = {},
  onSettingsUpdated,
}) {
  const [subTab, setSubTab] = useState(mode);
  useEffect(() => {
    setSubTab(mode);
  }, [mode]);

  const [integrations, setIntegrations] = useState({});
  const [omnichannel, setOmnichannel] = useState({
    glovo: { is_enabled: false, external_store_id: '', auto_accept_orders: true, weekly_hours: DEFAULT_HOURS, last_sync_status: 'Not synced' },
    bolt: { is_enabled: false, external_store_id: '', auto_accept_orders: true, weekly_hours: DEFAULT_HOURS, last_sync_status: 'Not synced' },
    ubereats: { is_enabled: false, external_store_id: '', auto_accept_orders: true, weekly_hours: DEFAULT_HOURS, last_sync_status: 'Not synced' },
  });
  const [events, setEvents] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [callbackUrl, setCallbackUrl] = useState(settings.callback_url || '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  // Editable states for Integration cards
  const [tevin, setTevin] = useState({ is_enabled: false, device_ip: '', port: '8080', serial: '', kra_pin: '', sender_id: '', tax_class: 'A', tax_rate: '16' });
  const [leta, setLeta] = useState({ is_enabled: false, api_key: '', depot_code: '' });
  const [little, setLittle] = useState({ is_enabled: false, api_key: '', corporate_id: '', callback_secret: '' });
  const [mpesaPaybill, setMpesaPaybill] = useState({ is_enabled: true, account_number: settings.mpesa_account || '992422', paybill_number: settings.mpesa_paybill || '542542' });
  const [paystackConn, setPaystackConn] = useState({ is_enabled: false, subaccount_code: '', public_key: '' });
  const [customPay, setCustomPay] = useState({ is_enabled: false, label: '', instructions: '' });

  const loadAll = async () => {
    if (!restaurantId) return;
    try {
      const [intRes, omniRes, evtRes, keyRes] = await Promise.all([
        supabase.from('tenant_integrations').select('*').eq('restaurant_id', restaurantId),
        supabase.from('omnichannel_configs').select('*').eq('restaurant_id', restaurantId),
        supabase.from('omnichannel_events').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(50),
        supabase.from('merchant_api_keys').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
      ]);

      if (!intRes.error && Array.isArray(intRes.data)) {
        const map = {};
        intRes.data.forEach((row) => {
          map[row.provider] = row;
          const cfg = row.config || {};
          if (row.provider === 'tevin_kra') setTevin((p) => ({ ...p, ...cfg, is_enabled: row.is_enabled }));
          if (row.provider === 'leta') setLeta((p) => ({ ...p, ...cfg, is_enabled: row.is_enabled }));
          if (row.provider === 'little') setLittle((p) => ({ ...p, ...cfg, is_enabled: row.is_enabled }));
          if (row.provider === 'mpesa_paybill') setMpesaPaybill((p) => ({ ...p, ...cfg, is_enabled: row.is_enabled }));
          if (row.provider === 'mpesa_paystack') setPaystackConn((p) => ({ ...p, ...cfg, is_enabled: row.is_enabled }));
          if (row.provider === 'custom_payment') setCustomPay((p) => ({ ...p, ...cfg, is_enabled: row.is_enabled }));
        });
        setIntegrations(map);
      }
      if (!omniRes.error && Array.isArray(omniRes.data)) {
        setOmnichannel((prev) => {
          const next = { ...prev };
          omniRes.data.forEach((r) => {
            next[r.platform] = { ...prev[r.platform], ...r };
          });
          return next;
        });
      }
      if (!evtRes.error) setEvents(evtRes.data || []);
      if (!keyRes.error) setApiKeys(keyRes.data || []);
    } catch (err) {
      console.warn('Integrations load note:', err);
    }
  };

  useEffect(() => {
    loadAll();
  }, [restaurantId]);

  const saveIntegration = async (provider, category, is_enabled, config) => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tenant_integrations').upsert(
        {
          restaurant_id: restaurantId,
          provider,
          category,
          is_enabled,
          config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,provider' }
      );
      if (error) throw error;
      setNotice(`Saved ${provider.replace(/_/g, ' ').toUpperCase()} configuration.`);
      await loadAll();
    } catch (err) {
      alert('Save error (apply Wave 5 migration if table missing): ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const saveOmnichannelPlatform = async (platform, extra = {}) => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const cur = { ...omnichannel[platform], ...extra };
      const { error } = await supabase.from('omnichannel_configs').upsert(
        {
          restaurant_id: restaurantId,
          platform,
          is_enabled: cur.is_enabled,
          external_store_id: cur.external_store_id || '',
          auto_accept_orders: cur.auto_accept_orders !== false,
          weekly_hours: cur.weekly_hours || DEFAULT_HOURS,
          last_menu_sync_at: cur.last_menu_sync_at || null,
          last_sync_status: cur.last_sync_status || 'Synced',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,platform' }
      );
      if (error) throw error;
      setNotice(`${platform.toUpperCase()} settings updated.`);
      await loadAll();
    } catch (err) {
      alert('Omnichannel save error: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const generateApiKey = async () => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const pub = `pk_live_${tenantSlug || 'mani'}_${Math.random().toString(36).slice(2, 12)}`;
      const secPreview = `sk_live_••••${Math.random().toString(36).slice(2, 6)}`;
      const whSecret = `whsec_${Math.random().toString(36).slice(2, 18)}`;
      const { error } = await supabase.from('merchant_api_keys').insert([
        {
          restaurant_id: restaurantId,
          label: 'Production API Key',
          public_key: pub,
          secret_key_preview: secPreview,
          callback_url: callbackUrl.trim() || null,
          webhook_secret: whSecret,
          is_active: true,
        },
      ]);
      if (error) throw error;
      setNotice('New API Key & Webhook Signing Secret generated.');
      await loadAll();
    } catch (err) {
      alert('Could not create API Key: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const saveWebhookCallback = async () => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      await supabase
        .from('restaurant_settings')
        .update({ callback_url: callbackUrl.trim() || null })
        .eq('restaurant_id', restaurantId);
      if (apiKeys[0]?.id) {
        await supabase
          .from('merchant_api_keys')
          .update({ callback_url: callbackUrl.trim() || null })
          .eq('id', apiKeys[0].id);
      }
      setNotice('Outbound Webhook Callback URL updated.');
      await onSettingsUpdated?.();
    } catch (err) {
      alert('Webhook save note: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">Integrations, Omnichannel & API Webhooks</h2>
            <div className="inline-flex bg-slate-100 rounded-xl p-0.5 text-xs font-bold">
              {[
                { id: 'integrations', label: 'Integrations Hub' },
                { id: 'omnichannel', label: 'Omnichannel (Glovo/Bolt/Uber)' },
                { id: 'api-webhooks', label: 'API Keys & Webhooks' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={`px-3 py-1 rounded-lg ${subTab === t.id ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Connect Tevin KRA eTIMS, Leta & Little dispatch riders, M-Pesa Daraja/Paystack, aggregator menus, and outbound webhooks.
          </p>
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="hover:underline">Dismiss</button>
        </div>
      )}

      {/* TAB 1: INTEGRATIONS HUB */}
      {subTab === 'integrations' && (
        <div className="space-y-6">
          {/* ACCOUNTS: Tevin KRA */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">ACCOUNTS & FISCAL (KENYA KRA)</h3>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-black text-slate-900">Tevin KRA (eTIMS Fiscal Bridge)</h4>
                  <p className="text-slate-500">Tax Invoice signing via local ESD/VSCU device endpoint</p>
                </div>
                <label className="inline-flex items-center gap-2 font-bold">
                  <input type="checkbox" checked={tevin.is_enabled} onChange={(e) => setTevin((p) => ({ ...p, is_enabled: e.target.checked }))} />
                  Enabled
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <input placeholder="Device IP (e.g. 192.168.1.50)" value={tevin.device_ip} onChange={(e) => setTevin((p) => ({ ...p, device_ip: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <input placeholder="Port (8080)" value={tevin.port} onChange={(e) => setTevin((p) => ({ ...p, port: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <input placeholder="Serial Number" value={tevin.serial} onChange={(e) => setTevin((p) => ({ ...p, serial: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <input placeholder="KRA Pin (P05...)" value={tevin.kra_pin} onChange={(e) => setTevin((p) => ({ ...p, kra_pin: e.target.value.toUpperCase() }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono uppercase" />
                <input placeholder="Sender ID" value={tevin.sender_id} onChange={(e) => setTevin((p) => ({ ...p, sender_id: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
                <input placeholder="Tax Class (A)" value={tevin.tax_class} onChange={(e) => setTevin((p) => ({ ...p, tax_class: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
                <input placeholder="Tax Rate (%)" value={tevin.tax_rate} onChange={(e) => setTevin((p) => ({ ...p, tax_rate: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <button type="button" disabled={saving} onClick={() => saveIntegration('tevin_kra', 'ACCOUNTS', tevin.is_enabled, tevin)} className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-black">
                  Save Tevin KRA
                </button>
              </div>
            </div>
          </div>

          {/* DELIVERY: Leta & Little */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">DELIVERY LOGISTICS</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-slate-900">Leta Dispatch</h4>
                  <label className="inline-flex items-center gap-2 font-bold">
                    <input type="checkbox" checked={leta.is_enabled} onChange={(e) => setLeta((p) => ({ ...p, is_enabled: e.target.checked }))} />
                    Enabled
                  </label>
                </div>
                <input type="password" placeholder="Leta API Key" value={leta.api_key} onChange={(e) => setLeta((p) => ({ ...p, api_key: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <input type="text" placeholder="Depot Code" value={leta.depot_code} onChange={(e) => setLeta((p) => ({ ...p, depot_code: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <button type="button" disabled={saving} onClick={() => saveIntegration('leta', 'DELIVERY', leta.is_enabled, leta)} className="w-full py-2 rounded-xl bg-slate-900 text-white font-black">
                  Save Leta Config
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-slate-900">Little Delivery</h4>
                  <label className="inline-flex items-center gap-2 font-bold">
                    <input type="checkbox" checked={little.is_enabled} onChange={(e) => setLittle((p) => ({ ...p, is_enabled: e.target.checked }))} />
                    Enabled
                  </label>
                </div>
                <input type="password" placeholder="Little API Key" value={little.api_key} onChange={(e) => setLittle((p) => ({ ...p, api_key: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Corporate ID" value={little.corporate_id} onChange={(e) => setLittle((p) => ({ ...p, corporate_id: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                  <input type="password" placeholder="Callback Signature Secret" value={little.callback_secret} onChange={(e) => setLittle((p) => ({ ...p, callback_secret: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                </div>
                <button type="button" disabled={saving} onClick={() => saveIntegration('little', 'DELIVERY', little.is_enabled, little)} className="w-full py-2 rounded-xl bg-slate-900 text-white font-black">
                  Save Little Config
                </button>
              </div>
            </div>
          </div>

          {/* PAYMENTS: MPESA Paybill (Daraja), Mpesa Paystack, Custom */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">PAYMENTS & LIVE DARAJA</h3>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
              <div className="bg-white border border-emerald-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-slate-900">MPESA Paybill / Daraja STK</h4>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">Live Active</span>
                </div>
                <input placeholder="Paybill Shortcode (542542)" value={mpesaPaybill.paybill_number} onChange={(e) => setMpesaPaybill((p) => ({ ...p, paybill_number: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <input placeholder="Account Number (992422)" value={mpesaPaybill.account_number} onChange={(e) => setMpesaPaybill((p) => ({ ...p, account_number: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <button type="button" disabled={saving} onClick={() => saveIntegration('mpesa_paybill', 'PAYMENTS', true, mpesaPaybill)} className="w-full py-2 rounded-xl bg-emerald-700 text-white font-black">
                  Save MPESA Paybill
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-slate-900">Mpesa Paystack Connect</h4>
                  <label className="inline-flex items-center gap-1 font-bold">
                    <input type="checkbox" checked={paystackConn.is_enabled} onChange={(e) => setPaystackConn((p) => ({ ...p, is_enabled: e.target.checked }))} />
                    On
                  </label>
                </div>
                <input placeholder="Subaccount Code (ACCT_...)" value={paystackConn.subaccount_code} onChange={(e) => setPaystackConn((p) => ({ ...p, subaccount_code: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <input placeholder="Paystack Public Key (pk_...)" value={paystackConn.public_key} onChange={(e) => setPaystackConn((p) => ({ ...p, public_key: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono" />
                <button type="button" disabled={saving} onClick={() => saveIntegration('mpesa_paystack', 'PAYMENTS', paystackConn.is_enabled, paystackConn)} className="w-full py-2 rounded-xl bg-slate-900 text-white font-black">
                  Connect Paystack
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-black text-slate-900">Custom Payment Tender</h4>
                  <label className="inline-flex items-center gap-1 font-bold">
                    <input type="checkbox" checked={customPay.is_enabled} onChange={(e) => setCustomPay((p) => ({ ...p, is_enabled: e.target.checked }))} />
                    On
                  </label>
                </div>
                <input placeholder="Method Name (e.g. PesaPal / CoopPay)" value={customPay.label} onChange={(e) => setCustomPay((p) => ({ ...p, label: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
                <input placeholder="Settlement Instructions" value={customPay.instructions} onChange={(e) => setCustomPay((p) => ({ ...p, instructions: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
                <button type="button" disabled={saving} onClick={() => saveIntegration('custom_payment', 'PAYMENTS', customPay.is_enabled, customPay)} className="w-full py-2 rounded-xl bg-slate-900 text-white font-black">
                  Save Custom Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: OMNICHANNEL (GLOVO / BOLT FOOD / UBER EATS) */}
      {subTab === 'omnichannel' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {[
              { key: 'glovo', name: 'Glovo Partner', color: 'border-amber-300 bg-amber-50/40' },
              { key: 'bolt', name: 'Bolt Food', color: 'border-emerald-300 bg-emerald-50/40' },
              { key: 'ubereats', name: 'Uber Eats', color: 'border-slate-300 bg-slate-50/40' },
            ].map((plat) => {
              const cfg = omnichannel[plat.key] || {};
              return (
                <div key={plat.key} className={`border rounded-2xl p-5 space-y-3 bg-white shadow-sm ${cfg.is_enabled ? plat.color : 'border-slate-200'}`}>
                  <div className="flex justify-between items-center">
                    <h4 className="text-sm font-black text-slate-900">{plat.name}</h4>
                    <label className="inline-flex items-center gap-1.5 font-bold">
                      <input
                        type="checkbox"
                        checked={Boolean(cfg.is_enabled)}
                        onChange={(e) => setOmnichannel((p) => ({ ...p, [plat.key]: { ...cfg, is_enabled: e.target.checked } }))}
                      />
                      Enabled
                    </label>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-600 mb-1">External Store ID</label>
                    <input
                      type="text"
                      value={cfg.external_store_id || ''}
                      onChange={(e) => setOmnichannel((p) => ({ ...p, [plat.key]: { ...cfg, external_store_id: e.target.value } }))}
                      placeholder={`${plat.key}_ke_store_01`}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                  <label className="flex items-center gap-2 font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={cfg.auto_accept_orders !== false}
                      onChange={(e) => setOmnichannel((p) => ({ ...p, [plat.key]: { ...cfg, auto_accept_orders: e.target.checked } }))}
                    />
                    Auto-Accept Incoming Orders into KDS
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Last Sync: {cfg.last_menu_sync_at ? new Date(cfg.last_menu_sync_at).toLocaleString('en-KE') : 'Never'} ({cfg.last_sync_status})
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        saveOmnichannelPlatform(plat.key, {
                          last_menu_sync_at: new Date().toISOString(),
                          last_sync_status: 'Menu synced',
                        })
                      }
                      className="flex-1 py-2 rounded-xl bg-emerald-700 text-white font-black inline-flex items-center justify-center gap-1"
                    >
                      <RefreshCw size={12} /> Sync Menu & Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 font-black text-sm text-slate-900">Omnichannel Incoming Events Log</div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Platform</th>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">External Order ID</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-3 px-4 text-slate-500">{new Date(ev.created_at).toLocaleString('en-KE')}</td>
                    <td className="py-3 px-4 font-bold uppercase">{ev.platform}</td>
                    <td className="py-3 px-4">{ev.event_type}</td>
                    <td className="py-3 px-4 font-mono">{ev.external_order_id || '—'}</td>
                    <td className="py-3 px-4 font-bold text-emerald-700 uppercase">{ev.status}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">No aggregator webhook events received yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: MERCHANT API KEYS & OUTBOUND WEBHOOKS */}
      {subTab === 'api-webhooks' && (
        <div className="space-y-4 text-xs">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm max-w-2xl">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-black text-slate-900">Merchant API Keys & Outbound Callback Webhooks</h3>
                <p className="text-slate-500">Receive real-time HTTP POST events for order creation, settlement, and inventory updates.</p>
              </div>
              <button type="button" onClick={generateApiKey} className="px-3.5 py-2 rounded-xl bg-emerald-700 text-white font-black">
                + Generate API Key
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder="https://erp.yourbusiness.co.ke/webhooks/manipos"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono"
              />
              <button type="button" onClick={saveWebhookCallback} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-black">
                Save Webhook URL
              </button>
            </div>

            <div className="space-y-2">
              {apiKeys.map((k) => (
                <div key={k.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{k.label}</p>
                    <p className="font-mono text-slate-600">Public: {k.public_key}</p>
                    <p className="font-mono text-slate-400">Webhook Secret: {k.webhook_secret}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">Active</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
