-- ============================================================================
-- ManiPOS · Granular role permissions
--
-- Until now access control was four hard-coded roles (admin / manager /
-- cashier / waiter) and every check was `role === 'admin'`, so any Manager
-- could reach the whole dashboard. This adds a permission catalogue, a
-- role -> permission matrix, and an optional per-user override.
--
--   permissions        the catalogue of things a user may do
--   role_permissions   the default set for each role (editable)
--   staff_access.permissions
--                      an explicit list for one user; NULL means "use my
--                      role's defaults"
--
-- The client resolves a user's effective permissions from these, and the
-- server enforces the sensitive ones through effective_permissions().
-- ============================================================================

create table if not exists public.permissions (
    key         text primary key,
    label       text not null,
    group_name  text not null default 'General',
    sort_order  int  not null default 0
);

alter table public.permissions enable row level security;
drop policy if exists "public read permissions" on public.permissions;
create policy "public read permissions"
    on public.permissions
    for select to anon, authenticated
    using (true);

create table if not exists public.role_permissions (
    role           text not null,
    permission_key text not null references public.permissions(key) on delete cascade,
    primary key (role, permission_key)
);

alter table public.role_permissions enable row level security;
drop policy if exists "public read role permissions" on public.role_permissions;
create policy "public read role permissions"
    on public.role_permissions
    for select to anon, authenticated
    using (true);

insert into public.permissions (key, label, group_name, sort_order) values
    ('view_dashboard',   'View management dashboard',      'Access',        1),
    ('view_analytics',   'View analytics & reports',       'Insights',      2),
    ('view_orders',      'View order history',             'Sales',         3),
    ('void_orders',      'Void & refund orders',           'Sales',         4),
    ('manage_discounts', 'Manage discounts',               'Sales',         5),
    ('manage_offers',    'Manage offers & promotions',     'Sales',         6),
    ('manage_menu',      'Edit menu & categories',         'Catalogue',     7),
    ('manage_inventory', 'Manage inventory & recipes',     'Catalogue',     8),
    ('manage_suppliers', 'Manage suppliers',               'Catalogue',     9),
    ('manage_guests',    'Manage guest CRM & loyalty',     'Customers',    10),
    ('manage_feedback',  'Manage customer feedback',       'Customers',    11),
    ('manage_staff',     'Manage staff & permissions',     'Administration', 12),
    ('manage_settings',  'Edit store settings',            'Administration', 13),
    ('manage_floor',     'Manage floor plan & reservations','Administration', 14),
    ('view_audit',       'View audit log',                 'Administration', 15)
on conflict (key) do nothing;

-- Role defaults. An administrator can edit these; a user with an explicit
-- staff_access.permissions list always uses that instead.
insert into public.role_permissions (role, permission_key)
select 'admin', key from public.permissions
on conflict do nothing;

insert into public.role_permissions (role, permission_key)
select 'manager', key from public.permissions where key <> 'manage_staff'
on conflict do nothing;

insert into public.role_permissions (role, permission_key) values
    ('cashier', 'view_dashboard'),
    ('cashier', 'view_orders'),
    ('cashier', 'void_orders'),
    ('waiter',  'view_dashboard'),
    ('waiter',  'view_orders')
on conflict do nothing;

-- Per-user override: a JSON array of permission keys, or NULL for role defaults.
alter table public.staff_access add column if not exists permissions jsonb;

comment on column public.staff_access.permissions is
    'Explicit permission list for this user. NULL means use the role defaults from role_permissions.';

-- Resolve a staff member's effective permissions (override, else role defaults).
create or replace function public.effective_permissions(p_staff_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role      text;
    v_override  text[];
    v_defaults  text[];
begin
    select role, permissions::text[]
      into v_role, v_override
      from public.staff_access
     where id = p_staff_id;

    if not found then
        return '{}'::text[];
    end if;

    if v_override is not null then
        return v_override;
    end if;

    select array_agg(permission_key)
      into v_defaults
      from public.role_permissions
     where role = v_role;

    return coalesce(v_defaults, '{}'::text[]);
end;
$$;

-- Server-side gate for the sensitive RPCs.
create or replace function public.has_permission(p_staff_id uuid, p_permission text)
returns boolean
language sql
security definer
set search_path = public, extensions
stable
as $$
    select p_permission = any(public.effective_permissions(p_staff_id));
$$;

grant execute on function public.effective_permissions(uuid) to anon, authenticated;
grant execute on function public.has_permission(uuid, text) to anon, authenticated;
