-- ============================================================================
-- ManiPOS · Wave 5 Orda Wallet, Subscriptions, Integrations Hub,
-- Omnichannel Connectors, Table Areas, API/Webhooks & 24-Permission RBAC.
-- Strictly additive & preserves all existing ManiPOS Daraja / KDS / FloorPlan flows.
-- ============================================================================

-- 1. SaaS Subscriptions & Billing Invoices
create table if not exists public.saas_plans (
    id text primary key,
    name text not null,
    monthly_kes numeric(10,2) not null default 0,
    annual_kes numeric(10,2) not null default 0,
    max_locations integer not null default 1,
    features jsonb not null default '[]'::jsonb,
    is_active boolean not null default true
);

insert into public.saas_plans (id, name, monthly_kes, annual_kes, max_locations, features)
values
  ('starter', 'Starter Plan', 3500, 35000, 1, '["Live POS Register", "Digital Menu Microsite", "M-Pesa STK Push", "Core Sales Reports"]'::jsonb),
  ('growth', 'Growth Plan', 7500, 75000, 3, '["Multi-Location Support", "Inventory & Food Costing ERP", "Customers CRM, Store Credit & Loyalty", "6am-6am PDF EOD Reports"]'::jsonb),
  ('enterprise', 'Enterprise Fleet', 15000, 150000, 15, '["Unlimited POS Registers", "Omnichannel Aggregator Sync", "Tevin KRA eTIMS & 3rd-Party Dispatch", "Custom API Webhooks & SLA"]'::jsonb)
on conflict (id) do nothing;

create table if not exists public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    plan_id text not null default 'growth' references public.saas_plans(id),
    billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
    status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'cancelled')),
    current_period_start timestamptz not null default timezone('utc', now()),
    current_period_end timestamptz not null default timezone('utc', now()) + interval '30 days',
    auto_renew boolean not null default true,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists subscriptions_restaurant_uidx on public.subscriptions (restaurant_id);

create table if not exists public.subscription_invoices (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    subscription_id uuid references public.subscriptions(id) on delete set null,
    invoice_number text not null,
    plan_id text not null,
    amount_kes numeric(12,2) not null default 0,
    status text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'void')),
    payment_method text default 'Paystack',
    reference text,
    paid_at timestamptz,
    created_at timestamptz not null default timezone('utc', now())
);

-- 2. Merchant Wallet & Ledger (Credit, Debit, Topup, Remittance, Withdrawal, Invoice)
create table if not exists public.merchant_wallet_ledger (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    entry_type text not null check (entry_type in ('Credit', 'Debit', 'Topup', 'Remittance', 'Withdrawal', 'Invoice')),
    amount_kes numeric(12,2) not null default 0,
    balance_after_kes numeric(12,2) not null default 0,
    channel text default 'Paystack',
    reference text,
    description text,
    status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists merchant_wallet_ledger_idx on public.merchant_wallet_ledger (restaurant_id, created_at desc);

-- 3. POS Hardware / Working-Capital Loan Requests
create table if not exists public.device_loan_requests (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    request_type text not null default 'POS Hardware',
    device_model text,
    quantity integer not null default 1,
    amount_kes numeric(12,2) default 0,
    notes text,
    status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'approved', 'declined')),
    created_by text,
    created_at timestamptz not null default timezone('utc', now())
);

-- 4. Merchant API Keys & Outbound Callback Webhooks
create table if not exists public.merchant_api_keys (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    label text not null default 'Primary Production Key',
    public_key text not null,
    secret_key_hash text,
    secret_key_preview text,
    callback_url text,
    webhook_secret text,
    is_active boolean not null default true,
    last_used_at timestamptz,
    created_at timestamptz not null default timezone('utc', now())
);

