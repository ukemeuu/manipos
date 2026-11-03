import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
    Users, UserCheck, UserPlus, TrendingUp, DollarSign, ShoppingBag, 
    Calendar, RefreshCw, Download, Search, Filter, ArrowUpRight, 
    HeartHandshake, Award, Clock, ArrowRight, ShieldCheck, Flame, ChevronDown, CheckCircle2, Phone, Mail, Sparkles, PieChart as PieIcon, BarChart2
} from 'lucide-react';
import { 
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, 
    Legend, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area 
} from 'recharts';
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

const COLORS = {
    new: '#3b82f6',       // Blue
    returning: '#10b981', // Emerald Green
    vip: '#f59e0b',       // Amber Gold
    atRisk: '#ef4444'     // Rose Red
};

export function CustomerRetentionDashboard() {
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [guests, setGuests] = useState([]);
    const [timeRange, setTimeRange] = useState('30d');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'NEW' | 'RETURNING' | 'VIP'
    const [brandFilter, setBrandFilter] = useState('ALL');

    useEffect(() => {
        fetchCustomerData();
    }, []);

    const fetchCustomerData = async () => {
        setLoading(true);
        try {
            // Fetch all orders in parallel chunks to bypass the Supabase/PostgREST 1000-row limit
            const fetchOrderChunk = (start, end) => 
                supabase
                    .from('pos_orders')
                    .select('id, ticket_number, customer_name, guest_id, created_at, total_amount, status, dining_option, order_channel, brand, notes')
                    .neq('payment_status', 'Voided')
                    .order('created_at', { ascending: false })
                    .range(start, end);

            const [c1, c2, c3, c4, c5, guestsRes] = await Promise.all([
                fetchOrderChunk(0, 999),
                fetchOrderChunk(1000, 1999),
                fetchOrderChunk(2000, 2999),
                fetchOrderChunk(3000, 3999),
                fetchOrderChunk(4000, 4999),
                supabase
                    .from('guests')
                    .select('*')
                    .order('created_at', { ascending: false })
            ]);

            const allOrders = [
                ...(c1.data || []),
                ...(c2.data || []),
                ...(c3.data || []),
                ...(c4.data || []),
                ...(c5.data || [])
            ];

            setOrders(allOrders);
            setGuests(guestsRes.data || []);
        } catch (err) {
            console.error('Error fetching customer analytics data:', err);
        } finally {
            setLoading(false);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // Build Customer Intelligence Profile Map across all lifetime orders
    // ─────────────────────────────────────────────────────────────
    const customerProfiles = useMemo(() => {
        const guestMap = {};
        guests.forEach(g => {
            if (g.id) guestMap[g.id] = g;
        });

        const profiles = {};

        orders.forEach(order => {
            if (order.status === 'Cancelled' || order.status === 'Declined') return;
            const rawName = (order.customer_name || '').trim();
            const lowerName = rawName.toLowerCase();
            const isTable = lowerName.startsWith('table ') || lowerName.startsWith('bar ') || lowerName === 'guest' || lowerName === 'walk-in';
            
            // Group by guest_id if present, else by customer name if not a generic table label
            const key = order.guest_id ? `guest_${order.guest_id}` : (!isTable && rawName.length > 2 ? `name_${lowerName}` : null);
            if (!key) return;

            if (!profiles[key]) {
                const matchedGuest = order.guest_id ? guestMap[order.guest_id] : null;
                profiles[key] = {
                    key,
                    guestId: order.guest_id,
                    name: matchedGuest ? `${matchedGuest.first_name || ''} ${matchedGuest.last_name || ''}`.trim() || rawName : rawName,
                    phone: matchedGuest?.phone || '',
                    email: matchedGuest?.email || '',
                    address: matchedGuest?.delivery_address || order.delivery_address || '',
                    totalOrders: 0,
                    lifetimeSpend: 0,
                    firstOrderDate: order.created_at,
                    lastOrderDate: order.created_at,
                    orders: [],
                    brands: {},
                    channels: {}
                };
            }

            const p = profiles[key];
            const amt = parseFloat(order.total_amount) || 0;
            p.totalOrders += 1;
            p.lifetimeSpend += amt;
            p.orders.push(order);
            if (new Date(order.created_at) > new Date(p.lastOrderDate)) {
                p.lastOrderDate = order.created_at;
            }
            if (new Date(order.created_at) < new Date(p.firstOrderDate)) {
                p.firstOrderDate = order.created_at;
            }

            const brand = order.brand || 'POJ';
            const channel = order.order_channel || order.dining_option || 'Direct';
            p.brands[brand] = (p.brands[brand] || 0) + 1;
            p.channels[channel] = (p.channels[channel] || 0) + 1;
        });

        return Object.values(profiles);
    }, [orders, guests]);

    // ─────────────────────────────────────────────────────────────
    // Filter by Time Range
    // ─────────────────────────────────────────────────────────────
    const filteredData = useMemo(() => {
        const now = new Date();
        let startDate;

        if (timeRange === 'today') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        } else if (timeRange === 'yesterday') {
            startDate = subDays(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0), 1);
        } else if (timeRange === '7d') {
            startDate = subDays(now, 7);
        } else if (timeRange === '30d') {
            startDate = subDays(now, 30);
        } else if (timeRange === 'this_month') {
            startDate = startOfMonth(now);
        } else if (timeRange === '90d') {
            startDate = subDays(now, 90);
        } else {
            startDate = new Date(2020, 0, 1);
        }

        const periodOrders = orders.filter(o => {
            if (o.status === 'Cancelled' || o.status === 'Declined') return false;
            const orderDate = new Date(o.created_at);
            if (brandFilter !== 'ALL' && o.brand !== brandFilter) return false;

            if (timeRange === 'yesterday') {
                const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                return orderDate >= startDate && orderDate < yesterdayEnd;
            }
            return orderDate >= startDate;
        });

        // Fast lookup map for lifetime order counts up to order time
        let newOrdersCount = 0;
        let returningOrdersCount = 0;
        let newRevenue = 0;
        let returningRevenue = 0;

        const dailyTrends = {};

        periodOrders.forEach(o => {
            const amt = parseFloat(o.total_amount) || 0;
            const rawName = (o.customer_name || '').trim().toLowerCase();
            const key = o.guest_id ? `guest_${o.guest_id}` : `name_${rawName}`;
            const prof = customerProfiles.find(p => p.key === key);

            // 1. Check if the cashier tagged the order on POS as New vs Returning
            const notes = (o.notes || '');
            let isFirstVisit = true;

            if (notes.includes('Guest Tag: Returning') || notes.includes('Returning Customer')) {
                isFirstVisit = false;
            } else if (notes.includes('Guest Tag: New') || notes.includes('New Customer')) {
                isFirstVisit = true;
            } else {
                // Fallback for untagged / historical orders based on profile order history
                isFirstVisit = prof ? (prof.totalOrders === 1 || prof.firstOrderDate === o.created_at) : true;
            }

            if (isFirstVisit) {
                newOrdersCount++;
                newRevenue += amt;
            } else {
                returningOrdersCount++;
                returningRevenue += amt;
            }

            // Daily chart bucket
            const dayKey = format(new Date(o.created_at), 'yyyy-MM-dd');
            if (!dailyTrends[dayKey]) {
                dailyTrends[dayKey] = {
                    date: format(new Date(o.created_at), 'MMM dd'),
                    newOrders: 0,
                    returningOrders: 0,
                    newRevenue: 0,
                    returningRevenue: 0,
                    totalOrders: 0
                };
            }
            if (isFirstVisit) {
                dailyTrends[dayKey].newOrders++;
                dailyTrends[dayKey].newRevenue += amt;
            } else {
                dailyTrends[dayKey].returningOrders++;
                dailyTrends[dayKey].returningRevenue += amt;
            }
            dailyTrends[dayKey].totalOrders++;
        });

        const totalPeriodOrders = newOrdersCount + returningOrdersCount;
        const totalPeriodRevenue = newRevenue + returningRevenue;
        const newAOV = newOrdersCount > 0 ? newRevenue / newOrdersCount : 0;
        const returningAOV = returningOrdersCount > 0 ? returningRevenue / returningOrdersCount : 0;
        const overallAOV = totalPeriodOrders > 0 ? totalPeriodRevenue / totalPeriodOrders : 0;
        const retentionRate = totalPeriodOrders > 0 ? (returningOrdersCount / totalPeriodOrders) * 100 : 0;

        const trendChartData = Object.keys(dailyTrends).sort().map(k => dailyTrends[k]);

        // Customer Cohort Frequency Buckets
        let bucket1Order = 0;
        let bucket2to3 = 0;
        let bucket4to7 = 0;
        let bucket8Plus = 0;

        customerProfiles.forEach(p => {
            if (p.totalOrders === 1) bucket1Order++;
            else if (p.totalOrders >= 2 && p.totalOrders <= 3) bucket2to3++;
            else if (p.totalOrders >= 4 && p.totalOrders <= 7) bucket4to7++;
            else if (p.totalOrders >= 8) bucket8Plus++;
        });

        const cohortDistribution = [
            { name: '1 Order (First-Time)', value: bucket1Order, color: '#3b82f6' },
            { name: '2-3 Orders (Repeat)', value: bucket2to3, color: '#10b981' },
            { name: '4-7 Orders (Regulars)', value: bucket4to7, color: '#f59e0b' },
            { name: '8+ Orders (VIP Champions)', value: bucket8Plus, color: '#8b5cf6' }
        ];

        return {
            periodOrders,
            newOrdersCount,
            returningOrdersCount,
            totalPeriodOrders,
            newRevenue,
            returningRevenue,
            totalPeriodRevenue,
            newAOV,
            returningAOV,
            overallAOV,
            retentionRate,
            trendChartData,
            cohortDistribution
        };
    }, [orders, customerProfiles, timeRange, brandFilter]);

    // ─────────────────────────────────────────────────────────────
    // Customer Table Filtering & Search
    // ─────────────────────────────────────────────────────────────
    const filteredCustomers = useMemo(() => {
        return customerProfiles.filter(c => {
            const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                 c.phone.includes(searchTerm) ||
                                 c.email.toLowerCase().includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;

            if (statusFilter === 'NEW') return c.totalOrders === 1;
            if (statusFilter === 'RETURNING') return c.totalOrders >= 2 && c.totalOrders < 5;
            if (statusFilter === 'VIP') return c.totalOrders >= 5;

            return true;
        }).sort((a, b) => b.totalOrders - a.totalOrders);
    }, [customerProfiles, searchTerm, statusFilter]);

    // CSV Export
    const handleExportCSV = () => {
        const headers = ['Customer Name', 'Phone', 'Email', 'Customer Type', 'Total Orders', 'Lifetime Spend (KES)', 'Avg Order (KES)', 'First Visited', 'Last Visited'];
        const rows = filteredCustomers.map(c => [
            `"${c.name}"`,
            `"${c.phone}"`,
            `"${c.email}"`,
            c.totalOrders === 1 ? 'New Guest' : (c.totalOrders >= 5 ? 'VIP Regular' : 'Returning Guest'),
            c.totalOrders,
            Math.round(c.lifetimeSpend),
            Math.round(c.totalOrders > 0 ? c.lifetimeSpend / c.totalOrders : 0),
            format(new Date(c.firstOrderDate), 'yyyy-MM-dd'),
            format(new Date(c.lastOrderDate), 'yyyy-MM-dd')
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `POJ_Customer_Retention_Analysis_${format(new Date(), 'yyyyMMdd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            {/* Top Header & Range Selector */}
            <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-black text-white rounded-3xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 bg-emerald-500 text-gray-950 text-[10px] font-black uppercase rounded-lg">Customer Analytics</span>
                        <span className="text-xs text-gray-400 font-mono">Retention & Lifetime Value</span>
                    </div>
                    <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                        <Users className="text-emerald-400" /> New vs. Returning Customer Intelligence
                    </h2>
                    <p className="text-xs text-gray-400 font-medium mt-1">
                        Track first-time guest acquisition, repeat purchase loyalty, and revenue share.
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Time Range Pills */}
                    <div className="bg-white/10 p-1 rounded-2xl flex gap-1 border border-white/10 overflow-x-auto">
                        {TIME_RANGES.map(tr => (
                            <button
                                key={tr.value}
                                onClick={() => setTimeRange(tr.value)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                    timeRange === tr.value
                                        ? 'bg-emerald-500 text-gray-950 shadow-md'
                                        : 'text-gray-300 hover:text-white'
                                }`}
                            >
                                {tr.label}
                            </button>
                        ))}
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={fetchCustomerData}
                        disabled={loading}
                        className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 transition-all disabled:opacity-50"
                        title="Refresh live data"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                KPI METRIC CARDS
               ════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: New Customers */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                            <UserPlus size={20} />
                        </div>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black rounded-md uppercase">
                            {filteredData.totalPeriodOrders > 0 ? ((filteredData.newOrdersCount / filteredData.totalPeriodOrders) * 100).toFixed(0) : 0}% of Orders
                        </span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">New (1st Time) Orders</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-2xl font-black text-blue-900 font-mono">{filteredData.newOrdersCount}</p>
                        <p className="text-xs font-bold text-gray-500">KES {Math.round(filteredData.newRevenue).toLocaleString('en-KE')}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                        Avg Order: <strong className="text-gray-700">KES {Math.round(filteredData.newAOV)}</strong>
                    </p>
                </div>

                {/* Card 2: Returning Customers */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                            <UserCheck size={20} />
                        </div>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-md uppercase">
                            {filteredData.totalPeriodOrders > 0 ? ((filteredData.returningOrdersCount / filteredData.totalPeriodOrders) * 100).toFixed(0) : 0}% of Orders
                        </span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Returning (Repeat) Orders</p>
                    <div className="flex items-baseline gap-2 mt-1">
                        <p className="text-2xl font-black text-emerald-900 font-mono">{filteredData.returningOrdersCount}</p>
                        <p className="text-xs font-bold text-gray-500">KES {Math.round(filteredData.returningRevenue).toLocaleString('en-KE')}</p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">
                        Avg Order: <strong className="text-emerald-700">KES {Math.round(filteredData.returningAOV)}</strong>
                        {filteredData.returningAOV > filteredData.newAOV && (
                            <span className="text-emerald-600 font-bold ml-1">(+{(Math.round(((filteredData.returningAOV - filteredData.newAOV) / (filteredData.newAOV || 1)) * 100))}% higher spend)</span>
                        )}
                    </p>
                </div>

                {/* Card 3: Retention Rate */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
                            <HeartHandshake size={20} />
                        </div>
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-black rounded-md uppercase">Loyalty Power</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer Retention Rate</p>
                    <p className="text-2xl font-black text-amber-900 font-mono mt-1">
                        {filteredData.retentionRate.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-gray-400 mt-2">
                        Total Unique Guests: <strong className="text-gray-700">{customerProfiles.length} in CRM</strong>
                    </p>
                </div>

                {/* Card 4: Total Revenue Split */}
                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">
                            <DollarSign size={20} />
                        </div>
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-black rounded-md uppercase">Total Sales</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Analyzed Period Revenue</p>
                    <p className="text-2xl font-black text-purple-950 font-mono mt-1">
                        KES {Math.round(filteredData.totalPeriodRevenue).toLocaleString('en-KE')}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-2">
                        {filteredData.totalPeriodOrders} total orders processed
                    </p>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                VISUAL CHARTS: TREND & COHORTS
               ════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart 1: Order Volume Trend (2 Columns) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                                <BarChart2 className="text-emerald-500" size={16} /> New vs. Returning Daily Order Volume
                            </h3>
                            <p className="text-xs text-gray-400 font-medium">Daily order split between first-time and repeat buyers</p>
                        </div>
                    </div>

                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={filteredData.trendChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                <Bar dataKey="newOrders" name="New Customers" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                                <Bar dataKey="returningOrders" name="Returning Customers" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Chart 2: Customer Loyalty Cohorts */}
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                            <PieIcon className="text-purple-500" size={16} /> Order Frequency Cohorts
                        </h3>
                        <p className="text-xs text-gray-400 font-medium">Breakdown of customer repeat depth</p>
                    </div>

                    <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={filteredData.cohortDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={45}
                                    outerRadius={70}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {filteredData.cohortDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '11px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Legend stats */}
                    <div className="space-y-1.5 pt-2 border-t border-gray-100 text-xs">
                        {filteredData.cohortDistribution.map((c, i) => (
                            <div key={i} className="flex justify-between items-center">
                                <span className="flex items-center gap-2 text-gray-600 font-medium">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                                    {c.name}
                                </span>
                                <span className="font-bold text-gray-900 font-mono">{c.value} guests</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════
                CUSTOMER DIRECTORY & LEADERBOARD TABLE
               ════════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden space-y-4 p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                        <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                            <Award className="text-amber-500" size={18} /> Customer Retention Directory ({filteredCustomers.length})
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">
                            Search customer visit histories, identify VIP regulars, and export for marketing campaigns.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                        {/* Search */}
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                            <input
                                type="text"
                                placeholder="Search customer name or phone..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-emerald-500 focus:bg-white"
                            />
                        </div>

                        {/* Status Filters */}
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-emerald-500 cursor-pointer"
                        >
                            <option value="ALL">All Customers</option>
                            <option value="NEW">🆕 1st Time Only</option>
                            <option value="RETURNING">🔄 Repeat Guests (2-4 Orders)</option>
                            <option value="VIP">🌟 VIP Regulars (5+ Orders)</option>
                        </select>

                        {/* Export Button */}
                        <button
                            onClick={handleExportCSV}
                            className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
                        >
                            <Download size={13} /> Export CSV
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto pt-2">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-gray-50 text-gray-400 font-black uppercase text-[10px] tracking-wider border-b border-gray-100">
                                <th className="p-3 pl-4">Customer Details</th>
                                <th className="p-3 text-center">Status</th>
                                <th className="p-3 text-center">Visits / Orders</th>
                                <th className="p-3 text-right">Lifetime Spend</th>
                                <th className="p-3 text-right">Avg Order</th>
                                <th className="p-3 text-center">First Seen</th>
                                <th className="p-3 text-center pr-4">Last Visit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium">
                            {filteredCustomers.slice(0, 100).map((cust, idx) => {
                                const isVIP = cust.totalOrders >= 5;
                                const isRepeat = cust.totalOrders >= 2 && cust.totalOrders < 5;
                                const avgOrder = cust.totalOrders > 0 ? cust.lifetimeSpend / cust.totalOrders : 0;

                                return (
                                    <tr key={cust.key || idx} className="hover:bg-gray-50/70 transition-colors">
                                        {/* Customer */}
                                        <td className="p-3 pl-4">
                                            <p className="font-bold text-gray-900 text-xs">{cust.name || 'Anonymous Guest'}</p>
                                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                                                {cust.phone && <span className="flex items-center gap-1"><Phone size={10} /> {cust.phone}</span>}
                                                {cust.email && <span className="flex items-center gap-1"><Mail size={10} /> {cust.email}</span>}
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="p-3 text-center">
                                            {isVIP ? (
                                                <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 font-black text-[10px] rounded-lg inline-flex items-center gap-1">
                                                    🌟 VIP Regular
                                                </span>
                                            ) : isRepeat ? (
                                                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px] rounded-lg inline-flex items-center gap-1">
                                                    🔄 Repeat
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px] rounded-lg">
                                                    🆕 1st Time
                                                </span>
                                            )}
                                        </td>

                                        {/* Orders Count */}
                                        <td className="p-3 text-center">
                                            <span className="font-mono font-black text-gray-900 text-xs px-2 py-0.5 bg-gray-100 rounded-md">
                                                {cust.totalOrders} orders
                                            </span>
                                        </td>

                                        {/* Lifetime Spend */}
                                        <td className="p-3 text-right font-mono font-black text-gray-900">
                                            KES {Math.round(cust.lifetimeSpend).toLocaleString('en-KE')}
                                        </td>

                                        {/* Avg Order */}
                                        <td className="p-3 text-right font-mono text-gray-600">
                                            KES {Math.round(avgOrder).toLocaleString('en-KE')}
                                        </td>

                                        {/* First Seen */}
                                        <td className="p-3 text-center text-gray-500 font-mono text-[11px]">
                                            {format(new Date(cust.firstOrderDate), 'MMM dd, yyyy')}
                                        </td>

                                        {/* Last Visit */}
                                        <td className="p-3 text-center pr-4 text-gray-900 font-mono text-[11px] font-bold">
                                            {format(new Date(cust.lastOrderDate), 'MMM dd, yyyy')}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
