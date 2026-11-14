import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Search, ShoppingBag, Plus, Minus, Trash2, User, Phone,
  MapPin, Tag, CreditCard, Banknote, Smartphone, CheckCircle2, Loader2,
  Gift, Layers, Store, UtensilsCrossed, Truck, Clock, X, Bookmark, Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveEffectivePrice } from '../../lib/tenantConfig';
import { initiateStkPush } from '../../lib/mpesa';

const SALES_CHANNELS = [
  'Web POS',
  'Call Center',
  'WhatsApp',
  'POS',
  'Glovo',
  'Bolt',
  'Uber Eats',
];

const PAYMENT_TENDERS = [
  { id: 'Cash', label: 'Cash', icon: Banknote },
  { id: 'CARD', label: 'Card / PDQ', icon: CreditCard },
  { id: 'MPESA Paybill', label: 'MPESA Paybill', icon: Smartphone },
  { id: 'MPESA TILL', label: 'MPESA TILL', icon: Smartphone },
  { id: 'GLOVO', label: 'GLOVO', icon: Truck },
  { id: 'UBER EATS', label: 'UBER EATS', icon: Truck },
  { id: 'BOLT FOOD', label: 'BOLT FOOD', icon: Truck },
  { id: 'Transfer', label: 'Bank Transfer', icon: CreditCard },
  { id: 'Prepaid', label: 'Prepaid', icon: CheckCircle2 },
  { id: 'Voucher', label: 'Voucher', icon: Tag },
  { id: 'Store Credit', label: 'Store Credit', icon: Bookmark },
  { id: 'Split Payment', label: 'Split Payment', icon: Layers },
  { id: 'Paid to App', label: 'Paid to App', icon: GlobeIcon },
];

function GlobeIcon(props) {
  return <Store {...props} />;
}

function makeUuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `pos_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function safeInsertOrder(payload) {
  let attempt = { ...payload };
  const optionalCols = ['idempotency_key', 'sales_channel', 'branch_id', 'delivery_fee', 'delivery_provider'];
  for (let i = 0; i <= optionalCols.length; i += 1) {
    const res = await supabase
      .from('pos_orders')
      .insert([attempt])
      .select('id, ticket_number')
      .single();
    if (!res.error) return res;
    const msg = String(res.error?.message || res.error?.details || '');
    const missing = optionalCols.find((col) => col in attempt && msg.toLowerCase().includes(col));
    if (!missing) return res;
    const next = { ...attempt };
    delete next[missing];
    attempt = next;
  }
  return supabase.from('pos_orders').insert([payload]).select('id, ticket_number').single();
}

export function WebPosView({
  restaurantId,
  restaurantName = 'ManiPOS Store',
  tenantSlug,
  activeBranch = null,
  staffName = 'Web POS Staff',
  initialOrder = null,
  onBackToOrders,
  onOrderPlaced,
}) {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [combos, setCombos] = useState([]);
  const [guests, setGuests] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [salesChannel, setSalesChannel] = useState('Web POS');

  // Customer selection
  const [customerMode, setCustomerMode] = useState('guest'); // 'guest' | 'lookup'
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [customerName, setCustomerName] = useState(initialOrder?.customer_name || 'Guest Customer');
  const [customerPhone, setCustomerPhone] = useState('');

  // Cart & instructions
  const [cart, setCart] = useState([]);
  const [orderInstructions, setOrderInstructions] = useState(initialOrder?.notes || '');
  const [step, setStep] = useState(initialOrder ? 'settle' : 'build'); // 'build' | 'settle'

  // Settle state
  const [diningMode, setDiningMode] = useState(() => {
    const d = String(initialOrder?.dining_option || '').toLowerCase();
    if (d.includes('deliv')) return 'Delivery';
    if (d.includes('dine')) return 'Dine In';
    return 'Pickup';
  });
  const [tableNumber, setTableNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(Number(initialOrder?.delivery_fee || 0));
  const [promoCode, setPromoCode] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [paymentTender, setPaymentTender] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [splitBreakdown, setSplitBreakdown] = useState('');
  const [sendStk, setSendStk] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [placedOrder, setPlacedOrder] = useState(null);

  // Item customization modal state
  const [customizingItem, setCustomizingItem] = useState(null);
  const [selectedVariation, setSelectedVariation] = useState(null);
  const [modSelections, setModSelections] = useState({});
  const [selectedAdditions, setSelectedAdditions] = useState([]);
  const [itemQty, setItemQty] = useState(1);
  const [itemNote, setItemNote] = useState('');
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      if (!restaurantId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [catRes, menuRes, modRes, comboRes, guestRes] = await Promise.all([
          supabase
            .from('pos_categories')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('display_order', { ascending: true }),
          supabase
            .from('pos_menu')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('display_order', { ascending: true }),
          supabase
            .from('menu_modifier_groups')
            .select('*')
            .eq('restaurant_id', restaurantId),
          supabase
            .from('menu_combos')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('is_active', true),
          supabase
            .from('guests')
            .select('id, first_name, last_name, phone, delivery_address')
            .eq('restaurant_id', restaurantId)
            .order('created_at', { ascending: false })
            .limit(80),
        ]);

        if (!active) return;
        if (!catRes.error) setCategories(catRes.data || []);
        if (!menuRes.error) setMenuItems((menuRes.data || []).filter((m) => m.is_available !== false));
        if (!modRes.error) setModifierGroups(modRes.data || []);
        if (!comboRes.error) setCombos(comboRes.data || []);
        if (!guestRes.error) setGuests(guestRes.data || []);
      } catch (err) {
        console.warn('WebPOS load error:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCatalog();
    return () => {
      active = false;
    };
  }, [restaurantId]);

  // Hydrate initial open order items when settling an Open order
  useEffect(() => {
    if (!initialOrder?.id) return;
    const rawItems = Array.isArray(initialOrder.pos_order_items) && initialOrder.pos_order_items.length > 0
      ? initialOrder.pos_order_items
      : Array.isArray(initialOrder.items)
        ? initialOrder.items
        : [];
    if (rawItems.length > 0) {
      setCart(
        rawItems.map((row, idx) => ({
          key: `existing_${row.id || idx}`,
          id: null,
          title: row.item_name,
          unitPrice: Number(row.price || 0),
          quantity: Number(row.quantity || 1),
          summary: row.instructions || '',
          isExisting: true,
        }))
      );
    }
  }, [initialOrder]);

  const modifierMap = useMemo(() => {
    const map = new Map();
    modifierGroups.forEach((g) => map.set(g.id, g));
    return map;
  }, [modifierGroups]);

  const categoryTabs = useMemo(() => {
    const set = new Set();
    categories.forEach((c) => c.name && set.add(c.name));
    menuItems.forEach((m) => set.add(m.category || 'Uncategorized'));
    const list = ['All', ...Array.from(set)];
    if (combos.length > 0) list.push('Combos');
    return list;
  }, [categories, menuItems, combos]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'Combos') return [];
    let list = menuItems;
    if (activeBranch?.id) {
      list = list.filter((i) => !i.branch_id || i.branch_id === activeBranch.id);
    }
    if (selectedCategory !== 'All') {
      list = list.filter((i) => (i.category || 'Uncategorized') === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          (i.name || '').toLowerCase().includes(q) ||
          (i.description || '').toLowerCase().includes(q) ||
          (i.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [menuItems, selectedCategory, search, activeBranch]);

  const filteredCombos = useMemo(() => {
    if (selectedCategory !== 'All' && selectedCategory !== 'Combos') return [];
    if (!search.trim()) return combos;
    const q = search.toLowerCase();
    return combos.filter((c) => (c.name || '').toLowerCase().includes(q));
  }, [combos, selectedCategory, search]);

  const filteredGuests = useMemo(() => {
    if (!guestSearch.trim()) return guests.slice(0, 12);
    const q = guestSearch.toLowerCase();
    return guests
      .filter((g) => {
        const full = `${g.first_name || ''} ${g.last_name || ''} ${g.phone || ''}`.toLowerCase();
        return full.includes(q);
      })
      .slice(0, 15);
  }, [guests, guestSearch]);

  const openCustomize = (item) => {
    const variations = Array.isArray(item.variations) ? item.variations : [];
    const additions = Array.isArray(item.additions) ? item.additions : [];
    const linkedIds = Array.isArray(item.modifier_group_ids) ? item.modifier_group_ids : [];
    const linkedGroups = linkedIds.map((id) => modifierMap.get(id)).filter(Boolean);

    // Quick add if item has zero variations, modifiers, or additions
    if (variations.length === 0 && linkedGroups.length === 0 && additions.length === 0) {
      const effective = resolveEffectivePrice(item);
      setCart((prev) => {
        const existingIdx = prev.findIndex((c) => c.id === item.id && !c.summary);
        if (existingIdx >= 0) {
          return prev.map((c, i) => (i === existingIdx ? { ...c, quantity: c.quantity + 1 } : c));
        }
        return [
          ...prev,
          {
            key: `${item.id}_${Date.now()}`,
            id: item.id,
            title: item.name,
            unitPrice: effective,
            quantity: 1,
            summary: '',
          },
        ];
      });
      return;
    }

    const initMods = {};
    linkedGroups.forEach((g) => {
      initMods[g.id] = {};
    });
    setCustomizingItem({ item, variations, additions, linkedGroups });
    setSelectedVariation(variations[0] || null);
    setModSelections(initMods);
    setSelectedAdditions([]);
    setItemQty(1);
    setItemNote('');
    setModalError('');
  };

  const toggleModOption = (group, optName, delta = null) => {
    const allowMultiple = Boolean(group.allow_multiple);
    const maxSel = Number(group.max_selected || 1);
    setModSelections((prev) => {
      const cur = { ...(prev[group.id] || {}) };
      const currentCount = Object.values(cur).reduce((s, n) => s + Number(n || 0), 0);

      if (allowMultiple && delta !== null) {
        const nextQty = Math.max(0, Number(cur[optName] || 0) + delta);
        if (delta > 0 && maxSel > 0 && currentCount >= maxSel) return prev;
        if (nextQty === 0) delete cur[optName];
        else cur[optName] = nextQty;
        return { ...prev, [group.id]: cur };
      }

      if (maxSel <= 1) {
        if (cur[optName]) {
          delete cur[optName];
          return { ...prev, [group.id]: {} };
        }
        return { ...prev, [group.id]: { [optName]: 1 } };
      }

      if (cur[optName]) {
        delete cur[optName];
      } else {
        if (currentCount >= maxSel) return prev;
        cur[optName] = 1;
      }
      return { ...prev, [group.id]: cur };
    });
    setModalError('');
  };

  const modalUnitPrice = useMemo(() => {
    if (!customizingItem) return 0;
    const { item, additions, linkedGroups } = customizingItem;
    let base = resolveEffectivePrice(item);
    if (selectedVariation && Number(selectedVariation.price || 0) > 0) {
      base = Number(selectedVariation.price);
    }
    let extras = 0;
    linkedGroups.forEach((g) => {
      const picks = modSelections[g.id] || {};
      (g.options || []).forEach((opt) => {
        const qty = Number(picks[opt.name] || 0);
        if (qty > 0) extras += Number(opt.price || 0) * qty;
      });
    });
    selectedAdditions.forEach((addName) => {
      const found = additions.find((a) => a.name === addName);
      if (found) extras += Number(found.price || 0);
    });
    return base + extras;
  }, [customizingItem, selectedVariation, modSelections, selectedAdditions]);

  const confirmCustomItem = () => {
    if (!customizingItem) return;
    const { item, linkedGroups } = customizingItem;

    for (const g of linkedGroups) {
      const picks = modSelections[g.id] || {};
      const total = Object.values(picks).reduce((s, n) => s + Number(n || 0), 0);
      const minReq = g.is_required ? Math.max(1, Number(g.min_selected || 1)) : Number(g.min_selected || 0);
      if (total < minReq) {
        setModalError(`"${g.name}" requires at least ${minReq} selection(s).`);
        return;
      }
    }

    const parts = [];
    if (selectedVariation?.name) parts.push(`Variation: ${selectedVariation.name}`);
    linkedGroups.forEach((g) => {
      const picks = modSelections[g.id] || {};
      const labels = Object.entries(picks)
        .filter(([, q]) => q > 0)
        .map(([n, q]) => (q > 1 ? `${q}x ${n}` : n));
      if (labels.length > 0) parts.push(`${g.name}: ${labels.join(', ')}`);
    });
    if (selectedAdditions.length > 0) parts.push(`Additions: ${selectedAdditions.join(', ')}`);
    if (itemNote.trim()) parts.push(`Note: ${itemNote.trim()}`);

    setCart((prev) => [
      ...prev,
      {
        key: `${item.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        id: item.id,
        title: selectedVariation?.name ? `${item.name} (${selectedVariation.name})` : item.name,
        unitPrice: modalUnitPrice,
        quantity: itemQty,
        summary: parts.join(' | '),
      },
    ]);
    setCustomizingItem(null);
  };

  const addComboToCart = (combo) => {
    const comboPrice = Number(combo.price || 0);
    const itemsSummary = Array.isArray(combo.free_items) && combo.free_items.length > 0
      ? `Combo (${combo.free_items.length} items)`
      : 'Combo Deal';
    setCart((prev) => [
      ...prev,
      {
        key: `combo_${combo.id}_${Date.now()}`,
        id: null,
        title: combo.name,
        unitPrice: comboPrice,
        quantity: 1,
        summary: itemsSummary,
      },
    ]);
  };

  const subtotal = useMemo(
    () => cart.reduce((s, item) => s + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0),
    [cart]
  );

  const discountAmount = useMemo(() => {
    if (!appliedDiscount) return 0;
    const val = Number(appliedDiscount.discount_value || appliedDiscount.value || 0);
    if (appliedDiscount.discount_type === 'percentage') {
      return Math.round((subtotal * val) / 100);
    }
    return Math.min(subtotal, val);
  }, [appliedDiscount, subtotal]);

  const appliedDeliveryFee = diningMode === 'Delivery' ? Number(deliveryFee || 0) : 0;
  const grandTotal = Math.max(0, subtotal - discountAmount + appliedDeliveryFee);

  const handleApplyPromo = async () => {
    setPromoError('');
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    const { data, error } = await supabase
      .from('pos_discounts')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .ilike('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      setPromoError('Promo code not found or inactive.');
      setAppliedDiscount(null);
      return;
    }
    setAppliedDiscount(data);
  };

  const handleSubmitOrder = async ({ saveAsOpen = false }) => {
    if (cart.length === 0) {
      setErrorMsg('Add at least one item to the order first.');
      return;
    }
    if (!saveAsOpen && diningMode === 'Delivery' && !deliveryAddress.trim()) {
      setErrorMsg('Delivery orders require a delivery address.');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      const diningVal = diningMode === 'Pickup' ? 'Takeaway' : diningMode;
      const isSettledNow = !saveAsOpen && paymentTender !== 'Paid to App';
      const noteParts = [
        orderInstructions.trim(),
        diningMode === 'Dine In' && tableNumber.trim() ? `Table: ${tableNumber.trim()}` : '',
        diningMode === 'Delivery' && deliveryAddress.trim() ? `Delivery Address: ${deliveryAddress.trim()}` : '',
        customerPhone.trim() ? `Phone: ${customerPhone.trim()}` : '',
        appliedDiscount ? `Promo: ${appliedDiscount.code} (-KES ${discountAmount.toLocaleString()})` : '',
        paymentReference.trim() ? `Payment Ref: ${paymentReference.trim()}` : '',
        paymentTender === 'Split Payment' && splitBreakdown.trim() ? `Split: ${splitBreakdown.trim()}` : '',
      ].filter(Boolean);

      if (initialOrder?.id) {
        // Settle or update an existing Open order
        const { error: updErr } = await supabase
          .from('pos_orders')
          .update({
            customer_name: customerName.trim() || 'Guest Customer',
            dining_option: diningVal,
            payment_method: saveAsOpen ? 'Cash' : paymentTender,
            payment_status: saveAsOpen ? 'Pending' : isSettledNow ? 'Paid' : 'Pending',
            status: saveAsOpen ? 'Open' : 'Completed',
            total_amount: grandTotal,
            discount: discountAmount,
            mpesa_receipt: paymentReference.trim() || initialOrder.mpesa_receipt || null,
            notes: noteParts.join(' | ') || initialOrder.notes || null,
          })
          .eq('id', initialOrder.id);
        if (updErr) throw updErr;

        setPlacedOrder({
          id: initialOrder.id,
          ticketNumber: initialOrder.ticket_number || 'UPDATED',
          total: grandTotal,
          status: saveAsOpen ? 'Open' : 'Completed',
        });
        if (onOrderPlaced) onOrderPlaced();
        return;
      }

      const payload = {
        restaurant_id: restaurantId,
        customer_name: customerName.trim() || 'Guest Customer',
        dining_option: diningVal,
        payment_method: saveAsOpen ? 'Cash' : paymentTender,
        payment_status: saveAsOpen ? 'Pending' : isSettledNow ? 'Paid' : 'Pending',
        status: saveAsOpen ? 'Open' : 'Processing',
        total_amount: grandTotal,
        discount: discountAmount,
        cashier_name: staffName,
        brand: restaurantName.toUpperCase(),
        order_channel: salesChannel === 'Web POS' ? 'POS' : salesChannel,
        sales_channel: salesChannel,
        branch_id: activeBranch?.id || null,
        delivery_fee: appliedDeliveryFee,
        mpesa_receipt: paymentReference.trim() || null,
        notes: noteParts.join(' | ') || null,
        guest_id: selectedGuest?.id || null,
        idempotency_key: makeUuid(),
      };

      const { data: orderData, error: orderErr } = await safeInsertOrder(payload);
      if (orderErr) throw orderErr;

      const itemsPayload = cart.map((item) => ({
        order_id: orderData.id,
        item_name: item.title,
        quantity: item.quantity,
        price: item.unitPrice,
        instructions: item.summary || null,
        status: saveAsOpen ? 'Open' : 'Pending',
      }));

      if (appliedDeliveryFee > 0) {
        itemsPayload.push({
          order_id: orderData.id,
          item_name: 'Delivery Fee',
          quantity: 1,
          price: appliedDeliveryFee,
          instructions: 'Dispatch Delivery Charge',
          status: 'Pending',
        });
      }

      const { error: itemsErr } = await supabase.from('pos_order_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // Optional STK push if enabled and M-Pesa requested
      if (
        !saveAsOpen &&
        sendStk &&
        (paymentTender === 'MPESA Paybill' || paymentTender === 'MPESA TILL') &&
        customerPhone.trim() &&
        import.meta.env.VITE_MPESA_ENABLED === 'true'
      ) {
        try {
          await initiateStkPush({
            orderId: orderData.id,
            phone: customerPhone.trim(),
            ticketNumber: orderData.ticket_number,
          });
        } catch (stkErr) {
          console.warn('WebPOS STK push note:', stkErr);
        }
      }

      setPlacedOrder({
        id: orderData.id,
        ticketNumber: orderData.ticket_number,
        total: grandTotal,
        status: saveAsOpen ? 'Open' : 'Processing',
      });
      setCart([]);
      if (onOrderPlaced) onOrderPlaced();
    } catch (err) {
      console.error('WebPOS submit error:', err);
      setErrorMsg(err.message || 'Could not save order.');
    } finally {
      setSubmitting(false);
    }
  };

  if (placedOrder) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-xl mx-auto my-8 text-center shadow-sm">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-black text-slate-900">
          {placedOrder.status === 'Open' ? 'Order Saved as Open Tab' : 'Order Placed Successfully'}
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Ticket <span className="font-mono font-bold text-slate-900">#{placedOrder.ticketNumber}</span> · KES{' '}
          {Number(placedOrder.total).toLocaleString()}
        </p>
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={() => {
              setPlacedOrder(null);
              setStep('build');
              setOrderInstructions('');
              setPaymentReference('');
              setAppliedDiscount(null);
              setPromoCode('');
            }}
            className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold"
          >
            + Create Another Order
          </button>
          {onBackToOrders && (
            <button
              type="button"
              onClick={onBackToOrders}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold"
            >
              Back to Live Orders
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Top Bar */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBackToOrders && (
            <button
              type="button"
              onClick={onBackToOrders}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Orders
            </button>
          )}
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              {initialOrder ? `Settle Open Order #${initialOrder.ticket_number || initialOrder.id?.slice(0, 6)}` : 'Web POS — Create Order'}
              {activeBranch?.name && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {activeBranch.name}
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              {restaurantName} · {step === 'build' ? 'Catalog & Cart' : 'Settle & Payment'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Channel</label>
          <select
            value={salesChannel}
            onChange={(e) => setSalesChannel(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          >
            {SALES_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px]">
        {/* Left: Categories Rail (hidden during settle for cleaner payment view on smaller screens) */}
        {step === 'build' && (
          <aside className="lg:col-span-2 border-r border-slate-200 bg-slate-50/50 p-3 space-y-1 max-h-[680px] overflow-y-auto">
            <p className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
              Categories
            </p>
            {categoryTabs.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition ${
                  selectedCategory === cat
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                {cat}
              </button>
            ))}
          </aside>
        )}

        {/* Center: Menu & Customer Bar OR Settle Panel */}
        <section className={`${step === 'build' ? 'lg:col-span-6' : 'lg:col-span-7'} p-4 border-r border-slate-200 max-h-[680px] overflow-y-auto`}>
          {step === 'build' ? (
            <>
              {/* Search + Customer Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search dishes, drinks, combos..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerMode(customerMode === 'lookup' ? 'guest' : 'lookup')}
                    className="flex-1 flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <User className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span className="truncate">{customerName || 'Guest Customer'}</span>
                    </span>
                    <span className="text-[10px] text-emerald-700 uppercase">Change</span>
                  </button>
                </div>
              </div>

              {customerMode === 'lookup' && (
                <div className="mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        setSelectedGuest(null);
                      }}
                      placeholder="Customer Name"
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                    />
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone (e.g. 0712345678)"
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                    />
                  </div>
                  <input
                    type="text"
                    value={guestSearch}
                    onChange={(e) => setGuestSearch(e.target.value)}
                    placeholder="Search saved guests by name or phone..."
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                  />
                  {filteredGuests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {filteredGuests.map((g) => {
                        const label = `${g.first_name || ''} ${g.last_name || ''}`.trim() || g.phone;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              setSelectedGuest(g);
                              setCustomerName(label);
                              setCustomerPhone(g.phone || '');
                              if (g.delivery_address) setDeliveryAddress(g.delivery_address);
                              setCustomerMode('guest');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-600 text-[11px] font-semibold text-slate-700"
                          >
                            {label} {g.phone ? `· ${g.phone}` : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {loading ? (
                <div className="py-16 flex items-center justify-center text-slate-400 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading catalog...
                </div>
              ) : (
                <div className="space-y-5">
                  {filteredCombos.length > 0 && (
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5 text-amber-500" /> Combos
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {filteredCombos.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => addComboToCart(c)}
                            className="text-left p-3 rounded-xl border border-amber-200 bg-amber-50/40 hover:border-amber-400 transition"
                          >
                            <p className="text-xs font-bold text-slate-900 truncate">{c.name}</p>
                            <p className="text-[11px] font-black text-emerald-700 mt-1">
                              KES {Number(c.price || 0).toLocaleString()}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {filteredItems.map((item) => {
                      const effPrice = resolveEffectivePrice(item);
                      const hasSpecial = effPrice !== Number(item.price || 0);
                      const hasCustoms =
                        (item.variations?.length || 0) > 0 ||
                        (item.additions?.length || 0) > 0 ||
                        (item.modifier_group_ids?.length || 0) > 0;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openCustomize(item)}
                          className="text-left rounded-xl border border-slate-200 hover:border-emerald-600 hover:shadow-sm bg-white p-2.5 flex flex-col justify-between transition group"
                        >
                          <div>
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-full h-24 object-cover rounded-lg mb-2 bg-slate-100"
                              />
                            ) : (
                              <div className="w-full h-16 rounded-lg mb-2 bg-slate-100 flex items-center justify-center text-slate-400 text-[11px] font-bold">
                                {(item.category || 'ITEM').slice(0, 14)}
                              </div>
                            )}
                            <p className="text-xs font-bold text-slate-900 line-clamp-2 group-hover:text-emerald-800">
                              {item.name}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <div>
                              <span className="text-xs font-black text-emerald-700">
                                KES {effPrice.toLocaleString()}
                              </span>
                              {hasSpecial && (
                                <span className="ml-1 text-[10px] line-through text-slate-400">
                                  {Number(item.price).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {hasCustoms && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                Options
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {filteredItems.length === 0 && filteredCombos.length === 0 && (
                      <div className="col-span-full py-12 text-center text-slate-400 text-xs">
                        No catalog items match "{search || selectedCategory}".
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* SETTLE STEP */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">1. Fulfillment & Customer</h3>
                {!initialOrder && (
                  <button
                    type="button"
                    onClick={() => setStep('build')}
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Edit Items
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'Dine In', icon: UtensilsCrossed },
                  { id: 'Pickup', icon: Store },
                  { id: 'Delivery', icon: Truck },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const active = diningMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDiningMode(opt.id)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {opt.id}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Phone</label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="07..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              {diningMode === 'Dine In' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Table Number / Name</label>
                  <input
                    type="text"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder="e.g. T4 or Terrace 2"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              )}

              {diningMode === 'Delivery' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Delivery Address *</label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Street, estate, landmark..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Delivery Fee (KES)</label>
                    <input
                      type="number"
                      min="0"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(Math.max(0, Number(e.target.value || 0)))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                </div>
              )}

              {/* Promo */}
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Promo / Discount Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="Enter code..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleApplyPromo}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                  >
                    Apply
                  </button>
                </div>
                {promoError && <p className="text-xs text-rose-600 mt-1">{promoError}</p>}
                {appliedDiscount && (
                  <p className="text-xs text-emerald-700 font-bold mt-1">
                    Applied {appliedDiscount.code}: -KES {discountAmount.toLocaleString()}
                  </p>
                )}
              </div>

              {/* 13 Orda Payment Tenders */}
              <div>
                <h3 className="text-sm font-black text-slate-900 mb-2">2. Select Payment Tender</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PAYMENT_TENDERS.map((tender) => {
                    const Icon = tender.icon;
                    const active = paymentTender === tender.id;
                    return (
                      <button
                        key={tender.id}
                        type="button"
                        onClick={() => setPaymentTender(tender.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold flex items-center gap-2 transition ${
                          active
                            ? 'bg-emerald-50 border-emerald-700 text-emerald-900 ring-1 ring-emerald-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{tender.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(paymentTender === 'MPESA Paybill' ||
                paymentTender === 'MPESA TILL' ||
                paymentTender === 'CARD' ||
                paymentTender === 'Transfer' ||
                paymentTender === 'Voucher') && (
                <div className="space-y-2">
                  <label className="block text-[11px] font-bold uppercase text-slate-500">
                    Transaction / Receipt Reference (optional)
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. UCD8K92LM0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-mono uppercase"
                  />
                  {(paymentTender === 'MPESA Paybill' || paymentTender === 'MPESA TILL') &&
                    import.meta.env.VITE_MPESA_ENABLED === 'true' && (
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={sendStk}
                          onChange={(e) => setSendStk(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-700"
                        />
                        Send M-Pesa STK Push to customer phone on Place Order
                      </label>
                    )}
                </div>
              )}

              {paymentTender === 'Split Payment' && (
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                    Split Breakdown Notes
                  </label>
                  <input
                    type="text"
                    value={splitBreakdown}
                    onChange={(e) => setSplitBreakdown(e.target.value)}
                    placeholder="e.g. Cash KES 1,000 + MPESA KES 500"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right: Cart & Actions */}
        <aside className={`${step === 'build' ? 'lg:col-span-4' : 'lg:col-span-5'} p-4 bg-slate-50/40 flex flex-col justify-between`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-emerald-700" />
                Order Cart ({cart.reduce((s, c) => s + Number(c.quantity || 1), 0)})
              </h3>
              {cart.length > 0 && !initialOrder && (
                <button
                  type="button"
                  onClick={() => {
                    setCart([]);
                    setStep('build');
                  }}
                  className="text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="py-14 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl bg-white">
                  Click menu items on the left to build the order.
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.key} className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                      {item.summary && (
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{item.summary}</p>
                      )}
                      <p className="text-[11px] font-bold text-emerald-700 mt-1">
                        KES {(item.unitPrice * item.quantity).toLocaleString()}
                      </p>
                    </div>
                    {!item.isExisting && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) =>
                              prev
                                .map((c) => (c.key === item.key ? { ...c, quantity: c.quantity - 1 } : c))
                                .filter((c) => c.quantity > 0)
                            )
                          }
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-black text-slate-900">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) =>
                              prev.map((c) => (c.key === item.key ? { ...c, quantity: c.quantity + 1 } : c))
                            )
                          }
                          className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Order Instructions
              </label>
              <textarea
                rows={2}
                value={orderInstructions}
                onChange={(e) => setOrderInstructions(e.target.value)}
                placeholder="Kitchen notes, cutlery, allergies..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-200 space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="font-bold">KES {subtotal.toLocaleString()}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-bold">-KES {discountAmount.toLocaleString()}</span>
                </div>
              )}
              {appliedDeliveryFee > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee</span>
                  <span className="font-bold">KES {appliedDeliveryFee.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 pt-1.5 border-t border-slate-200">
                <span>Total</span>
                <span>KES {grandTotal.toLocaleString()}</span>
              </div>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            {step === 'build' ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={submitting || cart.length === 0}
                  onClick={() => handleSubmitOrder({ saveAsOpen: true })}
                  className="py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 disabled:opacity-50"
                >
                  Save Order (Open)
                </button>
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setStep('settle')}
                  className="py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold disabled:opacity-50"
                >
                  Continue to Settle →
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={submitting || cart.length === 0}
                  onClick={() => handleSubmitOrder({ saveAsOpen: false })}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {initialOrder ? `Settle Tab · KES ${grandTotal.toLocaleString()}` : `Place Order · KES ${grandTotal.toLocaleString()}`}
                </button>
                <button
                  type="button"
                  disabled={submitting || cart.length === 0}
                  onClick={() => handleSubmitOrder({ saveAsOpen: true })}
                  className="w-full py-2 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 disabled:opacity-50"
                >
                  Keep Open (Pay Later)
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Item Customization Modal */}
      {customizingItem && (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h4 className="text-base font-black text-slate-900">{customizingItem.item.name}</h4>
                <p className="text-xs text-slate-500">Customize variations, modifiers & additions</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizingItem(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {customizingItem.variations.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                    Select Size / Variation
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {customizingItem.variations.map((v) => {
                      const active = selectedVariation?.name === v.name;
                      return (
                        <button
                          key={v.name}
                          type="button"
                          onClick={() => setSelectedVariation(v)}
                          className={`p-2.5 rounded-xl border text-left text-xs font-bold ${
                            active
                              ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div>{v.name}</div>
                          <div className="text-[11px] text-emerald-700">KES {Number(v.price || 0).toLocaleString()}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {customizingItem.linkedGroups.map((g) => {
                const picks = modSelections[g.id] || {};
                const minReq = g.is_required ? Math.max(1, Number(g.min_selected || 1)) : Number(g.min_selected || 0);
                return (
                  <div key={g.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black uppercase tracking-wider text-slate-700">{g.name}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {g.is_required ? `Required · Min ${minReq}` : `Optional · Max ${g.max_selected || 1}`}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {(g.options || []).map((opt) => {
                        const qty = Number(picks[opt.name] || 0);
                        return (
                          <div
                            key={opt.name}
                            onClick={() => !g.allow_multiple && toggleModOption(g, opt.name)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                              qty > 0
                                ? 'border-emerald-600 bg-emerald-50/50'
                                : 'border-slate-200 hover:bg-slate-50'
                            } ${!g.allow_multiple ? 'cursor-pointer' : ''}`}
                          >
                            <div>
                              <span className="font-bold text-slate-900">{opt.name}</span>
                              {Number(opt.price || 0) > 0 && (
                                <span className="ml-2 text-emerald-700 font-semibold">
                                  +KES {Number(opt.price).toLocaleString()}
                                </span>
                              )}
                            </div>
                            {g.allow_multiple ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleModOption(g, opt.name, -1)}
                                  className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-4 text-center font-black">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => toggleModOption(g, opt.name, 1)}
                                  className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <input type="checkbox" readOnly checked={qty > 0} className="rounded text-emerald-700" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {customizingItem.additions.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2">
                    Additions / Extras
                  </p>
                  <div className="space-y-1.5">
                    {customizingItem.additions.map((add) => {
                      const checked = selectedAdditions.includes(add.name);
                      return (
                        <label
                          key={add.name}
                          className={`p-2.5 rounded-xl border flex items-center justify-between text-xs cursor-pointer ${
                            checked ? 'border-emerald-600 bg-emerald-50/50' : 'border-slate-200'
                          }`}
                        >
                          <span className="font-bold text-slate-900">
                            {add.name}{' '}
                            {Number(add.price || 0) > 0 && (
                              <span className="text-emerald-700">+KES {Number(add.price).toLocaleString()}</span>
                            )}
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedAdditions((prev) =>
                                checked ? prev.filter((x) => x !== add.name) : [...prev, add.name]
                              )
                            }
                            className="rounded text-emerald-700"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Special Note</label>
                <input
                  type="text"
                  value={itemNote}
                  onChange={(e) => setItemNote(e.target.value)}
                  placeholder="No onions, extra spicy..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              {modalError && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                  {modalError}
                </p>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setItemQty((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center font-bold"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm font-black">{itemQty}</span>
                <button
                  type="button"
                  onClick={() => setItemQty((q) => q + 1)}
                  className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center font-bold"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                onClick={confirmCustomItem}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black"
              >
                Add to Order · KES {(modalUnitPrice * itemQty).toLocaleString()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
