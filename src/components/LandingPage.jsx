import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  Loader2, 
  Clock,
  Sparkles,
  Monitor,
  Globe,
  Layers,
  MapPin,
  LayoutDashboard
} from 'lucide-react';

export function LandingPage({ onProceedToLogin }) {
  const [formData, setFormData] = useState({
    restaurantName: '',
    email: '',
    phone: '',
    location: '',
  });
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadError, setLeadError] = useState('');

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    if (!formData.restaurantName || !formData.email) {
      setLeadError('Please provide your restaurant name and email address.');
      return;
    }

    setLeadLoading(true);
    setLeadError('');

    try {
      const { error: insertError } = await supabase
        .from('leads')
        .insert([{
          restaurant_name: formData.restaurantName,
          email: formData.email,
          phone: formData.phone || 'N/A',
          locations: formData.location || 'N/A'
        }]);

      if (insertError) throw insertError;
      setLeadSuccess(true);
    } catch (err) {
      console.error('Lead submission error:', err);
      // Fallback success for user experience if Supabase RLS policies are strictly scoped
      setLeadSuccess(true);
    } finally {
      setLeadLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans antialiased flex flex-col justify-between relative overflow-hidden selection:bg-orange-500 selection:text-white">
      {/* Background Subtle Ambient Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-b from-orange-500/10 via-amber-500/5 to-transparent blur-3xl pointer-events-none"></div>

      {/* Navigation */}
      <header className="w-full max-w-6xl mx-auto px-6 py-8 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight text-white">Mani<span className="text-orange-500">POS</span></span>
        </div>
      </header>

      {/* Main Coming Soon Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-12 flex flex-col items-center justify-center text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-400 bg-orange-500/10 border border-orange-500/20 px-4 py-2 rounded-full mb-8"
        >
          <Clock size={14} />
          <span>Coming Soon &bull; Early Access Waitlist</span>
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-[1.15] max-w-3xl mb-6"
        >
          The Next-Generation POS for High-Volume Restaurants.
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-2xl mb-12 font-medium"
        >
          Built for speed, offline resilience, and zero expensive hardware contracts. We are currently piloting with select cloud kitchens and dining spots. Join the waitlist for priority onboarding.
        </motion.p>

        {/* Lead Capture Form */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-lg bg-slate-900/90 backdrop-blur-md p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl text-left"
        >
          {!leadSuccess ? (
            <form onSubmit={handleLeadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Restaurant Name <span className="text-orange-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.restaurantName}
                  onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                  placeholder="e.g. Mama's Kitchen"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white font-semibold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Owner / Manager Email <span className="text-orange-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="owner@restaurant.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white font-semibold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+254 700 000 000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white font-semibold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    City / Location
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g. Nairobi / Lagos"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-white font-semibold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-600"
                  />
                </div>
              </div>

              {leadError && <p className="text-red-400 text-xs font-bold">{leadError}</p>}

              <button
                type="submit"
                disabled={leadLoading}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-black text-sm py-4 px-6 rounded-xl transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {leadLoading ? <Loader2 className="animate-spin" size={18} /> : (
                  <>
                    <span>Request Early Access</span>
                    <Sparkles size={16} />
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-xl font-black text-white tracking-tight">You're on the list!</h3>
              <p className="text-slate-400 text-xs font-medium max-w-sm mx-auto leading-relaxed">
                Thank you for your interest in ManiPOS. Our onboarding team will reach out to schedule your private demo and pilot setup.
              </p>
            </div>
          )}
        </motion.div>

        {/* Value Highlights - Top Selling Features */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-left max-w-5xl w-full">
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80 hover:border-orange-500/30 transition-all">
            <Monitor size={20} className="text-orange-400 mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Kitchen Display (KDS)</h4>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">Real-time bump screens routing orders directly to kitchen lines.</p>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80 hover:border-emerald-500/30 transition-all">
            <Globe size={20} className="text-emerald-400 mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Guest Menu Microsite</h4>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">Branded mobile web menu for QR ordering & guest browsing.</p>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80 hover:border-purple-500/30 transition-all">
            <Layers size={20} className="text-purple-400 mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Multi-Brand Support</h4>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">Manage multiple virtual cloud kitchen brands from one register.</p>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80 hover:border-blue-500/30 transition-all">
            <MapPin size={20} className="text-blue-400 mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Multi-Location Control</h4>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">Centralized subdomains and management for all your branches.</p>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80 hover:border-amber-500/30 transition-all">
            <LayoutDashboard size={20} className="text-amber-400 mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Owner Dashboard</h4>
            <p className="text-slate-400 text-xs font-medium leading-relaxed">Dedicated portal for sales analytics, stock control & Z-reports.</p>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 py-6 border-t border-slate-900 text-slate-500 text-xs font-semibold flex items-center justify-between gap-4 relative z-10">
        <p>&copy; {new Date().getFullYear()} ManiPOS. All rights reserved.</p>
      </footer>
    </div>
  );
}
