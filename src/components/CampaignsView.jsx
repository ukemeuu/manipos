import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Users, Flame, Send, CheckCircle, AlertTriangle, RefreshCw, Check, Square, ChevronRight } from 'lucide-react';

export function CampaignsView() {
    const [guests, setGuests] = useState([]);
    const [selectedGuests, setSelectedGuests] = useState([]);
    const [menuItems, setMenuItems] = useState([]);
    const [selectedItem, setSelectedItem] = useState(null);
    const [discountPercent, setDiscountPercent] = useState(20);
    const [customMessage, setCustomMessage] = useState(
        "🔥 FLASH OFFER from Pot of Jollof! 🔥\n\nHey {{firstName}}, get our signature {{itemName}} today at {{discountPercent}}% OFF! Only KES {{promoPrice}} instead of KES {{originalPrice}}! 🥘\n\nOrder here now for instant hot delivery: {{micrositeUrl}}"
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, successes: 0, failures: 0 });
    const [sendSummary, setSendSummary] = useState(null); // { successes, failures }
    const [waConfig, setWaConfig] = useState(null);
    const [error, setError] = useState(null);

    // Fetch guests, menu, and whatsapp channel configs
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                // Fetch WhatsApp configs
                const { data: channelData } = await supabase
                    .from('pos_channels')
                    .select('*')
                    .eq('name', 'whatsapp')
                    .maybeSingle();
                setWaConfig(channelData);

                // Fetch guests with phone numbers
                const { data: guestData } = await supabase
                    .from('guests')
                    .select('*')
                    .not('phone', 'is', null)
                    .order('first_name', { ascending: true });
                setGuests(guestData || []);
                setSelectedGuests((guestData || []).map(g => g.id)); // default select all

                // Fetch active menu items
                const { data: menuData } = await supabase
                    .from('pos_menu')
                    .select('*')
                    .eq('is_available', true)
                    .order('name', { ascending: true });
                
                // Filter out delivery/package items
                const cleanMenu = (menuData || []).filter(item => 
                    !/^delivery/i.test(item.name) && !/^pack(age|aging)?\s*fee/i.test(item.name)
                );
                setMenuItems(cleanMenu);
                if (cleanMenu.length > 0) {
                    setSelectedItem(cleanMenu[0]);
                }
            } catch (err) {
                console.error("Error loading campaign data:", err);
                setError("Failed to fetch campaign resources.");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // Calculate promotional price
    const originalPrice = selectedItem ? selectedItem.price || 0 : 0;
    const promoPrice = Math.round(originalPrice * (1 - discountPercent / 100));

    // Get live interpolated message preview
    const getPreviewMessage = (guest) => {
        const guestName = guest ? guest.first_name || 'there' : 'Jane';
        const itemName = selectedItem ? selectedItem.name : 'Delicious Meal';
        const micrositeUrl = waConfig?.microsite_url 
            ? `${waConfig.microsite_url}/?phone=${guest ? guest.phone : '254700000000'}` 
            : `https://www.pojmanagement.com/?phone=${guest ? guest.phone : '254700000000'}`;

        return customMessage
            .replace(/\{\{firstName\}\}/g, guestName)
            .replace(/\{\{itemName\}\}/g, itemName)
            .replace(/\{\{discountPercent\}\}/g, discountPercent.toString())
            .replace(/\{\{promoPrice\}\}/g, promoPrice.toString())
            .replace(/\{\{originalPrice\}\}/g, originalPrice.toString())
            .replace(/\{\{micrositeUrl\}\}/g, micrositeUrl);
    };

    const handleToggleGuest = (guestId) => {
        setSelectedGuests(prev => 
            prev.includes(guestId) ? prev.filter(id => id !== guestId) : [...prev, guestId]
        );
    };

    const handleToggleAll = () => {
        if (selectedGuests.length === filteredGuests.length) {
            // Uncheck all filtered
            const filteredIds = filteredGuests.map(g => g.id);
            setSelectedGuests(prev => prev.filter(id => !filteredIds.includes(id)));
        } else {
            // Check all filtered
            const filteredIds = filteredGuests.map(g => g.id);
            setSelectedGuests(prev => {
                const combined = [...prev, ...filteredIds];
                return Array.from(new Set(combined));
            });
        }
    };

    const filteredGuests = guests.filter(g => {
        const term = searchQuery.toLowerCase().trim();
        if (!term) return true;
        const name = `${g.first_name || ''} ${g.last_name || ''}`.toLowerCase();
        const phone = (g.phone || '').toLowerCase();
        return name.includes(term) || phone.includes(term);
    });

    const handleSendBroadcast = async () => {
        if (!waConfig || !waConfig.client_id || !waConfig.client_secret) {
            alert("WhatsApp channel credentials are not configured! Go to settings and set Phone Number ID and Access Token.");
            return;
        }

        const targets = guests.filter(g => selectedGuests.includes(g.id));
        if (targets.length === 0) {
            alert("Please select at least one customer to broadcast to.");
            return;
        }

        if (!confirm(`Are you sure you want to broadcast this flash offer message to ${targets.length} customers?`)) {
            return;
        }

        setSending(true);
        setSendSummary(null);
        setProgress({ current: 0, total: targets.length, successes: 0, failures: 0 });

        const phoneId = waConfig.client_id;
        const token = waConfig.client_secret;

        for (let i = 0; i < targets.length; i++) {
            const guest = targets[i];
            const textContent = getPreviewMessage(guest);
            const rawPhone = guest.phone.trim().replace('+', '');

            try {
                // Post to Meta WhatsApp Cloud API messages endpoint
                const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        messaging_product: "whatsapp",
                        to: rawPhone,
                        type: "text",
                        text: {
                            body: textContent
                        }
                    })
                });

                const resData = await response.json();
                if (response.ok && !resData.error) {
                    setProgress(prev => ({
                        ...prev,
                        current: i + 1,
                        successes: prev.successes + 1
                    }));
                } else {
                    console.error("Meta Graph API error response:", resData);
                    setProgress(prev => ({
                        ...prev,
                        current: i + 1,
                        failures: prev.failures + 1
                    }));
                }
            } catch (err) {
                console.error("Error sending message to +", rawPhone, err);
                setProgress(prev => ({
                    ...prev,
                    current: i + 1,
                    failures: prev.failures + 1
                }));
            }

            // Slight rate-limiting delay between messages to prevent spam blocks
            await new Promise(r => setTimeout(r, 200));
        }

        setSending(false);
        setSendSummary({ successes: progress.successes, failures: progress.failures });
    };

    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 bg-gray-50/50">
                <Loader2 className="animate-spin text-primary mb-3" size={32} />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Loading Campaigns Dashboard...</span>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/50 p-4 sm:p-6 gap-5">
            {/* Header banner */}
            <div className="bg-white rounded-3xl border border-gray-150 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0 shadow-sm">
                <div>
                    <h2 className="text-lg font-black text-gray-950 flex items-center gap-2">
                        <Flame className="text-amber-500 fill-amber-500 animate-pulse" size={22} />
                        WhatsApp Flash Offer Campaigns
                    </h2>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Compose promotional meal offers and broadcast them directly to customer chat screens.</p>
                </div>
                {waConfig && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-250 bg-emerald-50 text-emerald-800 text-[10px] font-black uppercase tracking-wider shadow-inner">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        Bot Connected ({waConfig.client_id || 'No ID'})
                    </div>
                )}
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-150 text-xs font-bold flex items-center gap-2 shrink-0">
                    <AlertTriangle size={16} />
                    {error}
                </div>
            )}

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-5 overflow-hidden">
                {/* 1. COMPOSER PANEL */}
                <div className="bg-white rounded-3xl border border-gray-100 p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar shadow-sm">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block border-b border-gray-50 pb-2">1. Compose Flash Offer</span>

                    {/* Offer Item */}
                    <div>
                        <label className="block text-[9px] font-black text-gray-450 uppercase tracking-wider mb-1.5">Select Promo Item</label>
                        <select
                            value={selectedItem ? selectedItem.id : ''}
                            onChange={(e) => setSelectedItem(menuItems.find(item => item.id === e.target.value))}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-900 outline-none focus:border-primary"
                        >
                            {menuItems.map(item => (
                                <option key={item.id} value={item.id}>
                                    {item.name} (Original: KES {item.price})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Discount Input */}
                    <div>
                        <label className="block text-[9px] font-black text-gray-450 uppercase tracking-wider mb-1.5">Promo Discount Percentage (%)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                min="1"
                                max="100"
                                value={discountPercent}
                                onChange={(e) => setDiscountPercent(Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 0)))}
                                className="w-24 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-gray-950 outline-none focus:border-primary"
                            />
                            <div className="text-[11px] font-bold text-gray-500">
                                ➔ Promotional Price: <span className="text-amber-600 font-mono">KES {promoPrice}</span>
                            </div>
                        </div>
                    </div>

                    {/* Message Template Editor */}
                    <div className="flex-1 flex flex-col min-h-[220px]">
                        <label className="block text-[9px] font-black text-gray-450 uppercase tracking-wider mb-1.5">Broadcast Message Template</label>
                        <textarea
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            className="flex-1 w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-medium text-gray-900 leading-relaxed outline-none focus:border-primary resize-none custom-scrollbar"
                            placeholder="Type template..."
                        />
                        <div className="mt-1.5 text-[8px] text-gray-400 leading-normal">
                            Available Tags: <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-600">{"{{firstName}}"}</code>, <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-600">{"{{itemName}}"}</code>, <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-600">{"{{promoPrice}}"}</code>, <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-600">{"{{originalPrice}}"}</code>, <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-600">{"{{micrositeUrl}}"}</code>
                        </div>
                    </div>
                </div>

                {/* 2. RECIPIENTS PANEL */}
                <div className="bg-white rounded-3xl border border-gray-100 p-5 flex flex-col overflow-hidden shadow-sm">
                    <div className="flex justify-between items-center border-b border-gray-50 pb-2 mb-3 shrink-0">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">2. Target Audience</span>
                        <span className="text-[9px] text-gray-500 font-black">
                            Selected: {selectedGuests.length} / {guests.length}
                        </span>
                    </div>

                    {/* Search recipients */}
                    <input
                        type="text"
                        placeholder="Search guests by name or phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-bold text-gray-900 outline-none focus:border-primary mb-3 shrink-0"
                    />

                    {/* Select All Toggle */}
                    <div className="flex items-center justify-between bg-gray-50 p-2.5 rounded-2xl mb-3 shrink-0 border border-gray-150">
                        <span className="text-[9px] font-black uppercase text-gray-500">Toggle Selected List</span>
                        <button
                            type="button"
                            onClick={handleToggleAll}
                            className="text-[9px] bg-white border border-gray-200 hover:bg-gray-100 px-3 py-1.5 rounded-lg font-black text-gray-800 transition-all flex items-center gap-1 shrink-0"
                        >
                            {selectedGuests.length === filteredGuests.length ? 'Clear Filters' : 'Select All Filters'}
                        </button>
                    </div>

                    {/* Recipients List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-50 border border-gray-100 rounded-2xl">
                        {filteredGuests.length === 0 ? (
                            <div className="p-8 text-center text-xs font-bold text-gray-400">No matching WhatsApp guests found.</div>
                        ) : (
                            filteredGuests.map(guest => {
                                const isSel = selectedGuests.includes(guest.id);
                                return (
                                    <div
                                        key={guest.id}
                                        onClick={() => handleToggleGuest(guest.id)}
                                        className={`p-3 flex items-center justify-between cursor-pointer transition-all hover:bg-gray-50 ${isSel ? 'bg-primary/5' : ''}`}
                                    >
                                        <div className="min-w-0 pr-2">
                                            <div className="text-xs font-bold text-gray-900 truncate">
                                                {guest.first_name || ''} {guest.last_name || ''}
                                            </div>
                                            <div className="text-[9px] font-mono text-gray-400 mt-0.5">
                                                +{guest.phone}
                                            </div>
                                        </div>
                                        <button type="button" className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${isSel ? 'bg-black border-black text-white' : 'border-gray-200 bg-white'}`}>
                                            {isSel && <Check size={14} />}
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* 3. PREVIEW & STATUS PANEL */}
                <div className="bg-white rounded-3xl border border-gray-100 p-5 flex flex-col gap-4 overflow-y-auto custom-scrollbar shadow-sm">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block border-b border-gray-50 pb-2">3. Outbound Message Preview</span>

                    {/* Sample Message Bubble */}
                    <div className="bg-emerald-50/65 rounded-3xl border border-emerald-100 p-4.5 text-xs text-neutral-800 leading-relaxed shadow-inner">
                        <div className="flex items-center gap-1.5 text-emerald-800 font-black uppercase text-[8px] tracking-wider mb-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            Live Chat Screen Preview
                        </div>
                        <div className="whitespace-pre-line text-neutral-900 leading-relaxed">
                            {getPreviewMessage(guests.find(g => selectedGuests.includes(g.id)) || guests[0])}
                        </div>
                    </div>

                    {/* Action button */}
                    <div className="pt-2">
                        {sending ? (
                            <div className="space-y-3.5 bg-gray-50 border border-gray-150 p-4 rounded-2xl">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase text-gray-500">
                                    <span>Broadcasting...</span>
                                    <span>{progress.current} / {progress.total}</span>
                                </div>
                                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                    <div
                                        className="bg-black h-full rounded-full transition-all duration-350"
                                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px] text-center font-bold">
                                    <div className="bg-emerald-50 border border-emerald-150 text-emerald-800 py-1.5 rounded-xl">
                                        ✓ Success: {progress.successes}
                                    </div>
                                    <div className="bg-red-50 border border-red-150 text-red-700 py-1.5 rounded-xl">
                                        ✕ Failed: {progress.failures}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSendBroadcast}
                                disabled={selectedGuests.length === 0}
                                className="w-full py-4 bg-black hover:bg-neutral-850 disabled:opacity-40 text-white font-black text-sm rounded-2xl transition-all shadow-xl shadow-black/10 flex items-center justify-center gap-2"
                            >
                                <Send size={16} />
                                Broadcast to {selectedGuests.length} Guests
                            </button>
                        )}
                    </div>

                    {/* Final report status */}
                    <AnimatePresence>
                        {sendSummary && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="bg-gray-50 border border-gray-150 p-4.5 rounded-3xl space-y-2 mt-2"
                            >
                                <h4 className="text-xs font-black text-gray-950 flex items-center gap-1.5">
                                    <CheckCircle className="text-emerald-500" size={18} />
                                    Broadcast Completed!
                                </h4>
                                <p className="text-[10px] text-gray-550 leading-relaxed font-medium">
                                    The campaign has been successfully broadcast to selected targets. Success rate: <span className="font-bold text-gray-900">{Math.round((sendSummary.successes / (sendSummary.successes + sendSummary.failures || 1)) * 100)}%</span>.
                                </p>
                                <div className="flex gap-4 pt-1.5 text-[10px] font-bold">
                                    <div className="text-emerald-700">✓ Delivered: {sendSummary.successes}</div>
                                    <div className="text-red-650">✕ Errors: {sendSummary.failures}</div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
