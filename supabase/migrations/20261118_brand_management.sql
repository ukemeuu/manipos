-- ============================================================================
-- ManiPOS · Brand management (18 Nov 2026)
-- ============================================================================
-- Owners can activate/deactivate a brand. Deactivated brands are hidden from
-- the POS brand tabs and their items are excluded from the register.
-- ============================================================================

create table if not exists public.pos_brands (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    name text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists pos_brands_tenant_name_key
  on public.pos_brands (restaurant_id, lower(name));

-- Seed brands from the distinct brand arrays already stored on menu items.
insert into public.pos_brands (restaurant_id, name)
select distinct m.restaurant_id, b
from public.pos_menu m
cross join lateral jsonb_array_elements_text(coalesce(m.brands, '[]'::jsonb)) as b
on conflict do nothing;

alter table public.pos_brands enable row level security;

drop policy if exists "tenant read brands" on public.pos_brands;
create policy "tenant read brands"
  on public.pos_brands for select to anon, authenticated
  using (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant manage brands" on public.pos_brands;
create policy "tenant manage brands"
  on public.pos_brands for insert to anon, authenticated
  with check (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant update brands" on public.pos_brands;
create policy "tenant update brands"
  on public.pos_brands for update to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant delete brands" on public.pos_brands;
create policy "tenant delete brands"
  on public.pos_brands for delete to anon, authenticated
  using (restaurant_id = public.current_tenant_id());
