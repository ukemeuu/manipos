# ManiPOS Security Specification & Threat Model

This document outlines the security architecture, threat model, authentication mechanisms, and data isolation controls enforced across ManiPOS.

---

## 1. Security Architecture & Threat Model

| Threat Scenario | Risk Level | Defense Mechanism |
| :--- | :---: | :--- |
| **DevTools Tenant Manipulation** (`localStorage.setItem('restaurantId', ...)`)| **CRITICAL** | **Supabase Row-Level Security (RLS)** policies enforce tenant isolation at the database level. Changing client-side state returns 0 unauthorized database rows. |
| **Shared Auth Credential Leak** | **HIGH** | Hardcoded fallback logins (`receiver@poj.com`) eliminated. All staff log in via `verify_staff_pin` RPC function. |
| **Plaintext PIN Storage** | **HIGH** | PIN codes are stored as salted bcrypt hashes (`pin_hash`) using Postgres `pgcrypto`. |
| **Duplicate Order Billing** | **HIGH** | Every order contains a unique `idempotency_key` (UUID). Postgres enforces a `UNIQUE(idempotency_key)` constraint. |
| **Cashier Price & Discount Abuse** | **MEDIUM** | Cashier voids, refunds, custom discounts, and price overrides write immutable audit records to `public.audit_logs`. |

---

## 2. Row-Level Security (RLS) Policy Matrix

All multi-tenant database tables enforce RLS:

- `public.restaurants`
- `public.staff_access`
- `public.pos_orders`
- `public.pos_menu`
- `public.pos_shifts`
- `public.pos_categories`
- `public.pos_discounts`
- `public.menu_modifier_groups`
- `public.restaurant_settings`
- `public.suppliers`
- `public.audit_logs`

### Tenant isolation model

Every request carries the signed-in tenant's restaurant UUID in the
`x-tenant-id` header (`src/lib/supabase.js` → `setTenantContext()`). The
database-scoped policies in
`supabase/migrations/20261107_tenant_isolation_rls.sql` read that header and
deny access when it is missing or mismatched:

```sql
create or replace function public.current_tenant_id()
returns uuid language sql stable as $$
  select nullif(
    coalesce(current_setting('request.headers', true), '{}'::text)::jsonb
      ->> 'x-tenant-id',
    ''
  )::uuid
$$;

create policy "tenant isolate pos_orders" on public.pos_orders
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());
```

The app also scopes every query in code (`PosTerminal`, `AdminDashboard`,
`InventoryView`, `GuestCRMView`, `RestaurantLinkHub`, `FeedbackForm`), so a
missing header can never fall back to an unscoped query.

**Apply the migration** (Supabase SQL editor, on the SaaS project
`ptaqejtyhdbhmhrhuxcj`):

```
supabase/migrations/20261107_tenant_isolation_rls.sql
```

`public.restaurants` stays publicly readable so slugs can be resolved and the
directory works; all operational tables are tenant-scoped. Until the migration
is applied, the app-level scoping above is the enforced boundary.

> Long-term: move staff sessions to Supabase Auth and put `tenant_id` in the
> JWT claims, then replace the header lookup with
> `auth.jwt() ->> 'tenant_id'`. The header approach is a defence-in-depth
> measure for the current anonymous-key deployment.

### Staff Auth migration

The app now signs staff in with **Supabase Auth** first and falls back to the
legacy PIN RPC for accounts that have not been migrated.

```bash
# 1. Add the auth_uid column + JWT-aware RLS (already in the migration file).
# 2. Create the Auth users (server-side, with the service role key):
SUPABASE_URL=https://ptaqejtyhdbhmhrhuxcj.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/sync-staff-auth.mjs            # preview

SUPABASE_URL=https://ptaqejtyhdbhmhrhuxcj.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
node scripts/sync-staff-auth.mjs --apply    # create users
```

Each new Auth user gets:

- `app_metadata`: `{ tenant_id, tenant_slug, tenant_name, role, name }` —
  the JWT carries these claims and the RLS policies use `tenant_id`.
- a random temporary password + `user_metadata.must_change_password = true`,
  so the change-password screen appears on first sign-in.

After the migration, the RLS prefers the JWT claim over the header. Staff keep
working through the legacy RPC until their Auth account exists.

---

## 3. Staff Authentication Workflow

```
[Cashier/Manager] ──> Enter Tenant Slug & 4-Digit PIN
                              │
                              ▼
           Call RPC: verify_staff_pin(slug, pin)
                              │
                              ▼
            Postgres checks pgcrypto crypt hash
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
        [ Match Found ]             [ Invalid PIN ]
   Returns staff payload           Returns 401 Error
```

---

## 4. Secret & Environment Variable Policy

1. **Zero Hardcoded Secrets**: Source code files MUST NOT contain passwords, database secrets, or API tokens.
2. **Environment Variables**:
   - `VITE_SUPABASE_URL`: Public Supabase Project API URL.
   - `VITE_SUPABASE_ANON_KEY`: Public Supabase Anonymous Key (safe for frontend distribution).
