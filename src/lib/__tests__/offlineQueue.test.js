import { describe, it, expect, beforeEach } from 'vitest';
import {
  queueOfflineOrder,
  getQueuedOfflineOrders,
  removeQueuedOrder,
} from '../offlineQueue';

describe('offlineQueue tenant isolation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isolates offline orders by tenantId so tenants never leak orders', () => {
    const t1 = '11111111-1111-1111-1111-111111111111';
    const t2 = '22222222-2222-2222-2222-222222222222';

    const queued1 = queueOfflineOrder({
      restaurant_id: t1,
      ticket_number: 'R-1001',
      total_amount: 1200,
    });
    queueOfflineOrder({
      restaurant_id: t2,
      ticket_number: 'R-2001',
      total_amount: 850,
    });

    expect(getQueuedOfflineOrders(t1)).toHaveLength(1);
    expect(getQueuedOfflineOrders(t1)[0].ticket_number).toBe('R-1001');
    expect(getQueuedOfflineOrders(t2)).toHaveLength(1);
    expect(getQueuedOfflineOrders(t2)[0].ticket_number).toBe('R-2001');

    removeQueuedOrder(queued1.idempotency_key, t1);
    expect(getQueuedOfflineOrders(t1)).toHaveLength(0);
    expect(getQueuedOfflineOrders(t2)).toHaveLength(1);
  });

  it('generates an idempotency_key automatically when omitted', () => {
    const tid = '33333333-3333-3333-3333-333333333333';
    const enriched = queueOfflineOrder({ restaurant_id: tid, total_amount: 500 });
    expect(typeof enriched.idempotency_key).toBe('string');
    expect(enriched.idempotency_key.length).toBeGreaterThan(6);
    expect(enriched.is_offline_order).toBe(true);
  });
});
