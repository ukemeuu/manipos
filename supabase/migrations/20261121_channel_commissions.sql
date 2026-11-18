-- ============================================================================
-- ManiPOS · Channel commissions (21 Nov 2026)
-- ============================================================================
-- Platform commission is tied to the sales channel (and, when set, the brand).
-- Example: Glovo / Pot of Jollof = 29%, Glovo / Little Lagos = 27%,
-- UberEats / Little Lagos = 20%, Bolt Food = 30% for both brands.
-- A row with a NULL brand is the channel-wide fallback.
-- ============================================================================

create table if not exists public.pos_channel_commissions (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    channel text not null,
    brand text,
    commission_percent numeric(5,2) not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists pos_channel_commissions_key
  on public.pos_channel_commissions (restaurant_id, lower(channel), lower(coalesce(brand, '')));

create index if not exists pos_channel_commissions_tenant_idx
  on public.pos_channel_commissions (restaurant_id, is_active);

alter table public.pos_channel_commissions enable row level security;

drop policy if exists "tenant read channel commissions" on public.pos_channel_commissions;
create policy "tenant read channel commissions"
  on public.pos_channel_commissions for select to anon, authenticated
  using (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant insert channel commissions" on public.pos_channel_commissions;
create policy "tenant insert channel commissions"
  on public.pos_channel_commissions for insert to anon, authenticated
  with check (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant update channel commissions" on public.pos_channel_commissions;
create policy "tenant update channel commissions"
  on public.pos_channel_commissions for update to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant delete channel commissions" on public.pos_channel_commissions;
create policy "tenant delete channel commissions"
  on public.pos_channel_commissions for delete to anon, authenticated
  using (restaurant_id = public.current_tenant_id());
