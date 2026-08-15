import React, { useState, useEffect } from 'react';
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
  Utensils,
  Coffee,
  ChevronDown,
  Sparkles,
  Zap,
  Building2,
  Receipt,
  PieChart,
  Users,
  Star,
  Play,
  ChevronRight,
  Wifi,
  WifiOff,
  Tablet,
  BarChart3,
  Menu as MenuIcon,
  X,
  AlertTriangle,
} from 'lucide-react';
import { getPublicFeatures } from '../config/features';
import { FeatureCard } from './FeatureCard';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFeatureTab, setActiveFeatureTab] = useState(0);

  // Self-Service Store Onboarding State
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [signInSlug, setSignInSlug] = useState('');
  const [onboardData, setOnboardData] = useState({ name: '', slug: '', managerName: '', pin: '1234', phone: '' });
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardError, setOnboardError] = useState('');
  const [onboardSuccess, setOnboardSuccess] = useState(null);

  const handleSelfServiceOnboard = async (e) => {
    e.preventDefault();
    if (!onboardData.name || !onboardData.slug || !onboardData.pin) {
      setOnboardError('Please enter Store Name, Subdomain Code, and 4-Digit Manager PIN.');
      return;
    }
    setOnboardLoading(true);
    setOnboardError('');
    try {
      const { data, error } = await supabase.rpc('create_new_restaurant_tenant', {
        p_name: onboardData.name,
        p_slug: onboardData.slug.toLowerCase().trim(),
        p_manager_name: onboardData.managerName || 'Store Manager',
        p_pin: onboardData.pin,
        p_phone: onboardData.phone || null
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'Registration failed.');

      // Establish authenticated store manager session
      const staffUser = {
        id: data.staff_id || data.restaurant_id,
        name: data.manager_name || onboardData.managerName || 'Store Manager',
        role: 'admin',
        restaurantId: data.restaurant_id,
        restaurantName: data.restaurant_name || onboardData.name,
        tenantSlug: data.restaurant_slug || onboardData.slug.toLowerCase().trim()
      };
      localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
      localStorage.removeItem('manipos_setup_completed');

      setOnboardSuccess(data);
      setTimeout(() => {
        window.location.href = `/?tenant=${data.restaurant_slug}&page=onboarding`;
      }, 1500);
    } catch (err) {
      setOnboardError(err.message || 'Error creating store account.');
    } finally {
      setOnboardLoading(false);
    }
  };

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
      a: "ManiPOS is a modern cloud-based restaurant POS and management system that helps restaurants, cloud kitchens, cafes, and multi-location brands boost sales, speed up kitchen prep, reduce costs, and manage operations seamlessly."
    },
    {
      q: "Does the system work offline if internet drops?",
      a: "Yes. The POS terminal includes a local-first offline fallback. Billing and thermal kitchen tickets print uninterrupted during internet outages, syncing automatically back to the cloud once connectivity restores."
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

  const featureTabs = [
    {
      label: 'Point of Sale',
      icon: <Receipt size={18} />,
      image: '/mockups/tablet-pos.png',
      title: 'Superfast Cloud POS Billing',
      desc: 'Touch-optimised POS screen with quick cashier billing, table management, floor maps, split-bill payments, and instant thermal receipt printing.',
      points: ['Touchscreen & keyboard billing', 'Table & floor map management', 'Split bills & multiple payments', 'Offline fallback with auto-sync']
    },
    {
      label: 'Kitchen Display',
      icon: <Monitor size={18} />,
      image: '/mockups/kds-screen.png',
      title: 'Real-Time Kitchen Display (KDS)',
      desc: 'Orders flow instantly from the POS to wall-mounted kitchen screens. Chefs see every ticket in real time, eliminating paper dockets and reducing errors.',
      points: ['Live order ticket streaming', 'Status: New → Cooking → Ready', 'Bump & recall tickets', 'Multi-station routing']
    },
    {
      label: 'Dashboard',
      icon: <BarChart3 size={18} />,
      image: '/mockups/laptop-dashboard.png',
      title: 'Owner & Manager Dashboard',
      desc: "Access real-time sales reports, daily Z-reports, top-performing items, and cashier audit logs from any browser — even your phone from home.",
      points: ['Live revenue & order metrics', 'Daily Z-report & cashier logs', 'Top items & hourly trends', 'Multi-branch comparison']
    },
    {
      label: 'Waiter App',
      icon: <Tablet size={18} />,
      image: '/mockups/waiter-tablet.png',
      title: 'Mobile Waiter Ordering',
      desc: 'Waiters take orders tableside on a phone or tablet. Orders go straight to the kitchen — no shouting, no paper, no delays.',
      points: ['Tableside order entry', 'Floor map with table status', 'Send to kitchen instantly', 'Works on any Android/iOS device']
    },
  ];

  const stats = [
    { value: '4', label: 'Core Modules', suffix: '' },
    { value: '99.9', label: 'Uptime SLA', suffix: '%' },
    { value: '0', label: 'Hardware Lock-In', prefix: '$' },
    { value: '24/7', label: 'Support Access', suffix: '' },
  ];

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white font-sans antialiased selection:bg-amber-400 selection:text-black overflow-x-hidden">

      {/* ── NAVBAR ── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#0d0d0d]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center font-black text-black text-lg">M</div>
            <span className="text-xl font-black tracking-tight">Mani<span className="text-amber-400">POS</span></span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-white/60">
            <a href="#features" className="hover:text-amber-400 transition-colors">Features</a>
            <a href="#outlets" className="hover:text-amber-400 transition-colors">Whom We Serve</a>
            <a href="#why" className="hover:text-amber-400 transition-colors">Why ManiPOS</a>
            <a href="#faq" className="hover:text-amber-400 transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSignInModal(true)}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <span>Sign In</span>
            </button>
            <button
              onClick={() => setShowOnboardModal(true)}
              className="bg-white/10 hover:bg-white/20 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-white/10"
            >
              <span>+ Create Restaurant</span>
            </button>
            <a
              href="#signup"
              className="hidden sm:flex bg-white/10 hover:bg-white/20 text-white/80 hover:text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all items-center gap-1.5"
            >
              Demo <ArrowRight size={14} />
            </a>
            <button
              className="lg:hidden text-white/60 hover:text-white cursor-pointer"
              onClick={() => setMobileMenuOpen(v => !v)}
            >
              {mobileMenuOpen ? <X size={22} /> : <MenuIcon size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t border-white/[0.06] bg-[#0d0d0d] overflow-hidden"
            >
              <div className="px-6 py-4 flex flex-col gap-4 text-sm font-semibold text-white/60">
                <a href="#features" onClick={() => setMobileMenuOpen(false)} className="hover:text-amber-400 transition-colors">Features</a>
                <a href="#outlets" onClick={() => setMobileMenuOpen(false)} className="hover:text-amber-400 transition-colors">Whom We Serve</a>
                <a href="#why" onClick={() => setMobileMenuOpen(false)} className="hover:text-amber-400 transition-colors">Why ManiPOS</a>
                <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="hover:text-amber-400 transition-colors">FAQ</a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── HERO ── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-40 left-0 w-[400px] h-[400px] bg-amber-600/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="flex flex-col lg:flex-row items-center gap-16"
          >
            {/* Left copy */}
            <div className="flex-1 space-y-7 text-left">
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-4 py-2 rounded-full uppercase tracking-wider">
                <Sparkles size={13} />
                Cloud-Based POS & Restaurant Management
              </motion.div>

              <motion.h1 variants={fadeUp} className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
                Supercharge Your<br />
                <span className="text-amber-400">Restaurant Operations</span><br />
                & Sales.
              </motion.h1>

              <motion.p variants={fadeUp} className="text-white/60 text-lg leading-relaxed max-w-xl font-medium">
                A cloud-based POS and restaurant management software system that helps you grow your sales. Built for single outlets, multi-brand cloud kitchens, and multi-location dining groups to manage billing, kitchen displays, and guest menus in real time.
              </motion.p>

              <motion.div variants={fadeUp} className="flex flex-wrap gap-4">
                <a
                  href="#signup"
                  className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-black font-black text-sm px-7 py-4 rounded-xl transition-all shadow-2xl shadow-amber-400/20"
                >
                  Request a Live Demo <ArrowRight size={16} />
                </a>
              </motion.div>

              {/* Trust badges */}
              <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-6 pt-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white/40">
                  <WifiOff size={13} className="text-amber-400" />
                  Works Offline
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white/40">
                  <Globe size={13} className="text-amber-400" />
                  Any Browser / Device
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white/40">
                  <Layers size={13} className="text-amber-400" />
                  Multi-Brand & Multi-Location
                </div>
              </motion.div>
            </div>

            {/* Right hero image */}
            <motion.div
              variants={fadeUp}
              className="flex-1 w-full max-w-2xl"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-amber-500/20 rounded-3xl blur-3xl scale-95" />
                <img
                  src="/mockups/tablet-pos.png"
                  alt="ManiPOS POS system on a tablet"
                  className="relative w-full rounded-2xl shadow-2xl shadow-black/60"
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section id="why" className="border-y border-white/[0.06] bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="text-center"
            >
              <p className="text-4xl sm:text-5xl font-black text-amber-400 leading-none">
                {s.prefix || ''}{s.value}{s.suffix || ''}
              </p>
              <p className="text-sm font-semibold text-white/40 mt-2 uppercase tracking-wider">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FEATURES TABS ── */}
      <section id="features" className="py-28 px-6">
        <div className="max-w-7xl mx-auto space-y-14">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-3"
          >
            <div className="inline-block bg-amber-400/10 text-amber-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider border border-amber-400/20">
              System Features
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight">
              Powerful Tools Built for<br />Every Restaurant Need
            </h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto font-medium">
              From the cashier counter to the kitchen wall — every screen is designed to keep your service fast, accurate, and profitable.
            </p>
          </motion.div>

          {/* Tab selector */}
          <div className="flex flex-wrap justify-center gap-3">
            {featureTabs.map((tab, i) => (
              <button
                key={i}
                onClick={() => setActiveFeatureTab(i)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer border ${
                  activeFeatureTab === i
                    ? 'bg-amber-400 text-black border-amber-400 shadow-lg shadow-amber-400/20'
                    : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            {featureTabs.map((tab, i) =>
              activeFeatureTab === i ? (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.4 }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center"
                >
                  {/* Image */}
                  <div className="relative">
                    <div className="absolute inset-0 bg-amber-500/15 rounded-3xl blur-3xl scale-90" />
                    <img
                      src={tab.image}
                      alt={tab.title}
                      className="relative w-full rounded-2xl shadow-2xl shadow-black/60 border border-white/[0.06]"
                    />
                  </div>
                  {/* Text */}
                  <div className="space-y-6">
                    <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-bold px-4 py-1.5 rounded-full uppercase">
                      {tab.icon} {tab.label}
                    </div>
                    <h3 className="text-3xl sm:text-4xl font-black leading-tight">{tab.title}</h3>
                    <p className="text-white/55 text-base leading-relaxed font-medium">{tab.desc}</p>
                    <ul className="space-y-3">
                      {tab.points.map((point, j) => (
                        <li key={j} className="flex items-center gap-3 text-sm font-semibold text-white/80">
                          <span className="w-5 h-5 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center flex-shrink-0">
                            <ChevronRight size={11} className="text-amber-400" />
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                    <a
                      href="#signup"
                      className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-black font-black text-sm px-6 py-3 rounded-xl transition-all"
                    >
                      See It in Action <ArrowRight size={15} />
                    </a>
                  </div>
                </motion.div>
              ) : null
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* ── MORE FEATURES GRID ── */}
      <section className="py-10 pb-28 px-6">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <div className="inline-block bg-amber-400/10 text-amber-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider border border-amber-400/20">
              System Capabilities & Development Roadmap
            </div>
            <h3 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Production Capabilities & Feature Roadmap
            </h3>
            <p className="text-white/50 text-base max-w-xl mx-auto font-medium">
              Features marked LIVE are ready for production store operations. Modules in active development are clearly marked as Coming Soon.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {getPublicFeatures().map((feat, i) => (
              <FeatureCard key={feat.id} feature={feat} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ── KDS SHOWCASE ── */}
      <section className="py-24 px-6 bg-white/[0.015] border-y border-white/[0.05]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="inline-block bg-amber-400/10 border border-amber-400/20 text-amber-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
              01 — Kitchen Operations
            </div>
            <h2 className="text-4xl sm:text-5xl font-black leading-tight">
              Convenient control of orders and services in your hands
            </h2>
            <p className="text-white/55 text-base leading-relaxed font-medium">
              ManiPOS simplifies the work of waiters, makes serving customers faster and more efficient, and gives restaurant managers a convenient tool to control all aspects of service.
            </p>
            <p className="text-white/45 text-sm leading-relaxed font-medium">
              The system's main functions include taking orders, integrating with the kitchen to transmit tickets, managing tables, and accounting for inventory balances in real time.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              {[
                { n: '10+', l: 'System Screens' },
                { n: '4', l: 'Core Modules' },
                { n: '100%', l: 'Cloud-Based' },
                { n: '24/7', l: 'Live Support' },
              ].map((s, i) => (
                <div key={i} className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5 text-center">
                  <p className="text-3xl font-black text-amber-400">{s.n}</p>
                  <p className="text-xs font-semibold text-white/40 mt-1 uppercase tracking-wider">{s.l}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute inset-0 bg-amber-500/15 rounded-3xl blur-3xl scale-90" />
            <img
              src="/mockups/kds-screen.png"
              alt="Kitchen Display System in a live restaurant kitchen"
              className="relative w-full rounded-2xl shadow-2xl shadow-black/60 border border-white/[0.06]"
            />
          </motion.div>
        </div>
      </section>

      {/* ── WAITER APP SHOWCASE ── */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative order-2 lg:order-1"
          >
            <div className="absolute inset-0 bg-amber-500/15 rounded-3xl blur-3xl scale-90" />
            <img
              src="/mockups/waiter-tablet.png"
              alt="Waiter using ManiPOS tablet app in restaurant"
              className="relative w-full rounded-2xl shadow-2xl shadow-black/60 border border-white/[0.06]"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6 order-1 lg:order-2"
          >
            <div className="inline-block bg-amber-400/10 border border-amber-400/20 text-amber-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider">
              02 — Tableside Service
            </div>
            <h2 className="text-4xl sm:text-5xl font-black leading-tight">
              Waiters order from their own device — instantly
            </h2>
            <p className="text-white/55 text-base leading-relaxed font-medium">
              Your waiters carry a smartphone or tablet and take orders directly at the table. No running back to a counter. No repeating orders. Every item goes straight to the kitchen display in seconds.
            </p>
            <ul className="space-y-3">
              {['Interactive floor map with table status', 'One-tap item selection and modifiers', 'Instant kitchen routing with zero delays', 'Works on Android phones, iPhones, and tablets'].map((p, i) => (
                <li key={i} className="flex items-center gap-3 text-sm font-semibold text-white/75">
                  <span className="w-5 h-5 rounded-full bg-amber-400/15 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
                    <ChevronRight size={11} className="text-amber-400" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* ── DASHBOARD SHOWCASE ── */}
      <section className="py-24 px-6 bg-white/[0.015] border-y border-white/[0.05]">
        <div className="max-w-7xl mx-auto space-y-14">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-3"
          >
            <div className="inline-block bg-amber-400/10 text-amber-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider border border-amber-400/20">
              03 — Owner Insights
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight">
              Run your restaurant from anywhere
            </h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto font-medium">
              The owner dashboard gives you a real-time view of every sale, every cashier, and every outlet — all from your laptop or phone.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute inset-0 bg-amber-500/10 rounded-3xl blur-3xl" />
            <img
              src="/mockups/laptop-dashboard.png"
              alt="ManiPOS owner dashboard on a laptop"
              className="relative w-full max-w-4xl mx-auto rounded-2xl shadow-2xl shadow-black/60 border border-white/[0.06]"
            />
          </motion.div>
        </div>
      </section>

      {/* ── WHOM WE SERVE ── */}
      <section id="outlets" className="py-24 px-6">
        <div className="max-w-7xl mx-auto space-y-14">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-3"
          >
            <div className="inline-block bg-amber-400/10 text-amber-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider border border-amber-400/20">
              Whom We Serve
            </div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight">
              Tailored Solutions for Every Outlet Concept
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <Utensils size={22} />, title: 'Fine Dine & Full Service', desc: 'Table layouts, bill splitting, order courses, and mobile waiter ordering.' },
              { icon: <Zap size={22} />, title: 'QSR & Take Away', desc: 'Rapid billing, order queue screens, customer takeaway printing, and fast checkout.' },
              { icon: <Building2 size={22} />, title: 'Multi-Brand Outlets', desc: 'Multi-brand dispatch, automated ticket routing, and central inventory.' },
              { icon: <Coffee size={22} />, title: 'Cafes & Bakeries', desc: 'Item modifiers, combo deals, loyalty rewards, and rapid order workflows.' },
            ].map((o, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white/[0.03] border border-white/[0.07] hover:border-amber-400/30 hover:bg-white/[0.05] rounded-2xl p-7 space-y-4 transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-amber-400 text-black flex items-center justify-center group-hover:scale-110 transition-transform">
                  {o.icon}
                </div>
                <h4 className="text-base font-black text-white">{o.title}</h4>
                <p className="text-sm font-medium text-white/45 leading-relaxed">{o.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative overflow-hidden bg-amber-400 rounded-3xl px-10 py-16 text-center shadow-2xl shadow-amber-400/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-300 to-amber-500" />
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-amber-300/40 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-amber-600/30 rounded-full blur-3xl" />
            <div className="relative z-10 max-w-2xl mx-auto space-y-5">
              <h2 className="text-4xl sm:text-5xl font-black text-black tracking-tight">
                Ready to Upgrade Your Restaurant Management?
              </h2>
              <p className="text-black/65 font-semibold text-lg">
                Join fast-growing restaurants leveraging ManiPOS to boost revenue and streamline kitchen operations.
              </p>
              <div className="flex flex-wrap justify-center gap-4 pt-2">
                <a
                  href="#signup"
                  className="inline-flex items-center gap-2 bg-black hover:bg-zinc-900 text-white font-black text-sm px-8 py-4 rounded-xl transition-all shadow-xl"
                >
                  Request Demo <ArrowRight size={16} />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── REQUEST DEMO FORM ── */}
      <section id="signup" className="py-24 px-6">
        <div className="max-w-3xl mx-auto space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center space-y-3"
          >
            <div className="inline-block bg-amber-400/10 text-amber-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider border border-amber-400/20">
              Get Started
            </div>
            <h2 className="text-4xl font-black">Request a Live Demo</h2>
            <p className="text-white/50 font-medium">Fill in your details and our team will set up a personalised walkthrough for your restaurant.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white/[0.03] border border-white/[0.08] rounded-3xl p-8 sm:p-10"
          >
            {!leadSuccess ? (
              <form onSubmit={handleLeadSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                      Restaurant Name <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.restaurantName}
                      onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                      placeholder="e.g. Savory Bistro"
                      className="w-full bg-white/[0.05] border border-white/[0.1] focus:border-amber-400/60 rounded-xl px-4 py-3 text-sm text-white font-semibold placeholder:text-white/25 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                      Owner Email <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="owner@restaurant.com"
                      className="w-full bg-white/[0.05] border border-white/[0.1] focus:border-amber-400/60 rounded-xl px-4 py-3 text-sm text-white font-semibold placeholder:text-white/25 focus:outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                      Mobile Phone Number
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+254 700 000 000"
                      className="w-full bg-white/[0.05] border border-white/[0.1] focus:border-amber-400/60 rounded-xl px-4 py-3 text-sm text-white font-semibold placeholder:text-white/25 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                      City / Location
                    </label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="e.g. Nairobi"
                      className="w-full bg-white/[0.05] border border-white/[0.1] focus:border-amber-400/60 rounded-xl px-4 py-3 text-sm text-white font-semibold placeholder:text-white/25 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {leadError && <p className="text-red-400 text-xs font-bold">{leadError}</p>}

                <button
                  type="submit"
                  disabled={leadLoading}
                  className="w-full bg-amber-400 hover:bg-amber-300 text-black font-black text-sm py-4 px-6 rounded-xl transition-all shadow-lg shadow-amber-400/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {leadLoading ? <Loader2 className="animate-spin" size={18} /> : (
                    <>
                      <span>Request Demo</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <div className="py-10 text-center space-y-4">
                <div className="w-16 h-16 bg-emerald-400/10 border border-emerald-400/30 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle2 size={32} className="text-emerald-400" />
                </div>
                <h3 className="text-xl font-black text-white">Request Received!</h3>
                <p className="text-white/50 text-sm font-medium max-w-sm mx-auto">
                  Thank you! Our team will reach out within 24 hours to schedule your personalised live demo.
                </p>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 px-6 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-3"
          >
            <div className="inline-block bg-amber-400/10 text-amber-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider border border-amber-400/20">
              FAQ
            </div>
            <h2 className="text-4xl font-black">Frequently Asked Questions</h2>
          </motion.div>

          <div className="space-y-3">
            {faqData.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.08 }}
                  className={`border rounded-2xl overflow-hidden transition-all ${isOpen ? 'border-amber-400/40 bg-white/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'}`}
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full px-6 py-5 text-left flex justify-between items-center gap-4 cursor-pointer"
                  >
                    <span className={`text-base font-bold transition-colors ${isOpen ? 'text-amber-400' : 'text-white/80'}`}>{faq.q}</span>
                    <ChevronDown size={18} className={`text-amber-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <p className="px-6 pb-5 text-white/50 text-sm leading-relaxed font-medium">{faq.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── DESKTOP DOWNLOAD SECTION ── */}
      <section id="download" className="py-24 px-6 border-t border-white/[0.05] bg-gradient-to-b from-transparent to-slate-950">
        <div className="max-w-5xl mx-auto bg-gradient-to-r from-orange-950/40 via-amber-950/20 to-slate-900 border border-orange-500/30 rounded-3xl p-10 sm:p-14 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="inline-block bg-orange-500/20 text-orange-400 font-bold text-xs px-4 py-1.5 rounded-full uppercase tracking-wider border border-orange-500/30">
            Offline-First Desktop App
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Download ManiPOS for Windows
          </h2>
          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto font-medium">
            Never stop selling when Wi-Fi goes down. Run your register offline with local storage, local ESC/POS thermal printing, and automatic background cloud sync.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
            <a
              href="/release/ManiPOS-Setup-1.0.0.exe"
              download
              className="w-full sm:w-auto bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-base px-8 py-4 rounded-2xl shadow-xl shadow-orange-500/20 hover:from-orange-600 hover:to-amber-600 transition-all flex items-center justify-center gap-3 group cursor-pointer"
            >
              <span>Download Desktop App (.exe)</span>
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-md uppercase font-extrabold">v1.0.0</span>
            </a>
            <button
              onClick={() => onProceedToLogin()}
              className="w-full sm:w-auto bg-slate-900 border border-slate-700 text-slate-200 font-bold text-base px-8 py-4 rounded-2xl hover:bg-slate-800 transition-all cursor-pointer"
            >
              Launch Web POS Terminal
            </button>
          </div>
          <div className="pt-4 text-xs font-bold text-slate-500 tracking-wide flex items-center justify-center gap-4">
            <span>✓ Windows 10 & 11 Compatible</span>
            <span>•</span>
            <span>✓ QZ Tray Printing Included</span>
            <span>•</span>
            <span>✓ Local-First Database</span>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5 text-sm">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-amber-400 rounded-lg flex items-center justify-center font-black text-black text-sm">M</div>
            <span className="font-extrabold text-white">ManiPOS</span>
            <span className="text-white/30">• Cloud Restaurant POS & Management System</span>
          </div>
          <p className="text-white/30 font-semibold">© {new Date().getFullYear()} ManiPOS. All rights reserved.</p>
        </div>
      </footer>

      {/* ── SELF-SERVICE STORE ONBOARDING MODAL ── */}
      <AnimatePresence>
        {showOnboardModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden"
            >
              <button
                onClick={() => setShowOnboardModal(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>

              <div className="space-y-1.5 mb-6">
                <h3 className="text-2xl font-bold text-white tracking-tight">Set Up Your Restaurant Account</h3>
                <p className="text-slate-400 text-xs font-medium">
                  Create your store profile, admin credentials, and initial register configuration.
                </p>
              </div>

              {onboardSuccess ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl font-black">✓</div>
                  <h4 className="text-lg font-bold text-white">Store Successfully Created!</h4>
                  <p className="text-slate-300 text-xs">
                    Welcome <span className="font-bold text-emerald-400">{onboardSuccess.restaurant_name}</span>. Redirecting to your live register terminal...
                  </p>
                  <div className="text-xs font-bold text-slate-500 animate-pulse">Opening POS Terminal...</div>
                </div>
              ) : (
                <form onSubmit={handleSelfServiceOnboard} className="space-y-4">
                  {onboardError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-rose-400 text-xs font-semibold flex items-center gap-2">
                      <AlertTriangle size={16} />
                      <span>{onboardError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Restaurant / Store Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Swahili Kitchen"
                      value={onboardData.name}
                      onChange={(e) => {
                        const nameVal = e.target.value;
                        const autoSlug = nameVal.toLowerCase().replace(/[^a-z0-9]/g, '');
                        setOnboardData(prev => ({ ...prev, name: nameVal, slug: autoSlug }));
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Subdomain Code (URL Slug)</label>
                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-400">
                      <input
                        type="text"
                        placeholder="swahilikitchen"
                        value={onboardData.slug}
                        onChange={(e) => setOnboardData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') }))}
                        className="bg-transparent border-none text-white focus:outline-none w-full font-mono text-xs"
                        required
                      />
                      <span className="text-xs text-slate-500 font-bold flex-shrink-0">.pos.manipos.com</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Manager Name</label>
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={onboardData.managerName}
                        onChange={(e) => setOnboardData(prev => ({ ...prev, managerName: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">4-Digit Security PIN</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="1234"
                        value={onboardData.pin}
                        onChange={(e) => setOnboardData(prev => ({ ...prev, pin: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 font-mono text-center font-bold tracking-widest"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Contact Phone (Optional)</label>
                    <input
                      type="text"
                      placeholder="+254 700 000 000"
                      value={onboardData.phone}
                      onChange={(e) => setOnboardData(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 font-medium"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={onboardLoading}
                    className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    {onboardLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-slate-950" />
                        <span>Provisioning Store & Menu...</span>
                      </>
                    ) : (
                      <span>Create Restaurant Store</span>
                    )}
                  </button>
                </form>
              )}
            </motion.div>
          </div>
        )}

        {/* SIGN IN TO EXISTING RESTAURANT MODAL */}
        {showSignInModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full relative shadow-2xl space-y-6 text-left"
            >
              <button
                onClick={() => setShowSignInModal(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="space-y-2">
                <span className="px-3 py-1 bg-amber-400/10 text-amber-400 border border-amber-400/20 text-xs font-bold rounded-full uppercase tracking-wider inline-block">
                  Existing Restaurant Sign In
                </span>
                <h3 className="text-2xl font-black text-white tracking-tight">Sign In to ManiPOS</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Enter your restaurant subdomain code or store slug to access your POS terminal & management workspace.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const slug = (signInSlug || '').toLowerCase().trim();
                  if (!slug) return;
                  setShowSignInModal(false);
                  if (onProceedToLogin) {
                    onProceedToLogin(slug);
                  } else {
                    window.location.href = `/?tenant=${slug}&page=pos`;
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">Store Subdomain / Slug</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      placeholder="e.g. potofjollof, littlelagos, myrestaurant"
                      value={signInSlug}
                      onChange={(e) => setSignInSlug(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-400 font-mono font-bold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono pt-0.5">e.g. https://[store-slug].pos.manipos.com</p>
                </div>

                <button
                  type="submit"
                  className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm py-3.5 rounded-xl transition-all shadow-lg shadow-amber-400/10 flex items-center justify-center gap-2 cursor-pointer mt-4"
                >
                  <span>Continue to Store Login</span>
                  <ArrowRight size={16} />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
