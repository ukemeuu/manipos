import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, setTenantContext } from '../lib/supabase';
import { loadTenant } from '../lib/tenantConfig';
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
  RefreshCw,
  ExternalLink,
  Plug,
  KeyRound,
  QrCode,
  Calendar,
  Thermometer,
  Lock,
  Printer,
  Zap,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalAuditLogs } from '../lib/auditLogger';
import { PERMISSION_GROUPS, currentPermissions, roleDefaults } from '../lib/permissions';
import { LiveOrdersView, computeOrderBucketCounts } from './orda/LiveOrdersView';
import { OrdaCatalogView } from './orda/OrdaCatalogView';
import { WebPosView } from './orda/WebPosView';
import { LocationsManagerView, CloseStoreModal } from './orda/LocationsManagerView';
import { OrdaReportsView } from './orda/OrdaReportsView';
import { OrderAndPaymentSettingsView } from './orda/OrderAndPaymentSettingsView';
import { CustomersCrmView } from './orda/CustomersCrmView';
import { PromotionsVouchersLoyaltyView } from './orda/PromotionsVouchersLoyaltyView';
import { DeliveryAreasView } from './orda/DeliveryAreasView';
import { OrdaInventoryErpView } from './orda/OrdaInventoryErpView';
import { WalletBillingView } from './orda/WalletBillingView';
import { IntegrationsAndOmnichannelView } from './orda/IntegrationsAndOmnichannelView';
import { TeamRolesAndAccountView } from './orda/TeamRolesAndAccountView';
import { TableManagementView } from './orda/TableManagementView';
import { HrAndStaffPortalView } from './orda/HrAndStaffPortalView';
import { PojOperationsView } from './orda/PojOperationsView';
import { PojSyncBridgeView } from './orda/PojSyncBridgeView';
import { GuestCRMView } from './GuestCRMView';
import { CustomerRetentionDashboard } from './CustomerRetentionDashboard';
import { getTenantInfo } from '../lib/tenant';
import { FeedbackDashboardView } from './FeedbackDashboardView';
import { applyOrderStatusUpdate, fetchPojOrdersForRange, mergeOrdersWithPoj } from '../services/data/pojSyncService';
import { authenticateStaffQuickPin } from '../services/data/staffService';
import { isAdminAccount, resolveOrdaEntryState, getVisibleOrdaRailIds } from '../lib/posRouting';
import { loadReceiptBrandForTenant, getPrinterPrefs, setPrinterPrefs, printZReport, printCashierSlips } from '../lib/posPrintService';
import {
  getBusinessDayStartIso,
  fetchActiveShift,
  openStaffShift,
  summarizeShiftSales,
  closeStaffShift,
} from '../lib/posShiftService';
import { connectQZ, isQZConnected, onQZStatusChange, listPrinters } from '../lib/qzPrint';

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

