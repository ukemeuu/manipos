alter table public.trader_profiles
  add column if not exists send_money_provider text,
  add column if not exists send_money_number text;

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
      'send_money_provider', v_prof.send_money_provider,
      'send_money_number', v_prof.send_money_number,
      'accepts_cash', coalesce(v_prof.accepts_cash, true),
      'accepts_cheque', coalesce(v_prof.accepts_cheque, true),
      'currency', coalesce(v_prof.currency, 'KES')
    )
  );
end;
$$;
