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
  Gift,
  Percent,
  Tag, 
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
  ChevronDown,
  ChevronUp,
  Truck,
  MessageSquare,
  Star,
  Inbox,
  Link2,
  Video,
  Image as ImageIcon,
  ShieldCheck,
  ArrowLeft,
  ChefHat,
  Armchair,
  UtensilsCrossed,
  ClipboardList,
  BarChart3,
  Wallet,
  Boxes,
  UserCheck,
  Power,
  LogOut,
  Building2,
  Globe,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalAuditLogs } from '../lib/auditLogger';
import { PERMISSION_GROUPS, currentPermissions, roleDefaults } from '../lib/permissions';
import { LiveOrdersView, computeOrderBucketCounts } from './orda/LiveOrdersView';
import { OrdaCatalogView } from './orda/OrdaCatalogView';
import { WebPosView } from './orda/WebPosView';
import { LocationsManagerView, CloseStoreModal } from './orda/LocationsManagerView';
import { getTenantInfo } from '../lib/tenant';
import { FeedbackDashboardView } from './FeedbackDashboardView';

// Setup progress is per restaurant. A shared flag would let a brand-new
// tenant skip onboarding because a previous tenant on the same device had
// already completed it.
function setupCompletedKey() {
  try {
    const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    return pinUser.restaurantId
      ? `manipos_setup_completed_${pinUser.restaurantId}`
      : 'manipos_setup_completed';
  } catch (e) {
    return 'manipos_setup_completed';
  }
}

