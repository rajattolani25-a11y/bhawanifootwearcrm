-- Owner size editing; applying this definition never edits product stock.
BEGIN;
CREATE OR REPLACE FUNCTION public.edit_product_variant(_product_id uuid,_variant_id uuid,_size text,_stock integer,_expected_stock integer DEFAULT NULL,_remove boolean DEFAULT false,_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.product_variants%ROWTYPE; p public.products%ROWTYPE; vid uuid; used boolean; delta integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT * INTO p FROM public.products WHERE id=_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _remove IS NULL OR _stock IS NULL OR _stock<0 OR _stock>1000000 THEN RAISE EXCEPTION 'Invalid stock quantity'; END IF;
 IF nullif(trim(_size),'') IS NULL OR length(trim(_size))>20 THEN RAISE EXCEPTION 'Enter a size up to 20 characters'; END IF;
 IF _variant_id IS NULL THEN
  IF _remove THEN RAISE EXCEPTION 'Choose an existing size'; END IF;
  vid:=gen_random_uuid();
  INSERT INTO public.product_variants(id,product_id,size,stock,barcode) VALUES(vid,p.id,trim(_size),_stock,'BF'||replace(vid::text,'-',''));
  delta:=_stock;
 ELSE
  SELECT * INTO v FROM public.product_variants WHERE id=_variant_id AND product_id=p.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Size not found'; END IF;
  IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
  IF _expected_stock IS DISTINCT FROM v.stock THEN RAISE EXCEPTION 'Stock changed. Reload sizes before saving.'; END IF;
  used:=EXISTS(SELECT 1 FROM public.sale_items WHERE variant_id=v.id) OR EXISTS(SELECT 1 FROM public.purchases WHERE variant_id=v.id) OR EXISTS(SELECT 1 FROM public.catalog_bookings WHERE variant_id=v.id) OR EXISTS(SELECT 1 FROM public.sale_returns WHERE variant_id=v.id OR replacement_variant_id=v.id) OR EXISTS(SELECT 1 FROM public.stock_movements WHERE variant_id=v.id);
  IF _remove OR trim(_size)<>v.size THEN
   IF used OR v.stock<>0 OR v.damaged_stock<>0 THEN RAISE EXCEPTION 'This size has stock or history. Keep it unchanged and add a new size instead.'; END IF;
  END IF;
  IF _remove THEN DELETE FROM public.product_variants WHERE id=v.id AND product_id=p.id;RETURN jsonb_build_object('removed',true); END IF;
  vid:=v.id;delta:=_stock-v.stock;
  UPDATE public.product_variants SET size=trim(_size),stock=_stock WHERE id=vid;
 END IF;
 IF delta<>0 THEN
  IF length(trim(coalesce(_reason,'')))<3 OR length(_reason)>300 THEN RAISE EXCEPTION 'Enter a stock adjustment reason (3 to 300 characters)'; END IF;
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,qty_out,note,user_id) VALUES('OWNER-EDIT',vid,p.brand||' '||p.article||' ('||trim(_size)||')',greatest(delta,0),greatest(-delta,0),trim(_reason),auth.uid());
 END IF;
 PERFORM public.ensure_variant_code(vid);
 RETURN jsonb_build_object('id',vid,'size',trim(_size),'stock',_stock);
END $$;
REVOKE ALL ON FUNCTION public.edit_product_variant(uuid,uuid,text,integer,integer,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_product_variant(uuid,uuid,text,integer,integer,boolean,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT to_regprocedure('public.edit_product_variant(uuid,uuid,text,integer,integer,boolean,text)') IS NOT NULL AS size_editor_ready;
