import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, ShoppingCart, Search, Utensils, Award, CheckCircle, ArrowLeft, Loader2, Plus, Minus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const BRAND_CONFIGS = {
    'POT OF JOLLOF': {
        name: 'Pot of Jollof Kitchen',
        desc: '🥘 Signature Jollof rice, combos & classics',
        logo: '/jollof_logo.png',
        color: 'from-neutral-900 to-black'
    },
    'SAMAKI STREET': {
        name: 'Samaki Street',
        desc: '🐟 Whole Tilapia, Mackerel & fish specialties',
        logo: '/samaki_logo.jpg',
        color: 'from-neutral-900 to-black'
    },
    'CAFÉ SWAHILI': {
        name: 'Café Swahili',
        desc: '☕ Traditional Swahili breakfast, tea & coffee',
        logo: '/swahili_logo.png',
        color: 'from-neutral-900 to-black'
    },
    'LITTLE LAGOS': {
        name: 'Little Lagos',
        desc: '🍛 Traditional Nigerian soups, stews & swallows',
        logo: '/lagos_logo.png',
        color: 'from-neutral-900 to-black'
    }
};

export const getBrandForItem = (item) => {
    if (!item) return 'POT OF JOLLOF';
    if (item.brand && item.brand.trim()) return item.brand.trim();
    if (item.brands && Array.isArray(item.brands) && item.brands.length > 0) return item.brands[0];
    return 'POT OF JOLLOF';
};

// Helper: check if item belongs to a brand (supports multi-brand arrays and strict POS brand assignment)
export const itemBelongsToBrand = (item, brand) => {
    if (!brand || brand === 'All') return true;
    if (!item) return false;

    const targetBrandUpper = brand.trim().toUpperCase();

    // 1. Check multi-brand array first
    if (Array.isArray(item.brands) && item.brands.length > 0) {
        return item.brands.some(b => (b || '').trim().toUpperCase() === targetBrandUpper);
    }

    // 2. Check primary brand field
    if (item.brand && item.brand.trim()) {
        const itemBrandUpper = item.brand.trim().toUpperCase();
        if (itemBrandUpper === targetBrandUpper) return true;
        if (targetBrandUpper === 'POT OF JOLLOF' && (itemBrandUpper === 'MANIPOS' || itemBrandUpper.includes('JOLLOF'))) return true;
        return false;
    }

    // 3. Fallback for unassigned items: default to POT OF JOLLOF
    return targetBrandUpper === 'POT OF JOLLOF';
};

