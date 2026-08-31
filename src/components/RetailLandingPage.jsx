import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scan,
  Package,
  Boxes,
  Zap,
  TrendingUp,
  ShieldCheck,
  Smartphone,
  Receipt,
  ShoppingCart,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Store,
  Sparkles,
  WifiOff,
  Percent,
  Barcode,
  Search,
  Plus,
  Trash2,
  Printer,
  ChevronDown,
  X,
  Menu as MenuIcon
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

export function RetailLandingPage({ onProceedToLogin, onLaunchRetailDemo, onSwitchToRestaurant }) {
  const [formData, setFormData] = useState({
    storeName: '',
    email: '',
    phone: '',
    storeType: 'Mini-mart / Supermarket',
  });
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState(false);
  const [leadError, setLeadError] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Interactive Scan Simulator State
  const sampleProducts = [
    { id: 1, name: 'Premium Arabica Coffee 500g', barcode: '8901234567890', sku: 'COF-500', price: 14.50, stock: 42, category: 'Beverages', tag: 'High Margin' },
    { id: 2, name: 'Wireless Ergonomic Mouse', barcode: '8909876543210', sku: 'ACC-MOU', price: 29.99, stock: 18, category: 'Electronics', tag: 'Fast Seller' },
    { id: 3, name: 'Organic Cold-Pressed Olive Oil 1L', barcode: '8905556667770', sku: 'OIL-100', price: 22.00, stock: 7, category: 'Groceries', tag: 'Low Stock' },
    { id: 4, name: 'Cotton Crewneck Tee - L/Navy', barcode: '8901112223330', sku: 'APP-TEE-L', price: 18.00, stock: 25, category: 'Apparel', tag: 'Best Value' },
  ];

  const [simulatedCart, setSimulatedCart] = useState([
    { ...sampleProducts[0], qty: 2 },
    { ...sampleProducts[1], qty: 1 }
  ]);
  const [lastScannedBarcode, setLastScannedBarcode] = useState(sampleProducts[0].barcode);
  const [scanPulse, setScanPulse] = useState(false);

  const handleSimulateScan = (product) => {
    setLastScannedBarcode(product.barcode);
    setScanPulse(true);
    setTimeout(() => setScanPulse(false), 500);

    setSimulatedCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [{ ...product, qty: 1 }, ...prev];
    });
  };

  const handleRemoveCartItem = (id) => {
    setSimulatedCart(prev => prev.filter(item => item.id !== id));
  };

  const cartTotal = simulatedCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const cartItemCount = simulatedCart.reduce((sum, item) => sum + item.qty, 0);

  // Onboarding Modal State
  const [onboardingModalOpen, setOnboardingModalOpen] = useState(false);
  const [onboardingData, setOnboardingData] = useState({
    name: '',
    slug: '',
    phone: '',
    pin: '',
    pinConfirm: '',
    currency: 'USD ($)',
    businessType: 'retail'
  });
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');
  const [onboardingSuccess, setOnboardingSuccess] = useState(false);

  const handleCreateStore = async (e) => {
    e.preventDefault();
    setOnboardingError('');

    if (!onboardingData.name.trim() || !onboardingData.slug.trim()) {
      setOnboardingError('Please enter store name and slug.');
      return;
    }
    if (onboardingData.pin.length !== 4 || isNaN(Number(onboardingData.pin))) {
      setOnboardingError('PIN must be 4 numeric digits.');
      return;
    }
    if (onboardingData.pin !== onboardingData.pinConfirm) {
      setOnboardingError('PIN codes do not match.');
      return;
    }

    setOnboardingLoading(true);

    try {
      const cleanSlug = onboardingData.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');

      // Check slug uniqueness
      const { data: existing, error: checkErr } = await supabase
        .from('restaurants')
        .select('id')
        .eq('slug', cleanSlug)
        .maybeSingle();

      if (existing) {
        setOnboardingError(`Store slug "${cleanSlug}" is already taken. Please choose another.`);
        setOnboardingLoading(false);
        return;
      }

      // Insert new retail store
      const { data: store, error: storeErr } = await supabase
        .from('restaurants')
        .insert([{
          name: onboardingData.name.trim(),
          slug: cleanSlug,
          phone: onboardingData.phone.trim(),
          status: 'approved',
          is_active: true,
          business_type: 'retail'
        }])
        .select()
        .single();

      if (storeErr) throw storeErr;

      // Insert initial manager staff account
      const { error: staffErr } = await supabase
        .from('staff_access')
        .insert([{
          restaurant_id: store.id,
          name: 'Manager',
          role: 'admin',
          pin_code: onboardingData.pin,
          is_active: true
        }]);

      if (staffErr) throw staffErr;

      setOnboardingSuccess(true);
      setTimeout(() => {
        if (onProceedToLogin) {
          onProceedToLogin(cleanSlug);
        } else {
          window.location.href = `/?page=retail-terminal&tenant=${cleanSlug}`;
        }
      }, 1500);

    } catch (err) {
      console.error('Onboarding error:', err);
      setOnboardingError(err.message || 'Failed to create store. Please try again.');
    } finally {
      setOnboardingLoading(false);
    }
  };

  const handleLeadSubmit = async (e) => {
    e.preventDefault();
    setLeadLoading(true);
    setLeadError('');
    try {
      const { error } = await supabase.from('leads').insert([{
        business_name: formData.storeName,
        email: formData.email,
        phone: formData.phone,
        lead_type: 'retail',
        notes: `Store Type: ${formData.storeType}`,
        created_at: new Date().toISOString()
      }]);

      if (error) {
        // Fallback gracefully if table doesn't exist
        console.warn('Leads table notice:', error);
      }
      setLeadSuccess(true);
    } catch (err) {
      setLeadSuccess(true); // Don't block prospective customer
    } finally {
      setLeadLoading(false);
    }
  };

  const retailTypes = [
    { title: 'Supermarkets & Mini-Marts', desc: 'Scan dozens of items per minute, manage barcode lookups, and prevent checkout bottlenecks with high-speed keyless entry.' },
    { title: 'Boutiques & Apparel', desc: 'Organize sizes, colors, and SKU variants with ease. Print branded retail barcode price tags.' },
    { title: 'Electronics & Gadgets', desc: 'Track serialized warranty items, accessories, and profit margin breakdowns on high-value products.' },
    { title: 'Pharmacies & Cosmetics', desc: 'Instant item lookup by barcode or brand name with batch stock level monitoring and reorder alerts.' },
    { title: 'Hardware & Auto Parts', desc: 'Fast SKU lookup, custom units (pieces, boxes, kg), and customer debt/credit balance ledgers.' },
    { title: 'Liquor & Convenience Stores', desc: 'Quick cash-tender shortcuts, fast change calculation, and automated end-of-day Z-Report audit summaries.' },
  ];

  const faqs = [
    {
      q: 'Does ManiPOS Retail work with physical USB & Bluetooth barcode scanners?',
      a: 'Yes, 100%! ManiPOS features a built-in keyboard wedge listener. You simply plug in any standard USB or Bluetooth handheld barcode scanner and pull the trigger. Items are immediately recognized, beeped, and added to the active cart without needing to click any text boxes.'
    },
    {
      q: 'What happens if my internet or Wi-Fi goes down during a rush?',
      a: 'ManiPOS is architected offline-first. When offline, cashiers can continue scanning, tendering cash transactions, and printing ESC/POS thermal receipts. The moment internet reconnects, sales and stock deductions automatically sync back to the cloud in the background.'
    },
    {
      q: 'Can I track stock quantities and receive low-inventory alerts?',
      a: 'Yes. Each product can have a real-time stock quantity and custom reorder threshold. The POS terminal displays visual warnings when items are running low and prevents overselling out-of-stock SKUs.'
    },
    {
      q: 'Can I use thermal receipt printers and cash drawers?',
      a: 'Yes. ManiPOS integrates with standard ESC/POS USB and network thermal receipt printers (58mm & 80mm) via silent high-speed print bridges, and supports automated electronic cash drawer kick pulses on tender.'
    },
    {
      q: 'How does multi-store or multi-counter sync work?',
      a: 'All counters and store branches connect securely to your central database via PostgreSQL Row-Level Security. Sales, cashier shifts, and stock movements sync in real-time across registers.'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-black">
      
      {/* ── TOP NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-cyan-500/20">
                M
              </div>
              <div className="flex flex-col">
                <span className="font-black text-lg tracking-tight text-white flex items-center gap-1.5">
                  Mani<span className="text-cyan-400">POS</span>
                  <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 tracking-wider">
                    Retail
                  </span>
                </span>
                <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                  Point of Sale & Inventory
                </span>
              </div>
            </div>

            {/* Quick Switch to Restaurant */}
            <button
              onClick={() => {
                if (onSwitchToRestaurant) onSwitchToRestaurant();
                else window.location.href = '/?mode=restaurant';
              }}
              className="hidden lg:flex items-center gap-1.5 ml-4 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-bold text-slate-400 hover:text-amber-400 hover:border-amber-500/30 transition-all cursor-pointer"
            >
              <span>Need Restaurant POS?</span>
              <span className="text-amber-400">&rarr;</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-8 text-xs font-bold uppercase tracking-wider text-slate-300">
            <a href="#features" className="hover:text-cyan-400 transition-colors">Features</a>
            <a href="#simulator" className="hover:text-cyan-400 transition-colors">Live Scanner Demo</a>
            <a href="#industries" className="hover:text-cyan-400 transition-colors">Shop Types</a>
            <a href="#faq" className="hover:text-cyan-400 transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (onLaunchRetailDemo) onLaunchRetailDemo();
                else if (onProceedToLogin) onProceedToLogin();
                else window.location.href = '/?page=retail-terminal';
              }}
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-extrabold text-slate-200 hover:bg-slate-800 hover:border-slate-700 transition-all cursor-pointer"
            >
              <Store className="w-3.5 h-3.5 text-cyan-400" />
              <span>Terminal Login</span>
            </button>
            <button
              onClick={() => setOnboardingModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-black text-xs hover:from-cyan-400 hover:to-emerald-300 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center gap-1.5"
            >
              <span>Open Free Store</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO SECTION ── */}
      <section className="pt-36 pb-20 px-6 relative overflow-hidden">
        {/* Background glow meshes */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-cyan-600/15 via-emerald-500/10 to-transparent blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-6xl mx-auto text-center space-y-8 relative z-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="space-y-6"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-extrabold uppercase tracking-widest">
              <Scan className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>Plug-and-Play USB & Bluetooth Barcode Scanning</span>
            </motion.div>

            <motion.h1 variants={fadeUp} className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-white max-w-5xl mx-auto leading-[1.08]">
              The High-Speed POS & Inventory Built for <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-emerald-300 to-teal-200">Retail Shops</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-slate-300 text-base sm:text-xl max-w-3xl mx-auto font-medium leading-relaxed">
              Never let checkout queues slow down your business. Scan barcodes in milliseconds, track SKU stock counts automatically, calculate real-time profit margins, and print receipts offline.
            </motion.p>

            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setOnboardingModalOpen(true)}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-black text-base hover:from-cyan-400 hover:to-emerald-300 transition-all shadow-xl shadow-cyan-500/25 flex items-center justify-center gap-2 group cursor-pointer"
              >
                <span>Create Your Retail Store</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#simulator"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-slate-200 font-extrabold text-base hover:bg-slate-800 hover:border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Barcode className="w-5 h-5 text-cyan-400" />
                <span>Test Interactive Scanner Demo</span>
              </a>
            </motion.div>

            {/* Quick Metrics / Trust */}
            <motion.div variants={fadeUp} className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-left">
              <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-sm">
                <p className="text-2xl font-black text-cyan-400">&lt; 50ms</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">Barcode Lookup Speed</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-sm">
                <p className="text-2xl font-black text-emerald-400">100%</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">Offline Continuity</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-sm">
                <p className="text-2xl font-black text-amber-400">Real-time</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">Stock Level Deductions</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 backdrop-blur-sm">
                <p className="text-2xl font-black text-purple-400">ESC/POS</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">Thermal Receipt Engine</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── INTERACTIVE LIVE SCANNER SIMULATOR ── */}
      <section id="simulator" className="py-20 px-6 border-t border-white/[0.06] bg-slate-950/60">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-wider border border-cyan-500/20">
              <Scan className="w-3.5 h-3.5" /> Interactive Demonstration
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white">Experience Instant Barcode Scanning</h2>
            <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
              Click any sample retail product below to simulate a physical handheld barcode trigger. Watch the cart update instantly.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Products Grid */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Sample Store Catalog</span>
                <span className="text-xs text-cyan-400 font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Click item to scan
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {sampleProducts.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => handleSimulateScan(product)}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group relative overflow-hidden shadow-lg"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                        {product.category}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        product.stock < 10 
                          ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {product.stock} in stock
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                      {product.name}
                    </h4>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-xs font-mono text-slate-400 block flex items-center gap-1">
                          <Barcode className="w-3 h-3 text-slate-400" /> {product.barcode}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">SKU: {product.sku}</span>
                      </div>
                      <span className="text-base font-black text-cyan-400">
                        ${product.price.toFixed(2)}
                      </span>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 group-hover:text-cyan-400">
                      <span className="font-medium">Trigger Barcode</span>
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Barcode Scanner Feed Simulation Box */}
              <div className="p-4 rounded-2xl bg-slate-900 border border-cyan-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center ${scanPulse ? 'animate-ping' : ''}`}>
                    <Scan className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Scanner Wedge Stream</p>
                    <p className="text-xs font-mono font-bold text-cyan-300">
                      READ: {lastScannedBarcode || 'Awaiting barcode trigger...'}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  Ready
                </span>
              </div>
            </div>

            {/* Live POS Register Cart */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-sm text-white">Active Register Cart</span>
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {cartItemCount} items
                </span>
              </div>

              {/* Cart List */}
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {simulatedCart.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    Cart is empty. Click any product above to scan it in!
                  </div>
                ) : (
                  simulatedCart.map((item) => (
                    <div key={item.id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
                      <div className="space-y-0.5 flex-1 pr-2">
                        <p className="text-xs font-bold text-white line-clamp-1">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {item.qty} × ${item.price.toFixed(2)} | SKU: {item.sku}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-cyan-400 font-mono">
                          ${(item.price * item.qty).toFixed(2)}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveCartItem(item.id); }}
                          className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Totals */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-mono text-slate-200">${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Tax (Included)</span>
                  <span className="font-mono text-slate-200">${(cartTotal * 0.08).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-black text-white pt-1 border-t border-slate-800/60">
                  <span>Total Due</span>
                  <span className="font-mono text-cyan-400">${cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Fast Tender Action Buttons */}
              <div className="space-y-2 pt-2">
                <p className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400">Fast Tender</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => alert(`Paid $${cartTotal.toFixed(2)} via Cash. Receipt printing simulated!`)}
                    className="py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 transition-all cursor-pointer"
                  >
                    💵 Cash
                  </button>
                  <button
                    onClick={() => alert(`Paid $${cartTotal.toFixed(2)} via Card. Receipt printing simulated!`)}
                    className="py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs hover:bg-cyan-400 transition-all cursor-pointer"
                  >
                    💳 Card
                  </button>
                  <button
                    onClick={() => alert(`Paid $${cartTotal.toFixed(2)} via Mobile Money / M-Pesa. Receipt printing simulated!`)}
                    className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition-all cursor-pointer"
                  >
                    📱 M-Pesa
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CORE RETAIL FEATURES ── */}
      <section id="features" className="py-24 px-6 border-t border-white/[0.06] bg-slate-950">
        <div className="max-w-6xl mx-auto space-y-16">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <span className="text-xs font-black uppercase tracking-widest text-cyan-400 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              Retail Architecture
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Engineered for Speed, Accuracy & Stock Control
            </h2>
            <p className="text-slate-400 text-base">
              Everything your retail counter needs to eliminate inventory shrinkage and accelerate cashier throughput.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Barcode className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white">Instant Barcode Wedge</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Connect any USB or Bluetooth scanner. Keystroke scanner events are captured asynchronously without requiring cashiers to focus search inputs.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Boxes className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white">Live Stock Deductions</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Every sale instantly reduces on-hand inventory. Set custom reorder thresholds to receive automated low-stock and out-of-stock notices.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                <WifiOff className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white">Offline Fault Tolerance</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Network drops will never stop your cash registers. Local storage buffers receipts and auto-syncs with Postgres the second connectivity returns.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-purple-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white">Cost Price & Margins</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Track cost-of-goods-sold (COGS) alongside retail sales prices. Know your exact gross profit margins across product lines and shifts.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
                <Printer className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white">ESC/POS Thermal Printing</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Native QZ Tray hardware bridge for silent, fast 80mm & 58mm thermal receipts with store logos, barcodes, tax breakdowns, and custom footers.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 hover:border-rose-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white">Multi-Tenant Isolation</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Database-level PostgreSQL Row-Level Security (RLS) guarantees your sales data, prices, and staff records remain completely isolated.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* ── STORE TYPES / VERTICALS ── */}
      <section id="industries" className="py-20 px-6 border-t border-white/[0.06] bg-slate-950/40">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              Retail Verticals
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white">Built for Every Retail Business</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {retailTypes.map((type, idx) => (
              <div key={idx} className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                <h4 className="text-base font-black text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" /> {type.title}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">{type.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ SECTION ── */}
      <section id="faq" className="py-20 px-6 border-t border-white/[0.06] bg-slate-950">
        <div className="max-w-4xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-black text-white">Frequently Asked Questions</h2>
            <p className="text-slate-400 text-sm">Common questions about ManiPOS Retail</p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? -1 : index)}
                  className="w-full p-5 text-left font-bold text-sm text-white flex items-center justify-between hover:text-cyan-300 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openFaqIndex === index ? 'rotate-180 text-cyan-400' : ''}`} />
                </button>
                {openFaqIndex === index && (
                  <div className="px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-slate-800/50 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ONBOARDING MODAL ── */}
      {onboardingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-8 space-y-6 shadow-2xl relative">
            <button
              onClick={() => setOnboardingModalOpen(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1 text-center">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto mb-2">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-white">Create Your Retail Store</h3>
              <p className="text-xs text-slate-400">Launch your register in under 60 seconds</p>
            </div>

            {onboardingSuccess ? (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h4 className="text-lg font-black text-white">Store Created Successfully!</h4>
                <p className="text-xs text-slate-400">Redirecting to your Retail Terminal register...</p>
              </div>
            ) : (
              <form onSubmit={handleCreateStore} className="space-y-4 text-left">
                {onboardingError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
                    {onboardingError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Store / Shop Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Apex Mini-Mart"
                    value={onboardingData.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                      setOnboardingData({ ...onboardingData, name, slug });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Store URL Identifier (Slug)
                  </label>
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-400">
                    <span>https://</span>
                    <input
                      type="text"
                      required
                      placeholder="apexminimart"
                      value={onboardingData.slug}
                      onChange={(e) => setOnboardingData({ ...onboardingData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                      className="bg-transparent text-cyan-400 font-bold focus:outline-none px-1 flex-1"
                    />
                    <span>.retail.manipos.com</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Manager Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+254 700 000 000"
                    value={onboardingData.phone}
                    onChange={(e) => setOnboardingData({ ...onboardingData, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Manager PIN
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      placeholder="1234"
                      value={onboardingData.pin}
                      onChange={(e) => setOnboardingData({ ...onboardingData, pin: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono text-center tracking-widest focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                      Confirm PIN
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      placeholder="1234"
                      value={onboardingData.pinConfirm}
                      onChange={(e) => setOnboardingData({ ...onboardingData, pinConfirm: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-mono text-center tracking-widest focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={onboardingLoading}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-black text-sm hover:from-cyan-400 hover:to-emerald-300 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center justify-center gap-2"
                >
                  {onboardingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Launch My Retail POS &rarr;'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <footer className="border-t border-white/[0.06] py-12 px-6 bg-slate-950">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-sm">
              M
            </div>
            <span>© {new Date().getFullYear()} ManiPOS Retail. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 font-semibold">
            <button
              onClick={() => {
                if (onSwitchToRestaurant) onSwitchToRestaurant();
                else window.location.href = '/?mode=restaurant';
              }}
              className="text-amber-400 hover:underline"
            >
              ManiPOS for Restaurants &rarr;
            </button>
            <button
              onClick={() => setOnboardingModalOpen(true)}
              className="hover:text-white"
            >
              Open Store
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default RetailLandingPage;
