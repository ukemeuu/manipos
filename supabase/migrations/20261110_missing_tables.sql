-- ============================================================================
-- ManiPOS · Missing tables referenced by live application code
-- Date: 2026-11-10
--
-- These eleven tables were queried by the app but never created by a migration.
-- Schemas below are reconstructed from the actual .select()/.insert()/.upsert()
-- call sites. Every tenant-owned table follows the same shape as
-- 20261107_tenant_isolation_rls.sql:
--   * id uuid primary key default gen_random_uuid()
--   * restaurant_id uuid not null references public.restaurants(id)
--   * created_at (and updated_at where rows are mutated)
--   * RLS enabled + "tenant isolate <table>" policy
--
-- The write paths for guest_tags, guest_visits, pos_customer_addresses,
-- pos_channel_menu_overrides, saved_qrcodes, expense_items, delivery_fees and
-- qr_scans do not send restaurant_id explicitly. restaurant_id therefore gets
-- a DEFAULT public.current_tenant_id() so those inserts still satisfy the
-- NOT NULL column and the tenant policy. The anon/authenticated client sends
-- the x-tenant-id header (src/lib/supabase.js).
--
-- menu_images is intentionally NOT created as a table. It is only used with
-- supabase.storage (MenuBuilder.jsx:329-331, PosTerminal.jsx:991-995); the
-- public storage bucket already exists in 20261107_menu_builder.sql.
--
-- Idempotent: safe to run repeatedly.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Shared updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.manipos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. expenses (parent)
--    Evidence: src/components/AddExpenseModal.jsx:299-304 (supplier read),
--    460-481 (insert: date, purchase_date, description, amount, quantity,
--    unit, receipt_url, captured_by, category, expense_type, supplier,
--    payment_method, director_name, vat_included, vat_exclusive, vat_amount,
--    taxable_amount)
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  date date,
  purchase_date date,
  description text,
  amount numeric(12,2) not null default 0,
  quantity numeric(12,2) not null default 1,
  unit text,
  receipt_url text,
  captured_by text,
  category text,
  expense_type text default 'OPEX',
  supplier text,
  payment_method text default 'Cash',
  director_name text,
  vat_included boolean not null default false,
  vat_exclusive boolean not null default false,
  vat_amount numeric(12,2) not null default 0,
  taxable_amount numeric(12,2),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists expenses_tenant_idx
  on public.expenses (restaurant_id, date desc);
create index if not exists expenses_supplier_idx
  on public.expenses (supplier);

alter table public.expenses enable row level security;
drop policy if exists "tenant isolate expenses" on public.expenses;
create policy "tenant isolate expenses"
  on public.expenses
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 2. expense_items
--    Evidence: src/components/AddExpenseModal.jsx:425-430 and 439-445 build
--    item rows (item_name, quantity, unit, unit_price, category), then
--    491-498 insert them with expense_id.
-- ----------------------------------------------------------------------------
create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  item_name text not null,
  quantity numeric(12,2) not null default 1,
  unit text,
  unit_price numeric(12,2) not null default 0,
  category text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists expense_items_tenant_idx
  on public.expense_items (restaurant_id);
create index if not exists expense_items_expense_idx
  on public.expense_items (expense_id);

