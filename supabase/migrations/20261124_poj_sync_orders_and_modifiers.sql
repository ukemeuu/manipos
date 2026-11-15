-- Idempotent POJ sync keys for pos_categories, pos_menu, and menu_modifier_groups
-- Enables clean incremental catalog + modifier group synchronization without duplicates.

alter table if exists public.pos_categories
  add column if not exists source_poj_id text;

create unique index if not exists idx_pos_categories_poj_sync
  on public.pos_categories (restaurant_id, source_poj_id)
  where source_poj_id is not null;

alter table if exists public.pos_menu
  add column if not exists source_poj_id text;

create unique index if not exists idx_pos_menu_poj_sync
  on public.pos_menu (restaurant_id, source_poj_id)
  where source_poj_id is not null;

alter table if exists public.menu_modifier_groups
  add column if not exists source_poj_id text;

create unique index if not exists idx_menu_modifier_groups_poj_sync
  on public.menu_modifier_groups (restaurant_id, source_poj_id)
  where source_poj_id is not null;
