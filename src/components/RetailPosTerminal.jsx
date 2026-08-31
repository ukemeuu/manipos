import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { queueOfflineOrder } from '../lib/offlineQueue';
import { printOrFallback, isQZConnected, connectQZ } from '../lib/qzPrint';
import {
  Barcode,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Printer,
  Wifi,
  WifiOff,
  LogOut,
  RefreshCw,
  Tag,
  Package,
  Layers,
  ArrowLeft,
  DollarSign,
  Receipt,
  X,
  Scan
} from 'lucide-react';

const RETAIL_CATEGORIES = [
  'All Products',
  'Groceries & Pantry',
  'Beverages & Drinks',
  'Snacks & Confectionery',
  'Toiletries & Personal',
  'Household & Cleaning',
  'Electronics & Acc.',
  'Apparel & Footwear',
];

const DEFAULT_RETAIL_PRODUCTS = [
  { id: 'ret-1', name: 'Premium Arabica Coffee 500g', barcode: '8901234567890', sku: 'COF-500', price: 14.50, cost_price: 9.00, stock_quantity: 42, category: 'Beverages & Drinks', unit: 'pcs' },
  { id: 'ret-2', name: 'Organic Cold-Pressed Olive Oil 1L', barcode: '8905556667770', sku: 'OIL-100', price: 22.00, cost_price: 15.00, stock_quantity: 7, category: 'Groceries & Pantry', unit: 'bottle' },
  { id: 'ret-3', name: 'Wireless Ergonomic Optical Mouse', barcode: '8909876543210', sku: 'ACC-MOU', price: 29.99, cost_price: 18.50, stock_quantity: 18, category: 'Electronics & Acc.', unit: 'pcs' },
  { id: 'ret-4', name: 'Cotton Crewneck T-Shirt - L/Navy', barcode: '8901112223330', sku: 'APP-TEE-L', price: 18.00, cost_price: 8.50, stock_quantity: 25, category: 'Apparel & Footwear', unit: 'pcs' },
  { id: 'ret-5', name: 'Dark Roast Chocolate Bar 100g', barcode: '8903334445550', sku: 'SNK-CHOC', price: 4.50, cost_price: 2.20, stock_quantity: 65, category: 'Snacks & Confectionery', unit: 'bar' },
  { id: 'ret-6', name: 'Herbal Moisturizing Shampoo 400ml', barcode: '8907778889990', sku: 'HYG-SHP', price: 11.25, cost_price: 6.80, stock_quantity: 12, category: 'Toiletries & Personal', unit: 'bottle' },
  { id: 'ret-7', name: 'Multi-Surface Antibacterial Spray 750ml', barcode: '8904445556660', sku: 'HSH-CLN', price: 7.99, cost_price: 4.10, stock_quantity: 3, category: 'Household & Cleaning', unit: 'spray' },
  { id: 'ret-8', name: 'USB-C Fast Charging Cable 2M', barcode: '8906667778880', sku: 'ACC-CBL', price: 12.00, cost_price: 4.50, stock_quantity: 34, category: 'Electronics & Acc.', unit: 'pcs' },
];

