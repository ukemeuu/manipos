import React, { useState, useEffect } from 'react';
import { Mail, Lock, ArrowRight, Loader2, KeyRound, CheckCircle2, Store, User, Delete } from 'lucide-react';
import {
    authenticateStaffLogin,
    authenticateStaffQuickPin,
    fetchTerminalStaffRoster,
} from '../services/data/staffService';
import { supabase } from '../lib/supabase';

export function PinLogin({ tenantSlug: initialTenantSlug, onLoginSuccess }) {
    const [loginTab, setLoginTab] = useState(initialTenantSlug ? 'pin' : 'password'); // 'pin' | 'password'
    const [storeSlug, setStoreSlug] = useState(initialTenantSlug || '');
    const [pin, setPin] = useState(['', '', '', '']);
    const [staffRoster, setStaffRoster] = useState([]);
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [manualStaffName, setManualStaffName] = useState('');
    const [showNameInput, setShowNameInput] = useState(false);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'verify'
    const [otpCode, setOtpCode] = useState('');
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        if (initialTenantSlug) {
            setStoreSlug(initialTenantSlug);
        }
    }, [initialTenantSlug]);

    useEffect(() => {
        const clean = String(storeSlug || '').toLowerCase().trim();
        if (!clean || loginTab !== 'pin') {
            setStaffRoster([]);
            return;
        }
        let cancelled = false;
        fetchTerminalStaffRoster(clean).then((rows) => {
            if (!cancelled) {
                setStaffRoster(Array.isArray(rows) ? rows : []);
            }
        });
        return () => { cancelled = true; };
    }, [storeSlug, loginTab]);

    const handleSendResetCode = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setLoading(true);
        setError('');
        setNotice('');
        try {
            const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim());
            if (resetErr) throw resetErr;
            setNotice('Password reset code sent to your email.');
            setMode('verify');
        } catch (err) {
            setError(err.message || 'Could not send reset code. Contact your store manager if using a legacy PIN.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyReset = async (e) => {
        e.preventDefault();
        if (!email.trim() || !otpCode.trim() || !newPassword) return;
        setLoading(true);
        setError('');
        try {
            const { error: verifyErr } = await supabase.auth.verifyOtp({
                email: email.toLowerCase().trim(),
                token: otpCode.trim(),
                type: 'recovery',
            });
            if (verifyErr) throw verifyErr;
            const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
            if (updErr) throw updErr;
            setNotice('Password reset successfully! Sign in with your new password.');
            setMode('login');
            setPassword('');
            setOtpCode('');
            setNewPassword('');
        } catch (err) {
            setError(err.message || 'Invalid or expired reset code.');
        } finally {
            setLoading(false);
        }
    };

    const handlePinInput = (index, value) => {
        if (value.length > 1) value = value.slice(-1);
        if (!/^\d*$/.test(value)) return;
        const next = [...pin];
        next[index] = value;
        setPin(next);
        if (value !== '' && index < 3) {
            document.getElementById(`pin-digit-${index + 1}`)?.focus();
        }
    };

    const handlePinKeyDown = (index, e) => {
        if (e.key === 'Backspace' && pin[index] === '' && index > 0) {
            document.getElementById(`pin-digit-${index - 1}`)?.focus();
        }
    };

    const handleKeypadPress = (digit) => {
        if (loading) return;
        setError('');
        if (digit === 'clear') {
            setPin(['', '', '', '']);
            document.getElementById('pin-digit-0')?.focus();
            return;
        }
        if (digit === 'back') {
            const lastFilled = [...pin].reverse().findIndex((d) => d !== '');
            if (lastFilled !== -1) {
                const idx = 3 - lastFilled;
                const next = [...pin];
                next[idx] = '';
                setPin(next);
            }
            return;
        }
        const nextEmpty = pin.findIndex((d) => d === '');
        if (nextEmpty !== -1) {
            const next = [...pin];
            next[nextEmpty] = String(digit);
            setPin(next);
        }
    };

    const handlePinSubmit = async (e) => {
        e?.preventDefault();
        const enteredPin = pin.join('');
        if (enteredPin.length !== 4) return;
        const cleanSlug = String(storeSlug || initialTenantSlug || '').toLowerCase().trim();
        if (!cleanSlug) {
            setError('Enter your Store Code (e.g. potofjollof).');
            return;
        }

        setLoading(true);
        setError('');
        setNotice('');
        try {
            const selectedMember = staffRoster.find((s) => s.id === selectedStaffId);
            const result = await authenticateStaffQuickPin({
                tenantSlug: cleanSlug,
                pin: enteredPin,
                staffId: selectedStaffId || null,
                staffName: selectedMember?.name || manualStaffName,
            });

            if (result.success) {
                const staffPayload = result.staffUser;
                localStorage.setItem('pin_staff_user', JSON.stringify(staffPayload));
                onLoginSuccess(
                    {
                        access_token: 'staff_session_' + Date.now(),
                        staffUser: staffPayload,
                    },
                    staffPayload.tenantSlug || cleanSlug
                );
                return;
            }

            if (result.needsStaffName) {
                setShowNameInput(true);
            }
            setError(result.error || 'Incorrect PIN.');
            setPin(['', '', '', '']);
            document.getElementById('pin-digit-0')?.focus();
        } catch (err) {
            setError(err?.message || 'Could not verify PIN.');
            setPin(['', '', '', '']);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password) return;

        setLoading(true);
        setError('');
        setNotice('');

        try {
            const cleanEmail = email.toLowerCase().trim();
            const result = await authenticateStaffLogin(cleanEmail, password, initialTenantSlug || storeSlug || '');

            if (result.success) {
                const staffPayload = result.staffUser;
                localStorage.setItem('pin_staff_user', JSON.stringify(staffPayload));

                onLoginSuccess({
                    access_token: 'staff_session_' + Date.now(),
                    staffUser: staffPayload
                }, staffPayload.tenantSlug || initialTenantSlug);
                return;
            } else {
                throw new Error(result.error || 'Authentication error. Please check your email and password.');
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'Authentication error. Please check your email and password.');
        } finally {
            setLoading(false);
        }
    };

    if (mode === 'forgot') {
        return (
            <form onSubmit={handleSendResetCode} className="space-y-4 text-left">
                {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold p-3.5 rounded-2xl">{error}</div>}
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Mail size={14} className="text-orange-500" />
                        <span>Account Email</span>
                    </label>
                    <input
                        type="email"
                        required
                        placeholder="you@restaurant.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none text-white font-bold text-sm"
                    />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600 text-slate-950 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <><span>Send Reset Code</span><ArrowRight size={16} /></>}
                </button>
                <button type="button" onClick={() => { setMode('login'); setError(''); }} className="w-full text-xs font-bold text-slate-400 hover:text-white py-1">
                    &larr; Back to Sign In
                </button>
            </form>
        );
    }

    if (mode === 'verify') {
        return (
            <form onSubmit={handleVerifyReset} className="space-y-4 text-left">
                {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold p-3.5 rounded-2xl">{error}</div>}
                {notice && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold p-3 rounded-2xl">{notice}</div>}
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <KeyRound size={14} className="text-orange-500" />
                        <span>6-Digit Reset Code</span>
                    </label>
                    <input
                        type="text"
                        required
                        placeholder="123456"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none text-white font-bold text-sm"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Lock size={14} className="text-orange-500" />
                        <span>New Password</span>
                    </label>
                    <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="Minimum 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none text-white font-bold text-sm"
                    />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm py-3.5 rounded-2xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <><span>Set New Password</span><CheckCircle2 size={16} /></>}
                </button>
                <button type="button" onClick={() => { setMode('login'); setError(''); }} className="w-full text-xs font-bold text-slate-400 hover:text-white py-1">
                    &larr; Back to Sign In
                </button>
            </form>
        );
    }

    return (
        <div className="space-y-5 text-left">
            {/* Mode Switcher: Quick 4-Digit Staff PIN vs Email & Password */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-2xl">
                <button
                    type="button"
                    onClick={() => { setLoginTab('pin'); setError(''); setNotice(''); }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        loginTab === 'pin'
                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md'
                            : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <KeyRound size={14} />
                    <span>Staff PIN</span>
                </button>
                <button
                    type="button"
                    onClick={() => { setLoginTab('password'); setError(''); setNotice(''); }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        loginTab === 'password'
                            ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-md'
                            : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Mail size={14} />
                    <span>Email &amp; Password</span>
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold p-3.5 rounded-2xl">
                    {error}
                </div>
            )}
            {notice && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold p-3.5 rounded-2xl">
                    {notice}
                </div>
            )}

            {loginTab === 'pin' ? (
                <form onSubmit={handlePinSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="pin-store-slug" className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Store size={14} className="text-orange-500" />
                            <span>Store Code</span>
                        </label>
                        <div className="relative">
                            <input
                                id="pin-store-slug"
                                type="text"
                                required
                                readOnly={Boolean(initialTenantSlug)}
                                placeholder="e.g. potofjollof"
                                value={storeSlug}
                                onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                className={`w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none text-white font-bold text-sm placeholder:text-slate-600 ${initialTenantSlug ? 'opacity-85 cursor-default' : ''}`}
                            />
                            <span className="absolute right-4 top-3.5 text-[11px] font-bold text-slate-500 pointer-events-none">
                                .pos.manipos.com
                            </span>
                        </div>
                    </div>

                    {staffRoster.length > 0 && (
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <User size={13} className="text-orange-500" />
                                <span>Staff Member (Optional)</span>
                            </label>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                <button
                                    type="button"
                                    onClick={() => setSelectedStaffId('')}
                                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                                        !selectedStaffId
                                            ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    PIN Only
                                </button>
                                {staffRoster.map((member) => (
                                    <button
                                        key={member.id}
                                        type="button"
                                        onClick={() => setSelectedStaffId(member.id)}
                                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                                            selectedStaffId === member.id
                                                ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                        }`}
                                    >
                                        {member.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {showNameInput && staffRoster.length === 0 && (
                        <div className="space-y-1.5">
                            <label htmlFor="pin-staff-name" className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <User size={14} className="text-orange-500" />
                                <span>Staff Name</span>
                            </label>
                            <input
                                id="pin-staff-name"
                                type="text"
                                placeholder="Your first name / display name"
                                value={manualStaffName}
                                onChange={(e) => setManualStaffName(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none text-white font-bold text-sm placeholder:text-slate-600"
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Lock size={14} className="text-orange-500" />
                            <span>4-Digit Staff PIN</span>
                        </label>
                        <div className="grid grid-cols-4 gap-2.5">
                            {pin.map((digit, i) => (
                                <input
                                    key={i}
                                    id={`pin-digit-${i}`}
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) => handlePinInput(i, e.target.value)}
                                    onKeyDown={(e) => handlePinKeyDown(i, e)}
                                    className="w-full h-14 text-center text-2xl font-black bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none transition-all text-orange-400 shadow-inner"
                                />
                            ))}
                        </div>
                    </div>

                    {/* Touch-friendly Numeric PIN Keypad */}
                    <div className="grid grid-cols-3 gap-2 pt-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                            <button
                                key={num}
                                type="button"
                                onClick={() => handleKeypadPress(num)}
                                className="py-3 bg-slate-950 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-white font-black text-base transition-colors cursor-pointer"
                            >
                                {num}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => handleKeypadPress('clear')}
                            className="py-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={() => handleKeypadPress(0)}
                            className="py-3 bg-slate-950 hover:bg-slate-800 active:bg-slate-700 border border-slate-800 rounded-xl text-white font-black text-base transition-colors cursor-pointer"
                        >
                            0
                        </button>
                        <button
                            type="button"
                            onClick={() => handleKeypadPress('back')}
                            className="py-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 font-bold flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Backspace"
                        >
                            <Delete size={18} />
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || pin.join('').length !== 4 || !String(storeSlug || initialTenantSlug || '').trim()}
                        className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black text-sm py-4 rounded-2xl transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={18} />
                        ) : (
                            <>
                                <span>Enter POS with PIN</span>
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="staff-email" className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Mail size={14} className="text-orange-500" />
                            <span>Staff or Admin Email</span>
                        </label>
                        <input
                            id="staff-email"
                            type="email"
                            required
                            placeholder="you@restaurant.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none transition-all text-white font-bold text-sm placeholder:text-slate-600"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label htmlFor="staff-password" className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Lock size={14} className="text-orange-500" />
                                <span>Password</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => { setMode('forgot'); setError(''); setNotice(''); }}
                                className="text-[11px] font-bold text-amber-400 hover:text-amber-300 cursor-pointer"
                            >
                                Forgot password?
                            </button>
                        </div>
                        <input
                            id="staff-password"
                            type="password"
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none transition-all text-white font-bold text-sm placeholder:text-slate-600"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black text-sm py-4 rounded-2xl transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={18} />
                        ) : (
                            <>
                                <span>Sign In to Workspace</span>
                                <ArrowRight size={16} />
                            </>
                        )}
                    </button>

                    <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                        Supports both ManiPOS accounts and existing <span className="text-slate-200 font-semibold">pojmanagement.com</span> Admin &amp; Staff passwords.
                    </p>
                </form>
            )}

            {initialTenantSlug && (
                <div className="pt-2 border-t border-slate-800/80 text-center">
                    <a
                        href="https://pos.manipos.com/"
                        className="text-[11px] font-bold text-slate-400 hover:text-orange-400 transition-colors"
                    >
                        Signing into a different restaurant? Switch store &rarr;
                    </a>
                </div>
            )}
        </div>
    );
}
