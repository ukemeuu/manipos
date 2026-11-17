-- ============================================================================
-- ManiPOS Platform Owner Backend (Super Admin) & New Signup Notifications
-- ============================================================================

-- 1. Platform admin allow-list table (in addition to Master Passcode)
create table if not exists public.platform_admins (
    email text primary key,
    name text,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.platform_admins enable row level security;

insert into public.platform_admins (email, name)
values ('potofjollofke@gmail.com', 'Platform Owner')
on conflict (email) do nothing;

-- 2. New restaurant signup events log (for real-time owner visibility & alerts)
create table if not exists public.platform_signup_events (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid references public.restaurants(id) on delete cascade,
    restaurant_name text not null,
    restaurant_slug text not null,
    owner_name text,
    owner_email text,
    owner_phone text,
    plan text default 'growth',
    business_type text default 'restaurant',
    acknowledged boolean not null default false,
    acknowledged_at timestamptz,
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_platform_signup_events_created_at
    on public.platform_signup_events (created_at desc);

alter table public.platform_signup_events enable row level security;

-- Allow authenticated platform admins to read signup events for Realtime
drop policy if exists "Platform admins read signup events" on public.platform_signup_events;
create policy "Platform admins read signup events"
    on public.platform_signup_events
    for select
    to authenticated
    using (
        exists (
            select 1 from public.platform_admins pa
            where lower(pa.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    );

-- Backfill existing restaurants into platform_signup_events (acknowledged = true for historical rows)
insert into public.platform_signup_events (
    restaurant_id, restaurant_name, restaurant_slug, owner_name, owner_email, owner_phone,
    plan, business_type, acknowledged, acknowledged_at, created_at
)
select
    r.id,
    r.name,
    r.slug,
    st.name,
    st.email,
    rs.phone,
    coalesce(r.plan, 'growth'),
    coalesce(r.business_type, 'restaurant'),
    true,
    timezone('utc', now()),
    r.created_at
from public.restaurants r
left join lateral (
    select name, email from public.staff_access
    where restaurant_id = r.id
    order by case when role = 'admin' then 0 else 1 end, created_at asc
    limit 1
) st on true
left join lateral (
    select phone from public.restaurant_settings
    where restaurant_id = r.id
    limit 1
) rs on true
where not exists (
    select 1 from public.platform_signup_events pse where pse.restaurant_id = r.id
);

-- Trigger to automatically log every new restaurant signup
create or replace function public.log_new_restaurant_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_owner_name text;
    v_owner_email text;
    v_owner_phone text;
begin
    select name, email into v_owner_name, v_owner_email
    from public.staff_access
    where restaurant_id = new.id
    order by case when role = 'admin' then 0 else 1 end, created_at asc
    limit 1;

    select phone into v_owner_phone
    from public.restaurant_settings
    where restaurant_id = new.id
    limit 1;

    insert into public.platform_signup_events (
        restaurant_id, restaurant_name, restaurant_slug,
        owner_name, owner_email, owner_phone,
        plan, business_type, acknowledged, created_at
    )
    values (
        new.id, new.name, new.slug,
        v_owner_name, v_owner_email, v_owner_phone,
        coalesce(new.plan, 'growth'), coalesce(new.business_type, 'restaurant'),
        false, coalesce(new.created_at, timezone('utc', now()))
    );

    return new;
end;
$$;

drop trigger if exists trg_log_new_restaurant_signup on public.restaurants;
create trigger trg_log_new_restaurant_signup
    after insert on public.restaurants
    for each row
    execute function public.log_new_restaurant_signup();

-- Also update signup event with owner contact once staff_access / restaurant_settings are inserted
create or replace function public.enrich_signup_event_from_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.role = 'admin' then
        update public.platform_signup_events
        set owner_name = coalesce(owner_name, new.name),
            owner_email = coalesce(owner_email, new.email)
        where restaurant_id = new.restaurant_id
          and (owner_name is null or owner_email is null);
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enrich_signup_event_from_staff on public.staff_access;
create trigger trg_enrich_signup_event_from_staff
    after insert on public.staff_access
    for each row
    execute function public.enrich_signup_event_from_staff();

create or replace function public.enrich_signup_event_from_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.phone is not null then
        update public.platform_signup_events
        set owner_phone = coalesce(owner_phone, new.phone)
        where restaurant_id = new.restaurant_id
          and owner_phone is null;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_enrich_signup_event_from_settings on public.restaurant_settings;
create trigger trg_enrich_signup_event_from_settings
    after insert or update of phone on public.restaurant_settings
    for each row
    execute function public.enrich_signup_event_from_settings();

-- 3. Unified platform owner authorization helper
create or replace function public.admin_is_authorized(p_passcode text default null)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_email text;
begin
    -- Check authenticated Supabase user against platform_admins table
    v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    if v_email <> '' and exists (
        select 1 from public.platform_admins pa where lower(pa.email) = v_email
    ) then
        return true;
    end if;

    -- Fall back to Master Passcode verification
    if coalesce(p_passcode, '') <> '' and public.admin_verify_passcode(p_passcode) then
        return true;
    end if;

    return false;
end;
$$;

-- Allow authenticated platform admins to update the Master Passcode
create or replace function public.admin_set_passcode(
    p_new_passcode text,
    p_current_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_is_authorized(p_current_passcode) then
        raise exception 'Not authorized to change platform passcode';
    end if;

    if p_new_passcode is null or length(trim(p_new_passcode)) < 6 then
        return jsonb_build_object('success', false, 'error', 'Passcode must be at least 6 characters.');
    end if;

    insert into public.platform_settings (key, value, updated_at)
    values ('super_admin_passcode', crypt(trim(p_new_passcode), gen_salt('bf')), timezone('utc', now()))
    on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at;

    return jsonb_build_object('success', true);
end;
$$;

-- 4. Enhanced admin_list_restaurants (with order counts, revenue, staff count, plan & subscription)
create or replace function public.admin_list_restaurants(p_passcode text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_is_authorized(p_passcode) then
        raise exception 'Invalid platform credentials';
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
                r.subscription_status,
                r.billing_cycle,
                r.business_type,
                r.cuisine,
                r.created_at,
                r.trial_ends_at,
                coalesce((
                    select jsonb_build_object(
                        'phone', s.phone,
                        'locations_count', s.locations_count,
                        'brands_count', s.brands_count,
                        'currency', s.currency
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
                    order by case when st.role = 'admin' then 0 else 1 end, st.created_at asc
                    limit 1
                ), '{}'::jsonb) as owner,
                coalesce((
                    select count(*) from public.pos_orders o where o.restaurant_id = r.id
                ), 0) as orders_count,
                coalesce((
                    select sum(coalesce(o.total_amount, 0))
                    from public.pos_orders o
                    where o.restaurant_id = r.id
                      and coalesce(lower(o.status), '') not in ('cancelled', 'void', 'voided')
                ), 0) as total_revenue,
                (
                    select max(o.created_at) from public.pos_orders o where o.restaurant_id = r.id
                ) as last_order_at,
                coalesce((
                    select count(*) from public.staff_access st where st.restaurant_id = r.id and coalesce(st.active, true)
                ), 0) as staff_count
            from public.restaurants r
            order by r.created_at desc
        ) t
    ), '[]'::jsonb);
end;
$$;

-- 5. Enhanced admin_platform_metrics (with signup counts & unacknowledged alerts)
create or replace function public.admin_platform_metrics(p_passcode text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_is_authorized(p_passcode) then
        raise exception 'Invalid platform credentials';
    end if;

    return (
        select jsonb_build_object(
            'orders_count', (select count(*) from public.pos_orders),
            'total_revenue', (
                select coalesce(sum(coalesce(total_amount, 0)), 0)
                from public.pos_orders
                where coalesce(lower(status), '') not in ('cancelled', 'void', 'voided')
            ),
            'total_restaurants', count(*),
            'pending_count', count(*) filter (where status = 'pending'),
            'trial_count', count(*) filter (where status = 'trial' or subscription_status = 'trialing'),
            'approved_count', count(*) filter (where status in ('approved', 'active') or (status is null and coalesce(is_active, true))),
            'deactivated_count', count(*) filter (where status = 'deactivated' or is_active = false),
            'signups_today', count(*) filter (where created_at >= date_trunc('day', timezone('utc', now()))),
            'signups_7d', count(*) filter (where created_at >= timezone('utc', now()) - interval '7 days'),
            'unacknowledged_signups', (select count(*) from public.platform_signup_events where not acknowledged)
        )
        from public.restaurants
    );
end;
$$;

-- 6. List & acknowledge signup notifications
create or replace function public.admin_list_signup_events(
    p_passcode text default null,
    p_limit int default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_is_authorized(p_passcode) then
        raise exception 'Invalid platform credentials';
    end if;

    return coalesce((
        select jsonb_agg(row_to_json(t))
        from (
            select
                e.id,
                e.restaurant_id,
                e.restaurant_name,
                e.restaurant_slug,
                coalesce(e.owner_name, st.name) as owner_name,
                coalesce(e.owner_email, st.email) as owner_email,
                coalesce(e.owner_phone, rs.phone) as owner_phone,
                e.plan,
                e.business_type,
                e.acknowledged,
                e.acknowledged_at,
                e.created_at
            from public.platform_signup_events e
            left join lateral (
                select name, email from public.staff_access
                where restaurant_id = e.restaurant_id
                order by case when role = 'admin' then 0 else 1 end, created_at asc
                limit 1
            ) st on true
            left join lateral (
                select phone from public.restaurant_settings
                where restaurant_id = e.restaurant_id
                limit 1
            ) rs on true
            order by e.created_at desc
            limit greatest(1, least(coalesce(p_limit, 50), 200))
        ) t
    ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_acknowledge_signups(
    p_event_ids uuid[] default null,
    p_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_is_authorized(p_passcode) then
        raise exception 'Invalid platform credentials';
    end if;

    if p_event_ids is null or array_length(p_event_ids, 1) is null then
        update public.platform_signup_events
        set acknowledged = true,
            acknowledged_at = timezone('utc', now())
        where not acknowledged;
    else
        update public.platform_signup_events
        set acknowledged = true,
            acknowledged_at = timezone('utc', now())
        where id = any(p_event_ids);
    end if;

    return jsonb_build_object('success', true);
end;
$$;

-- 7. Update status / extend trial / unified account management
create or replace function public.admin_update_restaurant_status(
    p_restaurant_id uuid,
    p_status text,
    p_is_active boolean,
    p_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_is_authorized(p_passcode) then
        raise exception 'Invalid platform credentials';
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
    v_next timestamptz;
begin
    if not public.admin_is_authorized(p_passcode) then
        raise exception 'Invalid platform credentials';
    end if;

    select greatest(coalesce(trial_ends_at, timezone('utc', now())), timezone('utc', now())) into v_current
    from public.restaurants where id = p_restaurant_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Restaurant not found.');
    end if;

    v_next := v_current + make_interval(days => p_days);

    update public.restaurants
    set trial_ends_at = v_next,
        status = 'approved',
        is_active = true,
        updated_at = timezone('utc', now())
    where id = p_restaurant_id;

    return jsonb_build_object('success', true, 'trial_ends_at', v_next);
end;
$$;

create or replace function public.admin_update_restaurant_account(
    p_restaurant_id uuid,
    p_status text default null,
    p_is_active boolean default null,
    p_plan text default null,
    p_subscription_status text default null,
    p_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    if not public.admin_is_authorized(p_passcode) then
        raise exception 'Invalid platform credentials';
    end if;

    update public.restaurants
    set status = coalesce(p_status, status),
        is_active = coalesce(p_is_active, is_active),
        plan = coalesce(p_plan, plan),
        subscription_status = coalesce(p_subscription_status, subscription_status),
        updated_at = timezone('utc', now())
    where id = p_restaurant_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Restaurant not found.');
    end if;

    if p_plan is not null then
        update public.restaurant_settings
        set plan = p_plan
        where restaurant_id = p_restaurant_id;
    end if;

    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_reset_owner_pin(
    p_restaurant_id uuid,
    p_new_pin text,
    p_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_staff_id uuid;
begin
    if not public.admin_is_authorized(p_passcode) then
        raise exception 'Invalid platform credentials';
    end if;

    if p_new_pin is null or length(trim(p_new_pin)) < 4 then
        return jsonb_build_object('success', false, 'error', 'PIN/password must be at least 4 characters.');
    end if;

    select id into v_staff_id
    from public.staff_access
    where restaurant_id = p_restaurant_id
    order by case when role = 'admin' then 0 else 1 end, created_at asc
    limit 1;

    if v_staff_id is null then
        return jsonb_build_object('success', false, 'error', 'No staff account found for this restaurant.');
    end if;

    update public.staff_access
    set pin_hash = crypt(trim(p_new_pin), gen_salt('bf')),
        pin_code = trim(p_new_pin),
        updated_at = timezone('utc', now())
    where id = v_staff_id;

    return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.admin_is_authorized(text) to anon, authenticated;
grant execute on function public.admin_set_passcode(text, text) to anon, authenticated;
grant execute on function public.admin_list_restaurants(text) to anon, authenticated;
grant execute on function public.admin_platform_metrics(text) to anon, authenticated;
grant execute on function public.admin_list_signup_events(text, int) to anon, authenticated;
grant execute on function public.admin_acknowledge_signups(uuid[], text) to anon, authenticated;
grant execute on function public.admin_update_restaurant_status(uuid, text, boolean, text) to anon, authenticated;
grant execute on function public.admin_extend_trial(uuid, integer, text) to anon, authenticated;
grant execute on function public.admin_update_restaurant_account(uuid, text, boolean, text, text, text) to anon, authenticated;
grant execute on function public.admin_reset_owner_pin(uuid, text, text) to anon, authenticated;
