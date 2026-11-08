-- Bug reports captured by the browser and forwarded to Telegram.
--
-- The app posts unhandled errors here (see src/lib/errorReporter.js) and
-- scripts/error-forwarder.py reads them, sends them to Telegram, and marks
-- them as forwarded.
--
-- RLS is deliberately permissive on insert: the microsite and POS are public,
-- so anyone may report an error. Reads and updates require the service role.

create table if not exists public.error_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  forwarded_at timestamptz,
  forwarded_count integer not null default 0,
  severity text not null default 'error',
  tenant_slug text,
  restaurant_id uuid,
  staff_name text,
  page text,
  url text,
  user_agent text,
  error_message text not null,
  error_stack text,
  component_stack text
);

create index if not exists error_logs_forwarded_idx
  on public.error_logs (forwarded_at, created_at desc);

alter table public.error_logs enable row level security;

create policy "anyone can report errors"
  on public.error_logs
  for insert to anon, authenticated
  with check (true);

create policy "no public read"
  on public.error_logs
  for select to anon, authenticated
  using (false);

create policy "no public update"
  on public.error_logs
  for update to anon, authenticated
  using (false);
