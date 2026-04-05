-- Product visibility on public menu (separate from is_available / "in stock").
-- Apply after your base `products` table exists.

alter table public.products
  add column if not exists is_visible boolean not null default true;

comment on column public.products.is_visible is 'If false, hidden from public menu; owner can still manage in dashboard';
