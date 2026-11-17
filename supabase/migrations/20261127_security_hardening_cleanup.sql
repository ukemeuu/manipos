-- ============================================================================
-- ManiPOS Security Hardening Cleanup (PIN-session safe)
--
-- PIN terminal logins run as the `anon` role and identify the tenant through
-- the x-tenant-id header, resolved by public.current_tenant_id() (which prefers
-- the JWT app_metadata.tenant_id claim when a Supabase Auth session exists).
-- These policies therefore scope writes by current_tenant_id() for BOTH anon
-- and authenticated, instead of requiring an Auth JWT.
--
-- 1. merchant_wallet_ledger: clients may only READ their tenant's ledger.
--    Balance credits must come from service_role (verified payment callbacks).
-- 2. Core POS tables: replace `using (true) with check (true)` (any client could
--    edit/delete any tenant's rows) with tenant-scoped writes. Public SELECT is
--    kept for guest menus; guest checkout INSERT on orders is kept open.
-- ============================================================================

-- 1. Wallet ledger: read-only for clients
drop policy if exists "merchant_wallet_ledger_tenant_isolation" on public.merchant_wallet_ledger;
drop policy if exists "merchant_wallet_ledger_tenant_read" on public.merchant_wallet_ledger;
create policy "merchant_wallet_ledger_tenant_read"
  on public.merchant_wallet_ledger
  for select
  to anon, authenticated
  using (restaurant_id = public.current_tenant_id());

-- 2. Tables with a restaurant_id column: public read, tenant-scoped writes
do $$
declare
  v_tbl text;
  v_old text;
begin
  foreach v_tbl in array array[
    'pos_tables',
    'reservations',
    'inventory_items',
    'stock_movements',
    'pos_item_recipes',
    'pos_channels',
    'pos_menu',
    'pos_categories',
    'pos_discounts',
    'restaurant_settings'
  ]
  loop
    foreach v_old in array array[
      'staff manage tables', 'staff manage reservations', 'staff manage inventory',
      'staff manage stock movements', 'staff manage recipes', 'staff manage channels',
      'staff manage menu', 'staff manage categories', 'staff manage discounts',
      'staff manage settings'
    ]
    loop
      execute format('drop policy if exists %I on public.%I', v_old, v_tbl);
    end loop;

    execute format('drop policy if exists %I on public.%I', v_tbl || '_public_read', v_tbl);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      v_tbl || '_public_read', v_tbl
    );

    execute format('drop policy if exists %I on public.%I', v_tbl || '_tenant_insert', v_tbl);
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (restaurant_id = public.current_tenant_id())',
      v_tbl || '_tenant_insert', v_tbl
    );

    execute format('drop policy if exists %I on public.%I', v_tbl || '_tenant_update', v_tbl);
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id())',
      v_tbl || '_tenant_update', v_tbl
    );

    execute format('drop policy if exists %I on public.%I', v_tbl || '_tenant_delete', v_tbl);
    execute format(
      'create policy %I on public.%I for delete to anon, authenticated using (restaurant_id = public.current_tenant_id())',
      v_tbl || '_tenant_delete', v_tbl
    );
  end loop;
end $$;

-- 3. pos_orders: public read + open guest checkout insert; tenant-scoped update/delete
drop policy if exists "staff manage orders" on public.pos_orders;
drop policy if exists "pos_orders_public_read" on public.pos_orders;
drop policy if exists "pos_orders_guest_insert" on public.pos_orders;
drop policy if exists "pos_orders_auth_tenant_manage" on public.pos_orders;
drop policy if exists "pos_orders_tenant_update" on public.pos_orders;
drop policy if exists "pos_orders_tenant_delete" on public.pos_orders;

create policy "pos_orders_public_read"
  on public.pos_orders for select to anon, authenticated using (true);

create policy "pos_orders_guest_insert"
  on public.pos_orders for insert to anon, authenticated with check (true);

create policy "pos_orders_tenant_update"
  on public.pos_orders for update to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

create policy "pos_orders_tenant_delete"
  on public.pos_orders for delete to anon, authenticated
  using (restaurant_id = public.current_tenant_id());

-- 4. pos_order_items (no restaurant_id column): scope via parent order
drop policy if exists "staff manage order items" on public.pos_order_items;
drop policy if exists "pos_order_items_public_read" on public.pos_order_items;
drop policy if exists "pos_order_items_guest_insert" on public.pos_order_items;
drop policy if exists "pos_order_items_auth_tenant_manage" on public.pos_order_items;
drop policy if exists "pos_order_items_tenant_update" on public.pos_order_items;
drop policy if exists "pos_order_items_tenant_delete" on public.pos_order_items;

create policy "pos_order_items_public_read"
  on public.pos_order_items for select to anon, authenticated using (true);

create policy "pos_order_items_guest_insert"
  on public.pos_order_items for insert to anon, authenticated with check (true);

create policy "pos_order_items_tenant_update"
  on public.pos_order_items for update to anon, authenticated
  using (exists (
    select 1 from public.pos_orders o
    where o.id = pos_order_items.order_id and o.restaurant_id = public.current_tenant_id()
  ))
  with check (exists (
    select 1 from public.pos_orders o
    where o.id = pos_order_items.order_id and o.restaurant_id = public.current_tenant_id()
  ));

create policy "pos_order_items_tenant_delete"
  on public.pos_order_items for delete to anon, authenticated
  using (exists (
    select 1 from public.pos_orders o
    where o.id = pos_order_items.order_id and o.restaurant_id = public.current_tenant_id()
  ));
