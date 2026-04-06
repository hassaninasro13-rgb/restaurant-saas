-- Service tables for QR / table ordering (one row per named table or zone).
-- Orders reference restaurant_tables.id and store table_name as a snapshot at checkout.

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint restaurant_tables_restaurant_name_unique unique (restaurant_id, name)
);

create index if not exists restaurant_tables_restaurant_id_idx
  on public.restaurant_tables (restaurant_id);

comment on table public.restaurant_tables is 'Named tables (e.g. 5, Table 1, Terrace) for public menu ?table=… and QR URLs';
comment on column public.restaurant_tables.name is 'Display label; must match URL param when using table=name';

alter table public.orders
  add column if not exists table_id uuid references public.restaurant_tables (id) on delete set null,
  add column if not exists table_name text;

comment on column public.orders.table_id is 'FK to restaurant_tables when order came from table/QR flow';
comment on column public.orders.table_name is 'Snapshot of table label at order time (kitchen/history if row deleted/renamed)';

alter table public.restaurant_tables enable row level security;

grant select on public.restaurant_tables to anon, authenticated;
grant insert, update, delete on public.restaurant_tables to authenticated;

drop policy if exists "restaurant_tables_anon_select" on public.restaurant_tables;
create policy "restaurant_tables_anon_select"
  on public.restaurant_tables
  for select
  to anon
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_tables.restaurant_id
        and coalesce(r.is_active, true) = true
    )
  );

drop policy if exists "restaurant_tables_owner_all" on public.restaurant_tables;
create policy "restaurant_tables_owner_all"
  on public.restaurant_tables
  for all
  to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_tables.restaurant_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.restaurants r
      where r.id = restaurant_tables.restaurant_id
        and r.user_id = auth.uid()
    )
  );

-- Public checkout: optional table_id must belong to the same restaurant.
drop policy if exists "anon_insert_orders" on public.orders;
create policy "anon_insert_orders"
  on public.orders
  for insert
  to anon
  with check (
    restaurant_id is not null
    and exists (
      select 1 from public.restaurants r where r.id = orders.restaurant_id
    )
    and (
      table_id is null
      or exists (
        select 1 from public.restaurant_tables t
        where t.id = orders.table_id
          and t.restaurant_id = orders.restaurant_id
      )
    )
  );
