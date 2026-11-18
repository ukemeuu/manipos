-- ============================================================================
-- ManiPOS · Owner storefront / microsite editor (19 Nov 2026)
-- ============================================================================
-- Stores the owner's microsite presentation choices (category order, hidden
-- categories and the default landing tab) as JSON on the tenant settings row.
-- Everything else the editor touches (tagline, cover, brand colours, ETA,
-- delivery fee, minimum order, per-item visibility/featured) already lives in
-- existing columns.
-- ============================================================================

alter table public.restaurant_settings
  add column if not exists microsite_config jsonb not null default '{}'::jsonb;

comment on column public.restaurant_settings.microsite_config is
  'Owner-edited microsite presentation: { categoryOrder: string[], hiddenCategories: string[], defaultCategory: string }';
