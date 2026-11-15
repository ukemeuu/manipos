-- ============================================================================
-- Terminal Quick PIN Login (Store-Scoped)
-- Allows cashiers, waiters, kitchen & managers to sign into their store's
-- POS terminal (<slug>.pos.manipos.com or pos.manipos.com + Store Code)
-- using just their 4-digit PIN (or optional staff tap + PIN).
-- Safe & additive; strictly scoped to a single restaurant.
-- ============================================================================

create or replace function public.get_terminal_staff_names(p_tenant_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
    v_store public.restaurants%rowtype;
    v_clean_slug text := lower(trim(coalesce(p_tenant_slug, '')));
begin
    if v_clean_slug = '' then
        return '[]'::jsonb;
    end if;

    select * into v_store
    from public.restaurants
    where lower(slug) = v_clean_slug
      and coalesce(is_active, true) = true
      and coalesce(status, 'approved') in ('approved', 'trial', 'active')
    limit 1;

    if not found then
        return '[]'::jsonb;
    end if;

    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'role', s.role
        ) order by s.name)
        from public.staff_access s
        where s.restaurant_id = v_store.id
          and s.active = true
          and (nullif(s.pin_hash, '') is not null or nullif(s.pin_code, '') is not null)
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_terminal_staff_names(text) to anon, authenticated;

create or replace function public.verify_staff_pin_for_store(
    p_tenant_slug text,
    p_pin text,
    p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_clean_slug text := lower(trim(coalesce(p_tenant_slug, '')));
    v_clean_pin text := trim(coalesce(p_pin, ''));
    v_store public.restaurants%rowtype;
    v_staff public.staff_access%rowtype;
    v_matched public.staff_access%rowtype;
    v_valid boolean := false;
    v_attempt_key text;
begin
    if v_clean_slug = '' or length(v_clean_pin) < 4 then
        return jsonb_build_object('success', false, 'error', 'Enter your store code and 4-digit PIN.');
    end if;

    select * into v_store
    from public.restaurants
    where lower(slug) = v_clean_slug
    limit 1;

    if not found then
        return jsonb_build_object('success', false, 'error', 'Store not found. Check your store code.');
    end if;

    if coalesce(v_store.is_active, true) = false or coalesce(v_store.status, 'approved') in ('suspended', 'pending', 'rejected') then
        return jsonb_build_object('success', false, 'error', 'Store access is not active.');
    end if;

    v_attempt_key := v_store.id::text || ':pin:' || coalesce(p_staff_id::text, 'any');
    if public.login_attempts_recent(v_attempt_key) >= 10 then
        return jsonb_build_object('success', false, 'error', 'Too many PIN attempts. Please wait 10 minutes and try again.');
    end if;

    for v_staff in
        select *
        from public.staff_access
        where restaurant_id = v_store.id
          and active = true
          and (p_staff_id is null or id = p_staff_id)
        order by created_at
    loop
        v_valid := false;

        if v_staff.pin_hash is not null and v_staff.pin_hash <> '' then
            begin
                v_valid := v_staff.pin_hash = crypt(v_clean_pin, v_staff.pin_hash);
            exception when others then
                v_valid := false;
            end;
        end if;

        if not v_valid and v_staff.pin_code is not null then
            v_valid := v_staff.pin_code = v_clean_pin;
            if v_valid then
                update public.staff_access
                   set pin_hash = crypt(v_clean_pin, gen_salt('bf')),
                       pin_code = null
                 where id = v_staff.id;
            end if;
        end if;

        if v_valid then
            v_matched := v_staff;
            exit;
        end if;
    end loop;

    if v_matched.id is null then
        perform public.note_login_attempt(v_attempt_key);
        return jsonb_build_object('success', false, 'error', 'Incorrect PIN. Check your PIN or ask your manager to verify it in Team & Staff.');
    end if;

    return jsonb_build_object(
        'success', true,
        'staff_user', jsonb_build_object(
            'id', v_matched.id,
            'name', v_matched.name,
            'email', v_matched.email,
            'role', v_matched.role,
            'restaurantId', v_store.id,
            'restaurantName', v_store.name,
            'tenantSlug', v_store.slug,
            'permissions', public.effective_permissions(v_matched.id)
        )
    );
end;
$$;

grant execute on function public.verify_staff_pin_for_store(text, text, uuid) to anon, authenticated;
