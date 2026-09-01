import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { connectQZ, disconnectQZ, isQZConnected, onQZStatusChange, listPrinters, printOrFallback } from '../lib/qzPrint';
import { Search, ShoppingBag, Trash2, Plus, Minus, CreditCard, Receipt, Loader2, ArrowLeft, Printer, AlertTriangle, X, Calendar, KeyRound, Download, ChevronRight, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateZReportPDF, generateItemsSoldPDF } from '../lib/pdfGenerator';
import { CampaignsView } from './CampaignsView';
import { FeedbackDashboardView } from './FeedbackDashboardView';

const MUTE_LOGO_URL = '/logo.png';

export const BRAND_OPTIONS = [
    {
        id: 'POT OF JOLLOF',
        name: 'Pot of Jollof',
        tagline: 'Authentic West African Rice & Combos',
        icon: '🫕',
        logo: '/jollof_logo.png',
        color: 'from-amber-500 to-emerald-600',
        borderColor: 'border-emerald-500/30'
    },
    {
        id: 'LITTLE LAGOS',
        name: 'Little Lagos',
        tagline: 'Lagos Street Food, Suya & Grills',
        icon: '🌶️',
        logo: '/lagos_logo.png',
        color: 'from-orange-500 to-red-600',
        borderColor: 'border-orange-500/30'
    },
    {
        id: 'CAFE SWAHILI',
        name: 'Cafe Swahili',
        tagline: 'Coastal Swahili Delights & Coffees',
        icon: '☕',
        logo: '/swahili_logo.png',
        color: 'from-blue-500 to-indigo-600',
        borderColor: 'border-blue-500/30'
    },
    {
        id: 'SAMAKI STREET',
        name: 'Samaki Street',
        tagline: 'Fresh Seafood, Fish & Grilled Platters',
        icon: '🐟',
        logo: '/samaki_logo.jpg',
        color: 'from-cyan-500 to-teal-600',
        borderColor: 'border-cyan-500/30'
    }
];

const DEFAULT_CATEGORIES = [
    { name: 'Starters & Bites', icon: '🍢' },
    { name: 'Breakfast', icon: '🍳' },
    { name: 'Main Combos', icon: '🍛' },
    { name: 'Stews', icon: '🍲' },
    { name: 'Soups', icon: '🥣' },
    { name: 'Beverages', icon: '🥤' },
    { name: 'Hot Beverages', icon: '☕' }
];

// Modifier groups for the order item modifier panel
const MODIFIER_GROUPS = [
    {
        group: 'Swallow Choice',
        icon: '🫓',
        options: ['Fufu', 'Eba (Garri)', 'Amala', 'Pounded Yam', 'Semo', 'Wheat']
    },
    {
        group: 'Protein Add-on',
        icon: '🥩',
        options: ['Extra Chicken (+500)', 'Extra Beef (+500)', 'Extra Fish (+500)', 'Extra Goat Meat (+600)', 'Extra Suya (+450)', 'Extra Pomo (+300)']
    },
    {
        group: 'Preference',
        icon: '🌶️',
        options: ['Extra Spicy', 'Mild / Less Spice', 'No Pepper', 'Well Done', 'No Onions', 'No Meat']
    },
    {
        group: 'Extra Sides',
        icon: '🍟',
        options: ['Extra Plantain (+300)', 'Extra Fries (+250)', 'Extra Rice (+350)', 'Add Coleslaw (+200)', 'Add Egg (+150)']
    },
    {
        group: 'Packaging',
        icon: '📦',
        options: ['Pack Separately', 'Takeaway Box (+50)', 'No Cutlery']
    }
];

const TABLES = [
    'Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6',
    'Table 7', 'Table 8', 'Table 9', 'Table 10', 'Table 11', 'Table 12'
];

// Helper to format customer names on printed receipts
const formatCustomerName = (name) => {
    if (!name || name.trim() === '' || name.trim().toUpperCase() === 'WALK-IN GUEST') {
        return '___________________';
    }
    return name.toUpperCase();
};

// Dynamic Channel Pricing Engine (Omni-Channel Fixed Prices & Per-Brand Overrides)
export const calculateChannelPrice = (item, channel, activeBrand) => {
    if (!item) return 0;
    const chLower = (channel || 'Walk-in').toLowerCase().trim();

    try {
        const basePrice = parseFloat(item.basePrice !== undefined ? item.basePrice : item.price) || 0;
        let chName = '';
        if (chLower.includes('uber')) chName = 'ubereats';
        else if (chLower.includes('glovo')) chName = 'glovo';
        else if (chLower.includes('bolt')) chName = 'boltfood';

        if (chName) {
            const cachedChannels = JSON.parse(localStorage.getItem('pos_channels_cached') || '[]');
            const channelInfo = cachedChannels.find(c => c.name === chName);
            if (channelInfo && channelInfo.is_active) {
                const cachedOverrides = JSON.parse(localStorage.getItem('pos_channel_overrides_cached') || '[]');
                const itemOvr = cachedOverrides.find(o => o.menu_item_id === item.id && o.channel_id === channelInfo.id);
                
                let markupAmt = 0;
                if (itemOvr && parseFloat(itemOvr.price_markup_value) > 0) {
                    markupAmt = parseFloat(itemOvr.price_markup_value);
                } else if (parseFloat(channelInfo.default_markup_percent) > 0) {
                    markupAmt = basePrice * (parseFloat(channelInfo.default_markup_percent) / 100);
                }
                
                if (markupAmt > 0) {
                    return basePrice + markupAmt;
                }
            }
        }
    } catch (e) {
        console.error('Error calculating dynamic channel markup:', e);
    }
    const effectiveBrand = (activeBrand && activeBrand !== 'All') ? activeBrand : (item.brand || null);
    const bp = (effectiveBrand && item.brand_prices && typeof item.brand_prices === 'object') 
        ? item.brand_prices[effectiveBrand] 
        : null;

    // 1. Check brand-specific channel price override if defined for this channel
    if (bp) {
        if (chLower.includes('glovo') && bp.glovo_price !== undefined && bp.glovo_price !== null && parseFloat(bp.glovo_price) > 0) return parseFloat(bp.glovo_price);
        if (chLower.includes('uber') && bp.ubereats_price !== undefined && bp.ubereats_price !== null && parseFloat(bp.ubereats_price) > 0) return parseFloat(bp.ubereats_price);
        if (chLower.includes('bolt') && bp.bolt_price !== undefined && bp.bolt_price !== null && parseFloat(bp.bolt_price) > 0) return parseFloat(bp.bolt_price);
        if (chLower.includes('ando') && bp.ando_price !== undefined && bp.ando_price !== null && parseFloat(bp.ando_price) > 0) return parseFloat(bp.ando_price);
        if ((chLower.includes('site') || chLower.includes('micro')) && bp.website_price !== undefined && bp.website_price !== null && parseFloat(bp.website_price) > 0) return parseFloat(bp.website_price);
    }

    // 2. Check item-level omni-channel fixed price overrides for this channel
    if (chLower.includes('glovo') && item.glovo_price !== undefined && item.glovo_price !== null && parseFloat(item.glovo_price) > 0) {
        return parseFloat(item.glovo_price);
    }
    if (chLower.includes('uber') && item.ubereats_price !== undefined && item.ubereats_price !== null && parseFloat(item.ubereats_price) > 0) {
        return parseFloat(item.ubereats_price);
    }
    if (chLower.includes('bolt') && item.bolt_price !== undefined && item.bolt_price !== null && parseFloat(item.bolt_price) > 0) {
        return parseFloat(item.bolt_price);
    }
    if (chLower.includes('ando') && item.ando_price !== undefined && item.ando_price !== null && parseFloat(item.ando_price) > 0) {
        return parseFloat(item.ando_price);
    }
    if ((chLower.includes('site') || chLower.includes('micro')) && item.website_price !== undefined && item.website_price !== null && parseFloat(item.website_price) > 0) {
        return parseFloat(item.website_price);
    }

    // 3. Fallback to brand base price if defined
    if (bp && bp.price !== undefined && bp.price !== null && parseFloat(bp.price) > 0) {
        return parseFloat(bp.price);
    }

    // 4. Default fallback to item base price
    return parseFloat(item.basePrice !== undefined ? item.basePrice : item.price) || 0;
};

// Dynamic Modifier Option Channel Pricing Engine
export const calculateModifierChannelPrice = (option, channel) => {
    if (!option) return 0;
    const basePrice = parseFloat(option.price) || 0;
    const chLower = (channel || 'Walk-in').toLowerCase().trim();

    if (chLower.includes('glovo') && option.glovo_price !== undefined && option.glovo_price !== null && parseFloat(option.glovo_price) > 0) {
        return parseFloat(option.glovo_price);
    }
    if (chLower.includes('uber') && option.ubereats_price !== undefined && option.ubereats_price !== null && parseFloat(option.ubereats_price) > 0) {
        return parseFloat(option.ubereats_price);
    }
    if (chLower.includes('bolt') && option.bolt_price !== undefined && option.bolt_price !== null && parseFloat(option.bolt_price) > 0) {
        return parseFloat(option.bolt_price);
    }
    if (chLower.includes('ando') && option.ando_price !== undefined && option.ando_price !== null && parseFloat(option.ando_price) > 0) {
        return parseFloat(option.ando_price);
    }
    if ((chLower.includes('site') || chLower.includes('micro')) && option.website_price !== undefined && option.website_price !== null && parseFloat(option.website_price) > 0) {
        return parseFloat(option.website_price);
    }

    return basePrice;
};

// Dynamic Modifier Total Helper (Calculates modifier price sum from selectedModifiers or instructions)
export const getItemModifierTotal = (item, orderChannel) => {
    let total = 0;
    if (item && item.selectedModifiers && item.selectedModifiers.length > 0) {
        total = item.selectedModifiers.reduce((sum, m) => sum + calculateModifierChannelPrice(m, orderChannel), 0);
    }
    // Fallback: If selectedModifiers total is 0 but instructions contain (+X)
    if (total === 0 && item && item.instructions) {
        const matches = item.instructions.match(/\(\+(\d+)\)/g);
        if (matches) {
            total = matches.reduce((sum, matchStr) => {
                const num = parseFloat(matchStr.replace(/[^\d.]/g, '')) || 0;
                return sum + num;
            }, 0);
        }
    }
    return total;
};

export const obfuscateTicket = (ticketNum) => {
    if (!ticketNum) return '';
    const num = parseInt(String(ticketNum).replace(/\D/g, ''), 10);
    if (isNaN(num)) return String(ticketNum);
    const P = 382373;
    const M = 1000000;
    const scrambled = (num * P) % M;
    return String(scrambled).padStart(6, '0');
};

export const deobfuscateTicket = (scrambledStr) => {
    if (!scrambledStr) return null;
    const cleanStr = String(scrambledStr).replace(/\D/g, '');
    if (cleanStr.length !== 6) return null;
    const num = parseInt(cleanStr, 10);
    if (isNaN(num)) return null;
    const inv = 611437;
    const M = 1000000;
    const original = (num * inv) % M;
    return original;
};

export function PosTerminal({ staffName, staffRole, staffRestricted, onSignOut }) {
    const isSystemAdmin = React.useMemo(() => {
        try {
            const stored = localStorage.getItem('pin_staff_user');
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed.role === 'admin') return true;
            }
        } catch (e) {}
        const upperName = staffName?.toUpperCase() || '';
        return (
            staffName === 'Admin' ||
            upperName === 'MANIPOS OFFICE' ||
            upperName === 'POJ OFFICE' ||
            upperName.includes('OFFICE') ||
            staffRole === 'admin'
        );
    }, [staffName, staffRole]);

    const getBrandForItem = (item) => {
        if (!item) return null;
        if (Array.isArray(item.brand)) return item.brand[0] || null;
        return item.brand || null;
    };

    // Helper: check if item belongs to a brand (supports multi-brand arrays, JSON strings, and brand field)
    const itemBelongsToBrand = (item, brand) => {
        if (!brand || brand === 'All') return true;
        if (!item) return false;

        const targetUpper = String(brand).toUpperCase().trim();

        const getBrandList = (val) => {
            if (!val) return [];
            if (Array.isArray(val)) return val.map(b => String(b).toUpperCase().trim());
            const str = String(val).trim();
            if (str.startsWith('[') && str.endsWith(']')) {
                try {
                    const parsed = JSON.parse(str);
                    if (Array.isArray(parsed)) return parsed.map(b => String(b).toUpperCase().trim());
                } catch (e) {}
            }
            if (str.includes(',')) {
                return str.split(',').map(b => b.toUpperCase().trim());
            }
            return [str.toUpperCase()];
        };

        const brandsFromBrandsField = getBrandList(item.brands);
        const brandsFromBrandField = getBrandList(item.brand);
        const allBrands = [...brandsFromBrandsField, ...brandsFromBrandField];

        // Default to visible if no brand specified
        if (allBrands.length === 0) return true;

        return allBrands.some(b => 
            b === targetUpper || b.includes(targetUpper) || targetUpper.includes(b)
        );
    };

    const [menu, setMenu] = useState([]);
    const [loadingMenu, setLoadingMenu] = useState(true);
    const [activeBrand, setActiveBrand] = useState(null);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);

    // Screen lock
    const [isLocked, setIsLocked] = useState(false);
    const [lockPin, setLockPin] = useState(['', '', '', '']);
    const [lockError, setLockError] = useState('');
    const [lockLoading, setLockLoading] = useState(false);
    const lockTimerRef = React.useRef(null);

    const lockScreen = React.useCallback(() => {
        setIsLocked(true);
        setLockPin(['', '', '', '']);
        setLockError('');
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    }, []);

    const scheduleLockAfterOrder = React.useCallback(() => {
        if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
        lockTimerRef.current = setTimeout(() => {
            lockScreen();
        }, 60000); // auto-lock 60s after order completion
    }, [lockScreen]);

    const handleLockPinInput = (index, value) => {
        if (value.length > 1) value = value.slice(-1);
        if (!/^\d*$/.test(value)) return;
        const newPin = [...lockPin];
        newPin[index] = value;
        setLockPin(newPin);
        if (value !== '' && index < 3) {
            document.getElementById(`lock-pin-${index + 1}`)?.focus();
        }
    };

    const handleLockPinKeyDown = (index, e) => {
        if (e.key === 'Backspace' && lockPin[index] === '' && index > 0) {
            document.getElementById(`lock-pin-${index - 1}`)?.focus();
        }
    };

    const handleUnlock = async (e) => {
        e?.preventDefault();
        const entered = lockPin.join('');
        if (entered.length !== 4) return;
        setLockLoading(true);
        setLockError('');
        try {
            const { data: staffList } = await supabase
                .from('staff_access')
                .select('name, pin, is_active')
                .eq('pin', entered)
                .eq('name', staffName)
                .limit(1);
            const match = staffList?.[0];
            if (!match || match.is_active === false) {
                setLockError('Incorrect PIN. Try again.');
                setLockPin(['', '', '', '']);
                document.getElementById('lock-pin-0')?.focus();
            } else {
                setIsLocked(false);
                setLockPin(['', '', '', '']);
                setLockError('');
            }
        } catch {
            setLockError('Could not verify. Check connection.');
        } finally {
            setLockLoading(false);
        }
    };


    // Order info aligned with Google Sheets format
    const [customerName, setCustomerName] = useState('');
    const [customerNameText, setCustomerNameText] = useState('');
    const [customerType, setCustomerType] = useState('New'); // 'New' or 'Returning'
    const [selectedTable, setSelectedTable] = useState('');
    const [selectedBrand, setSelectedBrand] = useState('POT OF JOLLOF');
    const [orderChannel, setOrderChannel] = useState('Walk-in');
    const [diningOption, setDiningOption] = useState('Dine-in'); // 'Dine-in', 'Takeaway', 'Delivery'
    const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH', 'MPESA', 'CARD', etc.
    const [paymentStatus, setPaymentStatus] = useState('Paid'); // 'Paid', 'Pending'
    const [discountType, setDiscountType] = useState('none'); // 'none', 'percentage', 'flat'
    const [discountValue, setDiscountValue] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    
    // Split payment amounts
    const [splitCash, setSplitCash] = useState('');
    const [splitMpesa, setSplitMpesa] = useState('');
    const [splitCard, setSplitCard] = useState('');

    // Clear Sales overlay states
    const [clearSalesModalOpen, setClearSalesModalOpen] = useState(false);
    const [clearAction, setClearAction] = useState('Cancelled'); // 'Cancelled' or 'Declined'
    const [clearBrand, setClearBrand] = useState('POT OF JOLLOF');
    const [clearChannel, setClearChannel] = useState('Walk-in');
    const [clearService, setClearService] = useState('Dine-in');
    const [clearPayment, setClearPayment] = useState('CASH');

    // Auto-Accept Microsite Orders state
    const [autoAcceptMicrositeOrders, setAutoAcceptMicrositeOrders] = useState(() => {
        return localStorage.getItem('pos_auto_accept_orders') === 'true';
    });

    const toggleAutoAcceptOrders = () => {
        const nextVal = !autoAcceptMicrositeOrders;
        setAutoAcceptMicrositeOrders(nextVal);
        localStorage.setItem('pos_auto_accept_orders', String(nextVal));
    };

    const isMicrositeOrder = (o) => {
        if (!o) return false;
        const cashier = (o.cashier_name || '').toLowerCase();
        const channel = (o.order_channel || '').toLowerCase();
        const dining = (o.dining_option || '').toLowerCase();
        return cashier.includes('microsite') || 
               cashier.includes('self-service') ||
               channel.includes('microsite') || 
               channel.includes('self-service') || 
               dining.includes('self-service') ||
               cashier === 'self-service microsite';
    };

    const canAutoAcceptOrder = (orderItems, currentMenu) => {
        if (!orderItems || orderItems.length === 0) return true;
        for (const item of orderItems) {
            const itemName = (item.item_name || item.name || '').toLowerCase().trim();
            const match = (currentMenu || []).find(m => 
                m.id === item.id || 
                (m.name || '').toLowerCase().trim() === itemName
            );
            if (match && match.is_available === false) {
                return false; // Contains out of stock item!
            }
        }
        return true;
    };


    // Register New Guest states
    const [showRegisterGuestModal, setShowRegisterGuestModal] = useState(false);
    const [newGuestFn, setNewGuestFn] = useState('');
    const [newGuestLn, setNewGuestLn] = useState('');
    const [newGuestPhone, setNewGuestPhone] = useState('');
    const [newGuestEmail, setNewGuestEmail] = useState('');
    const [newGuestBrand, setNewGuestBrand] = useState('POT OF JOLLOF');
    const [newGuestChannel, setNewGuestChannel] = useState('Walk-in');
    const [newGuestNotes, setNewGuestNotes] = useState('');
    const [savingGuest, setSavingGuest] = useState(false);
    const [guestSuccessMsg, setGuestSuccessMsg] = useState('');

    useEffect(() => {
        if (showRegisterGuestModal) {
            if (activeBrand && activeBrand !== 'All') setNewGuestBrand(activeBrand);
            if (orderChannel) setNewGuestChannel(orderChannel);
        }
    }, [showRegisterGuestModal, activeBrand, orderChannel]);

    const handleRegisterNewGuest = async (e) => {
        e.preventDefault();
        if (!newGuestFn.trim() || !newGuestPhone.trim()) {
            return alert("First Name and Phone Number are required to register a new guest.");
        }
        setSavingGuest(true);
        try {
            const brandVal = newGuestBrand || (activeBrand !== 'All' ? activeBrand : 'POT OF JOLLOF');
            const channelVal = newGuestChannel || orderChannel || 'Walk-in';
            const userNotes = newGuestNotes.trim();
            const noteDetails = userNotes 
                ? `[Brand: ${brandVal} | Channel: ${channelVal}] ${userNotes}`
                : `[Brand: ${brandVal} | Channel: ${channelVal}]`;

            // Base core guest payload (guaranteed standard columns in Supabase)
            const guestPayload = {
                first_name: newGuestFn.trim(),
                last_name: newGuestLn.trim(),
                phone: newGuestPhone.trim(),
                email: newGuestEmail.trim(),
                notes: noteDetails,
                visit_count: 1,
                lifetime_spend: 0
            };

            // 1. Insert core guest record
            const { data, error } = await supabase.from('guests').insert([guestPayload]).select().single();
            if (error) throw error;

            // 2. Safely attempt to update extra brand & channel columns if present in schema
            if (data && data.id) {
                try {
                    await supabase.from('guests').update({
                        brand: brandVal,
                        preferred_brand: brandVal,
                        channel: channelVal,
                        acquisition_channel: channelVal
                    }).eq('id', data.id);
                } catch (columnErr) {
                    console.warn('Brand/channel column update skipped (stored in notes fallback):', columnErr);
                }
            }

            const fullName = `${newGuestFn.trim()} ${newGuestLn.trim()}`.trim();
            const savedGuestRecord = {
                id: data?.id || `local_${Date.now()}`,
                first_name: newGuestFn.trim(),
                last_name: newGuestLn.trim(),
                phone: newGuestPhone.trim(),
                email: newGuestEmail.trim(),
                brand: brandVal,
                preferred_brand: brandVal,
                channel: channelVal,
                acquisition_channel: channelVal,
                notes: noteDetails,
                visit_count: 1,
                lifetime_spend: 0,
                created_at: new Date().toISOString()
            };

            // Save locally to cache so guest is instantly visible even if DB network has latency
            try {
                const existing = JSON.parse(localStorage.getItem('pos_registered_guests') || '[]');
                existing.unshift(savedGuestRecord);
                localStorage.setItem('pos_registered_guests', JSON.stringify(existing));
            } catch(e) {}

            setCustomerNameText(fullName);
            setCustomerName(fullName);
            
            // Alert user & show success banner
            alert(`✅ Guest "${fullName}" (${brandVal} - ${channelVal}) successfully registered & saved to CRM!`);
            setGuestSuccessMsg(`✅ Guest "${fullName}" (${brandVal} - ${channelVal}) successfully registered and synced to Guest CRM!`);

            setNewGuestFn('');
            setNewGuestLn('');
            setNewGuestPhone('');
            setNewGuestEmail('');
            setNewGuestNotes('');
            setShowRegisterGuestModal(false);

            setTimeout(() => setGuestSuccessMsg(''), 4000);
        } catch (err) {
            alert("Failed to register guest: " + err.message);
        } finally {
            setSavingGuest(false);
        }
    };

    // Auto-sync completed order receipts to Guest CRM (Duplicate-Free Upsert System)
    const syncOrderToGuestCRM = async (order) => {
        try {
            const rawName = (order.customer_name || '').trim();
            // Skip anonymous/walk-in or empty names to avoid cluttering CRM with walk-in duplicates
            if (!rawName || rawName.toLowerCase() === 'walk-in' || rawName.toLowerCase() === 'walk-in guest' || rawName.startsWith('Table ') || rawName.startsWith('T-')) {
                return;
            }

            const nameParts = rawName.split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ');

            const brandVal = order.brand || selectedBrand || 'POT OF JOLLOF';
            const channelVal = order.order_channel || orderChannel || 'Walk-in';
            const orderSpend = parseFloat(order.total_amount || 0);

            const itemSummary = (order.items || []).map(i => `${i.quantity || 1}x ${i.item_name || 'Item'}`).join(', ');

            let existingGuest = null;
            
            // 1. Try finding matching guest in Supabase database
            try {
                const { data: dbGuests } = await supabase.from('guests').select('*');
                if (dbGuests && dbGuests.length > 0) {
                    existingGuest = dbGuests.find(g => {
                        const fullName = `${g.first_name || ''} ${g.last_name || ''}`.trim().toLowerCase();
                        return fullName === rawName.toLowerCase() || (g.first_name && g.first_name.toLowerCase() === rawName.toLowerCase());
                    });
                }
            } catch(e) {}

            // 2. Try finding in local storage cache
            const localSaved = JSON.parse(localStorage.getItem('pos_registered_guests') || '[]');
            if (!existingGuest) {
                existingGuest = localSaved.find(g => {
                    const fullName = `${g.first_name || ''} ${g.last_name || ''}`.trim().toLowerCase();
                    return fullName === rawName.toLowerCase() || (g.first_name && g.first_name.toLowerCase() === rawName.toLowerCase());
                });
            }

            const noteDetails = `[Brand: ${brandVal} | Channel: ${channelVal} | Order #${order.ticket_number || ''}: KES ${orderSpend.toLocaleString()} (${itemSummary})]`;

            if (existingGuest) {
                // 🔄 GUEST EXISTS -> UPSERT / UPDATE (INCREMENT VISIT + SPEND, ZERO DUPLICATES!)
                const newVisitCount = (parseInt(existingGuest.visit_count || 1, 10)) + 1;
                const newSpend = (parseFloat(existingGuest.lifetime_spend || 0)) + orderSpend;
                const updatedNotes = existingGuest.notes ? `${existingGuest.notes}\n${noteDetails}` : noteDetails;

                if (existingGuest.id && !String(existingGuest.id).startsWith('local_')) {
                    try {
                        await supabase.from('guests').update({
                            visit_count: newVisitCount,
                            lifetime_spend: newSpend,
                            brand: brandVal,
                            preferred_brand: brandVal,
                            channel: channelVal,
                            acquisition_channel: channelVal,
                            notes: updatedNotes
                        }).eq('id', existingGuest.id);
                    } catch(err) {
                        try {
                            await supabase.from('guests').update({
                                visit_count: newVisitCount,
                                lifetime_spend: newSpend,
                                notes: updatedNotes
                            }).eq('id', existingGuest.id);
                        } catch(e) {}
                    }
                }

                const updatedLocal = localSaved.map(g => {
                    if (g.id === existingGuest.id || `${g.first_name} ${g.last_name}`.trim().toLowerCase() === rawName.toLowerCase()) {
                        return { ...g, visit_count: newVisitCount, lifetime_spend: newSpend, notes: updatedNotes };
                    }
                    return g;
                });
                localStorage.setItem('pos_registered_guests', JSON.stringify(updatedLocal));

                try {
                    await supabase.from('guest_visits').insert([{
                        guest_id: existingGuest.id,
                        visit_date: order.created_at || new Date().toISOString(),
                        spend: orderSpend,
                        notes: `Order #${order.ticket_number || ''}: ${itemSummary}`
                    }]);
                } catch(e) {}

            } else {
                // ✨ NEW GUEST -> CREATE SINGLE GUEST PROFILE
                const newGuestRecord = {
                    first_name: firstName,
                    last_name: lastName,
                    phone: '',
                    email: '',
                    brand: brandVal,
                    preferred_brand: brandVal,
                    channel: channelVal,
                    acquisition_channel: channelVal,
                    notes: noteDetails,
                    visit_count: 1,
                    lifetime_spend: orderSpend,
                    created_at: order.created_at || new Date().toISOString()
                };

                let insertedId = `local_${Date.now()}`;
                try {
                    const { data: insertedData } = await supabase.from('guests').insert([{
                        first_name: firstName,
                        last_name: lastName,
                        notes: noteDetails,
                        visit_count: 1,
                        lifetime_spend: orderSpend
                    }]).select().single();
                    if (insertedData?.id) insertedId = insertedData.id;
                } catch(e) {}

                const brandNewGuest = { ...newGuestRecord, id: insertedId };
                localSaved.unshift(brandNewGuest);
                localStorage.setItem('pos_registered_guests', JSON.stringify(localSaved));
            }
        } catch (err) {
            console.warn('Auto guest sync error:', err);
        }
    };

    // Out of Stock / 86 Item Management states
    const [itemToTurnOffModal, setItemToTurnOffModal] = useState(null);
    const [switchedOffLog, setSwitchedOffLog] = useState(() => {
        try {
            const saved = localStorage.getItem('pos_switched_off_log');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const confirmTurnOffItem = async (item, durationType) => {
        const todayDate = new Date().toISOString().split('T')[0];
        const timeString = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        try {
            const { error } = await supabase
                .from('pos_menu')
                .update({ 
                    is_available: false, 
                    out_of_stock_type: durationType,
                    out_of_stock_date: todayDate 
                })
                .eq('id', item.id);

            if (error) {
                await supabase.from('pos_menu').update({ is_available: false }).eq('id', item.id);
            }

            setMenu(prev => prev.map(m => m.id === item.id ? { 
                ...m, 
                is_available: false, 
                out_of_stock_type: durationType, 
                out_of_stock_date: todayDate 
            } : m));

            const newEntry = {
                id: item.id,
                name: item.name,
                category: item.category,
                brand: item.brand,
                turned_off_at: timeString,
                date: todayDate,
                type: durationType,
                staffName: staffName || 'Staff'
            };

            const updatedLog = [newEntry, ...switchedOffLog.filter(l => !(l.id === item.id && l.date === todayDate))];
            setSwitchedOffLog(updatedLog);
            localStorage.setItem('pos_switched_off_log', JSON.stringify(updatedLog));

            setItemToTurnOffModal(null);
        } catch (err) {
            alert('Failed to mark item out of stock: ' + err.message);
        }
    };

    const handleTurnOnItem = async (item) => {
        try {
            const { error } = await supabase
                .from('pos_menu')
                .update({ is_available: true, out_of_stock_type: null, out_of_stock_date: null })
                .eq('id', item.id);

            if (error) {
                await supabase.from('pos_menu').update({ is_available: true }).eq('id', item.id);
            }

            setMenu(prev => prev.map(m => m.id === item.id ? { ...m, is_available: true, out_of_stock_type: null, out_of_stock_date: null } : m));
        } catch (err) {
            alert('Failed to turn item back on: ' + err.message);
        }
    };

    // Clickable past orders detail states
    const [viewingOrderDetails, setViewingOrderDetails] = useState(null);
    const [isChangingPaymentMethod, setIsChangingPaymentMethod] = useState(false);
    const [isChangingOrderChannel, setIsChangingOrderChannel] = useState(false);
    const [shiftSummary, setShiftSummary] = useState({
        totalSales: 0,
        totalOrders: 0,
        cashSales: 0,
        cardSales: 0,
        imPaybillSales: 0,
        appSales: 0
    });
    const [returningOrderId, setReturningOrderId] = useState(null);
    const [returnReason, setReturnReason] = useState('');
    const [customReturnReason, setCustomReturnReason] = useState('');

    // QZ Tray printer integration
    const [qzConnected, setQzConnected] = useState(false);
    const [qzPrinterList, setQzPrinterList] = useState([]);
    const [frontDeskPrinter, setFrontDeskPrinter] = useState(() => localStorage.getItem('pos_front_desk_printer') || '');
    const [kitchenPrinter, setKitchenPrinter] = useState(() => localStorage.getItem('pos_kitchen_printer') || '');
    const [qzError, setQzError] = useState('');
    const [loadingPrinters, setLoadingPrinters] = useState(false);

    // Group past orders calendar filter
    const [historyStartDate, setHistoryStartDate] = useState(() => {
        const d = new Date();
        // If it is before 7:00 AM local time, default to the previous business day
        if (d.getHours() < 7) {
            d.setDate(d.getDate() - 1);
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [historyEndDate, setHistoryEndDate] = useState(() => {
        const d = new Date();
        // If it is before 7:00 AM local time, default to the previous business day
        if (d.getHours() < 7) {
            d.setDate(d.getDate() - 1);
        }
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [prevPeriodSales, setPrevPeriodSales] = useState(0);
    const [customOrderDate, setCustomOrderDate] = useState('');
    const isHistoryRestricted = React.useMemo(() => {
        return (staffRole === 'cashier' || staffRole === 'waiter') && staffRestricted !== false;
    }, [staffRole, staffRestricted]);

    const canViewRevenue = React.useMemo(() => {
        if (!staffRole) return true;
        const roleLower = staffRole.toLowerCase();
        if (roleLower === 'admin' || roleLower === 'manager') return true;
        return staffRestricted === false;
    }, [staffRole, staffRestricted]);
    
    const [submitting, setSubmitting] = useState(false);
    const [activeReceipt, setActiveReceipt] = useState(null); // Loaded after success for printing

    // Active order tracking (if editing open order)
    const [editingOrderId, setEditingOrderId] = useState(null);

    // Order history states
    const [activeView, setActiveView] = useState('menu'); // 'menu', 'tables', 'history', 'menu_settings'
    const [historyOrders, setHistoryOrders] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historySearch, setHistorySearch] = useState('');

    // Open orders (for tables mapping)
    const [openOrders, setOpenOrders] = useState([]);

    // Split bill states
    const [splitBillModalOpen, setSplitBillModalOpen] = useState(false);
    const [splitBillMode, setSplitBillMode] = useState('custom'); // 'custom' | 'even' | 'items' | 'payment'
    const [splitBillCount, setSplitBillCount] = useState(2);
    const [splitCustomAmounts, setSplitCustomAmounts] = useState({}); // { 1: '2000', 2: '3200' }
    const [splitReceiptsData, setSplitReceiptsData] = useState(null); // data for printing splits
    const [splitBillOrderTotal, setSplitBillOrderTotal] = useState(null); // when opened from Order Details (not cart)
    const [splitBillTargetOrder, setSplitBillTargetOrder] = useState(null); // target order object when splitting from Order Details
    const [splitBillTargetItems, setSplitBillTargetItems] = useState([]); // items list with guestNo for target order
    const [splitImPaybill, setSplitImPaybill] = useState(''); // I&M Paybill portion for split payment
    const [partialPaymentMethod, setPartialPaymentMethod] = useState('Cash');
    const [partialPaymentAmount, setPartialPaymentAmount] = useState('');

    const openSplitBillForOrder = (targetOrder, calculatedTotal) => {
        setSplitBillTargetOrder(targetOrder);
        setSplitBillOrderTotal(calculatedTotal);
        const rawItems = (targetOrder?.items || targetOrder?.pos_order_items || []).map(i => ({
            ...i,
            name: i.item_name || i.name,
            price: parseFloat(i.price) || 0,
            quantity: parseFloat(i.quantity) || 1,
            guestNo: i.guestNo || 1
        }));
        setSplitBillTargetItems(rawItems);
        setSplitBillCount(2);
        setSplitCustomAmounts({});
        setSplitBillMode('custom');
        setSplitReceiptsData(null);
        setSplitBillModalOpen(true);
    };

    const openSplitBillForCart = () => {
        setSplitBillTargetOrder(null);
        setSplitBillOrderTotal(null);
        setSplitBillCount(2);
        setSplitCustomAmounts({});
        setSplitBillMode('custom');
        setSplitReceiptsData(null);
        setSplitBillModalOpen(true);
    };


    // Audio sound alert settings
    const [alertSound, setAlertSound] = useState(() => localStorage.getItem('pos_alert_sound') || 'chime');
    const [alertVolume, setAlertVolume] = useState(() => parseFloat(localStorage.getItem('pos_alert_volume') || '0.8'));
    const [alertEnabled, setAlertEnabled] = useState(() => localStorage.getItem('pos_alert_enabled') !== 'false');

    const playAlertSound = (customSound = null, customVolume = null) => {
        try {
            const snd = customSound || alertSound;
            const vol = customVolume !== null ? customVolume : alertVolume;
            if (vol <= 0) return;

            // Initialize browser audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            if (snd === 'chime') {
                // Warm dual-frequency chime
                const now = ctx.currentTime;
                
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'triangle';
                osc1.frequency.setValueAtTime(587.33, now); // D5
                osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.15); // A5

                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(659.25, now); // E5
                osc2.frequency.exponentialRampToValueAtTime(987.77, now + 0.15); // B5

                gain.gain.setValueAtTime(vol * 0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ctx.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.8);
                osc2.stop(now + 0.8);
            } 
            else if (snd === 'bell') {
                // High bell ring with decay
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(987.77, now); // B5 high tone
                
                gain.gain.setValueAtTime(vol, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(now);
                osc.stop(now + 1.2);
            } 
            else if (snd === 'digital') {
                // Quick digital sequence beep beep beep
                const now = ctx.currentTime;
                const notes = [600, 800, 1000];
                const noteDuration = 0.08;
                const noteGap = 0.04;

                notes.forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const start = now + idx * (noteDuration + noteGap);

                    osc.type = 'square';
                    osc.frequency.setValueAtTime(freq, start);

                    gain.gain.setValueAtTime(vol * 0.15, start);
                    gain.gain.setValueAtTime(vol * 0.15, start + noteDuration - 0.01);
                    gain.gain.exponentialRampToValueAtTime(0.001, start + noteDuration);

                    osc.connect(gain);
                    gain.connect(ctx.destination);

                    osc.start(start);
                    osc.stop(start + noteDuration + 0.01);
                });
            }
        } catch (err) {
            console.error('Failed to play synthesized alert sound:', err);
        }
    };

    // Dynamic modifier groups, staff terminal access states
    const [modifierGroups, setModifierGroups] = useState([]);
    const [loadingModifiers, setLoadingModifiers] = useState(false);
    const [staffList, setStaffList] = useState([]);
    const [editingStaffId, setEditingStaffId] = useState(null);
    const [editingStaffName, setEditingStaffName] = useState('');
    const [editingStaffPin, setEditingStaffPin] = useState('');
    const [editingStaffRole, setEditingStaffRole] = useState('staff');
    const [editingStaffActive, setEditingStaffActive] = useState(true);
    const [editingStaffTodayYesterdayOnly, setEditingStaffTodayYesterdayOnly] = useState(true);
    const [clearingPendingOrder, setClearingPendingOrder] = useState(null);
    const [clearingPaymentMethod, setClearingPaymentMethod] = useState('CASH');
    const [clearingBrand, setClearingBrand] = useState('POT OF JOLLOF');
    const [clearingChannel, setClearingChannel] = useState('Walk-in');
    const [clearingService, setClearingService] = useState('Dine-in');

    const handleOpenClearModal = (order) => {
        setClearingPendingOrder(order);
        setClearingBrand(order.brand || 'POT OF JOLLOF');
        setClearingChannel(order.order_channel || 'Walk-in');
        setClearingService(order.dining_option || 'Dine Inn');
        setClearingPaymentMethod(order.payment_method || 'CASH');
    };
    const [loadingStaff, setLoadingStaff] = useState(false);

    // Menu settings tabs and editing states
    const [menuSettingsTab, setMenuSettingsTab] = useState('items'); // 'items', 'customisations', 'categories', 'discounts'
    const [editingItem, setEditingItem] = useState(null);
    const [linkedGroupIds, setLinkedGroupIds] = useState([]);
    const [editingModifierGroup, setEditingModifierGroup] = useState(null);
    const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [catLinkedItemIds, setCatLinkedItemIds] = useState([]);
    const [catItemSearch, setCatItemSearch] = useState('');
    
    // Discounts settings states
    const [discountsList, setDiscountsList] = useState([]);
    const [loadingDiscounts, setLoadingDiscounts] = useState(false);
    const [editingDiscount, setEditingDiscount] = useState(null);

    // Menu image upload handler
    const handleImageUpload = async (menuItemId, file) => {
        if (!file || !menuItemId) return;
        try {
            const ext = file.name.split('.').pop();
            const filePath = `menu_items/${menuItemId}_${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage
                .from('menu_images')
                .upload(filePath, file, { upsert: true });
            if (uploadError) throw uploadError;
            const { data: urlData } = supabase.storage.from('menu_images').getPublicUrl(filePath);
            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) throw new Error('Could not get public URL');
            await supabase.from('pos_menu').update({ image_url: publicUrl }).eq('id', menuItemId);
            setEditingItem(prev => prev ? { ...prev, image_url: publicUrl } : prev);
            setMenu(prev => prev.map(m => m.id === menuItemId ? { ...m, image_url: publicUrl } : m));
        } catch (err) {
            console.error('Image upload failed:', err);
            alert('Image upload failed: ' + err.message);
        }
    };

    // Preload all brand logos eagerly so they're cached before the picker renders
    useEffect(() => {
        BRAND_OPTIONS.forEach(br => {
            const img = new Image();
            img.src = br.logo;
        });
    }, []);

    // Sync linked modifier group selection when editingItem updates
    useEffect(() => {
        if (editingItem) {
            if (editingItem.id) {
                const linked = modifierGroups
                    .filter(g => (g.menu_item_ids || []).includes(editingItem.id))
                    .map(g => g.id);
                setLinkedGroupIds(linked);
            } else {
                setLinkedGroupIds([]);
            }
        } else {
            setLinkedGroupIds([]);
        }
    }, [editingItem, modifierGroups]);

    // Sync items in active category when editingCategory updates
    useEffect(() => {
        if (editingCategory) {
            const linked = menu
                .filter(item => item.category === editingCategory.name)
                .map(item => item.id);
            setCatLinkedItemIds(linked);
            setCatItemSearch('');
        } else {
            setCatLinkedItemIds([]);
            setCatItemSearch('');
        }
    }, [editingCategory, menu]);

    // Form visibility states
    const [showAddItemForm, setShowAddItemForm] = useState(false);
    const [showAddModifierForm, setShowAddModifierForm] = useState(false);
    const [showAddStaffForm, setShowAddStaffForm] = useState(false);
    const [showCartConfig, setShowCartConfig] = useState(false);

    // Auto-connect QZ Tray on mount, listen for status changes
    useEffect(() => {
        onQZStatusChange((connected) => setQzConnected(connected));
        connectQZ()
            .then(() => setQzConnected(true))
            .catch(() => setQzConnected(false));
        return () => { disconnectQZ().catch(() => {}); };
    }, []);

    // Save printer names to localStorage whenever they change
    useEffect(() => { localStorage.setItem('pos_front_desk_printer', frontDeskPrinter); }, [frontDeskPrinter]);
    useEffect(() => { localStorage.setItem('pos_kitchen_printer', kitchenPrinter); }, [kitchenPrinter]);

    useEffect(() => {
        if (diningOption === 'Delivery' && customerNameText.trim()) {
            const fetchSavedAddress = async () => {
                try {
                    const { data, error } = await supabase
                        .from('pos_customer_addresses')
                        .select('address')
                        .eq('customer_name', customerNameText.trim().toLowerCase())
                        .maybeSingle();
                    if (data && data.address) {
                        setDeliveryAddress(data.address);
                    }
                } catch (e) {
                    console.error('Error fetching customer address:', e);
                }
            };
            fetchSavedAddress();
        } else if (diningOption !== 'Delivery') {
            setDeliveryAddress('');
        }
    }, [diningOption, customerNameText]);

    // Prevent Paid to APP from being selected/retained for non-app channels
    useEffect(() => {
        if (!['ubereats', 'uber eats', 'glovo', 'bolt food', 'ando'].includes(String(orderChannel || '').toLowerCase())) {
            if (paymentMethod === 'Paid to APP') {
                setPaymentMethod('CASH');
            }
        }
    }, [orderChannel, paymentMethod]);

    // Prevent Paid to APP from being retained in the clear modal for non-app channels
    useEffect(() => {
        if (!['ubereats', 'uber eats', 'glovo', 'bolt food', 'ando'].includes(String(clearingChannel || '').toLowerCase())) {
            if (clearingPaymentMethod === 'Paid to APP') {
                setClearingPaymentMethod('CASH');
            }
        }
    }, [clearingChannel, clearingPaymentMethod]);

    // Offline Queue Auto-Sync Loop
    useEffect(() => {
        let isSyncing = false;
        
        const syncOfflineData = async () => {
            if (isSyncing || !navigator.onLine) return;
            isSyncing = true;
            
            try {
                // 1. Sync offline shifts first
                const offlineShifts = JSON.parse(localStorage.getItem('pos_offline_shifts_queue') || '[]');
                if (offlineShifts.length > 0) {
                    console.log(`Found ${offlineShifts.length} offline shifts to sync...`);
                    const remainingShifts = [];
                    
                    for (const shift of offlineShifts) {
                        try {
                            if (shift.closed_at) {
                                // If already closed, create closed shift directly
                                const { error } = await supabase
                                    .from('pos_shifts')
                                    .insert([{
                                        cashier_name: shift.cashier_name,
                                        opening_float: shift.opening_float,
                                        expected_cash: shift.expected_cash,
                                        actual_cash: shift.actual_cash,
                                        closed_at: shift.closed_at
                                    }]);
                                if (error) throw error;
                            } else {
                                // Just open shift
                                const { error } = await supabase
                                    .from('pos_shifts')
                                    .insert([{
                                        cashier_name: shift.cashier_name,
                                        opening_float: shift.opening_float,
                                        expected_cash: shift.expected_cash
                                    }]);
                                if (error) throw error;
                            }
                            console.log(`Successfully synced offline shift: ${shift.id}`);
                        } catch (err) {
                            console.error("Failed to sync shift, keeping in queue:", err);
                            remainingShifts.push(shift);
                        }
                    }
                    localStorage.setItem('pos_offline_shifts_queue', JSON.stringify(remainingShifts));
                }

                // 2. Sync offline orders
                const offlineOrders = JSON.parse(localStorage.getItem('pos_offline_orders_queue') || '[]');
                if (offlineOrders.length > 0) {
                    console.log(`Found ${offlineOrders.length} offline orders to sync...`);
                    const remainingOrders = [];
                    
                    for (const order of offlineOrders) {
                        try {
                            // Strip temporary offline IDs and prepare payload
                            const { id, is_offline, ticket_number, ...headerPayload } = order.header;
                            
                            // Insert header
                            const { data: serverOrder, error: headerError } = await supabase
                                .from('pos_orders')
                                .insert([headerPayload])
                                .select()
                                .single();
                                
                            if (headerError) throw headerError;
                            
                            // Insert items with new server order ID
                            const itemsPayload = order.items.map(item => ({
                                order_id: serverOrder.id,
                                item_name: item.item_name,
                                quantity: item.quantity,
                                price: item.price,
                                instructions: item.instructions || ''
                            }));
                            
                            const { error: itemsError } = await supabase
                                .from('pos_order_items')
                                .insert(itemsPayload);
                                
                            if (itemsError) throw itemsError;
                            
                            console.log(`Successfully synced offline order #${obfuscateTicket(serverOrder.ticket_number)}`);
                        } catch (err) {
                            console.error("Failed to sync offline order, keeping in queue:", err);
                            remainingOrders.push(order);
                        }
                    }
                    
                    localStorage.setItem('pos_offline_orders_queue', JSON.stringify(remainingOrders));
                    if (remainingOrders.length === 0) {
                        fetchOpenOrders();
                        fetchHistory();
                    }
                }
                
                // 3. Sync offline status updates (like voiding)
                const offlineUpdates = JSON.parse(localStorage.getItem('pos_offline_updates_queue') || '[]');
                if (offlineUpdates.length > 0) {
                    console.log(`Found ${offlineUpdates.length} offline updates to sync...`);
                    const remainingUpdates = [];
                    
                    for (const update of offlineUpdates) {
                        try {
                            if (update.type === 'update_order') {
                                const { error } = await supabase
                                    .from('pos_orders')
                                    .update(update.payload)
                                    .eq('id', update.id);
                                if (error) throw error;
                            }
                            console.log(`Successfully synced offline update for order ${update.id}`);
                        } catch (err) {
                            console.error("Failed to sync update, keeping in queue:", err);
                            remainingUpdates.push(update);
                        }
                    }
                    
                    localStorage.setItem('pos_offline_updates_queue', JSON.stringify(remainingUpdates));
                }
            } catch (syncErr) {
                console.error("Error during offline sync process:", syncErr);
            } finally {
                isSyncing = false;
            }
        };
        
        const intervalId = setInterval(syncOfflineData, 10000);
        window.addEventListener('online', syncOfflineData);
        
        return () => {
            clearInterval(intervalId);
            window.removeEventListener('online', syncOfflineData);
        };
    }, [openOrders]);

    const handleDetectPrinters = async () => {
        setLoadingPrinters(true);
        setQzError('');
        try {
            const printers = await listPrinters();
            setQzPrinterList(printers);
        } catch (err) {
            setQzError('Could not reach QZ Tray. Make sure it is running on this computer.');
        } finally {
            setLoadingPrinters(false);
        }
    };

    const handleAcceptOrder = async (order, options = {}) => {
        const { silent = false } = options;
        try {
            const { error } = await supabase
                .from('pos_orders')
                .update({ 
                    status: 'Accepted',
                    payment_status: 'Paid'
                })
                .eq('id', order.id);
            
            if (error) throw error;
            
            // Update local state instantly so UI badge changes to Paid/Accepted immediately
            setHistoryOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'Accepted', payment_status: 'Paid' } : o));
            setOpenOrders(prev => prev.filter(o => o.id !== order.id));

            // Build receipt structure for routing to printers
            const receiptData = {
                id: order.id,
                ticket_number: order.ticket_number,
                created_at: order.created_at,
                customer_name: order.customer_name,
                dining_option: order.dining_option,
                payment_method: order.payment_method || 'Cash',
                payment_status: 'Paid',
                total_amount: order.total_amount,
                discount: order.discount || 0,
                cashier_name: order.cashier_name,
                splitDetails: order.notes,
                items: order.items
            };

            // FOH Cashier Slips routing
            printOrFallback(
                frontDeskPrinter,
                buildCashierSlipsHTML(receiptData),
                () => printCashierSlips(receiptData)
            ).catch(console.warn);

            // KOT Kitchen Slips routing
            if (kitchenPrinter) {
                printOrFallback(
                    kitchenPrinter,
                    buildKitchenSlipsHTML(receiptData),
                    () => printKitchenSlips(receiptData)
                ).catch(console.warn);
            }

            if (!silent) {
                alert(`Order #${obfuscateTicket(order.ticket_number)} accepted & receipt printed successfully!`);
            }
            fetchOpenOrders();
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
            if (typeof fetchHistory === 'function') fetchHistory(today, today);
        } catch (err) {
            if (!silent) alert('Failed to accept order: ' + err.message);
        }
    };


    const handleDeclineOrder = async (order) => {
        const reason = prompt(`Reason for declining Order #${obfuscateTicket(order.ticket_number)}?`, 'Out of stock');
        if (reason === null) return;

        try {
            const declineNote = reason ? `Declined: ${reason}` : 'Declined by staff';
            const { error } = await supabase
                .from('pos_orders')
                .update({ 
                    status: 'Declined', 
                    payment_status: 'Voided',
                    notes: order.notes ? `${order.notes} | ${declineNote}` : declineNote
                })
                .eq('id', order.id);
            
            if (error) throw error;

            // Update local state instantly so ticket disappears from open/pending and updates status badge
            setHistoryOrders(prev => prev.map(o => o.id === order.id ? { 
                ...o, 
                status: 'Declined', 
                payment_status: 'Voided',
                notes: order.notes ? `${order.notes} | ${declineNote}` : declineNote
            } : o));
            setOpenOrders(prev => prev.filter(o => o.id !== order.id));

            alert(`Order #${obfuscateTicket(order.ticket_number)} declined.`);
            fetchOpenOrders();
            const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
            if (typeof fetchHistory === 'function') fetchHistory(today, today);
        } catch (err) {
            alert('Failed to decline order: ' + err.message);
        }
    };



    const openClearSalesModal = () => {
        if (!editingOrderId) return;
        const currentOrder = openOrders.find(o => o.id === editingOrderId);
        if (currentOrder) {
            setClearBrand(currentOrder.brand || 'POT OF JOLLOF');
            setClearChannel(currentOrder.order_channel || 'Walk-in');
            setClearService(currentOrder.dining_option || 'Dine Inn');
            setClearPayment(currentOrder.payment_method || 'CASH');
            setClearAction('Cancelled');
            setClearSalesModalOpen(true);
        } else {
            // Safe fallback if not pre-fetched in openOrders
            setClearBrand(selectedBrand);
            setClearChannel(orderChannel);
            setClearService(diningOption);
            setClearPayment(paymentMethod);
            setClearAction('Cancelled');
            setClearSalesModalOpen(true);
        }
    };

    const dispatchUberDirectRider = async (order) => {
        if (!order) return;
        const address = order.delivery_address || '';
        if (!address.trim()) {
            alert(`No delivery address saved for Order #${obfuscateTicket(order.ticket_number)}. Cannot request Uber Direct rider.`);
            return;
        }

        try {
            console.log(`[Uber Direct] Requesting rider for Order #${obfuscateTicket(order.ticket_number)} to ${address}...`);
            
            const { error } = await supabase
                .from('pos_orders')
                .update({ 
                    rider_status: 'requested',
                    rider_tracking_url: 'https://direct.uber.com/track/stub-uber-direct-tracking'
                })
                .eq('id', order.id);

            if (error) throw error;

            // Log action in integrations log list
            const logs = JSON.parse(localStorage.getItem('pos_api_logs') || '[]');
            logs.unshift({
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                type: 'info',
                msg: `📦 [Uber Direct] Rider requested for Order #${obfuscateTicket(order.ticket_number)} (Deliver to: ${address})`
            });
            localStorage.setItem('pos_api_logs', JSON.stringify(logs.slice(0, 50)));

            // Update state in modal if open
            if (viewingOrderDetails && viewingOrderDetails.id === order.id) {
                setViewingOrderDetails(prev => ({
                    ...prev,
                    rider_status: 'requested',
                    rider_tracking_url: 'https://direct.uber.com/track/stub-uber-direct-tracking'
                }));
            }

            fetchOpenOrders();
            alert(`Uber Direct rider requested successfully for Order #${obfuscateTicket(order.ticket_number)}!`);
        } catch (e) {
            console.error('Uber Direct Dispatch Error:', e);
            alert('Failed to dispatch Uber Direct rider: ' + e.message);
        }
    };

    const handleVacateTable = async (orderId) => {
        try {
            const isOffline = !navigator.onLine;
            
            if (isOffline || String(orderId).startsWith('offline-')) {
                // Handle offline vacate
                const offlineOrders = JSON.parse(localStorage.getItem('pos_offline_orders_queue') || '[]');
                const idx = offlineOrders.findIndex(q => q.header.id === orderId);
                if (idx !== -1) {
                    offlineOrders[idx].header.status = 'Completed';
                    localStorage.setItem('pos_offline_orders_queue', JSON.stringify(offlineOrders));
                } else {
                    // Queue vacate update
                    const offlineUpdates = JSON.parse(localStorage.getItem('pos_offline_updates_queue') || '[]');
                    offlineUpdates.push({
                        type: 'update_order',
                        id: orderId,
                        payload: { status: 'Completed' }
                    });
                    localStorage.setItem('pos_offline_updates_queue', JSON.stringify(offlineUpdates));
                }
                
                setOpenOrders(prev => prev.filter(o => o.id !== orderId));
                setCart([]);
                setCartOpen(false);
                setCustomerName('');
                setEditingOrderId(null);
                alert('Table vacated locally! It will sync when online.');
                return;
            }

            const { error } = await supabase
                .from('pos_orders')
                .update({ status: 'Completed' })
                .eq('id', orderId);

            if (error) throw error;
            
            // Clear active order states if this was the current order
            if (editingOrderId === orderId) {
                setCart([]);
                setCartOpen(false);
                setCustomerName('');
                setEditingOrderId(null);
            }
            
            fetchOpenOrders();
            alert('Table marked vacant.');
        } catch (err) {
            console.error('Error vacating table:', err);
            alert('Failed to vacate table: ' + err.message);
        }
    };

    const handleVoidOrderSubmit = async () => {
        try {
            const isOffline = !navigator.onLine;

            if (isOffline || String(editingOrderId).startsWith('offline-')) {
                // If it is an offline order, check if it's in the offline queue and update it
                const offlineOrders = JSON.parse(localStorage.getItem('pos_offline_orders_queue') || '[]');
                const idx = offlineOrders.findIndex(q => q.header.id === editingOrderId);
                if (idx !== -1) {
                    offlineOrders[idx].header.status = clearAction;
                    offlineOrders[idx].header.payment_status = 'Voided';
                    localStorage.setItem('pos_offline_orders_queue', JSON.stringify(offlineOrders));
                } else {
                    // Queue void action for online order
                    const offlineUpdates = JSON.parse(localStorage.getItem('pos_offline_updates_queue') || '[]');
                    offlineUpdates.push({
                        type: 'update_order',
                        id: editingOrderId,
                        payload: {
                            status: clearAction,
                            payment_status: 'Voided',
                            brand: clearBrand,
                            order_channel: clearChannel,
                            dining_option: clearService,
                            payment_method: clearPayment
                        }
                    });
                    localStorage.setItem('pos_offline_updates_queue', JSON.stringify(offlineUpdates));
                }

                // Update local state
                setOpenOrders(prev => prev.map(o => o.id === editingOrderId ? { ...o, status: clearAction, payment_status: 'Voided' } : o));
                setClearSalesModalOpen(false);
                setCart([]);
                setCartOpen(false);
                setCustomerName('');
                setEditingOrderId(null);
                setActiveView('tables');
                alert('Order voided locally! It will sync when online.');
                return;
            }

            const { error } = await supabase
                .from('pos_orders')
                .update({
                    status: clearAction, // 'Cancelled' or 'Declined'
                    payment_status: 'Voided',
                    brand: clearBrand,
                    order_channel: clearChannel,
                    dining_option: clearService,
                    payment_method: clearPayment
                })
                .eq('id', editingOrderId);

            if (error) throw error;

            setClearSalesModalOpen(false);
            setCart([]);
            setCartOpen(false);
            setCustomerName('');
            setEditingOrderId(null);
            setActiveView('tables');
            fetchOpenOrders();
        } catch (err) {
            alert('Failed to clear order: ' + err.message);
        }
    };

    const handlePartialPayment = async () => {
        if (!editingOrderId) {
            alert('Partial payments are only available for ongoing open orders.');
            return;
        }
        const payAmount = parseFloat(partialPaymentAmount);
        if (isNaN(payAmount) || payAmount <= 0) {
            alert('Please enter a valid payment amount.');
            return;
        }
        if (payAmount >= total) {
            alert('Payment amount equals or exceeds the grand total. Please checkout normally to close this bill.');
            return;
        }

        try {
            const currentOrder = openOrders.find(o => o.id === editingOrderId);
            const remainingTotal = total - payAmount;
            const updatedNotes = (currentOrder.notes ? currentOrder.notes + '; ' : '') + 
                `Partial Pay: KES ${payAmount} via ${partialPaymentMethod} on ${new Date().toLocaleTimeString()}`;

            // Update order header: subtract paid portion from total_amount
            const { data: updatedOrder, error } = await supabase
                .from('pos_orders')
                .update({
                    total_amount: remainingTotal,
                    notes: updatedNotes
                })
                .eq('id', editingOrderId)
                .select()
                .single();

            if (error) throw error;

            // Show confirmation and open a receipt for the partial share paid
            alert(`Partial payment of KES ${payAmount.toLocaleString()} successfully recorded! Remaining balance: KES ${remainingTotal.toLocaleString()}`);

            // Set receipt preview for the paying guest
            setActiveReceipt({
                id: updatedOrder.id,
                ticket_number: updatedOrder.ticket_number,
                created_at: new Date().toISOString(),
                customer_name: `${customerName} (Guest Share)`,
                dining_option: diningOption,
                payment_method: partialPaymentMethod,
                payment_status: 'Paid (Partial)',
                total_amount: payAmount,
                discount: 0,
                cashier_name: staffName || 'Cashier',
                splitDetails: `Remaining Balance: KES ${remainingTotal.toLocaleString()}`,
                items: cart.map(i => ({ item_name: i.name, quantity: i.quantity, price: i.price }))
            });

            // Reload open orders and sync active cart balance
            fetchOpenOrders();
            setSplitBillModalOpen(false);
            setPartialPaymentAmount('');
        } catch (err) {
            alert('Failed to process partial payment: ' + err.message);
        }
    };

    // Shift management states
    const [activeShift, setActiveShift] = useState(null);
    const [checkingShift, setCheckingShift] = useState(true);
    const [openingFloatInput, setOpeningFloatInput] = useState('');
    const [closingCashInput, setClosingCashInput] = useState('');
    const [closingCardInput, setClosingCardInput] = useState('');
    const [closingModalOpen, setClosingModalOpen] = useState(false);
    const [zReportData, setZReportData] = useState(null);

    const checkActiveShift = async () => {
        setCheckingShift(true);
        try {
            const { data, error } = await supabase
                .from('pos_shifts')
                .select('*')
                .eq('cashier_name', staffName || 'Cashier')
                .is('closed_at', null)
                .maybeSingle();

            if (error) throw error;
            setActiveShift(data || null);
            if (data) {
                localStorage.setItem('pos_cache_active_shift_' + staffName, JSON.stringify(data));
            } else {
                localStorage.removeItem('pos_cache_active_shift_' + staffName);
            }
        } catch (err) {
            console.error('Error checking active shift:', err);
            const cached = localStorage.getItem('pos_cache_active_shift_' + staffName);
            if (cached) {
                setActiveShift(JSON.parse(cached));
            }
        } finally {
            setCheckingShift(false);
        }
    };

    const handleOpenShift = async () => {
        const floatVal = 0;

        try {
            const { data, error } = await supabase
                .from('pos_shifts')
                .insert([{
                    cashier_name: staffName || 'Cashier',
                    opening_float: floatVal,
                    expected_cash: floatVal
                }])
                .select()
                .single();

            if (error) throw error;
            setActiveShift(data);
            setOpeningFloatInput('');
            localStorage.setItem('pos_cache_active_shift_' + staffName, JSON.stringify(data));
        } catch (err) {
            console.warn('Failed to open shift online, opening offline shift:', err);
            const offlineShift = {
                id: 'offline-shift-' + Date.now(),
                cashier_name: staffName || 'Cashier',
                opening_float: floatVal,
                expected_cash: floatVal,
                opened_at: new Date().toISOString()
            };
            setActiveShift(offlineShift);
            setOpeningFloatInput('');
            localStorage.setItem('pos_cache_active_shift_' + staffName, JSON.stringify(offlineShift));
            
            // Queue the shift creation for offline sync
            const offlineShifts = JSON.parse(localStorage.getItem('pos_offline_shifts_queue') || '[]');
            offlineShifts.push(offlineShift);
            localStorage.setItem('pos_offline_shifts_queue', JSON.stringify(offlineShifts));
        }
    };

    const handleCloseShift = async () => {
        try {
            // Helper to get today's 7:00 AM EAT business day start timestamp
            const now = new Date();
            const d = new Date();
            if (now.getHours() < 7) {
                d.setDate(d.getDate() - 1);
            }
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const todayStartIso = new Date(`${year}-${month}-${day}T07:00:00.000+03:00`).toISOString();

            // Clamp shift start date: take activeShift.opened_at if opened today, otherwise force today's start
            let shiftStartIso = todayStartIso;
            if (activeShift && activeShift.opened_at) {
                const shiftOpenedIso = new Date(activeShift.opened_at).toISOString();
                if (shiftOpenedIso > todayStartIso) {
                    shiftStartIso = shiftOpenedIso;
                }
            }

            // Check if activeShift is offline or network is down
            if (String(activeShift.id).startsWith('offline-') || !navigator.onLine) {
                let totalCashSales = 0;
                let totalMpesaSales = 0;
                let totalCardSales = 0;
                let shiftOrdersCount = 0;

                const cachedHistory = JSON.parse(localStorage.getItem('pos_cache_history') || '[]');
                const offlineQueue = JSON.parse(localStorage.getItem('pos_offline_orders_queue') || '[]');

                const allOrders = [
                    ...cachedHistory,
                    ...offlineQueue.map(q => q.header)
                ].filter(o => o.created_at >= shiftStartIso && (staffName ? (o.cashier_name || '').toLowerCase() === staffName.toLowerCase() : true));

                allOrders.forEach(order => {
                    shiftOrdersCount++;
                    if (order.payment_method === 'Cash') {
                        totalCashSales += order.total_amount;
                    } else if (order.payment_method === 'M-Pesa') {
                        totalMpesaSales += order.total_amount;
                    } else if (order.payment_method === 'Card') {
                        totalCardSales += order.total_amount;
                    } else if (order.payment_method === 'Split') {
                        const notes = order.notes || '';
                        const cashMatch = notes.match(/Cash \(KES ([\d.]+)\)/);
                        const mpesaMatch = notes.match(/M-Pesa \(KES ([\d.]+)\)/);
                        const cardMatch = notes.match(/Card \(KES ([\d.]+)\)/);

                        if (cashMatch) totalCashSales += parseFloat(cashMatch[1]) || 0;
                        if (mpesaMatch) totalMpesaSales += parseFloat(mpesaMatch[1]) || 0;
                        if (cardMatch) totalCardSales += parseFloat(cardMatch[1]) || 0;
                    }
                });

                const expectedCashTotal = parseFloat(activeShift.opening_float || 0) + totalCashSales;
                const actualCashVal = closingCashInput !== '' ? (parseFloat(closingCashInput) || 0) : expectedCashTotal;
                const actualCardVal = closingCardInput !== '' ? (parseFloat(closingCardInput) || 0) : totalCardSales;

                const closedOfflineShift = {
                    ...activeShift,
                    closed_at: new Date().toISOString(),
                    actual_cash: actualCashVal,
                    actual_card: actualCardVal,
                    expected_cash: expectedCashTotal,
                    expected_mpesa: totalMpesaSales,
                    expected_card: totalCardSales
                };

                // Remove from cache and state
                setActiveShift(null);
                setClosingCashInput('');
                setClosingCardInput('');
                setClosingModalOpen(false);
                localStorage.removeItem('pos_cache_active_shift_' + staffName);

                // Queue shift closure
                const offlineShifts = JSON.parse(localStorage.getItem('pos_offline_shifts_queue') || '[]');
                const idx = offlineShifts.findIndex(s => s.id === activeShift.id);
                if (idx !== -1) {
                    offlineShifts[idx] = closedOfflineShift;
                } else {
                    offlineShifts.push(closedOfflineShift);
                }
                localStorage.setItem('pos_offline_shifts_queue', JSON.stringify(offlineShifts));

                setZReportData({
                    shift: closedOfflineShift,
                    ordersCount: shiftOrdersCount,
                    cashSales: totalCashSales,
                    mpesaSales: totalMpesaSales,
                    cardSales: totalCardSales,
                    totalSales: totalCashSales + totalMpesaSales + totalCardSales
                });

                alert('Shift closed offline successfully! Z-Report generated locally.');
                return;
            }

            // 1. Fetch all orders completed strictly during today's shift window
            let query = supabase
                .from('pos_orders')
                .select('*')
                .gte('created_at', shiftStartIso)
                .eq('payment_status', 'Paid')
                .neq('status', 'Returned')
                .neq('status', 'Cancelled');

            if (staffName) {
                query = query.ilike('cashier_name', staffName);
            }

            const { data: orders, error: ordersError } = await query;
            if (ordersError) throw ordersError;

            // 2. Tally expected totals by payment method
            let totalCashSales = 0;
            let totalMpesaSales = 0;
            let totalCardSales = 0;

            (orders || []).forEach(order => {
                if (order.payment_method === 'Cash') {
                    totalCashSales += order.total_amount;
                } else if (order.payment_method === 'M-Pesa') {
                    totalMpesaSales += order.total_amount;
                } else if (order.payment_method === 'Card') {
                    totalCardSales += order.total_amount;
                } else if (order.payment_method === 'Split') {
                    const notes = order.notes || '';
                    const cashMatch = notes.match(/Cash \(KES ([\d.]+)\)/);
                    const mpesaMatch = notes.match(/M-Pesa \(KES ([\d.]+)\)/);
                    const cardMatch = notes.match(/Card \(KES ([\d.]+)\)/);

                    if (cashMatch) totalCashSales += parseFloat(cashMatch[1]) || 0;
                    if (mpesaMatch) totalMpesaSales += parseFloat(mpesaMatch[1]) || 0;
                    if (cardMatch) totalCardSales += parseFloat(cardMatch[1]) || 0;
                }
            });

            const expectedCashTotal = parseFloat(activeShift.opening_float || 0) + totalCashSales;
            const actualCashVal = closingCashInput !== '' ? (parseFloat(closingCashInput) || 0) : expectedCashTotal;
            const actualCardVal = closingCardInput !== '' ? (parseFloat(closingCardInput) || 0) : totalCardSales;

            // 3. Update shift in db
            const { data: updatedShift, error: shiftError } = await supabase
                .from('pos_shifts')
                .update({
                    closed_at: new Date().toISOString(),
                    actual_cash: actualCashVal,
                    actual_card: actualCardVal,
                    expected_cash: expectedCashTotal,
                    expected_mpesa: totalMpesaSales,
                    expected_card: totalCardSales
                })
                .eq('id', activeShift.id)
                .select()
                .single();

            if (shiftError) throw shiftError;

            // Reset shift state
            setActiveShift(null);
            setClosingCashInput('');
            setClosingCardInput('');
            setClosingModalOpen(false);
        } catch (err) {
            console.error('Error closing shift:', err);
            alert('Failed to close shift: ' + err.message);
        }
    };

    // Auto-calculate shift summary report when Closing Shift Modal is open (Strictly for Today's Business Day)
    useEffect(() => {
        if (closingModalOpen) {
            const calculateShiftSummary = async () => {
                try {
                    const now = new Date();
                    const d = new Date();
                    if (now.getHours() < 7) {
                        d.setDate(d.getDate() - 1);
                    }
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const todayStartIso = new Date(`${year}-${month}-${day}T07:00:00.000+03:00`).toISOString();

                    let shiftStartIso = todayStartIso;
                    if (activeShift && activeShift.opened_at) {
                        const shiftOpenedIso = new Date(activeShift.opened_at).toISOString();
                        if (shiftOpenedIso > todayStartIso) {
                            shiftStartIso = shiftOpenedIso;
                        }
                    }

                    let query = supabase
                        .from('pos_orders')
                        .select('*')
                        .gte('created_at', shiftStartIso)
                        .eq('payment_status', 'Paid')
                        .neq('status', 'Returned')
                        .neq('status', 'Cancelled');

                    if (staffName) {
                        query = query.ilike('cashier_name', staffName);
                    }

                    const { data: orders, error } = await query;
                    if (error) throw error;

                    let totalSales = 0;
                    let cashSales = 0;
                    let cardSales = 0;
                    let imPaybillSales = 0;
                    let appSales = 0;

                    (orders || []).forEach(o => {
                        const amt = parseFloat(o.total_amount) || 0;
                        totalSales += amt;

                        const pm = (o.payment_method || '').toLowerCase().trim();
                        const ch = (o.order_channel || '').toLowerCase().trim();

                        if (['glovo', 'ubereats', 'uber eats', 'bolt food', 'ando'].includes(ch) || pm === 'paid to app') {
                            appSales += amt;
                        } else if (pm === 'cash') {
                            cashSales += amt;
                        } else if (pm === 'card') {
                            cardSales += amt;
                        } else if (pm.includes('i&m') || pm.includes('paybill') || pm === 'm-pesa' || pm === 'mpesa') {
                            imPaybillSales += amt;
                        } else if (pm === 'split') {
                            const notes = o.notes || '';
                            const cashMatch = notes.match(/Cash \(KES ([\d.]+)\)/);
                            const mpesaMatch = notes.match(/(?:M-Pesa|I&M Paybill|Paybill) \(KES ([\d.]+)\)/);
                            const cardMatch = notes.match(/Card \(KES ([\d.]+)\)/);

                            if (cashMatch) cashSales += parseFloat(cashMatch[1]) || 0;
                            if (mpesaMatch) imPaybillSales += parseFloat(mpesaMatch[1]) || 0;
                            if (cardMatch) cardSales += parseFloat(cardMatch[1]) || 0;
                        } else {
                            cashSales += amt;
                        }
                    });

                    setShiftSummary({
                        totalSales,
                        totalOrders: (orders || []).length,
                        cashSales,
                        cardSales,
                        imPaybillSales,
                        appSales
                    });
                } catch (err) {
                    console.error("Shift summary calculation error:", err);
                }
            };
            calculateShiftSummary();
        }
    }, [closingModalOpen, activeShift, staffName]);

    // Handle re-clearing payment method for recent orders (up to 24 hours old)
    const handleReClearPaymentMethod = async (orderId, newMethod) => {
        try {
            const { error } = await supabase
                .from('pos_orders')
                .update({ 
                    payment_method: newMethod,
                    payment_status: 'Paid'
                })
                .eq('id', orderId);

            if (error) throw error;

            setViewingOrderDetails(prev => prev ? { ...prev, payment_method: newMethod, payment_status: 'Paid' } : null);
            setHistoryOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_method: newMethod, payment_status: 'Paid' } : o));
            setIsChangingPaymentMethod(false);
            fetchOpenOrders();

            alert(`✓ Order payment method corrected to ${newMethod}`);
        } catch (err) {
            alert('Failed to update payment method: ' + err.message);
        }
    };

    // Handle re-clearing sale channel for recent orders (up to 24 hours old)
    const handleReClearOrderChannel = async (orderId, newChannel) => {
        try {
            const { error } = await supabase
                .from('pos_orders')
                .update({ 
                    order_channel: newChannel
                })
                .eq('id', orderId);

            if (error) throw error;

            setViewingOrderDetails(prev => prev ? { ...prev, order_channel: newChannel } : null);
            setHistoryOrders(prev => prev.map(o => o.id === orderId ? { ...o, order_channel: newChannel } : o));
            setIsChangingOrderChannel(false);
            fetchOpenOrders();

            alert(`✓ Order sale channel corrected to ${newChannel}`);
        } catch (err) {
            alert('Failed to update order channel: ' + err.message);
        }
    };

    const fetchOpenOrders = async () => {
        try {
            // Fetch both:
            // 1. All orders with payment_status = 'Pending' (any type, waiting payment)
            // 2. Dine-in orders for named tables that are 'Paid' — table is still occupied and 
            //    may need more items added (e.g., customer orders extra items after first print)
            const { data: pendingData, error: err1 } = await supabase
                .from('pos_orders')
                .select('*, items:pos_order_items(*)')
                .eq('payment_status', 'Pending')
                .neq('status', 'Cancelled')
                .neq('status', 'Returned')
                .order('created_at', { ascending: false });

            if (err1) throw err1;

            const tableNames = ['table 1','table 2','table 3','table 4','table 5','table 6',
                                'table 7','table 8','table 9','table 10','table 11','table 12'];

            const { data: paidTableData, error: err2 } = await supabase
                .from('pos_orders')
                .select('*, items:pos_order_items(*)')
                .eq('payment_status', 'Paid')
                .in('dining_option', ['Dine Inn', 'Dine-in'])
                .neq('status', 'Cancelled')
                .neq('status', 'Returned')
                .order('created_at', { ascending: false });

            if (err2) throw err2;

            // Only include paid dine-in orders whose customer_name matches a table slot
            const paidTableOrders = (paidTableData || []).filter(o =>
                tableNames.includes((o.customer_name || '').toLowerCase())
            );

            // Merge, deduplicate by id, pending first
            const merged = [...(pendingData || [])];
            paidTableOrders.forEach(o => {
                if (!merged.find(m => m.id === o.id)) merged.push(o);
            });

            // Append offline open orders currently queued to be synced
            const offlineQueue = JSON.parse(localStorage.getItem('pos_offline_orders_queue') || '[]');
            const offlineOpenOrders = offlineQueue.map(q => ({
                ...q.header,
                items: q.items
            })).filter(o => o.status === 'Open');

            let finalMerged = [...offlineOpenOrders, ...merged];
            
            // Waiter order visibility isolation
            if (staffRole === 'waiter') {
                finalMerged = finalMerged.filter(
                    o => (o.cashier_name || '').toLowerCase() === (staffName || '').toLowerCase()
                );
            }

            setOpenOrders(finalMerged);
            localStorage.setItem('pos_cache_open_orders', JSON.stringify(finalMerged));
        } catch (err) {
            console.error('Error fetching open orders:', err);
            const cached = localStorage.getItem('pos_cache_open_orders');
            if (cached) {
                setOpenOrders(JSON.parse(cached));
            }
        }
    };


    const toggleItemAvailability = async (itemId, currentStatus) => {
        try {
            const { error } = await supabase
                .from('pos_menu')
                .update({ is_available: !currentStatus })
                .eq('id', itemId);

            if (error) throw error;
            setMenu(prev => prev.map(item => item.id === itemId ? { ...item, is_available: !currentStatus } : item));
        } catch (err) {
            alert('Failed to update availability: ' + err.message);
        }
    };

    const updateItemPrice = async (itemId, newPrice) => {
        const priceVal = parseFloat(newPrice);
        if (isNaN(priceVal) || priceVal < 0) return;
        try {
            const { error } = await supabase
                .from('pos_menu')
                .update({ price: priceVal })
                .eq('id', itemId);

            if (error) throw error;
            setMenu(prev => prev.map(item => item.id === itemId ? { ...item, price: priceVal } : item));
        } catch (err) {
            alert('Failed to update price: ' + err.message);
        }
    };

    const fetchHistory = async (startDateVal = historyStartDate, endDateVal = historyEndDate) => {
        setLoadingHistory(true);
        try {
            const cleanDateStr = (val) => {
                if (!val) return '';
                if (typeof val === 'string' && val.includes('T')) return val.split('T')[0];
                return String(val).trim();
            };

            const todayDefault = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
            let sStr = cleanDateStr(startDateVal) || cleanDateStr(historyStartDate) || todayDefault;
            let eStr = cleanDateStr(endDateVal) || cleanDateStr(historyEndDate) || sStr;

            if (isHistoryRestricted) {
                const yesterdayDefault = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
                if (sStr < yesterdayDefault) {
                    sStr = yesterdayDefault;
                }
                if (eStr < yesterdayDefault) {
                    eStr = yesterdayDefault;
                }
            }

            // Full day query range covering all orders placed between start date 00:00:00 and end date 23:59:59 in Kenya EAT (+03:00)
            const start = new Date(`${sStr}T00:00:00.000+03:00`);
            const end = new Date(`${eStr}T23:59:59.999+03:00`);

            // .limit(5000) overrides Supabase's default 1000-row cap for full week queries
            const { data, error } = await supabase
                .from('pos_orders')
                .select('*, items:pos_order_items(*)')
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString())
                .order('created_at', { ascending: false })
                .limit(5000);

            if (error) throw error;
            let finalOrders = data || [];

            // Waiter order visibility isolation
            if (staffRole === 'waiter') {
                finalOrders = finalOrders.filter(
                    o => (o.cashier_name || '').toLowerCase() === (staffName || '').toLowerCase()
                );
            }

            setHistoryOrders(finalOrders);
            localStorage.setItem('pos_cache_history', JSON.stringify(finalOrders));

            // Previous Period calculations
            const periodDiffMs = end.getTime() - start.getTime();
            const prevStart = new Date(start.getTime() - periodDiffMs - 1);
            const prevEnd = new Date(start.getTime() - 1);

            const { data: prevData, error: prevError } = await supabase
                .from('pos_orders')
                .select('total_amount, status, payment_status, cashier_name')
                .gte('created_at', prevStart.toISOString())
                .lte('created_at', prevEnd.toISOString());

            if (!prevError && prevData) {
                let validPrevOrders = prevData.filter(o => 
                    o.status !== 'Returned' && 
                    o.status !== 'Cancelled' && 
                    o.status !== 'Declined' && 
                    o.payment_status !== 'Voided'
                );
                if (staffRole === 'waiter') {
                    validPrevOrders = validPrevOrders.filter(
                        o => (o.cashier_name || '').toLowerCase() === (staffName || '').toLowerCase()
                    );
                }
                const prevSum = validPrevOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
                setPrevPeriodSales(prevSum);
                localStorage.setItem('pos_cache_prev_sales', String(prevSum));
            } else {
                const cachedPrev = localStorage.getItem('pos_cache_prev_sales');
                if (cachedPrev) setPrevPeriodSales(parseFloat(cachedPrev) || 0);
            }
        } catch (err) {
            console.error('Error fetching order history:', err);
            const cached = localStorage.getItem('pos_cache_history');
            if (cached) {
                setHistoryOrders(JSON.parse(cached));
            }
            const cachedPrev = localStorage.getItem('pos_cache_prev_sales');
            if (cachedPrev) {
                setPrevPeriodSales(parseFloat(cachedPrev) || 0);
            }
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        fetchMenu();
        fetchModifiers();
        fetchStaffList();
        checkActiveShift();
        fetchOpenOrders();
        fetchCategories();
        fetchDiscounts();

        // Supabase Realtime channel subscription to listen for new orders
        const ordersChannel = supabase
            .channel('realtime_pos_orders')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'pos_orders' },
                (payload) => {
                    console.log('Realtime: New order received!', payload.new);
                    // Refresh open orders list automatically
                    fetchOpenOrders();
                    
                    // Play alert sound if enabled
                    if (localStorage.getItem('pos_alert_enabled') !== 'false') {
                        const savedSound = localStorage.getItem('pos_alert_sound') || 'chime';
                        const savedVol = parseFloat(localStorage.getItem('pos_alert_volume') || '0.8');
                        playAlertSound(savedSound, savedVol);
                    }

                    // Auto-accept if enabled, order is from microsite, and items are in stock
                    const newOrder = payload.new;
                    if (localStorage.getItem('pos_auto_accept_orders') === 'true' && isMicrositeOrder(newOrder)) {
                        setTimeout(() => {
                            const inStock = canAutoAcceptOrder(newOrder.items, menu);
                            if (inStock) {
                                console.log(`Auto-accepting microsite order #${newOrder.ticket_number}...`);
                                handleAcceptOrder(newOrder, { silent: true });
                            } else {
                                alert(`⚠️ Incoming Order #${obfuscateTicket(newOrder.ticket_number)} contains OUT-OF-STOCK items and requires manual review.`);
                            }
                        }, 500);
                    }
                }
            )
            .subscribe();


        return () => {
            supabase.removeChannel(ordersChannel);
        };
    }, []);

    useEffect(() => {
        if (activeView === 'history') {
            fetchHistory(historyStartDate, historyEndDate);
        } else if (activeView === 'tables') {
            fetchOpenOrders();
        } else if (activeView === 'menu_settings') {
            fetchMenu();
            fetchModifiers();
            fetchCategories();
            fetchDiscounts();
        } else if (activeView === 'terminal_settings') {
            if (!isSystemAdmin) {
                setActiveView('menu');
            } else {
                fetchStaffList();
            }
        }
    }, [activeView, isSystemAdmin, historyStartDate, historyEndDate]);

    const fetchMenu = async () => {
        setLoadingMenu(true);
        try {
            const { data, error } = await supabase
                .from('pos_menu')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            setMenu(data || []);
            localStorage.setItem('pos_cache_menu', JSON.stringify(data || []));
        } catch (err) {
            console.error('Error loading menu:', err);
            const cached = localStorage.getItem('pos_cache_menu');
            if (cached) {
                setMenu(JSON.parse(cached));
            }
        } finally {
            setLoadingMenu(false);
        }
    };

    const fetchModifiers = async () => {
        setLoadingModifiers(true);
        try {
            const { data, error } = await supabase
                .from('menu_modifier_groups')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            setModifierGroups(data || []);
            localStorage.setItem('pos_cache_modifiers', JSON.stringify(data || []));
        } catch (err) {
            console.error('Error loading modifier groups:', err);
            const cached = localStorage.getItem('pos_cache_modifiers');
            if (cached) {
                setModifierGroups(JSON.parse(cached));
            }
        } finally {
            setLoadingModifiers(false);
        }
    };

    const fetchCategories = async () => {
        setLoadingCategories(true);
        try {
            const { data, error } = await supabase
                .from('pos_categories')
                .select('*')
                .order('display_order', { ascending: true });

            if (error) {
                if (error.code !== '42P01') {
                    console.error('Error loading categories:', error);
                }
                setCategories(DEFAULT_CATEGORIES);
            } else if (data && data.length > 0) {
                setCategories(data);
                localStorage.setItem('pos_cache_categories', JSON.stringify(data));
            } else {
                setCategories(DEFAULT_CATEGORIES);
            }
        } catch (err) {
            console.error('Error loading categories:', err);
            const cached = localStorage.getItem('pos_cache_categories');
            if (cached) {
                setCategories(JSON.parse(cached));
            } else {
                setCategories(DEFAULT_CATEGORIES);
            }
        } finally {
            setLoadingCategories(false);
        }
    };

    const fetchDiscounts = async () => {
        setLoadingDiscounts(true);
        try {
            const { data, error } = await supabase
                .from('pos_discounts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                if (error.code !== '42P01') {
                    console.error('Error loading discounts:', error);
                }
            } else {
                setDiscountsList(data || []);
            }
        } catch (err) {
            console.error('Error loading discounts:', err);
        } finally {
            setLoadingDiscounts(false);
        }
    };

    const saveDiscount = async (discountPayload) => {
        try {
            if (discountPayload.id) {
                const { error } = await supabase
                    .from('pos_discounts')
                    .update({
                        code: discountPayload.code.trim().toUpperCase(),
                        type: discountPayload.type,
                        value: parseFloat(discountPayload.value),
                        min_order_amount: parseFloat(discountPayload.min_order_amount || 0),
                        is_active: discountPayload.is_active
                    })
                    .eq('id', discountPayload.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('pos_discounts')
                    .insert([{
                        code: discountPayload.code.trim().toUpperCase(),
                        type: discountPayload.type,
                        value: parseFloat(discountPayload.value),
                        min_order_amount: parseFloat(discountPayload.min_order_amount || 0),
                        is_active: discountPayload.is_active !== false
                    }]);
                if (error) throw error;
            }
            fetchDiscounts();
            setEditingDiscount(null);
            alert('Promo code saved successfully!');
        } catch (err) {
            console.error('Error saving discount:', err);
            alert('Failed to save promo code: ' + err.message);
        }
    };

    const deleteDiscount = async (id) => {
        if (!confirm('Are you sure you want to delete this promo code?')) return;
        try {
            const { error } = await supabase
                .from('pos_discounts')
                .delete()
                .eq('id', id);
            if (error) throw error;
            fetchDiscounts();
            alert('Promo code deleted successfully!');
        } catch (err) {
            console.error('Error deleting discount:', err);
            alert('Failed to delete promo code: ' + err.message);
        }
    };

    const fetchStaffList = async () => {
        setLoadingStaff(true);
        try {
            const { data, error } = await supabase
                .from('staff_access')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            setStaffList(data || []);
            localStorage.setItem('pos_cache_staff', JSON.stringify(data || []));
        } catch (err) {
            console.error('Error loading staff list:', err);
            const cached = localStorage.getItem('pos_cache_staff');
            if (cached) {
                setStaffList(JSON.parse(cached));
            }
        } finally {
            setLoadingStaff(false);
        }
    };

    // --- Menu Item CRUD ---
    const handleCreateMenuItem = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = fd.get('name')?.trim();
        const category = fd.get('category');
        const price = parseFloat(fd.get('price'));
        const description = fd.get('description')?.trim();

        if (!name || !category || isNaN(price)) {
            alert('Please fill out Name, Category and Price.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('pos_menu')
                .insert([{ name, category, price, description, is_available: true }])
                .select()
                .single();

            if (error) throw error;
            setMenu(prev => [...prev, data]);
            alert('Menu item created successfully!');
            setShowAddItemForm(false);
            e.target.reset();
        } catch (err) {
            alert('Error creating menu item: ' + err.message);
        }
    };

    const handleDeleteMenuItem = async (itemId) => {
        if (!confirm('Are you sure you want to delete this menu item? This action is permanent.')) return false;
        try {
            const { error } = await supabase
                .from('pos_menu')
                .delete()
                .eq('id', itemId);

            if (error) throw error;
            setMenu(prev => prev.filter(item => item.id !== itemId));
            alert('Product successfully deleted!');
            return true;
        } catch (err) {
            alert('Failed to delete item: ' + err.message);
            return false;
        }
    };

    const handleConfirmReturnSale = async () => {
        if (!returningOrderId) return;
        const finalReason = returnReason === 'Other' ? customReturnReason.trim() : returnReason;
        try {
            const { error } = await supabase
                .from('pos_orders')
                .update({ 
                    status: 'Returned',
                    return_reason: finalReason
                })
                .eq('id', returningOrderId);

            if (error) throw error;

            setHistoryOrders(prev => prev.map(o => o.id === returningOrderId ? { ...o, status: 'Returned', return_reason: finalReason } : o));
            setViewingOrderDetails(prev => prev && prev.id === returningOrderId ? { ...prev, status: 'Returned', return_reason: finalReason } : prev);

            alert('Sale returned successfully.');
            setReturningOrderId(null);
            setReturnReason('');
            setCustomReturnReason('');
        } catch (err) {
            alert('Failed to return sale: ' + err.message);
        }
    };

    // --- Modifier Group CRUD & Cart Helpers ---
    const handleSaveModifierGroup = async (groupPayload) => {
        try {
            if (groupPayload.id) {
                const { error } = await supabase
                    .from('menu_modifier_groups')
                    .update(groupPayload)
                    .eq('id', groupPayload.id);
                if (error) throw error;
                alert('Modifier group updated successfully!');
            } else {
                const { error } = await supabase
                    .from('menu_modifier_groups')
                    .insert([groupPayload]);
                if (error) throw error;
                alert('Modifier group created successfully!');
            }
            setEditingModifierGroup(null);
            fetchModifiers();
        } catch (err) {
            alert('Failed to save modifier group: ' + err.message);
        }
    };

    const handleDeleteModifierGroup = async (groupId) => {
        if (!confirm('Are you sure you want to delete this customization group? All menu items will lose this modifier.')) return;
        try {
            const { error } = await supabase
                .from('menu_modifier_groups')
                .delete()
                .eq('id', groupId);
            if (error) throw error;
            setModifierGroups(prev => prev.filter(g => g.id !== groupId));
            alert('Customisation deleted.');
        } catch (err) {
            alert('Failed to delete modifier group: ' + err.message);
        }
    };

    const handleSaveCategory = async () => {
        if (!editingCategory.name.trim()) {
            alert('Please specify Category Name.');
            return;
        }

        const name = editingCategory.name.trim();
        const icon = editingCategory.icon.trim() || '🍽️';
        const displayOrder = parseInt(editingCategory.display_order) || 0;

        try {
            let oldName = null;
            if (editingCategory.id) {
                const oldCat = categories.find(c => c.id === editingCategory.id);
                if (oldCat) oldName = oldCat.name;

                const { error } = await supabase
                    .from('pos_categories')
                    .update({ name, icon, display_order: displayOrder })
                    .eq('id', editingCategory.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('pos_categories')
                    .insert([{ name, icon, display_order: displayOrder }]);
                if (error) throw error;
            }

            // Sync menu items categories
            // 1. If category name changed, update all items with old name to new name
            if (oldName && oldName !== name) {
                const { error: syncError } = await supabase
                    .from('pos_menu')
                    .update({ category: name })
                    .eq('category', oldName);
                if (syncError) console.error('Error syncing category name change to items:', syncError);
            }

            // 2. Assign checked items to this category, unassign items that were unchecked
            const finalName = name;
            for (const item of menu) {
                const shouldBeInCat = catLinkedItemIds.includes(item.id);
                const currentlyInCat = item.category === (oldName || finalName);

                if (shouldBeInCat && !currentlyInCat) {
                    await supabase.from('pos_menu').update({ category: finalName }).eq('id', item.id);
                } else if (!shouldBeInCat && currentlyInCat) {
                    await supabase.from('pos_menu').update({ category: 'Uncategorized' }).eq('id', item.id);
                }
            }

            alert('Category saved successfully!');
            setEditingCategory(null);
            fetchCategories();
            fetchMenu();
        } catch (err) {
            alert('Failed to save category: ' + err.message);
        }
    };

    const handleDeleteCategory = async (cat) => {
        if (!confirm(`Are you sure you want to delete category "${cat.name}"? This will not delete the menu items in it.`)) return;
        try {
            const { error } = await supabase
                .from('pos_categories')
                .delete()
                .eq('id', cat.id);
            if (error) throw error;

            const { error: syncError } = await supabase
                .from('pos_menu')
                .update({ category: 'Uncategorized' })
                .eq('category', cat.name);
            if (syncError) console.error('Error unassigning items from deleted category:', syncError);

            alert('Category deleted.');
            fetchCategories();
            fetchMenu();
        } catch (err) {
            alert('Failed to delete category: ' + err.message);
        }
    };
 
    const handleMoveCategory = async (cat, direction) => {
        const index = categories.findIndex(c => c.id === cat.id);
        if (index === -1) return;
        
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= categories.length) return;
        
        const currentCat = categories[index];
        const targetCat = categories[targetIndex];
        
        // Swap display_order
        const currentOrder = currentCat.display_order || index + 1;
        const targetOrder = targetCat.display_order || targetIndex + 1;
        
        try {
            // Update display_order of current category to target's order
            const { error: err1 } = await supabase
                .from('pos_categories')
                .update({ display_order: targetOrder })
                .eq('id', currentCat.id);
                
            if (err1) throw err1;

            // Update display_order of target category to current's order
            const { error: err2 } = await supabase
                .from('pos_categories')
                .update({ display_order: currentOrder })
                .eq('id', targetCat.id);
                
            if (err2) throw err2;
            
            fetchCategories();
        } catch (e) {
            console.error('Error swapping category order:', e);
            alert('Failed to reorder categories: ' + e.message);
        }
    };

    const getItemModifierGroups = (item) => {
        if (!modifierGroups || modifierGroups.length === 0) return [];
        return modifierGroups.filter(g => {
            if (!g.menu_item_ids || g.menu_item_ids.length === 0) return true;
            return g.menu_item_ids.includes(item.id);
        }).map(g => ({
            id: g.id,
            group: g.name,
            min_selected: g.min_selected || 0,
            max_selected: g.max_selected || 1,
            is_required: g.is_required || false,
            options: (g.options || []).filter(o => o.is_available !== false)
        }));
    };

    const toggleCartModifier = (cartItemId, groupName, option) => {
        setCart(prev => prev.map(item => {
            if (item.id !== cartItemId) return item;
            
            let currentSelected = item.selectedModifiers || [];
            const group = modifierGroups.find(g => g.name === groupName);
            const maxSelected = group ? (group.max_selected || 1) : 1;

            const isSelected = currentSelected.some(m => m.group === groupName && m.name === option.name);

            if (maxSelected === 1) {
                if (isSelected) {
                    currentSelected = currentSelected.filter(m => m.group !== groupName);
                } else {
                    currentSelected = currentSelected.filter(m => m.group !== groupName);
                    currentSelected.push({ group: groupName, ...option });
                }
            } else {
                if (isSelected) {
                    currentSelected = currentSelected.filter(m => !(m.group === groupName && m.name === option.name));
                } else {
                    const countInGroup = currentSelected.filter(m => m.group === groupName).length;
                    if (countInGroup < maxSelected) {
                        currentSelected.push({ group: groupName, ...option });
                    } else {
                        alert(`You can select at most ${maxSelected} options for ${groupName}.`);
                        return item;
                    }
                }
            }

            const modifierTotal = currentSelected.reduce((sum, m) => sum + calculateModifierChannelPrice(m, orderChannel), 0);
            const instructions = currentSelected.map(m => {
                const p = calculateModifierChannelPrice(m, orderChannel);
                return p > 0 ? `${m.name} (+${Math.round(p)})` : m.name;
            }).join(', ');

            const itemBasePrice = calculateChannelPrice(item, orderChannel, activeBrand);

            return {
                ...item,
                basePrice: itemBasePrice,
                selectedModifiers: currentSelected,
                instructions,
                price: itemBasePrice + modifierTotal
            };
        }));
    };

    const getItemPrice = (cartItem) => {
        return Number(cartItem.price || 0);
    };

    const mapOrderItemsToCart = (orderItems) => {
        // De-duplicate rows that may have been double-inserted due to a
        // prior race condition. Collapse identical item+price rows into one
        // entry with summed quantities before mapping to cart shape.
        const dedupedItems = Object.values(
            (orderItems || []).reduce((acc, item) => {
                const key = `${item.item_name}||${item.price}||${item.instructions || ''}`;
                if (acc[key]) {
                    acc[key] = { ...acc[key], quantity: acc[key].quantity + item.quantity };
                } else {
                    acc[key] = { ...item };
                }
                return acc;
            }, {})
        );
        return dedupedItems.map(item => {
            const menuItem = (menu || []).find(m => m.name === item.item_name) || {};
            const selectedModifiers = [];
            const basePrice = menuItem.price || item.price;
            
            if (item.instructions) {
                const parts = item.instructions.split(', ').filter(Boolean);
                parts.forEach(part => {
                    const cleanPart = part.replace(/\s\(\+\d+\)$/, '').trim();
                    let found = false;
                    for (const group of modifierGroups) {
                        const opt = (group.options || []).find(o => o.name === cleanPart);
                        if (opt) {
                            selectedModifiers.push({
                                group: group.name,
                                ...opt
                            });
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        const match = part.match(/\(\+(\d+)\)$/);
                        const price = match ? parseFloat(match[1]) : 0;
                        selectedModifiers.push({
                            group: 'General',
                            name: cleanPart,
                            price,
                            include_vat: false
                        });
                    }
                });
            }

            // Ensure item.price includes modifier additions if they were omitted in saved row
            let itemPrice = parseFloat(item.price) || 0;
            const parsedModifierTotal = selectedModifiers.reduce((sum, m) => sum + (parseFloat(m.price) || 0), 0);
            const expectedMinPrice = (parseFloat(basePrice) || 0) + parsedModifierTotal;
            if (itemPrice < expectedMinPrice) {
                itemPrice = expectedMinPrice;
            }

            return {
                id: menuItem.id || item.id,
                name: item.item_name,
                basePrice,
                price: itemPrice,
                include_vat: menuItem.include_vat || false,
                image_url: menuItem.image_url || '',
                quantity: item.quantity,
                instructions: item.instructions || '',
                selectedModifiers
            };
        });
    };

    // --- Staff / Terminals CRUD ---
    const handleCreateStaff = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = fd.get('name')?.trim();
        const pin = fd.get('pin')?.trim();
        const role = fd.get('role');
        const today_yesterday_only = fd.get('today_yesterday_only') === 'true';

        if (!name || !pin || pin.length !== 4 || !role) {
            alert('Please enter Name, role, and a 4-digit numeric PIN.');
            return;
        }

        try {
            const { data, error } = await supabase
                .from('staff_access')
                .insert([{ name, pin, role, today_yesterday_only }])
                .select()
                .single();

            if (error) throw error;
            setStaffList(prev => [...prev, data]);
            alert('Staff member terminal access created successfully!');
            setShowAddStaffForm(false);
            e.target.reset();
        } catch (err) {
            alert('Error creating staff access: ' + err.message);
        }
    };

    const handleConfirmClearPending = async () => {
        if (!clearingPendingOrder) return;
        try {
            const isOffline = !navigator.onLine;

            const updatePayload = {
                payment_status: 'Paid',
                payment_method: clearingPaymentMethod,
                brand: clearingBrand,
                order_channel: clearingChannel,
                dining_option: clearingService
            };

            if (isOffline || String(clearingPendingOrder.id).startsWith('offline-')) {
                const offlineOrders = JSON.parse(localStorage.getItem('pos_offline_orders_queue') || '[]');
                const idx = offlineOrders.findIndex(q => q.header.id === clearingPendingOrder.id);
                if (idx !== -1) {
                    offlineOrders[idx].header.payment_status = 'Paid';
                    offlineOrders[idx].header.payment_method = clearingPaymentMethod;
                    offlineOrders[idx].header.brand = clearingBrand;
                    offlineOrders[idx].header.order_channel = clearingChannel;
                    offlineOrders[idx].header.dining_option = clearingService;
                    localStorage.setItem('pos_offline_orders_queue', JSON.stringify(offlineOrders));
                } else {
                    const offlineUpdates = JSON.parse(localStorage.getItem('pos_offline_updates_queue') || '[]');
                    offlineUpdates.push({
                        type: 'update_order',
                        id: clearingPendingOrder.id,
                        payload: updatePayload
                    });
                    localStorage.setItem('pos_offline_updates_queue', JSON.stringify(offlineUpdates));
                }

                setOpenOrders(prev => prev.map(o => o.id === clearingPendingOrder.id ? { ...o, ...updatePayload } : o));
                setHistoryOrders(prev => prev.map(o => o.id === clearingPendingOrder.id ? { ...o, ...updatePayload } : o));
                setClearingPendingOrder(null);
                alert('Order cleared locally! It will sync when online.');
                return;
            }

            const { error } = await supabase
                .from('pos_orders')
                .update(updatePayload)
                .eq('id', clearingPendingOrder.id);

            if (error) throw error;

            alert('Order cleared successfully.');
            setClearingPendingOrder(null);
            
            fetchOpenOrders();
            fetchHistory(historyStartDate, historyEndDate);
        } catch (err) {
            console.error('Error clearing pending order:', err);
            alert('Failed to clear order: ' + err.message);
        }
    };

    const handleSaveStaff = async (staffId) => {
        if (!editingStaffName.trim() || editingStaffPin.length !== 4) {
            alert('Please enter a valid display name and 4-digit PIN.');
            return;
        }

        try {
            const { error } = await supabase
                .from('staff_access')
                .update({
                    name: editingStaffName.trim(),
                    pin: editingStaffPin,
                    role: editingStaffRole,
                    is_active: editingStaffActive,
                    today_yesterday_only: editingStaffTodayYesterdayOnly
                })
                .eq('id', staffId);

            if (error) throw error;

            alert('Staff member updated successfully.');
            setEditingStaffId(null);
            fetchStaffList();
        } catch (err) {
            console.error('Error updating staff access:', err);
            alert('Failed to update staff access: ' + err.message);
        }
    };

    const handleDeleteStaff = async (staffId) => {
        if (!confirm('Remove this staff terminal access? They will lose access to logging in.')) return;
        try {
            const { error } = await supabase
                .from('staff_access')
                .delete()
                .eq('id', staffId);

            if (error) throw error;
            setStaffList(prev => prev.filter(s => s.id !== staffId));
            alert('Access removed.');
        } catch (err) {
            alert('Failed to remove staff: ' + err.message);
        }
    };

    const getDynamicModifierGroups = () => {
        if (!modifiers || modifiers.length === 0) {
            return MODIFIER_GROUPS;
        }
        const grouped = {};
        const icons = {
            'Swallow Choice': '🫓',
            'Protein Add-on': '🥩',
            'Preference': '🌶️',
            'Extra Side': '🍟',
            'Extra Sides': '🍟',
            'Packaging': '📦'
        };

        modifiers.forEach(mod => {
            if (!mod.is_available) return;
            const grp = mod.group_name;
            if (!grouped[grp]) {
                grouped[grp] = {
                    group: grp,
                    icon: icons[grp] || '⚙️',
                    options: []
                };
            }
            const priceLabel = mod.price_adjustment > 0 ? ` (+${Math.round(mod.price_adjustment)})` : '';
            grouped[grp].options.push(`${mod.name}${priceLabel}`);
        });

        return Object.values(grouped);
    };

    // Filter menu
    const filteredMenu = menu.filter(item => {
        const matchesBrand = activeBrand === 'All' || itemBelongsToBrand(item, activeBrand);
        const matchesAvailability = true; // Show all items in grid; out-of-stock items are displayed with red bar overlay & restock button
        const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesBrand && matchesAvailability && matchesCategory && matchesSearch;
    });

    const visibleCategories = React.useMemo(() => {
        if (activeBrand === 'All') return categories;
        const brandItems = menu.filter(item => itemBelongsToBrand(item, activeBrand));
        const brandCatNames = new Set(brandItems.map(item => item.category));
        return categories.filter(cat => brandCatNames.has(cat.name));
    }, [menu, categories, activeBrand]);

    useEffect(() => {
        setActiveCategory('All');
    }, [activeBrand]);

    // Sync cart prices when orderChannel, selectedBrand, or activeBrand changes dynamically
    useEffect(() => {
        setCart(prevCart => {
            if (!prevCart || prevCart.length === 0) return prevCart;
            const currentBrand = (selectedBrand && selectedBrand !== 'All') ? selectedBrand : activeBrand;
            return prevCart.map(item => {
                if (item.isCustomPriceOverride) return item;
                const dynamicItemPrice = calculateChannelPrice(item, orderChannel, currentBrand);
                const modifierTotal = getItemModifierTotal(item, orderChannel);
                return { ...item, basePrice: dynamicItemPrice, price: dynamicItemPrice + modifierTotal };
            });
        });
    }, [orderChannel, selectedBrand, activeBrand]);

    // Cart operations
    const addToCart = (item) => {
        setCartOpen(true);
        const currentBrand = (selectedBrand && selectedBrand !== 'All') ? selectedBrand : activeBrand;
        const dynamicItemPrice = calculateChannelPrice(item, orderChannel, currentBrand);
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            if (existing) {
                const modifierTotal = getItemModifierTotal(existing, orderChannel);
                return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1, price: dynamicItemPrice + modifierTotal } : i);
            }
            const modifierTotal = getItemModifierTotal(item, orderChannel);
            return [...prev, { 
                ...item, 
                basePrice: dynamicItemPrice, 
                price: dynamicItemPrice + modifierTotal, 
                quantity: 1, 
                instructions: item.instructions || '', 
                selectedModifiers: item.selectedModifiers || [] 
            }];
        });
    };

    const updateQty = (id, delta) => {
        setCart(prev => prev.map(i => {
            if (i.id === id) {
                const newQty = Math.max(1, i.quantity + delta);
                return { ...i, quantity: newQty };
            }
            return i;
        }));
    };

    const removeFromCart = (id) => {
        setCart(prev => prev.filter(i => i.id !== id));
    };

    const updateInstructions = (id, text) => {
        setCart(prev => prev.map(i => i.id === id ? { ...i, instructions: text } : i));
    };

    // Calculate totals
    // Calculate totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const discountAmount = React.useMemo(() => {
        const val = parseFloat(discountValue) || 0;
        if (discountType === 'percentage') {
            return (subtotal * val) / 100;
        } else if (discountType === 'flat') {
            return val;
        }
        return 0;
    }, [subtotal, discountType, discountValue]);

    const total = Math.max(0, subtotal - discountAmount);

    // Calculate inclusive 16% VAT and 2% Catering Levy on main items/modifiers with include_vat enabled
    const { vatAmount, cateringLevyAmount } = React.useMemo(() => {
        const taxableSubtotal = cart.reduce((sum, item) => {
            let itemTaxable = item.include_vat ? (item.basePrice || item.price) : 0;
            if (item.selectedModifiers) {
                item.selectedModifiers.forEach(m => {
                    if (m.include_vat) {
                        itemTaxable += Number(m.price || 0);
                    }
                });
            }
            return sum + (itemTaxable * item.quantity);
        }, 0);
        
        const discountRatio = subtotal > 0 ? total / subtotal : 0;
        const taxableTotal = taxableSubtotal * discountRatio;
        // Total divisor is 1.18 (1 + 0.16 VAT + 0.02 Catering Levy)
        const base = taxableTotal / 1.18;
        return {
            vatAmount: base * 0.16,
            cateringLevyAmount: base * 0.02
        };
    }, [cart, subtotal, total]);

    // Check split payment balance
    const splitTotal = (parseFloat(splitCash) || 0) + (parseFloat(splitMpesa) || 0) + (parseFloat(splitCard) || 0);
    const isSplitValid = paymentMethod !== 'Split' || Math.abs(splitTotal - total) < 0.1;

    const createOfflineOrderData = (orderPayload) => {
        let maxTicket = 1000;
        const parseNum = (str) => parseInt(String(str).replace(/\D/g, ''), 10);
        (openOrders || []).forEach(o => {
            const num = parseNum(o.ticket_number);
            if (!isNaN(num) && num > maxTicket) maxTicket = num;
        });
        const nextTicketNum = String(maxTicket + 1);

        return {
            id: 'offline-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            ticket_number: nextTicketNum,
            created_at: orderPayload.created_at || new Date().toISOString(),
            customer_name: orderPayload.customer_name,
            dining_option: orderPayload.dining_option,
            payment_method: orderPayload.payment_method,
            payment_status: orderPayload.payment_status,
            total_amount: orderPayload.total_amount,
            discount: orderPayload.discount,
            cashier_name: orderPayload.cashier_name,
            brand: orderPayload.brand,
            order_channel: orderPayload.order_channel,
            notes: orderPayload.notes,
            status: 'Pending',
            is_offline: true
        };
    };

    const handleCheckout = async () => {
        if (cart.length === 0) {
            alert('Your cart is empty.');
            return;
        }
        if ((diningOption === 'Dine-in' || diningOption === 'Dine Inn') && !selectedTable) {
            alert('Please select a Table before punching a Dine-In order.');
            return;
        }
        if (paymentMethod === 'Split' && !isSplitValid) {
            alert(`Split payment breakdown (KES ${splitTotal.toLocaleString()}) does not match the grand total (KES ${total.toLocaleString()}). Difference: KES ${(total - splitTotal).toLocaleString()}`);
            return;
        }

        setSubmitting(true);
        try {
            let orderData;
            const finalCustName = (diningOption === 'Dine-in' || diningOption === 'Dine Inn') ? selectedTable : (customerNameText.trim() || 'Walk-in Guest');
            const typeNotesPart = `[Guest Tag: ${customerType === 'Returning' ? 'Returning Customer' : 'New Customer'}]`;
            const guestNotesPart = customerNameText.trim() ? `Customer: ${customerNameText.trim()}` : '';
            const splitNotesPart = paymentMethod === 'Split' 
                ? `Split Pay: Cash (KES ${splitCash || 0}), M-Pesa (KES ${splitMpesa || 0}), Card (KES ${splitCard || 0})`
                : '';
            const finalNotes = [typeNotesPart, guestNotesPart, splitNotesPart].filter(Boolean).join(', ');

            // Build the created_at timestamp.
            // If the user specified a custom order date (e.g. YYYY-MM-DD), we combine it with the current local time
            // and interpret it as local Kenya time (UTC+3) to get the correct UTC string.
            let finalCreatedAt = new Date().toISOString();
            if (customOrderDate) {
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                const ss = String(now.getSeconds()).padStart(2, '0');
                const localISO = `${customOrderDate}T${hh}:${mm}:${ss}.000+03:00`;
                finalCreatedAt = new Date(localISO).toISOString();
            }

            const orderPayload = {
                customer_name: finalCustName,
                customer_type: customerType,
                dining_option: diningOption,
                payment_method: paymentMethod,
                payment_status: paymentStatus,
                status: 'Pending',
                total_amount: total,
                discount: discountAmount,
                cashier_name: staffName || 'Cashier',
                brand: selectedBrand,
                order_channel: orderChannel,
                notes: finalNotes,
                created_at: finalCreatedAt,
                delivery_address: diningOption === 'Delivery' ? deliveryAddress : null
            };

            const isOffline = !navigator.onLine;
            let isEditOfOnlineOrder = false;

            if (isOffline) {
                orderData = createOfflineOrderData(orderPayload);
            } else {
                if (editingOrderId && !String(editingOrderId).startsWith('offline-')) {
                    // ── EDIT EXISTING ONLINE ORDER ──────────────────────────────────────
                    // Keep edit and new-order paths strictly separate so a delete failure
                    // never silently falls back to offline and double-inserts items.
                    isEditOfOnlineOrder = true;
                    const { data: updData, error: updErr } = await supabase
                        .from('pos_orders')
                        .update(orderPayload)
                        .eq('id', editingOrderId)
                        .select()
                        .single();

                    if (updErr) throw updErr;
                    orderData = updData;

                    // Delete ALL old line items before inserting new ones.
                    // If this fails we throw — never fall back to offline for an edit
                    // because that would create a second order and leave the original
                    // items untouched, causing doubled rows on the next fetch.
                    const { error: deleteError } = await supabase
                        .from('pos_order_items')
                        .delete()
                        .eq('order_id', editingOrderId);

                    if (deleteError) throw deleteError;
                } else {
                    // ── NEW ORDER ────────────────────────────────────────────────────────
                    try {
                        const { data, error } = await supabase
                            .from('pos_orders')
                            .insert([orderPayload])
                            .select()
                            .single();

                        if (error) throw error;
                        orderData = data;
                    } catch (netErr) {
                        const isTrueNetworkError = !navigator.onLine || 
                            netErr?.name === 'TypeError' || 
                            String(netErr?.message || '').toLowerCase().includes('failed to fetch') || 
                            String(netErr?.message || '').toLowerCase().includes('networkerror') ||
                            String(netErr?.message || '').toLowerCase().includes('network error');

                        if (isTrueNetworkError) {
                            console.warn('Supabase insert failed due to network offline, creating local offline order:', netErr);
                            orderData = createOfflineOrderData(orderPayload);
                        } else {
                            console.error('Database insertion error for order:', netErr);
                            alert(`Order submission failed: ${netErr.message || netErr.details || 'Database error'}`);
                            setSubmitting(false);
                            return;
                        }
                    }
                }
            }
            // Save/upsert customer address
            if (diningOption === 'Delivery' && customerNameText.trim() && deliveryAddress.trim()) {
                try {
                    await supabase
                        .from('pos_customer_addresses')
                        .upsert({
                            customer_name: customerNameText.trim().toLowerCase(),
                            address: deliveryAddress.trim()
                        }, { onConflict: 'customer_name' });
                } catch (e) {
                    console.error('Error upserting customer address:', e);
                }
            }

            // Create order line items
            const itemPayloads = cart.map(item => ({
                order_id: orderData.id,
                item_name: item.name,
                quantity: item.quantity,
                price: item.price,
                instructions: item.instructions || ''
            }));

            if (orderData.is_offline) {
                // Save offline order to localStorage queue
                const offlineOrders = JSON.parse(localStorage.getItem('pos_offline_orders_queue') || '[]');
                
                // If we are editing an offline order, overwrite it in the queue
                const existingIdx = offlineOrders.findIndex(q => q.header.id === editingOrderId);
                if (existingIdx !== -1) {
                    offlineOrders[existingIdx] = {
                        header: orderData,
                        items: itemPayloads
                    };
                } else {
                    offlineOrders.push({
                        header: orderData,
                        items: itemPayloads
                    });
                }
                
                localStorage.setItem('pos_offline_orders_queue', JSON.stringify(offlineOrders));
                
                // Append offline open orders to local state
                const mergedOfflineOrder = {
                    ...orderData,
                    items: itemPayloads
                };
                setOpenOrders(prev => [mergedOfflineOrder, ...prev.filter(o => o.id !== editingOrderId)]);
                
                alert(`Offline Order #${obfuscateTicket(orderData.ticket_number)} saved locally! It will sync when connection returns.`);
            } else {
                // Ensure no stale duplicate rows exist for this order ID
                await supabase
                    .from('pos_order_items')
                    .delete()
                    .eq('order_id', orderData.id);

                const { error: itemsError } = await supabase
                    .from('pos_order_items')
                    .insert(itemPayloads);

                if (itemsError) throw itemsError;

                // Auto-deduct linked raw ingredients from store inventory
                try {
                    const { data: recipes } = await supabase.from('pos_item_recipes').select('*');
                    if (recipes && recipes.length > 0) {
                        for (const item of cart) {
                            const itemRecipes = recipes.filter(r => r.pos_menu_item_name === item.name);
                            for (const r of itemRecipes) {
                                const qtyToDeduct = (r.quantity_per_order || 1) * (item.quantity || 1);
                                const { data: invItem } = await supabase
                                    .from('inventory_items')
                                    .select('quantity')
                                    .eq('id', r.inventory_item_id)
                                    .single();

                                if (invItem) {
                                    const newQty = Math.max(0, (parseFloat(invItem.quantity) || 0) - qtyToDeduct);
                                    await supabase
                                        .from('inventory_items')
                                        .update({ quantity: newQty })
                                        .eq('id', r.inventory_item_id);
                                }
                            }
                        }
                    }
                } catch (recErr) {
                    console.warn('Recipe auto-deduction non-fatal notice:', recErr);
                }
            }

            // Clear states
            setCartOpen(false);
            setCart([]);
            setCustomerName('');
            setCustomerNameText('');
            setSelectedTable('');
            setDiscountValue('');
            setDiscountType('none');
            setSplitCash('');
            setSplitMpesa('');
            setSplitCard('');
            setEditingOrderId(null);
            setCustomOrderDate('');
            scheduleLockAfterOrder(); // auto-lock 60s after order completes


            // Set receipt view data
            const receiptData = {
                id: orderData.id,
                ticket_number: orderData.ticket_number,
                created_at: orderData.created_at,
                customer_name: orderPayload.customer_name,
                dining_option: diningOption,
                payment_method: paymentMethod,
                payment_status: paymentStatus,
                total_amount: total,
                discount: discountAmount,
                cashier_name: orderPayload.cashier_name,
                splitDetails: orderPayload.notes,
                items: itemPayloads
            };
            setActiveReceipt(receiptData);

            // Auto-sync order & printed receipt to Guest CRM (Duplicate-Free Upsert)
            syncOrderToGuestCRM(receiptData);

            // QZ-aware print: try QZ first, fall back to popup window
            printOrFallback(
                frontDeskPrinter,
                buildCashierSlipsHTML(receiptData),
                () => printCashierSlips(receiptData)
            ).catch(console.warn);

            // Refresh open orders, tables, and history
            fetchOpenOrders();
            if (historyOrders.length > 0) {
                fetchHistory();
            }

            // Return to tables layout if checking out a dine-in table
            if (diningOption.startsWith('Table ')) {
                setActiveView('tables');
            }
        } catch (err) {
            console.error('Error placing/updating POS order:', err);
            alert('Failed to place/update order: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (checkingShift) {
        return (
            <div className="h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-primary" size={32} />
                <span className="text-sm font-bold uppercase tracking-wider">Checking Shift Status...</span>
            </div>
        );
    }

    if (!activeShift) {
        return (
            <div className="h-screen bg-gray-950 text-white flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md bg-gray-900 border border-gray-800 p-8 rounded-[2rem] shadow-2xl space-y-6"
                >
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-primary/10 text-primary flex items-center justify-center rounded-2xl mx-auto">
                            <ShoppingBag size={32} />
                        </div>
                        <h2 className="text-xl font-black uppercase tracking-wider">Open Cash Drawer</h2>
                        <p className="text-xs text-gray-400 font-bold uppercase">Cashier: {staffName || 'Cashier'}</p>
                    </div>

                    <div className="space-y-6">
                        <p className="text-center text-xs text-gray-400 font-bold uppercase leading-relaxed">Ready to start your shift? Click below to initialize the POS terminal.</p>
                        <button
                            onClick={handleOpenShift}
                            className="w-full py-3.5 bg-primary text-secondary font-black text-sm rounded-2xl shadow-lg hover:bg-primary-dark transition-all flex items-center justify-center gap-2"
                        >
                            Start Shift
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="h-screen w-screen bg-gray-50 flex flex-col font-sans text-secondary overflow-hidden">
            {/* Lock Screen Overlay */}
            <AnimatePresence>
                {isLocked && (
                    <motion.div
                        key="lock-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center p-6"
                    >
                        {/* Ambient background */}
                        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
                        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none" />

                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10"
                        >
                            <div className="flex flex-col items-center mb-8">
                                <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center mb-4 text-3xl">
                                    🔒
                                </div>
                                <h2 className="text-2xl font-black text-white text-center">Screen Locked</h2>
                                <p className="text-slate-400 text-sm font-medium mt-1 text-center">
                                    {staffName ? `Enter ${staffName}'s PIN to unlock` : 'Enter your PIN to unlock'}
                                </p>
                            </div>

                            <form onSubmit={handleUnlock} className="space-y-6">
                                <div className="flex justify-between gap-3 px-2">
                                    {lockPin.map((digit, i) => (
                                        <input
                                            key={i}
                                            id={`lock-pin-${i}`}
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            value={digit}
                                            onChange={(e) => handleLockPinInput(i, e.target.value)}
                                            onKeyDown={(e) => handleLockPinKeyDown(i, e)}
                                            className="w-14 h-16 text-center text-3xl font-bold bg-slate-800 border-2 border-slate-700 text-white rounded-2xl focus:border-emerald-500 focus:outline-none transition-colors"
                                        />
                                    ))}
                                </div>

                                <div className="min-h-[20px] text-center">
                                    {lockError && <p className="text-red-400 font-bold text-sm animate-pulse">{lockError}</p>}
                                </div>

                                <button
                                    type="submit"
                                    disabled={lockLoading || lockPin.join('').length !== 4}
                                    className="w-full flex justify-center items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-2xl font-bold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {lockLoading ? <Loader2 className="animate-spin" size={22} /> : 'Unlock Terminal'}
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <header className="bg-white border-b border-gray-100 px-4 py-3 sm:px-6 sm:py-4 flex flex-col lg:flex-row gap-3 lg:justify-between lg:items-center shrink-0 shadow-sm relative z-10">
                <div className="flex items-center justify-between lg:justify-start gap-3 w-full lg:w-auto">
                    <div className="flex items-center gap-3">
                        <button onClick={onSignOut} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-base sm:text-lg font-black text-gray-900 leading-tight">POS Terminal</h1>
                            <p className="text-[9px] sm:text-[10px] font-bold text-primary uppercase tracking-wider">Operator: {staffName || 'Cashier'}</p>
                        </div>
                    </div>
                    {/* Mobile Cart Button visible only on small viewports */}
                    <div className="flex lg:hidden items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCartOpen(!cartOpen)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                                cart.length > 0
                                    ? 'bg-primary text-secondary border-primary shadow-md scale-105'
                                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <ShoppingBag size={13} />
                            <span>Cart</span>
                            {cart.length > 0 && (
                                <span className="bg-secondary text-primary w-4.5 h-4.5 rounded-md flex items-center justify-center text-[9px] font-black leading-none shrink-0 shadow-sm">
                                    {cart.reduce((sum, item) => sum + item.quantity, 0)}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:gap-4 w-full lg:w-auto min-w-0 overflow-hidden">
                    {/* View Switcher Tabs */}
                    <div className="bg-gray-100 p-1 rounded-xl border border-gray-200/50 flex gap-1 overflow-x-auto no-scrollbar shrink-0 max-w-full">
                        <button
                            type="button"
                            onClick={() => setActiveView('menu')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                activeView === 'menu'
                                    ? 'bg-primary text-secondary shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Menu Grid
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveView('tables')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                activeView === 'tables'
                                    ? 'bg-primary text-secondary shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Dine-In Tables
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveView('history')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                activeView === 'history'
                                    ? 'bg-primary text-secondary shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Order History
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveView('menu_settings')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                activeView === 'menu_settings'
                                    ? 'bg-primary text-secondary shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            Menu Settings
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveView('campaigns')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                activeView === 'campaigns'
                                    ? 'bg-primary text-secondary shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            📢 Campaigns
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveView('feedback')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all relative flex items-center gap-1.5 ${
                                activeView === 'feedback'
                                    ? 'bg-emerald-600 text-white font-black shadow-sm'
                                    : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <span>💬 Customer Feedback</span>
                            <span className="px-1.5 py-0.2 bg-red-600 text-white text-[9px] font-black rounded-full animate-pulse shadow-sm">
                                +1
                            </span>
                        </button>
                        {isSystemAdmin && (
                            <button
                                type="button"
                                onClick={() => setActiveView('terminal_settings')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                                    activeView === 'terminal_settings'
                                        ? 'bg-primary text-secondary shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                Staff & Terminals
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowRegisterGuestModal(true)}
                        title="Register New Guest / Customer to CRM"
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#18A07A] hover:bg-[#128061] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95"
                    >
                        <UserPlus size={14} /> + New Guest
                    </button>

                    <button
                        type="button"
                        onClick={lockScreen}
                        title="Lock Screen"
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm"
                    >
                        🔒 Lock
                    </button>

                    <button
                        type="button"
                        onClick={onSignOut}
                        className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-gray-200 shadow-sm"
                    >
                        Exit (Keep Shift)
                    </button>

                    {/* QZ Tray connection status indicator */}
                    <button
                        type="button"
                        title={qzConnected ? 'QZ Tray connected — printers ready' : 'QZ Tray not connected — click to reconnect'}
                        onClick={() => connectQZ().then(() => setQzConnected(true)).catch(() => setQzConnected(false))}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm ${
                            qzConnected
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                        }`}
                    >
                        <span className={`w-2 h-2 rounded-full ${qzConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {qzConnected ? 'Printers OK' : 'Printers Off'}
                    </button>

                    {/* Auto-Accept Orders Toggle Button */}
                    <button
                        type="button"
                        onClick={toggleAutoAcceptOrders}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border shadow-sm cursor-pointer ${
                            autoAcceptMicrositeOrders
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-600/20'
                                : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                        }`}
                        title={autoAcceptMicrositeOrders ? "Auto-Accept Microsite Orders is ON (Click to Disable)" : "Auto-Accept Microsite Orders is OFF (Click to Enable)"}
                    >
                        <span className={`w-2 h-2 rounded-full ${autoAcceptMicrositeOrders ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
                        <span>⚡ Auto-Accept: {autoAcceptMicrositeOrders ? 'ON' : 'OFF'}</span>
                    </button>


                    {/* Cart Button */}
                    <button
                        type="button"
                        onClick={() => setCartOpen(!cartOpen)}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border shadow-sm ${
                            cart.length > 0
                                ? 'bg-primary text-secondary border-primary shadow-md hover:scale-[1.03] active:scale-[0.97]'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}
                    >
                        <ShoppingBag size={14} />
                        <span>Create Order</span>
                        {cart.length > 0 && (
                            <span className="bg-secondary text-primary w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black leading-none shrink-0 shadow-sm animate-pulse">
                                {cart.reduce((sum, item) => sum + item.quantity, 0)}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => setClosingModalOpen(true)}
                        className="px-4 py-1.5 bg-red-50 text-red-650 hover:bg-red-100 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-red-100 shadow-sm"
                    >
                        Close Shift
                    </button>
                    {activeView === 'menu' ? (
                        <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 w-full sm:w-64">
                            <Search size={16} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search menu..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-transparent text-sm w-full outline-none"
                            />
                        </div>
                    ) : activeView === 'menu_settings' ? (
                        <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 w-full sm:w-64">
                            <Search size={16} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search menu settings..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-transparent text-sm w-full outline-none"
                            />
                        </div>
                    ) : activeView === 'history' ? (
                        <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 w-full sm:w-64">
                            <Search size={16} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search history..."
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                                className="bg-transparent text-sm w-full outline-none"
                            />
                        </div>
                    ) : null}
                </div>
            </header>

            {/* Main Terminal Split Screen */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Left Panel: Menu Item Selector / Order History View */}
                {activeView === 'menu' && !activeBrand ? (
                    <div className={`flex-1 flex flex-col items-center justify-center p-6 md:p-10 bg-slate-950 text-white overflow-y-auto ${cartOpen ? 'sm:mr-[440px]' : ''} transition-all duration-200 relative`}>
                        {/* Background ambient lighting */}
                        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
                        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

                        <div className="max-w-4xl w-full text-center space-y-8 my-auto z-10">
                            <div className="space-y-3">
                                <span className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    POS Terminal · Cashier: {staffName}
                                </span>
                                <h2 className="text-3xl md:text-5xl font-black text-white tracking-tight">Select Restaurant Brand</h2>
                                <p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto leading-relaxed">
                                    Click a restaurant brand to view its menu catalog and start punching in customer orders.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
                                {BRAND_OPTIONS.map(br => {
                                    const itemCount = menu.filter(item => itemBelongsToBrand(item, br.id)).length;
                                    return (
                                        <motion.button
                                            key={br.id}
                                            whileHover={{ scale: 1.04, y: -4 }}
                                            whileTap={{ scale: 0.96 }}
                                            onClick={() => {
                                                setActiveBrand(br.id);
                                                setSelectedBrand(br.id);
                                            }}
                                            className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500/60 p-6 rounded-3xl flex flex-col items-center text-center space-y-4 shadow-2xl transition-all group cursor-pointer relative overflow-hidden"
                                        >
                                            <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${br.color} p-0.5 shadow-xl group-hover:scale-105 transition-transform flex items-center justify-center`}>
                                                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center overflow-hidden p-2">
                                                    <img
                                                        src={br.logo}
                                                        alt={br.name}
                                                        className="w-full h-full object-contain"
                                                        onError={e => {
                                                            e.target.style.display = 'none';
                                                            if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                                                        }}
                                                    />
                                                    <span className="text-4xl hidden">{br.icon}</span>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <h3 className="font-black text-lg text-white group-hover:text-emerald-400 transition-colors">{br.name}</h3>
                                                <p className="text-xs text-slate-400 leading-snug">{br.tagline}</p>
                                            </div>

                                            <div className="pt-2 flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3.5 py-1.5 rounded-full border border-emerald-500/20">
                                                <span>{itemCount} Items</span>
                                                <ChevronRight size={14} />
                                            </div>
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {isSystemAdmin && (
                                <div className="pt-2">
                                    <button
                                        onClick={() => {
                                            setActiveBrand('All');
                                            setSelectedBrand('POT OF JOLLOF');
                                        }}
                                        className="text-xs text-slate-500 hover:text-slate-300 font-semibold underline underline-offset-4 transition-colors"
                                    >
                                        Or view combined multi-brand menu (Admin Override)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ) : activeView === 'menu' && (
                    <div className={`flex-1 flex flex-col overflow-hidden bg-gray-50/50 p-3 sm:p-6 gap-4 sm:gap-6 pb-20 sm:pb-6 ${cartOpen ? 'sm:mr-[440px]' : ''} transition-all duration-200`}>
                        {/* Brand Header — active brand + switcher only */}
                        {(() => {
                            const activeBrandInfo = BRAND_OPTIONS.find(b => b.id === activeBrand);
                            return (
                                <div className="flex items-center gap-3 pb-3 border-b border-gray-200 shrink-0">
                                    {/* Active brand badge */}
                                    {activeBrandInfo && (
                                        <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-2xl px-3.5 py-2 shadow-sm">
                                            <img
                                                src={activeBrandInfo.logo}
                                                alt={activeBrandInfo.name}
                                                className="w-6 h-6 object-contain rounded"
                                                onError={e => { e.target.style.display = 'none'; }}
                                            />
                                            <span className="font-black text-sm text-gray-900">{activeBrandInfo.name}</span>
                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                                {filteredMenu.length} items
                                            </span>
                                        </div>
                                    )}
                                    {/* Switch brand button */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveBrand(null)}
                                        className="flex items-center gap-1.5 bg-slate-900 text-white hover:bg-slate-700 px-3.5 py-2 rounded-2xl font-bold text-xs shadow-sm transition-all"
                                    >
                                        <ArrowLeft size={13} />
                                        <span>Switch Brand</span>
                                    </button>
                                </div>
                            );
                        })()}


                        {/* Split Panel: Category Sidebar + Menu Items */}
                        <div className="flex-1 flex overflow-hidden gap-2 min-h-0 min-w-0">

                            {/* Left: Category Sidebar */}
                            <div className="w-20 sm:w-36 md:w-44 flex flex-col gap-1 overflow-y-auto custom-scrollbar shrink-0">
                                {[{ name: 'All', icon: '🍽️' }, ...visibleCategories].map(cat => {
                                    const count = cat.name === 'All'
                                        ? filteredMenu.length
                                        : filteredMenu.filter(i => i.category === cat.name).length;
                                    return (
                                        <button
                                            key={cat.name}
                                            onClick={() => setActiveCategory(cat.name)}
                                            className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-center transition-all shrink-0 border ${
                                                activeCategory === cat.name
                                                    ? 'bg-gray-900 text-white border-gray-900 shadow-lg'
                                                    : 'bg-white border-gray-100 hover:bg-gray-50 text-gray-500 hover:border-gray-200'
                                            }`}
                                        >
                                            <span className="text-2xl leading-none">{cat.icon}</span>
                                            <span className="font-bold text-[10px] leading-tight line-clamp-2">{cat.name}</span>
                                            {count > 0 && (
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                                    activeCategory === cat.name
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-gray-100 text-gray-400'
                                                }`}>{count}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Right: Menu Items Grid */}
                            <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar pr-1">
                                {loadingMenu ? (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                                        <Loader2 className="animate-spin text-primary" size={32} />
                                        <span className="text-sm font-bold">Loading Menu...</span>
                                    </div>
                                ) : filteredMenu.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-gray-400 font-bold text-sm">
                                        No items found matching selection.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pb-6">
                                        {filteredMenu.map(item => {
                                            const cartQty = cart.find(c => c.id === item.id)?.quantity || 0;
                                            const displayPrice = calculateChannelPrice(item, orderChannel, activeBrand);
                                            const basePrice = parseFloat(item.price) || 0;
                                            const hasMarkup = displayPrice !== basePrice;
                                            const isOut = item.is_available === false;
                                            const isForDay = item.out_of_stock_type === 'day';

                                            return (
                                                <motion.div
                                                    key={item.id}
                                                    whileTap={!isOut ? { scale: 0.97 } : {}}
                                                    onClick={() => {
                                                        if (isOut) {
                                                            alert(`"${item.name}" is currently OUT OF STOCK (${isForDay ? 'for the rest of the day' : 'indefinitely'}). Tap the green "🟢 Turn On" button to make it available.`);
                                                        } else {
                                                            addToCart(item);
                                                        }
                                                    }}
                                                    className={`rounded-3xl p-3 sm:p-4 border shadow-sm relative overflow-hidden group flex flex-col justify-between h-36 sm:h-44 transition-all ${
                                                        isOut 
                                                            ? 'bg-rose-50/30 border-rose-200 opacity-90 cursor-not-allowed' 
                                                            : 'bg-white border-gray-100 hover:border-primary/30 cursor-pointer'
                                                    }`}
                                                >
                                                    {/* RED BAR BANNER OVERLAY FOR OUT OF STOCK ITEMS */}
                                                    {isOut && (
                                                        <div className="absolute top-0 inset-x-0 bg-red-600 text-white font-black text-[9px] uppercase tracking-wider py-1 px-2 text-center shadow-sm flex items-center justify-center gap-1 z-10">
                                                            <span>⛔ OUT OF STOCK ({isForDay ? 'REST OF DAY' : 'INDEFINITELY'})</span>
                                                        </div>
                                                    )}

                                                    {cartQty > 0 && !isOut && (
                                                        <div className="absolute top-3 right-3 bg-primary text-secondary w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shadow z-10">
                                                            {cartQty}×
                                                        </div>
                                                    )}

                                                    <div className={`flex flex-col gap-1 ${isOut ? 'pt-4' : ''}`}>
                                                        <span className="text-3xl mb-1 mt-1 block">
                                                            {item.image_url
                                                                ? <img src={item.image_url} alt={item.name} className={`w-10 h-10 rounded-xl object-cover ${isOut ? 'grayscale-[50%]' : ''}`} />
                                                                : item.category === 'Starters & Bites' ? '🍢' :
                                                                  item.category === 'Breakfast' ? '🍳' :
                                                                  item.category === 'Jollof Combos' ? '🍛' :
                                                                  item.category === 'Stews' ? '🍲' :
                                                                  item.category === 'Soups' ? '🥣' :
                                                                  item.category === 'Hot Beverages' ? '☕' :
                                                                  item.category === 'Beverages' ? '🥤' : '🍽️'}
                                                        </span>
                                                        <h3 className={`font-bold text-sm leading-tight line-clamp-1 ${isOut ? 'text-rose-950 line-through' : 'text-gray-900 group-hover:text-primary transition-colors'}`}>{item.name}</h3>
                                                        <p className="text-[10px] text-gray-400 font-semibold line-clamp-2 leading-relaxed mt-0.5">{item.description}</p>
                                                    </div>

                                                    <div className="flex justify-between items-center border-t border-gray-100 pt-2.5 mt-2">
                                                        <div className="flex flex-col">
                                                            <span className={`font-mono font-black text-sm ${isOut ? 'text-gray-400' : 'text-gray-900'}`}>KES {displayPrice.toLocaleString()}</span>
                                                            {hasMarkup && (
                                                                <span className="text-[8px] text-amber-600 font-black tracking-tight">({orderChannel} Price)</span>
                                                            )}
                                                        </div>

                                                        {/* Modern Interactive Availability Toggle Switch */}
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (isOut) {
                                                                    handleTurnOnItem(item);
                                                                } else {
                                                                    setItemToTurnOffModal(item);
                                                                }
                                                            }}
                                                            className={`px-2.5 py-1 rounded-full text-[9.5px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 shrink-0 z-20 cursor-pointer shadow-xs ${
                                                                !isOut 
                                                                    ? 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600' 
                                                                    : 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700'
                                                            }`}
                                                            title={!isOut ? "Click to 86 / Turn OFF item" : "Click to Turn ON item"}
                                                        >
                                                            <span className={`w-2 h-2 rounded-full ${!isOut ? 'bg-white animate-pulse' : 'bg-white'}`} />
                                                            <span>{!isOut ? 'In Stock' : '86 / Out'}</span>
                                                        </button>

                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>

                                )}
                            </div>
                        </div>
                    </div>
                )}


                {activeView === 'tables' && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/50 p-6 gap-6">
                        <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm p-6 gap-6">
                            {/* Incoming Microsite Orders Widget */}
                            {(() => {
                                const pendingMicrosite = openOrders.filter(
                                    o => o.cashier_name === 'Self-Service Microsite' && o.status === 'Pending'
                                );
                                if (pendingMicrosite.length === 0) return null;
                                return (
                                    <div className="bg-amber-50/65 border border-amber-200/80 p-5 rounded-3xl space-y-3 shrink-0 animate-pulse-slow">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">🔔</span>
                                                <span className="text-xs font-black uppercase tracking-wider text-amber-850">Microsite Orders (Pending Approval)</span>
                                            </div>
                                            <span className="bg-amber-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{pendingMicrosite.length} New</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-48 overflow-y-auto custom-scrollbar">
                                            {pendingMicrosite.map(order => (
                                                <div key={order.id} className="bg-white border border-amber-100 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-sm hover:shadow transition-all">
                                                    <div>
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <span className="text-[10px] font-black text-white bg-amber-600 px-2 py-0.5 rounded uppercase tracking-wider">#{obfuscateTicket(order.ticket_number)}</span>
                                                                <span className="text-[10px] text-gray-500 block mt-1 font-bold">{order.customer_name} ({order.dining_option})</span>
                                                                {(order.dining_option === "Delivery" || order.delivery_address) && (
                                                                    <div className="text-[10px] font-black text-amber-900 bg-amber-50 p-1.5 rounded-lg border border-amber-200 mt-1 flex items-start gap-1">
                                                                        <span>📍</span>
                                                                        <span className="truncate leading-tight">
                                                                        <span className="truncate leading-tight">{order.delivery_address || (order.notes || "").replace("Delivery Address:", "").split("\n")[0].trim() || "Delivery Order"}</span>

                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="font-mono font-black text-xs text-gray-900">KES {order.total_amount.toLocaleString()}</span>
                                                        </div>
                                                        <div className="mt-2 text-[10px] text-gray-500 font-semibold space-y-0.5 border-t border-gray-50 pt-2">
                                                            {(order.items || []).map((itm, idx) => (
                                                                <div key={idx} className="flex justify-between">
                                                                    <span>{itm.quantity}x {itm.item_name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 border-t border-gray-50 pt-2">
                                                        <button
                                                            onClick={() => handleAcceptOrder(order)}
                                                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors shadow-sm"
                                                        >
                                                            Accept
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeclineOrder(order)}
                                                            className="flex-1 py-1.5 bg-red-50 hover:bg-red-150 text-red-600 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-red-100 transition-all"
                                                        >
                                                            Decline
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div>
                                <h3 className="font-black text-gray-900 text-sm">Dine-In Table Map</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Click a table card to start a new order or manage an open tab.</p>
                            </div>

                            {/* Tables grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto custom-scrollbar pr-1">
                                {TABLES.map(table => {
                                    // Find open order matching this table (ignoring completed/cancelled/voided)
                                    const openOrder = openOrders.find(
                                        order => order.customer_name?.toLowerCase() === table.toLowerCase() &&
                                                 order.status !== 'Cancelled' &&
                                                 order.status !== 'Declined' &&
                                                 order.status !== 'Completed' &&
                                                 order.status !== 'Returned' &&
                                                 order.payment_status !== 'Voided'
                                    );

                                    return (
                                        <div
                                            key={table}
                                            onClick={() => {
                                                setCartOpen(true);
                                                if (openOrder) {
                                                    // Load open order into active cart
                                                    setCustomerName(openOrder.customer_name);
                                                    setSelectedTable(openOrder.customer_name);
                                                    
                                                    // Try to parse guest name from notes
                                                    const guestMatch = (openOrder.notes || '').match(/Customer:\s*([^,]*)/);
                                                    setCustomerNameText(guestMatch ? guestMatch[1] : '');

                                                    setDiningOption(openOrder.dining_option);
                                                    setPaymentMethod(openOrder.payment_method);
                                                    setPaymentStatus(openOrder.payment_status);
                                                    setEditingOrderId(openOrder.id);
                                                    setSelectedBrand(openOrder.brand || 'POT OF JOLLOF');
                                                    setOrderChannel(openOrder.order_channel || 'Walk-in');
                                                    if (openOrder.discount > 0) {
                                                        setDiscountType('flat');
                                                        setDiscountValue(String(openOrder.discount));
                                                    } else {
                                                        setDiscountType('none');
                                                        setDiscountValue('');
                                                    }
                                                    // Load items
                                                    setCart(mapOrderItemsToCart(openOrder.items));
                                                } else {
                                                    // Start new order for this table
                                                    setCart([]);
                                                    setCustomerName(table);
                                                    setSelectedTable(table);
                                                    setCustomerNameText('');
                                                    setDiningOption('Dine-in'); // pre-select table model Dine-in
                                                    setEditingOrderId(null);
                                                    setSelectedBrand('POT OF JOLLOF');
                                                    setOrderChannel('Walk-in');
                                                    setDiscountType('none');
                                                    setDiscountValue('');
                                                }
                                                setActiveView('menu');
                                            }}
                                            className={`h-28 sm:h-36 rounded-3xl p-4 sm:p-5 border flex flex-col justify-between text-left transition-all cursor-pointer select-none ${
                                                openOrder
                                                    ? 'bg-orange-50 border-orange-200 text-orange-850 hover:bg-orange-100/70 shadow-sm'
                                                    : 'bg-white border-gray-100 text-gray-500 hover:border-emerald-300 hover:bg-emerald-50/10'
                                            }`}
                                        >
                                            <div className="flex justify-between items-start w-full">
                                                <span className="font-black text-sm text-gray-900">{table}</span>
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                                    openOrder ? 'bg-orange-200/60 text-orange-850' : 'bg-gray-100 text-gray-400'
                                                }`}>
                                                    {openOrder ? 'Occupied' : 'Vacant'}
                                                </span>
                                            </div>

                                            {openOrder ? (
                                                <div className="space-y-1 w-full">
                                                    <div className="flex justify-between items-center w-full">
                                                        <div className="text-[10px] font-bold text-orange-700">Ticket #{obfuscateTicket(openOrder.ticket_number)}</div>
                                                        {openOrder.payment_status === 'Paid' && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleVacateTable(openOrder.id);
                                                                }}
                                                                title="Clear/Vacate table"
                                                                className="px-2 py-0.5 bg-gray-900 text-white hover:bg-black font-black text-[8px] rounded uppercase tracking-wider transition-colors shadow-sm"
                                                            >
                                                                Vacate
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] font-mono text-gray-500">{openOrder.items?.length || 0} items active</div>
                                                    <div className="font-mono font-black text-gray-900 text-xs mt-1">KES {openOrder.total_amount.toLocaleString()}</div>
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Start New Order</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Other Open Orders (not tables) */}
                            <div className="border-t border-gray-100 pt-5 mt-auto">
                                <h4 className="font-black text-gray-800 text-xs mb-3">Other Open Tabs (Pending Payments)</h4>
                                <div className="space-y-2 overflow-y-auto max-h-48 custom-scrollbar pr-1">
                                    {openOrders
                                        .filter(order => !TABLES.some(t => t.toLowerCase() === order.customer_name?.toLowerCase()))
                                        .map(order => (
                                            <div key={order.id} className="p-3 bg-gray-50 border border-gray-100 rounded-2xl flex justify-between items-center">
                                                <div>
                                                    <div className="font-bold text-xs text-gray-900">{order.customer_name} ({order.dining_option})</div>
                                                    <div className="text-[10px] text-gray-400 font-semibold">Ticket #{obfuscateTicket(order.ticket_number)} • {order.items?.length || 0} items</div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono font-black text-xs text-gray-900">KES {order.total_amount.toLocaleString()}</span>
                                                    <button
                                                        onClick={() => {
                                                            setCartOpen(true);
                                                            setCustomerName(order.customer_name);
                                                            setDiningOption(order.dining_option);
                                                            setPaymentMethod(order.payment_method);
                                                            setPaymentStatus(order.payment_status);
                                                            setEditingOrderId(order.id);
                                                            setSelectedBrand(order.brand || 'POT OF JOLLOF');
                                                            setOrderChannel(order.order_channel || 'Walk-in');
                                                            if (order.discount > 0) {
                                                                setDiscountType('flat');
                                                                setDiscountValue(String(order.discount));
                                                            } else {
                                                                setDiscountType('none');
                                                                setDiscountValue('');
                                                            }
                                                            setCart(mapOrderItemsToCart(order.items));
                                                            setActiveView('menu');
                                                        }}
                                                        className="px-3 py-1 bg-white border border-gray-200 text-gray-700 font-bold text-[10px] rounded-lg hover:bg-gray-100 transition-colors"
                                                    >
                                                        Manage
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    }
                                    {openOrders.filter(order => !TABLES.some(t => t.toLowerCase() === order.customer_name?.toLowerCase())).length === 0 && (
                                        <p className="text-[10px] text-gray-400 font-semibold italic">No other open tabs found.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeView === 'history' && (() => {
                    const BEV_CATEGORIES = ['Beverages', 'Hot Beverages', 'Drinks'];
                    const isDeliveryItem = (name) => /^delivery/i.test((name || '').trim());
                    const isPackagingItem = (name) => /^pack(age|aging)?\s*fee/i.test((name || '').trim());

                    return (
                        <div className="flex-1 flex flex-col lg:flex-row h-full max-h-full overflow-hidden bg-gray-50/50 p-3 sm:p-6 pb-20 sm:pb-6 gap-4 sm:gap-6">
                            {/* Left Column: Summary and Order History List */}
                            <div className="flex-1 flex flex-col h-full max-h-full overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm">
                            
                            {/* Dashboard Sales Summary Panel */}
                            {(() => {
                                let totalOrders = 0;
                                let totalSales = 0;
                                let cashSales = 0;
                                let cardSales = 0;
                                let unclearedSales = 0;
                                let unclearedCount = 0;
                                let returnedSales = 0;
                                let returnedCount = 0;
                                let paybillSales = 0;
                                let appSales = 0;
                                let andoSales = 0;
                                let foodSales = 0;
                                let beverageSales = 0;
                                let packagingSales = 0;
                                let deliverySales = 0;
                                let deliveryCount = 0;
                                let totalDeliveryOrders = 0;
                                let totalDiscounts = 0;
                                const brandDiscounts = {};
                                const brandSales = {};


                                const channels = {
                                    'Walk-in': { count: 0, amount: 0, discount: 0 },
                                    'WhatsApp': { count: 0, amount: 0, discount: 0 },
                                    'Uber Eats': { count: 0, amount: 0, discount: 0 },
                                    'Glovo': { count: 0, amount: 0, discount: 0 },
                                    'Bolt Food': { count: 0, amount: 0, discount: 0 },
                                    'Ando': { count: 0, amount: 0, discount: 0 },
                                };

                                historyOrders.forEach(order => {
                                    if (order.status === 'Returned') {
                                        let orderBrand = (order.brand || 'ManiPOS').trim();
                                        const brandUpper = orderBrand.toUpperCase();
                                        if (brandUpper.includes('MANIPOS') || brandUpper === '') {
                                            orderBrand = 'ManiPOS';
                                        }
                                        returnedSales += order.total_amount;
                                        returnedCount++;
                                        if (!brandSales[orderBrand]) brandSales[orderBrand] = { sales: 0, orders: 0 };
                                        brandSales[orderBrand].sales -= order.total_amount;
                                        brandSales[orderBrand].orders -= 1;
                                        return;
                                    }
                                    if (order.status === 'Cancelled' || order.status === 'Declined' || order.payment_status === 'Voided') return;

                                    totalSales += order.total_amount;
                                    totalOrders++;

                                    // Item-level breakdown — pro-rated by explicit discount if applied
                                    const itemsArr = order.items || [];
                                    const grossItemTotal = itemsArr.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
                                    const orderDiscount = (typeof order.discount === 'number' && !isNaN(order.discount)) ? Math.max(0, order.discount) : (order.discount ? parseFloat(order.discount) || 0 : 0);
                                    const discountRatio = (grossItemTotal > 0 && orderDiscount > 0) ? Math.max(0, (grossItemTotal - orderDiscount) / grossItemTotal) : 1;
                                    totalDiscounts += orderDiscount;
                                    // Track discount and sales per brand
                                    let orderBrand = (order.brand || '').trim();
                                    const brandUpper = orderBrand.toUpperCase();
                                    if (!orderBrand || brandUpper.includes('MANIPOS') || brandUpper.includes('JOLLOF') || brandUpper.includes('POJ')) {
                                        orderBrand = 'POT OF JOLLOF';
                                    } else if (brandUpper.includes('LAGOS')) {
                                        orderBrand = 'LITTLE LAGOS';
                                    } else if (brandUpper.includes('SWAHILI')) {
                                        orderBrand = 'CAFE SWAHILI';
                                    }
                                    if (!brandDiscounts[orderBrand]) brandDiscounts[orderBrand] = { discount: 0, grossSales: 0 };
                                    brandDiscounts[orderBrand].discount += orderDiscount;
                                    brandDiscounts[orderBrand].grossSales += grossItemTotal;

                                    if (!brandSales[orderBrand]) brandSales[orderBrand] = { sales: 0, orders: 0 };
                                    brandSales[orderBrand].sales += order.total_amount;
                                    brandSales[orderBrand].orders += 1;

                                    itemsArr.forEach(item => {
                                        const nm = item.item_name || '';
                                        const rawAmt = (item.price || 0) * (item.quantity || 1);
                                        const amt = rawAmt * discountRatio;
                                        const menuItem = (menu || []).find(m => m.name === nm);
                                        const category = item.category || (menuItem ? menuItem.category : '');
                                        if (isDeliveryItem(nm)) { deliverySales += amt; deliveryCount++; }
                                        else if (isPackagingItem(nm)) { packagingSales += amt; }
                                        else if (BEV_CATEGORIES.includes(category)) { beverageSales += amt; }
                                        else { foodSales += amt; }
                                    });

                                     const pm = (order.payment_method || '').toLowerCase().trim();
                                     const ch = (order.order_channel || '').toLowerCase().trim();
                                     const isAppChannel = ch.includes('uber') || ch.includes('glovo') || ch.includes('bolt') || ch.includes('ando') || pm.includes('app') || pm.includes('paid');

                                     if (order.payment_status === 'Pending' && !isAppChannel) {
                                         unclearedSales += order.total_amount;
                                         unclearedCount++;
                                     } else {
                                         if (pm === 'cash') {
                                             cashSales += order.total_amount;
                                         } else if (pm === 'card') {
                                             cardSales += order.total_amount;
                                         } else if (pm.includes('mpesa') || pm.includes('m-pesa') || pm.includes('paybill') || pm.includes('i&m')) {
                                             paybillSales += order.total_amount;
                                         } else if (pm.includes('ando')) {
                                             andoSales += order.total_amount;
                                         } else if (isAppChannel) {
                                             appSales += order.total_amount;
                                         } else if (pm === 'split') {
                                             const notes = order.notes || '';
                                             const cashMatch = notes.match(/Cash \(KES ([\d.]+)\)/);
                                             const mpesaMatch = notes.match(/M-Pesa \(KES ([\d.]+)\)/);
                                             const cardMatch = notes.match(/Card \(KES ([\d.]+)\)/);

                                             if (cashMatch) cashSales += parseFloat(cashMatch[1]) || 0;
                                             if (mpesaMatch) paybillSales += parseFloat(mpesaMatch[1]) || 0;
                                             if (cardMatch) cardSales += parseFloat(cardMatch[1]) || 0;
                                         } else {
                                             cashSales += order.total_amount;
                                         }
                                     }

                                    // Map order_channel to canonical channel name
                                    const rawCh = (order.order_channel || '').trim();
                                    const chLower = rawCh.toLowerCase();
                                    let mappedCh = 'Walk-in';
                                    if (chLower === 'whatsapp') mappedCh = 'WhatsApp';
                                    else if (chLower === 'ubereats' || chLower === 'uber eats') mappedCh = 'Uber Eats';
                                    else if (chLower === 'glovo') mappedCh = 'Glovo';
                                    else if (chLower === 'bolt food') mappedCh = 'Bolt Food';
                                    else if (chLower === 'ando') mappedCh = 'Ando';

                                    if (!channels[mappedCh]) {
                                        channels[mappedCh] = { count: 0, amount: 0, discount: 0 };
                                    }
                                    channels[mappedCh].count++;
                                    channels[mappedCh].amount += order.total_amount;
                                    channels[mappedCh].discount += orderDiscount;
                                });

                                return (
                                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 sm:p-5 bg-gray-50/50 border-b border-gray-100 shrink-0">
                                        {/* Card 1: Total Sales Overview */}
                                        <div 
                                            onClick={() => setHistorySearch('')}
                                            className="bg-white p-4 h-40 rounded-2xl border border-gray-200/60 hover:border-emerald-400 cursor-pointer shadow-sm transition-all hover:scale-[1.02] flex flex-col justify-between"
                                            title="Click to clear filters and show all orders"
                                        >
                                            <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider flex justify-between items-center w-full">
                                                <span>Total Sales</span>
                                                {historySearch && (
                                                    <span className="text-[8px] bg-emerald-100 px-1.5 py-0.5 rounded font-black tracking-widest text-emerald-800 animate-pulse shrink-0">Filtered</span>
                                                )}
                                            </span>
                                            <div className="flex items-center gap-3 mt-auto mb-auto pt-2 pb-2">
                                                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg shrink-0">
                                                    📈
                                                </div>
                                                <div>
                                                    <h4 className="text-base font-black text-emerald-600 font-mono flex items-center gap-1.5 flex-wrap">
                                                        KES {Math.round(totalSales).toLocaleString()}
                                                        {(() => {
                                                            if (prevPeriodSales <= 0) return null;
                                                            const diff = totalSales - prevPeriodSales;
                                                            const pct = (diff / prevPeriodSales) * 100;
                                                            const isPositive = pct >= 0;
                                                            return (
                                                                <span className={`inline-flex items-center text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                                                    isPositive 
                                                                        ? 'bg-emerald-50 text-emerald-700' 
                                                                        : 'bg-rose-50 text-rose-700'
                                                                }`} title={`Previous Period Sales: KES ${Math.round(prevPeriodSales).toLocaleString()}`}>
                                                                    {isPositive ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
                                                                </span>
                                                            );
                                                        })()}
                                                    </h4>
                                                    <p className="text-[10px] text-gray-500 font-bold">{totalOrders - unclearedCount} Completed</p>
                                                    {totalDiscounts > 0 && (
                                                        <p className="text-[9px] font-bold text-rose-500 font-mono">-KES {Math.round(totalDiscounts).toLocaleString()} in discounts</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 2: Payment Method */}
                                        <div className="bg-white p-3.5 min-h-[168px] rounded-2xl border border-gray-200/60 shadow-sm flex flex-col justify-between">
                                            <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Payment Method</span>
                                            <div className="mt-1 space-y-0.5 text-[10px] font-semibold text-gray-600 overflow-y-auto max-h-20 custom-scrollbar pr-1">
                                                <div 
                                                    onClick={() => setHistorySearch('CASH')}
                                                    className={`flex justify-between p-1 -mx-1 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${historySearch?.toUpperCase() === 'CASH' ? 'bg-emerald-50 text-emerald-800 font-black' : ''}`}
                                                    title="Filter by Cash"
                                                >
                                                    <span>💵 Cash:</span>
                                                    <span className="font-mono text-gray-900 font-bold">KES {cashSales.toLocaleString()}</span>
                                                </div>

                                                <div 
                                                    onClick={() => setHistorySearch('CARD')}
                                                    className={`flex justify-between p-1 -mx-1 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${historySearch?.toUpperCase() === 'CARD' ? 'bg-emerald-50 text-emerald-800 font-black' : ''}`}
                                                    title="Filter by Card"
                                                >
                                                    <span>💳 Card:</span>
                                                    <span className="font-mono text-gray-900 font-bold">KES {cardSales.toLocaleString()}</span>
                                                </div>
                                                <div 
                                                    onClick={() => setHistorySearch('I&M')}
                                                    className={`flex justify-between p-1 -mx-1 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${historySearch?.toUpperCase().includes('I&M') ? 'bg-blue-50 text-blue-800 font-black' : ''}`}
                                                    title="Filter by M-Pesa / I&M Paybill"
                                                >
                                                    <span>📱 Paybill / M-Pesa:</span>
                                                    <span className="font-mono text-gray-900 font-bold">KES {paybillSales.toLocaleString()}</span>
                                                </div>
                                                <div 
                                                    onClick={() => setHistorySearch('Paid to APP')}
                                                    className={`flex justify-between p-1 -mx-1 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${historySearch?.toLowerCase() === 'paid to app' ? 'bg-purple-50 text-purple-800 font-black' : ''}`}
                                                    title="Filter by Paid to App"
                                                >
                                                    <span>📲 Paid to App:</span>
                                                    <span className="font-mono text-gray-900 font-bold">KES {appSales.toLocaleString()}</span>
                                                </div>
                                                {andoSales > 0 && (
                                                    <div 
                                                        onClick={() => setHistorySearch('ANDO')}
                                                        className={`flex justify-between p-1 -mx-1 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${historySearch?.toUpperCase() === 'ANDO' ? 'bg-orange-50 text-orange-800 font-black' : ''}`}
                                                        title="Filter by ANDO"
                                                    >
                                                        <span>🍽️ ANDO:</span>
                                                        <span className="font-mono text-gray-900 font-bold">KES {andoSales.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {returnedSales > 0 && (
                                                    <div 
                                                        onClick={() => setHistorySearch('Returned')}
                                                        className={`flex justify-between p-1 -mx-1 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${historySearch?.toUpperCase() === 'RETURNED' ? 'bg-red-50 text-red-800 font-black' : ''}`}
                                                        title="Filter by Returned"
                                                    >
                                                        <span>↩️ Returned:</span>
                                                        <span className="font-mono text-red-650 font-bold">KES {returnedSales.toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Total Paid Collected Summary Row */}
                                            <div className="pt-1 mt-1 border-t border-gray-200 flex justify-between items-center font-black text-[10px] shrink-0 bg-white">
                                                <span className="text-gray-700 uppercase tracking-wider">Total Paid:</span>
                                                <span className="font-mono text-emerald-700 text-xs font-black">
                                                    KES {(cashSales + cardSales + paybillSales + appSales + andoSales).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Card 3: Uncleared Orders */}
                                        <div 
                                            onClick={() => setHistorySearch('Pending')}
                                            className="bg-white p-4 min-h-[168px] rounded-2xl border border-amber-200 hover:border-amber-400 bg-amber-50/10 cursor-pointer shadow-sm transition-all hover:scale-[1.02] flex flex-col justify-between"
                                            title="Click to filter by Pending/Uncleared orders"
                                        >
                                            <span className="text-[10px] text-amber-600 font-black uppercase tracking-wider flex items-center justify-between w-full">
                                                <span>Uncleared / Pending</span>
                                                <span className="text-[8px] bg-amber-100 px-1.5 py-0.5 rounded font-black tracking-widest text-amber-800 shrink-0">Filter</span>
                                            </span>
                                            <div className="flex items-center gap-3 mt-auto mb-auto pt-2 pb-2">
                                                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg shrink-0">
                                                    ⏳
                                                </div>
                                                <div>
                                                    <h4 className="text-base font-black text-amber-600 font-mono">KES {unclearedSales.toLocaleString()}</h4>
                                                    <p className="text-[10px] text-gray-500 font-bold">{unclearedCount} Open Bills</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 4: Top Performing Channels */}
                                        {(() => {
                                            const CHANNEL_LOGO = {
                                                'Walk-in': <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-100 text-blue-600 text-[8px] font-black shrink-0">WI</span>,
                                                'WhatsApp': <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
                                                'Uber Eats': <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-black text-[6px] font-black text-white shrink-0" style={{color:'#06C167',background:'#000'}}>UE</span>,
                                                'Glovo': <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[6px] font-black shrink-0" style={{background:'#FFC244',color:'#00A082'}}>G°</span>,
                                                'Bolt Food': <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[6px] font-black text-white shrink-0" style={{background:'#34D186'}}>BF</span>,
                                                'Ando': <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[6px] font-black text-white shrink-0" style={{background:'#E8291C'}}>an</span>,
                                            };
                                            const sorted = Object.entries(channels)
                                                .filter(([, v]) => v.count > 0)
                                                .sort((a, b) => b[1].amount - a[1].amount);
                                            const maxAmount = sorted[0]?.[1]?.amount || 1;
                                            return (
                                                <div className="bg-white p-3.5 min-h-[168px] rounded-2xl border border-gray-200/60 shadow-sm flex flex-col justify-between">
                                                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Top Channels</span>
                                                    {sorted.length === 0 ? (
                                                        <p className="text-[10px] text-gray-400 font-bold mt-1">No data yet</p>
                                                    ) : (
                                                        <>
                                                            <div className="mt-1 space-y-0.5 text-[10px] font-semibold text-gray-600 overflow-y-auto max-h-20 custom-scrollbar pr-1">
                                                                {sorted.map(([name, data]) => (
                                                                    <div
                                                                        key={name}
                                                                        onClick={() => setHistorySearch(historySearch === name ? '' : name)}
                                                                        className={`cursor-pointer group p-1.5 -mx-1.5 rounded-xl transition-all ${historySearch === name ? 'bg-emerald-50/80 font-black ring-1 ring-emerald-100/50' : 'hover:bg-gray-50/50'}`}
                                                                        title={`Filter by ${name}`}
                                                                    >
                                                                        <div className="flex justify-between items-center gap-2 mb-0.5">
                                                                            <span className="text-[9px] font-black text-gray-700 flex items-center gap-1 min-w-0">{CHANNEL_LOGO[name] || <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-200 text-[6px] font-black shrink-0">?</span>} <span className="truncate">{name}</span></span>
                                                                            <div className="flex flex-col items-end shrink-0">
                                                                                <span className="text-[9px] font-mono font-black text-gray-900 whitespace-nowrap">{data.count} · KES {Math.round(data.amount).toLocaleString()}</span>
                                                                                {data.discount > 0 && (
                                                                                    <span 
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const query = `discount:${name.toLowerCase()}`;
                                                                                            setHistorySearch(historySearch === query ? '' : query);
                                                                                        }}
                                                                                        className="text-[8px] font-mono font-bold text-rose-500 hover:text-rose-700 hover:underline cursor-pointer whitespace-nowrap"
                                                                                        title={`Click to show only discounted ${name} orders`}
                                                                                    >
                                                                                        -KES {Math.round(data.discount).toLocaleString()} disc.
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                            <div
                                                                                className="h-full bg-emerald-500 rounded-full transition-all"
                                                                                style={{ width: `${Math.round((data.amount / maxAmount) * 100)}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div className="pt-1.5 mt-1 border-t border-gray-200 flex justify-between items-center font-black text-[10px] shrink-0 bg-white">
                                                                <span className="text-gray-700 uppercase tracking-wider">Total:</span>
                                                                <span className="font-mono text-emerald-700 text-xs font-black">
                                                                    KES {Math.round(sorted.reduce((sum, [, d]) => sum + d.amount, 0)).toLocaleString()}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Card 5: Brand Breakdown */}
                                        <div className="bg-white p-3.5 min-h-[168px] rounded-2xl border border-gray-200/60 shadow-sm flex flex-col justify-between">
                                            <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider">Brand Sales</span>
                                            {Object.keys(brandSales).length === 0 ? (
                                                <p className="text-[10px] text-gray-400 font-bold mt-1">No data yet</p>
                                            ) : (
                                                <>
                                                    <div className="mt-1 space-y-0.5 text-[10px] font-semibold text-gray-600 overflow-y-auto max-h-20 custom-scrollbar pr-1 w-full">
                                                        {Object.entries(brandSales)
                                                            .sort((a, b) => b[1].sales - a[1].sales)
                                                            .map(([brand, data]) => (
                                                                <div 
                                                                    key={brand}
                                                                    onClick={() => setHistorySearch(historySearch === brand ? '' : brand)}
                                                                    className={`flex justify-between p-1 -mx-1 rounded-lg cursor-pointer hover:bg-gray-50 transition-all ${historySearch === brand ? 'bg-emerald-50 text-emerald-800 font-black' : ''}`}
                                                                    title={`Filter by ${brand}`}
                                                                >
                                                                    <span className="truncate">{brand}:</span>
                                                                    <span className="font-mono text-gray-900 font-bold">KES {Math.round(data.sales).toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                    </div>
                                                    <div className="pt-1.5 mt-1 border-t border-gray-200 flex justify-between items-center font-black text-[10px] shrink-0 bg-white">
                                                        <span className="text-gray-700 uppercase tracking-wider">Total:</span>
                                                        <span className="font-mono text-emerald-700 text-xs font-black">
                                                            KES {Math.round(Object.values(brandSales).reduce((sum, d) => sum + d.sales, 0)).toLocaleString()}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
<div className="p-5 border-b border-gray-50 flex flex-col gap-3.5 shrink-0">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="font-black text-gray-900 text-sm">Recent Order History</h3>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Showing orders for the selected calendar day</p>
                                        {historySearch && (
                                            <div className="mt-2 flex items-center gap-1.5">
                                                <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                                    🔍 Filter: {historySearch.startsWith('discount:') ? `Discounted ${historySearch.substring(9).toUpperCase()} Orders` : historySearch}
                                                </span>
                                                <button 
                                                    onClick={() => setHistorySearch('')}
                                                    className="text-[9px] text-gray-400 hover:text-gray-600 font-bold hover:underline"
                                                >
                                                    Clear Filter
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full">
                                    {/* Mobile & Desktop Quick Date Presets */}
                                     <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5 shrink-0">
                                         {[
                                             { label: 'Today', key: 'today' },
                                             { label: 'Yesterday', key: 'yesterday' },
                                             { label: '7 Days', key: '7days' },
                                             { label: 'This Month', key: 'month' }
                                         ].filter(preset => !isHistoryRestricted || ['today', 'yesterday'].includes(preset.key))
                                          .map(preset => {
                                             const now = new Date();
                                             const getEatStr = (dateObj) => dateObj.toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
                                             const todayStr = getEatStr(now);
                                             let s = todayStr, e = todayStr;

                                             if (preset.key === 'yesterday') {
                                                 const y = new Date(now);
                                                 y.setDate(y.getDate() - 1);
                                                 s = getEatStr(y);
                                                 e = s;
                                             } else if (preset.key === '7days') {
                                                 const w = new Date(now);
                                                 w.setDate(w.getDate() - 6);
                                                 s = getEatStr(w);
                                                 e = todayStr;
                                             } else if (preset.key === 'month') {
                                                 const parts = todayStr.split('-');
                                                 s = `${parts[0]}-${parts[1]}-01`;
                                                 e = todayStr;
                                             }
                                             const isActive = historyStartDate === s && historyEndDate === e;
                                             return (
                                                 <button
                                                     key={preset.key}
                                                     type="button"
                                                     onClick={() => {
                                                         setHistoryStartDate(s);
                                                         setHistoryEndDate(e);
                                                         fetchHistory(s, e);
                                                     }}
                                                     className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 border ${
                                                         isActive 
                                                             ? 'bg-amber-400 text-amber-950 border-amber-400 shadow-xs scale-[1.02]' 
                                                             : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                                                     }`}
                                                 >
                                                     {preset.label}
                                                 </button>
                                             );
                                         })}
                                     </div>

                                      {(() => {
                                          const yesterdayStrForConstraint = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
                                          return (
                                              <div className="flex flex-row items-center gap-2 bg-gray-50/80 px-3 py-1.5 rounded-xl border border-gray-200 shadow-xs w-full sm:w-auto justify-between sm:justify-start">
                                                  <div className="flex items-center gap-1 text-xs flex-1 sm:flex-initial">
                                                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest shrink-0">From:</span>
                                                      <input
                                                          type="date"
                                                          value={historyStartDate}
                                                          min={isHistoryRestricted ? yesterdayStrForConstraint : undefined}
                                                          onChange={(e) => {
                                                              const val = e.target.value;
                                                              setHistoryStartDate(val);
                                                              if (val) fetchHistory(val, historyEndDate);
                                                          }}
                                                          className="bg-transparent font-bold outline-none text-gray-800 cursor-pointer text-xs w-full sm:w-auto sm:max-w-[110px]"
                                                      />
                                                  </div>
                                                  <div className="flex items-center gap-1 text-xs border-l border-gray-200 pl-2 flex-1 sm:flex-initial">
                                                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest shrink-0">To:</span>
                                                      <input
                                                          type="date"
                                                          value={historyEndDate}
                                                          min={isHistoryRestricted ? yesterdayStrForConstraint : undefined}
                                                          onChange={(e) => {
                                                              const val = e.target.value;
                                                              setHistoryEndDate(val);
                                                              if (val) fetchHistory(historyStartDate, val);
                                                          }}
                                                          className="bg-transparent font-bold outline-none text-gray-800 cursor-pointer text-xs w-full sm:w-auto sm:max-w-[110px]"
                                                      />
                                                  </div>
                                              </div>
                                          );
                                      })()}
                                 </div>
                             </div>

                             <div className="flex-1 overflow-y-auto custom-scrollbar">
                                 {loadingHistory ? (
                                     <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2 py-12">
                                         <Loader2 className="animate-spin text-primary" size={32} />
                                         <span className="text-sm font-bold">Loading history...</span>
                                     </div>
                                 ) : historyOrders.length === 0 ? (
                                     <div className="h-full flex flex-col items-center justify-center text-gray-400 font-bold text-sm py-12 gap-2">
                                         <span>No recent orders found for selected date range.</span>
                                         <button
                                             onClick={() => {
                                                 const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Nairobi' });
                                                 setHistoryStartDate(today);
                                                 setHistoryEndDate(today);
                                                 fetchHistory(today, today);
                                             }}
                                             className="text-xs text-primary font-bold hover:underline"
                                         >
                                             Reset to Today
                                         </button>
                                     </div>
                                 ) : (
                                     <div className="divide-y divide-gray-100">
                                         {historyOrders
                                              .filter(order => {
                                                  if (!historySearch.trim()) return true;
                                                  const search = historySearch.toLowerCase().trim();

                                                  if (search.startsWith('discount:')) {
                                                      const channelName = search.substring(9).trim();
                                                      const orderDiscount = (typeof order.discount === 'number' && !isNaN(order.discount)) ? Math.max(0, order.discount) : (order.discount ? parseFloat(order.discount) || 0 : 0);
                                                      
                                                      const rawCh = (order.order_channel || '').trim().toLowerCase();
                                                      let mappedCh = 'walk-in';
                                                      if (rawCh === 'whatsapp') mappedCh = 'whatsapp';
                                                      else if (rawCh === 'ubereats' || rawCh === 'uber eats') mappedCh = 'uber eats';
                                                      else if (rawCh === 'glovo') mappedCh = 'glovo';
                                                      else if (rawCh === 'bolt food') mappedCh = 'bolt food';
                                                      else if (rawCh === 'ando') mappedCh = 'ando';

                                                      return mappedCh === channelName && orderDiscount > 0;
                                                  }

                                                  const cleanSearch = search.replace(/\s+/g, '');
                                                  const cleanChannel = (order.order_channel || '').toLowerCase().replace(/\s+/g, '');
                                                  const itemsMatch = (order.items || []).some(i => 
                                                      (i.item_name || '').toLowerCase().includes(search) ||
                                                      (i.category || '').toLowerCase().includes(search)
                                                  );

                                                  const deobfuscatedVal = deobfuscateTicket(search);
                                                  return (
                                                      order.customer_name?.toLowerCase().includes(search) ||
                                                      order.brand?.toLowerCase().includes(search) ||
                                                      order.ticket_number?.toString().includes(search) ||
                                                      (deobfuscatedVal !== null && order.ticket_number?.toString() === deobfuscatedVal.toString()) ||
                                                      order.payment_method?.toLowerCase().includes(search) ||
                                                      order.payment_status?.toLowerCase().includes(search) ||
                                                      order.dining_option?.toLowerCase().includes(search) ||
                                                      cleanChannel.includes(cleanSearch) ||
                                                      itemsMatch
                                                  );
                                              })
                                             .map(order => {
                                                 const formattedTime = new Date(order.created_at).toLocaleTimeString('en-US', {
                                                     hour: '2-digit',
                                                     minute: '2-digit',
                                                     hour12: true,
                                                     timeZone: 'Africa/Nairobi'
                                                 });
                                                 const formattedDate = new Date(order.created_at).toLocaleDateString('en-US', {
                                                     month: 'short',
                                                     day: 'numeric',
                                                     timeZone: 'Africa/Nairobi'
                                                 });
                                                 const isPaid = (order.payment_status || '').toLowerCase() === 'paid';
                                                 const isReturned = order.status === 'Returned' || order.status === 'Cancelled' || order.payment_status === 'Voided';

                                                 return (
                                                     <div 
                                                         key={order.id} 
                                                         onClick={() => setViewingOrderDetails(order)}
                                                         className="p-3.5 sm:p-4 flex items-center justify-between hover:bg-amber-50/40 transition-all cursor-pointer border-l-4 border-transparent hover:border-amber-400 group"
                                                         title="Click to view details"
                                                     >
                                                         <div className="flex items-center gap-3 min-w-0">
                                                             <div className="w-10 h-10 bg-primary/10 text-primary rounded-2xl flex items-center justify-center font-mono font-black text-xs shrink-0 group-hover:scale-105 transition-transform">
                                                                 #{obfuscateTicket(order.ticket_number)}
                                                             </div>
                                                             <div className="min-w-0">
                                                                 <div className="flex items-center gap-2 flex-wrap">
                                                                     <span className="font-black text-sm text-gray-900 truncate">{order.customer_name}</span>
                                                                     <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                                                         (order.dining_option === 'Dine-in' || order.dining_option === 'Dine Inn') ? 'bg-blue-100 text-blue-800' :
                                                                         ['Glovo', 'UberEats', 'Bolt Food', 'Uber Eats'].includes(order.dining_option || order.order_channel) ? 'bg-orange-100 text-orange-800' :
                                                                         'bg-gray-100 text-gray-700'
                                                                     }`}>{order.dining_option}</span>

                                                                     {order.brand && (
                                                                         <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800">
                                                                             {order.brand}
                                                                         </span>
                                                                     )}

                                                                     {isReturned && (
                                                                         <span className="px-2 py-0.5 rounded-md text-[9px] font-black bg-red-100 text-red-700 uppercase tracking-wider">
                                                                             Returned
                                                                         </span>
                                                                     )}
                                                                 </div>
                                                                 <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold mt-1 flex-wrap">
                                                                     <span>{formattedDate} at {formattedTime}</span>
                                                                     <span>•</span>
                                                                     <span className={`px-1.5 py-0.5 rounded font-black ${isPaid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                                         {order.payment_method || 'Cash'} ({order.payment_status || 'Pending'})
                                                                     </span>
                                                                     {order.order_channel && order.order_channel !== 'Walk-in' && (
                                                                         <>
                                                                             <span>•</span>
                                                                             <span className="text-gray-600 font-semibold">{order.order_channel}</span>
                                                                         </>
                                                                     )}
                                                                 </div>
                                                             </div>
                                                         </div>

                                                         <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                                                             <span className="font-mono font-black text-sm text-gray-900">
                                                                 KES {parseFloat(order.total_amount || 0).toLocaleString()}
                                                             </span>
                                                             {order.payment_status?.toLowerCase().includes('pending') && !isReturned && (
                                                                  <>
                                                                      {isMicrositeOrder(order) && (
                                                                          <>
                                                                              <button
                                                                                  type="button"
                                                                                  onClick={(e) => {
                                                                                      e.stopPropagation();
                                                                                      handleAcceptOrder(order);
                                                                                  }}
                                                                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] shadow-sm hover:shadow transition-all flex items-center gap-1 cursor-pointer"
                                                                                  title="Accept Order & Route to KDS/Printers"
                                                                              >
                                                                                  <span>✅ Accept</span>
                                                                              </button>
                                                                              <button
                                                                                  type="button"
                                                                                  onClick={(e) => {
                                                                                      e.stopPropagation();
                                                                                      handleDeclineOrder(order);
                                                                                  }}
                                                                                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-[10px] shadow-sm hover:shadow transition-all flex items-center gap-1 cursor-pointer"
                                                                                  title="Decline Order"
                                                                              >
                                                                                  <span>❌ Decline</span>
                                                                              </button>
                                                                          </>
                                                                      )}
                                                                      <button
                                                                          type="button"
                                                                          onClick={(e) => {
                                                                              e.stopPropagation();
                                                                              handleOpenClearModal(order);
                                                                          }}
                                                                          className="px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-[10px] shadow-sm hover:shadow transition-all flex items-center gap-1 cursor-pointer"
                                                                          title="Clear Pending Payment"
                                                                      >
                                                                          <span>💵 Clear</span>
                                                                      </button>
                                                                  </>
                                                              )}
                                                             <button
                                                                 type="button"
                                                                 onClick={(e) => { e.stopPropagation(); setActiveReceipt(order); }}
                                                                 className="px-2.5 py-1.5 border border-gray-200 hover:border-primary hover:text-primary rounded-xl transition-all flex items-center gap-1 text-xs font-bold text-gray-600 shadow-xs bg-white"
                                                                 title="Reprint Receipt"
                                                             >
                                                                 <Printer size={13} />
                                                                 <span className="hidden sm:inline">Reprint</span>
                                                            </button>
                                                         </div>
                                                     </div>
                                                 );
                                             })
                                         }
                            </div>
                                )}
                            </div>
                            </div>
                            
                        {/* Right Column: Analytics & Widget Sidebar */}
                        <div className="w-full lg:w-80 xl:w-96 flex flex-col gap-6 shrink-0 h-full max-h-full overflow-y-auto custom-scrollbar">
                            {!canViewRevenue ? null : (
                                <>
                            {/* Revenue Breakdown Sidebar Widget */}
                            {(() => {
                                const activeOrds = historyOrders.filter(o =>
                                    o.status !== 'Cancelled' && o.status !== 'Returned' && o.payment_status !== 'Voided'
                                );
                                let brkFood = 0, brkBev = 0, brkPack = 0, brkDel = 0, brkDelCount = 0, brkDelOrders = 0;
                                const BEV_CATS_2 = ['Beverages', 'Hot Beverages', 'Drinks'];
                                const isDelItem = (n) => /^delivery/i.test((n || '').trim());
                                const isPackItem = (n) => /^pack(age|aging)?\s*fee/i.test((n || '').trim());
                                activeOrds.forEach(order => {
                                    const isDelOrd = ['ubereats', 'uber eats', 'glovo', 'bolt food', 'ando', 'whatsapp', 'delivery'].includes((order.order_channel || '').toLowerCase()) ||
                                        (order.dining_option || '').toLowerCase() === 'delivery';
                                    if (isDelOrd) brkDelOrders++;
                                    (order.items || []).forEach(item => {
                                        const nm = item.item_name || '';
                                        const amt = (item.price || 0) * (item.quantity || 1);
                                        const menuItem = menu.find(m => m.name === nm);
                                        const category = item.category || (menuItem ? menuItem.category : '');
                                        if (isDelItem(nm)) { brkDel += amt; brkDelCount++; }
                                        else if (isPackItem(nm)) { brkPack += amt; }
                                        else if (BEV_CATS_2.includes(category)) { brkBev += amt; }
                                        else { brkFood += amt; }
                                    });
                                });
                                const grandTotal = brkFood + brkBev + brkPack + brkDel;
                                const pct = (v) => grandTotal > 0 ? Math.round((v / grandTotal) * 100) : 0;
                                return (
                                    <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
                                        <div className="flex flex-col gap-1 mb-3">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">Revenue Breakdown</span>
                                            <span className="text-[8px] font-bold text-gray-400">{brkDelOrders} Delivery Orders · {brkDelCount} Delivery Lines</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { label: '🍛 Food Sales', key: 'Food', value: brkFood, color: 'bg-emerald-500' },
                                                { label: '🥤 Beverages', key: 'Beverage', value: brkBev, color: 'bg-blue-400' },
                                                { label: '📦 Packaging', key: 'Packaging', value: brkPack, color: 'bg-amber-400' },
                                                { label: '🛵 Delivery Fees', key: 'Delivery', value: brkDel, color: 'bg-purple-400' },
                                            ].map(({ label, key, value, color }) => {
                                                const isAct = historySearch.toLowerCase() === key.toLowerCase();
                                                return (
                                                    <div 
                                                        key={label} 
                                                        onClick={() => setHistorySearch(isAct ? '' : key)}
                                                        className={`bg-gray-50/50 rounded-xl p-2.5 border transition-all cursor-pointer hover:bg-gray-100 ${isAct ? 'border-emerald-500 bg-emerald-50/60 font-black' : 'border-gray-100'}`}
                                                        title={`Click to filter orders containing ${key}`}
                                                    >
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-wider flex justify-between">
                                                            <span>{label}</span>
                                                            {isAct && <span className="text-[7px] bg-emerald-200 text-emerald-800 px-1 rounded font-bold">Active</span>}
                                                        </p>
                                                        <p className="text-xs font-black font-mono text-gray-900 mt-1">KES {value.toLocaleString()}</p>
                                                        <div className="h-1 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                                                            <div className={`h-full ${color} rounded-full`} style={{ width: `${pct(value)}%` }} />
                                                        </div>
                                                        <p className="text-[7px] font-bold text-gray-400 mt-0.5">{pct(value)}% of total</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}


                            {/* Brand and Channel Sales Breakdown Sidebar Widget */}
                            {(() => {
                                const salesByChannel = {};
                                const salesByBrand = {};
                                let totalSales = 0;

                                historyOrders.forEach(order => {
                                    if (order.status === 'Cancelled' || order.status === 'Returned' || order.payment_status === 'Voided') return;
                                    totalSales += order.total_amount;

                                    const rawCh = (order.order_channel || '').trim().toLowerCase();
                                    let ch = 'Walk-in';
                                    if (rawCh === 'whatsapp') ch = 'WhatsApp';
                                    else if (rawCh === 'ubereats' || rawCh === 'uber eats') ch = 'Uber Eats';
                                    else if (rawCh === 'glovo') ch = 'Glovo';
                                    else if (rawCh === 'bolt food') ch = 'Bolt Food';
                                    else if (rawCh === 'ando') ch = 'Ando';

                                    if (!salesByChannel[ch]) salesByChannel[ch] = 0;
                                    salesByChannel[ch] += order.total_amount;

                                    let br = (order.brand || 'ManiPOS').trim();
                                    if (!br || br.toUpperCase() === 'MANIPOS') br = 'ManiPOS';
                                    if (!salesByBrand[br]) salesByBrand[br] = 0;
                                    salesByBrand[br] += order.total_amount;
                                });

                                if (totalSales === 0) return null;

                                const sortedChannels = Object.entries(salesByChannel).sort((a, b) => b[1] - a[1]);
                                const sortedBrands = Object.entries(salesByBrand).sort((a, b) => b[1] - a[1]);

                                const CHANNEL_BADGE = {
                                    'Walk-in': <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-100 text-blue-600 text-[8px] font-black shrink-0">WI</span>,
                                    'WhatsApp': <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
                                    'Uber Eats': <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[6px] font-black shrink-0" style={{color:'#06C167',background:'#000'}}>UE</span>,
                                    'Glovo': <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[6px] font-black shrink-0" style={{background:'#FFC244',color:'#00A082'}}>G°</span>,
                                    'Bolt Food': <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[6px] font-black text-white shrink-0" style={{background:'#34D186'}}>BF</span>,
                                    'Ando': <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[6px] font-black text-white shrink-0" style={{background:'#E8291C'}}>an</span>,
                                };

                                return (
                                    <div className="bg-white border border-emerald-100 rounded-3xl p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">📊 Sales Breakdown</span>
                                            <span className="text-[9px] font-black font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                                                KES {Math.round(totalSales).toLocaleString()} total
                                            </span>
                                        </div>

                                        {/* By Channel */}
                                        {sortedChannels.length > 0 && (
                                            <div className="mb-3">
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">By Channel</p>
                                                <div className="flex flex-col gap-1.5">
                                                    {sortedChannels.map(([name, amount]) => {
                                                        const pct = totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0;
                                                        const isActive = historySearch.toLowerCase() === name.toLowerCase();
                                                        return (
                                                            <div 
                                                                key={name}
                                                                onClick={() => setHistorySearch(isActive ? '' : name)}
                                                                className={`cursor-pointer group p-1.5 -mx-1.5 rounded-xl transition-all ${isActive ? 'bg-emerald-50/80 text-emerald-900 font-black ring-1 ring-emerald-100/50' : 'hover:bg-gray-50/50'}`}
                                                                title={`Filter by orders in ${name}`}
                                                            >
                                                                <div className="flex justify-between items-center mb-0.5">
                                                                    <span className="text-[9px] font-bold text-gray-700 flex items-center gap-1 min-w-0">
                                                                        {CHANNEL_BADGE[name] || <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-200 text-[6px] font-black shrink-0">?</span>}
                                                                        <span className="truncate">{name}</span>
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <span className="text-[8px] text-gray-400 font-bold">{pct}%</span>
                                                                        <span className="text-[9px] font-mono font-black text-emerald-600">KES {Math.round(amount).toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* By Brand */}
                                        {sortedBrands.length > 0 && (
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">By Brand</p>
                                                <div className="flex flex-col gap-1.5">
                                                    {sortedBrands.map(([brand, amount]) => {
                                                        const pct = totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0;
                                                        const isActive = historySearch.toLowerCase() === brand.toLowerCase();
                                                        return (
                                                            <div 
                                                                key={brand}
                                                                onClick={() => setHistorySearch(isActive ? '' : brand)}
                                                                className={`cursor-pointer group p-1.5 -mx-1.5 rounded-xl transition-all ${isActive ? 'bg-emerald-50/80 text-emerald-900 font-black ring-1 ring-emerald-100/50' : 'hover:bg-gray-50/50'}`}
                                                                title={`Filter by orders for ${brand}`}
                                                            >
                                                                <div className="flex justify-between items-center mb-0.5">
                                                                    <span className="text-[9px] font-black text-gray-700 truncate">{brand}</span>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <span className="text-[8px] text-gray-400 font-bold">{pct}%</span>
                                                                        <span className="text-[9px] font-mono font-black text-emerald-600 font-bold">KES {Math.round(amount).toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Discount Breakdown Sidebar Widget — self-contained, no external scope deps */}
                            {(() => {
                                // Re-compute discount maps independently from historyOrders
                                const CHANNEL_MAP = (ch) => {
                                    const c = (ch || '').trim().toLowerCase();
                                    if (c === 'whatsapp') return 'WhatsApp';
                                    if (c === 'ubereats' || c === 'uber eats') return 'Uber Eats';
                                    if (c === 'glovo') return 'Glovo';
                                    if (c === 'bolt food') return 'Bolt Food';
                                    if (c === 'ando') return 'Ando';
                                    return 'Walk-in';
                                };
                                const discByChannel = {};
                                const discByBrand = {};
                                let grandDiscount = 0;

                                historyOrders.forEach(order => {
                                    if (order.status === 'Returned' || order.status === 'Cancelled' || order.status === 'Declined' || order.payment_status === 'Voided') return;
                                    const items = order.items || [];
                                    const gross = items.reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
                                    const disc = Math.max(0, gross - order.total_amount);
                                    if (disc === 0) return;
                                    grandDiscount += disc;

                                    const ch = CHANNEL_MAP(order.order_channel);
                                    if (!discByChannel[ch]) discByChannel[ch] = { discount: 0 };
                                    discByChannel[ch].discount += disc;

                                    let br = (order.brand || 'ManiPOS').trim();
                                    const brUpper = br.toUpperCase();
                                    if (brUpper.includes('MANIPOS') || brUpper === '') {
                                        br = 'ManiPOS';
                                    }
                                    if (!discByBrand[br]) discByBrand[br] = { discount: 0, grossSales: 0 };
                                    discByBrand[br].discount += disc;
                                    discByBrand[br].grossSales += gross;
                                });

                                if (grandDiscount === 0) return null;

                                const channelDiscounts = Object.entries(discByChannel).sort((a, b) => b[1].discount - a[1].discount);
                                const brandDiscountsSorted = Object.entries(discByBrand).sort((a, b) => b[1].discount - a[1].discount);

                                const CHANNEL_BADGE = {
                                    'Walk-in': <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-100 text-blue-600 text-[8px] font-black shrink-0">WI</span>,
                                    'WhatsApp': <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
                                    'Uber Eats': <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[6px] font-black shrink-0" style={{color:'#06C167',background:'#000'}}>UE</span>,
                                    'Glovo': <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[6px] font-black shrink-0" style={{background:'#FFC244',color:'#00A082'}}>G°</span>,
                                    'Bolt Food': <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[6px] font-black text-white shrink-0" style={{background:'#34D186'}}>BF</span>,
                                    'Ando': <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[6px] font-black text-white shrink-0" style={{background:'#E8291C'}}>an</span>,
                                };

                                return (
                                    <div className="bg-white border border-rose-100 rounded-3xl p-5 shadow-sm">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[10px] font-black text-rose-500 uppercase tracking-wider">🏷️ Discount Breakdown</span>
                                            <span className="text-[9px] font-black font-mono text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100">
                                                -KES {Math.round(grandDiscount).toLocaleString()} total
                                            </span>
                                        </div>

                                        {/* By Channel */}
                                        {channelDiscounts.length > 0 && (
                                            <div className="mb-3">
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">By Channel</p>
                                                <div className="flex flex-col gap-1.5">
                                                    {channelDiscounts.map(([name, data]) => {
                                                        const pct = grandDiscount > 0 ? Math.round((data.discount / grandDiscount) * 100) : 0;
                                                        const searchKey = 'discount:' + name.toLowerCase();
                                                        const isActive = historySearch.toLowerCase() === searchKey;
                                                        return (
                                                            <div 
                                                                key={name}
                                                                onClick={() => setHistorySearch(isActive ? '' : searchKey)}
                                                                className={`cursor-pointer group p-1.5 -mx-1.5 rounded-xl transition-all ${isActive ? 'bg-rose-50/80 text-rose-900 font-black ring-1 ring-rose-100/50' : 'hover:bg-gray-50/50'}`}
                                                                title={`Filter by discounted orders in ${name}`}
                                                            >
                                                                <div className="flex justify-between items-center mb-0.5">
                                                                    <span className="text-[9px] font-bold text-gray-700 flex items-center gap-1 min-w-0">
                                                                        {CHANNEL_BADGE[name] || <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-gray-200 text-[6px] font-black shrink-0">?</span>}
                                                                        <span className="truncate">{name}</span>
                                                                    </span>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <span className="text-[8px] text-gray-400 font-bold">{pct}%</span>
                                                                        <span className="text-[9px] font-mono font-black text-rose-600">-KES {Math.round(data.discount).toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-rose-400 rounded-full" style={{ width: `${pct}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* By Brand */}
                                        {brandDiscountsSorted.length > 0 && (
                                            <div>
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5">By Brand</p>
                                                <div className="flex flex-col gap-1.5">
                                                    {brandDiscountsSorted.map(([brand, data]) => {
                                                        const burnPct = data.grossSales > 0 ? Math.round((data.discount / data.grossSales) * 100) : 0;
                                                        const sharePct = grandDiscount > 0 ? Math.round((data.discount / grandDiscount) * 100) : 0;
                                                        return (
                                                            <div key={brand}>
                                                                <div className="flex justify-between items-center mb-0.5">
                                                                    <span className="text-[9px] font-black text-gray-700 truncate">{brand}</span>
                                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                                        <span className="text-[8px] text-gray-400 font-bold">{burnPct}% of sales</span>
                                                                        <span className="text-[9px] font-mono font-black text-rose-600">-KES {Math.round(data.discount).toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-rose-300 rounded-full" style={{ width: `${sharePct}%` }} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Unified Items Sold Report Sidebar Widget */}
                            {(() => {
                                const itemTally = {};
                                const isFeeOrDelivery = (n) => {
                                    const raw = (n || "").trim().toLowerCase();
                                    return (
                                        raw.startsWith("delivery") ||
                                        raw.includes("delivery fee") ||
                                        raw.includes("delivery charge") ||
                                        raw.startsWith("package") ||
                                        raw.startsWith("packaging") ||
                                        raw.startsWith("packing") ||
                                        raw.includes("pack fee") ||
                                        raw.includes("package fee") ||
                                        raw.includes("packaging fee") ||
                                        raw === "delivery" ||
                                        raw === "package" ||
                                        raw === "packaging" ||
                                        raw === "packing"
                                    );
                                };
                                historyOrders.forEach(order => {
                                    if (order.status === 'Cancelled' || order.status === 'Returned' || order.payment_status === 'Voided') return;
                                    (order.items || []).forEach(item => {
                                        if (isFeeOrDelivery(item.item_name)) return;
                                        const key = item.item_name || 'Unknown';
                                        if (!itemTally[key]) itemTally[key] = { qty: 0, revenue: 0 };
                                        itemTally[key].qty += (item.quantity || 1);
                                        itemTally[key].revenue += (item.price || 0) * (item.quantity || 1);
                                    });
                                });
                                const sorted = Object.entries(itemTally).sort((a, b) => b[1].qty - a[1].qty);
                                const maxQty = sorted[0]?.[1]?.qty || 1;
                                if (sorted.length === 0) return null;

                                const itemsForPDF = sorted.map(([name, d]) => {
                                    const menuItem = (menu || []).find(m => m.name === name);
                                    return {
                                        name,
                                        category: menuItem ? menuItem.category : 'General',
                                        quantity: d.qty,
                                        totalAmount: d.revenue
                                    };
                                });

                                return (
                                     <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
                                         <div className="flex items-center justify-between mb-3">
                                             <div>
                                                 <p className="text-[10px] font-black text-gray-900 uppercase tracking-wider">🍽️ Dish Sales Velocity & Performance Analyzer</p>
                                                 <p className="text-[8px] font-bold text-emerald-600 mt-0.5">{sorted.length} dishes · Excludes delivery & packaging fees</p>
                                             </div>
                                             <button
                                                 onClick={() => generateItemsSoldPDF(itemsForPDF, `${historyStartDate} to ${historyEndDate}`)}
                                                 className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all shadow-xs"
                                                 title="Download Items Sold PDF"
                                             >
                                                 <Download size={10} /> PDF
                                             </button>
                                         </div>
                                          <div className="overflow-y-auto custom-scrollbar pr-1 space-y-2 max-h-96">
                                             {sorted.map(([name, data], idx) => {
                                                 const isAct = historySearch.toLowerCase() === name.toLowerCase();
                                                 return (
                                                     <div 
                                                         key={name} 
                                                         onClick={() => setHistorySearch(isAct ? '' : name)}
                                                         className={`flex items-center gap-2 group cursor-pointer p-1.5 rounded-xl transition-all ${isAct ? 'bg-emerald-50 border border-emerald-300 font-black' : 'hover:bg-gray-50'}`}
                                                         title={`Click to filter orders containing ${name}`}
                                                     >
                                                         <span className="text-[9px] font-black text-gray-400 w-4 shrink-0 text-right">{idx + 1}</span>
                                                         <div className="flex-1 min-w-0">
                                                             <div className="flex justify-between items-center mb-0.5">
                                                                 <span className="text-[9px] font-black text-gray-800 truncate max-w-[65%]">{name}</span>
                                                                 <span className="text-[9px] font-mono font-black text-gray-600 shrink-0">
                                                                     <span className="text-emerald-600 font-bold">{data.qty}x</span> · KES {Math.round(data.revenue).toLocaleString()}
                                                                 </span>
                                                             </div>
                                                         </div>
                                                     </div>
                                                 );
                                             })}
                                         </div>
                                     </div>
                                );
                            })()}
                                </>
                            )}
                            </div>
                        </div>
                    );
                })()}

                {activeView === 'feedback' && (
                    <div className="flex-1 flex flex-col overflow-y-auto bg-gray-50/50 p-6 font-sans">
                        <FeedbackDashboardView />
                    </div>
                )}

                {activeView === 'menu_settings' && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/50 p-6 gap-6 font-sans">
                        {/* Tab Headers and Control Bar */}
                        <div className="flex justify-between items-center bg-white/70 backdrop-blur-xl p-5 rounded-[2rem] border border-white shadow-sm shrink-0">
                            <div className="flex gap-4">
                                <button
                                    onClick={() => { setMenuSettingsTab('items'); setEditingItem(null); setEditingModifierGroup(null); setEditingCategory(null); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                                        menuSettingsTab === 'items' && !editingItem
                                            ? 'bg-primary text-secondary border-transparent shadow-sm'
                                            : 'bg-transparent border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    Dishes & Drinks
                                </button>
                                <button
                                    onClick={() => { setMenuSettingsTab('customisations'); setEditingItem(null); setEditingModifierGroup(null); setEditingCategory(null); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                                        menuSettingsTab === 'customisations' && !editingItem
                                            ? 'bg-primary text-secondary border-transparent shadow-sm'
                                            : 'bg-transparent border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    Customisations
                                </button>
                                <button
                                    onClick={() => { setMenuSettingsTab('categories'); setEditingItem(null); setEditingModifierGroup(null); setEditingCategory(null); setEditingDiscount(null); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                                        menuSettingsTab === 'categories' && !editingItem
                                            ? 'bg-primary text-secondary border-transparent shadow-sm'
                                            : 'bg-transparent border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    Categories
                                </button>
                                <button
                                    onClick={() => { setMenuSettingsTab('discounts'); setEditingItem(null); setEditingModifierGroup(null); setEditingCategory(null); setEditingDiscount(null); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                                        menuSettingsTab === 'discounts' && !editingItem
                                            ? 'bg-primary text-secondary border-transparent shadow-sm'
                                            : 'bg-transparent border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    Promo Codes
                                </button>
                                <button
                                    onClick={() => { setMenuSettingsTab('sound_alerts'); setEditingItem(null); setEditingModifierGroup(null); setEditingCategory(null); setEditingDiscount(null); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                                        menuSettingsTab === 'sound_alerts' && !editingItem
                                            ? 'bg-primary text-secondary border-transparent shadow-sm'
                                            : 'bg-transparent border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    Sound Alerts
                                </button>
                                <button
                                    onClick={() => { setMenuSettingsTab('api_integrations'); setEditingItem(null); setEditingModifierGroup(null); setEditingCategory(null); setEditingDiscount(null); }}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                                        menuSettingsTab === 'api_integrations' && !editingItem
                                            ? 'bg-primary text-secondary border-transparent shadow-sm'
                                            : 'bg-transparent border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    🔌 Delivery APIs
                                </button>
                            </div>
                            
                            {!editingItem && (
                                <div className="flex gap-2">
                                    {menuSettingsTab === 'items' && (
                                        <button
                                            onClick={() => setEditingItem({ name: '', category: categories[0]?.name || 'Starters & Bites', price: 0, description: '', include_vat: false, is_available: true })}
                                            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5"
                                        >
                                            + New Item
                                        </button>
                                    )}
                                    {menuSettingsTab === 'customisations' && (
                                        <button
                                            onClick={() => setEditingModifierGroup({ name: '', min_selected: 0, max_selected: 1, is_required: false, menu_item_ids: [], options: [{ name: '', price: 0, include_vat: false, is_available: true }] })}
                                            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5"
                                        >
                                            + Add Customisation
                                        </button>
                                    )}
                                    {menuSettingsTab === 'categories' && !editingCategory && (
                                        <button
                                            onClick={() => setEditingCategory({ name: '', icon: '🍽️', display_order: categories.length + 1 })}
                                            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5"
                                        >
                                            + Add Category
                                        </button>
                                    )}
                                    {menuSettingsTab === 'discounts' && !editingDiscount && (
                                        <button
                                            onClick={() => setEditingDiscount({ code: '', type: 'percentage', value: 10, min_order_amount: 0, is_active: true })}
                                            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5"
                                        >
                                            + Add Promo Code
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* EDIT PRODUCT SCREEN */}
                        {editingItem ? (
                            <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-[2.5rem] border border-gray-100 shadow-sm">
                                {/* Header */}
                                <div className="p-6 border-b border-gray-100 flex justify-between items-center shrink-0">
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => setEditingItem(null)} 
                                            className="p-2 bg-gray-50 text-gray-500 rounded-xl hover:bg-gray-200 transition-colors"
                                        >
                                            <ArrowLeft size={16} />
                                        </button>
                                        <div>
                                            <h3 className="font-black text-gray-900 text-base">{editingItem.id ? 'Edit Product Details' : 'Create New Menu Item'}</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Configure name, pricing, VAT and image uploads.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {editingItem.id && (
                                            <>
                                                <button
                                                    onClick={async () => {
                                                        if (!confirm('Are you sure you want to duplicate this item?')) return;
                                                        const duplicatePayload = {
                                                            name: `${editingItem.name} (Copy)`,
                                                            category: editingItem.category,
                                                            price: editingItem.price,
                                                            description: editingItem.description,
                                                            image_url: editingItem.image_url,
                                                            include_vat: editingItem.include_vat,
                                                            brand: editingItem.brand || 'ManiPOS',
                                                            show_on_microsite: editingItem.show_on_microsite !== false,
                                                            is_available: true
                                                        };
                                                        try {
                                                            let { error } = await supabase.from('pos_menu').insert([duplicatePayload]);
                                                            if (error && (error.message.includes('include_vat') || error.message.includes('column'))) {
                                                                const { include_vat, ...retryPayload } = duplicatePayload;
                                                                const retryResult = await supabase.from('pos_menu').insert([retryPayload]);
                                                                error = retryResult.error;
                                                            }
                                                            if (error) throw error;
                                                            alert('Item duplicated successfully!');
                                                            setEditingItem(null);
                                                            fetchMenu();
                                                        } catch (err) {
                                                            alert('Duplicate failed: ' + err.message);
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl border border-gray-200 transition-all"
                                                >
                                                    Duplicate
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (await handleDeleteMenuItem(editingItem.id)) {
                                                            setEditingItem(null);
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-200 transition-all"
                                                >
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={async () => {
                                                if (!editingItem.name.trim() || isNaN(parseFloat(editingItem.price))) {
                                                    alert('Please specify Name and Price.');
                                                    return;
                                                }
                                                const selectedBrands = editingItem.brands && editingItem.brands.length > 0
                                                    ? editingItem.brands
                                                    : [editingItem.brand || 'ManiPOS'];
                                                const payload = {
                                                    name: editingItem.name.trim(),
                                                    category: editingItem.category,
                                                    price: parseFloat(editingItem.price),
                                                    glovo_price: editingItem.glovo_price ? parseFloat(editingItem.glovo_price) : null,
                                                    ubereats_price: editingItem.ubereats_price ? parseFloat(editingItem.ubereats_price) : null,
                                                    bolt_price: editingItem.bolt_price ? parseFloat(editingItem.bolt_price) : null,
                                                    ando_price: editingItem.ando_price ? parseFloat(editingItem.ando_price) : null,
                                                    website_price: editingItem.website_price ? parseFloat(editingItem.website_price) : null,
                                                    brand_prices: editingItem.brand_prices || {},
                                                    description: editingItem.description || null,
                                                    include_vat: editingItem.include_vat || false,
                                                    brand: selectedBrands[0], // primary brand (backwards compat)
                                                    brands: selectedBrands,   // multi-brand array
                                                    is_available: editingItem.is_available !== false,
                                                    show_on_microsite: editingItem.show_on_microsite !== false,
                                                    image_url: editingItem.image_url || null
                                                };
                                                
                                                let savedItemId = editingItem.id;
                                                if (editingItem.id) {
                                                    let { error } = await supabase.from('pos_menu').update(payload).eq('id', editingItem.id);
                                                    if (error && (error.message.includes('include_vat') || error.message.includes('column'))) {
                                                        const { include_vat, ...retryPayload } = payload;
                                                        const retryResult = await supabase.from('pos_menu').update(retryPayload).eq('id', editingItem.id);
                                                        error = retryResult.error;
                                                    }
                                                    if (error) { alert('Error updating product: ' + error.message); return; }
                                                } else {
                                                    let { data, error } = await supabase.from('pos_menu').insert([payload]).select();
                                                    if (error && (error.message.includes('include_vat') || error.message.includes('column'))) {
                                                        const { include_vat, ...retryPayload } = payload;
                                                        const retryResult = await supabase.from('pos_menu').insert([retryPayload]).select();
                                                        data = retryResult.data;
                                                        error = retryResult.error;
                                                    }
                                                    if (error) { alert('Error creating product: ' + error.message); return; }
                                                    savedItemId = data?.[0]?.id;
                                                }
 
                                                // Update database associations for Customisation Groups
                                                if (savedItemId) {
                                                    for (const group of modifierGroups) {
                                                        const shouldBeLinked = linkedGroupIds.includes(group.id);
                                                        const currentItemIds = group.menu_item_ids || [];
                                                        const isLinked = currentItemIds.includes(savedItemId);
 
                                                        if (shouldBeLinked && !isLinked) {
                                                            const newIds = [...currentItemIds, savedItemId];
                                                            await supabase.from('menu_modifier_groups').update({ menu_item_ids: newIds }).eq('id', group.id);
                                                        } else if (!shouldBeLinked && isLinked) {
                                                            const newIds = currentItemIds.filter(id => id !== savedItemId);
                                                            await supabase.from('menu_modifier_groups').update({ menu_item_ids: newIds }).eq('id', group.id);
                                                        }
                                                    }
                                                }
 
                                                alert('Product details saved successfully!');
                                                setEditingItem(null);
                                                fetchMenu();
                                                fetchModifiers();
                                            }}
                                            className="px-5 py-2 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition-all"
                                        >
                                            Save Details
                                        </button>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gray-50/40">
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                        {/* Left Columns: Text Details */}
                                        <div className="lg:col-span-2 space-y-6">
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                                                <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider">Basic Information</h4>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Product Name</label>
                                                    <input
                                                        type="text"
                                                        value={editingItem.name}
                                                        onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                                                        placeholder="e.g. Suya Beef Burger"
                                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all text-xs font-bold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Virtual Brands (Select all brands this item belongs to)</label>
                                                    <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                                                        {[
                                                            { id: 'POT OF JOLLOF', name: 'Pot of Jollof', icon: '🫕' },
                                                            { id: 'LITTLE LAGOS', name: 'Little Lagos', icon: '🌶️' },
                                                            { id: 'CAFE SWAHILI', name: 'Cafe Swahili', icon: '☕' },
                                                            { id: 'SAMAKI STREET', name: 'Samaki Street', icon: '🐟' }
                                                        ].map(br => {
                                                            const currentBrands = editingItem.brands && editingItem.brands.length > 0 
                                                                ? editingItem.brands 
                                                                : (editingItem.brand && editingItem.brand !== 'ManiPOS' ? [editingItem.brand] : ['POT OF JOLLOF']);
                                                            const isChecked = currentBrands.includes(br.id);

                                                            const toggleBrand = () => {
                                                                let updated;
                                                                if (isChecked) {
                                                                    updated = currentBrands.filter(b => b !== br.id);
                                                                    if (updated.length === 0) updated = ['POT OF JOLLOF'];
                                                                } else {
                                                                    updated = [...currentBrands, br.id];
                                                                }
                                                                setEditingItem({
                                                                    ...editingItem,
                                                                    brand: updated[0],
                                                                    brands: updated
                                                                });
                                                            };

                                                            return (
                                                                <label key={br.id} className="flex items-center gap-2 cursor-pointer p-1.5 hover:bg-white rounded-lg transition-colors select-none">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={toggleBrand}
                                                                        className="h-4 w-4 rounded text-primary focus:ring-primary cursor-pointer"
                                                                    />
                                                                    <span className="text-[11px] font-bold text-gray-800 flex items-center gap-1.5">
                                                                        <span>{br.icon}</span> {br.name}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Category</label>
                                                        <select
                                                            value={editingItem.category}
                                                            onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all text-xs font-bold"
                                                        >
                                                            {categories.map(c => (
                                                                <option key={c.name} value={c.name}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                            <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Base Price (Walk-in / Cash)</label>
                                                        <input
                                                            type="number"
                                                            value={editingItem.price}
                                                            onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                                                            placeholder="1200"
                                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all text-xs font-mono font-bold"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Omni-Channel Price Overrides Section */}
                                                {(() => {
                                                    const currentBrandsList = editingItem.brands && editingItem.brands.length > 0 
                                                        ? editingItem.brands 
                                                        : (editingItem.brand && editingItem.brand !== 'ManiPOS' ? [editingItem.brand] : ['POT OF JOLLOF']);

                                                    if (currentBrandsList.length > 1) {
                                                        return (
                                                            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200 space-y-4">
                                                                <div className="flex items-center justify-between">
                                                                    <h5 className="text-[10px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1.5">
                                                                        👑 Per-Brand Omni-Channel Pricing Matrix ({currentBrandsList.length} Brands Selected)
                                                                    </h5>
                                                                    <span className="text-[9px] text-amber-700 font-bold">Configured per brand listing</span>
                                                                </div>
                                                                <div className="space-y-3">
                                                                    {currentBrandsList.map(bName => {
                                                                        const bPrices = (editingItem.brand_prices && editingItem.brand_prices[bName]) || {};
                                                                        const updateBrandPrice = (field, val) => {
                                                                            const currentBp = { ...(editingItem.brand_prices || {}) };
                                                                            currentBp[bName] = { ...(currentBp[bName] || {}), [field]: val ? parseFloat(val) : null };
                                                                            setEditingItem({ ...editingItem, brand_prices: currentBp });
                                                                        };

                                                                return (
                                                                    <div key={bName} className="bg-white p-3 rounded-xl border border-amber-100 space-y-2">
                                                                        <div className="flex justify-between items-center">
                                                                            <span className="text-[10px] font-black text-gray-800 uppercase tracking-wide flex items-center gap-1">
                                                                                🏷️ {bName}
                                                                            </span>
                                                                            <span className="text-[8px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">BRAND PRICING</span>
                                                                        </div>
                                                                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                                                                            <div>
                                                                                <label className="block text-[8px] font-bold text-gray-500 mb-0.5 uppercase">Base Price</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={bPrices.price !== undefined && bPrices.price !== null ? bPrices.price : ''}
                                                                                    onChange={(e) => updateBrandPrice('price', e.target.value)}
                                                                                    placeholder={editingItem.price || 'Base'}
                                                                                    className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-[8px] font-bold text-gray-500 mb-0.5 uppercase">Glovo</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={bPrices.glovo_price !== undefined && bPrices.glovo_price !== null ? bPrices.glovo_price : ''}
                                                                                    onChange={(e) => updateBrandPrice('glovo_price', e.target.value)}
                                                                                    placeholder="Glovo KES"
                                                                                    className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-[8px] font-bold text-gray-500 mb-0.5 uppercase">Uber Eats</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={bPrices.ubereats_price !== undefined && bPrices.ubereats_price !== null ? bPrices.ubereats_price : ''}
                                                                                    onChange={(e) => updateBrandPrice('ubereats_price', e.target.value)}
                                                                                    placeholder="Uber KES"
                                                                                    className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-[8px] font-bold text-gray-500 mb-0.5 uppercase">Bolt Food</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={bPrices.bolt_price !== undefined && bPrices.bolt_price !== null ? bPrices.bolt_price : ''}
                                                                                    onChange={(e) => updateBrandPrice('bolt_price', e.target.value)}
                                                                                    placeholder="Bolt KES"
                                                                                    className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-[8px] font-bold text-gray-500 mb-0.5 uppercase">Ando</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={bPrices.ando_price !== undefined && bPrices.ando_price !== null ? bPrices.ando_price : ''}
                                                                                    onChange={(e) => updateBrandPrice('ando_price', e.target.value)}
                                                                                    placeholder="Ando KES"
                                                                                    className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <label className="block text-[8px] font-bold text-gray-500 mb-0.5 uppercase">Micro Site</label>
                                                                                <input
                                                                                    type="number"
                                                                                    value={bPrices.website_price !== undefined && bPrices.website_price !== null ? bPrices.website_price : ''}
                                                                                    onChange={(e) => updateBrandPrice('website_price', e.target.value)}
                                                                                    placeholder="Site KES"
                                                                                    className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono font-bold"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <h5 className="text-[10px] font-black uppercase text-amber-900 tracking-wider flex items-center gap-1">
                                                            ⚡ Omni-Channel Specific Prices
                                                        </h5>
                                                        <span className="text-[9px] text-amber-700 font-bold">Leave blank to use base price</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                                                        <div>
                                                            <label className="block text-[9px] font-bold text-gray-600 mb-1 uppercase">Glovo Price</label>
                                                            <input
                                                                type="number"
                                                                value={editingItem.glovo_price || ''}
                                                                onChange={(e) => setEditingItem({ ...editingItem, glovo_price: e.target.value })}
                                                                placeholder={editingItem.price ? `Default ${editingItem.price}` : 'e.g. 1300'}
                                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold focus:border-amber-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-bold text-gray-600 mb-1 uppercase">Uber Eats Price</label>
                                                            <input
                                                                type="number"
                                                                value={editingItem.ubereats_price || ''}
                                                                onChange={(e) => setEditingItem({ ...editingItem, ubereats_price: e.target.value })}
                                                                placeholder={editingItem.price ? `Default ${editingItem.price}` : 'e.g. 1300'}
                                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold focus:border-amber-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-bold text-gray-600 mb-1 uppercase">Bolt Food Price</label>
                                                            <input
                                                                type="number"
                                                                value={editingItem.bolt_price || ''}
                                                                onChange={(e) => setEditingItem({ ...editingItem, bolt_price: e.target.value })}
                                                                placeholder={editingItem.price ? `Default ${editingItem.price}` : 'e.g. 1300'}
                                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold focus:border-amber-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-bold text-gray-600 mb-1 uppercase">Ando Price</label>
                                                            <input
                                                                type="number"
                                                                value={editingItem.ando_price || ''}
                                                                onChange={(e) => setEditingItem({ ...editingItem, ando_price: e.target.value })}
                                                                placeholder={editingItem.price ? `Default ${editingItem.price}` : 'e.g. 1300'}
                                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold focus:border-amber-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-bold text-gray-600 mb-1 uppercase">Micro Site Price</label>
                                                            <input
                                                                type="number"
                                                                value={editingItem.website_price || ''}
                                                                onChange={(e) => setEditingItem({ ...editingItem, website_price: e.target.value })}
                                                                placeholder={editingItem.price ? `Default ${editingItem.price}` : 'e.g. 1200'}
                                                                className="w-full p-2 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold focus:border-amber-500 outline-none"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Description</label>
                                                    <textarea
                                                        value={editingItem.description || ''}
                                                        onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                                                        placeholder="Describe this product recipe or details..."
                                                        rows={3}
                                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all text-xs font-medium"
                                                    />
                                                </div>
                                                <div className="flex items-center gap-2.5 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                                    <input
                                                        type="checkbox"
                                                        id="include-vat"
                                                        checked={editingItem.include_vat || false}
                                                        onChange={(e) => setEditingItem({ ...editingItem, include_vat: e.target.checked })}
                                                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                                    />
                                                    <label htmlFor="include-vat" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                                                        Include 16% VAT in this item's price
                                                    </label>
                                                </div>
                                                {/* Microsite Visibility Toggle */}
                                                <div className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-all ${
                                                    editingItem.show_on_microsite !== false
                                                        ? 'bg-emerald-50 border-emerald-200'
                                                        : 'bg-red-50 border-red-200'
                                                }`}>
                                                    <input
                                                        type="checkbox"
                                                        id="show-on-microsite"
                                                        checked={editingItem.show_on_microsite !== false}
                                                        onChange={(e) => setEditingItem({ ...editingItem, show_on_microsite: e.target.checked })}
                                                        className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                                                    />
                                                    <div className="flex-1">
                                                        <label htmlFor="show-on-microsite" className={`text-xs font-bold cursor-pointer select-none block ${
                                                            editingItem.show_on_microsite !== false ? 'text-emerald-800' : 'text-red-700'
                                                        }`}>
                                                            {editingItem.show_on_microsite !== false ? '🌐 Visible on Microsite' : '🚫 Hidden from Microsite'}
                                                        </label>
                                                        <p className="text-[9px] font-medium text-gray-400 mt-0.5">
                                                            {editingItem.show_on_microsite !== false
                                                                ? 'Customers can order this item online'
                                                                : 'Delivery fees, packaging & app items should be hidden'}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Column: Photo & Modifiers Linkage */}
                                        <div className="space-y-6">
                                            {/* Photo Box */}
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 flex flex-col items-center">
                                                <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider self-start">Product Photo</h4>
                                                <div className="w-full aspect-[4/3] rounded-2xl bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center relative group">
                                                    {editingItem.image_url ? (
                                                        <img src={editingItem.image_url} alt="Product" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-4xl">🍽️</span>
                                                    )}
                                                    {editingItem.id && (
                                                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-center p-3 cursor-pointer">
                                                            <span className="text-white text-xs font-black uppercase tracking-wider">Change Image</span>
                                                            <span className="text-white/70 text-[9px] font-bold">PDF, JPG, PNG</span>
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                onChange={(e) => handleImageUpload(editingItem.id, e.target.files[0])}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="w-full">
                                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Direct URL (Optional)</label>
                                                    <input
                                                        type="text"
                                                        value={editingItem.image_url || ''}
                                                        onChange={async (e) => {
                                                            const url = e.target.value.trim();
                                                            setEditingItem({ ...editingItem, image_url: url });
                                                            if (editingItem.id) {
                                                                await supabase.from('pos_menu').update({ image_url: url || null }).eq('id', editingItem.id);
                                                            }
                                                        }}
                                                        placeholder="https://image-link.com/pic.jpg"
                                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all text-[10px] font-mono font-bold"
                                                    />
                                                </div>
                                                {!editingItem.id && (
                                                    <p className="text-[10px] text-gray-400 text-center font-bold">Save the product details first to enable image uploading.</p>
                                                )}
                                            </div>

                                            {/* Linked Customisation Groups */}
                                            {editingItem && (
                                                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                                                    <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider">Customisation Groups</h4>
                                                    {modifierGroups.length === 0 ? (
                                                        <p className="text-[10px] text-gray-400 font-semibold italic">No customisation groups created yet.</p>
                                                    ) : (
                                                        <div className="space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                                                            {modifierGroups.map(group => {
                                                                const isChecked = linkedGroupIds.includes(group.id);
                                                                return (
                                                                    <div key={group.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                                                                        <span className="text-xs font-black text-gray-800">{group.name}</span>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={() => {
                                                                                setLinkedGroupIds(prev =>
                                                                                    prev.includes(group.id)
                                                                                        ? prev.filter(id => id !== group.id)
                                                                                        : [...prev, group.id]
                                                                                );
                                                                            }}
                                                                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* TAB 1: MENU ITEMS (CATEGORIZED VIEW) */}
                                {menuSettingsTab === 'items' && (
                                    <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm">
                                        <div className="p-5 border-b border-gray-50 flex justify-between items-center shrink-0">
                                            <div>
                                                <h3 className="font-black text-gray-900 text-sm">Dishes, Drinks & Customisations</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Manage products, inclusive VAT settings, and category allocations.</p>
                                            </div>
                                            <div className="relative w-64 shrink-0">
                                                <Search className="absolute left-3 top-2.5 text-gray-300" size={14} />
                                                <input
                                                    type="text"
                                                    placeholder="Search dishes..."
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary focus:bg-white outline-none transition-all"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                                            {categories.map(cat => {
                                                const catItems = menu.filter(item => {
                                                    if (item.category !== cat.name) return false;
                                                    if (!searchQuery.trim()) return true;
                                                    return item.name.toLowerCase().includes(searchQuery.toLowerCase());
                                                });

                                                if (catItems.length === 0) return null;

                                                return (
                                                    <div key={cat.name} className="space-y-3">
                                                        <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider flex items-center gap-1.5">
                                                            <span className="text-base">{cat.icon}</span> {cat.name} ({catItems.length})
                                                        </h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                            {catItems.map(item => (
                                                                <div 
                                                                    key={item.id} 
                                                                    className="bg-white rounded-2xl border border-gray-150 p-4 flex gap-3 hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 relative group cursor-pointer"
                                                                    onClick={() => setEditingItem(item)}
                                                                >
                                                                    {/* Thumbnail */}
                                                                    <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-150 overflow-hidden flex items-center justify-center shrink-0">
                                                                        {item.image_url ? (
                                                                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <span className="text-xl">🍽️</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 flex flex-col justify-between overflow-hidden">
                                                                        <div>
                                                                            <h5 className="font-bold text-xs text-gray-900 truncate leading-tight">{item.name}</h5>
                                                                            <p className="text-[10px] font-bold text-primary tracking-wide font-mono mt-1">
                                                                                KES {item.price.toLocaleString()}
                                                                                {item.include_vat && (
                                                                                    <span className="ml-1 px-1 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase rounded">VAT</span>
                                                                                )}
                                                                            </p>
                                                                        </div>
                                                                        <div className="flex justify-between items-center mt-1">
                                                                            <button 
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    toggleItemAvailability(item.id, item.is_available);
                                                                                }}
                                                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                                                                                    item.is_available
                                                                                        ? 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600'
                                                                                        : 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700'
                                                                                }`}
                                                                                title={item.is_available ? 'Click to mark Out of Stock' : 'Click to mark Available'}
                                                                            >
                                                                                <span className={`w-1.5 h-1.5 rounded-full ${item.is_available ? 'bg-white animate-pulse' : 'bg-white'}`} />
                                                                                <span>{item.is_available ? 'Available' : 'Unavailable'}</span>
                                                                            </button>

                                                                            <button 
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setEditingItem(item);
                                                                                }}
                                                                                className="text-gray-300 hover:text-gray-900 text-[10px] font-black uppercase tracking-wider"
                                                                            >
                                                                                Edit
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: CUSTOMISATIONS (STRUCTURED MODIFIERS) */}
                                {menuSettingsTab === 'customisations' && (
                                    <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm">
                                        <div className="p-5 border-b border-gray-50 shrink-0">
                                            <h3 className="font-black text-gray-900 text-sm">Uber Eats Customisation Groups</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Modifier groups containing custom options, selection rules and prices.</p>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                                            {modifierGroups.length === 0 ? (
                                                <div className="text-center py-20 text-gray-400">
                                                    <KeyRound size={48} className="mx-auto text-gray-200 mb-3" />
                                                    <p className="text-xs font-bold uppercase tracking-widest">No customisations created yet.</p>
                                                    <p className="text-[10px] mt-1 font-bold">Click "+ Add Customisation" to build your first modifier group.</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                    {modifierGroups.map(group => (
                                                        <div key={group.id} className="bg-white rounded-[2rem] border border-gray-150 p-6 flex flex-col justify-between hover:shadow-md transition-all duration-300">
                                                            <div>
                                                                <div className="flex justify-between items-start">
                                                                    <h4 className="font-black text-sm text-gray-900 truncate pr-4">{group.name}</h4>
                                                                    <span className="text-[9px] px-2 py-0.5 bg-gray-100 rounded-lg text-gray-500 font-black uppercase tracking-wider">
                                                                        {group.is_required ? 'Required' : 'Optional'}
                                                                    </span>
                                                                </div>
                                                                
                                                                {/* Selection rules info */}
                                                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                                                                    Rules: Min {group.min_selected} · Max {group.max_selected}
                                                                </p>

                                                                {/* Options List */}
                                                                <div className="mt-4 border-t border-gray-50 pt-3 space-y-2">
                                                                    {(group.options || []).map((opt, idx) => (
                                                                        <div key={idx} className="flex justify-between text-xs font-medium text-gray-700">
                                                                            <span>{opt.name}</span>
                                                                            <span className="font-mono font-bold text-gray-500">
                                                                                +{opt.price > 0 ? `KES ${opt.price}` : 'Free'}
                                                                                {opt.include_vat && <span className="ml-1 text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-0.5 rounded">VAT</span>}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            <div className="flex justify-between items-center border-t border-gray-50 pt-4 mt-6">
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase">
                                                                    Linked to {(group.menu_item_ids || []).length} items
                                                                </span>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => setEditingModifierGroup(group)}
                                                                        className="px-2.5 py-1 bg-gray-50 hover:bg-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors border border-gray-200 shadow-sm"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteModifierGroup(group.id)}
                                                                        className="p-1 text-gray-300 hover:text-red-600 transition-colors"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 3: CATEGORIES */}
                                {menuSettingsTab === 'categories' && (
                                    <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm">
                                        <div className="p-5 border-b border-gray-50 shrink-0">
                                            <h3 className="font-black text-gray-900 text-sm">Menu Categories</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Manage POS categories, edit details, and reassign items.</p>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                            {categories.length === 0 ? (
                                                <div className="text-center py-20 text-gray-400">
                                                    <Search size={48} className="mx-auto text-gray-200 mb-3" />
                                                    <p className="text-xs font-bold uppercase tracking-widest">No categories created yet.</p>
                                                    <p className="text-[10px] mt-1 font-bold">Click "+ Add Category" to build your first category.</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                    {categories.map(cat => {
                                                        const catItemCount = menu.filter(item => item.category === cat.name).length;
                                                        return (
                                                            <div key={cat.id || cat.name} className="bg-white rounded-[2rem] border border-gray-150 p-6 flex flex-col justify-between hover:shadow-md transition-all duration-300">
                                                                <div>
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-12 h-12 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center text-2xl shrink-0">
                                                                            {cat.icon}
                                                                        </div>
                                                                        <div>
                                                                            <h4 className="font-black text-sm text-gray-900 leading-tight">{cat.name}</h4>
                                                                            <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">{catItemCount} dishes linked</p>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                <div className="flex justify-between items-center border-t border-gray-50 pt-4 mt-6">
                                                                    <div className="flex items-center gap-1">
                                                                        <button
                                                                            onClick={() => handleMoveCategory(cat, 'up')}
                                                                            disabled={categories.indexOf(cat) === 0}
                                                                            className="px-2 py-1 bg-gray-50 hover:bg-gray-200 disabled:opacity-40 text-gray-500 hover:text-gray-900 text-[9px] font-black uppercase tracking-wider rounded-lg transition-colors border border-gray-150 shadow-sm"
                                                                        >
                                                                            ↑ Up
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleMoveCategory(cat, 'down')}
                                                                            disabled={categories.indexOf(cat) === categories.length - 1}
                                                                            className="px-2 py-1 bg-gray-50 hover:bg-gray-200 disabled:opacity-40 text-gray-500 hover:text-gray-900 text-[9px] font-black uppercase tracking-wider rounded-lg transition-colors border border-gray-150 shadow-sm"
                                                                        >
                                                                            ↓ Down
                                                                        </button>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => setEditingCategory(cat)}
                                                                            className="px-2.5 py-1 bg-gray-50 hover:bg-gray-200 text-gray-600 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors border border-gray-200 shadow-sm"
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                        {cat.id && (
                                                                            <button
                                                                                onClick={() => handleDeleteCategory(cat)}
                                                                                className="p-1 text-gray-300 hover:text-red-600 transition-colors"
                                                                            >
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* TAB 4: DISCOUNTS / PROMO CODES */}
                                {menuSettingsTab === 'discounts' && !editingDiscount && (
                                    <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm">
                                        <div className="p-5 border-b border-gray-50 shrink-0">
                                            <h3 className="font-black text-gray-900 text-sm">Microsite Promo Codes</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Manage promotional codes, discounts, and validation criteria.</p>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                                            {loadingDiscounts ? (
                                                <div className="flex items-center justify-center py-20 text-gray-400 text-xs font-bold uppercase">
                                                    Loading promo codes...
                                                </div>
                                            ) : discountsList.length === 0 ? (
                                                <div className="text-center py-20 text-gray-400">
                                                    <span className="text-4xl block mb-3">🎟️</span>
                                                    <p className="text-xs font-bold uppercase tracking-widest">No promo codes created yet.</p>
                                                    <p className="text-[10px] mt-1 font-bold">Click "+ Add Promo Code" to create your first coupon.</p>
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                    {discountsList.map(disc => (
                                                        <div key={disc.id} className="bg-white rounded-[2rem] border border-gray-150 p-6 flex flex-col justify-between hover:shadow-md transition-all duration-300">
                                                            <div>
                                                                <div className="flex justify-between items-start">
                                                                    <span className="px-2.5 py-1 bg-black text-white text-[10px] font-mono font-black uppercase tracking-wider rounded-lg shadow-sm">
                                                                        {disc.code.replace(/\[ITEMS:.*\]/, "")}
                                                                    </span>
                                                                    {disc.code.includes("[ITEMS:") && (
                                                                        <span className="text-[8px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md block mt-1">
                                                                            🎯 {disc.code.match(/\[ITEMS:(.*)\]/)?.[1]}
                                                                        </span>
                                                                    )}
                                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${
                                                                        disc.is_active 
                                                                            ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                                                                            : 'bg-gray-55 border-gray-200 text-gray-400'
                                                                    }`}>
                                                                        {disc.is_active ? 'Active' : 'Inactive'}
                                                                    </span>
                                                                </div>

                                                                <div className="mt-4 space-y-1">
                                                                    <p className="text-xs font-bold text-gray-900 text-left">
                                                                        Offer: {disc.type === "percentage" ? `${disc.value}% OFF` : disc.type === "fixed" ? `KES ${disc.value.toLocaleString()} OFF` : disc.type === "bogof" ? "BOGOF Free Item" : (disc.value > 0 ? `Free Delivery (max ${disc.value}km)` : "Free Delivery")}
                                                                    </p>
                                                                    <p className="text-[9px] font-bold text-gray-400 uppercase text-left">
                                                                        Min Order Amount: KES {disc.min_order_amount.toLocaleString()}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex justify-end items-center border-t border-gray-50 pt-4 mt-6 gap-2">
                                                                <button
                                                                    onClick={() => setEditingDiscount(disc)}
                                                                    className="px-2.5 py-1 bg-gray-50 hover:bg-gray-250 text-gray-800 text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors border border-gray-200 shadow-sm"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => deleteDiscount(disc.id)}
                                                                    className="p-1.5 text-gray-300 hover:text-red-650 transition-colors"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {menuSettingsTab === 'sound_alerts' && (
                                    <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm">
                                        <div className="p-5 border-b border-gray-50 shrink-0">
                                            <h3 className="font-black text-gray-900 text-sm">Order Ring Alert Settings</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5 font-sans">Configure alert sounds and volumes for incoming microsite orders.</p>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                                            {/* Enable/Disable Sound Alerts */}
                                            <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-150 rounded-2xl">
                                                <div>
                                                    <span className="text-xs font-bold text-gray-800 block">Enable Alert Ringing</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">Ring when a customer places an order from the microsite</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newVal = !alertEnabled;
                                                        setAlertEnabled(newVal);
                                                        localStorage.setItem('pos_alert_enabled', String(newVal));
                                                    }}
                                                    className={`w-12 h-6 flex items-center rounded-full p-1 transition-all ${alertEnabled ? 'bg-primary justify-end' : 'bg-gray-300 justify-start'}`}
                                                >
                                                    <span className="bg-white w-4 h-4 rounded-full shadow-sm block" />
                                                </button>
                                            </div>

                                            {/* Sound Selection */}
                                            <div className="bg-white border border-gray-150 p-5 rounded-3xl space-y-3">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Choose Sound Ringtone</span>
                                                <div className="grid grid-cols-3 gap-3">
                                                    {['chime', 'bell', 'digital'].map((snd) => (
                                                        <button
                                                            key={snd}
                                                            type="button"
                                                            onClick={() => {
                                                                setAlertSound(snd);
                                                                localStorage.setItem('pos_alert_sound', snd);
                                                                playAlertSound(snd, alertVolume);
                                                            }}
                                                            className={`p-4 rounded-2xl border text-xs font-black uppercase tracking-wider flex flex-col items-center gap-2 transition-all ${
                                                                alertSound === snd
                                                                    ? 'bg-primary border-primary text-secondary shadow-md'
                                                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-55'
                                                            }`}
                                                        >
                                                            <span className="text-xl">
                                                                {snd === 'chime' ? '🔔' : snd === 'bell' ? '🔊' : '🤖'}
                                                            </span>
                                                            <span>{snd}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Volume Control */}
                                            <div className="bg-white border border-gray-150 p-5 rounded-3xl space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Alert Ring Volume</span>
                                                    <span className="text-xs font-mono font-bold text-gray-800">{Math.round(alertVolume * 100)}%</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-xs">🔈</span>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="1"
                                                        step="0.05"
                                                        value={alertVolume}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value);
                                                            setAlertVolume(val);
                                                            localStorage.setItem('pos_alert_volume', String(val));
                                                        }}
                                                        onMouseUp={() => playAlertSound(alertSound, alertVolume)}
                                                        onTouchEnd={() => playAlertSound(alertSound, alertVolume)}
                                                        className="flex-1 accent-primary bg-gray-100 rounded-lg h-2"
                                                    />
                                                    <span className="text-xs">🔊</span>
                                                </div>
                                            </div>

                                            {/* Test Sound Button */}
                                            <div className="pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => playAlertSound()}
                                                    className="px-6 py-2.5 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition-all uppercase tracking-wider"
                                                >
                                                    🔔 Test Sound Alert
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {menuSettingsTab === 'api_integrations' && (
                                    <ApiIntegrationsDashboard menu={menu} />
                                )}
                            </>
                        )}

                {/* MODIFIER GROUP BUILDER MODAL */}
                <AnimatePresence>
                    {editingModifierGroup && (
                        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-100 flex flex-col text-secondary"
                            >
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center shrink-0">
                                    <h3 className="font-black text-sm text-gray-900">
                                        {editingModifierGroup.id ? 'Edit Customisation Group' : 'Create Customisation Group'}
                                    </h3>
                                    <button 
                                        onClick={() => setEditingModifierGroup(null)} 
                                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Body */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gray-50/40">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Left Side: Rules & Options */}
                                        <div className="space-y-4">
                                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Configuration</h4>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Group Name</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="e.g. Swallow Choice, Extras"
                                                        value={editingModifierGroup.name}
                                                        onChange={(e) => setEditingModifierGroup({ ...editingModifierGroup, name: e.target.value })}
                                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all text-xs font-bold"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Min Selection</label>
                                                        <input
                                                            type="number"
                                                            required
                                                            min={0}
                                                            value={editingModifierGroup.min_selected}
                                                            onChange={(e) => setEditingModifierGroup({ ...editingModifierGroup, min_selected: parseInt(e.target.value) || 0 })}
                                                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all text-xs font-bold"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Max Selection</label>
                                                        <input
                                                            type="number"
                                                            required
                                                            min={1}
                                                            value={editingModifierGroup.max_selected}
                                                            onChange={(e) => setEditingModifierGroup({ ...editingModifierGroup, max_selected: parseInt(e.target.value) || 1 })}
                                                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all text-xs font-bold"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 pt-2">
                                                    <input
                                                        type="checkbox"
                                                        id="group-required"
                                                        checked={editingModifierGroup.is_required || false}
                                                        onChange={(e) => setEditingModifierGroup({ ...editingModifierGroup, is_required: e.target.checked })}
                                                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                                    />
                                                    <label htmlFor="group-required" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                                                        Required (Force customer select)
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Options List */}
                                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Modifier Options</h4>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const opts = [...(editingModifierGroup.options || [])];
                                                            opts.push({ name: '', price: 0, include_vat: false, is_available: true });
                                                            setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                        }}
                                                        className="text-[10px] text-primary font-black uppercase tracking-wider"
                                                    >
                                                        + Add Option
                                                    </button>
                                                </div>
                                                
                                                <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                                                    {(editingModifierGroup.options || []).map((opt, idx) => (
                                                        <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2 relative">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const opts = (editingModifierGroup.options || []).filter((_, i) => i !== idx);
                                                                    setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                                }}
                                                                className="absolute right-2.5 top-2.5 text-gray-300 hover:text-red-500"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Option Name</label>
                                                                    <input
                                                                        type="text"
                                                                        required
                                                                        placeholder="e.g. Extra Chicken"
                                                                        value={opt.name}
                                                                        onChange={(e) => {
                                                                            const opts = [...editingModifierGroup.options];
                                                                            opts[idx].name = e.target.value;
                                                                            setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                                        }}
                                                                        className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-bold"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Base Price (KES)</label>
                                                                    <input
                                                                        type="number"
                                                                        required
                                                                        placeholder="0"
                                                                        value={opt.price}
                                                                        onChange={(e) => {
                                                                            const opts = [...editingModifierGroup.options];
                                                                            opts[idx].price = parseFloat(e.target.value) || 0;
                                                                            setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                                        }}
                                                                        className="w-full p-2 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Modifier Option Omni-Channel Prices */}
                                                            <div className="pt-1.5 border-t border-gray-200/60">
                                                                <label className="block text-[8px] font-black text-amber-700 uppercase tracking-widest mb-1">⚡ Omni-Channel Prices (Optional)</label>
                                                                <div className="grid grid-cols-3 gap-1.5">
                                                                    <div>
                                                                        <span className="text-[7px] text-gray-400 font-bold block uppercase">Glovo</span>
                                                                        <input
                                                                            type="number"
                                                                            placeholder={opt.price || '0'}
                                                                            value={opt.glovo_price !== undefined && opt.glovo_price !== null ? opt.glovo_price : ''}
                                                                            onChange={(e) => {
                                                                                const opts = [...editingModifierGroup.options];
                                                                                opts[idx].glovo_price = e.target.value ? parseFloat(e.target.value) : null;
                                                                                setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                                            }}
                                                                            className="w-full p-1 bg-white border border-gray-200 rounded text-[10px] font-mono font-bold"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-[7px] text-gray-400 font-bold block uppercase">Uber Eats</span>
                                                                        <input
                                                                            type="number"
                                                                            placeholder={opt.price || '0'}
                                                                            value={opt.ubereats_price !== undefined && opt.ubereats_price !== null ? opt.ubereats_price : ''}
                                                                            onChange={(e) => {
                                                                                const opts = [...editingModifierGroup.options];
                                                                                opts[idx].ubereats_price = e.target.value ? parseFloat(e.target.value) : null;
                                                                                setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                                            }}
                                                                            className="w-full p-1 bg-white border border-gray-200 rounded text-[10px] font-mono font-bold"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-[7px] text-gray-400 font-bold block uppercase">Bolt Food</span>
                                                                        <input
                                                                            type="number"
                                                                            placeholder={opt.price || '0'}
                                                                            value={opt.bolt_price !== undefined && opt.bolt_price !== null ? opt.bolt_price : ''}
                                                                            onChange={(e) => {
                                                                                const opts = [...editingModifierGroup.options];
                                                                                opts[idx].bolt_price = e.target.value ? parseFloat(e.target.value) : null;
                                                                                setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                                            }}
                                                                            className="w-full p-1 bg-white border border-gray-200 rounded text-[10px] font-mono font-bold"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-[7px] text-gray-400 font-bold block uppercase">Ando Food</span>
                                                                        <input
                                                                            type="number"
                                                                            placeholder={opt.price || '0'}
                                                                            value={opt.ando_price !== undefined && opt.ando_price !== null ? opt.ando_price : ''}
                                                                            onChange={(e) => {
                                                                                const opts = [...editingModifierGroup.options];
                                                                                opts[idx].ando_price = e.target.value ? parseFloat(e.target.value) : null;
                                                                                setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                                            }}
                                                                            className="w-full p-1 bg-white border border-gray-200 rounded text-[10px] font-mono font-bold"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1.5 pt-1">
                                                                <input
                                                                    type="checkbox"
                                                                    id={`opt-vat-${idx}`}
                                                                    checked={opt.include_vat || false}
                                                                    onChange={(e) => {
                                                                        const opts = [...editingModifierGroup.options];
                                                                        opts[idx].include_vat = e.target.checked;
                                                                        setEditingModifierGroup({ ...editingModifierGroup, options: opts });
                                                                    }}
                                                                    className="w-3.5 h-3.5 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                                                                />
                                                                <label htmlFor={`opt-vat-${idx}`} className="text-[9px] font-bold text-gray-500 cursor-pointer select-none">
                                                                    Include 16% VAT in this option's price
                                                                </label>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Side: Linked Menu Items selection list */}
                                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3 flex flex-col overflow-hidden">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tied Menu Items</h4>
                                            <p className="text-[9px] text-gray-400 font-bold uppercase leading-normal">Select which menu items this customisation applies to. If empty, it applies to all menu items.</p>
                                            
                                            <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-50 rounded-xl divide-y divide-gray-50 max-h-[320px]">
                                                {menu.map(item => {
                                                    const isChecked = (editingModifierGroup.menu_item_ids || []).includes(item.id);
                                                    return (
                                                        <div key={item.id} className="flex justify-between items-center p-2.5 hover:bg-gray-50/50 transition-colors">
                                                            <span className="text-xs font-bold text-gray-800 leading-tight">{item.name}</span>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => {
                                                                    const ids = editingModifierGroup.menu_item_ids || [];
                                                                    const newIds = isChecked
                                                                        ? ids.filter(id => id !== item.id)
                                                                        : [...ids, item.id];
                                                                    setEditingModifierGroup({ ...editingModifierGroup, menu_item_ids: newIds });
                                                                }}
                                                                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="p-4 border-t border-gray-50 bg-gray-50/50 flex gap-4 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setEditingModifierGroup(null)}
                                        className="flex-1 py-3 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!editingModifierGroup.name.trim()) {
                                                alert('Please specify Group Name.');
                                                return;
                                            }
                                            // Clean empty options
                                            const cleanOptions = (editingModifierGroup.options || [])
                                                .filter(o => o.name.trim() !== '')
                                                .map(o => ({
                                                    name: o.name.trim(),
                                                    price: parseFloat(o.price) || 0,
                                                    include_vat: o.include_vat || false,
                                                    is_available: o.is_available !== false
                                                }));

                                            const payload = {
                                                name: editingModifierGroup.name.trim(),
                                                min_selected: parseInt(editingModifierGroup.min_selected) || 0,
                                                max_selected: parseInt(editingModifierGroup.max_selected) || 1,
                                                is_required: editingModifierGroup.is_required || false,
                                                menu_item_ids: editingModifierGroup.menu_item_ids || [],
                                                options: cleanOptions
                                            };

                                            if (editingModifierGroup.id) {
                                                handleSaveModifierGroup({ id: editingModifierGroup.id, ...payload });
                                            } else {
                                                handleSaveModifierGroup(payload);
                                            }
                                        }}
                                        className="flex-1 py-3 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition-colors"
                                    >
                                        Save Customisation
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* CATEGORY BUILDER MODAL */}
                <AnimatePresence>
                    {editingCategory && (
                        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl border border-gray-100 flex flex-col text-secondary"
                            >
                                {/* Header */}
                                <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center shrink-0">
                                    <h3 className="font-black text-sm text-gray-900">
                                        {editingCategory.id ? 'Edit Category Details' : 'Create New Category'}
                                    </h3>
                                    <button 
                                        onClick={() => setEditingCategory(null)} 
                                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Body */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gray-50/40">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Left: Category Form Details */}
                                        <div className="md:col-span-1 space-y-4">
                                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Category Name *</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder="e.g. Desserts"
                                                        value={editingCategory.name}
                                                        onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                                        className="w-full p-2.5 bg-gray-50 border border-gray-250 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Icon (Emoji) *</label>
                                                    <input
                                                        type="text"
                                                        required
                                                        maxLength="5"
                                                        placeholder="🍽️"
                                                        value={editingCategory.icon}
                                                        onChange={(e) => setEditingCategory({ ...editingCategory, icon: e.target.value })}
                                                        className="w-full p-2.5 bg-gray-50 border border-gray-250 rounded-xl text-xs font-bold text-center text-lg focus:ring-2 focus:ring-primary outline-none transition-all animate-none"
                                                    />
                                                    
                                                    {/* Quick select icons */}
                                                    <div className="grid grid-cols-4 gap-1.5 mt-2">
                                                        {['🍢', '🍳', '🍛', '🍲', '🥣', '🥤', '☕', '🍰', '🍔', '🍕', '🥗', '🥞'].map(emoji => (
                                                            <button
                                                                key={emoji}
                                                                type="button"
                                                                onClick={() => setEditingCategory({ ...editingCategory, icon: emoji })}
                                                                className={`p-1.5 hover:bg-gray-200 rounded-lg text-sm transition-all border flex items-center justify-center ${editingCategory.icon === emoji ? 'border-primary bg-primary/10' : 'border-gray-150 bg-white'}`}
                                                            >
                                                                {emoji}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-600 mb-1.5 uppercase ml-1">Display Order</label>
                                                    <input
                                                        type="number"
                                                        value={editingCategory.display_order || 0}
                                                        onChange={(e) => setEditingCategory({ ...editingCategory, display_order: parseInt(e.target.value) || 0 })}
                                                        className="w-full p-2.5 bg-gray-50 border border-gray-250 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-primary outline-none transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Items in Category Checkbox List */}
                                        <div className="md:col-span-2 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3 flex flex-col overflow-hidden max-h-[450px]">
                                            <div className="flex justify-between items-center shrink-0">
                                                <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider">Change Items in Category</h4>
                                                <span className="text-[10px] bg-primary/10 text-primary-dark font-black px-2 py-0.5 rounded-lg uppercase">
                                                    {catLinkedItemIds.length} Selected
                                                </span>
                                            </div>

                                            {/* Search box */}
                                            <div className="relative shrink-0">
                                                <Search className="absolute left-3 top-2.5 text-gray-300" size={12} />
                                                <input
                                                    type="text"
                                                    placeholder="Search dishes to assign..."
                                                    value={catItemSearch}
                                                    onChange={(e) => setCatItemSearch(e.target.value)}
                                                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-xl text-[11px] focus:ring-2 focus:ring-primary outline-none transition-all font-bold"
                                                />
                                            </div>

                                            {/* Scrollable list */}
                                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                                {menu
                                                    .filter(item => {
                                                        if (!catItemSearch.trim()) return true;
                                                        return item.name.toLowerCase().includes(catItemSearch.toLowerCase());
                                                    })
                                                    .map(item => {
                                                        const isChecked = catLinkedItemIds.includes(item.id);
                                                        return (
                                                            <div 
                                                                key={item.id} 
                                                                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                                                    isChecked 
                                                                        ? 'bg-primary/5 border-primary/20' 
                                                                        : 'bg-gray-50/50 border-gray-100 hover:bg-gray-50'
                                                                }`}
                                                            >
                                                                <div className="min-w-0 flex-1 pr-4">
                                                                    <div className="text-xs font-black text-gray-800 truncate">{item.name}</div>
                                                                    <div className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Current Cat: {item.category || 'Uncategorized'}</div>
                                                                </div>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => {
                                                                        setCatLinkedItemIds(prev =>
                                                                            prev.includes(item.id)
                                                                                ? prev.filter(id => id !== item.id)
                                                                                : [...prev, item.id]
                                                                        );
                                                                    }}
                                                                    className="w-4 h-4 text-primary border-gray-350 rounded focus:ring-primary cursor-pointer shrink-0"
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="p-4 border-t border-gray-50 bg-gray-50/50 flex gap-4 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setEditingCategory(null)}
                                        className="flex-1 py-3 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSaveCategory()}
                                        className="flex-1 py-3 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition-colors"
                                    >
                                        Save Category
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* PROMO CODE BUILDER MODAL */}
                <AnimatePresence>
                    {editingDiscount && (
                        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-hidden shadow-2xl border border-gray-100 flex flex-col text-secondary"
                            >
                                <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center shrink-0">
                                    <h3 className="font-black text-sm text-gray-900">
                                        {editingDiscount.id ? 'Edit Promo Code' : 'Create Promo Code'}
                                    </h3>
                                    <button 
                                        type="button"
                                        onClick={() => setEditingDiscount(null)} 
                                        className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-white">
                                    {(() => {
                                        const cleanCode = (editingDiscount.code || "").replace(/\[ITEMS:.*\]/, "");
                                        const selectedItems = (editingDiscount.code || "").match(/\[ITEMS:(.*)\]/)?.[1]?.split(",").filter(Boolean) || [];
                                        const isItemSpecific = selectedItems.length > 0 || editingDiscount._isItemSpecific;

                                        const toggleItem = (name) => {
                                            let next = [...selectedItems];
                                            if (next.includes(name)) {
                                                next = next.filter(i => i !== name);
                                            } else {
                                                next.push(name);
                                            }
                                            const updatedCode = next.length > 0 ? `${cleanCode}[ITEMS:${next.join(",")}]` : cleanCode;
                                            setEditingDiscount({
                                                ...editingDiscount,
                                                code: updatedCode,
                                                _isItemSpecific: true
                                            });
                                        };

                                        return (
                                            <>
                                                <div className="space-y-1 text-left">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Promo Code</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. LUNCH20, SAVE200"
                                                        value={cleanCode}
                                                        onChange={(e) => {
                                                            const newClean = e.target.value.toUpperCase().replace(/\[.*\]/g, "");
                                                            const newCode = selectedItems.length > 0 ? `${newClean}[ITEMS:${selectedItems.join(",")}]` : newClean;
                                                            setEditingDiscount({ ...editingDiscount, code: newCode });
                                                        }}
                                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-primary outline-none font-semibold font-mono uppercase"
                                                    />
                                                </div>

                                                {/* Item specific toggle */}
                                                {(editingDiscount.type === "percentage" || editingDiscount.type === "fixed") && (
                                                    <div className="space-y-2 p-3 bg-gray-50 rounded-2xl border border-gray-200 text-left">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs font-bold text-gray-800">Target Items</span>
                                                            <div className="flex bg-gray-200 p-0.5 rounded-lg text-[10px] font-bold">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingDiscount({ ...editingDiscount, code: cleanCode, _isItemSpecific: false })}
                                                                    className={`px-2 py-0.5 rounded ${!isItemSpecific ? "bg-white text-black shadow-xs" : "text-gray-600"}`}
                                                                >
                                                                    All Items
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingDiscount({ ...editingDiscount, _isItemSpecific: true })}
                                                                    className={`px-2 py-0.5 rounded ${isItemSpecific ? "bg-white text-black shadow-xs" : "text-gray-600"}`}
                                                                >
                                                                    Specific Items
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {isItemSpecific && (
                                                            <div className="space-y-2 pt-1">
                                                                {selectedItems.length > 0 && (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {selectedItems.map(name => (
                                                                            <span key={name} className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1">
                                                                                <span>{name}</span>
                                                                                <button type="button" onClick={() => toggleItem(name)} className="text-red-500 font-bold ml-1">✕</button>
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                                <div className="max-h-28 overflow-y-auto space-y-1 bg-white p-2 rounded-xl border border-gray-200 custom-scrollbar">
                                                                    {menuItems.slice(0, 30).map(item => (
                                                                        <div
                                                                            key={item.id || item.name}
                                                                            onClick={() => toggleItem(item.name)}
                                                                            className={`flex justify-between items-center p-1.5 rounded text-[11px] font-medium cursor-pointer ${
                                                                                selectedItems.includes(item.name) ? "bg-amber-50 text-amber-900 font-bold" : "hover:bg-gray-100 text-gray-700"
                                                                            }`}
                                                                        >
                                                                            <span>{item.name}</span>
                                                                            <span className="text-[9px] font-mono text-gray-400">KES {item.price}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1 text-left">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Type</label>
                                            <select
                                                value={editingDiscount.type}
                                                onChange={(e) => setEditingDiscount({ ...editingDiscount, type: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-primary outline-none font-semibold"
                                            >
                                                <option value="percentage">Percentage (%)</option>
                                                <option value="fixed">Fixed Amount Off (KES)</option>
                                                <option value="free_delivery">Free Delivery Promo</option>
                                                <option value="bogof">Buy 1 Get 1 Free (BOGOF)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1 text-left">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Value</label>
                                            <input
                                                type="number"
                                                placeholder="e.g. 10 or 200"
                                                value={editingDiscount.value}
                                                onChange={(e) => setEditingDiscount({ ...editingDiscount, value: parseFloat(e.target.value) || '' })}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-primary outline-none font-semibold"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1 text-left">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Minimum Order Amount (KES)</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 1000"
                                            value={editingDiscount.min_order_amount}
                                            onChange={(e) => setEditingDiscount({ ...editingDiscount, min_order_amount: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-primary outline-none font-semibold font-mono"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 p-1 text-left">
                                        <input
                                            type="checkbox"
                                            id="discount_active"
                                            checked={editingDiscount.is_active !== false}
                                            onChange={(e) => setEditingDiscount({ ...editingDiscount, is_active: e.target.checked })}
                                            className="rounded border-gray-305 text-black focus:ring-black cursor-pointer"
                                        />
                                        <label htmlFor="discount_active" className="text-xs font-bold text-gray-700 cursor-pointer select-none">
                                            Enable Promo Code (Active)
                                        </label>
                                    </div>
                                </div>

                                <div className="p-4 border-t border-gray-50 bg-gray-50/50 flex gap-4 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setEditingDiscount(null)}
                                        className="flex-1 py-3 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => saveDiscount(editingDiscount)}
                                        disabled={!editingDiscount.code.trim() || !editingDiscount.value}
                                        className="flex-1 py-3 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition-colors"
                                    >
                                        Save Promo Code
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        )}

                {activeView === 'campaigns' && (
                    <CampaignsView />
                )}

                {activeView === 'terminal_settings' && (
                    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/50 p-6 gap-6">
                        {/* Users, PINs and Terminal configured roles */}
                        <div className="flex-1 flex flex-col overflow-hidden bg-white rounded-3xl border border-gray-100 shadow-sm">
                            <div className="p-5 border-b border-gray-50 flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="font-black text-gray-900 text-sm">Staff Terminals & Access Control</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Manage terminal roles, PINs, and grant access for POS and KDS screens.</p>
                                </div>
                                <button
                                    onClick={() => setShowAddStaffForm(!showAddStaffForm)}
                                    className="px-3.5 py-1.5 bg-primary text-secondary font-black text-xs rounded-xl shadow-sm hover:shadow transition-all"
                                >
                                    {showAddStaffForm ? '✕ Close Form' : '+ Add Staff Access PIN'}
                                </button>
                            </div>

                            {showAddStaffForm && (
                                <form onSubmit={handleCreateStaff} className="p-5 bg-gray-50 border-b border-gray-100 grid grid-cols-1 md:grid-cols-5 gap-4 items-end animate-in slide-in-from-top duration-200">
                                    <div>
                                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Staff Display Name</label>
                                        <input
                                            name="name"
                                            type="text"
                                            required
                                            placeholder="e.g. Samuel POS"
                                            className="w-full p-2 text-xs border border-gray-200 bg-white rounded-lg font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">4-Digit Login PIN</label>
                                        <input
                                            name="pin"
                                            type="text"
                                            pattern="[0-9]{4}"
                                            maxLength="4"
                                            required
                                            placeholder="e.g. 1212"
                                            className="w-full p-2 text-xs border border-gray-200 bg-white rounded-lg font-mono font-bold text-center"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Granted Role / Interface Rights</label>
                                        <select name="role" required className="w-full p-2 text-xs border border-gray-200 bg-white rounded-lg font-bold">
                                            <option value="cashier">Cashier POS Terminal</option>
                                            <option value="waiter">Waiter Order Station</option>
                                            <option value="chef">Kitchen Display (KDS) + Waste Logger</option>
                                            <option value="kds">Direct KDS Monitor Only</option>
                                            <option value="receiver">Goods Receiver Terminal</option>
                                            <option value="expense_clerk">Expense Clerk Interface</option>
                                            <option value="admin">Terminal Admin (All Rights)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">History View Rights</label>
                                        <select name="today_yesterday_only" className="w-full p-2 text-xs border border-gray-200 bg-white rounded-lg font-bold">
                                            <option value="true">Restrict to Today & Yesterday</option>
                                            <option value="false">Allow Full History</option>
                                        </select>
                                    </div>
                                    <div>
                                        <button type="submit" className="w-full py-2 bg-gray-900 text-white rounded-lg font-bold text-xs shadow hover:bg-black transition-colors">
                                            Grant Terminal Access
                                        </button>
                                    </div>
                                </form>
                            )}

                            <div className="flex-1 flex overflow-hidden divide-x divide-gray-100">
                                {/* Left half: User list */}
                                <div className="w-7/12 flex flex-col overflow-hidden">
                                    <div className="bg-gray-50/50 px-5 py-2.5 border-b border-gray-100 flex justify-between items-center text-[10px] font-black uppercase text-gray-400 tracking-wider">
                                        <span>ACTIVE TERMINAL PASSES ({staffList.length})</span>
                                        <span>PIN & RIGHTS</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-50">
                                        {staffList.map(staff => {
                                            const isEditing = editingStaffId === staff.id;
                                            return (
                                                <div key={staff.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                                                    {isEditing ? (
                                                        <div className="flex flex-1 items-end gap-3 mr-4">
                                                            <div className="flex-1">
                                                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Staff Name</label>
                                                                <input
                                                                    type="text"
                                                                    value={editingStaffName}
                                                                    onChange={(e) => setEditingStaffName(e.target.value)}
                                                                    className="w-full p-1.5 text-xs border border-gray-250 bg-white rounded-lg font-bold"
                                                                />
                                                            </div>
                                                            <div className="w-20">
                                                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">PIN</label>
                                                                <input
                                                                    type="text"
                                                                    pattern="[0-9]{4}"
                                                                    maxLength="4"
                                                                    value={editingStaffPin}
                                                                    onChange={(e) => setEditingStaffPin(e.target.value)}
                                                                    className="w-full p-1.5 text-xs border border-gray-250 bg-white rounded-lg font-mono font-bold text-center"
                                                                />
                                                            </div>
                                                            <div className="w-32">
                                                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Role</label>
                                                                <select
                                                                    value={editingStaffRole}
                                                                    onChange={(e) => setEditingStaffRole(e.target.value)}
                                                                    className="w-full p-1.5 text-xs border border-gray-250 bg-white rounded-lg font-bold"
                                                                >
                                                                    <option value="cashier">Cashier</option>
                                                                    <option value="waiter">Waiter</option>
                                                                    <option value="chef">Chef/Waste</option>
                                                                    <option value="kds">KDS Only</option>
                                                                    <option value="receiver">Receiver</option>
                                                                    <option value="expense_clerk">Expense Clerk</option>
                                                                    <option value="admin">Admin</option>
                                                                </select>
                                                            </div>
                                                            <div className="w-32">
                                                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">History View</label>
                                                                <select
                                                                    value={editingStaffTodayYesterdayOnly ? 'restrict' : 'all'}
                                                                    onChange={(e) => setEditingStaffTodayYesterdayOnly(e.target.value === 'restrict')}
                                                                    className="w-full p-1.5 text-xs border border-gray-250 bg-white rounded-lg font-bold"
                                                                >
                                                                    <option value="restrict">Restrict (Today/Yesterday)</option>
                                                                    <option value="all">Allow Full History</option>
                                                                </select>
                                                            </div>
                                                            <div className="w-24">
                                                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Status</label>
                                                                <select
                                                                    value={editingStaffActive ? 'active' : 'inactive'}
                                                                    onChange={(e) => setEditingStaffActive(e.target.value === 'active')}
                                                                    className="w-full p-1.5 text-xs border border-gray-250 bg-white rounded-lg font-bold"
                                                                >
                                                                    <option value="active">Active</option>
                                                                    <option value="inactive">Terminated</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                                                        <div>
                                                            <div className="font-bold text-sm text-gray-900 leading-tight">
                                                                {staff.name}
                                                                {staff.is_active === false && (
                                                                    <span className="ml-2 text-rose-600 text-[10px] font-black uppercase bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-md">
                                                                        Terminated
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-gray-400 font-semibold mt-0.5 uppercase tracking-wider">Created {new Date(staff.created_at).toLocaleDateString()}</div>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="flex items-center gap-4 shrink-0">
                                                        {!isEditing && (
                                                            <>
                                                                <div className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded font-black text-gray-700">PIN: {staff.pin}</div>
                                                                <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
                                                                    staff.role === 'admin' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                                                    staff.role === 'cashier' ? 'bg-orange-50 text-orange-600 border border-orange-100' :
                                                                    staff.role === 'waiter' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                                                    staff.role === 'chef' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                                                                    'bg-gray-50 text-gray-600 border border-gray-100'
                                                                }`}>
                                                                    {staff.role}
                                                                </span>
                                                            </>
                                                        )}
                                                        
                                                        {isEditing ? (
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSaveStaff(staff.id)}
                                                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-lg transition-colors shadow-sm"
                                                                >
                                                                    ✓ Save
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingStaffId(null)}
                                                                    className="px-2.5 py-1.5 bg-gray-250 hover:bg-gray-300 text-gray-700 font-black text-xs rounded-lg transition-colors"
                                                                >
                                                                    ✕ Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingStaffId(staff.id);
                                                                        setEditingStaffName(staff.name);
                                                                        setEditingStaffPin(staff.pin);
                                                                        setEditingStaffRole(staff.role || 'staff');
                                                                        setEditingStaffActive(staff.is_active !== false);
                                                                        setEditingStaffTodayYesterdayOnly(staff.today_yesterday_only !== false);
                                                                    }}
                                                                    className="text-gray-400 hover:text-gray-800 p-1"
                                                                    title="Edit Staff Member"
                                                                >
                                                                    ✏️
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteStaff(staff.id)}
                                                                    className="text-gray-300 hover:text-red-650 p-1"
                                                                    title="Delete Staff Member"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Right half: Terminal Diagnostics info */}
                                <div className="w-5/12 p-6 bg-gray-50/50 space-y-4">
                                    <h4 className="text-xs font-black uppercase text-gray-400 tracking-wider">Terminal Engine Config</h4>
                                    <div className="bg-white border border-gray-150 rounded-2xl p-4 space-y-3 shadow-sm">
                                        <div className="flex justify-between text-xs border-b border-gray-50 pb-2">
                                            <span className="text-gray-400 font-bold">SYSTEM ENGINE:</span>
                                            <span className="font-black text-gray-800">ManiPOS Suite v3.5</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-b border-gray-50 pb-2">
                                            <span className="text-gray-400 font-bold">STATION TYPE:</span>
                                            <span className="font-black text-gray-800 uppercase">Interactive POS Terminal</span>
                                        </div>
                                        <div className="flex justify-between text-xs border-b border-gray-50 pb-2">
                                            <span className="text-gray-400 font-bold">ROUTING PROTOCOL:</span>
                                            <span className="font-black text-gray-800">Dual-Printer Split (Cashier/Kitchen)</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-400 font-bold">LOCAL TIME SYNC:</span>
                                            <span className="font-bold text-emerald-600">✓ Connected</span>
                                        </div>
                                    </div>
                                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[10px] text-blue-600 leading-relaxed font-bold">
                                        ℹ Staff PIN codes grant immediate entry to specific workflows. When a cashier logs in, they are redirected to this POS terminal interface. KDS roles go straight to the kitchen order monitors.
                                    </div>
                                </div>
                        </div>
                    </div>

                    {/* QZ Tray Printer Configuration */}
                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 shrink-0">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-black text-gray-900 text-sm flex items-center gap-2">
                                    🖨️ Printer Configuration
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                        qzConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                                    }`}>
                                        {qzConnected ? '● QZ Connected' : '○ QZ Offline'}
                                    </span>
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Set exact Windows printer names for silent auto-routing via QZ Tray.</p>
                            </div>
                            <button
                                onClick={handleDetectPrinters}
                                disabled={loadingPrinters || !qzConnected}
                                className="px-3 py-1.5 bg-gray-900 text-white font-bold text-[10px] rounded-xl hover:bg-black transition-colors disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                            >
                                {loadingPrinters ? '⏳ Scanning...' : '🔍 Detect Printers'}
                            </button>
                        </div>

                        {qzError && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-[10px] text-red-600 font-bold">
                                ⚠️ {qzError}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">🖨️ Front Desk Printer Name</label>
                                <input
                                    type="text"
                                    value={frontDeskPrinter}
                                    onChange={(e) => setFrontDeskPrinter(e.target.value)}
                                    placeholder="e.g. POS80 Printer(3)"
                                    list="printer-list"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-primary"
                                />
                                <p className="text-[9px] text-gray-400 font-bold mt-1">Customer copy + Packer + Record Copy</p>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">🍳 Kitchen / Chef Printer Name</label>
                                <input
                                    type="text"
                                    value={kitchenPrinter}
                                    onChange={(e) => setKitchenPrinter(e.target.value)}
                                    placeholder="e.g. kitchen"
                                    list="printer-list"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-primary"
                                />
                                <p className="text-[9px] text-gray-400 font-bold mt-1">Kitchen Order Ticket (KOT) only</p>
                            </div>
                        </div>

                        {/* Detected printers dropdown list */}
                        <datalist id="printer-list">
                            {qzPrinterList.map(p => <option key={p} value={p} />)}
                        </datalist>

                        {qzPrinterList.length > 0 && (
                            <div className="mt-4">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Detected Printers on this PC ({qzPrinterList.length})</p>
                                <div className="flex flex-wrap gap-2">
                                    {qzPrinterList.map(p => (
                                        <button
                                            key={p}
                                            onClick={() => {
                                                if (!frontDeskPrinter) setFrontDeskPrinter(p);
                                                else setKitchenPrinter(p);
                                            }}
                                            className="px-2.5 py-1 bg-gray-100 hover:bg-primary hover:text-secondary rounded-lg text-[10px] font-bold text-gray-700 transition-colors border border-gray-200"
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[9px] text-gray-400 font-bold mt-1.5">Click a printer to assign it. First click = Front Desk, second = Kitchen.</p>
                            </div>
                        )}

                        {(!frontDeskPrinter && !kitchenPrinter) && (
                            <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-[10px] text-amber-700 font-bold">
                                ℹ️ No printers configured yet. Click <strong>Detect Printers</strong> to auto-discover, or type the exact Windows printer name above. Names are saved automatically.
                            </div>
                        )}
                    </div>
                </div>
                )}

                {/* Right Panel: Shopping Cart / Order Panel */}
                {cartOpen && (
                    <>
                        {/* Right Panel Drawer — bottom sheet on mobile, side panel on desktop */}
                        <div className="absolute bottom-0 sm:top-0 right-0 h-[72%] sm:h-full w-full sm:w-[440px] bg-white border-t sm:border-t-0 sm:border-l border-gray-100 flex flex-col overflow-hidden shrink-0 shadow-2xl z-50 animate-in slide-in-from-bottom sm:slide-in-from-right duration-250 rounded-t-3xl sm:rounded-none">
                            <div className="px-4 py-3 border-b border-gray-50 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCartOpen(false)}
                                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors mr-0.5"
                                        title="Close Cart"
                                    >
                                        <X size={16} />
                                    </button>
                                    <h2 className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                                        <ShoppingBag size={16} className="text-primary" /> Active Cart
                                    </h2>
                                </div>
                        <div className="flex gap-1.5 items-center shrink-0">
                            {editingOrderId && (
                                <button
                                    onClick={openClearSalesModal}
                                    className="text-[9px] text-red-600 hover:text-red-800 font-black uppercase tracking-wider px-2 py-1 hover:bg-red-50 rounded-lg transition-all"
                                    title="Cancel/Void Order"
                                >
                                    Void Order
                                </button>
                            )}
                            {cart.length > 0 && (
                                <>
                                    <button
                                        onClick={() => openSplitBillForCart()}
                                        className="text-[9px] text-primary hover:text-primary-dark font-black uppercase tracking-wider px-2 py-1 hover:bg-orange-50 rounded-lg transition-all"
                                    >
                                        Split Bill
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCart([]);
                                            setEditingOrderId(null);
                                            setCustomerName('');
                                        }}
                                        className="text-[9px] text-gray-400 hover:text-red-500 font-black uppercase tracking-wider px-2 py-1 hover:bg-gray-50 rounded-lg transition-all"
                                    >
                                        Clear Cart
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Cart Items list */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 custom-scrollbar">
                        {cart.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-6">
                                <span className="text-3xl mb-1">🛒</span>
                                <p className="text-xs font-bold">Cart is empty</p>
                                <p className="text-[10px] text-gray-400 mt-1 max-w-[200px]">Select items from the left grid to populate the checkout cart.</p>
                            </div>
                        ) : (
                            cart.map(item => (
                                <div key={item.id} className="p-2.5 bg-gray-50/70 border border-gray-100 rounded-xl flex flex-col gap-1.5 hover:bg-gray-100/50 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <div className="max-w-[240px]">
                                            <h4 className="font-bold text-xs text-gray-900 leading-tight">{item.name}</h4>
                                            <span className="text-[10px] font-mono text-gray-400 font-bold">KES {item.price.toLocaleString()} each</span>
                                        </div>
                                        <span className="font-mono font-black text-xs text-gray-900">
                                            KES {(item.price * item.quantity).toLocaleString()}
                                        </span>
                                    </div>

                                    {/* Selected modifiers display chips */}
                                    {item.instructions && (
                                        <div className="flex flex-wrap gap-1">
                                            {item.instructions.split(', ').filter(Boolean).map((mod, idx) => (
                                                <span key={idx} className="bg-primary/10 text-primary text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                    {mod}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Modifier toggle button */}
                                    <button
                                        onClick={() => setCart(prev => prev.map(c => c.id === item.id ? { ...c, _showMods: !c._showMods } : c))}
                                        className="text-[9px] text-primary font-bold uppercase tracking-wider text-left flex items-center gap-1"
                                    >
                                        {item._showMods ? '▲ Hide Modifiers' : '▼ Add Modifiers / Customise'}
                                    </button>

                                    {/* Inline Modifiers Panel */}
                                    {item._showMods && (
                                        <div className="space-y-2 pt-2 border-t border-gray-200/60">
                                            {getItemModifierGroups(item).map(group => (
                                                <div key={group.group} className="space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{group.group}</p>
                                                        <span className="text-[8px] font-bold text-gray-400">
                                                            {group.is_required ? 'Req' : 'Opt'} (Max: {group.max_selected})
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {group.options.map(opt => {
                                                            const isSelected = (item.selectedModifiers || []).some(m => m.group === group.group && m.name === opt.name);
                                                            return (
                                                                <button
                                                                    key={opt.name}
                                                                    onClick={() => toggleCartModifier(item.id, group.group, opt)}
                                                                    className={`px-2 py-0.5 rounded-full text-[8px] font-bold border transition-all ${
                                                                        isSelected
                                                                            ? 'bg-primary text-secondary border-primary shadow-sm'
                                                                            : 'bg-white text-gray-500 border-gray-200 hover:border-primary/40'
                                                                    }`}
                                                                >
                                                                    {opt.name} {opt.price > 0 ? `(+${Math.round(opt.price)})` : ''}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Controls: Delete + Qty stepper + Guest chip */}
                                    <div className="flex justify-between items-center mt-0.5 border-t border-gray-200/50 pt-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 p-1 rounded transition-colors">
                                                <Trash2 size={12} />
                                            </button>
                                            {/* Guest assignment chip — only visible when split bill mode active */}
                                            {splitBillCount > 1 && (
                                                <button
                                                    onClick={() => setCart(prev => prev.map(c =>
                                                        c.id === item.id
                                                            ? { ...c, guestNo: ((c.guestNo || 1) % splitBillCount) + 1 }
                                                            : c
                                                    ))}
                                                    className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border transition-all bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                                                    title="Tap to reassign to next guest"
                                                >
                                                    G{item.guestNo || 1}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <button onClick={() => updateQty(item.id, -1)} className="w-5 h-5 rounded-md border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                                                <Minus size={10} />
                                            </button>
                                            <span className="font-bold text-xs text-gray-800">{item.quantity}</span>
                                            <button onClick={() => addToCart(item)} className="w-5 h-5 rounded-md border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">
                                                <Plus size={10} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Order Details & Checkout Configuration */}
                    <div className="border-t border-gray-100 p-2.5 bg-gray-50/50 space-y-2 shrink-0">
                        {/* New vs Returning Customer Classification Toggle */}
                        <div className="p-1.5 bg-white border border-gray-200/80 rounded-2xl shadow-xs space-y-1">
                            <div className="flex justify-between items-center px-1">
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Customer Status Tag *</label>
                                <span className="text-[8px] font-bold text-gray-400">1-Click Tag</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setCustomerType('New')}
                                    className={`py-1.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 border cursor-pointer ${
                                        customerType === 'New'
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm scale-[1.01]'
                                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                    }`}
                                >
                                    <span>✨ New Customer</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCustomerType('Returning')}
                                    className={`py-1.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 border cursor-pointer ${
                                        customerType === 'Returning'
                                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm scale-[1.01]'
                                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                    }`}
                                >
                                    <span>🔄 Returning</span>
                                </button>
                            </div>
                        </div>

                        {/* Guest Name input + Register New Guest button */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Customer / Guest Name</label>
                                <button
                                    onClick={() => setShowRegisterGuestModal(true)}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-[#18A07A] text-white rounded-full text-[10px] font-black uppercase hover:bg-[#128061] active:scale-95 transition-all shadow-sm"
                                    title="Register New Guest to CRM"
                                >
                                    <UserPlus size={11} /> New Customer
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="Enter customer name..."
                                value={customerNameText}
                                onChange={(e) => setCustomerNameText(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-[12px] font-bold outline-none focus:border-[#18A07A] focus:ring-2 focus:ring-[#18A07A]/10 transition-all text-gray-900 shadow-sm"
                            />
                        </div>
                        {guestSuccessMsg && (
                            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 text-[11px] font-bold rounded-xl flex items-center gap-2">
                                ✅ {guestSuccessMsg}
                            </div>
                        )}

                        {/* Force Table Selection Dropdown if Dine-in is selected */}
                        {(diningOption === 'Dine-in' || diningOption === 'Dine Inn') && (
                            <div className="flex gap-2 items-center bg-white border border-gray-250/60 p-2 rounded-2xl shadow-sm">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest shrink-0">Select Table *:</label>
                                <select
                                    value={selectedTable}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSelectedTable(val);
                                        setCustomerName(val); // Sync to customerName state
                                    }}
                                    className="flex-1 bg-gray-50/50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-[11px] font-black outline-none focus:border-primary focus:bg-white transition-all text-gray-900"
                                >
                                    <option value="">-- Select Table --</option>
                                    {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Collapsible settings toggle bar */}
                        <button 
                            type="button"
                            onClick={() => setShowCartConfig(!showCartConfig)}
                            className="w-full flex justify-between items-center py-1.5 px-2.5 bg-white hover:bg-gray-100 border border-gray-200 text-[11px] font-black text-gray-700 transition-all rounded-xl shadow-sm"
                        >
                            <span className="flex items-center gap-1.5 truncate">
                                ⚙️ {selectedBrand.split(' ')[0]} • {orderChannel} • {diningOption}
                            </span>
                            <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider shrink-0 ml-2">
                                {showCartConfig ? '▲ Hide Settings' : '▼ Expand Settings'}
                            </span>
                        </button>

                        {showCartConfig && (
                            <div className="space-y-2 animate-in slide-in-from-top-2 duration-150">
                                {/* Brand Selection (Customer input is moved to be always visible) */}
                                <div className="grid grid-cols-1">
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Brand</label>
                                        <select
                                            value={selectedBrand}
                                            onChange={(e) => setSelectedBrand(e.target.value)}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1 text-[10px] font-bold outline-none focus:border-primary"
                                        >
                                            <option value="POT OF JOLLOF">POT OF JOLLOF</option>
                                            <option value="LITTLE LAGOS">LITTLE LAGOS</option>
                                            <option value="CAFE SWAHILI">CAFE SWAHILI</option>
                                            <option value="SAMAKI STREET">SAMAKI STREET</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Channel & Service Model */}
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Order Channel</label>
                                        <select
                                            value={orderChannel}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setOrderChannel(val);
                                                if (['Uber Eats', 'Glovo', 'Bolt Food', 'Ando'].includes(val)) {
                                                    setDiningOption('Delivery');
                                                }
                                            }}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1 text-[10px] font-bold outline-none focus:border-primary"
                                        >
                                            <option value="Walk-in">Walk-in</option>
                                            <option value="WhatsApp">WhatsApp</option>
                                            <option value="Uber Eats">Uber Eats</option>
                                            <option value="Glovo">Glovo</option>
                                            <option value="Bolt Food">Bolt Food</option>
                                            <option value="Ando">Ando</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Dining Option</label>
                                        <select
                                            value={diningOption}
                                            onChange={(e) => setDiningOption(e.target.value)}
                                            disabled={['Uber Eats', 'Glovo', 'Bolt Food', 'Ando'].includes(orderChannel)}
                                            className="w-full bg-white disabled:bg-gray-100 disabled:text-gray-400 border border-gray-200 rounded-xl px-2 py-1 text-[10px] font-bold outline-none focus:border-primary"
                                        >
                                            <option value="Dine-in">Dine-in</option>
                                            <option value="Takeaway">Takeaway</option>
                                            <option value="Delivery">Delivery</option>
                                        </select>
                                    </div>
                                    {diningOption === 'Delivery' && (
                                        <div className="col-span-2 pt-1">
                                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Delivery Address</label>
                                            <input
                                                type="text"
                                                placeholder="Enter full delivery address..."
                                                value={deliveryAddress}
                                                onChange={(e) => setDeliveryAddress(e.target.value)}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1 text-[10px] font-bold outline-none focus:border-primary"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Payment Method & Status */}
                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Payment Method</label>
                                        <select
                                            value={paymentMethod}
                                            onChange={(e) => setPaymentMethod(e.target.value)}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1 text-[10px] font-bold outline-none focus:border-primary"
                                        >
                                            <option value="CASH">CASH</option>
                                            <option value="CARD">CARD</option>
                                            <option value="I&M - PAYBILL No">I&M - PAYBILL No</option>
                                            {['ubereats', 'uber eats', 'glovo', 'bolt food', 'ando'].includes(String(orderChannel || '').toLowerCase()) && (
                                                <option value="Paid to APP">Paid to APP</option>
                                            )}
                                            <option value="ANDO">ANDO</option>
                                            <option value="Split">Split Payment</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Payment Status</label>
                                        <select
                                            value={paymentStatus}
                                            onChange={(e) => setPaymentStatus(e.target.value)}
                                            className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1 text-[10px] font-bold outline-none focus:border-primary"
                                        >
                                            <option value="Paid">Paid</option>
                                            <option value="Pending">Pay Later (Pending)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Discount Picker */}
                                <div className="grid grid-cols-3 gap-2 items-end">
                                    <div className="col-span-2">
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Discount Mode</label>
                                        <div className="flex gap-1.5">
                                            {['none', 'percentage', 'flat'].map(type => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => { setDiscountType(type); setDiscountValue(''); }}
                                                    className={`flex-1 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-wider border transition-all ${
                                                        discountType === type
                                                            ? 'bg-gray-900 border-gray-900 text-white shadow-sm'
                                                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        {discountType !== 'none' && (
                                            <input
                                                type="number"
                                                placeholder={discountType === 'percentage' ? '%' : 'KES'}
                                                value={discountValue}
                                                onChange={(e) => setDiscountValue(e.target.value)}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-1.5 py-0.5 text-[10px] text-center font-black outline-none focus:border-primary font-mono"
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Custom Order Date (Backdate) */}
                                <div className="pt-1.5 border-t border-gray-100">
                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Order Date (Backdate)</label>
                                    <input
                                        type="date"
                                        value={customOrderDate}
                                        onChange={(e) => setCustomOrderDate(e.target.value)}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-2 py-1 text-[10px] font-bold outline-none focus:border-primary text-gray-700 font-sans"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Split Details Input Box */}
                        {paymentMethod === 'Split' && (
                            <div className="p-2.5 bg-orange-50/50 border border-orange-100 rounded-2xl space-y-1.5 animate-in slide-in-from-bottom-2 duration-200">
                                <span className="text-[9px] font-bold text-orange-700 flex items-center gap-1"><CreditCard size={10}/> Split Payments Breakdown:</span>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Cash</label>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            value={splitCash}
                                            onChange={(e) => setSplitCash(e.target.value)}
                                            className="w-full p-1 border border-gray-200 bg-white rounded-lg text-xs font-mono font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">M-Pesa</label>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            value={splitMpesa}
                                            onChange={(e) => setSplitMpesa(e.target.value)}
                                            className="w-full p-1 border border-gray-200 bg-white rounded-lg text-xs font-mono font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[7px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Card</label>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            value={splitCard}
                                            onChange={(e) => setSplitCard(e.target.value)}
                                            className="w-full p-1 border border-gray-200 bg-white rounded-lg text-xs font-mono font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-between items-center text-[9px] font-bold border-t border-orange-200/50 pt-1 mt-0.5">
                                    <span className="text-gray-500">Split Total: KES {splitTotal.toLocaleString()}</span>
                                    <span className={Math.abs(splitTotal - total) < 0.1 ? 'text-green-600' : 'text-red-500'}>
                                        {Math.abs(splitTotal - total) < 0.1 ? '✓ Balanced' : `Diff: KES ${(total - splitTotal).toLocaleString()}`}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Calculation Summary */}
                        <div className="border-t border-gray-200/60 pt-2 space-y-1 text-[11px] font-medium text-gray-500">
                            <div className="flex justify-between">
                                <span>Subtotal:</span>
                                <span className="font-mono font-bold text-gray-700">KES {subtotal.toLocaleString()}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-red-500 font-bold">
                                    <span>Discount Applied:</span>
                                    <span className="font-mono">- KES {discountAmount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-[9px] text-gray-400">
                                <span>Included Tax (VAT 16%):</span>
                                <span className="font-mono">KES {vatAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            {cateringLevyAmount > 0 && (
                                <div className="flex justify-between text-[9px] text-gray-400">
                                    <span>Catering Levy (2%):</span>
                                    <span className="font-mono">KES {cateringLevyAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-gray-900 font-black text-sm border-t border-gray-200/60 pt-1.5">
                                <span>Grand Total:</span>
                                <span className="font-mono">KES {total.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Order Placement Action Buttons */}
                        <button
                            type="button"
                            onClick={handleCheckout}
                            disabled={submitting || cart.length === 0 || (paymentMethod === 'Split' && !isSplitValid)}
                            className="w-full py-2.5 bg-gray-900 text-white rounded-xl font-bold shadow-lg hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-xs animate-in fade-in"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />}
                            Send Order & Print Receipt — KES {total.toLocaleString()}
                        </button>
                        
                        {editingOrderId && paymentStatus === 'Paid' && (
                            <button
                                type="button"
                                onClick={() => handleVacateTable(editingOrderId)}
                                className="w-full mt-2 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow transition-all flex items-center justify-center gap-2 text-xs animate-in slide-in-from-bottom-2 duration-150"
                            >
                                🚪 Vacate Table / Complete Bill
                            </button>
                        )}
                        
                        {editingOrderId && paymentStatus === 'Pending' && (
                            <button
                                type="button"
                                onClick={() => {
                                    const activeOrderObj = openOrders.find(o => o.id === editingOrderId);
                                    if (activeOrderObj) handleOpenClearModal(activeOrderObj);
                                }}
                                className="w-full mt-2 py-2 bg-emerald-650 hover:bg-emerald-700 text-white rounded-xl font-bold shadow transition-all flex items-center justify-center gap-2 text-xs animate-in slide-in-from-bottom-2 duration-150"
                            >
                                💵 Clear Pending Bill / Close Table
                            </button>
                        )}
                    </div>
                </div>
                    </>
                )}
            </div>

            {/* Thermal Print Receipt Dialog */}
            <AnimatePresence>
                {activeReceipt && (
                    <ReceiptPrintModal 
                        receipt={activeReceipt} 
                        frontDeskPrinter={frontDeskPrinter}
                        kitchenPrinter={kitchenPrinter}
                        onClose={() => {
                            setActiveReceipt(null);
                            setActiveView('menu');
                            setCart([]);
                            setEditingOrderId(null);
                        }} 
                        onCloseAndExit={() => {
                            setActiveReceipt(null);
                            onSignOut();
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Closing Shift Modal */}
            <AnimatePresence>
                {closingModalOpen && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-gray-100 flex flex-col gap-4 text-secondary max-h-[90vh] overflow-y-auto custom-scrollbar"
                        >
                            <div className="text-center space-y-1">
                                <h3 className="font-black text-lg text-gray-900">Close Cash Register Shift</h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5 leading-relaxed">Key in physical drawer counts for today's end-of-day close</p>
                            </div>

                            {/* End of Day Shift Summary Report Header */}
                            <div className="bg-gray-900 text-white p-4 rounded-2xl border border-gray-800 space-y-3 shadow-inner">
                                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1">
                                        📋 Today's Shift Report
                                    </span>
                                    <span className="text-[9px] bg-gray-800 text-gray-300 font-mono px-2.5 py-1 rounded-lg font-bold">{activeShift?.shift_code || 'Active Shift'}</span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 text-left">
                                    <div>
                                        <span className="text-[8px] font-bold text-gray-400 uppercase block">Today's Sales</span>
                                        <span className="text-base font-mono font-black text-emerald-400">KES {shiftSummary.totalSales.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-[8px] font-bold text-gray-400 uppercase block">Orders Count</span>
                                        <span className="text-base font-mono font-black text-white">{shiftSummary.totalOrders} Orders</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left pt-1 border-t border-gray-800">
                                    <div className="bg-gray-800/60 p-2 rounded-xl border border-gray-700/50">
                                        <span className="text-[7px] font-bold text-gray-400 uppercase block">💵 Cash Sales</span>
                                        <span className="text-xs font-mono font-bold text-emerald-300">KES {shiftSummary.cashSales.toLocaleString()}</span>
                                    </div>
                                    <div className="bg-gray-800/60 p-2 rounded-xl border border-gray-700/50">
                                        <span className="text-[7px] font-bold text-gray-400 uppercase block">💳 Card Sales</span>
                                        <span className="text-xs font-mono font-bold text-blue-300">KES {shiftSummary.cardSales.toLocaleString()}</span>
                                    </div>
                                    <div className="bg-gray-800/60 p-2 rounded-xl border border-gray-700/50">
                                        <span className="text-[7px] font-bold text-gray-400 uppercase block">🏦 I&M Paybill</span>
                                        <span className="text-xs font-mono font-bold text-amber-300">KES {shiftSummary.imPaybillSales.toLocaleString()}</span>
                                    </div>
                                    <div className="bg-gray-800/60 p-2 rounded-xl border border-gray-700/50">
                                        <span className="text-[7px] font-bold text-gray-400 uppercase block">🛵 Apps</span>
                                        <span className="text-xs font-mono font-bold text-purple-300">KES {shiftSummary.appSales.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Physical Count Form Section */}
                            {(() => {
                                const floatVal = parseFloat(activeShift?.opening_float || 0);
                                const expectedCashTill = floatVal + shiftSummary.cashSales;
                                const countedCash = closingCashInput !== '' ? (parseFloat(closingCashInput) || 0) : expectedCashTill;
                                const cashVariance = countedCash - expectedCashTill;

                                const expectedCard = shiftSummary.cardSales;
                                const countedCard = closingCardInput !== '' ? (parseFloat(closingCardInput) || 0) : expectedCard;
                                const cardVariance = countedCard - expectedCard;

                                return (
                                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200/80 space-y-3 text-left">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[10px] font-black text-gray-900 uppercase tracking-wider">
                                                Enter Physical End-of-Day Counts
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setClosingCashInput(String(expectedCashTill));
                                                    setClosingCardInput(String(expectedCard));
                                                }}
                                                className="text-[9px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
                                            >
                                                Auto-Fill Expected
                                            </button>
                                        </div>

                                        {/* Cash Count Input */}
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                                                    💵 Physical Cash in Till (KES)
                                                </span>
                                                <span className="text-[9px] font-mono text-gray-400">
                                                    Float ({floatVal}) + Cash Sales ({shiftSummary.cashSales}) = <strong className="text-gray-700">KES {expectedCashTill.toLocaleString()}</strong>
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                step="1"
                                                placeholder={`Expected KES ${expectedCashTill.toLocaleString()}`}
                                                value={closingCashInput}
                                                onChange={e => setClosingCashInput(e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-mono font-black text-sm text-gray-900 focus:bg-white focus:border-emerald-500 outline-none transition-colors"
                                            />
                                            <div className="flex justify-between items-center text-[10px] pt-0.5">
                                                <span className="font-medium text-gray-500">Cash Discrepancy:</span>
                                                {cashVariance === 0 ? (
                                                    <span className="font-mono font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">✅ Balanced (KES 0)</span>
                                                ) : cashVariance < 0 ? (
                                                    <span className="font-mono font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded">⚠️ Shortage (-KES {Math.abs(cashVariance).toLocaleString()})</span>
                                                ) : (
                                                    <span className="font-mono font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded">➕ Overage (+KES {cashVariance.toLocaleString()})</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Card Count Input */}
                                        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                                                    💳 Physical Card Slips Total (KES)
                                                </span>
                                                <span className="text-[9px] font-mono text-gray-400">
                                                    Expected: <strong className="text-gray-700">KES {expectedCard.toLocaleString()}</strong>
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                step="1"
                                                placeholder={`Expected KES ${expectedCard.toLocaleString()}`}
                                                value={closingCardInput}
                                                onChange={e => setClosingCardInput(e.target.value)}
                                                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl font-mono font-black text-sm text-gray-900 focus:bg-white focus:border-blue-500 outline-none transition-colors"
                                            />
                                            <div className="flex justify-between items-center text-[10px] pt-0.5">
                                                <span className="font-medium text-gray-500">Card Discrepancy:</span>
                                                {cardVariance === 0 ? (
                                                    <span className="font-mono font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">✅ Balanced (KES 0)</span>
                                                ) : cardVariance < 0 ? (
                                                    <span className="font-mono font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded">⚠️ Shortage (-KES {Math.abs(cardVariance).toLocaleString()})</span>
                                                ) : (
                                                    <span className="font-mono font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded">➕ Overage (+KES {cardVariance.toLocaleString()})</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 🚫 Switched Off / Out-of-Stock Items Report (Today) */}
                                        {(() => {
                                            const todayDate = new Date().toISOString().split('T')[0];
                                            const switchedOffToday = switchedOffLog.filter(l => l.date === todayDate);
                                            return (
                                                <div className="bg-rose-50/60 p-3 rounded-2xl border border-rose-200/80 space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs font-black text-rose-950 uppercase tracking-wider flex items-center gap-1">
                                                            🚫 Switched Off Items Today ({switchedOffToday.length})
                                                        </span>
                                                        <span className="text-[9px] font-bold text-rose-700 uppercase">POS 86'd Report</span>
                                                    </div>
                                                    {switchedOffToday.length === 0 ? (
                                                        <p className="text-[10px] text-emerald-700 font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200/60">✅ No menu items were switched off today.</p>
                                                    ) : (
                                                        <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                                                            {switchedOffToday.map((log, idx) => (
                                                                <div key={idx} className="flex justify-between items-center text-[10px] bg-white p-2 rounded-xl border border-rose-100 shadow-2xs">
                                                                    <div>
                                                                        <span className="font-black text-gray-900 block">{log.name}</span>
                                                                        <span className="text-[8.5px] text-gray-500 font-bold">Category: {log.category} · By: {log.staffName || 'Staff'} at {log.turned_off_at}</span>
                                                                    </div>
                                                                    <span className={`px-2 py-0.5 rounded-full font-black uppercase text-[8px] ${
                                                                        log.type === 'day' ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-rose-100 text-rose-900 border border-rose-200'
                                                                    }`}>
                                                                        {log.type === 'day' ? 'Rest of Day' : 'Indefinite'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })()}

                            <div className="flex gap-2.5 mt-1">
                                <button
                                    onClick={handleCloseShift}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl transition-all shadow-md uppercase tracking-wider"
                                >
                                    Submit & Lock EOD Shift
                                </button>
                                <button
                                    onClick={() => {
                                        setClosingModalOpen(false);
                                        setClosingCashInput('');
                                        setClosingCardInput('');
                                    }}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl border border-gray-200 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Clear Unpaid Sales Modal */}
            <AnimatePresence>
                {clearSalesModalOpen && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-100 flex flex-col gap-4 text-secondary"
                        >
                            <div className="text-center space-y-1">
                                <h3 className="font-black text-lg text-gray-900">Clear Unpaid Order</h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Select spreadsheet details to clear this sale</p>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Clear Action (Reason)</label>
                                    <select
                                        value={clearAction}
                                        onChange={(e) => setClearAction(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="Cancelled">Cancelled (Canceled)</option>
                                        <option value="Declined">Declined</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Brand</label>
                                    <select
                                        value={clearBrand}
                                        onChange={(e) => setClearBrand(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="POT OF JOLLOF">POT OF JOLLOF</option>
                                        <option value="LITTLE LAGOS">LITTLE LAGOS</option>
                                        <option value="CAFE SWAHILI">CAFE SWAHILI</option>
                                        <option value="SAMAKI STREET">SAMAKI STREET</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Order Channel</label>
                                    <select
                                        value={clearChannel}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setClearChannel(val);
                                            if (['Uber Eats', 'Glovo', 'Bolt Food', 'Ando'].includes(val)) {
                                                setClearService('Delivery');
                                            }
                                        }}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="Walk-in">Walk-in</option>
                                        <option value="WhatsApp">WhatsApp</option>
                                        <option value="Uber Eats">Uber Eats</option>
                                        <option value="Glovo">Glovo</option>
                                        <option value="Bolt Food">Bolt Food</option>
                                        <option value="Ando">Ando</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Service Model</label>
                                    <select
                                        value={clearService}
                                        onChange={(e) => setClearService(e.target.value)}
                                        disabled={['Uber Eats', 'Glovo', 'Bolt Food', 'Ando'].includes(clearChannel)}
                                        className="w-full bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="Dine-in">Dine-in</option>
                                        <option value="Takeaway">Takeaway</option>
                                        <option value="Delivery">Delivery</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Payment Method</label>
                                    <select
                                        value={clearPayment}
                                        onChange={(e) => setClearPayment(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="CASH">CASH</option>
                                        <option value="CARD">CARD</option>
                                        <option value="I&M - PAYBILL No">I&M - PAYBILL No</option>
                                        {['ubereats', 'uber eats', 'glovo', 'bolt food', 'ando'].includes(String(clearChannel || '').toLowerCase()) && (
                                            <option value="Paid to APP">Paid to APP</option>
                                        )}
                                        <option value="ANDO">ANDO</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-2.5 mt-4">
                                <button
                                    onClick={handleVoidOrderSubmit}
                                    className="flex-1 py-2.5 bg-red-650 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-md"
                                >
                                    Confirm Clear Sale
                                </button>
                                <button
                                    onClick={() => setClearSalesModalOpen(false)}
                                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl border border-gray-200 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Clickable Past Order Details Modal */}
            <AnimatePresence>
                {viewingOrderDetails && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-100 flex flex-col gap-4 text-secondary max-h-[90vh] overflow-y-auto custom-scrollbar"
                        >
                            <div className="flex justify-between items-center border-b border-gray-150 pb-3 shrink-0">
                                <div>
                                    <h3 className="font-black text-md text-gray-900 flex items-center gap-1.5">
                                        Order Details 
                                        <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded text-xs">
                                            #{obfuscateTicket(viewingOrderDetails.ticket_number)}
                                        </span>
                                    </h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                        Opened {new Date(viewingOrderDetails.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setViewingOrderDetails(null)}
                                    className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Compact Order Info Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs shrink-0 bg-gray-50/80 p-3 rounded-2xl border border-gray-100">
                                <div>
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Customer / Table</span>
                                    <span className="font-bold text-gray-900 truncate block">{viewingOrderDetails.customer_name}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Brand</span>
                                    <span className="font-bold text-gray-900 truncate block">{viewingOrderDetails.brand || 'POT OF JOLLOF'}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Payment Status</span>
                                    <span className="font-bold text-xs flex items-center gap-1 mt-0.5">
                                        <span className={`w-2 h-2 rounded-full ${
                                            viewingOrderDetails.payment_status === 'Paid' ? 'bg-emerald-500' :
                                            viewingOrderDetails.payment_status === 'Voided' ? 'bg-red-500' :
                                            'bg-orange-500 animate-pulse'
                                        }`} />
                                        <span className="capitalize">{viewingOrderDetails.payment_status}</span>
                                    </span>
                                </div>

                                {/* PAYMENT METHOD SECTION & BUTTON */}
                                <div className="sm:col-span-3 bg-white p-2.5 rounded-xl border border-gray-200/80 space-y-1 shadow-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Payment Method</span>
                                        {((Date.now() - new Date(viewingOrderDetails.created_at).getTime()) <= 24 * 60 * 60 * 1000) && (
                                            <button
                                                onClick={() => setIsChangingPaymentMethod(!isChangingPaymentMethod)}
                                                className="text-[9px] bg-amber-500 hover:bg-amber-600 text-white font-black px-2 py-0.5 rounded-md transition-all shadow-sm"
                                            >
                                                {isChangingPaymentMethod ? 'Cancel' : '✏️ Change Payment'}
                                            </button>
                                        )}
                                    </div>
                                    <span className="font-bold text-gray-900 block text-xs">{viewingOrderDetails.payment_method}</span>

                                    {isChangingPaymentMethod && (
                                        <div className="pt-2 border-t border-amber-200/80 space-y-1.5 mt-1">
                                            <span className="text-[8px] font-black text-gray-500 uppercase block">Select Correct Payment Method:</span>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                                <button
                                                    onClick={() => handleReClearPaymentMethod(viewingOrderDetails.id, 'Cash')}
                                                    className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    💵 Cash
                                                </button>
                                                <button
                                                    onClick={() => handleReClearPaymentMethod(viewingOrderDetails.id, 'Card')}
                                                    className="py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    💳 Card
                                                </button>
                                                <button
                                                    onClick={() => handleReClearPaymentMethod(viewingOrderDetails.id, 'I&M Paybill')}
                                                    className="py-1.5 px-2 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    🏦 I&M Paybill
                                                </button>
                                                <button
                                                    onClick={() => handleReClearPaymentMethod(viewingOrderDetails.id, 'Paid to APP')}
                                                    className="py-1.5 px-2 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    🛵 Paid to APP
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* SALE CHANNEL & SERVICE SECTION & BUTTON */}
                                <div className="sm:col-span-3 bg-white p-2.5 rounded-xl border border-gray-200/80 space-y-1 shadow-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Channel & Service</span>
                                        {((Date.now() - new Date(viewingOrderDetails.created_at).getTime()) <= 24 * 60 * 60 * 1000) && (
                                            <button
                                                onClick={() => setIsChangingOrderChannel(!isChangingOrderChannel)}
                                                className="text-[9px] bg-purple-600 hover:bg-purple-700 text-white font-black px-2 py-0.5 rounded-md transition-all shadow-sm"
                                            >
                                                {isChangingOrderChannel ? 'Cancel' : '✏️ Change Channel'}
                                            </button>
                                        )}
                                    </div>
                                    <span className="font-bold text-gray-900 block text-xs">{viewingOrderDetails.order_channel || 'Walk-in'} ({viewingOrderDetails.dining_option})</span>

                                    {isChangingOrderChannel && (
                                        <div className="pt-2 border-t border-purple-200/80 space-y-1.5 mt-1">
                                            <span className="text-[8px] font-black text-gray-500 uppercase block">Re-clear Sale Channel (Up to 24 hrs):</span>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                                <button
                                                    onClick={() => handleReClearOrderChannel(viewingOrderDetails.id, 'Walk-in')}
                                                    className="py-1.5 px-2 bg-gray-800 hover:bg-black text-white text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    🚶 Walk-in
                                                </button>
                                                <button
                                                    onClick={() => handleReClearOrderChannel(viewingOrderDetails.id, 'WhatsApp')}
                                                    className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    💬 WhatsApp
                                                </button>
                                                <button
                                                    onClick={() => handleReClearOrderChannel(viewingOrderDetails.id, 'Uber Eats')}
                                                    className="py-1.5 px-2 bg-black hover:bg-gray-900 text-emerald-400 text-[10px] font-bold rounded-lg transition-all border border-emerald-500/30"
                                                >
                                                    🛵 Uber Eats
                                                </button>
                                                <button
                                                    onClick={() => handleReClearOrderChannel(viewingOrderDetails.id, 'Glovo')}
                                                    className="py-1.5 px-2 bg-amber-400 hover:bg-amber-500 text-amber-950 text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    🟡 Glovo
                                                </button>
                                                <button
                                                    onClick={() => handleReClearOrderChannel(viewingOrderDetails.id, 'Bolt Food')}
                                                    className="py-1.5 px-2 bg-teal-600 hover:bg-teal-700 text-white text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    ⚡ Bolt Food
                                                </button>
                                                <button
                                                    onClick={() => handleReClearOrderChannel(viewingOrderDetails.id, 'Ando')}
                                                    className="py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg transition-all"
                                                >
                                                    🔴 Ando
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>



                            {/* Order Items list */}
                            <div className="flex-1 min-h-[160px] max-h-[300px] overflow-y-auto custom-scrollbar border border-gray-200 rounded-2xl p-3.5 bg-white space-y-2.5 shadow-inner">
                                <div className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-2 pb-1 border-b border-gray-100 flex justify-between items-center">
                                    <span>Ordered Items ({viewingOrderDetails.items?.length || 0})</span>
                                    <span className="text-[9px] text-gray-400 font-medium">Itemized Receipt Preview</span>
                                </div>
                                {viewingOrderDetails.items && viewingOrderDetails.items.length > 0 ? (
                                    viewingOrderDetails.items.map((item, index) => {
                                        let itemPrice = parseFloat(item.price) || 0;
                                        if (item.instructions) {
                                            const matches = item.instructions.match(/\(\+(\d+)\)/g);
                                            if (matches) {
                                                const parsedMods = matches.reduce((sum, matchStr) => sum + (parseFloat(matchStr.replace(/[^\d.]/g, '')) || 0), 0);
                                                const menuItem = (menu || []).find(m => m.name === item.item_name);
                                                const baseP = menuItem ? (menuItem.price || 0) : itemPrice;
                                                if (itemPrice < (baseP + parsedMods)) {
                                                    itemPrice = baseP + parsedMods;
                                                }
                                            }
                                        }
                                        return (
                                            <div key={index} className="flex justify-between items-start text-xs border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                                <div className="space-y-0.5 pr-2">
                                                    <div className="font-bold text-gray-900">
                                                        {item.item_name} <span className="text-emerald-700 font-extrabold ml-1">x {item.quantity}</span>
                                                    </div>
                                                    {item.instructions && (
                                                        <div className="text-[10px] text-amber-700 font-semibold italic bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100/60 inline-block mt-0.5">
                                                            * {item.instructions}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="font-mono font-black text-gray-950 shrink-0 text-xs">
                                                    KES {(itemPrice * item.quantity).toLocaleString()}
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center text-xs text-gray-400 italic py-6">No items loaded.</div>
                                )}
                            </div>

                            {/* Totals & Actions */}
                            <div className="border-t border-gray-150 pt-3 space-y-3 shrink-0">
                                {viewingOrderDetails.status === 'Returned' && (
                                    <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-[11px] text-red-700 font-bold shrink-0">
                                        🔄 This sale has been returned / voided.
                                        {viewingOrderDetails.return_reason && (
                                            <div className="text-[10px] text-red-500 mt-1 font-semibold normal-case">
                                                Reason: {viewingOrderDetails.return_reason}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {(() => {
                                    const computedItemsTotal = (viewingOrderDetails.items || []).reduce((sum, item) => {
                                        let itemPrice = parseFloat(item.price) || 0;
                                        if (item.instructions) {
                                            const matches = item.instructions.match(/\(\+(\d+)\)/g);
                                            if (matches) {
                                                const parsedMods = matches.reduce((sum, matchStr) => sum + (parseFloat(matchStr.replace(/[^\d.]/g, '')) || 0), 0);
                                                const menuItem = (menu || []).find(m => m.name === item.item_name);
                                                const baseP = menuItem ? (menuItem.price || 0) : itemPrice;
                                                if (itemPrice < (baseP + parsedMods)) {
                                                    itemPrice = baseP + parsedMods;
                                                }
                                            }
                                        }
                                        return sum + (itemPrice * (parseFloat(item.quantity) || 1));
                                    }, 0);
                                    const finalComputedTotal = Math.max(0, computedItemsTotal - (viewingOrderDetails.discount || 0));

                                    return (
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between text-xs text-gray-500 font-semibold">
                                                <span>Subtotal</span>
                                                <span className="font-mono">KES {computedItemsTotal.toLocaleString()}</span>
                                            </div>
                                            {viewingOrderDetails.discount > 0 && (
                                                <div className="flex justify-between text-xs text-orange-600 font-semibold">
                                                    <span>Discount</span>
                                                    <span className="font-mono">- KES {viewingOrderDetails.discount.toLocaleString()}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-sm font-black text-gray-950">
                                                <span>Grand Total</span>
                                                <span className="font-mono text-md">KES {finalComputedTotal.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    );
                                })()}

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => {
                                            setActiveReceipt(viewingOrderDetails);
                                            setViewingOrderDetails(null);
                                        }}
                                        className="flex-1 py-2.5 bg-primary hover:bg-primary-dark text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-1"
                                    >
                                        <Printer size={13} /> Reprint
                                    </button>

                                    {(() => {
                                        const computedItemsTotal = (viewingOrderDetails.items || []).reduce((sum, item) => {
                                            let itemPrice = parseFloat(item.price) || 0;
                                            if (item.instructions) {
                                                const matches = item.instructions.match(/\(\+(\d+)\)/g);
                                                if (matches) {
                                                    const parsedMods = matches.reduce((s, m) => s + (parseFloat(m.replace(/[^\d.]/g, '')) || 0), 0);
                                                    const menuItem = (menu || []).find(mi => mi.name === item.item_name);
                                                    const baseP = menuItem ? (menuItem.price || 0) : itemPrice;
                                                    if (itemPrice < (baseP + parsedMods)) itemPrice = baseP + parsedMods;
                                                }
                                            }
                                            return sum + (itemPrice * (parseFloat(item.quantity) || 1));
                                        }, 0);
                                        const orderTotal = Math.max(0, computedItemsTotal - (viewingOrderDetails.discount || 0));
                                        return (
                                            <button
                                                onClick={() => {
                                                    openSplitBillForOrder(viewingOrderDetails, orderTotal);
                                                }}
                                                className="flex-1 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-all flex items-center justify-center gap-1"
                                            >
                                                ✂️ Split Receipt
                                            </button>
                                        );
                                    })()}

                                    {viewingOrderDetails.status !== 'Returned' && (
                                        <button
                                            onClick={() => setReturningOrderId(viewingOrderDetails.id)}
                                            className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl border border-red-200 transition-all flex items-center justify-center gap-1"
                                        >
                                            🔄 Return Sale
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setViewingOrderDetails(null)}
                                        className="py-2.5 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl border border-gray-200 transition-all"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Return Reason Selection Modal */}
            <AnimatePresence>
                {returningOrderId && (
                    <div className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-100 flex flex-col gap-4 text-secondary"
                        >
                            <div>
                                <h3 className="font-black text-md text-gray-900 flex items-center gap-1.5">
                                    🔄 Return / Void Sale
                                </h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                    Please select the reason for returning this completed order.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Select Reason *</label>
                                    <select
                                        value={returnReason}
                                        onChange={(e) => {
                                            setReturnReason(e.target.value);
                                            if (e.target.value !== 'Other') setCustomReturnReason('');
                                        }}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-primary"
                                    >
                                        <option value="">-- Choose Reason --</option>
                                        <option value="Customer cancelled order after placing">Customer cancelled order after placing</option>
                                        <option value="Items out of stock">Items out of stock</option>
                                        <option value="Wrong order / error input">Wrong order / error input</option>
                                        <option value="Other">Other (write-in custom reason)</option>
                                    </select>
                                </div>

                                {returnReason === 'Other' && (
                                    <div className="animate-in slide-in-from-top-1 duration-150">
                                        <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Write Custom Reason *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Guest changed mind, system issue..."
                                            value={customReturnReason}
                                            onChange={(e) => setCustomReturnReason(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={() => { setReturningOrderId(null); setReturnReason(''); setCustomReturnReason(''); }}
                                    className="flex-1 py-2.5 text-xs font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-150 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmReturnSale}
                                    disabled={!returnReason || (returnReason === 'Other' && !customReturnReason.trim())}
                                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Confirm Return
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ─── Mobile Bottom Navigation Bar ─── */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-stretch shadow-2xl print:hidden" style={{paddingBottom: 'env(safe-area-inset-bottom)'}}>
                <button
                    type="button"
                    onClick={() => { setActiveView('menu'); setCartOpen(false); }}
                    className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-black uppercase tracking-wider transition-all ${activeView === 'menu' ? 'text-primary bg-primary/5' : 'text-gray-400'}`}
                >
                    <span className="text-lg">🍽️</span>
                    <span>Menu</span>
                </button>
                <button
                    type="button"
                    onClick={() => { setActiveView('tables'); setCartOpen(false); }}
                    className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-black uppercase tracking-wider transition-all ${activeView === 'tables' ? 'text-primary bg-primary/5' : 'text-gray-400'}`}
                >
                    <span className="text-lg">🪑</span>
                    <span>Tables</span>
                </button>
                <button
                    type="button"
                    onClick={() => { setActiveView('history'); setCartOpen(false); }}
                    className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-black uppercase tracking-wider transition-all ${activeView === 'history' ? 'text-amber-600 bg-amber-50' : 'text-gray-400'}`}
                >
                    <span className="text-lg">📋</span>
                    <span>History</span>
                </button>
                <button
                    type="button"
                    onClick={() => setCartOpen(!cartOpen)}
                    className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-black uppercase tracking-wider transition-all relative ${cart.length > 0 ? 'text-primary bg-primary/5' : 'text-gray-400'}`}
                >
                    <span className="text-lg relative">
                        🛒
                        {cart.length > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">
                                {cart.reduce((s, i) => s + i.quantity, 0)}
                            </span>
                        )}
                    </span>
                    <span>Cart</span>
                </button>
            </nav>

            {/* Z-Report Thermal Print Preview Modal */}

            <AnimatePresence>
                {zReportData && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden print:shadow-none print:w-full print:max-w-none print:rounded-none flex flex-col max-h-[90vh] print:max-h-none text-secondary"
                        >
                            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0 print:hidden">
                                <span className="text-xs font-black uppercase text-gray-400">Shift Z-Report Preview</span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => generateZReportPDF(zReportData)}
                                        className="px-3.5 py-1.5 bg-black text-white font-bold text-xs rounded-lg shadow-sm hover:shadow flex items-center gap-1.5"
                                    >
                                        <Download size={14} /> Download PDF
                                    </button>
                                    <button 
                                        onClick={() => window.print()}
                                        className="px-3.5 py-1.5 bg-primary text-secondary font-bold text-xs rounded-lg shadow-sm hover:shadow flex items-center gap-1.5"
                                    >
                                        <Printer size={14} /> Print Report
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setZReportData(null);
                                            onSignOut();
                                        }}
                                        className="px-3.5 py-1.5 bg-white border border-gray-200 text-gray-700 font-bold text-xs rounded-lg hover:bg-gray-100"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 font-mono text-xs text-black print:overflow-visible print:p-4 select-text">
                                <div className="text-center space-y-1 mb-6">
                                    <h2 className="text-base font-black uppercase tracking-tight font-bold">Z-REPORT SUMMARY</h2>
                                    <p className="text-[10px]">P.O. Box 244-00100 Nairobi, Kenya</p>
                                    <div className="border-b border-dashed border-black pt-3"></div>
                                </div>

                                <div className="space-y-1 text-[10px] mb-4">
                                    <div className="flex justify-between">
                                        <span>SHIFT ID:</span>
                                        <span className="font-bold">{zReportData.shift.id.slice(0, 8).toUpperCase()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>CASHIER:</span>
                                        <span>{zReportData.shift.cashier_name.toUpperCase()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>OPENED:</span>
                                        <span>{new Date(zReportData.shift.opened_at).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>CLOSED:</span>
                                        <span>{new Date(zReportData.shift.closed_at).toLocaleString()}</span>
                                    </div>
                                    <div className="border-b border-dashed border-black pt-2"></div>
                                </div>

                                <div className="space-y-2 mb-4 text-[10px]">
                                    <div className="flex justify-between font-bold">
                                        <span>FINANCIAL SUMMARY</span>
                                        <span>AMOUNT (KES)</span>
                                    </div>
                                    <div className="border-b border-dashed border-black"></div>
                                    <div className="flex justify-between">
                                        <span>OPENING FLOAT:</span>
                                        <span>{parseFloat(zReportData.shift.opening_float).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>CASH SALES:</span>
                                        <span>{zReportData.cashSales.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>M-PESA SALES:</span>
                                        <span>{zReportData.mpesaSales.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>CARD SALES:</span>
                                        <span>{zReportData.cardSales.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between font-bold">
                                        <span>TOTAL SALES:</span>
                                        <span>{zReportData.totalSales.toLocaleString()}</span>
                                    </div>
                                    <div className="border-b border-dashed border-black pt-2"></div>
                                </div>

                                <div className="space-y-1 text-[10px] mb-6">
                                    <div className="flex justify-between font-bold">
                                        <span>CASH DRAWER RECONCILIATION</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>EXPECTED CASH:</span>
                                        <span>{parseFloat(zReportData.shift.expected_cash).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>ACTUAL CASH COUNTED:</span>
                                        <span>{parseFloat(zReportData.shift.actual_cash).toLocaleString()}</span>
                                    </div>
                                    <div className={`flex justify-between font-black text-[11px] pt-1.5 border-t border-dotted border-black ${
                                        (zReportData.shift.actual_cash - zReportData.shift.expected_cash) < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'
                                    }`}>
                                        <span>CASH VARIANCE:</span>
                                        <span>KES {(zReportData.shift.actual_cash - zReportData.shift.expected_cash).toLocaleString()}</span>
                                    </div>
                                    <div className="border-b border-dashed border-black pt-2"></div>
                                </div>

                                <div className="text-center space-y-1 pt-2">
                                    <p className="font-bold uppercase tracking-tight">AUDIT COMPLETE</p>
                                    <p className="text-[8px]">Powered by ManiPOS</p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Clear Pending Order Payment Modal */}
            <AnimatePresence>
                {clearingPendingOrder && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 text-secondary">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-100 flex flex-col gap-4 overflow-y-auto max-h-[90vh]"
                        >
                            <div className="text-center space-y-1">
                                <h3 className="font-black text-lg text-gray-900 text-center">Clear Pending Bill</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider text-center">Verify and adapt the final sales metadata details</p>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex justify-between items-center">
                                <div>
                                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider">Order Target</span>
                                    <h4 className="text-sm font-bold text-gray-900">#{obfuscateTicket(clearingPendingOrder.ticket_number)} • {clearingPendingOrder.customer_name}</h4>
                                </div>
                                <div className="text-right">
                                    <span className="text-[9px] text-gray-400 font-black uppercase tracking-wider">Total Due</span>
                                    <h4 className="text-sm font-mono font-black text-emerald-600">KES {clearingPendingOrder.total_amount.toLocaleString()}</h4>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Brand</label>
                                    <select
                                        value={clearingBrand}
                                        onChange={(e) => setClearingBrand(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="POT OF JOLLOF">POT OF JOLLOF</option>
                                        <option value="LITTLE LAGOS">LITTLE LAGOS</option>
                                        <option value="CAFE SWAHILI">CAFE SWAHILI</option>
                                        <option value="SAMAKI STREET">SAMAKI STREET</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Order Channel</label>
                                    <select
                                        value={clearingChannel}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setClearingChannel(val);
                                            if (['Uber Eats', 'Glovo', 'Bolt Food', 'Ando'].includes(val)) {
                                                setClearingService('Delivery');
                                            }
                                        }}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="Walk-in">Walk-in</option>
                                        <option value="WhatsApp">WhatsApp</option>
                                        <option value="Uber Eats">Uber Eats</option>
                                        <option value="Glovo">Glovo</option>
                                        <option value="Ando">Ando</option>
                                        <option value="Bolt Food">Bolt Food</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Service Model (MOS)</label>
                                    <select
                                        value={clearingService}
                                        onChange={(e) => setClearingService(e.target.value)}
                                        disabled={['Uber Eats', 'Glovo', 'Bolt Food', 'Ando'].includes(clearingChannel)}
                                        className="w-full bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="Dine-in">Dine-in</option>
                                        <option value="Takeaway">Takeaway</option>
                                        <option value="Delivery">Delivery</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Payment Method</label>
                                    <select
                                        value={clearingPaymentMethod}
                                        onChange={(e) => setClearingPaymentMethod(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                    >
                                        <option value="CASH">CASH</option>
                                        <option value="CARD">CARD</option>
                                        <option value="I&M - PAYBILL No">I&M - PAYBILL No</option>
                                        {['ubereats', 'uber eats', 'glovo', 'bolt food', 'ando'].includes(String(clearingChannel || '').toLowerCase()) && (
                                            <option value="Paid to APP">Paid to APP</option>
                                        )}
                                        <option value="ANDO">ANDO</option>
                                        <option value="Split">Split Payment</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-2.5 mt-2">
                                <button
                                    onClick={() => setClearingPendingOrder(null)}
                                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-250 text-gray-700 font-bold text-xs rounded-xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmClearPending}
                                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-lg hover:shadow"
                                >
                                    Confirm Payment
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Split Bill Modal — Two Modes: Split by Guests / Split by Payment */}
            {/* Split Bill / Split Receipt Modal */}
            <AnimatePresence>
                {splitBillModalOpen && (() => {
                    const billTotal = splitBillOrderTotal ?? total;
                    const activeOrderItems = splitBillTargetOrder
                        ? (splitBillTargetItems.length > 0 ? splitBillTargetItems : (splitBillTargetOrder.items || []).map(i => ({
                            ...i,
                            name: i.item_name || i.name,
                            price: parseFloat(i.price) || 0,
                            quantity: parseFloat(i.quantity) || 1,
                            guestNo: i.guestNo || 1
                        })))
                        : cart;

                    // ── Group items by guestNo for Itemized Split ──
                    const guestGroups = {};
                    for (let g = 1; g <= splitBillCount; g++) guestGroups[g] = [];
                    activeOrderItems.forEach(item => {
                        const g = item.guestNo || 1;
                        if (!guestGroups[g]) guestGroups[g] = [];
                        guestGroups[g].push(item);
                    });
                    const guestTotals = Object.fromEntries(
                        Object.entries(guestGroups).map(([g, items]) => [
                            g,
                            items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseFloat(i.quantity) || 1), 0)
                        ])
                    );

                    // ── Payment-mode: running split total ──
                    const splitPayTotal = (parseFloat(splitCash) || 0) + (parseFloat(splitMpesa) || 0) + (parseFloat(splitCard) || 0) + (parseFloat(splitImPaybill) || 0);
                    const splitPayDiff = billTotal - splitPayTotal;
                    const splitPayBalanced = Math.abs(splitPayDiff) < 0.5;

                    const handleExecuteSplitPrint = (modeType) => {
                        let shares = [];
                        if (modeType === 'custom') {
                            shares = Array.from({ length: splitBillCount }, (_, gi) => {
                                const gNo = gi + 1;
                                const enteredVal = parseFloat(splitCustomAmounts[gNo]) || 0;
                                return {
                                    guestNo: gNo,
                                    totalGuests: splitBillCount,
                                    amount: enteredVal,
                                    items: activeOrderItems,
                                    isCustomSplit: true
                                };
                            });
                        } else if (modeType === 'even') {
                            const evenAmount = Math.round(billTotal / splitBillCount);
                            shares = Array.from({ length: splitBillCount }, (_, gi) => ({
                                guestNo: gi + 1,
                                totalGuests: splitBillCount,
                                amount: evenAmount,
                                items: activeOrderItems,
                                isEvenSplit: true
                            }));
                        } else {
                            shares = Array.from({ length: splitBillCount }, (_, gi) => {
                                const gNo = gi + 1;
                                const items = guestGroups[gNo] || [];
                                return {
                                    guestNo: gNo,
                                    totalGuests: splitBillCount,
                                    amount: guestTotals[gNo] || Math.round(billTotal / splitBillCount),
                                    items: items
                                };
                            });
                        }
                        
                        setSplitReceiptsData(shares);
                        
                        // Dual-printer routing / QZ Tray thermal printing
                        const targetBrand = splitBillTargetOrder?.brand || selectedBrand || 'POT OF JOLLOF';
                        const targetTicket = splitBillTargetOrder?.ticket_number || 'SPLIT';
                        const targetCustomer = splitBillTargetOrder?.customer_name || customerName || 'Guest';

                        let splitHtml = `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="utf-8">
                                <style>
                                    * { margin:0; padding:0; box-sizing:border-box; }
                                    body {
                                        font-family: Arial, Helvetica, sans-serif;
                                        font-size: 11px;
                                        font-weight: 700;
                                        color: #000;
                                        width: 80mm;
                                        padding: 4mm;
                                        background: #fff;
                                        -webkit-print-color-adjust: exact;
                                        print-color-adjust: exact;
                                    }
                                    .page { page-break-after: always; padding-bottom: 8mm; }
                                    .page:last-child { page-break-after: avoid; }
                                    .center { text-align: center; }
                                    .divider { border-top: 1px dashed #000; margin: 4px 0; }
                                    .divider-solid { border-top: 2px solid #000; margin: 4px 0; }
                                    .meta { display: flex; justify-content: space-between; margin: 2px 0; font-size: 10px; font-weight: 700; }
                                    .big { font-size: 14px; font-weight: 900; }
                                    .footer { text-align: center; margin-top: 6px; font-size: 10px; font-weight: 800; }
                                </style>
                            </head>
                            <body>
                        `;

                        shares.forEach((share) => {
                            const displayItems = (share.items && share.items.length > 0) ? share.items : activeOrderItems;
                            const itemsHtml = displayItems.map(item => `
                                <div style="display:flex;justify-content:space-between;margin:2px 0;font-size:10px;">
                                    <span style="max-width:70%;word-break:break-word;">${item.quantity || 1}x ${item.name || item.item_name}</span>
                                    <span>KES ${((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1)).toLocaleString()}</span>
                                </div>
                            `).join('');

                            splitHtml += `
                                <div class="page">
                                    <div class="center">
                                        <h2 style="font-size:15px;font-weight:900;letter-spacing:0.5px;">MUTE KITCHENS</h2>
                                        <div style="font-size:10px;font-weight:900;margin:3px 0;text-transform:uppercase;background:#000;color:#fff;padding:2px 4px;display:inline-block;border-radius:3px;">
                                            SPLIT RECEIPT: GUEST ${share.guestNo} OF ${share.totalGuests}
                                        </div>
                                        <div class="divider"></div>
                                    </div>
                                    <div class="meta"><span>BRAND:</span><span>${targetBrand.toUpperCase()}</span></div>
                                    <div class="meta"><span>TICKET #:</span><span>#${obfuscateTicket(targetTicket)}</span></div>
                                    <div class="meta"><span>PATRON:</span><span>${formatCustomerName(targetCustomer)}</span></div>
                                    <div class="meta"><span>DATE:</span><span>${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })}</span></div>
                                    <div class="meta"><span>CASHIER:</span><span>${(staffName || 'Cashier').toUpperCase()}</span></div>
                                    <div class="divider-solid"></div>
                                    
                                    <div style="font-weight:900;margin:4px 0;font-size:10px;text-transform:uppercase;">${share.isEvenSplit || share.isCustomSplit ? 'FULL ORDER ITEMS SUMMARY:' : `GUEST ${share.guestNo} ITEMS:`}</div>
                                    ${itemsHtml}
                                    
                                    <div class="divider-solid"></div>
                                    <div class="meta big" style="padding:4px 0;">
                                        <span>GUEST ${share.guestNo} SHARE:</span>
                                        <span>KES ${Math.round(share.amount).toLocaleString()}</span>
                                    </div>
                                    <div class="divider"></div>

                                    <div class="footer">
                                        <p style="font-weight:900;text-transform:uppercase;">THANK YOU FOR DINING WITH US!</p>
                                        <p style="font-size:9px;margin-top:4px;">HOW WAS YOUR EXPERIENCE TODAY?</p>
                                        <p style="font-size:8px;color:#444;margin-bottom:4px;">Please scan this QR code to share feedback</p>
                                        <div style="text-align:center;margin:4px 0;">
                                            <img src="${FEEDBACK_QR_CODE}" style="width:100px;height:100px;display:inline-block;" />
                                        </div>
                                        <span style="font-size:8px;">Powered by ManiPOS</span>
                                    </div>
                                </div>
                            `;
                        });

                        splitHtml += `</body></html>`;

                        printOrFallback(
                            frontDeskPrinter,
                            splitHtml,
                            () => {}
                        ).catch(console.warn);
                    };

                    return (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 text-secondary">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col gap-0 overflow-hidden max-h-[92vh]"
                        >
                            {/* Header */}
                            <div className="p-5 border-b border-gray-100 bg-gray-50/60 shrink-0">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-black text-lg text-gray-900">Split Receipt / Bill</h3>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                            {splitBillTargetOrder ? `Splitting Order #${obfuscateTicket(splitBillTargetOrder.ticket_number)}` : 'Splitting Active Checkout Cart'}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0 ml-4">
                                        <span className="text-[10px] text-gray-400 font-black uppercase tracking-wider block">Grand Total</span>
                                        <span className="text-xl font-mono font-black text-gray-950">KES {billTotal.toLocaleString()}</span>
                                    </div>
                                </div>

                                {/* Mode tabs */}
                                <div className="grid grid-cols-4 gap-1 mt-4 bg-gray-100 p-1 rounded-2xl">
                                    <button
                                        onClick={() => setSplitBillMode('custom')}
                                        className={`py-2 px-1.5 rounded-xl text-[11px] font-black transition-all border cursor-pointer ${
                                            splitBillMode === 'custom'
                                                ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                                                : 'bg-transparent text-gray-600 border-transparent hover:text-gray-900'
                                        }`}
                                    >
                                        ✏️ Custom
                                    </button>
                                    <button
                                        onClick={() => setSplitBillMode('even')}
                                        className={`py-2 px-1.5 rounded-xl text-[11px] font-black transition-all border cursor-pointer ${
                                            splitBillMode === 'even'
                                                ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                                                : 'bg-transparent text-gray-600 border-transparent hover:text-gray-900'
                                        }`}
                                    >
                                        ✂️ Even
                                    </button>
                                    <button
                                        onClick={() => setSplitBillMode('items')}
                                        className={`py-2 px-1.5 rounded-xl text-[11px] font-black transition-all border cursor-pointer ${
                                            splitBillMode === 'items'
                                                ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                                                : 'bg-transparent text-gray-600 border-transparent hover:text-gray-900'
                                        }`}
                                    >
                                        🍽️ Items
                                    </button>
                                    <button
                                        onClick={() => setSplitBillMode('payment')}
                                        className={`py-2 px-1.5 rounded-xl text-[11px] font-black transition-all border cursor-pointer ${
                                            splitBillMode === 'payment'
                                                ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                                                : 'bg-transparent text-gray-600 border-transparent hover:text-gray-900'
                                        }`}
                                    >
                                        💳 Payment
                                    </button>
                                </div>
                            </div>

                            {/* ─── TAB 1: Split by Custom Amounts ─── */}
                            {splitBillMode === 'custom' && (() => {
                                const customSum = Array.from({ length: splitBillCount }, (_, gi) => parseFloat(splitCustomAmounts[gi + 1]) || 0).reduce((a, b) => a + b, 0);
                                const customDiff = billTotal - customSum;
                                const customBalanced = Math.abs(customDiff) < 0.5;

                                return (
                                    <>
                                        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                                            <span className="text-xs font-black text-gray-700">Number of Guests:</span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        const next = Math.max(2, splitBillCount - 1);
                                                        setSplitBillCount(next);
                                                    }}
                                                    className="w-8 h-8 rounded-lg border border-gray-250 flex items-center justify-center font-black text-gray-650 hover:bg-gray-100 cursor-pointer"
                                                >-</button>
                                                <span className="font-black text-sm text-gray-900 w-6 text-center">{splitBillCount}</span>
                                                <button
                                                    onClick={() => setSplitBillCount(prev => Math.min(8, prev + 1))}
                                                    className="w-8 h-8 rounded-lg border border-gray-250 flex items-center justify-center font-black text-gray-650 hover:bg-gray-100 cursor-pointer"
                                                >+</button>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                                            <p className="text-[11px] text-gray-500 font-semibold">
                                                Input exact split amounts for each guest. They must add up to KES {billTotal.toLocaleString()}.
                                            </p>

                                            <div className="space-y-3">
                                                {Array.from({ length: splitBillCount }, (_, gi) => {
                                                    const gNo = gi + 1;
                                                    const val = splitCustomAmounts[gNo] || '';
                                                    const gColors = ['indigo', 'emerald', 'amber', 'rose', 'violet', 'sky', 'orange', 'teal'];
                                                    const c = gColors[gi % gColors.length];

                                                    return (
                                                        <div key={gNo} className={`p-3.5 bg-${c}-50/40 border border-${c}-200 rounded-2xl space-y-2`}>
                                                            <div className="flex justify-between items-center">
                                                                <label className={`text-xs font-black text-${c}-900 flex items-center gap-1.5`}>
                                                                    👤 Guest {gNo} Amount
                                                                </label>
                                                                {val && <span className={`text-xs font-mono font-bold text-${c}-700`}>KES {parseFloat(val).toLocaleString()}</span>}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <div className="relative flex-1">
                                                                    <span className="absolute left-3 top-2.5 text-xs font-mono text-gray-400 font-bold">KES</span>
                                                                    <input
                                                                        type="number"
                                                                        placeholder="Enter amount..."
                                                                        value={val}
                                                                        onChange={e => {
                                                                            const inputVal = e.target.value;
                                                                            setSplitCustomAmounts(prev => ({
                                                                                ...prev,
                                                                                [gNo]: inputVal
                                                                            }));
                                                                        }}
                                                                        className="w-full pl-11 pr-4 py-2 bg-white border border-gray-250 rounded-xl text-sm font-mono font-bold text-gray-900 outline-none focus:border-gray-900 transition-colors"
                                                                    />
                                                                </div>
                                                                {customDiff > 0 && !val && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSplitCustomAmounts(prev => ({
                                                                                ...prev,
                                                                                [gNo]: String(Math.max(0, customDiff))
                                                                            }));
                                                                        }}
                                                                        className="px-3 py-2 bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-xl font-bold text-[11px] shrink-0 transition-all cursor-pointer shadow-2xs"
                                                                    >
                                                                        Auto-Fill KES {customDiff.toLocaleString()}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Running balance */}
                                            <div className={`p-4 rounded-2xl border flex justify-between items-center ${
                                                customBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'
                                            }`}>
                                                <div>
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">Total Entered</span>
                                                    <span className="font-mono font-black text-gray-900 text-lg">KES {customSum.toLocaleString()}</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">
                                                        {customBalanced ? 'Status' : 'Remaining'}
                                                    </span>
                                                    <span className={`font-mono font-black text-sm ${
                                                        customBalanced ? 'text-emerald-600' : 'text-orange-600'
                                                    }`}>
                                                        {customBalanced ? '✓ Balanced' : `KES ${Math.abs(customDiff).toLocaleString()} ${customDiff > 0 ? 'short' : 'over'}`}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="p-4 border-t border-gray-100 space-y-2 shrink-0 bg-gray-50/50">
                                            <button
                                                disabled={!customBalanced}
                                                onClick={() => handleExecuteSplitPrint('custom')}
                                                className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                                            >
                                                <Printer size={15} /> Generate & Print {splitBillCount} Custom Share Receipts
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSplitBillModalOpen(false);
                                                    setSplitBillOrderTotal(null);
                                                    setSplitBillTargetOrder(null);
                                                }}
                                                className="w-full py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-xs border border-gray-200 transition-all text-center cursor-pointer"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </>
                                );
                            })()}


                            {/* ─── TAB 1: Split Evenly (Equal Shares) ─── */}
                            {splitBillMode === 'even' && (
                                <>
                                    <div className="p-5 space-y-4 flex-1 overflow-y-auto">
                                        <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-200">
                                            <span className="text-xs font-black text-gray-700">Number of Guests:</span>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setSplitBillCount(prev => Math.max(2, prev - 1))}
                                                    className="w-9 h-9 rounded-xl border border-gray-300 flex items-center justify-center font-black text-gray-800 hover:bg-gray-200 active:scale-95 text-base"
                                                >-</button>
                                                <span className="font-mono font-black text-lg text-gray-950 w-6 text-center">{splitBillCount}</span>
                                                <button
                                                    onClick={() => setSplitBillCount(prev => Math.min(8, prev + 1))}
                                                    className="w-9 h-9 rounded-xl border border-gray-300 flex items-center justify-center font-black text-gray-800 hover:bg-gray-200 active:scale-95 text-base"
                                                >+</button>
                                            </div>
                                        </div>

                                        <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 text-center space-y-1">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Equal Share Amount</span>
                                            <span className="text-3xl font-mono font-black text-emerald-950">
                                                KES {Math.round(billTotal / splitBillCount).toLocaleString()}
                                            </span>
                                            <span className="text-[11px] text-emerald-700 font-bold block pt-1">
                                                divided equally across {splitBillCount} guest slips
                                            </span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="p-4 border-t border-gray-100 space-y-2 shrink-0 bg-gray-50/50">
                                        <button
                                            onClick={() => handleExecuteSplitPrint('even')}
                                            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-black transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                                        >
                                            <Printer size={15} /> Generate & Print {splitBillCount} Equal Share Receipts
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSplitBillModalOpen(false);
                                                setSplitBillOrderTotal(null);
                                                setSplitBillTargetOrder(null);
                                            }}
                                            className="w-full py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-xs border border-gray-200 transition-all text-center cursor-pointer"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* ─── TAB 2: Split by Items ─── */}
                            {splitBillMode === 'items' && (
                                <>
                                    {/* Guest count picker */}
                                    <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                                        <span className="text-xs font-black text-gray-700">Number of Guests:</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const next = Math.max(2, splitBillCount - 1);
                                                    setSplitBillCount(next);
                                                    if (splitBillTargetOrder) {
                                                        setSplitBillTargetItems(prev => prev.map(c => (c.guestNo || 1) > next ? { ...c, guestNo: 1 } : c));
                                                    } else {
                                                        setCart(prev => prev.map(c => (c.guestNo || 1) > next ? { ...c, guestNo: 1 } : c));
                                                    }
                                                }}
                                                className="w-8 h-8 rounded-lg border border-gray-250 flex items-center justify-center font-black text-gray-650 hover:bg-gray-100"
                                            >-</button>
                                            <span className="font-black text-sm text-gray-900 w-6 text-center">{splitBillCount}</span>
                                            <button
                                                onClick={() => setSplitBillCount(prev => Math.min(8, prev + 1))}
                                                className="w-8 h-8 rounded-lg border border-gray-250 flex items-center justify-center font-black text-gray-650 hover:bg-gray-100"
                                            >+</button>
                                        </div>
                                    </div>

                                    {/* Item Assignment List */}
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                        <div className="space-y-1.5 border-b border-gray-100 pb-3">
                                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Tap G# chip to assign item to a guest:</span>
                                            {activeOrderItems.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-150 text-xs">
                                                    <span className="font-bold text-gray-900 leading-tight">
                                                        {item.name || item.item_name} <span className="text-gray-500 font-mono">x{item.quantity}</span>
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-gray-900">KES {((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1)).toLocaleString()}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const nextG = ((item.guestNo || 1) % splitBillCount) + 1;
                                                                if (splitBillTargetOrder) {
                                                                    setSplitBillTargetItems(prev => prev.map((it, i) => i === idx ? { ...it, guestNo: nextG } : it));
                                                                } else {
                                                                    setCart(prev => prev.map((it, i) => i === idx ? { ...it, guestNo: nextG } : it));
                                                                }
                                                            }}
                                                            className="px-2.5 py-1 bg-black text-white font-black text-[10px] rounded-lg hover:bg-neutral-800 transition-all shadow-xs cursor-pointer"
                                                        >
                                                            G{item.guestNo || 1}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Per-guest item breakdown cards */}
                                        {Array.from({ length: splitBillCount }, (_, gi) => {
                                            const gNo = gi + 1;
                                            const items = guestGroups[gNo] || [];
                                            const gTotal = guestTotals[gNo] || 0;
                                            const gColors = ['indigo', 'emerald', 'amber', 'rose', 'violet', 'sky', 'orange', 'teal'];
                                            const c = gColors[gi % gColors.length];
                                            return (
                                                <div key={gNo} className={`rounded-2xl border bg-${c}-50/40 border-${c}-100 overflow-hidden`}>
                                                    <div className={`px-3.5 py-2.5 border-b border-${c}-100 flex justify-between items-center`}>
                                                        <span className={`text-xs font-black text-${c}-800 uppercase tracking-wider`}>Guest {gNo}</span>
                                                        <span className={`font-mono text-sm font-black text-${c}-900`}>KES {gTotal.toLocaleString()}</span>
                                                    </div>
                                                    {items.length === 0 ? (
                                                        <p className="text-[10px] text-gray-400 italic text-center py-3">No items assigned yet</p>
                                                    ) : (
                                                        <div className="px-3.5 py-2 space-y-1.5">
                                                            {items.map((item, idx) => (
                                                                <div key={idx} className="flex justify-between items-center text-[11px] font-medium text-gray-800">
                                                                    <span>{item.name || item.item_name} <span className="text-gray-400">x{item.quantity}</span></span>
                                                                    <span className="font-mono font-bold">KES {((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1)).toLocaleString()}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Actions */}
                                    <div className="p-4 border-t border-gray-100 space-y-2 shrink-0 bg-gray-50/50">
                                        <button
                                            onClick={() => handleExecuteSplitPrint('items')}
                                            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-black transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                                        >
                                            <Printer size={15} /> Generate & Print {splitBillCount} Itemized Receipts
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSplitBillModalOpen(false);
                                                setSplitBillOrderTotal(null);
                                                setSplitBillTargetOrder(null);
                                            }}
                                            className="w-full py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-xs border border-gray-200 transition-all text-center cursor-pointer"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* ─── TAB 3: Split by Payment Method ─── */}
                            {splitBillMode === 'payment' && (
                                <>
                                    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                                        <p className="text-[11px] text-gray-500 font-semibold">Enter the amount the customer is paying with each method. They must add up to the grand total.</p>

                                        {/* Cash */}
                                        <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-xs font-black text-emerald-800 flex items-center gap-1.5">💵 Cash</label>
                                                {splitCash && <span className="text-xs font-mono font-bold text-emerald-700">KES {parseFloat(splitCash).toLocaleString()}</span>}
                                            </div>
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={splitCash}
                                                onChange={e => setSplitCash(e.target.value)}
                                                className="w-full px-4 py-2.5 bg-white border border-emerald-200 rounded-xl text-sm font-mono font-bold text-gray-900 outline-none focus:border-emerald-400 transition-colors"
                                            />
                                        </div>

                                        {/* M-Pesa */}
                                        <div className="bg-green-50/50 border border-green-100 rounded-2xl p-4 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-xs font-black text-green-800 flex items-center gap-1.5">📱 M-Pesa</label>
                                                {splitMpesa && <span className="text-xs font-mono font-bold text-green-700">KES {parseFloat(splitMpesa).toLocaleString()}</span>}
                                            </div>
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={splitMpesa}
                                                onChange={e => setSplitMpesa(e.target.value)}
                                                className="w-full px-4 py-2.5 bg-white border border-green-200 rounded-xl text-sm font-mono font-bold text-gray-900 outline-none focus:border-green-400 transition-colors"
                                            />
                                        </div>

                                        {/* Card */}
                                        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-xs font-black text-blue-800 flex items-center gap-1.5">💳 Card</label>
                                                {splitCard && <span className="text-xs font-mono font-bold text-blue-700">KES {parseFloat(splitCard).toLocaleString()}</span>}
                                            </div>
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={splitCard}
                                                onChange={e => setSplitCard(e.target.value)}
                                                className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-xl text-sm font-mono font-bold text-gray-900 outline-none focus:border-blue-400 transition-colors"
                                            />
                                        </div>

                                        {/* I&M Paybill */}
                                        <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-xs font-black text-amber-800 flex items-center gap-1.5">🏦 I&M Paybill</label>
                                                {splitImPaybill && <span className="text-xs font-mono font-bold text-amber-700">KES {parseFloat(splitImPaybill).toLocaleString()}</span>}
                                            </div>
                                            <input
                                                type="number"
                                                placeholder="0"
                                                value={splitImPaybill}
                                                onChange={e => setSplitImPaybill(e.target.value)}
                                                className="w-full px-4 py-2.5 bg-white border border-amber-200 rounded-xl text-sm font-mono font-bold text-gray-900 outline-none focus:border-amber-400 transition-colors"
                                            />
                                        </div>

                                        {/* Running balance */}
                                        <div className={`p-4 rounded-2xl border flex justify-between items-center ${
                                            splitPayBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'
                                        }`}>
                                            <div>
                                                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">Amount Entered</span>
                                                <span className="font-mono font-black text-gray-900 text-lg">KES {splitPayTotal.toLocaleString()}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 block">
                                                    {splitPayBalanced ? 'Status' : 'Remaining'}
                                                </span>
                                                <span className={`font-mono font-black text-sm ${
                                                    splitPayBalanced ? 'text-emerald-600' : 'text-orange-600'
                                                }`}>
                                                    {splitPayBalanced ? '✓ Balanced' : `KES ${Math.abs(splitPayDiff).toLocaleString()} ${splitPayDiff > 0 ? 'short' : 'over'}`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="p-4 border-t border-gray-100 space-y-2 shrink-0 bg-gray-50/50">
                                        <button
                                            disabled={!splitPayBalanced}
                                            onClick={() => {
                                                const imAmount = parseFloat(splitImPaybill) || 0;
                                                const cardAmount = parseFloat(splitCard) || 0;
                                                setSplitCard(String(cardAmount + imAmount) || splitCard);
                                                setSplitImPaybill('');
                                                setPaymentMethod('Split');
                                                setSplitBillModalOpen(false);
                                                setSplitBillOrderTotal(null);
                                                setSplitBillTargetOrder(null);
                                            }}
                                            className="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-xs hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                                        >
                                            ✓ Confirm Split Payment — KES {billTotal.toLocaleString()}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSplitBillModalOpen(false);
                                                setSplitBillOrderTotal(null);
                                                setSplitBillTargetOrder(null);
                                            }}
                                            className="w-full py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-xl font-bold text-xs border border-gray-200 transition-all text-center cursor-pointer"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                    );
                })()}
            </AnimatePresence>


            {/* Split Receipts Print Dialog */}
            <AnimatePresence>
                {splitReceiptsData && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white print:static text-secondary">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden print:shadow-none print:w-full print:max-w-none print:rounded-none flex flex-col max-h-[90vh] print:max-h-none"
                        >
                            <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center shrink-0 print:hidden">
                                <span className="text-xs font-black uppercase text-gray-400">Print Split Slips ({splitReceiptsData.length} guests)</span>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => window.print()}
                                        className="px-3.5 py-1.5 bg-primary text-secondary font-bold text-xs rounded-lg shadow-sm hover:shadow flex items-center gap-1.5"
                                    >
                                        <Printer size={14} /> Print Slips
                                    </button>
                                    <button 
                                        onClick={() => setSplitReceiptsData(null)}
                                        className="px-3.5 py-1.5 bg-white border border-gray-200 text-gray-700 font-bold text-xs rounded-lg hover:bg-gray-100"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8 font-mono text-xs text-black print:overflow-visible print:p-4 space-y-8 select-text">
                                {splitReceiptsData.map((share, index) => (
                                    <div key={index} className="border-b border-dashed border-black pb-8 last:border-b-0 last:pb-0">
                                        <div className="text-center space-y-1 mb-4">
                                            <h2 className="text-base font-black uppercase tracking-tight">MUTE KITCHENS</h2>
                                            <p className="text-[9px] font-bold">SPLIT BILL SLIP: GUEST {share.guestNo} OF {share.totalGuests}</p>
                                            <div className="border-b border-dashed border-black pt-2"></div>
                                        </div>

                                        <div className="space-y-1 text-[10px] mb-3">
                                            <div className="flex justify-between">
                                                <span>BRAND:</span>
                                                <span className="font-bold">{(splitBillTargetOrder?.brand || selectedBrand || 'Pot of Jollof').toUpperCase()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>TABLE/PATRON:</span>
                                                <span className="font-bold">{formatCustomerName(splitBillTargetOrder?.customer_name || customerName)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>DATE / TIME:</span>
                                                <span>{new Date().toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>CASHIER:</span>
                                                <span>{(staffName || 'Cashier').toUpperCase()}</span>
                                            </div>
                                        </div>

                                        <div className="space-y-2 mb-3 text-[10px]">
                                            <div className="grid grid-cols-[1fr_40px_60px] font-bold">
                                                <span>{share.isEvenSplit || share.isCustomSplit ? 'ORDER ITEMS SUMMARY' : `GUEST ${share.guestNo} ITEMS`}</span>
                                                <span className="text-center">QTY</span>
                                                <span className="text-right">PRICE</span>
                                            </div>
                                            <div className="border-b border-dashed border-black"></div>
                                            {((share.items && share.items.length > 0) ? share.items : cart).map((item, idx) => (
                                                <div key={idx} className="grid grid-cols-[1fr_40px_60px]">
                                                    <span>{item.name || item.item_name}</span>
                                                    <span className="text-center">{item.quantity || 1}</span>
                                                    <span className="text-right">{((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 1)).toLocaleString()}</span>
                                                </div>
                                            ))}
                                            <div className="border-b border-dashed border-black pt-1"></div>
                                        </div>

                                        <div className="space-y-1 text-[10px] mb-4">
                                            <div className="flex justify-between font-black text-sm pt-1">
                                                <span>GUEST {share.guestNo} SHARE:</span>
                                                <span>KES {Math.round(share.amount).toLocaleString()}</span>
                                            </div>
                                            <div className="border-b border-dashed border-black pt-2"></div>
                                        </div>

                                        <div className="text-center pt-1 text-[9px] space-y-1">
                                            <p className="font-bold uppercase">THANK YOU FOR DINING WITH US!</p>
                                            <p className="text-[8px] text-gray-500">Scan to share feedback:</p>
                                            <div className="flex justify-center my-1">
                                                <img src={FEEDBACK_QR_CODE} alt="Feedback QR" className="w-20 h-20" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* ── REGISTER NEW GUEST MODAL (AUTO-SYNCS TO GUEST CRM) ── */}
            {showRegisterGuestModal && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-gray-950/70 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-150">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/60">
                            <div>
                                <h3 className="font-black text-gray-950 text-base flex items-center gap-2">
                                    <UserPlus size={18} className="text-[#18A07A]" /> Register New Guest to CRM
                                </h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Automated Admin Guest CRM Integration</p>
                            </div>
                            <button onClick={() => setShowRegisterGuestModal(false)} className="p-1.5 text-gray-400 hover:text-gray-900 rounded-xl">
                                ✕
                            </button>
                        </div>
                        <form onSubmit={handleRegisterNewGuest} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">First Name *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="e.g. Samuel"
                                        value={newGuestFn}
                                        onChange={e => setNewGuestFn(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#18A07A] outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Last Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Ochieng"
                                        value={newGuestLn}
                                        onChange={e => setNewGuestLn(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#18A07A] outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Phone Number *</label>
                                    <input
                                        type="tel"
                                        required
                                        placeholder="e.g. 0712345678"
                                        value={newGuestPhone}
                                        onChange={e => setNewGuestPhone(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#18A07A] outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Email Address</label>
                                    <input
                                        type="email"
                                        placeholder="e.g. guest@gmail.com"
                                        value={newGuestEmail}
                                        onChange={e => setNewGuestEmail(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#18A07A] outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Restaurant Brand *</label>
                                    <select
                                        value={newGuestBrand}
                                        onChange={e => setNewGuestBrand(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#18A07A] outline-none"
                                    >
                                        <option value="POT OF JOLLOF">🫕 Pot of Jollof</option>
                                        <option value="LITTLE LAGOS">🌶️ Little Lagos</option>
                                        <option value="CAFE SWAHILI">☕ Cafe Swahili</option>
                                        <option value="SAMAKI STREET">🐟 Samaki Street</option>
                                        <option value="General Brand">🏢 General Restaurant</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Acquisition Channel *</label>
                                    <select
                                        value={newGuestChannel}
                                        onChange={e => setNewGuestChannel(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#18A07A] outline-none"
                                    >
                                        <option value="Walk-in">🏃 Walk-in (Dine-In)</option>
                                        <option value="Takeaway">🛍️ Phone / Takeaway</option>
                                        <option value="Delivery">🚚 Direct Delivery</option>
                                        <option value="Glovo">🟡 Glovo</option>
                                        <option value="UberEats">🟢 Uber Eats</option>
                                        <option value="Bolt Food">🟢 Bolt Food</option>
                                        <option value="Microsite">🌐 Self-Service Microsite</option>
                                        <option value="Social Media">📱 Instagram / WhatsApp</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Notes / Allergies / Preferences</label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Likes extra pepper, VIP regular, table window..."
                                    value={newGuestNotes}
                                    onChange={e => setNewGuestNotes(e.target.value)}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#18A07A] outline-none resize-none"
                                />
                            </div>
                            <div className="pt-2 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowRegisterGuestModal(false)}
                                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingGuest}
                                    className="px-5 py-2 bg-[#18A07A] hover:bg-[#128061] text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                                >
                                    {savingGuest ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                                    Save & Sync to Guest CRM
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* ── OUT OF STOCK / 86 ITEM SELECTION MODAL ── */}
            {itemToTurnOffModal && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-gray-950/70 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-150">
                        <div className="p-5 border-b border-gray-100 bg-rose-50/60 flex justify-between items-center">
                            <div>
                                <h3 className="font-black text-rose-950 text-base flex items-center gap-1.5">
                                    🚫 Mark Item Out of Stock
                                </h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">{itemToTurnOffModal.name}</p>
                            </div>
                            <button onClick={() => setItemToTurnOffModal(null)} className="p-1.5 text-gray-400 hover:text-gray-900 rounded-xl">
                                ✕
                            </button>
                        </div>

                        <div className="p-5 space-y-3">
                            <p className="text-xs text-gray-600 font-medium">How long should <strong>{itemToTurnOffModal.name}</strong> be switched off?</p>

                            <button
                                onClick={() => confirmTurnOffItem(itemToTurnOffModal, 'day')}
                                className="w-full p-3.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-2xl text-left transition-all group flex items-center justify-between shadow-2xs"
                            >
                                <div>
                                    <span className="font-black text-xs block text-amber-950">☀️ Rest of the Day</span>
                                    <span className="text-[10px] text-amber-700 font-medium">Item will automatically turn back ON tomorrow morning.</span>
                                </div>
                                <span className="text-lg group-hover:translate-x-1 transition-transform">➡️</span>
                            </button>

                            <button
                                onClick={() => confirmTurnOffItem(itemToTurnOffModal, 'indefinite')}
                                className="w-full p-3.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-900 rounded-2xl text-left transition-all group flex items-center justify-between shadow-2xs"
                            >
                                <div>
                                    <span className="font-black text-xs block text-rose-950">♾️ Indefinitely</span>
                                    <span className="text-[10px] text-rose-700 font-medium">Stays switched off until staff manually turns it back ON.</span>
                                </div>
                                <span className="text-lg group-hover:translate-x-1 transition-transform">➡️</span>
                            </button>

                            <button
                                onClick={() => setItemToTurnOffModal(null)}
                                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors mt-2"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const FEEDBACK_URL = "https://potofjollof.manipos.com/feedback";
const FEEDBACK_QR_CODE = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(FEEDBACK_URL)}`;


// ============================================================
// DUAL-PRINTER ROUTING (Option A)
// 1. printCashierSlips: Prints Cashier, Packer, and Record Copy to FOH printer.
// 2. printKitchenSlips: Prints KOT (Kitchen Order Ticket) to Kitchen printer.
// ============================================================
function printCashierSlips(receipt) {
    const netBase = receipt.total_amount / 1.18;
    const vatAmount = netBase * 0.16;
    const cateringLevy = netBase * 0.02;
    const dateFormatted = new Date(receipt.created_at).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });

    const baseStyle = `
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            font-weight: 700;
            color: #000;
            width: 80mm;
            padding: 5mm 4mm;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .page { page-break-after: always; padding-bottom: 8mm; }
        .page:last-child { page-break-after: avoid; }
        .center { text-align: center; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        .divider-solid { border-top: 2px solid #000; margin: 4px 0; }
        h1 { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; color: #000; }
        h2 { font-size: 13px; font-weight: 900; color: #000; margin: 3px 0; }
        .badge { display: inline-block; border: 2px solid #000; padding: 1px 6px; font-size: 11px; font-weight: 900; letter-spacing: 1px; margin-bottom: 4px; }
        .sub { font-size: 11px; font-weight: 600; color: #000; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 11px; font-weight: 800; color: #000; text-align: left; padding: 2px 0; }
        th.r, td.r { text-align: right; }
        th.c, td.c { text-align: center; }
        td { font-size: 11px; font-weight: 700; color: #000; padding: 2px 0; }
        .meta { display: flex; justify-content: space-between; margin: 2px 0; font-size: 11px; font-weight: 700; }
        .big { font-size: 14px; font-weight: 900; }
        .footer { text-align: center; margin-top: 6px; font-size: 11px; font-weight: 800; }
        @media print {
            body { width: 80mm; }
            @page { margin: 0; size: 80mm auto; }
        }
    `;

    const itemRowsFull = receipt.items.map(item => `
        <tr>
            <td style="width:50%;max-width:50%;word-break:break-word;padding:2px 0;">${item.item_name}${item.instructions ? `<br><span style="font-size:9px;font-weight:700;">* ${item.instructions}</span>` : ''}</td>
            <td class="c" style="width:10%;max-width:10%;text-align:center;padding:2px 0;">${item.quantity}</td>
            <td class="r" style="width:20%;max-width:20%;text-align:right;padding:2px 0;">${item.price.toLocaleString()}</td>
            <td class="r" style="width:20%;max-width:20%;text-align:right;padding:2px 0;">${(item.price * item.quantity).toLocaleString()}</td>
        </tr>
    `).join('');

    const itemRowsPack = receipt.items.map(item => `
        <tr>
            <td class="c" style="font-size:12px;font-weight:900;padding:3px 0;width:15%;max-width:15%;vertical-align:top;">[ &nbsp; ]</td>
            <td style="font-size:12px;font-weight:900;padding:3px 0;word-break:break-word;width:70%;max-width:70%;">${item.item_name}${item.instructions ? `<br><span style="font-size:10px;font-weight:700;">➜ ${item.instructions}</span>` : ''}</td>
            <td class="c" style="font-size:14px;font-weight:900;padding:3px 0;vertical-align:top;width:15%;max-width:15%;">${item.quantity}</td>
        </tr>
    `).join('');

    const itemRowsKOT = receipt.items.map(item => `
        <tr>
            <td style="font-size:13px;font-weight:900;padding:3px 0;word-break:break-word;width:80%;max-width:80%;">${item.item_name}${item.instructions ? `<br><span style="font-size:10px;font-weight:700;">[ ${item.instructions} ]</span>` : ''}</td>
            <td class="c" style="font-size:16px;font-weight:900;padding:3px 0;vertical-align:top;width:20%;max-width:20%;text-align:right;">${item.quantity}x</td>
        </tr>
    `).join('');

    const headerBlock = `
        <div class="center">
          <div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;"><div style="display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:200;letter-spacing:0.22em;line-height:1;"><span>M</span><span>U</span><span>T</span><span style="display:inline-flex;flex-direction:column;justify-content:space-between;height:20px;width:18px;margin-left:0.18em;padding:3px 0;box-sizing:border-box;"><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span></span></div><div style="width:170px;height:1px;background:#000;margin:5px 0 4px 0;"></div><div style="font-size:9px;font-weight:400;letter-spacing:0.55em;text-indent:0.55em;text-transform:uppercase;line-height:1;">Kitchens</div></div>
          <p class="sub">Tel: 0795384140 / 0799034617</p>
        </div>
        <div class="divider"></div>
        <div class="meta"><span>BRAND:</span><span>${(!receipt.brand || receipt.brand.toUpperCase() === 'MANIPOS' || receipt.brand.toUpperCase() === 'ALL' ? 'POT OF JOLLOF' : receipt.brand).toUpperCase()}</span></div>
        <div class="meta"><span>TICKET #:</span><span>${obfuscateTicket(receipt.ticket_number)}</span></div>
        <div class="meta"><span>TIME IN:</span><span>${dateFormatted}</span></div>
        <div class="meta"><span>TIME OUT:</span><span>___________________</span></div>
        <div class="meta"><span>CASHIER:</span><span>${receipt.cashier_name.toUpperCase()}</span></div>
        <div class="meta"><span>CUSTOMER:</span><span>${formatCustomerName(receipt.customer_name)}</span></div>
        <div class="meta"><span>MOS:</span><span>${receipt.dining_option.toUpperCase()}</span></div>${receipt.delivery_address || (receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]) ? `<div class="meta" style="font-weight:900;font-size:11px;background:#f0f0f0;padding:2px 4px;margin:2px 0;"><span>DELIVERY TO:</span><span>${receipt.delivery_address || receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]}</span></div>` : ''}
        <div class="divider"></div>
    `;

    const slip1 = `
    <div class="page">
        <div class="center"><div class="badge">CUSTOMER COPY</div></div>
         <div class="center">
            <div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;">
                <div style="display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:200;letter-spacing:0.22em;line-height:1;">
                    <span>M</span>
                    <span>U</span>
                    <span>T</span>
                    <span style="display:inline-flex;flex-direction:column;justify-content:space-between;height:22px;width:20px;margin-left:0.18em;padding:3px 0;box-sizing:border-box;">
                        <span style="display:block;width:100%;height:3px;background:#000;"></span>
                        <span style="display:block;width:100%;height:3px;background:#000;"></span>
                        <span style="display:block;width:100%;height:3px;background:#000;"></span>
                    </span>
                </div>
                <div style="width:188px;height:1px;background:#000;margin:5px 0 4px 0;"></div>
                <div style="font-size:10px;font-weight:400;letter-spacing:0.55em;text-indent:0.55em;text-transform:uppercase;line-height:1;">Kitchens</div>
            </div>
            <p class="sub">1st floor, Maralal Oasis, Hurlingham, Nairobi, Kenya</p>
            <p class="sub">Tel: 0795384140 / 0799034617</p>
            <p style="font-size:10px;font-weight:700;color:#000;white-space:nowrap;">PIN: P052354624Y</p>
        </div>
        <div class="divider"></div>
        <div class="meta"><span>BRAND:</span><span>${(!receipt.brand || receipt.brand.toUpperCase() === 'MANIPOS' || receipt.brand.toUpperCase() === 'ALL' ? 'POT OF JOLLOF' : receipt.brand).toUpperCase()}</span></div>
        <div class="meta"><span>TICKET #:</span><span>${obfuscateTicket(receipt.ticket_number)}</span></div>
        <div class="meta"><span>TIME IN:</span><span>${dateFormatted}</span></div>
        <div class="meta"><span>TIME OUT:</span><span>___________________</span></div>
        <div class="meta"><span>CASHIER:</span><span>${receipt.cashier_name.toUpperCase()}</span></div>
        <div class="meta"><span>CUSTOMER:</span><span>${formatCustomerName(receipt.customer_name)}</span></div>
        <div class="meta"><span>MOS:</span><span>${receipt.dining_option.toUpperCase()}</span></div>${receipt.delivery_address || (receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]) ? `<div class="meta" style="font-weight:900;font-size:11px;background:#f0f0f0;padding:2px 4px;margin:2px 0;"><span>DELIVERY TO:</span><span>${receipt.delivery_address || receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]}</span></div>` : ''}
        <div class="divider"></div>
        <table style="width:100%;table-layout:fixed;"><thead><tr><th style="width:50%;text-align:left;">ITEM</th><th class="c" style="width:10%;text-align:center;">QTY</th><th class="r" style="width:20%;text-align:right;">PRICE</th><th class="r" style="width:20%;text-align:right;">TOTAL</th></tr></thead>
        <tbody><tr><td colspan="4"><div class="divider"></div></td></tr>${itemRowsFull}<tr><td colspan="4"><div class="divider"></div></td></tr></tbody></table>
        <div class="meta"><span>SUBTOTAL:</span><span>KES ${(receipt.total_amount + (receipt.discount || 0)).toLocaleString()}</span></div>
        ${receipt.discount > 0 ? `<div class="meta"><span>DISCOUNT:</span><span>- KES ${receipt.discount.toLocaleString()}</span></div>` : ''}
        <div class="divider-solid"></div>
        <div class="meta big"><span>TOTAL:</span><span>KES ${receipt.total_amount.toLocaleString()}</span></div>
        <div class="divider"></div>
        <div class="meta" style="font-size:9px;"><span>TAXABLE AMT:</span><span>KES ${netBase.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div class="meta" style="font-size:9px;"><span>VAT (16% INCL):</span><span>KES ${vatAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div class="meta" style="font-size:9px;"><span>CAT. LEVY (2% INCL):</span><span>KES ${cateringLevy.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div class="divider"></div>
        <div class="meta"><span>PAYMENT:</span><span>${receipt.payment_method.toUpperCase()}</span></div>
        <div class="meta"><span>STATUS:</span><span>${receipt.payment_status.toUpperCase()}</span></div>
        ${receipt.splitDetails ? `<p style="font-size:9px;margin-top:3px;">${receipt.splitDetails}</p>` : ''}
        ${(receipt.payment_method || '').toLowerCase().includes('app') ? '' : `
        <div style="border:2px solid #000;margin-top:6px;padding:5px 6px;border-radius:2px;">
          <div style="font-size:10px;font-weight:900;text-align:center;margin-bottom:4px;letter-spacing:0.05em;">— PAY VIA MPESA —</div>
          <div class="meta" style="font-size:13px;font-weight:900;"><span>PAYBILL NO:</span><span style="font-size:16px;font-weight:900;letter-spacing:0.05em;">542542</span></div>
          <div class="meta" style="font-size:13px;font-weight:900;"><span>ACCT NO:</span><span style="font-size:16px;font-weight:900;letter-spacing:0.05em;">992422</span></div>
        </div>
        `}
        <div class="divider"></div>
        <div class="footer"><strong>THANK YOU FOR DINING WITH US!</strong><br><div style="font-size:10px;font-weight:900;margin-top:6px;text-align:center;text-transform:uppercase;">HOW WAS YOUR EXPERIENCE TODAY?</div><div style="font-size:11px;font-weight:900;margin-bottom:4px;text-align:center;text-transform:none;">Please scan this QR code to share your feedback</div><div style="text-align:center;margin:6px 0;"><img src="${FEEDBACK_QR_CODE}" style="width:120px;height:120px;display:inline-block;" /></div><span style="font-size:9px;">Powered by ManiPOS</span></div>
    </div>`;

    const slip2 = `
    <div class="page">
        <div class="center"><div class="badge">★ KITCHEN ORDER TICKET (KOT) ★</div></div>
        ${headerBlock}
        <table style="width:100%;table-layout:fixed;">
            <thead><tr><th style="font-size:12px;width:80%;text-align:left;">ITEM</th><th class="c" style="font-size:12px;width:20%;text-align:right;">QTY</th></tr></thead>
            <tbody><tr><td colspan="2"><div class="divider"></div></td></tr>${itemRowsKOT}</tbody>
        </table>
        <div class="divider-solid"></div>
        <div class="meta"><span>CHEF NAME:</span><span>___________________</span></div>
        <div class="divider"></div>
        <div class="footer" style="font-size:12px;margin-top:4px;">⚑ FIRE WHEN READY — TICKET #${obfuscateTicket(receipt.ticket_number)}</div>
    </div>`;

    const slip3 = `
    <div class="page">
        <div class="center"><div class="badge">PACKER / DISPATCH SLIP</div></div>
        ${headerBlock}
        <div class="meta"><span>ORDER TYPE:</span><span style="font-size:12px;font-weight:900;">${receipt.dining_option.toUpperCase()}</span></div>
        <div class="divider"></div>
        <table style="width:100%;table-layout:fixed;">
            <thead><tr><th style="font-size:12px;width:25%;text-align:center;">PACKED</th><th style="font-size:12px;width:60%;text-align:left;">ITEM</th><th class="c" style="font-size:12px;width:15%;text-align:center;">QTY</th></tr></thead>
            <tbody><tr><td colspan="3"><div class="divider"></div></td></tr>${itemRowsPack}</tbody>
        </table>
        <div class="divider-solid"></div>
        <div style="margin-top:4px;">
            <div class="meta"><span>□ Items verified &amp; packed</span></div>
            <div class="meta"><span>□ Sauces / extras included</span></div>
            <div class="meta"><span>□ Sealed &amp; ready</span></div>
            <div class="meta"><span>□ Temp check: HOT? [ ] Yes [ ] No</span></div>
            <div class="meta"><span>□ Prepared by (Chef): _________________</span></div>
        </div>
        <div class="divider"></div>
        <div class="footer">PACKER SIGN: _______________</div>
    </div>`;

    const slip4 = `
    <div class="page">
        <div class="center"><div class="badge">FRONT DESK — RECORD COPY</div></div>
        <div class="center"><div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;"><div style="display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:200;letter-spacing:0.22em;line-height:1;"><span>M</span><span>U</span><span>T</span><span style="display:inline-flex;flex-direction:column;justify-content:space-between;height:20px;width:18px;margin-left:0.18em;padding:3px 0;box-sizing:border-box;"><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span></span></div><div style="width:170px;height:1px;background:#000;margin:5px 0 4px 0;"></div><div style="font-size:9px;font-weight:400;letter-spacing:0.55em;text-indent:0.55em;text-transform:uppercase;line-height:1;">Kitchens</div></div><p class="sub">PIN: P052354624Y</p></div>
        <div class="divider"></div>
        <div class="meta"><span>BRAND:</span><span>${(!receipt.brand || receipt.brand.toUpperCase() === 'MANIPOS' || receipt.brand.toUpperCase() === 'ALL' ? 'POT OF JOLLOF' : receipt.brand).toUpperCase()}</span></div>
        <div class="meta"><span>TICKET #:</span><span>${obfuscateTicket(receipt.ticket_number)}</span></div>
        <div class="meta"><span>TIME IN:</span><span>${dateFormatted}</span></div>
        <div class="meta"><span>TIME OUT:</span><span>___________________</span></div>
        <div class="meta"><span>CASHIER:</span><span>${receipt.cashier_name.toUpperCase()}</span></div>
        <div class="meta"><span>CUSTOMER:</span><span>${formatCustomerName(receipt.customer_name)}</span></div>
        <div class="meta"><span>MOS:</span><span>${receipt.dining_option.toUpperCase()}</span></div>${receipt.delivery_address || (receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]) ? `<div class="meta" style="font-weight:900;font-size:11px;background:#f0f0f0;padding:2px 4px;margin:2px 0;"><span>DELIVERY TO:</span><span>${receipt.delivery_address || receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]}</span></div>` : ''}
        <div class="divider"></div>
        <table style="width:100%;table-layout:fixed;"><thead><tr><th style="width:50%;text-align:left;">ITEM</th><th class="c" style="width:10%;text-align:center;">QTY</th><th class="r" style="width:20%;text-align:right;">PRICE</th><th class="r" style="width:20%;text-align:right;">TOTAL</th></tr></thead>
        <tbody><tr><td colspan="4"><div class="divider"></div></td></tr>${itemRowsFull}<tr><td colspan="4"><div class="divider"></div></td></tr></tbody></table>
        <div class="meta"><span>SUBTOTAL:</span><span>KES ${(receipt.total_amount + (receipt.discount || 0)).toLocaleString()}</span></div>
        ${receipt.discount > 0 ? `<div class="meta"><span>DISCOUNT:</span><span>- KES ${receipt.discount.toLocaleString()}</span></div>` : ''}
        <div class="divider-solid"></div>
        <div class="meta big"><span>TOTAL:</span><span>KES ${receipt.total_amount.toLocaleString()}</span></div>
        <div class="meta" style="font-size:9px;"><span>TAXABLE AMT:</span><span>KES ${netBase.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div class="meta" style="font-size:9px;"><span>VAT (16% INCL):</span><span>KES ${vatAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div class="meta" style="font-size:9px;"><span>CAT. LEVY (2% INCL):</span><span>KES ${cateringLevy.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <div class="divider"></div>
        <div class="meta"><span>PAYMENT:</span><span>${receipt.payment_method.toUpperCase()}</span></div>
        <div class="meta"><span>STATUS:</span><span>${receipt.payment_status.toUpperCase()}</span></div>
        ${receipt.splitDetails ? `<p style="font-size:9px;margin-top:3px;">${receipt.splitDetails}</p>` : ''}
        <div class="divider-solid"></div>
        <div class="footer">AUTHORISED BY: _______________</div>
    </div>`;

    // slip2 (KOT) is NOT included here — it prints separately to the chef printer via printKitchenSlips()
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cashier Slips #${obfuscateTicket(receipt.ticket_number)}</title><style>${baseStyle}</style></head><body>${slip1}${slip3}${slip4}</body></html>`;

    const win = window.open('', '_blank', 'width=420,height=700,scrollbars=yes');
    if (!win) { alert('Please allow popups to enable print routing.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
}

/**
 * Returns the HTML string for cashier slips (Customer + Packer + Record).
 * Used by QZ Tray to print silently without opening a popup.
 */
function buildCashierSlipsHTML(receipt) {
    const dateFormatted = new Date(receipt.created_at).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    return _buildCashierHTML(receipt, dateFormatted);
}

/**
 * Returns the HTML string for the kitchen KOT.
 * Used by QZ Tray to print silently without opening a popup.
 */
function buildKitchenSlipsHTML(receipt) {
    const dateFormatted = new Date(receipt.created_at).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });
    return _buildKitchenHTML(receipt, dateFormatted);
}

function printKitchenSlips(receipt) {
    const dateFormatted = new Date(receipt.created_at).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });

    const baseStyle = `
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            font-weight: 700;
            color: #000;
            width: 80mm;
            padding: 5mm 4mm;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .center { text-align: center; }
        .divider { border-top: 1px dashed #000; margin: 4px 0; }
        .divider-solid { border-top: 2px solid #000; margin: 4px 0; }
        h1 { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; color: #000; }
        .badge { display: inline-block; border: 2px solid #000; padding: 1px 6px; font-size: 11px; font-weight: 900; letter-spacing: 1px; margin-bottom: 4px; }
        .sub { font-size: 11px; font-weight: 600; color: #000; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; }
        th { font-size: 11px; font-weight: 800; color: #000; text-align: left; padding: 2px 0; }
        th.c, td.c { text-align: center; }
        td { font-size: 11px; font-weight: 700; color: #000; padding: 2px 0; }
        .meta { display: flex; justify-content: space-between; margin: 2px 0; font-size: 11px; font-weight: 700; }
        .footer { text-align: center; margin-top: 6px; font-size: 11px; font-weight: 800; }
        @media print {
            body { width: 80mm; }
            @page { margin: 0; size: 80mm auto; }
        }
    `;

    const itemRowsKOT = receipt.items.map(item => `
        <tr>
            <td style="font-size:13px;font-weight:900;padding:3px 0;word-break:break-word;width:80%;max-width:80%;">${item.item_name}${item.instructions ? `<br><span style="font-size:10px;font-weight:700;">[ ${item.instructions} ]</span>` : ''}</td>
            <td class="c" style="font-size:16px;font-weight:900;padding:3px 0;vertical-align:top;width:20%;max-width:20%;text-align:right;">${item.quantity}x</td>
        </tr>
    `).join('');

    const headerBlock = `
        <div class="center">
          <div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;"><div style="display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:200;letter-spacing:0.22em;line-height:1;"><span>M</span><span>U</span><span>T</span><span style="display:inline-flex;flex-direction:column;justify-content:space-between;height:20px;width:18px;margin-left:0.18em;padding:3px 0;box-sizing:border-box;"><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span></span></div><div style="width:170px;height:1px;background:#000;margin:5px 0 4px 0;"></div><div style="font-size:9px;font-weight:400;letter-spacing:0.55em;text-indent:0.55em;text-transform:uppercase;line-height:1;">Kitchens</div></div>
          <p class="sub">Tel: 0795384140 / 0799034617</p>
        </div>
        <div class="divider"></div>
        <div class="meta"><span>BRAND:</span><span>${(!receipt.brand || receipt.brand.toUpperCase() === 'MANIPOS' || receipt.brand.toUpperCase() === 'ALL' ? 'POT OF JOLLOF' : receipt.brand).toUpperCase()}</span></div>
        <div class="meta"><span>TICKET #:</span><span>${obfuscateTicket(receipt.ticket_number)}</span></div>
        <div class="meta"><span>TIME IN:</span><span>${dateFormatted}</span></div>
        <div class="meta"><span>TIME OUT:</span><span>___________________</span></div>
        <div class="meta"><span>CASHIER:</span><span>${receipt.cashier_name.toUpperCase()}</span></div>
        <div class="meta"><span>CUSTOMER:</span><span>${formatCustomerName(receipt.customer_name)}</span></div>
        <div class="meta"><span>MOS:</span><span>${receipt.dining_option.toUpperCase()}</span></div>${receipt.delivery_address || (receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]) ? `<div class="meta" style="font-weight:900;font-size:11px;background:#f0f0f0;padding:2px 4px;margin:2px 0;"><span>DELIVERY TO:</span><span>${receipt.delivery_address || receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]}</span></div>` : ''}
        <div class="divider"></div>
    `;

    const slip2 = `
    <div class="page">
        <div class="center"><div class="badge">★ KITCHEN ORDER TICKET (KOT) ★</div></div>
        ${headerBlock}
        <table style="width:100%;table-layout:fixed;">
            <thead><tr><th style="font-size:12px;width:80%;text-align:left;">ITEM</th><th class="c" style="font-size:12px;width:20%;text-align:right;">QTY</th></tr></thead>
            <tbody><tr><td colspan="2"><div class="divider"></div></td></tr>${itemRowsKOT}</tbody>
        </table>
        <div class="divider-solid"></div>
        <div class="meta"><span>CHEF NAME:</span><span>___________________</span></div>
        <div class="divider"></div>
        <div class="footer" style="font-size:12px;margin-top:4px;">⚑ FIRE WHEN READY — TICKET #${obfuscateTicket(receipt.ticket_number)}</div>
    </div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kitchen KOT #${receipt.ticket_number}</title><style>${baseStyle}</style></head><body>${slip2}</body></html>`;

    const win = window.open('', '_blank', 'width=420,height=700,scrollbars=yes');
    if (!win) { alert('Please allow popups to enable print routing.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
}

function sanitizeReceiptItems(receipt) {
    if (!receipt || !receipt.items || receipt.items.length === 0) return receipt;

    const rawItems = receipt.items;
    const targetTotal = (receipt.total_amount || 0) + (receipt.discount || 0);
    const isPartialPay = (receipt.payment_status || '').toLowerCase().includes('partial') || (receipt.customer_name || '').includes('Guest Share') || Boolean(receipt.splitDetails);

    // If partial payment, do not trim table items
    if (isPartialPay) return receipt;

    const fullSum = rawItems.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0)), 0);

    if (Math.abs(fullSum - targetTotal) < 1 || targetTotal === 0) {
        return receipt;
    }

    // Filter out duplicated item rows from past order edits so total equals total_amount
    let runningSum = 0;
    const validItems = [];

    for (let i = rawItems.length - 1; i >= 0; i--) {
        const item = rawItems[i];
        const itemVal = (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);

        if (runningSum + itemVal <= targetTotal + 0.01) {
            runningSum += itemVal;
            validItems.unshift(item);
        }

        if (Math.abs(runningSum - targetTotal) < 0.5) {
            break;
        }
    }

    if (validItems.length > 0 && Math.abs(runningSum - targetTotal) < 1) {
        return { ...receipt, items: validItems };
    }

    return receipt;
}

// Internal HTML builders used by QZ Tray (return HTML string, no popup)
function _buildCashierHTML(rawReceipt, dateFormatted) {
    const receipt = sanitizeReceiptItems(rawReceipt);
    const netBase = receipt.total_amount / 1.18;
    const vatAmount = netBase * 0.16;
    const cateringLevy = netBase * 0.02;
    // This is a lightweight re-implementation that mirrors printCashierSlips.
    // Called by buildCashierSlipsHTML for QZ Tray silent printing.
    const baseStyle = `* { margin:0; padding:0; box-sizing:border-box; } body { font-family:Arial,Helvetica,sans-serif; font-size:12px; font-weight:700; color:#000; width:80mm; padding:5mm 4mm; background:#fff; } .page { page-break-after:always; padding-bottom:8mm; } .page:last-child { page-break-after:avoid; } .center { text-align:center; } .divider { border-top:1px dashed #000; margin:4px 0; } .divider-solid { border-top:2px solid #000; margin:4px 0; } h1 { font-size:16px; font-weight:900; } .sub { font-size:11px; font-weight:600; color:#000; line-height:1.6; } .badge { display:inline-block; border:2px solid #000; padding:1px 6px; font-size:11px; font-weight:900; letter-spacing:1px; margin-bottom:4px; } table { width:100%; border-collapse:collapse; } th { font-size:11px; font-weight:800; color:#000; text-align:left; padding:2px 0; } th.r, td.r { text-align:right; } th.c, td.c { text-align:center; } td { font-size:11px; font-weight:700; color:#000; padding:2px 0; } .meta { display:flex; justify-content:space-between; margin:2px 0; font-size:11px; font-weight:700; } .big { font-size:14px; font-weight:900; } .footer { text-align:center; margin-top:6px; font-size:11px; font-weight:800; } @media print { body { width:80mm; } @page { margin:0; size:80mm auto; } }`;
    let cachedMenu = [];
    try {
        const cached = localStorage.getItem('pos_cache_menu');
        if (cached) cachedMenu = JSON.parse(cached);
    } catch (e) {}

    const dedupeItems = (items) => Object.values(
        (items || []).reduce((acc, item) => {
            let p = parseFloat(item.price) || 0;
            if (item.instructions) {
                const matches = item.instructions.match(/\(\+(\d+)\)/g);
                if (matches) {
                    const parsedMods = matches.reduce((sum, matchStr) => sum + (parseFloat(matchStr.replace(/[^\d.]/g, '')) || 0), 0);
                    const menuItem = (cachedMenu || []).find(m => m.name === item.item_name);
                    const baseP = menuItem ? (menuItem.price || 0) : p;
                    if (p < (baseP + parsedMods)) {
                        p = baseP + parsedMods;
                    }
                }
            }
            const key = `${item.item_name}||${p}||${item.instructions || ''}`;
            if (acc[key]) { acc[key] = { ...acc[key], quantity: acc[key].quantity + item.quantity }; }
            else { acc[key] = { ...item, price: p }; }
            return acc;
        }, {})
    );
    const dedupedItems = dedupeItems(receipt.items);
    const itemsSubtotal = (dedupedItems || []).reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0)), 0);
    const isPartialPay = (receipt.payment_status || '').toLowerCase().includes('partial') || (receipt.customer_name || '').includes('Guest Share') || Boolean(receipt.splitDetails);
    const calculatedTotal = isPartialPay ? receipt.total_amount : Math.max(0, itemsSubtotal - (receipt.discount || 0));

    const itemRowsFull = dedupedItems.map(item => `<tr><td style="width:50%;max-width:50%;word-break:break-word;padding:2px 0;">${item.item_name}${item.instructions ? `<br><span style="font-size:9px;font-weight:700;">* ${item.instructions}</span>` : ''}</td><td class="c" style="width:10%;text-align:center;padding:2px 0;">${item.quantity}</td><td class="r" style="width:20%;text-align:right;padding:2px 0;">${item.price.toLocaleString()}</td><td class="r" style="width:20%;text-align:right;padding:2px 0;">${(item.price * item.quantity).toLocaleString()}</td></tr>`).join('');
    const itemRowsPack = dedupedItems.map(item => `<tr><td class="c" style="font-size:12px;font-weight:900;padding:3px 0;width:15%;vertical-align:top;">[ &nbsp; ]</td><td style="font-size:12px;font-weight:900;padding:3px 0;word-break:break-word;width:70%;">${item.item_name}${item.instructions ? `<br><span style="font-size:10px;font-weight:700;">➜ ${item.instructions}</span>` : ''}</td><td class="c" style="font-size:14px;font-weight:900;padding:3px 0;vertical-align:top;width:15%;">${item.quantity}</td></tr>`).join('');
    const hdr = `<div class="meta"><span>BRAND:</span><span>${(!receipt.brand || receipt.brand.toUpperCase() === 'MANIPOS' || receipt.brand.toUpperCase() === 'ALL' ? 'POT OF JOLLOF' : receipt.brand).toUpperCase()}</span></div><div class="meta"><span>TICKET #:</span><span>${obfuscateTicket(receipt.ticket_number)}</span></div><div class="meta"><span>TIME IN:</span><span>${dateFormatted}</span></div><div class="meta"><span>TIME OUT:</span><span>___________________</span></div><div class="meta"><span>CASHIER:</span><span>${receipt.cashier_name.toUpperCase()}</span></div><div class="meta"><span>CUSTOMER:</span><span>${formatCustomerName(receipt.customer_name)}</span></div><div class="meta"><span>MOS:</span><span>${receipt.dining_option.toUpperCase()}</span></div>${receipt.delivery_address || (receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]) ? `<div class="meta" style="font-weight:900;font-size:11px;background:#f0f0f0;padding:2px 4px;margin:2px 0;"><span>DELIVERY TO:</span><span>${receipt.delivery_address || receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]}</span></div>` : ''}<div class="divider"></div>`;
    const slip1 = `<div class="page"><div class="center"><div class="badge">CUSTOMER COPY</div></div><div class="center"><div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;"><div style="display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:200;letter-spacing:0.22em;line-height:1;"><span>M</span><span>U</span><span>T</span><span style="display:inline-flex;flex-direction:column;justify-content:space-between;height:20px;width:18px;margin-left:0.18em;padding:3px 0;box-sizing:border-box;"><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span></span></div><div style="width:170px;height:1px;background:#000;margin:5px 0 4px 0;"></div><div style="font-size:9px;font-weight:400;letter-spacing:0.55em;text-indent:0.55em;text-transform:uppercase;line-height:1;">Kitchens</div></div><p class="sub">1st floor, Maralal Oasis, Hurlingham, Nairobi, Kenya</p><p class="sub">Tel: 0795384140 / 0799034617</p><p style="font-size:10px;font-weight:700;color:#000;white-space:nowrap;">PIN: P052354624Y</p></div><div class="divider"></div>${hdr}<table style="width:100%;table-layout:fixed;"><thead><tr><th style="width:50%;text-align:left;">ITEM</th><th class="c" style="width:10%;text-align:center;">QTY</th><th class="r" style="width:20%;text-align:right;">PRICE</th><th class="r" style="width:20%;text-align:right;">TOTAL</th></tr></thead><tbody><tr><td colspan="4"><div class="divider"></div></td></tr>${itemRowsFull}<tr><td colspan="4"><div class="divider"></div></td></tr></tbody></table>${isPartialPay ? `<div class="meta"><span>ORDER ITEMS TOTAL:</span><span>KES ${itemsSubtotal.toLocaleString()}</span></div><div class="meta" style="font-weight:900;"><span>THIS SHARE PAID:</span><span>KES ${receipt.total_amount.toLocaleString()}</span></div>` : `<div class="meta"><span>SUBTOTAL:</span><span>KES ${itemsSubtotal.toLocaleString()}</span></div>`}${receipt.discount > 0 ? `<div class="meta"><span>DISCOUNT:</span><span>- KES ${receipt.discount.toLocaleString()}</span></div>` : ''}<div class="divider-solid"></div><div class="meta big"><span>TOTAL:</span><span>KES ${calculatedTotal.toLocaleString()}</span></div><div class="divider"></div><div class="meta" style="font-size:9px;"><span>TAXABLE AMT:</span><span>KES ${netBase.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div><div class="meta" style="font-size:9px;"><span>VAT (16% INCL):</span><span>KES ${vatAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div><div class="meta" style="font-size:9px;"><span>CAT. LEVY (2% INCL):</span><span>KES ${cateringLevy.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div><div class="divider"></div><div class="meta"><span>PAYMENT:</span><span>${receipt.payment_method.toUpperCase()}</span></div><div class="meta"><span>STATUS:</span><span>${receipt.payment_status.toUpperCase()}</span></div>${receipt.splitDetails ? `<p style="font-size:9px;margin-top:3px;">${receipt.splitDetails}</p>` : ''}${(receipt.payment_method || '').toLowerCase().includes('app') ? '' : `<div style="border:2px solid #000;margin-top:6px;padding:5px 6px;border-radius:2px;"><div style="font-size:10px;font-weight:900;text-align:center;margin-bottom:4px;letter-spacing:0.05em;">— PAY VIA MPESA —</div><div class="meta" style="font-size:13px;font-weight:900;"><span>PAYBILL NO:</span><span style="font-size:16px;font-weight:900;letter-spacing:0.05em;">542542</span></div><div class="meta" style="font-size:13px;font-weight:900;"><span>ACCT NO:</span><span style="font-size:16px;font-weight:900;letter-spacing:0.05em;">992422</span></div></div>`}<div class="divider"></div><div class="footer"><strong>THANK YOU FOR DINING WITH US!</strong><br><div style="font-size:10px;font-weight:900;margin-top:6px;text-align:center;text-transform:uppercase;">HOW WAS YOUR EXPERIENCE TODAY?</div><div style="font-size:11px;font-weight:900;margin-bottom:4px;text-align:center;text-transform:none;">Please scan this QR code to share your feedback</div><div style="text-align:center;margin:6px 0;"><img src="${FEEDBACK_QR_CODE}" style="width:120px;height:120px;display:inline-block;" /></div><span style="font-size:9px;">Powered by ManiPOS</span></div></div>`;
    const slip3 = `<div class="page"><div class="center"><div class="badge">PACKER / DISPATCH SLIP</div></div>${hdr}<table style="width:100%;table-layout:fixed;"><thead><tr><th style="font-size:12px;width:25%;text-align:center;">PACKED</th><th style="font-size:12px;width:60%;text-align:left;">ITEM</th><th class="c" style="font-size:12px;width:15%;text-align:center;">QTY</th></tr></thead><tbody><tr><td colspan="3"><div class="divider"></div></td></tr>${itemRowsPack}</tbody></table><div class="divider-solid"></div><div class="footer">PACKER SIGN: _______________</div></div>`;
    const slip4 = `<div class="page"><div class="center"><div class="badge">FRONT DESK — RECORD COPY</div></div><div class="center"><div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;"><div style="display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:200;letter-spacing:0.22em;line-height:1;"><span>M</span><span>U</span><span>T</span><span style="display:inline-flex;flex-direction:column;justify-content:space-between;height:20px;width:18px;margin-left:0.18em;padding:3px 0;box-sizing:border-box;"><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span></span></div><div style="width:170px;height:1px;background:#000;margin:5px 0 4px 0;"></div><div style="font-size:9px;font-weight:400;letter-spacing:0.55em;text-indent:0.55em;text-transform:uppercase;line-height:1;">Kitchens</div></div><p class="sub">PIN: P052354624Y</p></div><div class="divider"></div>${hdr}<table style="width:100%;table-layout:fixed;"><thead><tr><th style="width:50%;text-align:left;">ITEM</th><th class="c" style="width:10%;text-align:center;">QTY</th><th class="r" style="width:20%;text-align:right;">PRICE</th><th class="r" style="width:20%;text-align:right;">TOTAL</th></tr></thead><tbody><tr><td colspan="4"><div class="divider"></div></td></tr>${itemRowsFull}<tr><td colspan="4"><div class="divider"></div></td></tr></tbody></table>${isPartialPay ? `<div class="meta"><span>ORDER ITEMS TOTAL:</span><span>KES ${itemsSubtotal.toLocaleString()}</span></div><div class="meta" style="font-weight:900;"><span>THIS SHARE PAID:</span><span>KES ${receipt.total_amount.toLocaleString()}</span></div>` : `<div class="meta"><span>SUBTOTAL:</span><span>KES ${itemsSubtotal.toLocaleString()}</span></div>`}${receipt.discount > 0 ? `<div class="meta"><span>DISCOUNT:</span><span>- KES ${receipt.discount.toLocaleString()}</span></div>` : ''}<div class="divider-solid"></div><div class="meta big"><span>TOTAL:</span><span>KES ${calculatedTotal.toLocaleString()}</span></div><div class="divider"></div><div class="meta" style="font-size:9px;"><span>VAT (16% INCL):</span><span>KES ${vatAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div><div class="divider"></div><div class="meta"><span>PAYMENT:</span><span>${receipt.payment_method.toUpperCase()}</span></div><div class="meta"><span>STATUS:</span><span>${receipt.payment_status.toUpperCase()}</span></div>${receipt.splitDetails ? `<p style="font-size:9px;margin-top:3px;">${receipt.splitDetails}</p>` : ''}<div class="divider-solid"></div><div class="footer">AUTHORISED BY: _______________</div></div>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cashier Slips #${obfuscateTicket(receipt.ticket_number)}</title><style>${baseStyle}</style></head><body>${slip1}${slip3}${slip4}</body></html>`;
}

function _buildKitchenHTML(receipt, dateFormatted) {
    const baseStyle = `* { margin:0; padding:0; box-sizing:border-box; } body { font-family:Arial,Helvetica,sans-serif; font-size:12px; font-weight:700; color:#000; width:80mm; padding:5mm 4mm; background:#fff; } .center { text-align:center; } .divider { border-top:1px dashed #000; margin:4px 0; } .divider-solid { border-top:2px solid #000; margin:4px 0; } h1 { font-size:16px; font-weight:900; } .badge { display:inline-block; border:2px solid #000; padding:1px 6px; font-size:11px; font-weight:900; letter-spacing:1px; margin-bottom:4px; } .sub { font-size:11px; font-weight:600; color:#000; line-height:1.6; } table { width:100%; border-collapse:collapse; } th { font-size:11px; font-weight:800; color:#000; text-align:left; padding:2px 0; } th.c, td.c { text-align:center; } td { font-size:11px; font-weight:700; color:#000; padding:2px 0; } .meta { display:flex; justify-content:space-between; margin:2px 0; font-size:11px; font-weight:700; } .footer { text-align:center; margin-top:6px; font-size:11px; font-weight:800; } @media print { body { width:80mm; } @page { margin:0; size:80mm auto; } }`;
    const rows = receipt.items.map(item => `<tr><td style="font-size:13px;font-weight:900;padding:3px 0;word-break:break-word;width:80%;">${item.item_name}${item.instructions ? `<br><span style="font-size:10px;font-weight:700;">[ ${item.instructions} ]</span>` : ''}</td><td class="c" style="font-size:16px;font-weight:900;padding:3px 0;vertical-align:top;width:20%;text-align:right;">${item.quantity}x</td></tr>`).join('');
    const hdr = `<div class="meta"><span>BRAND:</span><span>${(!receipt.brand || receipt.brand.toUpperCase() === 'MANIPOS' || receipt.brand.toUpperCase() === 'ALL' ? 'POT OF JOLLOF' : receipt.brand).toUpperCase()}</span></div><div class="meta"><span>TICKET #:</span><span>${obfuscateTicket(receipt.ticket_number)}</span></div><div class="meta"><span>TIME IN:</span><span>${dateFormatted}</span></div><div class="meta"><span>TIME OUT:</span><span>___________________</span></div><div class="meta"><span>CASHIER:</span><span>${receipt.cashier_name.toUpperCase()}</span></div><div class="meta"><span>CUSTOMER:</span><span>${formatCustomerName(receipt.customer_name)}</span></div><div class="meta"><span>MOS:</span><span>${receipt.dining_option.toUpperCase()}</span></div>${receipt.delivery_address || (receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]) ? `<div class="meta" style="font-weight:900;font-size:11px;background:#f0f0f0;padding:2px 4px;margin:2px 0;"><span>DELIVERY TO:</span><span>${receipt.delivery_address || receipt.notes?.match(/Delivery Address:\s*([^\n]*)/)?.[1]}</span></div>` : ''}<div class="divider"></div>`;
    const slip2 = `<div><div class="center"><div class="badge">★ KITCHEN ORDER TICKET (KOT) ★</div></div><div class="center"><div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;"><div style="display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:200;letter-spacing:0.22em;line-height:1;"><span>M</span><span>U</span><span>T</span><span style="display:inline-flex;flex-direction:column;justify-content:space-between;height:20px;width:18px;margin-left:0.18em;padding:3px 0;box-sizing:border-box;"><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span><span style="display:block;width:100%;height:3px;background:#000;"></span></span></div><div style="width:170px;height:1px;background:#000;margin:5px 0 4px 0;"></div><div style="font-size:9px;font-weight:400;letter-spacing:0.55em;text-indent:0.55em;text-transform:uppercase;line-height:1;">Kitchens</div></div><p class="sub">Tel: 0795384140 / 0799034617</p></div><div class="divider"></div>${hdr}<table style="width:100%;table-layout:fixed;"><thead><tr><th style="font-size:12px;width:80%;text-align:left;">ITEM</th><th class="c" style="font-size:12px;width:20%;text-align:right;">QTY</th></tr></thead><tbody><tr><td colspan="2"><div class="divider"></div></td></tr>${rows}</tbody></table><div class="divider-solid"></div><div class="meta"><span>CHEF NAME:</span><span>___________________</span></div><div class="divider"></div><div class="footer" style="font-size:12px;margin-top:4px;">⚑ FIRE WHEN READY — TICKET #${obfuscateTicket(receipt.ticket_number)}</div></div>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kitchen KOT #${obfuscateTicket(receipt.ticket_number)}</title><style>${baseStyle}</style></head><body>${slip2}</body></html>`;
}

function printAllSlips(receipt) {
    // 1. Print Customer + Packer + Front Desk copy
    printCashierSlips(receipt);
    
    // 2. Print Kitchen KOT slip
    // Trigger kitchen printing after a small delay so popups don't collide
    setTimeout(() => {
        printKitchenSlips(receipt);
    }, 600);
}


// Thermal Receipt print popup component
function ReceiptPrintModal({ receipt: rawReceipt, onClose, onCloseAndExit, frontDeskPrinter = '', kitchenPrinter = '' }) {
    const receipt = sanitizeReceiptItems(rawReceipt);

    const netBase = receipt.total_amount / 1.18;
    const vatAmount = netBase * 0.16;
    const cateringLevy = netBase * 0.02;
    const dateFormatted = new Date(receipt.created_at).toLocaleString('en-US', { timeZone: 'Africa/Nairobi' });

    // Front-desk printer: Customer copy + Packer slip + Record copy — via QZ or popup fallback
    const handlePrintReceipt = () => {
        printOrFallback(
            frontDeskPrinter,
            buildCashierSlipsHTML(receipt),
            () => printCashierSlips(receipt)
        ).catch(console.warn);
    };

    // Chef/kitchen printer: KOT only — via QZ or popup fallback
    const handlePrintKOT = () => {
        printOrFallback(
            kitchenPrinter,
            buildKitchenSlipsHTML(receipt),
            () => printKitchenSlips(receipt)
        ).catch(console.warn);
    };

    // Build clean receipt HTML for the dedicated print window (used by on-screen preview)
    const buildReceiptHTML = () => {
        // Deduplicate items: collapse identical item+price rows into one row
        // with summed quantities. Guards against historical double-insert rows.
        const dedupedItems = Object.values(
            (receipt.items || []).reduce((acc, item) => {
                const key = `${item.item_name}||${item.price}||${item.instructions || ''}`;
                if (acc[key]) {
                    acc[key] = { ...acc[key], quantity: acc[key].quantity + item.quantity };
                } else {
                    acc[key] = { ...item };
                }
                return acc;
            }, {})
        );
        const itemRows = dedupedItems.map(item => `
            <tr>
                <td style="width:50%;max-width:50%;word-break:break-word;padding:2px 0;font-weight:900;color:#000;">${item.item_name}${item.instructions ? `<br><span style="font-size:9px;font-weight:700;color:#333;">* ${item.instructions}</span>` : ''}</td>
                <td style="width:10%;max-width:10%;text-align:center;padding:2px 0;font-weight:900;color:#000;">${item.quantity}</td>
                <td style="width:20%;max-width:20%;text-align:right;padding:2px 0;font-weight:900;color:#000;">${item.price.toLocaleString()}</td>
                <td style="width:20%;max-width:20%;text-align:right;padding:2px 0;font-weight:900;color:#000;">${(item.price * item.quantity).toLocaleString()}</td>
            </tr>
        `).join('');


        const discountRow = receipt.discount > 0
            ? `<tr><td colspan="3" style="font-weight:900;color:#000;">DISCOUNT APPLIED:</td><td style="text-align:right;font-weight:900;color:#000;">- KES ${receipt.discount.toLocaleString()}</td></tr>` : '';

        const splitNote = receipt.splitDetails
            ? `<p style="font-size:9px;font-weight:700;color:#333;margin-top:4px;">${receipt.splitDetails}</p>` : '';

        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Receipt #${obfuscateTicket(receipt.ticket_number)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    font-weight: 900;
    color: #000;
    width: 80mm;
    padding: 6mm 4mm;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .center { text-align:center; }
  .divider { border-top: 1px dashed #000; margin: 5px 0; }
  .divider-solid { border-top: 2px solid #000; margin: 5px 0; }
  h1 { font-size:16px; font-weight:900; letter-spacing:0.5px; color:#000; margin-bottom:3px; }
  p.sub { font-size:10px; font-weight:700; color:#000; line-height:1.5; }
  table { width:100%; border-collapse:collapse; }
  th { font-size:10px; font-weight:900; color:#000; text-align:left; padding:3px 0; }
  th.r, td.r { text-align:right; }
  th.c, td.c { text-align:center; }
  td { font-size:10px; font-weight:900; color:#000; }
  .meta-row { display:flex; justify-content:space-between; margin:2px 0; }
  .meta-label { font-size:10px; font-weight:900; color:#000; }
  .meta-value { font-size:10px; font-weight:900; color:#000; }
  .total-row { display:flex; justify-content:space-between; font-size:12px; font-weight:900; color:#000; margin:4px 0; }
  .footer { text-align:center; margin-top:8px; }
  .footer p { font-size:11px; font-weight:900; color:#000; }
  .footer small { font-size:9px; font-weight:700; color:#000; }
  @media print {
    body { width:80mm; }
    @page { margin:0; size: 80mm auto; }
  }
</style>
</head>
<body>
<div class="center">
  <div style="text-align:center;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#000;padding:4px 0 6px 0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;">
      <div style="display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:200;letter-spacing:0.22em;line-height:1;">
          <span>M</span>
          <span>U</span>
          <span>T</span>
          <span style="display:inline-flex;flex-direction:column;justify-content:space-between;height:22px;width:20px;margin-left:0.18em;padding:3px 0;box-sizing:border-box;">
              <span style="display:block;width:100%;height:3px;background:#000;"></span>
              <span style="display:block;width:100%;height:3px;background:#000;"></span>
              <span style="display:block;width:100%;height:3px;background:#000;"></span>
          </span>
      </div>
      <div style="width:188px;height:1px;background:#000;margin:5px 0 4px 0;"></div>
      <div style="font-size:10px;font-weight:400;letter-spacing:0.55em;text-indent:0.55em;text-transform:uppercase;line-height:1;">Kitchens</div>
  </div>
  <p class="sub">1st floor, Maralal Oasis, Hurlingham, Nairobi, Kenya</p>
  <p class="sub">Tel: 0795384140 / 0799034617</p>
  <p style="font-size:10px;font-weight:700;color:#000;white-space:nowrap;">PIN: P052354624Y</p>
</div>
<div class="divider"></div>

<div class="meta-row"><span class="meta-label">BRAND:</span><span class="meta-value">${(!receipt.brand || receipt.brand.toUpperCase() === 'MANIPOS' || receipt.brand.toUpperCase() === 'ALL' ? 'POT OF JOLLOF' : receipt.brand).toUpperCase()}</span></div>
<div class="meta-row"><span class="meta-label">TICKET NO:</span><span class="meta-value">#${obfuscateTicket(receipt.ticket_number)}</span></div>
<div class="meta-row"><span class="meta-label">TIME IN:</span><span class="meta-value">${dateFormatted}</span></div>
<div class="meta-row"><span class="meta-label">TIME OUT:</span><span class="meta-value">___________________</span></div>
<div class="meta-row"><span class="meta-label">CASHIER:</span><span class="meta-value">${receipt.cashier_name.toUpperCase()}</span></div>
<div class="meta-row"><span class="meta-label">CUSTOMER:</span><span class="meta-value">${formatCustomerName(receipt.customer_name)}</span></div>
<div class="meta-row"><span class="meta-label">MOS:</span><span class="meta-value">${receipt.dining_option.toUpperCase()}</span></div>

<div class="divider"></div>

<table style="width:100%;table-layout:fixed;">
  <thead>
    <tr>
      <th style="width:50%;text-align:left;">ITEM DESCRIPTION</th>
      <th class="c" style="width:10%;text-align:center;">QTY</th>
      <th class="r" style="width:20%;text-align:right;">PRICE</th>
      <th class="r" style="width:20%;text-align:right;">TOTAL</th>
    </tr>
  </thead>
  <tbody>
    <tr><td colspan="4"><div class="divider"></div></td></tr>
    ${itemRows}
    <tr><td colspan="4"><div class="divider"></div></td></tr>
  </tbody>
</table>

<div class="meta-row" style="margin-top:4px;"><span class="meta-label">SUBTOTAL:</span><span class="meta-value">KES ${(receipt.total_amount + receipt.discount).toLocaleString()}</span></div>
${receipt.discount > 0 ? `<div class="meta-row"><span class="meta-label">DISCOUNT:</span><span class="meta-value">- KES ${receipt.discount.toLocaleString()}</span></div>` : ''}
<div class="divider-solid"></div>
<div class="total-row"><span>TOTAL AMOUNT:</span><span>KES ${receipt.total_amount.toLocaleString()}</span></div>
<div class="divider"></div>

<div class="meta-row" style="margin-top:4px;"><span class="meta-label">TAX ANALYSIS:</span><span class="meta-value">16% VAT & 2% LEVY INCL</span></div>
<div class="meta-row"><span class="meta-label">TAXABLE AMT:</span><span class="meta-value">KES ${netBase.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
<div class="meta-row"><span class="meta-label">VAT CHARGED (16%):</span><span class="meta-value">KES ${vatAmount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
<div class="meta-row"><span class="meta-label">CATERING LEVY (2%):</span><span class="meta-value">KES ${cateringLevy.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>

<div class="divider"></div>

<div class="meta-row" style="margin-top:4px;"><span class="meta-label">PAYMENT METHOD:</span><span class="meta-value">${receipt.payment_method.toUpperCase()}</span></div>
<div class="meta-row"><span class="meta-label">PAYMENT STATUS:</span><span class="meta-value">${receipt.payment_status.toUpperCase()}</span></div>
${splitNote}

<div class="divider"></div>
<div class="footer">
  <p>THANK YOU FOR DINING WITH US!</p>
  <div style="font-size:10px;font-weight:900;margin-top:6px;text-align:center;text-transform:uppercase;">HOW WAS YOUR EXPERIENCE TODAY?</div><div style="font-size:11px;font-weight:900;margin-bottom:4px;text-align:center;text-transform:none;">Please scan this QR code to share your feedback</div><div style="text-align:center;margin:6px 0;"><img src="${FEEDBACK_QR_CODE}" style="width:120px;height:120px;display:inline-block;" /></div><small>Powered by ManiPOS</small>
</div>
</body>
</html>`;
    };


    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-secondary border border-gray-100"
            >
                {/* Modal actions */}
                <div className="p-3.5 bg-gray-900 text-white border-b border-gray-800 flex justify-between items-center shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">Receipt Preview</span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <button
                            onClick={handlePrintReceipt}
                            title="Print Customer + Packer + Record copy to front-desk printer"
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1"
                        >
                            <Printer size={13} /> Print Receipt
                        </button>
                        <button
                            onClick={handlePrintKOT}
                            title="Print Kitchen Order Ticket (KOT) to chef printer"
                            className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1"
                        >
                            🍳 Print KOT
                        </button>
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs rounded-xl transition-all border border-gray-700 flex items-center gap-1"
                        >
                            <X size={14} /> Close
                        </button>
                    </div>
                </div>

                {/* Thermal Ticket preview (on-screen only) */}
                <div className="flex-1 overflow-y-auto p-8 font-mono text-xs text-black select-text">
                    <div className="flex flex-col items-center justify-center text-center text-black font-sans py-1 pb-2.5">
                        <div className="flex items-center justify-center text-3xl font-light tracking-[0.15em] leading-none">
                            <span>M</span>
                            <span className="ml-[0.15em]">U</span>
                            <span className="ml-[0.15em]">T</span>
                            <span className="inline-flex flex-col justify-between h-[24px] w-[22px] ml-[0.22em] py-[2px] shrink-0">
                                <span className="block w-full h-[3.5px] bg-black"></span>
                                <span className="block w-full h-[3.5px] bg-black"></span>
                                <span className="block w-full h-[3.5px] bg-black"></span>
                            </span>
                        </div>
                        <div className="w-[195px] h-[1.2px] bg-black my-1.5"></div>
                        <div className="text-[10.5px] font-normal tracking-[0.45em] indent-[0.45em] uppercase">
                            Kitchens
                        </div>
                    </div>
                    <div className="text-center space-y-1 mb-6">
                        <p className="text-[10px] font-bold">1st floor, Maralal Oasis, Hurlingham, Nairobi, Kenya</p>
                        <p className="text-[10px] font-bold">Tel: 0795384140 / 0799034617</p>
                        <p className="text-[10px] font-bold">PIN: P052354624Y</p>
                        <div className="border-b border-dashed border-black pt-3"></div>
                    </div>

                    <div className="space-y-1 text-[10px] mb-4">
                        <div className="flex justify-between"><span className="font-black">BRAND:</span><span className="font-bold">{(!receipt.brand || receipt.brand.toUpperCase() === 'MANIPOS' || receipt.brand.toUpperCase() === 'ALL' ? 'POT OF JOLLOF' : receipt.brand).toUpperCase()}</span></div>
                        <div className="flex justify-between"><span className="font-black">TICKET NO:</span><span className="font-black">#{obfuscateTicket(receipt.ticket_number)}</span></div>
                        <div className="flex justify-between"><span className="font-black">TIME IN:</span><span className="font-bold">{dateFormatted}</span></div>
                        <div className="flex justify-between"><span className="font-black">TIME OUT:</span><span className="font-bold">___________________</span></div>
                        <div className="flex justify-between"><span className="font-black">CASHIER:</span><span className="font-bold">{receipt.cashier_name.toUpperCase()}</span></div>
                        <div className="flex justify-between"><span className="font-black">CUSTOMER:</span><span className="font-bold">{formatCustomerName(receipt.customer_name)}</span></div>
                        <div className="flex justify-between"><span className="font-black">OPTION:</span><span className="font-black">{receipt.dining_option.toUpperCase()}</span></div>
                        <div className="border-b border-dashed border-black pt-2"></div>
                    </div>

                    <div className="space-y-2 mb-4 text-[10px]">
                        <div className="grid grid-cols-[1fr_40px_60px_60px] font-black">
                            <span>ITEM DESCRIPTION</span>
                            <span className="text-center">QTY</span>
                            <span className="text-right">PRICE</span>
                            <span className="text-right">TOTAL</span>
                        </div>
                        <div className="border-b border-dashed border-black"></div>
                        {receipt.items.map((item, idx) => (
                            <div key={idx} className="flex flex-col">
                                <div className="grid grid-cols-[1fr_40px_60px_60px]">
                                    <span className="font-black">{item.item_name}</span>
                                    <span className="text-center font-bold">{item.quantity}</span>
                                    <span className="text-right font-bold">{item.price.toLocaleString()}</span>
                                    <span className="text-right font-bold">{(item.price * item.quantity).toLocaleString()}</span>
                                </div>
                                {item.instructions && (
                                    <span className="text-[9px] font-bold text-gray-600 italic pl-2">* {item.instructions}</span>
                                )}
                            </div>
                        ))}
                        <div className="border-b border-dashed border-black pt-2"></div>
                    </div>

                    {(() => {
                        const itemsSubtotal = (receipt.items || []).reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0)), 0);
                        const isPartialPay = (receipt.payment_status || '').toLowerCase().includes('partial') || (receipt.customer_name || '').includes('Guest Share') || Boolean(receipt.splitDetails);
                        const displayTotal = isPartialPay ? receipt.total_amount : Math.max(0, itemsSubtotal - (receipt.discount || 0));

                        return (
                            <div className="space-y-1 text-[10px] mb-6">
                                {isPartialPay ? (
                                    <>
                                        <div className="flex justify-between"><span className="font-black">ORDER ITEMS TOTAL:</span><span className="font-bold">KES {itemsSubtotal.toLocaleString()}</span></div>
                                        <div className="flex justify-between font-black text-amber-700"><span>THIS SHARE PAID:</span><span>KES {receipt.total_amount.toLocaleString()}</span></div>
                                    </>
                                ) : (
                                    <div className="flex justify-between"><span className="font-black">SUBTOTAL:</span><span className="font-bold">KES {itemsSubtotal.toLocaleString()}</span></div>
                                )}
                                {receipt.discount > 0 && (
                                    <div className="flex justify-between font-black"><span>DISCOUNT APPLIED:</span><span>- KES {receipt.discount.toLocaleString()}</span></div>
                                )}
                                <div className="flex justify-between font-black text-xs pt-1 border-t border-dotted border-black">
                                    <span>TOTAL AMOUNT:</span>
                                    <span>KES {displayTotal.toLocaleString()}</span>
                                </div>
                                <div className="border-b border-dashed border-black pt-2"></div>
                            </div>
                        );
                    })()}

                    <div className="space-y-1 text-[9px] mb-6">
                        <div className="flex justify-between font-black"><span>TAX ANALYSIS:</span><span>RATE (16% VAT & 2% LEVY INCL)</span></div>
                        <div className="flex justify-between font-bold"><span>TAXABLE AMT:</span><span>KES {netBase.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                        <div className="flex justify-between font-bold"><span>VAT CHARGED (16%):</span><span>KES {vatAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                        <div className="flex justify-between font-bold"><span>CATERING LEVY (2%):</span><span>KES {cateringLevy.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></div>
                        <div className="border-b border-dashed border-black pt-2"></div>
                    </div>

                    <div className="space-y-1 text-[10px] mb-6">
                        <div className="flex justify-between"><span className="font-black">PAYMENT METHOD:</span><span className="font-black">{receipt.payment_method.toUpperCase()}</span></div>
                        <div className="flex justify-between"><span className="font-black">PAYMENT STATUS:</span><span className="font-black bg-gray-100 px-1.5 rounded">{receipt.payment_status.toUpperCase()}</span></div>
                        {receipt.splitDetails && (
                            <p className="text-[8px] font-bold text-left italic text-gray-600 mt-1">{receipt.splitDetails}</p>
                        )}
                    </div>

                    <div className="text-center space-y-1 pt-2">
                        <p className="font-black uppercase tracking-tight">THANK YOU FOR DINING WITH US!</p>
                        <div className="text-[9px] font-black uppercase text-center mt-2.5">HOW WAS YOUR EXPERIENCE TODAY?</div>
                        <div className="text-[7.5px] font-bold text-gray-500 text-center">Please scan this QR code to share your feedback</div>
                        <div className="flex justify-center py-2">
                            <img src={FEEDBACK_QR_CODE} alt="Feedback QR" className="w-[100px] h-[100px] object-contain" />
                        </div>
                        <p className="text-[8px] font-bold">Powered by ManiPOS</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}


// ============================================================
// DELIVERY API INTEGRATIONS MANAGEMENT DASHBOARD
// ============================================================
export function ApiIntegrationsDashboard({ menu }) {
    const [channels, setChannels] = React.useState([]);
    const [selectedChannel, setSelectedChannel] = React.useState(null);
    const [overrides, setOverrides] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [credentials, setCredentials] = React.useState({
        client_id: '',
        client_secret: '',
        auto_accept: false,
        auto_accept_delay_mins: 0,
        default_markup_percent: 0,
        is_active: false,
        delivery_fee_per_km: 50,
        base_delivery_fee: 100,
        base_delivery_distance: 3,
        packaging_fee: 50,
        store_lat: -1.2921,
        store_lng: 36.7901,
        microsite_url: 'https://www.pojmanagement.com'
    });
    const [logs, setLogs] = React.useState([
        { time: '01:15', type: 'info', msg: '⚡ Webhook handlers running: Deno Edge Functions active.' },
        { time: '01:22', type: 'success', msg: '✅ Menu synced: Pushed local changes to Glovo Sandbox.' },
        { time: '01:45', type: 'success', msg: '⚡ Auto-accepted UberEats delivery order #382373' }
    ]);

    const [editingOverride, setEditingOverride] = React.useState(null);

    const fetchChannels = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('pos_channels')
                .select('*')
                .order('display_name', { ascending: true });
            if (error) throw error;
            setChannels(data || []);
            localStorage.setItem('pos_channels_cached', JSON.stringify(data || []));
            if (data && data.length > 0 && !selectedChannel) {
                setSelectedChannel(data[0]);
                updateCredentialsState(data[0]);
            }
        } catch (err) {
            console.error('Error fetching channels:', err);
            const mock = [
                { id: 'mock-ubereats', name: 'ubereats', display_name: 'Uber Eats', is_active: false, default_markup_percent: 15 },
                { id: 'mock-glovo', name: 'glovo', display_name: 'Glovo', is_active: false, default_markup_percent: 20 },
                { id: 'mock-boltfood', name: 'boltfood', display_name: 'Bolt Food', is_active: false, default_markup_percent: 15 },
                { id: 'mock-uberdirect', name: 'uber_direct', display_name: 'Uber Direct (Delivery API)', is_active: false, default_markup_percent: 0 },
                { id: 'mock-whatsapp', name: 'whatsapp', display_name: 'WhatsApp Bot', is_active: false, default_markup_percent: 0 }
            ];
            setChannels(mock);
            if (!selectedChannel) {
                setSelectedChannel(mock[0]);
                updateCredentialsState(mock[0]);
            }
        } finally {
            setLoading(false);
        }
    };

    const updateCredentialsState = (chan) => {
        setCredentials({
            client_id: chan.client_id || '',
            client_secret: chan.client_secret || '',
            auto_accept: chan.auto_accept || false,
            auto_accept_delay_mins: chan.auto_accept_delay_mins || 0,
            default_markup_percent: chan.default_markup_percent || 0,
            is_active: chan.is_active || false,
            delivery_fee_per_km: chan.delivery_fee_per_km ?? 50.00,
            base_delivery_fee: chan.base_delivery_fee ?? 100.00,
            base_delivery_distance: chan.base_delivery_distance ?? 3.00,
            packaging_fee: chan.packaging_fee ?? 50.00,
            store_lat: chan.store_lat ?? -1.2921,
            store_lng: chan.store_lng ?? 36.7901,
            microsite_url: chan.microsite_url ?? 'https://www.pojmanagement.com'
        });
    };

    const fetchOverrides = async (chanId) => {
        if (!chanId) return;
        try {
            const { data, error } = await supabase
                .from('pos_channel_menu_overrides')
                .select('*')
                .eq('channel_id', chanId);
            if (error) throw error;
            setOverrides(data || []);

            const existingOvr = JSON.parse(localStorage.getItem('pos_channel_overrides_cached') || '[]');
            const cleanOvr = existingOvr.filter(o => o.channel_id !== chanId);
            const updatedOvr = [...cleanOvr, ...(data || [])];
            localStorage.setItem('pos_channel_overrides_cached', JSON.stringify(updatedOvr));
        } catch (err) {
            console.error('Error fetching overrides:', err);
        }
    };

    React.useEffect(() => {
        fetchChannels();
    }, []);

    React.useEffect(() => {
        if (selectedChannel) {
            fetchOverrides(selectedChannel.id);
            updateCredentialsState(selectedChannel);
        }
    }, [selectedChannel]);

    const handleSaveChannel = async () => {
        if (!selectedChannel) return;
        setSaving(true);
        try {
            // First try update with new columns
            const { error } = await supabase
                .from('pos_channels')
                .update({
                    client_id: credentials.client_id,
                    client_secret: credentials.client_secret,
                    auto_accept: credentials.auto_accept,
                    auto_accept_delay_mins: credentials.auto_accept_delay_mins,
                    default_markup_percent: credentials.default_markup_percent,
                    is_active: credentials.is_active,
                    webhook_url: `${window.location.origin.replace('3000', '54321')}/functions/${selectedChannel.name}-webhook`,
                    delivery_fee_per_km: credentials.delivery_fee_per_km,
                    base_delivery_fee: credentials.base_delivery_fee,
                    base_delivery_distance: credentials.base_delivery_distance,
                    packaging_fee: credentials.packaging_fee,
                    store_lat: credentials.store_lat,
                    store_lng: credentials.store_lng,
                    microsite_url: credentials.microsite_url
                })
                .eq('id', selectedChannel.id);

            if (error) {
                // If it fails because columns don't exist yet, run fallback update
                if (error.message.includes('column') || error.message.includes('does not exist')) {
                    console.warn("Delivery settings columns do not exist yet. Retrying fallback update...");
                    const { error: retryError } = await supabase
                        .from('pos_channels')
                        .update({
                            client_id: credentials.client_id,
                            client_secret: credentials.client_secret,
                            auto_accept: credentials.auto_accept,
                            auto_accept_delay_mins: credentials.auto_accept_delay_mins,
                            default_markup_percent: credentials.default_markup_percent,
                            is_active: credentials.is_active,
                            webhook_url: `${window.location.origin.replace('3000', '54321')}/functions/${selectedChannel.name}-webhook`
                        })
                        .eq('id', selectedChannel.id);
                    
                    if (retryError) throw retryError;
                    alert('Settings saved! Note: WhatsApp delivery columns were NOT saved to DB because the SQL migration has not been run yet. Please run the supabase_add_whatsapp_delivery_settings.sql script.');
                } else {
                    throw error;
                }
            } else {
                alert('Settings saved successfully!');
            }
            
            const updated = { ...selectedChannel, ...credentials };
            setSelectedChannel(updated);
            setChannels(prev => {
                const next = prev.map(c => c.id === selectedChannel.id ? updated : c);
                localStorage.setItem('pos_channels_cached', JSON.stringify(next));
                return next;
            });
        } catch (err) {
            alert('Failed to save settings: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveOverride = async (overrideData) => {
        if (!selectedChannel) return;
        try {
            const payload = {
                channel_id: selectedChannel.id,
                menu_item_id: overrideData.menu_item_id,
                is_available: overrideData.is_available,
                off_reason: overrideData.off_reason || null,
                off_duration: overrideData.off_duration || null,
                price_markup_value: parseFloat(overrideData.price_markup_value) || 0
            };

            const { error } = await supabase
                .from('pos_channel_menu_overrides')
                .upsert(payload, { onConflict: 'channel_id,menu_item_id' });

            if (error) throw error;
            fetchOverrides(selectedChannel.id);
            setEditingOverride(null);
        } catch (err) {
            alert('Failed to save override: ' + err.message);
        }
    };

    return (
        <div className="flex-1 flex flex-col md:flex-row gap-5 overflow-hidden p-6 max-h-[75vh]">
            <div className="w-full md:w-64 bg-gray-50 border border-gray-100 rounded-3xl p-4 flex flex-col gap-2 shrink-0">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-1">Channels</span>
                {channels.map((chan) => (
                    <button
                        key={chan.id}
                        type="button"
                        onClick={() => setSelectedChannel(chan)}
                        className={`w-full text-left p-3.5 rounded-2xl flex items-center justify-between transition-all ${
                            selectedChannel?.id === chan.id
                                ? 'bg-white shadow-sm border border-gray-150 text-gray-900 font-bold'
                                : 'bg-transparent text-gray-500 hover:bg-white/50 border border-transparent'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-lg">
                                {chan.name === 'ubereats' ? '🍔' : chan.name === 'glovo' ? '🛵' : chan.name === 'boltfood' ? '⚡' : '📦'}
                            </span>
                            <span className="text-xs">{chan.display_name}</span>
                        </div>
                        <span className={`w-2 h-2 rounded-full ${chan.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                    </button>
                ))}
            </div>

            {selectedChannel && (
                <div className="flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar pr-2">
                    <div className="bg-white border border-gray-100 shadow-sm p-6 rounded-3xl space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                            <div>
                                <h3 className="font-black text-gray-950 text-sm">{selectedChannel.display_name} Integration</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Configure access tokens, markups, and webhook handlers.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-bold text-gray-500">Status:</label>
                                <button
                                    type="button"
                                    onClick={() => setCredentials(prev => ({ ...prev, is_active: !prev.is_active }))}
                                    className={`w-12 h-6 flex items-center rounded-full p-1 transition-all ${credentials.is_active ? 'bg-emerald-500 justify-end' : 'bg-gray-300 justify-start'}`}
                                >
                                    <span className="bg-white w-4 h-4 rounded-full shadow-sm block" />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                    {selectedChannel.name === 'whatsapp' ? 'WhatsApp Phone Number ID' : 'Developer API Client ID'}
                                </label>
                                <input
                                    type="text"
                                    value={credentials.client_id}
                                    onChange={(e) => setCredentials(prev => ({ ...prev, client_id: e.target.value }))}
                                    placeholder={selectedChannel.name === 'whatsapp' ? 'e.g. 10984857473' : 'Enter Client ID'}
                                    className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                    {selectedChannel.name === 'whatsapp' ? 'WhatsApp System User Access Token' : 'Developer API Client Secret'}
                                </label>
                                <input
                                    type="password"
                                    value={credentials.client_secret}
                                    onChange={(e) => setCredentials(prev => ({ ...prev, client_secret: e.target.value }))}
                                    placeholder={selectedChannel.name === 'whatsapp' ? 'Paste permanent Meta Access Token' : '••••••••••••••••'}
                                    className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                            <div>
                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Default Price Markup (%)</label>
                                <input
                                    type="number"
                                    value={credentials.default_markup_percent}
                                    onChange={(e) => setCredentials(prev => ({ ...prev, default_markup_percent: parseFloat(e.target.value) || 0 }))}
                                    className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                />
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Auto-Accept Orders</label>
                                <select
                                    value={credentials.auto_accept ? 'yes' : 'no'}
                                    onChange={(e) => setCredentials(prev => ({ ...prev, auto_accept: e.target.value === 'yes' }))}
                                    className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                >
                                    <option value="no">❌ Manual Confirm</option>
                                    <option value="yes">⚡ Yes, Auto-Accept</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Auto-Accept Delay (Mins)</label>
                                <input
                                    type="number"
                                    value={credentials.auto_accept_delay_mins}
                                    onChange={(e) => setCredentials(prev => ({ ...prev, auto_accept_delay_mins: parseInt(e.target.value, 10) || 0 }))}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                />
                            </div>
                        </div>

                        {selectedChannel.name === 'whatsapp' && (
                            <div className="border-t border-gray-100 pt-4 mt-2 space-y-4 text-left animate-in fade-in slide-in-from-top-2 duration-200">
                                <h4 className="text-[10px] font-black text-gray-950 uppercase tracking-wider">🛵 WhatsApp Self-Service Delivery & Packaging Settings</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Base Delivery Fee (KES)</label>
                                        <input
                                            type="number"
                                            value={credentials.base_delivery_fee}
                                            onChange={(e) => setCredentials(prev => ({ ...prev, base_delivery_fee: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Base Distance (KM)</label>
                                        <input
                                            type="number"
                                            value={credentials.base_delivery_distance}
                                            onChange={(e) => setCredentials(prev => ({ ...prev, base_delivery_distance: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Delivery Fee Per KM (KES)</label>
                                        <input
                                            type="number"
                                            value={credentials.delivery_fee_per_km}
                                            onChange={(e) => setCredentials(prev => ({ ...prev, delivery_fee_per_km: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Packaging Fee per Order (KES)</label>
                                        <input
                                            type="number"
                                            value={credentials.packaging_fee}
                                            onChange={(e) => setCredentials(prev => ({ ...prev, packaging_fee: parseFloat(e.target.value) || 0 }))}
                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Restaurant Coordinates (Lat, Lng)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                step="any"
                                                placeholder="Latitude"
                                                value={credentials.store_lat}
                                                onChange={(e) => setCredentials(prev => ({ ...prev, store_lat: parseFloat(e.target.value) || 0 }))}
                                                className="w-1/2 bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                            />
                                            <input
                                                type="number"
                                                step="any"
                                                placeholder="Longitude"
                                                value={credentials.store_lng}
                                                onChange={(e) => setCredentials(prev => ({ ...prev, store_lng: parseFloat(e.target.value) || 0 }))}
                                                className="w-1/2 bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Microsite Base URL</label>
                                        <input
                                            type="text"
                                            placeholder="https://www.pojmanagement.com"
                                            value={credentials.microsite_url}
                                            onChange={(e) => setCredentials(prev => ({ ...prev, microsite_url: e.target.value }))}
                                            className="w-full bg-gray-55 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}


                        <div className="pt-2 flex justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-150">
                            <div className="min-w-0 flex-1 mr-4">
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Generated Webhook URL</span>
                                <span className="text-[10px] font-mono font-bold text-gray-600 truncate block">
                                    {selectedChannel.name === 'whatsapp' 
                                        ? 'https://bfrvzwmckuiafkgwemdt.supabase.co/functions/v1/whatsapp-webhook' 
                                        : `${window.location.origin.replace('3000', '54321')}/functions/${selectedChannel.name}-webhook`}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleSaveChannel}
                                disabled={saving}
                                className="px-4 py-2 bg-gray-950 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0"
                            >
                                {saving ? 'Saving...' : '💾 Save Settings'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-100 shadow-sm p-6 rounded-3xl space-y-4 flex-1 flex flex-col">
                        <div>
                            <h3 className="font-black text-gray-950 text-sm">Channel Menu Overrides</h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Toggle items, override channel pricing, and specify downtime reasons.</p>
                        </div>

                        <div className="flex-1 overflow-y-auto max-h-[35vh] custom-scrollbar border border-gray-100 rounded-2xl divide-y divide-gray-100">
                            {menu.map((item) => {
                                const ovr = overrides.find(o => o.menu_item_id === item.id);
                                const isAvail = ovr ? ovr.is_available : true;
                                const basePrice = item.price || 0;
                                const markupVal = ovr ? ovr.price_markup_value : 0;
                                const markupAmt = markupVal > 0 ? markupVal : (basePrice * (credentials.default_markup_percent / 100));
                                const channelPrice = basePrice + markupAmt;

                                return (
                                    <div key={item.id} className="p-3.5 flex items-center justify-between hover:bg-gray-50/50">
                                        <div>
                                            <span className="text-xs font-bold text-gray-900 block">{item.name}</span>
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">
                                                Base Price: KES {basePrice.toLocaleString()} • Channel: KES {channelPrice.toLocaleString()}
                                            </span>
                                            {!isAvail && (
                                                <span className="inline-block mt-1 bg-red-100 text-red-800 text-[9px] font-black uppercase px-2 py-0.5 rounded">
                                                    🚫 Off ({ovr?.off_reason || 'Out of stock'} - {ovr?.off_duration || 'Indefinite'})
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setEditingOverride({
                                                    menu_item_id: item.id,
                                                    name: item.name,
                                                    is_available: isAvail,
                                                    off_reason: ovr?.off_reason || 'Out of stock',
                                                    off_duration: ovr?.off_duration || 'Indefinite',
                                                    price_markup_value: markupVal || 0
                                                })}
                                                className="px-3 py-1.5 border border-gray-200 hover:border-gray-300 rounded-xl text-[10px] font-black uppercase transition-all"
                                            >
                                                ⚙️ Configure
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-gray-900 text-white p-5 rounded-3xl space-y-3 font-mono shrink-0">
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block">System Integration Logs</span>
                        <div className="space-y-1.5 text-[10px]">
                            {logs.map((log, idx) => (
                                <div key={idx} className="flex gap-2.5">
                                    <span className="text-gray-500">[{log.time}]</span>
                                    <span className="text-gray-300">{log.msg}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
