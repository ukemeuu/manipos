-- ============================================================================
-- Menu builder: categories, subcategories and per-item microsite visibility
-- ============================================================================

-- Category hierarchy + presentation
alter table public.pos_categories add column if not exists parent_id uuid
  references public.pos_categories(id) on delete cascade;
alter table public.pos_categories add column if not exists image_url text;
alter table public.pos_categories add column if not exists description text;
alter table public.pos_categories add column if not exists is_active boolean default true;

create index if not exists pos_categories_parent_idx on public.pos_categories (parent_id);

-- Menu item: subcategory + microsite visibility (image_url / show_on_microsite
-- already exist from the market-ready migration).
alter table public.pos_menu add column if not exists subcategory text;

-- Customisation / modifier groups (the columns the POS editor expects).
alter table public.menu_modifier_groups add column if not exists min_selected int default 0;
alter table public.menu_modifier_groups add column if not exists max_selected int default 1;
alter table public.menu_modifier_groups add column if not exists is_required boolean default false;
alter table public.menu_modifier_groups add column if not exists menu_item_ids jsonb default '[]'::jsonb;

-- Public image bucket used by the menu builder.
insert into storage.buckets (id, name, public)
values ('menu_images', 'menu_images', true)
on conflict (id) do nothing;

-- Storage policy: authenticated staff may upload/read menu images.
drop policy if exists "Staff manage menu images" on storage.objects;
create policy "Staff manage menu images"
  on storage.objects for all to authenticated
  using (bucket_id = 'menu_images')
  with check (bucket_id = 'menu_images');

drop policy if exists "Public read menu images" on storage.objects;
create policy "Public read menu images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'menu_images');
