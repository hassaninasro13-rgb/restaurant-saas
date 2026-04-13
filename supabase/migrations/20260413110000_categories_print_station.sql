-- Add print station routing per category for thermal ticket workflows.

alter table public.categories
  add column if not exists print_station text not null default 'kitchen_pizza'
  check (print_station in ('kitchen_pizza', 'kitchen_sandwich', 'bar', 'cashier'));

comment on column public.categories.print_station is
  'Ticket station routing: kitchen_pizza, kitchen_sandwich, bar, cashier';
