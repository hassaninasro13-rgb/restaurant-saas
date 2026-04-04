-- Run in Supabase SQL editor or via CLI if you use migrations.
-- Public menu and dashboard use `restaurants.cover_url` for the hero banner.

alter table public.restaurants
  add column if not exists cover_url text;

comment on column public.restaurants.cover_url is 'Public URL from Storage bucket covers (menu banner)';
