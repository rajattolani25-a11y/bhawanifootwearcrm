CREATE POLICY "Members read product images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND public.is_member(auth.uid()));

CREATE POLICY "Owner uploads product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owner updates product images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'owner'))
WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owner deletes product images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'owner'));
