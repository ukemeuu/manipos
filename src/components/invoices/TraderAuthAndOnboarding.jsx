import React, { useState } from 'react';
import { FileText, Loader2, Upload, CheckCircle2, Mail, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SEND_MONEY_PROVIDERS } from '../../lib/traderInvoices';

export function TraderPaymentSetupFields({ value, onChange, compact = false }) {
  const [selectedType, setSelectedType] = useState(() => {
    if (value?.mpesa_paybill_no) return 'paybill';
    if (value?.send_money_number) return 'send_money';
    return 'till';
  });

  const update = (patch) => onChange({ ...value, ...patch });

  return (
    <div className={compact ? 'p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5' : 'p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5'}>
      <p className="font-black text-amber-900 uppercase tracking-wider text-[10px]">
        Payment Options Shown on Invoices &amp; Receipts (Optional)
      </p>

      <div>
        <label className="text-[11px] font-bold text-amber-900 block mb-1">Select Payment Type</label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold text-slate-900"
        >
          <option value="till">M-Pesa Till No (Buy Goods)</option>
          <option value="paybill">M-Pesa Paybill</option>
          <option value="send_money">Send Money (M-Pesa / Airtel)</option>
        </select>
      </div>

      {selectedType === 'till' && (
        <input
          type="text"
          value={value?.mpesa_till_no || ''}
          onChange={(e) => update({ mpesa_till_no: e.target.value })}
          placeholder="Enter M-Pesa Till No"
          className="w-full px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs text-slate-900"
        />
      )}

      {selectedType === 'paybill' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={value?.mpesa_paybill_no || ''}
            onChange={(e) => update({ mpesa_paybill_no: e.target.value })}
            placeholder="Paybill No"
            className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs text-slate-900"
          />
          <input
            type="text"
            value={value?.mpesa_account_no || ''}
            onChange={(e) => update({ mpesa_account_no: e.target.value })}
            placeholder="Account No"
            className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs text-slate-900"
          />
        </div>
      )}

      {selectedType === 'send_money' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={value?.send_money_provider || 'M-Pesa'}
            onChange={(e) => update({ send_money_provider: e.target.value })}
            className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs font-bold text-slate-900"
          >
            {SEND_MONEY_PROVIDERS.map((prov) => (
              <option key={prov} value={prov}>{prov}</option>
            ))}
          </select>
          <input
            type="text"
            value={value?.send_money_number || ''}
            onChange={(e) => update({ send_money_number: e.target.value })}
            placeholder="Phone Number (e.g. 0712345678)"
            className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs text-slate-900"
          />
        </div>
      )}

      {(value?.mpesa_till_no || value?.mpesa_paybill_no || value?.send_money_number) && (
        <p className="text-[11px] text-amber-900 font-semibold">
          Saved:{' '}
          {[
            value?.mpesa_till_no ? `Till ${value.mpesa_till_no}` : '',
            value?.mpesa_paybill_no ? `Paybill ${value.mpesa_paybill_no}${value.mpesa_account_no ? ` (${value.mpesa_account_no})` : ''}` : '',
            value?.send_money_number ? `${value.send_money_provider || 'M-Pesa'} ${value.send_money_number}` : '',
          ].filter(Boolean).join(' · ')}
        </p>
      )}
      <p className="text-[11px] text-amber-800">Cash &amp; Cheque options are enabled by default.</p>
    </div>
  );
}

