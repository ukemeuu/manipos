-- ============================================================================
-- Fix POJ Staff PIN Sync, Duplicate-Name Collisions, & POJ Actor Resolution
-- Safe, additive, idempotent migration.
-- ============================================================================

alter table public.staff_access add column if not exists today_yesterday_only boolean not null default false;
alter table public.staff_access add column if not exists can_view_revenue_breakdown boolean not null default true;
alter table public.staff_access add column if not exists source_poj_id text;
alter table public.staff_access add column if not exists source_poj_user_id text;

create table if not exists public.restaurant_poj_links (
    restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
    poj_supabase_url text not null default 'https://bfrvzwmckuiafkgwemdt.supabase.co',
    last_synced_at timestamptz,
    last_synced_by text,
    auto_sync_enabled boolean not null default false,
    link_auth_enabled boolean not null default true,
    sync_summary jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default timezone('utc', now())
);

-- 1. Resolve actor by ManiPOS staff_access.id OR linked POJ auth user UUID
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
    from public.staff_access
    where id = p_actor_id or source_poj_user_id = p_actor_id::text
    limit 1;

    if not found or not public.has_permission(v_actor.id, 'manage_staff') then
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
            'title', s.title,
            'gender', s.gender,
            'phone', s.phone,
            'job_title', s.job_title,
            'staff_code', s.staff_code,
            'avatar_url', s.avatar_url,
            'emergency_contact_name', s.emergency_contact_name,
            'emergency_contact_phone', s.emergency_contact_phone,
            'annual_leave_limit', coalesce(s.annual_leave_limit, 21),
            'sick_leave_limit', coalesce(s.sick_leave_limit, 15),
            'bank_name', s.bank_name,
            'bank_account_number', s.bank_account_number,
            'next_of_kin_name', s.next_of_kin_name,
            'next_of_kin_phone', s.next_of_kin_phone,
            'next_of_kin_address', s.next_of_kin_address,
            'compliance_docs', coalesce(s.compliance_docs, '{}'::jsonb),
            'today_yesterday_only', coalesce(s.today_yesterday_only, false),
            'can_view_revenue_breakdown', coalesce(s.can_view_revenue_breakdown, true),
            'source_poj_id', s.source_poj_id,
            'source_poj_user_id', s.source_poj_user_id,
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
    from public.staff_access
    where id = p_actor_id or source_poj_user_id = p_actor_id::text
    limit 1;

    if not found or not public.has_permission(v_actor.id, 'manage_staff') then
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
    if v_clean_role is not null and v_clean_role not in (
        'admin', 'manager', 'cashier', 'waiter', 'kds', 'chef', 'receiver',
        'stock_controller', 'store_clerk', 'issuer', 'accountant', 'expense_clerk', 'staff'
    ) then
        raise exception 'Invalid staff role: %', p_role;
    end if;

    if p_id is null then
        if p_name is null or trim(p_name) = '' or v_clean_role is null then
            raise exception 'Name and role are required';
        end if;
        if p_pin is null or length(trim(p_pin)) < 4 then
            raise exception 'A PIN of at least 4 characters is required';
        end if;
        insert into public.staff_access (restaurant_id, name, email, role, pin_hash, active, permissions)
        values (
            v_actor.restaurant_id,
            trim(p_name),
            nullif(lower(trim(coalesce(p_email, ''))), ''),
            v_clean_role,
            crypt(trim(p_pin), gen_salt('bf')),
            coalesce(p_active, true),
            p_permissions
        );
    else
        update public.staff_access
        set name = coalesce(nullif(trim(p_name), ''), name),
            email = coalesce(nullif(lower(trim(p_email)), ''), email),
            role = coalesce(v_clean_role, role),
            active = coalesce(p_active, active),
            permissions = coalesce(p_permissions, permissions),
            updated_at = timezone('utc', now())
        where id = p_id and restaurant_id = v_actor.restaurant_id;

        if not found then
            raise exception 'Staff member not found';
        end if;

        if p_pin is not null and length(trim(p_pin)) >= 4 then
            update public.staff_access
            set pin_hash = crypt(trim(p_pin), gen_salt('bf')),
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
    from public.staff_access
    where id = p_actor_id or source_poj_user_id = p_actor_id::text
    limit 1;

    if not found or not public.has_permission(v_actor.id, 'manage_staff') then
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

