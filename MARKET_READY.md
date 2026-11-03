# ManiPOS market-readiness report

## What “market ready” means here

A cloud POS provider is more than a register. ManiPOS now covers the full operating loop a restaurant needs on day one:

| Capability | Status | Where |
| --- | --- | --- |
| POS register with offline queue | Existing | `PosTerminal.jsx` |
| Kitchen display (KDS) | **New** | `KitchenDisplay.jsx`, `?page=kds` |
| Floor plan & reservations | **New** | `FloorPlanView.jsx`, `?page=floor` |
| Inventory, recipes & stock movements | **New** | `InventoryView.jsx`, `?page=inventory` |
| Public restaurant directory | **New** | `RestaurantDirectory.jsx`, `?page=restaurants` |
| Tenant-aware online menu | **Updated** | `UberEatsMicrosite.jsx` |
| Tenant provisioning | **New** | `tenantProvisioning.js`, `scripts/onboard-tenant.mjs` |
| Tenant config with DB + registry fallback | **New** | `tenantConfig.js`, `tenantRegistry.js` |
| Pricing, integrations, directory links | **Updated** | `LandingPage.jsx` |
| Status, privacy and terms pages | **New** | `PublicPages.jsx`, `?page=status/privacy/terms` |
| PWA manifest, service worker, offline page | **New** | `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html` |
| Neutral ManiPOS SEO | **Updated** | `index.html`, `robots.txt`, `sitemap.xml`, `llms.txt` |
| Hardened staff auth | **Updated** | `staffService.js`, `PinLogin.jsx`, migration RPC |
| Super-admin access via env / allow-list | **Updated** | `SuperAdminDashboard.jsx` |

## The `manipos.com` / `pojmanagement.com` split

The two domains were serving the same Pot of Jollof content. The correct separation is:

- **`manipos.com`** — ManiPOS the SaaS provider: marketing, pricing, integrations, restaurant directory, status, legal, staff sign-in and the platform console.
- **`pojmanagement.com` / `potofjollof.co.ke`** — Pot of Jollof as a *tenant*: its own brand, menu, domain and content. It should use ManiPOS for operations, not be served from the ManiPOS marketing apex.
- **Tenant subdomains** — `chopnownow.manipos.com`, `potofjollof.manipos.com`, etc.

What was wrong:

1. The deployed `manipos.com` bundle pointed at `bfrvzwmckuiafkgwemdt` (POJ’s single-tenant project) and shipped POJ-specific SEO/content.
2. The repo’s `.env` also points at that project while the code expects the SaaS schema.
3. Subdomains (`pos.manipos.com`, `chopnownow.manipos.com`) did not resolve.
4. The public SEO files in `public/` described Pot of Jollof on the ManiPOS domain.

What this change set does:

- Replaces the apex SEO and AI grounding files with ManiPOS content.
- Adds a redirect/host boundary so `manipos.com` and `www.manipos.com` always render the SaaS landing page unless explicitly scoped by `?tenant=`.
- Routes tenant menus through the tenant config loader.
- Documents the DNS records required for tenant subdomains.
- Provides an idempotent migration and seed for the SaaS project.

What still requires an operator:

1. Run the migration and seed against the SaaS Supabase project.
2. Point the production environment at that project (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Redeploy `manipos.com`.
4. Keep `pojmanagement.com` on its own deployment, or configure it as a tenant storefront.
5. Create the wildcard DNS records and TLS certificates.
6. Replace the Chop Now Now placeholder phone and M-Pesa details.

## Security changes

- Removed demo quick-fill accounts and default credentials from the login screen.
- Removed hardcoded password fallbacks (`1234`, `demostore2026`, …) from `staffService.js`.
- Removed the hardcoded super-admin passcodes (`7777`, `manipos2026`, `admin`). Access now requires `VITE_SUPER_ADMIN_EMAILS` or `VITE_SUPER_ADMIN_PASSCODE`, and the console verifies the passcode server-side against a bcrypt hash in `platform_settings`.
- Added a `SECURITY DEFINER` `verify_staff_login` RPC that hashes passwords with bcrypt and never returns PINs.
- Added tenant-scoped staff management RPCs (`staff_list`, `staff_upsert`, `staff_delete`, `verify_staff_pin`) that require an acting admin/manager and hash PINs server-side.
- Migration revokes direct `SELECT` on `staff_access` from `anon` and `authenticated`.
- Removed legacy catch-all RLS policies before reinstalling scoped ones.
- Added platform-console RPCs (`admin_list_restaurants`, `admin_update_restaurant_status`, `admin_extend_trial`) so tenant approval keeps working after `staff_access` and pending tenants are hidden from public reads.
- Removed unused receiver credentials from the tracked `.env`; `.env` is now gitignored. Rotate anything that was previously committed in git history.

### Known limitation to schedule next

The app’s staff session is still client-side (localStorage) and operational tables allow anon CRUD so existing terminals keep working. A future hardening sprint should move staff sessions to Supabase Auth/JWT and replace “allow all” operational policies with tenant-scoped claims. That is a larger auth migration and should be tested on a branch before production.

## Data and migration notes

- The live project mixes two order schemas. The migration adds the new columns, relaxes legacy `NOT NULL` requirements, and installs a trigger that fills `ticket_number`, `order_number` and `subtotal` for both old and new inserts.
- `pos_order_items` is used for line items; the old JSONB `items` column is retained for compatibility.
- `pos_menu` is now read by `tenantConfig.loadTenant`, so database menu edits reach the public site. The static registry is only a fallback.
- Ticket numbers come from `pos_ticket_seq`, starting at 1001.

## Testing performed

- `npm run build` passes.
- New modules are wired into `App.jsx` with query-string routes, so they work on localhost, `manipos.com` and tenant subdomains.
- The microsite now accepts a tenant prop, normalises tenant menus, and uses tenant branding, phone, paybill/account and WhatsApp number.
- Public legal/status pages render without authentication.
- Super admin no longer accepts a hardcoded passcode.

## Recommended launch sequence

1. Back up the SaaS project.
2. Run `20261103_market_ready.sql`.
3. Run `seed_chop_now_now.sql`.
4. Set production environment variables and redeploy.
5. Create DNS records for `chopnownow.manipos.com` and `chopnownow.pos.manipos.com`.
6. Walk the verification checklist in `ONBOARDING.md`.
7. Rotate the seeded owner password and set real payment details.
8. Keep `pojmanagement.com` as a separate tenant deployment.
