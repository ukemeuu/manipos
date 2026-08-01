import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Loader2, 
  ChevronDown,
  Wifi,
  Smartphone,
  Printer,
  Sparkles,
  Zap,
  ShieldCheck,
  ArrowRight,
  Calculator,
  Building2,
  DollarSign
} from 'lucide-react';

export function LandingPage({ onProceedToLogin }) {
  // Lead form state
  const [formData, setFormData] = useState({
    restaurantName: '',
    email: '',
  });
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadError, setLeadError] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState(0);

  // Interactive ROI Calculator State
  const [monthlyOrders, setMonthlyOrders] = useState(2500);

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    if (!formData.restaurantName || !formData.email) {
      setLeadError('Please fill in your restaurant name and email.');
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
          restaurant_size: 'N/A',
          locations: '1'
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

  const faqData = [
    {
      q: "How does ManiPOS compare to Toast POS?",
      a: "Like Toast POS, ManiPOS is built specifically for restaurants with fast order entry, kitchen display support, and offline resilience. However, ManiPOS requires zero proprietary hardware ($0 hardware lock-in), works on any tablet or web browser, and features native M-PESA & instant African payment reconciliations."
    },
    {
      q: "Does ManiPOS work offline when Wi-Fi drops?",
      a: "Yes! ManiPOS uses a local-first offline architecture. Orders, kitchen thermal printing, and table management continue seamlessly even during internet outages, syncing automatically when connection restores."
    },
    {
      q: "Can I run ManiPOS on multiple subdomains or locations?",
      a: "Absolutely. ManiPOS features native multi-tenant subdomain routing (e.g. pos.manipos.com or littlelagos.pos.manipos.com), allowing multi-location brands to isolate menus, staff PINs, and daily Z-reports."
    },
    {
      q: "Do I need special thermal printers or card terminals?",
      a: "No. ManiPOS connects to any standard ESC/POS network, Bluetooth, or USB thermal receipt printer using our built-in QZ WebPrint bridge, saving you thousands on specialized hardware."
    }
  ];

  const calculateSavings = () => {
    // Toast average hardware + SaaS fee vs ManiPOS flat rate
    const legacyCost = monthlyOrders * 0.35 + 150;
    const maniposCost = 49;
    return Math.max(0, Math.round(legacyCost - maniposCost));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-orange-500 selection:text-white flex flex-col">
      {/* Toast-Style Announcement Bar */}
      <div className="bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 text-white text-xs font-bold py-2.5 px-4 text-center tracking-wide flex items-center justify-center gap-2 shadow-sm">
        <Sparkles size={14} className="animate-pulse" />
        <span>Toast-Level Speed. Zero Hardware Lock-In. Native Subdomain Multi-Tenancy!</span>
        <button 
          onClick={() => onProceedToLogin()} 
          className="underline font-black hover:text-slate-100 transition-colors ml-2 cursor-pointer"
        >
          Launch Terminal &rarr;
        </button>
      </div>

      {/* Modern Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between z-40 bg-slate-50/80 backdrop-blur-md sticky top-0 border-b border-slate-200/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 text-white font-black text-xl">
            M
          </div>
          <div>
            <span className="text-2xl font-black tracking-tight text-slate-900">Mani<span className="text-orange-500">POS</span></span>
            <span className="block text-[10px] font-bold text-orange-600 uppercase tracking-widest -mt-1">Toast for Africa</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-600">
          <a href="#features" className="hover:text-orange-600 transition-colors">Features</a>
          <a href="#calculator" className="hover:text-orange-600 transition-colors">ROI Calculator</a>
          <a href="#faq" className="hover:text-orange-600 transition-colors">FAQ</a>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => onProceedToLogin()}
            className="bg-slate-900 hover:bg-orange-600 text-white font-bold text-sm px-6 py-2.5 rounded-xl transition-all shadow-md hover:shadow-orange-500/20 flex items-center gap-2 cursor-pointer transform active:scale-95"
          >
            <span>Log In to POS</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-12 pb-20 flex flex-col lg:flex-row items-center gap-12 text-left">
        <div className="flex-1 flex flex-col items-start w-full">
          <div className="inline-flex items-center gap-2 text-xs font-extrabold text-orange-700 bg-orange-100/80 border border-orange-200 px-4 py-2 rounded-full mb-6">
            <Zap size={14} className="text-orange-600" />
            <span>BUILT FOR HIGH-VOLUME RESTAURANTS & CLOUD KITCHENS</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight mb-6">
            The Restaurant POS <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500">
              Kitchens Actually Love.
            </span>
          </h1>

          <p className="text-slate-600 text-lg leading-relaxed max-w-xl mb-8 font-medium">
            Ultra-fast ordering, Toast-level reliability, offline resilience, and instant thermal printing. Run on any iPad, tablet, or browser without expensive hardware contracts.
          </p>

          {/* Lead Capture Form */}
          <div className="w-full max-w-xl bg-white p-6 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 mb-8">
            {!leadSuccess ? (
              <form onSubmit={handleLeadSubmit} className="flex flex-col sm:flex-row gap-3 w-full">
                <input
                  type="text"
                  required
                  value={formData.restaurantName}
                  onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                  placeholder="Restaurant Name"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400"
                />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Owner Email"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={leadLoading}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-black text-sm py-3 px-6 rounded-xl transition-all shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {leadLoading ? <Loader2 className="animate-spin" size={16} /> : 'Get Early Access'}
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-center gap-3 py-4 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-2xl font-bold">
                <CheckCircle2 size={22} className="text-emerald-600" />
                <span>You're on the priority list! We'll reach out within 2 hours.</span>
              </div>
            )}
            {leadError && <p className="text-red-500 text-xs font-bold mt-3">{leadError}</p>}
          </div>

          {/* Quick Feature Badges */}
          <div className="flex flex-wrap items-center gap-6 text-xs font-extrabold text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-emerald-500" />
              <span>100% Offline First</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-blue-500" />
              <span>Subdomain Multi-Tenant</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-amber-500" />
              <span>Zero Hardware Lock-In</span>
            </div>
          </div>
        </div>

        {/* Hero Image Showcase */}
        <div className="flex-1 w-full flex justify-center lg:justify-end relative">
          <div className="absolute -inset-4 bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl blur-2xl opacity-15"></div>
          <div className="relative bg-white p-3 rounded-3xl border border-slate-200/80 shadow-2xl overflow-hidden max-w-xl">
            <img 
              src="/hero_mockup.png" 
              alt="ManiPOS Toast Inspired Interface" 
              className="w-full h-auto rounded-2xl object-cover" 
            />
            <div className="absolute bottom-6 left-6 right-6 bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-2xl border border-slate-700/80 flex items-center justify-between shadow-xl">
              <div>
                <p className="text-xs font-black text-orange-400 uppercase tracking-wider">Live Terminal Status</p>
                <p className="text-sm font-bold text-slate-100">pos.manipos.com &bull; Online</p>
              </div>
              <button
                onClick={() => onProceedToLogin()}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-black px-4 py-2 rounded-xl transition-all cursor-pointer shadow-md"
              >
                Try Demo &rarr;
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Colorful Toast-Style Features Grid */}
      <section id="features" className="w-full bg-white border-y border-slate-200/80 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-block bg-orange-100 text-orange-700 font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-widest mb-3">
              Why High-Volume Kitchens Switch
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Toast Power, Local Flexibility.
            </h2>
            <p className="text-slate-500 text-base font-semibold mt-3">
              Everything your restaurant team needs to take orders fast, route tickets to kitchen stations, and manage multiple locations.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200/70 hover:shadow-xl hover:border-orange-200 transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-6 group-hover:scale-110 transition-transform">
                <Wifi size={28} />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 mb-3">100% Offline Resilience</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                When internet drops during dinner rush, ManiPOS keeps ringing orders and printing kitchen tickets locally. No lost revenue, zero downtime.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200/70 hover:shadow-xl hover:border-orange-200 transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/20 mb-6 group-hover:scale-110 transition-transform">
                <Smartphone size={28} />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 mb-3">Zero Proprietary Hardware</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Run ManiPOS on any iPad, Android tablet, or existing desktop. Say goodbye to mandatory $1,500 screen hardware leases.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200/70 hover:shadow-xl hover:border-orange-200 transition-all group">
              <div className="w-14 h-14 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 mb-6 group-hover:scale-110 transition-transform">
                <Printer size={28} />
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 mb-3">Direct Thermal Kitchen Printing</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Route orders directly to kitchen bump bars and thermal receipt printers over network/ESC-POS with near-zero latency.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Savings Calculator */}
      <section id="calculator" className="w-full bg-slate-900 text-white py-24 relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-6 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 bg-slate-800 text-orange-400 font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-widest mb-4 border border-slate-700">
              <Calculator size={14} />
              <span>Interactive ROI Calculator</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              See How Much You Save vs Toast & Legacy POS
            </h2>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md p-8 sm:p-12 rounded-3xl border border-slate-700 shadow-2xl flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1 w-full space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2 font-extrabold">
                  <span className="text-slate-300 text-sm">Monthly Restaurant Orders:</span>
                  <span className="text-orange-400 text-xl">{monthlyOrders.toLocaleString()} orders</span>
                </div>
                <input 
                  type="range" 
                  min="500" 
                  max="10000" 
                  step="250" 
                  value={monthlyOrders} 
                  onChange={(e) => setMonthlyOrders(Number(e.target.value))}
                  className="w-full h-3 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
              </div>

              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/60 space-y-2 text-xs font-semibold text-slate-400">
                <div className="flex justify-between">
                  <span>Toast / Legacy Fee (~$0.35/order + SaaS):</span>
                  <span className="text-red-400 font-bold">${Math.round(monthlyOrders * 0.35 + 150)}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span>ManiPOS Flat Subscription:</span>
                  <span className="text-emerald-400 font-bold">$49/mo</span>
                </div>
              </div>
            </div>

            <div className="w-full md:w-auto bg-gradient-to-br from-orange-500 to-amber-600 p-8 rounded-3xl text-center shadow-xl shadow-orange-500/20 min-w-[260px]">
              <p className="text-xs font-black uppercase tracking-widest text-orange-100">Estimated Monthly Savings</p>
              <p className="text-5xl font-black my-3 text-white">${calculateSavings()}</p>
              <p className="text-xs text-orange-100 font-bold">That's ${calculateSavings() * 12}/year back in your pocket!</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="w-full bg-slate-50 py-24 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-6 space-y-12">
          <div className="text-center">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Frequently Asked Questions</h2>
            <p className="text-slate-500 text-sm font-semibold mt-2">Everything you need to know about switching to ManiPOS</p>
          </div>

          <div className="space-y-4">
            {faqData.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all">
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-6 text-left flex justify-between items-center text-base font-extrabold text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown size={20} className={`text-orange-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-6 pb-6 text-slate-600 text-sm leading-relaxed pt-2 border-t border-slate-100 font-medium">
                          {faq.a}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full bg-slate-950 text-slate-400 py-12 border-t border-slate-800 text-xs font-semibold">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-xs">M</div>
            <span className="text-white font-extrabold text-sm">ManiPOS</span>
            <span>&bull; Toast POS Engine for Modern Restaurants</span>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => onProceedToLogin()} className="hover:text-white transition-colors cursor-pointer">
              Terminal Login (pos.manipos.com)
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
