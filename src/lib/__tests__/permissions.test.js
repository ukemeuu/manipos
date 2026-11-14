import { describe, it, expect, beforeEach } from 'vitest';
import { roleDefaults, currentPermissions, can, PERMISSION_KEYS } from '../permissions';

describe('permissions & RBAC defaults', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('denies void_orders from cashier default role permissions', () => {
    const cashierPerms = roleDefaults('cashier');
    expect(cashierPerms).toContain('view_orders');
    expect(cashierPerms).not.toContain('void_orders');
    expect(cashierPerms).not.toContain('manage_staff');
  });

  it('grants full permission catalog to admin and restricts manage_staff for manager', () => {
    expect(roleDefaults('admin')).toEqual(PERMISSION_KEYS);
    const managerPerms = roleDefaults('manager');
    expect(managerPerms).not.toContain('manage_staff');
    expect(managerPerms).toContain('void_orders');
  });

  it('honors explicit per-user permissions override over role defaults', () => {
    const staff = { role: 'cashier', permissions: ['view_orders', 'void_orders'] };
    expect(can('void_orders', staff)).toBe(true);
    expect(can('manage_settings', staff)).toBe(false);
    expect(currentPermissions(staff)).toEqual(['view_orders', 'void_orders']);
  });
});
