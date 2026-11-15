-- ============================================================================
-- POJ Order History Sync Key (Additive & Idempotent)
-- Enables persisting historical & today's pos_orders from pojmanagement.com
-- into ManiPOS without duplicates.
-- ============================================================================

alter table public.pos_orders add column if not exists source_poj_id text;
alter table public.pos_order_items add column if not exists source_poj_id text;

create unique index if not exists idx_pos_orders_poj_sync
    on public.pos_orders (restaurant_id, source_poj_id)
    where source_poj_id is not null;
