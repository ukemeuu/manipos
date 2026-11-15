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

import { fetchPojOrdersForRange, mergeOrdersWithPoj, fetchPojCatalogEnrichment } from '../pojSyncService';

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

  it('aborts and returns [] if the external POJ endpoint stalls past timeoutMs', async () => {
    mockFrom.mockImplementation(() => makeQueryChain({ data: null, error: null }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const orders = await fetchPojOrdersForRange({
      tenantSlug: 'potofjollof',
      restaurantId: 'rest-poj',
      timeoutMs: 25,
    });

    expect(orders).toEqual([]);
    fetchSpy.mockRestore();
  });

  it('enriches an existing ManiPOS synced order that had 0 items with POJ items when available', () => {
    const mani = [
      { id: 'm-1', source_poj_id: 'poj-order-1', customer_name: 'John', created_at: '2026-11-15T10:00:00Z', pos_order_items: [] },
    ];
    const poj = [
      {
        id: 'poj-order-1',
        source_poj_id: 'poj-order-1',
        customer_name: 'John',
        created_at: '2026-11-15T10:00:00Z',
        items: [{ id: 'it-1', item_name: 'Jollof Rice', quantity: 2, price: 950 }],
      },
    ];

    const merged = mergeOrdersWithPoj(mani, poj);
    expect(merged).toHaveLength(1);
    expect(merged[0].items).toHaveLength(1);
    expect(merged[0].items[0].item_name).toBe('Jollof Rice');
  });

  it('fetches POJ catalog enrichment mapping modifier group item IDs to normalized names', async () => {
    mockFrom.mockImplementation(() => makeQueryChain({ data: null, error: null }));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'pm-1', name: 'Smoky Jollof Rice', brands: ['POT OF JOLLOF', 'LITTLE LAGOS'], is_available: true },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'mg-1', name: 'Protein Add-on', menu_item_ids: ['pm-1'], options: [{ name: 'Grilled Chicken', price: 350 }] },
        ],
      });

    const enrichment = await fetchPojCatalogEnrichment({
      tenantSlug: 'potofjollof',
      restaurantId: 'rest-poj',
    });

    expect(enrichment.pojMenuItems).toHaveLength(1);
    expect(enrichment.modifierGroups).toHaveLength(1);
    expect(enrichment.modifierGroups[0]._matchedItemNames).toEqual(['SMOKY JOLLOF RICE']);
    fetchSpy.mockRestore();
  });
});
