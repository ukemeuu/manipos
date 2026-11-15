import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: vi.fn(),
  },
}));

import { fetchPojOrdersForRange, mergeOrdersWithPoj } from '../pojSyncService';

function makeQueryChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
  };
  return chain;
}

describe('POJ live order history bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches live POJ orders for potofjollof date range', async () => {
    mockFrom.mockImplementation(() => makeQueryChain({ data: null, error: null }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'poj-order-1',
          ticket_number: 6462,
          customer_name: 'HAOLAN ZHANG',
          total_amount: 3500,
          cashier_name: 'Ronaldo',
          created_at: '2026-11-15T09:34:10.349+00:00',
          items: [],
        },
      ],
    });

    const orders = await fetchPojOrdersForRange({
      tenantSlug: 'potofjollof',
      restaurantId: 'rest-poj',
      startIso: '2026-11-14T21:00:00.000Z',
      endIso: '2026-11-15T20:59:59.999Z',
    });

    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      source_poj_id: 'poj-order-1',
      ticket_number: '6462',
      customer_name: 'HAOLAN ZHANG',
      restaurant_id: 'rest-poj',
      _fromPoj: true,
    });
    fetchSpy.mockRestore();
  });

  it('does not fetch POJ orders for unrelated tenants', async () => {
    mockFrom.mockImplementation(() => makeQueryChain({ data: null, error: null }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const orders = await fetchPojOrdersForRange({
      tenantSlug: 'chopnownow',
      restaurantId: 'rest-other',
      startIso: '2026-11-14T21:00:00.000Z',
      endIso: '2026-11-15T20:59:59.999Z',
    });

    expect(orders).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('merges ManiPOS and POJ orders without duplicating already-synced orders', () => {
    const mani = [
      { id: 'm-1', source_poj_id: 'poj-order-1', customer_name: 'HAOLAN ZHANG', created_at: '2026-11-15T09:34:10Z' },
      { id: 'm-2', source_poj_id: null, customer_name: 'Itunu Kuku', created_at: '2026-11-15T08:41:07Z' },
    ];
    const poj = [
      { id: 'poj-order-1', source_poj_id: 'poj-order-1', customer_name: 'HAOLAN ZHANG', created_at: '2026-11-15T09:34:10Z' },
      { id: 'poj-order-2', source_poj_id: 'poj-order-2', customer_name: 'George Mwangi', created_at: '2026-11-15T10:24:12Z' },
    ];

    const merged = mergeOrdersWithPoj(mani, poj);
    expect(merged.map((o) => o.customer_name)).toEqual([
      'George Mwangi',
      'HAOLAN ZHANG',
      'Itunu Kuku',
    ]);
  });
});
