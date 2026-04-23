-- Optional welcome line on the public menu (restaurant header area).
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS welcome_message text DEFAULT '';

COMMENT ON COLUMN public.restaurants.welcome_message IS 'Short greeting shown on public menu; empty hides the banner.';
