-- ============================================================================
-- ManiPOS Native Push Order Ringing — Device Push Tokens
-- Stores FCM (Android & iOS via Firebase) / APNs tokens per restaurant device
-- so incoming orders can ring loudly even when the app is backgrounded or locked.
-- ============================================================================

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid,
  platform text not null check (platform in ('android', 'ios', 'web')),
  token text not null,
  device_label text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_device_push_tokens_restaurant_token
  on public.device_push_tokens (restaurant_id, token);

create index if not exists idx_device_push_tokens_active_restaurant
  on public.device_push_tokens (restaurant_id)
  where is_active = true;

alter table public.device_push_tokens enable row level security;

drop policy if exists "device_push_tokens_tenant_isolation" on public.device_push_tokens;
create policy "device_push_tokens_tenant_isolation"
  on public.device_push_tokens
  for all
  to anon, authenticated
  using (restaurant_id = public.current_tenant_id())
  with check (restaurant_id = public.current_tenant_id());

-- SECURITY DEFINER RPC so both PIN-authenticated and Supabase-authenticated
-- native devices can register or refresh their push token cleanly.
create or replace function public.register_device_push_token(
  p_restaurant_id uuid,
  p_token text,
  p_platform text default 'android',
  p_staff_id uuid default null,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_token text := trim(coalesce(p_token, ''));
  v_clean_platform text := lower(trim(coalesce(p_platform, 'android')));
begin
  if p_restaurant_id is null or length(v_clean_token) < 16 then
    return jsonb_build_object('success', false, 'error', 'Invalid restaurant_id or push token.');
  end if;

  if v_clean_platform not in ('android', 'ios', 'web') then
    v_clean_platform := 'android';
  end if;

  -- If this physical device previously belonged to another tenant, deactivate old bindings
  update public.device_push_tokens
  set is_active = false,
      last_seen_at = timezone('utc', now())
  where token = v_clean_token
    and restaurant_id <> p_restaurant_id
    and is_active = true;

  insert into public.device_push_tokens (
    restaurant_id, staff_id, platform, token, device_label, is_active, last_seen_at
  )
  values (
    p_restaurant_id, p_staff_id, v_clean_platform, v_clean_token,
    nullif(trim(coalesce(p_device_label, '')), ''), true, timezone('utc', now())
  )
  on conflict (restaurant_id, token) do update
  set staff_id = coalesce(excluded.staff_id, device_push_tokens.staff_id),
      platform = excluded.platform,
      device_label = coalesce(excluded.device_label, device_push_tokens.device_label),
      is_active = true,
      last_seen_at = timezone('utc', now());

  return jsonb_build_object('success', true);
end;
$$;

-- Deactivate a device's push token on sign-out so it stops ringing for that store
create or replace function public.deactivate_device_push_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_token text := trim(coalesce(p_token, ''));
begin
  if length(v_clean_token) < 16 then
    return jsonb_build_object('success', false);
  end if;

  update public.device_push_tokens
  set is_active = false,
      last_seen_at = timezone('utc', now())
  where token = v_clean_token;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.register_device_push_token(uuid, text, text, uuid, text) to anon, authenticated;
grant execute on function public.deactivate_device_push_token(text) to anon, authenticated;
