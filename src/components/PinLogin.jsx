import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, KeyRound, CheckCircle2 } from 'lucide-react';
import { authenticateStaffLogin } from '../services/data/staffService';
import { supabase } from '../lib/supabase';

export function PinLogin({ tenantSlug: initialTenantSlug, onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'verify'
    const [otpCode, setOtpCode] = useState('');
    const [newPassword, setNewPassword] = useState('');

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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password) return;

        setLoading(true);
        setError('');
        setNotice('');

        try {
            const cleanEmail = email.toLowerCase().trim();
            const result = await authenticateStaffLogin(cleanEmail, password);

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
        <form onSubmit={handleSubmit} className="space-y-5 text-left">
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

            <div className="space-y-1.5">
                <label htmlFor="staff-email" className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Mail size={14} className="text-orange-500" />
                    <span>Staff Email Address</span>
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
        </form>
    );
}
