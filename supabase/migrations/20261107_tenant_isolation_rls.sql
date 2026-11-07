-- ============================================================================
-- ManiPOS tenant isolation RLS
-- ============================================================================

-- Schema gaps the app expects on restaurant_settings (present in
-- supabase_master_setup.sql but missing from the live SaaS project).
alter table public.restaurant_settings add column if not exists setup_completed boolean default false;
alter table public.restaurant_settings add column if not exists hub_bg_type text;
alter table public.restaurant_settings add column if not exists hub_bg_url text;
alter table public.restaurant_settings add column if not exists hub_bg_opacity numeric default 0.35;
alter table public.restaurant_settings add column if not exists enabled_payment_methods jsonb default '["CASH","MPESA","CARD"]';
-- Apply this AFTER deploying the app build that sends the `x-tenant-id`
-- header (src/lib/supabase.js). Every Supabase request then carries the
-- signed-in tenant's restaurant UUID.
--
-- Default-deny: if the header is missing, current_tenant_id() returns NULL and
-- every tenant-scoped policy denies access. The `restaurants` table stays
-- publicly readable so the app can resolve a slug before the tenant context is
-- known, and so the public directory keeps working.
--
-- Rollback: re-run the permissive policies in
-- supabase/migrations/20261103_market_ready.sql.
-- ============================================================================

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(current_setting('request.headers', true), '{}'::text)::jsonb ->> 'x-tenant-id',
    ''
  )::uuid
$$;

create or replace function public.current_tenant_slug()
returns text
language sql
stable
as $$
  select nullif(
    coalesce(current_setting('request.headers', true), '{}'::text)::jsonb ->> 'x-tenant-slug',
    ''
  )
$$;

-- ----------------------------------------------------------------------------
-- Helper: replace every policy on a table with a tenant-scoped equivalent.
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
  policy_name text;
begin
  foreach t in array array[
    'pos_menu',
    'pos_categories',
    'pos_orders',
    'pos_channels',
    'pos_discounts',
    'pos_feedback',
    'restaurant_settings',
    'inventory_items',
    'stock_movements',
    'pos_item_recipes',
    'pos_tables',
    'reservations',
    'guests',
    'pos_shifts',
    'menu_modifier_groups'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      -- Drop the permissive policies installed by earlier migrations.
      for policy_name in
        select polname from pg_policy
        where polrelid = 'public.' || t::regclass
      loop
        execute format('drop policy if exists %I on public.%I', policy_name, t);
      end loop;

      execute format('
        create policy "tenant isolate %1$s"
        on public.%1$s
        for all to anon, authenticated
        using (restaurant_id = public.current_tenant_id())
        with check (restaurant_id = public.current_tenant_id())
      ', t);
    end if;
  end loop;
end $$;

-- pos_order_items has no restaurant_id column; scope it through its order.
drop policy if exists "staff manage order items" on public.pos_order_items;
drop policy if exists "tenant isolate pos_order_items" on public.pos_order_items;
create policy "tenant isolate pos_order_items"
  on public.pos_order_items
  for all to anon, authenticated
  using (
    exists (
      select 1 from public.pos_orders o
      where o.id = order_id
        and o.restaurant_id = public.current_tenant_id()
    )
  )
  with check (
    exists (
      select 1 from public.pos_orders o
      where o.id = order_id
        and o.restaurant_id = public.current_tenant_id()
    )
  );

-- tenant_links is keyed by tenant slug, not restaurant uuid.
drop policy if exists "Allow public select tenant_links" on public.tenant_links;
drop policy if exists "Staff manage tenant links" on public.tenant_links;
drop policy if exists "tenant isolate tenant_links" on public.tenant_links;
create policy "tenant isolate tenant_links"
  on public.tenant_links
  for all to anon, authenticated
  using (tenant_id = public.current_tenant_slug())
  with check (tenant_id = public.current_tenant_slug());

-- ----------------------------------------------------------------------------
-- restaurants: public read (directory + tenant resolution), no public write.
-- ----------------------------------------------------------------------------
drop policy if exists "Public read restaurants" on public.restaurants;
create policy "Public read restaurants"
  on public.restaurants
  for select to anon, authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------------------
-- select polname, tablename from pg_policies
-- where schemaname = 'public'
-- order by tablename, polname;
