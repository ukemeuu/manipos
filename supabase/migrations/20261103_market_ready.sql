-- ============================================================================
-- ManiPOS · Market-ready SaaS migration
-- Idempotent: safe to run repeatedly in the Supabase SQL editor.
-- Date: 2026-11-03
-- ============================================================================

begin;

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. Core tenants
-- ----------------------------------------------------------------------------
create table if not exists public.restaurants (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text unique,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.restaurants add column if not exists slug text;
alter table public.restaurants add column if not exists status text not null default 'pending';
alter table public.restaurants add column if not exists is_active boolean not null default true;
alter table public.restaurants add column if not exists business_type text not null default 'restaurant';
alter table public.restaurants add column if not exists plan text not null default 'growth';
alter table public.restaurants add column if not exists cuisine text;
alter table public.restaurants add column if not exists phone text;
alter table public.restaurants add column if not exists email text;
alter table public.restaurants add column if not exists currency text not null default 'KES';
alter table public.restaurants add column if not exists logo_url text;
alter table public.restaurants add column if not exists cover_url text;
alter table public.restaurants add column if not exists tagline text;
alter table public.restaurants add column if not exists description text;
alter table public.restaurants add column if not exists trial_ends_at timestamptz;
alter table public.restaurants add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
    begin
        create unique index if not exists restaurants_slug_key on public.restaurants (lower(slug));
    exception when unique_violation then
        raise notice 'Skipping lower(slug) unique index: duplicate slugs exist. Resolve duplicates and re-run.';
    end;
    begin
        create unique index if not exists restaurants_slug_exact_key on public.restaurants (slug);
    exception when unique_violation then
        raise notice 'Skipping slug unique index: duplicate slugs exist. Resolve duplicates and re-run.';
    end;
end;
$$;
create index if not exists restaurants_status_idx on public.restaurants (status, is_active);

create table if not exists public.restaurant_settings (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.restaurant_settings add column if not exists phone text;
alter table public.restaurant_settings add column if not exists email text;
alter table public.restaurant_settings add column if not exists address text;
alter table public.restaurant_settings add column if not exists locations_count text;
alter table public.restaurant_settings add column if not exists brands_count text;
alter table public.restaurant_settings add column if not exists currency text default 'KES';
alter table public.restaurant_settings add column if not exists currency_symbol text default 'KSh';
alter table public.restaurant_settings add column if not exists timezone text default 'Africa/Nairobi';
alter table public.restaurant_settings add column if not exists plan text default 'growth';
alter table public.restaurant_settings add column if not exists mpesa_paybill text;
alter table public.restaurant_settings add column if not exists mpesa_account text;
alter table public.restaurant_settings add column if not exists delivery_fee numeric(10,2) default 0;
alter table public.restaurant_settings add column if not exists min_order numeric(10,2) default 0;
alter table public.restaurant_settings add column if not exists free_delivery_over numeric(10,2);
alter table public.restaurant_settings add column if not exists eta_minutes text;
alter table public.restaurant_settings add column if not exists logo_url text;
alter table public.restaurant_settings add column if not exists cover_url text;
alter table public.restaurant_settings add column if not exists tagline text;
alter table public.restaurant_settings add column if not exists description text;
alter table public.restaurant_settings add column if not exists brand_primary_color text;
alter table public.restaurant_settings add column if not exists brand_accent_color text;
alter table public.restaurant_settings add column if not exists brand_colors jsonb default '{}'::jsonb;
alter table public.restaurant_settings add column if not exists opening_hours jsonb default '[]'::jsonb;
alter table public.restaurant_settings add column if not exists socials jsonb default '{}'::jsonb;
alter table public.restaurant_settings add column if not exists features jsonb default '[]'::jsonb;
alter table public.restaurant_settings add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
    begin
        create unique index if not exists restaurant_settings_tenant_key on public.restaurant_settings (restaurant_id);
    exception when unique_violation then
        raise notice 'Skipping restaurant_settings tenant unique index: duplicate settings rows exist.';
    end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Staff access (PINs are never publicly readable)
-- ----------------------------------------------------------------------------
create table if not exists public.staff_access (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    name text not null,
    role text not null default 'cashier',
    active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.staff_access add column if not exists email text;
alter table public.staff_access add column if not exists pin_code text;
alter table public.staff_access add column if not exists pin_hash text;
alter table public.staff_access add column if not exists active boolean default true;
alter table public.staff_access add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
    begin
        create unique index if not exists staff_access_email_key on public.staff_access (lower(email)) where email is not null;
    exception when unique_violation then
        raise notice 'Skipping staff email unique index: duplicate emails exist.';
    end;
end;
$$;
create index if not exists staff_access_restaurant_idx on public.staff_access (restaurant_id, active);

-- ----------------------------------------------------------------------------
-- 3. Menu & catalogue
-- ----------------------------------------------------------------------------
create table if not exists public.pos_categories (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    name text not null,
    icon text,
    display_order int default 0,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pos_menu (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    name text not null,
    category text not null,
    price numeric(10,2) not null,
    description text,
    image_url text,
    is_available boolean default true,
    brand_id text default 'ALL',
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.pos_menu add column if not exists brand text;
alter table public.pos_menu add column if not exists brands jsonb default '[]'::jsonb;
alter table public.pos_menu add column if not exists brand_prices jsonb default '{}'::jsonb;
alter table public.pos_menu add column if not exists show_on_microsite boolean default true;
alter table public.pos_menu add column if not exists display_order int default 0;
alter table public.pos_menu add column if not exists is_featured boolean default false;
alter table public.pos_menu add column if not exists cost_price numeric(10,2);
alter table public.pos_menu add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists pos_menu_tenant_idx on public.pos_menu (restaurant_id, category, display_order);

-- ----------------------------------------------------------------------------
-- 4. Orders & line items
-- ----------------------------------------------------------------------------
create sequence if not exists public.pos_ticket_seq start 1001;

create table if not exists public.pos_orders (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.pos_orders add column if not exists order_number text;
alter table public.pos_orders add column if not exists ticket_number text;
alter table public.pos_orders add column if not exists idempotency_key uuid;
alter table public.pos_orders add column if not exists brand text;
alter table public.pos_orders add column if not exists brand_id text;
alter table public.pos_orders add column if not exists order_channel text;
alter table public.pos_orders add column if not exists channel text;
alter table public.pos_orders add column if not exists dining_option text;
alter table public.pos_orders add column if not exists subtotal numeric(10,2);
alter table public.pos_orders add column if not exists discount numeric(10,2) default 0;
alter table public.pos_orders add column if not exists discount_amount numeric(10,2) default 0;
alter table public.pos_orders add column if not exists tax_amount numeric(10,2) default 0;
alter table public.pos_orders add column if not exists total_amount numeric(10,2);
alter table public.pos_orders add column if not exists payment_method text default 'Cash';
alter table public.pos_orders add column if not exists payment_status text default 'Pending';
alter table public.pos_orders add column if not exists status text default 'Pending';
alter table public.pos_orders add column if not exists customer_name text;
alter table public.pos_orders add column if not exists customer_phone text;
alter table public.pos_orders add column if not exists customer_contact text;
alter table public.pos_orders add column if not exists table_number text;
alter table public.pos_orders add column if not exists staff_name text;
alter table public.pos_orders add column if not exists cashier_name text;
alter table public.pos_orders add column if not exists guest_id uuid;
alter table public.pos_orders add column if not exists notes text;
alter table public.pos_orders add column if not exists items jsonb default '[]'::jsonb;
alter table public.pos_orders add column if not exists kitchen_started_at timestamptz;
alter table public.pos_orders add column if not exists kitchen_ready_at timestamptz;
alter table public.pos_orders add column if not exists completed_at timestamptz;
alter table public.pos_orders add column if not exists updated_at timestamptz not null default timezone('utc', now());

-- Older schemas required these; new inserts supply them through a trigger.
alter table public.pos_orders alter column order_number drop not null;
alter table public.pos_orders alter column subtotal drop not null;

create index if not exists pos_orders_tenant_status_idx on public.pos_orders (restaurant_id, status, created_at desc);
create index if not exists pos_orders_brand_idx on public.pos_orders (brand);
create index if not exists pos_orders_ticket_idx on public.pos_orders (ticket_number);

create or replace function public.manipos_set_order_defaults()
returns trigger
language plpgsql
as $$
begin
    if new.ticket_number is null then
        new.ticket_number := nextval('public.pos_ticket_seq')::text;
    end if;
    if new.order_number is null then
        new.order_number := 'ORD-' || new.ticket_number;
    end if;
    if new.subtotal is null and new.total_amount is not null then
        new.subtotal := new.total_amount;
    end if;
    new.updated_at := timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists manipos_order_defaults on public.pos_orders;
create trigger manipos_order_defaults
before insert or update on public.pos_orders
for each row execute function public.manipos_set_order_defaults();

create table if not exists public.pos_order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references public.pos_orders(id) on delete cascade,
    item_name text not null,
    quantity numeric(10,2) not null default 1,
    price numeric(10,2) not null default 0,
    instructions text,
    status text default 'Pending',
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.pos_order_items add column if not exists menu_item_id uuid;
alter table public.pos_order_items add column if not exists modifiers jsonb default '[]'::jsonb;
alter table public.pos_order_items add column if not exists notes text;
alter table public.pos_order_items add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists pos_order_items_order_idx on public.pos_order_items (order_id);

-- ----------------------------------------------------------------------------
-- 5. Guests / CRM
-- ----------------------------------------------------------------------------
create table if not exists public.guests (
    id uuid primary key default gen_random_uuid(),
    first_name text,
    last_name text,
    phone text,
    email text,
    delivery_address text,
    visit_count int default 0,
    lifetime_spend numeric(12,2) default 0,
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.guests add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;
alter table public.guests add column if not exists notes text;
alter table public.guests add column if not exists last_order_at timestamptz;
alter table public.guests add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists guests_phone_idx on public.guests (phone);
create index if not exists guests_tenant_idx on public.guests (restaurant_id, phone);

-- ----------------------------------------------------------------------------
-- 6. Floor plan & reservations
-- ----------------------------------------------------------------------------
create table if not exists public.pos_tables (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    name text not null,
    zone text default 'Main floor',
    seats int default 2,
    status text default 'available',
    notes text,
    display_order int default 0,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.pos_tables add column if not exists updated_at timestamptz not null default timezone('utc', now());
create index if not exists pos_tables_tenant_idx on public.pos_tables (restaurant_id, display_order);

create table if not exists public.reservations (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    guest_name text not null,
    phone text,
    party_size int default 2,
    reservation_date date not null default current_date,
    reservation_time text default '19:00',
    table_name text,
    status text default 'confirmed',
    notes text,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.reservations add column if not exists updated_at timestamptz not null default timezone('utc', now());
create index if not exists reservations_tenant_date_idx on public.reservations (restaurant_id, reservation_date, reservation_time);

-- ----------------------------------------------------------------------------
-- 7. Inventory & recipes
-- ----------------------------------------------------------------------------
create table if not exists public.inventory_items (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    name text not null,
    category text default 'Other',
    sku text,
    unit text default 'piece',
    quantity numeric(12,3) default 0,
    reorder_threshold numeric(12,3) default 0,
    cost_price numeric(12,2) default 0,
    supplier text,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.inventory_items add column if not exists updated_at timestamptz not null default timezone('utc', now());
create index if not exists inventory_items_tenant_idx on public.inventory_items (restaurant_id, category);

create table if not exists public.stock_movements (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
    movement_type text default 'adjustment',
    quantity numeric(12,3) not null default 0,
    balance_after numeric(12,3),
    staff_name text,
    notes text,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists stock_movements_item_idx on public.stock_movements (inventory_item_id, created_at desc);

create table if not exists public.pos_item_recipes (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    pos_menu_item_name text not null,
    inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
    quantity_per_order numeric(12,3) not null default 1,
    created_at timestamptz not null default timezone('utc', now())
);

do $$
begin
    begin
        create unique index if not exists pos_item_recipes_unique on public.pos_item_recipes (restaurant_id, pos_menu_item_name, inventory_item_id);
    exception when unique_violation then
        raise notice 'Skipping recipe unique index: duplicate recipe links exist.';
    end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Delivery channels, discounts, feedback
-- ----------------------------------------------------------------------------
create table if not exists public.pos_channels (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    name text not null default 'whatsapp',
    paybill_number text,
    account_number text,
    base_delivery_fee numeric(10,2) default 0,
    base_delivery_distance numeric(10,2) default 3,
    delivery_fee_per_km numeric(10,2) default 0,
    packaging_fee numeric(10,2) default 0,
    store_lat numeric(10,7),
    store_lng numeric(10,7),
    is_active boolean default true,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.pos_channels add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;
create index if not exists pos_channels_tenant_idx on public.pos_channels (restaurant_id, name);

create table if not exists public.pos_discounts (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    code text,
    name text,
    description text,
    type text default 'percentage',
    value numeric(10,2) default 0,
    discount_percent numeric(10,2),
    discount_amount numeric(10,2),
    min_order_amount numeric(10,2) default 0,
    is_active boolean default true,
    expires_at timestamptz,
    created_at timestamptz not null default timezone('utc', now())
);

-- Reconcile with the live schema used by the terminal (type/value/min_order_amount).
alter table public.pos_discounts add column if not exists name text;
alter table public.pos_discounts add column if not exists description text;
alter table public.pos_discounts add column if not exists type text;
alter table public.pos_discounts add column if not exists value numeric(10,2);
alter table public.pos_discounts add column if not exists discount_percent numeric(10,2);
alter table public.pos_discounts add column if not exists discount_amount numeric(10,2);
alter table public.pos_discounts add column if not exists min_order_amount numeric(10,2);
alter table public.pos_discounts add column if not exists is_active boolean default true;
alter table public.pos_discounts add column if not exists expires_at timestamptz;

do $$
begin
    begin
        create unique index if not exists pos_discounts_code_key on public.pos_discounts (lower(code)) where code is not null;
    exception when unique_violation then
        raise notice 'Skipping discount code unique index: duplicate codes exist.';
    end;
end;
$$;

create table if not exists public.pos_feedback (
    id uuid primary key default gen_random_uuid(),
    tenant_id text,
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    rating int,
    category text,
    comment text,
    customer_name text,
    customer_contact text,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.pos_feedback add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;
create index if not exists pos_feedback_tenant_idx on public.pos_feedback (restaurant_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 9. Staff authentication RPCs (SECURITY DEFINER, no PIN exposure)
-- ----------------------------------------------------------------------------
create or replace function public.verify_staff_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_staff public.staff_access%rowtype;
    v_store public.restaurants%rowtype;
    v_valid boolean := false;
begin
    select * into v_staff
    from public.staff_access
    where lower(email) = lower(p_email) and active = true
    limit 1;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Unable to sign in. Please check your credentials or account approval status.');
    end if;

    if v_staff.pin_hash is not null and v_staff.pin_hash <> '' then
        begin
            v_valid := v_staff.pin_hash = crypt(p_password, v_staff.pin_hash);
        exception when others then
            v_valid := false;
        end;
    end if;

    if not v_valid and v_staff.pin_code is not null then
        v_valid := v_staff.pin_code = p_password;
        if v_valid then
            update public.staff_access
            set pin_hash = crypt(p_password, gen_salt('bf')), pin_code = null
            where id = v_staff.id;
        end if;
    end if;

    if not v_valid then
        return jsonb_build_object('success', false, 'error', 'Unable to sign in. Please check your credentials or account approval status.');
    end if;

    select * into v_store from public.restaurants where id = v_staff.restaurant_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Unable to sign in. Please check your credentials or account approval status.');
    end if;
    if coalesce(v_store.is_active, true) = false or v_store.status = 'suspended' then
        return jsonb_build_object('success', false, 'error', 'Account access has been suspended.');
    end if;
    if v_store.status = 'pending' then
        return jsonb_build_object('success', false, 'error', 'Your ManiPOS account is awaiting platform approval. We will notify you once approved.');
    end if;
    if v_store.status = 'rejected' then
        return jsonb_build_object('success', false, 'error', 'Account access has been rejected.');
    end if;

    return jsonb_build_object(
        'success', true,
        'staff_user', jsonb_build_object(
            'id', v_staff.id,
            'name', v_staff.name,
            'email', v_staff.email,
            'role', v_staff.role,
            'restaurantId', v_store.id,
            'restaurantName', v_store.name,
            'tenantSlug', v_store.slug
        )
    );
end;
$$;

grant execute on function public.verify_staff_login(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10. Tenant onboarding RPC
-- ----------------------------------------------------------------------------
do $$
declare
    r record;
begin
    for r in
        select oid::regprocedure as signature
        from pg_proc
        where proname = 'create_new_restaurant_tenant'
          and pronamespace = 'public'::regnamespace
    loop
        execute 'drop function ' || r.signature;
    end loop;
end;
$$;

create or replace function public.create_new_restaurant_tenant(
    p_name text,
    p_slug text,
    p_email text,
    p_password text,
    p_manager_name text default 'Store Owner',
    p_locations text default '1 Location',
    p_brands text default 'Single Brand (1)',
    p_phone text default null,
    p_business_type text default 'restaurant',
    p_plan text default 'growth',
    p_cuisine text default null,
    p_trial_days int default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_slug text := lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9-]', '', 'g'));
    v_id uuid;
begin
    if length(v_slug) < 2 then
        return jsonb_build_object('success', false, 'error', 'Choose a storefront code with at least 2 characters.');
    end if;
    if p_password is null or length(p_password) < 4 then
        return jsonb_build_object('success', false, 'error', 'Password must be at least 4 characters.');
    end if;
    if exists (select 1 from public.restaurants where lower(slug) = v_slug) then
        return jsonb_build_object('success', false, 'error', 'That storefront code is already taken. Choose another.');
    end if;
    if exists (select 1 from public.staff_access where lower(email) = lower(p_email)) then
        return jsonb_build_object('success', false, 'error', 'An account with this email already exists. Please sign in.');
    end if;

    insert into public.restaurants (name, slug, status, is_active, business_type, plan, cuisine, trial_ends_at)
    values (
        p_name,
        v_slug,
        'pending',
        true,
        p_business_type,
        coalesce(p_plan, 'growth'),
        p_cuisine,
        timezone('utc', now()) + make_interval(days => coalesce(p_trial_days, 14))
    )
    returning id into v_id;

    insert into public.staff_access (restaurant_id, name, email, role, pin_hash, active)
    values (v_id, p_manager_name, lower(p_email), 'admin', crypt(p_password, gen_salt('bf')), true);

    update public.restaurant_settings set phone = p_phone where restaurant_id = v_id;
    if not found then
        insert into public.restaurant_settings (restaurant_id, phone, locations_count, brands_count, currency, timezone, plan)
        values (v_id, p_phone, p_locations, p_brands, 'KES', 'Africa/Nairobi', 'growth');
    end if;

    return jsonb_build_object(
        'success', true,
        'restaurant_id', v_id,
        'restaurant_slug', v_slug,
        'restaurant_name', p_name,
        'manager_name', p_manager_name
    );
end;
$$;

grant execute on function public.create_new_restaurant_tenant(text, text, text, text, text, text, text, text, text, text, text, integer) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10b. Platform owner console RPCs
--     Passcode is verified server-side against a bcrypt hash in
--     platform_settings. Replace the seeded value before launch:
--       update platform_settings
--         set value = crypt('YOUR_STRONG_PASSCODE', gen_salt('bf'))
--         where key = 'super_admin_passcode';
-- ----------------------------------------------------------------------------
create table if not exists public.platform_settings (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default timezone('utc', now())
);

insert into public.platform_settings (key, value)
values ('super_admin_passcode', crypt('CHANGE_ME_IMMEDIATELY', gen_salt('bf')))
on conflict (key) do nothing;

create or replace function public.admin_verify_passcode(p_passcode text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_hash text;
begin
    select value into v_hash from public.platform_settings where key = 'super_admin_passcode';
    if v_hash is null then return false; end if;
    begin
        return v_hash = crypt(p_passcode, v_hash);
    exception when others then
        return false;
    end;
end;
$$;

create or replace function public.admin_list_restaurants(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_verify_passcode(p_passcode) then
        raise exception 'Invalid platform passcode';
    end if;

    return coalesce((
        select jsonb_agg(row_to_json(t))
        from (
            select
                r.id,
                r.name,
                r.slug,
                r.status,
                r.is_active,
                r.plan,
                r.cuisine,
                r.created_at,
                r.trial_ends_at,
                coalesce((
                    select jsonb_build_object(
                        'phone', s.phone,
                        'locations_count', s.locations_count,
                        'brands_count', s.brands_count
                    )
                    from public.restaurant_settings s
                    where s.restaurant_id = r.id
                    limit 1
                ), '{}'::jsonb) as settings,
                coalesce((
                    select jsonb_build_object(
                        'name', st.name,
                        'email', st.email,
                        'role', st.role
                    )
                    from public.staff_access st
                    where st.restaurant_id = r.id
                    order by case when st.role = 'admin' then 0 else 1 end
                    limit 1
                ), '{}'::jsonb) as owner
            from public.restaurants r
            order by r.created_at desc
        ) t
    ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_platform_metrics(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_verify_passcode(p_passcode) then
        raise exception 'Invalid platform passcode';
    end if;

    return (
        select jsonb_build_object(
            'orders_count', (select count(*) from public.pos_orders),
            'pending_count', count(*) filter (where status = 'pending'),
            'approved_count', count(*) filter (where status = 'approved' or (status is null and coalesce(is_active, true)))
        )
        from public.restaurants
    );
end;
$$;

create or replace function public.admin_update_restaurant_status(
    p_restaurant_id uuid,
    p_status text,
    p_is_active boolean,
    p_passcode text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_verify_passcode(p_passcode) then
        raise exception 'Invalid platform passcode';
    end if;

    update public.restaurants
    set status = p_status,
        is_active = coalesce(p_is_active, true),
        updated_at = timezone('utc', now())
    where id = p_restaurant_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Restaurant not found.');
    end if;

    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_extend_trial(
    p_restaurant_id uuid,
    p_days int default 14,
    p_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_current timestamptz;
begin
    if not public.admin_verify_passcode(p_passcode) then
        raise exception 'Invalid platform passcode';
    end if;

    select coalesce(trial_ends_at, timezone('utc', now())) into v_current
    from public.restaurants where id = p_restaurant_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Restaurant not found.');
    end if;

    update public.restaurants
    set trial_ends_at = v_current + make_interval(days => p_days),
        status = 'approved',
        is_active = true,
        updated_at = timezone('utc', now())
    where id = p_restaurant_id;

    return jsonb_build_object('success', true, 'trial_ends_at', v_current + make_interval(days => p_days));
end;
$$;

grant execute on function public.admin_verify_passcode(text) to anon, authenticated;
grant execute on function public.admin_list_restaurants(text) to anon, authenticated;
grant execute on function public.admin_platform_metrics(text) to anon, authenticated;
grant execute on function public.admin_update_restaurant_status(uuid, text, boolean, text) to anon, authenticated;
grant execute on function public.admin_extend_trial(uuid, integer, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 10c. Staff management RPCs
--     The acting staff member must be an admin/manager of the target tenant.
--     PINs are hashed with bcrypt and are never returned to the client.
-- ----------------------------------------------------------------------------
create or replace function public.staff_list(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role text;
    v_restaurant_id uuid;
begin
    select role, restaurant_id into v_role, v_restaurant_id
    from public.staff_access where id = p_actor_id;

    if not found or v_role not in ('admin', 'manager') then
        raise exception 'Not authorised to manage staff';
    end if;

    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'email', s.email,
            'role', s.role,
            'active', s.active,
            'pin_set', (s.pin_hash is not null or s.pin_code is not null),
            'created_at', s.created_at,
            'updated_at', s.updated_at
        ) order by s.name)
        from public.staff_access s
        where s.restaurant_id = v_restaurant_id
    ), '[]'::jsonb);
end;
$$;

create or replace function public.staff_upsert(
    p_actor_id uuid,
    p_id uuid,
    p_restaurant_id uuid,
    p_name text,
    p_email text,
    p_role text,
    p_pin text default null,
    p_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role text;
    v_restaurant_id uuid;
begin
    select role, restaurant_id into v_role, v_restaurant_id
    from public.staff_access where id = p_actor_id;

    if not found or v_role not in ('admin', 'manager') then
        raise exception 'Not authorised to manage staff';
    end if;
    if p_restaurant_id is not null and p_restaurant_id <> v_restaurant_id then
        raise exception 'Cross-tenant staff access denied';
    end if;

    if p_id is null then
        if p_name is null or p_name = '' or p_role is null or p_role = '' then
            raise exception 'Name and role are required';
        end if;
        if p_pin is null or length(p_pin) < 4 then
            raise exception 'A PIN of at least 4 characters is required';
        end if;
        insert into public.staff_access (restaurant_id, name, email, role, pin_hash, active)
        values (v_restaurant_id, p_name, p_email, p_role, crypt(p_pin, gen_salt('bf')), coalesce(p_active, true));
    else
        update public.staff_access
        set name = coalesce(nullif(p_name, ''), name),
            email = coalesce(nullif(p_email, ''), email),
            role = coalesce(nullif(p_role, ''), role),
            active = coalesce(p_active, active),
            updated_at = timezone('utc', now())
        where id = p_id and restaurant_id = v_restaurant_id;

        if not found then
            raise exception 'Staff member not found';
        end if;

        if p_pin is not null and length(p_pin) >= 4 then
            update public.staff_access
            set pin_hash = crypt(p_pin, gen_salt('bf')),
                pin_code = null,
                updated_at = timezone('utc', now())
            where id = p_id and restaurant_id = v_restaurant_id;
        end if;
    end if;

    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.staff_delete(p_actor_id uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role text;
    v_restaurant_id uuid;
begin
    select role, restaurant_id into v_role, v_restaurant_id
    from public.staff_access where id = p_actor_id;

    if not found or v_role not in ('admin', 'manager') then
        raise exception 'Not authorised to manage staff';
    end if;

    delete from public.staff_access
    where id = p_id and restaurant_id = v_restaurant_id;

    if not found then
        raise exception 'Staff member not found';
    end if;

    return jsonb_build_object('success', true);
end;
$$;

-- The project may still have the legacy terminal PIN verifier with a different
-- parameter name. Drop it so the replacement can be created cleanly.
drop function if exists public.verify_staff_pin(text, text);

create or replace function public.verify_staff_pin(p_name text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_staff public.staff_access%rowtype;
    v_valid boolean := false;
begin
    select * into v_staff
    from public.staff_access
    where name = p_name and active = true
    order by created_at
    limit 1;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Incorrect PIN.');
    end if;

    if v_staff.pin_hash is not null and v_staff.pin_hash <> '' then
        begin
            v_valid := v_staff.pin_hash = crypt(p_pin, v_staff.pin_hash);
        exception when others then
            v_valid := false;
        end;
    end if;
    if not v_valid and v_staff.pin_code is not null then
        v_valid := v_staff.pin_code = p_pin;
    end if;

    if not v_valid then
        return jsonb_build_object('success', false, 'error', 'Incorrect PIN.');
    end if;

    return jsonb_build_object(
        'success', true,
        'staff_user', jsonb_build_object(
            'id', v_staff.id,
            'name', v_staff.name,
            'role', v_staff.role,
            'restaurantId', v_staff.restaurant_id
        )
    );
end;
$$;

grant execute on function public.staff_list(uuid) to anon, authenticated;
grant execute on function public.staff_upsert(uuid, uuid, uuid, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.staff_delete(uuid, uuid) to anon, authenticated;
grant execute on function public.verify_staff_pin(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 11. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.restaurants enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.staff_access enable row level security;
alter table public.pos_categories enable row level security;
alter table public.pos_menu enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.guests enable row level security;
alter table public.pos_tables enable row level security;
alter table public.reservations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.pos_item_recipes enable row level security;
alter table public.pos_channels enable row level security;
alter table public.pos_discounts enable row level security;
alter table public.pos_feedback enable row level security;
alter table public.platform_settings enable row level security;

-- Replace legacy catch-all policies that exposed PINs or all tenants.
do $$
declare
    r record;
begin
    for r in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename in (
            'restaurants','restaurant_settings','staff_access','pos_categories','pos_menu',
            'pos_orders','pos_order_items','guests','pos_tables','reservations',
            'inventory_items','stock_movements','pos_item_recipes','pos_channels',
            'pos_discounts','pos_feedback'
          )
    loop
        execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    end loop;
end;
$$;

-- Public storefront data: only approved, active tenants.
create policy "public read approved restaurants"
on public.restaurants for select
to anon, authenticated
using (coalesce(is_active, true) = true and status = 'approved');

create policy "public read restaurant settings"
on public.restaurant_settings for select
to anon, authenticated
using (true);

create policy "public read menu"
on public.pos_menu for select
to anon, authenticated
using (coalesce(is_available, true) = true and coalesce(show_on_microsite, true) = true);

create policy "public read categories"
on public.pos_categories for select
to anon, authenticated
using (true);

create policy "public read discounts"
on public.pos_discounts for select
to anon, authenticated
using (coalesce(is_active, true) = true);

-- Anonymous and staff-authenticated app sessions (custom PIN auth) need to read
-- and write operational rows. Staff PINs are protected by moving them to an
-- RPC and revoking direct access to staff_access.
create policy "staff manage orders" on public.pos_orders for all to anon, authenticated using (true) with check (true);
create policy "staff manage order items" on public.pos_order_items for all to anon, authenticated using (true) with check (true);
create policy "staff manage tables" on public.pos_tables for all to anon, authenticated using (true) with check (true);
create policy "staff manage reservations" on public.reservations for all to anon, authenticated using (true) with check (true);
create policy "staff manage inventory" on public.inventory_items for all to anon, authenticated using (true) with check (true);
create policy "staff manage stock movements" on public.stock_movements for all to anon, authenticated using (true) with check (true);
create policy "staff manage recipes" on public.pos_item_recipes for all to anon, authenticated using (true) with check (true);
create policy "staff manage channels" on public.pos_channels for all to anon, authenticated using (true) with check (true);
create policy "staff manage menu" on public.pos_menu for all to anon, authenticated using (true) with check (true);
create policy "staff manage categories" on public.pos_categories for all to anon, authenticated using (true) with check (true);
create policy "staff manage discounts" on public.pos_discounts for all to anon, authenticated using (true) with check (true);
create policy "staff manage settings" on public.restaurant_settings for all to anon, authenticated using (true) with check (true);

-- Guests may read/create their own ordering profile; staff need access for CRM.
create policy "guest profile access" on public.guests for all to anon, authenticated using (true) with check (true);
create policy "feedback submit" on public.pos_feedback for insert to anon, authenticated with check (true);
create policy "feedback read" on public.pos_feedback for select to anon, authenticated using (true);

-- staff_access is deliberately NOT readable directly. Only the RPC can read it.
revoke all on public.staff_access from anon, authenticated;

-- Platform settings contain the super-admin passcode hash.
revoke all on public.platform_settings from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 12. Convenience views for reporting
-- ----------------------------------------------------------------------------
create or replace view public.tenant_order_summary as
select
    restaurant_id,
    count(*) as order_count,
    coalesce(sum(total_amount), 0) as gross_sales,
    coalesce(avg(total_amount), 0) as average_ticket,
    max(created_at) as last_order_at
from public.pos_orders
group by restaurant_id;

grant select on public.tenant_order_summary to authenticated;

commit;
