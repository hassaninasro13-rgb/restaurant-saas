-- Public bucket for product photos (path: {restaurant_id}/{product_id}/{filename})
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Public read (menu + dashboard preview)
DROP POLICY IF EXISTS "product_images_public_select" ON storage.objects;
CREATE POLICY "product_images_public_select"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

-- Managers: upload / replace / delete only under restaurants they manage (first path segment = restaurant_id)
DROP POLICY IF EXISTS "product_images_manager_insert" ON storage.objects;
CREATE POLICY "product_images_manager_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (string_to_array(name, '/'))[1] ~ '^[0-9a-f-]{36}$'
    AND (string_to_array(name, '/'))[2] ~ '^[0-9a-f-]{36}$'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = ((string_to_array(name, '/'))[1])::uuid
        AND public.has_restaurant_role(r.id, ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "product_images_manager_update" ON storage.objects;
CREATE POLICY "product_images_manager_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = ((string_to_array(name, '/'))[1])::uuid
        AND public.has_restaurant_role(r.id, ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = ((string_to_array(name, '/'))[1])::uuid
        AND public.has_restaurant_role(r.id, ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "product_images_manager_delete" ON storage.objects;
CREATE POLICY "product_images_manager_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = ((string_to_array(name, '/'))[1])::uuid
        AND public.has_restaurant_role(r.id, ARRAY['owner'::text, 'admin'::text])
    )
  );
