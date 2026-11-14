-- ============================================================================
-- POJ Management Full Parity (Staff Portal, Shift Scheduler, HR Signatures,
-- Delivery Fees Logistics, Compliance Docs) + Two-Way POJ Sync Linking Keys.
-- Strictly additive & multi-tenant RLS isolated. Safe to re-run.
-- ============================================================================

-- 1. Extend staff_access with POJ profile, leave allowance & compliance metadata
alter table public.staff_access add column if not exists title text;
alter table public.staff_access add column if not exists gender text;
alter table public.staff_access add column if not exists phone text;
alter table public.staff_access add column if not exists job_title text;
alter table public.staff_access add column if not exists staff_code text;
alter table public.staff_access add column if not exists avatar_url text;
alter table public.staff_access add column if not exists emergency_contact_name text;
alter table public.staff_access add column if not exists emergency_contact_phone text;
alter table public.staff_access add column if not exists annual_leave_limit integer not null default 21;
alter table public.staff_access add column if not exists sick_leave_limit integer not null default 15;
alter table public.staff_access add column if not exists bank_name text;
alter table public.staff_access add column if not exists bank_account_number text;
alter table public.staff_access add column if not exists next_of_kin_name text;
alter table public.staff_access add column if not exists next_of_kin_phone text;
alter table public.staff_access add column if not exists next_of_kin_address text;
alter table public.staff_access add column if not exists compliance_docs jsonb not null default '{}'::jsonb;
alter table public.staff_access add column if not exists today_yesterday_only boolean not null default false;
alter table public.staff_access add column if not exists can_view_revenue_breakdown boolean not null default true;
alter table public.staff_access add column if not exists source_poj_id text;
alter table public.staff_access add column if not exists source_poj_user_id text;

-- 2. Extend HR & Operations tables for full POJ parity
alter table public.leave_requests add column if not exists dates jsonb not null default '[]'::jsonb;
alter table public.leave_requests add column if not exists pdf_url text;
alter table public.leave_requests add column if not exists source_poj_id text;

alter table public.loan_requests add column if not exists repayment_plan text;
alter table public.loan_requests add column if not exists disbursed_at timestamptz;
alter table public.loan_requests add column if not exists source_poj_id text;

alter table public.salary_advances add column if not exists source_poj_id text;

alter table public.overtime_records add column if not exists start_time text;
alter table public.overtime_records add column if not exists end_time text;
alter table public.overtime_records add column if not exists notes text;
alter table public.overtime_records add column if not exists logged_at timestamptz default timezone('utc', now());
alter table public.overtime_records add column if not exists source_poj_id text;

alter table public.warnings add column if not exists severity text default '1st Written Warning';
alter table public.warnings add column if not exists acknowledged_at timestamptz;
alter table public.warnings add column if not exists signature_data text;
alter table public.warnings add column if not exists source_poj_id text;

alter table public.hr_documents add column if not exists staff_id uuid;
alter table public.hr_documents add column if not exists staff_name text;
alter table public.hr_documents add column if not exists staff_email text;
alter table public.hr_documents add column if not exists document_type text default 'Letter';
alter table public.hr_documents add column if not exists content jsonb not null default '{}'::jsonb;
alter table public.hr_documents add column if not exists status text not null default 'Pending';
alter table public.hr_documents add column if not exists issued_by text;
alter table public.hr_documents add column if not exists signature_data text;
alter table public.hr_documents add column if not exists signed_at timestamptz;
alter table public.hr_documents add column if not exists expires_at date;
alter table public.hr_documents add column if not exists source_poj_id text;

alter table public.daily_checklists add column if not exists status text not null default 'Pending';
alter table public.daily_checklists add column if not exists completed_by text;
alter table public.daily_checklists add column if not exists completed_at timestamptz;
alter table public.daily_checklists add column if not exists source_poj_id text;

alter table public.expenses add column if not exists expense_type text default 'OPEX';
alter table public.expenses add column if not exists po_id text;
alter table public.expenses add column if not exists is_vatted boolean default false;
alter table public.expenses add column if not exists vat_amount numeric(12,2) default 0;
alter table public.expenses add column if not exists delivery_fee_incurred boolean default false;
alter table public.expenses add column if not exists delivery_fee_amount numeric(12,2) default 0;
alter table public.expenses add column if not exists receipt_url text;
alter table public.expenses add column if not exists payment_status text default 'Paid';
alter table public.expenses add column if not exists qty numeric(12,3) default 1;
alter table public.expenses add column if not exists source_poj_id text;

