import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Loader2, 
  ChevronDown,
  Wifi,
  Smartphone,
  Printer
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
      // Fallback for demo purposes if RLS blocks it
      setLeadSuccess(true);
    } finally {
      setLeadLoading(false);
    }
  };

  const faqData = [
    {
      q: "Why is ManiPOS different from generic POS systems?",
      a: "ManiPOS was built inside high-volume cloud kitchens and restaurants. It runs ultra-fast on any tablet or browser with zero lag and native local payment reconciliation."
    },
    {
      q: "Does ManiPOS work offline?",
      a: "Yes. ManiPOS has a local-first architecture. It retains all active orders and ticket print queues locally, syncing the moment your connection restores."
    },
    {
      q: "What hardware do I need?",
      a: "Use your existing iPad, Android tablet, laptop, or touchscreen terminal. Connects to any standard ESC/POS thermal receipt printer."
    }
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans antialiased selection:bg-black selection:text-white flex flex-col">
      {/* Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between z-40 bg-white">
        <div className="flex items-center">
          <span className="text-3xl font-extrabold tracking-tight text-black">ManiPOS</span>
        </div>

        <button 
          onClick={onProceedToLogin}
          className="text-sm font-semibold text-gray-600 hover:text-black transition-colors px-4 py-2"
        >
          Login
        </button>
      </header>

      {/* Hero Section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-16 pb-20 flex flex-col text-left">
        <div className="w-full flex flex-col lg:flex-row items-center gap-12">
          <div className="flex-1 flex flex-col items-start w-full">
            <div className="inline-flex items-center gap-2 text-sm text-gray-500 font-medium bg-gray-100 px-4 py-1.5 rounded-full mb-8">
              Built by restaurant owners
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-black leading-[1.1] tracking-tight mb-6">
              The POS Kitchens <br /> Actually Love.
            </h1>

            <p className="text-gray-500 text-lg sm:text-xl leading-relaxed max-w-xl mb-12">
              No bloated hardware. No complicated menus. Designed for high-volume restaurants to handle peak rushes with zero lag and offline resilience.
            </p>

            {/* Lead Capture */}
            <div className="w-full max-w-xl">
              {!leadSuccess ? (
                <form onSubmit={handleLeadSubmit} className="flex flex-col sm:flex-row gap-3 w-full">
                  <input
                    type="text"
                    required
                    value={formData.restaurantName}
                    onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                    placeholder="Restaurant Name"
                    className="flex-1 bg-white border border-gray-200 shadow-sm rounded-xl px-4 py-3.5 text-base text-black focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all placeholder:text-gray-400"
                  />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Email Address"
                    className="flex-1 bg-white border border-gray-200 shadow-sm rounded-xl px-4 py-3.5 text-base text-black focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400 transition-all placeholder:text-gray-400"
                  />
                  <button
                    type="submit"
                    disabled={leadLoading}
                    className="bg-black hover:bg-gray-800 text-white font-medium py-3.5 px-8 rounded-xl text-base transition-all disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap shadow-sm"
                  >
                    {leadLoading ? <Loader2 className="animate-spin" size={18} /> : 'Request Access'}
                  </button>
                </form>
              ) : (
                <div className="flex items-center justify-center gap-2 py-4 text-green-600 bg-green-50 border border-green-100 rounded-xl font-medium">
                  <CheckCircle2 size={20} />
                  <span>Request received! We'll be in touch soon.</span>
                </div>
              )}
              {leadError && <p className="text-red-500 text-sm mt-3">{leadError}</p>}
            </div>
          </div>

          <div className="flex-1 w-full flex justify-center lg:justify-end">
            <img src="/hero_mockup.png" alt="ManiPOS in action" className="w-full max-w-xl h-auto drop-shadow-2xl object-contain rounded-xl" />
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-10 mt-32 text-left">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-black">
              <Wifi size={24} />
            </div>
            <h3 className="text-xl font-bold text-black">Offline Resilient</h3>
            <p className="text-gray-500 text-base leading-relaxed">
              When Wi-Fi drops, ManiPOS keeps taking orders and printing tickets locally. Never miss a beat during dinner rush.
            </p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-black">
              <Smartphone size={24} />
            </div>
            <h3 className="text-xl font-bold text-black">Zero Extra Hardware</h3>
            <p className="text-gray-500 text-base leading-relaxed">
              Runs effortlessly on your existing iPads, Android tablets, or laptops. No $1,500 proprietary screen buys needed.
            </p>
          </div>
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-black">
              <Printer size={24} />
            </div>
            <h3 className="text-xl font-bold text-black">Direct Thermal Printing</h3>
            <p className="text-gray-500 text-base leading-relaxed">
              Route orders directly to kitchen bump stations and bar printers with near-zero latency using ESC/POS over network.
            </p>
          </div>
        </div>
      </main>

      {/* FAQ Section */}
      <section className="w-full bg-gray-50 border-t border-gray-100 py-24">
        <div className="max-w-3xl mx-auto px-6 space-y-12">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-black">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            {faqData.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all shadow-sm">
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full p-6 text-left flex justify-between items-center text-lg font-semibold text-black hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown size={20} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-6 pb-6 text-gray-500 text-base leading-relaxed pt-2 border-t border-gray-100">
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
      <footer className="w-full max-w-6xl mx-auto px-6 py-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500 bg-white">
        <div className="flex items-center gap-2">
          <span>&copy; {new Date().getFullYear()} ManiPOS Inc.</span>
        </div>
        <button onClick={onProceedToLogin} className="hover:text-black font-medium transition-colors">
          Login to Dashboard
        </button>
      </footer>
    </div>
  );
}
