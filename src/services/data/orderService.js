import { insertLocalRecord, getLocalCollection, updateLocalRecord } from './localStoreService';
import { enqueueSyncOperation } from './syncEngineService';
import { logAuditEvent } from '../../lib/auditLogger';

/**
 * Local-First Order Creation Service
 */
export async function createPosOrder(orderPayload) {
    const timestamp = new Date().toISOString();
    const idempotencyKey = orderPayload.idempotency_key || 
        (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'idemp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9));

    // Generate local human-readable ticket number if missing
    let ticketNumber = orderPayload.order_number;
    if (!ticketNumber) {
        const localOrders = getLocalCollection('pos_orders');
        const countToday = localOrders.filter(o => o.created_at && o.created_at.slice(0, 10) === timestamp.slice(0, 10)).length;
        ticketNumber = 'TK-' + String(countToday + 1).padStart(3, '0');
    }

    const localOrderRecord = {
        ...orderPayload,
        id: orderPayload.id || idempotencyKey,
        idempotency_key: idempotencyKey,
        order_number: ticketNumber,
        status: orderPayload.status || 'Completed',
        created_at: orderPayload.created_at || timestamp,
        sync_status: 'PENDING_SYNC'
    };

    // 1. Write to local database instantly (<15ms)
    insertLocalRecord('pos_orders', localOrderRecord);

    // 2. Queue for background sync
    enqueueSyncOperation({
        entity_type: 'pos_orders',
        operation: 'INSERT',
        entity_id: idempotencyKey,
        payload: localOrderRecord
    });

    // 3. Audit log if discount was applied
    if (orderPayload.discount > 0) {
        logAuditEvent({
            action: 'discount_applied',
            details: { order_number: ticketNumber, discount: orderPayload.discount, total: orderPayload.total_amount },
            staff: { name: orderPayload.cashier_name }
        });
    }

    return localOrderRecord;
}

export function getLocalOrders() {
    return getLocalCollection('pos_orders');
}

export function updatePosOrder(orderId, updates) {
    updateLocalRecord('pos_orders', orderId, updates);
    
    enqueueSyncOperation({
        entity_type: 'pos_orders',
        operation: 'UPDATE',
        entity_id: orderId,
        payload: updates
    });
}
