-- ============================================================================
-- Orders Visibility & Staff Profile Resolution Hardening
-- 1. Ensures pos_orders.delivery_address exists across all tenant deployments
--    (eliminates 400 Bad Request if selected by dashboards/microsites).
-- 2. Adds SECURITY DEFINER get_my_staff_profile() so signed-in staff can
--    resolve their restaurant_id cleanly even if JWT app_metadata lacks it.
-- ============================================================================

alter table public.pos_orders add column if not exists delivery_address text;

create or replace function public.get_my_staff_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid;
    v_email text;
    v_staff record;
begin
    v_uid := auth.uid();
    v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

    if v_uid is null and v_email = '' then
        return null;
    end if;

    select
        s.id,
        s.name,
        s.email,
        s.role,
        s.restaurant_id,
        s.active,
        r.name as restaurant_name,
        r.slug as restaurant_slug
    into v_staff
    from public.staff_access s
    left join public.restaurants r on r.id = s.restaurant_id
    where (v_uid is not null and s.auth_uid = v_uid)
       or (v_email <> '' and lower(coalesce(s.email, '')) = v_email)
    order by (s.auth_uid = v_uid) desc nulls last, s.updated_at desc nulls last
    limit 1;

    if not found then
        return null;
    end if;

    return jsonb_build_object(
        'id', v_staff.id,
        'name', v_staff.name,
        'email', v_staff.email,
        'role', v_staff.role,
        'restaurant_id', v_staff.restaurant_id,
        'active', v_staff.active,
        'restaurant_name', v_staff.restaurant_name,
        'restaurant_slug', v_staff.restaurant_slug,
        'permissions', public.effective_permissions(v_staff.id)
    );
end;
$$;

grant execute on function public.get_my_staff_profile() to authenticated;
