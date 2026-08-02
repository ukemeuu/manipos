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
  Building2
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
      q: "What makes ManiPOS different from other POS systems?",
      a: "ManiPOS is built specifically for modern restaurants, cloud kitchens, and multi-location brands. It combines sub-second order entry, native Kitchen Display (KDS), guest QR code digital menus, and multi-brand support into a single cloud platform with zero mandatory hardware lock-in."
    },
    {
      q: "Does ManiPOS work offline during internet outages?",
      a: "Yes! ManiPOS uses a local-first offline architecture. Order entry and kitchen thermal printing continue seamlessly even when Wi-Fi drops, automatically syncing back to the cloud when reconnected."
    },
    {
      q: "How does multi-location and subdomain routing work?",
      a: "ManiPOS provides dedicated subdomains for each outlet (e.g. littlelagos.pos.manipos.com or mutekitchens.manipos.com), allowing managers to isolate menus, staff PINs, and Z-reports per branch."
    },
    {
      q: "Can I use my existing hardware?",
      a: "Yes! ManiPOS runs on any iPad, Android tablet, desktop browser, or standard ESC/POS network thermal printer without requiring expensive proprietary screen leases."
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-orange-500 selection:text-white flex flex-col justify-between">
      {/* Header Navbar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between bg-slate-50 border-b border-slate-200/80 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black tracking-tight text-slate-900">Mani<span className="text-orange-500">POS</span></span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-600">
          <a href="#features" className="hover:text-orange-600 transition-colors">Features</a>
          <a href="#outlets" className="hover:text-orange-600 transition-colors">Whom We Serve</a>
          <a href="#faq" className="hover:text-orange-600 transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <a
            href="#signup"
            className="bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center gap-1.5"
          >
            <span>Request Early Access</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </header>

      {/* Main SlantCo-Inspired Hero & Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-8 pb-20 space-y-20">
        {/* SlantCo Style Hero Section */}
        <div className="flex flex-col lg:flex-row items-center gap-12 text-left">
          {/* Hero Left Content */}
          <div className="flex-1 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-black text-orange-600 bg-orange-100/80 border border-orange-200 px-4 py-1.5 rounded-full">
              <Sparkles size={14} className="text-orange-500" />
              <span>CLOUD-BASED RESTAURANT POS & MANAGEMENT SYSTEM</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 leading-[1.1] tracking-tight">
              Supercharge Your Restaurant Operations & Sales.
            </h1>

            <p className="text-slate-600 text-base sm:text-lg leading-relaxed max-w-xl font-normal">
              Cloud-based POS and restaurant management software system that helps you grow your sales, improve service speed, cut costs, and manage multi-branch operations effortlessly.
            </p>

            {/* Early Access Form */}
            <div id="signup" className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 max-w-xl">
              <h3 className="text-lg font-black text-slate-900 mb-1">Get Early Access & Private Demo</h3>
              <p className="text-xs font-semibold text-slate-500 mb-6">Join the early pilot list to get priority setup when we launch.</p>

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
                        <span>Request Free Pilot Access</span>
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

          {/* Hero Hardware & Register Photo */}
          <div className="flex-1 w-full flex justify-center lg:justify-end">
            <div className="bg-white p-3 rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-w-2xl w-full">
              <img 
                src="/posbytz_hero.png" 
                alt="ManiPOS Cloud POS System" 
                className="w-full h-auto rounded-2xl object-cover" 
              />
            </div>
          </div>
        </div>

        {/* SlantCo-Style Feature Highlight Grid */}
        <div id="features" className="space-y-8 pt-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-block bg-orange-100 text-orange-700 font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
              Comprehensive Platform Capabilities
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              Everything Your Restaurant Needs in One System
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 text-left">
            {/* Feature 1 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                <Monitor size={24} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Kitchen Display System</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Streamline order tickets with real-time KDS bump screens and ticket timers for zero-delay prep.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                <Globe size={24} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Guest QR Menu & Microsite</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Provide guests with branded mobile web menus for table QR ordering and online takeaway browsing.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                <Layers size={24} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Multi-Brand Cloud Kitchen</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Operate multiple virtual cloud kitchen brands from a single POS register and central inventory.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                <MapPin size={24} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Multi-Location Control</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Manage menus, staff access, and sales analytics across all your restaurant branches effortlessly.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                <LayoutDashboard size={24} />
              </div>
              <h4 className="text-sm font-black text-slate-900">Owner & Manager Portal</h4>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                Real-time dashboard for daily Z-reports, sales analytics, stock control, and cashier audit logs.
              </p>
            </div>
          </div>
        </div>

        {/* SlantCo-Style "Whom We Serve" Section */}
        <div id="outlets" className="bg-white p-8 sm:p-12 rounded-3xl border border-slate-200 shadow-xl space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <div className="inline-block bg-slate-100 text-slate-700 font-extrabold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
              Whom We Serve
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">
              Tailored for Every Food & Beverage Concept
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center">
                <Utensils size={20} />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Fine Dine & Full Service</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Table mapping, bill splitting, order courses, and waiter handheld order taking.
              </p>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                <Zap size={20} />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">QSR & Fast Casual</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Sub-second order entry, fast payment checkout, and high-speed thermal printing.
              </p>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500 text-white flex items-center justify-center">
                <Building2 size={20} />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Cloud Kitchens</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Multi-brand dispatch, automated ticket routing, and central stock management.
              </p>
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center">
                <Coffee size={20} />
              </div>
              <h4 className="text-base font-extrabold text-slate-900">Cafes & Bakeries</h4>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                Custom item modifiers, combo deals, loyalty rewards, and rapid order workflows.
              </p>
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
                    className="w-full py-3 text-left flex justify-between items-center text-base font-bold text-slate-900 hover:text-orange-600 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown size={18} className={`text-orange-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
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

      {/* Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-8 border-t border-slate-200/80 text-slate-500 text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-slate-900 font-black text-sm">Mani<span className="text-orange-500">POS</span></span>
          <span>&bull; Cloud Restaurant POS & Management System</span>
        </div>
        <p>&copy; {new Date().getFullYear()} ManiPOS. All rights reserved.</p>
      </footer>
    </div>
  );
}
