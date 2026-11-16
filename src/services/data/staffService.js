import { supabase, setTenantContext } from '../../lib/supabase';
import { getActiveTenantSlug } from '../../lib/tenantConfig';
import { isOnline } from './connectivityService';
import { getLocalCollection, insertLocalRecord } from './localStoreService';
import { roleDefaults } from '../../lib/permissions';
import { POJ_DEFAULT_URL, POJ_ANON_KEY, normalizePojRole, savePojSession, tryAcquirePojSession } from './pojSyncService';

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
async function buildStaffSessionFromAuth(data, cleanEmail, password) {
    const appMeta = data.user?.app_metadata || {};
    const userMeta = data.user?.user_metadata || {};
    let staffId = userMeta.staff_id || data.user.id;
    let resolvedRole = appMeta.role || userMeta.role || null;
    let resolvedName = appMeta.name || userMeta.name || userMeta.full_name || null;
    let resolvedTenantId = appMeta.tenant_id || null;
    let resolvedTenantName = appMeta.tenant_name || '';
    let resolvedTenantSlug = appMeta.tenant_slug || '';

    // Resolve tenant & role from SECURITY DEFINER RPC (safe when staff_access RLS is strict)
    // and subdomain fallback if JWT app_metadata is absent.
    if (!resolvedTenantId || !resolvedRole) {
        try {
            const { data: myProfile } = await supabase.rpc('get_my_staff_profile');
            if (myProfile) {
                staffId = myProfile.id || staffId;
                resolvedRole = resolvedRole || myProfile.role;
                resolvedName = resolvedName || myProfile.name;
                resolvedTenantId = resolvedTenantId || myProfile.restaurant_id;
                resolvedTenantName = resolvedTenantName || myProfile.restaurant_name || '';
                resolvedTenantSlug = resolvedTenantSlug || myProfile.restaurant_slug || '';
            }
        } catch (_) { }
    }

    if (!resolvedTenantId) {
        try {
            const hostSlug = getActiveTenantSlug();
            if (hostSlug) {
                const { data: restRow } = await supabase
                    .from('restaurants')
                    .select('id, name, slug')
                    .eq('slug', hostSlug)
                    .limit(1)
                    .maybeSingle();
                if (restRow?.id) {
                    resolvedTenantId = restRow.id;
                    resolvedTenantName = resolvedTenantName || restRow.name || '';
                    resolvedTenantSlug = resolvedTenantSlug || restRow.slug || hostSlug;
                }
            }
        } catch (_) { }
    }

    let permissions = [];
    try {
        const { data: perms } = await supabase.rpc('effective_permissions', {
            p_staff_id: staffId,
        });
        if (Array.isArray(perms) && perms.length) permissions = perms;
    } catch (_) { }
    const finalRole = resolvedRole || 'staff';
    if (!permissions.length) permissions = roleDefaults(finalRole);

    const staffUser = {
        id: staffId,
        authUid: data.user.id,
        name: resolvedName || cleanEmail.split('@')[0] || 'Staff',
        email: data.user.email || cleanEmail,
        role: finalRole,
        restaurantId: resolvedTenantId || null,
        restaurantName: resolvedTenantName || '',
        tenantSlug: resolvedTenantSlug || '',
        mustChangePassword: userMeta.must_change_password === true,
        permissions,
    };
    setTenantContext(staffUser.restaurantId);
    localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
    await provisionOfflineStaffCredential(cleanEmail, staffUser, password);
    return { success: true, staffUser, session: data.session, auth: 'supabase' };
}

