import { describe, expect, it, vi } from 'vitest';
import {
    ensureOrderItemsPersisted,
    insertOrderWithIdempotency,
    makeOrderIdempotencyKey,
} from '../orderIdempotency';

describe('orderIdempotency', () => {
    it('generates RFC 4122 v4 UUID keys', () => {
        const key = makeOrderIdempotencyKey();
        expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('returns the existing order when 23505 idempotency_key conflict occurs', async () => {
        const maybeSingle = vi.fn().mockResolvedValue({
            data: { id: 'order-existing-1', ticket_number: '1316', created_at: '2026-11-19T15:00:00Z' },
            error: null,
        });
        const eq = vi.fn(() => ({ maybeSingle }));
        const selectLookup = vi.fn(() => ({ eq }));
        const singleInsert = vi.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        });
        const selectInsert = vi.fn(() => ({ single: singleInsert }));
        const insert = vi.fn(() => ({ select: selectInsert }));

        const supabaseMock = {
            from: vi.fn(() => ({
                insert,
                select: selectLookup,
            })),
        };

        const res = await insertOrderWithIdempotency(supabaseMock, {
            idempotency_key: '11111111-1111-4111-8111-111111111111',
            customer_name: 'Nena Orji',
        });

        expect(res.error).toBeNull();
        expect(res.deduplicated).toBe(true);
        expect(res.data.id).toBe('order-existing-1');
    });

    it('strips missing optional columns on PGRST204 and succeeds', async () => {
        const singleInsert = vi
            .fn()
            .mockResolvedValueOnce({
                data: null,
                error: { code: 'PGRST204', message: "Could not find the 'charges_breakdown' column of 'pos_orders' in the schema cache" },
            })
            .mockResolvedValueOnce({
                data: { id: 'order-new-1', ticket_number: '1320' },
                error: null,
            });
        const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: singleInsert })) }));
        const supabaseMock = { from: vi.fn(() => ({ insert })) };

        const res = await insertOrderWithIdempotency(supabaseMock, {
            customer_name: 'Nena Orji',
            charges_breakdown: [],
        });

        expect(res.error).toBeNull();
        expect(res.deduplicated).toBe(false);
        expect(res.data.id).toBe('order-new-1');
        expect(insert).toHaveBeenCalledTimes(2);
        expect(insert.mock.calls[1][0][0]).not.toHaveProperty('charges_breakdown');
    });

    it('skips inserting items if order already has persisted line items', async () => {
        const limit = vi.fn().mockResolvedValue({ data: [{ id: 'item-1' }], error: null });
        const eq = vi.fn(() => ({ limit }));
        const select = vi.fn(() => ({ eq }));
        const supabaseMock = { from: vi.fn(() => ({ select })) };
        const insertItemsFn = vi.fn();

        const res = await ensureOrderItemsPersisted(
            supabaseMock,
            'order-existing-1',
            [{ order_id: 'order-existing-1', item_name: 'Jollof Rice', quantity: 1, price: 1000 }],
            insertItemsFn
        );

        expect(res.skipped).toBe(true);
        expect(insertItemsFn).not.toHaveBeenCalled();
    });
});
