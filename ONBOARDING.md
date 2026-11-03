# Onboarding a restaurant on ManiPOS

This guide is the operational runbook for adding a new tenant such as **Chop Now Now**. It assumes you have access to the Supabase project that backs ManiPOS.

## 0. Prerequisites

- A Supabase project that contains the SaaS schema (`restaurants`, `restaurant_settings`, `staff_access`, `pos_menu`, `pos_orders`, …).
- The service-role key for that project (server-side only).
- Node 18+ if you use the onboarding script.
- DNS control for `manipos.com` if you are enabling tenant subdomains.

> If your `.env` still points at a legacy single-tenant project (for example `bfrvzwmckuiafkgwemdt`), apply the migration to the SaaS project and switch `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` first. The code expects the multi-tenant schema.

## 1. Apply the market-ready migration

Open **Supabase → SQL Editor** and run:

```
supabase/migrations/20261103_market_ready.sql
```

The migration is idempotent. It:

- adds missing tenant, order, menu, inventory, floor, reservation and CRM columns;
- creates the operational tables used by the KDS, floor plan and inventory views;
- creates the `verify_staff_login` and `create_new_restaurant_tenant` RPCs;
- removes legacy catch-all RLS policies and revokes direct reads on `staff_access`;
- installs the order ticket trigger and indexes.

Verify with:

```sql
select column_name from information_schema.columns
where table_name = 'restaurants' order by ordinal_position;
```

You should see `status`, `is_active`, `plan`, `cuisine`, `trial_ends_at`.

## 2. Seed Chop Now Now

Run:

```
supabase/seed_chop_now_now.sql
```

This creates or updates:

- the `chopnownow` tenant, approved and active;
- restaurant settings, brand colours and opening hours;
- the owner account `admin@chopnownow.com` with a bcrypt-hashed password;
- 43 menu items across 7 categories;
- 9 floor tables, 10 inventory items, recipe links and a `WELCOME10` promo.

**Change the seeded password immediately after the first sign-in.** The seed password is documented only for bootstrap and should be rotated in production.

## 3. Alternative: script-based onboarding

For tenants after Chop Now Now, use the manifest + script flow:

```bash
cp .env.example .env
# add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (never VITE_ prefixed)

npm run onboard -- src/data/tenants/chopnownow.json --dry-run
npm run onboard -- src/data/tenants/chopnownow.json
```

The script is idempotent for the tenant row, settings, menu, categories, tables and inventory. Owner credentials are intentionally handled by SQL because bcrypt hashing belongs in Postgres.

## 4. Configure the platform owner console

The super-admin console verifies its passcode server-side. Replace the seeded
placeholder before launch:

```sql
update public.platform_settings
set value = crypt('YOUR_STRONG_PASSCODE', gen_salt('bf')),
    updated_at = timezone('utc', now())
where key = 'super_admin_passcode';
```

Set the same value in the production environment:

```
VITE_SUPER_ADMIN_PASSCODE=YOUR_STRONG_PASSCODE
```

Alternatively, sign in with a Supabase-authenticated email listed in
`VITE_SUPER_ADMIN_EMAILS`. The passcode is a fallback, not the primary control.

## 5. Configure the tenant

After the seed:

1. Sign in at `/?page=pos&tenant=chopnownow` with the owner account.
2. Open **Management Dashboard**.
3. Set the real phone/WhatsApp number, address, M-Pesa paybill and account.
4. Upload or confirm the logo and cover image.
5. Review menu prices and availability.
6. Invite staff from **Staff & Access** with individual accounts (do not share the owner login).
7. Confirm the floor plan and reservation settings.

The static registry at `src/data/tenantRegistry.js` is only a fallback for public menus during an outage. Database values always win once the migration and seed have run.

## 6. Public URLs

| Surface | URL |
| --- | --- |
| Guest menu | `https://chopnownow.manipos.com` |
| Staff POS | `https://chopnownow.pos.manipos.com` |
| Shared directory | `https://manipos.com/?page=restaurants` |
| KDS | `https://manipos.com/?page=kds&tenant=chopnownow` |
| Floor | `https://manipos.com/?page=floor&tenant=chopnownow` |
| Inventory | `https://manipos.com/?page=inventory&tenant=chopnownow` |

For local development, use query parameters:

```
http://localhost:5173/?page=menu&tenant=chopnownow
http://localhost:5173/?page=pos&tenant=chopnownow
```

## 7. DNS and subdomains

Tenant subdomains must resolve before the URLs above work in production:

```
chopnownow.manipos.com          CNAME  <your-host>
chopnownow.pos.manipos.com      CNAME  <your-host>
*.manipos.com                   CNAME  <your-host>   # wildcard, optional
*.pos.manipos.com               CNAME  <your-host>   # wildcard, optional
```

Add both apex and wildcard domains to your hosting provider (Vercel/Netlify/Cloudflare) and issue TLS certificates. The SPA uses `getTenantInfo()` to detect the tenant from the subdomain.

Until DNS is ready, `?page=menu&tenant=<slug>` works on any domain.

## 8. Payments

Chop Now Now's real M-Pesa paybill and account are **not** included in the repository. Set them in:

- `restaurant_settings.mpesa_paybill` / `mpesa_account`, and
- `pos_channels` for the `whatsapp` channel.

Until they are set, the guest checkout displays “pay on delivery or at the counter” and lets the customer submit a confirmation code. Do not publish a placeholder paybill.

## 9. Verification checklist

- [ ] `npm run build` passes.
- [ ] `https://chopnownow.manipos.com` shows the Chop Now Now menu, logo and colours.
- [ ] Staff login works with the owner account.
- [ ] KDS shows a test order and can advance it to Ready.
- [ ] Guest order creates a `pos_orders` row and line items.
- [ ] Inventory low-stock badges appear.
- [ ] A reservation can be created and confirmed.
- [ ] Super admin can see and approve the tenant.
- [ ] `staff_access` cannot be read with the anon key.
- [ ] `robots.txt`, `sitemap.xml` and `llms.txt` describe ManiPOS, not a single tenant.
