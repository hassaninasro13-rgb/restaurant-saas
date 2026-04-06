-- SaaS plans + per-restaurant subscriptions (limits + billing dates).
-- Keeps restaurants.subscription_plan + subscription_expires_at in sync for anon/public menu reads.

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  max_products int not null check (max_products >= 0),
  max_orders_per_month int not null check (max_orders_per_month >= 0),
  max_users int not null check (max_users >= 0),
  sort_order int not null default 0
);

comment on table public.plans is 'Product catalog plans with usage limits';

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null default 'active',
  start_date timestamptz not null default now(),
  end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id),
  constraint subscriptions_status_check check (
    status in ('active', 'trialing', 'past_due', 'cancelled', 'expired')
  )
);

create index if not exists subscriptions_plan_id_idx on public.subscriptions (plan_id);

comment on table public.subscriptions is 'One row per restaurant; plan limits via public.plans';

-- Widen legacy restaurant.plan enum to match plan slugs
alter table public.restaurants drop constraint if exists restaurants_subscription_plan_check;
alter table public.restaurants
  add constraint restaurants_subscription_plan_check
  check (subscription_plan in ('free', 'basic', 'pro', 'enterprise'));

comment on column public.restaurants.subscription_plan is 'Denormalized plan slug; synced with public.subscriptions';

-- Seed plans (large numbers = effectively unlimited for Enterprise)
insert into public.plans (slug, name, max_products, max_orders_per_month, max_users, sort_order)
values
  ('free', 'Free', 30, 150, 1, 0),
  ('basic', 'Basic', 150, 800, 2, 1),
  ('pro', 'Pro', 800, 5000, 5, 2),
  ('enterprise', 'Enterprise', 999999, 999999, 999999, 3)
on conflict (slug) do nothing;

-- Backfill subscriptions from existing restaurants
insert into public.subscriptions (restaurant_id, plan_id, status, start_date, end_date)
select
  r.id,
  p.id,
  case
    when r.subscription_expires_at is not null and r.subscription_expires_at <= now() then 'expired'
    else 'active'
  end,
  coalesce(r.created_at::timestamptz, now()),
  r.subscription_expires_at
from public.restaurants r
join public.plans p on p.slug = case lower(trim(coalesce(r.subscription_plan, 'free')))
  when 'pro' then 'pro'
  when 'basic' then 'basic'
  when 'enterprise' then 'enterprise'
  else 'free'
end
on conflict (restaurant_id) do nothing;

-- New restaurant → default subscription row (SECURITY DEFINER bypasses RLS)
create or replace function public.ensure_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  st text;
begin
  select pl.id into pid
  from public.plans pl
  where pl.slug = coalesce(nullif(trim(new.subscription_plan), ''), 'free')
  limit 1;
  if pid is null then
    select id into pid from public.plans where slug = 'free' limit 1;
  end if;
  st := case
    when new.subscription_expires_at is not null and new.subscription_expires_at <= now() then 'expired'
    else 'active'
  end;
  insert into public.subscriptions (restaurant_id, plan_id, status, start_date, end_date)
  values (new.id, pid, st, coalesce(new.created_at::timestamptz, now()), new.subscription_expires_at)
  on conflict (restaurant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists tr_restaurants_ensure_subscription on public.restaurants;
create trigger tr_restaurants_ensure_subscription
  after insert on public.restaurants
  for each row
  execute function public.ensure_default_subscription();

-- Admin (or system) updates restaurants.subscription_* → keep subscriptions in sync
create or replace function public.sync_subscriptions_from_restaurants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  st text;
begin
  if tg_op <> 'update' then
    return new;
  end if;
  if old.subscription_plan is not distinct from new.subscription_plan
     and old.subscription_expires_at is not distinct from new.subscription_expires_at then
    return new;
  end if;
  select pl.id into pid from public.plans pl where pl.slug = new.subscription_plan limit 1;
  if pid is null then
    select id into pid from public.plans where slug = 'free' limit 1;
  end if;
  st := case
    when new.subscription_expires_at is not null and new.subscription_expires_at <= now() then 'expired'
    else 'active'
  end;
  insert into public.subscriptions (restaurant_id, plan_id, status, start_date, end_date, updated_at)
  values (new.id, pid, st, coalesce(new.created_at::timestamptz, now()), new.subscription_expires_at, now())
  on conflict (restaurant_id) do update set
    plan_id = excluded.plan_id,
    end_date = excluded.end_date,
    status = excluded.status,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_restaurants_sync_subscription on public.restaurants;
create trigger tr_restaurants_sync_subscription
  after update of subscription_plan, subscription_expires_at on public.restaurants
  for each row
  execute function public.sync_subscriptions_from_restaurants();

-- RLS
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "plans_select_all" on public.plans;
create policy "plans_select_all"
  on public.plans for select
  using (true);

drop policy if exists "subscriptions_select_owner" on public.subscriptions;
create policy "subscriptions_select_owner"
  on public.subscriptions for select to authenticated
  using (
    exists (
      select 1 from public.restaurants r
      where r.id = subscriptions.restaurant_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "subscriptions_select_admin" on public.subscriptions;
create policy "subscriptions_select_admin"
  on public.subscriptions for select to authenticated
  using (
    exists (
      select 1 from public.platform_admins pa
      where lower(trim(pa.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

drop policy if exists "subscriptions_admin_all" on public.subscriptions;
create policy "subscriptions_admin_all"
  on public.subscriptions for all to authenticated
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
