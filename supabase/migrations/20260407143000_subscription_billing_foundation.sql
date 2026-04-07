-- Billing-ready subscription foundation:
-- - normalized statuses: trial, active, expired, canceled, pending
-- - billing provider column for future Stripe/Paddle hooks
-- - free trial expiry defaults and status sync behavior

alter table public.subscriptions
  add column if not exists billing_provider text;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('trial', 'active', 'expired', 'canceled', 'pending'));

alter table public.subscriptions drop constraint if exists subscriptions_billing_provider_check;
alter table public.subscriptions
  add constraint subscriptions_billing_provider_check
  check (billing_provider is null or billing_provider in ('stripe', 'paddle'));

comment on column public.subscriptions.billing_provider is 'External billing provider identifier (stripe|paddle|null).';

-- Normalize legacy values.
update public.subscriptions
set status = case status
  when 'trialing' then 'trial'
  when 'cancelled' then 'canceled'
  when 'past_due' then 'pending'
  else status
end;

-- Ensure free plans behave as trial by default.
update public.subscriptions s
set
  end_date = coalesce(s.end_date, s.start_date + interval '14 days'),
  status = case
    when coalesce(s.end_date, s.start_date + interval '14 days') <= now() then 'expired'
    else 'trial'
  end,
  updated_at = now()
from public.plans p
where s.plan_id = p.id
  and p.slug = 'free'
  and s.status in ('active', 'pending', 'trial');

-- Respect end_date for all active/trial/canceled subscriptions.
update public.subscriptions
set status = 'expired', updated_at = now()
where end_date is not null
  and end_date <= now()
  and status in ('active', 'trial', 'canceled');

-- New restaurant -> default subscription row
create or replace function public.ensure_default_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  plan_slug text;
  st text;
  st_start timestamptz;
  st_end timestamptz;
begin
  st_start := coalesce(new.created_at::timestamptz, now());
  plan_slug := coalesce(nullif(trim(new.subscription_plan), ''), 'free');

  select pl.id into pid from public.plans pl where pl.slug = plan_slug limit 1;
  if pid is null then
    plan_slug := 'free';
    select id into pid from public.plans where slug = 'free' limit 1;
  end if;

  if plan_slug = 'free' then
    st_end := coalesce(new.subscription_expires_at, st_start + interval '14 days');
    st := case when st_end <= now() then 'expired' else 'trial' end;
  else
    st_end := new.subscription_expires_at;
    if st_end is null then
      st := 'pending';
    elsif st_end <= now() then
      st := 'expired';
    else
      st := 'active';
    end if;
  end if;

  insert into public.subscriptions (restaurant_id, plan_id, status, start_date, end_date, billing_provider)
  values (new.id, pid, st, st_start, st_end, null)
  on conflict (restaurant_id) do nothing;
  return new;
end;
$$;

-- Sync restaurants denormalized fields -> subscriptions
create or replace function public.sync_subscriptions_from_restaurants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  plan_slug text;
  st text;
  st_start timestamptz;
  st_end timestamptz;
begin
  if tg_op <> 'update' then
    return new;
  end if;
  if old.subscription_plan is not distinct from new.subscription_plan
     and old.subscription_expires_at is not distinct from new.subscription_expires_at then
    return new;
  end if;

  st_start := coalesce(new.created_at::timestamptz, now());
  plan_slug := coalesce(nullif(trim(new.subscription_plan), ''), 'free');

  select pl.id into pid from public.plans pl where pl.slug = plan_slug limit 1;
  if pid is null then
    plan_slug := 'free';
    select id into pid from public.plans where slug = 'free' limit 1;
  end if;

  if plan_slug = 'free' then
    st_end := coalesce(new.subscription_expires_at, st_start + interval '14 days');
    st := case when st_end <= now() then 'expired' else 'trial' end;
  else
    st_end := new.subscription_expires_at;
    if st_end is null then
      st := 'pending';
    elsif st_end <= now() then
      st := 'expired';
    else
      st := 'active';
    end if;
  end if;

  insert into public.subscriptions (restaurant_id, plan_id, status, start_date, end_date, updated_at, billing_provider)
  values (new.id, pid, st, st_start, st_end, now(), null)
  on conflict (restaurant_id) do update set
    plan_id = excluded.plan_id,
    end_date = excluded.end_date,
    status = excluded.status,
    updated_at = now();
  return new;
end;
$$;