async function authenticateWithPojFallback(cleanEmail, password, preferredSlug = '') {
    try {
        const res = await fetch(`${POJ_DEFAULT_URL}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
                apikey: POJ_ANON_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: cleanEmail, password }),
        });

        if (!res.ok) return null;
        const pojAuthData = await res.json();
        if (!pojAuthData?.access_token || !pojAuthData?.user) return null;

        savePojSession(pojAuthData);
        const pojUser = pojAuthData.user;
        const pojToken = pojAuthData.access_token;

        let pojProfile = {};
        try {
            const profRes = await fetch(
                `${POJ_DEFAULT_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(pojUser.id)}&select=*&limit=1`,
                {
                    headers: {
                        apikey: POJ_ANON_KEY,
                        Authorization: `Bearer ${pojToken}`,
                    },
                }
            );
            if (profRes.ok) {
                const rows = await profRes.json();
                if (Array.isArray(rows) && rows[0]) pojProfile = rows[0];
            }
        } catch (_) { }

        if (pojProfile.is_active === false || pojProfile.deleted_at) {
            return { success: false, error: 'This staff account is inactive in the linked store.' };
        }

        const slugCandidates = [
            String(preferredSlug || getActiveTenantSlug() || '').toLowerCase().trim(),
            'potofjollof',
        ].filter(Boolean);

        let restaurant = null;
        for (const candidate of [...new Set(slugCandidates)]) {
            const { data: restRow } = await supabase
                .from('restaurants')
                .select('id, name, slug, status, is_active')
                .eq('slug', candidate)
                .limit(1)
                .maybeSingle();
            if (restRow?.id) {
                restaurant = restRow;
                break;
            }
        }

        if (!restaurant) {
            return { success: false, error: 'Restaurant store not found in ManiPOS.' };
        }

        if (restaurant.is_active === false || ['suspended', 'rejected'].includes(restaurant.status)) {
            return { success: false, error: 'Store access is suspended.' };
        }

        try {
            const { data: linkRow } = await supabase
                .from('restaurant_poj_links')
                .select('link_auth_enabled')
                .eq('restaurant_id', restaurant.id)
                .limit(1)
                .maybeSingle();
            if (linkRow && linkRow.link_auth_enabled === false) {
                return { success: false, error: 'Linked store auth bridge is disabled for this restaurant.' };
            }
        } catch (_) { }

        const fullName = String(
            pojProfile.full_name ||
            pojUser.user_metadata?.full_name ||
            pojUser.user_metadata?.name ||
            cleanEmail.split('@')[0] ||
            'Staff'
        );
        const finalRole = normalizePojRole(
            pojProfile.role || pojUser.user_metadata?.role || 'staff',
            pojProfile.job_title || ''
        );

        const staffUser = {
            id: pojUser.id,
            authUid: pojUser.id,
            name: fullName,
            email: cleanEmail,
            role: finalRole,
            restaurantId: restaurant.id,
            restaurantName: restaurant.name || '',
            tenantSlug: restaurant.slug || 'potofjollof',
            mustChangePassword: false,
            permissions: roleDefaults(finalRole),
            authSource: 'poj_direct',
        };

        setTenantContext(staffUser.restaurantId);
        localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
        await provisionOfflineStaffCredential(cleanEmail, staffUser, password);
        return { success: true, staffUser, auth: 'poj_direct' };
    } catch (err) {
        console.warn('[StaffService] POJ direct auth fallback notice:', err?.message || err);
        return null;
    }
}

export async function authenticateStaffLogin(email, password, preferredSlug = '') {
    const cleanEmail = (email || '').toLowerCase().trim();
    const targetSlug = (preferredSlug || getActiveTenantSlug() || '').toLowerCase().trim() || 'potofjollof';

    // 1. Preferred: Supabase Auth (with automatic POJ Auth Bridge fallback).
    if (isOnline()) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password,
            });

            if (!error && data?.session) {
                tryAcquirePojSession(cleanEmail, password).catch(() => {});
                return await buildStaffSessionFromAuth(data, cleanEmail, password);
            }

            // Try linked POJ Management Supabase Auth Bridge for migrated accounts
            try {
                const bridgeRes = await supabase.functions.invoke('poj-auth-bridge', {
                    body: { email: cleanEmail, password, tenant_slug: targetSlug },
                });
                if (bridgeRes?.data?.success) {
                    tryAcquirePojSession(cleanEmail, password).catch(() => {});
                    const retry = await supabase.auth.signInWithPassword({
                        email: cleanEmail,
                        password,
                    });
                    if (!retry.error && retry.data?.session) {
                        return await buildStaffSessionFromAuth(retry.data, cleanEmail, password);
                    }
                }
            } catch (_) { }

            // Fallback when poj-auth-bridge Edge Function isn't deployed yet:
            // verify directly against POJ Management Supabase Auth + profiles.
            const pojResult = await authenticateWithPojFallback(cleanEmail, password, targetSlug);
            if (pojResult) {
                return pojResult;
            }

            // Auth user not found / password mismatch — try the legacy PIN RPC below.
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

async function resolvePojLinkForStore(cleanSlug, restaurantId = null) {
    if (!cleanSlug) return null;
    try {
        let storeId = restaurantId;
        if (!storeId) {
            const { data: restRow } = await supabase
                .from('restaurants')
                .select('id')
                .eq('slug', cleanSlug)
                .limit(1)
                .maybeSingle();
            storeId = restRow?.id || null;
        }
        if (storeId) {
            const { data: linkRow } = await supabase
                .from('restaurant_poj_links')
                .select('poj_supabase_url, link_auth_enabled')
                .eq('restaurant_id', storeId)
                .limit(1)
                .maybeSingle();
            if (linkRow) {
                if (linkRow.link_auth_enabled === false) return null;
                return { pojUrl: (linkRow.poj_supabase_url || POJ_DEFAULT_URL).replace(/\/+$/, '') };
            }
        }
    } catch (_) { }

    if (cleanSlug === 'potofjollof') {
        return { pojUrl: POJ_DEFAULT_URL };
    }
    return null;
}

async function fetchPojTerminalStaff(pojUrl, includePin = false) {
    const cols = includePin
        ? 'id,name,role,pin,is_active,today_yesterday_only,can_view_revenue_breakdown'
        : 'id,name,role,is_active,today_yesterday_only,can_view_revenue_breakdown';
    const res = await fetch(
        `${pojUrl}/rest/v1/staff_access?is_active=eq.true&select=${cols}`,
        {
            headers: {
                apikey: POJ_ANON_KEY,
                Authorization: `Bearer ${POJ_ANON_KEY}`,
            },
        }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
}

/**
 * Fetch non-sensitive active staff names for Quick PIN selection on a store's POS terminal.
 */
export async function fetchTerminalStaffRoster(tenantSlug) {
    const cleanSlug = String(tenantSlug || getActiveTenantSlug() || '').toLowerCase().trim();
    if (!cleanSlug || !isOnline()) return [];

    let maniRoster = [];
    try {
        const { data, error } = await supabase.rpc('get_terminal_staff_names', {
            p_tenant_slug: cleanSlug,
        });
        if (!error && Array.isArray(data)) maniRoster = data;
    } catch (_) { }

    try {
        const pojLink = await resolvePojLinkForStore(cleanSlug);
        if (pojLink) {
            const pojRows = await fetchPojTerminalStaff(pojLink.pojUrl, false);
            const seenKeys = new Set(
                maniRoster.map((m) => `${String(m.name || '').trim().toLowerCase()}::${String(m.role || '').trim().toLowerCase()}`)
            );
            const merged = [...maniRoster];
            for (const tp of pojRows) {
                const name = String(tp.name || '').trim();
                if (!name) continue;
                const role = normalizePojRole(tp.role, name);
                const key = `${name.toLowerCase()}::${role.toLowerCase()}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                merged.push({
                    id: `poj:${tp.id}`,
                    name,
                    role,
                    source: 'poj',
                });
            }
            merged.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            return merged;
        }
    } catch (_) { }

    return maniRoster;
}

