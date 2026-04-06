-- Restaurant users + role-based access for staff accounts.

create table if not exists public.restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid,
  email text not null,
  role text not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_users_role_check check (role in ('owner', 'admin', 'staff', 'kitchen'))
);

create unique index if not exists restaurant_users_rest_email_uidx
  on public.restaurant_users (restaurant_id, lower(email));

create unique index if not exists restaurant_users_rest_user_uidx
  on public.restaurant_users (restaurant_id, user_id)
  where user_id is not null;

comment on table public.restaurant_users is 'Restaurant staff accounts by role (owner/admin/staff/kitchen).';

create or replace function public.restaurant_users_before_write()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(trim(coalesce(new.email, '')));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_restaurant_users_before_write on public.restaurant_users;
create trigger tr_restaurant_users_before_write
  before insert or update on public.restaurant_users
  for each row
  execute function public.restaurant_users_before_write();

-- Backfill owner membership rows for existing restaurants.
insert into public.restaurant_users (restaurant_id, user_id, email, role, is_active)
select
  r.id,
  r.user_id,
  lower(trim(coalesce(auth_u.email, 'owner@local'))),
  'owner',
  true
from public.restaurants r
left join auth.users auth_u on auth_u.id = r.user_id
on conflict (restaurant_id, lower(email)) do nothing;

-- New restaurant -> ensure owner row exists.
create or replace function public.ensure_owner_restaurant_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_email text;
begin
  select lower(trim(coalesce(u.email, 'owner@local')))
  into owner_email
  from auth.users u
  where u.id = new.user_id;

  insert into public.restaurant_users (restaurant_id, user_id, email, role, is_active)
  values (new.id, new.user_id, coalesce(owner_email, 'owner@local'), 'owner', true)
  on conflict (restaurant_id, lower(email)) do update
    set user_id = excluded.user_id,
        role = 'owner',
        is_active = true,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_restaurants_ensure_owner_user on public.restaurants;
create trigger tr_restaurants_ensure_owner_user
  after insert on public.restaurants
  for each row
  execute function public.ensure_owner_restaurant_user();

-- On login, link pending email-only rows to current auth user.
create or replace function public.sync_restaurant_user_on_login(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.restaurant_users ru
  set user_id = p_user_id,
      updated_at = now()
  where lower(trim(ru.email)) = lower(trim(coalesce(p_email, '')))
    and (ru.user_id is null or ru.user_id = p_user_id);
end;
$$;

create or replace function public.has_restaurant_role(p_restaurant_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_users ru
    where ru.restaurant_id = p_restaurant_id
      and ru.user_id = auth.uid()
      and ru.is_active = true
      and ru.role = any (p_roles)
  );
$$;

grant execute on function public.sync_restaurant_user_on_login(uuid, text) to authenticated;
grant execute on function public.has_restaurant_role(uuid, text[]) to authenticated, anon;

alter table public.restaurant_users enable row level security;

drop policy if exists "restaurant_users_select_own_or_manager" on public.restaurant_users;
create policy "restaurant_users_select_own_or_manager"
  on public.restaurant_users
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );

drop policy if exists "restaurant_users_insert_manager" on public.restaurant_users;
create policy "restaurant_users_insert_manager"
  on public.restaurant_users
  for insert
  to authenticated
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );

drop policy if exists "restaurant_users_update_manager" on public.restaurant_users;
create policy "restaurant_users_update_manager"
  on public.restaurant_users
  for update
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  )
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );

drop policy if exists "restaurant_users_delete_manager" on public.restaurant_users;
create policy "restaurant_users_delete_manager"
  on public.restaurant_users
  for delete
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
    and role <> 'owner'
  );

-- Restaurants: allow select/update for owner/admin members.
drop policy if exists "restaurants_member_select" on public.restaurants;
create policy "restaurants_member_select"
  on public.restaurants
  for select
  to authenticated
  using (
    public.has_restaurant_role(id, array['owner', 'admin', 'staff', 'kitchen'])
  );

drop policy if exists "restaurants_manager_update" on public.restaurants;
create policy "restaurants_manager_update"
  on public.restaurants
  for update
  to authenticated
  using (
    public.has_restaurant_role(id, array['owner', 'admin'])
  )
  with check (
    public.has_restaurant_role(id, array['owner', 'admin'])
  );

-- Orders: staff and kitchen can read/update order workflow.
drop policy if exists "orders_member_select" on public.orders;
create policy "orders_member_select"
  on public.orders
  for select
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin', 'staff', 'kitchen'])
  );

drop policy if exists "orders_member_update" on public.orders;
create policy "orders_member_update"
  on public.orders
  for update
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin', 'staff', 'kitchen'])
  )
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin', 'staff', 'kitchen'])
  );

-- Order items: readable by restaurant members (used by orders/kitchen pages).
drop policy if exists "order_items_member_select" on public.order_items;
create policy "order_items_member_select"
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.has_restaurant_role(o.restaurant_id, array['owner', 'admin', 'staff', 'kitchen'])
    )
  );

-- Menu management + settings: owner/admin only.
drop policy if exists "categories_manager_all" on public.categories;
create policy "categories_manager_all"
  on public.categories
  for all
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  )
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );

drop policy if exists "products_manager_all" on public.products;
create policy "products_manager_all"
  on public.products
  for all
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  )
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );

drop policy if exists "order_sources_manager_all" on public.order_sources;
create policy "order_sources_manager_all"
  on public.order_sources
  for all
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  )
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );

drop policy if exists "restaurant_settings_manager_all" on public.restaurant_settings;
create policy "restaurant_settings_manager_all"
  on public.restaurant_settings
  for all
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  )
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );

drop policy if exists "opening_hours_manager_all" on public.opening_hours;
create policy "opening_hours_manager_all"
  on public.opening_hours
  for all
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  )
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );
