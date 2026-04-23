-- Simple daily opening window on restaurant row (public menu badge).
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS opening_time time DEFAULT '09:00:00',
  ADD COLUMN IF NOT EXISTS closing_time time DEFAULT '22:00:00',
  ADD COLUMN IF NOT EXISTS is_open_manually boolean DEFAULT true;

COMMENT ON COLUMN public.restaurants.opening_time IS 'Start of daily opening window for public badge.';
COMMENT ON COLUMN public.restaurants.closing_time IS 'End of daily opening window for public badge.';
COMMENT ON COLUMN public.restaurants.is_open_manually IS 'When false, public menu always shows closed; when true, badge follows opening_time/closing_time.';
