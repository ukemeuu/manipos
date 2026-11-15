import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  mockSignInWithPassword,
  mockFunctionsInvoke,
  mockRpc,
  mockFrom,
} = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockFunctionsInvoke: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../supabase', () => {
  let tenantCtx = null;
  return {
    setTenantContext: (tid) => { tenantCtx = tid || null; },
    getTenantContext: () => tenantCtx,
    supabase: {
      auth: {
        signInWithPassword: (...args) => mockSignInWithPassword(...args),
      },
      functions: {
        invoke: (...args) => mockFunctionsInvoke(...args),
      },
      rpc: (...args) => mockRpc(...args),
      from: (...args) => mockFrom(...args),
    },
  };
});

vi.mock('../../services/data/connectivityService', () => ({
  isOnline: () => true,
}));

import { authenticateStaffLogin, authenticateStaffQuickPin } from '../../services/data/staffService';
import { getTenantContext, setTenantContext } from '../supabase';
import { getTenantInfo } from '../tenant';

function makeChain(resolved) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: () => chain,
    maybeSingle: async () => resolved,
  };
  return chain;
}

describe('authSessionAndHost (POJ Auth Bridge fallback, Quick PIN, & pos.manipos.com isolation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setTenantContext(null);
    delete window.location;
    window.location = new URL('https://potofjollof.pos.manipos.com/');
  });

  it('authenticates POJ admin password via direct POJ Auth fallback when poj-auth-bridge Edge Function is 404', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
    mockFunctionsInvoke.mockResolvedValue({ data: null, error: { message: 'Requested function was not found' } });

    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/auth/v1/token')) {
        return {
          ok: true,
          json: async () => ({
            access_token: 'poj-jwt-token',
            user: { id: 'poj-admin-1', email: 'potofjollofke@gmail.com', user_metadata: { full_name: 'POJ Admin' } },
          }),
        };
      }
      if (String(url).includes('/rest/v1/profiles')) {
        return {
          ok: true,
          json: async () => [{ id: 'poj-admin-1', full_name: 'POJ Founder', role: 'admin', is_active: true }],
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    mockFrom.mockImplementation((table) => {
      if (table === 'restaurants') {
        return makeChain({
          data: { id: 'd0db680a-7956-45a5-85ae-a4286f3370a0', name: 'Pot of Jollof', slug: 'potofjollof', status: 'approved', is_active: true },
          error: null,
        });
      }
      if (table === 'restaurant_poj_links') {
        return makeChain({ data: { link_auth_enabled: true }, error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await authenticateStaffLogin('potofjollofke@gmail.com', 'MyPojPass123!', 'potofjollof');
    expect(res.success).toBe(true);
    expect(res.staffUser.role).toBe('admin');
    expect(res.staffUser.name).toBe('POJ Founder');
    expect(res.staffUser.restaurantId).toBe('d0db680a-7956-45a5-85ae-a4286f3370a0');
    expect(res.staffUser.permissions).toContain('view_dashboard');
    expect(getTenantContext()).toBe('d0db680a-7956-45a5-85ae-a4286f3370a0');
  });

  it('authenticates terminal staff with just a 4-digit PIN via store-scoped RPC', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'restaurants') {
        return makeChain({
          data: { id: 'd0db680a-7956-45a5-85ae-a4286f3370a0', name: 'Pot of Jollof', slug: 'potofjollof', status: 'approved', is_active: true },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        staff_user: {
          id: 'staff-cashier-1',
          name: 'Grace',
          role: 'cashier',
          restaurantId: 'd0db680a-7956-45a5-85ae-a4286f3370a0',
          permissions: ['view_pos', 'create_orders'],
        },
      },
      error: null,
    });

    const res = await authenticateStaffQuickPin({ tenantSlug: 'potofjollof', pin: '4321' });
    expect(res.success).toBe(true);
    expect(res.staffUser.name).toBe('Grace');
    expect(res.staffUser.tenantSlug).toBe('potofjollof');
    expect(getTenantContext()).toBe('d0db680a-7956-45a5-85ae-a4286f3370a0');
  });

  it('parses pos.manipos.com with null tenantSlug so shared login host never defaults to another store', () => {
    delete window.location;
    window.location = new URL('https://pos.manipos.com/');
    const info = getTenantInfo();
    expect(info.isPosDomain).toBe(true);
    expect(info.tenantSlug).toBeNull();
  });
});
