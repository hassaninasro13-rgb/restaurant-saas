-- Manual subscription revenue per restaurant (admin-maintained aggregate, e.g. bank transfers).
alter table public.restaurants
  add column if not exists manual_subscription_revenue numeric(14, 2) not null default 0;

comment on column public.restaurants.manual_subscription_revenue is 'Lifetime or cumulative manual subscription billing (DZD); editable by platform admins only';

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
      new.manual_subscription_revenue := 0;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not is_admin then
      new.subscription_plan := old.subscription_plan;
      new.subscription_expires_at := old.subscription_expires_at;
      new.is_active := old.is_active;
      new.manual_subscription_revenue := old.manual_subscription_revenue;
    end if;
    return new;
  end if;

  return new;
end;
$$;
