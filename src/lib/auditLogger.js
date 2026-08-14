import { supabase } from './supabase';

const AUDIT_CACHE_KEY = 'pos_audit_logs_cache';

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
    let staffName = staff.name || 'Terminal Cashier';
    let staffId = staff.id || null;
    let restaurantId = staff.restaurantId || null;

    if (!staffName || !restaurantId) {
        try {
            const stored = localStorage.getItem('pin_staff_user');
            if (stored) {
                const parsed = JSON.parse(stored);
                staffName = staffName || parsed.name;
                staffId = staffId || parsed.id;
                restaurantId = restaurantId || parsed.restaurantId;
            }
        } catch (e) {}
    }

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
        const existing = JSON.parse(localStorage.getItem(AUDIT_CACHE_KEY) || '[]');
        const updated = [payload, ...existing].slice(0, 200); // Keep last 200 events
        localStorage.setItem(AUDIT_CACHE_KEY, JSON.stringify(updated));
    } catch (e) {}
}

export function getLocalAuditLogs() {
    try {
        return JSON.parse(localStorage.getItem(AUDIT_CACHE_KEY) || '[]');
    } catch (e) {
        return [];
    }
}
