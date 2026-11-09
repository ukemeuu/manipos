-- effective_permissions used `permissions::text[]`, which Postgres rejects
-- ("cannot cast type jsonb to text[]"). Expand the JSON array properly.
create or replace function public.effective_permissions(p_staff_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role         text;
    v_override     jsonb;
    v_perms        text[];
    v_defaults     text[];
begin
    select role, permissions
      into v_role, v_override
      from public.staff_access
     where id = p_staff_id;

    if not found then
        return '{}'::text[];
    end if;

    -- An explicit per-user list always wins over the role defaults.
    if v_override is not null then
        select array_agg(entry)
          into v_perms
          from jsonb_array_elements_text(v_override) entry;
        return coalesce(v_perms, '{}'::text[]);
    end if;

    select array_agg(permission_key)
      into v_defaults
      from public.role_permissions
     where role = v_role;

    return coalesce(v_defaults, '{}'::text[]);
end;
$$;
