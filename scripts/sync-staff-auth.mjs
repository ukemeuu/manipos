#!/usr/bin/env node
/**
 * Migrate staff_access accounts to Supabase Auth.
 *
 * For every active staff member this creates (or updates) a Supabase Auth user
 * whose `app_metadata` carries the tenant claim used by the RLS policies:
 *
 *   app_metadata: { tenant_id, tenant_slug, role, name }
 *
 * Each new user gets a random temporary password and
 * `user_metadata.must_change_password = true`, which forces the change-password
 * screen on first sign-in.
 *
 * Usage:
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node scripts/sync-staff-auth.mjs            # preview (no changes)
 *   node scripts/sync-staff-auth.mjs --apply    # create/update users
 *
 * The service role key stays on the server — never commit it or send it to the
 * browser.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side) first.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- Load tenants -----------------------------------------------------------

const { data: tenants, error: tenantError } = await supabase
  .from('restaurants')
  .select('id, slug, name');

if (tenantError) {
  console.error('Failed to load restaurants:', tenantError.message);
  process.exit(1);
}
const tenantMap = new Map((tenants || []).map((t) => [t.id, t]));

// --- Load staff -------------------------------------------------------------

// auth_uid is added by the tenant-isolation migration; tolerate its absence.
let staffColumns = 'id, restaurant_id, name, email, role, active';
const { data: probe } = await supabase.from('staff_access').select('auth_uid').limit(1);
const hasAuthUid = probe !== null;
if (hasAuthUid) staffColumns += ', auth_uid';

const { data: staff, error: staffError } = await supabase
  .from('staff_access')
  .select(staffColumns)
  .eq('active', true)
  .not('email', 'is', null);

if (staffError) {
  console.error('Failed to load staff_access:', staffError.message);
  process.exit(1);
}

console.log(`Found ${staff.length} active staff accounts. Mode: ${APPLY ? 'APPLY' : 'PREVIEW'}\n`);

// --- Existing Auth users ----------------------------------------------------

const existingUsers = [];
let page = 1;
while (true) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error('Failed to list Auth users:', error.message);
    process.exit(1);
  }
  existingUsers.push(...(data?.users || []));
  if (!data?.users?.length || data.users.length < 1000) break;
  page += 1;
}
const authByEmail = new Map(existingUsers.map((u) => [u.email?.toLowerCase(), u]));

// --- Sync -------------------------------------------------------------------

const results = [];

for (const s of staff) {
  const tenant = tenantMap.get(s.restaurant_id);
  const appMetadata = {
    tenant_id: s.restaurant_id,
    tenant_slug: tenant?.slug || '',
    tenant_name: tenant?.name || '',
    role: s.role,
    name: s.name,
  };

  const existing = authByEmail.get(s.email.toLowerCase());

  if (existing) {
    console.log(`~ ${s.email} — Auth user exists (${existing.id}), updating claims`);
    if (APPLY) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        app_metadata: appMetadata,
        user_metadata: { ...(existing.user_metadata || {}), staff_id: s.id },
      });
      if (error) {
        results.push({ email: s.email, tenant: tenant?.slug, error: error.message });
        continue;
      }
      if (hasAuthUid) {
        const { error: linkErr } = await supabase.from('staff_access').update({ auth_uid: existing.id }).eq('id', s.id);
        if (linkErr) console.error(`  ✗ failed to link auth_uid: ${linkErr.message}`);
      }
    }
    results.push({ email: s.email, tenant: tenant?.slug, tempPassword: '(existing password)' });
    continue;
  }

  const tempPassword = `Temp-${randomBytes(4).toString('hex')}!`;

  console.log(`+ ${s.email} — will create Auth user (tenant: ${tenant?.slug || 'unknown'})`);
  if (APPLY) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: s.email,
      password: tempPassword,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { must_change_password: true, staff_id: s.id },
    });

    if (createError) {
      console.error(`  ✗ ${createError.message}`);
      results.push({ email: s.email, tenant: tenant?.slug, error: createError.message });
      continue;
    }

    if (hasAuthUid) {
      const { error: linkError } = await supabase
        .from('staff_access')
        .update({ auth_uid: created.user.id })
        .eq('id', s.id);

      if (linkError) {
        console.error(`  ✗ failed to link auth_uid: ${linkError.message}`);
        results.push({ email: s.email, tenant: tenant?.slug, error: linkError.message });
        continue;
      }
    }

    results.push({ email: s.email, tenant: tenant?.slug, tempPassword });
  } else {
    results.push({ email: s.email, tenant: tenant?.slug, tempPassword: '(preview)' });
  }
}

// --- Summary ----------------------------------------------------------------

console.log('\n=== Summary ===');
for (const r of results) {
  console.log(
    `${r.email} | tenant: ${r.tenant || '-'} | temp password: ${r.tempPassword || '-'}${r.error ? ' | ERROR: ' + r.error : ''}`
  );
}

if (!APPLY) {
  console.log('\nPreview only. Re-run with --apply to create the accounts.');
} else {
  console.log('\nDone. Share each temporary password with the member; they will be asked to set a new one on first sign-in.');
}

process.exit(0);
