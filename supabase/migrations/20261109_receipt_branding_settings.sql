-- ============================================================================
-- ManiPOS · Receipt branding settings
--
-- Restaurants need to control what appears on their printed receipts: the
-- store name, logo, address, KRA PIN, website, social pages, till number and
-- M-Pesa paybill/account. Previously these were hard-coded in the print
-- templates (and were all one tenant's details).
--
-- The store name lives on `restaurants`; the rest live on
-- `restaurant_settings`. `restaurants` has no public write policy, so the
-- profile is written through `restaurant_profile_upsert`, which authorises the
-- acting staff member and scopes every change to their own tenant.
-- ============================================================================

alter table public.restaurant_settings
    add column if not exists kra_pin text,
    add column if not exists website text,
    add column if not exists till_number text;

create or replace function public.restaurant_profile_upsert(
    p_actor_id uuid,
    p_name text,
    p_address text,
    p_phone text,
    p_kra_pin text,
    p_website text,
    p_till_number text,
    p_paybill text,
    p_account text,
    p_logo_url text,
    p_socials jsonb default null,
    p_enabled_payment_methods jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_role text;
    v_restaurant_id uuid;
begin
    select role, restaurant_id into v_role, v_restaurant_id
    from public.staff_access where id = p_actor_id;

    if not found or v_role not in ('admin', 'manager') then
        raise exception 'Not authorised to manage the restaurant profile';
    end if;

    if p_name is not null and p_name <> '' then
        update public.restaurants
           set name = p_name
         where id = v_restaurant_id;
    end if;

    insert into public.restaurant_settings (
        restaurant_id, address, phone, kra_pin, website, till_number,
        mpesa_paybill, mpesa_account, logo_url, socials, enabled_payment_methods
    )
    values (
        v_restaurant_id, p_address, p_phone, p_kra_pin, p_website, p_till_number,
        p_paybill, p_account, p_logo_url, coalesce(p_socials, '{}'::jsonb),
        coalesce(p_enabled_payment_methods, '["CASH","MPESA","CARD"]'::jsonb)
    )
    on conflict (restaurant_id) do update
        set address = excluded.address,
            phone = excluded.phone,
            kra_pin = excluded.kra_pin,
            website = excluded.website,
            till_number = excluded.till_number,
            mpesa_paybill = excluded.mpesa_paybill,
            mpesa_account = excluded.mpesa_account,
            logo_url = excluded.logo_url,
            socials = coalesce(excluded.socials, restaurant_settings.socials),
            enabled_payment_methods = coalesce(excluded.enabled_payment_methods, restaurant_settings.enabled_payment_methods),
            updated_at = timezone('utc', now());

    return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.restaurant_profile_upsert(uuid, text, text, text, text, text, text, text, text, text, jsonb, jsonb) to anon, authenticated;
