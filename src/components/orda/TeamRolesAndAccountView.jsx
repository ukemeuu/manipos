import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, Users, Plus, KeyRound, Lock, LogOut, CheckCircle2,
  Trash2, Edit3, RefreshCw, Power, Building2, FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SlideOverDrawer } from './SlideOverDrawer';

export const ORDA_8_MODULES = [
  { id: 'orders', label: 'Orders & Live Dispatch' },
  { id: 'dashboard', label: 'Dashboard & Reports' },
  { id: 'customers', label: 'Customers, CRM & Loyalty' },
  { id: 'menu', label: 'Menu & Catalog' },
  { id: 'settings', label: 'Settings & Integrations' },
  { id: 'wallet', label: 'Wallet & Subscriptions' },
  { id: 'inventory', label: 'Inventory ERP' },
  { id: 'account', label: 'Account & Support PIN' },
];

export const ORDA_24_POS_PERMISSIONS = [
  'Accept & Decline Incoming Orders',
  'Create New POS Orders',
  'Save & Reopen Pending Open Tabs',
  'Settle & Close Open Orders',
  'Void Open Orders',
  'Void Completed Orders (Within Policy Window)',
  'Apply Manual Cart Discounts',
  'Apply Promotion & Coupon Codes',
  'Redeem Stored-Value Vouchers',
  'Settle Using Customer Store Credit',
  'Accept Split Payments Across Tenders',
  'Print & Reprint Customer Receipts',
  'Open Cash Register Drawer',
  'View Register Shift Totals',
  'Process Payment Reversals / Refunds',
  'Edit Order Kitchen Instructions',
  'Assign & Transfer Floor Tables',
  'Switch Sales Channels (Call Center / WhatsApp / Glovo)',
  'Override Calculated Delivery Fees',
  'Mark Orders Ready / Shipped / Completed',
  'Configure Thermal Printer & QZ Tray',
  'Manage Offline Order Queue Sync',
  'Access 6am-6am End of Day (EOD) Summary',
  'View Cashier Performance Leaderboard',
];

