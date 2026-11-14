-- ============================================================================
-- ManiPOS · Commercial SaaS Security, Per-Tenant M-Pesa & Order Integrity
-- Safe & additive migration for live tenants (potofjollof, littlelagos, etc.)
-- ============================================================================

-- 1. SaaS subscription & trial columns on restaurants
alter table public.restaurants add column if not exists subscription_status text default 'trialing';
alter table public.restaurants add column if not exists billing_cycle text default 'monthly';
alter table public.restaurants add column if not exists subscription_paid_until timestamptz;
alter table public.restaurants add column if not exists last_billing_reference text;

-- 2. Per-tenant Daraja (M-Pesa) encrypted/isolated credentials table
--    RLS enabled with ZERO anon/authenticated policies so secrets stay strictly
--    inside Supabase Edge Functions (Service Role) & SECURITY DEFINER RPCs.
create table if not exists public.restaurant_payment_credentials (
    restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
    provider text not null default 'daraja',
    environment text not null default 'production',
    transaction_type text not null default 'CustomerPayBillOnline',
    shortcode text not null,
    account_reference text,
    consumer_key text not null,
    consumer_secret text not null,
    passkey text not null,
    is_active boolean not null default true,
    updated_at timestamptz not null default timezone('utc', now()),
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.restaurant_payment_credentials enable row level security;
revoke all on table public.restaurant_payment_credentials from anon, authenticated;

-- Admin-verified RPC to save per-tenant Daraja credentials without exposing table access
create or replace function public.upsert_tenant_daraja_credentials(
    p_restaurant_id uuid,
    p_actor_id uuid,
    p_shortcode text,
    p_consumer_key text,
    p_consumer_secret text,
    p_passkey text,
    p_transaction_type text default 'CustomerPayBillOnline',
    p_environment text default 'production',
    p_account_reference text default null,
    p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_actor public.staff_access%rowtype;
begin
    if p_restaurant_id is null or p_actor_id is null then
        return jsonb_build_object('success', false, 'error', 'Missing restaurant or staff actor context.');
    end if;

    select * into v_actor
    from public.staff_access
    where id = p_actor_id
      and restaurant_id = p_restaurant_id
      and active = true
    limit 1;

    if not found or lower(coalesce(v_actor.role, '')) not in ('admin', 'manager', 'owner') then
        return jsonb_build_object('success', false, 'error', 'Only an Admin or Manager can update Daraja credentials.');
    end if;

    if length(trim(coalesce(p_shortcode, ''))) < 4 then
        return jsonb_build_object('success', false, 'error', 'Enter a valid M-Pesa Paybill or Till Shortcode.');
    end if;

    insert into public.restaurant_payment_credentials (
        restaurant_id, provider, environment, transaction_type, shortcode,
        account_reference, consumer_key, consumer_secret, passkey, is_active, updated_at
    )
    values (
        p_restaurant_id,
        'daraja',
        case when lower(coalesce(p_environment, 'production')) = 'sandbox' then 'sandbox' else 'production' end,
        case when p_transaction_type = 'CustomerBuyGoodsOnline' then 'CustomerBuyGoodsOnline' else 'CustomerPayBillOnline' end,
        trim(p_shortcode),
        nullif(trim(coalesce(p_account_reference, '')), ''),
        trim(p_consumer_key),
        trim(p_consumer_secret),
        trim(p_passkey),
        coalesce(p_is_active, true),
        timezone('utc', now())
    )
    on conflict (restaurant_id) do update set
        environment = excluded.environment,
        transaction_type = excluded.transaction_type,
        shortcode = excluded.shortcode,
        account_reference = excluded.account_reference,
        consumer_key = case when excluded.consumer_key <> '' then excluded.consumer_key else restaurant_payment_credentials.consumer_key end,
        consumer_secret = case when excluded.consumer_secret <> '' then excluded.consumer_secret else restaurant_payment_credentials.consumer_secret end,
        passkey = case when excluded.passkey <> '' then excluded.passkey else restaurant_payment_credentials.passkey end,
        is_active = excluded.is_active,
        updated_at = timezone('utc', now());

    return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.upsert_tenant_daraja_credentials(uuid, uuid, text, text, text, text, text, text, text, boolean) to anon, authenticated;

-- Masked status getter (NEVER returns secrets to browser)
create or replace function public.get_tenant_daraja_status(p_restaurant_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
    select coalesce(
        (
            select jsonb_build_object(
                'configured', true,
                'shortcode', shortcode,
                'transaction_type', transaction_type,
                'environment', environment,
                'account_reference', coalesce(account_reference, ''),
                'is_active', is_active,
                'has_consumer_key', length(coalesce(consumer_key, '')) > 4,
                'has_consumer_secret', length(coalesce(consumer_secret, '')) > 4,
                'has_passkey', length(coalesce(passkey, '')) > 4,
                'updated_at', updated_at
            )
            from public.restaurant_payment_credentials
            where restaurant_id = p_restaurant_id
            limit 1
        ),
        jsonb_build_object('configured', false)
    );
$$;

grant execute on function public.get_tenant_daraja_status(uuid) to anon, authenticated;

-- 3. Atomic POS order + line-item creation (eliminates duplicate orphan headers on offline sync)
create or replace function public.create_pos_order_atomic(
    p_header jsonb,
    p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_restaurant_id uuid := (p_header ->> 'restaurant_id')::uuid;
    v_idempotency_key text := nullif(trim(coalesce(p_header ->> 'idempotency_key', '')), '');
    v_order_id uuid;
    v_ticket text;
    v_item jsonb;
begin
    if v_restaurant_id is null then
        return jsonb_build_object('success', false, 'error', 'restaurant_id is required.');
    end if;

    -- Idempotency check
    if v_idempotency_key is not null then
        select id, ticket_number into v_order_id, v_ticket
        from public.pos_orders
        where idempotency_key = v_idempotency_key
        limit 1;

        if found then
            -- Ensure items exist even if previous attempt interrupted
            if not exists (select 1 from public.pos_order_items where order_id = v_order_id limit 1)
               and jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
                for v_item in select * from jsonb_array_elements(p_items)
                loop
                    insert into public.pos_order_items (order_id, item_name, quantity, price, instructions)
                    values (
                        v_order_id,
                        coalesce(v_item ->> 'item_name', v_item ->> 'name', 'Item'),
                        greatest(1, coalesce((v_item ->> 'quantity')::int, (v_item ->> 'qty')::int, 1)),
                        greatest(0, coalesce((v_item ->> 'price')::numeric, 0)),
                        coalesce(v_item ->> 'instructions', '')
                    );
                end loop;
            end if;
            return jsonb_build_object('success', true, 'order_id', v_order_id, 'ticket_number', v_ticket, 'deduplicated', true);
        end if;
    end if;

    v_ticket := coalesce(nullif(p_header ->> 'ticket_number', ''), 'ORD-' || floor(1000 + random() * 9000)::text);

    insert into public.pos_orders (
        restaurant_id, ticket_number, idempotency_key, brand, customer_name, customer_phone,
        delivery_address, total_amount, discount, payment_method, payment_status,
        dining_option, status, cashier_name, table_number, notes, created_at
    )
    values (
        v_restaurant_id,
        v_ticket,
        v_idempotency_key,
        coalesce(p_header ->> 'brand', 'POS'),
        coalesce(p_header ->> 'customer_name', 'Walk-in Guest'),
        nullif(p_header ->> 'customer_phone', ''),
        nullif(p_header ->> 'delivery_address', ''),
        greatest(0, coalesce((p_header ->> 'total_amount')::numeric, 0)),
        greatest(0, coalesce((p_header ->> 'discount')::numeric, 0)),
        coalesce(p_header ->> 'payment_method', 'Cash'),
        coalesce(p_header ->> 'payment_status', 'Pending'),
        coalesce(p_header ->> 'dining_option', 'Dine-in'),
        coalesce(p_header ->> 'status', 'Pending'),
        coalesce(p_header ->> 'cashier_name', 'Staff'),
        nullif(p_header ->> 'table_number', ''),
        nullif(p_header ->> 'notes', ''),
        coalesce((p_header ->> 'created_at')::timestamptz, timezone('utc', now()))
    )
    returning id into v_order_id;

    for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
        insert into public.pos_order_items (order_id, item_name, quantity, price, instructions)
        values (
            v_order_id,
            coalesce(v_item ->> 'item_name', v_item ->> 'name', 'Item'),
            greatest(1, coalesce((v_item ->> 'quantity')::int, (v_item ->> 'qty')::int, 1)),
            greatest(0, coalesce((v_item ->> 'price')::numeric, 0)),
            coalesce(v_item ->> 'instructions', '')
        );
    end loop;

    return jsonb_build_object('success', true, 'order_id', v_order_id, 'ticket_number', v_ticket, 'deduplicated', false);
end;
$$;

grant execute on function public.create_pos_order_atomic(jsonb, jsonb) to anon, authenticated;

-- 4. Minimal safe microsite guest lookup RPC (avoids exposing raw address/email PII on open SELECT)
create or replace function public.lookup_microsite_guest(
    p_restaurant_id uuid,
    p_contact text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
    v_clean text := lower(trim(coalesce(p_contact, '')));
    v_guest record;
begin
    if p_restaurant_id is null or length(v_clean) < 4 then
        return jsonb_build_object('found', false);
    end if;

    select id, first_name, last_name, loyalty_points, visit_count, lifetime_spend
    into v_guest
    from public.guests
    where restaurant_id = p_restaurant_id
      and (lower(email) = v_clean or replace(phone, '+', '') = replace(v_clean, '+', ''))
    limit 1;

    if not found then
        return jsonb_build_object('found', false);
    end if;

    return jsonb_build_object(
        'found', true,
        'guest', jsonb_build_object(
            'id', v_guest.id,
            'first_name', v_guest.first_name,
            'last_name', v_guest.last_name,
            'loyalty_points', coalesce(v_guest.loyalty_points, 0),
            'visit_count', coalesce(v_guest.visit_count, 0),
            'lifetime_spend', coalesce(v_guest.lifetime_spend, 0)
        )
    );
end;
$$;

grant execute on function public.lookup_microsite_guest(uuid, text) to anon, authenticated;

-- 5. Self-serve SaaS onboarding + subscription activation RPC
--    Allows new paying/trialing restaurants to enter active trial status immediately
--    with the chosen plan persisted properly across restaurants & restaurant_settings.
create or replace function public.create_new_restaurant_tenant(
    p_name text,
    p_slug text,
    p_email text,
    p_password text,
    p_manager_name text default 'Store Owner',
    p_locations text default '1 Location',
    p_brands text default 'Single Brand (1)',
    p_phone text default null,
    p_business_type text default 'restaurant',
    p_plan text default 'growth',
    p_cuisine text default null,
    p_trial_days int default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_slug text := lower(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9-]', '', 'g'));
    v_plan text := lower(coalesce(nullif(trim(p_plan), ''), 'growth'));
    v_id uuid;
begin
    if length(v_slug) < 2 then
        return jsonb_build_object('success', false, 'error', 'Choose a storefront code with at least 2 characters.');
    end if;
    if p_password is null or length(p_password) < 4 then
        return jsonb_build_object('success', false, 'error', 'Password must be at least 4 characters.');
    end if;
    if exists (select 1 from public.restaurants where lower(slug) = v_slug) then
        return jsonb_build_object('success', false, 'error', 'That storefront code is already taken. Choose another.');
    end if;
    if exists (select 1 from public.staff_access where lower(email) = lower(p_email)) then
        return jsonb_build_object('success', false, 'error', 'An account with this email already exists. Please sign in.');
    end if;

    insert into public.restaurants (
        name, slug, status, is_active, business_type, plan, cuisine,
        trial_ends_at, subscription_status, billing_cycle
    )
    values (
        p_name,
        v_slug,
        'trial',
        true,
        coalesce(p_business_type, 'restaurant'),
        v_plan,
        p_cuisine,
        timezone('utc', now()) + make_interval(days => greatest(1, coalesce(p_trial_days, 14))),
        'trialing',
        'monthly'
    )
    returning id into v_id;

    insert into public.staff_access (restaurant_id, name, email, role, pin_hash, active)
    values (v_id, p_manager_name, lower(p_email), 'admin', crypt(p_password, gen_salt('bf')), true);

    update public.restaurant_settings
    set phone = p_phone,
        plan = v_plan
    where restaurant_id = v_id;
    if not found then
        insert into public.restaurant_settings (restaurant_id, phone, locations_count, brands_count, currency, timezone, plan)
        values (v_id, p_phone, p_locations, p_brands, 'KES', 'Africa/Nairobi', v_plan);
    end if;

    return jsonb_build_object(
        'success', true,
        'restaurant_id', v_id,
        'restaurant_slug', v_slug,
        'restaurant_name', p_name,
        'manager_name', p_manager_name,
        'plan', v_plan,
        'status', 'trial'
    );
end;
$$;

grant execute on function public.create_new_restaurant_tenant(text, text, text, text, text, text, text, text, text, text, text, integer) to anon, authenticated;

create or replace function public.activate_tenant_subscription(
    p_restaurant_id uuid,
    p_plan text,
    p_billing_cycle text default 'monthly',
    p_payment_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_days int := case when lower(coalesce(p_billing_cycle, 'monthly')) = 'annual' then 365 else 30 end;
    v_until timestamptz := timezone('utc', now()) + make_interval(days => v_days);
begin
    if p_restaurant_id is null then
        return jsonb_build_object('success', false, 'error', 'restaurant_id is required.');
    end if;

    update public.restaurants
    set plan = lower(coalesce(nullif(p_plan, ''), 'growth')),
        status = 'approved',
        is_active = true,
        subscription_status = 'active',
        billing_cycle = lower(coalesce(p_billing_cycle, 'monthly')),
        subscription_paid_until = v_until,
        last_billing_reference = nullif(trim(coalesce(p_payment_ref, '')), '')
    where id = p_restaurant_id;

    update public.restaurant_settings
    set plan = lower(coalesce(nullif(p_plan, ''), 'growth'))
    where restaurant_id = p_restaurant_id;

    return jsonb_build_object('success', true, 'subscription_status', 'active', 'paid_until', v_until);
end;
$$;

grant execute on function public.activate_tenant_subscription(uuid, text, text, text) to anon, authenticated;
