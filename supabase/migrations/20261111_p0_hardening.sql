-- ============================================================================
-- ManiPOS · P0 Security, Multi-Tenant & Offline Sync Hardening Migration
-- Safe & additive for live tenants (Pot of Jollof, Chop Now Now, etc.):
-- preserves existing RPC contracts and anon/legacy fallback paths while fixing
-- the critical P0 flaws ahead of full Supabase Auth JWT migration.
-- ============================================================================

-- 1. Order idempotency key (prevents offline sync / double-tap duplicate orders)
alter table public.pos_orders add column if not exists idempotency_key text;
create unique index if not exists pos_orders_idempotency_key_uidx
    on public.pos_orders (idempotency_key)
    where idempotency_key is not null;

-- 2. Remove default 'void_orders' privilege from cashier role in DB matrix
--    (store admins can still grant per-user overrides via staff_access.permissions)
delete from public.role_permissions
where role = 'cashier' and permission_key = 'void_orders';

-- 3. Replace global unique constraints on pos_discounts & pos_customer_addresses
--    with per-tenant unique indexes so one tenant cannot block another.
alter table public.pos_discounts drop constraint if exists pos_discounts_code_key;
alter table public.pos_customer_addresses drop constraint if exists pos_customer_addresses_customer_name_key;

do $$
begin
    create unique index if not exists pos_discounts_tenant_code_uidx
        on public.pos_discounts (restaurant_id, lower(code))
        where restaurant_id is not null;
exception when unique_violation then
    create index if not exists pos_discounts_tenant_code_idx
        on public.pos_discounts (restaurant_id, lower(code))
        where restaurant_id is not null;
    raise notice 'Skipped unique constraint on pos_discounts(restaurant_id, lower(code)) due to existing duplicates';
end $$;

do $$
begin
    create unique index if not exists pos_customer_addresses_tenant_name_uidx
        on public.pos_customer_addresses (restaurant_id, customer_name)
        where restaurant_id is not null;
exception when unique_violation then
    create index if not exists pos_customer_addresses_tenant_name_idx
        on public.pos_customer_addresses (restaurant_id, customer_name)
        where restaurant_id is not null;
    raise notice 'Skipped unique constraint on pos_customer_addresses(restaurant_id, customer_name) due to existing duplicates';
end $$;

-- 4. Lock down note_login_attempt so unauthenticated clients cannot DoS lock out
--    arbitrary accounts; SECURITY DEFINER login RPCs call it internally.
revoke execute on function public.note_login_attempt(text) from anon, authenticated;

-- 5. Tenant-scoped PIN unlock + active store status check + plaintext migration
alter table public.staff_access add column if not exists auth_uid uuid;

drop function if exists public.verify_staff_pin(text, text);

