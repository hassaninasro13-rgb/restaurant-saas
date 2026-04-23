-- Per-day opening schedule for public menu (restaurant_hours).
CREATE TABLE IF NOT EXISTS public.restaurant_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_open boolean DEFAULT true NOT NULL,
  opening_time time DEFAULT '09:00',
  closing_time time DEFAULT '22:00'
);

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_hours_restaurant_day_uq
  ON public.restaurant_hours (restaurant_id, day_of_week);

-- Seed 7 rows for every existing restaurant
INSERT INTO public.restaurant_hours (restaurant_id, day_of_week, is_open, opening_time, closing_time)
SELECT r.id, s.i, true, '09:00'::time, '22:00'::time
FROM public.restaurants r
CROSS JOIN (VALUES (0), (1), (2), (3), (4), (5), (6)) AS s(i)
ON CONFLICT (restaurant_id, day_of_week) DO NOTHING;

ALTER TABLE public.restaurant_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS restaurant_hours_anon_select ON public.restaurant_hours;
CREATE POLICY restaurant_hours_anon_select
  ON public.restaurant_hours
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_hours.restaurant_id
        AND COALESCE(r.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS restaurant_hours_manager_all ON public.restaurant_hours;
CREATE POLICY restaurant_hours_manager_all
  ON public.restaurant_hours
  FOR ALL
  TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, ARRAY['owner'::text, 'admin'::text])
  );

-- New restaurants: default weekly template
CREATE OR REPLACE FUNCTION public.ensure_restaurant_hours_template()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.restaurant_hours (restaurant_id, day_of_week, is_open, opening_time, closing_time)
  SELECT NEW.id, s.i, true, '09:00'::time, '22:00'::time
  FROM (VALUES (0), (1), (2), (3), (4), (5), (6)) AS s(i)
  ON CONFLICT (restaurant_id, day_of_week) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ensure_restaurant_hours ON public.restaurants;
CREATE TRIGGER tr_ensure_restaurant_hours
  AFTER INSERT ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_restaurant_hours_template();
