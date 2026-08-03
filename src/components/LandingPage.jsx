import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  Loader2, 
  ArrowRight,
  Monitor,
  Globe,
  Layers,
  MapPin,
  LayoutDashboard,
  Utensils,
  Coffee,
  Store,
  ChevronDown,
  Sparkles,
  Zap,
  ShieldCheck,
  Building2,
  Receipt,
  PieChart,
  Award,
  Users,
  Smartphone,
  Menu
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
  const [openFaqIndex, setOpenFaqIndex] = useState(0);

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

  const faqData = [
    {
      q: "What is ManiPOS software?",
      a: "ManiPOS is a modern cloud-based restaurant POS and management software system that helps physical restaurants, cafes, QSRs, and multi-location brands grow sales, improve order prep speed, reduce costs, and manage operations seamlessly."
    },
    {
      q: "Does the system work offline if internet drops?",
      a: "Yes. The POS terminal includes a local-first offline fallback. Orders and thermal kitchen tickets continue printing locally during internet outages, syncing automatically back to the cloud when internet restores."
    },
    {
      q: "Can I manage multiple outlets and restaurant brands?",
      a: "Absolutely. ManiPOS supports multi-location setups and multi-brand menus under one master account, allowing you to track inventory, staff access, and sales analytics across all your branches."
    },
    {
      q: "What hardware is supported?",
      a: "You can run ManiPOS on any standard Windows PC, Mac, iPad, Android tablet, or POS terminal with standard ESC/POS network and USB thermal receipt printers."
    }
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans antialiased selection:bg-amber-400 selection:text-slate-950 flex flex-col justify-between">
      {/* Navigation Bar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between bg-white border-b border-slate-200/70 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center font-black text-slate-950 text-xl shadow-sm">
            M
          </div>
          <div>
            <span className="text-2xl font-black tracking-tight text-slate-900">Mani<span className="text-amber-500">POS</span></span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block -mt-1">Cloud POS Engine</span>
          </div>
        </div>

        <nav className="hidden lg:flex items-center gap-8 text-sm font-bold text-slate-700">
          <a href="#features" className="hover:text-amber-500 transition-colors">Features</a>
          <a href="#outlets" className="hover:text-amber-500 transition-colors">Whom We Serve</a>
          <a href="#metrics" className="hover:text-amber-500 transition-colors">Why ManiPOS</a>
          <a href="#faq" className="hover:text-amber-500 transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="#signup"
            className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-xs px-5 py-3 rounded-xl transition-all shadow-md shadow-amber-400/20 flex items-center gap-1.5"
          >
            <span>Request Demo</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-10 pb-20 space-y-20">
        <div className="flex flex-col lg:flex-row items-center gap-12 text-left">
          {/* Hero Left Content */}
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-black text-slate-700 bg-amber-100 border border-amber-300 px-4 py-1.5 rounded-full">
              <Sparkles size={14} className="text-amber-600" />
              <span>CLOUD-BASED RESTAURANT POS SYSTEM</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.12] tracking-tight">
              Supercharge Your Restaurant Operations & Sales.
            </h1>

            <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl font-medium">
              Built for physical restaurants, multi-location dining groups, and quick-service outlets. Manage billing, kitchen displays, guest menus, and multi-brand operations seamlessly.
            </p>

            {/* Request Demo Form Card */}
            <div id="signup" className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 max-w-xl">
              <div className="mb-4">
                <h3 className="text-lg font-black text-slate-900">Request a Live Demo</h3>
              </div>

              {!leadSuccess ? (
                <form onSubmit={handleLeadSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Restaurant Name <span className="text-amber-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.restaurantName}
                        onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                        placeholder="e.g. Savory Bistro"
                        className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Owner Email <span className="text-amber-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="owner@restaurant.com"
                        className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Mobile Phone Number
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+254 700 000 000"
                        className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-400"
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
                        className="w-full bg-[#F8F9FA] border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 font-semibold focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {leadError && <p className="text-red-500 text-xs font-bold">{leadError}</p>}

                  <button
                    type="submit"
                    disabled={leadLoading}
                    className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm py-4 px-6 rounded-xl transition-all shadow-lg shadow-amber-400/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {leadLoading ? <Loader2 className="animate-spin text-slate-950" size={18} /> : (
                      <>
                        <span>Request Demo</span>
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
                  <h4 className="text-base font-black text-slate-900">Demo Request Received!</h4>
                  <p className="text-slate-600 text-xs font-semibold max-w-xs mx-auto">
                    Our team will contact you shortly to schedule your live demo.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Hero Hardware Image */}
          <div className="flex-1 w-full flex justify-center lg:justify-end">
            <div className="bg-white p-3 rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-w-2xl w-full">
              <img 
                src="/posbytz_hero.png" 
                alt="ManiPOS Software & Hardware" 
                className="w-full h-auto rounded-2xl object-cover" 
              />
            </div>
          </div>
        </div>

        {/* Statistics Metric Bar */}
        <div id="metrics" className="bg-white p-8 rounded-3xl border border-slate-200/90 shadow-xl grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-x divide-slate-100">
          <div className="space-y-1">
            <p className="text-3xl sm:text-4xl font-black text-slate-900">&lt; 1s</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Order Entry Speed</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl sm:text-4xl font-black text-amber-500">99.9%</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Uptime Reliability</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl sm:text-4xl font-black text-slate-900">30%</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Faster Kitchen Prep</p>
          </div>
          <div className="space-y-1">
            <p className="text-3xl sm:text-4xl font-black text-emerald-600">$0</p>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hardware Lock-In</p>
          </div>
        </div>

        {/* Main Features Grid */}
        <div id="features" className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-block bg-amber-100 text-slate-900 font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
              System Features
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Powerful Tools Built for Every Restaurant Need
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
            {/* Feature 1: Point of Sale */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                <Receipt size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Point of Sale (POS)</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Superfast cloud POS software with quick cashier billing, table management, floor maps, and split-bill payments.
              </p>
            </div>

            {/* Feature 2: KDS */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                <Monitor size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Kitchen Display (KDS)</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Send orders directly to digital kitchen screens and thermal printers to reduce ticket prep time and eliminate mistakes.
              </p>
            </div>

            {/* Feature 3: Inventory */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                <Layers size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Inventory & Recipe Control</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Track ingredient stock levels automatically as orders are billed. Get low stock alerts and variance tracking.
              </p>
            </div>

            {/* Feature 4: QR Code Menu */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                <Globe size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900">QR Code Digital Menu</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Allow guests to scan QR codes at tables to view your digital menu, order, and pay directly from their smartphones.
              </p>
            </div>

            {/* Feature 5: Multi-Location */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                <MapPin size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Multi-Location & Subdomains</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Manage all your restaurant outlets under subdomains (e.g. branch.manipos.com) with central reporting and control.
              </p>
            </div>

            {/* Feature 6: Owner Reports */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
                <PieChart size={24} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Report & Sales Analytics</h3>
              <p className="text-slate-600 text-sm font-medium leading-relaxed">
                Access real-time sales reports, daily Z-reports, top-performing items, and cashier audit logs from any browser.
              </p>
            </div>
          </div>
        </div>

        {/* Outlet Types Section */}
        <div id="outlets" className="bg-white p-8 sm:p-12 rounded-3xl border border-slate-200 shadow-xl space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-block bg-slate-100 text-slate-800 font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
              Whom We Serve
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              Tailored Solutions for Every Outlet Concept
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            <div className="p-6 bg-[#F8F9FA] rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
                <Utensils size={20} />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Fine Dine & Full Service</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Table layouts, bill splitting, order courses, and mobile waiter ordering.
              </p>
            </div>

            <div className="p-6 bg-[#F8F9FA] rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
                <Zap size={20} />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">QSR & Take Away</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Rapid billing, order queue screens, customer takeaway printing, and fast checkout.
              </p>
            </div>

            <div className="p-6 bg-[#F8F9FA] rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
                <Building2 size={20} />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Multi-Brand Outlets</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Multi-brand dispatch, automated ticket routing, and central inventory.
              </p>
            </div>

            <div className="p-6 bg-[#F8F9FA] rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold">
                <Coffee size={20} />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Cafes & Bakeries</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Item modifiers, combo deals, loyalty rewards, and rapid order workflows.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Banner */}
        <div className="bg-slate-900 text-white p-10 sm:p-14 rounded-3xl shadow-2xl text-center space-y-6 relative overflow-hidden">
          <div className="max-w-2xl mx-auto space-y-4 relative z-10">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              Ready to Upgrade Your Restaurant Management?
            </h2>
            <p className="text-slate-300 text-sm font-medium">
              Join fast-growing restaurants leveraging ManiPOS to boost revenue and streamline kitchen operations.
            </p>
            <div className="pt-2">
              <a
                href="#signup"
                className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm px-8 py-4 rounded-xl transition-all shadow-xl shadow-amber-400/20"
              >
                <span>Request Demo</span>
                <ArrowRight size={18} />
              </a>
            </div>
          </div>
        </div>

        {/* FAQ Accordion Section */}
        <div id="faq" className="bg-white p-8 sm:p-12 rounded-3xl border border-slate-200 shadow-xl space-y-8 text-left">
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
                    className="w-full py-3 text-left flex justify-between items-center text-base font-bold text-slate-900 hover:text-amber-600 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown size={18} className={`text-amber-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <p className="text-slate-600 text-sm leading-relaxed pt-2 font-medium">
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
      </main>

      {/* Dark Footer */}
      <footer className="w-full bg-slate-950 text-slate-400 py-12 border-t border-slate-800 text-xs font-semibold">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-amber-400 rounded-lg flex items-center justify-center font-black text-slate-950 text-sm">
              M
            </div>
            <span className="text-white font-extrabold text-sm">ManiPOS</span>
            <span>&bull; Cloud Restaurant POS & Management System</span>
          </div>
          <p>&copy; {new Date().getFullYear()} ManiPOS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
