-- ============================================================================
-- ManiPOS Security Hardening Cleanup
-- 1. Prevent unverified client-side wallet top-up inserts into merchant_wallet_ledger
-- 2. Restrict anonymous cross-tenant UPDATE/DELETE on core POS tables
-- ============================================================================

-- 1. Wallet ledger: tenants can read their own ledger; writes require service_role
drop policy if exists "merchant_wallet_ledger_tenant_isolation" on public.merchant_wallet_ledger;
drop policy if exists "merchant_wallet_ledger_tenant_read" on public.merchant_wallet_ledger;
create policy "merchant_wallet_ledger_tenant_read"
  on public.merchant_wallet_ledger
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '') = ''
    or restaurant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

-- 2. Tighten core POS tables so anon cannot UPDATE/DELETE arbitrary tenant rows.
--    Public microsites still have SELECT and guest order INSERT; authenticated
--    tenant sessions (matching app_metadata.tenant_id when present) retain writes.
do $$
declare
  v_tbl text;
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
    execute format('drop policy if exists "staff manage orders" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage order items" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage tables" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage reservations" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage inventory" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage stock movements" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage recipes" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage channels" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage menu" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage categories" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage discounts" on public.%I', v_tbl);
    execute format('drop policy if exists "staff manage settings" on public.%I', v_tbl);

    execute format('drop policy if exists "%1$s_public_read" on public.%1$I', v_tbl);
    execute format(
      'create policy "%1$s_public_read" on public.%1$I for select to anon, authenticated using (true)',
      v_tbl
    );

    execute format('drop policy if exists "%1$s_auth_tenant_write" on public.%1$I', v_tbl);
    execute format(
      'create policy "%1$s_auth_tenant_write" on public.%1$I for all to authenticated ' ||
      'using (coalesce(auth.jwt() -> ''app_metadata'' ->> ''tenant_id'', '''') = '''' or restaurant_id::text = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id'')) ' ||
      'with check (coalesce(auth.jwt() -> ''app_metadata'' ->> ''tenant_id'', '''') = '''' or restaurant_id::text = (auth.jwt() -> ''app_metadata'' ->> ''tenant_id''))',
      v_tbl
    );
  end loop;
end $$;

-- pos_orders & pos_order_items: preserve guest checkout INSERT for anon, scope UPDATE/DELETE to authenticated
drop policy if exists "staff manage orders" on public.pos_orders;
drop policy if exists "pos_orders_public_read" on public.pos_orders;
drop policy if exists "pos_orders_guest_insert" on public.pos_orders;
drop policy if exists "pos_orders_auth_tenant_manage" on public.pos_orders;

create policy "pos_orders_public_read"
  on public.pos_orders for select to anon, authenticated using (true);

create policy "pos_orders_guest_insert"
  on public.pos_orders for insert to anon, authenticated with check (true);

create policy "pos_orders_auth_tenant_manage"
  on public.pos_orders for update to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '') = ''
    or restaurant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  )
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '') = ''
    or restaurant_id::text = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')
  );

drop policy if exists "staff manage order items" on public.pos_order_items;
drop policy if exists "pos_order_items_public_read" on public.pos_order_items;
drop policy if exists "pos_order_items_guest_insert" on public.pos_order_items;
drop policy if exists "pos_order_items_auth_tenant_manage" on public.pos_order_items;

create policy "pos_order_items_public_read"
  on public.pos_order_items for select to anon, authenticated using (true);

create policy "pos_order_items_guest_insert"
  on public.pos_order_items for insert to anon, authenticated with check (true);

create policy "pos_order_items_auth_tenant_manage"
  on public.pos_order_items for update to authenticated
  using (true)
  with check (true);
