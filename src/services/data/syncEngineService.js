import { supabase } from '../../lib/supabase';
import { isOnline, setSyncingState } from './connectivityService';
import { getLocalCollection, setLocalCollection } from './localStoreService';

const SYNC_QUEUE_KEY = 'manipos_sync_queue';

export function getSyncQueue() {
    try {
        const stored = localStorage.getItem(SYNC_QUEUE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

export function setSyncQueue(queue) {
    try {
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {}
}

export function enqueueSyncOperation({ entity_type, operation, entity_id, payload }) {
    const queue = getSyncQueue();
    const syncItem = {
        id: 'sync-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        entity_type,
        operation,
        entity_id,
        payload,
        created_at: new Date().toISOString(),
        attempts: 0,
        status: 'PENDING'
    };

    queue.push(syncItem);
    setSyncQueue(queue);
    console.log(`[SyncEngine] Enqueued ${operation} on ${entity_type} (${entity_id})`);

    if (isOnline()) {
        triggerSyncProcess();
    }
}

export async function triggerSyncProcess() {
    if (!isOnline()) return;

    const queue = getSyncQueue();
    const pending = queue.filter(q => q.status === 'PENDING' || q.status === 'FAILED');

    if (pending.length === 0) return;

    setSyncingState(true);
    console.log(`[SyncEngine] Processing ${pending.length} pending sync items...`);

    let hasErrors = false;
    const remainingQueue = [...queue];

    for (const item of pending) {
        try {
            item.attempts += 1;
            item.last_attempt_at = new Date().toISOString();

            let res;
            if (item.operation === 'INSERT') {
                res = await supabase.from(item.entity_type).insert([item.payload]);
            } else if (item.operation === 'UPDATE') {
                res = await supabase.from(item.entity_type).update(item.payload).eq('id', item.entity_id);
            } else if (item.operation === 'DELETE') {
                res = await supabase.from(item.entity_type).delete().eq('id', item.entity_id);
            }

            // Postgres error code 23505 = unique constraint conflict (idempotent duplicate) -> safe success!
            if (!res.error || res.error.code === '23505') {
                console.log(`[SyncEngine] Successfully synced item ${item.id}`);
                const idx = remainingQueue.findIndex(q => q.id === item.id);
                if (idx >= 0) remainingQueue.splice(idx, 1);
            } else {
                console.warn(`[SyncEngine] Sync failed for item ${item.id}:`, res.error.message);
                item.status = 'FAILED';
                item.error = res.error.message;
                hasErrors = true;
            }
        } catch (err) {
            console.error(`[SyncEngine] Exception syncing item ${item.id}:`, err);
            item.status = 'FAILED';
            item.error = err.message;
            hasErrors = true;
        }
    }

    setSyncQueue(remainingQueue);
    setSyncingState(false, hasErrors);
}

// Auto-trigger sync when coming back online
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        triggerSyncProcess();
    });
}
