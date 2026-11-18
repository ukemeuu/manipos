-- ============================================================================
-- ManiPOS · Daily report email subscribers (21 Nov 2026)
-- ============================================================================
-- Owners register emails and tick which daily reports each address receives:
-- sales breakdown, platform commission paid, and closing-stock / reorder.
-- ============================================================================

create table if not exists public.report_subscribers (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    email text not null,
    sales_report boolean not null default true,
    commission_report boolean not null default true,
    inventory_report boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists report_subscribers_tenant_email_key
  on public.report_subscribers (restaurant_id, lower(email));

create index if not exists report_subscribers_tenant_idx
  on public.report_subscribers (restaurant_id, is_active);

alter table public.report_subscribers enable row level security;

drop policy if exists "tenant read report subscribers" on public.report_subscribers;
create policy "tenant read report subscribers"
  on public.report_subscribers for select to anon, authenticated
  using (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant insert report subscribers" on public.report_subscribers;
create policy "tenant insert report subscribers"
  on public.report_subscribers for insert to anon, authenticated
  with check (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant update report subscribers" on public.report_subscribers;
create policy "tenant update report subscribers"
  on public.report_subscribers for update to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant delete report subscribers" on public.report_subscribers;
create policy "tenant delete report subscribers"
  on public.report_subscribers for delete to anon, authenticated
  using (restaurant_id = public.current_tenant_id());