alter table public.accountant_monthly_overheads add column if not exists source_poj_id text;
alter table public.fpa_department_budgets add column if not exists source_poj_id text;
alter table public.guests add column if not exists source_poj_id text;
alter table public.guest_tags add column if not exists source_poj_id text;
alter table public.guest_visits add column if not exists source_poj_id text;
alter table public.saved_qrcodes add column if not exists source_poj_id text;

-- Conditionally add source_poj_id to shared existing tables if present
do $$
declare
  tbl text;
begin
  foreach tbl in array array['pos_feedback','suppliers','inventory_items','purchase_orders','goods_received','stock_requisitions','temperature_logs']
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table public.%I add column if not exists source_poj_id text', tbl);
    end if;
  end loop;
end $$;

-- 3. Weekly Staff Shift Scheduler table (FOH / BOH / Off)
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid,
  staff_name text not null,
  staff_email text,
  shift_date date not null,
  shift_type text not null default 'FOH',
  department text not null default 'FOH',
  start_time text default '09:00',
  end_time text default '18:00',
  notes text,
  source_poj_id text,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.shifts add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;
alter table public.shifts add column if not exists staff_id uuid;
alter table public.shifts add column if not exists staff_name text;
alter table public.shifts add column if not exists staff_email text;
alter table public.shifts add column if not exists shift_date date;
alter table public.shifts add column if not exists shift_type text default 'FOH';
alter table public.shifts add column if not exists department text default 'FOH';
alter table public.shifts add column if not exists start_time text default '09:00';
alter table public.shifts add column if not exists end_time text default '18:00';
alter table public.shifts add column if not exists notes text;
alter table public.shifts add column if not exists source_poj_id text;

