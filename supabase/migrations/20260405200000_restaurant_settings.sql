-- Per-restaurant preferences: currency, language, theme. One row per restaurant.

create table if not exists public.restaurant_settings (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  currency text not null default 'DZD',
  language text not null default 'fr',
  theme_color text,
  updated_at timestamptz not null default now()
);

comment on table public.restaurant_settings is 'Display & locale prefs; name/logo/address/phone stay on restaurants';
comment on column public.restaurant_settings.currency is 'ISO 4217 code for prices (e.g. DZD, EUR)';
comment on column public.restaurant_settings.language is 'BCP 47 tag for future i18n (e.g. fr, ar, en)';
comment on column public.restaurant_settings.theme_color is 'Accent hex e.g. #e85c2c — drives --accent on client';

-- Backfill for existing restaurants
insert into public.restaurant_settings (restaurant_id)
select r.id from public.restaurants r
where not exists (
  select 1 from public.restaurant_settings s where s.restaurant_id = r.id
)
on conflict (restaurant_id) do nothing;

alter table public.restaurant_settings enable row level security;

grant select on public.restaurant_settings to anon, authenticated;
grant insert, update, delete on public.restaurant_settings to authenticated;

drop policy if exists "restaurant_settings_anon_select" on public.restaurant_settings;
create policy "restaurant_settings_anon_select"
  on public.restaurant_settings
  for select
  to anon
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_settings.restaurant_id
        and coalesce(r.is_active, true) = true
    )
  );

drop policy if exists "restaurant_settings_owner_write" on public.restaurant_settings;
create policy "restaurant_settings_owner_write"
  on public.restaurant_settings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_settings.restaurant_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_settings.restaurant_id
        and r.user_id = auth.uid()
    )
  );

-- Optional: opening_hours public read (menu badge) if table exists
do $oh$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'opening_hours'
  ) then
    execute 'alter table public.opening_hours enable row level security';
    execute 'drop policy if exists opening_hours_anon_select on public.opening_hours';
    execute $p$
      create policy opening_hours_anon_select on public.opening_hours
      for select to anon using (
        exists (
          select 1 from public.restaurants r
          where r.id = opening_hours.restaurant_id
            and coalesce(r.is_active, true) = true
        )
      )
    $p$;
    execute 'drop policy if exists opening_hours_owner_all on public.opening_hours';
    execute $p$
      create policy opening_hours_owner_all on public.opening_hours
      for all to authenticated using (
        exists (
          select 1 from public.restaurants r
          where r.id = opening_hours.restaurant_id and r.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.restaurants r
          where r.id = opening_hours.restaurant_id and r.user_id = auth.uid()
        )
      )
    $p$;
  end if;
end $oh$;

-- Unique day row per restaurant (required for upsert from settings UI)
do $uq$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'opening_hours'
  ) then
    execute 'create unique index if not exists opening_hours_restaurant_day_uq on public.opening_hours (restaurant_id, day_of_week)';
  end if;
end $uq$;

-- New restaurants get a settings row automatically
create or replace function public.ensure_restaurant_settings_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.restaurant_settings (restaurant_id) values (new.id)
  on conflict (restaurant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tr_ensure_restaurant_settings on public.restaurants;
create trigger tr_ensure_restaurant_settings
  after insert on public.restaurants
  for each row execute function public.ensure_restaurant_settings_row();