export function RetailPosTerminal({
  staffName = 'Cashier',
  staffRole = 'cashier',
  tenantSlug = 'demo',
  onSignOut,
  onOpenDashboard,
  onOpenAppHome
}) {
  const [products, setProducts] = useState(DEFAULT_RETAIL_PRODUCTS);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All Products');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastScannedBarcode, setLastScannedBarcode] = useState('');
  const [scanFeedback, setScanFeedback] = useState(null);

  // Checkout modal
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [amountTendered, setAmountTendered] = useState('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  // Barcode Wedge Buffer Reference
  const barcodeBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const searchInputRef = useRef(null);

  // Audio Beep for Barcode Scans
  const playScanBeep = useCallback((success = true) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(success ? 1200 : 300, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      // Audio context might be restricted before interaction
    }
  }, []);

  // Online / Offline monitor
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch tenant products from Supabase
  const loadTenantProducts = useCallback(async () => {
    if (!tenantSlug || tenantSlug === 'demo') return;
    try {
      setLoading(true);
      const { data: store } = await supabase
        .from('restaurants')
        .select('id, name')
        .eq('slug', tenantSlug)
        .maybeSingle();

      if (store) {
        const { data: items } = await supabase
          .from('pos_menu')
          .select('*')
          .eq('restaurant_id', store.id)
          .eq('is_available', true);

        if (items && items.length > 0) {
          const formatted = items.map(it => ({
            id: it.id,
            name: it.name,
            barcode: it.barcode || '',
            sku: it.sku || `SKU-${it.id.slice(0, 4)}`,
            price: Number(it.price) || 0,
            cost_price: Number(it.cost_price) || 0,
            stock_quantity: it.stock_quantity ?? 50,
            category: it.category || 'General',
            unit: it.unit || 'pcs'
          }));
          setProducts(formatted);
        }
      }
    } catch (err) {
      console.warn('Error loading products from Supabase:', err);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    loadTenantProducts();
  }, [loadTenantProducts]);

  // Add Item to Cart (with stock protection)
  const addToCart = useCallback((product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.qty >= product.stock_quantity) {
          alert(`Cannot add more than on-hand stock (${product.stock_quantity} available).`);
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  }, []);

  // Barcode Lookup Trigger
  const handleBarcodeScanned = useCallback((code) => {
    const cleanCode = code.trim();
    if (!cleanCode) return;

    setLastScannedBarcode(cleanCode);

    // Look for exact match on barcode or SKU
    const matched = products.find(
      p => (p.barcode && p.barcode.toLowerCase() === cleanCode.toLowerCase()) ||
           (p.sku && p.sku.toLowerCase() === cleanCode.toLowerCase())
    );

    if (matched) {
      addToCart(matched);
      playScanBeep(true);
      setScanFeedback({ success: true, text: `Scanned: ${matched.name}` });
    } else {
      playScanBeep(false);
      setScanFeedback({ success: false, text: `Barcode not found: ${cleanCode}` });
    }

    setTimeout(() => setScanFeedback(null), 3000);
  }, [products, addToCart, playScanBeep]);

  // Global Hardware Barcode Scanner Listener (Keyboard Wedge)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing normally in a specific input that isn't the barcode bar
      if (document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement !== searchInputRef.current) {
        return;
      }

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3) {
          e.preventDefault();
          handleBarcodeScanned(barcodeBufferRef.current);
          barcodeBufferRef.current = '';
        }
        return;
      }

      // Handheld scanners typically send keys in < 40ms bursts
      if (diff > 120 && barcodeBufferRef.current.length > 0) {
        barcodeBufferRef.current = '';
      }

      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBarcodeScanned]);

  // Cart Adjustments
  const updateQty = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const nextQty = item.qty + delta;
        if (nextQty <= 0) return null;
        if (nextQty > item.stock_quantity) {
          alert(`Only ${item.stock_quantity} available in stock.`);
          return item;
        }
        return { ...item, qty: nextQty };
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const clearCart = () => {
    if (cart.length > 0 && window.confirm('Clear entire current cart?')) {
      setCart([]);
    }
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const taxRate = 0.08;
  const taxAmount = subtotal * taxRate;
  const totalAmount = subtotal;
  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  // Filtered Products
  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'All Products' || p.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Fast Tender Click
  const handleFastTender = (tenderAmount) => {
    setAmountTendered(String(tenderAmount));
  };

  // Finalize Sale
  const handleFinalizeSale = async () => {
    if (cart.length === 0) return;
    setIsProcessingPayment(true);

    const orderPayload = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ord-' + Date.now(),
      ticket_number: 'R-' + Math.floor(1000 + Math.random() * 9000),
      brand: 'RETAIL POS',
      customer_name: 'Walk-in Retail Customer',
      items: cart.map(item => ({
        id: item.id,
        name: item.name,
        barcode: item.barcode,
        sku: item.sku,
        price: item.price,
        qty: item.qty,
        subtotal: item.price * item.qty
      })),
      total_amount: totalAmount,
      discount: 0,
      payment_method: paymentMethod,
      payment_status: 'PAID',
      dining_option: 'RETAIL SALE',
      status: 'Completed',
      cashier_name: staffName,
      created_at: new Date().toISOString()
    };

    // 1. Queue to offline/local storage engine
    queueOfflineOrder(orderPayload);

    // 2. Decrement local state stock
    setProducts(prev => prev.map(p => {
      const soldItem = cart.find(c => c.id === p.id);
      if (soldItem) {
        return { ...p, stock_quantity: Math.max(0, p.stock_quantity - soldItem.qty) };
      }
      return p;
    }));

    // 3. Print ESC/POS Receipt
    try {
      const receiptText = `
================================
         MANIPOS RETAIL         
         RECEIPT #${orderPayload.ticket_number}
================================
Date: ${new Date().toLocaleString()}
Cashier: ${staffName}
Payment: ${paymentMethod}
--------------------------------
${cart.map(i => `${i.qty}x ${i.name.slice(0, 18).padEnd(18)} $${(i.price * i.qty).toFixed(2)}`).join('\n')}
--------------------------------
TOTAL:             $${totalAmount.toFixed(2)}
Tendered:          $${amountTendered ? Number(amountTendered).toFixed(2) : totalAmount.toFixed(2)}
Change:            $${Math.max(0, (Number(amountTendered) || totalAmount) - totalAmount).toFixed(2)}
================================
  Thank you for shopping with us!
================================
      `;
      printOrFallback(receiptText, 'RECEIPT');
    } catch (e) {
      console.log('Silent print fallback');
    }

    setCompletedOrder(orderPayload);
    setIsProcessingPayment(false);
    setCart([]);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      
      {/* ── TOP TERMINAL BAR ── */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center font-black text-slate-950 text-lg shadow-md shadow-cyan-500/20">
            M
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-white text-sm tracking-tight">Mani<span className="text-cyan-400">POS</span> Retail</span>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {tenantSlug}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Cashier: <strong className="text-slate-200">{staffName}</strong> ({staffRole})</p>
          </div>
        </div>

        {/* Scan Status & Connection Indicators */}
        <div className="flex items-center gap-4">
          {scanFeedback && (
            <div className={`text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1.5 animate-pulse ${
              scanFeedback.success ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>
              {scanFeedback.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              <span>{scanFeedback.text}</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs">
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <Wifi className="w-3.5 h-3.5" /> Cloud Sync Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                <WifiOff className="w-3.5 h-3.5" /> Offline Storage Buffer
              </span>
            )}
          </div>

          {onOpenDashboard && (
            <button
              onClick={onOpenDashboard}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Dashboard
            </button>
          )}

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="p-2 rounded-xl bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT / CENTER: CATALOG & BARCODE SCANNER */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950 p-5 space-y-4 overflow-hidden">
          
          {/* BARCODE SCANNER & SEARCH INPUT BAR */}
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-2.5 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <Scan className="w-5 h-5" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Scan Barcode with Handheld Scanner, or Type SKU / Product Name (Press Enter)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim()) {
                  handleBarcodeScanned(searchQuery.trim());
                  setSearchQuery('');
                }
              }}
              className="w-full bg-transparent text-sm text-white placeholder:text-slate-400 font-medium focus:outline-none px-2"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => {
                if (searchQuery.trim()) {
                  handleBarcodeScanned(searchQuery.trim());
                  setSearchQuery('');
                }
              }}
              className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-black text-xs hover:bg-cyan-400 transition-all shrink-0 cursor-pointer"
            >
              Add / Scan
            </button>
          </div>

          {/* CATEGORY PILLS */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 no-scrollbar">
            {RETAIL_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* PRODUCT CARDS GRID */}
          <div className="flex-1 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5 content-start">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-16 text-center text-slate-400 text-xs">
                No products found matching "{searchQuery}".
              </div>
            ) : (
              filteredProducts.map(product => (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className={`p-3.5 rounded-2xl bg-slate-900/80 border transition-all cursor-pointer hover:scale-[1.02] flex flex-col justify-between group shadow-sm ${
                    product.stock_quantity <= 0
                      ? 'border-red-500/30 opacity-60'
                      : 'border-slate-800 hover:border-cyan-500/40 hover:bg-slate-800/90'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                        <Barcode className="w-3 h-3 text-slate-400" /> {product.sku}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        product.stock_quantity <= 0
                          ? 'bg-red-500/20 text-red-400'
                          : product.stock_quantity <= 5
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                        {product.stock_quantity <= 0 ? 'Out of Stock' : `${product.stock_quantity} left`}
                      </span>
                    </div>
                    <h4 className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors line-clamp-2">
                      {product.name}
                    </h4>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-sm font-black text-cyan-400 font-mono">
                      ${product.price.toFixed(2)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      /{product.unit}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

        {/* RIGHT: ACTIVE REGISTER CART */}
        <div className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 shadow-2xl">
          
          {/* Cart Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-cyan-400" />
              <h3 className="font-black text-sm text-white">Current Cart</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {itemCount} items
              </span>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                  title="Clear Cart"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                  <Scan className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-300">Register Cart Ready</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Scan any product with your handheld scanner or click items from the catalog.
                  </p>
                </div>
              </div>
            ) : (
              cart.map(item => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5 flex-1 pr-2">
                      <p className="text-xs font-bold text-white line-clamp-1">{item.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">
                        ${item.price.toFixed(2)} × {item.qty} | SKU: {item.sku}
                      </p>
                    </div>
                    <span className="text-xs font-black text-cyan-400 font-mono">
                      ${(item.price * item.qty).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono font-bold px-2 text-white">{item.qty}</span>
                      <button
                        onClick={() => updateQty(item.id, 1)}
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-[10px] font-bold text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary & Fast Tender Bar */}
          <div className="p-4 border-t border-slate-800 bg-slate-950 space-y-3">
            <div className="space-y-1.5 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-mono text-slate-200">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax (Included)</span>
                <span className="font-mono text-slate-200">${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-white pt-1 border-t border-slate-800">
                <span>Total Due</span>
                <span className="font-mono text-cyan-400">${totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <button
              disabled={cart.length === 0}
              onClick={() => {
                setAmountTendered(String(totalAmount));
                setCheckoutModalOpen(true);
              }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-black text-sm hover:from-cyan-400 hover:to-emerald-300 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              <Banknote className="w-4 h-4" />
              <span>Checkout (${totalAmount.toFixed(2)}) &rarr;</span>
            </button>
          </div>

        </div>

      </div>

      {/* ── CHECKOUT MODAL ── */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-8 space-y-6 shadow-2xl relative">
            <button
              onClick={() => setCheckoutModalOpen(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1 text-center">
              <h3 className="text-2xl font-black text-white">Tender Transaction</h3>
              <p className="text-xs text-slate-400">Total Amount: <strong className="text-cyan-400 text-sm font-mono">${totalAmount.toFixed(2)}</strong></p>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'CASH', label: 'Cash', icon: Banknote, color: 'text-emerald-400' },
                { id: 'CARD', label: 'Card / POS', icon: CreditCard, color: 'text-cyan-400' },
                { id: 'MPESA', label: 'Mobile / M-Pesa', icon: Smartphone, color: 'text-amber-400' },
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                    paymentMethod === m.id
                      ? 'bg-slate-800 border-cyan-500 text-white shadow-lg'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <m.icon className={`w-5 h-5 ${m.color}`} />
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              ))}
            </div>

            {/* Cash Shortcuts */}
            {paymentMethod === 'CASH' && (
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Amount Tendered ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-lg font-mono text-center font-black text-cyan-400 focus:outline-none focus:border-cyan-500"
                />
                
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[Math.ceil(totalAmount), 20, 50, 100].map(amt => (
                    <button
                      key={amt}
                      onClick={() => handleFastTender(amt)}
                      className="py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                {Number(amountTendered) >= totalAmount && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <span className="text-xs text-slate-400">Change Due: </span>
                    <strong className="text-emerald-400 font-mono text-base font-black">
                      ${(Number(amountTendered) - totalAmount).toFixed(2)}
                    </strong>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleFinalizeSale}
              disabled={isProcessingPayment || (paymentMethod === 'CASH' && Number(amountTendered) < totalAmount)}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 font-black text-sm hover:from-cyan-400 hover:to-emerald-300 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {isProcessingPayment ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Complete Sale & Print Receipt'}
            </button>
          </div>
        </div>
      )}

      {/* ── SUCCESS RECEIPT MODAL ── */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-5 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-black text-white">Sale Completed!</h3>
              <p className="text-xs font-mono text-slate-400">Receipt #{completedOrder.ticket_number}</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-2 text-left">
              <div className="flex justify-between text-slate-400">
                <span>Items:</span>
                <span className="text-white font-bold">{completedOrder.items.length} lines</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Total:</span>
                <span className="text-cyan-400 font-bold">${completedOrder.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Payment:</span>
                <span className="text-white font-bold">{completedOrder.payment_method}</span>
              </div>
            </div>

            <button
              onClick={() => setCompletedOrder(null)}
              className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
            >
              Next Customer (New Sale) &rarr;
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default RetailPosTerminal;
