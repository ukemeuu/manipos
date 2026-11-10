-- Stock / availability tracking columns used by the POS "86 / Out" feature
-- and VAT-inclusive pricing. These were referenced by the POS but never added
-- to the table, so every availability update silently failed.
alter table public.pos_menu
  add column if not exists out_of_stock_type text,
  add column if not exists out_of_stock_date date,
  add column if not exists include_vat boolean not null default false;

comment on column public.pos_menu.out_of_stock_type is
  'Why an item is unavailable: day = rest of the day, indefinite = until staff turn it back on.';
comment on column public.pos_menu.out_of_stock_date is
  'The date the item was switched off, used to auto re-enable daily 86s.';
comment on column public.pos_menu.include_vat is
  'Whether 16% VAT is already included in this item''s price.';
