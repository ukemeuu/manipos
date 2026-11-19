-- Trader Invoice & Receipt Generator (`manipos.com/#/invoices`)
-- Isolated from restaurant tenant POS tables; scoped to authenticated traders (`auth.uid()`).

create table if not exists public.trader_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  logo_url text,
  kra_pin text,
  location text,
  phone text,
  email text,
  mpesa_till_no text,
  mpesa_paybill_no text,
  mpesa_account_no text,
  accepts_cash boolean not null default true,
  accepts_cheque boolean not null default true,
  currency text not null default 'KES',
  plan text not null default 'free' check (plan in ('free', 'starter', 'unlimited')),
  plan_expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trader_customers (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.trader_profiles(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trader_vendors (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.trader_profiles(id) on delete cascade,
  vendor_name text not null,
  poc_name text,
  vendor_phone text,
  address text,
  email text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trader_catalog_items (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.trader_profiles(id) on delete cascade,
  name text not null,
  unit text not null default 'kg',
  unit_price numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.trader_invoices (
  id uuid primary key default gen_random_uuid(),
  trader_id uuid not null references public.trader_profiles(id) on delete cascade,
  customer_id uuid references public.trader_customers(id) on delete set null,
  invoice_number text not null,
  doc_type text not null default 'invoice' check (doc_type in ('invoice', 'receipt')),
  buyer_name text not null,
  buyer_email text,
  buyer_phone text,
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'partial', 'paid', 'overdue')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  amount_paid numeric not null default 0,
  payment_method text,
  payment_reference text,
  paid_at timestamptz,
  notes text,
  auto_remind boolean not null default true,
  last_reminded_at timestamptz,
  reminder_count integer not null default 0,
  public_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists trader_invoices_trader_month_idx
  on public.trader_invoices (trader_id, created_at desc);

create index if not exists trader_invoices_public_token_idx
  on public.trader_invoices (public_token);

create index if not exists trader_invoices_due_remind_idx
  on public.trader_invoices (status, auto_remind, due_date);

-- Enforce monthly plan quotas:
--   free      -> max 10 total documents (invoices + receipts) per calendar month
--   starter   -> (KES 290/mo) max 30 invoices AND 30 receipts per calendar month
--   unlimited -> (KES 700/mo) unlimited
create or replace function public.enforce_trader_invoice_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_expires timestamptz;
  v_month_start timestamptz := date_trunc('month', coalesce(new.created_at, timezone('utc', now())));
  v_total_count integer;
  v_type_count integer;
begin
  select plan, plan_expires_at
    into v_plan, v_expires
    from public.trader_profiles
    where id = new.trader_id;

  v_plan := coalesce(v_plan, 'free');
  if v_plan <> 'free' and v_expires is not null and v_expires < timezone('utc', now()) then
    v_plan := 'free';
  end if;

  if v_plan = 'unlimited' then
    return new;
  end if;

  if v_plan = 'starter' then
    select count(*) into v_type_count
      from public.trader_invoices
      where trader_id = new.trader_id
        and doc_type = new.doc_type
        and created_at >= v_month_start;
    if v_type_count >= 30 then
      raise exception 'Monthly Starter limit reached (30 %ss/month). Upgrade to Unlimited (KES 700/mo) to continue.', new.doc_type;
    end if;
    return new;
  end if;

  select count(*) into v_total_count
    from public.trader_invoices
    where trader_id = new.trader_id
      and created_at >= v_month_start;
  if v_total_count >= 10 then
    raise exception 'Monthly Free limit reached (10 invoices/receipts per month). Upgrade to Starter (KES 290/mo) or Unlimited (KES 700/mo).';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_trader_invoice_quota on public.trader_invoices;
create trigger trg_enforce_trader_invoice_quota
  before insert on public.trader_invoices
  for each row
  execute function public.enforce_trader_invoice_quota();

-- Row Level Security
alter table public.trader_profiles enable row level security;
alter table public.trader_customers enable row level security;
alter table public.trader_vendors enable row level security;
alter table public.trader_catalog_items enable row level security;
alter table public.trader_invoices enable row level security;

drop policy if exists "trader_profiles_own" on public.trader_profiles;
create policy "trader_profiles_own"
  on public.trader_profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "trader_customers_own" on public.trader_customers;
create policy "trader_customers_own"
  on public.trader_customers for all to authenticated
  using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "trader_vendors_own" on public.trader_vendors;
create policy "trader_vendors_own"
  on public.trader_vendors for all to authenticated
  using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "trader_catalog_items_own" on public.trader_catalog_items;
create policy "trader_catalog_items_own"
  on public.trader_catalog_items for all to authenticated
  using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "trader_invoices_own" on public.trader_invoices;
create policy "trader_invoices_own"
  on public.trader_invoices for all to authenticated
  using (trader_id = auth.uid()) with check (trader_id = auth.uid());

-- Public read-only RPC for `#/inv/<public_token>`
create or replace function public.get_public_trader_invoice(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.trader_invoices%rowtype;
  v_prof public.trader_profiles%rowtype;
begin
  select * into v_inv
    from public.trader_invoices
    where public_token = p_token
    limit 1;
  if not found then
    return null;
  end if;

  select * into v_prof
    from public.trader_profiles
    where id = v_inv.trader_id
    limit 1;

  return jsonb_build_object(
    'invoice', to_jsonb(v_inv),
    'trader', jsonb_build_object(
      'business_name', v_prof.business_name,
      'logo_url', v_prof.logo_url,
      'kra_pin', v_prof.kra_pin,
      'location', v_prof.location,
      'phone', v_prof.phone,
      'email', v_prof.email,
      'mpesa_till_no', v_prof.mpesa_till_no,
      'mpesa_paybill_no', v_prof.mpesa_paybill_no,
      'mpesa_account_no', v_prof.mpesa_account_no,
      'accepts_cash', coalesce(v_prof.accepts_cash, true),
      'accepts_cheque', coalesce(v_prof.accepts_cheque, true),
      'currency', coalesce(v_prof.currency, 'KES')
    )
  );
end;
$$;

grant execute on function public.get_public_trader_invoice(uuid) to anon, authenticated;
