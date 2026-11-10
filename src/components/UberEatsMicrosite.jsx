import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Search, ShoppingBag, X, Plus, Minus, Star, Clock, 
    MapPin, ChevronRight, Check, AlertCircle, Sparkles, 
    Share2, Info, Heart, ArrowLeft, Motorbike, UtensilsCrossed,
    SlidersHorizontal, Tag, Phone, User, Calendar, LogOut,
    CheckCircle, Loader2, Copy
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { initiateStkPush } from '../lib/mpesa';

function normaliseTenantMenu(tenant) {
    if (!tenant?.menu?.length) return null;
    const groups = new Map();
    tenant.menu.forEach((item, index) => {
        if (item.is_available === false || item.show_on_microsite === false) return;
        const category = item.category || 'Menu';
        const subcategory = item.subcategory || '';
        const key = `${category}||${subcategory}`;
        if (!groups.has(key)) groups.set(key, { category, subcategory, items: [] });
        groups.get(key).items.push({
            id: item.id || `tenant-item-${index}`,
            title: item.name || item.title || 'Menu item',
            description: item.description || '',
            price: Number(item.price) || 0,
            image_url: item.image_url || tenant.logo,
            category,
            subcategory,
            hasCustomizations: (item.modifierGroups || []).length > 0,
            modifiers: (item.modifierGroups || []).map((g) => ({
                id: g.id,
                title: g.name,
                required: g.is_required === true,
                max: g.max_selected || 1,
                min: g.min_selected || 0,
                options: (g.options || []).map((o, i) => ({
                    id: `${g.id}-${i}`,
                    name: o.name,
                    price: Number(o.price) || 0,
                })),
            })),
            isSoldOut: false,
            isPopular: item.is_featured === true,
            rating: null,
        });
    });
    return {
        store: {
            name: tenant.name,
            subtitle: [tenant.cuisine, tenant.city].filter(Boolean).join(' • ') || 'Fresh food, made to order',
            rating: tenant.rating || 4.8,
            delivery_time: `Delivery in ${tenant.etaMinutes || '30–45 min'}`,
            delivery_fee: tenant.freeDeliveryOver
                ? `Free delivery over ${tenant.currencySymbol || 'KSh'} ${Number(tenant.freeDeliveryOver).toLocaleString()}`
                : `Delivery from ${tenant.currencySymbol || 'KSh'} ${Number(tenant.deliveryFee || 0).toLocaleString()}`,
            address: tenant.address || tenant.city || '',
            hero_image: tenant.cover,
            logo: tenant.logo,
        },
        categories: Array.from(groups.values()).map((g) => ({
            name: g.subcategory ? `${g.category} · ${g.subcategory}` : g.category,
            items: g.items,
        })),
    };
}

/**
 * Empty menu shell for a restaurant that has not published its menu yet.
 * Never fall back to another tenant's menu — a new restaurant starts empty.
 */
function emptyTenantMenu(tenant) {
    return {
        store: {
            name: tenant?.name || 'Restaurant',
            subtitle: [tenant?.cuisine, tenant?.city].filter(Boolean).join(' • ') || '',
            rating: tenant?.rating || null,
            delivery_time: `Delivery in ${tenant?.etaMinutes || '30–45 min'}`,
            delivery_fee: tenant?.freeDeliveryOver
                ? `Free delivery over ${tenant?.currencySymbol || 'KSh'} ${Number(tenant.freeDeliveryOver).toLocaleString()}`
                : '',
            address: tenant?.address || tenant?.city || '',
            hero_image: tenant?.cover,
            logo: tenant?.logo,
        },
        categories: [],
    };
}


// ─── Order Rating Widget (Integrated Feedback Infrastructure) ───
export function OrderRatingWidget({ order, tenant, onRated }) {
    const [rating, setRating] = useState(5);
    const [hoverRating, setHoverRating] = useState(0);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const orderTicket = order?.ticketNumber || order?.ticket_number || 'ONLINE';
    const [submitted, setSubmitted] = useState(() => {
        return typeof window !== 'undefined' && localStorage.getItem(`manipos_rated_${tenant?.slug || 'online'}_${orderTicket}`) === 'true';
    });

    const RATING_EMOJIS = [
        { value: 1, label: "😡", desc: "Terrible" },
        { value: 2, label: "😕", desc: "Fair" },
        { value: 3, label: "😐", desc: "Good" },
        { value: 4, label: "🙂", desc: "Great" },
        { value: 5, label: "🤩", desc: "Excellent!" }
    ];

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setSubmitting(true);
        const ticket = orderTicket;
        const dining = order?.diningOption || order?.dining_option || 'Delivery';
        const customer = order?.customerName || order?.customer_name || 'Online Guest';
        const contact = order?.customerPhone || order?.customer_contact || 'N/A';
        const brand = tenant?.name || 'Restaurant';

        try {
            // 1. Live Supabase pos_feedback (core POS & CRM feedback table)
            const posPayload = {
                tenant_id: tenant?.slug || 'online',
                rating: rating || 5,
                category: brand,
                comment: `[Method: ${dining}] [Ticket: #${ticket}] ${comment.trim() || 'Order completed via microsite'}`,
                customer_name: customer,
                customer_contact: contact
            };
            const { error: posErr } = await supabase.from('pos_feedback').insert([posPayload]);
            if (posErr) console.warn('pos_feedback insert warning:', posErr.message);

            // 2. Google Apps Script backup
            try {
                fetch("https://script.google.com/macros/s/AKfycbyjb9x3e6TRjmg_AW1ICsncDsGqQLENhNCAsF04ZB3OznE7iaC32ravMB1LHiACB1jp/exec", {
                    method: "POST",
                    mode: "no-cors",
                    body: JSON.stringify({
                        timestamp: new Date().toISOString(),
                        code: String(ticket),
                        serviceType: dining,
                        brand: brand,
                        customerName: customer,
                        orderId: String(ticket),
                        overallRating: rating,
                        comments: comment.trim()
                    })
                }).catch(() => {});
            } catch (_) {}

            if (typeof window !== 'undefined') {
                localStorage.setItem(`manipos_rated_${tenant?.slug || 'online'}_${ticket}`, 'true');
            }
            setSubmitted(true);
            if (onRated) onRated(rating);
        } catch (err) {
            console.error('Error submitting order rating:', err);
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-emerald-700 font-black text-xs uppercase tracking-wider">
                    <Check size={14} /> Thank you for rating!
                </div>
                <p className="text-[11px] text-emerald-800 mt-0.5 font-medium">Your feedback directly helps our chefs & team serve you better. 🍛</p>
            </div>
        );
    }

    const currentEmoji = RATING_EMOJIS.find(e => e.value === (hoverRating || rating));

    return (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-left space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="font-black text-xs text-gray-950 uppercase tracking-wider flex items-center gap-1.5">
                        <Star size={13} className="fill-amber-400 text-amber-400" /> Rate Your Order
                    </h4>
                    <p className="text-[11px] text-gray-500 font-medium">How was your food and ordering experience?</p>
                </div>
                <span className="text-2xl" title={currentEmoji?.desc}>
                    {currentEmoji?.label}
                </span>
            </div>

            {/* Interactive Stars */}
            <div className="flex items-center justify-center gap-2 py-1">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        className="p-1 transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                    >
                        <Star
                            size={28}
                            className={`transition-colors ${
                                star <= (hoverRating || rating)
                                    ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                                    : 'text-gray-300'
                            }`}
                        />
                    </button>
                ))}
            </div>

            <p className="text-center text-[10px] font-black text-amber-900 uppercase tracking-widest">
                {currentEmoji?.desc}
            </p>

            {/* Optional Comment Input */}
            <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What did you love or how can we improve? (Optional)"
                className="w-full text-xs bg-white border border-amber-200 rounded-xl px-3 py-2.5 outline-none focus:border-amber-400 text-gray-800 placeholder:text-gray-400 shadow-xs"
            />

            <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
            >
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span>{submitting ? 'Submitting...' : 'Submit Rating'}</span>
            </button>
        </div>
    );
}

// Interactive Order Success & M-Pesa Payment Verification Modal Component
const MicrositeOrderSuccessModal = ({ orderSuccess, setOrderSuccess, whatsappSettings, tenant }) => {
    const [copiedPaybill, setCopiedPaybill] = useState(false);
    const [copiedAccount, setCopiedAccount] = useState(false);
    const [inputMpesaCode, setInputMpesaCode] = useState(orderSuccess?.mpesaCode || '');
    const [isUpdating, setIsUpdating] = useState(false);

    const paybillNo = whatsappSettings?.paybill_number || tenant?.paybill || '';
    const accountNo = whatsappSettings?.account_number || tenant?.account || '';
    const whatsappPhone = (tenant?.whatsapp || '').replace(/[^0-9]/g, '');
    const currency = tenant?.currencySymbol || 'KES';

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
                () => {
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

                        {/* Daraja STK push status */}
                        {orderSuccess.stkPending && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-left flex items-start gap-2.5">
                                <Loader2 size={16} className="text-emerald-600 animate-spin shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-black text-emerald-800">M-Pesa prompt sent</p>
                                    <p className="text-[11px] text-emerald-700 mt-0.5">
                                        Check your phone for a prompt from {paybillNo || 'our paybill'} and enter your M-Pesa PIN. This screen updates automatically once the payment clears.
                                    </p>
                                </div>
                            </div>
                        )}
                        {orderSuccess.stkError && !orderSuccess.stkPending && (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-left">
                                <p className="text-[11px] text-amber-700">
                                    We could not send an automatic M-Pesa prompt ({orderSuccess.stkError}). Please pay using the paybill details below.
                                </p>
                            </div>
                        )}

                        {/* Bill Total Card */}
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex justify-between items-center text-left">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Total Amount Due</span>
                                <span className="text-2xl font-black text-black font-mono">{currency} {orderSuccess.total.toLocaleString()}</span>
                            </div>
                            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-700 border border-amber-500/20 text-[10px] font-black uppercase rounded-lg">
                                Pending M-Pesa
                            </span>
                        </div>

                        {/* Paybill & Account Number Card */}
                        <div className="bg-amber-50/70 border-2 border-amber-300/50 rounded-2xl p-4 text-left space-y-3">
                            {paybillNo && accountNo ? (
                                <>
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
                                            <span className="text-xl font-black text-black font-mono">{accountNo}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(accountNo);
                                                setCopiedAccount(true);
                                                setTimeout(() => setCopiedAccount(false), 2000);
                                            }}
                                            className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-xs"
                                        >
                                            {copiedAccount ? '✓ Copied' : 'Copy Account'}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="bg-white border border-amber-200 rounded-xl p-3 shadow-xs">
                                    <span className="text-[9px] font-black uppercase text-gray-400 block tracking-widest">Payment</span>
                                    <p className="text-xs font-bold text-gray-800 mt-1">
                                        Pay on delivery or at the counter. Tap “Mark Paid” once you have paid, and our team will confirm your order.
                                    </p>
                                </div>
                            )}

                            {/* Optional Confirmation Code Field */}
                            <div className="pt-1">
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-wider block mb-1">Payment Confirmation Code (Optional)</label>
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
                                <span className="font-mono font-black text-emerald-600 text-sm">{currency} {orderSuccess.total.toLocaleString()}</span>
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
                                `Hello ${tenant?.name || 'there'}! I have sent ${currency} ${orderSuccess.total.toLocaleString()} for Order #${orderSuccess.ticketNumber}${orderSuccess.mpesaCode ? ` (Payment Code: ${orderSuccess.mpesaCode})` : ''}.${orderSuccess.deliveryAddress ? `\n\nDelivery Address: ${orderSuccess.deliveryAddress}` : ''}\n\nPlease verify and accept my order!`
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

                        {/* Integrated Order Rating & Experience Feedback */}
                        <OrderRatingWidget order={orderSuccess} tenant={tenant} />

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

