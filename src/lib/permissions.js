import { supabase } from './supabase';

/**
 * Granular permissions.
 *
 * The catalogue mirrors `public.permissions`, seeded in
 * supabase/migrations/20261109_role_permissions.sql. The role defaults live in
 * the database (`public.role_permissions`) so the platform owner can edit them;
 * a user with an explicit `staff_access.permissions` list always uses that
 * instead.
 */

export const PERMISSIONS = [
  { key: 'view_dashboard', label: 'View management dashboard', group: 'Access' },
  { key: 'view_analytics', label: 'View sales dashboard & analytics', group: 'Insights' },
  { key: 'view_previous_days', label: 'View sales dashboard & orders from previous days', group: 'Insights' },
  { key: 'export_reports', label: 'Export sales CSV & PDF reports', group: 'Insights' },
  { key: 'manage_expenses', label: 'Record expenses & upload supplier receipts', group: 'Insights' },
  { key: 'view_orders', label: 'View order history', group: 'Sales' },
  { key: 'view_my_dashboard', label: 'View personal shift & orders breakdown dashboard', group: 'Sales' },
  { key: 'upload_receipts', label: 'Upload payment receipts & proof of payment', group: 'Sales' },
  { key: 'reprint_receipts', label: 'Reprint customer receipts & KOT tickets', group: 'Sales' },
  { key: 'void_orders', label: 'Request order return / void', group: 'Sales' },
  { key: 'approve_returns', label: 'Approve / reject returned & voided orders', group: 'Sales' },
  { key: 'close_shift', label: 'Open & close cashier shifts / Z-reports', group: 'Sales' },
  { key: 'manage_discounts', label: 'Manage discounts', group: 'Sales' },
  { key: 'manage_offers', label: 'Manage offers & promotions', group: 'Sales' },
  { key: 'manage_menu', label: 'Edit menu & categories', group: 'Catalogue' },
  { key: 'manage_inventory', label: 'Access & manage inventory & recipes', group: 'Catalogue' },
  { key: 'manage_suppliers', label: 'Manage suppliers', group: 'Catalogue' },
  { key: 'manage_guests', label: 'Manage guest CRM & loyalty', group: 'Customers' },
  { key: 'manage_feedback', label: 'Manage customer feedback', group: 'Customers' },
  { key: 'manage_staff', label: 'Manage staff & permissions', group: 'Administration' },
  { key: 'manage_settings', label: 'Edit store settings', group: 'Administration' },
  { key: 'manage_floor', label: 'Manage floor plan & reservations', group: 'Administration' },
  { key: 'view_audit', label: 'View audit log', group: 'Administration' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

export const PERMISSION_GROUPS = PERMISSIONS.reduce((acc, p) => {
  (acc[p.group] ||= []).push(p);
  return acc;
}, {});

/**
 * Role defaults, matching the seeded `role_permissions`. Used only when a
 * session has no explicit list (legacy sessions created before this feature);
 * the server always resolves the authoritative list.
 */
export function roleDefaults(role) {
  switch (role) {
    case 'admin':
      return PERMISSION_KEYS;
    case 'manager':
      return PERMISSION_KEYS.filter((k) => k !== 'manage_staff' && k !== 'view_previous_days');
    case 'cashier':
      return ['view_orders', 'manage_menu', 'view_my_dashboard', 'reprint_receipts', 'close_shift'];
    case 'waiter':
      return ['view_orders', 'manage_menu', 'view_my_dashboard', 'reprint_receipts'];
    case 'accountant':
      return ['view_analytics', 'view_orders', 'export_reports', 'manage_expenses'];
    case 'stock_controller':
    case 'store_clerk':
    case 'issuer':
    case 'receiver':
      return ['manage_inventory', 'manage_suppliers'];
    case 'chef':
      return ['manage_inventory'];
    case 'expense_clerk':
      return ['manage_expenses', 'upload_receipts'];
    case 'staff':
    case 'kds':
      return [];
    default:
      return [];
  }
}

/**
 * The signed-in staff member's effective permissions.
 *
 * Reads the cached session by default (no round trip). Pass a staffUser to
 * evaluate an arbitrary user.
 */
export function currentPermissions(staffUser = null) {
  let user = staffUser;
  if (!user) {
    try {
      user = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
    } catch (_) {
      user = {};
    }
  }
  if (Array.isArray(user?.permissions) && user.permissions.length) {
    return user.permissions;
  }
  return roleDefaults(user?.role);
}

/** True when the signed-in user has the given permission. */
export function can(permission, staffUser = null) {
  return currentPermissions(staffUser).includes(permission);
}

/**
 * Fetch the role -> permission matrix from the database so the permissions
 * screen can show what each role grants by default.
 */
export async function loadRolePermissions() {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('role, permission_key');
    if (error || !data) return {};
    return data.reduce((acc, row) => {
      (acc[row.role] ||= []).push(row.permission_key);
      return acc;
    }, {});
  } catch (_) {
    return {};
  }
}
