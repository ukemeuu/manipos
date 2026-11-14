-- ============================================================================
-- ManiPOS · Wave 3 Orda Clone Schema
-- Customers CRM, Store Credit Wallet Ledger, 5-Rule Promotions Engine,
-- Vouchers, Loyalty Programs & Logs, Campaigns, Geo-Delivery Polygon Zones.
-- Strictly additive & fail-safe for live restaurants.
-- ============================================================================

-- 1. Extend guests table for CRM, KRA Pin, Country Code, Loyalty & Wallet
alter table public.guests add column if not exists kra_pin text;
alter table public.guests add column if not exists country_code text default 'KE';
alter table public.guests add column if not exists store_credit_balance numeric(12,2) not null default 0;
alter table public.guests add column if not exists loyalty_points integer not null default 0;
alter table public.guests add column if not exists birthday date;

-- 2. Customer Store Credit Ledger (Credits, Debits & Order Settlement History)
create table if not exists public.guest_store_credit_ledger (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    guest_id uuid not null references public.guests(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    entry_type text not null check (entry_type in ('credit', 'debit')),
    amount numeric(12,2) not null check (amount >= 0),
    balance_after numeric(12,2) not null default 0,
    remark text,
    order_id uuid references public.pos_orders(id) on delete set null,
    staff_name text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists guest_store_credit_ledger_idx
    on public.guest_store_credit_ledger (restaurant_id, guest_id, created_at desc);

-- 3. Customer Vouchers
create table if not exists public.vouchers (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    code text not null,
    name text not null,
    description text,
    amount numeric(12,2) not null default 0,
    remaining_amount numeric(12,2) not null default 0,
    starts_at timestamptz,
    has_expiry boolean not null default false,
    expires_at timestamptz,
    is_active boolean not null default true,
    is_redeemed boolean not null default false,
    redeemed_order_id uuid references public.pos_orders(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists vouchers_restaurant_code_idx
    on public.vouchers (restaurant_id, lower(code));

-- 4. Loyalty Programs & Points Ledger
create table if not exists public.loyalty_programs (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    name text not null,
    description text,
    starts_at timestamptz,
    has_expiry boolean not null default false,
    expires_at timestamptz,
    rate_amount numeric(12,2) not null default 100,
    points_per_unit integer not null default 1,
    min_order_value numeric(12,2) not null default 0,
    fulfilment_types jsonb not null default '[]'::jsonb,
    payment_options jsonb not null default '[]'::jsonb,
    enable_menu_category boolean not null default false,
    category_names jsonb not null default '[]'::jsonb,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists loyalty_programs_restaurant_idx
    on public.loyalty_programs (restaurant_id, is_active);

create table if not exists public.loyalty_logs (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    guest_id uuid not null references public.guests(id) on delete cascade,
    program_id uuid references public.loyalty_programs(id) on delete set null,
    order_id uuid references public.pos_orders(id) on delete set null,
    points_delta integer not null default 0,
    cash_value numeric(12,2) default 0,
    entry_type text not null default 'earn' check (entry_type in ('earn', 'redeem', 'adjust')),
    remark text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists loyalty_logs_guest_idx
    on public.loyalty_logs (restaurant_id, guest_id, created_at desc);

-- 5. Targeted SMS & Email Campaigns Log
create table if not exists public.customer_campaigns (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    target_group text not null default 'all',
    send_email boolean not null default false,
    send_sms boolean not null default true,
    headline text,
    message text not null,
    recipient_count integer not null default 0,
    status text not null default 'queued',
    created_by text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_campaigns_restaurant_idx
    on public.customer_campaigns (restaurant_id, created_at desc);

-- 6. Extend pos_discounts for Orda 5 Promotion Rule Types & Restrictions
alter table public.pos_discounts add column if not exists promo_rule_type text default 'cart_percent';
alter table public.pos_discounts add column if not exists max_discount_value numeric(12,2);
alter table public.pos_discounts add column if not exists fulfilment_types jsonb not null default '[]'::jsonb;
alter table public.pos_discounts add column if not exists payment_options jsonb not null default '[]'::jsonb;
alter table public.pos_discounts add column if not exists usage_per_customer integer;
alter table public.pos_discounts add column if not exists max_total_uses integer;
alter table public.pos_discounts add column if not exists current_uses integer not null default 0;
alter table public.pos_discounts add column if not exists use_custom_code boolean not null default true;
alter table public.pos_discounts add column if not exists starts_at timestamptz;
alter table public.pos_discounts add column if not exists has_expiry boolean not null default false;

-- 7. Delivery Zones (Google Map Polygon GeoJSON + Fee Per Zone Per Location)
create table if not exists public.delivery_zones (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    caption text not null,
    delivery_fee numeric(10,2) not null default 0,
    polygon_geojson jsonb not null default '[]'::jsonb,
    center_lat double precision,
    center_lng double precision,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists delivery_zones_restaurant_idx
    on public.delivery_zones (restaurant_id, branch_id, is_active);

-- 8. Extend restaurant_settings & branches & pos_orders for Wave 3 flags
alter table public.restaurant_settings add column if not exists enable_delivery_zones boolean not null default false;
alter table public.restaurant_settings add column if not exists enable_table_selection_microsite boolean not null default false;
alter table public.branches add column if not exists enable_delivery_zones boolean not null default false;

alter table public.pos_orders add column if not exists voucher_id uuid;
alter table public.pos_orders add column if not exists voucher_code text;
alter table public.pos_orders add column if not exists voucher_amount numeric(10,2) default 0;
alter table public.pos_orders add column if not exists store_credit_used numeric(10,2) default 0;
alter table public.pos_orders add column if not exists loyalty_points_earned integer default 0;
alter table public.pos_orders add column if not exists loyalty_points_redeemed integer default 0;
alter table public.pos_orders add column if not exists delivery_zone_id uuid;

-- 9. Strict Tenant Isolation RLS Policies
alter table public.guest_store_credit_ledger enable row level security;
alter table public.vouchers enable row level security;
alter table public.loyalty_programs enable row level security;
alter table public.loyalty_logs enable row level security;
alter table public.customer_campaigns enable row level security;
alter table public.delivery_zones enable row level security;

drop policy if exists "guest_store_credit_ledger_tenant_isolation" on public.guest_store_credit_ledger;
create policy "guest_store_credit_ledger_tenant_isolation" on public.guest_store_credit_ledger
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "vouchers_public_read" on public.vouchers;
drop policy if exists "vouchers_tenant_write" on public.vouchers;
create policy "vouchers_public_read" on public.vouchers
    for select to anon, authenticated
    using (restaurant_id = public.current_tenant_id() or is_active = true);
create policy "vouchers_tenant_write" on public.vouchers
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "loyalty_programs_public_read" on public.loyalty_programs;
drop policy if exists "loyalty_programs_tenant_write" on public.loyalty_programs;
create policy "loyalty_programs_public_read" on public.loyalty_programs
    for select to anon, authenticated
    using (restaurant_id = public.current_tenant_id() or is_active = true);
create policy "loyalty_programs_tenant_write" on public.loyalty_programs
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "loyalty_logs_tenant_isolation" on public.loyalty_logs;
create policy "loyalty_logs_tenant_isolation" on public.loyalty_logs
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "customer_campaigns_tenant_isolation" on public.customer_campaigns;
create policy "customer_campaigns_tenant_isolation" on public.customer_campaigns
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "delivery_zones_public_read" on public.delivery_zones;
drop policy if exists "delivery_zones_tenant_write" on public.delivery_zones;
create policy "delivery_zones_public_read" on public.delivery_zones
    for select to anon, authenticated
    using (restaurant_id = public.current_tenant_id() or is_active = true);
create policy "delivery_zones_tenant_write" on public.delivery_zones
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());
