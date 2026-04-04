-- is_active: only platform admins may change (owners keep their row active/inactive as set by admin).
-- Optional: ensure column exists (public menu already filters is_active = true in app queries).

alter table public.restaurants
  add column if not exists is_active boolean not null default true;

create or replace function public.restaurants_guard_subscription_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  jwt_email text;
begin
  jwt_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  select exists (
    select 1 from public.platform_admins pa
    where lower(trim(pa.email)) = jwt_email
  ) into is_admin;

  if tg_op = 'INSERT' then
    if not is_admin then
      new.subscription_plan := 'free';
      new.subscription_expires_at := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not is_admin then
      new.subscription_plan := old.subscription_plan;
      new.subscription_expires_at := old.subscription_expires_at;
      new.is_active := old.is_active;
    end if;
    return new;
  end if;

  return new;
end;
$$;

-- Admins can read all orders (e.g. counts per restaurant in admin panel).
drop policy if exists "platform_admin_select_orders" on public.orders;
create policy "platform_admin_select_orders"
  on public.orders
  for select
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins pa
      where lower(trim(pa.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );
