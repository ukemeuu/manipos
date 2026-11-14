import { supabase, setTenantContext } from '../../lib/supabase';
import { isOnline } from './connectivityService';
import { getLocalCollection, insertLocalRecord } from './localStoreService';
import { roleDefaults } from '../../lib/permissions';

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
                const staffId = userMeta.staff_id || data.user.id;

                // Resolve the authoritative permission list (role defaults or a
                // per-user override) from the staff record.
                let permissions = [];
                try {
                    const { data: perms } = await supabase.rpc('effective_permissions', {
                        p_staff_id: staffId,
                    });
                    if (Array.isArray(perms) && perms.length) permissions = perms;
                } catch (_) {
                    // Fall through to the role defaults below.
                }
                if (!permissions.length) permissions = roleDefaults(appMeta.role || 'cashier');

                const staffUser = {
                    // Prefer the staff_access id so the RPCs can resolve the actor.
                    id: staffId,
                    authUid: data.user.id,
                    name: appMeta.name || userMeta.name || cleanEmail.split('@')[0] || 'Staff',
                    email: data.user.email || cleanEmail,
                    role: appMeta.role || 'cashier',
                    restaurantId: appMeta.tenant_id || null,
                    restaurantName: appMeta.tenant_name || '',
                    tenantSlug: appMeta.tenant_slug || '',
                    mustChangePassword: userMeta.must_change_password === true,
                    permissions,
                };
                setTenantContext(staffUser.restaurantId);
                localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
                await provisionOfflineStaffCredential(cleanEmail, staffUser, password);
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
                await provisionOfflineStaffCredential(cleanEmail, staffPayload, password);
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
    return await verifyOfflineStaffCredential(cleanEmail, password);
}

/**
 * Legacy/PIN compatibility wrapper
 */
export async function authenticateStaffPin(restaurantSlug, pinCode) {
    return authenticateStaffLogin(restaurantSlug, pinCode);
}

async function hashSecretWithSalt(secret, salt) {
    const input = `${salt}:${secret}`;
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
        const bytes = new TextEncoder().encode(input);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Lightweight fallback hash when SubtleCrypto is unavailable on insecure origins
    let h1 = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h1 ^= input.charCodeAt(i);
        h1 = Math.imul(h1, 0x01000193);
    }
    return `fnv1a_${(h1 >>> 0).toString(16)}`;
}

/**
 * Provision salted offline credential verifier on local machine upon successful online login.
 * Plaintext passwords/PINs are never stored in localStorage.
 */
async function provisionOfflineStaffCredential(tenantSlug, staffUser, pinCode) {
    try {
        const stored = JSON.parse(localStorage.getItem(OFFLINE_STAFF_KEY) || '{}');
        const saltBytes = new Uint8Array(16);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            crypto.getRandomValues(saltBytes);
        }
        const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('') || String(Date.now());
        const verifier = await hashSecretWithSalt(pinCode, salt);

        stored[tenantSlug] = {
            salt,
            verifier,
            staffUser,
            provisioned_at: new Date().toISOString()
        };

        localStorage.setItem(OFFLINE_STAFF_KEY, JSON.stringify(stored));
    } catch (e) {
        console.error('[StaffService] Error provisioning offline credential:', e);
    }
}

/**
 * Verify credentials locally ONLY against previously provisioned salted verifier
 */
async function verifyOfflineStaffCredential(tenantSlug, pinCode) {
    try {
        const stored = JSON.parse(localStorage.getItem(OFFLINE_STAFF_KEY) || '{}');
        const record = stored[tenantSlug];

        if (record && record.salt && record.verifier && record.staffUser) {
            const candidate = await hashSecretWithSalt(pinCode, record.salt);
            if (candidate === record.verifier) {
                console.log(`[StaffService] Authenticated staff offline: ${record.staffUser.name}`);
                return {
                    success: true,
                    staffUser: record.staffUser,
                    is_offline_login: true
                };
            }
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
