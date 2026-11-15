/**
 * Centralized Interface B (Orda shell) routing & RBAC helper.
 * Legacy Interface A (PosTerminal.jsx) is abolished for restaurant operations:
 * all admins and floor/cashier staff operate inside the Orda shell with role-scoped modules.
 */

export function isAdminAccount(staffUser) {
  return String(staffUser?.role || '').toLowerCase().trim() === 'admin';
}

export function resolveOrdaEntryState({ staffUser, requestedRoute = '', tabParam = '' }) {
  const isAdmin = isAdminAccount(staffUser);
  const route = String(requestedRoute || '').toLowerCase().trim();
  const tab = String(tabParam || '').toLowerCase().trim();

  // Floor & cashier roles (or explicit ?page=pos / ?page=terminal) enter
  // straight into the Orda Web POS order-taking register.
  if (!isAdmin) {
    return {
      isAdmin: false,
      activeModule: 'orders',
      activeTab: 'orders',
      initialWebPos: true,
    };
  }

  if (tab === 'guest-crm' || tab === 'customer-retention' || tab === 'retention-crm' || tab === 'customers') {
    return { isAdmin: true, activeModule: 'customers', activeTab: tab, initialWebPos: false };
  }
  if (tab === 'hr-admin' || tab === 'qr-vault' || tab === 'poj-sync') {
    return { isAdmin: true, activeModule: 'settings', activeTab: tab, initialWebPos: false };
  }
  if (tab === 'staff-portal') {
    return { isAdmin: true, activeModule: 'account', activeTab: tab, initialWebPos: false };
  }
  if (tab === 'fpa-expenses') {
    return { isAdmin: true, activeModule: 'dashboard', activeTab: tab, initialWebPos: false };
  }
  if (['receiving', 'store-ops', 'waste', 'inv-receiving', 'inv-requisitions', 'inv-waste'].includes(tab)) {
    return { isAdmin: true, activeModule: 'inventory', activeTab: tab, initialWebPos: false };
  }
  if (tab) {
    return { isAdmin: true, activeModule: 'orders', activeTab: tab, initialWebPos: false };
  }

  if (route === 'terminal' || route === 'pos') {
    return { isAdmin: true, activeModule: 'orders', activeTab: 'orders', initialWebPos: true };
  }

  if (route === 'onboarding') {
    return { isAdmin: true, activeModule: 'dashboard', activeTab: 'onboarding', initialWebPos: false };
  }

  return { isAdmin: true, activeModule: 'orders', activeTab: 'orders', initialWebPos: false };
}

export function getVisibleOrdaRailIds({ staffUser, permissions = [] }) {
  const isAdmin = isAdminAccount(staffUser);
  if (isAdmin) {
    return ['orders', 'dashboard', 'customers', 'menu', 'settings', 'wallet', 'inventory', 'account'];
  }

  const has = (perm) => Array.isArray(permissions) && permissions.includes(perm);
  const ids = ['orders'];
  if (has('view_analytics')) ids.push('dashboard');
  if (has('manage_offers') || has('manage_feedback') || has('manage_guests')) ids.push('customers');
  if (has('manage_menu')) ids.push('menu');
  if (has('manage_settings') || has('manage_staff')) ids.push('settings');
  if (has('manage_inventory')) ids.push('inventory');
  return ids;
}