export function TeamRolesAndAccountView({
  mode = 'team-roles', // 'team-roles' | 'account'
  restaurantId,
  restaurantName = 'ManiPOS Store',
  staffList = [],
  branches = [],
  settings = {},
  onOpenCloseStore,
  onStaffUpdated,
}) {
  const [subTab, setSubTab] = useState(mode);
  useEffect(() => {
    setSubTab(mode);
  }, [mode]);

  const [roles, setRoles] = useState([]);
  const [roleDrawer, setRoleDrawer] = useState(null);
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    module_permissions: Object.fromEntries(ORDA_8_MODULES.map((m) => [m.id, true])),
    pos_permissions: [...ORDA_24_POS_PERMISSIONS.slice(0, 12)],
  });

  // Password & Support PIN states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [supportPins, setSupportPins] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadRoles = async () => {
    if (!restaurantId) return;
    try {
      const { data, error } = await supabase
        .from('team_roles')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: true });
      if (!error) setRoles(data || []);
    } catch (err) {
      console.warn('Team roles load note:', err);
    }
  };

  useEffect(() => {
    loadRoles();
  }, [restaurantId]);

  const openRoleDrawer = (existing = null) => {
    if (existing) {
      setRoleDrawer(existing);
      setRoleForm({
        name: existing.name || '',
        description: existing.description || '',
        module_permissions: existing.module_permissions || Object.fromEntries(ORDA_8_MODULES.map((m) => [m.id, false])),
        pos_permissions: Array.isArray(existing.pos_permissions) ? existing.pos_permissions : [],
      });
    } else {
      setRoleDrawer('new');
      setRoleForm({
        name: '',
        description: '',
        module_permissions: Object.fromEntries(ORDA_8_MODULES.map((m) => [m.id, m.id === 'orders'])),
        pos_permissions: ORDA_24_POS_PERMISSIONS.slice(0, 8),
      });
    }
  };

  const handleSaveRole = async (e) => {
    e.preventDefault();
    if (!restaurantId || !roleForm.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        name: roleForm.name.trim(),
        description: roleForm.description.trim() || null,
        module_permissions: roleForm.module_permissions,
        pos_permissions: roleForm.pos_permissions,
      };
      let res;
      if (roleDrawer && roleDrawer !== 'new' && roleDrawer.id) {
        res = await supabase.from('team_roles').update(payload).eq('id', roleDrawer.id);
      } else {
        res = await supabase.from('team_roles').insert([payload]);
      }
      if (res.error) throw res.error;
      setRoleDrawer(null);
      setNotice('Custom Role & 24-Permission POS Matrix saved.');
      await loadRoles();
    } catch (err) {
      alert('Role save note (apply Wave 5 migration if table missing): ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const assignStaffRoleAndBranches = async (staffId, teamRoleId, branchId) => {
    try {
      const target = staffList.find((s) => s.id === staffId);
      const currentBranches = Array.isArray(target?.branch_ids) ? target.branch_ids : [];
      const nextBranches = branchId
        ? currentBranches.includes(branchId)
          ? currentBranches.filter((b) => b !== branchId)
          : [...currentBranches, branchId]
        : currentBranches;

      const patch = {};
      if (teamRoleId !== undefined) patch.team_role_id = teamRoleId || null;
      if (branchId) patch.branch_ids = nextBranches;

      const { error } = await supabase.from('staff_access').update(patch).eq('id', staffId);
      if (error) throw error;
      setNotice('Updated staff role & branch permissions.');
      await onStaffUpdated?.();
    } catch (err) {
      alert('Staff update note: ' + (err.message || err));
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      alert('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Account password updated.');
    } catch (err) {
      alert('Password update note: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOutOthers = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      setNotice('Signed out all other active devices cleanly.');
    } catch (err) {
      alert('Session revoke note: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  const generateSupportPin = async (branchId) => {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    setSupportPins((p) => ({ ...p, [branchId || 'hq']: { pin, expiresAt } }));
    try {
      if (branchId) {
        await supabase
          .from('branches')
          .update({ support_verification_pin: pin, support_pin_expires_at: expiresAt })
          .eq('id', branchId);
      }
      setNotice(`Generated 24-hour Support Verification PIN: ${pin}`);
    } catch (_) {}
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">Team Roles (RBAC) & Account Security</h2>
            <div className="inline-flex bg-slate-100 rounded-xl p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSubTab('team-roles')}
                className={`px-3 py-1 rounded-lg ${subTab === 'team-roles' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Team & 24-Permission Roles
              </button>
              <button
                type="button"
                onClick={() => setSubTab('account')}
                className={`px-3 py-1 rounded-lg ${subTab === 'account' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Account, Password & Support PIN
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            8-module admin RBAC, 24 granular POS register permissions, branch scoping, and 24-hour Support PIN generator.
          </p>
        </div>

        {subTab === 'team-roles' && (
          <button
            type="button"
            onClick={() => openRoleDrawer(null)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-black"
          >
            <Plus size={14} /> Create Custom Role
          </button>
        )}
      </div>

      {notice && (
        <div className="bg-amber-50 border border-amber-200 text-slate-900 rounded-xl px-4 py-2.5 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2"><CheckCircle2 size={15} /> {notice}</span>
          <button type="button" onClick={() => setNotice('')} className="hover:underline">Dismiss</button>
        </div>
      )}

      {/* TAB 1: TEAM ROLES & STAFF BRANCH ASSIGNMENT */}
      {subTab === 'team-roles' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 font-black text-sm text-slate-900">
              Custom Roles (8 Modules & 24 Granular POS Permissions)
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Role Name</th>
                  <th className="py-3 px-4">Enabled Admin Modules</th>
                  <th className="py-3 px-4 text-right">POS Permissions</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {roles.map((r) => {
                  const modCount = Object.values(r.module_permissions || {}).filter(Boolean).length;
                  const posCount = Array.isArray(r.pos_permissions) ? r.pos_permissions.length : 0;
                  return (
                    <tr key={r.id}>
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{r.name}</p>
                        {r.description && <p className="text-[11px] text-slate-400">{r.description}</p>}
                      </td>
                      <td className="py-3 px-4">{modCount} / 8 Modules</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">{posCount} / 24 POS</td>
                      <td className="py-3 px-4 text-right">
                        <button type="button" onClick={() => openRoleDrawer(r)} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
                          <Edit3 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {roles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      No custom team roles created yet. Click <strong>Create Custom Role</strong> to define granular 24-permission POS matrices.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 font-black text-sm text-slate-900">
              Staff Role & Multi-Location Assignments
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">System Role</th>
                  <th className="py-3 px-4">Custom RBAC Role</th>
                  <th className="py-3 px-4">Allowed Store Locations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((st) => {
                  const allowed = Array.isArray(st.branch_ids) ? st.branch_ids : [];
                  return (
                    <tr key={st.id}>
                      <td className="py-3 px-4 font-bold text-slate-900">{st.name}</td>
                      <td className="py-3 px-4 uppercase text-slate-500">{st.role}</td>
                      <td className="py-3 px-4">
                        <select
                          value={st.team_role_id || ''}
                          onChange={(e) => assignStaffRoleAndBranches(st.id, e.target.value, null)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold"
                        >
                          <option value="">Default ({st.role})</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {branches.map((b) => {
                            const has = allowed.includes(b.id);
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => assignStaffRoleAndBranches(st.id, undefined, b.id)}
                                className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                                  has ? 'bg-amber-50 border-amber-400 text-slate-900' : 'bg-white border-slate-200 text-slate-500'
                                }`}
                              >
                                {b.name}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ACCOUNT DETAILS, PASSWORD, SIGN OUT OTHER DEVICES, SUPPORT PIN */}
      {subTab === 'account' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
          <form onSubmit={handleChangePassword} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><Lock size={15} className="text-amber-700" /> Account Security & Password</h3>
              <p className="text-slate-500 mt-0.5">Update merchant owner credentials or revoke remote device sessions.</p>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">New Password (min 8 chars)</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-amber-400 text-black font-black">
                Update Password
              </button>
              <button type="button" onClick={handleSignOutOthers} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-bold">
                <LogOut size={13} /> Sign Out All Other Devices
              </button>
            </div>
          </form>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2"><KeyRound size={15} className="text-amber-700" /> Support Verification PIN & Store Controls</h3>
              <p className="text-slate-500 mt-0.5">Generate temporary 6-digit Support Verification PINs for technician troubleshooting.</p>
            </div>

            <div className="space-y-2">
              {(branches.length > 0 ? branches : [{ id: '', name: `${restaurantName} HQ` }]).map((b) => {
                const activePin = supportPins[b.id || 'hq'] || (b.support_verification_pin ? { pin: b.support_verification_pin, expiresAt: b.support_pin_expires_at } : null);
                return (
                  <div key={b.id || 'hq'} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900">{b.name}</p>
                      <p className="font-mono text-amber-700 font-bold">
                        {activePin ? `PIN: ${activePin.pin}` : 'No active support PIN'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => generateSupportPin(b.id)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold"
                    >
                      Generate PIN
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="text-slate-500">
                <a href="/privacy" target="_blank" rel="noreferrer" className="underline mr-3">SLA & Privacy Policy</a>
                <a href="/terms" target="_blank" rel="noreferrer" className="underline">Device Terms</a>
              </div>
              {onOpenCloseStore && (
                <button
                  type="button"
                  onClick={onOpenCloseStore}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black"
                >
                  <Power size={13} /> {settings.store_closed ? 'Reopen Storefront' : 'Close Store (End of Day)'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ROLE CREATE / EDIT DRAWER */}
      <SlideOverDrawer
        open={Boolean(roleDrawer)}
        onClose={() => setRoleDrawer(null)}
        title={roleDrawer === 'new' ? 'Create Custom Role' : 'Edit Role Permissions'}
        subtitle="8 Admin Modules + 24 Granular POS Terminal Permissions"
      >
        <form onSubmit={handleSaveRole} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-600 mb-1">Role Name *</label>
            <input type="text" required value={roleForm.name} onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Shift Supervisor" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
          </div>
          <div>
            <label className="block font-bold text-slate-600 mb-1">Description</label>
            <input type="text" value={roleForm.description} onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2" />
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="font-black text-slate-900">8 Backoffice Modules</p>
            <div className="grid grid-cols-1 gap-1.5">
              {ORDA_8_MODULES.map((m) => (
                <label key={m.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(roleForm.module_permissions[m.id])}
                    onChange={(e) =>
                      setRoleForm((p) => ({
                        ...p,
                        module_permissions: { ...p.module_permissions, [m.id]: e.target.checked },
                      }))
                    }
                  />
                  <span className="font-bold text-slate-800">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex justify-between items-center">
              <p className="font-black text-slate-900">24 Granular POS Register Permissions</p>
              <button
                type="button"
                onClick={() =>
                  setRoleForm((p) => ({
                    ...p,
                    pos_permissions: p.pos_permissions.length === 24 ? [] : [...ORDA_24_POS_PERMISSIONS],
                  }))
                }
                className="text-amber-700 font-bold hover:underline"
              >
                Toggle All (24)
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {ORDA_24_POS_PERMISSIONS.map((perm) => {
                const checked = roleForm.pos_permissions.includes(perm);
                return (
                  <label key={perm} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setRoleForm((p) => ({
                          ...p,
                          pos_permissions: checked
                            ? p.pos_permissions.filter((x) => x !== perm)
                            : [...p.pos_permissions, perm],
                        }))
                      }
                    />
                    <span className="text-slate-700">{perm}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button type="submit" disabled={saving} className="w-full py-2.5 rounded-xl bg-amber-400 text-black font-black">
            {saving ? 'Saving...' : 'Save Custom Role'}
          </button>
        </form>
      </SlideOverDrawer>
    </div>
  );
}