-- 2. Fix poj_upsert_staff_profile so terminal passes sharing a display name
--    (e.g. David cashier vs David expense_clerk) do not overwrite each other.
create or replace function public.poj_upsert_staff_profile(
    p_actor_id uuid,
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_actor public.staff_access%rowtype;
    v_jwt_tenant text;
    v_existing_id uuid;
    v_email text;
    v_name text;
    v_role text;
    v_pin text;
    v_source_poj_id text;
begin
    select * into v_actor
    from public.staff_access
    where id = p_actor_id or source_poj_user_id = p_actor_id::text
    limit 1;

    if not found or not public.has_permission(v_actor.id, 'manage_staff') then
        raise exception 'Not authorised to sync staff profiles';
    end if;

    if auth.uid() is not null then
        if v_actor.auth_uid is not null and v_actor.auth_uid <> auth.uid() then
            raise exception 'Actor mismatch with authenticated session';
        end if;
        v_jwt_tenant := auth.jwt() -> 'app_metadata' ->> 'tenant_id';
        if v_jwt_tenant is not null and v_jwt_tenant::uuid <> v_actor.restaurant_id then
            raise exception 'Cross-tenant staff sync denied';
        end if;
    end if;

    v_email := nullif(lower(trim(coalesce(p_payload ->> 'email', ''))), '');
    v_name := nullif(trim(coalesce(p_payload ->> 'name', '')), '');
    v_role := coalesce(nullif(lower(trim(coalesce(p_payload ->> 'role', ''))), ''), 'staff');
    v_pin := nullif(trim(coalesce(p_payload ->> 'pin', '')), '');
    v_source_poj_id := nullif(trim(coalesce(p_payload ->> 'source_poj_id', '')), '');

    if v_role not in (
        'admin', 'manager', 'cashier', 'waiter', 'kds', 'chef', 'receiver',
        'stock_controller', 'store_clerk', 'issuer', 'accountant', 'expense_clerk', 'staff'
    ) then
        v_role := 'staff';
    end if;

    -- 1st preference: exact source_poj_id match
    if v_source_poj_id is not null then
        select id into v_existing_id
        from public.staff_access
        where restaurant_id = v_actor.restaurant_id
          and source_poj_id = v_source_poj_id
        limit 1;
    end if;

    -- 2nd preference: email match (for auth profiles)
    if v_existing_id is null and v_email is not null then
        select id into v_existing_id
        from public.staff_access
        where restaurant_id = v_actor.restaurant_id
          and lower(email) = v_email
        limit 1;
    end if;

    -- 3rd preference: unlinked row matching name + role (avoids colliding two same-named terminal roles)
    if v_existing_id is null and v_email is null and v_name is not null then
        select id into v_existing_id
        from public.staff_access
        where restaurant_id = v_actor.restaurant_id
          and source_poj_id is null
          and lower(name) = lower(v_name)
          and role = v_role
        limit 1;
    end if;

    if v_existing_id is null then
        if v_name is null then
            v_name := coalesce(split_part(v_email, '@', 1), 'Staff');
        end if;
        insert into public.staff_access (
            restaurant_id, name, email, role,
            pin_hash, active,
            title, gender, phone, job_title, staff_code, avatar_url,
            emergency_contact_name, emergency_contact_phone,
            annual_leave_limit, sick_leave_limit,
            bank_name, bank_account_number,
            next_of_kin_name, next_of_kin_phone, next_of_kin_address,
            compliance_docs, today_yesterday_only, can_view_revenue_breakdown,
            source_poj_id, source_poj_user_id
        ) values (
            v_actor.restaurant_id,
            v_name,
            v_email,
            v_role,
            case when v_pin is not null and length(v_pin) >= 4 then crypt(v_pin, gen_salt('bf')) else null end,
            coalesce((p_payload ->> 'active')::boolean, true),
            p_payload ->> 'title',
            p_payload ->> 'gender',
            p_payload ->> 'phone',
            p_payload ->> 'job_title',
            p_payload ->> 'staff_code',
            p_payload ->> 'avatar_url',
            p_payload ->> 'emergency_contact_name',
            p_payload ->> 'emergency_contact_phone',
            coalesce((p_payload ->> 'annual_leave_limit')::integer, 21),
            coalesce((p_payload ->> 'sick_leave_limit')::integer, 15),
            p_payload ->> 'bank_name',
            p_payload ->> 'bank_account_number',
            p_payload ->> 'next_of_kin_name',
            p_payload ->> 'next_of_kin_phone',
            p_payload ->> 'next_of_kin_address',
            coalesce(p_payload -> 'compliance_docs', '{}'::jsonb),
            coalesce((p_payload ->> 'today_yesterday_only')::boolean, false),
            coalesce((p_payload ->> 'can_view_revenue_breakdown')::boolean, true),
            v_source_poj_id,
            p_payload ->> 'source_poj_user_id'
        )
        returning id into v_existing_id;
    else
        update public.staff_access
        set name = coalesce(v_name, name),
            email = coalesce(v_email, email),
            role = coalesce(v_role, role),
            active = coalesce((p_payload ->> 'active')::boolean, active),
            pin_hash = case when v_pin is not null and length(v_pin) >= 4 then crypt(v_pin, gen_salt('bf')) else pin_hash end,
            pin_code = case when v_pin is not null and length(v_pin) >= 4 then null else pin_code end,
            title = coalesce(p_payload ->> 'title', title),
            gender = coalesce(p_payload ->> 'gender', gender),
            phone = coalesce(p_payload ->> 'phone', phone),
            job_title = coalesce(p_payload ->> 'job_title', job_title),
            staff_code = coalesce(p_payload ->> 'staff_code', staff_code),
            avatar_url = coalesce(p_payload ->> 'avatar_url', avatar_url),
            emergency_contact_name = coalesce(p_payload ->> 'emergency_contact_name', emergency_contact_name),
            emergency_contact_phone = coalesce(p_payload ->> 'emergency_contact_phone', emergency_contact_phone),
            annual_leave_limit = coalesce((p_payload ->> 'annual_leave_limit')::integer, annual_leave_limit),
            sick_leave_limit = coalesce((p_payload ->> 'sick_leave_limit')::integer, sick_leave_limit),
            bank_name = coalesce(p_payload ->> 'bank_name', bank_name),
            bank_account_number = coalesce(p_payload ->> 'bank_account_number', bank_account_number),
            next_of_kin_name = coalesce(p_payload ->> 'next_of_kin_name', next_of_kin_name),
            next_of_kin_phone = coalesce(p_payload ->> 'next_of_kin_phone', next_of_kin_phone),
            next_of_kin_address = coalesce(p_payload ->> 'next_of_kin_address', next_of_kin_address),
            compliance_docs = case
                when p_payload ? 'compliance_docs' then coalesce(compliance_docs, '{}'::jsonb) || (p_payload -> 'compliance_docs')
                else compliance_docs
            end,
            today_yesterday_only = coalesce((p_payload ->> 'today_yesterday_only')::boolean, today_yesterday_only),
            can_view_revenue_breakdown = coalesce((p_payload ->> 'can_view_revenue_breakdown')::boolean, can_view_revenue_breakdown),
            source_poj_id = coalesce(v_source_poj_id, source_poj_id),
            source_poj_user_id = coalesce(p_payload ->> 'source_poj_user_id', source_poj_user_id),
            updated_at = timezone('utc', now())
        where id = v_existing_id and restaurant_id = v_actor.restaurant_id;
    end if;

    return jsonb_build_object('success', true, 'id', v_existing_id);
end;
$$;

-- 3. Seed Pot of Jollof terminal staff PIN accounts (including Ronaldo 1122) idempotently
do $$
declare
    v_poj_rest_id uuid;
    v_item record;
begin
    select id into v_poj_rest_id
    from public.restaurants
    where lower(slug) = 'potofjollof'
    limit 1;

    if v_poj_rest_id is not null then
        insert into public.restaurant_poj_links (restaurant_id, poj_supabase_url, link_auth_enabled)
        values (v_poj_rest_id, 'https://bfrvzwmckuiafkgwemdt.supabase.co', true)
        on conflict (restaurant_id) do update
            set link_auth_enabled = true,
                updated_at = timezone('utc', now());

        for v_item in
            select * from (values
                ('terminal:e2a72415-cc32-4bdd-8c69-762c77c0a85d', 'Ronaldo', 'waiter', '1122', true, false),
                ('terminal:198b56ef-0e8d-4133-bf4a-f766293ecafd', 'Samuel', 'waiter', '2211', true, false),
                ('terminal:f14f891f-9c26-43ae-bf87-45758248256a', 'Samuel', 'expense_clerk', '1010', true, false),
                ('terminal:1ad94ef3-dc6e-41ea-a8f2-7957a727ccfd', 'Enock', 'cashier', '4040', true, false),
                ('terminal:ccfd1b52-c3b3-40fd-ad8a-7d21e6ecadbc', 'David', 'cashier', '1313', true, false),
                ('terminal:fc6d8e31-3961-4d04-95f9-53bbc918094b', 'David', 'expense_clerk', '2020', true, false),
                ('terminal:da4b7b57-3106-4094-9ad7-0ed6cffc3acc', 'Silivia', 'receiver', '5050', true, false),
                ('terminal:db317dca-36ba-4d60-8ecd-e613aee8b456', 'StockAdmin', 'stock_controller', '6060', true, false),
                ('terminal:7b5603c5-2024-4f54-a914-9b5129d59334', 'StoreClerk', 'store_clerk', '7070', true, false),
                ('terminal:35a75456-eae7-4541-9714-eed828dad83c', 'Chef Terminal', 'chef', '9090', true, false),
                ('terminal:68441ea1-4ec2-4839-a2cd-5ceef0fb1ed6', 'Kitchen KDS', 'chef', '1414', true, false),
                ('terminal:6b175c03-8ed0-4b86-8cf1-b1eef8ff724b', 'Front Desk', 'kds', '2626', true, false),
                ('terminal:64bd65ca-c006-4177-95a6-7af9c6e31edc', 'Accountant Terminal', 'accountant', '8080', true, false),
                ('terminal:246051c0-60c0-4961-ac3d-35fdc90ebb84', 'Accountant Terminal', 'accountant', '8081', true, false)
            ) as t(src_id, staff_name, staff_role, staff_pin, today_only, rev_breakdown)
        loop
            if not exists (
                select 1 from public.staff_access
                where restaurant_id = v_poj_rest_id
                  and source_poj_id = v_item.src_id
            ) then
                insert into public.staff_access (
                    restaurant_id, name, role, pin_hash, active,
                    today_yesterday_only, can_view_revenue_breakdown, source_poj_id
                ) values (
                    v_poj_rest_id,
                    v_item.staff_name,
                    v_item.staff_role,
                    crypt(v_item.staff_pin, gen_salt('bf')),
                    true,
                    v_item.today_only,
                    v_item.rev_breakdown,
                    v_item.src_id
                );
            end if;
        end loop;
    end if;
end $$;

-- 4. Keep Management Dashboard launcher exclusive to admin accounts
delete from public.role_permissions
where role in ('cashier', 'waiter')
  and permission_key = 'view_dashboard';

