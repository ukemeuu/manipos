import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { KeyRound, ArrowRight, Loader2, PackageSearch } from 'lucide-react';

export function PinLogin({ onLoginSuccess }) {
    const [restaurantSlug, setRestaurantSlug] = useState('');
    const [pin, setPin] = useState(['', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Focus management
    const handleInput = (index, value) => {
        if (value.length > 1) value = value.slice(-1); // Only take last char
        if (!/^\d*$/.test(value)) return; // Only numbers

        const newPin = [...pin];
        newPin[index] = value;
        setPin(newPin);

        // Auto-advance focus
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
            const email = import.meta.env.VITE_RECEIVER_EMAIL || 'receiver@poj.com';
            const password = import.meta.env.VITE_RECEIVER_PASSWORD || 'poj_receive_goods';

            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) throw authError;

            if (data.session) {
                const staffPayload = {
                    name: 'Admin Developer',
                    role: 'admin',
                    restaurantId: 'f14f891f-9c26-43ae-bf87-45758248256a',
                    restaurantName: 'Mani Kitchen'
                };

                localStorage.setItem('pin_staff_user', JSON.stringify(staffPayload));

                onLoginSuccess({
                    ...data.session,
                    staffUser: staffPayload
                });
            }
        } catch (err) {
            console.error(err);
            setError(err.message || 'System error. Please contact admin.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50/50 p-4 font-sans text-secondary">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100"
            >
                <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 bg-blue-50 text-blue-500 flex justify-center items-center rounded-2xl mb-4">
                        <PackageSearch size={32} />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight text-center">Staff Terminal</h2>
                    <p className="text-gray-500 font-medium text-xs mt-1 text-center">Enter your restaurant code and 4-digit security PIN to log in.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-1.5">
                        <label htmlFor="restaurant-slug" className="text-xs font-bold text-gray-400 uppercase tracking-wider">Restaurant Code</label>
                        <input
                            id="restaurant-slug"
                            type="text"
                            required
                            placeholder="e.g. cloudkitchen"
                            value={restaurantSlug}
                            onChange={(e) => setRestaurantSlug(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-2xl focus:border-primary focus:bg-white focus:outline-none transition-colors font-semibold"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Security PIN</label>
                        <div className="flex justify-between gap-3 px-1">
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
                                    className="w-12 h-14 text-center text-2xl font-bold bg-gray-50 border-2 border-gray-200 rounded-2xl focus:border-primary focus:bg-white focus:outline-none transition-colors shadow-inner"
                                />
                            ))}
                        </div>
                    </div>

                    <div className="min-h-[24px]">
                        {error && <p className="text-red-500 font-bold text-sm text-center animate-pulse">{error}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={loading || pin.join('').length !== 4 || !restaurantSlug.trim()}
                        className="w-full flex justify-center items-center gap-2 bg-gray-900 text-white p-4 rounded-2xl font-bold text-lg hover:bg-black transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {loading ? <Loader2 className="animate-spin" size={24} /> : (
                            <>
                                Open Terminal <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>

                    <div className="text-center">
                        <span className="text-[10px] font-bold text-gray-300">
                            MANIPOS v1.0
                        </span>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
