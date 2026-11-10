-- Wire the attempt lockout into the two sign-in paths.

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
    -- Lock out after repeated failures (10 attempts in 10 minutes).
    if public.login_attempts_recent(p_email) >= 10 then
        return jsonb_build_object(
            'success', false,
            'error', 'Too many sign-in attempts. Please wait 10 minutes and try again.'
        );
    end if;

    select * into v_staff
    from public.staff_access
    where lower(email) = lower(p_email) and active = true
    limit 1;

    if not found then
        perform public.note_login_attempt(p_email);
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
        perform public.note_login_attempt(p_email);
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
    if public.login_attempts_recent(p_name) >= 10 then
        return jsonb_build_object('success', false, 'error', 'Too many attempts. Please wait 10 minutes.');
    end if;

    select * into v_staff
    from public.staff_access
    where name = p_name and active = true
    order by created_at
    limit 1;

    if not found then
        perform public.note_login_attempt(p_name);
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
        perform public.note_login_attempt(p_name);
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