export function AdminDashboard({
  onOpenAppHome,
  onOpenModule,
  onSignOut,
  tenantSlug,
  tenantId: propTenantId = null,
  staffUser: propStaffUser = null,
  initialView = 'auto',
}) {
  const [sessionStaffUser, setSessionStaffUser] = useState(() => {
    if (propStaffUser) return propStaffUser;
    try {
      return JSON.parse(localStorage.getItem('pin_staff_user') || 'null');
    } catch {
      return null;
    }
  });
  const effectiveStaffUser = propStaffUser || sessionStaffUser;
  const isAdmin = useMemo(() => isAdminAccount(effectiveStaffUser), [effectiveStaffUser]);

  const initialEntry = useMemo(() => {
    let tabParam = '';
    let pageParam = '';
    try {
      const sp = new URLSearchParams(window.location.search);
      tabParam = sp.get('tab') || '';
      pageParam = sp.get('page') || '';
    } catch (_) { }
    const requestedRoute = initialView === 'pos' ? 'pos' : pageParam;
    return resolveOrdaEntryState({
      staffUser: effectiveStaffUser,
      requestedRoute,
      tabParam,
    });
  }, [effectiveStaffUser, initialView]);

  const [fallbackTenantId, setFallbackTenantId] = useState(propTenantId || null);
  const [setupCompleted, setSetupCompleted] = useState(() => {
    try {
      return localStorage.getItem(setupCompletedKey()) === 'true';
    } catch (e) {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    if (!isAdmin) return initialEntry.activeTab || 'orders';
    if (initialEntry.activeTab && initialEntry.activeTab !== 'orders') return initialEntry.activeTab;
    return setupCompleted ? 'orders' : 'onboarding';
  });
  const [activeModule, setActiveModule] = useState(() => {
    if (!isAdmin) return initialEntry.activeModule || 'orders';
    if (initialEntry.activeModule && initialEntry.activeModule !== 'orders') return initialEntry.activeModule;
    return setupCompleted ? 'orders' : 'dashboard';
  });
  const [reportSubTab, setReportSubTab] = useState('overview');
  const [invSection, setInvSection] = useState('items');
  const [orderBucket, setOrderBucket] = useState('active');
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState('all');
  const [showWebPos, setShowWebPos] = useState(() => Boolean(initialEntry.initialWebPos));
  const [settleTargetOrder, setSettleTargetOrder] = useState(null);
  const [closeStoreOpen, setCloseStoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [receiptPreviewHtml, setReceiptPreviewHtml] = useState('');

  // Operational Interface B POS controls (Shift / PIN Lock / QZ Printers / Auto-Accept)
  const [activeShift, setActiveShift] = useState(null);
  const [shiftModalMode, setShiftModalMode] = useState(null); // 'open' | 'close' | null
  const [shiftAmountInput, setShiftAmountInput] = useState('');
  const [shiftBusy, setShiftBusy] = useState(false);
  const [pinLocked, setPinLocked] = useState(false);
  const [lockPinInput, setLockPinInput] = useState('');
  const [lockError, setLockError] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [qzConnected, setQzConnected] = useState(() => isQZConnected());
  const [qzPrinters, setQzPrinters] = useState([]);
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [printerPrefs, setPrinterPrefsState] = useState(() => getPrinterPrefs());
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(() => {
    try {
      return localStorage.getItem('pos_auto_accept_orders') === 'true';
    } catch {
      return false;
    }
  });
  const autoAcceptedIdsRef = useRef(new Set());
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
    } catch (e) { }
    return 'ManiPOS Partner';
  }, []);

  useEffect(() => {
    if (propTenantId) {
      setFallbackTenantId(propTenantId);
      return;
    }
    const slug = tenantSlug || (() => {
      try { return JSON.parse(localStorage.getItem('pin_staff_user') || '{}').tenantSlug; } catch { return null; }
    })();
    if (slug && !getActiveRestaurantId()) {
      loadTenant(slug).then((resolved) => {
        if (resolved?.id) setFallbackTenantId(resolved.id);
      }).catch(() => { });
    }
  }, [propTenantId, tenantSlug]);

  useEffect(() => {
    const restId = getActiveRestaurantId();
    if (restId) setTenantContext(restId);
    fetchDashboardData();
    if (!restId) return undefined;
    const refreshOrdersOnly = (evt) => {
      const eventDetail = evt && evt.detail ? evt.detail : null;
      if (eventDetail?.updatedOrder || eventDetail?.orderId || eventDetail?.sourcePojId) {
        setOrders((prev) => applyOrderStatusUpdate(prev, eventDetail));
      }

      setTenantContext(restId);
      const pinUser = (() => {
        try {
          return JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
        } catch (_) {
          return {};
        }
      })();
      const resolvedSlug = pinUser.tenantSlug || tenantSlug;

      Promise.allSettled([
        supabase
          .from('pos_orders')
          .select('*, items:pos_order_items(*)')
          .eq('restaurant_id', restId)
          .order('created_at', { ascending: false }),
        fetchPojOrdersForRange({
          tenantSlug: resolvedSlug,
          restaurantId: restId,
          limit: 120,
        }),
      ]).then(([mpRes, pojRes]) => {
        const hasMp = mpRes?.status === 'fulfilled' && Array.isArray(mpRes.value?.data);
        const hasPoj = pojRes?.status === 'fulfilled' && Array.isArray(pojRes.value);
        if (!hasMp && !hasPoj) return;

        setOrders((prev) => {
          const maniRows = hasMp ? mpRes.value.data : prev.filter((o) => !o?._fromPoj);
          const pojRows = hasPoj ? pojRes.value : prev.filter((o) => o?._fromPoj);
          let merged = mergeOrdersWithPoj(maniRows, pojRows);
          if (eventDetail?.updatedOrder) {
            merged = applyOrderStatusUpdate(merged, eventDetail);
          }
          return merged;
        });
      });
    };
    // Poll every 8s as fallback because Supabase Realtime websockets cannot carry the custom x-tenant-id header under RLS
    const pollTimer = setInterval(refreshOrdersOnly, 8000);
    window.addEventListener('manipos:orders-updated', refreshOrdersOnly);
    const channel = supabase
      .channel(`admin-orders-${restId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pos_orders', filter: `restaurant_id=eq.${restId}` },
        refreshOrdersOnly
      )
      .subscribe();
    return () => {
      clearInterval(pollTimer);
      window.removeEventListener('manipos:orders-updated', refreshOrdersOnly);
      supabase.removeChannel(channel);
    };
  }, [propTenantId, fallbackTenantId]);

  // Seed the editable store name from the signed-in session. Saved changes
  // write back to localStorage so the rest of the app picks the new name up.
  useEffect(() => {
    if (restaurantName && !profileName) setProfileName(restaurantName);
  }, [restaurantName, profileName]);

  useEffect(() => {
    const unsubscribe = onQZStatusChange((connected) => {
      setQzConnected(connected);
    });
    const onReceiptPreview = (evt) => {
      const html = evt?.detail?.html;
      if (html) setReceiptPreviewHtml(String(html));
    };
    window.addEventListener('manipos:receipt-preview', onReceiptPreview);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      window.removeEventListener('manipos:receipt-preview', onReceiptPreview);
    };
  }, []);

  const syncUrlForOrdaState = (nextModule, nextTab, isWebPos = false, { replace = false } = {}) => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (isWebPos) {
        url.searchParams.set('page', 'pos');
        url.searchParams.delete('tab');
      } else if (!isAdmin) {
        url.searchParams.set('page', 'pos');
        if (nextTab === 'menu' || nextModule === 'menu') {
          url.searchParams.set('tab', 'menu');
        } else {
          url.searchParams.delete('tab');
        }
      } else {
        url.searchParams.set('page', 'dashboard');
        url.searchParams.set('tab', nextTab || nextModule || 'orders');
      }
      const target = `${url.pathname}${url.search}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (target !== current) {
        if (replace) {
          window.history.replaceState({}, '', target);
        } else {
          window.history.pushState({}, '', target);
        }
      }
    } catch (_) { }
  };

  // Keep React state in sync when user navigates with browser Back/Forward buttons
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPopState = () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const nextEntry = resolveOrdaEntryState({
          staffUser: effectiveStaffUser,
          requestedRoute: sp.get('page') || '',
          tabParam: sp.get('tab') || '',
        });
        setShowWebPos(Boolean(nextEntry.initialWebPos));
        setActiveModule(nextEntry.activeModule || 'orders');
        setActiveTab(nextEntry.activeTab || 'orders');
      } catch (_) { }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [effectiveStaffUser]);

  // Ensure initial URL query matches the resolved active module/POS view on entry
  useEffect(() => {
    syncUrlForOrdaState(activeModule, activeTab, showWebPos, { replace: true });
  }, []);

  // Auto-accept pending microsite orders when Auto-Accept toggle is ON
  useEffect(() => {
    if (!autoAcceptOrders) return;
    const restId = getActiveRestaurantId();
    if (!restId) return;
    const pendingMicrosite = orders.filter((o) => {
      if (!o?.id || autoAcceptedIdsRef.current.has(o.id)) return false;
      const st = String(o.status || '').toLowerCase();
      const ch = [o.sales_channel, o.order_channel, o.channel, o.order_source].filter(Boolean).join(' ').toLowerCase();
      return (st === 'pending' || st === 'new') && (ch.includes('microsite') || ch.includes('online') || ch.includes('skg'));
    });
    if (pendingMicrosite.length === 0) return;
    setTenantContext(restId);
    pendingMicrosite.forEach((o) => autoAcceptedIdsRef.current.add(o.id));
    Promise.allSettled(
      pendingMicrosite.map((o) =>
        supabase
          .from('pos_orders')
          .update({
            status: 'Preparing',
            accepted_at: o.accepted_at || new Date().toISOString(),
            kitchen_started_at: o.kitchen_started_at || new Date().toISOString(),
          })
          .eq('id', o.id)
          .eq('restaurant_id', restId)
      )
    ).then(() => {
      setOrders((prev) =>
        prev.map((o) =>
          pendingMicrosite.some((p) => p.id === o.id) ? { ...o, status: 'Preparing' } : o
        )
      );
    });
  }, [autoAcceptOrders, orders]);

  const fetchDashboardData = async (opts = {}) => {
    const silent = Boolean(opts?.silent) || (orders.length > 0 && menuItems.length > 0);
    if (!silent) setLoading(true);
    try {
      const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
      const currentRestaurantId = pinUser.restaurantId || pinUser.restaurant_id || propTenantId || fallbackTenantId;

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

      setTenantContext(currentRestaurantId);
      setLoadingDiscounts(true);

      const resolvedSlug = pinUser.tenantSlug || tenantSlug;
      const staffNameForShift = pinUser.name || 'Staff';

      // PHASE 1: Fast Cashier/POS Critical Path (Orders + Menu + Settings + Shift)
      const phase1Promise = Promise.allSettled([
        supabase
          .from('pos_orders')
          .select('*, items:pos_order_items(*)')
          .eq('restaurant_id', currentRestaurantId)
          .order('created_at', { ascending: false })
          .limit(350),
        supabase
          .from('pos_menu')
          .select('*')
          .eq('restaurant_id', currentRestaurantId)
          .order('name'),
        supabase
          .from('restaurant_settings')
          .select('*')
          .eq('restaurant_id', currentRestaurantId)
          .limit(1),
      ]);

      let timeoutId = null;
      const phase1Results = await Promise.race([
        phase1Promise,
        new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve(null), 8000);
        }),
      ]);
      if (timeoutId) clearTimeout(timeoutId);

      if (phase1Results) {
        const [ordersRes, menuRes, settingsRes] = phase1Results;
        const fetchedOrders = ordersRes?.status === 'fulfilled' ? ordersRes.value?.data || [] : [];
        setOrders((prev) =>
          mergeOrdersWithPoj(
            fetchedOrders,
            prev.filter((o) => o?._fromPoj)
          )
        );

        const fetchedMenu = menuRes?.status === 'fulfilled' ? menuRes.value?.data || [] : [];
        setMenuItems(fetchedMenu);

        const fetchedSettings = settingsRes?.status === 'fulfilled' ? settingsRes.value?.data : null;
        if (fetchedSettings && fetchedSettings.length > 0) {
          const currentSetting = fetchedSettings[0];
          setSettings(currentSetting);
          const hasOperationalData = fetchedOrders.length > 0 || fetchedMenu.length > 0;
          if (currentSetting.setup_completed || hasOperationalData) {
            setSetupCompleted(true);
            localStorage.setItem(setupCompletedKey(), 'true');
            if (!currentSetting.setup_completed && currentRestaurantId) {
              supabase
                .from('restaurant_settings')
                .update({ setup_completed: true })
                .eq('restaurant_id', currentRestaurantId)
                .then(() => { })
                .catch(() => { });
            }
            if (activeTab === 'onboarding' && isAdmin) {
              setActiveTab('orders');
              setActiveModule('orders');
              syncUrlForOrdaState('orders', 'orders', showWebPos, { replace: true });
            }
          } else if (isAdmin) {
            setSetupCompleted(false);
            localStorage.removeItem(setupCompletedKey());
            setActiveTab('onboarding');
            setActiveModule('dashboard');
            syncUrlForOrdaState('dashboard', 'onboarding', false, { replace: true });
          }
        } else if (currentRestaurantId && isAdmin) {
          try {
            const { data: newSettings } = await supabase
              .from('restaurant_settings')
              .insert([{
                restaurant_id: currentRestaurantId,
                address: '',
                phone: '',
                mpesa_paybill: '',
                mpesa_account: '',
                setup_completed: false
              }])
              .select()
              .single();
            if (newSettings) setSettings(newSettings);
          } catch (_) { }
          setSetupCompleted(false);
          localStorage.removeItem(setupCompletedKey());
          setActiveTab('onboarding');
          setActiveModule('dashboard');
          syncUrlForOrdaState('dashboard', 'onboarding', false, { replace: true });
        }
      }

      // Render workspace immediately once critical register data is ready
      setLoading(false);

      // Load printer receipt brand & active shift asynchronously
      loadReceiptBrandForTenant(currentRestaurantId, profileName || restaurantName).catch(() => { });
      fetchActiveShift(currentRestaurantId, staffNameForShift)
        .then((sh) => setActiveShift(sh))
        .catch(() => { });

      // PHASE 2: Non-blocking POJ Sync Bridge + Discounts/Branches + Admin Back-Office Tables
      const phase2Tasks = [
        // 0: Linked POJ Management Orders (always merged for unified order history)
        fetchPojOrdersForRange({
          tenantSlug: resolvedSlug,
          restaurantId: currentRestaurantId,
          limit: 250,
        }),
        // 1: Discounts / Promos (needed at POS settle)
        supabase
          .from('pos_discounts')
          .select('*')
          .eq('restaurant_id', currentRestaurantId)
          .order('created_at', { ascending: false }),
        // 2: Branches
        supabase
          .from('branches')
          .select('*')
          .eq('restaurant_id', currentRestaurantId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true }),
      ];

      if (isAdmin) {
        phase2Tasks.push(
          supabase.rpc('staff_list', { p_actor_id: pinUser.id || null }),
          supabase.from('pos_feedback').select('*').eq('restaurant_id', currentRestaurantId).order('created_at', { ascending: false }),
          resolvedSlug
            ? supabase.from('tenant_links').select('*').eq('tenant_id', resolvedSlug).order('display_order', { ascending: true })
            : Promise.resolve({ data: [] }),
          supabase.from('suppliers').select('*').eq('restaurant_id', currentRestaurantId).order('name'),
          supabase.from('audit_logs').select('*').eq('restaurant_id', currentRestaurantId).order('created_at', { ascending: false }).limit(200)
        );
      }

      Promise.allSettled(phase2Tasks).then((p2) => {
        const [pojRes, discountsRes, branchesRes, staffRes, feedbackRes, linksRes, suppliersRes, auditRes] = p2;

        if (pojRes?.status === 'fulfilled' && Array.isArray(pojRes.value)) {
          setOrders((prev) => mergeOrdersWithPoj(prev, pojRes.value));
        }
        if (discountsRes?.status === 'fulfilled' && !discountsRes.value?.error) {
          setDiscounts(discountsRes.value?.data || []);
        }
        setLoadingDiscounts(false);

        if (branchesRes?.status === 'fulfilled' && !branchesRes.value?.error && Array.isArray(branchesRes.value?.data)) {
          setBranches(branchesRes.value.data);
        }

        if (isAdmin) {
          if (staffRes?.status === 'fulfilled' && !staffRes.value?.error) {
            setStaffList(staffRes.value?.data || []);
          } else {
            setStaffList([]);
          }
          if (feedbackRes?.status === 'fulfilled' && !feedbackRes.value?.error) {
            setFeedbackList(feedbackRes.value?.data || []);
          }
          if (linksRes?.status === 'fulfilled' && !linksRes.value?.error) {
            setTenantLinks(linksRes.value?.data || []);
          }
          if (suppliersRes?.status === 'fulfilled' && !suppliersRes.value?.error) {
            setSuppliers(suppliersRes.value?.data || []);
          }
          const localLogs = getLocalAuditLogs(currentRestaurantId);
          if (auditRes?.status === 'fulfilled' && !auditRes.value?.error && Array.isArray(auditRes.value?.data)) {
            const fetchedAudit = auditRes.value.data;
            setAuditLogs(fetchedAudit.length > 0 ? fetchedAudit : localLogs);
          } else {
            setAuditLogs(localLogs);
          }
        }
      });
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setLoading(false);
      setLoadingDiscounts(false);
    }
  };

  const handleFetchDateRange = async (startIso, endIso) => {
    const restId = getActiveRestaurantId();
    if (!restId) return;
    try {
      setTenantContext(restId);
      const pinUser = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
      const [maniposRes, pojRes] = await Promise.allSettled([
        supabase
          .from('pos_orders')
          .select('*, items:pos_order_items(*)')
          .eq('restaurant_id', restId)
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(1000),
        fetchPojOrdersForRange({
          tenantSlug: pinUser.tenantSlug || tenantSlug,
          restaurantId: restId,
          startIso,
          endIso,
          limit: 1000,
        }),
      ]);
      const mpRows = maniposRes?.status === 'fulfilled' ? maniposRes.value?.data || [] : [];
      const pojRows = pojRes?.status === 'fulfilled' ? pojRes.value || [] : [];
      setOrders((prev) => {
        const existingMap = new Map(prev.map((o) => [String(o.id), o]));
        mpRows.forEach((r) => existingMap.set(String(r.id), r));
        return mergeOrdersWithPoj(Array.from(existingMap.values()), pojRows);
      });
    } catch (err) {
      console.warn('Date range load note:', err);
    }
  };

  const handleToggleAutoAccept = () => {
    setAutoAcceptOrders((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pos_auto_accept_orders', String(next));
      } catch (_) { }
      return next;
    });
  };

  const handleOpenPrinterModal = async () => {
    setPrinterModalOpen(true);
    try {
      const ok = isQZConnected() ? true : await connectQZ();
      setQzConnected(ok);
      if (ok) {
        const list = await listPrinters();
        setQzPrinters(list);
      }
    } catch (_) { }
  };

  const handleUnlockPin = async (e) => {
    if (e) e.preventDefault();
    const cleanPin = String(lockPinInput || '').replace(/\D/g, '');
    if (cleanPin.length < 4) {
      setLockError('Enter your 4-digit staff PIN.');
      return;
    }
    const restId = getActiveRestaurantId();
    const resolvedSlug = tenantSlug || effectiveStaffUser?.tenantSlug || '';
    setLockBusy(true);
    setLockError('');
    try {
      const res = await authenticateStaffQuickPin({
        tenantSlug: resolvedSlug,
        pin: cleanPin,
      });
      if (!res?.success || !res?.staffUser) {
        setLockError(res?.error || 'Incorrect PIN.');
        setLockBusy(false);
        return;
      }
      const nextStaff = {
        ...res.staffUser,
        restaurantId: res.staffUser.restaurantId || restId,
        restaurantName: res.staffUser.restaurantName || restaurantName || profileName,
        tenantSlug: res.staffUser.tenantSlug || resolvedSlug,
      };
      localStorage.setItem('pin_staff_user', JSON.stringify(nextStaff));
      setSessionStaffUser(nextStaff);
      setPinLocked(false);
      setLockPinInput('');
      setLockError('');
      // If unlocked by a non-admin staff member, enforce POS-only workspace view cleanly
      if (!isAdminAccount(nextStaff)) {
        setActiveModule('orders');
        setActiveTab('orders');
        setShowWebPos(true);
        syncUrlForOrdaState('orders', 'orders', true, { replace: true });
      }
    } catch (err) {
      setLockError(err.message || 'PIN verification failed.');
    } finally {
      setLockBusy(false);
    }
  };

  const handleOpenShiftSubmit = async (e) => {
    e.preventDefault();
    const restId = getActiveRestaurantId();
    if (!restId) return;
    setShiftBusy(true);
    try {
      const created = await openStaffShift({
        restaurantId: restId,
        staffName: pinStaffName,
        staffRole: effectiveStaffUser?.role || 'cashier',
        openingCash: Number(shiftAmountInput || 0),
      });
      setActiveShift(created);
      setShiftModalMode(null);
      setShiftAmountInput('');
    } catch (err) {
      alert(err.message || 'Failed to open shift.');
    } finally {
      setShiftBusy(false);
    }
  };

  const handleCloseShiftSubmit = async (e, shouldPrintZReport = true) => {
    e.preventDefault();
    const restId = getActiveRestaurantId();
    if (!restId || !activeShift) return;
    setShiftBusy(true);
    try {
      const { zReport } = await closeStaffShift({
        restaurantId: restId,
        activeShift,
        staffName: pinStaffName,
        orders,
        closingCash: Number(shiftAmountInput || 0),
      });
      if (shouldPrintZReport) {
        await printZReport(zReport);
      }
      setActiveShift(null);
      setShiftModalMode(null);
      setShiftAmountInput('');
    } catch (err) {
      alert(err.message || 'Failed to close shift.');
    } finally {
      setShiftBusy(false);
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
          confirmation_cta_text: settings.confirmation_cta_text || settings.confirmation_cta_label || null,
          confirmation_cta_url: settings.confirmation_cta_url || null,
          cuisines: Array.isArray(settings.cuisines)
            ? settings.cuisines.join(', ')
            : (settings.cuisines || settings.cuisines_input || null),
        };
        try {
          await supabase.from('restaurant_settings').update(wave1Patch).eq('restaurant_id', currentRestId);
        } catch (_) { }
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

  // Logo uploads go to the existing public bucket under a tenant-scoped logos/ prefix.
  const handleLogoUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file for the logo.');
      return;
    }
    setLogoUploading(true);
    try {
      const restaurantId = getActiveRestaurantId() || 'shared';
      const path = `${restaurantId}/logos/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
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
      return pinUser.restaurantId || pinUser.restaurant_id || propTenantId || fallbackTenantId || null;
    } catch (e) {
      return propTenantId || fallbackTenantId || null;
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
  const visibleRailIds = useMemo(
    () => getVisibleOrdaRailIds({ staffUser: effectiveStaffUser, permissions: perms }),
    [effectiveStaffUser, perms]
  );

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
  const openOrders = useMemo(
    () => scopedOrders.filter((o) => ['open', 'saved'].includes(String(o?.status || '').toLowerCase().trim())),
    [scopedOrders]
  );
  const bucketCounts = useMemo(() => computeOrderBucketCounts(scopedOrders), [scopedOrders]);
  const pinStaffName = effectiveStaffUser?.name || (() => {
    try {
      return JSON.parse(localStorage.getItem('pin_staff_user') || '{}').name || 'Staff';
    } catch {
      return 'Staff';
    }
  })();

  const shiftSummary = useMemo(
    () =>
      summarizeShiftSales({
        orders: scopedOrders,
        openingCash: Number(activeShift?.opening_cash || 0),
        staffName: pinStaffName,
        shiftStartIso: activeShift?.opened_at || getBusinessDayStartIso(),
      }),
    [scopedOrders, activeShift, pinStaffName]
  );

  const selectModule = (mod, tab) => {
    if (!isAdmin && !visibleRailIds.includes(mod)) return;
    const nextTab = tab || mod || 'orders';
    setShowWebPos(false);
    setSettleTargetOrder(null);
    setActiveModule(mod);
    if (tab) setActiveTab(tab);
    syncUrlForOrdaState(mod, nextTab, false);
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
    { id: 'returned', label: 'Returned', count: bucketCounts.returned },
    { id: 'voided', label: 'Voided', count: bucketCounts.voided },
    { id: 'open', label: 'Pending Open', count: bucketCounts.open },
    { id: 'unknown', label: 'Other', count: bucketCounts.unknown },
  ];

  const railNavItems = [
    { id: 'orders', label: 'Orders', icon: ClipboardList, tab: 'orders', badge: bucketCounts.active },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, tab: 'reports', visible: canDo(TAB_PERMISSION.analytics) },
    { id: 'customers', label: 'Customers', icon: UserCheck, tab: 'customers', visible: canDo(TAB_PERMISSION.offers) || canDo(TAB_PERMISSION.feedback) },
    { id: 'menu', label: 'Menu', icon: Package, tab: 'menu', visible: canDo(TAB_PERMISSION.menu) || visibleRailIds.includes('menu') },
    { id: 'settings', label: 'Settings', icon: Settings, tab: 'settings', visible: canDo(TAB_PERMISSION.settings) || canDo(TAB_PERMISSION.staff) },
    { id: 'wallet', label: 'Wallet', icon: Wallet, tab: 'wallet' },
    { id: 'inventory', label: 'Inventory', icon: Boxes, tab: 'inventory' },
    { id: 'hr', label: 'HR', icon: Users, tab: 'hr-admin', visible: canDo(TAB_PERMISSION.staff) },
    { id: 'account', label: 'Account', icon: Building2, tab: 'account' },
  ].filter((item) => item.visible !== false && visibleRailIds.includes(item.id));

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
          <Loader2 className="animate-spin text-amber-700 mx-auto" size={40} />
          <p className="text-slate-500 text-sm font-semibold tracking-wide uppercase">Loading ManiPOS Command Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-white text-slate-900 flex font-sans overflow-x-hidden">
      {/* 1. FAR-LEFT BLACK & YELLOW ICON RAIL (Tablet md+ & Desktop) */}
      <nav className="w-16 sm:w-[70px] bg-[#0d0d0d] text-slate-200 hidden md:flex flex-col justify-between items-center py-4 shrink-0 z-30 border-r border-slate-800">
        <div className="w-full flex flex-col items-center gap-2">
          <div
            onClick={() => selectModule('orders', 'orders')}
            className="w-10 h-10 rounded-xl bg-amber-400 text-black font-black text-lg flex items-center justify-center shadow-md cursor-pointer mb-3"
            title={profileName || restaurantName}
          >
            {(profileName || restaurantName || 'M')[0].toUpperCase()}
          </div>

          {railNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectModule(item.id, item.tab)}
                  title={item.label}
                  className={`relative w-12 py-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${isActive
                    ? 'bg-amber-400 text-black shadow-md shadow-amber-400/20'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-amber-400'
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

        <div className="w-full flex flex-col items-center gap-2 pt-3 border-t border-slate-800">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setCloseStoreOpen(true)}
              title={settings.store_closed ? 'Store Closed — Click to Reopen' : 'Close Store (End of Day)'}
              className={`w-12 py-2 rounded-xl flex flex-col items-center justify-center gap-1 transition cursor-pointer ${settings.store_closed
                ? 'bg-rose-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-amber-400'
                }`}
            >
              <Power size={17} />
              <span className="text-[9px] font-bold leading-none">
                {settings.store_closed ? 'Closed' : 'Store'}
              </span>
            </button>
          )}

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              title="Sign Out"
              className="w-12 py-2 rounded-xl flex flex-col items-center justify-center gap-1 text-amber-300/70 hover:bg-rose-950/60 hover:text-rose-200 transition cursor-pointer"
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
          {isAdmin && !setupCompleted && (
            <button
              type="button"
              onClick={() => selectModule('dashboard', 'onboarding')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold mb-2 ${activeTab === 'onboarding'
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
                      syncUrlForOrdaState('orders', 'orders', false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition ${selected
                      ? 'bg-amber-50 text-slate-900 border border-amber-200'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                  >
                    <span>{b.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${selected ? 'bg-amber-400 text-black' : 'bg-slate-100 text-slate-600'
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
                <>
                  {[
                    { id: 'overview', label: 'Executive Dashboard', icon: BarChart3 },
                    { id: 'transactions', label: 'Transactions', icon: Receipt },
                    { id: 'sales', label: 'Sales & Margins', icon: TrendingUp },
                    { id: 'taxes', label: 'Tax & Charges', icon: Percent },
                    { id: 'eod', label: 'End of Day (6am–6am)', icon: ClipboardList },
                    { id: 'promotions', label: 'Discounts & Loyalty', icon: Tag },
                    { id: 'devices', label: 'POS Devices & Audit', icon: CreditCard },
                  ].map((r) => {
                    const RIcon = r.icon;
                    const active = activeTab === 'reports' && reportSubTab === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setReportSubTab(r.id);
                          selectModule('dashboard', 'reports');
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${active ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                          }`}
                      >
                        <RIcon size={14} /> {r.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => selectModule('dashboard', 'fpa-expenses')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'fpa-expenses' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Receipt size={14} /> Accountant &amp; FP&amp;A
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('dashboard', 'analytics')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'analytics' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <TrendingUp size={14} /> Legacy Sales Charts
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => selectModule('dashboard', 'onboarding')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'onboarding' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <ShieldCheck size={15} /> Store Setup Checklist
              </button>
            </>
          )}

          {activeModule === 'customers' && (
            <>
              <button
                type="button"
                onClick={() => selectModule('customers', 'customers')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'customers' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <Users size={14} /> Customer List
              </button>
              <button
                type="button"
                onClick={() => selectModule('customers', 'guest-crm')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'guest-crm' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <UserCheck size={14} /> Guest CRM &amp; Tags
              </button>
              <button
                type="button"
                onClick={() => selectModule('customers', 'customer-retention')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'customer-retention' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <TrendingUp size={14} /> Customer Retention &amp; VIP
              </button>
              <button
                type="button"
                onClick={() => selectModule('customers', 'store-credit')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'store-credit' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <Wallet size={14} /> Store Credit Wallets
              </button>
              {canDo(TAB_PERMISSION.offers) && (
                <>
                  <button
                    type="button"
                    onClick={() => selectModule('customers', 'promotions')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'promotions' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Percent size={14} /> Promotions (5 Rules)
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('customers', 'vouchers')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'vouchers' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Tag size={14} /> Vouchers
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('customers', 'loyalty')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'loyalty' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Star size={14} /> Loyalty Programs
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('customers', 'offers')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'offers' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Gift size={14} /> Influencer & Legacy Offers
                  </button>
                </>
              )}
              {canDo(TAB_PERMISSION.feedback) && (
                <button
                  type="button"
                  onClick={() => selectModule('customers', 'feedback')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === 'feedback' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  <MessageSquare size={14} /> Customer Feedback
                </button>
              )}
            </>
          )}

          {activeModule === 'menu' && (
            <button
              type="button"
              onClick={() => selectModule('menu', 'menu')}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'menu' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              <Package size={15} /> Catalog, Modifiers & Combos
            </button>
          )}

          {activeModule === 'settings' && (
            <>
              {canDo(TAB_PERMISSION.settings) && (
                <>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'settings')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'settings' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Settings size={15} /> Store Settings & SEO
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'order-settings')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'order-settings' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Truck size={15} /> Order Methods & Void
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'payment-settings')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'payment-settings' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <CreditCard size={15} /> Payment & Charges
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'delivery-areas')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'delivery-areas' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <MapPin size={15} /> Delivery Areas (Zones)
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'table-management')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'table-management' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Armchair size={15} /> Table Management & QR
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'integrations')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'integrations' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Plug size={15} /> Integrations Hub
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'omnichannel')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'omnichannel' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Globe size={15} /> Omnichannel (Glovo/Bolt/Uber)
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'api-webhooks')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'api-webhooks' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <KeyRound size={15} /> API Keys & Webhooks
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => selectModule('settings', 'locations')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'locations' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <MapPin size={15} /> Locations & Branches
              </button>
              {canDo(TAB_PERMISSION.staff) && (
                <>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'team-roles')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'team-roles' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <ShieldCheck size={15} /> Team Roles (24 POS Perms)
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'staff')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'staff' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Users size={15} /> Staff PINs &amp; Access
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'qr-vault')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'qr-vault' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <QrCode size={15} /> QR Code Vault
                  </button>
                  <button
                    type="button"
                    onClick={() => selectModule('settings', 'poj-sync')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'poj-sync' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-amber-700 bg-amber-50/40 hover:bg-amber-100 border border-amber-200/70'
                      }`}
                  >
                    <RefreshCw size={15} /> Data Migration &amp; Sync
                  </button>
                </>
              )}
              {tenantSlug && (
                <a
                  href={`/?tenant=${encodeURIComponent(tenantSlug)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-amber-700 hover:bg-amber-50 border border-emerald-100 mt-1"
                >
                  <ExternalLink size={15} /> Preview Live Storefront
                </a>
              )}
              {canDo(TAB_PERMISSION.suppliers) && (
                <button
                  type="button"
                  onClick={() => selectModule('settings', 'suppliers')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'suppliers' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  <Truck size={15} /> Supplier Management
                </button>
              )}
              {canDo(TAB_PERMISSION.linkhub) && (
                <button
                  type="button"
                  onClick={() => selectModule('settings', 'linkhub')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'linkhub' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  <Link2 size={15} /> Link Hub & Socials
                </button>
              )}
              {canDo(TAB_PERMISSION.audit) && (
                <button
                  type="button"
                  onClick={() => selectModule('settings', 'audit')}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'audit' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  <ShieldCheck size={15} /> Security & Audit Logs
                </button>
              )}
            </>
          )}

          {activeModule === 'inventory' && (
            <>
              {[
                { id: 'reports', label: '7 Inventory Reports', icon: BarChart3 },
                { id: 'items', label: 'Ingredients & Sub-Recipes', icon: Boxes },
                { id: 'stores', label: 'Stores, Batches & Ledger', icon: Package },
                { id: 'recipes', label: 'Menu & Modifier Recipes', icon: ChefHat },
                { id: 'count', label: 'Physical Stock Count', icon: ClipboardList },
                { id: 'transfers', label: 'Transfers & Pull Requests', icon: Truck },
                { id: 'purchase-orders', label: 'Purchase Orders & Suppliers', icon: ShoppingBag },
                { id: 'inv-settings', label: 'Stores & Auto-86 Settings', icon: Settings },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeTab === 'inventory' && invSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setInvSection(item.id);
                      selectModule('inventory', 'inventory');
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${active ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Icon size={14} /> {item.label}
                  </button>
                );
              })}
              {[
                { id: 'receiving', label: 'Receiving & Temp Logs', icon: Thermometer },
                { id: 'store-ops', label: 'Stock Requisitions', icon: ClipboardList },
                { id: 'waste', label: 'Kitchen Waste Log', icon: Trash2 },
              ].map((op) => {
                const OpIcon = op.icon;
                return (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => selectModule('inventory', op.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold ${activeTab === op.id ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <OpIcon size={14} /> {op.label}
                  </button>
                );
              })}
              <div className="pt-3 mt-2 border-t border-slate-100 space-y-1">
                <button
                  type="button"
                  onClick={() => onOpenModule ? onOpenModule('inventory') : (window.location.href = '/?page=inventory')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Package size={14} /> Quick Stock Hub →
                </button>
                <button
                  type="button"
                  onClick={() => onOpenModule ? onOpenModule('kds') : (window.location.href = '/?page=kds')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <ChefHat size={14} /> Kitchen Display →
                </button>
                <button
                  type="button"
                  onClick={() => onOpenModule ? onOpenModule('floor') : (window.location.href = '/?page=floor')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Armchair size={14} /> Floor & Reservations →
                </button>
              </div>
            </>
          )}

          {activeModule === 'hr' && (
            <>
              {[
                { id: 'hr-admin', label: 'HR Approvals & People', icon: Users },
                { id: 'staff-portal', label: 'My Staff Self-Service', icon: Calendar },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectModule('hr', item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === item.id ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Icon size={15} /> {item.label}
                  </button>
                );
              })}
            </>
          )}

          {activeModule === 'wallet' && (
            <>
              {[
                { id: 'wallet', label: 'Wallet & Ledger', icon: Wallet },
                { id: 'subscriptions', label: 'Subscriptions & Billing', icon: Receipt },
                { id: 'paystack', label: 'Paystack Sub-Account', icon: CreditCard },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectModule('wallet', item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === item.id ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    <Icon size={15} /> {item.label}
                  </button>
                );
              })}
            </>
          )}

          {activeModule === 'account' && (
            <>
              <button
                type="button"
                onClick={() => selectModule('account', 'account')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'account' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <ShieldCheck size={15} /> Security &amp; Support PIN
              </button>
              <button
                type="button"
                onClick={() => selectModule('account', 'staff-portal')}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold ${activeTab === 'staff-portal' ? 'bg-amber-50 text-slate-900 border border-amber-200' : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <Calendar size={15} /> My Staff Portal
              </button>
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
              {tenantSlug && (
                <a
                  href={`/?tenant=${encodeURIComponent(tenantSlug)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-amber-700 hover:bg-amber-50"
                >
                  <ExternalLink size={15} /> Open Live Storefront
                </a>
              )}
            </>
          )}
        </div>
      </aside>

      {/* 3. RIGHT WORKSPACE COLUMN */}
      <div className="flex-1 flex flex-col min-w-0 min-h-[100dvh] md:h-screen overflow-hidden">
        {/* ORDA TOP HEADER */}
        <header className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 shrink-0 z-10">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-initial">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="md:hidden p-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 shrink-0 cursor-pointer"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black text-slate-900 truncate">
                  {profileName || restaurantName}
                </h1>
                <span
                  onClick={() => { if (isAdmin) setCloseStoreOpen(true); }}
                  className={`${isAdmin ? 'cursor-pointer' : ''} text-[10px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${settings.store_closed
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                >
                  {settings.store_closed ? 'Closed' : 'Open'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                ManiPOS Operations · Signed in as {pinStaffName}
              </p>
            </div>

            {branches.length > 0 && (
              <select
                value={activeBranchId}
                onChange={(e) => setActiveBranchId(e.target.value)}
                className="hidden sm:block bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-400"
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

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setSettleTargetOrder(null);
                setShowWebPos((v) => {
                  const next = !v;
                  syncUrlForOrdaState('orders', 'orders', next);
                  return next;
                });
              }}
              className="px-3 sm:px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Plus size={15} />
              <span>{showWebPos ? 'Live Orders' : 'Create Order'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShiftAmountInput(activeShift ? '' : '0');
                setShiftModalMode(activeShift ? 'close' : 'open');
              }}
              className={`px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${activeShift
                ? 'bg-amber-50 border-amber-200 text-slate-900 hover:bg-amber-100'
                : 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                }`}
              title={activeShift ? `Active Shift opened ${new Date(activeShift.opened_at).toLocaleTimeString()}` : 'Open Cashier Shift'}
            >
              <Clock size={14} />
              <span className="hidden sm:inline">{activeShift ? 'Close Shift / Z-Report' : 'Open Shift'}</span>
              <span className="sm:hidden">{activeShift ? 'Shift' : 'Shift'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleAutoAccept}
              className={`px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${autoAcceptOrders
                ? 'bg-amber-50 border-amber-300 text-slate-900'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              title="Automatically approve incoming digital menu orders"
            >
              <Zap size={13} />
              <span className="hidden sm:inline">Auto-Accept: {autoAcceptOrders ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenPrinterModal}
              className={`px-2.5 sm:px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${qzConnected
                ? 'bg-amber-50 border-amber-200 text-slate-900'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              title="Configure Receipt & Kitchen Printers"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">{qzConnected ? 'Printers Ready' : 'Printers'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLockPinInput('');
                setLockError('');
                setPinLocked(true);
              }}
              className="px-2.5 sm:px-3 py-2 rounded-xl border border-slate-200 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              title="Quick Lock Terminal (PIN)"
            >
              <Lock size={13} />
              <span className="hidden sm:inline">Lock</span>
            </button>

            {isAdmin && onOpenAppHome && (
              <button
                type="button"
                onClick={onOpenAppHome}
                className="px-2.5 sm:px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span className="hidden sm:inline">Workspace</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchDashboardData({ silent: true })}
              title="Refresh data"
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {/* MOBILE HORIZONTAL BUCKET STRIP FOR ORDERS (< md) */}
        {activeModule === 'orders' && !showWebPos && (
          <div className="md:hidden bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
            {ORDER_BUCKETS.map((b) => {
              const selected = activeTab === 'orders' && orderBucket === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setShowWebPos(false);
                    setSettleTargetOrder(null);
                    setActiveTab('orders');
                    setOrderBucket(b.id);
                    syncUrlForOrdaState('orders', 'orders', false);
                  }}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                    selected
                      ? 'bg-amber-400 text-black border-amber-400'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>{b.label}</span>
                  {b.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${selected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                      {b.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* WORKSPACE MAIN */}
        <main className="flex-1 p-3 sm:p-5 md:p-6 pb-24 md:pb-6 overflow-y-auto overflow-x-hidden bg-slate-50">
          {(bucketCounts.new + bucketCounts.verifying) > 0 && (activeTab !== 'orders' || showWebPos) && (
            <div className="mb-5 bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center animate-pulse">!</span>
                <div>
                  <p className="text-xs font-black text-amber-950 uppercase tracking-wider">
                    {bucketCounts.new + bucketCounts.verifying} New Incoming Order{(bucketCounts.new + bucketCounts.verifying) > 1 ? 's' : ''} Waiting Approval
                  </p>
                  <p className="text-xs text-amber-800">
                    Review and click Accept or Decline in Live Orders.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setOrderBucket('new'); selectModule('orders', 'orders'); }}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black cursor-pointer"
              >
                View Incoming Orders &rarr;
              </button>
            </div>
          )}
          {isAdmin && !setupCompleted && activeTab !== 'onboarding' && (
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
              openOrders={openOrders}
              onSelectOpenOrder={(order) => setSettleTargetOrder(order)}
              tendersConfig={settings.payment_tenders_config}
              allowNegativeStoreCredit={settings.allow_negative_store_credit === true}
              onBackToOrders={() => {
                setShowWebPos(false);
                setSettleTargetOrder(null);
                setActiveModule('orders');
                setActiveTab('orders');
                syncUrlForOrdaState('orders', 'orders', false);
              }}
              onOrderPlaced={() => fetchDashboardData({ silent: true })}
            />
          ) : (activeTab === 'orders' || (!isAdmin && activeTab !== 'menu')) ? (
            <LiveOrdersView
              orders={orders}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              tenantSlug={tenantSlug}
              activeBranch={activeBranchObj}
              statusFilter={orderBucket}
              voidCompletedAllowed={settings.void_completed_allowed !== false}
              voidWindowHours={settings.void_window_hours ?? 168}
              onRefresh={() => fetchDashboardData({ silent: true })}
              onFetchDateRange={handleFetchDateRange}
              onCreateOrder={() => {
                setSettleTargetOrder(null);
                setShowWebPos(true);
                syncUrlForOrdaState('orders', 'orders', true);
              }}
              onResumeOpenOrder={(order) => {
                setSettleTargetOrder(order);
                setShowWebPos(true);
                syncUrlForOrdaState('orders', 'orders', true);
              }}
            />
          ) : activeTab === 'reports' ? (
            <OrdaReportsView
              reportKey={reportSubTab}
              onSelectReport={setReportSubTab}
              onDateRangeChange={handleFetchDateRange}
              orders={orders}
              menuItems={menuItems}
              discounts={discounts}
              branches={branches}
              activeBranch={activeBranchId}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
            />
          ) : activeTab === 'order-settings' || activeTab === 'payment-settings' ? (
            <OrderAndPaymentSettingsView
              mode={activeTab}
              restaurantId={activeRestaurantId}
              settings={settings}
              onSettingsUpdated={fetchDashboardData}
            />
          ) : activeTab === 'delivery-areas' ? (
            <DeliveryAreasView
              restaurantId={activeRestaurantId}
              branches={branches}
              settings={settings}
              onSettingsUpdated={fetchDashboardData}
            />
          ) : activeTab === 'customers' || activeTab === 'store-credit' ? (
            <CustomersCrmView
              mode={activeTab === 'store-credit' ? 'store-credit' : 'listing'}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              orders={orders}
              branches={branches}
              allowNegativeStoreCredit={settings.allow_negative_store_credit === true}
            />
          ) : activeTab === 'promotions' || activeTab === 'vouchers' || activeTab === 'loyalty' ? (
            <PromotionsVouchersLoyaltyView
              mode={activeTab}
              restaurantId={activeRestaurantId}
              discounts={discounts}
              menuItems={menuItems}
              onDiscountsChanged={fetchDashboardData}
            />
          ) : activeTab === 'locations' ? (
            <LocationsManagerView
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              tenantSlug={tenantSlug}
              onBranchesUpdated={(nextBranches) => {
                if (Array.isArray(nextBranches)) {
                  setBranches(nextBranches);
                } else {
                  fetchDashboardData({ silent: true });
                }
              }}
            />
          ) : activeTab === 'inventory' ? (
            <OrdaInventoryErpView
              mode={invSection}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              menuItems={menuItems}
              orders={orders}
              branches={branches}
              suppliers={suppliers}
              staffName={pinStaffName}
              onRefreshDashboard={fetchDashboardData}
            />
          ) : activeTab === 'wallet' || activeTab === 'subscriptions' || activeTab === 'paystack' ? (
            <WalletBillingView
              mode={activeTab === 'wallet' ? 'payments' : activeTab}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              settings={settings}
              orders={scopedOrders}
              staffName={pinStaffName}
            />
          ) : activeTab === 'integrations' || activeTab === 'omnichannel' || activeTab === 'api-webhooks' ? (
            <IntegrationsAndOmnichannelView
              mode={activeTab}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              tenantSlug={tenantSlug}
              settings={settings}
              onSettingsUpdated={fetchDashboardData}
            />
          ) : activeTab === 'table-management' ? (
            <TableManagementView
              restaurantId={activeRestaurantId}
              tenantSlug={tenantSlug}
              branches={branches}
              settings={settings}
              onSettingsUpdated={fetchDashboardData}
              onOpenFloorPlan={() => (onOpenModule ? onOpenModule('floor') : (window.location.href = '/?page=floor'))}
            />
          ) : activeTab === 'team-roles' || activeTab === 'account' ? (
            <TeamRolesAndAccountView
              mode={activeTab}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              staffList={staffList}
              branches={branches}
              settings={settings}
              onOpenCloseStore={() => setCloseStoreOpen(true)}
              onStaffUpdated={fetchDashboardData}
            />
          ) : activeTab === 'guest-crm' ? (
            <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800">
              <GuestCRMView initialTab="directory" />
            </div>
          ) : activeTab === 'customer-retention' ? (
            <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800">
              <CustomerRetentionDashboard restaurantId={activeRestaurantId} />
            </div>
          ) : activeTab === 'hr-admin' || activeTab === 'staff-portal' ? (
            <HrAndStaffPortalView
              mode={activeTab === 'hr-admin' ? 'hr-admin' : 'self-service'}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              staffUser={{
                id: JSON.parse(localStorage.getItem('pin_staff_user') || '{}').id || null,
                name: pinStaffName,
                role: JSON.parse(localStorage.getItem('pin_staff_user') || '{}').role || 'admin',
                email: JSON.parse(localStorage.getItem('pin_staff_user') || '{}').email || '',
              }}
              staffList={staffList}
            />
          ) : activeTab === 'poj-sync' ? (
            <PojSyncBridgeView
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              actorId={JSON.parse(localStorage.getItem('pin_staff_user') || '{}').id || null}
              actorName={pinStaffName}
              onSyncCompleted={fetchDashboardData}
            />
          ) : activeTab === 'fpa-expenses' || activeTab === 'receiving' || activeTab === 'waste' || activeTab === 'store-ops' || activeTab === 'qr-vault' ? (
            <PojOperationsView
              mode={activeTab === 'fpa-expenses' ? 'accountant' : activeTab}
              restaurantId={activeRestaurantId}
              restaurantName={profileName || restaurantName}
              tenantSlug={tenantSlug}
              orders={scopedOrders}
              staffUser={{
                name: pinStaffName,
                role: JSON.parse(localStorage.getItem('pin_staff_user') || '{}').role || 'admin',
              }}
            />
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
                          <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black text-sm">✓</div>
                          <div>
                            <h4 className="font-bold text-white text-sm">1. Restaurant Details</h4>
                            <p className="text-xs text-slate-400">Account & store workspace created</p>
                          </div>
                        </div>

                        <div className={`flex items-center gap-4 bg-slate-950 border ${menuItems.length > 0 ? 'border-slate-800/80' : 'border-amber-500/40'} p-5 rounded-2xl`}>
                          <div className={`w-10 h-10 rounded-xl ${menuItems.length > 0 ? 'bg-amber-400/20 text-amber-400' : 'bg-amber-400/20 text-amber-400'} flex items-center justify-center font-black text-sm`}>
                            {menuItems.length > 0 ? '✓' : '2'}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-white text-sm">2. Menu Catalog</h4>
                            <p className="text-xs text-slate-400">{menuItems.length} active menu items</p>
                          </div>
                          <button onClick={() => selectModule('menu', 'menu')} className="px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-all">
                            Configure Menu &rarr;
                          </button>
                        </div>

                        <div className="flex items-center gap-4 bg-slate-950 border border-slate-800/80 p-5 rounded-2xl">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-sm">3</div>
                          <div className="flex-1">
                            <h4 className="font-bold text-white text-sm">3. Staff & Cashier PINs</h4>
                            <p className="text-xs text-slate-400">{staffList.length} staff member accounts</p>
                          </div>
                          <button onClick={() => selectModule('settings', 'staff')} className="px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-all">
                            Staff &rarr;
                          </button>
                        </div>

                        <div className="flex items-center gap-4 bg-slate-950 border border-slate-800/80 p-5 rounded-2xl">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center font-bold text-sm">4</div>
                          <div className="flex-1">
                            <h4 className="font-bold text-white text-sm">4. Payment & Receipts</h4>
                            <p className="text-xs text-slate-400">M-Pesa & Cash settings</p>
                          </div>
                          <button onClick={() => selectModule('settings', 'settings')} className="px-3.5 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-700 transition-all">
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
                            } catch (e) { }
                            setSettleTargetOrder(null);
                            setActiveModule('orders');
                            setActiveTab('orders');
                            setShowWebPos(true);
                            syncUrlForOrdaState('orders', 'orders', true);
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
                        <div className="w-12 h-12 bg-amber-400/10 text-amber-400 flex items-center justify-center rounded-xl border border-amber-400/10">
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
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
                            Culinary sales volume & velocity breakdown. <span className="text-amber-400 font-semibold">Strictly excludes all delivery charges & packaging fees.</span>
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
                                <span className="px-2 py-0.5 bg-amber-400/10 text-amber-400 font-mono font-extrabold text-[11px] rounded-lg shrink-0">
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
                {activeTab === 'menu' && !showWebPos && (canDo(TAB_PERMISSION.menu) || visibleRailIds.includes('menu')) && (
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
                      canDelete={isAdmin}
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
                        className="flex items-center gap-1 bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/10 hover:brightness-110 transition-all"
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
                                <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${staff.role === 'admin'
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
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none transition-colors"
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
                            <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-950 border border-slate-800 px-4 py-2.5 rounded-xl hover:border-amber-400 transition-colors">
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
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:border-amber-400 focus:outline-none transition-colors"
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
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-12 pr-4 py-3 text-sm focus:border-amber-400 focus:outline-none transition-colors"
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
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none transition-colors font-mono"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Website</label>
                          <input
                            type="text"
                            placeholder="e.g. yourrestaurant.co.ke"
                            value={settings.website || ''}
                            onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none transition-colors font-mono"
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
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs focus:border-amber-400 focus:outline-none transition-colors font-mono"
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
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none transition-colors font-mono"
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
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none transition-colors font-mono"
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
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none transition-colors font-mono"
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
                              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:border-amber-400 focus:outline-none"
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
                              <span key={customM} className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-400/10 border border-amber-400/20 text-amber-400 font-bold text-xs rounded-full">
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
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
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
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
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
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
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
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Meta Pixel ID</label>
                            <input
                              type="text"
                              placeholder="e.g. 123456789012345"
                              value={settings.meta_pixel_id || ''}
                              onChange={(e) => setSettings({ ...settings, meta_pixel_id: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Post-Order Button Label</label>
                            <input
                              type="text"
                              placeholder="e.g. Follow Us on Instagram"
                              value={settings.confirmation_cta_text || settings.confirmation_cta_label || ''}
                              onChange={(e) => setSettings({ ...settings, confirmation_cta_text: e.target.value, confirmation_cta_label: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Post-Order Button URL</label>
                            <input
                              type="url"
                              placeholder="https://instagram.com/..."
                              value={settings.confirmation_cta_url || ''}
                              onChange={(e) => setSettings({ ...settings, confirmation_cta_url: e.target.value })}
                              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:border-amber-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 bg-amber-400 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 mt-4 text-sm"
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
                        className="flex items-center gap-1 bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/10 hover:brightness-110 transition-all"
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
                              <span className="text-amber-400 flex items-center gap-1.5 mt-1">
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
                              className={`bg-slate-900/50 border rounded-3xl p-5 space-y-4 transition-all hover:border-slate-700 ${disc.is_active ? "border-slate-800" : "border-slate-850 opacity-60"
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
                                  className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${disc.is_active
                                    ? "bg-amber-400/10 border-amber-400/30 text-amber-400"
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
                                                className={`flex justify-between items-center p-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${isSelected ? "bg-amber-400/15 text-amber-300 border border-amber-400/30" : "hover:bg-slate-800 text-slate-300"
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
                                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-all cursor-pointer ${editingDiscount.is_active ? "bg-amber-400 justify-end" : "bg-slate-700 justify-start"
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
                        className="flex items-center gap-1 bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm shadow-lg shadow-emerald-500/10 hover:brightness-110 transition-all cursor-pointer"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:border-amber-400 focus:outline-none text-slate-300"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none h-20 resize-none"
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
                  className="w-full bg-amber-400 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 text-sm mt-2"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Role</label>
                    <select
                      name="role"
                      defaultValue={editingStaff.role || 'cashier'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-sm focus:border-amber-400 focus:outline-none text-slate-300"
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none font-medium"
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
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors"
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
                  className="w-full bg-amber-400 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 text-sm mt-2"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">Contact Person Name</label>
                  <input
                    name="contactName"
                    type="text"
                    defaultValue={editingSupplier.contact_name}
                    placeholder="e.g. Jane Njoroge"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 block">Email Address</label>
                    <input
                      name="email"
                      type="email"
                      defaultValue={editingSupplier.email}
                      placeholder="e.g. sales@vendor.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none text-slate-300"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-400 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 text-sm mt-2 flex items-center justify-center"
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
                  className="w-full bg-amber-400 text-slate-950 font-bold py-3.5 rounded-xl hover:brightness-110 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 text-sm mt-2 flex items-center justify-center cursor-pointer"
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

      {/* Shift Open / Close & Z-Report Modal */}
      {shiftModalMode && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) =>
              shiftModalMode === 'open'
                ? handleOpenShiftSubmit(e)
                : handleCloseShiftSubmit(e, true)
            }
            className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {shiftModalMode === 'open' ? 'Open Cashier Shift' : 'Close Shift & Z-Report'}
                </h3>
                <p className="text-xs text-slate-500">Operator: {pinStaffName}</p>
              </div>
              <button
                type="button"
                onClick={() => setShiftModalMode(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {shiftModalMode === 'close' && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Opening Cash Float</span>
                  <span className="font-bold text-slate-900">KES {Number(activeShift?.opening_cash || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Orders Processed ({shiftSummary.ordersCount})</span>
                  <span className="font-bold text-slate-900">KES {shiftSummary.totalSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cash Sales</span>
                  <span className="font-bold text-amber-700">KES {shiftSummary.cashSales.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">M-Pesa / Card / Other</span>
                  <span className="font-bold text-slate-900">
                    KES {(shiftSummary.mpesaSales + shiftSummary.cardSales + shiftSummary.otherSales).toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between font-black text-slate-900">
                  <span>Expected Cash Drawer</span>
                  <span>KES {shiftSummary.expectedCash.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                {shiftModalMode === 'open' ? 'Opening Cash Float (KES)' : 'Actual Counted Cash (KES)'}
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={shiftAmountInput}
                onChange={(e) => setShiftAmountInput(e.target.value)}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShiftModalMode(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={shiftBusy}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black cursor-pointer disabled:opacity-50"
              >
                {shiftBusy
                  ? 'Saving...'
                  : shiftModalMode === 'open'
                  ? 'Start Shift'
                  : 'Close Shift & Print Z-Report'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QZ Tray Thermal & Kitchen Printer Setup Modal */}
      {printerModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">QZ Tray Thermal Printers</h3>
                <p className="text-xs text-slate-500">
                  Status:{' '}
                  <span className={qzConnected ? 'text-amber-700 font-bold' : 'text-amber-700 font-bold'}>
                    {qzConnected ? 'Connected to QZ Tray' : 'Offline — Using built-in browser print'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPrinterModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Front Desk Receipt Printer</label>
                {qzPrinters.length > 0 ? (
                  <select
                    value={printerPrefs.frontDeskPrinter}
                    onChange={(e) => setPrinterPrefsState((p) => ({ ...p, frontDeskPrinter: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="">Default System Printer</option>
                    {qzPrinters.map((pr) => (
                      <option key={pr} value={pr}>{pr}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={printerPrefs.frontDeskPrinter}
                    onChange={(e) => setPrinterPrefsState((p) => ({ ...p, frontDeskPrinter: e.target.value }))}
                    placeholder="Printer name (optional)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Kitchen Docket (KOT) Printer</label>
                {qzPrinters.length > 0 ? (
                  <select
                    value={printerPrefs.kitchenPrinter}
                    onChange={(e) => setPrinterPrefsState((p) => ({ ...p, kitchenPrinter: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="">Same / Default Printer</option>
                    {qzPrinters.map((pr) => (
                      <option key={pr} value={pr}>{pr}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={printerPrefs.kitchenPrinter}
                    onChange={(e) => setPrinterPrefsState((p) => ({ ...p, kitchenPrinter: e.target.value }))}
                    placeholder="Kitchen printer name (optional)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenPrinterModal}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Reconnect QZ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrinterPrefs(printerPrefs);
                    printCashierSlips({
                      ticketNumber: 'TEST01',
                      customerName: 'Test Print',
                      cashier: pinStaffName,
                      paymentMethod: 'Cash',
                      paymentStatus: 'Paid',
                      totalAmount: 500,
                      items: [{ name: 'Printer Test Item', quantity: 1, price: 500 }],
                    }, printerPrefs.frontDeskPrinter || '');
                  }}
                  className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-xs font-bold text-slate-900 hover:bg-amber-100 cursor-pointer"
                >
                  Test Print
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPrinterPrefs(printerPrefs);
                  setPrinterModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black cursor-pointer"
              >
                Save Printers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Staff PIN Lock Overlay */}
      {pinLocked && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleUnlockPin}
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-7 text-center space-y-5 shadow-2xl"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 text-amber-400 flex items-center justify-center mx-auto">
              <Lock size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">Terminal Locked</h3>
              <p className="text-xs text-slate-400 mt-1">
                {profileName || restaurantName} · Enter your 4-digit staff PIN to unlock
              </p>
            </div>
            {lockError && (
              <p className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl py-2 px-3">
                {lockError}
              </p>
            )}
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={lockPinInput}
              onChange={(e) => setLockPinInput(e.target.value)}
              placeholder="••••"
              className="w-full text-center tracking-[0.6em] font-mono text-2xl bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-2xl py-3.5 text-white focus:outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', '⌫'].map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setLockError('');
                    if (key === 'Clear') setLockPinInput('');
                    else if (key === '⌫') setLockPinInput((p) => p.slice(0, -1));
                    else if (lockPinInput.length < 6) setLockPinInput((p) => p + key);
                  }}
                  className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm cursor-pointer"
                >
                  {key}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={lockBusy}
              className="w-full py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-400 text-black font-black text-sm cursor-pointer disabled:opacity-50"
            >
              {lockBusy ? 'Verifying...' : 'Unlock POS'}
            </button>
          </form>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR (< md) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0d0d0d] text-slate-200 border-t border-emerald-900 flex items-center justify-around px-1 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
      >
        {railNavItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = activeModule === item.id && !showWebPos;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectModule(item.id, item.tab)}
              className={`relative flex-1 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold cursor-pointer ${
                isActive ? 'text-white bg-amber-400/70' : 'text-amber-300/80'
              }`}
            >
              <Icon size={17} />
              <span className="truncate max-w-[68px]">{item.label}</span>
              {item.badge > 0 && (
                <span className="absolute top-0.5 right-3 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black flex items-center justify-center">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="flex-1 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold text-amber-300/80 cursor-pointer"
        >
          <Menu size={17} />
          <span>More</span>
        </button>
      </nav>

      {/* MOBILE SLIDE-OUT MODULE & SUB-NAV DRAWER (< md) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs" onClick={() => setMobileNavOpen(false)} />
          <div className="relative z-10 w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-[#0d0d0d] text-white px-4 py-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">ManiPOS Menu</p>
                <h2 className="text-sm font-black truncate">{profileName || restaurantName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg bg-slate-900/60 text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {branches.length > 0 && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    Active Branch
                  </label>
                  <select
                    value={activeBranchId}
                    onChange={(e) => setActiveBranchId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    <option value="all">All Branches ({branches.length})</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                  Workspace Modules
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {railNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeModule === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          selectModule(item.id, item.tab);
                          setMobileNavOpen(false);
                        }}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border text-left cursor-pointer ${
                          active
                            ? 'bg-amber-400 text-black border-amber-400'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <Icon size={15} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeModule === 'dashboard' && canDo(TAB_PERMISSION.analytics) && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                    Dashboard Reports
                  </p>
                  <div className="space-y-1">
                    {[
                      { id: 'overview', label: 'Executive Dashboard' },
                      { id: 'transactions', label: 'Transactions' },
                      { id: 'sales', label: 'Sales & Margins' },
                      { id: 'taxes', label: 'Tax & Charges' },
                      { id: 'eod', label: 'End of Day (6am–6am)' },
                      { id: 'promotions', label: 'Discounts & Loyalty' },
                      { id: 'devices', label: 'POS Devices & Audit' },
                    ].map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setReportSubTab(r.id);
                          selectModule('dashboard', 'reports');
                          setMobileNavOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold ${
                          activeTab === 'reports' && reportSubTab === r.id
                            ? 'bg-amber-50 text-slate-900 border border-amber-200'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeModule === 'settings' && canDo(TAB_PERMISSION.settings) && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 px-1">
                    Store &amp; Staff Settings
                  </p>
                  <div className="space-y-1">
                    {[
                      { id: 'settings', label: 'Store Settings & SEO' },
                      { id: 'order-settings', label: 'Order Methods & Void' },
                      { id: 'payment-settings', label: 'Payment & Charges' },
                      { id: 'delivery-areas', label: 'Delivery Areas (Zones)' },
                      { id: 'table-management', label: 'Table Management & QR' },
                      { id: 'locations', label: 'Locations & Branches' },
                      ...(canDo(TAB_PERMISSION.staff) ? [
                        { id: 'staff', label: 'Staff PINs & Access' },
                        { id: 'team-roles', label: 'Team Roles' },
                      ] : []),
                    ].map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          selectModule('settings', s.id);
                          setMobileNavOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold ${
                          activeTab === s.id
                            ? 'bg-amber-50 text-slate-900 border border-amber-200'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setCloseStoreOpen(true);
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer"
                >
                  {settings.store_closed ? 'Reopen Store' : 'Close Store'}
                </button>
              )}
              {onSignOut && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    onSignOut();
                  }}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 text-white text-xs font-black cursor-pointer"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ON-SCREEN RECEIPT PREVIEW / PRINT FALLBACK MODAL */}
      {receiptPreviewHtml && (
        <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">Receipt Print Preview</h3>
              <button
                type="button"
                onClick={() => setReceiptPreviewHtml('')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <iframe
              title="Receipt Preview"
              srcDoc={receiptPreviewHtml}
              className="w-full flex-1 min-h-[420px] border-0 bg-white"
            />
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReceiptPreviewHtml('')}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const frame = document.querySelector('iframe[title="Receipt Preview"]');
                  frame?.contentWindow?.focus?.();
                  frame?.contentWindow?.print?.();
                }}
                className="px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer size={14} /> Print Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
