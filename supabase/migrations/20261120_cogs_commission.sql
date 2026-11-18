-- ============================================================================
-- ManiPOS · Product costing, commission & per-product discounts (20 Nov 2026)
-- ============================================================================
-- Owners can cost each menu item (exact cost price or a % of price), set a
-- store-wide base COGS %, and set a per-product commission (e.g. the 20% an
-- aggregator takes on a specific dish). Order lines snapshot those values so
-- profitability stays accurate even after the menu changes.
-- ============================================================================

alter table public.pos_menu
  add column if not exists cogs_percent numeric(5,2) not null default 0;
alter table public.pos_menu
  add column if not exists commission_percent numeric(5,2) not null default 0;

alter table public.restaurant_settings
  add column if not exists base_cogs_percent numeric(5,2) not null default 0;

alter table public.pos_order_items
  add column if not exists cost_price numeric(10,2) not null default 0;
alter table public.pos_order_items
  add column if not exists commission_percent numeric(5,2) not null default 0;
alter table public.pos_order_items
  add column if not exists cogs_amount numeric(10,2) not null default 0;
alter table public.pos_order_items
  add column if not exists commission_amount numeric(10,2) not null default 0;
alter table public.pos_order_items
  add column if not exists discount_amount numeric(10,2) not null default 0;

-- Per-product vs whole-bill discounts.
alter table public.pos_discounts
  add column if not exists scope text not null default 'bill';
alter table public.pos_discounts
  add column if not exists menu_item_ids jsonb not null default '[]'::jsonb;

create index if not exists pos_order_items_menu_item_idx
  on public.pos_order_items (menu_item_id);
