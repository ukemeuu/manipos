import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { KeyRound, ArrowRight, Loader2, Store, Lock } from 'lucide-react';
import { authenticateStaffPin } from '../services/data/staffService';

export function PinLogin({ tenantSlug: initialTenantSlug, onLoginSuccess }) {
    const [restaurantSlug, setRestaurantSlug] = useState(initialTenantSlug || 'littlelagos');
    const [pin, setPin] = useState(['', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (initialTenantSlug) {
            setRestaurantSlug(initialTenantSlug);
        }
    }, [initialTenantSlug]);

    // Focus management
    const handleInput = (index, value) => {
        if (value.length > 1) value = value.slice(-1);
        if (!/^\d*$/.test(value)) return;

        const newPin = [...pin];
        newPin[index] = value;
        setPin(newPin);

        if (value !== '' && index < 3) {
            const nextInput = document.getElementById(`pin-${index + 1}`);
            if (nextInput) nextInput.focus();
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && pin[index] === '' && index > 0) {
            const prevInput = document.getElementById(`pin-${index - 1}`);
            if (prevInput) prevInput.focus();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const enteredPin = pin.join('');
        if (enteredPin.length !== 4) return;
        if (!restaurantSlug.trim()) {
            setError('Please enter your Restaurant Code.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const cleanSlug = restaurantSlug.toLowerCase().trim();

            const result = await authenticateStaffPin(cleanSlug, enteredPin);

            if (result.success) {
                const staffPayload = result.staffUser;
                localStorage.setItem('pin_staff_user', JSON.stringify(staffPayload));

                onLoginSuccess({
                    access_token: 'staff_session_' + Date.now(),
                    staffUser: staffPayload
                }, cleanSlug);
                return;
            } else {
                throw new Error(result.error || 'Authentication error. Check security PIN.');
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'Authentication error. Check security PIN.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 text-left">
            <div className="space-y-2">
                <label htmlFor="restaurant-slug" className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Store size={14} className="text-orange-500" />
                    <span>Restaurant Code / Subdomain</span>
                </label>
                <div className="relative">
                    <input
                        id="restaurant-slug"
                        type="text"
                        required
                        placeholder="e.g. littlelagos"
                        value={restaurantSlug}
                        onChange={(e) => setRestaurantSlug(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none transition-all text-white font-bold text-sm tracking-wide placeholder:text-slate-600"
                    />
                    <span className="absolute right-4 top-3.5 text-xs font-bold text-slate-500 pointer-events-none">.pos.manipos.com</span>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Lock size={14} className="text-orange-500" />
                    <span>Staff 4-Digit Security PIN</span>
                </label>
                <div className="flex justify-between gap-3">
                    {pin.map((digit, i) => (
                        <input
                            key={i}
                            id={`pin-${i}`}
                            type="password"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            value={digit}
                            onChange={(e) => handleInput(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            className="w-14 h-14 text-center text-2xl font-black bg-slate-950 border border-slate-800 rounded-2xl focus:border-orange-500 focus:outline-none transition-all text-orange-400 shadow-inner"
                        />
                    ))}
                </div>
            </div>

            <div className="min-h-[20px]">
                {error && <p className="text-red-400 font-bold text-xs text-center animate-pulse">{error}</p>}
            </div>

            <button
                type="submit"
                disabled={loading || pin.join('').length !== 4 || !restaurantSlug.trim()}
                className="w-full flex justify-center items-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4 rounded-2xl font-black text-base hover:from-orange-600 hover:to-amber-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed group cursor-pointer"
            >
                {loading ? <Loader2 className="animate-spin" size={22} /> : (
                    <>
                        <span>Enter POS Register</span>
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </>
                )}
            </button>
        </form>
    );
}