create or replace function public.verify_staff_pin(
    p_name text,
    p_pin text,
    p_restaurant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_staff public.staff_access%rowtype;
    v_store public.restaurants%rowtype;
    v_valid boolean := false;
    v_attempt_key text;
begin
    v_attempt_key := coalesce(p_restaurant_id::text, 'global') || ':' || lower(coalesce(p_name, ''));

    if public.login_attempts_recent(v_attempt_key) >= 10 then
        return jsonb_build_object('success', false, 'error', 'Too many attempts. Please wait 10 minutes.');
    end if;

    select * into v_staff
    from public.staff_access
    where lower(name) = lower(p_name)
      and active = true
      and (p_restaurant_id is null or restaurant_id = p_restaurant_id)
    order by created_at
    limit 1;

    if not found then
        perform public.note_login_attempt(v_attempt_key);
        return jsonb_build_object('success', false, 'error', 'Incorrect PIN.');
    end if;

    select * into v_store from public.restaurants where id = v_staff.restaurant_id;
    if not found or coalesce(v_store.is_active, true) = false or coalesce(v_store.status, 'approved') in ('suspended', 'pending', 'rejected') then
        return jsonb_build_object('success', false, 'error', 'Store access is not active.');
    end if;

    if v_staff.pin_hash is not null and v_staff.pin_hash <> '' then
        begin
            v_valid := v_staff.pin_hash = crypt(p_pin, v_staff.pin_hash);
        exception when others then
            v_valid := false;
        end;
    end if;
    if not v_valid and v_staff.pin_code is not null then
        v_valid := v_staff.pin_code = p_pin;
        if v_valid then
            update public.staff_access
               set pin_hash = crypt(p_pin, gen_salt('bf')),
                   pin_code = null
             where id = v_staff.id;
        end if;
    end if;

    if not v_valid then
        perform public.note_login_attempt(v_attempt_key);
        return jsonb_build_object('success', false, 'error', 'Incorrect PIN.');
    end if;

    return jsonb_build_object(
        'success', true,
        'staff_user', jsonb_build_object(
            'id', v_staff.id,
            'name', v_staff.name,
            'role', v_staff.role,
            'restaurantId', v_staff.restaurant_id,
            'permissions', public.effective_permissions(v_staff.id)
        )
    );
end;
$$;

grant execute on function public.verify_staff_pin(text, text, uuid) to anon, authenticated;

-- 6. Bind authenticated actor identity and validate roles in privileged RPCs
create or replace function public.staff_list(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_actor public.staff_access%rowtype;
    v_jwt_tenant text;
begin
    select * into v_actor
    from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_staff') then
        raise exception 'Not authorised to manage staff';
    end if;

    if auth.uid() is not null then
        if v_actor.auth_uid is not null and v_actor.auth_uid <> auth.uid() then
            raise exception 'Actor mismatch with authenticated session';
        end if;
        v_jwt_tenant := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        if v_jwt_tenant is not null and v_jwt_tenant::uuid <> v_actor.restaurant_id then
            raise exception 'Cross-tenant staff access denied';
        end if;
    end if;

    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'email', s.email,
            'role', s.role,
            'active', s.active,
            'pin_set', (s.pin_hash is not null or s.pin_code is not null),
            'permissions', public.effective_permissions(s.id),
            'created_at', s.created_at,
            'updated_at', s.updated_at
        ) order by s.name)
        from public.staff_access s
        where s.restaurant_id = v_actor.restaurant_id
    ), '[]'::jsonb);
end;
$$;

