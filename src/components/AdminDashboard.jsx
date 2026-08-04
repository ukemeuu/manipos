import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  BarChart as RechartsBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  Package, 
  Receipt, 
  Settings, 
  Plus, 
  Edit3, 
  Trash2, 
  Check, 
  X, 
  Loader2, 
  DollarSign, 
  ShoppingBag,
  CreditCard,
  Phone,
  MapPin,
  Save,
  Menu,
  ChevronRight,
  Truck,
  MessageSquare,
  Star,
  Inbox,
  Link2,
  Video,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function AdminDashboard({ onBackToTerminal }) {
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics', 'menu', 'staff', 'settings', 'suppliers', 'feedback', 'leads', 'linkhub'
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [leadsList, setLeadsList] = useState([]);
  const [tenantLinks, setTenantLinks] = useState([]);
  const [editingLink, setEditingLink] = useState(null);
  const [settings, setSettings] = useState({
    address: '',
    phone: '',
    mpesa_paybill: '',
    mpesa_account: ''
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modals / Editing states
  const [editingItem, setEditingItem] = useState(null); // for menu
  const [editingStaff, setEditingStaff] = useState(null); // for staff
  const [editingSupplier, setEditingSupplier] = useState(null); // for suppliers
  
  // Restaurant info
  const restaurantName = useMemo(() => {
    try {
      const stored = localStorage.getItem('pin_staff_user');
      if (stored) return JSON.parse(stored).restaurantName;
    } catch(e) {}
    return 'ManiPOS Partner';
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Orders
      const { data: fetchedOrders } = await supabase
        .from('pos_orders')
        .select('*')
        .order('created_at', { ascending: false });
      setOrders(fetchedOrders || []);

      // 2. Fetch Menu Items
      const { data: fetchedMenu } = await supabase
        .from('pos_menu')
        .select('*')
        .order('name');
      setMenuItems(fetchedMenu || []);

      // 3. Fetch Staff List
      const { data: fetchedStaff } = await supabase
        .from('staff_access')
        .select('*')
        .order('name');
      setStaffList(fetchedStaff || []);

      // 4. Fetch Customer Feedback
      try {
        const { data: fetchedFeedback } = await supabase
          .from('pos_feedback')
          .select('*')
          .order('created_at', { ascending: false });
        setFeedbackList(fetchedFeedback || []);
      } catch (e) {
        console.warn('Feedback table not configured yet:', e);
      }

      // 5. Fetch Leads / Demo Signups
      try {
        const { data: fetchedLeads } = await supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false });
        setLeadsList(fetchedLeads || []);
      } catch (e) {
        console.warn('Leads table notice:', e);
      }

      // 6. Fetch Restaurant Links for Link Hub
      try {
        const { data: fetchedLinks } = await supabase
          .from('tenant_links')
          .select('*')
          .order('display_order', { ascending: true });
        setTenantLinks(fetchedLinks || []);
      } catch (e) {
        console.warn('Tenant links fetch notice:', e);
      }

      // 5. Fetch Restaurant Settings
      const { data: fetchedSettings } = await supabase
        .from('restaurant_settings')
        .select('*')
        .limit(1);

      if (fetchedSettings && fetchedSettings.length > 0) {
        setSettings(fetchedSettings[0]);
      } else {
        // Create initial default settings row if missing
        const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
        if (pinUser.restaurantId) {
          const { data: newSettings } = await supabase
            .from('restaurant_settings')
            .insert([{
              restaurant_id: pinUser.restaurantId,
              address: '123 Main Street',
              phone: '+254700000000',
              mpesa_paybill: '400200',
              mpesa_account: '123456'
            }])
            .select()
            .single();
          if (newSettings) setSettings(newSettings);
        }
      }

      // 5. Fetch Suppliers (with graceful fallback if table does not exist)
      try {
        const { data: fetchedSuppliers, error: supplierError } = await supabase
          .from('suppliers')
          .select('*')
          .order('name');
        if (supplierError) {
          console.warn("Suppliers table may not exist in database yet:", supplierError.message);
        } else {
          setSuppliers(fetchedSuppliers || []);
        }
      } catch (supplierErr) {
        console.warn("Error loading suppliers:", supplierErr);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Analytics Computations
  const stats = useMemo(() => {
    const validOrders = orders.filter(o => o.status === 'Completed' || o.status === 'Approved');
    const grossSales = validOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const transactionCount = validOrders.length;
    const avgOrderValue = transactionCount > 0 ? grossSales / transactionCount : 0;

    // Payment Method Split
    const paymentCounts = {};
    validOrders.forEach(o => {
      const method = o.payment_method || 'CASH';
      paymentCounts[method] = (paymentCounts[method] || 0) + (o.total_amount || 0);
    });

    const paymentSplitData = Object.keys(paymentCounts).map(name => ({
      name,
      value: paymentCounts[name]
    }));

    // Sales over time (last 7 entries)
    const salesOverTime = [...validOrders]
      .reverse()
      .slice(-10)
      .map(o => ({
        time: new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        amount: o.total_amount
      }));

    return {
      grossSales,
      transactionCount,
      avgOrderValue,
      paymentSplitData,
      salesOverTime
    };
  }, [orders]);

  // Menu Management Handlers
  const handleToggleAvailability = async (item) => {
    try {
      const updatedAvailable = !item.is_available;
      const { error } = await supabase
        .from('pos_menu')
        .update({ is_available: updatedAvailable })
        .eq('id', item.id);

      if (error) throw error;
      setMenuItems(prev => prev.map(m => m.id === item.id ? { ...m, is_available: updatedAvailable } : m));
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  const handleSaveMenuItem = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.target;
    const payload = {
      name: form.itemName.value,
      price: parseFloat(form.price.value),
      category: form.category.value,
      description: form.description.value,
      is_available: form.isAvailable.checked
    };

    try {
      if (editingItem && editingItem.id) {
        // Update
        const { error } = await supabase
          .from('pos_menu')
          .update(payload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        // Create
        const { error } = await supabase
          .from('pos_menu')
          .insert([payload]);
        if (error) throw error;
      }
      setEditingItem(null);
      fetchDashboardData();
    } catch (err) {
      alert('Error saving menu item: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Staff Management Handlers
  const handleSaveStaff = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.target;
    const payload = {
      name: form.staffName.value,
      role: form.role.value,
      pin: form.pin.value
    };

    try {
      if (editingStaff && editingStaff.id) {
        const { error } = await supabase
          .from('staff_access')
          .update(payload)
          .eq('id', editingStaff.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('staff_access')
          .insert([payload]);
        if (error) throw error;
      }
      setEditingStaff(null);
      fetchDashboardData();
    } catch (err) {
      alert('Error saving staff member: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStaff = async (id) => {
    if (!confirm('Are you sure you want to remove this staff access?')) return;
    try {
      const { error } = await supabase
        .from('staff_access')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchDashboardData();
    } catch (err) {
      alert('Error deleting staff: ' + err.message);
    }
  };

  const handleDeleteMenuItem = async (id) => {
    if (!confirm('Are you sure you want to remove this menu item?')) return;
    try {
      const { error } = await supabase
        .from('pos_menu')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchDashboardData();
    } catch (err) {
      alert('Error deleting menu item: ' + err.message);
    }
  };

  // Supplier Handlers
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.target;
    const payload = {
      name: form.supplierName.value,
      contact_name: form.contactName.value,
      phone: form.phone.value,
      email: form.email.value,
      address: form.address.value
    };

    try {
      if (editingSupplier && editingSupplier.id) {
        const { error } = await supabase
          .from('suppliers')
          .update(payload)
          .eq('id', editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert([payload]);
        if (error) throw error;
      }
      setEditingSupplier(null);
      fetchDashboardData();
    } catch (err) {
      alert('Error saving supplier: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSupplier = async (id) => {
    if (!confirm('Are you sure you want to delete this supplier?')) return;
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      fetchDashboardData();
    } catch (err) {
      alert('Error deleting supplier: ' + err.message);
    }
  };

  // Settings Handlers
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('restaurant_settings')
        .upsert([{
          id: settings.id,
          address: settings.address,
          phone: settings.phone,
          mpesa_paybill: settings.mpesa_paybill,
          mpesa_account: settings.mpesa_account
        }]);

      if (error) throw error;
      alert('Receipt & Payment Settings updated successfully!');
    } catch (err) {
      alert('Error saving settings: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin text-emerald-400 mx-auto" size={40} />
          <p className="text-slate-400 text-sm font-semibold tracking-wide uppercase">Loading Partner Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="absolute top-0 left-0 w-[40%] h-[40%] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="bg-slate-900/60 backdrop-blur-md border-b border-slate-900 px-8 py-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 text-slate-950 flex items-center justify-center rounded-xl font-black text-xl shadow-lg shadow-emerald-500/10">
            M
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white uppercase">{restaurantName}</h1>
            <p className="text-slate-400 text-xs font-semibold">ManiPOS Partner Console</p>
          </div>
        </div>
        <button
          onClick={onBackToTerminal}
          className="text-sm font-bold text-slate-300 hover:text-emerald-400 hover:border-emerald-500/20 bg-slate-950 border border-slate-800 px-5 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
        >
          Go to Register <ChevronRight size={16} />
        </button>
      </header>

      <div className="flex flex-1 z-10">
        
        {/* Navigation Sidebar */}
        <aside className="w-64 bg-slate-900/40 border-r border-slate-900/80 p-6 space-y-2 shrink-0">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'analytics' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <TrendingUp size={18} />
            Analytics & Sales
          </button>
          
          <button
            onClick={() => setActiveTab('menu')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'menu' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Package size={18} />
            Menu Management
          </button>

          <button
            onClick={() => setActiveTab('staff')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'staff' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Users size={18} />
            Staff & Access
          </button>

          <button
            onClick={() => setActiveTab('suppliers')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'suppliers' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Truck size={18} />
            Supplier Management
          </button>

          <button
            onClick={() => setActiveTab('feedback')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'feedback' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <MessageSquare size={18} />
            Customer Feedback
          </button>

          <button
            onClick={() => setActiveTab('leads')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'leads' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Inbox size={18} />
            Demo Signups & Leads
          </button>

          <button
            onClick={() => setActiveTab('linkhub')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'linkhub' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Link2 size={18} />
            Link Hub & Socials
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'settings' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10' 
                : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Settings size={18} />
            Receipt Configuration
          </button>
        </aside>

        {/* Workspace Panels */}
        <main className="flex-1 p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            
            {/* ANALYTICS PANEL */}
            {activeTab === 'analytics' && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-2xl font-black text-white">Sales & Analytics</h2>
                  <p className="text-slate-400 text-sm mt-1">Real-time indicators and operational performance metrics.</p>
                </div>

                {/* Scorecards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 flex items-center justify-center rounded-xl border border-emerald-500/10">
                      <DollarSign size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Sales</p>
                      <h3 className="text-2xl font-black text-white mt-1">KES {stats.grossSales.toLocaleString()}</h3>
                    </div>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/10 text-blue-400 flex items-center justify-center rounded-xl border border-blue-500/10">
                      <ShoppingBag size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed Orders</p>
                      <h3 className="text-2xl font-black text-white mt-1">{stats.transactionCount}</h3>
                    </div>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500/10 text-amber-400 flex items-center justify-center rounded-xl border border-amber-500/10">
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Order Value (AOV)</p>
                      <h3 className="text-2xl font-black text-white mt-1">KES {Math.round(stats.avgOrderValue).toLocaleString()}</h3>
                    </div>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 bg-slate-900/40 border border-slate-900 p-6 rounded-2xl space-y-4">
                    <h4 className="font-bold text-white text-sm">Recent Transactions (KES)</h4>
                    <div className="h-64">
                      {stats.salesOverTime.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={stats.salesOverTime}>
                            <XAxis dataKey="time" stroke="#475569" fontSize={11} tickLine={false} />
                            <YAxis stroke="#475569" fontSize={11} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }} />
                            <Area type="monotone" dataKey="amount" stroke="#10b981" fillOpacity={0.1} fill="url(#colorSales)" strokeWidth={2} />
                            <defs>
                              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-600 text-xs">No transaction history found today.</div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-4 bg-slate-900/40 border border-slate-900 p-6 rounded-2xl space-y-4 flex flex-col justify-between">
                    <h4 className="font-bold text-white text-sm">Payment Methods Split</h4>
                    <div className="h-48 flex items-center justify-center">
                      {stats.paymentSplitData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats.paymentSplitData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {stats.paymentSplitData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => `KES ${value.toLocaleString()}`} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="text-slate-600 text-xs">No split data.</div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {stats.paymentSplitData.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                            {item.name}
                          </span>
                          <span className="font-bold text-white">KES {item.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* MENU PANEL */}
            {activeTab === 'menu' && (
              <motion.div
                key="menu"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-white">Menu Management</h2>
                    <p className="text-slate-400 text-sm mt-1">Manage catalog details, pricing structures, and stock availability status.</p>
                  </div>
                  <button
                    onClick={() => setEditingItem({ name: '', price: '', category: 'Starters & Bites', description: '', is_available: true })}
                    className="flex items-center gap-1 bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/10 hover:brightness-110 transition-all"
                  >
                    <Plus size={16} /> Add Menu Item
                  </button>
                </div>

                {/* Menu Table */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-inner">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900/80 bg-slate-900/20 text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <th className="py-4 px-6">Name</th>
                        <th className="py-4 px-6">Category</th>
                        <th className="py-4 px-6">Price</th>
                        <th className="py-4 px-6">Status</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/80 text-sm">
                      {menuItems.map(item => (
                        <tr key={item.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="py-4 px-6 font-bold text-white">{item.name}</td>
                          <td className="py-4 px-6 text-slate-400">{item.category}</td>
                          <td className="py-4 px-6 text-slate-200">KES {item.price.toLocaleString()}</td>
                          <td className="py-4 px-6">
                            <button
                              onClick={() => handleToggleAvailability(item)}
                              className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                                item.is_available 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}
                            >
                              {item.is_available ? 'Available' : 'Sold Out'}
                            </button>
                          </td>
                          <td className="py-4 px-6 text-right space-x-2">
                            <button
                              onClick={() => setEditingItem(item)}
                              className="text-slate-400 hover:text-white p-1"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteMenuItem(item.id)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* STAFF PANEL */}
            {activeTab === 'staff' && (
              <motion.div
                key="staff"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-white">Staff Management</h2>
                    <p className="text-slate-400 text-sm mt-1">Configure staff authorization credentials and role permissions.</p>
                  </div>
                  <button
                    onClick={() => setEditingStaff({ name: '', role: 'staff', pin: '' })}
                    className="flex items-center gap-1 bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/10 hover:brightness-110 transition-all"
                  >
                    <Plus size={16} /> Add Staff Account
                  </button>
                </div>

                {/* Staff Access Table */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-inner">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900/80 bg-slate-900/20 text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <th className="py-4 px-6">Name</th>
                        <th className="py-4 px-6">Role</th>
                        <th className="py-4 px-6">Security PIN</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/80 text-sm">
                      {staffList.map(staff => (
                        <tr key={staff.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="py-4 px-6 font-bold text-white">{staff.name}</td>
                          <td className="py-4 px-6">
                            <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${
                              staff.role === 'admin' 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' 
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                            }`}>
                              {staff.role}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-slate-400 font-mono">••••</td>
                          <td className="py-4 px-6 text-right space-x-2">
                            <button
                              onClick={() => setEditingStaff(staff)}
                              className="text-slate-400 hover:text-white p-1"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteStaff(staff.id)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* SETTINGS PANEL */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8 max-w-2xl"
              >
                <div>
                  <h2 className="text-2xl font-black text-white">Receipt Configuration</h2>
                  <p className="text-slate-400 text-sm mt-1">Configure layout, location details, and payment gateway variables for printed receipts.</p>
                </div>

                <form onSubmit={handleSaveSettings} className="bg-slate-900/40 border border-slate-900 p-8 rounded-2xl space-y-6">
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Physical Address</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-slate-600"><MapPin size={18} /></span>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 5th Floor, Westlands Heights, Nairobi"
                        value={settings.address || ''}
                        onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Contact Phone Number</label>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-slate-600"><Phone size={18} /></span>
                      <input
                        type="text"
                        required
                        placeholder="e.g. +254 700 123 456"
                        value={settings.phone || ''}
                        onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">M-PESA Paybill</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 400200"
                        value={settings.mpesa_paybill || ''}
                        onChange={(e) => setSettings({ ...settings, mpesa_paybill: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">M-PESA Account Number</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 123456"
                        value={settings.mpesa_account || ''}
                        onChange={(e) => setSettings({ ...settings, mpesa_account: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 mt-4 text-sm"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : (
                      <>
                        <Save size={18} /> Save Settings Details
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}

            {/* SUPPLIERS PANEL */}
            {activeTab === 'suppliers' && (
              <motion.div
                key="suppliers"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-white">Supplier Management</h2>
                    <p className="text-slate-400 text-sm mt-1">Manage vendor contacts, emails, phone numbers, and physical addresses.</p>
                  </div>
                  <button
                    onClick={() => setEditingSupplier({ name: '', contact_name: '', phone: '', email: '', address: '' })}
                    className="flex items-center gap-1 bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/10 hover:brightness-110 transition-all"
                  >
                    <Plus size={16} /> Add Supplier
                  </button>
                </div>

                {/* Suppliers Table */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-inner">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900/80 bg-slate-900/20 text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <th className="py-4 px-6">Vendor Name</th>
                        <th className="py-4 px-6">Contact Person</th>
                        <th className="py-4 px-6">Phone Number</th>
                        <th className="py-4 px-6">Email Address</th>
                        <th className="py-4 px-6">Physical Address</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/80 text-sm">
                      {suppliers.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-8 px-6 text-center text-slate-500 font-bold">
                            No suppliers registered yet. Click "Add Supplier" to configure vendors.
                          </td>
                        </tr>
                      ) : (
                        suppliers.map(supplier => (
                          <tr key={supplier.id} className="hover:bg-slate-900/20 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">{supplier.name}</td>
                            <td className="py-4 px-6 text-slate-350">{supplier.contact_name || '—'}</td>
                            <td className="py-4 px-6 text-slate-200">{supplier.phone || '—'}</td>
                            <td className="py-4 px-6 text-slate-400 font-mono text-xs">{supplier.email || '—'}</td>
                            <td className="py-4 px-6 text-slate-350">{supplier.address || '—'}</td>
                            <td className="py-4 px-6 text-right space-x-2">
                              <button
                                onClick={() => setEditingSupplier(supplier)}
                                className="text-slate-400 hover:text-white p-1"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteSupplier(supplier.id)}
                                className="text-slate-500 hover:text-rose-400 p-1"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* CUSTOMER FEEDBACK PANEL */}
            {activeTab === 'feedback' && (
              <motion.div
                key="feedback"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-white">Guest Feedback & Reviews</h2>
                    <p className="text-slate-400 text-sm mt-1">Real-time ratings, comments, and experience feedback submitted by dining guests.</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3">
                    <div className="flex items-center gap-1 text-amber-400 font-black text-lg">
                      <Star size={20} className="fill-amber-400 text-amber-400" />
                      <span>
                        {feedbackList.length > 0 
                          ? (feedbackList.reduce((acc, f) => acc + (f.rating || 5), 0) / feedbackList.length).toFixed(1)
                          : '5.0'}
                      </span>
                    </div>
                    <span className="text-slate-500 text-xs font-bold uppercase border-l border-slate-800 pl-3">
                      {feedbackList.length} Reviews
                    </span>
                  </div>
                </div>

                {/* Feedback Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {feedbackList.length === 0 ? (
                    <div className="col-span-2 py-12 text-center bg-slate-900/40 border border-slate-900 rounded-2xl">
                      <MessageSquare size={36} className="text-slate-600 mx-auto mb-3" />
                      <h4 className="text-slate-300 font-extrabold text-base">No Customer Feedback Yet</h4>
                      <p className="text-slate-500 text-xs mt-1">When guests scan the Feedback QR code on thermal receipts, their reviews will appear here.</p>
                    </div>
                  ) : (
                    feedbackList.map((fb) => (
                      <div key={fb.id || Math.random()} className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-3 shadow-md">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-white font-extrabold text-sm">{fb.customer_name || 'Anonymous Guest'}</h4>
                            <p className="text-slate-400 text-[11px] font-medium">{fb.customer_contact || 'No contact info provided'}</p>
                          </div>
                          <div className="flex items-center gap-1 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full text-amber-400 font-black text-xs">
                            <Star size={14} className="fill-amber-400 text-amber-400" />
                            <span>{fb.rating || 5}.0</span>
                          </div>
                        </div>

                        <div className="inline-block bg-slate-800 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
                          {fb.category || 'General Service'}
                        </div>

                        <p className="text-slate-200 text-xs leading-relaxed font-medium bg-slate-950/40 p-3 rounded-xl border border-slate-900">
                          "{fb.comment || 'No written comment left.'}"
                        </p>

                        <div className="text-[10px] font-bold text-slate-500 text-right">
                          {new Date(fb.created_at || Date.now()).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* DEMO SIGNUPS & LEADS PANEL */}
            {activeTab === 'leads' && (
              <motion.div
                key="leads"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-white">Demo Requests & Restaurant Leads</h2>
                    <p className="text-slate-400 text-sm mt-1">Inbound restaurant owners who requested a live demo from manipos.com.</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-[#FACC15] font-black text-sm">
                    {leadsList.length} Total Leads
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-inner">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900/80 bg-slate-900/20 text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <th className="py-4 px-6">Restaurant Name</th>
                        <th className="py-4 px-6">Owner Email</th>
                        <th className="py-4 px-6">Phone Number</th>
                        <th className="py-4 px-6">Location</th>
                        <th className="py-4 px-6 text-right">Signup Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-sm">
                      {leadsList.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-12 text-center text-slate-500 font-medium">
                            No demo requests received yet. When restaurant owners sign up on manipos.com, they will appear here.
                          </td>
                        </tr>
                      ) : (
                        leadsList.map((lead) => (
                          <tr key={lead.id || Math.random()} className="hover:bg-slate-900/30 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">
                              {lead.restaurant_name || 'N/A'}
                            </td>
                            <td className="py-4 px-6 text-emerald-400 font-medium">
                              {lead.email || 'N/A'}
                            </td>
                            <td className="py-4 px-6 text-slate-300 font-medium">
                              {lead.phone || 'N/A'}
                            </td>
                            <td className="py-4 px-6 text-slate-400 font-medium">
                              {lead.locations || lead.location || 'N/A'}
                            </td>
                            <td className="py-4 px-6 text-right text-slate-500 text-xs font-semibold">
                              {new Date(lead.created_at || Date.now()).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* LINK HUB & SOCIALS PANEL */}
            {activeTab === 'linkhub' && (
              <motion.div
                key="linkhub"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-2xl font-black text-white">Restaurant Link Hub & Socials</h2>
                    <p className="text-slate-400 text-sm mt-1">Manage public landing links (UberEats, QR Menu, WhatsApp Order, Instagram) & background visuals.</p>
                  </div>
                  <button
                    onClick={() => setEditingLink({ title: '', subtitle: '', url: '', icon: 'Utensils', badge_text: '', button_color: 'amber', is_active: true })}
                    className="flex items-center gap-1 bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/10 hover:brightness-110 transition-all cursor-pointer"
                  >
                    <Plus size={16} /> Add New Link
                  </button>
                </div>

                {/* Background Customization Settings Box */}
                <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl space-y-4">
                  <h3 className="text-white font-extrabold text-sm flex items-center gap-2">
                    <ImageIcon size={18} className="text-amber-400" />
                    Landing Page Background Customization
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold">
                    <div>
                      <label className="block text-slate-400 mb-1">Background Style</label>
                      <select
                        value={settings.hub_bg_type || 'gradient'}
                        onChange={(e) => setSettings({ ...settings, hub_bg_type: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
                      >
                        <option value="gradient">Dark Ambient Glow (Default)</option>
                        <option value="image">Static Background Image</option>
                        <option value="video">Looping Background Video (MP4)</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-slate-400 mb-1">Background Image or Video URL</label>
                      <input
                        type="text"
                        value={settings.hub_bg_url || ''}
                        onChange={(e) => setSettings({ ...settings, hub_bg_url: e.target.value })}
                        placeholder="https://images.unsplash.com/photo... or https://domain.com/video.mp4"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white placeholder:text-slate-600"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={async () => {
                        setSubmitting(true);
                        try {
                          await supabase
                            .from('restaurant_settings')
                            .upsert([settings]);
                          alert('Background settings saved successfully!');
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                      disabled={submitting}
                      className="bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs hover:bg-amber-300 transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Save size={14} /> Save Background Settings
                    </button>
                  </div>
                </div>

                {/* Links Table */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden shadow-inner">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-900/80 bg-slate-900/20 text-xs text-slate-500 font-bold uppercase tracking-wider">
                        <th className="py-4 px-6">Button Title</th>
                        <th className="py-4 px-6">Target URL</th>
                        <th className="py-4 px-6">Badge Text</th>
                        <th className="py-4 px-6">Color</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-sm">
                      {tenantLinks.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="py-12 text-center text-slate-500 font-medium">
                            No links created yet. Click "Add New Link" to create custom buttons for your landing hub.
                          </td>
                        </tr>
                      ) : (
                        tenantLinks.map((link) => (
                          <tr key={link.id || Math.random()} className="hover:bg-slate-900/30 transition-colors">
                            <td className="py-4 px-6 font-bold text-white">
                              <div>{link.title}</div>
                              {link.subtitle && <div className="text-xs text-slate-400 font-normal">{link.subtitle}</div>}
                            </td>
                            <td className="py-4 px-6 text-amber-400 font-mono text-xs truncate max-w-xs">
                              {link.url}
                            </td>
                            <td className="py-4 px-6">
                              {link.badge_text ? (
                                <span className="bg-slate-800 text-slate-200 text-[10px] font-black uppercase px-2.5 py-1 rounded-md">
                                  {link.badge_text}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">-</span>
                              )}
                            </td>
                            <td className="py-4 px-6">
                              <span className="capitalize font-bold text-xs text-slate-300">{link.button_color || 'amber'}</span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setEditingLink(link)}
                                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button
                                  onClick={async () => {
                                    if (confirm(`Delete "${link.title}"?`)) {
                                      await supabase.from('tenant_links').delete().eq('id', link.id);
                                      setTenantLinks(tenantLinks.filter(l => l.id !== link.id));
                                    }
                                  }}
                                  className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* Menu Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md p-8 rounded-3xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white">{editingItem.id ? 'Edit Menu Item' : 'Add Menu Item'}</h3>
                <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
              </div>

              <form onSubmit={handleSaveMenuItem} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Item Name</label>
                  <input
                    name="itemName"
                    type="text"
                    required
                    defaultValue={editingItem.name}
                    placeholder="e.g. Traditional swallow"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Price (KES)</label>
                    <input
                      name="price"
                      type="number"
                      required
                      defaultValue={editingItem.price}
                      placeholder="e.g. 500"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Category</label>
                    <select
                      name="category"
                      defaultValue={editingItem.category || 'Starters & Bites'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none text-slate-300"
                    >
                      <option value="Starters & Bites">Starters & Bites</option>
                      <option value="Breakfast">Breakfast</option>
                      <option value="Main Combos">Main Combos</option>
                      <option value="Stews">Stews</option>
                      <option value="Soups">Soups</option>
                      <option value="Beverages">Beverages</option>
                      <option value="Hot Beverages">Hot Beverages</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Description</label>
                  <textarea
                    name="description"
                    defaultValue={editingItem.description}
                    placeholder="e.g. Served hot with custom additions..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none h-20 resize-none"
                  />
                </div>

                <div className="flex items-center gap-2 py-1">
                  <input
                    name="isAvailable"
                    id="isAvailable"
                    type="checkbox"
                    defaultChecked={editingItem.is_available}
                    className="w-4 h-4 accent-emerald-500"
                  />
                  <label htmlFor="isAvailable" className="text-xs font-semibold text-slate-300">Item is available / In Stock</label>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-500 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 text-sm mt-2"
                >
                  {submitting ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Save Menu Item'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Staff Modal */}
      <AnimatePresence>
        {editingStaff && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md p-8 rounded-3xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white">{editingStaff.id ? 'Edit Staff Account' : 'Add Staff Account'}</h3>
                <button onClick={() => setEditingStaff(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
              </div>

              <form onSubmit={handleSaveStaff} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Name</label>
                  <input
                    name="staffName"
                    type="text"
                    required
                    defaultValue={editingStaff.name}
                    placeholder="e.g. John Doe"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Role</label>
                    <select
                      name="role"
                      defaultValue={editingStaff.role || 'staff'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none text-slate-300"
                    >
                      <option value="staff">Cashier</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Security PIN (4 digits)</label>
                    <input
                      name="pin"
                      type="text"
                      maxLength={4}
                      pattern="\d{4}"
                      required
                      defaultValue={editingStaff.pin}
                      placeholder="e.g. 1234"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-500 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 text-sm mt-2"
                >
                  {submitting ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Save Staff Account'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Suppliers Modal */}
      <AnimatePresence>
        {editingSupplier && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md p-8 rounded-3xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white">{editingSupplier.id ? 'Edit Supplier' : 'Add Supplier'}</h3>
                <button onClick={() => setEditingSupplier(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
              </div>

              <form onSubmit={handleSaveSupplier} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Supplier / Vendor Name</label>
                  <input
                    name="supplierName"
                    type="text"
                    required
                    defaultValue={editingSupplier.name}
                    placeholder="e.g. East Africa Wholesalers Ltd"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Contact Person Name</label>
                  <input
                    name="contactName"
                    type="text"
                    defaultValue={editingSupplier.contact_name}
                    placeholder="e.g. Jane Njoroge"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Phone Number</label>
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={editingSupplier.phone}
                      placeholder="e.g. +254700000000"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Email Address</label>
                    <input
                      name="email"
                      type="email"
                      defaultValue={editingSupplier.email}
                      placeholder="e.g. sales@vendor.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none text-slate-300"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Physical Address</label>
                  <input
                    name="address"
                    type="text"
                    defaultValue={editingSupplier.address}
                    placeholder="e.g. Warehouse 4B, Industrial Area, Nairobi"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-500 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 text-sm mt-2 flex items-center justify-center"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : 'Save Supplier'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Link Hub Modal */}
        {editingLink && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md p-8 rounded-3xl space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white">{editingLink.id ? 'Edit Landing Link' : 'Add New Landing Link'}</h3>
                <button onClick={() => setEditingLink(null)} className="text-slate-400 hover:text-white cursor-pointer"><X size={20} /></button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSubmitting(true);
                  const formData = new FormData(e.target);
                  const linkData = {
                    ...(editingLink.id ? { id: editingLink.id } : {}),
                    tenant_id: getTenantInfo().tenantSlug || 'potofjollof',
                    title: formData.get('title'),
                    subtitle: formData.get('subtitle'),
                    url: formData.get('url'),
                    icon: formData.get('icon'),
                    badge_text: formData.get('badge_text'),
                    button_color: formData.get('button_color'),
                    is_active: true
                  };

                  try {
                    const { data, error } = await supabase.from('tenant_links').upsert([linkData]).select();
                    if (!error && data) {
                      setEditingLink(null);
                      const { data: refreshed } = await supabase.from('tenant_links').select('*').order('display_order');
                      setTenantLinks(refreshed || []);
                    }
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Button Title <span className="text-amber-400">*</span></label>
                  <input
                    name="title"
                    type="text"
                    required
                    defaultValue={editingLink.title}
                    placeholder="e.g. Order on UberEats"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-amber-400 focus:outline-none font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Subtitle / Caption (Optional)</label>
                  <input
                    name="subtitle"
                    type="text"
                    defaultValue={editingLink.subtitle}
                    placeholder="e.g. Fast 30-min doorstep delivery"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Target URL Link <span className="text-amber-400">*</span></label>
                  <input
                    name="url"
                    type="text"
                    required
                    defaultValue={editingLink.url}
                    placeholder="https://ubereats.com/... or https://wa.me/..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-amber-400 focus:outline-none font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs font-semibold">
                  <div>
                    <label className="text-slate-400 block mb-1">Icon</label>
                    <select
                      name="icon"
                      defaultValue={editingLink.icon || 'Utensils'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
                    >
                      <option value="Utensils">Utensils</option>
                      <option value="Truck">Truck</option>
                      <option value="ShoppingBag">ShoppingBag</option>
                      <option value="Star">Star</option>
                      <option value="Smartphone">Smartphone</option>
                      <option value="Instagram">Instagram</option>
                      <option value="Globe">Globe</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Badge Text</label>
                    <input
                      name="badge_text"
                      type="text"
                      defaultValue={editingLink.badge_text}
                      placeholder="e.g. 10% Off"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white uppercase text-[11px] font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Color Accent</label>
                    <select
                      name="button_color"
                      defaultValue={editingLink.button_color || 'amber'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
                    >
                      <option value="amber">Amber Gold</option>
                      <option value="emerald">Emerald Green</option>
                      <option value="blue">Electric Blue</option>
                      <option value="purple">Vibrant Purple</option>
                      <option value="slate">Dark Glass</option>
                      <option value="red">Rose Red</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-500 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 text-sm mt-2 flex items-center justify-center cursor-pointer"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : 'Save Link Button'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
