/**
 * POJ Management <-> ManiPOS Authentication Bridge.
 *
 * Allows any staff member from pojmanagement.com (bfrvzwmckuiafkgwemdt.supabase.co)
 * to sign in on manipos.com with their existing email and password without a reset.
 * On valid POJ Auth verification, provisions/links their ManiPOS Supabase Auth user
 * and staff_access record under the restaurant tenant (defaulting to potofjollof).
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const POJ_SUPABASE_URL = Deno.env.get('POJ_SUPABASE_URL') || 'https://bfrvzwmckuiafkgwemdt.supabase.co';
const POJ_ANON_KEY = Deno.env.get('POJ_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmcnZ6d21ja3VpYWZrZ3dlbWR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMjE1NTUsImV4cCI6MjA4Mzg5NzU1NX0.RfrrfzR9nlJH6ZC_Jz5Sy8EByobAnXL-VOuP0onVWfE';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function normalizeRole(pojRole: string | null | undefined, jobTitle: string | null | undefined): string {
  const r = String(pojRole || '').toLowerCase().trim();
  const jt = String(jobTitle || '').toLowerCase();
  if (r === 'admin' || r === 'superadmin' || r === 'owner') return 'admin';
  if (r === 'manager') return 'manager';
  if (r === 'accountant' || jt.includes('accountant')) return 'accountant';
  if (r === 'chef' || jt.includes('chef')) return 'chef';
  if (r === 'receiver' || jt.includes('receiver')) return 'receiver';
  if (r === 'stock_controller') return 'stock_controller';
  if (r === 'store_clerk') return 'store_clerk';
  if (r === 'expense_clerk') return 'expense_clerk';
  if (r === 'cashier') return 'cashier';
  if (r === 'waiter') return 'waiter';
  if (r === 'kds') return 'kds';
  return 'staff';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const email = String(body?.email || '').toLowerCase().trim();
    const password = String(body?.password || '');
    const requestedSlug = String(body?.tenant_slug || 'potofjollof').toLowerCase().trim();

    if (!email || !password) {
      return json({ success: false, error: 'Email and password required' }, 400);
    }

    // 1. Authenticate against POJ Management Supabase Auth
    const pojAuthRes = await fetch(`${POJ_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: POJ_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const pojAuthData = await pojAuthRes.json();
    if (!pojAuthRes.ok || !pojAuthData?.access_token || !pojAuthData?.user) {
      return json({ success: false, error: 'Invalid credentials' }, 401);
    }

    const pojUser = pojAuthData.user;
    const pojToken = pojAuthData.access_token;

    // 2. Fetch POJ profile using the authenticated POJ user token
    let pojProfile: Record<string, unknown> = {};
    try {
      const profRes = await fetch(
        `${POJ_SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(pojUser.id)}&select=*&limit=1`,
        {
          headers: {
            apikey: POJ_ANON_KEY,
            Authorization: `Bearer ${pojToken}`,
          },
        }
      );
      if (profRes.ok) {
        const profRows = await profRes.json();
        if (Array.isArray(profRows) && profRows[0]) pojProfile = profRows[0];
      }
    } catch {
      // Optional profile lookup failure is non-fatal
    }

    const adminHeaders = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };

    // 3. Resolve target restaurant in ManiPOS (prefer requested slug -> potofjollof)
    let restaurant: { id: string; name: string; slug: string } | null = null;
    const slugRes = await fetch(
      `${SUPABASE_URL}/rest/v1/restaurants?slug=eq.${encodeURIComponent(requestedSlug)}&select=id,name,slug&limit=1`,
      { headers: adminHeaders }
    );
    if (slugRes.ok) {
      const rows = await slugRes.json();
      if (Array.isArray(rows) && rows[0]) restaurant = rows[0];
    }
    if (!restaurant) {
      const fallbackRes = await fetch(
        `${SUPABASE_URL}/rest/v1/restaurants?slug=eq.potofjollof&select=id,name,slug&limit=1`,
        { headers: adminHeaders }
      );
      if (fallbackRes.ok) {
        const rows = await fallbackRes.json();
        if (Array.isArray(rows) && rows[0]) restaurant = rows[0];
      }
    }
    if (!restaurant) {
      return json({ success: false, error: 'Target restaurant not found in ManiPOS' }, 404);
    }

    // Check POJ link policy if configured
    try {
      const linkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/restaurant_poj_links?restaurant_id=eq.${restaurant.id}&select=link_auth_enabled&limit=1`,
        { headers: adminHeaders }
      );
      if (linkRes.ok) {
        const linkRows = await linkRes.json();
        if (Array.isArray(linkRows) && linkRows[0] && linkRows[0].link_auth_enabled === false) {
          return json({ success: false, error: 'POJ Auth Bridge disabled for this restaurant' }, 403);
        }
      }
    } catch {
      // Table optional prior to migration
    }

    const fullName = String(
      pojProfile.full_name ||
      pojUser.user_metadata?.full_name ||
      pojUser.user_metadata?.name ||
      email.split('@')[0]
    );
    const role = normalizeRole(
      String(pojProfile.role || pojUser.user_metadata?.role || 'staff'),
      String(pojProfile.job_title || '')
    );
    const isActive = pojProfile.is_active !== false && !pojProfile.deleted_at;
    if (!isActive) {
      return json({ success: false, error: 'This staff account is inactive in POJ Management.' }, 403);
    }

    // 4. Upsert or find staff_access row on ManiPOS
    const existingStaffRes = await fetch(
      `${SUPABASE_URL}/rest/v1/staff_access?restaurant_id=eq.${restaurant.id}&email=ilike.${encodeURIComponent(email)}&select=id,auth_uid&limit=1`,
      { headers: adminHeaders }
    );
    const existingStaff = existingStaffRes.ok ? (await existingStaffRes.json())[0] : null;

    let staffAccessId: string | null = existingStaff?.id || null;
    if (!staffAccessId) {
      const insertStaffRes = await fetch(`${SUPABASE_URL}/rest/v1/staff_access`, {
        method: 'POST',
        headers: { ...adminHeaders, Prefer: 'return=representation' },
        body: JSON.stringify([{
          restaurant_id: restaurant.id,
          name: fullName,
          email,
          role,
          active: true,
          job_title: pojProfile.job_title || null,
          phone: pojProfile.phone || null,
          staff_code: pojProfile.staff_id || null,
          title: pojProfile.title || null,
          gender: pojProfile.gender || null,
          emergency_contact_name: pojProfile.emergency_contact_name || null,
          emergency_contact_phone: pojProfile.emergency_contact_phone || null,
          annual_leave_limit: pojProfile.annual_leave_limit ?? 21,
          sick_leave_limit: pojProfile.sick_leave_limit ?? 15,
          source_poj_id: String(pojProfile.id || pojUser.id),
          source_poj_user_id: String(pojUser.id),
        }]),
      });
      if (insertStaffRes.ok) {
        const created = await insertStaffRes.json();
        staffAccessId = created?.[0]?.id || null;
      }
    }

    // 5. Create or sync ManiPOS Supabase Auth user with identical password + tenant app_metadata
    const userPayload = {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        name: fullName,
        staff_id: staffAccessId,
        poj_user_id: pojUser.id,
      },
      app_metadata: {
        tenant_id: restaurant.id,
        tenant_name: restaurant.name,
        tenant_slug: restaurant.slug,
        role,
        staff_id: staffAccessId,
      },
    };

    let maniAuthUid: string | null = existingStaff?.auth_uid || null;
    if (maniAuthUid) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${maniAuthUid}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify(userPayload),
      });
    } else {
      const createAuthRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(userPayload),
      });
      if (createAuthRes.ok) {
        const createdUser = await createAuthRes.json();
        maniAuthUid = createdUser?.id || createdUser?.user?.id || null;
      } else {
        // Fallback: user may already exist in Auth without auth_uid linked -> look up by email
        const listRes = await fetch(
          `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50&filter=${encodeURIComponent(email)}`,
          { headers: adminHeaders }
        );
        if (listRes.ok) {
          const listJson = await listRes.json();
          const matched = (listJson?.users || []).find((u: { email?: string }) =>
            String(u.email || '').toLowerCase() === email
          );
          if (matched?.id) {
            maniAuthUid = matched.id;
            await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${maniAuthUid}`, {
              method: 'PUT',
              headers: adminHeaders,
              body: JSON.stringify(userPayload),
            });
          }
        }
      }
    }

    if (staffAccessId && maniAuthUid) {
      await fetch(`${SUPABASE_URL}/rest/v1/staff_access?id=eq.${staffAccessId}`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ auth_uid: maniAuthUid }),
      });
    }

    return json({
      success: true,
      provisioned: true,
      restaurant_id: restaurant.id,
      role,
    });
  } catch (err) {
    return json({ success: false, error: (err as Error)?.message || 'Auth bridge failed' }, 500);
  }
});