export function UberEatsMicrosite({ tenant, onStaffLogin, onAdminLogin, onBack }) {
    const tenantSlug = tenant?.slug || 'online';
    const guestKey = `manipos_guest_${tenantSlug}`;
    const cartKey = `manipos_cart_${tenantSlug}`;
    // A restaurant only ever sees its own menu. New restaurants start empty
    // until they publish items — never inherit another tenant's menu.
    const tenantMenu = useMemo(() => normaliseTenantMenu(tenant), [tenant]);
    const sourceMenu = tenantMenu || emptyTenantMenu(tenant);

    // Menu & Store State
    const store = sourceMenu.store;
    const allCategories = sourceMenu.categories || [];

    // UI state
    const [searchQuery, setSearchQuery] = useState('');
    const [diningMode, setDiningMode] = useState('delivery'); // 'delivery' | 'pickup' | 'dine_in'
    const [tableNumber, setTableNumber] = useState('');
    const [activeCategory, setActiveCategory] = useState(sourceMenu.categories[0]?.name || 'Most Popular');

    useEffect(() => {
        if (!sourceMenu.categories.some((cat) => cat.name === activeCategory)) {
            setActiveCategory(sourceMenu.categories[0]?.name || '');
        }
    }, [activeCategory, sourceMenu]);
    const [selectedItem, setSelectedItem] = useState(null); // for item modal
    const [cartOpen, setCartOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);
    const [storeInfoOpen, setStoreInfoOpen] = useState(false);
    const categoryPillsRef = useRef(null);
    const isClickingCategoryRef = useRef(false);
    const clickTimeoutRef = useRef(null);

    // Customer Account / Guest CRM States
    const [guestUser, setGuestUser] = useState(() => {
        try {
            const saved = localStorage.getItem(guestKey);
            return saved ? JSON.parse(saved) : null;
        } catch {
            return null;
        }
    });
    const [accountOpen, setAccountOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [ratingOrder, setRatingOrder] = useState(null);
    const [pastOrders, setPastOrders] = useState([]);
    const [loginInput, setLoginInput] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [regFirstName, setRegFirstName] = useState('');
    const [regLastName, setRegLastName] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regAddress, setRegAddress] = useState('');
    const [guestLoading, setGuestLoading] = useState(false);

    // Cart state
    const [cart, setCart] = useState(() => {
        try {
            const saved = localStorage.getItem(cartKey);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    // Customer Checkout State
    const [customerName, setCustomerName] = useState(() => {
        try {
            const saved = localStorage.getItem(guestKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                return `${parsed.first_name || ''} ${parsed.last_name || ''}`.trim();
            }
        } catch {}
        return '';
    });
    const [customerPhone, setCustomerPhone] = useState(() => {
        try {
            const saved = localStorage.getItem(guestKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed.phone || '';
            }
        } catch {}
        return '';
    });
    const [deliveryAddress, setDeliveryAddress] = useState(() => {
        try {
            const saved = localStorage.getItem(guestKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                return parsed.delivery_address || '';
            }
        } catch {}
        return '';
    });
    const [orderNote, setOrderNote] = useState('');
    const [promoCode, setPromoCode] = useState('');
    const [appliedDiscount, setAppliedDiscount] = useState(null);
    const [promoError, setPromoError] = useState('');
    const [promoLoading, setPromoLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(null);
    const [whatsappSettings, setWhatsappSettings] = useState({
        paybill_number: tenant?.paybill || '',
        account_number: tenant?.account || '',
        base_delivery_fee: tenant?.deliveryFee ?? 100,
        base_delivery_distance: 2,
        delivery_fee_per_km: 50,
        packaging_fee: 0,
        store_lat: tenant?.lat ?? -1.2943,
        store_lng: tenant?.lng ?? 36.7953
    });

    // ── Delivery distance & fee engine ────────────────────────────────────────
    // The microsite must know how far the customer is from the store before it
    // can decide whether delivery is free. Addresses outside the free radius
    // are charged; an address we cannot locate is never treated as free.
    const [calculatedDistance, setCalculatedDistance] = useState(null);
    const [calculatedDeliveryFee, setCalculatedDeliveryFee] = useState(0);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [geocodingError, setGeocodingError] = useState('');

    const GOOGLE_PLACES_API_KEY = 'AIzaSyDhwk7tNH19ACOUo0WUIJsVGSUtVLji_yM';

    // Load the Google Maps JS SDK once so the geocoder is available.
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

    const geocodeAddress = async (query) => {
        if (!query || !query.trim()) return null;
        const cleanQuery = query.trim();

        if (window.google && window.google.maps && window.google.maps.Geocoder) {
            try {
                const geocoder = new window.google.maps.Geocoder();
                const reqParam = cleanQuery.toLowerCase().includes('kenya')
                    ? { address: cleanQuery }
                    : { address: `${cleanQuery}, Nairobi, Kenya` };
                const result = await new Promise((resolve) => {
                    geocoder.geocode(reqParam, (results, status) => {
                        if (status === 'OK' && results && results[0]) {
                            resolve({
                                lat: results[0].geometry.location.lat(),
                                lng: results[0].geometry.location.lng()
                            });
                        } else {
                            resolve(null);
                        }
                    });
                });
                if (result) return result;
            } catch (e) {
                console.warn('Google geocoder error:', e);
            }
        }

        // Fallback: Nominatim (OpenStreetMap), with a short timeout.
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery + ', Nairobi, Kenya')}&format=json&limit=1`,
                { signal: controller.signal, headers: { 'User-Agent': 'ManiPOS-Microsite/1.0' } }
            );
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (data && data.length > 0) {
                    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
                }
            }
        } catch (e) {}

        return null;
    };

    // Recompute the distance and delivery fee whenever the address changes.
    useEffect(() => {
        if (diningMode !== 'delivery' || !deliveryAddress.trim() || deliveryAddress.trim().length < 2) {
            setCalculatedDistance(null);
            setCalculatedDeliveryFee(0);
            setGeocodingError('');
            return;
        }

        setIsGeocoding(true);
        setGeocodingError('');

        const timer = setTimeout(async () => {
            try {
                const geo = await geocodeAddress(deliveryAddress);
                if (geo) {
                    const R = 6371;
                    const lat1 = whatsappSettings.store_lat || -1.2921;
                    const lng1 = whatsappSettings.store_lng || 36.8219;
                    const dLat = (geo.lat - lat1) * Math.PI / 180;
                    const dLng = (geo.lng - lng1) * Math.PI / 180;
                    const a = Math.pow(Math.sin(dLat / 2), 2) +
                        Math.cos(lat1 * Math.PI / 180) * Math.cos(geo.lat * Math.PI / 180) *
                        Math.pow(Math.sin(dLng / 2), 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    // 1.25x road factor: straight-line distance understates driving distance.
                    const distance = Math.round((R * c * 1.25) * 10) / 10;

                    const baseFee = whatsappSettings.base_delivery_fee || 0;
                    const freeRadius = whatsappSettings.base_delivery_distance || 2;
                    const perKm = whatsappSettings.delivery_fee_per_km || 50;
                    let fee = baseFee;
                    if (distance > freeRadius) {
                        fee += (distance - freeRadius) * perKm;
                    }
                    setCalculatedDistance(distance);
                    setCalculatedDeliveryFee(Math.max(0, Math.round(fee)));
                    setGeocodingError('');
                } else {
                    // Unknown location: charge the base fee rather than giving it away free.
                    setCalculatedDistance(null);
                    setCalculatedDeliveryFee(whatsappSettings.base_delivery_fee || 0);
                    setGeocodingError('We could not locate this address automatically. The delivery fee may need confirmation.');
                }
            } catch (e) {
                console.error('Delivery distance calculation failed:', e);
                setCalculatedDistance(null);
                setCalculatedDeliveryFee(whatsappSettings.base_delivery_fee || 0);
                setGeocodingError('We could not calculate the delivery distance. Please confirm the fee.');
            } finally {
                setIsGeocoding(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [deliveryAddress, diningMode, whatsappSettings.store_lat, whatsappSettings.store_lng, whatsappSettings.base_delivery_fee, whatsappSettings.base_delivery_distance, whatsappSettings.delivery_fee_per_km]);

    useEffect(() => {
        setWhatsappSettings(prev => ({
            ...prev,
            paybill_number: tenant?.paybill || prev.paybill_number,
            account_number: tenant?.account || prev.account_number,
        }));
    }, [tenant?.paybill, tenant?.account]);

    useEffect(() => {
        let cancelled = false;
        const fetchWaSettings = async () => {
            try {
                let query = supabase
                    .from('pos_channels')
                    .select('*')
                    .eq('name', 'whatsapp');
                if (tenant?.id) query = query.eq('restaurant_id', tenant.id);
                const { data, error } = await query.limit(1);
                const channel = !error ? data?.[0] : null;
                if (channel && !cancelled) {
                    setWhatsappSettings({
                        paybill_number: channel.paybill_number || tenant?.paybill || '',
                        account_number: channel.account_number || tenant?.account || '',
                        base_delivery_fee: channel.base_delivery_fee ?? tenant?.deliveryFee ?? 100,
                        base_delivery_distance: channel.base_delivery_distance ?? 2,
                        delivery_fee_per_km: channel.delivery_fee_per_km ?? 50,
                        packaging_fee: channel.packaging_fee ?? 0,
                        store_lat: channel.store_lat ?? tenant?.lat ?? -1.2943,
                        store_lng: channel.store_lng ?? tenant?.lng ?? 36.7953
                    });
                }
            } catch (err) {
                console.warn("Error fetching delivery settings:", err);
            }
        };
        fetchWaSettings();
        return () => { cancelled = true; };
    }, [tenant?.id, tenant?.paybill, tenant?.account, tenant?.deliveryFee]);

    // Modal Customization State (when an item modal is open)
    const [modalQuantity, setModalQuantity] = useState(1);
    const [modalSelections, setModalSelections] = useState({}); // { [modId]: selectedOptionId or array of optionIds }
    const [modalSpecialInstructions, setModalSpecialInstructions] = useState('');
    const [validationError, setValidationError] = useState('');

    // Persist cart
    useEffect(() => {
        try {
            localStorage.setItem(cartKey, JSON.stringify(cart));
        } catch {}
    }, [cart]);

    // Handle URL discount parameter (e.g. ?discount=JANE10)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const codeParam = params.get('discount') || params.get('code') || params.get('promo');
        if (codeParam) {
            setPromoCode(codeParam.trim().toUpperCase());
            applyPromo(codeParam.trim().toUpperCase());
        }
    }, []);

    // Fetch guest order history
    const fetchPastOrders = async (guestId) => {
        if (!guestId) return;
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
            if (!error && data) {
                setPastOrders(data);
            }
        } catch (e) {
            console.warn('Past orders load error:', e);
        }
    };

    // Auto-fill customer info if logged in
    useEffect(() => {
        if (guestUser) {
            setCustomerName(`${guestUser.first_name || ''} ${guestUser.last_name || ''}`.trim());
            if (guestUser.phone) setCustomerPhone(guestUser.phone);
            if (guestUser.delivery_address) setDeliveryAddress(guestUser.delivery_address);
            fetchPastOrders(guestUser.id);
        }
    }, [guestUser]);

    // Compute saved delivery addresses from guest profile + past orders
    const savedAddresses = useMemo(() => {
        const addresses = new Set();
        if (guestUser && guestUser.delivery_address) {
            addresses.add(guestUser.delivery_address.trim());
        }
        if (pastOrders && pastOrders.length > 0) {
            pastOrders.forEach(order => {
                if (order.dining_option === 'Delivery' && order.notes) {
                    const match = order.notes.match(/📍 Delivery:\s*([^|\n]+)/);
                    if (match && match[1]) addresses.add(match[1].trim());
                }
            });
        }
        return Array.from(addresses).filter(Boolean);
    }, [pastOrders, guestUser]);

    // Handle Guest / Customer Login or Registration
    const handleGuestLoginOrRegister = async (e) => {
        e.preventDefault();
        if (!loginInput.trim()) return;
        setGuestLoading(true);
        try {
            const input = loginInput.trim().toLowerCase();
            const isEmail = input.includes('@');
            
            let query = supabase.from('guests').select('*');
            if (isEmail) {
                query = query.eq('email', input);
            } else {
                query = query.eq('phone', input);
            }
            
            const { data: existingGuests, error: fetchErr } = await query;
            if (fetchErr) throw fetchErr;
            
            if (existingGuests && existingGuests.length > 0) {
                const guest = existingGuests[0];
                setGuestUser(guest);
                setCustomerName(`${guest.first_name || ''} ${guest.last_name || ''}`.trim());
                if (guest.phone) setCustomerPhone(guest.phone);
                if (guest.delivery_address) setDeliveryAddress(guest.delivery_address);
                localStorage.setItem(guestKey, JSON.stringify(guest));
                fetchPastOrders(guest.id);
                setAccountOpen(false);
                setLoginInput('');
                setIsRegistering(false);
                alert(`Welcome back, ${guest.first_name}!`);
            } else {
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
                    if (!regFirstName.trim() || !regPhone.trim()) {
                        alert("First Name and Phone Number are required.");
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
                    if (newGuest.phone) setCustomerPhone(newGuest.phone);
                    if (newGuest.delivery_address) setDeliveryAddress(newGuest.delivery_address);
                    localStorage.setItem(guestKey, JSON.stringify(newGuest));
                    fetchPastOrders(newGuest.id);
                    setAccountOpen(false);
                    setLoginInput('');
                    setIsRegistering(false);
                    alert(`Account created successfully! Welcome, ${newGuest.first_name}!`);
                }
            }
        } catch (err) {
            alert('Operation failed: ' + err.message);
        } finally {
            setGuestLoading(false);
        }
    };

    const handleGuestLogout = () => {
        localStorage.removeItem(guestKey);
        setGuestUser(null);
        setCustomerName('');
        setCustomerPhone('');
        setDeliveryAddress('');
        setPastOrders([]);
        alert('You have logged out.');
    };

    // Filtered Menu
    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return allCategories;
        const query = searchQuery.toLowerCase().trim();
        return allCategories
            .map(cat => ({
                ...cat,
                items: cat.items.filter(it => 
                    it.title.toLowerCase().includes(query) || 
                    (it.description && it.description.toLowerCase().includes(query))
                )
            }))
            .filter(cat => cat.items.length > 0);
    }, [allCategories, searchQuery]);

    // Listen to scroll for sticky nav shadow and category scrollspy
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 220);

            if (isClickingCategoryRef.current) return;

            // If user scrolled near the top of the page, default to first category
            if (window.scrollY < 120 && filteredCategories.length > 0) {
                setActiveCategory(prev => (prev !== filteredCategories[0].name ? filteredCategories[0].name : prev));
                return;
            }

            let currentCat = null;
            for (let i = 0; i < filteredCategories.length; i++) {
                const cat = filteredCategories[i];
                const sectionEl = document.getElementById(`section-${cat.name.replace(/[^a-zA-Z0-9]/g, '-')}`);
                if (sectionEl) {
                    const rect = sectionEl.getBoundingClientRect();
                    // When the top of section reaches below the sticky headers (~160px from top of viewport)
                    if (rect.top <= 160) {
                        currentCat = cat.name;
                    }
                }
            }

            if (currentCat) {
                setActiveCategory(prev => (prev !== currentCat ? currentCat : prev));
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [filteredCategories]);

    // Auto-scroll the horizontal category pill carousel to keep active category centered as user scrolls
    useEffect(() => {
        if (!activeCategory || !categoryPillsRef.current) return;
        const pillId = `pill-${activeCategory.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const activePillEl = document.getElementById(pillId);
        if (activePillEl && categoryPillsRef.current) {
            const container = categoryPillsRef.current;
            const pillLeft = activePillEl.offsetLeft;
            const pillWidth = activePillEl.offsetWidth;
            const containerWidth = container.offsetWidth;
            const targetLeft = pillLeft - (containerWidth / 2) + (pillWidth / 2);
            container.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' });
        }
    }, [activeCategory]);

    // Apply Promo Code
    const applyPromo = async (codeToVerify) => {
        const code = (codeToVerify || promoCode).trim().toUpperCase();
        if (!code) return;
        setPromoLoading(true);
        setPromoError('');

        try {
            // Check Supabase influencer codes
            const { data, error } = await supabase
                .from('influencer_codes')
                .select('id, influencer_id, commission_rate, code, discount_type, discount_value, is_active, min_order_amount')
                .eq('code', code)
                .eq('is_active', true)
                .maybeSingle();

            if (error || !data) {
                // Fallback test code
                if (code === 'WELCOME10' || code === 'JOLLOF10') {
                    setAppliedDiscount({ code, type: 'percentage', value: 10 });
                    setPromoError('');
                } else {
                    setPromoError('Invalid or expired promo code');
                    setAppliedDiscount(null);
                }
            } else {
                setAppliedDiscount({
                    id: data.id,
                    influencer_id: data.influencer_id,
                    commission_rate: data.commission_rate || 5,
                    code: data.code,
                    type: data.discount_type,
                    value: Number(data.discount_value) || 10
                });
                setPromoError('');
            }
        } catch (e) {
            setPromoError('Could not verify code');
        } finally {
            setPromoLoading(false);
        }
    };

    // Calculate Cart Totals
    const subtotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.totalPrice * item.quantity), 0);
    }, [cart]);

    const discountAmount = useMemo(() => {
        if (!appliedDiscount) return 0;
        if (appliedDiscount.type === 'percentage') {
            return Math.round((subtotal * appliedDiscount.value) / 100);
        }
        return Math.min(appliedDiscount.value, subtotal);
    }, [appliedDiscount, subtotal]);

    // Delivery is free only when the address has been located and is inside the
    // free radius. An unlocated address is never free — it is charged instead.
    const freeDeliveryRadius = whatsappSettings.base_delivery_distance || 2;
    const isFreeDelivery = diningMode === 'delivery'
        && calculatedDistance !== null
        && calculatedDistance <= freeDeliveryRadius;
    const deliveryFee = (diningMode === 'pickup' || diningMode === 'dine_in')
        ? 0
        : (isFreeDelivery ? 0 : calculatedDeliveryFee);
    const finalTotal = Math.max(0, subtotal - discountAmount + deliveryFee);
    const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Open Item Customization Modal
    const handleItemClick = (item) => {
        setSelectedItem(item);
        setModalQuantity(1);
        setModalSpecialInstructions('');
        setValidationError('');

        // Initialize default selections
        const initial = {};
        if (item.modifiers && item.modifiers.length > 0) {
            item.modifiers.forEach(mod => {
                if (mod.required && mod.options && mod.options.length > 0) {
                    // Default select the first option for required single-select
                    initial[mod.id] = mod.options[0].id;
                } else if (!mod.required) {
                    initial[mod.id] = [];
                }
            });
        }
        setModalSelections(initial);
    };

    // Calculate dynamic price inside modal
    const modalItemPrice = useMemo(() => {
        if (!selectedItem) return 0;
        let base = selectedItem.price;
        if (selectedItem.modifiers) {
            selectedItem.modifiers.forEach(mod => {
                const sel = modalSelections[mod.id];
                if (Array.isArray(sel)) {
                    sel.forEach(optId => {
                        const opt = mod.options.find(o => o.id === optId);
                        if (opt) base += opt.price;
                    });
                } else if (sel) {
                    const opt = mod.options.find(o => o.id === sel);
                    if (opt) base += opt.price;
                }
            });
        }
        return base;
    }, [selectedItem, modalSelections]);

    // Validate and Add to Cart
    const handleAddToCartFromModal = () => {
        if (!selectedItem) return;

        // Check required modifiers
        if (selectedItem.modifiers) {
            for (const mod of selectedItem.modifiers) {
                if (mod.required) {
                    const sel = modalSelections[mod.id];
                    if (!sel || (Array.isArray(sel) && sel.length === 0)) {
                        setValidationError(`Please make a selection for "${mod.title}"`);
                        return;
                    }
                }
            }
        }

        // Build list of chosen modifier texts
        const chosenModifierLabels = [];
        if (selectedItem.modifiers) {
            selectedItem.modifiers.forEach(mod => {
                const sel = modalSelections[mod.id];
                if (Array.isArray(sel)) {
                    sel.forEach(optId => {
                        const opt = mod.options.find(o => o.id === optId);
                        if (opt) {
                            chosenModifierLabels.push(`${opt.name}${opt.price > 0 ? ` (+KES ${opt.price.toLocaleString()})` : ''}`);
                        }
                    });
                } else if (sel) {
                    const opt = mod.options.find(o => o.id === sel);
                    if (opt) {
                        chosenModifierLabels.push(`${opt.name}${opt.price > 0 ? ` (+KES ${opt.price.toLocaleString()})` : ''}`);
                    }
                }
            });
        }

        // Create unique cart line key based on item + modifiers + instructions
        const lineKey = `${selectedItem.id}-${JSON.stringify(modalSelections)}-${modalSpecialInstructions.trim()}`;

        const cartItem = {
            id: selectedItem.id,
            lineKey,
            title: selectedItem.title,
            basePrice: selectedItem.price,
            totalPrice: modalItemPrice,
            image_url: selectedItem.image_url,
            quantity: modalQuantity,
            modifiers: chosenModifierLabels,
            specialInstructions: modalSpecialInstructions.trim()
        };

        setCart(prev => {
            const existingIndex = prev.findIndex(i => i.lineKey === lineKey);
            if (existingIndex > -1) {
                const updated = [...prev];
                updated[existingIndex].quantity += modalQuantity;
                return updated;
            }
            return [...prev, cartItem];
        });

        // Close modal
        setSelectedItem(null);
    };

    // Modify Cart Line Quantity
    const updateCartQuantity = (lineKey, delta) => {
        setCart(prev => {
            return prev.map(item => {
                if (item.lineKey === lineKey) {
                    const newQty = item.quantity + delta;
                    return newQty > 0 ? { ...item, quantity: newQty } : null;
                }
                return item;
            }).filter(Boolean);
        });
    };

    // Scroll to category
    const scrollToCategory = (catName) => {
        isClickingCategoryRef.current = true;
        if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = setTimeout(() => {
            isClickingCategoryRef.current = false;
        }, 800);

        setActiveCategory(catName);
        const el = document.getElementById(`section-${catName.replace(/[^a-zA-Z0-9]/g, '-')}`);
        if (el) {
            const yOffset = -135;
            const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    };

    // Submit Order to POS with M-Pesa Payment Flow & optional WhatsApp dispatch
    const handleSubmitOrder = async (isWhatsApp = false) => {
        if (!customerName.trim() || !customerPhone.trim()) {
            alert('Please enter your name and phone number before placing the order.');
            return;
        }

        if (diningMode === 'delivery' && !deliveryAddress.trim()) {
            alert('Please enter your delivery address.');
            return;
        }

        setIsSubmitting(true);
        try {
            // Build notes
            const promoNoteText = appliedDiscount ? `\n[Promo Applied: ${appliedDiscount.code} (-KES ${discountAmount.toLocaleString()})]` : '';
            let finalNotes = '';
            if (diningMode === 'delivery') {
                finalNotes = orderNote.trim() ? `Delivery Address: ${deliveryAddress.trim()}\nNotes: ${orderNote.trim()}${promoNoteText}` : `Delivery Address: ${deliveryAddress.trim()}${promoNoteText}`;
            } else if (diningMode === 'dine_in') {
                const tableInfo = tableNumber.trim() ? `Table: ${tableNumber.trim()}` : 'Dine In';
                finalNotes = orderNote.trim() ? `${tableInfo}\nNotes: ${orderNote.trim()}${promoNoteText}` : `${tableInfo}${promoNoteText}`;
            } else {
                finalNotes = orderNote.trim() ? `${orderNote.trim()}${promoNoteText}` : promoNoteText.trim();
            }

            const diningOptionValue = diningMode === 'delivery' ? 'Delivery' : (diningMode === 'dine_in' ? 'Dine In' : 'Takeaway');

            const orderPayload = {
                customer_name: customerName.trim() || (guestUser ? `${guestUser.first_name || ''} ${guestUser.last_name || ''}`.trim() : 'Online Guest'),
                dining_option: diningOptionValue,
                payment_method: 'Paid to App',
                payment_status: 'Pending',
                status: 'Pending',
                total_amount: finalTotal,
                discount: discountAmount,
                cashier_name: 'Self-Service Microsite',
                brand: (tenant?.name || 'ManiPOS').toUpperCase(),
                ...(tenant?.id ? { restaurant_id: tenant.id } : {}),
                order_channel: 'Online',
                notes: finalNotes,
                guest_id: guestUser ? guestUser.id : null
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
                item_name: item.title,
                quantity: item.quantity,
                price: item.totalPrice,
                instructions: [
                    item.modifiers && item.modifiers.length > 0 ? item.modifiers.join(', ') : '',
                    item.specialInstructions ? `Note: ${item.specialInstructions}` : ''
                ].filter(Boolean).join(' | ') || null,
                status: 'Pending'
            }));

            if (diningMode === 'delivery' && deliveryFee > 0) {
                itemPayloads.push({
                    order_id: orderData.id,
                    item_name: 'Delivery Fee',
                    quantity: 1,
                    price: deliveryFee,
                    instructions: 'Delivery Dispatch',
                    status: 'Pending'
                });
            }

            const { error: itemsError } = await supabase
                .from('pos_order_items')
                .insert(itemPayloads);

            if (itemsError) throw itemsError;

            // 3. Attribution for influencer code if applied
            if (appliedDiscount?.influencer_id && orderData?.id) {
                const commissionRate = appliedDiscount.commission_rate || 5;
                const commissionAmt = Math.round((subtotal * commissionRate) / 100);
                supabase
                    .from('pos_orders')
                    .update({
                        influencer_code_id: appliedDiscount.id,
                        influencer_id: appliedDiscount.influencer_id,
                        influencer_commission: commissionAmt
                    })
                    .eq('id', orderData.id)
                    .then(() => {
                        supabase.rpc('record_influencer_attribution', {
                            p_order_id: orderData.id,
                            p_influencer_id: appliedDiscount.influencer_id,
                            p_code_id: appliedDiscount.id,
                            p_commission_amt: commissionAmt
                        }).catch(e => console.warn('Influencer attribution note:', e));
                    })
                    .catch(e => console.warn('Influencer order update note:', e));
            }

            // 4. Update guest CRM in background
            if (guestUser) {
                (async () => {
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

                        const updatedGuest = {
                            ...guestUser,
                            visit_count: newVisits,
                            lifetime_spend: newSpend,
                            delivery_address: deliveryAddress.trim() || guestUser.delivery_address
                        };
                        localStorage.setItem(guestKey, JSON.stringify(updatedGuest));
                        setGuestUser(updatedGuest);
                    } catch (e) {
                        console.warn('CRM update note:', e);
                    }
                })();
            }

            // 5. Open WhatsApp if requested
            if (isWhatsApp) {
                const itemsListText = cart.map(i => {
                    let desc = `• ${i.quantity}x ${i.title} (KES ${(i.totalPrice * i.quantity).toLocaleString()})`;
                    if (i.modifiers && i.modifiers.length > 0) desc += `\n   ↳ ${i.modifiers.join(', ')}`;
                    if (i.specialInstructions) desc += `\n   ↳ Note: "${i.specialInstructions}"`;
                    return desc;
                }).join('\n');

                let message = `🍲 *NEW ORDER — ${(tenant?.name || 'MANIPOS').toUpperCase()}*\n`;
                message += `*Order Ticket:* #${orderData.ticket_number}\n`;
                message += `─────────────────────────\n`;
                message += `👤 *Customer:* ${customerName.trim()}\n`;
                message += `📞 *Phone:* ${customerPhone.trim()}\n`;
                message += `🍽️ *Order Type:* ${diningMode === 'delivery' ? 'Delivery' : (diningMode === 'dine_in' ? 'Dine In' : 'Pickup')}\n`;
                if (diningMode === 'dine_in' && tableNumber.trim()) {
                    message += `📍 *Table Number:* ${tableNumber.trim()}\n`;
                }
                if (diningMode === 'delivery') {
                    message += `📍 *Delivery Address:* ${deliveryAddress.trim() || 'Not specified'}\n`;
                }
                if (orderNote.trim()) {
                    message += `📝 *Notes:* ${orderNote.trim()}\n`;
                }
                message += `─────────────────────────\n`;
                message += `*ORDER ITEMS:*\n${itemsListText}\n`;
                message += `─────────────────────────\n`;
                message += `💵 *Subtotal:* KES ${subtotal.toLocaleString()}\n`;
                if (appliedDiscount) {
                    message += `🏷️ *Promo (${appliedDiscount.code}):* -KES ${discountAmount.toLocaleString()}\n`;
                }
                message += `🛵 *Delivery:* ${deliveryFee === 0
                    ? (diningMode === 'delivery' ? `FREE (${freeDeliveryRadius}km)` : 'FREE')
                    : `KES ${deliveryFee.toLocaleString()}`}\n`;
                message += `💰 *TOTAL PAYABLE:* KES ${finalTotal.toLocaleString()}\n`;
                message += `─────────────────────────\n`;
                message += `_Sent via ${tenant?.name || 'ManiPOS'} Digital Store_`;

                const whatsappNumber = (tenant?.whatsapp || '').replace(/[^0-9]/g, '');
                if (whatsappNumber) {
                    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank');
                }
            }

            // 6. Send the M-Pesa STK push so the customer gets a payment prompt
            //    on their phone. If it cannot be started we fall back to the
            //    manual paybill instructions shown in the modal.
            let stkPending = false;
            let stkError = '';
            if (!isWhatsApp && import.meta.env.VITE_MPESA_ENABLED === 'true') {
                try {
                    const stk = await initiateStkPush({
                        orderId: orderData.id,
                        phone: customerPhone.trim(),
                        ticketNumber: orderData.ticket_number,
                    });
                    stkPending = Boolean(stk?.ok);
                } catch (e) {
                    console.warn('M-Pesa STK push could not be started:', e);
                    stkError = e.message || 'Could not start the M-Pesa prompt.';
                }
            }

            // 7. Open the interactive M-Pesa Payment Verification Modal!
            setOrderSuccess({
                orderId: orderData.id,
                ticketNumber: orderData.ticket_number,
                total: finalTotal,
                brand: (tenant?.name || 'ManiPOS').toUpperCase(),
                items: cart.map(i => `${i.quantity}x ${i.title}`).join('\n'),
                diningOption: diningOptionValue,
                deliveryAddress: deliveryAddress,
                notes: finalNotes,
                customerName: customerName.trim() || (guestUser ? `${guestUser.first_name || ''} ${guestUser.last_name || ''}`.trim() : 'Online Guest'),
                customerPhone: customerPhone.trim() || (guestUser?.phone || ''),
                stage: stkPending ? 'stk_pending' : 'payment_instructions',
                stkPending,
                stkError,
                mpesaCode: ''
            });

            setCart([]);
            setCartOpen(false);

        } catch (err) {
            console.error('Order submission error:', err);
            alert('Failed to place order: ' + (err.message || 'Please check your connection and try again.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f6f6f6] text-[#000000] font-sans antialiased selection:bg-black selection:text-white pb-28">

            {/* ========================================================= */}
            {/* 1. TOP HEADER (UBER EATS NAVIGATION) */}
            {/* ========================================================= */}
            <header className="sticky top-0 z-40 bg-white border-b border-[#e2e2e2] transition-shadow duration-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
                    
                    {/* Left: Brand / Logo */}
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                            <img 
                                src={store.logo || '/manipos_logo.png'}
                                alt={store.name}
                                className="w-9 h-9 object-contain rounded-xl shadow-sm bg-white"
                                onError={(e) => { e.target.onerror = null; e.target.src = '/manipos_logo.png'; }}
                            />
                            <span className="font-black text-xl tracking-tight hidden sm:inline text-black">
                                {store.name}
                            </span>
                        </div>
                    </div>

                    {/* Middle: Deliver To Pill (Desktop) */}
                    <div className="hidden md:flex items-center gap-2 text-xs text-[#545454] bg-[#f3f3f3] hover:bg-[#eaeaea] px-4 py-2 rounded-full cursor-pointer transition-colors"
                         onClick={() => setStoreInfoOpen(true)}>
                        <MapPin size={14} className="text-black" />
                        <span className="font-medium text-black">{store.address || 'Nairobi'}</span>
                        <span>•</span>
                        <span className="text-[#06C167] font-semibold">{store.delivery_fee}</span>
                    </div>

                    {/* Right: Search, Customer Login & Cart */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        {/* Search icon/input */}
                        <div className="relative hidden sm:block w-36 md:w-56">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#757575]" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search menu..."
                                className="w-full bg-[#f3f3f3] hover:bg-[#ebebeb] focus:bg-white border border-transparent focus:border-black rounded-full pl-9 pr-3 py-1.5 text-xs text-black placeholder-[#757575] outline-none transition-all"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#757575] hover:text-black">
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Customer Log In / Account Button */}
                        <button
                            type="button"
                            onClick={() => setAccountOpen(true)}
                            className="flex items-center gap-1.5 bg-[#f3f3f3] hover:bg-[#e8e8e8] text-black px-3.5 py-2 rounded-full font-bold text-xs transition-colors shrink-0"
                            title="Customer Account & Loyalty"
                        >
                            <User size={15} />
                            <span>{guestUser ? guestUser.first_name : 'Log In'}</span>
                        </button>

                        {/* UberEats Cart Button */}
                        <button
                            type="button"
                            onClick={() => setCartOpen(true)}
                            className="flex items-center gap-2 bg-black hover:bg-[#262626] text-white px-4 py-2 rounded-full font-bold text-xs shadow-md transition-transform active:scale-95 shrink-0"
                        >
                            <ShoppingBag size={15} />
                            <span className="hidden xs:inline">Cart</span>
                            {totalCartCount > 0 && (
                                <span className="bg-[#06C167] text-black font-black px-1.5 py-0.5 rounded-full text-[10px] min-w-[18px] text-center">
                                    {totalCartCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Search Bar */}
            <div className="sm:hidden px-4 py-2.5 bg-white border-b border-[#e2e2e2]">
                <div className="relative">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#757575]" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder={`Search ${store.name} menu...`}
                        className="w-full bg-[#f3f3f3] rounded-full pl-9 pr-8 py-2 text-xs text-black placeholder-[#757575] outline-none"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#757575]">
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* ========================================================= */}
            {/* 2. STORE HERO BANNER & METADATA */}
            {/* ========================================================= */}
            <div className="bg-white border-b border-[#e2e2e2]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                    
                    {/* Hero Image */}
                    <div className="relative w-full h-44 sm:h-64 md:h-72 rounded-2xl sm:rounded-3xl overflow-hidden bg-black shadow-inner">
                        <img
                            src={store.hero_image}
                            alt={store.name}
                            className="w-full h-full object-cover opacity-90 transition-transform duration-700 hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                        
                        {/* Overlay Logo Badge */}
                        <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 flex items-end gap-3">
                            <img
                                src={store.logo}
                                alt={store.name}
                                className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-white p-1 shadow-xl object-contain border border-white/20"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <div className="text-white drop-shadow-md">
                                <h1 className="text-xl sm:text-3xl font-black tracking-tight">{store.name}</h1>
                                <p className="text-xs sm:text-sm text-white/80 font-medium">{store.subtitle}</p>
                            </div>
                        </div>

                        {/* Top Right Action Pills */}
                        <div className="absolute top-4 right-4 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setStoreInfoOpen(true)}
                                className="bg-white/90 hover:bg-white text-black p-2 sm:px-3 sm:py-1.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1.5 backdrop-blur-md transition-all"
                            >
                                <Info size={14} />
                                <span className="hidden sm:inline">Store Info</span>
                            </button>
                        </div>
                    </div>

                    {/* Store Meta Row */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-[#545454]">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            {/* Rating */}
                            <div 
                                onClick={() => setRatingOrder({ 
                                    ticket_number: 'DIRECT', 
                                    dining_option: diningMode === 'delivery' ? 'Delivery' : (diningMode === 'pickup' ? 'Pickup' : 'Dine In'),
                                    customer_name: guestUser ? `${guestUser.first_name || ''} ${guestUser.last_name || ''}`.trim() : 'Guest',
                                    customer_contact: guestUser?.phone || 'N/A'
                                })}
                                title="Rate your experience"
                                className="flex items-center gap-1 font-bold text-black bg-[#f3f3f3] hover:bg-[#e8e8e8] transition-colors cursor-pointer px-2.5 py-1 rounded-full"
                            >
                                <Star size={14} className="fill-amber-400 text-amber-400" />
                                <span>{store.rating}</span>
                            </div>
                            <span>•</span>
                            {/* ETA */}
                            <div className="flex items-center gap-1 font-semibold text-black">
                                <Clock size={14} className="text-[#757575]" />
                                <span>{store.delivery_time || 'Delivery in 30–45 mins'}</span>
                            </div>
                            <span>•</span>
                            {/* Delivery Fee */}
                            <div className="font-semibold text-[#06C167]">
                                {store.delivery_fee}
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* ========================================================= */}
            {/* 3. STICKY CATEGORY NAV (UBEREATS HORIZONTAL PILLS) */}
            {/* ========================================================= */}
            <div className={`sticky top-16 z-30 bg-white border-b border-[#e2e2e2] transition-shadow duration-200 ${isScrolled ? 'shadow-md' : ''}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div 
                        ref={categoryPillsRef}
                        className="flex items-center gap-2 overflow-x-auto no-scrollbar py-3 scroll-smooth"
                    >
                        {filteredCategories.map(cat => {
                            const isActive = activeCategory === cat.name;
                            const pillId = `pill-${cat.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
                            return (
                                <button
                                    key={cat.name}
                                    id={pillId}
                                    onClick={() => scrollToCategory(cat.name)}
                                    className={`shrink-0 px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all duration-150 ${
                                        isActive
                                            ? 'bg-black text-white shadow-sm'
                                            : 'bg-[#f3f3f3] hover:bg-[#e8e8e8] text-[#111111]'
                                    }`}
                                >
                                    {cat.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ========================================================= */}
            {/* 4. MENU ITEMS SECTION (UBEREATS 2-COLUMN CARDS) */}
            {/* ========================================================= */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
                {filteredCategories.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-[#e2e2e2] p-8">
                        <UtensilsCrossed size={40} className="mx-auto text-[#a3a3a3] mb-3" />
                        <h3 className="text-lg font-bold text-black">
                            {searchQuery ? 'No matching items found' : 'Menu coming soon'}
                        </h3>
                        <p className="text-xs text-[#757575] mt-1">
                            {searchQuery
                                ? 'Try a different search term.'
                                : "This restaurant hasn't published its menu yet. Please check back soon."}
                        </p>
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="mt-4 px-4 py-2 bg-black text-white rounded-full text-xs font-bold"
                            >
                                View All Items
                            </button>
                        )}
                    </div>
                ) : (
                    filteredCategories.map(category => (
                        <section 
                            key={category.name} 
                            id={`section-${category.name.replace(/[^a-zA-Z0-9]/g, '-')}`}
                            className="space-y-4"
                        >
                            {/* Category Header */}
                            <div className="flex items-center justify-between border-b border-[#e2e2e2] pb-3">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-black flex items-center gap-2">
                                        {category.name === 'Most Popular' && <Sparkles size={20} className="text-amber-500 fill-amber-500" />}
                                        {category.name}
                                    </h2>
                                    <p className="text-xs text-[#757575] mt-0.5">{category.items.length} items</p>
                                </div>
                            </div>

                            {/* Cards Grid (UberEats Signature 2-Column Desktop Grid) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {category.items.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleItemClick(item)}
                                        className="group bg-white hover:bg-[#fafafa] border border-[#e2e2e2] hover:border-[#cccccc] rounded-2xl p-4 flex justify-between gap-4 cursor-pointer transition-all duration-200 shadow-sm hover:shadow-md relative overflow-hidden"
                                    >
                                        {/* Left: Text & Pricing */}
                                        <div className="flex-1 flex flex-col justify-between pr-2">
                                            <div>
                                                <h3 className="font-bold text-base sm:text-lg text-black group-hover:text-[#000000] leading-snug line-clamp-1">
                                                    {item.title}
                                                </h3>
                                                <p className="text-xs text-[#545454] mt-1 line-clamp-2 leading-relaxed font-normal">
                                                    {item.description}
                                                </p>
                                            </div>

                                            <div className="mt-3 flex items-center gap-2">
                                                <span className="font-extrabold text-sm sm:text-base text-black">
                                                    KES {item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                {item.rating && (
                                                    <span className="text-[11px] font-medium text-[#047857] bg-[#ecfdf5] px-2 py-0.5 rounded-full flex items-center gap-1">
                                                        👍 {item.rating}
                                                    </span>
                                                )}
                                                {item.hasCustomizations && (
                                                    <span className="text-[10px] uppercase font-bold text-[#757575] tracking-wider">
                                                        Customizable
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Food Image & Quick Add Button */}
                                        <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 rounded-xl overflow-hidden bg-[#e5e5e5]">
                                            <img
                                                src={item.image_url || store.logo || '/manipos_logo.png'}
                                                alt={item.title}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                loading="lazy"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = store.logo || '/manipos_logo.png';
                                                }}
                                            />
                                            {/* Plus button (UberEats style circular button) */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleItemClick(item);
                                                }}
                                                className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white hover:bg-black text-black hover:text-white shadow-md flex items-center justify-center transition-all duration-150 active:scale-90"
                                                title="Add to order"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </main>

            {/* Clean Minimal Footer (GEMINI.md Rule 5) */}
            <footer className="py-8 text-center text-xs text-neutral-400 border-t border-[#e2e2e2] mt-12">
                <p>Mani POS © 2026</p>
            </footer>

            {/* ========================================================= */}
            {/* 5. ITEM CUSTOMIZATION MODAL (UBEREATS MODIFIERS & OPTIONS) */}
            {/* ========================================================= */}
            <AnimatePresence>
                {selectedItem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 50 }}
                            transition={{ duration: 0.2 }}
                            className="bg-white w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl"
                        >
                            {/* Modal Header & Hero Image */}
                            <div className="relative h-48 sm:h-56 shrink-0 bg-black">
                                <img
                                    src={selectedItem.image_url || store.logo || '/manipos_logo.png'}
                                    alt={selectedItem.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = store.logo || '/manipos_logo.png';
                                    }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-black flex items-center justify-center shadow-lg transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Modal Scrollable Content */}
                            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black text-black tracking-tight">{selectedItem.title}</h2>
                                    <p className="text-sm font-extrabold text-black mt-1">
                                        KES {selectedItem.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-xs sm:text-sm text-[#545454] mt-2 font-normal leading-relaxed">
                                        {selectedItem.description}
                                    </p>
                                </div>

                                {validationError && (
                                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs px-3.5 py-2.5 rounded-xl">
                                        <AlertCircle size={15} className="shrink-0" />
                                        <span>{validationError}</span>
                                    </div>
                                )}

                                {/* Modifier Groups */}
                                {selectedItem.modifiers && selectedItem.modifiers.length > 0 && (
                                    <div className="space-y-6 pt-2">
                                        {selectedItem.modifiers.map(mod => {
                                            const isMulti = !mod.required && mod.max > 1;
                                            return (
                                                <div key={mod.id} className="bg-[#f9f9f9] border border-[#e8e8e8] rounded-2xl p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div>
                                                            <h4 className="font-bold text-sm text-black">{mod.title}</h4>
                                                            <p className="text-[11px] text-[#757575]">
                                                                {mod.required ? 'Required • Choose 1' : `Optional • Select up to ${mod.max}`}
                                                            </p>
                                                        </div>
                                                        {mod.required && (
                                                            <span className="text-[10px] font-bold uppercase tracking-wider bg-black text-white px-2 py-0.5 rounded-full">
                                                                Required
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="space-y-2">
                                                        {mod.options.map(opt => {
                                                            const isSelected = isMulti
                                                                ? (modalSelections[mod.id] || []).includes(opt.id)
                                                                : modalSelections[mod.id] === opt.id;

                                                            return (
                                                                <label
                                                                    key={opt.id}
                                                                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                                                                        isSelected
                                                                            ? 'bg-white border-black shadow-sm font-semibold'
                                                                            : 'bg-white/60 border-transparent hover:border-[#d4d4d4]'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-3">
                                                                        <input
                                                                            type={isMulti ? 'checkbox' : 'radio'}
                                                                            name={`mod-${mod.id}`}
                                                                            checked={isSelected}
                                                                            onChange={() => {
                                                                                setValidationError('');
                                                                                if (isMulti) {
                                                                                    const current = modalSelections[mod.id] || [];
                                                                                    if (current.includes(opt.id)) {
                                                                                        setModalSelections({
                                                                                            ...modalSelections,
                                                                                            [mod.id]: current.filter(x => x !== opt.id)
                                                                                        });
                                                                                    } else {
                                                                                        if (current.length < mod.max) {
                                                                                            setModalSelections({
                                                                                                ...modalSelections,
                                                                                                [mod.id]: [...current, opt.id]
                                                                                            });
                                                                                        }
                                                                                    }
                                                                                } else {
                                                                                    setModalSelections({
                                                                                        ...modalSelections,
                                                                                        [mod.id]: opt.id
                                                                                    });
                                                                                }
                                                                            }}
                                                                            className="accent-black w-4 h-4"
                                                                        />
                                                                        <span className="text-xs text-black">{opt.name}</span>
                                                                    </div>
                                                                    <span className="text-xs font-bold text-[#545454]">
                                                                        {opt.price > 0 ? `+KES ${opt.price.toLocaleString()}` : 'Free'}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Special Instructions */}
                                <div className="pt-2">
                                    <label className="block text-xs font-bold text-black mb-1.5">
                                        Special Instructions
                                    </label>
                                    <textarea
                                        value={modalSpecialInstructions}
                                        onChange={e => setModalSpecialInstructions(e.target.value)}
                                        rows={2}
                                        placeholder="E.g. No onions, pack sauce separately, extra pepper..."
                                        className="w-full bg-[#f3f3f3] border border-[#e2e2e2] rounded-xl p-3 text-xs text-black placeholder-[#757575] focus:bg-white focus:border-black outline-none resize-none"
                                    />
                                </div>
                            </div>

                            {/* Modal Bottom Sticky Bar (UberEats Add Button) */}
                            <div className="p-4 sm:p-5 border-t border-[#e2e2e2] bg-white flex items-center gap-3">
                                {/* Quantity Picker */}
                                <div className="flex items-center gap-3 bg-[#f3f3f3] px-3 py-2 rounded-full font-bold text-sm">
                                    <button
                                        type="button"
                                        onClick={() => setModalQuantity(q => Math.max(1, q - 1))}
                                        className="w-6 h-6 rounded-full hover:bg-[#e2e2e2] flex items-center justify-center text-black"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="w-5 text-center">{modalQuantity}</span>
                                    <button
                                        type="button"
                                        onClick={() => setModalQuantity(q => q + 1)}
                                        className="w-6 h-6 rounded-full hover:bg-[#e2e2e2] flex items-center justify-center text-black"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>

                                {/* Add Button */}
                                <button
                                    type="button"
                                    onClick={handleAddToCartFromModal}
                                    className="flex-1 bg-black hover:bg-[#262626] text-white py-3 px-4 rounded-full font-bold text-sm flex items-center justify-between shadow-lg transition-transform active:scale-98"
                                >
                                    <span>Add {modalQuantity} to order</span>
                                    <span>KES {(modalItemPrice * modalQuantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========================================================= */}
            {/* 6. FLOATING BOTTOM CART BAR (MOBILE / DESKTOP PILL) */}
            {/* ========================================================= */}
            {totalCartCount > 0 && !cartOpen && (
                <div className="fixed bottom-6 left-0 right-0 z-40 px-4 flex justify-center pointer-events-none">
                    <motion.button
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 50, opacity: 0 }}
                        type="button"
                        onClick={() => setCartOpen(true)}
                        className="pointer-events-auto w-full max-w-md bg-black hover:bg-[#1a1a1a] text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between transition-transform active:scale-98"
                    >
                        <div className="flex items-center gap-3">
                            <span className="bg-[#06C167] text-black font-black w-7 h-7 rounded-full flex items-center justify-center text-xs">
                                {totalCartCount}
                            </span>
                            <span className="font-bold text-sm">View Cart</span>
                        </div>
                        <span className="font-extrabold text-sm sm:text-base">
                            KES {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </motion.button>
                </div>
            )}

            {/* ========================================================= */}
            {/* 7. SLIDE-OUT CART & CHECKOUT DRAWER */}
            {/* ========================================================= */}
            <AnimatePresence>
                {cartOpen && (
                    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="bg-white w-full sm:max-w-md h-full flex flex-col shadow-2xl"
                        >
                            {/* Drawer Header */}
                            <div className="p-4 sm:p-5 border-b border-[#e2e2e2] flex items-center justify-between">
                                <div>
                                    <h3 className="font-black text-lg text-black">Your Order</h3>
                                    <p className="text-xs text-[#757575] font-medium">{store.name} • {store.address || 'Nairobi'}</p>
                                </div>
                                <button
                                    onClick={() => setCartOpen(false)}
                                    className="w-8 h-8 rounded-full bg-[#f3f3f3] hover:bg-[#e2e2e2] flex items-center justify-center text-black"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Cart Scrollable Items */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                                {cart.length === 0 ? (
                                    <div className="text-center py-16 text-[#757575]">
                                        <ShoppingBag size={48} className="mx-auto text-[#d4d4d4] mb-3" />
                                        <p className="font-bold text-sm text-black">Your cart is empty</p>
                                        <p className="text-xs mt-1">Add items from the menu to get started.</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Cart Lines */}
                                        <div className="divide-y divide-[#f0f0f0]">
                                            {cart.map(item => (
                                                <div key={item.lineKey} className="py-3 flex justify-between gap-3">
                                                    <div className="flex-1">
                                                        <h4 className="font-bold text-sm text-black leading-snug">{item.title}</h4>
                                                        {item.modifiers && item.modifiers.length > 0 && (
                                                            <div className="text-[11px] text-[#757575] mt-1 space-y-0.5">
                                                                {item.modifiers.map((m, idx) => (
                                                                    <p key={idx}>↳ {m}</p>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {item.specialInstructions && (
                                                            <p className="text-[11px] text-[#b45309] mt-1 italic">
                                                                Note: {item.specialInstructions}
                                                            </p>
                                                        )}
                                                        <p className="text-xs font-bold text-black mt-1">
                                                            KES {(item.totalPrice * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                    </div>

                                                    {/* Qty changer */}
                                                    <div className="flex items-center gap-2 self-start bg-[#f3f3f3] px-2 py-1 rounded-full text-xs font-bold">
                                                        <button
                                                            onClick={() => updateCartQuantity(item.lineKey, -1)}
                                                            className="w-5 h-5 rounded-full hover:bg-white flex items-center justify-center text-black"
                                                        >
                                                            <Minus size={12} />
                                                        </button>
                                                        <span className="w-4 text-center">{item.quantity}</span>
                                                        <button
                                                            onClick={() => updateCartQuantity(item.lineKey, 1)}
                                                            className="w-5 h-5 rounded-full hover:bg-white flex items-center justify-center text-black"
                                                        >
                                                            <Plus size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Promo Code Box */}
                                        <div className="bg-[#f9f9f9] border border-[#e2e2e2] rounded-2xl p-3.5 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Tag size={15} className="text-[#06C167]" />
                                                <span className="text-xs font-bold text-black">Promo / Creator Code</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={promoCode}
                                                    onChange={e => setPromoCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                                                    placeholder="Enter code (e.g. JANE10)"
                                                    className="flex-1 bg-white border border-[#d4d4d4] rounded-xl px-3 py-2 text-xs uppercase font-bold text-black placeholder-[#757575] outline-none focus:border-black"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={promoLoading || !promoCode.trim()}
                                                    onClick={() => applyPromo()}
                                                    className="bg-black hover:bg-[#262626] disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-bold"
                                                >
                                                    {promoLoading ? 'Checking...' : 'Apply'}
                                                </button>
                                            </div>
                                            {appliedDiscount && (
                                                <div className="text-[11px] font-bold text-[#047857] flex items-center gap-1">
                                                    <Check size={13} />
                                                    <span>Applied! {appliedDiscount.value}% off with {appliedDiscount.code}</span>
                                                </div>
                                            )}
                                            {promoError && (
                                                <p className="text-[11px] font-medium text-red-600">{promoError}</p>
                                            )}
                                        </div>

                                        {/* Customer Account Status / Login prompt */}
                                        {guestUser ? (
                                            <div className="bg-[#f3f3f3] rounded-2xl p-3.5 flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs">
                                                        {(guestUser.first_name || 'G')[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-black leading-tight">
                                                            Ordering as {guestUser.first_name} {guestUser.last_name || ''}
                                                        </p>
                                                        <p className="text-[11px] text-[#757575]">{guestUser.phone || guestUser.email}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setAccountOpen(true)}
                                                    className="text-xs font-bold text-black hover:underline"
                                                >
                                                    Account
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="bg-[#f9f9f9] border border-[#e2e2e2] rounded-2xl p-3 flex items-center justify-between">
                                                <div className="text-xs text-[#545454]">
                                                    <span className="font-bold text-black">Returning customer?</span> Log in to auto-fill details & track visits.
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setAccountOpen(true)}
                                                    className="text-xs font-bold bg-black text-white px-3.5 py-1.5 rounded-full hover:bg-[#262626] shrink-0 ml-2"
                                                >
                                                    Log In
                                                </button>
                                            </div>
                                        )}

                                        {/* Order Type Toggle in Checkout (Delivery / Pickup / Dine In) */}
                                        <div className="bg-[#f3f3f3] p-1 rounded-2xl flex items-center text-xs font-bold gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setDiningMode('delivery')}
                                                className={`flex-1 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                                                    diningMode === 'delivery' 
                                                        ? 'bg-black text-white shadow-sm font-black' 
                                                        : 'text-[#545454] hover:text-black'
                                                }`}
                                            >
                                                <Motorbike size={14} />
                                                <span>Delivery</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDiningMode('pickup')}
                                                className={`flex-1 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                                                    diningMode === 'pickup' 
                                                        ? 'bg-black text-white shadow-sm font-black' 
                                                        : 'text-[#545454] hover:text-black'
                                                }`}
                                            >
                                                <ShoppingBag size={14} />
                                                <span>Pickup</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDiningMode('dine_in')}
                                                className={`flex-1 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                                                    diningMode === 'dine_in' 
                                                        ? 'bg-black text-white shadow-sm font-black' 
                                                        : 'text-[#545454] hover:text-black'
                                                }`}
                                            >
                                                <UtensilsCrossed size={14} />
                                                <span>Dine In</span>
                                            </button>
                                        </div>

                                        {/* Customer Delivery Details */}
                                        <div className="space-y-3 pt-1">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#757575]">
                                                {diningMode === 'delivery' ? 'Delivery & Contact Info' : (diningMode === 'dine_in' ? 'Dine In & Contact Info' : 'Pickup & Contact Info')}
                                            </h4>

                                            <div>
                                                <input
                                                    type="text"
                                                    value={customerName}
                                                    onChange={e => setCustomerName(e.target.value)}
                                                    placeholder="Your Full Name *"
                                                    className="w-full bg-[#f3f3f3] border border-[#e2e2e2] focus:bg-white focus:border-black rounded-xl p-3 text-xs text-black placeholder-[#757575] outline-none"
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <input
                                                    type="tel"
                                                    value={customerPhone}
                                                    onChange={e => setCustomerPhone(e.target.value)}
                                                    placeholder="WhatsApp / Phone Number (0712...) *"
                                                    className="w-full bg-[#f3f3f3] border border-[#e2e2e2] focus:bg-white focus:border-black rounded-xl p-3 text-xs text-black placeholder-[#757575] outline-none"
                                                    required
                                                />
                                            </div>

                                            {diningMode === 'dine_in' && (
                                                <div>
                                                    <input
                                                        type="text"
                                                        value={tableNumber}
                                                        onChange={e => setTableNumber(e.target.value)}
                                                        placeholder="Table Number (Optional, e.g. Table 3)"
                                                        className="w-full bg-[#f3f3f3] border border-[#e2e2e2] focus:bg-white focus:border-black rounded-xl p-3 text-xs text-black placeholder-[#757575] outline-none"
                                                    />
                                                </div>
                                            )}

                                            {diningMode === 'delivery' && (
                                                <div className="space-y-2">
                                                    {savedAddresses.length > 0 && (
                                                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                                                            <span className="text-[10px] font-bold text-[#757575] shrink-0">Saved:</span>
                                                            {savedAddresses.map((addr, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={() => setDeliveryAddress(addr)}
                                                                    className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                                                                        deliveryAddress.trim() === addr.trim()
                                                                            ? 'bg-black text-white border-black'
                                                                            : 'bg-white text-black border-[#d4d4d4] hover:border-black'
                                                                    }`}
                                                                >
                                                                    📍 {addr.length > 25 ? addr.substring(0, 25) + '...' : addr}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <textarea
                                                        value={deliveryAddress}
                                                        onChange={e => setDeliveryAddress(e.target.value)}
                                                        rows={2}
                                                        placeholder="Delivery Location / Apartment / Office / Street *"
                                                        className="w-full bg-[#f3f3f3] border border-[#e2e2e2] focus:bg-white focus:border-black rounded-xl p-3 text-xs text-black placeholder-[#757575] outline-none resize-none"
                                                        required
                                                    />
                                                </div>
                                            )}

                                            <div>
                                                <input
                                                    type="text"
                                                    value={orderNote}
                                                    onChange={e => setOrderNote(e.target.value)}
                                                    placeholder="Additional order notes or gate instructions"
                                                    className="w-full bg-[#f3f3f3] border border-[#e2e2e2] focus:bg-white focus:border-black rounded-xl p-3 text-xs text-black placeholder-[#757575] outline-none"
                                                />
                                            </div>
                                        </div>

                                        {/* Bill Summary */}
                                        <div className="bg-[#f9f9f9] border border-[#e2e2e2] rounded-2xl p-4 space-y-2 text-xs">
                                            <div className="flex justify-between text-[#545454]">
                                                <span>Subtotal</span>
                                                <span className="font-bold text-black">KES {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                            {discountAmount > 0 && (
                                                <div className="flex justify-between text-[#047857] font-bold">
                                                    <span>Promo Discount</span>
                                                    <span>-KES {discountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-[#545454]">
                                                <span>Delivery</span>
                                                <span className="font-bold text-[#06C167]">
                                                    {deliveryFee === 0
                                                        ? (diningMode === 'delivery' ? `FREE (${freeDeliveryRadius}km)` : 'FREE')
                                                        : `KES ${deliveryFee.toLocaleString()}`}
                                                </span>
                                            </div>
                                            {diningMode === 'delivery' && (
                                                <div className="text-[10px] text-[#757575]">
                                                    {isGeocoding
                                                        ? 'Locating address…'
                                                        : calculatedDistance !== null
                                                            ? `${calculatedDistance.toFixed(1)} km from store • free within ${freeDeliveryRadius} km`
                                                            : (geocodingError || 'Enter your address to calculate the delivery fee.')}
                                                </div>
                                            )}
                                            <div className="border-t border-[#e2e2e2] pt-2 flex justify-between font-black text-sm text-black">
                                                <span>Total Payable</span>
                                                <span>KES {finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Drawer Footer Actions */}
                            {cart.length > 0 && (
                                <div className="p-4 sm:p-5 border-t border-[#e2e2e2] bg-white space-y-2.5">
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => handleSubmitOrder(false)}
                                        className="w-full bg-[#06C167] hover:bg-[#05a357] text-white py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-98 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                <span>Processing Order...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>Submit & Pay with M-Pesa • KES {finalTotal.toLocaleString()}</span>
                                            </>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => handleSubmitOrder(true)}
                                        className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-98 disabled:opacity-50 cursor-pointer"
                                    >
                                        <Phone size={15} />
                                        <span>Order via WhatsApp • KES {finalTotal.toLocaleString()}</span>
                                    </button>

                                    <p className="text-[10px] text-center text-[#757575]">
                                        Instant confirmation & live order tracking with the kitchen
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========================================================= */}
            {/* 8. INTERACTIVE M-PESA PAYMENT & ORDER STATUS MODAL */}
            {/* ========================================================= */}
            <AnimatePresence>
                {orderSuccess && (
                    <MicrositeOrderSuccessModal
                        orderSuccess={orderSuccess}
                        setOrderSuccess={setOrderSuccess}
                        whatsappSettings={whatsappSettings}
                        tenant={tenant}
                    />
                )}
            </AnimatePresence>

            {/* ========================================================= */}
            {/* 9. STORE INFO MODAL */}
            {/* ========================================================= */}
            <AnimatePresence>
                {storeInfoOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl relative"
                        >
                            <button
                                onClick={() => setStoreInfoOpen(false)}
                                className="absolute top-4 right-4 text-[#757575] hover:text-black w-8 h-8 rounded-full bg-[#f3f3f3] flex items-center justify-center"
                            >
                                <X size={16} />
                            </button>
                            <h3 className="text-xl font-black text-black mb-1">{store.name}</h3>
                            <p className="text-xs text-[#545454] mb-4">{store.subtitle}</p>
                            
                            <div className="space-y-3 text-xs">
                                <div className="flex items-start gap-3 p-3 bg-[#f9f9f9] rounded-xl">
                                    <MapPin size={16} className="text-black mt-0.5 shrink-0" />
                                    <div>
                                        <p className="font-bold text-black">Location</p>
                                        <p className="text-[#545454]">{store.address}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 bg-[#f9f9f9] rounded-xl">
                                    <Clock size={16} className="text-black mt-0.5 shrink-0" />
                                    <div>
                                        <p className="font-bold text-black">Hours</p>
                                        <p className="text-[#545454]">Monday – Sunday: 10:00 AM – 10:00 PM</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 bg-[#f9f9f9] rounded-xl">
                                    <Motorbike size={16} className="text-[#06C167] mt-0.5 shrink-0" />
                                    <div>
                                        <p className="font-bold text-black">Delivery Coverage</p>
                                        <p className="text-[#545454]">Delivery across Nairobi. {store.delivery_fee}.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <button
                                    onClick={() => setStoreInfoOpen(false)}
                                    className="w-full bg-black text-white py-2.5 rounded-full text-xs font-bold"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========================================================= */}
            {/* 10. CUSTOMER ACCOUNT & LOGIN DRAWER */}
            {/* ========================================================= */}
            <AnimatePresence>
                {accountOpen && (
                    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="bg-white w-full sm:max-w-md h-full flex flex-col shadow-2xl"
                        >
                            {/* Drawer Header */}
                            <div className="p-4 sm:p-5 border-b border-[#e2e2e2] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <User size={18} className="text-black" />
                                    <h3 className="font-black text-lg text-black">Your Account</h3>
                                </div>
                                <button
                                    onClick={() => setAccountOpen(false)}
                                    className="w-8 h-8 rounded-full bg-[#f3f3f3] hover:bg-[#e2e2e2] flex items-center justify-center text-black"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Drawer Body */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                                {guestUser ? (
                                    <div className="space-y-6 text-left">
                                        {/* Profile Card */}
                                        <div className="bg-[#f9f9f9] border border-[#e2e2e2] rounded-3xl p-5 space-y-4">
                                            <div className="flex items-center gap-3.5">
                                                <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center font-black text-lg shadow-sm">
                                                    {(guestUser.first_name || 'G')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-base text-black leading-tight">
                                                        {guestUser.first_name} {guestUser.last_name || ''}
                                                    </h4>
                                                    <p className="text-xs text-[#757575] font-medium mt-0.5">
                                                        {guestUser.phone || guestUser.email}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="h-px bg-[#e8e8e8]" />

                                            {/* Loyalty Stats */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-white rounded-2xl p-3.5 border border-[#e2e2e2] text-center">
                                                    <span className="text-[10px] font-bold text-[#757575] uppercase tracking-wider block">Visits</span>
                                                    <span className="text-xl font-black text-black font-mono mt-0.5 block">{guestUser.visit_count || 0}</span>
                                                </div>
                                                <div className="bg-white rounded-2xl p-3.5 border border-[#e2e2e2] text-center">
                                                    <span className="text-[10px] font-bold text-[#757575] uppercase tracking-wider block">Total Spend</span>
                                                    <span className="text-sm font-black text-black font-mono mt-1.5 block">KES {Math.round(guestUser.lifetime_spend || 0).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="space-y-2.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowHistory(true);
                                                    setAccountOpen(false);
                                                }}
                                                className="w-full py-3.5 bg-black hover:bg-[#262626] text-white rounded-2xl text-xs font-bold transition-all text-center flex items-center justify-center gap-2 shadow-md"
                                            >
                                                <Calendar size={15} />
                                                <span>View Order History ({pastOrders.length})</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleGuestLogout();
                                                    setAccountOpen(false);
                                                }}
                                                className="w-full py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                                            >
                                                <LogOut size={14} />
                                                <span>Log Out Account</span>
                                            </button>
                                        </div>

                                        {/* Saved Addresses */}
                                        {savedAddresses.length > 0 && (
                                            <div className="space-y-2.5 pt-2">
                                                <h5 className="text-xs font-bold uppercase tracking-wider text-[#757575]">
                                                    Saved Addresses
                                                </h5>
                                                <div className="space-y-2">
                                                    {savedAddresses.map((addr, idx) => (
                                                        <div
                                                            key={idx}
                                                            onClick={() => {
                                                                setDeliveryAddress(addr);
                                                                alert(`Address selected for delivery: ${addr}`);
                                                            }}
                                                            className="bg-[#f9f9f9] hover:bg-[#f0f0f0] border border-[#e2e2e2] rounded-2xl p-3 text-xs flex items-start gap-2.5 cursor-pointer transition-colors"
                                                        >
                                                            <MapPin size={15} className="text-black mt-0.5 shrink-0" />
                                                            <span className="text-[#333333] font-medium leading-relaxed">{addr}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    /* Logged Out / Check-in Form */
                                    <div className="space-y-5 text-left">
                                        <div className="text-center pt-2 pb-1">
                                            <div className="w-14 h-14 bg-black text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
                                                <User size={24} />
                                            </div>
                                            <h4 className="font-black text-base text-black">Log In or Register</h4>
                                            <p className="text-xs text-[#757575] mt-1 max-w-xs mx-auto">
                                                Enter your phone number or email to access your past orders and loyalty history.
                                            </p>
                                        </div>

                                        <form onSubmit={handleGuestLoginOrRegister} className="space-y-4">
                                            {!isRegistering ? (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[11px] font-bold text-[#545454] block mb-1">
                                                            Phone Number or Email
                                                        </label>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g. 0712345678 or you@email.com"
                                                            required
                                                            value={loginInput}
                                                            onChange={e => setLoginInput(e.target.value)}
                                                            className="w-full bg-[#f3f3f3] focus:bg-white border border-[#e2e2e2] focus:border-black rounded-2xl p-3.5 text-xs text-black placeholder-[#757575] outline-none font-medium"
                                                        />
                                                    </div>
                                                    <button
                                                        type="submit"
                                                        disabled={guestLoading}
                                                        className="w-full py-3.5 bg-black hover:bg-[#262626] disabled:opacity-50 text-white rounded-2xl text-xs font-bold transition-all shadow-md"
                                                    >
                                                        {guestLoading ? 'Checking...' : 'Check In'}
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-[#545454] block mb-1">First Name *</label>
                                                            <input
                                                                type="text"
                                                                required
                                                                placeholder="First Name"
                                                                value={regFirstName}
                                                                onChange={e => setRegFirstName(e.target.value)}
                                                                className="w-full bg-[#f3f3f3] focus:bg-white border border-[#e2e2e2] focus:border-black rounded-xl p-3 text-xs text-black font-medium outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-[#545454] block mb-1">Last Name</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Last Name"
                                                                value={regLastName}
                                                                onChange={e => setRegLastName(e.target.value)}
                                                                className="w-full bg-[#f3f3f3] focus:bg-white border border-[#e2e2e2] focus:border-black rounded-xl p-3 text-xs text-black font-medium outline-none"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="text-[10px] font-bold text-[#545454] block mb-1">Phone Number *</label>
                                                        <input
                                                            type="tel"
                                                            required
                                                            placeholder="0712345678"
                                                            value={regPhone}
                                                            onChange={e => setRegPhone(e.target.value)}
                                                            className="w-full bg-[#f3f3f3] focus:bg-white border border-[#e2e2e2] focus:border-black rounded-xl p-3 text-xs text-black font-medium outline-none"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="text-[10px] font-bold text-[#545454] block mb-1">Email (Optional)</label>
                                                        <input
                                                            type="email"
                                                            placeholder="you@email.com"
                                                            value={regEmail}
                                                            onChange={e => setRegEmail(e.target.value)}
                                                            className="w-full bg-[#f3f3f3] focus:bg-white border border-[#e2e2e2] focus:border-black rounded-xl p-3 text-xs text-black font-medium outline-none"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="text-[10px] font-bold text-[#545454] block mb-1">Delivery Address (Optional)</label>
                                                        <textarea
                                                            rows={2}
                                                            placeholder="Apartment, Street or Building"
                                                            value={regAddress}
                                                            onChange={e => setRegAddress(e.target.value)}
                                                            className="w-full bg-[#f3f3f3] focus:bg-white border border-[#e2e2e2] focus:border-black rounded-xl p-3 text-xs text-black font-medium outline-none resize-none"
                                                        />
                                                    </div>

                                                    <div className="flex gap-2 pt-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsRegistering(false)}
                                                            className="flex-1 py-3 border border-[#d4d4d4] hover:bg-[#f3f3f3] text-black rounded-xl text-xs font-bold transition-colors"
                                                        >
                                                            Back
                                                        </button>
                                                        <button
                                                            type="submit"
                                                            disabled={guestLoading}
                                                            className="flex-1 py-3 bg-black hover:bg-[#262626] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
                                                        >
                                                            {guestLoading ? 'Saving...' : 'Register'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </form>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ========================================================= */}
            {/* 11. PAST ORDER HISTORY MODAL */}
            {/* ========================================================= */}
            <AnimatePresence>
                {showHistory && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white max-w-lg w-full rounded-3xl p-6 shadow-2xl relative flex flex-col max-h-[85vh] text-left"
                        >
                            <div className="flex justify-between items-center pb-4 border-b border-[#e2e2e2]">
                                <div className="flex items-center gap-2">
                                    <Calendar size={18} className="text-black" />
                                    <h3 className="font-black text-base text-black">Your Order History</h3>
                                </div>
                                <button
                                    onClick={() => setShowHistory(false)}
                                    className="w-8 h-8 rounded-full bg-[#f3f3f3] hover:bg-[#e2e2e2] flex items-center justify-center text-black"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto py-4 space-y-3.5">
                                {pastOrders.length === 0 ? (
                                    <div className="text-center py-14 text-[#757575]">
                                        <ShoppingBag size={40} className="mx-auto text-[#d4d4d4] mb-2" />
                                        <p className="text-xs font-bold text-black uppercase tracking-wider">No past orders found</p>
                                        <p className="text-[11px] mt-1">Orders placed under this account will appear here.</p>
                                    </div>
                                ) : (
                                    pastOrders.map(order => (
                                        <div key={order.id} className="bg-[#f9f9f9] border border-[#e2e2e2] rounded-2xl p-4 space-y-2.5">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <span className="font-black text-xs text-black">Order #{order.ticket_number}</span>
                                                    <p className="text-[10px] text-[#757575]">
                                                        {new Date(order.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </p>
                                                </div>
                                                <span className="text-xs font-black text-black">
                                                    KES {Number(order.total_amount).toLocaleString()}
                                                </span>
                                            </div>
                                            {order.pos_order_items && order.pos_order_items.length > 0 && (
                                                <div className="text-[11px] text-[#545454] space-y-0.5 pt-1 border-t border-[#ededed]">
                                                    {order.pos_order_items.map((it, idx) => (
                                                        <p key={idx}>• {it.quantity}x {it.item_name} (KES {Number(it.price).toLocaleString()})</p>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="pt-2 flex justify-between items-center border-t border-[#ededed]">
                                                <span className="text-[10px] text-[#757575] font-bold uppercase tracking-wider">
                                                    {order.dining_option || 'Delivery'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setRatingOrder({
                                                        ticket_number: order.ticket_number,
                                                        dining_option: order.dining_option || 'Delivery',
                                                        customer_name: guestUser ? `${guestUser.first_name || ''} ${guestUser.last_name || ''}`.trim() : 'Guest',
                                                        customer_contact: guestUser?.phone || 'N/A'
                                                    })}
                                                    className="flex items-center gap-1 px-3 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-full text-[10px] font-black transition-colors cursor-pointer"
                                                >
                                                    <Star size={11} className="fill-amber-400 text-amber-400" />
                                                    {typeof window !== 'undefined' && localStorage.getItem(`poj_rated_order_${order.ticket_number}`) === 'true' ? 'Rated ★' : 'Rate Order'}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Standalone Order Rating Modal */}
            <AnimatePresence>
                {ratingOrder && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white max-w-sm w-full rounded-3xl p-5 shadow-2xl relative text-left"
                        >
                            <div className="flex justify-between items-center pb-3 border-b border-[#e2e2e2] mb-3">
                                <div className="flex items-center gap-1.5">
                                    <Star size={16} className="fill-amber-400 text-amber-400" />
                                    <h3 className="font-black text-sm text-black">
                                        {ratingOrder.ticket_number !== 'DIRECT' ? `Rate Order #${ratingOrder.ticket_number}` : 'Rate Your Experience'}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setRatingOrder(null)}
                                    className="w-7 h-7 rounded-full bg-[#f3f3f3] hover:bg-[#e2e2e2] flex items-center justify-center text-black"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <OrderRatingWidget
                                order={ratingOrder}
                                tenant={tenant}
                                onRated={() => {
                                    setTimeout(() => setRatingOrder(null), 1800);
                                }}
                            />
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </div>
    );
}
export default UberEatsMicrosite;
