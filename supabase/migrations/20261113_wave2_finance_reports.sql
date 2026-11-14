-- ============================================================================
-- ManiPOS · Wave 2 Orda Clone Schema
-- Dynamic Additional Charges & Taxes Engine, EOD 6am-6am Report History,
-- POS Device Heartbeats, Void Disposition & Order Financial Audit Columns.
-- Strictly additive & safe for all live tenants.
-- ============================================================================

-- 1. Dynamic Additional Charges / Tax Engine
create table if not exists public.order_charges (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    title varchar(30) not null,
    charge_type text not null default 'percent' check (charge_type in ('fixed', 'percent')),
    charge_value numeric(10,2) not null default 0,
    is_tax_charge boolean not null default false,
    order_methods jsonb not null default '[]'::jsonb,
    payment_methods jsonb not null default '[]'::jsonb,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists order_charges_restaurant_idx on public.order_charges (restaurant_id, is_active);

-- 2. Applied Order Charge Line Ledger (for Tax & Charges Report)
create table if not exists public.order_charge_lines (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    order_id uuid references public.pos_orders(id) on delete cascade,
    charge_id uuid references public.order_charges(id) on delete set null,
    title text not null,
    is_tax_charge boolean not null default false,
    is_percentage_charge boolean not null default false,
    charge_percent numeric(10,4) default 0,
    base_charge_value numeric(10,2) default 0,
    charge_value numeric(10,2) not null default 0,
    base_grand_total numeric(12,2) default 0,
    source text default 'POS',
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists order_charge_lines_restaurant_idx on public.order_charge_lines (restaurant_id, created_at desc);

-- 3. End of Day (6am-6am) Generated Reports Archive
create table if not exists public.eod_reports (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    report_date date not null,
    generated_by text,
    email_sent_to text,
    file_name text not null,
    sections_included jsonb not null default '[]'::jsonb,
    summary_json jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists eod_reports_restaurant_idx on public.eod_reports (restaurant_id, report_date desc);

-- 4. POS Devices & Terminal Sync Registry
create table if not exists public.pos_devices (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    device_id text not null,
    device_label text not null,
    device_model text,
    app_source text default 'Web POS',
    ip_address text,
    status text not null default 'online',
    connected_at timestamptz default timezone('utc', now()),
    last_seen timestamptz default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pos_devices_restaurant_idx on public.pos_devices (restaurant_id, status);

-- 5. Extend restaurant_settings for Order Methods, Void Controls, Delivery Brackets & Payment Matrix
alter table public.restaurant_settings add column if not exists void_completed_allowed boolean not null default true;
alter table public.restaurant_settings add column if not exists void_window_hours integer not null default 168;
alter table public.restaurant_settings add column if not exists whatsapp_forwarding_enabled boolean not null default false;
alter table public.restaurant_settings add column if not exists whatsapp_forwarding_number text;
alter table public.restaurant_settings add column if not exists allow_negative_store_credit boolean not null default false;
alter table public.restaurant_settings add column if not exists prep_time_minutes integer not null default 35;
alter table public.restaurant_settings add column if not exists delivery_fee_brackets jsonb not null default '[]'::jsonb;
alter table public.restaurant_settings add column if not exists payment_tenders_config jsonb not null default '[]'::jsonb;
alter table public.restaurant_settings add column if not exists payout_account jsonb not null default '{}'::jsonb;

-- 6. Extend pos_orders for Tax/Charges Breakdown, Ideal Cost, Commission & Void Disposition
alter table public.pos_orders add column if not exists tax_amount numeric(10,2) default 0;
alter table public.pos_orders add column if not exists charges_amount numeric(10,2) default 0;
alter table public.pos_orders add column if not exists charges_breakdown jsonb not null default '[]'::jsonb;
alter table public.pos_orders add column if not exists aggregator_commission numeric(10,2) default 0;
alter table public.pos_orders add column if not exists ideal_food_cost numeric(10,2) default 0;
alter table public.pos_orders add column if not exists failure_reason text;
alter table public.pos_orders add column if not exists void_disposition jsonb not null default '[]'::jsonb;
alter table public.pos_orders add column if not exists sync_to_kds boolean not null default true;

-- 7. Tenant Isolation RLS Policies
alter table public.order_charges enable row level security;
alter table public.order_charge_lines enable row level security;
alter table public.eod_reports enable row level security;
alter table public.pos_devices enable row level security;

drop policy if exists "order_charges_public_read" on public.order_charges;
drop policy if exists "order_charges_tenant_write" on public.order_charges;
create policy "order_charges_public_read" on public.order_charges
    for select to anon, authenticated
    using (restaurant_id = public.current_tenant_id() or is_active = true);
create policy "order_charges_tenant_write" on public.order_charges
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "order_charge_lines_tenant_isolation" on public.order_charge_lines;
create policy "order_charge_lines_tenant_isolation" on public.order_charge_lines
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "eod_reports_tenant_isolation" on public.eod_reports;
create policy "eod_reports_tenant_isolation" on public.eod_reports
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "pos_devices_tenant_isolation" on public.pos_devices;
create policy "pos_devices_tenant_isolation" on public.pos_devices
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());
