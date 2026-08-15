import React, { useState, useEffect, useMemo } from 'react';
import { 
    MessageSquare, Star, TrendingUp, ThumbsUp, ThumbsDown, RefreshCw, 
    Search, Filter, Download, Loader2, CheckCircle, AlertCircle, AlertTriangle, 
    Smile, Frown, Meh, ExternalLink, Calendar, ShoppingBag
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import { fetchCustomerFeedback } from '../lib/feedbackService';

const SPREADSHEET_ID = '102A3Yz7BlKDJB7I_0lmYd1ek1CA7HAZyIg4R8ZYFjcw';
const SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=1130350999`;

export function FeedbackDashboardView({ onBack }) {
    const [feedbackData, setFeedbackData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [ratingFilter, setRatingFilter] = useState('all'); // 'all', 'positive', 'critical'
    const [channelFilter, setChannelFilter] = useState('all'); // 'all', 'Dine-in', 'UberEats', etc.
    const [selectedFeedback, setSelectedFeedback] = useState(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async (force = false) => {
        if (force) setRefreshing(true);
        else setLoading(true);

        try {
            const data = await fetchCustomerFeedback(force, (cached) => {
                if (cached) setFeedbackData(cached);
            });
            if (data) setFeedbackData(data);
        } catch (err) {
            console.error('Error loading feedback data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Calculate Metrics
    const metrics = useMemo(() => {
        if (!feedbackData.length) {
            return {
                totalCount: 0,
                avgOverall: 0,
                avgFood: 0,
                avgService: 0,
                avgSpeed: 0,
                avgCleanliness: 0,
                positivePercent: 0,
                criticalCount: 0,
                ratingDist: [
                    { rating: '5 Stars', count: 0, color: '#10B981' },
                    { rating: '4 Stars', count: 0, color: '#3B82F6' },
                    { rating: '3 Stars', count: 0, color: '#F59E0B' },
                    { rating: '2 Stars', count: 0, color: '#F97316' },
                    { rating: '1 Star', count: 0, color: '#EF4444' }
                ]
            };
        }

        const total = feedbackData.length;
        let sumOverall = 0, sumFood = 0, sumService = 0, sumSpeed = 0, sumCleanliness = 0;
        let foodCount = 0, serviceCount = 0, speedCount = 0, cleanlinessCount = 0;
        let positiveCount = 0, criticalCount = 0;

        const distCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

        feedbackData.forEach(item => {
            const r = item.overallRating || 0;
            sumOverall += r;

            if (r >= 4) positiveCount++;
            if (r > 0 && r <= 3) criticalCount++;
            if (r >= 1 && r <= 5) distCounts[Math.round(r)] = (distCounts[Math.round(r)] || 0) + 1;

            if (item.foodRating) { sumFood += item.foodRating; foodCount++; }
            if (item.serviceRating) { sumService += item.serviceRating; serviceCount++; }
            if (item.speedRating) { sumSpeed += item.speedRating; speedCount++; }
            if (item.cleanlinessRating) { sumCleanliness += item.cleanlinessRating; cleanlinessCount++; }
        });

        return {
            totalCount: total,
            avgOverall: (sumOverall / total).toFixed(1),
            avgFood: foodCount ? (sumFood / foodCount).toFixed(1) : 'N/A',
            avgService: serviceCount ? (sumService / serviceCount).toFixed(1) : 'N/A',
            avgSpeed: speedCount ? (sumSpeed / speedCount).toFixed(1) : 'N/A',
            avgCleanliness: cleanlinessCount ? (sumCleanliness / cleanlinessCount).toFixed(1) : 'N/A',
            positivePercent: Math.round((positiveCount / total) * 100),
            criticalCount,
            ratingDist: [
                { rating: '5 Stars', count: distCounts[5], color: '#10B981' },
                { rating: '4 Stars', count: distCounts[4], color: '#3B82F6' },
                { rating: '3 Stars', count: distCounts[3], color: '#F59E0B' },
                { rating: '2 Stars', count: distCounts[2], color: '#F97316' },
                { rating: '1 Star', count: distCounts[1], color: '#EF4444' }
            ]
        };
    }, [feedbackData]);

    // Unique Channels
    const channels = useMemo(() => {
        const set = new Set();
        feedbackData.forEach(f => {
            if (f.serviceType) set.add(f.serviceType.trim());
        });
        return ['all', ...Array.from(set)];
    }, [feedbackData]);

    // Filtered Feedbacks
    const filteredList = useMemo(() => {
        return feedbackData.filter(item => {
            const matchesSearch = !searchQuery.trim() ||
                (item.customerName && item.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (item.orderId && item.orderId.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (item.comments && item.comments.toLowerCase().includes(searchQuery.toLowerCase()));

            const r = item.overallRating || 0;
            let matchesRating = true;
            if (ratingFilter === 'positive') matchesRating = r >= 4;
            if (ratingFilter === 'critical') matchesRating = r > 0 && r <= 3;

            let matchesChannel = true;
            if (channelFilter !== 'all') {
                matchesChannel = (item.serviceType || '').toLowerCase() === channelFilter.toLowerCase();
            }

            return matchesSearch && matchesRating && matchesChannel;
        });
    }, [feedbackData, searchQuery, ratingFilter, channelFilter]);

    const handleExportCSV = () => {
        if (!feedbackData.length) return;
        const headers = ['Timestamp', 'Code', 'Service Type', 'Customer Name', 'Order ID', 'Overall Rating', 'Food Rating', 'Service Rating', 'Speed Rating', 'Cleanliness Rating', 'Comments'];
        const rows = feedbackData.map(f => [
            `"${f.timestamp || ''}"`,
            `"${f.code || ''}"`,
            `"${f.serviceType || ''}"`,
            `"${f.customerName || ''}"`,
            `"${f.orderId || ''}"`,
            f.overallRating || '',
            f.foodRating || '',
            f.serviceRating || '',
            f.speedRating || '',
            f.cleanlinessRating || '',
            `"${(f.comments || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `customer_feedback_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getEmojiRating = (rating) => {
        if (!rating) return '😶';
        if (rating >= 5) return '🤩';
        if (rating >= 4) return '🙂';
        if (rating >= 3) return '😐';
        if (rating >= 2) return '😕';
        return '😡';
    };

    if (loading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center p-12">
                <Loader2 className="animate-spin text-orange-500" size={36} />
                <span className="ml-3 text-sm font-bold text-gray-600">Loading Customer Feedback from Google Sheets...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Title & Sync Indicator */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-black rounded-full uppercase tracking-wider flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                            Live Google Sheets Sync
                        </span>
                        <span className="text-xs text-gray-400">Total Entries: {metrics.totalCount}</span>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <MessageSquare className="text-orange-500" size={26} />
                        Customer Feedback Dashboard
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Real-time ratings, reviews & service quality analytics synchronized directly from the guest feedback spreadsheet.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-all flex items-center gap-2 border border-gray-200 disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin text-orange-500' : ''} />
                        {refreshing ? 'Syncing...' : 'Refresh Sheet Data'}
                    </button>

                    <button
                        onClick={handleExportCSV}
                        className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-2"
                    >
                        <Download size={14} />
                        Export CSV
                    </button>

                    <a
                        href={SPREADSHEET_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold"
                        title="Open Connected Google Spreadsheet"
                    >
                        <ExternalLink size={14} />
                        <span className="hidden sm:inline">Open Sheet</span>
                    </a>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Overall Score */}
                <div className="bg-gradient-to-br from-gray-900 to-black text-white p-5 rounded-2xl shadow-md border border-gray-800 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Overall Rating</span>
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                            <Star size={18} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-white">{metrics.avgOverall}</span>
                        <span className="text-sm font-bold text-gray-400">/ 5.0</span>
                    </div>
                    <p className="text-xs text-emerald-400 font-bold mt-2 flex items-center gap-1">
                        <ThumbsUp size={12} /> {metrics.positivePercent}% Positive (4-5★)
                    </p>
                </div>

                {/* Google Reviews */}
                <div className="bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-blue-800/60 relative overflow-hidden flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-300 flex items-center gap-1.5">
                            🌐 Google Reviews
                        </span>
                        <span className="px-2 py-0.5 bg-red-600 text-white font-black text-[10px] rounded-full animate-bounce shadow-lg shadow-red-600/50">
                            +1 NEW
                        </span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-black text-white">4.9</span>
                        <span className="text-amber-400 text-sm font-black">⭐⭐⭐⭐⭐</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-blue-800/40">
                        <span className="text-[9px] text-blue-200 font-bold">Google Profile</span>
                        <a
                            href="https://search.google.com/local/writereview?placeid=ChIJk9X55X8LLxgR_potofjollof"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 bg-white text-blue-950 hover:bg-blue-50 font-black text-[9px] uppercase rounded-lg transition-all flex items-center gap-1 shadow-sm"
                        >
                            <ExternalLink size={9} /> View
                        </a>
                    </div>
                </div>

                {/* Food Quality */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Food & Taste</span>
                        <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
                            🍱
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-gray-900">{metrics.avgFood}</span>
                        <span className="text-xs font-bold text-gray-400">/ 5.0</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2 font-medium">Quality & flavor rating</p>
                </div>

                {/* Service Quality */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Service & Staff</span>
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                            👏
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-gray-900">{metrics.avgService}</span>
                        <span className="text-xs font-bold text-gray-400">/ 5.0</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2 font-medium">Staff friendliness</p>
                </div>

                {/* Speed & Cleanliness */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">Critical Concerns</span>
                        <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
                            <AlertTriangle size={18} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-red-600">{metrics.criticalCount}</span>
                        <span className="text-xs font-bold text-gray-400">Reviews (1-3★)</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2 font-medium">Speed: {metrics.avgSpeed}★ • Cleanliness: {metrics.avgCleanliness}★</p>
                </div>
            </div>

            {/* Distribution Chart & Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Rating Distribution Bar Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <TrendingUp size={16} className="text-orange-500" />
                        Rating Distribution Breakdown
                    </h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.ratingDist} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F3F4F6" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="rating" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#374151' }} width={70} />
                                <Tooltip formatter={(val) => [`${val} reviews`, 'Count']} contentStyle={{ borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }} />
                                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={18}>
                                    {metrics.ratingDist.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Google Sheet Sync Information */}
                <div className="bg-gradient-to-br from-emerald-950 to-slate-900 text-white p-6 rounded-2xl border border-emerald-900/50 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/30">
                            <CheckCircle size={20} />
                        </div>
                        <h3 className="font-black text-lg text-white mb-1">Attached Google Sheet</h3>
                        <p className="text-xs text-gray-300 leading-relaxed font-medium mb-4">
                            All submissions from the Guest Feedback Tool auto-sync to your Google Spreadsheet in real time.
                        </p>
                        <div className="bg-black/40 border border-emerald-800/40 p-3 rounded-xl text-xs space-y-1 font-mono text-emerald-300">
                            <div><strong>Sheet ID:</strong> {SPREADSHEET_ID.slice(0, 16)}...</div>
                            <div><strong>Tab GID:</strong> 1130350999</div>
                            <div><strong>Status:</strong> Active & Connected</div>
                        </div>
                    </div>

                    <a
                        href={SPREADSHEET_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-6 w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl transition-all text-center flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                        View Full Spreadsheet <ExternalLink size={14} />
                    </a>
                </div>
            </div>

            {/* Submissions Table with Filters */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Guest Feedback Submissions</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Showing {filteredList.length} of {feedbackData.length} total entries</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        {/* Search */}
                        <div className="relative flex-1 sm:w-48">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search customer/order..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-orange-500 font-bold"
                            />
                        </div>

                        {/* Rating Filter */}
                        <select
                            value={ratingFilter}
                            onChange={(e) => setRatingFilter(e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-bold text-gray-700 focus:outline-none"
                        >
                            <option value="all">All Ratings</option>
                            <option value="positive">Positive (4-5★)</option>
                            <option value="critical">Critical (1-3★)</option>
                        </select>

                        {/* Channel Filter */}
                        <select
                            value={channelFilter}
                            onChange={(e) => setChannelFilter(e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-xl py-2 px-3 text-xs font-bold text-gray-700 focus:outline-none capitalize"
                        >
                            {channels.map(ch => (
                                <option key={ch} value={ch}>{ch === 'all' ? 'All Channels' : ch}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="py-3.5 px-4">Date & Time</th>
                                <th className="py-3.5 px-4">Customer</th>
                                <th className="py-3.5 px-4">Channel</th>
                                <th className="py-3.5 px-4">Overall Score</th>
                                <th className="py-3.5 px-4">Detailed Ratings</th>
                                <th className="py-3.5 px-4">Comments & Feedback</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                            {filteredList.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-gray-400">
                                        No customer feedback entries match the selected filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredList.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="py-3.5 px-4 whitespace-nowrap text-gray-500 font-mono text-[11px]">
                                            {item.timestamp || 'N/A'}
                                        </td>
                                        <td className="py-3.5 px-4 font-bold text-gray-900 whitespace-nowrap">
                                            {item.customerName || 'Anonymous Guest'}
                                            {item.orderId && (
                                                <span className="block text-[10px] font-mono text-gray-400 font-normal">Order #{item.orderId}</span>
                                            )}
                                        </td>
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[10px] font-bold">
                                                {item.serviceType || 'General'}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-lg">{getEmojiRating(item.overallRating)}</span>
                                                <span className={`font-black text-sm ${
                                                    (item.overallRating || 0) >= 4 ? 'text-emerald-600' :
                                                    (item.overallRating || 0) === 3 ? 'text-amber-500' : 'text-red-500'
                                                }`}>
                                                    {item.overallRating ? `${item.overallRating} ★` : 'N/A'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4 whitespace-nowrap text-[11px] text-gray-500 space-y-0.5">
                                            <div>Food: <strong className="text-gray-900">{item.foodRating ? `${item.foodRating}★` : '-'}</strong></div>
                                            <div>Service: <strong className="text-gray-900">{item.serviceRating ? `${item.serviceRating}★` : '-'}</strong></div>
                                        </td>
                                        <td className="py-3.5 px-4 text-gray-800 max-w-xs">
                                            {item.comments ? (
                                                <p className="line-clamp-2 italic">"{item.comments}"</p>
                                            ) : (
                                                <span className="text-gray-400 italic">No comment provided</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