export function TraderAuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'magic'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    const redirectOrigin =
      typeof window !== 'undefined' && !window.location.origin.includes('localhost')
        ? window.location.origin
        : 'https://manipos.com';
    const emailRedirectTo = `${redirectOrigin}/?page=invoices`;

    try {
      if (mode === 'magic') {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('send-trader-auth-email', {
          body: { email: email.trim(), mode: 'magic', redirectTo: emailRedirectTo },
        });
        if (fnErr || fnData?.error) {
          const { error: err } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo },
          });
          if (err) throw err;
        }
        setNotice('Check your email for a 1-click ManiPOS sign-in link.');
      } else if (mode === 'signup') {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('send-trader-auth-email', {
          body: { email: email.trim(), password, mode: 'signup', redirectTo: emailRedirectTo },
        });
        if (!fnErr && !fnData?.error) {
          setNotice('Verification email sent from ManiPOS! Check your inbox and click Verify Email.');
          setMode('signin');
        } else {
          const { data, error: err } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo },
          });
          if (err) throw err;
          if (data?.user && data?.session) {
            onSignedIn?.(data.session);
          } else {
            setNotice('Account created! Check your email to verify, then sign in.');
            setMode('signin');
          }
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (data?.session) onSignedIn?.(data.session);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
            <FileText size={22} />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">ManiPOS Invoices</h1>
            <p className="text-xs font-semibold text-slate-500">Simple invoices &amp; receipts for suppliers &amp; traders</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          {[
            { id: 'signin', label: 'Sign In' },
            { id: 'signup', label: 'Create Account' },
            { id: 'magic', label: 'Email Link' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setMode(t.id); setError(''); setNotice(''); }}
              className={`py-2 rounded-lg transition cursor-pointer ${mode === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">{error}</div>}
        {notice && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">{notice}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@example.com"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {mode !== 'magic' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {mode === 'magic' ? 'Send Sign-In Link' : mode === 'signup' ? 'Create Free Account (10 Docs/mo)' : 'Sign In'}
          </button>
        </form>

        <p className="text-[11px] text-center text-slate-400 font-semibold">
          Free Forever
        </p>
      </div>
    </div>
  );
}

export function TraderOnboardingSetup({ user, onCompleted }) {
  const [businessName, setBusinessName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentCfg, setPaymentCfg] = useState({
    mpesa_till_no: '',
    mpesa_paybill_no: '',
    mpesa_account_no: '',
    send_money_provider: 'M-Pesa',
    send_money_number: '',
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleLogoUpload = async (file) => {
    if (!file || !user?.id) return;
    setUploadingLogo(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
      const path = `trader-logos/${user.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('menu_images').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('menu_images').getPublicUrl(path);
      if (data?.publicUrl) setLogoUrl(data.publicUrl);
    } catch (err) {
      setError('Logo upload failed: ' + (err.message || err));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Business Name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        id: user.id,
        business_name: businessName.trim(),
        logo_url: logoUrl.trim() || null,
        kra_pin: kraPin.trim() || null,
        location: location.trim() || null,
        phone: phone.trim() || null,
        email: user.email || null,
        mpesa_till_no: paymentCfg.mpesa_till_no.trim() || null,
        mpesa_paybill_no: paymentCfg.mpesa_paybill_no.trim() || null,
        mpesa_account_no: paymentCfg.mpesa_account_no.trim() || null,
        send_money_provider: paymentCfg.send_money_number.trim() ? (paymentCfg.send_money_provider || 'M-Pesa') : null,
        send_money_number: paymentCfg.send_money_number.trim() || null,
        accepts_cash: true,
        accepts_cheque: true,
        currency: 'KES',
        plan: 'free',
      };
      let res = await supabase
        .from('trader_profiles')
        .upsert([payload])
        .select('*')
        .single();
      if (res.error && String(res.error.message || '').toLowerCase().includes('send_money')) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.send_money_provider;
        delete fallbackPayload.send_money_number;
        res = await supabase
          .from('trader_profiles')
          .upsert([fallbackPayload])
          .select('*')
          .single();
      }
      if (res.error) throw res.error;
      onCompleted?.(res.data);
    } catch (err) {
      setError(err.message || 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <h2 className="text-xl font-black text-slate-900">Set Up Your Business</h2>
          <p className="text-xs text-slate-500 mt-1">
            Only <strong>Business Name</strong> is required. Everything else is optional and can be added later.
          </p>
        </div>

        {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">{error}</div>}

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-800 block mb-1">
              Business Name <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Prime Meats & Poultry Supplies"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-600 block mb-1">KRA PIN (Optional)</label>
              <input
                type="text"
                value={kraPin}
                onChange={(e) => setKraPin(e.target.value)}
                placeholder="e.g. A001234567Z"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="font-bold text-slate-600 block mb-1">Location (Optional)</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Burma Market, Nairobi"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-600 block mb-1">Phone Number (Optional)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0712 345 678"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="font-bold text-slate-600 block mb-1">Business Logo (Optional)</label>
              <label className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-amber-400">
                {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : logoUrl ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Upload size={14} />}
                <span className="font-bold text-slate-700">{logoUrl ? 'Logo Uploaded' : 'Upload Logo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
                />
              </label>
            </div>
          </div>

          <TraderPaymentSetupFields value={paymentCfg} onChange={setPaymentCfg} />

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm transition cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Start Creating Invoices'}
          </button>
        </form>
      </div>
    </div>
  );
}