create or replace function public.staff_upsert(
    p_actor_id uuid,
    p_id uuid,
    p_restaurant_id uuid,
    p_name text,
    p_email text,
    p_role text,
    p_pin text default null,
    p_active boolean default null,
    p_permissions jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_actor public.staff_access%rowtype;
    v_jwt_tenant text;
    v_clean_role text;
begin
    select * into v_actor
    from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_staff') then
        raise exception 'Not authorised to manage staff';
    end if;

    if auth.uid() is not null then
        if v_actor.auth_uid is not null and v_actor.auth_uid <> auth.uid() then
            raise exception 'Actor mismatch with authenticated session';
        end if;
        v_jwt_tenant := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        if v_jwt_tenant is not null and v_jwt_tenant::uuid <> v_actor.restaurant_id then
            raise exception 'Cross-tenant staff access denied';
        end if;
    end if;

    if p_restaurant_id is not null and p_restaurant_id <> v_actor.restaurant_id then
        raise exception 'Cross-tenant staff access denied';
    end if;

    v_clean_role := nullif(lower(trim(coalesce(p_role, ''))), '');
    if v_clean_role is not null and v_clean_role not in ('admin', 'manager', 'cashier', 'waiter') then
        raise exception 'Invalid staff role: %', p_role;
    end if;

    if p_id is null then
        if p_name is null or trim(p_name) = '' or v_clean_role is null then
            raise exception 'Name and role are required';
        end if;
        if p_pin is null or length(p_pin) < 4 then
            raise exception 'A PIN of at least 4 characters is required';
        end if;
        insert into public.staff_access (restaurant_id, name, email, role, pin_hash, active, permissions)
        values (v_actor.restaurant_id, trim(p_name), nullif(trim(coalesce(p_email, '')), ''), v_clean_role, crypt(p_pin, gen_salt('bf')), coalesce(p_active, true), p_permissions);
    else
        update public.staff_access
        set name = coalesce(nullif(trim(p_name), ''), name),
            email = coalesce(nullif(trim(p_email), ''), email),
            role = coalesce(v_clean_role, role),
            active = coalesce(p_active, active),
            permissions = coalesce(p_permissions, permissions),
            updated_at = timezone('utc', now())
        where id = p_id and restaurant_id = v_actor.restaurant_id;

        if not found then
            raise exception 'Staff member not found';
        end if;

        if p_pin is not null and length(p_pin) >= 4 then
            update public.staff_access
            set pin_hash = crypt(p_pin, gen_salt('bf')),
                pin_code = null,
                updated_at = timezone('utc', now())
            where id = p_id and restaurant_id = v_actor.restaurant_id;
        end if;
    end if;

    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.staff_delete(p_actor_id uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_actor public.staff_access%rowtype;
    v_jwt_tenant text;
begin
    select * into v_actor
    from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_staff') then
        raise exception 'Not authorised to manage staff';
    end if;

    if auth.uid() is not null then
        if v_actor.auth_uid is not null and v_actor.auth_uid <> auth.uid() then
            raise exception 'Actor mismatch with authenticated session';
        end if;
        v_jwt_tenant := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        if v_jwt_tenant is not null and v_jwt_tenant::uuid <> v_actor.restaurant_id then
            raise exception 'Cross-tenant staff access denied';
        end if;
    end if;

    delete from public.staff_access
    where id = p_id and restaurant_id = v_actor.restaurant_id;

    if not found then
        raise exception 'Staff member not found';
    end if;

    return jsonb_build_object('success', true);
end;
$$;

create or replace function public.restaurant_profile_upsert(
    p_actor_id uuid,
    p_name text,
    p_address text,
    p_phone text,
    p_kra_pin text,
    p_website text,
    p_till_number text,
    p_paybill text,
    p_account text,
    p_logo_url text,
    p_socials jsonb default null,
    p_enabled_payment_methods jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_actor public.staff_access%rowtype;
    v_jwt_tenant text;
begin
    select * into v_actor
    from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_settings') then
        raise exception 'Not authorised to manage the restaurant profile';
    end if;

    if auth.uid() is not null then
        if v_actor.auth_uid is not null and v_actor.auth_uid <> auth.uid() then
            raise exception 'Actor mismatch with authenticated session';
        end if;
        v_jwt_tenant := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        if v_jwt_tenant is not null and v_jwt_tenant::uuid <> v_actor.restaurant_id then
            raise exception 'Cross-tenant settings access denied';
        end if;
    end if;

    if p_name is not null and p_name <> '' then
        update public.restaurants
           set name = p_name
         where id = v_actor.restaurant_id;
    end if;

    insert into public.restaurant_settings (
        restaurant_id, address, phone, kra_pin, website, till_number,
        mpesa_paybill, mpesa_account, logo_url, socials, enabled_payment_methods
    )
    values (
        v_actor.restaurant_id, p_address, p_phone, p_kra_pin, p_website, p_till_number,
        p_paybill, p_account, p_logo_url, coalesce(p_socials, '{}'::jsonb),
        coalesce(p_enabled_payment_methods, '["CASH","MPESA","CARD"]'::jsonb)
    )
    on conflict (restaurant_id) do update
        set address = excluded.address,
            phone = excluded.phone,
            kra_pin = excluded.kra_pin,
            website = excluded.website,
            till_number = excluded.till_number,
            mpesa_paybill = excluded.mpesa_paybill,
            mpesa_account = excluded.mpesa_account,
            logo_url = excluded.logo_url,
            socials = coalesce(excluded.socials, restaurant_settings.socials),
            enabled_payment_methods = coalesce(excluded.enabled_payment_methods, restaurant_settings.enabled_payment_methods),
            updated_at = timezone('utc', now());

    return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.staff_list(uuid) to anon, authenticated;
grant execute on function public.staff_upsert(uuid, uuid, uuid, text, text, text, text, boolean, jsonb) to anon, authenticated;
grant execute on function public.staff_delete(uuid, uuid) to anon, authenticated;
grant execute on function public.restaurant_profile_upsert(uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb) to anon, authenticated;

-- 7. Scope menu_images storage writes to authenticated tenant folder when JWT carries tenant_id
drop policy if exists "Staff manage menu images" on storage.objects;
create policy "Staff manage menu images"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'menu_images'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '') = ''
      or name like (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
      or name like 'receipts/' || (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
    )
  )
  with check (
    bucket_id = 'menu_images'
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '') = ''
      or name like (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
      or name like 'receipts/' || (auth.jwt() -> 'app_metadata' ->> 'tenant_id') || '/%'
    )
  );
