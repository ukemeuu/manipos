-- Repair legacy POJ/Orda modifier imports where unlimited multi-add-on groups
-- (like COLESLAW: max_selected >= 50, allow_multiple = true) had min_selected
-- stamped to the total option count, blocking orders from being added to cart.
update public.menu_modifier_groups
set
  min_selected = 0,
  is_required = false
where
  allow_multiple = true
  and coalesce(max_selected, 0) >= 50
  and jsonb_typeof(options) = 'array'
  and jsonb_array_length(options) > 2
  and coalesce(min_selected, 0) >= jsonb_array_length(options);

-- Ensure pos_orders.mpesa_receipt_number exists and PostgREST schema cache reloads.
alter table public.pos_orders add column if not exists mpesa_receipt_number text;
create index if not exists pos_orders_mpesa_receipt_idx
  on public.pos_orders (mpesa_receipt_number);

notify pgrst, 'reload schema';
