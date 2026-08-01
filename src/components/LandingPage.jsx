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
      q: "How does ManiPOS compare to legacy POS systems?",
      a: "ManiPOS is built specifically for modern restaurants and cloud kitchens. It runs ultra-fast on any iPad, tablet, or web browser without requiring $1,500 proprietary screen buys or mandatory long-term contracts."
    },
    {
      q: "Does ManiPOS work offline when Wi-Fi drops?",
      a: "Yes. ManiPOS uses a local-first offline architecture. Orders and thermal ticket printing continue seamlessly during internet outages, syncing automatically when connection restores."
    },
    {
      q: "Can I run ManiPOS on custom subdomains or multiple locations?",
      a: "Yes. ManiPOS features native multi-tenant subdomain routing (e.g., pos.manipos.com or littlelagos.pos.manipos.com), allowing multi-location brands to isolate menus, staff PINs, and daily Z-reports."
    },
    {
      q: "What thermal printers are supported?",
      a: "ManiPOS connects to standard ESC/POS network, Bluetooth, or USB thermal receipt printers using our built-in print bridge."
    }
  ];

  const calculateSavings = () => {
    const legacyCost = monthlyOrders * 0.35 + 150;
    const maniposCost = 49;
    return Math.max(0, Math.round(legacyCost - maniposCost));
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-slate-900 selection:text-white flex flex-col">
      {/* Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black tracking-tight text-black">ManiPOS</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
          <a href="#features" className="hover:text-black transition-colors">Features</a>
          <a href="#calculator" className="hover:text-black transition-colors">ROI Calculator</a>
          <a href="#faq" className="hover:text-black transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => onProceedToLogin()}
            className="bg-black hover:bg-slate-800 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <span>Log In to POS</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-16 pb-20 flex flex-col lg:flex-row items-center gap-12 text-left">
        <div className="flex-1 flex flex-col items-start w-full">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-md mb-6">
            Restaurant Management Engine
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight mb-6">
            The Restaurant POS Built for High-Volume Kitchens.
          </h1>

          <p className="text-slate-600 text-lg leading-relaxed max-w-xl mb-10 font-normal">
            Ultra-fast ordering, offline resilience, and instant thermal printing. Run on any iPad, tablet, or browser without hardware lock-in.
          </p>

          {/* Lead Capture Form */}
          <div className="w-full max-w-xl bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 mb-8">
            {!leadSuccess ? (
              <form onSubmit={handleLeadSubmit} className="flex flex-col sm:flex-row gap-3 w-full">
                <input
                  type="text"
                  required
                  value={formData.restaurantName}
                  onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                  placeholder="Restaurant Name"
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium focus:outline-none focus:border-slate-400 transition-all placeholder:text-slate-400"
                />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Owner Email"
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium focus:outline-none focus:border-slate-400 transition-all placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={leadLoading}
                  className="bg-black hover:bg-slate-800 text-white font-semibold text-sm py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shadow-sm"
                >
                  {leadLoading ? <Loader2 className="animate-spin" size={16} /> : 'Get Access'}
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-center gap-3 py-3 text-emerald-700 font-semibold text-sm">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span>Thank you! We will reach out shortly.</span>
              </div>
            )}
            {leadError && <p className="text-red-600 text-xs font-semibold mt-2">{leadError}</p>}
          </div>

          {/* Feature Bullets */}
          <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-500">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-slate-700" />
              <span>Offline First</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-700" />
              <span>Subdomain Multi-Tenant</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-slate-700" />
              <span>Zero Hardware Lock-In</span>
            </div>
          </div>
        </div>

        {/* Hero Image Showcase */}
        <div className="flex-1 w-full flex justify-center lg:justify-end">
          <div className="bg-slate-50 p-2 rounded-2xl border border-slate-200 shadow-md max-w-xl w-full">
            <img 
              src="/hero_mockup.png" 
              alt="ManiPOS Interface" 
              className="w-full h-auto rounded-xl object-cover" 
            />
            <div className="p-4 bg-white rounded-xl border border-slate-200/80 mt-2 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subdomain Routing</p>
                <p className="text-sm font-bold text-slate-900">pos.manipos.com &bull; Active</p>
              </div>
              <button
                onClick={() => onProceedToLogin()}
                className="bg-black hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer"
              >
                Launch Register &rarr;
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Features Grid */}
      <section id="features" className="w-full bg-slate-50 border-y border-slate-200/80 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-14 text-left">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              Designed for Speed & Reliability.
            </h2>
            <p className="text-slate-600 text-base font-normal mt-2">
              Core architecture built to ensure your counter and kitchen keep running smoothly.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-left">
            {/* Feature 1 */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center font-bold">
                <Wifi size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Offline Resilience</h3>
              <p className="text-slate-600 text-sm font-normal leading-relaxed">
                When internet drops, ManiPOS keeps ringing orders and printing kitchen tickets locally without interruption.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center font-bold">
                <Smartphone size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Any Hardware</h3>
              <p className="text-slate-600 text-sm font-normal leading-relaxed">
                Run ManiPOS on any iPad, Android tablet, or existing desktop. Avoid mandatory proprietary screen hardware costs.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center font-bold">
                <Printer size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Thermal Kitchen Printing</h3>
              <p className="text-slate-600 text-sm font-normal leading-relaxed">
                Route orders directly to kitchen thermal receipt printers over network/ESC-POS with zero latency.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section id="calculator" className="w-full bg-slate-900 text-white py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="max-w-2xl mb-10 text-left">
            <h2 className="text-3xl font-black tracking-tight">
              ROI Calculator
            </h2>
            <p className="text-slate-400 text-sm font-normal mt-1">Estimate savings compared to per-order transaction fees.</p>
          </div>

          <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 w-full space-y-6 text-left">
              <div>
                <div className="flex justify-between items-center mb-2 font-bold text-sm">
                  <span className="text-slate-300">Monthly Restaurant Orders:</span>
                  <span className="text-white text-base">{monthlyOrders.toLocaleString()} orders</span>
                </div>
                <input 
                  type="range" 
                  min="500" 
                  max="10000" 
                  step="250" 
                  value={monthlyOrders} 
                  onChange={(e) => setMonthlyOrders(Number(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              <div className="bg-slate-900/80 p-4 rounded-xl space-y-2 text-xs font-medium text-slate-400">
                <div className="flex justify-between">
                  <span>Legacy POS Estimated Cost:</span>
                  <span className="text-slate-200 font-bold">${Math.round(monthlyOrders * 0.35 + 150)}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span>ManiPOS Flat Rate:</span>
                  <span className="text-emerald-400 font-bold">$49/mo</span>
                </div>
              </div>
            </div>

            <div className="w-full md:w-auto bg-white text-slate-900 p-6 rounded-xl text-center min-w-[240px]">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimated Savings</p>
              <p className="text-4xl font-black my-2">${calculateSavings()}</p>
              <p className="text-xs text-slate-600 font-medium">per month</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="w-full bg-white py-20 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-6 space-y-10 text-left">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            {faqData.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className="border-b border-slate-200 pb-4">
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full py-3 text-left flex justify-between items-center text-base font-bold text-slate-900 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown size={18} className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <p className="text-slate-600 text-sm leading-relaxed pt-2 font-normal">
                          {faq.a}
                        </p>
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
      <footer className="w-full bg-slate-900 text-slate-400 py-10 border-t border-slate-800 text-xs font-semibold">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-white font-black text-sm">ManiPOS</span>
            <span>&bull; Restaurant Software Engine</span>
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
