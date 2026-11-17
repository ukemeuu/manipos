-- ============================================================================
-- ManiPOS · Staff order visibility, discounts and delivery/packaging
-- ============================================================================
-- 1. pos_orders: attribute each order to the staff member who punched it and
--    store the manual discount mode plus packaging fee.
-- 2. permissions: add "view_previous_days" (admin only by default) so an
--    administrator can grant a staff member access to previous days.
-- ============================================================================

alter table public.pos_orders add column if not exists staff_id uuid;
alter table public.pos_orders add column if not exists packaging_fee numeric(10,2) not null default 0;
alter table public.pos_orders add column if not exists discount_type text;
alter table public.pos_orders add column if not exists discount_value numeric(10,2);

create index if not exists pos_orders_staff_idx
  on public.pos_orders (restaurant_id, staff_id, created_at desc);

insert into public.permissions (key, label, group_name, sort_order) values
  ('view_previous_days', 'View previous days orders & sales', 'Sales', 16)
on conflict (key) do nothing;

-- Admin only by default. An administrator can grant it per user from the
-- staff permissions screen.
insert into public.role_permissions (role, permission_key)
values ('admin', 'view_previous_days')
on conflict do nothing;