alter table public.expense_items enable row level security;
drop policy if exists "tenant isolate expense_items" on public.expense_items;
create policy "tenant isolate expense_items"
  on public.expense_items
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 3. delivery_fees (transport/logistics ledger written by the expense flow)
--    Evidence: src/components/AddExpenseModal.jsx:32-41, 51-57 and 68-75
--    (fee_type, amount, date, supplier_or_partner, reference_id,
--    is_included_in_bill, payment_status, notes).
-- ----------------------------------------------------------------------------
create table if not exists public.delivery_fees (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  fee_type text,
  amount numeric(12,2) not null default 0,
  date date,
  supplier_or_partner text,
  reference_id text,
  is_included_in_bill boolean not null default false,
  payment_status text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists delivery_fees_tenant_idx
  on public.delivery_fees (restaurant_id, date desc);
create index if not exists delivery_fees_reference_idx
  on public.delivery_fees (reference_id);

alter table public.delivery_fees enable row level security;
drop policy if exists "tenant isolate delivery_fees" on public.delivery_fees;
create policy "tenant isolate delivery_fees"
  on public.delivery_fees
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 4. guest_tags
--    Evidence: src/components/GuestCRMView.jsx:243 (embedded select id,
--    tag_name, color), 301 (delete by guest_id), 334-339 (insert guest_id,
--    tag_name, color). The PostgREST embed requires guest_id -> guests(id).
-- ----------------------------------------------------------------------------
create table if not exists public.guest_tags (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  tag_name text not null,
  color text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists guest_tags_tenant_idx
  on public.guest_tags (restaurant_id);
create index if not exists guest_tags_guest_idx
  on public.guest_tags (guest_id);
-- The CRM deletes and re-inserts a guest's whole tag list, so guard against
-- duplicates when two staff windows race.
create unique index if not exists guest_tags_guest_tag_key
  on public.guest_tags (guest_id, tag_name);

alter table public.guest_tags enable row level security;
drop policy if exists "tenant isolate guest_tags" on public.guest_tags;
create policy "tenant isolate guest_tags"
  on public.guest_tags
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 5. guest_visits
--    Evidence: src/components/GuestCRMView.jsx:349-355 (guest_id, visit_date,
--    spend, table_number, notes); src/components/PosTerminal.jsx:619-624
--    (guest_id, visit_date ISO timestamp, spend, notes);
--    src/components/MenuMicrosite.jsx:1606-1612 (guest_id, spend,
--    table_number, notes).
-- ----------------------------------------------------------------------------
create table if not exists public.guest_visits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  visit_date timestamptz not null default timezone('utc', now()),
  spend numeric(12,2) not null default 0,
  table_number text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists guest_visits_tenant_idx
  on public.guest_visits (restaurant_id, visit_date desc);
create index if not exists guest_visits_guest_idx
  on public.guest_visits (guest_id, visit_date desc);

alter table public.guest_visits enable row level security;
drop policy if exists "tenant isolate guest_visits" on public.guest_visits;
create policy "tenant isolate guest_visits"
  on public.guest_visits
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 6. influencer_codes (read when validating a promo code on the microsite)
--    Evidence: src/components/UberEatsMicrosite.jsx:1018-1022 selects id,
--    influencer_id, commission_rate, code, discount_type, discount_value,
--    is_active, min_order_amount. No write path exists in the repo.
-- ----------------------------------------------------------------------------
create table if not exists public.influencer_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  influencer_id uuid,
  code text not null,
  commission_rate numeric(5,2) not null default 5,
  discount_type text not null default 'percentage',
  discount_value numeric(12,2) not null default 0,
  min_order_amount numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists influencer_codes_tenant_idx
  on public.influencer_codes (restaurant_id);
create unique index if not exists influencer_codes_tenant_code_key
  on public.influencer_codes (restaurant_id, code);
create index if not exists influencer_codes_code_idx
  on public.influencer_codes (code);

drop trigger if exists influencer_codes_touch_updated_at on public.influencer_codes;
create trigger influencer_codes_touch_updated_at
  before insert or update on public.influencer_codes
  for each row execute function public.manipos_touch_updated_at();

alter table public.influencer_codes enable row level security;
drop policy if exists "tenant isolate influencer_codes" on public.influencer_codes;
create policy "tenant isolate influencer_codes"
  on public.influencer_codes
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 7. pos_channel_menu_overrides
--    Evidence: src/components/PosTerminal.jsx:11180-11183 (select * by
--    channel_id), 11275-11282 (channel_id, menu_item_id, is_available,
--    off_reason, off_duration, price_markup_value), 11286 (upsert conflict
--    target channel_id,menu_item_id), 11507-11537 (reads the same fields).
-- ----------------------------------------------------------------------------
create table if not exists public.pos_channel_menu_overrides (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  channel_id uuid not null references public.pos_channels(id) on delete cascade,
  menu_item_id uuid not null references public.pos_menu(id) on delete cascade,
  is_available boolean not null default true,
  off_reason text,
  off_duration text,
  price_markup_value numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists pos_channel_menu_overrides_tenant_idx
  on public.pos_channel_menu_overrides (restaurant_id);
create unique index if not exists pos_channel_menu_overrides_channel_item_key
  on public.pos_channel_menu_overrides (channel_id, menu_item_id);
create index if not exists pos_channel_menu_overrides_item_idx
  on public.pos_channel_menu_overrides (menu_item_id);

drop trigger if exists pos_channel_menu_overrides_touch_updated_at on public.pos_channel_menu_overrides;
create trigger pos_channel_menu_overrides_touch_updated_at
  before insert or update on public.pos_channel_menu_overrides
  for each row execute function public.manipos_touch_updated_at();

alter table public.pos_channel_menu_overrides enable row level security;
drop policy if exists "tenant isolate pos_channel_menu_overrides" on public.pos_channel_menu_overrides;
create policy "tenant isolate pos_channel_menu_overrides"
  on public.pos_channel_menu_overrides
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 8. pos_customer_addresses
--    Evidence: src/components/PosTerminal.jsx:1068-1072 (select address by
--    customer_name), 3257-3262 (upsert customer_name, address with
--    onConflict: 'customer_name'). The onConflict target requires a unique
--    index on customer_name exactly.
-- ----------------------------------------------------------------------------
create table if not exists public.pos_customer_addresses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  customer_name text not null,
  address text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists pos_customer_addresses_tenant_idx
  on public.pos_customer_addresses (restaurant_id);
-- Matches the app's upsert({ onConflict: 'customer_name' }).
--
-- Known limitation: this makes customer names globally unique, so two tenants
-- cannot each store "john". The second save is rejected by RLS (caught and
-- logged by the app, so checkout still proceeds). Fixing it properly means
-- switching the app's conflict target to (restaurant_id, customer_name).
create unique index if not exists pos_customer_addresses_customer_name_key
  on public.pos_customer_addresses (customer_name);

drop trigger if exists pos_customer_addresses_touch_updated_at on public.pos_customer_addresses;
create trigger pos_customer_addresses_touch_updated_at
  before insert or update on public.pos_customer_addresses
  for each row execute function public.manipos_touch_updated_at();

alter table public.pos_customer_addresses enable row level security;
drop policy if exists "tenant isolate pos_customer_addresses" on public.pos_customer_addresses;
create policy "tenant isolate pos_customer_addresses"
  on public.pos_customer_addresses
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 9. qr_scans
--    Evidence: src/lib/qrScanService.js:107-120 (payload shape) and 133-145
--    (insert: qr_code_id, qr_label, destination_url, device_type, channel,
--    order_id, ticket_number, user_agent, referrer, session_id, scanned_at);
--    175-178 orders/fetches by scanned_at; 267-283 reads qr_label,
--    qr_code_id, session_id, device_type, channel.
-- ----------------------------------------------------------------------------
create table if not exists public.qr_scans (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  qr_code_id text,
  qr_label text,
  destination_url text,
  device_type text,
  channel text,
  order_id text,
  ticket_number text,
  user_agent text,
  referrer text,
  session_id text,
  scanned_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists qr_scans_tenant_idx
  on public.qr_scans (restaurant_id, scanned_at desc);
create index if not exists qr_scans_code_idx
  on public.qr_scans (qr_code_id);
create index if not exists qr_scans_session_idx
  on public.qr_scans (session_id);

alter table public.qr_scans enable row level security;
drop policy if exists "tenant isolate qr_scans" on public.qr_scans;
create policy "tenant isolate qr_scans"
  on public.qr_scans
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- 10. saved_qrcodes
--     Evidence: src/components/QRCodeGeneratorView.jsx:41-44 (select *,
--     order created_at), 79-87 (update label, url, qr_url), 90-96 (insert
--     label, url, qr_url), 409 (reads created_at), 438 (reads qr_url),
--     228 (reads scan_count).
-- ----------------------------------------------------------------------------
create table if not exists public.saved_qrcodes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null default public.current_tenant_id()
    references public.restaurants(id) on delete cascade,
  label text not null,
  url text not null,
  qr_url text,
  scan_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists saved_qrcodes_tenant_idx
  on public.saved_qrcodes (restaurant_id, created_at desc);

drop trigger if exists saved_qrcodes_touch_updated_at on public.saved_qrcodes;
create trigger saved_qrcodes_touch_updated_at
  before insert or update on public.saved_qrcodes
  for each row execute function public.manipos_touch_updated_at();

alter table public.saved_qrcodes enable row level security;
drop policy if exists "tenant isolate saved_qrcodes" on public.saved_qrcodes;
create policy "tenant isolate saved_qrcodes"
  on public.saved_qrcodes
  for all to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

commit;