-- 5. Tenant Integrations Hub (Tevin KRA, Leta, Little, Custom Payments, MPESA Paybill, Paystack Connect)
create table if not exists public.tenant_integrations (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    provider text not null, -- 'tevin_kra' | 'leta' | 'little' | 'mpesa_paybill' | 'mpesa_paystack' | 'custom_payment'
    category text not null default 'ACCOUNTS', -- 'ACCOUNTS' | 'DELIVERY' | 'PAYMENTS'
    is_enabled boolean not null default false,
    config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists tenant_integrations_uidx on public.tenant_integrations (restaurant_id, provider);

-- 6. Omnichannel Connectors (Glovo, Bolt Food, Uber Eats)
create table if not exists public.omnichannel_configs (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    platform text not null check (platform in ('glovo', 'bolt', 'ubereats')),
    is_enabled boolean not null default false,
    external_store_id text,
    auto_accept_orders boolean not null default true,
    weekly_hours jsonb not null default '{}'::jsonb,
    last_menu_sync_at timestamptz,
    last_sync_status text default 'Not synced',
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists omnichannel_configs_uidx on public.omnichannel_configs (restaurant_id, platform);

create table if not exists public.omnichannel_events (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    platform text not null,
    event_type text not null,
    external_order_id text,
    payload jsonb not null default '{}'::jsonb,
    status text not null default 'processed',
    created_at timestamptz not null default timezone('utc', now())
);

create index if not exists omnichannel_events_idx on public.omnichannel_events (restaurant_id, created_at desc);

-- 7. Team Custom Roles (8 Modules + 24 POS Granular Permissions) & Staff Scoping
create table if not exists public.team_roles (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    name text not null,
    description text,
    module_permissions jsonb not null default '{}'::jsonb, -- { orders, dashboard, customers, menu, settings, wallet, inventory, account }
    pos_permissions jsonb not null default '[]'::jsonb,    -- up to 24 Orda POS permissions
    is_system boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

alter table public.staff_access add column if not exists team_role_id uuid references public.team_roles(id) on delete set null;
alter table public.staff_access add column if not exists branch_ids jsonb not null default '[]'::jsonb;
alter table public.staff_access add column if not exists email text;

-- 8. Floor Areas (linked to existing pos_tables & FloorPlanView QR Ordering)
create table if not exists public.floor_areas (
    id uuid primary key default gen_random_uuid(),
    restaurant_id uuid not null references public.restaurants(id) on delete cascade,
    branch_id uuid references public.branches(id) on delete set null,
    name text not null,
    description text,
    display_order integer not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc', now())
);

alter table public.pos_tables add column if not exists floor_area_id uuid references public.floor_areas(id) on delete set null;
alter table public.pos_tables add column if not exists branch_id uuid references public.branches(id) on delete set null;

-- 9. Account Support PIN & Wallet Balance Fields
alter table public.branches add column if not exists support_verification_pin text;
alter table public.branches add column if not exists support_pin_expires_at timestamptz;
alter table public.restaurant_settings add column if not exists wallet_balance_kes numeric(12,2) not null default 0;
alter table public.restaurant_settings add column if not exists callback_url text;

-- 10. Strict Tenant Isolation RLS Policies
alter table public.saas_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.merchant_wallet_ledger enable row level security;
alter table public.device_loan_requests enable row level security;
alter table public.merchant_api_keys enable row level security;
alter table public.tenant_integrations enable row level security;
alter table public.omnichannel_configs enable row level security;
alter table public.omnichannel_events enable row level security;
alter table public.team_roles enable row level security;
alter table public.floor_areas enable row level security;

drop policy if exists "saas_plans_public_read" on public.saas_plans;
create policy "saas_plans_public_read" on public.saas_plans for select to anon, authenticated using (true);

drop policy if exists "subscriptions_tenant_isolation" on public.subscriptions;
create policy "subscriptions_tenant_isolation" on public.subscriptions
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "subscription_invoices_tenant_isolation" on public.subscription_invoices;
create policy "subscription_invoices_tenant_isolation" on public.subscription_invoices
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "merchant_wallet_ledger_tenant_isolation" on public.merchant_wallet_ledger;
create policy "merchant_wallet_ledger_tenant_isolation" on public.merchant_wallet_ledger
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "device_loan_requests_tenant_isolation" on public.device_loan_requests;
create policy "device_loan_requests_tenant_isolation" on public.device_loan_requests
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "merchant_api_keys_tenant_isolation" on public.merchant_api_keys;
create policy "merchant_api_keys_tenant_isolation" on public.merchant_api_keys
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "tenant_integrations_tenant_isolation" on public.tenant_integrations;
create policy "tenant_integrations_tenant_isolation" on public.tenant_integrations
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "omnichannel_configs_tenant_isolation" on public.omnichannel_configs;
create policy "omnichannel_configs_tenant_isolation" on public.omnichannel_configs
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "omnichannel_events_tenant_isolation" on public.omnichannel_events;
create policy "omnichannel_events_tenant_isolation" on public.omnichannel_events
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "team_roles_tenant_isolation" on public.team_roles;
create policy "team_roles_tenant_isolation" on public.team_roles
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());

drop policy if exists "floor_areas_public_read" on public.floor_areas;
drop policy if exists "floor_areas_tenant_write" on public.floor_areas;
create policy "floor_areas_public_read" on public.floor_areas
    for select to anon, authenticated using (restaurant_id = public.current_tenant_id() or is_active = true);
create policy "floor_areas_tenant_write" on public.floor_areas
    for all to anon, authenticated using (restaurant_id = public.current_tenant_id()) with check (restaurant_id = public.current_tenant_id());
