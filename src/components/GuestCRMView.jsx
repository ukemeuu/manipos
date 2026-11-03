import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Search, Plus, Star, Edit, Trash2, Calendar, DollarSign, X, CheckCircle, AlertTriangle, Loader2, Tag, Utensils, MessageSquare, TrendingUp, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { fetchCustomerFeedback } from '../lib/feedbackService';
import { FeedbackDashboardView } from './FeedbackDashboardView';
import { CustomerRetentionDashboard } from './CustomerRetentionDashboard';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const PRESET_TAGS = [
    { name: 'VIP', color: '#8B5CF6', bg: '#F3F0FF' },
    { name: 'Regular', color: '#18A07A', bg: '#E8F5F1' },
    { name: 'Gluten-Free', color: '#F59E0B', bg: '#FFF7E6' },
    { name: 'Vegan', color: '#10B981', bg: '#D1FAE5' },
    { name: 'Nut Allergy', color: '#EF4444', bg: '#FEE2E2' },
    { name: 'Anniversary', color: '#EC4899', bg: '#FCE7F3' },
];

export function GuestCRMView({ initialTab = 'directory' }) {
    const [activeTab, setActiveTab] = useState(initialTab); // 'directory' | 'feedback'

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);
    const [guests, setGuests] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    
    const [showModal, setShowModal] = useState(false);
    const [selectedGuest, setSelectedGuest] = useState(null);
    const [modalType, setModalType] = useState('edit'); // 'edit', 'visit'

    // Feedback State
    const [feedbackData, setFeedbackData] = useState([]);
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [feedbackRefreshing, setFeedbackRefreshing] = useState(false);
    const [feedbackSearch, setFeedbackSearch] = useState('');
    const [ratingFilter, setRatingFilter] = useState('all'); // 'all', 'high', 'low'
    const [channelFilter, setChannelFilter] = useState('all'); // 'all', 'Dine-in', 'WhatsApp', etc.
    const [newFeedbackCount, setNewFeedbackCount] = useState(0);

    const parseDate = (ts) => {
        if (!ts) return new Date(0);
        try {
            const parts = ts.split(' ');
            const dateParts = parts[0].split('/');
            if (dateParts.length === 3) {
                const month = parseInt(dateParts[0], 10) - 1;
                const day = parseInt(dateParts[1], 10);
                const year = parseInt(dateParts[2], 10);
                if (parts[1]) {
                    const timeParts = parts[1].split(':');
                    const hour = parseInt(timeParts[0], 10) || 0;
                    const min = parseInt(timeParts[1], 10) || 0;
                    const sec = parseInt(timeParts[2], 10) || 0;
                    return new Date(year, month, day, hour, min, sec);
                }
                return new Date(year, month, day);
            }
            return new Date(ts);
        } catch(e) {
            return new Date(ts);
        }
    };

    useEffect(() => {
        fetchGuests();
        loadFeedback(); // Load feedback in background on mount to count new entries
    }, []);

    const loadFeedback = async (force = false) => {
        setFeedbackLoading(true);
        if (force) setFeedbackRefreshing(true);
        const data = await fetchCustomerFeedback(force, (cached) => {
            if (cached) setFeedbackData(cached);
        });
        if (data) setFeedbackData(data);
        setFeedbackLoading(false);
        setFeedbackRefreshing(false);
    };

    useEffect(() => {
        if (activeTab === 'feedback') {
            loadFeedback();
        }
    }, [activeTab]);

    // Calculate new feedback count since last viewed
    useEffect(() => {
        if (feedbackData.length === 0) return;
        
        if (activeTab === 'feedback') {
            localStorage.setItem('poj_last_feedback_viewed', Date.now().toString());
            setNewFeedbackCount(0);
        } else {
            const lastViewedStr = localStorage.getItem('poj_last_feedback_viewed');
            const lastViewedTime = lastViewedStr ? parseInt(lastViewedStr, 10) : (Date.now() - 24 * 60 * 60 * 1000);
            
            const newEntries = feedbackData.filter(item => {
                const itemTime = parseDate(item.timestamp).getTime();
                return itemTime > lastViewedTime;
            });
            
            setNewFeedbackCount(newEntries.length);
        }
    }, [feedbackData, activeTab]);

    const getMetricStats = useMemo(() => {
        if (feedbackData.length === 0) {
            return { total: 0, overall: 0, food: 0, service: 0, speed: 0, cleanliness: 0 };
        }
        let overallSum = 0, overallCount = 0;
        let foodSum = 0, foodCount = 0;
        let serviceSum = 0, serviceCount = 0;
        let speedSum = 0, speedCount = 0;
        let cleanlinessSum = 0, cleanlinessCount = 0;

        feedbackData.forEach(item => {
            if (item.overallRating !== null) { overallSum += item.overallRating; overallCount++; }
            if (item.foodRating !== null) { foodSum += item.foodRating; foodCount++; }
            if (item.serviceRating !== null) { serviceSum += item.serviceRating; serviceCount++; }
            if (item.speedRating !== null) { speedSum += item.speedRating; speedCount++; }
            if (item.cleanlinessRating !== null) { cleanlinessSum += item.cleanlinessRating; cleanlinessCount++; }
        });

        return {
            total: feedbackData.length,
            overall: overallCount > 0 ? overallSum / overallCount : 0,
            food: foodCount > 0 ? foodSum / foodCount : 0,
            service: serviceCount > 0 ? serviceSum / serviceCount : 0,
            speed: speedCount > 0 ? speedSum / speedCount : 0,
            cleanliness: cleanlinessCount > 0 ? cleanlinessSum / cleanlinessCount : 0
        };
    }, [feedbackData]);

    const channelStats = useMemo(() => {
        const grouped = {};
        feedbackData.forEach(item => {
            const chan = item.serviceType || 'Unknown';
            if (!grouped[chan]) {
                grouped[chan] = { name: chan, count: 0, sum: 0, ratingsCount: 0 };
            }
            grouped[chan].count++;
            if (item.overallRating !== null) {
                grouped[chan].sum += item.overallRating;
                grouped[chan].ratingsCount++;
            }
        });

        return Object.values(grouped).map(g => ({
            name: g.name,
            Count: g.count,
            'Avg Rating': g.ratingsCount > 0 ? parseFloat((g.sum / g.ratingsCount).toFixed(1)) : 0
        })).sort((a, b) => b.Count - a.Count);
    }, [feedbackData]);

    const trendStats = useMemo(() => {
        const dailyRatings = {};
        feedbackData.forEach(item => {
            if (!item.timestamp) return;
            let dateKey;
            try {
                const parts = item.timestamp.split(' ')[0].split('/');
                if (parts.length === 3) {
                    const month = parts[0].padStart(2, '0');
                    const day = parts[1].padStart(2, '0');
                    const year = parts[2];
                    dateKey = `${year}-${month}-${day}`;
                } else {
                    dateKey = item.timestamp.substring(0, 10);
                }
            } catch(e) {
                dateKey = item.timestamp.substring(0, 10);
            }

            if (!dailyRatings[dateKey]) {
                dailyRatings[dateKey] = { sum: 0, count: 0 };
            }
            if (item.overallRating !== null) {
                dailyRatings[dateKey].sum += item.overallRating;
                dailyRatings[dateKey].count++;
            }
        });

        return Object.entries(dailyRatings)
            .filter(([_, g]) => g.count > 0)
            .map(([date, g]) => ({
                date,
                'Avg Rating': parseFloat((g.sum / g.count).toFixed(1))
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [feedbackData]);

    const filteredFeedback = useMemo(() => {
        return feedbackData
            .filter(item => {
                const query = feedbackSearch.toLowerCase();
                const matchSearch = !query || 
                    (item.customerName || '').toLowerCase().includes(query) ||
                    (item.code || '').toLowerCase().includes(query) ||
                    (item.orderId || '').toLowerCase().includes(query) ||
                    (item.comments || '').toLowerCase().includes(query);

                let matchRating = true;
                if (ratingFilter === 'high') {
                    matchRating = item.overallRating !== null && item.overallRating >= 4;
                } else if (ratingFilter === 'low') {
                    matchRating = item.overallRating !== null && item.overallRating < 3;
                }

                let matchChannel = true;
                if (channelFilter !== 'all') {
                    matchChannel = (item.serviceType || '') === channelFilter;
                }

                return matchSearch && matchRating && matchChannel;
            })
            .sort((a, b) => parseDate(b.timestamp) - parseDate(a.timestamp));
    }, [feedbackData, feedbackSearch, ratingFilter, channelFilter]);

    const feedbackChannels = useMemo(() => {
        const chans = new Set(feedbackData.map(item => item.serviceType).filter(Boolean));
        return ['all', ...Array.from(chans)];
    }, [feedbackData]);

    const fetchGuests = async () => {
        setLoading(true);
        let guestList = [];

        // 1. Fetch from Supabase
        try {
            let { data, error } = await supabase
                .from('guests')
                .select(`
                    *,
                    guest_tags (id, tag_name, color)
                `)
                .order('created_at', { ascending: false });

            // Fallback if join query fails due to missing relationship schema
            if (error || !data) {
                console.warn('Guest tags join query error, falling back to simple select:', error);
                const res = await supabase.from('guests').select('*').order('created_at', { ascending: false });
                data = res.data;
            }

            if (data && Array.isArray(data)) {
                guestList = data;
            }
        } catch (err) {
            console.error('Error fetching guests from Supabase:', err);
        }

        // 2. Merge with locally saved guests cache
        try {
            const localSaved = JSON.parse(localStorage.getItem('pos_registered_guests') || '[]');
            localSaved.forEach(lg => {
                if (!guestList.some(g => (g.id && g.id === lg.id) || (g.phone && lg.phone && g.phone === lg.phone))) {
                    guestList.unshift(lg);
                }
            });
        } catch(e) {}

        const sorted = [...guestList].sort((a, b) => {
            const spendDiff = (b.lifetime_spend || 0) - (a.lifetime_spend || 0);
            if (spendDiff !== 0) return spendDiff;
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

        setGuests(sorted);
        setLoading(false);
    };

    const handleSaveGuest = async (formData, selectedTags) => {
        let guestId = selectedGuest?.id;
        const { brand, preferred_brand, channel, acquisition_channel, ...coreData } = formData;

        const brandVal = brand || preferred_brand || 'POT OF JOLLOF';
        const channelVal = channel || acquisition_channel || 'Walk-in';

        if (!coreData.notes?.includes('[Brand:')) {
            coreData.notes = coreData.notes
                ? `[Brand: ${brandVal} | Channel: ${channelVal}] ${coreData.notes}`
                : `[Brand: ${brandVal} | Channel: ${channelVal}]`;
        }

        if (guestId) {
            await supabase.from('guests').update(coreData).eq('id', guestId);
            try {
                await supabase.from('guests').update({ brand: brandVal, preferred_brand: brandVal, channel: channelVal, acquisition_channel: channelVal }).eq('id', guestId);
            } catch(e) {}
            if (selectedTags.length > 0) {
                try { await supabase.from('guest_tags').delete().eq('guest_id', guestId); } catch(e) {}
            }
        } else {
            const { data, error } = await supabase.from('guests').insert([coreData]).select().single();
            if (error) { alert("Notice: Saved guest with notes fallback (" + error.message + ")"); }
            guestId = data?.id || `local_${Date.now()}`;
            
            if (data?.id) {
                try {
                    await supabase.from('guests').update({ brand: brandVal, preferred_brand: brandVal, channel: channelVal, acquisition_channel: channelVal }).eq('id', guestId);
                } catch(e) {}
            }

            const newGuest = { 
                ...formData, 
                id: guestId, 
                created_at: new Date().toISOString(), 
                visit_count: 0, 
                lifetime_spend: 0, 
                guest_tags: [] 
            };

            // Save to localStorage cache as well
            try {
                const existing = JSON.parse(localStorage.getItem('pos_registered_guests') || '[]');
                existing.unshift(newGuest);
                localStorage.setItem('pos_registered_guests', JSON.stringify(existing));
            } catch(e) {}

            setGuests(prev => [newGuest, ...prev]);
        }

        if (selectedTags.length > 0 && guestId) {
            const tagsToInsert = selectedTags.map(tag => ({
                guest_id: guestId,
                tag_name: tag.name,
                color: tag.color
            }));
            try { await supabase.from('guest_tags').insert(tagsToInsert); } catch(e) {}
        }

        alert("✅ Guest successfully saved to Guest CRM!");
        setShowModal(false);
        fetchGuests();
    };

    const handleLogVisit = async (visitData) => {
        // 1. Insert Visit
        await supabase.from('guest_visits').insert([{
            guest_id: selectedGuest.id,
            visit_date: visitData.date,
            spend: visitData.spend,
            table_number: visitData.table_number,
            notes: visitData.notes
        }]);

        // 2. Update Guest Totals
        const newSpend = parseFloat(selectedGuest.lifetime_spend || 0) + parseFloat(visitData.spend);
        const newCount = (selectedGuest.visit_count || 0) + 1;
        
        await supabase.from('guests').update({
            lifetime_spend: newSpend,
            visit_count: newCount
        }).eq('id', selectedGuest.id);

        setShowModal(false);
        fetchGuests();
    };

    const filteredGuests = guests.filter(g => 
        g.first_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        g.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (g.phone && g.phone.includes(searchQuery))
    );

    return (
        <div className="space-y-6">
            {/* Navigation Tabs */}
            <div className="flex gap-2 border-b border-gray-200/60 pb-px mb-6">
                <button 
                    onClick={() => setActiveTab('directory')}
                    className={`px-6 py-3 border-b-2 text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'directory' ? 'border-[#18A07A] text-[#18A07A]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <Star size={16} /> Guests Directory
                </button>
                <button 
                    onClick={() => setActiveTab('retention')}
                    className={`px-6 py-3 border-b-2 text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'retention' ? 'border-[#18A07A] text-[#18A07A]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <Users size={16} /> New vs. Return Retention
                </button>
                <button 
                    onClick={() => setActiveTab('feedback')}
                    className={`px-6 py-3 border-b-2 text-sm font-bold transition-all flex items-center gap-2 relative ${activeTab === 'feedback' ? 'border-[#18A07A] text-[#18A07A]': 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <MessageSquare size={16} /> 
                    <span>Customer Feedback & Trends</span>
                    {activeTab !== 'feedback' && newFeedbackCount > 0 && (
                        <span className="ml-1.5 px-2 py-0.5 text-[10px] font-extrabold bg-red-500 text-white rounded-full animate-pulse">
                            +{newFeedbackCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Tab 1: Directory */}
            {activeTab === 'directory' && (
                <>
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/60 backdrop-blur-xl p-6 rounded-3xl border border-white/50 shadow-sm">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                <Star className="text-yellow-500" /> Guest CRM
                            </h2>
                            <p className="text-sm font-medium text-gray-500 mt-1">Manage VIPs, preferences, and visit history.</p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="relative flex-1 sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search guests..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-white/50 backdrop-blur-md border border-gray-200 rounded-full focus:ring-2 focus:ring-primary focus:bg-white outline-none font-medium transition-all shadow-sm hover:shadow-md"
                                />
                            </div>
                            <button 
                                onClick={() => { setSelectedGuest(null); setModalType('edit'); setShowModal(true); }}
                                className="p-2.5 bg-gray-900 text-white rounded-full hover:bg-black hover:scale-105 transition-all shadow-xl shadow-gray-900/20"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    {loading ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary" size={32}/></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredGuests.map((guest, i) => (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                    key={guest.id}
                                    className="group bg-white/80 backdrop-blur-lg border border-white rounded-[2rem] p-6 shadow-sm hover:shadow-2xl transition-all relative overflow-hidden"
                                >
                                    {/* Glassmorphism decoration */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-primary/10 transition-colors"></div>

                                    <div className="flex justify-between items-start mb-4 relative z-10">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center text-xl font-black text-gray-700 shadow-inner border border-gray-200">
                                                {guest.first_name[0]}{guest.last_name[0]}
                                            </div>
                                            <div>
                                                <h3 className="font-black text-lg text-gray-900">{guest.first_name} {guest.last_name}</h3>
                                                <p className="text-xs font-bold text-gray-500">{guest.phone || 'No Phone'}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setSelectedGuest(guest); setModalType('visit'); setShowModal(true); }} className="p-1.5 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100" title="Log Visit"><Utensils size={14}/></button>
                                            <button onClick={() => { setSelectedGuest(guest); setModalType('edit'); setShowModal(true); }} className="p-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100" title="Edit Profile"><Edit size={14}/></button>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5 mb-5 relative z-10 min-h-[24px]">
                                        {(() => {
                                             const brandMatch = guest.notes?.match(/\[Brand:\s*([^|]+)/i);
                                             const channelMatch = guest.notes?.match(/\|\s*Channel:\s*([^\]]+)/i);
                                             const displayBrand = guest.brand || guest.preferred_brand || (brandMatch ? brandMatch[1].trim() : null);
                                             const displayChannel = guest.channel || guest.acquisition_channel || (channelMatch ? channelMatch[1].trim() : null);

                                             return (
                                                 <>
                                                     {displayBrand && (
                                                         <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                                                             🫕 {displayBrand}
                                                         </span>
                                                     )}
                                                     {displayChannel && (
                                                         <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200">
                                                             📢 {displayChannel}
                                                         </span>
                                                     )}
                                                 </>
                                             );
                                        })()}
                                        {guest.guest_tags?.map(tag => (
                                            <span key={tag.id} className="text-[10px] font-black px-2 py-0.5 rounded-md border" style={{ color: tag.color, backgroundColor: `${tag.color}15`, borderColor: `${tag.color}30` }}>
                                                {tag.tag_name}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 relative z-10 bg-gray-50/50 p-3 rounded-2xl border border-gray-100/50">
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Visits</p>
                                            <p className="font-black text-gray-900">{guest.visit_count}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">LTV (Spend)</p>
                                            <p className="font-black text-emerald-600">Ksh {parseFloat(guest.lifetime_spend || 0).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {guest.notes && (
                                        <div className="mt-4 text-xs font-medium text-gray-500 bg-yellow-50/50 p-3 rounded-xl border border-yellow-100/50 relative z-10">
                                            <span className="font-bold text-yellow-700">Notes: </span> {guest.notes}
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                            {filteredGuests.length === 0 && !loading && (
                                <div className="col-span-full py-12 text-center text-gray-400 font-bold">No guests found.</div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Tab 2: Retention Dashboard */}
            {activeTab === 'retention' && (
                <CustomerRetentionDashboard />
            )}

            {/* Tab 3: Feedback Dashboard */}
            {activeTab === 'feedback' && (
                <FeedbackDashboardView />
            )}

            {showModal && modalType === 'edit' && (
                <GuestEditModal guest={selectedGuest} onClose={() => setShowModal(false)} onSave={handleSaveGuest} />
            )}

            {showModal && modalType === 'visit' && (
                <LogVisitModal guest={selectedGuest} onClose={() => setShowModal(false)} onSave={handleLogVisit} />
            )}
        </div>
    );
}

function GuestEditModal({ guest, onClose, onSave }) {
    const [formData, setFormData] = useState({
        first_name: guest?.first_name || '',
        last_name: guest?.last_name || '',
        phone: guest?.phone || '',
        email: guest?.email || '',
        brand: guest?.brand || guest?.preferred_brand || 'POT OF JOLLOF',
        preferred_brand: guest?.brand || guest?.preferred_brand || 'POT OF JOLLOF',
        channel: guest?.channel || guest?.acquisition_channel || 'Walk-in',
        acquisition_channel: guest?.channel || guest?.acquisition_channel || 'Walk-in',
        notes: guest?.notes || ''
    });
    const [selectedTags, setSelectedTags] = useState(guest?.guest_tags?.map(t => ({ name: t.tag_name, color: t.color })) || []);

    const toggleTag = (tag) => {
        if (selectedTags.find(t => t.name === tag.name)) {
            setSelectedTags(selectedTags.filter(t => t.name !== tag.name));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl relative z-10 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h2 className="text-xl font-black text-gray-900">{guest ? 'Edit Guest Profile' : 'New VIP Guest'}</h2>
                    <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-gray-100 shadow-sm transition-all"><X size={18}/></button>
                </div>
                <div className="p-6 space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">First Name</label>
                            <input type="text" value={formData.first_name} onChange={(e) => setFormData({...formData, first_name: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none font-medium text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Last Name</label>
                            <input type="text" value={formData.last_name} onChange={(e) => setFormData({...formData, last_name: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none font-medium text-sm" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Phone</label>
                            <input type="tel" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none font-medium text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Email</label>
                            <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none font-medium text-sm" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Restaurant Brand</label>
                            <select 
                                value={formData.brand} 
                                onChange={(e) => setFormData({...formData, brand: e.target.value, preferred_brand: e.target.value})} 
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none font-medium text-sm"
                            >
                                <option value="POT OF JOLLOF">🫕 Pot of Jollof</option>
                                <option value="LITTLE LAGOS">🌶️ Little Lagos</option>
                                <option value="CAFE SWAHILI">☕ Cafe Swahili</option>
                                <option value="SAMAKI STREET">🐟 Samaki Street</option>
                                <option value="General Brand">🏢 General Restaurant</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Acquisition Channel</label>
                            <select 
                                value={formData.channel} 
                                onChange={(e) => setFormData({...formData, channel: e.target.value, acquisition_channel: e.target.value})} 
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none font-medium text-sm"
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
                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase">Tags & Preferences</label>
                        <div className="flex flex-wrap gap-2">
                            {PRESET_TAGS.map(tag => {
                                const isSelected = selectedTags.find(t => t.name === tag.name);
                                return (
                                    <button 
                                        key={tag.name} type="button" onClick={() => toggleTag(tag)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isSelected ? 'shadow-inner' : 'opacity-50 hover:opacity-100 grayscale hover:grayscale-0'}`}
                                        style={{ backgroundColor: isSelected ? tag.bg : '#f9fafb', color: isSelected ? tag.color : '#9ca3af', borderColor: isSelected ? tag.color : '#e5e7eb' }}
                                    >
                                        {tag.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Maitre D' Notes</label>
                        <textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} rows="3" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none resize-none font-medium text-sm" placeholder="Allergies, favorite table, etc..." />
                    </div>
                </div>
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50">Cancel</button>
                    <button onClick={() => onSave(formData, selectedTags)} className="flex-1 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black shadow-lg shadow-gray-900/20">Save Profile</button>
                </div>
            </motion.div>
        </div>
    );
}

function LogVisitModal({ guest, onClose, onSave }) {
    const [visitData, setVisitData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        spend: '',
        table_number: '',
        notes: ''
    });

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={onClose} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl relative z-10 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-emerald-50">
                    <h2 className="text-xl font-black text-emerald-900 flex items-center gap-2"><Utensils size={20}/> Log Visit</h2>
                    <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-gray-100 shadow-sm transition-all text-emerald-600"><X size={18}/></button>
                </div>
                <div className="p-6 space-y-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2 text-2xl font-black">
                        {guest.first_name[0]}{guest.last_name[0]}
                    </div>
                    <h3 className="font-bold text-gray-900">{guest.first_name} {guest.last_name}</h3>
                    
                    <div className="text-left space-y-4 mt-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Date</label>
                            <input type="date" value={visitData.date} onChange={(e) => setVisitData({...visitData, date: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Table #</label>
                                <input type="text" value={visitData.table_number} onChange={(e) => setVisitData({...visitData, table_number: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold" placeholder="e.g. 12" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Spend (Ksh)</label>
                                <input type="number" value={visitData.spend} onChange={(e) => setVisitData({...visitData, spend: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-600" placeholder="0.00" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Dining Notes</label>
                            <textarea value={visitData.notes} onChange={(e) => setVisitData({...visitData, notes: e.target.value})} rows="2" className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none font-medium text-sm" placeholder="Feedback, ordered dishes..." />
                        </div>
                    </div>
                </div>
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50">Cancel</button>
                    <button onClick={() => onSave(visitData)} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-600/20">Record Visit</button>
                </div>
            </motion.div>
        </div>
    );
}

function MetricGauge({ label, score, color }) {
    const rounded = score ? score.toFixed(1) : '0.0';
    const percent = score ? (score / 5) * 100 : 0;
    
    const colorClasses = {
        emerald: { bar: 'bg-emerald-500', text: 'text-emerald-700' },
        blue: { bar: 'bg-blue-500', text: 'text-blue-700' },
        indigo: { bar: 'bg-indigo-500', text: 'text-indigo-700' },
        purple: { bar: 'bg-purple-500', text: 'text-purple-700' }
    }[color] || { bar: 'bg-gray-500', text: 'text-gray-700' };

    return (
        <div className="flex flex-col justify-between">
            <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</span>
            <div className="flex items-center justify-between gap-2 mt-1.5">
                <span className={`text-sm font-black ${colorClasses.text}`}>{rounded} ★</span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colorClasses.bar}`} style={{ width: `${percent}%` }} />
                </div>
            </div>
        </div>
    );
}