// Interactive Order Success & M-Pesa Payment Verification Modal Component
const MicrositeOrderSuccessModal = ({ orderSuccess, setOrderSuccess, whatsappSettings }) => {
    const [copiedPaybill, setCopiedPaybill] = useState(false);
    const [copiedAccount, setCopiedAccount] = useState(false);
    const [inputMpesaCode, setInputMpesaCode] = useState(orderSuccess?.mpesaCode || '');
    const [isUpdating, setIsUpdating] = useState(false);

    const paybillNo = whatsappSettings?.paybill_number || '4122896';
    const whatsappPhone = orderSuccess?.brand === 'POT OF JOLLOF' ? '254795384140' : '254799034617';

    // Realtime WebSockets + 2s Polling Engine to automatically update customer screen when cashier accepts order
    useEffect(() => {
        if (!orderSuccess?.orderId) return;

        const checkOrderStatus = async () => {
            try {
                const { data, error } = await supabase
                    .from('pos_orders')
                    .select('id, status, payment_status')
                    .eq('id', orderSuccess.orderId)
                    .maybeSingle();

                if (data) {
                    const statusLower = (data.status || '').toLowerCase().trim();
                    const payStatusLower = (data.payment_status || '').toLowerCase().trim();

                    // If operator/cashier accepted order or confirmed payment
                    if (
                        payStatusLower === 'paid' ||
                        payStatusLower === 'approved' ||
                        payStatusLower === 'verified' ||
                        statusLower === 'accepted' ||
                        statusLower === 'preparing' ||
                        statusLower === 'in progress' ||
                        statusLower === 'in_progress' ||
                        statusLower === 'ready' ||
                        statusLower === 'completed' ||
                        statusLower === 'approved' ||
                        statusLower === 'processing'
                    ) {
                        setOrderSuccess(prev => prev ? ({ ...prev, stage: 'confirmed' }) : null);
                    } else if (statusLower === 'cancelled' || statusLower === 'declined' || statusLower === 'voided') {
                        setOrderSuccess(prev => prev ? ({ ...prev, stage: 'cancelled' }) : null);
                    }
                }
            } catch (e) {
                console.warn("Polling order status error:", e);
            }
        };

        // 1. Instant check on mount / state change
        checkOrderStatus();

        // 2. High-frequency 2-second polling interval
        const pollInterval = setInterval(checkOrderStatus, 2000);

        // 3. Realtime Supabase Subscription
        const channel = supabase
            .channel(`microsite_order_status_${orderSuccess.orderId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'pos_orders',
                    filter: `id=eq.${orderSuccess.orderId}`
                },
                (payload) => {
                    checkOrderStatus();
                }
            )
            .subscribe();

        return () => {
            clearInterval(pollInterval);
            supabase.removeChannel(channel);
        };
    }, [orderSuccess?.orderId, setOrderSuccess]);

    const handleCancelOrder = async () => {
        if (!window.confirm("Are you sure you want to cancel this order?")) return;
        setIsUpdating(true);
        try {
            await supabase
                .from('pos_orders')
                .update({ status: 'Cancelled', payment_status: 'Cancelled' })
                .eq('id', orderSuccess.orderId);
        } catch (e) {
            console.error("Cancel error:", e);
        } finally {
            setIsUpdating(false);
            setOrderSuccess(null);
        }
    };

    const handleMarkPaid = async () => {
        setIsUpdating(true);
        const code = inputMpesaCode.trim().toUpperCase();
        try {
            await supabase
                .from('pos_orders')
                .update({
                    payment_status: 'pending_verification',
                    notes: code ? `[M-Pesa Code: ${code}] ${orderSuccess.notes || ''}` : orderSuccess.notes
                })
                .eq('id', orderSuccess.orderId);
        } catch (e) {
            console.error("Mark paid error:", e);
        } finally {
            setIsUpdating(false);
        }

        setOrderSuccess(prev => ({
            ...prev,
            stage: 'verifying',
            mpesaCode: code
        }));
    };

    const stage = orderSuccess?.stage || 'payment_instructions';

    return (
        <div className="min-h-screen bg-gray-950/80 backdrop-blur-md text-gray-900 flex items-center justify-center p-4 z-50 fixed inset-0 overflow-y-auto">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md w-full bg-white border border-gray-200 rounded-[2.5rem] p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden my-auto"
            >
                {/* Order Ticket Header Badge */}
                <div className="mb-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-900 bg-amber-100 border border-amber-300 px-3.5 py-1 rounded-full inline-block shadow-xs">
                        Order Ticket #{orderSuccess.ticketNumber}
                    </span>
                </div>

                {/* STAGE 1: Paybill No, Account No, Cancel & Mark Paid Buttons */}
                {stage === 'payment_instructions' && (
                    <div className="space-y-5">
                        <div>
                            <h2 className="text-2xl font-black text-gray-950 tracking-tight">Complete Payment</h2>
                            <p className="text-xs text-gray-500 mt-1 font-medium">Please send M-Pesa payment to submit your delivery order to the kitchen.</p>
                        </div>

                        {/* Bill Total Card */}
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex justify-between items-center text-left">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Total Amount Due</span>
                                <span className="text-2xl font-black text-black font-mono">KES {orderSuccess.total.toLocaleString()}</span>
                            </div>
                            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[10px] font-black uppercase rounded-lg">
                                Pending M-Pesa
                            </span>
                        </div>

                        {/* Paybill & Account Number Card */}
                        <div className="bg-amber-50/70 border-2 border-amber-300/50 rounded-2xl p-4 text-left space-y-3">
                            <div className="flex items-center justify-between bg-white border border-amber-200 rounded-xl p-3 shadow-xs">
                                <div>
                                    <span className="text-[9px] font-black uppercase text-gray-400 block tracking-widest">M-Pesa Paybill</span>
                                    <span className="text-xl font-black text-black font-mono">{paybillNo}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(paybillNo);
                                        setCopiedPaybill(true);
                                        setTimeout(() => setCopiedPaybill(false), 2000);
                                    }}
                                    className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs"
                                >
                                    {copiedPaybill ? '✓ Copied' : 'Copy Paybill'}
                                </button>
                            </div>

                            <div className="flex items-center justify-between bg-white border border-amber-200 rounded-xl p-3 shadow-xs">
                                <div>
                                    <span className="text-[9px] font-black uppercase text-gray-400 block tracking-widest">Account Number</span>
                                    <span className="text-xl font-black text-black font-mono">#{orderSuccess.ticketNumber}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(`#${orderSuccess.ticketNumber}`);
                                        setCopiedAccount(true);
                                        setTimeout(() => setCopiedAccount(false), 2000);
                                    }}
                                    className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs"
                                >
                                    {copiedAccount ? '✓ Copied' : 'Copy Account'}
                                </button>
                            </div>

                            {/* Optional Confirmation Code Field */}
                            <div className="pt-1">
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-wider block mb-1">M-Pesa Confirmation Code (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. QGH8912X4"
                                    value={inputMpesaCode}
                                    onChange={(e) => setInputMpesaCode(e.target.value.toUpperCase())}
                                    className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs font-mono font-bold uppercase text-gray-900 focus:outline-none focus:border-black"
                                />
                            </div>
                        </div>

                        {/* Two Action Buttons: Cancel vs Mark Paid */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <button
                                type="button"
                                disabled={isUpdating}
                                onClick={handleCancelOrder}
                                className="w-full py-3.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-black text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 cursor-pointer text-center"
                            >
                                ❌ Cancel Order
                            </button>

                            <button
                                type="button"
                                disabled={isUpdating}
                                onClick={handleMarkPaid}
                                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 text-center"
                            >
                                {isUpdating ? <Loader2 size={14} className="animate-spin" /> : '✅ Mark Paid'}
                            </button>
                        </div>
                    </div>
                )}

                {/* STAGE 2: Verifying Payment + Share Confirmation Code to WhatsApp */}
                {stage === 'verifying' && (
                    <div className="space-y-5">
                        <div className="relative w-20 h-20 mx-auto flex items-center justify-center my-2">
                            <div className="absolute inset-0 bg-amber-400/20 rounded-full animate-ping"></div>
                            <div className="relative w-16 h-16 bg-amber-500 text-white rounded-full flex items-center justify-center border-4 border-white shadow-xl">
                                <Loader2 className="animate-spin" size={32} />
                            </div>
                        </div>

                        <div>
                            <h2 className="text-2xl font-black text-gray-950 tracking-tight">Verifying Your Payment...</h2>
                            <p className="text-xs text-gray-500 mt-1 font-medium max-w-xs mx-auto">
                                Waiting for cashier/waiter to verify your payment and accept your order to the kitchen.
                            </p>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left space-y-2">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-bold uppercase tracking-wider">Order Ticket</span>
                                <span className="font-mono font-black text-black text-sm">#{orderSuccess.ticketNumber}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-gray-400 font-bold uppercase tracking-wider">Total Amount</span>
                                <span className="font-mono font-black text-emerald-600 text-sm">KES {orderSuccess.total.toLocaleString()}</span>
                            </div>
                            {orderSuccess.mpesaCode && (
                                <div className="flex justify-between items-center text-xs pt-1.5 border-t border-gray-200">
                                    <span className="text-gray-400 font-bold uppercase tracking-wider">M-Pesa Code</span>
                                    <span className="font-mono font-black text-black bg-amber-100 px-2 py-0.5 rounded text-xs">{orderSuccess.mpesaCode}</span>
                                </div>
                            )}
                        </div>

                        {/* Share Confirmation Code to WhatsApp Button */}
                        <a
                            href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(
                                `Hello Pot of Jollof! I have sent M-Pesa payment of KES ${orderSuccess.total.toLocaleString()} for Order #${orderSuccess.ticketNumber}${orderSuccess.mpesaCode ? ` (M-Pesa Code: ${orderSuccess.mpesaCode})` : ''}. Please verify and accept my order!`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
                        >
                            📲 Share Confirmation Code to WhatsApp
                        </a>

                        <button
                            type="button"
                            onClick={handleCancelOrder}
                            className="text-xs text-red-500 hover:text-red-700 font-bold underline cursor-pointer"
                        >
                            Cancel order request
                        </button>
                    </div>
                )}

                {/* STAGE 3: Payment Successful & Accepted */}
                {stage === 'confirmed' && (
                    <div className="space-y-5">
                        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto border-4 border-emerald-200 shadow-xl my-2">
                            <CheckCircle size={44} className="animate-bounce" />
                        </div>

                        <div>
                            <h2 className="text-2xl font-black text-emerald-950 tracking-tight">Payment Successful! 🎉</h2>
                            <p className="text-xs text-gray-500 mt-1 font-medium max-w-xs mx-auto">
                                Payment verified by cashier! Your order is accepted & sent to the kitchen.
                            </p>
                        </div>

                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 text-left space-y-3">
                            <span className="text-[10px] font-black uppercase text-emerald-800 tracking-widest block text-center">Live Order Status</span>
                            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-950">
                                <span className="flex items-center gap-1 text-emerald-700">✓ Paid</span>
                                <span className="text-emerald-300">➔</span>
                                <span className="flex items-center gap-1 text-emerald-800 animate-pulse">🍳 Cooking</span>
                                <span className="text-emerald-300">➔</span>
                                <span className="text-gray-400">🛵 Delivery</span>
                            </div>
                        </div>

                        <button
                            onClick={() => setOrderSuccess(null)}
                            className="w-full py-4 bg-black hover:bg-neutral-850 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg cursor-pointer"
                        >
                            Back to Menu
                        </button>
                    </div>
                )}

                {/* STAGE 4: Cancelled */}
                {stage === 'cancelled' && (
                    <div className="space-y-4">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto border-2 border-red-200 my-2">
                            <X size={32} />
                        </div>
                        <h2 className="text-xl font-black text-gray-900">Order Cancelled</h2>
                        <p className="text-xs text-gray-500">This order was cancelled. You can place a new order anytime.</p>
                        <button
                            onClick={() => setOrderSuccess(null)}
                            className="w-full py-3.5 bg-black text-white font-black text-xs uppercase rounded-xl"
                        >
                            Back to Menu
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export function MenuMicrosite({ onBack, defaultBrand, tenantSlug = 'potofjollof' }) {
    const isSingleBrand = window.location.hostname.includes('potofjollof') || tenantSlug === 'potofjollof';
    const [menu, setMenu] = useState([]);
    const [categories, setCategories] = useState(['All']);
    const [activeBrand, setActiveBrand] = useState(() => {
        if (defaultBrand) return defaultBrand;
        if (isSingleBrand) return 'POT OF JOLLOF';
        return 'All';
    });
    const [activeCategory, setActiveCategory] = useState('All');

    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // Checkout form state
    const [customerName, setCustomerName] = useState('');
    const [diningOption, setDiningOption] = useState('Dine-in'); // 'Dine-in', 'Takeaway', or 'Delivery'
    const [deliveryAddress, setDeliveryAddress] = useState('');
    const [tableNumber, setTableNumber] = useState('');
    const [notes, setNotes] = useState('');
    
    // Guest CRM states
    const [guestUser, setGuestUser] = useState(null);
    const [loginInput, setLoginInput] = useState(''); // email or phone
    const [showLoginPanel, setShowLoginPanel] = useState(false);
    const [regFirstName, setRegFirstName] = useState('');
    const [regLastName, setRegLastName] = useState('');
    const [regAddress, setRegAddress] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [guestLoading, setGuestLoading] = useState(false);
    const [pastOrders, setPastOrders] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    
    // Promo/Discount states
    const [promoCode, setPromoCode] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState(null); // { code, type, value, min_order_amount }
    const [promoError, setPromoError] = useState('');
    const [promoSuccess, setPromoSuccess] = useState('');
    
    // Order success state
    const [orderSuccess, setOrderSuccess] = useState(null); // Will hold { ticketNumber, total, brand, items, diningOption, deliveryAddress }

    // WhatsApp bot & geocoding states
    const [whatsappSettings, setWhatsappSettings] = useState({
        base_delivery_fee: 100,
        base_delivery_distance: 3,
        delivery_fee_per_km: 85, // 85 KES per km
        packaging_fee: 50,
        store_lat: -1.2921,
        store_lng: 36.7901
    });
    const [calculatedDeliveryFee, setCalculatedDeliveryFee] = useState(0);
    const [calculatedDistance, setCalculatedDistance] = useState(null);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [geocodingError, setGeocodingError] = useState('');
    const [addressSuggestions, setAddressSuggestions] = useState([]);
    const [isSearchingAddress, setIsSearchingAddress] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);


    const fetchPastOrders = async (guestId) => {
        try {
            const { data, error } = await supabase
                .from('pos_orders')
                .select(`
                    id,
                    ticket_number,
                    created_at,
                    dining_option,
                    total_amount,
                    notes,
                    pos_order_items (
                        id,
                        item_name,
                        quantity,
                        price,
                        instructions
                    )
                `)
                .eq('guest_id', guestId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setPastOrders(data || []);
        } catch (e) {
            console.error('Error fetching past orders:', e);
        }
    };

    useEffect(() => {
        fetchMenu();
        
        // Fetch WhatsApp channel delivery configs if available
        const fetchWaSettings = async () => {
            try {
                const { data, error } = await supabase
                    .from('pos_channels')
                    .select('*')
                    .eq('name', 'whatsapp')
                    .maybeSingle();
                if (data) {
                    setWhatsappSettings({
                        base_delivery_fee: data.base_delivery_fee ?? 100,
                        base_delivery_distance: data.base_delivery_distance ?? 3,
                        delivery_fee_per_km: data.delivery_fee_per_km ?? 50,
                        packaging_fee: data.packaging_fee ?? 50,
                        store_lat: data.store_lat ?? -1.2921,
                        store_lng: data.store_lng ?? 36.7901
                    });
                }
            } catch (err) {
                console.error("Error fetching whatsapp settings:", err);
            }
        };
        fetchWaSettings();

        // Restore guest session or auto login from URL query parameter ?phone=
        const urlParams = new URLSearchParams(window.location.search);
        const queryPhone = urlParams.get('phone');
        
        if (queryPhone) {
            const cleanPhone = queryPhone.trim().replace('+', '');
            (async () => {
                try {
                    const { data: guestData, error: guestErr } = await supabase
                        .from('guests')
                        .select('*')
                        .eq('phone', cleanPhone)
                        .maybeSingle();
                    
                    if (guestErr) throw guestErr;
                    
                    if (guestData) {
                        setGuestUser(guestData);
                        setCustomerName(`${guestData.first_name || ''} ${guestData.last_name || ''}`.trim());
                        if (guestData.delivery_address) {
                            setDeliveryAddress(guestData.delivery_address);
                        }
                        localStorage.setItem('mute_kitchens_guest', JSON.stringify(guestData));
                        fetchPastOrders(guestData.id);
                    } else {
                        // Create guest record if not exists
                        const { data: newGuest, error: createErr } = await supabase
                            .from('guests')
                            .insert({
                                first_name: 'Guest',
                                last_name: '(WhatsApp)',
                                phone: cleanPhone,
                                email: `${cleanPhone}@whatsapp.poj`,
                                total_spend: 0,
                                total_visits: 0
                            })
                            .select()
                            .single();
                        
                        if (createErr) throw createErr;
                        if (newGuest) {
                            setGuestUser(newGuest);
                            setCustomerName(`${newGuest.first_name || ''} ${newGuest.last_name || ''}`.trim());
                            localStorage.setItem('mute_kitchens_guest', JSON.stringify(newGuest));
                            fetchPastOrders(newGuest.id);
                        }
                    }
                } catch (e) {
                    console.error('Error during auto-login phone search:', e);
                }
            })();
        } else {
            // Restore guest session if exists
            try {
                const saved = localStorage.getItem('mute_kitchens_guest');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setGuestUser(parsed);
                    setCustomerName(`${parsed.first_name || ''} ${parsed.last_name || ''}`.trim());
                    if (parsed.delivery_address) {
                        setDeliveryAddress(parsed.delivery_address);
                    }
                    fetchPastOrders(parsed.id);
                }
            } catch (e) {
                console.error('Error loading guest session:', e);
            }
        }

        // Real-time subscription to update menu availability instantly
        const menuSubscription = supabase
            .channel('pos_menu_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'pos_menu' },
                () => {
                    fetchMenu();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(menuSubscription);
        };
    }, []);

    const GOOGLE_PLACES_API_KEY = 'AIzaSyDhwk7tNH19ACOUo0WUIJsVGSUtVLji_yM';

    // 1. Preload / Ensure Google Maps JS SDK is active
    useEffect(() => {
        if (window.google && window.google.maps) return;
        const scriptId = 'google-maps-js-sdk';
        if (document.getElementById(scriptId)) return;

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    }, []);

    // 2. High-speed Client-side Geocode Helper (Under 50ms)
    const geocodeAddress = async (query, placeId = null) => {
        if (!query || !query.trim()) return null;
        const cleanQuery = query.trim();

        // A. If Google Maps JS SDK Geocoder is available (Ultra-fast ~25ms)
        if (window.google && window.google.maps && window.google.maps.Geocoder) {
            try {
                const geocoder = new window.google.maps.Geocoder();
                const reqParam = placeId ? { placeId } : { address: cleanQuery.toLowerCase().includes('kenya') ? cleanQuery : `${cleanQuery}, Nairobi, Kenya` };
                
                const result = await new Promise((resolve) => {
                    geocoder.geocode(reqParam, (results, status) => {
                        if (status === 'OK' && results && results[0]) {
                            resolve({
                                lat: results[0].geometry.location.lat(),
                                lon: results[0].geometry.location.lng(),
                                display_name: results[0].formatted_address,
                                provider: 'Google Places'
                            });
                        } else {
                            resolve(null);
                        }
                    });
                });
                if (result) return result;
            } catch (e) {
                console.warn('Google JS Geocoder error:', e);
            }
        }

        // B. Single Fast Fallback Fetch with 1.2s timeout (prevents long hanging loops)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);
            const firstPart = cleanQuery.split(',')[0].trim();
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(firstPart + ', Nairobi, Kenya')}&format=json&limit=1`, {
                signal: controller.signal,
                headers: { 'User-Agent': 'ManiPOS-Microsite/1.0' }
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    return {
                        lat: parseFloat(data[0].lat),
                        lon: parseFloat(data[0].lon),
                        display_name: data[0].display_name,
                        provider: 'Maps'
                    };
                }
            }
        } catch (err) {}

        return null;
    };

    // Google Places API Geocoding & Distance-Based Delivery Fee Engine
    useEffect(() => {
        if (diningOption !== 'Delivery' || !deliveryAddress.trim() || deliveryAddress.length < 2) {
            setCalculatedDistance(null);
            setCalculatedDeliveryFee(0);
            return;
        }

        setIsGeocoding(true);
        setGeocodingError('');

        // Ultra responsive 150ms debounce for distance calculation
        const delayDebounceFn = setTimeout(async () => {
            try {
                const geoResult = await geocodeAddress(deliveryAddress);
                
                if (geoResult) {
                    setGeocodingError('');
                    const lat = geoResult.lat;
                    const lon = geoResult.lon;
                    
                    // Haversine distance from Pot of Jollof Store
                    const R = 6371; // km
                    const lat1 = whatsappSettings.store_lat || -1.2921;
                    const lon1 = whatsappSettings.store_lng || 36.8219;
                    const lat2 = lat;
                    const lon2 = lon;
                    
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                              Math.sin(dLon/2) * Math.sin(dLon/2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                    // Apply Nairobi road factor multiplier (1.25x for driving routes)
                    const distance = Math.round((R * c * 1.25) * 10) / 10;
                    
                    setCalculatedDistance(distance);
                    
                    // Calculate Delivery Fee
                    let fee = whatsappSettings.base_delivery_fee || 150;
                    const baseDist = whatsappSettings.base_delivery_distance || 3;
                    if (distance > baseDist) {
                        const extraDistance = distance - baseDist;
                        fee += extraDistance * (whatsappSettings.delivery_fee_per_km || 40);
                    }
                    setCalculatedDeliveryFee(Math.max(0, Math.round(fee)));
                } else {
                    setGeocodingError("Address location calculated via estimated zone.");
                    setCalculatedDeliveryFee((whatsappSettings.base_delivery_fee || 150) + 50);
                }
            } catch (err) {
                console.error("Geocoding failed:", err);
                setCalculatedDeliveryFee((whatsappSettings.base_delivery_fee || 150) + 50);
            } finally {
                setIsGeocoding(false);
            }
        }, 150);

        return () => clearTimeout(delayDebounceFn);
    }, [deliveryAddress, diningOption, whatsappSettings]);

    // Ultra-fast Real-time Address Autocomplete lookup via Google Places API + Komoot Photon fallback
    useEffect(() => {
        if (diningOption !== 'Delivery' || !deliveryAddress.trim() || deliveryAddress.length < 2) {
            setAddressSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        setIsSearchingAddress(true);
        // Instant 50ms debounce for typing responsiveness
        const debounceTimer = setTimeout(async () => {
            try {
                const cleanQuery = deliveryAddress.trim();
                let suggestions = [];

                // 1. Google Places Autocomplete Service (Client-side, ~20ms)
                if (window.google && window.google.maps && window.google.maps.places) {
                    try {
                        const service = new window.google.maps.places.AutocompleteService();
                        const googleRes = await new Promise((resolve) => {
                            service.getPlacePredictions(
                                {
                                    input: cleanQuery,
                                    componentRestrictions: { country: 'ke' }
                                },
                                (predictions, status) => {
                                    if (status === 'OK' && predictions && predictions.length > 0) {
                                        resolve(predictions.map(p => ({
                                            display_name: p.description,
                                            place_id: p.place_id,
                                            provider: 'Google Places'
                                        })));
                                    } else {
                                        console.warn("Google Places Autocomplete status:", status);
                                        resolve([]);
                                    }
                                }
                            );
                        });
                        if (googleRes && googleRes.length > 0) {
                            suggestions = googleRes;
                        }
                    } catch (gErr) {
                        console.warn("Google Places JS error:", gErr);
                    }
                }

                // 2. High-speed Fallback 1: Photon Komoot API (Instant Elastic Search index)
                if (!suggestions || suggestions.length === 0) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 1200);
                        const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery + ' Nairobi Kenya')}&limit=5`, {
                            signal: controller.signal
                        });
                        clearTimeout(timeoutId);
                        
                        if (photonRes.ok) {
                            const pData = await photonRes.json();
                            if (pData && pData.features && pData.features.length > 0) {
                                suggestions = pData.features.map(f => {
                                    const props = f.properties;
                                    const name = props.name || props.street || cleanQuery;
                                    const city = props.city || props.county || 'Nairobi';
                                    return {
                                        display_name: `${name}, ${city}, Kenya`,
                                        lat: f.geometry.coordinates[1],
                                        lon: f.geometry.coordinates[0],
                                        provider: 'Maps'
                                    };
                                });
                            }
                        }
                    } catch (e) {}
                }

                // 3. Fallback 2: OpenStreetMap Nominatim API
                if (!suggestions || suggestions.length === 0) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 1200);
                        let res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery + ', Kenya')}&format=json&limit=5&countrycodes=ke`, {
                            signal: controller.signal,
                            headers: { 'User-Agent': 'ManiPOS-Microsite/1.0' }
                        });
                        clearTimeout(timeoutId);
                        if (res.ok) {
                            const osmData = await res.json();
                            suggestions = (osmData || []).map(item => ({
                                display_name: item.display_name,
                                lat: item.lat,
                                lon: item.lon,
                                provider: 'Maps'
                            }));
                        }
                    } catch (e) {}
                }

                setAddressSuggestions(suggestions || []);
                setShowSuggestions((suggestions && suggestions.length > 0) ? true : false);
            } catch(err) {
                console.error("Address autocomplete search failed:", err);
                setAddressSuggestions([]);
            } finally {
                setIsSearchingAddress(false);
            }
        }, 50);

        return () => clearTimeout(debounceTimer);
    }, [deliveryAddress, diningOption]);

    const handleSelectAddressSuggestion = async (suggestion) => {
        const formatted = suggestion.display_name;
        setDeliveryAddress(formatted);
        setAddressSuggestions([]);
        setShowSuggestions(false);

        // Instant Geocode by Place ID or Address
        const geoResult = await geocodeAddress(formatted, suggestion.place_id || null);
        if (geoResult) {
            const lat2 = geoResult.lat;
            const lon2 = geoResult.lon;
            const lat1 = whatsappSettings.store_lat || -1.2921;
            const lon1 = whatsappSettings.store_lng || 36.8219;

            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = Math.round((6371 * c * 1.25) * 10) / 10; // in km

            setCalculatedDistance(distance);

            let fee = whatsappSettings.base_delivery_fee || 150;
            const baseDist = whatsappSettings.base_delivery_distance || 3;
            if (distance > baseDist) {
                const extraDistance = distance - baseDist;
                fee += extraDistance * (whatsappSettings.delivery_fee_per_km || 40);
            }
            setCalculatedDeliveryFee(Math.max(0, Math.round(fee)));
        }
    };

    const fetchMenu = async () => {
        // Instant load from localStorage cache for 0ms initial load
        try {
            const cachedMenu = localStorage.getItem('poj_microsite_menu_cache');
            if (cachedMenu) {
                const parsed = JSON.parse(cachedMenu);
                if (parsed && parsed.length > 0) {
                    setMenu(parsed);
                    setLoading(false);
                }
            }
        } catch(e) {}

        try {
            const { data, error } = await supabase
                .from('pos_menu')
                .select('*')
                .eq('is_available', true)
                .order('name', { ascending: true });

            if (error) throw error;
            const validData = (data || []).filter(item => item.show_on_microsite !== false);
            setMenu(validData);
            try {
                localStorage.setItem('poj_microsite_menu_cache', JSON.stringify(validData));
            } catch(e) {}

            // Extract unique categories and respect custom category order
            let savedOrder = [];
            try {
                const rawOrder = localStorage.getItem('poj_category_order');
                if (rawOrder) savedOrder = JSON.parse(rawOrder);
            } catch(e) {}

            const rawCats = [...new Set((data || []).map(item => item.category).filter(Boolean))];
            const sortedCats = [];
            savedOrder.forEach(c => {
                if (rawCats.includes(c)) sortedCats.push(c);
            });
            rawCats.forEach(c => {
                if (!sortedCats.includes(c)) sortedCats.push(c);
            });

            setCategories(['All', ...sortedCats]);

        } catch (err) {
            console.error('Error loading menu:', err);
        } finally {
            setLoading(false);
        }
    };

    // Filter menu items
    const filteredMenu = menu.filter(item => {
        const matchesBrand = activeBrand === 'All' || itemBelongsToBrand(item, activeBrand);
        const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesBrand && matchesCategory && matchesSearch;
    });

    const visibleCategories = React.useMemo(() => {
        if (activeBrand === 'All') return categories;
        const brandItems = menu.filter(item => itemBelongsToBrand(item, activeBrand));
        const brandCatNames = new Set(brandItems.map(item => item.category));
        return ['All', ...categories.filter(cat => cat !== 'All' && brandCatNames.has(cat))];
    }, [menu, categories, activeBrand]);

    useEffect(() => {
        setActiveCategory('All');
    }, [activeBrand]);

    const handleGuestLoginOrRegister = async (e) => {
        e.preventDefault();
        if (!loginInput.trim()) return;
        setGuestLoading(true);
        try {
            const input = loginInput.trim().toLowerCase();
            const isEmail = input.includes('@');
            
            // Try fetching existing guest
            let query = supabase.from('guests').select('*');
            if (isEmail) {
                query = query.eq('email', input);
            } else {
                query = query.eq('phone', input);
            }
            
            const { data: existingGuests, error: fetchErr } = await query;
            if (fetchErr) throw fetchErr;
            
            if (existingGuests && existingGuests.length > 0) {
                // Welcome back existing user!
                const guest = existingGuests[0];
                setGuestUser(guest);
                setCustomerName(`${guest.first_name || ''} ${guest.last_name || ''}`.trim());
                if (guest.delivery_address) {
                    setDeliveryAddress(guest.delivery_address);
                }
                localStorage.setItem('mute_kitchens_guest', JSON.stringify(guest));
                fetchPastOrders(guest.id);
                setShowLoginPanel(false);
                setLoginInput('');
                setIsRegistering(false);
                alert(`Welcome back, ${guest.first_name}!`);
            } else {
                // No account found. If not yet in registration mode, transition to it
                if (!isRegistering) {
                    setIsRegistering(true);
                    setRegFirstName('');
                    setRegLastName('');
                    setRegAddress('');
                    if (isEmail) {
                        setRegEmail(input);
                        setRegPhone('');
                    } else {
                        setRegPhone(input);
                        setRegEmail('');
                    }
                    alert("No registered account found. Enter details below to create your account!");
                } else {
                    // Save new user registration details
                    if (!regFirstName.trim() || !regPhone.trim()) {
                        alert("First Name and Phone Number are required to register.");
                        setGuestLoading(false);
                        return;
                    }
                    
                    const newGuestPayload = {
                        first_name: regFirstName.trim(),
                        last_name: regLastName.trim(),
                        phone: regPhone.trim(),
                        email: regEmail.trim() ? regEmail.trim().toLowerCase() : null,
                        delivery_address: regAddress.trim() || null
                    };
                    
                    const { data: newGuest, error: insertErr } = await supabase
                        .from('guests')
                        .insert([newGuestPayload])
                        .select()
                        .single();
                        
                    if (insertErr) throw insertErr;
                    
                    setGuestUser(newGuest);
                    setCustomerName(`${newGuest.first_name || ''} ${newGuest.last_name || ''}`.trim());
                    if (newGuest.delivery_address) {
                        setDeliveryAddress(newGuest.delivery_address);
                    }
                    localStorage.setItem('mute_kitchens_guest', JSON.stringify(newGuest));
                    fetchPastOrders(newGuest.id);
                    setShowLoginPanel(false);
                    setLoginInput('');
                    setIsRegistering(false);
                    alert(`Account registered successfully! Welcome, ${newGuest.first_name}!`);
                }
            }
        } catch (err) {
            alert('Operation failed: ' + err.message);
        } finally {
            setGuestLoading(false);
        }
    };
    
    const handleGuestLogout = () => {
        localStorage.removeItem('mute_kitchens_guest');
        setGuestUser(null);
        setCustomerName('');
        setDeliveryAddress('');
        alert('You have logged out.');
    };

    const handleReorder = (pastOrder) => {
        const newCartItems = [];
        const itemsList = pastOrder.pos_order_items || [];
        itemsList.forEach(pastItem => {
            // Find matching available menu item by name (case-insensitive)
            const menuItem = menu.find(m => m.name.toLowerCase() === pastItem.item_name.toLowerCase());
            if (menuItem) {
                newCartItems.push({
                    ...menuItem,
                    quantity: pastItem.quantity,
                    instructions: pastItem.instructions || ''
                });
            }
        });
        if (newCartItems.length === 0) {
            alert("Sorry, none of the items in this past order are currently available on the menu.");
            return;
        }
        setCart(newCartItems);
        setCartOpen(true);
        alert(`${newCartItems.length} item(s) from your past order have been added to your cart!`);
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    const savedAddresses = React.useMemo(() => {
        const addresses = new Set();
        // Add the current guest user's profile address if set
        if (guestUser && guestUser.delivery_address) {
            addresses.add(guestUser.delivery_address.trim());
        }
        // Extract from past orders
        pastOrders.forEach(o => {
            if (o.notes && o.notes.includes('Delivery Address:')) {
                const match = o.notes.match(/Delivery Address:\s*([^\n]+)/);
                if (match && match[1]) {
                    addresses.add(match[1].trim());
                }
            }
        });
        return Array.from(addresses);
    }, [pastOrders, guestUser]);

    const handleApplyPromoCode = async (e) => {
        if (e) e.preventDefault();
        if (!promoCode.trim()) return;
        setPromoError('');
        setPromoSuccess('');
        try {
            const { data, error } = await supabase
                .from('pos_discounts')
                .select('*')
                .eq('code', promoCode.trim().toUpperCase())
                .eq('is_active', true)
                .maybeSingle();
                
            if (error) throw error;
            
            if (!data) {
                setPromoError('Invalid or expired discount code.');
                setAppliedDiscount(null);
                return;
            }
            
            if (cartTotal < (data.min_order_amount || 0)) {
                setPromoError(`Minimum order amount for this code is KES ${data.min_order_amount.toLocaleString()}`);
                setAppliedDiscount(null);
                return;
            }
            
            setAppliedDiscount(data);
            const successMsg = data.type === 'percentage' 
                ? `${data.value}% discount applied!` 
                : `KES ${data.value.toLocaleString()} discount applied!`;
            setPromoSuccess(successMsg);
        } catch (err) {
            setPromoError('Failed to validate code: ' + err.message);
            setAppliedDiscount(null);
        }
    };

    const discountAmount = React.useMemo(() => {
        if (!appliedDiscount) return 0;
        if (appliedDiscount.type === 'percentage') {
            return Math.round((cartTotal * appliedDiscount.value) / 100);
        } else {
            return Math.min(cartTotal, appliedDiscount.value);
        }
    }, [cartTotal, appliedDiscount]);

    const packagingFeeAmount = (diningOption === 'Takeaway' || diningOption === 'Delivery') 
        ? whatsappSettings.packaging_fee 
        : 0;
    const deliveryFeeAmount = diningOption === 'Delivery' ? calculatedDeliveryFee : 0;
    const finalTotal = Math.max(0, cartTotal - discountAmount + packagingFeeAmount + deliveryFeeAmount);

    // Cart operations
    const addToCart = (item) => {
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
            }
            return [...prev, { ...item, quantity: 1, instructions: '' }];
        });
    };

    const updateQuantity = (itemId, delta) => {
        setCart(prev => prev.map(item => {
            if (item.id === itemId) {
                const newQty = item.quantity + delta;
                return newQty > 0 ? { ...item, quantity: newQty } : item;
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const updateItemInstructions = (itemId, text) => {
        setCart(prev => prev.map(item => 
            item.id === itemId ? { ...item, instructions: text } : item
        ));
    };

    const removeFromCart = (itemId) => {
        setCart(prev => prev.filter(item => item.id !== itemId));
    };

    const handleSubmitOrder = async (e) => {
        e.preventDefault();
        if (cart.length === 0) return;
        if (diningOption === 'Delivery' && !deliveryAddress.trim()) {
            alert('Please specify your Delivery Address.');
            return;
        }

        setSubmitting(true);
        try {
            // Find a vacant table if Dine-in
            let assignedTable = '';
            if (diningOption === 'Dine-in') {
                const { data: openOrders, error: openOrdersError } = await supabase
                    .from('pos_orders')
                    .select('customer_name')
                    .not('status', 'in', '("completed","cancelled","voided","Completed","Cancelled","Voided")')
                    .in('dining_option', ['Dine Inn', 'Dine-in']);
                
                if (openOrdersError) throw openOrdersError;
                
                const occupiedTables = new Set(
                    (openOrders || []).map(o => (o.customer_name || '').trim().toLowerCase())
                );
                
                const allTables = [
                    'Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6',
                    'Table 7', 'Table 8', 'Table 9', 'Table 10', 'Table 11', 'Table 12'
                ];
                
                // Find the first table that is NOT occupied
                const vacantTable = allTables.find(table => !occupiedTables.has(table.toLowerCase()));
                
                if (!vacantTable) {
                    alert('All tables are currently occupied. Please select Takeaway or consult staff.');
                    setSubmitting(false);
                    return;
                }
                assignedTable = vacantTable;
            }

            // Double check availability of cart items before inserting order
            const { data: latestMenu, error: checkError } = await supabase
                .from('pos_menu')
                .select('id, name, is_available')
                .in('id', cart.map(i => i.id));
                
            if (!checkError && latestMenu) {
                const unavailableItems = cart.filter(cartItem => {
                    const dbItem = latestMenu.find(db => db.id === cartItem.id);
                    return !dbItem || !dbItem.is_available;
                });
                
                if (unavailableItems.length > 0) {
                    alert(`Sorry, the following item(s) just went out of stock: ${unavailableItems.map(i => i.name).join(', ')}. They have been removed from your cart.`);
                    setCart(prev => prev.filter(cartItem => !unavailableItems.some(ui => ui.id === cartItem.id)));
                    setSubmitting(false);
                    return;
                }
            }

            // Build order payload
            const promoNoteText = appliedDiscount ? `\n[Promo Applied: ${appliedDiscount.code} (-KES ${discountAmount.toLocaleString()})]` : '';
            const finalNotes = diningOption === 'Delivery'
                ? (notes.trim() ? `Delivery Address: ${deliveryAddress.trim()}\nNotes: ${notes.trim()}${promoNoteText}` : `Delivery Address: ${deliveryAddress.trim()}${promoNoteText}`)
                : (notes.trim() ? `${notes.trim()}${promoNoteText}` : promoNoteText.trim());

            const orderPayload = {
                customer_name: diningOption === 'Dine-in' 
                    ? (customerName.trim() ? `${assignedTable} (${customerName.trim()})` : assignedTable)
                    : (customerName.trim() || 'Online Guest'),
                dining_option: diningOption,
                payment_method: 'Paid to App',
                payment_status: 'Pending',
                status: 'Pending',
                total_amount: finalTotal,
                discount: discountAmount,
                cashier_name: 'Self-Service Microsite',
                brand: activeBrand === 'All' ? (cart.length > 0 ? getBrandForItem(cart[0]) : 'POT OF JOLLOF') : activeBrand,
                notes: finalNotes
            };

            // 1. Insert order header
            const { data: orderData, error: orderError } = await supabase
                .from('pos_orders')
                .insert([orderPayload])
                .select('id, ticket_number')
                .single();

            if (orderError) throw orderError;



            // 2. Insert order items
            const itemPayloads = cart.map(item => ({
                order_id: orderData.id,
                item_name: item.name,
                quantity: item.quantity,
                price: item.price,
                instructions: item.instructions || null,
                status: 'Pending'
            }));

            // Automatically append calculated delivery fee line item
            if (diningOption === 'Delivery' && calculatedDeliveryFee > 0) {
                itemPayloads.push({
                    order_id: orderData.id,
                    item_name: 'Delivery Fee',
                    quantity: 1,
                    price: calculatedDeliveryFee,
                    instructions: calculatedDistance ? `Distance: ${calculatedDistance.toFixed(1)} km` : 'Geocoded Delivery',
                    status: 'Pending'
                });
            }

            // Automatically append packaging fee line item
            if ((diningOption === 'Takeaway' || diningOption === 'Delivery') && whatsappSettings.packaging_fee > 0) {
                itemPayloads.push({
                    order_id: orderData.id,
                    item_name: 'Package Fee',
                    quantity: 1,
                    price: whatsappSettings.packaging_fee,
                    instructions: 'Packaging Fee',
                    status: 'Pending'
                });
            }

            const { error: itemsError } = await supabase
                .from('pos_order_items')
                .insert(itemPayloads);

            if (itemsError) throw itemsError;

            // Complete order process
            if (guestUser) {
                try {
                    const newVisits = (guestUser.visit_count || 0) + 1;
                    const newSpend = parseFloat(guestUser.lifetime_spend || 0) + finalTotal;
                    
                    await supabase
                        .from('guests')
                        .update({
                            visit_count: newVisits,
                            lifetime_spend: newSpend,
                            delivery_address: deliveryAddress.trim() || guestUser.delivery_address
                        })
                        .eq('id', guestUser.id);
                    
                    try {
                        await supabase
                            .from('guest_visits')
                            .insert([{
                                guest_id: guestUser.id,
                                spend: cartTotal,
                                table_number: diningOption === 'Dine-in' ? assignedTable : '',
                                notes: `Order #${orderData.ticket_number} via Microsite`
                            }]);
                    } catch (e) {
                        console.warn("Could not insert guest_visit:", e);
                    }

                    
                    const updatedGuest = {
                        ...guestUser,
                        visit_count: newVisits,
                        lifetime_spend: newSpend,
                        delivery_address: deliveryAddress.trim() || guestUser.delivery_address
                    };
                    localStorage.setItem('mute_kitchens_guest', JSON.stringify(updatedGuest));
                    setGuestUser(updatedGuest);
                    fetchPastOrders(updatedGuest.id);
                } catch (e) {
                    console.error('Error updating CRM metrics:', e);
                }
            }

            setOrderSuccess({
                orderId: orderData.id,
                ticketNumber: orderData.ticket_number,
                total: finalTotal,
                brand: activeBrand === 'All' ? (cart.length > 0 ? getBrandForItem(cart[0]) : 'POT OF JOLLOF') : activeBrand,
                items: cart.map(i => `${i.quantity}x ${i.name}${i.instructions ? ` (${i.instructions})` : ''}`).join('\n'),
                diningOption: diningOption,
                deliveryAddress: diningOption === 'Delivery' ? deliveryAddress : '',
                notes: finalNotes,
                stage: 'payment_instructions',
                mpesaCode: ''
            });
            setCart([]);
            setCartOpen(false);
            setPromoCode('');
            setAppliedDiscount(null);
            setPromoError('');
            setPromoSuccess('');
            if (!guestUser) {
                setCustomerName('');
                setDeliveryAddress('');
            }
            setTableNumber('');
            setNotes('');
        } catch (err) {
            alert('Failed to place order: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (orderSuccess) {
        return (
            <MicrositeOrderSuccessModal 
                orderSuccess={orderSuccess} 
                setOrderSuccess={setOrderSuccess} 
                whatsappSettings={whatsappSettings} 
            />
        );
    }

    const activeBrandConfig = BRAND_CONFIGS[activeBrand] || {
        name: 'MUTE KITCHENS',
        desc: 'Explore our menus and place your orders directly to our chefs from your phone.',
        logo: '/logo.png',
        color: 'from-neutral-900 to-black'
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col font-sans select-none">
            {/* Visual Brand Header Banner */}
            <div className={`relative h-44 md:h-52 bg-gradient-to-r ${activeBrandConfig.color} flex flex-col justify-end p-6 md:p-8 shrink-0 overflow-hidden transition-all duration-300`}>
                {/* Abstract Glowing Backdrop */}
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80')] bg-cover bg-center mix-blend-overlay opacity-10"></div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0e12] via-transparent to-black/30"></div>

                {/* Visual Header Navigation Buttons */}
                {activeBrand === 'All' ? (
                    <>
                        {onBack && (
                            <button
                                onClick={onBack}
                                className="absolute left-4 top-4 md:left-6 md:top-6 z-20 flex items-center gap-1.5 px-3 py-1 bg-black/35 hover:bg-black/50 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-gray-300 hover:text-white transition-all shadow-md"
                            >
                                <ArrowLeft size={10} /> Exit Menu
                            </button>
                        )}
                        <button
                            onClick={() => setAccountOpen(true)}
                            className="absolute right-4 top-4 md:right-6 md:top-6 z-20 flex items-center gap-1.5 px-3 py-1 bg-black/35 hover:bg-black/50 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-gray-300 hover:text-white transition-all shadow-md"
                        >
                            👤 {guestUser ? guestUser.first_name : 'Log In'}
                        </button>
                    </>
                ) : (
                    <>
                        {!isSingleBrand && (
                            <button
                                onClick={() => setActiveBrand('All')}
                                className="absolute left-4 top-4 md:left-6 md:top-6 z-20 flex items-center gap-1.5 px-3 py-1 bg-black/35 hover:bg-black/50 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-gray-300 hover:text-white transition-all shadow-md"
                            >
                                <ArrowLeft size={10} /> Back
                            </button>
                        )}
                        {isSingleBrand && onBack && (
                            <button
                                onClick={onBack}
                                className="absolute left-4 top-4 md:left-6 md:top-6 z-20 flex items-center gap-1.5 px-3 py-1 bg-black/35 hover:bg-black/50 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-gray-300 hover:text-white transition-all shadow-md"
                            >
                                <ArrowLeft size={10} /> Exit Menu
                            </button>
                        )}

                        <button
                            onClick={() => setAccountOpen(true)}
                            className="absolute right-4 top-4 md:right-6 md:top-6 z-20 flex items-center gap-1.5 px-3 py-1 bg-black/35 hover:bg-black/50 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-wider text-gray-300 hover:text-white transition-all shadow-md"
                        >
                            👤 {guestUser ? guestUser.first_name : 'Log In'}
                        </button>
                    </>
                )}

                <div className="relative z-10 max-w-6xl mx-auto w-full flex flex-col items-center justify-center text-center gap-2">
                    {activeBrand !== 'All' && (
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-full overflow-hidden bg-black/30 border border-white/10 flex items-center justify-center shrink-0 shadow-md">
                            <img src={activeBrandConfig.logo} alt={activeBrandConfig.name} className="w-full h-full object-contain bg-white" onError={(e) => { e.target.style.display = 'none'; }} />
                        </div>
                    )}
                    <div>
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <Utensils size={14} className="text-orange-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest bg-black/40 text-orange-400 px-2 py-0.5 rounded-md">Self-Service</span>
                        </div>
                        <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase">{activeBrandConfig.name}</h1>
                        <p className="text-xs text-gray-300 font-medium mt-0.5">{activeBrandConfig.desc}</p>
                    </div>
                </div>
            </div>

            {activeBrand === 'All' ? (
                /* Brand Selection Landing Page */
                <div className="flex-1 bg-gray-50 py-12 px-6 overflow-y-auto">
                    <div className="max-w-6xl mx-auto w-full">
                        <div className="text-center mb-12">
                            <h2 className="text-2xl md:text-4xl font-black text-gray-950 tracking-tight">EXPLORE OUR BRANDS</h2>
                            <p className="text-sm text-gray-500 mt-2 font-medium">Select a brand below to view its specific menu and order.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            {[
                                { id: 'POT OF JOLLOF', name: 'Pot of Jollof Kitchen', desc: '🥘 Signature Jollof rice, combos & West African classics', logo: '/jollof_logo.png', hoverColor: 'hover:border-black' },
                                { id: 'SAMAKI STREET', name: 'Samaki Street', desc: '🐟 Whole Tilapia, Mackerel & hot fish specialties', logo: '/samaki_logo.jpg', hoverColor: 'hover:border-black' },
                                { id: 'CAFÉ SWAHILI', name: 'Café Swahili', desc: '☕ Traditional Swahili breakfast, tea & hot brews', logo: '/swahili_logo.png', hoverColor: 'hover:border-black' },
                                { id: 'LITTLE LAGOS', name: 'Little Lagos', desc: '🍛 Authentic Nigerian soups, stews & swallows', logo: '/lagos_logo.png', hoverColor: 'hover:border-black' }
                            ].map(brand => (
                                <motion.div
                                    key={brand.id}
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => {
                                        setActiveBrand(brand.id);
                                        setActiveCategory('All');
                                    }}
                                    className={`bg-white border border-gray-200 ${brand.hoverColor} rounded-[2.5rem] p-6 flex flex-col justify-between items-center text-center cursor-pointer transition-all shadow-sm hover:shadow-md group relative overflow-hidden h-80`}
                                >
                                    <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                                        <div className="w-28 h-28 rounded-full overflow-hidden bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0 shadow-sm">
                                            <img src={brand.logo} alt={brand.name} className="w-full h-full object-contain bg-white group-hover:scale-110 transition-transform duration-300" onError={(e) => { e.target.style.display = 'none'; }} />
                                        </div>
                                        <div className="text-center">
                                            <h3 className="font-black text-lg text-gray-900 group-hover:text-black transition-colors">{brand.name}</h3>
                                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">{brand.desc}</p>
                                        </div>
                                    </div>
                                    <span className="mt-4 px-5 py-2.5 bg-black hover:bg-neutral-850 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors shrink-0 text-center">
                                        View Menu
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                /* Specific Brand Menu */
                <>
                    {/* Filter, Search and Cart Sticky Header */}
                    <div className="bg-white border-b border-gray-200 py-3 px-4 sticky top-0 z-40 backdrop-blur-md bg-opacity-95 shadow-sm">
                        <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-3">
                            {/* Categories (horizontal scroll) */}
                            <div className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none custom-scrollbar py-0.5">
                                {visibleCategories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0 border ${
                                            activeCategory === cat
                                                ? 'bg-black border-black text-white shadow-sm'
                                                : 'bg-gray-100 border-gray-200 text-gray-500 hover:text-black hover:border-gray-300'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            {/* Search & Cart Actions Group */}
                            <div className="flex items-center gap-2 shrink-0">
                                <div className="relative w-36 sm:w-52">
                                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-gray-55 border border-gray-200 rounded-xl py-2 pl-8 pr-3 text-[11px] focus:outline-none focus:border-black text-gray-900 placeholder-gray-450 transition-colors font-bold"
                                    />
                                </div>

                                <button
                                    onClick={() => cart.length > 0 && setCartOpen(true)}
                                    className={`relative p-2 bg-black hover:bg-neutral-850 text-white rounded-xl transition-all shadow-sm flex items-center justify-center shrink-0 ${
                                        cart.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
                                    }`}
                                >
                                    <ShoppingCart size={14} />
                                    {cartCount > 0 && (
                                        <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] font-black h-4 w-4 rounded-full flex items-center justify-center border border-white shadow-sm animate-bounce">
                                            {cartCount}
                                        </span>
                                    )}
                                </button>

                                <button
                                    onClick={() => setAccountOpen(true)}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 rounded-xl transition-all shadow-sm flex items-center justify-center shrink-0"
                                    title="Account Profile"
                                >
                                    <span className="text-xs">👤</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Menu Items Container */}
                    <div className="flex-1 bg-gray-50 py-8 px-4 overflow-y-auto">
                        <div className="max-w-6xl mx-auto w-full">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-2">
                                    <Loader2 className="animate-spin text-black" size={36} />
                                    <span className="text-xs font-black uppercase tracking-widest text-gray-400">Loading delicious items...</span>
                                </div>
                            ) : filteredMenu.length === 0 ? (
                                <div className="text-center py-20 text-gray-500 border border-gray-200 rounded-[2rem] bg-white p-8 shadow-sm">
                                    <Award size={48} className="text-gray-300 mx-auto mb-3" />
                                    <span className="text-sm font-bold uppercase tracking-wider text-gray-800">No menu items found</span>
                                    <p className="text-xs text-gray-500 mt-1">Try resetting your search query or choosing another category.</p>
                                </div>
                            ) : (
                                activeCategory === 'All' ? (
                                    /* Grouped by Category with Headers */
                                    <div className="space-y-10">
                                        {categories.filter(cat => cat !== 'All').map(categoryName => {
                                            const catItems = filteredMenu.filter(item => (item.category || 'General') === categoryName);
                                            if (catItems.length === 0) return null;
                                            return (
                                                <div key={categoryName} className="space-y-4">
                                                    <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                                                        <span className="text-xs font-black uppercase tracking-widest bg-gray-900 text-white px-3.5 py-1.5 rounded-xl shadow-sm">
                                                            {categoryName}
                                                        </span>
                                                        <span className="text-xs text-gray-400 font-bold">({catItems.length} items)</span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        {catItems.map(item => {
                                                            const cartItem = cart.find(i => i.id === item.id);
                                                            return (
                                                                <motion.div
                                                                    key={item.id}
                                                                    layout
                                                                    className="bg-white border border-gray-150 hover:border-gray-250 rounded-[1.5rem] p-4 flex items-stretch justify-between gap-4 transition-all shadow-sm hover:shadow-md group relative text-left"
                                                                >
                                                                    <div className="flex-1 flex flex-col justify-between min-w-0">
                                                                        <div className="space-y-1.5">
                                                                            <div>
                                                                                <h3 className="font-bold text-sm text-gray-900 group-hover:text-black transition-colors truncate">{item.name}</h3>
                                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{item.category}</span>
                                                                                </div>
                                                                            </div>
                                                                            <span className="text-xs font-black text-gray-900 font-mono">KES {Math.round(item.price).toLocaleString()}</span>
                                                                            <p className="text-[10px] text-gray-500 font-medium leading-normal line-clamp-2 md:line-clamp-3">
                                                                                {item.description || 'Tasty freshly prepared house recipe, made with premium ingredients.'}
                                                                            </p>
                                                                        </div>
                                                                        <div className="mt-3 flex items-center justify-between gap-2">
                                                                            {cartItem && (
                                                                                <div className="flex items-center bg-gray-100 border border-gray-200 rounded-xl p-0.5">
                                                                                    <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 rounded-lg bg-gray-205 hover:bg-gray-300 flex items-center justify-center text-gray-700 transition-colors">
                                                                                        <Minus size={10} />
                                                                                    </button>
                                                                                    <span className="text-[11px] font-black font-mono px-2.5 text-gray-900">{cartItem.quantity}</span>
                                                                                    <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 rounded-lg bg-black text-white hover:bg-neutral-850 flex items-center justify-center transition-colors">
                                                                                        <Plus size={10} />
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="w-28 h-28 md:w-32 md:h-32 shrink-0 rounded-2xl overflow-hidden relative bg-gray-50 border border-gray-150 flex items-center justify-center shadow-sm">
                                                                        <img src={item.image_url || '/logo.png'} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 bg-white" onError={(e) => { e.target.src = '/logo.png'; }} />
                                                                        {!cartItem ? (
                                                                            <button onClick={() => addToCart(item)} className="absolute bottom-2 right-2 w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all text-black hover:bg-gray-50">
                                                                                <Plus size={16} />
                                                                            </button>
                                                                        ) : (
                                                                            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black text-white text-[9px] font-black rounded-lg shadow-md">
                                                                                {cartItem.quantity}x
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </motion.div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    /* Single Category Grid View */
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {filteredMenu.map(item => {
                                            const cartItem = cart.find(i => i.id === item.id);
                                            return (
                                                <motion.div
                                                    key={item.id}
                                                    layout
                                                    className="bg-white border border-gray-150 hover:border-gray-250 rounded-[1.5rem] p-4 flex items-stretch justify-between gap-4 transition-all shadow-sm hover:shadow-md group relative text-left"
                                                >
                                                    <div className="flex-1 flex flex-col justify-between min-w-0">
                                                        <div className="space-y-1.5">
                                                            <div>
                                                                <h3 className="font-bold text-sm text-gray-900 group-hover:text-black transition-colors truncate">{item.name}</h3>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{item.category}</span>
                                                                </div>
                                                            </div>
                                                            <span className="text-xs font-black text-gray-900 font-mono">KES {Math.round(item.price).toLocaleString()}</span>
                                                            <p className="text-[10px] text-gray-500 font-medium leading-normal line-clamp-2 md:line-clamp-3">
                                                                {item.description || 'Tasty freshly prepared house recipe, made with premium ingredients.'}
                                                            </p>
                                                        </div>
                                                        <div className="mt-3 flex items-center justify-between gap-2">
                                                            {cartItem && (
                                                                <div className="flex items-center bg-gray-100 border border-gray-200 rounded-xl p-0.5">
                                                                    <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 rounded-lg bg-gray-205 hover:bg-gray-300 flex items-center justify-center text-gray-700 transition-colors">
                                                                        <Minus size={10} />
                                                                    </button>
                                                                    <span className="text-[11px] font-black font-mono px-2.5 text-gray-900">{cartItem.quantity}</span>
                                                                    <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 rounded-lg bg-black text-white hover:bg-neutral-850 flex items-center justify-center transition-colors">
                                                                        <Plus size={10} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="w-28 h-28 md:w-32 md:h-32 shrink-0 rounded-2xl overflow-hidden relative bg-gray-50 border border-gray-150 flex items-center justify-center shadow-sm">
                                                        <img src={item.image_url || '/logo.png'} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 bg-white" onError={(e) => { e.target.src = '/logo.png'; }} />
                                                        {!cartItem ? (
                                                            <button onClick={() => addToCart(item)} className="absolute bottom-2 right-2 w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all text-black hover:bg-gray-50">
                                                                <Plus size={16} />
                                                            </button>
                                                        ) : (
                                                            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black text-white text-[9px] font-black rounded-lg shadow-md">
                                                                {cartItem.quantity}x
                                                            </div>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                )
                            )}

                        </div>
                    </div>
                </>
            )}

            {/* Cart Drawer Overlay */}
            <AnimatePresence>
                {cartOpen && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !submitting && setCartOpen(false)}
                            className="fixed inset-0 bg-black z-50"
                        ></motion.div>

                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'tween', duration: 0.3 }}
                            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white border-l border-gray-200 z-50 flex flex-col shadow-2xl text-gray-900"
                        >
                            {/* Drawer Header */}
                            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
                                <div className="flex items-center gap-2">
                                    <ShoppingCart size={20} className="text-black" />
                                    <h2 className="text-lg font-black tracking-tight text-gray-900">Your Cart ({cartCount})</h2>
                                </div>
                                <button 
                                    disabled={submitting}
                                    onClick={() => setCartOpen(false)}
                                    className="p-2 text-gray-400 hover:text-black hover:bg-gray-150 rounded-xl transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Cart Items List */}
                            <div className="flex-1 p-6 overflow-y-auto space-y-4 custom-scrollbar bg-gray-50/30">
                                {cart.map(item => (
                                    <div key={item.id} className="bg-white border border-gray-200 p-4 rounded-2xl flex flex-col gap-3 relative group">
                                        <button
                                            disabled={submitting}
                                            onClick={() => removeFromCart(item.id)}
                                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-650 transition-colors"
                                            title="Remove item"
                                        >
                                            <X size={14} />
                                        </button>

                                        <div className="flex justify-between items-start pr-6">
                                            <div>
                                                <h4 className="font-bold text-xs text-gray-900">{item.name}</h4>
                                                <span className="text-[9px] text-gray-500 font-mono">KES {item.price.toLocaleString()}</span>
                                            </div>
                                            <span className="text-xs font-black text-gray-900 font-mono">KES {(item.price * item.quantity).toLocaleString()}</span>
                                        </div>

                                        <div className="flex justify-between items-center gap-4 pt-2 border-t border-gray-100">
                                            {/* Special prep notes */}
                                            <input 
                                                type="text"
                                                placeholder="Special prep instructions (e.g. No onions)"
                                                value={item.instructions}
                                                disabled={submitting}
                                                onChange={(e) => updateItemInstructions(item.id, e.target.value)}
                                                className="flex-1 bg-transparent text-[10px] text-gray-600 placeholder-gray-400 border-b border-gray-200 py-1 focus:outline-none focus:border-black font-medium"
                                            />

                                            <div className="flex items-center gap-2 shrink-0">
                                                <button 
                                                    disabled={submitting}
                                                    onClick={() => updateQuantity(item.id, -1)}
                                                    className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-700"
                                                >
                                                    <Minus size={10} />
                                                </button>
                                                <span className="text-xs font-black font-mono w-4 text-center text-gray-900">{item.quantity}</span>
                                                <button 
                                                    disabled={submitting}
                                                    onClick={() => updateQuantity(item.id, 1)}
                                                    className="w-6 h-6 rounded-md bg-black hover:bg-neutral-800 flex items-center justify-center transition-colors text-white"
                                                >
                                                    <Plus size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Checkout Form & Summary */}
                            <form onSubmit={handleSubmitOrder} className="p-6 bg-gray-50 border-t border-gray-200 space-y-4 shrink-0">
                                {/* Guest Account Panel Summary */}
                                {guestUser ? (
                                    <div className="bg-white border border-gray-200 rounded-xl p-3 flex justify-between items-center text-xs shadow-sm">
                                        <div className="flex flex-col text-left">
                                            <span className="font-bold text-gray-900">👤 Placing order as {guestUser.first_name}</span>
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{guestUser.phone}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setAccountOpen(true)}
                                            className="text-[9px] font-black text-black hover:underline uppercase tracking-wider"
                                        >
                                            Switch
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-white border border-gray-200 rounded-xl p-3 flex justify-between items-center text-xs shadow-sm">
                                        <div className="flex flex-col text-left">
                                            <span className="font-bold text-gray-700">👤 Guest Checkout</span>
                                            <span className="text-[9px] text-gray-450 mt-0.5">Register/log in to save address & track orders.</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setAccountOpen(true)}
                                            className="text-[9px] font-black text-black hover:underline uppercase tracking-wider"
                                        >
                                            Log In
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-3 gap-2 bg-white p-1 rounded-xl border border-gray-200">
                                    <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => setDiningOption('Dine-in')}
                                        className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                            diningOption === 'Dine-in'
                                                ? 'bg-black text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        Eat Here
                                    </button>
                                    <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => setDiningOption('Takeaway')}
                                        className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                            diningOption === 'Takeaway'
                                                ? 'bg-black text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        Takeaway
                                    </button>
                                    <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => setDiningOption('Delivery')}
                                        className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                            diningOption === 'Delivery'
                                                ? 'bg-black text-white shadow-sm'
                                                : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        Delivery
                                    </button>
                                </div>

                                {/* Dynamic inputs */}
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Your Name (Optional)"
                                        value={customerName}
                                        disabled={submitting}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs placeholder-gray-400 text-gray-900 focus:outline-none focus:border-black font-medium"
                                    />
                                    {diningOption === 'Delivery' && (
                                        <div className="space-y-2 text-left">
                                            {guestUser && savedAddresses.length > 0 && (
                                                <div className="space-y-1.5">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Select Delivery Address</span>
                                                    <div className="flex flex-col gap-1.5">
                                                        {savedAddresses.map((addr, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => setDeliveryAddress(addr)}
                                                                className={`p-2.5 rounded-xl border text-[10px] text-left transition-all ${
                                                                    deliveryAddress === addr
                                                                        ? 'bg-black border-black text-white font-bold'
                                                                        : 'bg-white border-gray-255 text-gray-700 hover:border-gray-300'
                                                                }`}
                                                            >
                                                                📍 {addr}
                                                            </button>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (savedAddresses.includes(deliveryAddress)) {
                                                                    setDeliveryAddress('');
                                                                }
                                                            }}
                                                            className={`p-2.5 rounded-xl border text-[10px] text-left transition-all ${
                                                                !savedAddresses.includes(deliveryAddress)
                                                                    ? 'bg-black border-black text-white font-bold'
                                                                    : 'bg-white border-gray-250 text-gray-800 hover:bg-gray-100 font-bold border-dashed'
                                                            }`}
                                                        >
                                                            ➕ Add New Address
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            {(!guestUser || savedAddresses.length === 0 || !savedAddresses.includes(deliveryAddress)) && (
                                                <div className="relative">
                                                    <div className="relative flex items-center">
                                                        <input
                                                            type="text"
                                                            placeholder="Delivery Address (e.g. Kilimani, Westlands, Purple Tower) *"
                                                            required
                                                            value={deliveryAddress}
                                                            disabled={submitting}
                                                            onChange={(e) => setDeliveryAddress(e.target.value)}
                                                            onFocus={() => setShowSuggestions(true)}
                                                            className="w-full bg-white border border-gray-300 rounded-xl py-2 px-3 text-xs placeholder-gray-400 text-gray-900 focus:outline-none focus:border-black font-semibold shadow-xs"
                                                        />
                                                        {isSearchingAddress && (
                                                            <span className="absolute right-3 text-[10px] text-amber-600 font-bold animate-pulse">
                                                                🔍 Searching...
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Real-time Address Autocomplete Floating Dropdown */}
                                                    {showSuggestions && addressSuggestions.length > 0 && (
                                                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border-2 border-amber-500 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto divide-y divide-gray-100 text-left">
                                                            <div className="px-3 py-1.5 bg-amber-50 text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center justify-between">
                                                                <span>📍 Select Matching Location:</span>
                                                                <span className="text-[9px] font-normal text-amber-600">Auto-calculates distance & fee</span>
                                                            </div>
                                                            {addressSuggestions.map((s, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={() => handleSelectAddressSuggestion(s)}
                                                                    className="w-full px-3 py-2 text-xs text-gray-900 hover:bg-amber-50 hover:text-amber-900 font-medium text-left transition-colors flex items-start gap-2 cursor-pointer"
                                                                >
                                                                    <span className="text-amber-500 text-sm shrink-0 mt-0.5">📍</span>
                                                                    <span className="line-clamp-2 leading-snug">{s.display_name}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                            )}
                                        </div>
                                    )}
                                    <input
                                        type="text"
                                        placeholder="Order notes / delivery specs / special request"
                                        value={notes}
                                        disabled={submitting}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className="w-full bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs placeholder-gray-400 text-gray-900 focus:outline-none focus:border-black font-medium"
                                    />
                                </div>

                                {/* Promo Code Input Block */}
                                <div className="pt-2 border-t border-gray-100 text-left space-y-1.5">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Promo / Discount Code</span>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Enter code (e.g. MUTE10)"
                                            value={promoCode}
                                            onChange={(e) => setPromoCode(e.target.value)}
                                            disabled={submitting}
                                            className="flex-1 bg-white border border-gray-200 rounded-xl py-2 px-3 text-xs placeholder-gray-400 text-gray-900 focus:outline-none focus:border-black font-medium uppercase font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleApplyPromoCode}
                                            disabled={submitting || !promoCode.trim()}
                                            className="px-4 py-2 bg-black hover:bg-neutral-850 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                    {promoError && <p className="text-[9px] font-bold text-red-500 ml-1">{promoError}</p>}
                                    {promoSuccess && <p className="text-[9px] font-bold text-emerald-600 ml-1">✓ {promoSuccess}</p>}
                                </div>

                                {/* Order Summary calculations */}
                                <div className="space-y-2 pt-2 text-xs font-bold border-t border-gray-200">
                                    <div className="flex justify-between items-center text-gray-500">
                                        <span>Subtotal:</span>
                                        <span>KES {cartTotal.toLocaleString()}</span>
                                    </div>
                                    {discountAmount > 0 && (
                                        <div className="flex justify-between items-center text-emerald-600">
                                            <span>Discount Applied:</span>
                                            <span>- KES {discountAmount.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {packagingFeeAmount > 0 && (
                                        <div className="flex justify-between items-center text-gray-500">
                                            <span>Packaging Fee:</span>
                                            <span>KES {packagingFeeAmount.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-gray-500">
                                        <span>Delivery Fee:</span>
                                        <span>
                                            {diningOption === 'Delivery' ? (
                                                isGeocoding ? (
                                                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                                                        <Loader2 className="animate-spin" size={10} /> Calculating...
                                                    </span>
                                                ) : geocodingError ? (
                                                    <span className="text-red-500 text-[10px]">{geocodingError} (KES {calculatedDeliveryFee})</span>
                                                ) : (
                                                    <span>
                                                        KES {calculatedDeliveryFee.toLocaleString()}
                                                        {calculatedDistance && ` (${calculatedDistance.toFixed(1)} km)`}
                                                    </span>
                                                )
                                            ) : 'FREE'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-end text-sm text-gray-900 font-black pt-1">
                                        <span>Total:</span>
                                        <span className="text-lg text-black font-mono">KES {finalTotal.toLocaleString()}</span>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting || cart.length === 0}
                                    className="w-full py-4 bg-black hover:bg-neutral-850 disabled:opacity-50 text-white font-black text-sm rounded-xl transition-all shadow-lg shadow-black/10 flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="animate-spin" size={16} /> Submitting Order...
                                        </>
                                    ) : (
                                        'Submit Order to Kitchen'
                                    )}
                                </button>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Guest Account Sidebar Drawer */}
            <AnimatePresence>
                {accountOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setAccountOpen(false)}
                            className="fixed inset-0 bg-black z-55"
                        ></motion.div>

                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'tween', duration: 0.3 }}
                            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white border-l border-gray-200 z-55 flex flex-col shadow-2xl text-gray-900 text-left"
                        >
                            {/* Drawer Header */}
                            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">👤</span>
                                    <h2 className="text-lg font-black tracking-tight text-gray-900">Your Account</h2>
                                </div>
                                <button 
                                    onClick={() => setAccountOpen(false)}
                                    className="p-2 text-gray-400 hover:text-black hover:bg-gray-150 rounded-xl transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Drawer Content */}
                            <div className="flex-1 p-6 overflow-y-auto space-y-6 custom-scrollbar bg-gray-50/30">
                                {guestUser ? (
                                    <div className="space-y-6 text-left">
                                        {/* User Details Card */}
                                        <div className="bg-white border border-gray-200 rounded-[2rem] p-6 shadow-sm space-y-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center font-black text-lg">
                                                    {(guestUser.first_name || 'G')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-sm text-gray-900 leading-tight">
                                                        {guestUser.first_name} {guestUser.last_name || ''}
                                                    </h3>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                                        {guestUser.phone || guestUser.email}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="h-px bg-gray-100"></div>

                                            {/* CRM Stats */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-150 text-center">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Visits</span>
                                                    <span className="text-xl font-black text-black font-mono mt-1 block">{guestUser.visit_count || 0}</span>
                                                </div>
                                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-150 text-center">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Total Spend</span>
                                                    <span className="text-sm font-black text-black font-mono mt-2 block">KES {Math.round(guestUser.lifetime_spend || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="space-y-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowHistory(true);
                                                    setAccountOpen(false);
                                                }}
                                                className="w-full py-3.5 bg-black hover:bg-neutral-850 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all text-center flex items-center justify-center gap-2 shadow-md"
                                            >
                                                📅 View Order History ({pastOrders.length})
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleGuestLogout();
                                                    setAccountOpen(false);
                                                }}
                                                className="w-full py-3.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-500 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-center"
                                            >
                                                Log Out Account
                                            </button>
                                        </div>

                                        {/* Saved Addresses Section */}
                                        {savedAddresses.length > 0 && (
                                            <div className="space-y-2">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Your Saved Addresses</span>
                                                <div className="space-y-2">
                                                    {savedAddresses.map((addr, idx) => (
                                                        <div key={idx} className="bg-white border border-gray-200 rounded-xl p-3 text-xs flex items-start gap-2 shadow-sm">
                                                            <span className="text-gray-400 mt-0.5">📍</span>
                                                            <span className="text-gray-700 font-semibold">{addr}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Logged Out: Show Check-in & Registration form */
                                    <div className="bg-white border border-gray-200 rounded-[2rem] p-6 shadow-sm space-y-4 text-left">
                                        <div className="text-center pb-2">
                                            <span className="text-3xl">🔑</span>
                                            <h3 className="font-black text-sm text-gray-900 uppercase tracking-tight mt-2">Log In or Register</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Enter your phone number or email to check in or register.</p>

                                        </div>

                                        <form onSubmit={handleGuestLoginOrRegister} className="space-y-4">
                                            {!isRegistering ? (
                                                <div className="space-y-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider ml-1">Phone Number or Email</label>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g. +254712345678"
                                                            required
                                                            value={loginInput}
                                                            onChange={(e) => setLoginInput(e.target.value)}
                                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:border-black font-semibold text-gray-905 placeholder-gray-400"
                                                        />
                                                    </div>
                                                    <button
                                                        type="submit"
                                                        disabled={guestLoading}
                                                        className="w-full py-3.5 bg-black hover:bg-neutral-850 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                                                    >
                                                        {guestLoading ? 'Checking...' : 'Check In'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider ml-1">First Name *</label>
                                                        <input
                                                            type="text"
                                                            required
                                                            placeholder="First Name"
                                                            value={regFirstName}
                                                            onChange={(e) => setRegFirstName(e.target.value)}
                                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:border-black font-semibold text-gray-905"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider ml-1">Last Name (Optional)</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Last Name"
                                                            value={regLastName}
                                                            onChange={(e) => setRegLastName(e.target.value)}
                                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:border-black font-semibold text-gray-905"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider ml-1">Phone *</label>
                                                            <input
                                                                type="text"
                                                                required
                                                                placeholder="Phone Number"
                                                                value={regPhone}
                                                                onChange={(e) => setRegPhone(e.target.value)}
                                                                className="w-full bg-gray-55 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:border-black font-semibold text-gray-905"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider ml-1">Email</label>
                                                            <input
                                                                type="email"
                                                                placeholder="Email (Optional)"
                                                                value={regEmail}
                                                                onChange={(e) => setRegEmail(e.target.value)}
                                                                className="w-full bg-gray-55 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:border-black font-semibold text-gray-905"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-wider ml-1">Delivery Address (Optional)</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Delivery Address"
                                                            value={regAddress}
                                                            onChange={(e) => setRegAddress(e.target.value)}
                                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:border-black font-semibold text-gray-905"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2 pt-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsRegistering(false)}
                                                            className="flex-1 py-3.5 border border-gray-250 text-gray-800 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-gray-50 transition-colors"
                                                        >
                                                            Back
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            disabled={guestLoading}
                                                            className="flex-1 py-3.5 bg-black hover:bg-neutral-850 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                                                        >
                                                            {guestLoading ? 'Registering...' : 'Register'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </form>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Past Orders History Modal */}
            {showHistory && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white border border-gray-200 rounded-[2.5rem] w-full max-w-lg p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh] text-left"
                    >
                        <div className="flex justify-between items-center pb-4 border-b border-gray-200 shrink-0">
                            <h3 className="font-black text-sm text-gray-900 uppercase tracking-tight">Your Order History</h3>
                            <button 
                                onClick={() => setShowHistory(false)}
                                className="p-1 text-gray-400 hover:text-black rounded-lg transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto py-4 space-y-4 custom-scrollbar">
                            {pastOrders.length === 0 ? (
                                <div className="text-center py-12 text-gray-450">
                                    <p className="text-xs font-bold uppercase tracking-wider">No orders found</p>
                                    <p className="text-[10px] mt-1">Once you place an order, it will appear here.</p>
                                </div>
                            ) : (
                                pastOrders.map(order => (
                                    <div key={order.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="text-[10px] font-black text-white bg-black px-2 py-0.5 rounded-md uppercase tracking-wider">#{order.ticket_number}</span>
                                                <span className="text-[10px] text-gray-500 block mt-1 font-medium">{new Date(order.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleReorder(order);
                                                    setShowHistory(false);
                                                }}
                                                className="px-3 py-1.5 bg-black hover:bg-neutral-850 text-white text-[9px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm"
                                            >
                                                ⚡ Reorder
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            {(order.pos_order_items || []).map((itm, idx) => (
                                                <div key={idx} className="flex justify-between text-[11px] text-gray-700 font-medium">
                                                    <span>{itm.quantity}x {itm.item_name} {itm.instructions ? `(${itm.instructions})` : ''}</span>
                                                    <span className="font-mono text-gray-900 font-bold">KES {Math.round(itm.price * itm.quantity).toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <div className="h-px bg-gray-200"></div>
                                        
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider">Option: {order.dining_option}</span>
                                            <span className="font-black text-gray-905 font-mono">Total: KES {Math.round(order.total_amount).toLocaleString()}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
export default MenuMicrosite;
