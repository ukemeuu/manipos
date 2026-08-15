import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, Loader2, UserCheck } from 'lucide-react';
import { authenticateStaffLogin } from '../services/data/staffService';

export function PinLogin({ tenantSlug: initialTenantSlug, onLoginSuccess }) {
    const [email, setEmail] = useState('admin@demostore.com');
    const [password, setPassword] = useState('demostore2026');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email.trim() || !password) return;

        setLoading(true);
        setError('');

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

    return (
        <form onSubmit={handleSubmit} className="space-y-5 text-left">
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold p-3.5 rounded-2xl">
                    {error}
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
                    placeholder="e.g. cashier@demostore.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none transition-all text-white font-bold text-sm placeholder:text-slate-600"
                />
            </div>

            <div className="space-y-1.5">
                <label htmlFor="staff-password" className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Lock size={14} className="text-orange-500" />
                    <span>Password</span>
                </label>
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

            {/* Demo Quick Fill Controls */}
            <div className="pt-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Quick Demo Accounts:</p>
                <div className="flex flex-wrap gap-2">
                    {[
                        { label: 'Admin', email: 'admin@demostore.com', pass: 'demostore2026' },
                        { label: 'Cashier', email: 'cashier@demostore.com', pass: 'cashier2026' },
                        { label: 'Waiter', email: 'waiter@demostore.com', pass: 'waiter2026' }
                    ].map(acc => (
                        <button
                            key={acc.email}
                            type="button"
                            onClick={() => {
                                setEmail(acc.email);
                                setPassword(acc.pass);
                            }}
                            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                        >
                            <UserCheck size={11} className="text-orange-400" />
                            <span>{acc.label}</span>
                        </button>
                    ))}
                </div>
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
                        <span>Sign In to Terminal</span>
                        <ArrowRight size={16} />
                    </>
                )}
            </button>
        </form>
    );
}
