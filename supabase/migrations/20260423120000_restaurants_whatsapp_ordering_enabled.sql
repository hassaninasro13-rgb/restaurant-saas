-- Allow restaurant owners to disable WhatsApp-based checkout on the public menu.
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS whatsapp_ordering_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.restaurants.whatsapp_ordering_enabled IS 'When false, public menu hides WhatsApp checkout.';
