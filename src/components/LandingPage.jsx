import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  Loader2, 
  Zap,
  BarChart3,
  Users,
  RefreshCw,
  Monitor,
  Globe,
  Layers,
  MapPin,
  LayoutDashboard,
  ArrowRight,
  Clock,
  Sparkles
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
      setLeadError('Please fill in your restaurant name and email address.');
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
      setLeadSuccess(true);
    } finally {
      setLeadLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-orange-500 selection:text-white flex flex-col justify-between">
      {/* Header Navigation */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between bg-slate-50 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight text-slate-900">Mani<span className="text-orange-500">POS</span></span>
        </div>

        <div className="flex items-center gap-4">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Early Access Opening Soon</span>
          </div>
        </div>
      </header>

      {/* Main Hero & Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-6 pb-20 space-y-16">
        {/* Top Hero Grid */}
        <div className="flex flex-col lg:flex-row items-center gap-12 text-left">
          {/* Left Text & Form */}
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-extrabold text-orange-600 bg-orange-100/80 border border-orange-200 px-4 py-1.5 rounded-full">
              <Sparkles size={14} className="text-orange-500" />
              <span>RESTAURANT MANAGEMENT ENGINE</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight">
              All-in-One Restaurant POS & Cloud Kitchen Software.
            </h1>

            <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl font-normal">
              Manage your orders, kitchen displays, guest online menus, multi-brand outlets, and owner analytics from one clean unified platform.
            </p>

            {/* Early Access Signup Form Card */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 max-w-xl">
              <h3 className="text-lg font-black text-slate-900 mb-1">Get Early Access & Private Demo</h3>
              <p className="text-xs font-semibold text-slate-500 mb-6">Interested restaurants can begin signing up below for priority pilot onboarding.</p>

              {!leadSuccess ? (
                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Restaurant Name <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.restaurantName}
                        onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                        placeholder="e.g. Little Lagos"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Owner Email <span className="text-orange-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="owner@restaurant.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+254 700 000 000"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        City / Location
                      </label>
                      <input
                        type="text"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder="e.g. Nairobi"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {leadError && <p className="text-red-500 text-xs font-bold">{leadError}</p>}

                  <button
                    type="submit"
                    disabled={leadLoading}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black text-sm py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {leadLoading ? <Loader2 className="animate-spin" size={18} /> : (
                      <>
                        <span>Join Early Access List</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="py-6 text-center space-y-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                    <CheckCircle2 size={26} />
                  </div>
                  <h4 className="text-base font-black text-slate-900">You're on the early list!</h4>
                  <p className="text-slate-600 text-xs font-semibold max-w-xs mx-auto">
                    We will reach out to schedule your private demo before public launch.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right PosBytz-Style Hardware & Interface Photo Mockup */}
          <div className="flex-1 w-full flex justify-center lg:justify-end">
            <div className="bg-white p-3 rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-w-2xl w-full">
              <img 
                src="/posbytz_hero.png" 
                alt="ManiPOS Kitchen & Register Setup" 
                className="w-full h-auto rounded-2xl object-cover" 
              />
            </div>
          </div>
        </div>

        {/* PosBytz-Style White 4-Column Feature Highlight Bar */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200/90 shadow-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-center divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          <div className="flex flex-col items-center pt-4 lg:pt-0 lg:px-4">
            <div className="w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
              <Zap size={26} />
            </div>
            <h4 className="text-base font-extrabold text-slate-900 mb-1.5">Instant Menu Sync</h4>
            <p className="text-xs font-semibold text-slate-500 max-w-xs leading-relaxed">
              Instant sync of menu, pricing, and inventory changes across all devices.
            </p>
          </div>

          <div className="flex flex-col items-center pt-4 lg:pt-0 lg:px-4">
            <div className="w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
              <BarChart3 size={26} />
            </div>
            <h4 className="text-base font-extrabold text-slate-900 mb-1.5">Real-Time Sales Data</h4>
            <p className="text-xs font-semibold text-slate-500 max-w-xs leading-relaxed">
              Real-time sales data, item velocity, and revenue reports across all locations.
            </p>
          </div>

          <div className="flex flex-col items-center pt-4 lg:pt-0 lg:px-4">
            <div className="w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
              <Users size={26} />
            </div>
            <h4 className="text-base font-extrabold text-slate-900 mb-1.5">Staff & Permissions</h4>
            <p className="text-xs font-semibold text-slate-500 max-w-xs leading-relaxed">
              Centralized staff PINs, cashier shift tracking, and role permission management.
            </p>
          </div>

          <div className="flex flex-col items-center pt-4 lg:pt-0 lg:px-4">
            <div className="w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 mb-4">
              <RefreshCw size={26} />
            </div>
            <h4 className="text-base font-extrabold text-slate-900 mb-1.5">No Batch Processing</h4>
            <p className="text-xs font-semibold text-slate-500 max-w-xs leading-relaxed">
              No batch processing — all ticket edits and order updates apply immediately.
            </p>
          </div>
        </div>

        {/* Top 5 Selling Features Grid */}
        <div className="space-y-8 pt-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-block bg-orange-100 text-orange-700 font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
              Core Platform Capabilities
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              Built Specifically for Modern Restaurants & Kitchens
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 text-left">
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                <Monitor size={22} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Kitchen Display (KDS)</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Real-time bump screens routing orders directly to kitchen stations with ticket timers.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                <Globe size={22} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Guest Menu Microsite</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Branded mobile web menu for QR code table ordering & guest browsing.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                <Layers size={22} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Multi-Brand Support</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Manage multiple virtual cloud kitchen brands seamlessly from one POS terminal.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                <MapPin size={22} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Multi-Location Control</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Centralized subdomains and management across all your restaurant branches.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                <LayoutDashboard size={22} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Owner Dashboard</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Dedicated portal for real-time sales analytics, stock control & Z-reports.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-8 border-t border-slate-200/80 text-slate-500 text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-slate-900 font-black text-sm">Mani<span className="text-orange-500">POS</span></span>
          <span>&bull; Restaurant Software Engine</span>
        </div>
        <p>&copy; {new Date().getFullYear()} ManiPOS. All rights reserved.</p>
      </footer>
    </div>
  );
}
