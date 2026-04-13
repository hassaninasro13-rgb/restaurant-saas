-- Ingredients + product↔ingredient links (dashboard stock).

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  unit text not null,
  quantity numeric not null default 0,
  alert_quantity numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint ingredients_unit_check check (unit in ('g', 'ml', 'piece')),
  constraint ingredients_quantity_nonneg check (quantity >= 0),
  constraint ingredients_alert_nonneg check (alert_quantity >= 0)
);

create index if not exists ingredients_restaurant_id_idx
  on public.ingredients (restaurant_id);

comment on table public.ingredients is 'Stock ingredients per restaurant (grams, ml, or units).';
comment on column public.ingredients.alert_quantity is 'Alert when quantity falls to this level or below (e.g. 20% of usual stock).';

create table if not exists public.product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  quantity_needed numeric not null,
  constraint product_ingredients_qty_positive check (quantity_needed > 0),
  constraint product_ingredients_product_ingredient_unique unique (product_id, ingredient_id)
);

create index if not exists product_ingredients_product_id_idx
  on public.product_ingredients (product_id);

create index if not exists product_ingredients_ingredient_id_idx
  on public.product_ingredients (ingredient_id);

comment on table public.product_ingredients is 'How much of each ingredient one order of a product consumes.';
comment on column public.product_ingredients.quantity_needed is 'Amount per order, in the ingredient unit (g, ml, piece).';

create or replace function public.product_ingredients_same_restaurant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  pr uuid;
  ir uuid;
begin
  select p.restaurant_id into pr from public.products p where p.id = new.product_id;
  select i.restaurant_id into ir from public.ingredients i where i.id = new.ingredient_id;
  if pr is null or ir is null or pr <> ir then
    raise exception 'product and ingredient must belong to the same restaurant';
  end if;
  return new;
end;
$$;

drop trigger if exists tr_product_ingredients_same_restaurant on public.product_ingredients;
create trigger tr_product_ingredients_same_restaurant
  before insert or update on public.product_ingredients
  for each row
  execute function public.product_ingredients_same_restaurant();

alter table public.ingredients enable row level security;
alter table public.product_ingredients enable row level security;

grant select, insert, update, delete on public.ingredients to authenticated;
grant select, insert, update, delete on public.product_ingredients to authenticated;

drop policy if exists "ingredients_manager_all" on public.ingredients;
create policy "ingredients_manager_all"
  on public.ingredients
  for all
  to authenticated
  using (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  )
  with check (
    public.has_restaurant_role(restaurant_id, array['owner', 'admin'])
  );

drop policy if exists "product_ingredients_manager_all" on public.product_ingredients;
create policy "product_ingredients_manager_all"
  on public.product_ingredients
  for all
  to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_ingredients.product_id
        and public.has_restaurant_role(p.restaurant_id, array['owner', 'admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      inner join public.ingredients i on i.id = product_ingredients.ingredient_id
      where p.id = product_ingredients.product_id
        and i.restaurant_id = p.restaurant_id
        and public.has_restaurant_role(p.restaurant_id, array['owner', 'admin'])
    )
  );
