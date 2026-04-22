create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  table_number integer not null,
  created_at timestamptz not null default now(),
  constraint tables_restaurant_table_number_unique unique (restaurant_id, table_number),
  constraint tables_restaurant_name_unique unique (restaurant_id, name)
);

create index if not exists tables_restaurant_id_idx
  on public.tables (restaurant_id);

create index if not exists tables_restaurant_table_number_idx
  on public.tables (restaurant_id, table_number);

alter table public.tables enable row level security;

grant select, insert, update, delete on public.tables to authenticated;

drop policy if exists "tables_owner_all" on public.tables;
create policy "tables_owner_all"
  on public.tables
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.restaurants r
      where r.id = tables.restaurant_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.restaurants r
      where r.id = tables.restaurant_id
        and r.user_id = auth.uid()
    )
  );
