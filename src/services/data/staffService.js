import { supabase, setTenantContext } from '../../lib/supabase';
import { isOnline } from './connectivityService';
import { getLocalCollection, insertLocalRecord } from './localStoreService';

const OFFLINE_STAFF_KEY = 'manipos_offline_staff_credentials';

/**
 * Staff Email & Password Authentication.
 *
 * Order of attempts:
 *   1. Supabase Auth (email + password) — issues a signed JWT that carries the
 *      tenant claim (`app_metadata.tenant_id`). This is the production path.
 *   2. Legacy PIN RPC (`verify_staff_login`) — kept for staff who have not been
 *      migrated to Supabase Auth yet.
 *   3. Offline fallback against strictly provisioned credentials.
 */
export async function authenticateStaffLogin(email, password) {
    const cleanEmail = (email || '').toLowerCase().trim();

    // 1. Preferred: Supabase Auth.
    if (isOnline()) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password,
            });

            if (!error && data?.session) {
                const appMeta = data.user?.app_metadata || {};
                const userMeta = data.user?.user_metadata || {};
                const staffUser = {
                    id: data.user.id,
                    name: appMeta.name || userMeta.name || cleanEmail.split('@')[0] || 'Staff',
                    email: data.user.email || cleanEmail,
                    role: appMeta.role || 'cashier',
                    restaurantId: appMeta.tenant_id || null,
                    restaurantName: appMeta.tenant_name || '',
                    tenantSlug: appMeta.tenant_slug || '',
                    mustChangePassword: userMeta.must_change_password === true,
                };
                setTenantContext(staffUser.restaurantId);
                localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
                provisionOfflineStaffCredential(cleanEmail, staffUser, password);
                return { success: true, staffUser, session: data.session, auth: 'supabase' };
            }

            // Auth user not found / password mismatch — try the legacy RPC below.
            console.info('[StaffService] Supabase Auth unavailable for this account, trying legacy PIN.');
        } catch (err) {
            console.warn('[StaffService] Supabase Auth notice:', err);
        }
    }

    // 2. Legacy PIN RPC.
    if (isOnline()) {
        try {
            const { data: rpcRes, error: rpcError } = await supabase.rpc('verify_staff_login', {
                p_email: cleanEmail,
                p_password: password,
            });

            if (!rpcError && rpcRes && rpcRes.success) {
                const staffPayload = rpcRes.staff_user;
                setTenantContext(staffPayload.restaurantId || null);
                provisionOfflineStaffCredential(cleanEmail, staffPayload, password);
                return { success: true, staffUser: staffPayload, auth: 'legacy' };
            }

            if (!rpcError && rpcRes && !rpcRes.success) {
                return { success: false, error: rpcRes.error || 'Unable to sign in. Please check your credentials or account approval status.' };
            }

            return { success: false, error: 'Unable to sign in. Please check your credentials or account approval status.' };
        } catch (err) {
            console.warn('[StaffService] RPC authentication notice:', err);
        }
    }

    // 3. Offline fallback.
    return verifyOfflineStaffCredential(cleanEmail, password);
}

/**
 * Legacy/PIN compatibility wrapper
 */
export async function authenticateStaffPin(restaurantSlug, pinCode) {
    return authenticateStaffLogin(restaurantSlug, pinCode);
}

/**
 * Provision offline credential on local machine upon successful online login
 */
function provisionOfflineStaffCredential(tenantSlug, staffUser, pinCode) {
    try {
        const stored = JSON.parse(localStorage.getItem(OFFLINE_STAFF_KEY) || '{}');
        if (!stored[tenantSlug]) stored[tenantSlug] = {};

        stored[tenantSlug][pinCode] = {
            ...staffUser,
            provisioned_at: new Date().toISOString()
        };

        localStorage.setItem(OFFLINE_STAFF_KEY, JSON.stringify(stored));
    } catch (e) {
        console.error('[StaffService] Error provisioning offline credential:', e);
    }
}

/**
 * Verify credentials locally ONLY if previously provisioned online for an approved tenant
 */
function verifyOfflineStaffCredential(tenantSlug, pinCode) {
    try {
        const stored = JSON.parse(localStorage.getItem(OFFLINE_STAFF_KEY) || '{}');
        const tenantStaff = stored[tenantSlug];

        if (tenantStaff && tenantStaff[pinCode]) {
            console.log(`[StaffService] Authenticated staff offline: ${tenantStaff[pinCode].name}`);
            return {
                success: true,
                staffUser: tenantStaff[pinCode],
                is_offline_login: true
            };
        }

        return {
            success: false,
            error: 'Unable to sign in. Please check your credentials or account approval status.'
        };
    } catch (e) {
        return {
            success: false,
            error: 'Unable to sign in. Please check your credentials or account approval status.'
        };
    }
}
