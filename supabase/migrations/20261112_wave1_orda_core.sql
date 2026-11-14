-- ============================================================================
-- ManiPOS · Wave 1 Orda Clone Core Schema
-- Multi-Location Branches, Menu Groups, Combos, Rich Menu Items/Variations/
-- Additions/Special Pricing, Multi-Select Modifiers, Order Channels, & SEO.
-- Safe & additive for all live tenants.
-- ============================================================================

-- 1. Multi-Branch / Locations
create table if not exists public.branches (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    name text not null,
    slug text,
    phone text,
    address text,
    city text,
    country text default 'Kenya',
    landmark text,
    status text not null default 'active',
    is_default boolean not null default false,
    delivery_enabled boolean not null default true,
    pickup_enabled boolean not null default true,
    dine_in_enabled boolean not null default true,
    pin_login_enabled boolean not null default true,
    virtual_store_enabled boolean not null default true,
    omnichannel_enabled boolean not null default false,
    opening_hours jsonb default '[]'::jsonb,
    store_open boolean not null default true,
    next_opening_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists branches_restaurant_idx on public.branches (restaurant_id, status);

-- 2. Menu Groups
create table if not exists public.menu_groups (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    name text not null,
    description text,
    is_active boolean not null default true,
    location_ids jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists menu_groups_restaurant_idx on public.menu_groups (restaurant_id, is_active);

-- 3. Combo Items
create table if not exists public.menu_combos (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    menu_group_id uuid references public.menu_groups(id) on delete set null,
    name text not null,
    description text,
    price numeric(10,2) not null default 0,
    image_url text,
    time_limit_enabled boolean not null default false,
    starts_at timestamptz,
    expires_at timestamptz,
    items jsonb not null default '[]'::jsonb,
    is_available boolean not null default true,
    show_on_microsite boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists menu_combos_restaurant_idx on public.menu_combos (restaurant_id, is_available);

-- 4. Rich Menu Items & Categories & Modifier Multi-Select
alter table public.pos_categories add column if not exists menu_group_id uuid references public.menu_groups(id) on delete set null;
alter table public.pos_categories add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.pos_menu add column if not exists menu_group_id uuid references public.menu_groups(id) on delete set null;
alter table public.pos_menu add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.pos_menu add column if not exists is_upsell boolean not null default false;
alter table public.pos_menu add column if not exists is_alcoholic boolean not null default false;
alter table public.pos_menu add column if not exists exclude_from_tax boolean not null default false;
alter table public.pos_menu add column if not exists special_price numeric(10,2);
alter table public.pos_menu add column if not exists special_from timestamptz;
alter table public.pos_menu add column if not exists special_to timestamptz;
alter table public.pos_menu add column if not exists is_special_price_active boolean not null default false;
alter table public.pos_menu add column if not exists variations jsonb not null default '[]'::jsonb;
alter table public.pos_menu add column if not exists additions jsonb not null default '[]'::jsonb;

alter table public.menu_modifier_groups add column if not exists allow_multiple boolean not null default false;

-- 5. Order Sales Channels, Branches, Delivery Fees & Audit Metadata
alter table public.pos_orders add column if not exists branch_id uuid references public.branches(id) on delete set null;
alter table public.pos_orders add column if not exists sales_channel text default 'pos';
alter table public.pos_orders add column if not exists delivery_provider text;
alter table public.pos_orders add column if not exists delivery_fee numeric(10,2) default 0;
alter table public.pos_orders add column if not exists void_reason text;
alter table public.pos_orders add column if not exists accepted_at timestamptz;
alter table public.pos_orders add column if not exists cancelled_reason text;

create index if not exists pos_orders_channel_idx on public.pos_orders (restaurant_id, sales_channel, created_at desc);

-- 6. Storefront SEO, Pixels, Confirmation CTA, & Store Pause State
alter table public.restaurant_settings add column if not exists seo_title text;
alter table public.restaurant_settings add column if not exists seo_description text;
alter table public.restaurant_settings add column if not exists seo_keywords text;
alter table public.restaurant_settings add column if not exists og_title text;
alter table public.restaurant_settings add column if not exists og_description text;
alter table public.restaurant_settings add column if not exists og_image_url text;
alter table public.restaurant_settings add column if not exists google_analytics_id text;
alter table public.restaurant_settings add column if not exists meta_pixel_id text;
alter table public.restaurant_settings add column if not exists confirmation_cta_text text;
alter table public.restaurant_settings add column if not exists confirmation_cta_url text;
alter table public.restaurant_settings add column if not exists store_closed boolean not null default false;
alter table public.restaurant_settings add column if not exists next_opening_at timestamptz;
alter table public.restaurant_settings add column if not exists cuisines text;

-- 7. Tenant Isolation RLS on New Wave 1 Tables
alter table public.branches enable row level security;
alter table public.menu_groups enable row level security;
alter table public.menu_combos enable row level security;

drop policy if exists "branches_tenant_isolation" on public.branches;
drop policy if exists "branches_public_read" on public.branches;
drop policy if exists "branches_tenant_write" on public.branches;
create policy "branches_public_read" on public.branches
    for select to anon, authenticated
    using (restaurant_id = public.current_tenant_id() or status = 'active');
create policy "branches_tenant_write" on public.branches
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "menu_groups_tenant_isolation" on public.menu_groups;
create policy "menu_groups_tenant_isolation" on public.menu_groups
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "menu_combos_tenant_isolation" on public.menu_combos;
drop policy if exists "menu_combos_public_read" on public.menu_combos;
drop policy if exists "menu_combos_tenant_write" on public.menu_combos;
create policy "menu_combos_public_read" on public.menu_combos
    for select to anon, authenticated
    using (restaurant_id = public.current_tenant_id() or (is_available = true and show_on_microsite = true));
create policy "menu_combos_tenant_write" on public.menu_combos
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());
