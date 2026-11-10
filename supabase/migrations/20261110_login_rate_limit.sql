-- ============================================================================
-- ManiPOS · Brute-force protection for staff sign-in
--
-- The legacy login RPC (email + password) is reachable anonymously through
-- PostgREST, and staff PINs are only 4 digits. Without a limit, an attacker
-- can try every code. This records failed attempts and temporarily locks an
-- identifier out after too many of them.
--
--   login_attempts(identifier, attempted_at)   one row per failed attempt
--   login_attempts_recent(identifier, minutes) how many, for the lockout
--   note_login_attempt(identifier)             record a failure + prune
--
-- The lockout is deliberately generous (10 attempts / 10 minutes) so a busy
-- shift with a typo or two never locks a terminal out.
-- ============================================================================

create table if not exists public.login_attempts (
    id           uuid primary key default gen_random_uuid(),
    identifier   text not null,
    attempted_at timestamptz not null default timezone('utc', now())
);

create index if not exists login_attempts_recent_idx
    on public.login_attempts (identifier, attempted_at);

-- Only the SECURITY DEFINER helpers below touch this table.
alter table public.login_attempts enable row level security;

create or replace function public.login_attempts_recent(p_identifier text, p_minutes int default 10)
returns int
language sql
security definer
set search_path = public
stable
as $$
    select count(*)
      from public.login_attempts
     where identifier = lower(p_identifier)
       and attempted_at > timezone('utc', now()) - make_interval(mins => p_minutes);
$$;

create or replace function public.note_login_attempt(p_identifier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.login_attempts (identifier) values (lower(p_identifier));
    -- Keep the table bounded; attempts older than a day no longer matter.
    delete from public.login_attempts
     where attempted_at < timezone('utc', now()) - interval '1 day';
end;
$$;

grant execute on function public.login_attempts_recent(text, int) to anon, authenticated;
grant execute on function public.note_login_attempt(text) to anon, authenticated;
