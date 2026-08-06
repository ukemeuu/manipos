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
  Menu,
  Truck,
  Star,
  MessageSquare,
  Link2,
  Lock,
  Flame,
  Check,
  PhoneCall,
  Clock,
  Play
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
  const [activeFeatureTab, setActiveFeatureTab] = useState('delivery'); // 'delivery', 'feedback', 'linkhub', 'erp'

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
      q: "What is ManiPOS cloud software?",
      a: "ManiPOS is a modern, high-performance cloud restaurant POS, Delivery API Sync, and ERP Management software system designed for physical restaurants, cloud kitchens, cafes, and multi-brand outlets."
    },
    {
      q: "How does UberEats & Glovo API integration work?",
      a: "ManiPOS unifies third-party delivery platforms into a single cashier screen. When an order is placed on UberEats, Glovo, or Bolt Food, it flows automatically into your POS register and prints to your kitchen KDS without manual re-typing."
    },
    {
      q: "How does the Guest Feedback & Discount Voucher feature work?",
      a: "Every printed thermal receipt automatically includes a unique Feedback QR Code. When customers scan it, they complete a 5-star rating flow and receive an instant KSH 200 discount code for their next visit, while reviews populate live in your Manager Dashboard."
    },
    {
      q: "Does ManiPOS work offline if internet drops?",
      a: "Yes! The POS terminal includes local-first offline fallback. Cashier orders and thermal kitchen tickets print uninterrupted during internet outages, syncing back to the cloud as soon as connection restores."
    },
    {
      q: "How do cashiers and waiters log in?",
      a: "Staff members log in using a fast 4-digit PIN on any tablet, iPad, or computer screen. Different PIN permissions grant cashiers access to the register and managers access to full analytics and stock control."
    }
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFC] text-slate-900 font-sans antialiased selection:bg-amber-400 selection:text-slate-950 flex flex-col justify-between">
      
      {/* Quickeat-Style Top Header Banner */}
      <div className="bg-slate-950 text-white text-xs py-2.5 px-4 text-center font-semibold flex items-center justify-center gap-2 border-b border-slate-800">
        <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">New Feature</span>
        <span>UberEats, Glovo & WhatsApp Direct Delivery API Sync is Live on ManiPOS!</span>
        <a href="#signup" className="underline text-amber-400 hover:text-amber-300 font-bold ml-1">Request Demo &rarr;</a>
      </div>

      {/* Main Navigation Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-400 rounded-2xl flex items-center justify-center font-black text-slate-950 text-2xl shadow-lg shadow-amber-400/20">
            M
          </div>
          <div>
            <span className="text-2xl font-black tracking-tight text-slate-950">Mani<span className="text-amber-500">POS</span></span>
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block -mt-1">Cloud Restaurant Engine</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-xs font-extrabold text-slate-600 uppercase tracking-wider">
          <a href="#features" className="hover:text-amber-500 transition-colors">Features</a>
          <a href="#integrations" className="hover:text-amber-500 transition-colors">Delivery API</a>
          <a href="#feedback" className="hover:text-amber-500 transition-colors">Guest Feedback</a>
          <a href="#linkhub" className="hover:text-amber-500 transition-colors">Link Hub</a>
          <a href="#erp" className="hover:text-amber-500 transition-colors">ERP & Stock</a>
          <a href="#faq" className="hover:text-amber-500 transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onProceedToLogin('potofjollof')}
            className="text-xs font-extrabold text-slate-700 hover:text-slate-950 px-4 py-2.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer"
          >
            Staff Sign In
          </button>
          <a
            href="#signup"
            className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-amber-400/20 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span>Request Demo</span>
            <ArrowRight size={14} />
          </a>
        </div>
      </header>

      {/* Hero Section - Quickeat Style */}
      <section className="relative pt-12 pb-20 md:pt-16 md:pb-28 overflow-hidden bg-gradient-to-b from-white via-slate-50/50 to-[#FAFAFC]">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Hero Left Content */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200/80 px-3.5 py-1.5 rounded-full text-amber-700 text-xs font-extrabold">
              <Sparkles size={14} className="text-amber-500" />
              <span>Next-Gen Cloud POS & Delivery Infrastructure</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-950 tracking-tight leading-[1.1]">
              The All-In-One <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 bg-clip-text text-transparent">Cloud POS & Delivery Sync</span> For Restaurants
            </h1>

            <p className="text-slate-600 text-base sm:text-lg font-medium leading-relaxed max-w-2xl">
              Power your cashiers with 4-digit PIN logins, unify <strong>UberEats & Glovo</strong> orders, collect <strong>5-Star Guest Feedback</strong> with automatic discount vouchers, and manage multi-brand cloud kitchens from one dashboard.
            </p>

            {/* Quick Feature Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200/70 shadow-sm">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span>UberEats & Glovo API</span>
              </div>
              <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200/70 shadow-sm">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span>Thermal Feedback QR</span>
              </div>
              <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200/70 shadow-sm col-span-2 sm:col-span-1">
                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                <span>Modular ERP & Stock</span>
              </div>
            </div>

            {/* Hero CTA Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-4">
              <a
                href="#signup"
                className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm px-8 py-4 rounded-2xl shadow-xl shadow-amber-400/25 transition-all text-center flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Request Free Demo</span>
                <ArrowRight size={18} />
              </a>
              <button
                onClick={() => onProceedToLogin('potofjollof')}
                className="bg-slate-950 hover:bg-slate-900 text-white font-extrabold text-sm px-8 py-4 rounded-2xl shadow-xl shadow-slate-950/20 transition-all text-center flex items-center justify-center gap-2 cursor-pointer border border-slate-800"
              >
                <Monitor size={18} className="text-amber-400" />
                <span>Launch POS Register Terminal</span>
              </button>
            </div>

            {/* Quickeat Ratings Pill */}
            <div className="flex items-center gap-4 pt-4 border-t border-slate-200/60">
              <div className="flex -space-x-2 overflow-hidden">
                <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">PJ</div>
                <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-slate-900 text-amber-400 font-black text-xs flex items-center justify-center">MK</div>
                <div className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">LL</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-amber-400 text-xs">
                  <Star size={14} fill="#F59E0B" />
                  <Star size={14} fill="#F59E0B" />
                  <Star size={14} fill="#F59E0B" />
                  <Star size={14} fill="#F59E0B" />
                  <Star size={14} fill="#F59E0B" />
                  <span className="font-black text-slate-900 ml-1 text-xs">4.9 / 5.0</span>
                </div>
                <p className="text-[11px] text-slate-500 font-bold">Trusted by Pot of Jollof Ltd & Cloud Kitchen Brands</p>
              </div>
            </div>

          </div>

          {/* Hero Right Visual Mockup Showcase (Quickeat Floating Cards Layout) */}
          <div className="lg:col-span-5 relative">
            
            {/* Background Glow */}
            <div className="absolute -top-10 -right-10 w-72 h-72 bg-amber-300/30 rounded-full blur-3xl -z-10" />
            <div className="absolute -bottom-10 -left-10 w-72 h-72 bg-orange-400/20 rounded-full blur-3xl -z-10" />

            {/* Main Interactive Screen Card */}
            <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl shadow-2xl space-y-5 text-white relative">
              
              {/* Card Header */}
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs font-mono text-slate-400 ml-2">potofjollof.pos.manipos.com</span>
                </div>
                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  ● Live Register Active
                </span>
              </div>

              {/* Order Item Row Mockup 1 */}
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-black">
                    🍲
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-white">Jollof Rice & Grilled Chicken</h4>
                    <p className="text-xs text-slate-400 font-medium">Table #4 &bull; Dine-In</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-amber-400 font-extrabold text-sm">KSH 1,400</span>
                  <span className="block text-[10px] text-emerald-400 font-bold">M-Pesa Verified</span>
                </div>
              </div>

              {/* Order Item Row Mockup 2 - UberEats Sync */}
              <div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                    <Truck size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-extrabold text-amber-400">UberEats Direct Order</h4>
                      <span className="bg-amber-400 text-slate-950 text-[9px] font-black uppercase px-1.5 rounded">API</span>
                    </div>
                    <p className="text-xs text-slate-300 font-medium">Order #UB-982 &bull; Instant KDS Dispatch</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-slate-300">Prep: 8m</span>
              </div>

              {/* Thermal Receipt Feedback Floating Badge */}
              <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Receipt size={16} />
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 block text-[11px]">Thermal Ticket Printed</span>
                    <span className="text-[10px] text-slate-400">Feedback QR Included</span>
                  </div>
                </div>
                <span className="text-emerald-400 font-black text-xs">⭐ 5.0 Rating</span>
              </div>

            </div>

            {/* Quickeat Floating Pill Badge (Top Left) */}
            <motion.div 
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute -top-6 -left-6 bg-white p-3.5 rounded-2xl shadow-xl border border-slate-200/80 flex items-center gap-3 hidden sm:flex"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
                ⚡
              </div>
              <div className="text-left">
                <span className="text-xs font-black text-slate-950 block">Instant Order Prep</span>
                <span className="text-[10px] font-bold text-slate-500">Zero Delay Dispatch</span>
              </div>
            </motion.div>

            {/* Quickeat Floating Pill Badge (Bottom Right) */}
            <motion.div 
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="absolute -bottom-6 -right-6 bg-white p-3.5 rounded-2xl shadow-xl border border-slate-200/80 flex items-center gap-3 hidden sm:flex"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                🎟️
              </div>
              <div className="text-left">
                <span className="text-xs font-black text-slate-950 block">KSH 200 Voucher</span>
                <span className="text-[10px] font-bold text-emerald-600">Auto Generated</span>
              </div>
            </motion.div>

          </div>

        </div>
      </section>

      {/* Client Brands Social Proof Bar */}
      <section className="bg-white border-y border-slate-200/80 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
            POWERING LEADING RESTAURANTS & CLOUD KITCHENS
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-14 opacity-85 text-slate-800 font-black text-sm sm:text-base">
            <span className="flex items-center gap-2 hover:text-amber-500 transition-colors"><Utensils size={18} className="text-amber-500" /> Pot of Jollof Ltd</span>
            <span className="flex items-center gap-2 hover:text-amber-500 transition-colors"><Flame size={18} className="text-orange-500" /> Mute Kitchens</span>
            <span className="flex items-center gap-2 hover:text-amber-500 transition-colors"><Store size={18} className="text-emerald-500" /> Little Lagos</span>
            <span className="flex items-center gap-2 hover:text-amber-500 transition-colors"><Coffee size={18} className="text-amber-600" /> Cafe Swahili</span>
            <span className="flex items-center gap-2 hover:text-amber-500 transition-colors"><Store size={18} className="text-blue-500" /> Samaki Street</span>
            <span className="flex items-center gap-2 hover:text-amber-500 transition-colors"><Sparkles size={18} className="text-amber-400" /> Yellow Juice Bar</span>
          </div>
        </div>
      </section>

      {/* Section 1: How It Works (Quickeat 3-Step Flow) */}
      <section className="py-20 max-w-7xl mx-auto px-6 text-center space-y-12">
        <div className="max-w-3xl mx-auto space-y-3">
          <span className="text-amber-500 font-extrabold text-xs uppercase tracking-widest bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
            Simplified Workflow
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
            How ManiPOS Runs Your Restaurant Operations
          </h2>
          <p className="text-slate-600 text-sm font-medium">
            From cashier pin entry to kitchen ticket printing and guest feedback collection.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          
          {/* Step 1 */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-md relative space-y-4 hover:border-amber-400 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 font-black text-xl flex items-center justify-center shadow-lg shadow-amber-400/20">
              1
            </div>
            <h3 className="text-xl font-extrabold text-slate-950">Fast Order Entry & Delivery Sync</h3>
            <p className="text-slate-600 text-xs font-medium leading-relaxed">
              Cashiers log in using a 4-digit PIN. Take dine-in orders or let UberEats & Glovo delivery orders flow directly into the register automatically.
            </p>
            <div className="pt-2 text-xs font-bold text-amber-600 flex items-center gap-1">
              <span>Supports M-Pesa & Cash</span> &rarr;
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-md relative space-y-4 hover:border-amber-400 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-slate-950 text-amber-400 font-black text-xl flex items-center justify-center shadow-lg shadow-slate-950/20">
              2
            </div>
            <h3 className="text-xl font-extrabold text-slate-950">Kitchen KDS & Thermal Ticket</h3>
            <p className="text-slate-600 text-xs font-medium leading-relaxed">
              Orders print instantly to kitchen thermal printers. Receipts automatically feature your customized <strong>Feedback QR code</strong>.
            </p>
            <div className="pt-2 text-xs font-bold text-amber-600 flex items-center gap-1">
              <span>Thermal Receipt QR Included</span> &rarr;
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-8 rounded-3xl border border-slate-200/80 shadow-md relative space-y-4 hover:border-amber-400 transition-all">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 font-black text-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              3
            </div>
            <h3 className="text-xl font-extrabold text-slate-950">5-Star Feedback & Rewards</h3>
            <p className="text-slate-600 text-xs font-medium leading-relaxed">
              Guests scan the receipt QR, leave 5-star reviews, and receive an instant <strong>KSH 200 voucher</strong> code for repeat business.
            </p>
            <div className="pt-2 text-xs font-bold text-amber-600 flex items-center gap-1">
              <span>Real-Time Manager Dashboard</span> &rarr;
            </div>
          </div>

        </div>
      </section>

      {/* Section 2: Interactive Feature Showcase Tabs (Quickeat Style) */}
      <section id="features" className="py-20 bg-slate-950 text-white relative">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
          
          <div className="max-w-3xl mx-auto text-center space-y-3">
            <span className="text-amber-400 font-extrabold text-xs uppercase tracking-widest bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
              Core Platform Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Built Specifically for Fast-Paced Food Businesses
            </h2>
            <p className="text-slate-400 text-sm font-medium">
              Explore our core modules designed to maximize revenue and simplify restaurant management.
            </p>
          </div>

          {/* Feature Tab Selector */}
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setActiveFeatureTab('delivery')}
              className={`px-5 py-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeFeatureTab === 'delivery' 
                  ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20' 
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Truck size={16} />
              <span>UberEats & Glovo API Sync</span>
            </button>

            <button
              onClick={() => setActiveFeatureTab('feedback')}
              className={`px-5 py-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeFeatureTab === 'feedback' 
                  ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20' 
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Star size={16} />
              <span>Feedback QR & Vouchers</span>
            </button>

            <button
              onClick={() => setActiveFeatureTab('linkhub')}
              className={`px-5 py-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeFeatureTab === 'linkhub' 
                  ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20' 
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Link2 size={16} />
              <span>Link Hub & Video Page</span>
            </button>

            <button
              onClick={() => setActiveFeatureTab('erp')}
              className={`px-5 py-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer flex items-center gap-2 ${
                activeFeatureTab === 'erp' 
                  ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20' 
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <Layers size={16} />
              <span>Modular ERP & Stock</span>
            </button>
          </div>

          {/* Active Tab Panel Display */}
          <div className="bg-slate-900 border border-slate-800 p-8 sm:p-12 rounded-3xl shadow-2xl">
            {activeFeatureTab === 'delivery' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center text-left">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                    <Truck size={16} />
                    <span>Unified Third-Party Order Routing</span>
                  </div>
                  <h3 className="text-3xl font-black text-white">No More Multiple Tablets at the Cashier Desk</h3>
                  <p className="text-slate-300 text-sm font-medium leading-relaxed">
                    Stop manually re-keying UberEats, Glovo, and Bolt Food orders into your POS register. ManiPOS consolidates third-party delivery APIs into one unified order queue, automatically sending kitchen tickets to your chef.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300 font-semibold pt-2">
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Direct API order ingestion into POS register</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Instant thermal kitchen printing & KDS ticket dispatch</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Consolidated daily revenue reports across all delivery apps</li>
                  </ul>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-4 font-mono text-xs text-slate-300">
                  <div className="text-amber-400 font-bold flex justify-between">
                    <span>UBEREATS_API_DISPATCH</span>
                    <span>[STATUS: ONLINE]</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                    <p className="text-emerald-400 font-bold">✓ Order #UB-8902 Received</p>
                    <p className="text-slate-400">Jollof Rice Extra Plantain x 2 &bull; KSH 1,800</p>
                    <p className="text-slate-500 text-[10px] mt-1">Dispatched to Kitchen Thermal Printer #1</p>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'feedback' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center text-left">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 text-emerald-400 font-extrabold text-xs uppercase tracking-wider">
                    <Star size={16} />
                    <span>Automated Customer Reviews & Vouchers</span>
                  </div>
                  <h3 className="text-3xl font-black text-white">Turn Every Thermal Receipt into 5-Star Reviews</h3>
                  <p className="text-slate-300 text-sm font-medium leading-relaxed">
                    ManiPOS automatically embeds a custom QR code on every customer receipt. Guests scan to rate their meal experience and instantly unlock a <strong>KSH 200 discount code voucher</strong> for their next order.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300 font-semibold pt-2">
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Typeform-style 5-star rating flow for mobile</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Automated discount voucher creation to drive repeat visits</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Live feedback cards inside Manager Dashboard</li>
                  </ul>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-4 text-xs">
                  <div className="flex justify-between items-center text-white">
                    <span className="font-extrabold text-amber-400">Guest Review #402</span>
                    <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold">⭐ 5.0 Rating</span>
                  </div>
                  <p className="text-slate-300 italic font-serif">"The Jollof Rice was hot and delicious! Fast delivery to Westlands."</p>
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-amber-400 font-bold font-mono">
                    <span>REWARD: VOUCHER_KSH200</span>
                    <span className="text-emerald-400 text-[10px]">ISSUED</span>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'linkhub' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center text-left">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                    <Link2 size={16} />
                    <span>LinkTree Landing Page for Restaurants</span>
                  </div>
                  <h3 className="text-3xl font-black text-white">Self-Serve Social Link Hub & Video Page</h3>
                  <p className="text-slate-300 text-sm font-medium leading-relaxed">
                    Give your restaurant a beautiful LinkTree-style public page. Direct customers to WhatsApp delivery, UberEats, Dine-In QR menus, and Instagram — complete with custom static image or looping video backgrounds.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300 font-semibold pt-2">
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> WhatsApp Direct Ordering integration</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Custom MP4 video or static image background loader</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Managed directly inside your POS Admin Panel</li>
                  </ul>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl text-center space-y-3 text-xs">
                  <div className="w-12 h-12 bg-amber-400 text-slate-950 rounded-2xl mx-auto flex items-center justify-center font-black text-xl">PJ</div>
                  <h4 className="text-white font-extrabold">Pot of Jollof Ltd</h4>
                  <div className="space-y-2 pt-2">
                    <div className="bg-amber-400 text-slate-950 font-bold py-2 rounded-xl">🍔 Order on UberEats</div>
                    <div className="bg-emerald-500 text-slate-950 font-bold py-2 rounded-xl">💬 WhatsApp Direct Delivery</div>
                  </div>
                </div>
              </div>
            )}

            {activeFeatureTab === 'erp' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center text-left">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                    <Layers size={16} />
                    <span>Enterprise Stock & Procurement Engine</span>
                  </div>
                  <h3 className="text-3xl font-black text-white">Modular ERP & Supplier Inventory Control</h3>
                  <p className="text-slate-300 text-sm font-medium leading-relaxed">
                    Track ingredient stock levels, manage supplier procurement orders, and monitor staff shifts. Unlocked per tenant with modular licensing and bank transfer activation.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-300 font-semibold pt-2">
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Ingredient recipe costing & low-stock alerts</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Supplier purchase order management</li>
                    <li className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> Staff shift attendance & payroll tracking</li>
                  </ul>
                </div>
                <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-3 text-xs text-slate-300 font-mono">
                  <div className="flex justify-between font-bold text-white">
                    <span>INVENTORY_STOCK_LEVELS</span>
                    <span className="text-amber-400">SYNCED</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between">
                    <span>Basmati Rice (25kg Bag)</span>
                    <span className="text-emerald-400 font-bold">14 Bags Remaining</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between">
                    <span>Cooking Oil (20L Container)</span>
                    <span className="text-amber-400 font-bold">2 Containers [REORDER]</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </section>

      {/* Section 3: Lead Signup Form (Connected to Supabase `leads` table) */}
      <section id="signup" className="py-20 max-w-7xl mx-auto px-6">
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white rounded-3xl p-8 sm:p-14 shadow-2xl border border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          <div className="lg:col-span-6 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 bg-amber-400/10 text-amber-400 border border-amber-400/20 px-3.5 py-1.5 rounded-full text-xs font-extrabold">
              <Sparkles size={14} />
              <span>Get Started in 24 Hours</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
              Ready to Upgrade Your Restaurant with ManiPOS?
            </h2>

            <p className="text-slate-300 text-sm font-medium leading-relaxed">
              Book a live demonstration with our cloud POS engineers. We'll set up your menu, connect your thermal printers, and configure your delivery API integration.
            </p>

            <div className="space-y-3 pt-2 text-xs font-bold text-slate-300">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</div>
                <span>Free On-Site Hardware & Printer Setup</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</div>
                <span>4-Digit Staff PIN & Manager Access Configuration</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</div>
                <span>UberEats & Glovo API Integration Included</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white text-slate-950 p-8 rounded-3xl shadow-xl space-y-6">
            <div className="text-left">
              <h3 className="text-2xl font-black text-slate-950">Request a Free Live Demo</h3>
              <p className="text-xs text-slate-500 font-semibold mt-1">Fill out the form below and our POS team will contact you immediately.</p>
            </div>

            {leadSuccess ? (
              <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-500 text-slate-950 rounded-2xl mx-auto flex items-center justify-center font-black text-xl">
                  ✓
                </div>
                <h4 className="text-lg font-black text-emerald-950">Demo Request Submitted!</h4>
                <p className="text-xs text-slate-600 font-medium">Thank you! A ManiPOS specialist will call you shortly to schedule your live system walk-through.</p>
              </div>
            ) : (
              <form onSubmit={handleLeadSubmit} className="space-y-4 text-left">
                {leadError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl text-xs font-bold">
                    {leadError}
                  </div>
                )}

                <div>
                  <label className="text-xs font-extrabold text-slate-700 block mb-1">Restaurant / Brand Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.restaurantName}
                    onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                    placeholder="e.g. Pot of Jollof Kitchen"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:border-amber-400 focus:outline-none font-bold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-extrabold text-slate-700 block mb-1">Work Email Address *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="owner@restaurant.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-extrabold text-slate-700 block mb-1">Phone Number (WhatsApp)</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="0795384140"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:border-amber-400 focus:outline-none font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-slate-700 block mb-1">Location / Number of Outlets</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g. Nairobi, Kilimani (2 Outlets)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={leadLoading}
                  className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black py-4 rounded-xl shadow-lg shadow-amber-400/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm mt-2"
                >
                  {leadLoading ? <Loader2 className="animate-spin" size={18} /> : (
                    <>
                      <span>Submit Free Demo Request</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section id="faq" className="py-16 max-w-5xl mx-auto px-6 w-full text-left">
        <div className="bg-white p-8 sm:p-12 rounded-3xl border border-slate-200 shadow-lg space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-amber-500 font-extrabold text-xs uppercase tracking-widest">Got Questions?</span>
            <h2 className="text-3xl font-black text-slate-950 tracking-tight">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4 divide-y divide-slate-200">
            {faqData.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div key={idx} className="pt-4 first:pt-0">
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full py-2 text-left flex justify-between items-center text-base font-bold text-slate-950 hover:text-amber-600 transition-colors cursor-pointer"
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
      </section>

      {/* Dark Footer */}
      <footer className="w-full bg-slate-950 text-slate-400 py-12 border-t border-slate-800 text-xs font-semibold">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-400 rounded-xl flex items-center justify-center font-black text-slate-950 text-base">
              M
            </div>
            <div>
              <span className="text-white font-extrabold text-sm block">ManiPOS Cloud Engine</span>
              <span className="text-[10px] text-slate-500">Powering Pot of Jollof Ltd, Mute Kitchens & Cloud Restaurants</span>
            </div>
          </div>
          <div className="flex items-center gap-6 text-slate-400 font-bold">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#integrations" className="hover:text-white">Delivery API</a>
            <a href="#signup" className="hover:text-white">Request Demo</a>
            <span>&copy; {new Date().getFullYear()} ManiPOS. All rights reserved.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
