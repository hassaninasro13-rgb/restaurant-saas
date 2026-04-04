-- Allow anonymous customers (public menu) to create orders and line items.
-- Apply in the Supabase SQL editor or via `supabase db push` if you use the CLI.
-- If policies with these names already exist, adjust or drop them first.

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

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
  );

-- Items must attach to an order created moments ago (same browser session flow).
drop policy if exists "anon_insert_order_items" on public.order_items;
create policy "anon_insert_order_items"
  on public.order_items
  for insert
  to anon
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.created_at > (now() - interval '15 minutes')
    )
  );

comment on policy "anon_insert_orders" on public.orders is 'Public menu checkout without login';
comment on policy "anon_insert_order_items" on public.order_items is 'Line items right after parent order insert';
