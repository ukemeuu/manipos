import React, { useState } from 'react';
import { FileText, Loader2, Upload, CheckCircle2, Mail, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
    try {
      if (mode === 'magic') {
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: `${window.location.origin}/#/invoices` },
        });
        if (err) throw err;
        setNotice('Check your email for a 1-click sign-in link.');
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        if (data?.user && data?.session) {
          onSignedIn?.(data.session);
        } else {
          setNotice('Account created! Check your email to confirm, or sign in below.');
          setMode('signin');
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

        <p className="text-[11px] text-center text-slate-400">
          Free for up to 10 invoices/receipts per month · KES 290/mo for 30+30 · KES 700/mo Unlimited
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
  const [mpesaTillNo, setMpesaTillNo] = useState('');
  const [mpesaPaybillNo, setMpesaPaybillNo] = useState('');
  const [mpesaAccountNo, setMpesaAccountNo] = useState('');
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
        mpesa_till_no: mpesaTillNo.trim() || null,
        mpesa_paybill_no: mpesaPaybillNo.trim() || null,
        mpesa_account_no: mpesaAccountNo.trim() || null,
        accepts_cash: true,
        accepts_cheque: true,
        currency: 'KES',
        plan: 'free',
      };
      const { data, error: err } = await supabase
        .from('trader_profiles')
        .upsert([payload])
        .select('*')
        .single();
      if (err) throw err;
      onCompleted?.(data);
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

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
            <p className="font-black text-amber-900 uppercase tracking-wider text-[10px]">
              Payment Options Shown on Invoices &amp; Receipts (Optional)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={mpesaTillNo}
                onChange={(e) => setMpesaTillNo(e.target.value)}
                placeholder="M-Pesa Till No"
                className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs text-slate-900"
              />
              <input
                type="text"
                value={mpesaPaybillNo}
                onChange={(e) => setMpesaPaybillNo(e.target.value)}
                placeholder="M-Pesa Paybill"
                className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs text-slate-900"
              />
              <input
                type="text"
                value={mpesaAccountNo}
                onChange={(e) => setMpesaAccountNo(e.target.value)}
                placeholder="Paybill Account"
                className="px-3 py-2 bg-white border border-amber-200 rounded-lg text-xs text-slate-900"
              />
            </div>
            <p className="text-[11px] text-amber-800">Cash &amp; Cheque options are enabled by default.</p>
          </div>

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
