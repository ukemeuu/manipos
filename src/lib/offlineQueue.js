import { supabase, getTenantContext } from './supabase';

const LEGACY_QUEUE_STORAGE_KEY = 'manipos_retail_offline_orders_queue';
let isSyncingQueue = false;

function queueStorageKey(tenantId = null) {
    const tid = tenantId || getTenantContext() || 'shared';
    return `manipos_retail_offline_orders_queue_${tid}`;
}

/**
 * Get all orders currently queued in local storage for the active tenant
 */
export function getQueuedOfflineOrders(tenantId = null) {
    try {
        const key = queueStorageKey(tenantId);
        const stored = localStorage.getItem(key) || localStorage.getItem(LEGACY_QUEUE_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error reading offline orders queue:', e);
        return [];
    }
}

/**
 * Add a new order payload to the offline queue
 */
export function queueOfflineOrder(orderPayload) {
    try {
        const tid = orderPayload?.restaurant_id || getTenantContext() || null;
        const key = queueStorageKey(tid);
        const existing = getQueuedOfflineOrders(tid);

        // Ensure idempotency key exists
        const idempotencyKey = orderPayload.idempotency_key || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'offline-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));

        const enrichedPayload = {
            ...orderPayload,
            ...(tid ? { restaurant_id: tid } : {}),
            idempotency_key: idempotencyKey,
            queued_at: new Date().toISOString(),
            is_offline_order: true
        };

        const updatedQueue = [enrichedPayload, ...existing];
        localStorage.setItem(key, JSON.stringify(updatedQueue));
        console.log(`[OfflineQueue] Order queued locally (${idempotencyKey})`);
        return enrichedPayload;
    } catch (e) {
        console.error('Error queuing offline order:', e);
        return orderPayload;
    }
}

/**
 * Remove an order from the offline queue by idempotency key
 */
export function removeQueuedOrder(idempotencyKey, tenantId = null) {
    try {
        const key = queueStorageKey(tenantId);
        const existing = getQueuedOfflineOrders(tenantId);
        const updated = existing.filter(o => o.idempotency_key !== idempotencyKey && o.id !== idempotencyKey);
        localStorage.setItem(key, JSON.stringify(updated));
        localStorage.removeItem(LEGACY_QUEUE_STORAGE_KEY);
    } catch (e) {
        console.error('Error removing order from offline queue:', e);
    }
}

/**
 * Synchronize all queued offline orders to Supabase backend
 */
export async function syncOfflineQueue(tenantId = null) {
    if (isSyncingQueue) return { synced: 0, failed: 0 };
    const queue = getQueuedOfflineOrders(tenantId);
    if (!queue || queue.length === 0) {
        return { synced: 0, failed: 0 };
    }

    isSyncingQueue = true;
    console.log(`[OfflineQueue] Attempting sync of ${queue.length} pending orders...`);
    let synced = 0;
    let failed = 0;

    try {
        for (const order of queue) {
            try {
                // Strip client-side transient flags before sending to Supabase
                const { is_offline_order, queued_at, ...dbPayload } = order;

                const { error } = await supabase
                    .from('pos_orders')
                    .insert([dbPayload]);

                // 23505 is Postgres unique constraint violation (idempotency key match) -> order already synced!
                if (!error || error.code === '23505') {
                    removeQueuedOrder(order.idempotency_key || order.id, order.restaurant_id || tenantId);
                    synced++;
                } else {
                    console.warn(`[OfflineQueue] Failed to sync order ${order.id}:`, error.message);
                    failed++;
                }
            } catch (err) {
                console.error(`[OfflineQueue] Exception syncing order ${order.id}:`, err);
                failed++;
            }
        }
    } finally {
        isSyncingQueue = false;
    }

    console.log(`[OfflineQueue] Sync completed. Synced: ${synced}, Failed: ${failed}`);
    return { synced, failed };
}

// Auto-trigger sync when network connectivity is restored
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        console.log('[OfflineQueue] Network reconnected. Triggering auto-sync...');
        syncOfflineQueue();
    });
}
