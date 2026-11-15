import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockRpc, mockFrom } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
    auth: { signInWithPassword: vi.fn(), getSession: vi.fn() },
    functions: { invoke: vi.fn() },
  },
  setTenantContext: vi.fn(),
  getTenantContext: vi.fn(() => null),
}));

vi.mock('../../../lib/tenant', () => ({
  getActiveTenantSlug: vi.fn(() => 'potofjollof'),
}));

vi.mock('../connectivityService', () => ({
  isOnline: vi.fn(() => true),
}));

import { fetchTerminalStaffRoster, authenticateStaffQuickPin } from '../staffService';

function makeQueryChain(result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
  };
  return chain;
}

describe('staffService terminal PIN login & POJ staff fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  it('merges POJ terminal staff (including Ronaldo) into potofjollof roster without duplicating synced staff', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { id: 'mani-1', name: 'POJ Lead Cashier', role: 'admin' },
        { id: 'mani-2', name: 'Shift Supervisor', role: 'manager' },
      ],
      error: null,
    });

    mockFrom.mockImplementation((table) => {
      if (table === 'restaurants') return makeQueryChain({ data: { id: 'rest-poj' }, error: null });
      if (table === 'restaurant_poj_links') return makeQueryChain({ data: null, error: null });
      return makeQueryChain({ data: null, error: null });
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 'poj-ronaldo', name: 'Ronaldo', role: 'waiter', is_active: true },
        { id: 'poj-admin', name: 'POJ Lead Cashier', role: 'admin', is_active: true },
      ],
    });

    const roster = await fetchTerminalStaffRoster('potofjollof');
    expect(roster.map((r) => r.name)).toEqual([
      'POJ Lead Cashier',
      'Ronaldo',
      'Shift Supervisor',
    ]);
    const ronaldo = roster.find((r) => r.name === 'Ronaldo');
    expect(ronaldo).toMatchObject({
      id: 'poj:poj-ronaldo',
      role: 'waiter',
      source: 'poj',
    });

    fetchSpy.mockRestore();
  });

  it('does not expose POJ terminal staff to unrelated tenants', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'other-1', name: 'Local Cashier', role: 'cashier' }],
      error: null,
    });
    mockFrom.mockImplementation(() => makeQueryChain({ data: null, error: null }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const roster = await fetchTerminalStaffRoster('chopnownow');
    expect(roster).toEqual([{ id: 'other-1', name: 'Local Cashier', role: 'cashier' }]);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it('authenticates Ronaldo with PIN 1122 for potofjollof via POJ PIN fallback when not yet synced in ManiPOS', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'restaurants') {
        return makeQueryChain({
          data: {
            id: 'rest-poj',
            name: 'Pot of Jollof Kitchen',
            slug: 'potofjollof',
            status: 'approved',
            is_active: true,
          },
          error: null,
        });
      }
      if (table === 'restaurant_poj_links') {
        return makeQueryChain({ data: null, error: null });
      }
      return makeQueryChain({ data: null, error: null });
    });

    mockRpc.mockResolvedValueOnce({
      data: { success: false, error: 'Incorrect PIN.' },
      error: null,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'e2a72415-cc32-4bdd-8c69-762c77c0a85d',
          name: 'Ronaldo',
          role: 'waiter',
          pin: '1122',
          is_active: true,
          today_yesterday_only: true,
          can_view_revenue_breakdown: false,
        },
      ],
    });

    const res = await authenticateStaffQuickPin({
      tenantSlug: 'potofjollof',
      pin: '1122',
    });

    expect(res.success).toBe(true);
    expect(res.auth).toBe('poj_pin');
    expect(res.staffUser).toMatchObject({
      name: 'Ronaldo',
      role: 'waiter',
      tenantSlug: 'potofjollof',
      restaurantId: 'rest-poj',
    });

    fetchSpy.mockRestore();
  });

  it('rejects incorrect PIN for selected POJ staff member', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'restaurants') {
        return makeQueryChain({
          data: {
            id: 'rest-poj',
            name: 'Pot of Jollof Kitchen',
            slug: 'potofjollof',
            status: 'approved',
            is_active: true,
          },
          error: null,
        });
      }
      return makeQueryChain({ data: null, error: null });
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'e2a72415-cc32-4bdd-8c69-762c77c0a85d',
          name: 'Ronaldo',
          role: 'waiter',
          pin: '1122',
          is_active: true,
        },
      ],
    });

    const res = await authenticateStaffQuickPin({
      tenantSlug: 'potofjollof',
      pin: '9999',
      staffId: 'poj:e2a72415-cc32-4bdd-8c69-762c77c0a85d',
      staffName: 'Ronaldo',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Incorrect PIN');

    fetchSpy.mockRestore();
  });
});
