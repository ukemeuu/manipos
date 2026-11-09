-- M-Pesa Daraja STK push support.
--
-- A ledger of every STK push and its callback, separate from pos_orders so the
-- payment history survives even if an order is deleted. pos_orders carries the
-- denormalised receipt number and paid timestamp for fast POS lookups.

create table if not exists public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.pos_orders(id) on delete set null,
  restaurant_id uuid,
  checkout_request_id text,
  merchant_request_id text,
  transaction_id text,
  receipt_number text,
  phone text,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending', -- pending | completed | failed | cancelled | timeout
  result_code integer,
  result_desc text,
  raw_callback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mpesa_transactions_order_idx
  on public.mpesa_transactions (order_id);
create index if not exists mpesa_transactions_checkout_idx
  on public.mpesa_transactions (checkout_request_id);

alter table public.mpesa_transactions enable row level security;

-- The edge functions use the service role (which bypasses RLS). Nobody reads
-- or writes this table directly from the app.
create policy "mpesa no direct access"
  on public.mpesa_transactions
  for all
  using (false)
  with check (false);

-- Denormalised payment fields on the order for POS/kitchen lookups.
alter table public.pos_orders add column if not exists mpesa_receipt_number text;
alter table public.pos_orders add column if not exists mpesa_checkout_request_id text;
alter table public.pos_orders add column if not exists paid_at timestamptz;

create index if not exists pos_orders_receipt_idx
  on public.pos_orders (mpesa_receipt_number);
