import { supabase } from './supabase';
import { getTenantInfo } from './tenant';

const STORAGE_KEY = 'manipos_reported_errors';
const DEDUPE_WINDOW_MS = 60_000;
const MAX_STORED = 50;

/**
 * Read the tenant/staff context so bug reports can be attributed to a
 * restaurant. Falls back to empty values for guests and public pages.
 */
function readSessionContext() {
    try {
        const staff = JSON.parse(localStorage.getItem('pin_staff_user') || '{}');
        const { tenantSlug } = getTenantInfo();
        return {
            tenantSlug: staff.tenantSlug || tenantSlug || null,
            restaurantId: staff.restaurantId || staff.restaurant_id || null,
            staffName: staff.name || null,
        };
    } catch {
        return {};
    }
}

function readRecent() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function remember(signature) {
    try {
        const entries = readRecent();
        entries.push({ signature, at: Date.now() });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_STORED)));
    } catch {
        /* storage unavailable — reporting is best-effort */
    }
}

/**
 * Report an unhandled error to Supabase. scripts/error-forwarder.py picks it up
 * and forwards it to Telegram.
 *
 * Never throws: error reporting must not take the app down, and a failure to
 * report must never mask the original error.
 */
export function reportError(error, context = {}) {
    try {
        const message = String(error?.message || error || 'Unknown error').slice(0, 1000);
        const recent = readRecent();
        const alreadyReported = recent.some(
            (entry) => entry.signature === message && Date.now() - entry.at < DEDUPE_WINDOW_MS
        );
        if (alreadyReported) return;

        const session = readSessionContext();
        const payload = {
            severity: context.severity || 'error',
            error_message: message,
            error_stack: String(error?.stack || '').slice(0, 6000),
            component_stack: String(context.componentStack || '').slice(0, 2000),
            page: window.location.pathname + window.location.search,
            url: window.location.href,
            user_agent: navigator.userAgent,
            tenant_slug: context.tenantSlug || session.tenantSlug || null,
            restaurant_id: context.restaurantId || session.restaurantId || null,
            staff_name: context.staffName || session.staffName || null,
        };

        supabase.from('error_logs').insert([payload]).then(({ error: insertError }) => {
            if (insertError) {
                console.warn('[ManiPOS] could not save error report:', insertError.message);
            } else {
                remember(message);
            }
        });
    } catch {
        /* never break the app */
    }
}
