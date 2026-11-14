-- ============================================================================
-- Collapse pojmanagement.com CRM, Staff HR Self-Service, Accountant/FP&A &
-- Store/Kitchen Operations into ManiPOS (multi-tenant isolated + RLS).
-- Safe to apply multiple times (additive IF NOT EXISTS).
-- ============================================================================

create table if not exists public.guest_tags (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  guest_id uuid not null,
  tag_name text not null,
  color text default '#18A07A',
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.guest_tags add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;

create table if not exists public.guest_visits (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  guest_id uuid not null,
  visit_date text not null,
  spend numeric(12,2) not null default 0,
  table_number text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);
alter table public.guest_visits add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid,
  staff_name text not null,
  staff_email text,
  leave_type text not null default 'Annual Leave',
  start_date date not null,
  end_date date not null,
  days_count numeric(5,1) not null default 1,
  reason text,
  status text not null default 'Pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.overtime_records (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid,
  staff_name text not null,
  staff_email text,
  work_date date not null,
  hours numeric(6,2) not null default 0,
  reason text,
  status text not null default 'Pending',
  reviewed_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid,
  staff_name text not null,
  staff_email text,
  amount numeric(12,2) not null default 0,
  repayment_month text,
  reason text,
  status text not null default 'Pending',
  reviewed_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.loan_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid,
  staff_name text not null,
  staff_email text,
  amount numeric(12,2) not null default 0,
  installments_months integer not null default 3,
  reason text,
  status text not null default 'Pending',
  reviewed_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.warnings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid,
  staff_name text not null,
  issued_by text,
  reason text not null,
  details text,
  status text not null default 'Issued',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hr_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  category text not null default 'Policy',
  file_url text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_checklists (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid,
  staff_name text not null,
  checklist_date date not null default current_date,
  shift_type text not null default 'Opening',
  items jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  category text not null default 'Operating Expense',
  department text default 'Operations',
  description text not null,
  amount numeric(12,2) not null default 0,
  payment_method text default 'Cash',
  vendor_name text,
  expense_date date not null default current_date,
  recorded_by text,
  status text not null default 'Recorded',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.accountant_monthly_overheads (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  month_key text not null,
  category text not null,
  budget_amount numeric(12,2) not null default 0,
  actual_amount numeric(12,2) not null default 0,
  notes text,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fpa_department_budgets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  month_key text not null,
  category text not null,
  budget_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.stock_requisitions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  requested_by text not null,
  department text default 'Kitchen',
  item_name text not null,
  quantity numeric(12,3) not null default 1,
  unit text default 'pcs',
  notes text,
  status text not null default 'Pending',
  approved_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.temperature_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  equipment_name text not null,
  temp_celsius numeric(6,2) not null,
  status text not null default 'Normal',
  recorded_by text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.saved_qrcodes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  label text not null,
  url text not null,
  qr_url text,
  category text default 'Menu',
  created_at timestamptz not null default timezone('utc', now())
);

-- Enable tenant-scoped RLS across all new POJ Management tables
do $$
declare
  t text;
  policy_name text;
begin
  foreach t in array array[
    'guest_tags',
    'guest_visits',
    'leave_requests',
    'overtime_records',
    'salary_advances',
    'loan_requests',
    'warnings',
    'hr_documents',
    'daily_checklists',
    'expenses',
    'accountant_monthly_overheads',
    'fpa_department_budgets',
    'stock_requisitions',
    'temperature_logs',
    'saved_qrcodes'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for policy_name in
        select polname from pg_policy
        where polrelid = ('public.' || t)::regclass
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
