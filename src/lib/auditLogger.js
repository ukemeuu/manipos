import { supabase, getTenantContext } from './supabase';

const LEGACY_AUDIT_CACHE_KEY = 'pos_audit_logs_cache';

function auditCacheKey(restaurantId = null) {
    const tid = restaurantId || getTenantContext() || 'shared';
    return `${LEGACY_AUDIT_CACHE_KEY}_${tid}`;
}

/**
 * Log an immutable audit event for sensitive cashier/manager actions
 * 
 * @param {Object} params
 * @param {string} params.action - e.g. 'order_void', 'order_refund', 'discount_applied', 'price_override', 'shift_opened', 'shift_closed'
 * @param {Object} params.details - Details object (order_number, total, discount_code, reason)
 * @param {Object} params.staff - Staff identity object ({ id, name, role, restaurantId })
 */
export async function logAuditEvent({ action, details = {}, staff = {} }) {
    const timestamp = new Date().toISOString();

    // Resolve staff info from param or localStorage session
    let staffName = staff.name || null;
    let staffId = staff.id || null;
    let restaurantId = staff.restaurantId || getTenantContext() || null;

    if (!staffName || !restaurantId) {
        try {
            const stored = localStorage.getItem('pin_staff_user');
            if (stored) {
                const parsed = JSON.parse(stored);
                staffName = staffName || parsed.name;
                staffId = staffId || parsed.id;
                restaurantId = restaurantId || parsed.restaurantId || parsed.restaurant_id;
            }
        } catch (e) {}
    }
    staffName = staffName || 'Terminal Cashier';

    const payload = {
        action,
        details,
        staff_name: staffName,
        staff_id: staffId,
        restaurant_id: restaurantId,
        created_at: timestamp
    };

    console.log(`[AuditLogger] Action: ${action} by ${staffName}`, details);

    try {
        const { error } = await supabase
            .from('audit_logs')
            .insert([payload]);

        if (error) {
            console.warn('[AuditLogger] Could not persist to DB, caching locally:', error.message);
            cacheAuditLocally(payload);
        }
    } catch (err) {
        console.warn('[AuditLogger] Network error during audit logging, caching locally:', err);
        cacheAuditLocally(payload);
    }
}

function cacheAuditLocally(payload) {
    try {
        const key = auditCacheKey(payload?.restaurant_id);
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const updated = [payload, ...existing].slice(0, 200); // Keep last 200 events
        localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {}
}

export function getLocalAuditLogs(restaurantId = null) {
    try {
        const key = auditCacheKey(restaurantId);
        return JSON.parse(localStorage.getItem(key) || localStorage.getItem(LEGACY_AUDIT_CACHE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}