/**
 * Store-scoped 4-digit Staff PIN sign-in for POS terminals.
 */
export async function authenticateStaffQuickPin({ tenantSlug, pin, staffId = null, staffName = '' }) {
    const cleanSlug = String(tenantSlug || getActiveTenantSlug() || '').toLowerCase().trim();
    const cleanPin = String(pin || '').trim();
    const cleanName = String(staffName || '').trim();
    const isPojSelected = typeof staffId === 'string' && staffId.startsWith('poj:');

    if (!cleanSlug) {
        return { success: false, error: 'Enter your store code (e.g. potofjollof).' };
    }
    if (cleanPin.length < 4) {
        return { success: false, error: 'Enter your 4-digit PIN.' };
    }

    if (isOnline()) {
        let store = null;
        try {
            const { data: restRow } = await supabase
                .from('restaurants')
                .select('id, name, slug, status, is_active')
                .eq('slug', cleanSlug)
                .limit(1)
                .maybeSingle();
            if (restRow?.id) store = restRow;
        } catch (_) { }

        let maniPinError = null;
        if (!isPojSelected) {
            try {
                const { data: rpcRes, error: rpcError } = await supabase.rpc('verify_staff_pin_for_store', {
                    p_tenant_slug: cleanSlug,
                    p_pin: cleanPin,
                    p_staff_id: staffId || null,
                });

                if (!rpcError && rpcRes) {
                    if (rpcRes.success && rpcRes.staff_user) {
                        const raw = rpcRes.staff_user;
                        const staffUser = {
                            ...raw,
                            restaurantId: raw.restaurantId || store?.id || null,
                            restaurantName: raw.restaurantName || store?.name || '',
                            tenantSlug: raw.tenantSlug || store?.slug || cleanSlug,
                            permissions: Array.isArray(raw.permissions) && raw.permissions.length
                                ? raw.permissions
                                : roleDefaults(raw.role || 'cashier'),
                        };
                        setTenantContext(staffUser.restaurantId);
                        localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
                        await provisionOfflineStaffCredential(`${cleanSlug}:pin:${String(staffUser.name || '').toLowerCase()}`, staffUser, cleanPin);
                        await provisionOfflineStaffCredential(`${cleanSlug}:pin`, staffUser, cleanPin);
                        return { success: true, staffUser, auth: 'pin' };
                    }
                    maniPinError = rpcRes.error || 'Incorrect PIN.';
                    if (String(maniPinError).toLowerCase().includes('too many pin attempts')) {
                        return { success: false, error: maniPinError };
                    }
                }
            } catch (_) { }
        }

        // Scoped POJ Management terminal PIN fallback for migrated POJ stores (e.g. potofjollof)
        // when staff terminal passes have not yet been synced into ManiPOS staff_access.
        if (store?.id && store.is_active !== false && !['suspended', 'pending', 'rejected'].includes(store.status)) {
            try {
                const pojLink = await resolvePojLinkForStore(cleanSlug, store.id);
                if (pojLink) {
                    const pojRows = await fetchPojTerminalStaff(pojLink.pojUrl, true);
                    const targetPojId = isPojSelected ? staffId.slice(4) : null;
                    const matchedPoj = pojRows.find((tp) => {
                        if (tp.is_active === false) return false;
                        if (String(tp.pin || '').trim() !== cleanPin) return false;
                        if (targetPojId && String(tp.id) !== targetPojId) return false;
                        if (cleanName && !targetPojId && String(tp.name || '').trim().toLowerCase() !== cleanName.toLowerCase()) {
                            return false;
                        }
                        return true;
                    }) || (!targetPojId && cleanName
                        ? pojRows.find((tp) => tp.is_active !== false && String(tp.pin || '').trim() === cleanPin)
                        : null);

                    if (matchedPoj) {
                        const finalRole = normalizePojRole(matchedPoj.role, matchedPoj.name);
                        const staffUser = {
                            id: matchedPoj.id,
                            name: String(matchedPoj.name || 'Staff').trim(),
                            email: null,
                            role: finalRole,
                            restaurantId: store.id,
                            restaurantName: store.name || '',
                            tenantSlug: store.slug || cleanSlug,
                            permissions: roleDefaults(finalRole),
                            todayYesterdayOnly: Boolean(matchedPoj.today_yesterday_only),
                            canViewRevenueBreakdown: matchedPoj.can_view_revenue_breakdown !== false,
                            authSource: 'poj_pin',
                            pojStaffId: matchedPoj.id,
                        };
                        setTenantContext(staffUser.restaurantId);
                        localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
                        await provisionOfflineStaffCredential(`${cleanSlug}:pin:${staffUser.name.toLowerCase()}`, staffUser, cleanPin);
                        await provisionOfflineStaffCredential(`${cleanSlug}:pin`, staffUser, cleanPin);
                        return { success: true, staffUser, auth: 'poj_pin' };
                    }
                    if (isPojSelected) {
                        return {
                            success: false,
                            error: 'Incorrect PIN. Check your PIN or ask your manager to verify it in Team & Staff.',
                        };
                    }
                }
            } catch (_) { }
        }

        if (maniPinError) {
            return { success: false, error: maniPinError };
        }

        // Fallback to existing 3-arg verify_staff_pin(p_name, p_pin, p_restaurant_id)
        // when 20261121_terminal_pin_and_poj_auth.sql hasn't been applied yet.
        if (!store?.id) {
            return { success: false, error: 'Store not found. Check your store code.' };
        }
        if (!cleanName) {
            return {
                success: false,
                needsStaffName: true,
                error: 'Enter your Staff Name alongside your 4-digit PIN.',
            };
        }

        try {
            const { data: legacyPinRes, error: legacyPinErr } = await supabase.rpc('verify_staff_pin', {
                p_name: cleanName,
                p_pin: cleanPin,
                p_restaurant_id: store.id,
            });
            if (!legacyPinErr && legacyPinRes?.success && legacyPinRes.staff_user) {
                const raw = legacyPinRes.staff_user;
                const staffUser = {
                    ...raw,
                    restaurantId: raw.restaurantId || store.id,
                    restaurantName: store.name || '',
                    tenantSlug: store.slug || cleanSlug,
                    permissions: Array.isArray(raw.permissions) && raw.permissions.length
                        ? raw.permissions
                        : roleDefaults(raw.role || 'cashier'),
                };
                setTenantContext(staffUser.restaurantId);
                localStorage.setItem('pin_staff_user', JSON.stringify(staffUser));
                await provisionOfflineStaffCredential(`${cleanSlug}:pin:${cleanName.toLowerCase()}`, staffUser, cleanPin);
                await provisionOfflineStaffCredential(`${cleanSlug}:pin`, staffUser, cleanPin);
                return { success: true, staffUser, auth: 'pin_legacy' };
            }
            return { success: false, error: legacyPinRes?.error || 'Incorrect Staff Name or PIN.' };
        } catch (err) {
            console.warn('[StaffService] PIN verification notice:', err);
        }
    }

    const offlineKey = cleanName ? `${cleanSlug}:pin:${cleanName.toLowerCase()}` : `${cleanSlug}:pin`;
    return await verifyOfflineStaffCredential(offlineKey, cleanPin);
}

/**
 * Legacy/PIN compatibility wrapper
 */
export async function authenticateStaffPin(restaurantSlug, pinCode) {
    return authenticateStaffQuickPin({ tenantSlug: restaurantSlug, pin: pinCode });
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
