import { supabase } from './supabase';

const QUEUE_STORAGE_KEY = 'pos_offline_orders_queue';

/**
 * Get all orders currently queued in local storage
 */
export function getQueuedOfflineOrders() {
    try {
        const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
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
        const existing = getQueuedOfflineOrders();
        
        // Ensure idempotency key exists
        const idempotencyKey = orderPayload.idempotency_key || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'offline-' + Date.now());
        
        const enrichedPayload = {
            ...orderPayload,
            idempotency_key: idempotencyKey,
            queued_at: new Date().toISOString(),
            is_offline_order: true
        };

        const updatedQueue = [enrichedPayload, ...existing];
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
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
export function removeQueuedOrder(idempotencyKey) {
    try {
        const existing = getQueuedOfflineOrders();
        const updated = existing.filter(o => o.idempotency_key !== idempotencyKey && o.id !== idempotencyKey);
        localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
        console.error('Error removing order from offline queue:', e);
    }
}

/**
 * Synchronize all queued offline orders to Supabase backend
 */
export async function syncOfflineQueue() {
    const queue = getQueuedOfflineOrders();
    if (!queue || queue.length === 0) {
        return { synced: 0, failed: 0 };
    }

    console.log(`[OfflineQueue] Attempting sync of ${queue.length} pending orders...`);
    let synced = 0;
    let failed = 0;

    for (const order of queue) {
        try {
            // Strip client-side transient flags before sending to Supabase
            const { is_offline_order, queued_at, ...dbPayload } = order;

            const { error } = await supabase
                .from('pos_orders')
                .insert([dbPayload]);

            // 23505 is Postgres unique constraint violation (idempotency key match) -> order already synced!
            if (!error || error.code === '23505') {
                removeQueuedOrder(order.idempotency_key || order.id);
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
