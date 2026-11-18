/**
 * Centralized Interface B (Orda shell) routing & RBAC helper.
 * Legacy Interface A (PosTerminal.jsx) is abolished for restaurant operations:
 * all admins and floor/cashier staff operate inside the Orda shell with role-scoped modules.
 */

export function isAdminAccount(staffUser) {
  return String(staffUser?.role || '').toLowerCase().trim() === 'admin';
}

const DASHBOARD_TABS = new Set(['reports', 'analytics', 'fpa-expenses', 'onboarding']);
const CUSTOMER_TABS = new Set([
  'customers',
  'guest-crm',
  'customer-retention',
  'retention-crm',
  'store-credit',
  'promotions',
  'vouchers',
  'loyalty',
  'offers',
  'feedback',
]);
const MENU_TABS = new Set(['menu']);
const STOREFRONT_TABS = new Set(['storefront', 'microsite', 'storefront-editor']);
const WALLET_TABS = new Set(['wallet', 'subscriptions', 'paystack']);
const INVENTORY_TABS = new Set([
  'inventory',
  'receiving',
  'store-ops',
  'waste',
  'inv-receiving',
  'inv-requisitions',
  'inv-waste',
]);
const ACCOUNT_TABS = new Set(['account', 'staff-portal']);
const HR_TABS = new Set(['hr', 'hr-admin']);
const SETTINGS_TABS = new Set([
  'settings',
  'order-settings',
  'payment-settings',
  'delivery-areas',
  'table-management',
  'integrations',
  'omnichannel',
  'api-webhooks',
  'locations',
  'team-roles',
  'staff',
  'qr-vault',
  'poj-sync',
  'suppliers',
  'linkhub',
  'audit',
]);

export function resolveModuleForOrdaTab(tabParam = '') {
  const tab = String(tabParam || '').toLowerCase().trim();
  if (!tab || tab === 'orders' || tab === 'pos') return 'orders';
  if (DASHBOARD_TABS.has(tab)) return 'dashboard';
  if (CUSTOMER_TABS.has(tab)) return 'customers';
  if (MENU_TABS.has(tab)) return 'menu';
  if (STOREFRONT_TABS.has(tab)) return 'storefront';
  if (WALLET_TABS.has(tab)) return 'wallet';
  if (INVENTORY_TABS.has(tab)) return 'inventory';
  if (HR_TABS.has(tab)) return 'hr';
  if (ACCOUNT_TABS.has(tab)) return 'account';
  if (SETTINGS_TABS.has(tab)) return 'settings';
  return 'orders';
}

const MENU_ENABLED_STAFF_ROLES = new Set([
  'cashier',
  'waiter',
  'manager',
  'supervisor',
  'shift_supervisor',
  'lead_cashier',
  'front_desk',
  'chef',
]);

export function canAccessMenuModule({ staffUser, permissions = [] } = {}) {
  if (isAdminAccount(staffUser)) return true;
  if (Array.isArray(permissions) && permissions.includes('manage_menu')) return true;
  const role = String(staffUser?.role || '').toLowerCase().trim();
  return MENU_ENABLED_STAFF_ROLES.has(role);
}

export function resolveOrdaEntryState({ staffUser, requestedRoute = '', tabParam = '', permissions = [] }) {
  const isAdmin = isAdminAccount(staffUser);
  const route = String(requestedRoute || '').toLowerCase().trim();
  const tab = String(tabParam || '').toLowerCase().trim();

  // Floor & cashier roles (or explicit ?page=pos / ?page=terminal) enter
  // straight into the Orda Web POS order-taking register, while permitting
  // deep-link access to the operational Menu builder when ?tab=menu is open.
  if (!isAdmin) {
    if (tab === 'menu' && canAccessMenuModule({ staffUser, permissions })) {
      return {
        isAdmin: false,
        activeModule: 'menu',
        activeTab: 'menu',
        initialWebPos: false,
      };
    }
    return {
      isAdmin: false,
      activeModule: 'orders',
      activeTab: 'orders',
      initialWebPos: true,
    };
  }

  if ((route === 'terminal' || route === 'pos') && (!tab || tab === 'orders' || tab === 'pos')) {
    return { isAdmin: true, activeModule: 'orders', activeTab: 'orders', initialWebPos: true };
  }

  if (tab && tab !== 'orders' && tab !== 'pos') {
    const activeModule = resolveModuleForOrdaTab(tab);
    return { isAdmin: true, activeModule, activeTab: tab, initialWebPos: false };
  }

  if (route === 'onboarding') {
    return { isAdmin: true, activeModule: 'dashboard', activeTab: 'onboarding', initialWebPos: false };
  }

  return { isAdmin: true, activeModule: 'orders', activeTab: 'orders', initialWebPos: false };
}

export function getVisibleOrdaRailIds({ staffUser, permissions = [] }) {
  const isAdmin = isAdminAccount(staffUser);
  if (isAdmin) {
    return ['orders', 'dashboard', 'customers', 'menu', 'storefront', 'settings', 'wallet', 'inventory', 'hr', 'account'];
  }

  const has = (perm) => Array.isArray(permissions) && permissions.includes(perm);
  const ids = ['orders'];
  if (has('view_analytics')) ids.push('dashboard');
  if (has('manage_offers') || has('manage_feedback') || has('manage_guests')) ids.push('customers');
  if (canAccessMenuModule({ staffUser, permissions })) ids.push('menu');
  if (has('manage_settings')) ids.push('storefront');
  if (has('manage_settings') || has('manage_staff')) ids.push('settings');
  if (has('manage_inventory')) ids.push('inventory');
  if (has('manage_staff')) ids.push('hr');
  return ids;
}