export function AdminDashboard({ onBackToTerminal, onOpenAppHome, onOpenModule, onSignOut, tenantSlug }) {
  const [setupCompleted, setSetupCompleted] = useState(() => {
    try {
      return localStorage.getItem(setupCompletedKey()) === 'true';
    } catch(e) {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState(() => setupCompleted ? 'orders' : 'onboarding');
  const [activeModule, setActiveModule] = useState(() => setupCompleted ? 'orders' : 'dashboard');
  const [orderBucket, setOrderBucket] = useState('active');
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState('all');
  const [showWebPos, setShowWebPos] = useState(false);
  const [settleTargetOrder, setSettleTargetOrder] = useState(null);
  const [closeStoreOpen, setCloseStoreOpen] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(() => {
    return ['onboarding', 'suppliers', 'feedback', 'linkhub', 'audit', 'settings', 'locations'].includes(activeTab);
  });
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [promoItemSearch, setPromoItemSearch] = useState("");
  const [staffList, setStaffList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [leadsList, setLeadsList] = useState([]);
  const [tenantLinks, setTenantLinks] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [editingLink, setEditingLink] = useState(null);
  const [settings, setSettings] = useState({
    address: '',
    phone: '',
    mpesa_paybill: '',
    mpesa_account: '',
    kra_pin: '',
    website: '',
    till_number: '',
    logo_url: '',
    socials: {}
  });
  const [profileName, setProfileName] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modals / Editing states
  const [editingItem, setEditingItem] = useState(null); // for menu
  const [editingStaff, setEditingStaff] = useState(null); // for staff
  // null means "use the role defaults"; an array is an explicit override.
  const [staffPermissions, setStaffPermissions] = useState(null);
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
    const restId = getActiveRestaurantId();
    if (!restId) return undefined;
    const channel = supabase
      .channel(`admin-orders-${restId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_orders', filter: `restaurant_id=eq.${restId}` },
        () => {
          supabase
            .from('pos_orders')
            .select('*, items:pos_order_items(*)')
            .eq('restaurant_id', restId)
            .order('created_at', { ascending: false })
            .then(({ data }) => {
              if (data) setOrders(data);
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Seed the editable store name from the signed-in session. Saved changes
  // write back to localStorage so the rest of the app picks the new name up.
  useEffect(() => {
    if (restaurantName && !profileName) setProfileName(restaurantName);
  }, [restaurantName, profileName]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
      const currentRestaurantId = pinUser.restaurantId || pinUser.restaurant_id;

      // Never fall back to an unscoped query — a missing tenant must show no data,
      // not every tenant's data.
      if (!currentRestaurantId) {
        console.warn('AdminDashboard: staff session has no restaurant id; skipping data fetch.');
        setOrders([]);
        setMenuItems([]);
        setFeedbackList([]);
        setTenantLinks([]);
        setLoading(false);
        return;
      }

      // 1. Fetch Orders
      let ordersQuery = supabase.from('pos_orders').select('*, items:pos_order_items(*)').order('created_at', { ascending: false });
      if (currentRestaurantId) ordersQuery = ordersQuery.eq('restaurant_id', currentRestaurantId);
      const { data: fetchedOrders } = await ordersQuery;
      setOrders(fetchedOrders || []);

      // 2. Fetch Menu Items
      let menuQuery = supabase.from('pos_menu').select('*').order('name');
      if (currentRestaurantId) menuQuery = menuQuery.eq('restaurant_id', currentRestaurantId);
      const { data: fetchedMenu } = await menuQuery;
      setMenuItems(fetchedMenu || []);

      // 3. Fetch Staff List (safe RPC: no PIN columns leave the database)
      try {
        const { data: fetchedStaff, error: staffError } = await supabase.rpc('staff_list', {
          p_actor_id: pinUser.id || null,
        });
        if (staffError) throw staffError;
        setStaffList(fetchedStaff || []);
      } catch (staffError) {
        console.warn('Staff list notice:', staffError?.message || staffError);
        setStaffList([]);
      }

      // 4. Fetch Customer Feedback
      try {
        let feedbackQuery = supabase.from('pos_feedback').select('*').order('created_at', { ascending: false });
        if (currentRestaurantId) feedbackQuery = feedbackQuery.eq('restaurant_id', currentRestaurantId);
        const { data: fetchedFeedback } = await feedbackQuery;
        setFeedbackList(fetchedFeedback || []);
      } catch (e) {
        console.warn('Feedback table notice:', e);
      }

      // 5. Fetch Restaurant Links for Link Hub (keyed by tenant slug)
      try {
        const tenantSlug = pinUser.tenantSlug;
        let linksQuery = supabase.from('tenant_links').select('*').order('display_order', { ascending: true });
        if (tenantSlug) linksQuery = linksQuery.eq('tenant_id', tenantSlug);
        const { data: fetchedLinks } = await linksQuery;
        setTenantLinks(fetchedLinks || []);
      } catch (e) {
        console.warn('Tenant links fetch notice:', e);
      }

      // 6. Fetch Restaurant Settings
      let settingsQuery = supabase.from('restaurant_settings').select('*');
      if (currentRestaurantId) settingsQuery = settingsQuery.eq('restaurant_id', currentRestaurantId);
      const { data: fetchedSettings } = await settingsQuery.limit(1);

      if (fetchedSettings && fetchedSettings.length > 0) {
        const currentSetting = fetchedSettings[0];
        setSettings(currentSetting);
        if (currentSetting.setup_completed) {
          setSetupCompleted(true);
          localStorage.setItem(setupCompletedKey(), 'true');
        } else {
          setSetupCompleted(false);
          localStorage.removeItem(setupCompletedKey());
          setActiveTab('onboarding');
          setActiveModule('dashboard');
        }
      } else if (currentRestaurantId) {
        const { data: newSettings } = await supabase
          .from('restaurant_settings')
          .insert([{
            restaurant_id: currentRestaurantId,
            // Start blank: a new restaurant enters its own address and payment
            // details. Pre-filling these with an existing tenant's paybill made
            // every new store print another brand's M-Pesa number.
            address: '',
            phone: '',
            mpesa_paybill: '',
            mpesa_account: '',
            setup_completed: false
          }])
          .select()
          .single();
        if (newSettings) setSettings(newSettings);
        setSetupCompleted(false);
        localStorage.removeItem(setupCompletedKey());
        setActiveTab('onboarding');
        setActiveModule('dashboard');
      }

      // 7. Fetch Suppliers
      try {
        let suppliersQuery = supabase.from('suppliers').select('*').order('name');
        if (currentRestaurantId) suppliersQuery = suppliersQuery.eq('restaurant_id', currentRestaurantId);
        const { data: fetchedSuppliers, error: supplierError } = await suppliersQuery;
        if (!supplierError) setSuppliers(fetchedSuppliers || []);
      } catch (supplierErr) {
        console.warn("Error loading suppliers:", supplierErr);
      }

      // 8. Fetch Discounts / Offers
      setLoadingDiscounts(true);
      try {
        const { data: fetchedDiscounts, error: discErr } = await supabase
          .from('pos_discounts')
          .select('*')
          .eq('restaurant_id', currentRestaurantId)
          .order('created_at', { ascending: false });
        if (!discErr) setDiscounts(fetchedDiscounts || []);
      } catch (discLoadErr) {
        console.warn('Discounts fetch notice:', discLoadErr);
      } finally {
        setLoadingDiscounts(false);
      }

      // 9. Fetch Audit Logs (DB + local offline fallback)
      try {
        const { data: fetchedAudit, error: auditErr } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('restaurant_id', currentRestaurantId)
          .order('created_at', { ascending: false })
          .limit(200);
        const localLogs = getLocalAuditLogs(currentRestaurantId);
        if (!auditErr && Array.isArray(fetchedAudit)) {
          setAuditLogs(fetchedAudit.length > 0 ? fetchedAudit : localLogs);
        } else {
          setAuditLogs(localLogs);
        }
      } catch (auditLoadErr) {
        setAuditLogs(getLocalAuditLogs(currentRestaurantId));
      }

      // 10. Fetch Branches (Wave 1 multi-location support, optional table)
      try {
        const { data: fetchedBranches, error: brErr } = await supabase
          .from('branches')
          .select('*')
          .eq('restaurant_id', currentRestaurantId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true });
        if (!brErr && Array.isArray(fetchedBranches)) {
          setBranches(fetchedBranches);
        }
      } catch (_) {}
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

    // Dish Sales Velocity & Performance Analyzer calculation (strictly excluding delivery & packaging fees)
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

    const dishTally = {};
    let totalDishUnits = 0;
    let totalDishRevenue = 0;

    validOrders.forEach(o => {
      (o.items || []).forEach(item => {
        const nm = item.item_name || item.name || "";
        if (!nm || isFeeOrDelivery(nm)) return;
        const qty = item.quantity || 1;
        const rev = (item.price || 0) * qty;
        if (!dishTally[nm]) {
          dishTally[nm] = { name: nm, qty: 0, revenue: 0 };
        }
        dishTally[nm].qty += qty;
        dishTally[nm].revenue += rev;
        totalDishUnits += qty;
        totalDishRevenue += rev;
      });
    });

    const dishVelocity = Object.values(dishTally)
      .sort((a, b) => b.qty - a.qty)
      .map(d => ({
        ...d,
        velocityShare: totalDishUnits > 0 ? Math.round((d.qty / totalDishUnits) * 100) : 0
      }));

    return {
      grossSales,
      transactionCount,
      avgOrderValue,
      paymentSplitData,
      salesOverTime,
      dishVelocity,
      totalDishUnits,
      totalDishRevenue
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
    const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    const currentRestaurantId = pinUser.restaurantId || pinUser.restaurant_id;

    const payload = {
      restaurant_id: currentRestaurantId,
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
  // Opens the add/edit modal with the user's current permissions (or null to
  // inherit the role defaults).
  const openStaffModal = (staff) => {
    setEditingStaff(staff);
    setStaffPermissions(Array.isArray(staff?.permissions) ? staff.permissions : null);
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const form = e.target;
    const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    const currentRestaurantId = pinUser.restaurantId || pinUser.restaurant_id;
    const newPin = form.password ? form.password.value : '';

    if (!editingStaff?.id && newPin.length < 4) {
      alert('Set a staff PIN of at least 4 characters.');
      setSubmitting(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('staff_upsert', {
        p_actor_id: pinUser.id || null,
        p_id: editingStaff?.id || null,
        p_restaurant_id: currentRestaurantId || null,
        p_name: form.staffName.value,
        p_email: form.email ? form.email.value : `${form.staffName.value.toLowerCase().replace(/\s+/g, '')}@${tenantSlug || 'demostore'}.com`,
        p_role: form.role.value,
        p_pin: newPin || null,
        // null keeps the role defaults; an array is an explicit override.
        p_permissions: staffPermissions,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Could not save staff member.');

      setEditingStaff(null);
      setStaffPermissions(null);
      fetchDashboardData();
    } catch (err) {
      alert('Error saving staff member: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStaff = async (id) => {
    if (!confirm('Are you sure you want to remove this staff access?')) return;
    const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    try {
      const { data, error } = await supabase.rpc('staff_delete', {
        p_actor_id: pinUser.id || null,
        p_id: id,
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Could not delete staff.');
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
    const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    const currentRestaurantId = pinUser.restaurantId || pinUser.restaurant_id;

    const payload = {
      restaurant_id: currentRestaurantId,
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
    const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    try {
      const methods = settings.enabled_payment_methods || ['CASH', 'MPESA', 'CARD', 'UBEREATS', 'GLOVO', 'BOLTFOOD', 'BANK_TRANSFER'];
      const socials = settings.socials && typeof settings.socials === 'object' ? settings.socials : {};

      // One call writes the store name (restaurants) and every receipt branding
      // field (restaurant_settings), scoped to the signed-in tenant.
      const { data, error } = await supabase.rpc('restaurant_profile_upsert', {
        p_actor_id: pinUser.id || null,
        p_name: profileName || null,
        p_address: settings.address,
        p_phone: settings.phone,
        p_kra_pin: settings.kra_pin || null,
        p_website: settings.website || null,
        p_till_number: settings.till_number || null,
        p_paybill: settings.mpesa_paybill,
        p_account: settings.mpesa_account,
        p_logo_url: settings.logo_url || null,
        p_socials: socials,
        p_enabled_payment_methods: methods
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Could not save the restaurant profile.');

      // Additive Wave 1 Storefront SEO / Analytics / Post-Order CTA update (safe if columns not yet migrated)
      const currentRestId = getActiveRestaurantId();
      if (currentRestId) {
        const wave1Patch = {
          seo_title: settings.seo_title || null,
          seo_description: settings.seo_description || null,
          google_analytics_id: settings.google_analytics_id || null,
          meta_pixel_id: settings.meta_pixel_id || null,
          confirmation_cta_label: settings.confirmation_cta_label || null,
          confirmation_cta_url: settings.confirmation_cta_url || null,
          cuisines: Array.isArray(settings.cuisines)
            ? settings.cuisines
            : String(settings.cuisines_input || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        };
        try {
          await supabase.from('restaurant_settings').update(wave1Patch).eq('restaurant_id', currentRestId);
        } catch (_) {}
      }

      localStorage.setItem('manipos_payment_methods', JSON.stringify(methods));

      // Keep the cached session name in sync with what was saved.
      if (profileName) {
        localStorage.setItem('pin_staff_user', JSON.stringify({ ...pinUser, restaurantName: profileName }));
      }

      alert('Receipt & store details updated successfully!');
    } catch (err) {
      alert('Error saving settings: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Logo uploads go to the existing public bucket under a logos/ prefix.
  const handleLogoUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file for the logo.');
      return;
    }
    setLogoUploading(true);
    try {
      const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
      const restaurantId = pinUser.restaurantId || pinUser.restaurant_id || 'shared';
      const path = `logos/${restaurantId}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
      const { error: uploadError } = await supabase.storage.from('menu_images').upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('menu_images').getPublicUrl(path);
      setSettings((prev) => ({ ...prev, logo_url: urlData?.publicUrl || '' }));
    } catch (err) {
      alert('Logo upload failed: ' + err.message);
    } finally {
      setLogoUploading(false);
    }
  };

  const getActiveRestaurantId = () => {
    try {
      const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
      return pinUser.restaurantId || pinUser.restaurant_id || null;
    } catch (e) {
      return null;
    }
  };

  const saveDiscount = async (disc) => {
    const currentRestaurantId = getActiveRestaurantId();
    if (!currentRestaurantId) {
      alert('No active restaurant session found.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        restaurant_id: currentRestaurantId,
        code: String(disc.code || '').trim().toUpperCase(),
        type: disc.type || 'percentage',
        value: Number(disc.value) || 0,
        min_order_amount: Number(disc.min_order_amount) || 0,
        is_active: disc.is_active !== false,
      };
      if (disc.id) {
        const { data, error } = await supabase
          .from('pos_discounts')
          .update(payload)
          .eq('id', disc.id)
          .eq('restaurant_id', currentRestaurantId)
          .select()
          .single();
        if (error) throw error;
        setDiscounts(prev => prev.map(d => (d.id === disc.id ? data : d)));
      } else {
        const { data, error } = await supabase
          .from('pos_discounts')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        if (data) setDiscounts(prev => [data, ...prev]);
      }
      setEditingDiscount(null);
    } catch (err) {
      alert('Failed to save offer: ' + (err?.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDiscountStatus = async (disc) => {
    const currentRestaurantId = getActiveRestaurantId();
    if (!currentRestaurantId || !disc?.id) return;
    const nextActive = !disc.is_active;
    try {
      const { error } = await supabase
        .from('pos_discounts')
        .update({ is_active: nextActive })
        .eq('id', disc.id)
        .eq('restaurant_id', currentRestaurantId);
      if (error) throw error;
      setDiscounts(prev => prev.map(d => (d.id === disc.id ? { ...d, is_active: nextActive } : d)));
    } catch (err) {
      alert('Failed to update offer status: ' + (err?.message || err));
    }
  };

  const deleteDiscount = async (discId) => {
    const currentRestaurantId = getActiveRestaurantId();
    if (!currentRestaurantId || !discId) return;
    if (!window.confirm('Delete this offer/promo code?')) return;
    try {
      const { error } = await supabase
        .from('pos_discounts')
        .delete()
        .eq('id', discId)
        .eq('restaurant_id', currentRestaurantId);
      if (error) throw error;
      setDiscounts(prev => prev.filter(d => d.id !== discId));
    } catch (err) {
      alert('Failed to delete offer: ' + (err?.message || err));
    }
  };

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

  // Effective permissions for the signed-in user. Tabs and actions that need a
  // permission are hidden when it is missing; the server enforces the same
  // checks on the RPCs that matter.
  const perms = currentPermissions();
  const canDo = (permission) => perms.includes(permission);

  // Which permission (if any) unlocks each dashboard tab.
  const TAB_PERMISSION = {
    analytics: 'view_analytics',
    menu: 'manage_menu',
    staff: 'manage_staff',
    offers: 'manage_offers',
    feedback: 'manage_feedback',
    suppliers: 'manage_suppliers',
    linkhub: 'manage_settings',
    audit: 'view_audit',
    settings: 'manage_settings',
  };

  const activeRestaurantId = getActiveRestaurantId();
  const activeBranchObj = branches.find((b) => b.id === activeBranchId) || null;
  const scopedOrders = useMemo(() => {
    if (activeBranchId === 'all') return orders;
    return orders.filter((o) => !o.branch_id || o.branch_id === activeBranchId);
  }, [orders, activeBranchId]);
  const bucketCounts = useMemo(() => computeOrderBucketCounts(scopedOrders), [scopedOrders]);
  const pinStaffName = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('pin_staff_user') || '{}').name || 'Staff';
    } catch {
      return 'Staff';
    }
  }, []);

  const selectModule = (mod, tab) => {
    setShowWebPos(false);
    setSettleTargetOrder(null);
    setActiveModule(mod);
    if (tab) setActiveTab(tab);
  };

  const ORDER_BUCKETS = [
    { id: 'active', label: 'Active Orders', count: bucketCounts.active },
    { id: 'new', label: 'New', count: bucketCounts.new },
    { id: 'verifying', label: 'Verifying', count: bucketCounts.verifying },
    { id: 'processing', label: 'In Progress', count: bucketCounts.processing },
    { id: 'ready', label: 'Ready', count: bucketCounts.ready },
    { id: 'shipped', label: 'Shipped', count: bucketCounts.shipped },
    { id: 'completed', label: 'Completed', count: bucketCounts.completed },
    { id: 'cancelled', label: 'Cancelled', count: bucketCounts.cancelled },
    { id: 'declined', label: 'Declined', count: bucketCounts.declined },
    { id: 'failed', label: 'Payment Failed', count: bucketCounts.failed },
    { id: 'voided', label: 'Voided', count: bucketCounts.voided },
    { id: 'open', label: 'Pending Open', count: bucketCounts.open },
    { id: 'unknown', label: 'Other', count: bucketCounts.unknown },
  ];

  const isLegacyDarkTab = [
    'onboarding',
    'analytics',
    'staff',
    'settings',
    'suppliers',
    'offers',
    'feedback',
    'linkhub',
    'audit',
  ].includes(activeTab);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin text-emerald-700 mx-auto" size={40} />
          <p className="text-slate-500 text-sm font-semibold tracking-wide uppercase">Loading ManiPOS Command Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans overflow-hidden">
      {/* 1. ORDA FAR-LEFT DEEP GREEN ICON RAIL */}
      <nav className="w-16 sm:w-[70px] bg-[#0B3B24] text-emerald-100 flex flex-col justify-between items-center py-4 shrink-0 z-30 border-r border-emerald-950">
        <div className="w-full flex flex-col items-center gap-2">
          <div
            onClick={() => selectModule('orders', 'orders')}
            className="w-10 h-10 rounded-xl bg-white text-[#0B3B24] font-black text-lg flex items-center justify-center shadow-md cursor-pointer mb-3"
            title={profileName || restaurantName}
          >
            {(profileName || restaurantName || 'M')[0].toUpperCase()}
          </div>

          {[
            { id: 'orders', label: 'Orders', icon: ClipboardList, tab: 'orders', badge: bucketCounts.active },
            { id: 'dashboard', label: 'Dashboard', icon: BarChart3, tab: 'analytics', visible: canDo(TAB_PERMISSION.analytics) },
            { id: 'customers', label: 'Customers', icon: UserCheck, tab: 'offers', visible: canDo(TAB_PERMISSION.offers) || canDo(TAB_PERMISSION.feedback) },
            { id: 'menu', label: 'Menu', icon: Package, tab: 'menu', visible: canDo(TAB_PERMISSION.menu) },
            { id: 'settings', label: 'Settings', icon: Settings, tab: 'settings', visible: canDo(TAB_PERMISSION.settings) || canDo(TAB_PERMISSION.staff) },
            { id: 'wallet', label: 'Wallet', icon: Wallet, tab: 'wallet' },
            { id: 'inventory', label: 'Inventory', icon: Boxes, tab: 'inventory' },
            { id: 'account', label: 'Account', icon: Building2, tab: 'account' },
          ]
            .filter((item) => item.visible !== false)
            .map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectModule(item.id, item.tab)}
                  title={item.label}
                  className={`relative w-12 py-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-700/80 text-white shadow-inner ring-1 ring-emerald-400/30'
                      : 'text-emerald-200/80 hover:bg-emerald-900/60 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="text-[9px] font-bold tracking-tight leading-none">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        <div className="w-full flex flex-col items-center gap-2 pt-3 border-t border-emerald-900/80">
          <button
            type="button"
            onClick={() => setCloseStoreOpen(true)}
            title={settings.store_closed ? 'Store Closed — Click to Reopen' : 'Close Store (End of Day)'}
            className={`w-12 py-2 rounded-xl flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
              settings.store_closed
                ? 'bg-rose-600 text-white'
                : 'text-emerald-200/80 hover:bg-emerald-900/60 hover:text-white'
            }`}
          >
            <Power size={17} />
            <span className="text-[9px] font-bold leading-none">
              {settings.store_closed ? 'Closed' : 'Store'}
            </span>
          </button>

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              title="Sign Out"
              className="w-12 py-2 rounded-xl flex flex-col items-center justify-center gap-1 text-emerald-200/70 hover:bg-rose-950/60 hover:text-rose-200 transition cursor-pointer"
            >
              <LogOut size={17} />
              <span className="text-[9px] font-bold leading-none">Exit</span>
            </button>
          )}
        </div>
      </nav>

      {/* 2. CONTEXTUAL SECONDARY WHITE SIDEBAR (ORDA SUB-NAVIGATION) */}
      <aside className="w-60 bg-white border-r border-slate-200 hidden md:flex flex-col shrink-0 z-20">
        <div className="px-4 py-4 border-b border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {activeModule} Module
          </p>
          <h2 className="text-sm font-black text-slate-900 truncate mt-0.5">
            {profileName || restaurantName}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {!setupCompleted && (
            <button
              type="button"
              onClick={() => selectModule('dashboard', 'onboarding')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold mb-2 ${
                activeTab === 'onboarding'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              <ShieldCheck size={15} />
              <span>Finish Setup Checklist</span>
            </button>
          )}

          {activeModule === 'orders' && (
            <>
              {ORDER_BUCKETS.map((b) => {
                const selected = !showWebPos && activeTab === 'orders' && orderBucket === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setShowWebPos(false);
                      setSettleTargetOrder(null);
                      setActiveTab('orders');
                      setOrderBucket(b.id);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition ${
                      selected
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span>{b.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                        selected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {b.count}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {activeModule === 'dashboard' && (
            <>
              {canDo(TAB_PERMISSION.analytics) && (
                <button
                  type="button"
                  onClick={() => selectModule('dashboard', 'analytics')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === 'analytics' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <TrendingUp size={15} /> Analytics & Overview
                </button>
              )}
              <button
                type="button"
                onClick={() => selectModule('dashboard', 'onboarding')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                  activeTab === 'onboarding' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ShieldCheck size={15} /> Store Setup Checklist
              </button>
              <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
                <p className="font-black text-slate-700">Wave 2 Coming Next</p>
                <p className="mt-0.5">Sales, Taxes, Cash Management & 6am–6am PDF EOD Reports.</p>
              </div>
            </>
          )}

          {activeModule === 'customers' && (
            <>
              {canDo(TAB_PERMISSION.offers) && (
                <button
                  type="button"
                  onClick={() => selectModule('customers', 'offers')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === 'offers' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Gift size={15} /> Offers & Promotions
                </button>
              )}
              {canDo(TAB_PERMISSION.feedback) && (
                <button
                  type="button"
                  onClick={() => selectModule('customers', 'feedback')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === 'feedback' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <MessageSquare size={15} /> Customer Feedback
                </button>
              )}
              <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500">
                <p className="font-black text-slate-700">Wave 3 Coming</p>
                <p className="mt-0.5">Full Guest CRM, Order History, Store Credit & Loyalty Points.</p>
              </div>
            </>
          )}

          {activeModule === 'menu' && (
            <button
              type="button"
              onClick={() => selectModule('menu', 'menu')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                activeTab === 'menu' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Package size={15} /> Catalog, Modifiers & Combos
            </button>
          )}

          {activeModule === 'settings' && (
            <>
              {canDo(TAB_PERMISSION.settings) && (
                <button
                  type="button"
                  onClick={() => selectModule('settings', 'settings')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === 'settings' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Settings size={15} /> Store Settings & SEO
                </button>
              )}
              <button
                type="button"
                onClick={() => selectModule('settings', 'locations')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                  activeTab === 'locations' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <MapPin size={15} /> Locations & Branches
              </button>
              {canDo(TAB_PERMISSION.staff) && (
                <button
                  type="button"
                  onClick={() => selectModule('settings', 'staff')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === 'staff' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Users size={15} /> Staff & Access
                </button>
              )}
              {canDo(TAB_PERMISSION.suppliers) && (
                <button
                  type="button"
                  onClick={() => selectModule('settings', 'suppliers')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === 'suppliers' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Truck size={15} /> Supplier Management
                </button>
              )}
              {canDo(TAB_PERMISSION.linkhub) && (
                <button
                  type="button"
                  onClick={() => selectModule('settings', 'linkhub')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === 'linkhub' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Link2 size={15} /> Link Hub & Socials
                </button>
              )}
              {canDo(TAB_PERMISSION.audit) && (
                <button
                  type="button"
                  onClick={() => selectModule('settings', 'audit')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${
                    activeTab === 'audit' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ShieldCheck size={15} /> Security & Audit Logs
                </button>
              )}
            </>
          )}

          {activeModule === 'inventory' && (
            <>
              <button
                type="button"
                onClick={() => onOpenModule ? onOpenModule('inventory') : (window.location.href = '/?page=inventory')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <Package size={15} /> Inventory & Recipes →
              </button>
              <button
                type="button"
                onClick={() => onOpenModule ? onOpenModule('kds') : (window.location.href = '/?page=kds')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <ChefHat size={15} /> Kitchen Display →
              </button>
              <button
                type="button"
                onClick={() => onOpenModule ? onOpenModule('floor') : (window.location.href = '/?page=floor')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <Armchair size={15} /> Floor & Reservations →
              </button>
            </>
          )}

          {(activeModule === 'wallet' || activeModule === 'account') && (
            <>
              <button
                type="button"
                onClick={() => setCloseStoreOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <Power size={15} /> {settings.store_closed ? 'Reopen Storefront' : 'Close Store (End of Day)'}
              </button>
              <button
                type="button"
                onClick={() => selectModule('settings', 'locations')}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                <MapPin size={15} /> Manage Locations
              </button>
            </>
          )}
        </div>
      </aside>

      {/* 3. RIGHT WORKSPACE COLUMN */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* ORDA TOP HEADER */}
        <header className="bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-slate-900 truncate">
                  {profileName || restaurantName}
                </h1>
                <span
                  onClick={() => setCloseStoreOpen(true)}
                  className={`cursor-pointer text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                    settings.store_closed
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {settings.store_closed ? 'Closed' : 'Open'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                ManiPOS Operations · Signed in as {pinStaffName}
              </p>
            </div>

            {branches.length > 0 && (
              <select
                value={activeBranchId}
                onChange={(e) => setActiveBranchId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
              >
                <option value="all">All Branches ({branches.length})</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setSettleTargetOrder(null);
                setShowWebPos((v) => !v);
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus size={15} />
              <span>{showWebPos ? 'View Live Orders' : 'Create Order'}</span>
            </button>

            <button
              type="button"
              onClick={onBackToTerminal}
              className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <span>Open POS Register</span>
              <ChevronRight size={14} />
            </button>

            {onOpenAppHome && (
              <button
                type="button"
                onClick={onOpenAppHome}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span className="hidden sm:inline">Workspace</span>
              </button>
            )}

            <button
              type="button"
              onClick={fetchDashboardData}
              title="Refresh data"
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {/* WORKSPACE MAIN */}
        <main className="flex-1 p-5 sm:p-6 overflow-y-auto bg-slate-50">
          {!setupCompleted && activeTab !== 'onboarding' && (
            <div className="mb-5">
              <button
                onClick={() => selectModule('dashboard', 'onboarding')}
                className="text-xs font-black text-slate-950 bg-amber-400 hover:bg-amber-300 px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <ArrowLeft size={15} />
                <span>Back to Store Setup Checklist</span>
              </button>
            </div>
          )}

          {showWebPos ? (
            <WebPosView
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              tenantSlug={tenantSlug}
              activeBranch={activeBranchObj}
              staffName={pinStaffName}
              initialOrder={settleTargetOrder}
              onBackToOrders={() => {
                setShowWebPos(false);
                setSettleTargetOrder(null);
                setActiveModule('orders');
                setActiveTab('orders');
              }}
              onOrderPlaced={() => fetchDashboardData()}
            />
          ) : activeTab === 'orders' ? (
            <LiveOrdersView
              orders={orders}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              activeBranch={activeBranchId}
              statusFilter={orderBucket}
              onRefresh={fetchDashboardData}
              onCreateOrder={() => {
                setSettleTargetOrder(null);
                setShowWebPos(true);
              }}
              onResumeOpenOrder={(order) => {
                setSettleTargetOrder(order);
                setShowWebPos(true);
              }}
            />
          ) : activeTab === 'locations' ? (
            <LocationsManagerView
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              tenantSlug={tenantSlug}
              onBranchesUpdated={fetchDashboardData}
            />
          ) : activeTab === 'wallet' || activeTab === 'inventory' || activeTab === 'account' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-3xl space-y-4">
              <h2 className="text-lg font-black text-slate-900 capitalize">{activeTab} Hub</h2>
              <p className="text-sm text-slate-600">
                {activeTab === 'inventory'
                  ? 'Launch Stock, Recipes, Kitchen Display (KDS), or Floor Plan directly.'
                  : activeTab === 'wallet'
                    ? 'Online Paystack settlements, withdrawal bank settings, and automated EOD reports arrive in Waves 2–5.'
                    : 'Manage storefront Open/Closed pause schedule, locations, and POS register access.'}
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                {activeTab === 'inventory' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenModule ? onOpenModule('inventory') : (window.location.href = '/?page=inventory')}
                      className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                    >
                      Open Inventory & Recipes
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenModule ? onOpenModule('kds') : (window.location.href = '/?page=kds')}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-bold hover:bg-slate-100"
                    >
                      Open Kitchen Display
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenModule ? onOpenModule('floor') : (window.location.href = '/?page=floor')}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-bold hover:bg-slate-100"
                    >
                      Open Floor & Reservations
                    </button>
                  </>
                )}
                {activeTab === 'account' && (
                  <button
                    type="button"
                    onClick={() => setCloseStoreOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
                  >
                    {settings.store_closed ? 'Reopen Storefront' : 'Close Store (End of Day)'}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {!showWebPos && (
          <div className={isLegacyDarkTab ? 'bg-slate-950 text-slate-100 rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-sm' : ''}>
          <AnimatePresence mode="wait">
            
            {/* STORE ONBOARDING CHECKLIST */}
            {activeTab === 'onboarding' && (
              <motion.div
                key="onboarding"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8 relative overflow-hidden">
                  <div className="space-y-2">
                    <span className="px-3.5 py-1 bg-amber-400/10 text-amber-400 border border-amber-400/20 text-xs font-bold rounded-full uppercase tracking-wider inline-block">
                      Store Onboarding Progress
                    </span>
                    <h2 className="text-3xl font-black text-white tracking-tight">Welcome to ManiPOS 👋</h2>
                    <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
                      Let's get <strong className="text-white">{restaurantName}</strong> ready to take its first order. Complete the setup steps below to launch your register.
                    </p>
                  </div>

                  {/* Checklist Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-4 bg-slate-950 border border-slate-800/80 p-5 rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-sm">✓</div>
                      <div>
                        <h4 className="font-bold text-white text-sm">1. Restaurant Details</h4>
                        <p className="text-xs text-slate-400">Account & store workspace created</p>
                      </div>
                    </div>

                    <div className={`flex items-center gap-4 bg-slate-950 border ${menuItems.length > 0 ? 'border-slate-800/80' : 'border-amber-500/40'} p-5 rounded-2xl`}>
                      <div className={`w-10 h-10 rounded-xl ${menuItems.length > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-400/20 text-amber-400'} flex items-center justify-center font-black text-sm`}>
                        {menuItems.length > 0 ? '✓' : '2'}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-white text-sm">2. Menu Catalog</h4>
                        <p className="text-xs text-slate-400">{menuItems.length} active menu items</p>
                      </div>
                      <button onClick={() => setActiveTab('menu')} className="px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-all">
                        Configure Menu &rarr;
                      </button>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-950 border border-slate-800/80 p-5 rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-sm">3</div>
                      <div className="flex-1">
                        <h4 className="font-bold text-white text-sm">3. Staff & Cashier PINs</h4>
                        <p className="text-xs text-slate-400">{staffList.length} staff member accounts</p>
                      </div>
                      <button onClick={() => setActiveTab('staff')} className="px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-all">
                        Staff &rarr;
                      </button>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-950 border border-slate-800/80 p-5 rounded-2xl">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-sm">4</div>
                      <div className="flex-1">
                        <h4 className="font-bold text-white text-sm">4. Payment & Receipts</h4>
                        <p className="text-xs text-slate-400">M-Pesa & Cash settings</p>
                      </div>
                      <button onClick={() => setActiveTab('settings')} className="px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-all">
                        Settings &rarr;
                      </button>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
                    <button 
                      onClick={async () => {
                        try {
                          const tenant = localStorage.getItem('pin_staff_user') ? JSON.parse(localStorage.getItem('pin_staff_user')).restaurantId : null;
                          const sampleCategories = [
                            { restaurant_id: tenant, name: 'Main Dishes', category: 'Main Dishes', price: 850, description: 'Chef Signature Specialty', is_available: true },
                            { restaurant_id: tenant, name: 'Fresh Tropical Juice', category: 'Beverages & Drinks', price: 250, description: 'Cold pressed seasonal fruit juice', is_available: true }
                          ];
                          const { error } = await supabase.from('pos_menu').insert(sampleCategories);
                          if (error) throw error;
                          alert('Sample menu items loaded successfully!');
                          const { data: updatedMenu } = await supabase.from('pos_menu').select('*').eq('restaurant_id', tenant);
                          if (updatedMenu) setMenuItems(updatedMenu);
                        } catch (err) {
                          alert('Notice: ' + err.message);
                        }
                      }}
                      className="px-4 py-3 bg-slate-800/80 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-800 hover:text-white border border-slate-700 transition-all flex items-center gap-2"
                    >
                      <span>⚡</span> Load Starter Sample Menu (Optional)
                    </button>

                    <button 
                      onClick={async () => {
                        setSetupCompleted(true);
                        try {
                          localStorage.setItem(setupCompletedKey(), 'true');
                          const tenant = localStorage.getItem('pin_staff_user') ? JSON.parse(localStorage.getItem('pin_staff_user')).restaurantId : null;
                          if (tenant) {
                            await supabase.from('restaurant_settings').update({ setup_completed: true }).eq('restaurant_id', tenant);
                          }
                        } catch(e) {}
                        onBackToTerminal();
                      }}
                      className="px-6 py-3 bg-amber-400 text-slate-950 text-sm font-black rounded-xl hover:bg-amber-300 shadow-xl shadow-amber-400/10 flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <span>Complete Setup & Enter POS Register</span>
                      <span>&rarr;</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ANALYTICS PANEL */}
            {activeTab === 'analytics' && canDo(TAB_PERMISSION.analytics) && (
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

                {/* Dish Sales Velocity & Performance Analyzer Card */}
                <div className="bg-slate-900/40 border border-slate-900 p-6 rounded-3xl space-y-5">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <UtensilsCrossed size={18} className="text-amber-400" />
                        <h4 className="font-extrabold text-white text-base">Dish Sales Velocity & Performance Analyzer</h4>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Culinary sales volume & velocity breakdown. <span className="text-emerald-400 font-semibold">Strictly excludes all delivery charges & packaging fees.</span>
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-xl">
                      {stats.dishVelocity?.length || 0} Menu Dishes Analyzed
                    </span>
                  </div>

                  {(!stats.dishVelocity || stats.dishVelocity.length === 0) ? (
                    <div className="text-center py-10 text-slate-500 text-xs font-medium">
                      No individual dish transactions recorded yet in the current period.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                      {stats.dishVelocity.map((dish, idx) => (
                        <div
                          key={dish.name}
                          className="bg-slate-950/70 border border-slate-800/80 hover:border-amber-400/40 p-4 rounded-2xl transition-all space-y-2.5"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                                #{idx + 1}
                              </span>
                              <span className="font-bold text-white text-xs truncate" title={dish.name}>
                                {dish.name}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 font-mono font-extrabold text-[11px] rounded-lg shrink-0">
                              {dish.qty} sold
                            </span>
                          </div>

                          {/* Velocity share progress bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>Velocity Share</span>
                              <span className="font-mono font-bold text-slate-300">{dish.velocityShare}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 rounded-full transition-all"
                                style={{ width: `${dish.velocityShare}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-[10px] pt-1 border-t border-slate-900 font-medium">
                            <span className="text-slate-500">Gross Sales</span>
                            <span className="font-mono font-black text-amber-300">KES {dish.revenue.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* MENU PANEL */}
            {activeTab === 'menu' && !showWebPos && canDo(TAB_PERMISSION.menu) && (
              <motion.div
                key="menu"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <OrdaCatalogView
                  restaurantId={activeRestaurantId}
                  branches={branches}
                  onCatalogChanged={fetchDashboardData}
                />
              </motion.div>
            )}

            {/* STAFF PANEL */}
            {activeTab === 'staff' && canDo(TAB_PERMISSION.staff) && (
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
                    onClick={() => openStaffModal({ name: '', email: '', role: 'cashier', password: '' })}
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
                        <th className="py-4 px-6">Email Address</th>
                        <th className="py-4 px-6">Role</th>
                        <th className="py-4 px-6">Password</th>
                        <th className="py-4 px-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/80 text-sm">
                      {staffList.map(staff => (
                        <tr key={staff.id} className="hover:bg-slate-900/20 transition-colors">
                          <td className="py-4 px-6 font-bold text-white">{staff.name}</td>
                          <td className="py-4 px-6 text-slate-300 font-mono text-xs">{staff.email || `${staff.name.toLowerCase().replace(/\s+/g, '')}@${tenantSlug || 'demostore'}.com`}</td>
                          <td className="py-4 px-6">
                            <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${
                              staff.role === 'admin' 
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/10' 
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/10'
                            }`}>
                              {staff.role}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-slate-400 font-mono">••••••••</td>
                          <td className="py-4 px-6 text-right space-x-2">
                            <button
                              onClick={() => openStaffModal(staff)}
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
            {activeTab === 'settings' && canDo(TAB_PERMISSION.settings) && (
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
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Store Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pot of Jollof Kitchen"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors"
                    />
                    <p className="text-[11px] text-slate-500">Printed at the top of every receipt and slip.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Receipt Logo</label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center overflow-hidden shrink-0">
                        {settings.logo_url
                          ? <img src={settings.logo_url} alt="Receipt logo" className="w-full h-full object-contain" />
                          : <span className="text-slate-600 text-[10px] font-bold uppercase tracking-wider">No logo</span>}
                      </div>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={logoUploading}
                          onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                        />
                        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-950 border border-slate-800 px-4 py-2.5 rounded-xl hover:border-emerald-500 transition-colors">
                          {logoUploading ? 'Uploading…' : 'Upload logo'}
                        </span>
                      </label>
                      {settings.logo_url && (
                        <button
                          type="button"
                          onClick={() => setSettings((prev) => ({ ...prev, logo_url: '' }))}
                          className="text-[11px] font-bold text-slate-500 hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">Shown above the store name on printed receipts. A wide logo works best.</p>
                  </div>

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
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">KRA PIN</label>
                      <input
                        type="text"
                        placeholder="e.g. P000000000A"
                        value={settings.kra_pin || ''}
                        onChange={(e) => setSettings({ ...settings, kra_pin: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors font-mono"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Website</label>
                      <input
                        type="text"
                        placeholder="e.g. yourrestaurant.co.ke"
                        value={settings.website || ''}
                        onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Social Pages</label>
                    <div className="grid grid-cols-3 gap-3">
                      {['instagram', 'facebook', 'tiktok'].map((network) => (
                        <input
                          key={network}
                          type="text"
                          placeholder={network[0].toUpperCase() + network.slice(1)}
                          value={settings.socials?.[network] || ''}
                          onChange={(e) => setSettings((prev) => ({ ...prev, socials: { ...(prev.socials || {}), [network]: e.target.value } }))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs focus:border-emerald-500 focus:outline-none transition-colors font-mono"
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">Your public profile links. Not printed on receipts yet.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">M-PESA Till Number (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 174379"
                      value={settings.till_number || ''}
                      onChange={(e) => setSettings({ ...settings, till_number: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors font-mono"
                    />
                    <p className="text-[11px] text-slate-500">Use this instead of a paybill if customers pay from a till.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">M-PESA Paybill</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 522522"
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
                        placeholder="e.g. ACCOUNT01"
                        value={settings.mpesa_account || ''}
                        onChange={(e) => setSettings({ ...settings, mpesa_account: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none transition-colors font-mono"
                      />
                    </div>
                  </div>

                  {/* Payment Methods & Sales Clearing Configuration */}
                  <div className="pt-4 border-t border-slate-800 space-y-4">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Customer Payment Methods & Sales Clearing Channels</h3>
                      <p className="text-xs text-slate-400">Select active payment modes for cashiers during checkout and sales clearing.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'CASH', label: '💵 Cash' },
                        { id: 'MPESA', label: '📱 M-Pesa (Paybill / Till)' },
                        { id: 'CARD', label: '💳 Credit / Debit Card' },
                        { id: 'UBEREATS', label: '🚴 UberEats' },
                        { id: 'GLOVO', label: '🛵 Glovo' },
                        { id: 'BOLTFOOD', label: '🚖 Bolt Food' },
                        { id: 'BANK_TRANSFER', label: '🏦 Bank Transfer / Invoice' }
                      ].map(method => {
                        const currentMethods = settings.enabled_payment_methods || ['CASH', 'MPESA', 'CARD', 'UBEREATS', 'GLOVO', 'BOLTFOOD', 'BANK_TRANSFER'];
                        const isChecked = currentMethods.includes(method.id);
                        return (
                          <label key={method.id} className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 p-3 rounded-xl cursor-pointer hover:border-slate-700 transition-all">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...currentMethods, method.id]
                                  : currentMethods.filter(m => m !== method.id);
                                setSettings({ ...settings, enabled_payment_methods: next });
                              }}
                              className="w-4 h-4 accent-emerald-500 rounded"
                            />
                            <span className="text-xs font-bold text-slate-200">{method.label}</span>
                          </label>
                        );
                      })}
                    </div>

                    {/* Custom Clearing Channels Manager */}
                    <div className="space-y-2 pt-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Custom Clearing Channels (e.g. Jumia Food, Voucher, Credit Account)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Type custom channel name and click Add..."
                          value={settings.custom_channel_input || ''}
                          onChange={(e) => setSettings({ ...settings, custom_channel_input: e.target.value })}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = (settings.custom_channel_input || '').trim().toUpperCase();
                            if (!val) return;
                            const current = settings.enabled_payment_methods || ['CASH', 'MPESA', 'CARD', 'UBEREATS', 'GLOVO', 'BOLTFOOD', 'BANK_TRANSFER'];
                            if (!current.includes(val)) {
                              setSettings({
                                ...settings,
                                enabled_payment_methods: [...current, val],
                                custom_channel_input: ''
                              });
                            }
                          }}
                          className="bg-slate-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-slate-700 transition-all"
                        >
                          + Add Channel
                        </button>
                      </div>

                      {/* Display custom active channels */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(settings.enabled_payment_methods || []).filter(m => !['CASH', 'MPESA', 'CARD', 'UBEREATS', 'GLOVO', 'BOLTFOOD', 'BANK_TRANSFER'].includes(m)).map(customM => (
                          <span key={customM} className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs rounded-full">
                            {customM}
                            <button
                              type="button"
                              onClick={() => {
                                const current = settings.enabled_payment_methods || [];
                                setSettings({
                                  ...settings,
                                  enabled_payment_methods: current.filter(m => m !== customM)
                                });
                              }}
                              className="hover:text-red-400 font-black ml-1"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Wave 1 Storefront SEO, Tracking & Post-Order Confirmation CTA */}
                  <div className="pt-4 border-t border-slate-800 space-y-4">
                    <div>
                      <h3 className="text-sm font-black text-white">Storefront SEO, Analytics & Confirmation CTA</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Boost Google search discoverability, attach tracking pixels, and customize post-checkout links.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">SEO Page Title</label>
                        <input
                          type="text"
                          placeholder="e.g. Pot of Jollof — Westlands"
                          value={settings.seo_title || ''}
                          onChange={(e) => setSettings({ ...settings, seo_title: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Cuisines (Comma-Separated)</label>
                        <input
                          type="text"
                          placeholder="e.g. West African, Nigerian, Grill"
                          value={Array.isArray(settings.cuisines) ? settings.cuisines.join(', ') : (settings.cuisines_input || '')}
                          onChange={(e) => setSettings({
                            ...settings,
                            cuisines_input: e.target.value,
                            cuisines: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                          })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">SEO Meta Description</label>
                      <textarea
                        rows={2}
                        placeholder="Order authentic smoky Jollof rice, suya & grilled chicken delivered fast in Nairobi..."
                        value={settings.seo_description || ''}
                        onChange={(e) => setSettings({ ...settings, seo_description: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Google Analytics 4 ID</label>
                        <input
                          type="text"
                          placeholder="e.g. G-XXXXXXXXXX"
                          value={settings.google_analytics_id || ''}
                          onChange={(e) => setSettings({ ...settings, google_analytics_id: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Meta Pixel ID</label>
                        <input
                          type="text"
                          placeholder="e.g. 123456789012345"
                          value={settings.meta_pixel_id || ''}
                          onChange={(e) => setSettings({ ...settings, meta_pixel_id: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Post-Order Button Label</label>
                        <input
                          type="text"
                          placeholder="e.g. Follow Us on Instagram"
                          value={settings.confirmation_cta_label || ''}
                          onChange={(e) => setSettings({ ...settings, confirmation_cta_label: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Post-Order Button URL</label>
                        <input
                          type="url"
                          placeholder="https://instagram.com/..."
                          value={settings.confirmation_cta_url || ''}
                          onChange={(e) => setSettings({ ...settings, confirmation_cta_url: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
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
            {activeTab === 'suppliers' && canDo(TAB_PERMISSION.suppliers) && (
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

            
            {/* OFFERS & PROMOTIONS PANEL */}
            {activeTab === "offers" && (
              <motion.div
                key="offers"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-amber-400/10 text-amber-400 rounded-2xl border border-amber-400/20">
                        <Gift size={24} />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-white">Offers & Promotions</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Manage % discounts, BOGOF offers, spend thresholds, and free delivery promotions.</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingDiscount({
                      code: "",
                      type: "percentage",
                      value: 10,
                      min_order_amount: 0,
                      is_active: true
                    })}
                    className="flex items-center gap-2 px-5 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-400/10 cursor-pointer"
                  >
                    <Plus size={16} />
                    Create New Offer
                  </button>
                </div>

                {/* Free Delivery Consolidated Config Card */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2.5">
                      <Truck size={18} className="text-sky-400" />
                      <h3 className="font-bold text-white text-sm">Free Delivery Promo Overview</h3>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-lg">
                      Auto-Evaluated in Cart
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    When active, orders meeting the minimum spend and radius criteria automatically receive free delivery in the customer cart.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Active Free Delivery Rule</span>
                      <span className="text-sm font-black text-white mt-1 block">
                        {discounts.find(d => d.type === "free_delivery" && d.is_active) ? (
                          <span className="text-emerald-400 flex items-center gap-1.5 mt-1">
                            <Check size={14} /> Code: {discounts.find(d => d.type === "free_delivery" && d.is_active).code}
                          </span>
                        ) : (
                          <span className="text-slate-500 mt-1 block">Inactive</span>
                        )}
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Min Spend Required</span>
                      <span className="text-sm font-black text-white mt-1 block">
                        {discounts.find(d => d.type === "free_delivery" && d.is_active) ? (
                          `KES ${(discounts.find(d => d.type === "free_delivery" && d.is_active).min_order_amount || 0).toLocaleString()}`
                        ) : "N/A"}
                      </span>
                    </div>
                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Radius Cap</span>
                      <span className="text-sm font-black text-white mt-1 block">
                        {discounts.find(d => d.type === "free_delivery" && d.is_active) ? (
                          (discounts.find(d => d.type === "free_delivery" && d.is_active).value > 0 ? `${discounts.find(d => d.type === "free_delivery" && d.is_active).value} km max` : "Unlimited Radius")
                        ) : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* All Offers List */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <h3 className="font-bold text-white text-sm">All Promotional Campaigns ({discounts.length})</h3>
                    {loadingDiscounts && <Loader2 size={16} className="animate-spin text-amber-400" />}
                  </div>

                  {discounts.length === 0 ? (
                    <div className="bg-slate-900/30 border border-slate-800/80 rounded-3xl p-12 text-center space-y-3">
                      <Tag size={32} className="mx-auto text-slate-600" />
                      <p className="text-slate-400 text-sm font-bold">No promotional campaigns created yet</p>
                      <button
                        onClick={() => setEditingDiscount({
                          code: "SAVE200",
                          type: "fixed",
                          value: 200,
                          min_order_amount: 1500,
                          is_active: true
                        })}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 mt-2 cursor-pointer"
                      >
                        <Plus size={14} /> Add First Offer
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {discounts.map((disc) => (
                        <div
                          key={disc.id}
                          className={`bg-slate-900/50 border rounded-3xl p-5 space-y-4 transition-all hover:border-slate-700 ${
                            disc.is_active ? "border-slate-800" : "border-slate-850 opacity-60"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="px-3 py-1 bg-amber-400 text-slate-950 font-mono font-black text-xs uppercase tracking-wider rounded-xl shadow-sm inline-block">
                                {disc.code.replace(/\[ITEMS:.*\]/, "")}
                              </span>
                              {disc.code.includes("[ITEMS:") && (
                                <span className="text-[9px] font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-md block mt-1">
                                  🎯 Items: {disc.code.match(/\[ITEMS:(.*)\]/)?.[1]}
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-slate-400 block mt-2 uppercase tracking-wider">
                                {disc.type === "percentage" ? "📊 Percentage Off" : disc.type === "fixed" ? "💰 Fixed Amount Off" : disc.type === "bogof" ? "🎁 Buy 1 Get 1 Free" : "🚚 Free Delivery"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleDiscountStatus(disc)}
                              className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                                disc.is_active
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : "bg-slate-800 border-slate-700 text-slate-400"
                              }`}
                            >
                              {disc.is_active ? "Active" : "Inactive"}
                            </button>
                          </div>

                          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-850 space-y-1.5 text-xs text-left">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Offer Value:</span>
                              <span className="font-bold text-white font-mono">
                                {disc.type === "percentage"
                                  ? `${disc.value}% OFF`
                                  : disc.type === "fixed"
                                  ? `KES ${disc.value.toLocaleString()} OFF`
                                  : disc.type === "bogof"
                                  ? "1 Free Item"
                                  : (disc.value > 0 ? `Free Delivery (max ${disc.value}km)` : "Free Delivery")}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Min Order Spend:</span>
                              <span className="font-bold text-white font-mono">
                                {disc.min_order_amount > 0 ? `KES ${disc.min_order_amount.toLocaleString()}` : "No Minimum"}
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-800/80">
                            <button
                              onClick={() => setEditingDiscount(disc)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                            <button
                              onClick={() => deleteDiscount(disc.id)}
                              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors cursor-pointer rounded-lg"
                              title="Delete Offer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                                {/* Create / Edit Offer Modal */}
                {editingDiscount && (() => {
                  const cleanCode = (editingDiscount.code || "").replace(/\[ITEMS:.*\]/, "");
                  const selectedItems = (editingDiscount.code || "").match(/\[ITEMS:(.*)\]/)?.[1]?.split(",").filter(Boolean) || [];
                  const isItemSpecific = selectedItems.length > 0 || editingDiscount._isItemSpecific;

                  const toggleItemSelection = (itemName) => {
                    let nextItems = [...selectedItems];
                    if (nextItems.includes(itemName)) {
                      nextItems = nextItems.filter(i => i !== itemName);
                    } else {
                      nextItems.push(itemName);
                    }
                    const newCode = nextItems.length > 0 ? `${cleanCode}[ITEMS:${nextItems.join(",")}]` : cleanCode;
                    setEditingDiscount({
                      ...editingDiscount,
                      code: newCode,
                      _isItemSpecific: true
                    });
                  };

                  return (
                  <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5 text-left text-white my-8 max-h-[90vh] flex flex-col"
                    >
                      <div className="flex justify-between items-center pb-3 border-b border-slate-800 shrink-0">
                        <div className="flex items-center gap-2">
                          <Gift size={18} className="text-amber-400" />
                          <h3 className="font-bold text-base">
                            {editingDiscount.id ? "Edit Promotion / Offer" : "Create New Promotion / Offer"}
                          </h3>
                        </div>
                        <button
                          onClick={() => setEditingDiscount(null)}
                          className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveDiscount(editingDiscount);
                        }}
                        className="space-y-4 overflow-y-auto pr-1"
                      >
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Promo Code <span className="text-amber-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. WELCOME10, LUNCHBOX15, SAVE200"
                            value={cleanCode}
                            onChange={(e) => {
                              const newClean = e.target.value.toUpperCase().replace(/\[.*\]/g, "");
                              const newCode = selectedItems.length > 0 ? `${newClean}[ITEMS:${selectedItems.join(",")}]` : newClean;
                              setEditingDiscount({ ...editingDiscount, code: newCode });
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                              Offer Type <span className="text-amber-400">*</span>
                            </label>
                            <select
                              value={editingDiscount.type}
                              onChange={(e) => setEditingDiscount({ ...editingDiscount, type: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
                            >
                              <option value="percentage">Percentage Off (%)</option>
                              <option value="fixed">Fixed Amount Off (KES)</option>
                              <option value="free_delivery">Free Delivery Promo</option>
                              <option value="bogof">Buy 1 Get 1 Free (BOGOF)</option>
                            </select>
                          </div>

                          {editingDiscount.type !== "bogof" && (
                            <div className="space-y-1.5">
                              <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                {editingDiscount.type === "percentage"
                                  ? "Discount (%)"
                                  : editingDiscount.type === "fixed"
                                  ? "Discount (KES)"
                                  : "Radius Cap (km)"}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={editingDiscount.value}
                                onChange={(e) => setEditingDiscount({ ...editingDiscount, value: e.target.value })}
                                placeholder="e.g. 20"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                              />
                            </div>
                          )}
                        </div>

                        {/* Item-Level Discount Selector */}
                        {(editingDiscount.type === "percentage" || editingDiscount.type === "fixed") && (
                          <div className="space-y-2 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="text-xs font-bold text-white block">Discount Target</span>
                                <span className="text-[10px] text-slate-400">Discount entire ticket or specific items</span>
                              </div>
                              <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDiscount({
                                      ...editingDiscount,
                                      code: cleanCode,
                                      _isItemSpecific: false
                                    });
                                  }}
                                  className={`px-2.5 py-1 rounded-lg transition-all ${!isItemSpecific ? "bg-amber-400 text-slate-950" : "text-slate-400"}`}
                                >
                                  All Items
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDiscount({
                                      ...editingDiscount,
                                      _isItemSpecific: true
                                    });
                                  }}
                                  className={`px-2.5 py-1 rounded-lg transition-all ${isItemSpecific ? "bg-amber-400 text-slate-950" : "text-slate-400"}`}
                                >
                                  Specific Items
                                </button>
                              </div>
                            </div>

                            {isItemSpecific && (
                              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                                <input
                                  type="text"
                                  placeholder="Search menu items to discount..."
                                  value={promoItemSearch}
                                  onChange={(e) => setPromoItemSearch(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                                />

                                {/* Selected Items Chips */}
                                {selectedItems.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {selectedItems.map((name) => (
                                      <span key={name} className="bg-amber-400/10 border border-amber-400/30 text-amber-300 px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                        <span>{name}</span>
                                        <button
                                          type="button"
                                          onClick={() => toggleItemSelection(name)}
                                          className="text-amber-400 hover:text-red-400 ml-0.5"
                                        >
                                          ✕
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Available Menu Items List */}
                                <div className="max-h-36 overflow-y-auto space-y-1 bg-slate-900/60 p-2 rounded-xl border border-slate-850 custom-scrollbar">
                                  {menuItems
                                    .filter(item => !promoItemSearch || item.name.toLowerCase().includes(promoItemSearch.toLowerCase()))
                                    .slice(0, 20)
                                    .map((item) => {
                                      const isSelected = selectedItems.includes(item.name);
                                      return (
                                        <div
                                          key={item.id || item.name}
                                          onClick={() => toggleItemSelection(item.name)}
                                          className={`flex justify-between items-center p-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                                            isSelected ? "bg-amber-400/15 text-amber-300 border border-amber-400/30" : "hover:bg-slate-800 text-slate-300"
                                          }`}
                                        >
                                          <span>{item.name}</span>
                                          <span className="text-[10px] font-mono text-slate-400">KES {item.price}</span>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                            Minimum Order Spend Threshold (KES)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={editingDiscount.min_order_amount}
                            onChange={(e) => setEditingDiscount({ ...editingDiscount, min_order_amount: e.target.value })}
                            placeholder="e.g. 1500 (0 for no minimum)"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                          />
                        </div>

                        <div className="flex items-center justify-between p-3.5 bg-slate-950/80 rounded-xl border border-slate-800">
                          <div>
                            <span className="text-xs font-bold text-white block">Active Status</span>
                            <span className="text-[10px] text-slate-400 font-medium">Enable this promotion immediately</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingDiscount({ ...editingDiscount, is_active: !editingDiscount.is_active })}
                            className={`w-12 h-6 flex items-center rounded-full p-1 transition-all cursor-pointer ${
                              editingDiscount.is_active ? "bg-amber-400 justify-end" : "bg-slate-700 justify-start"
                            }`}
                          >
                            <span className="bg-slate-950 w-4 h-4 rounded-full shadow-sm block" />
                          </button>
                        </div>

                        <div className="flex gap-2 pt-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingDiscount(null)}
                            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-amber-400/10 cursor-pointer"
                          >
                            Save Offer
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </div>
                );
              })()}
              </motion.div>
            )}


            {/* CUSTOMER FEEDBACK PANEL */}
            {activeTab === 'feedback' && canDo(TAB_PERMISSION.feedback) && (
              <motion.div
                key="feedback"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6 text-slate-900 bg-slate-950/40 p-2 rounded-3xl"
              >
                <FeedbackDashboardView />
              </motion.div>
            )}

            {/* LINK HUB & SOCIALS PANEL */}
            {activeTab === 'linkhub' && canDo(TAB_PERMISSION.linkhub) && (
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

            {/* SECURITY & AUDIT LOGS PANEL */}
            {activeTab === 'audit' && canDo(TAB_PERMISSION.audit) && (
              <motion.div
                key="audit"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-white tracking-tight">Security & Audit Trails</h2>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">Immutable record of cashier voids, refunds, discounts & shift closes</p>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
                  {auditLogs.length === 0 ? (
                    <div className="text-center py-12 text-slate-500 font-bold text-sm">
                      No security audit events recorded yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm text-slate-300">
                        <thead className="text-xs font-black uppercase text-slate-400 border-b border-slate-800 bg-slate-950/50">
                          <tr>
                            <th className="py-3.5 px-4">Timestamp</th>
                            <th className="py-3.5 px-4">Action</th>
                            <th className="py-3.5 px-4">Staff Member</th>
                            <th className="py-3.5 px-4">Audit Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-medium">
                          {auditLogs.map((log, idx) => (
                            <tr key={log.id || idx} className="hover:bg-slate-800/40">
                              <td className="py-3.5 px-4 text-xs font-bold text-slate-400">
                                {new Date(log.created_at).toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4">
                                <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                  {log.action}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-bold text-white">
                                {log.staff_name || 'Terminal Staff'}
                              </td>
                              <td className="py-3.5 px-4 text-xs font-mono text-slate-400">
                                {JSON.stringify(log.details)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
          </div>
          )}
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
                    {/* Free text with suggestions from this restaurant's own
                        categories — never a hard-coded list from another brand. */}
                    <input
                      name="category"
                      list="menu-category-options"
                      defaultValue={editingItem.category || ''}
                      placeholder="e.g. Main Dishes"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none text-slate-300"
                    />
                    <datalist id="menu-category-options">
                      {Array.from(new Set(menuItems.map((m) => m.category).filter(Boolean))).sort().map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
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
                  <label className="text-xs font-bold text-slate-400 block">Staff Name</label>
                  <input
                    name="staffName"
                    type="text"
                    required
                    defaultValue={editingStaff.name}
                    placeholder="e.g. Sarah Connor"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Email Address</label>
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={editingStaff.email}
                    placeholder="e.g. sarah@demostore.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Role</label>
                    <select
                      name="role"
                      defaultValue={editingStaff.role || 'cashier'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none text-slate-300"
                    >
                      <option value="cashier">Cashier</option>
                      <option value="waiter">Waiter</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Store Admin</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Password</label>
                    <input
                      name="password"
                      type="password"
                      required={!editingStaff.id}
                      defaultValue={editingStaff.pin_code || editingStaff.pin || ''}
                      placeholder="••••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none font-medium"
                    />
                  </div>
                </div>

                {/* Granular permissions. An empty/untouched list inherits the
                    role defaults; ticking a box switches to an explicit list. */}
                <div className="space-y-2 pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400 block">Permissions</label>
                    <button
                      type="button"
                      onClick={() => setStaffPermissions(null)}
                      className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      Reset to role defaults
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {staffPermissions
                      ? 'This person has an explicit permission list. Untick everything and press reset to inherit their role defaults.'
                      : `Inheriting the ${(editingStaff.role || 'cashier')} role defaults. Tick any box to give this person an explicit list.`}
                  </p>
                  <div className="max-h-56 overflow-y-auto pr-1 space-y-3">
                    {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
                      <div key={group}>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">{group}</div>
                        <div className="grid grid-cols-1 gap-1">
                          {perms.map((p) => {
                            const fallback = roleDefaults(editingStaff.role || 'cashier');
                            const checked = staffPermissions
                              ? staffPermissions.includes(p.key)
                              : fallback.includes(p.key);
                            return (
                              <label key={p.key} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-white transition-colors">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const base = staffPermissions || fallback;
                                    const next = e.target.checked
                                      ? [...new Set([...base, p.key])]
                                      : base.filter((k) => k !== p.key);
                                    setStaffPermissions(next);
                                  }}
                                  className="accent-emerald-500"
                                />
                                {p.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
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
                  const activePinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
                  const resolvedTenantSlug = activePinUser.tenantSlug || tenantSlug || getTenantInfo().tenantSlug;
                  if (!resolvedTenantSlug) {
                    alert('No restaurant slug found for link hub.');
                    setSubmitting(false);
                    return;
                  }
                  const linkData = {
                    ...(editingLink.id ? { id: editingLink.id } : {}),
                    tenant_id: resolvedTenantSlug,
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
                      const { data: refreshed } = await supabase
                        .from('tenant_links')
                        .select('*')
                        .eq('tenant_id', resolvedTenantSlug)
                        .order('display_order');
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

      <CloseStoreModal
        open={closeStoreOpen}
        onClose={() => setCloseStoreOpen(false)}
        restaurantId={activeRestaurantId}
        restaurantName={profileName || restaurantName}
        currentlyClosed={Boolean(settings.store_closed)}
        nextOpeningAt={settings.next_opening_at || ''}
        onUpdated={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
      />

    </div>
  );
}
