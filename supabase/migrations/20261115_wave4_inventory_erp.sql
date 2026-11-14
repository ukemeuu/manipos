-- ============================================================================
-- ManiPOS · Wave 4 Orda Inventory & Food Costing ERP Schema
-- Multi-Store Stock, Sub-Recipes, Expiry Batches, 9-Type Movement Ledger,
-- Shrinkage 8 Reasons, Menu+Modifier BOM Recipes, Physical Stock Counts,
-- Inter-Store Transfers Push/Pull, Purchase Orders + GRN + Auto-86 Settings.
-- Strictly additive & preserves existing inventory_items / stock_movements / pos_item_recipes.
-- ============================================================================

-- 1. Inventory Stores / Warehouses (per branch or kitchen store + Auto-86 toggle)
create table if not exists public.inventory_stores (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    name text not null,
    store_type text not null default 'main_kitchen',
    is_default boolean not null default false,
    disable_menu_item_when_out_of_stock boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists inventory_stores_restaurant_idx
    on public.inventory_stores (restaurant_id, is_active);

-- 2. Extend existing inventory_items with Orda metadata & store defaults
alter table public.inventory_items add column if not exists brand text;
alter table public.inventory_items add column if not exists measurement_unit text;
alter table public.inventory_items add column if not exists default_store_id uuid references public.inventory_stores(id) on delete set null;
alter table public.inventory_items add column if not exists supplier_id uuid;
alter table public.inventory_items add column if not exists is_active boolean not null default true;

-- 3. Multi-Store Stock Balances (per store per ingredient)
create table if not exists public.inventory_store_stock (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    store_id uuid not null references public.inventory_stores(id) on delete cascade,
    inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
    quantity numeric(14,3) not null default 0,
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists inventory_store_stock_uidx
    on public.inventory_store_stock (store_id, inventory_item_id);

-- 4. Sub-Recipes (Prep items yielding batch qty with component ingredients)
create table if not exists public.inventory_sub_recipes (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    name text not null,
    category text default 'Prep / Sauce',
    unit text not null default 'kg',
    use_for_preparation boolean not null default true,
    yield_qty numeric(12,3) not null default 1,
    current_stock numeric(12,3) not null default 0,
    components jsonb not null default '[]'::jsonb, -- [{ inventory_item_id, name, qty, unit, unit_cost }]
    unit_cost numeric(12,2) not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists inventory_sub_recipes_restaurant_idx
    on public.inventory_sub_recipes (restaurant_id, is_active);

-- 5. Expiry Batches (FEFO / Batch Shelf-Life Tracking)
create table if not exists public.inventory_batches (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    store_id uuid references public.inventory_stores(id) on delete set null,
    inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
    batch_code text not null,
    quantity numeric(12,3) not null default 0,
    unit_cost numeric(12,2) default 0,
    expiry_date date not null,
    notes text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists inventory_batches_expiry_idx
    on public.inventory_batches (restaurant_id, expiry_date asc);

-- 6. Extend stock_movements for Orda 9 Movement Types + Shrinkage 8 Reasons + Multi-Store + Sub-Recipe
alter table public.stock_movements add column if not exists store_id uuid references public.inventory_stores(id) on delete set null;
alter table public.stock_movements add column if not exists sub_recipe_id uuid references public.inventory_sub_recipes(id) on delete set null;
alter table public.stock_movements add column if not exists reason text;
alter table public.stock_movements add column if not exists order_id uuid references public.pos_orders(id) on delete set null;
alter table public.stock_movements add column if not exists unit_cost numeric(12,2) default 0;
alter table public.stock_movements add column if not exists reference_code text;

-- 7. Menu & Modifier BOM Recipes (links Ingredients AND Sub-Recipes to Menu Items OR Modifier Options)
create table if not exists public.inventory_recipes (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    target_type text not null default 'menu_item' check (target_type in ('menu_item', 'modifier_option')),
    menu_item_id uuid,
    menu_item_name text not null,
    modifier_group_id uuid,
    modifier_option_name text,
    component_type text not null default 'ingredient' check (component_type in ('ingredient', 'sub_recipe')),
    inventory_item_id uuid references public.inventory_items(id) on delete cascade,
    sub_recipe_id uuid references public.inventory_sub_recipes(id) on delete cascade,
    quantity numeric(12,4) not null default 1,
    unit text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists inventory_recipes_restaurant_idx
    on public.inventory_recipes (restaurant_id, target_type, menu_item_name);

-- 8. Physical Stock Counts (Variance Audit & Auto-Reconciliation)
create table if not exists public.inventory_stock_counts (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    store_id uuid references public.inventory_stores(id) on delete set null,
    count_reference text not null,
    counted_by text,
    status text not null default 'completed' check (status in ('draft', 'completed')),
    lines jsonb not null default '[]'::jsonb, -- [{ inventory_item_id, name, system_qty, counted_qty, variance_qty, variance_value }]
    total_variance_value numeric(12,2) not null default 0,
    notes text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists inventory_stock_counts_idx
    on public.inventory_stock_counts (restaurant_id, created_at desc);

-- 9. Inter-Store Transfers (Push Transfer & Pull Request)
create table if not exists public.inventory_transfers (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    transfer_type text not null default 'push' check (transfer_type in ('push', 'pull_request')),
    from_store_id uuid references public.inventory_stores(id) on delete set null,
    to_store_id uuid references public.inventory_stores(id) on delete set null,
    status text not null default 'completed' check (status in ('pending', 'completed', 'cancelled')),
    lines jsonb not null default '[]'::jsonb, -- [{ inventory_item_id, name, qty, unit }]
    requested_by text,
    notes text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists inventory_transfers_idx
    on public.inventory_transfers (restaurant_id, created_at desc);

-- 10. Purchase Orders & GRN Receiving
create table if not exists public.purchase_orders (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    po_number text not null,
    supplier_name text not null,
    store_id uuid references public.inventory_stores(id) on delete set null,
    status text not null default 'ordered' check (status in ('draft', 'ordered', 'partial', 'received', 'cancelled')),
    total_cost numeric(12,2) not null default 0,
    expected_date date,
    received_at timestamptz,
    notes text,
    created_by text,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.purchase_order_items (
    id uuid primary key default gen_random_uuid(),
    purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
    inventory_item_id uuid references public.inventory_items(id) on delete set null,
    item_name text not null,
    unit text,
    ordered_qty numeric(12,3) not null default 0,
    received_qty numeric(12,3) not null default 0,
    unit_cost numeric(12,2) not null default 0,
    line_total numeric(12,2) not null default 0
);

create index if not exists purchase_orders_restaurant_idx
    on public.purchase_orders (restaurant_id, created_at desc);

-- 11. Inventory Settings (Custom Units, Categories, Brands, Low-Stock Reminders & Auto-86)
create table if not exists public.inventory_settings (
    restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
    disable_menu_item_when_out_of_stock boolean not null default false,
    auto_deduct_on_order boolean not null default true,
    expiry_alert_days integer not null default 7,
    reminder_emails jsonb not null default '[]'::jsonb,
    custom_units jsonb not null default '[]'::jsonb,
    custom_categories jsonb not null default '[]'::jsonb,
    custom_brands jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default timezone('utc', now())
);

-- 12. Strict Tenant Isolation RLS Policies
alter table public.inventory_stores enable row level security;
alter table public.inventory_store_stock enable row level security;
alter table public.inventory_sub_recipes enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_recipes enable row level security;
alter table public.inventory_stock_counts enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.inventory_settings enable row level security;

drop policy if exists "inventory_stores_tenant_isolation" on public.inventory_stores;
create policy "inventory_stores_tenant_isolation" on public.inventory_stores
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "inventory_store_stock_tenant_isolation" on public.inventory_store_stock;
create policy "inventory_store_stock_tenant_isolation" on public.inventory_store_stock
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "inventory_sub_recipes_tenant_isolation" on public.inventory_sub_recipes;
create policy "inventory_sub_recipes_tenant_isolation" on public.inventory_sub_recipes
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "inventory_batches_tenant_isolation" on public.inventory_batches;
create policy "inventory_batches_tenant_isolation" on public.inventory_batches
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "inventory_recipes_tenant_isolation" on public.inventory_recipes;
create policy "inventory_recipes_tenant_isolation" on public.inventory_recipes
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "inventory_stock_counts_tenant_isolation" on public.inventory_stock_counts;
create policy "inventory_stock_counts_tenant_isolation" on public.inventory_stock_counts
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "inventory_transfers_tenant_isolation" on public.inventory_transfers;
create policy "inventory_transfers_tenant_isolation" on public.inventory_transfers
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "purchase_orders_tenant_isolation" on public.purchase_orders;
create policy "purchase_orders_tenant_isolation" on public.purchase_orders
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());

drop policy if exists "purchase_order_items_tenant_isolation" on public.purchase_order_items;
create policy "purchase_order_items_tenant_isolation" on public.purchase_order_items
    for all to anon, authenticated
    using (
        exists (
            select 1 from public.purchase_orders po
            where po.id = purchase_order_id
              and po.restaurant_id = public.current_tenant_id()
        )
    )
    with check (
        exists (
            select 1 from public.purchase_orders po
            where po.id = purchase_order_id
              and po.restaurant_id = public.current_tenant_id()
        )
    );

drop policy if exists "inventory_settings_tenant_isolation" on public.inventory_settings;
create policy "inventory_settings_tenant_isolation" on public.inventory_settings
    for all to anon, authenticated
    using (restaurant_id = public.current_tenant_id())
    with check (restaurant_id = public.current_tenant_id());
