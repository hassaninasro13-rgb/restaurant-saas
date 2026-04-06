-- Denormalized snapshot of order_sources.type on each order (reports, kitchen, history).
alter table public.orders
  add column if not exists source_type text;

comment on column public.orders.source_type is 'Snapshot of order_sources.type at checkout (table|takeaway|counter|delivery|door)';

-- Optional channel "door" (retrait porte / drive) — extend check if present.
alter table public.order_sources drop constraint if exists order_sources_type_check;
alter table public.order_sources add constraint order_sources_type_check
  check (type in ('table', 'takeaway', 'counter', 'delivery', 'door'));
