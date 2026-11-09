-- ============================================================================
-- ManiPOS · Permission-aware staff RPCs
--
-- The staff functions used to gate everything on `role in ('admin','manager')`.
-- They now resolve the acting user's effective permissions (role defaults or a
-- per-user override) and enforce the specific permission each action needs.
--
--   verify_staff_login / verify_staff_pin
--       return the effective permission list with the session so the client
--       can gate the UI without a second round trip.
--   staff_list / staff_upsert / staff_delete
--       require `manage_staff`.
--   restaurant_profile_upsert
--       requires `manage_settings`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Login (email + password)
-- ----------------------------------------------------------------------------
create or replace function public.verify_staff_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_staff public.staff_access%rowtype;
    v_store public.restaurants%rowtype;
    v_valid boolean := false;
    v_permissions text[];
begin
    select * into v_staff
    from public.staff_access
    where lower(email) = lower(p_email) and active = true
    limit 1;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Unable to sign in. Please check your credentials or account approval status.');
    end if;

    if v_staff.pin_hash is not null and v_staff.pin_hash <> '' then
        begin
            v_valid := v_staff.pin_hash = crypt(p_password, v_staff.pin_hash);
        exception when others then
            v_valid := false;
        end;
    end if;

    if not v_valid and v_staff.pin_code is not null then
        v_valid := v_staff.pin_code = p_password;
        if v_valid then
            update public.staff_access
            set pin_hash = crypt(p_password, gen_salt('bf')), pin_code = null
            where id = v_staff.id;
        end if;
    end if;

    if not v_valid then
        return jsonb_build_object('success', false, 'error', 'Unable to sign in. Please check your credentials or account approval status.');
    end if;

    select * into v_store from public.restaurants where id = v_staff.restaurant_id;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Unable to sign in. Please check your credentials or account approval status.');
    end if;
    if coalesce(v_store.is_active, true) = false or v_store.status = 'suspended' then
        return jsonb_build_object('success', false, 'error', 'Account access has been suspended.');
    end if;
    if v_store.status = 'pending' then
        return jsonb_build_object('success', false, 'error', 'Your ManiPOS account is awaiting platform approval. We will notify you once approved.');
    end if;
    if v_store.status = 'rejected' then
        return jsonb_build_object('success', false, 'error', 'Account access has been rejected.');
    end if;

    v_permissions := public.effective_permissions(v_staff.id);

    return jsonb_build_object(
        'success', true,
        'staff_user', jsonb_build_object(
            'id', v_staff.id,
            'name', v_staff.name,
            'email', v_staff.email,
            'role', v_staff.role,
            'restaurantId', v_store.id,
            'restaurantName', v_store.name,
            'tenantSlug', v_store.slug,
            'permissions', v_permissions
        )
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- Terminal unlock (name + PIN)
-- ----------------------------------------------------------------------------
create or replace function public.verify_staff_pin(p_name text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_staff public.staff_access%rowtype;
    v_valid boolean := false;
begin
    select * into v_staff
    from public.staff_access
    where name = p_name and active = true
    order by created_at
    limit 1;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Incorrect PIN.');
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
    end if;

    if not v_valid then
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

-- ----------------------------------------------------------------------------
-- Staff management
-- ----------------------------------------------------------------------------
create or replace function public.staff_list(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_restaurant_id uuid;
begin
    select restaurant_id into v_restaurant_id
    from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_staff') then
        raise exception 'Not authorised to manage staff';
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
        where s.restaurant_id = v_restaurant_id
    ), '[]'::jsonb);
end;
$$;

-- staff_upsert gains an optional per-user permission override.
drop function if exists public.staff_upsert(uuid, uuid, uuid, text, text, text, text, boolean);

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
    v_restaurant_id uuid;
begin
    select restaurant_id into v_restaurant_id
    from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_staff') then
        raise exception 'Not authorised to manage staff';
    end if;
    if p_restaurant_id is not null and p_restaurant_id <> v_restaurant_id then
        raise exception 'Cross-tenant staff access denied';
    end if;

    if p_id is null then
        if p_name is null or p_name = '' or p_role is null or p_role = '' then
            raise exception 'Name and role are required';
        end if;
        if p_pin is null or length(p_pin) < 4 then
            raise exception 'A PIN of at least 4 characters is required';
        end if;
        insert into public.staff_access (restaurant_id, name, email, role, pin_hash, active, permissions)
        values (v_restaurant_id, p_name, p_email, p_role, crypt(p_pin, gen_salt('bf')), coalesce(p_active, true), p_permissions);
    else
        update public.staff_access
        set name = coalesce(nullif(p_name, ''), name),
            email = coalesce(nullif(p_email, ''), email),
            role = coalesce(nullif(p_role, ''), role),
            active = coalesce(p_active, active),
            permissions = coalesce(p_permissions, permissions),
            updated_at = timezone('utc', now())
        where id = p_id and restaurant_id = v_restaurant_id;

        if not found then
            raise exception 'Staff member not found';
        end if;

        if p_pin is not null and length(p_pin) >= 4 then
            update public.staff_access
            set pin_hash = crypt(p_pin, gen_salt('bf')),
                pin_code = null,
                updated_at = timezone('utc', now())
            where id = p_id and restaurant_id = v_restaurant_id;
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
    v_restaurant_id uuid;
begin
    select restaurant_id into v_restaurant_id
    from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_staff') then
        raise exception 'Not authorised to manage staff';
    end if;

    delete from public.staff_access
    where id = p_id and restaurant_id = v_restaurant_id;

    if not found then
        raise exception 'Staff member not found';
    end if;

    return jsonb_build_object('success', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- Store profile settings require the matching permission.
-- ----------------------------------------------------------------------------
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
    v_restaurant_id uuid;
begin
    select restaurant_id into v_restaurant_id
    from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_settings') then
        raise exception 'Not authorised to manage the restaurant profile';
    end if;

    if p_name is not null and p_name <> '' then
        update public.restaurants
           set name = p_name
         where id = v_restaurant_id;
    end if;

    insert into public.restaurant_settings (
        restaurant_id, address, phone, kra_pin, website, till_number,
        mpesa_paybill, mpesa_account, logo_url, socials, enabled_payment_methods
    )
    values (
        v_restaurant_id, p_address, p_phone, p_kra_pin, p_website, p_till_number,
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
