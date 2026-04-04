-- Restaurant subscriptions (Free / Pro) + platform admins who can edit plans.
-- After apply: INSERT your admin email, e.g.:
--   insert into public.platform_admins (email) values ('you@yourdomain.com');

alter table public.restaurants
  add column if not exists subscription_plan text not null default 'free';

alter table public.restaurants
  drop constraint if exists restaurants_subscription_plan_check;

alter table public.restaurants
  add constraint restaurants_subscription_plan_check
  check (subscription_plan in ('free', 'pro'));

alter table public.restaurants
  add column if not exists subscription_expires_at timestamptz;

comment on column public.restaurants.subscription_plan is 'free | pro';
comment on column public.restaurants.subscription_expires_at is 'NULL = no end date; menu requires expires_at > now() when set';

-- ── Platform admins (matched to auth.jwt() ->> ''email'', case-insensitive) ──
create table if not exists public.platform_admins (
  email text primary key
);

alter table public.platform_admins enable row level security;

drop policy if exists "platform_admins_select_own" on public.platform_admins;
create policy "platform_admins_select_own"
  on public.platform_admins
  for select
  to authenticated
  using (
    lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );

-- ── Triggers: only platform admins may set subscription_plan / subscription_expires_at ──
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
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_restaurants_guard_subscription on public.restaurants;
create trigger tr_restaurants_guard_subscription
  before insert or update on public.restaurants
  for each row
  execute function public.restaurants_guard_subscription_columns();

-- ── RLS: admins may read/update all restaurants (alongside your existing owner policies) ──
drop policy if exists "platform_admin_select_restaurants" on public.restaurants;
create policy "platform_admin_select_restaurants"
  on public.restaurants
  for select
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins pa
      where lower(trim(pa.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

drop policy if exists "platform_admin_update_restaurants" on public.restaurants;
create policy "platform_admin_update_restaurants"
  on public.restaurants
  for update
  to authenticated
  using (
    exists (
      select 1 from public.platform_admins pa
      where lower(trim(pa.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  )
  with check (
    exists (
      select 1 from public.platform_admins pa
      where lower(trim(pa.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

-- ── Optional: enforce subscription at the database for anon reads ──
-- If you already use a permissive anon SELECT on restaurants, add this RESTRICTIVE policy
-- so expired rows are hidden (restrictive policies are AND-combined with permissive ones):
--
-- create policy restaurants_anon_subscription_current
--   on public.restaurants for select to anon
--   as restrictive
--   using (subscription_expires_at is null or subscription_expires_at > now());
