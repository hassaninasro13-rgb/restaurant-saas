alter table public.restaurant_settings
  add column if not exists primary_color text not null default '#D4521A',
  add column if not exists background_color text not null default '#ffffff',
  add column if not exists text_color text not null default '#1a1a1a',
  add column if not exists font_family text not null default 'Poppins',
  add column if not exists theme_name text not null default 'Classic';

comment on column public.restaurant_settings.primary_color is 'Public menu primary color';
comment on column public.restaurant_settings.background_color is 'Public menu background color';
comment on column public.restaurant_settings.text_color is 'Public menu text color';
comment on column public.restaurant_settings.font_family is 'Public menu font family (Cairo, Poppins, Tajawal)';
comment on column public.restaurant_settings.theme_name is 'Selected predefined theme name';