-- 4. Delivery Fees Logistics ledger (Inbound Supplies + Outbound Glovo/Riders)
create table if not exists public.delivery_fees (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  fee_date date not null default current_date,
  logistics_type text not null default 'Inbound Supplies',
  provider text,
  cost_amount numeric(12,2) not null default 0,
  customer_charged numeric(12,2) not null default 0,
  order_ref text,
  po_ref text,
  supplier_name text,
  payment_status text default 'Paid',
  notes text,
  source_poj_id text,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.delivery_fees add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;
alter table public.delivery_fees add column if not exists fee_date date default current_date;
alter table public.delivery_fees add column if not exists logistics_type text default 'Inbound Supplies';
alter table public.delivery_fees add column if not exists provider text;
alter table public.delivery_fees add column if not exists cost_amount numeric(12,2) default 0;
alter table public.delivery_fees add column if not exists customer_charged numeric(12,2) default 0;
alter table public.delivery_fees add column if not exists order_ref text;
alter table public.delivery_fees add column if not exists po_ref text;
alter table public.delivery_fees add column if not exists supplier_name text;
alter table public.delivery_fees add column if not exists payment_status text default 'Paid';
alter table public.delivery_fees add column if not exists notes text;
alter table public.delivery_fees add column if not exists source_poj_id text;

-- 5. Restaurant POJ Link Registry (tracks two-way connection & sync state)
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

-- 6. Idempotent unique indexes on source_poj_id per tenant so repeated syncs never duplicate rows
do $$
declare
  idx_tbl text;
begin
  foreach idx_tbl in array array[
    'staff_access',
    'leave_requests',
    'loan_requests',
    'salary_advances',
    'overtime_records',
    'warnings',
    'hr_documents',
    'daily_checklists',
    'shifts',
    'expenses',
    'accountant_monthly_overheads',
    'fpa_department_budgets',
    'delivery_fees',
    'guests',
    'guest_tags',
    'guest_visits',
    'saved_qrcodes',
    'pos_feedback',
    'suppliers',
    'inventory_items',
    'purchase_orders',
    'goods_received'
  ]
  loop
    if to_regclass('public.' || idx_tbl) is not null then
      execute format('alter table public.%I add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade', idx_tbl);
      execute format('alter table public.%I add column if not exists source_poj_id text', idx_tbl);
      execute format(
        'create unique index if not exists idx_%1$s_poj_sync on public.%1$s (restaurant_id, source_poj_id) where source_poj_id is not null',
        idx_tbl
      );
    end if;
  end loop;
end $$;

-- 7. Strict Multi-Tenant RLS on new tables
do $$
declare
  t text;
  policy_name text;
begin
  foreach t in array array['shifts', 'delivery_fees', 'restaurant_poj_links']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for policy_name in
        select polname from pg_policy where polrelid = ('public.' || t)::regclass
      loop
        execute format('drop policy if exists %I on public.%I', policy_name, t);
      end loop;
      execute format('
        create policy "tenant isolate %1$s"
        on public.%1$s
        for all to anon, authenticated
        using (restaurant_id = public.current_tenant_id())
        with check (restaurant_id = public.current_tenant_id())
      ', t);
    end if;
  end loop;
end $$;

-- 8. Expand staff_upsert & staff_list + add POJ profile sync & self-service RPCs
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
    select * into v_actor from public.staff_access where id = p_actor_id;

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
    select * into v_actor from public.staff_access where id = p_actor_id;

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
    select * into v_actor from public.staff_access where id = p_actor_id;

    if not found or not public.has_permission(p_actor_id, 'manage_staff') then
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

    select id into v_existing_id
    from public.staff_access
    where restaurant_id = v_actor.restaurant_id
      and (
          (v_source_poj_id is not null and source_poj_id = v_source_poj_id)
          or (v_email is not null and lower(email) = v_email)
          or (v_email is null and v_name is not null and lower(name) = lower(v_name))
      )
    limit 1;

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

create or replace function public.staff_self_profile_get(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_staff public.staff_access%rowtype;
begin
    select * into v_staff from public.staff_access where id = p_actor_id;
    if not found then
        return '{}'::jsonb;
    end if;
    return jsonb_build_object(
        'id', v_staff.id,
        'name', v_staff.name,
        'email', v_staff.email,
        'role', v_staff.role,
        'title', v_staff.title,
        'gender', v_staff.gender,
        'phone', v_staff.phone,
        'job_title', v_staff.job_title,
        'staff_code', v_staff.staff_code,
        'avatar_url', v_staff.avatar_url,
        'emergency_contact_name', v_staff.emergency_contact_name,
        'emergency_contact_phone', v_staff.emergency_contact_phone,
        'annual_leave_limit', coalesce(v_staff.annual_leave_limit, 21),
        'sick_leave_limit', coalesce(v_staff.sick_leave_limit, 15),
        'bank_name', v_staff.bank_name,
        'bank_account_number', v_staff.bank_account_number,
        'next_of_kin_name', v_staff.next_of_kin_name,
        'next_of_kin_phone', v_staff.next_of_kin_phone,
        'next_of_kin_address', v_staff.next_of_kin_address,
        'compliance_docs', coalesce(v_staff.compliance_docs, '{}'::jsonb)
    );
end;
$$;

create or replace function public.staff_self_profile_update(p_actor_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_staff public.staff_access%rowtype;
begin
    select * into v_staff from public.staff_access where id = p_actor_id;
    if not found then
        raise exception 'Staff record not found';
    end if;
    if auth.uid() is not null and v_staff.auth_uid is not null and v_staff.auth_uid <> auth.uid() then
        raise exception 'Not authorised to update another profile';
    end if;

    update public.staff_access
    set name = coalesce(nullif(trim(coalesce(p_payload ->> 'name', '')), ''), name),
        title = coalesce(p_payload ->> 'title', title),
        gender = coalesce(p_payload ->> 'gender', gender),
        phone = coalesce(p_payload ->> 'phone', phone),
        job_title = coalesce(p_payload ->> 'job_title', job_title),
        avatar_url = coalesce(p_payload ->> 'avatar_url', avatar_url),
        emergency_contact_name = coalesce(p_payload ->> 'emergency_contact_name', emergency_contact_name),
        emergency_contact_phone = coalesce(p_payload ->> 'emergency_contact_phone', emergency_contact_phone),
        bank_name = coalesce(p_payload ->> 'bank_name', bank_name),
        bank_account_number = coalesce(p_payload ->> 'bank_account_number', bank_account_number),
        next_of_kin_name = coalesce(p_payload ->> 'next_of_kin_name', next_of_kin_name),
        next_of_kin_phone = coalesce(p_payload ->> 'next_of_kin_phone', next_of_kin_phone),
        next_of_kin_address = coalesce(p_payload ->> 'next_of_kin_address', next_of_kin_address),
        updated_at = timezone('utc', now())
    where id = v_staff.id;

    return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.poj_upsert_staff_profile(uuid, jsonb) to anon, authenticated;
grant execute on function public.staff_self_profile_get(uuid) to anon, authenticated;
grant execute on function public.staff_self_profile_update(uuid, jsonb) to anon, authenticated;

