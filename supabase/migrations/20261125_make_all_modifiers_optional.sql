-- Ensure all modifier groups default to optional so staff/customers are never
-- forced to pick a modifier before adding an item to their order.
update public.menu_modifier_groups
set
  is_required = false,
  min_selected = 0
where is_required = true or coalesce(min_selected, 0) > 0;

notify pgrst, 'reload schema';
