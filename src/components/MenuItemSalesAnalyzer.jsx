import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
    Search, Calendar, TrendingUp, TrendingDown, AlertTriangle, 
    Flame, DollarSign, Package, Eye, EyeOff, Edit3, ArrowUpDown, 
    ChevronDown, CheckCircle2, HelpCircle, Sparkles, Filter, RefreshCw, Layers
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';

const TIME_RANGES = [
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: '7d' },
    { label: 'Last 30 Days', value: '30d' },
    { label: 'This Month', value: 'this_month' },
    { label: 'Last 90 Days', value: '90d' },
    { label: 'All Time', value: 'all' }
];

export function MenuItemSalesAnalyzer({ onEditItem }) {
    const [loading, setLoading] = useState(true);
    const [orderItems, setOrderItems] = useState([]);
    const [menuItems, setMenuItems] = useState([]);
    const [timeRange, setTimeRange] = useState('30d');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBrand, setSelectedBrand] = useState('All');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedHealth, setSelectedHealth] = useState('All'); // 'All', 'star', 'workhorse', 'puzzle', 'dead'
    const [sortBy, setSortBy] = useState('qty_desc'); // 'qty_desc', 'qty_asc', 'rev_desc', 'name_asc', 'last_sold'
    const [updatingItemId, setUpdatingItemId] = useState(null);

    useEffect(() => {
        fetchAllData();
    }, []);

    const fetchAllData = async () => {
        setLoading(true);
        try {
            // 1. Fetch entire active menu
            const { data: menuData, error: menuErr } = await supabase
                .from('pos_menu')
                .select('*')
                .order('name');

            // 2. Fetch all order items with pagination to get all historical records
            let allItems = [];
            let from = 0;
            const step = 1000;
            while (true) {
                const { data, error } = await supabase
                    .from('pos_order_items')
                    .select('id, item_name, quantity, price, created_at, status')
                    .range(from, from + step - 1);

                if (error || !data || data.length === 0) break;
                allItems = allItems.concat(data);
                if (data.length < step) break;
                from += step;
            }

            if (menuData) setMenuItems(menuData);
            setOrderItems(allItems);
        } catch (err) {
            console.error('Error fetching sales analytics data:', err);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Date Boundaries
    const dateRangeInterval = useMemo(() => {
        const now = new Date();
        if (timeRange === 'today') {
            const start = new Date(now.setHours(0, 0, 0, 0));
            return { start, end: new Date() };
        }
        if (timeRange === 'yesterday') {
            const yesterday = subDays(new Date(), 1);
            const start = new Date(yesterday.setHours(0, 0, 0, 0));
            const end = new Date(yesterday.setHours(23, 59, 59, 999));
            return { start, end };
        }
        if (timeRange === '7d') {
            return { start: subDays(new Date(), 7), end: new Date() };
        }
        if (timeRange === '30d') {
            return { start: subDays(new Date(), 30), end: new Date() };
        }
        if (timeRange === 'this_month') {
            return { start: startOfMonth(new Date()), end: new Date() };
        }
        if (timeRange === '90d') {
            return { start: subDays(new Date(), 90), end: new Date() };
        }
        return null; // All time
    }, [timeRange]);

    // Aggregate Sales by Menu Item
    const analytics = useMemo(() => {
        // Filter order items by date range
        const filteredOrderItems = orderItems.filter(item => {
            if (!item.created_at) return true;
            if (!dateRangeInterval) return true;
            try {
                const itemDate = parseISO(item.created_at);
                return isWithinInterval(itemDate, dateRangeInterval);
            } catch (e) {
                return true;
            }
        });

        // Map sales to item names (case-insensitive key)
        const salesMap = {};
        filteredOrderItems.forEach(oi => {
            const rawName = (oi.item_name || '').trim();
            if (!rawName) return;
            const key = rawName.toLowerCase();
            if (!salesMap[key]) {
                salesMap[key] = {
                    key,
                    rawName,
                    qty: 0,
                    revenue: 0,
                    orderCount: 0,
                    lastSoldDate: null
                };
            }
            const q = parseInt(oi.quantity || 1);
            const p = parseFloat(oi.price || 0);
            salesMap[key].qty += q;
            salesMap[key].revenue += (q * p);
            salesMap[key].orderCount += 1;

            if (oi.created_at) {
                if (!salesMap[key].lastSoldDate || new Date(oi.created_at) > new Date(salesMap[key].lastSoldDate)) {
                    salesMap[key].lastSoldDate = oi.created_at;
                }
            }
        });

        // Also track all-time last sold date for each item
        const allTimeLastSoldMap = {};
        orderItems.forEach(oi => {
            const rawName = (oi.item_name || '').trim();
            if (!rawName) return;
            const key = rawName.toLowerCase();
            if (oi.created_at) {
                if (!allTimeLastSoldMap[key] || new Date(oi.created_at) > new Date(allTimeLastSoldMap[key])) {
                    allTimeLastSoldMap[key] = oi.created_at;
                }
            }
        });

        // Combine with full pos_menu catalog
        const combined = menuItems.map(menuItem => {
            const key = menuItem.name.trim().toLowerCase();
            const sales = salesMap[key] || { qty: 0, revenue: 0, orderCount: 0, lastSoldDate: null };
            const allTimeLastSold = allTimeLastSoldMap[key] || sales.lastSoldDate || null;

            // Classify Sales Health Quadrant
            // Star (High volume & revenue), Workhorse (High volume), Puzzle (High price, low volume), Dead (0 or negligible sales)
            let health = 'dead';
            let recommendation = 'Zero or negligible sales. Consider removing from menu or testing as a combo.';
            let healthBadge = { label: 'Slow / Dead Mover', bg: 'bg-rose-50 text-rose-700 border-rose-200', icon: '⚠️' };

            const price = parseFloat(menuItem.price || 0);

            if (sales.qty >= 30) {
                health = 'star';
                recommendation = '🔥 Top Seller! Keep in stock, feature on homepage, and maintain prep availability.';
                healthBadge = { label: 'Star Item (High Volume)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '🌟' };
            } else if (sales.qty >= 10) {
                health = 'workhorse';
                recommendation = 'Solid consistent performer. Keep as staple offering.';
                healthBadge = { label: 'Steady Seller', bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: '⚖️' };
            } else if (sales.qty >= 1 && price >= 1200) {
                health = 'puzzle';
                if ((menuItem.category || '').toLowerCase().includes('starter') || (menuItem.category || '').toLowerCase().includes('bite')) {
                    recommendation = 'High price meal placed under Starters & Bites causing sticker shock. Move to Main Meals or Combos with a free drink to boost conversions.';
                } else {
                    recommendation = 'Premium item with low order frequency. Consider bundling with a drink or running a weekend promotion.';
                }
                healthBadge = { label: 'High Ticket / Low Volume', bg: 'bg-amber-50 text-amber-800 border-amber-200', icon: '🧩' };
            } else if (sales.qty >= 1) {
                health = 'low';
                recommendation = 'Low volume sales in this period. Monitor closely or evaluate ingredient holding costs.';
                healthBadge = { label: 'Low Velocity', bg: 'bg-orange-50 text-orange-700 border-orange-200', icon: '📉' };
            }

            return {
                ...menuItem,
                qtySold: sales.qty,
                revenue: sales.revenue,
                orderCount: sales.orderCount,
                periodLastSold: sales.lastSoldDate,
                allTimeLastSold: allTimeLastSold,
                health,
                healthBadge,
                recommendation
            };
        });

        // Summary Metrics
        const totalUnitsSold = filteredOrderItems.reduce((sum, oi) => sum + parseInt(oi.quantity || 1), 0);
        const totalRevenue = filteredOrderItems.reduce((sum, oi) => sum + (parseInt(oi.quantity || 1) * parseFloat(oi.price || 0)), 0);
        const activeSellingItemsCount = combined.filter(i => i.qtySold > 0).length;
        const zeroSalesItemsCount = combined.filter(i => i.qtySold === 0).length;

        return {
            items: combined,
            totalUnitsSold,
            totalRevenue,
            activeSellingItemsCount,
            zeroSalesItemsCount
        };
    }, [menuItems, orderItems, dateRangeInterval]);

    // Filter & Sort
    const displayedItems = useMemo(() => {
        let result = analytics.items.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesBrand = selectedBrand === 'All' || item.brand === selectedBrand;
            const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
            const matchesHealth = selectedHealth === 'All' || item.health === selectedHealth;

            return matchesSearch && matchesBrand && matchesCategory && matchesHealth;
        });

        // Sorting
        result.sort((a, b) => {
            if (sortBy === 'qty_desc') return b.qtySold - a.qtySold;
            if (sortBy === 'qty_asc') return a.qtySold - b.qtySold;
            if (sortBy === 'rev_desc') return b.revenue - a.revenue;
            if (sortBy === 'price_desc') return parseFloat(b.price || 0) - parseFloat(a.price || 0);
            if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
            if (sortBy === 'last_sold') {
                if (!a.allTimeLastSold) return 1;
                if (!b.allTimeLastSold) return -1;
                return new Date(b.allTimeLastSold) - new Date(a.allTimeLastSold);
            }
            return 0;
        });

        return result;
    }, [analytics.items, searchTerm, selectedBrand, selectedCategory, selectedHealth, sortBy]);

    // Unique Brands and Categories
    const brands = useMemo(() => ['All', ...new Set(menuItems.map(i => i.brand).filter(Boolean))], [menuItems]);
    const categories = useMemo(() => ['All', ...new Set(menuItems.map(i => i.category).filter(Boolean))], [menuItems]);

    const handleToggleAvailable = async (item) => {
        setUpdatingItemId(item.id);
        const newStatus = !item.is_available;
        try {
            const { error } = await supabase
                .from('pos_menu')
                .update({ is_available: newStatus })
                .eq('id', item.id);

            if (!error) {
                setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, is_available: newStatus } : m));
            } else {
                alert("Error updating item: " + error.message);
            }
        } finally {
            setUpdatingItemId(null);
        }
    };

    const handleToggleMicrosite = async (item) => {
        setUpdatingItemId(item.id);
        const newStatus = item.show_on_microsite === false ? true : false;
        try {
            const { error } = await supabase
                .from('pos_menu')
                .update({ show_on_microsite: newStatus })
                .eq('id', item.id);

            if (!error) {
                setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, show_on_microsite: newStatus } : m));
            } else {
                alert("Error updating microsite visibility: " + error.message);
            }
        } finally {
            setUpdatingItemId(null);
        }
    };

    if (loading) {
        return (
            <div className="py-24 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="animate-spin text-primary" size={36} />
                <p className="text-sm font-bold text-gray-500">Aggregating Menu Sales & Velocity Data...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Top Header Card with Metric Highlights */}
            <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-gray-900 text-white p-6 md:p-8 rounded-3xl shadow-xl border border-gray-800 space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 text-[10px] font-black uppercase rounded-lg">
                                Menu Engineering & Intelligence
                            </span>
                            <span className="text-gray-400 text-xs font-bold">
                                {menuItems.length} Total Menu Dishes
                            </span>
                        </div>
                        <h2 className="text-2xl font-black tracking-tight">Dish Sales Velocity & Performance Analyzer</h2>
                        <p className="text-xs text-gray-400 font-medium mt-1">
                            Analyze how many times any dish was sold over any period to make data-backed decisions on keeping, repricing, or removing items.
                        </p>
                    </div>

                    {/* Time Range Selector Pills */}
                    <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 flex-wrap">
                        {TIME_RANGES.map(tr => (
                            <button
                                key={tr.value}
                                onClick={() => setTimeRange(tr.value)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                    timeRange === tr.value
                                        ? 'bg-amber-400 text-slate-950 shadow-md scale-102'
                                        : 'text-gray-400 hover:text-white hover:bg-slate-800'
                                }`}
                            >
                                {tr.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 4 Performance Metric Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                            Total Units Sold ({TIME_RANGES.find(t => t.value === timeRange)?.label})
                        </span>
                        <span className="text-2xl md:text-3xl font-black text-amber-400 font-mono">
                            {analytics.totalUnitsSold.toLocaleString()}
                        </span>
                    </div>

                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                            Gross Dish Revenue
                        </span>
                        <span className="text-xl md:text-2xl font-black text-emerald-400 font-mono">
                            KES {analytics.totalRevenue.toLocaleString()}
                        </span>
                    </div>

                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                            Active Ordered Dishes
                        </span>
                        <span className="text-2xl font-black text-blue-400 font-mono">
                            {analytics.activeSellingItemsCount} <span className="text-xs text-gray-500 font-normal">/ {menuItems.length}</span>
                        </span>
                    </div>

                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                            Zero-Sales Dishes in Period
                        </span>
                        <span className="text-2xl font-black text-rose-400 font-mono">
                            {analytics.zeroSalesItemsCount}
                        </span>
                    </div>
                </div>
            </div>

            {/* Filter, Search & Sorting Controls */}
            <div className="bg-white p-5 rounded-3xl border border-gray-200 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search any menu item (e.g. Fish Rice, Egusi, Tilapia, Jollof)..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-2xl text-sm font-bold focus:border-black outline-none transition-colors"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Brand Filter */}
                        <select
                            value={selectedBrand}
                            onChange={(e) => setSelectedBrand(e.target.value)}
                            className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none"
                        >
                            {brands.map(b => <option key={b} value={b}>Brand: {b}</option>)}
                        </select>

                        {/* Category Filter */}
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none max-w-[160px]"
                        >
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>

                        {/* Sort Order */}
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black text-gray-900 outline-none"
                        >
                            <option value="qty_desc">🔥 Most Sold First (Qty)</option>
                            <option value="qty_asc">⚠️ Least Sold First (0 Sales)</option>
                            <option value="rev_desc">💰 Highest Revenue</option>
                            <option value="price_desc">🏷️ Highest Price</option>
                            <option value="last_sold">⏱️ Recently Sold</option>
                            <option value="name_asc">🔤 Name (A - Z)</option>
                        </select>
                    </div>
                </div>

                {/* Health Quadrant Quick Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                    <button
                        onClick={() => setSelectedHealth('All')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                            selectedHealth === 'All' ? 'bg-slate-950 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        All Dishes ({analytics.items.length})
                    </button>
                    <button
                        onClick={() => setSelectedHealth('star')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                            selectedHealth === 'star' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                    >
                        🌟 Stars ({analytics.items.filter(i => i.health === 'star').length})
                    </button>
                    <button
                        onClick={() => setSelectedHealth('workhorse')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                            selectedHealth === 'workhorse' ? 'bg-blue-600 text-white shadow-xs' : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                        }`}
                    >
                        ⚖️ Steady Sellers ({analytics.items.filter(i => i.health === 'workhorse').length})
                    </button>
                    <button
                        onClick={() => setSelectedHealth('puzzle')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                            selectedHealth === 'puzzle' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                        }`}
                    >
                        🧩 High Ticket / Needs Review ({analytics.items.filter(i => i.health === 'puzzle').length})
                    </button>
                    <button
                        onClick={() => setSelectedHealth('dead')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                            selectedHealth === 'dead' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                        }`}
                    >
                        ⚠️ Slow Movers / 0 Sales ({analytics.items.filter(i => i.health === 'dead').length})
                    </button>
                </div>
            </div>

            {/* List of Dish Performance Cards */}
            <div className="space-y-3">
                {displayedItems.map((item, idx) => {
                    const isZero = item.qtySold === 0;
                    return (
                        <div
                            key={item.id || idx}
                            className={`bg-white rounded-3xl p-5 md:p-6 border transition-all shadow-xs hover:shadow-md flex flex-col md:flex-row justify-between gap-5 ${
                                isZero ? 'border-gray-200 bg-gray-50/40 opacity-90' : 'border-gray-200'
                            }`}
                        >
                            {/* Left: Product Info & Recommendation */}
                            <div className="flex-1 space-y-2.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${item.healthBadge.bg}`}>
                                        {item.healthBadge.icon} {item.healthBadge.label}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-100 px-2 py-0.5 rounded-md">
                                        {item.category || 'Uncategorized'}
                                    </span>
                                    {item.brand && (
                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                                            {item.brand}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-baseline gap-3">
                                    <h3 className="text-lg font-black text-gray-900 tracking-tight">
                                        {item.name}
                                    </h3>
                                    <span className="text-sm font-black text-primary font-mono">
                                        KES {Math.round(item.price || 0).toLocaleString()}
                                    </span>
                                </div>

                                {/* Decision Advice Banner */}
                                <div className={`p-3 rounded-2xl text-xs font-medium border flex items-start gap-2 ${
                                    item.health === 'star' ? 'bg-emerald-50/80 text-emerald-900 border-emerald-200' :
                                    item.health === 'puzzle' ? 'bg-amber-50 text-amber-950 border-amber-200' :
                                    isZero ? 'bg-rose-50 text-rose-950 border-rose-200' :
                                    'bg-gray-50 text-gray-700 border-gray-200'
                                }`}>
                                    <Sparkles size={15} className="shrink-0 mt-0.5 text-primary" />
                                    <div>
                                        <b className="font-black">Recommendation:</b> {item.recommendation}
                                    </div>
                                </div>
                            </div>

                            {/* Middle & Right: Sales Stats & Quick Actions */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between md:justify-end gap-5 border-t md:border-t-0 pt-3 md:pt-0 border-gray-100">
                                {/* Metrics Column */}
                                <div className="grid grid-cols-3 gap-4 text-center min-w-[240px]">
                                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                        <span className="text-[9px] uppercase font-black text-gray-400 block tracking-wider mb-0.5">
                                            Units Sold
                                        </span>
                                        <span className={`text-xl font-black font-mono ${isZero ? 'text-gray-400' : 'text-gray-900'}`}>
                                            {item.qtySold}
                                        </span>
                                    </div>

                                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                        <span className="text-[9px] uppercase font-black text-gray-400 block tracking-wider mb-0.5">
                                            Revenue
                                        </span>
                                        <span className={`text-sm font-black font-mono ${isZero ? 'text-gray-400' : 'text-emerald-700'}`}>
                                            KES {item.revenue.toLocaleString()}
                                        </span>
                                    </div>

                                    <div className="bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                        <span className="text-[9px] uppercase font-black text-gray-400 block tracking-wider mb-0.5">
                                            Last Ordered
                                        </span>
                                        <span className="text-[11px] font-bold text-gray-600 block truncate">
                                            {item.allTimeLastSold ? format(new Date(item.allTimeLastSold), 'dd MMM yy') : 'Never'}
                                        </span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <button
                                        disabled={updatingItemId === item.id}
                                        onClick={() => handleToggleMicrosite(item)}
                                        className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 border ${
                                            item.show_on_microsite !== false
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                        }`}
                                        title="Toggle visibility on customer microsite"
                                    >
                                        {item.show_on_microsite !== false ? <Eye size={13} /> : <EyeOff size={13} />}
                                        <span>{item.show_on_microsite !== false ? 'On Microsite' : 'Hidden'}</span>
                                    </button>

                                    <button
                                        disabled={updatingItemId === item.id}
                                        onClick={() => handleToggleAvailable(item)}
                                        className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 border ${
                                            item.is_available
                                                ? 'bg-slate-950 text-white border-black hover:bg-neutral-800'
                                                : 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200'
                                        }`}
                                        title="Enable or disable ordering on POS"
                                    >
                                        {item.is_available ? 'Available' : 'Disabled (Out of Stock)'}
                                    </button>

                                    {onEditItem && (
                                        <button
                                            onClick={() => onEditItem(item)}
                                            className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-colors"
                                            title="Edit dish details in Menu Settings"
                                        >
                                            <Edit3 size={15} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {displayedItems.length === 0 && (
                    <div className="py-20 text-center text-gray-400 bg-white border-2 border-dashed border-gray-200 rounded-3xl space-y-3">
                        <Package size={40} className="mx-auto text-gray-300" />
                        <p className="font-bold text-sm">No menu items match your search & filter criteria.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
