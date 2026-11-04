-- Definitions only. Preserves all existing products, stock and printed scan codes.
BEGIN;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS label_code text;
CREATE UNIQUE INDEX IF NOT EXISTS variant_label_code_unique ON public.product_variants(label_code) WHERE label_code IS NOT NULL;
CREATE OR REPLACE FUNCTION public.ensure_variant_label_code(_variant_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.product_variants%ROWTYPE; candidate text;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO v FROM public.product_variants WHERE id=_variant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Size not found'; END IF;
 IF nullif(v.label_code,'') IS NOT NULL THEN RETURN v.label_code; END IF;
 PERFORM pg_advisory_xact_lock(35001);
 LOOP
  candidate:='SS'||lpad((floor(random()*10000000000)::bigint)::text,10,'0');
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.product_variants WHERE barcode=candidate OR sku=candidate OR label_code=candidate);
 END LOOP;
 UPDATE public.product_variants SET label_code=candidate WHERE id=v.id;
 RETURN candidate;
END $$;
REVOKE ALL ON FUNCTION public.ensure_variant_label_code(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_variant_label_code(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.ensure_variant_code(_variant_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE code text;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT coalesce(nullif(barcode,''),nullif(sku,'')) INTO code FROM public.product_variants WHERE id=_variant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Size not found'; END IF;
 IF code IS NULL THEN
  code:=public.ensure_variant_label_code(_variant_id);
  UPDATE public.product_variants SET barcode=code WHERE id=_variant_id;
 END IF;
 RETURN code;
END $$;
CREATE OR REPLACE FUNCTION public.adjust_inventory(_variant_id uuid,_expected_stock integer,_expected_damaged integer,
 _stock integer DEFAULT NULL,_min integer DEFAULT NULL,_rack text DEFAULT NULL,_disposition text DEFAULT NULL,_reason text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.product_variants%ROWTYPE; p public.products%ROWTYPE; delta integer:=0;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT * INTO v FROM public.product_variants WHERE id=_variant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Size not found'; END IF;
 IF v.stock IS DISTINCT FROM _expected_stock OR v.damaged_stock IS DISTINCT FROM _expected_damaged THEN RAISE EXCEPTION 'Stock changed. Reload inventory before saving.'; END IF;
 IF _stock IS NOT NULL AND (_stock<0 OR _stock>1000000) OR _min IS NOT NULL AND (_min<0 OR _min>1000000) OR length(coalesce(_rack,''))>80 THEN RAISE EXCEPTION 'Invalid stock, minimum or rack'; END IF;
 IF _disposition IS NOT NULL AND _disposition NOT IN ('supplier','writeoff') THEN RAISE EXCEPTION 'Choose damaged stock disposition'; END IF;
 delta:=coalesce(_stock,v.stock)-v.stock;
 IF delta<>0 OR _disposition IS NOT NULL THEN
  IF length(btrim(coalesce(_reason,'')))<3 OR length(_reason)>300 THEN RAISE EXCEPTION 'Enter a reason (3 to 300 characters)'; END IF;
 END IF;
 SELECT * INTO p FROM public.products WHERE id=v.product_id;
 UPDATE public.product_variants SET stock=coalesce(_stock,v.stock),min_stock=coalesce(_min,v.min_stock),rack=coalesce(_rack,v.rack),
  damaged_stock=CASE WHEN _disposition IS NULL THEN v.damaged_stock ELSE 0 END WHERE id=v.id;
 IF delta<>0 THEN
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,qty_out,note,user_id)
  VALUES('ADJUST',v.id,p.brand||' '||p.article||' ('||v.size||')',greatest(delta,0),greatest(-delta,0),btrim(_reason),auth.uid());
 END IF;
 IF _disposition IS NOT NULL AND v.damaged_stock>0 THEN
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_out,note,user_id)
  VALUES(CASE WHEN _disposition='supplier' THEN 'DAMAGE-SUPPLIER' ELSE 'DAMAGE-WRITEOFF' END,v.id,p.brand||' '||p.article||' ('||v.size||')',v.damaged_stock,btrim(_reason),auth.uid());
 END IF;
 RETURN jsonb_build_object('stock',coalesce(_stock,v.stock),'damaged',CASE WHEN _disposition IS NULL THEN v.damaged_stock ELSE 0 END);
END $$;
REVOKE ALL ON FUNCTION public.adjust_inventory(uuid,integer,integer,integer,integer,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid,integer,integer,integer,integer,text,text,text) TO authenticated;
-- Quantity writes are RPC-only, including owner browser sessions.
REVOKE UPDATE ON public.product_variants FROM authenticated;
GRANT UPDATE(rack,min_stock) ON public.product_variants TO authenticated;
CREATE OR REPLACE FUNCTION public.quick_add_product(_product jsonb,_sizes jsonb,_cost numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pid uuid; vid uuid; s jsonb; q integer; sz text; result jsonb:='[]'; nm text:=btrim(_product->>'article');
 v_brand text:=upper(btrim(coalesce(_product->>'brand',''))); colour text:=btrim(coalesce(_product->>'color','')); existing boolean:=false; matches integer;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF coalesce(nm,'')='' OR length(nm)>150 OR length(v_brand)>80 OR length(colour)>80 OR jsonb_typeof(_sizes)<>'array' OR jsonb_array_length(_sizes) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Enter valid article and sizes'; END IF;
 IF coalesce((_product->>'selling_price')::numeric,0)<=0 OR (_product->>'selling_price')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a valid selling price'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(lower(v_brand)||'|'||lower(nm)||'|'||lower(colour),35));
 SELECT count(*),min(id::text)::uuid INTO matches,pid FROM public.products WHERE lower(btrim(products.brand))=lower(v_brand) AND lower(btrim(article))=lower(nm) AND lower(btrim(coalesce(color,'')))=lower(colour);
 IF matches>1 THEN RAISE EXCEPTION 'Multiple matching articles exist. Open the exact product to receive stock.'; END IF;
 existing:=pid IS NOT NULL;
 IF existing THEN
  PERFORM 1 FROM public.products WHERE id=pid AND status='Active' AND selling_price=(_product->>'selling_price')::numeric FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Existing article is archived or its price differs. Open Products to review it before adding stock.'; END IF;
 ELSE
  INSERT INTO public.products(brand,article,category,color,mrp,selling_price)
  VALUES(v_brand,nm,coalesce(_product->>'category',''),colour,greatest(coalesce((_product->>'mrp')::numeric,0),(_product->>'selling_price')::numeric),(_product->>'selling_price')::numeric) RETURNING id INTO pid;
 END IF;
 IF _cost IS NOT NULL AND (_cost<0 OR _cost::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'Invalid purchase cost'; END IF;
 IF _cost>0 AND public.has_role(auth.uid(),'owner') THEN
  INSERT INTO public.product_costs(product_id,purchase_price)VALUES(pid,_cost)ON CONFLICT(product_id)DO UPDATE SET purchase_price=excluded.purchase_price;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_sizes) x GROUP BY btrim(x->>'size') HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate size'; END IF;
 FOR s IN SELECT * FROM jsonb_array_elements(_sizes) LOOP
  sz:=btrim(s->>'size');q:=coalesce((s->>'qty')::integer,0);
  IF coalesce(sz,'')='' OR length(sz)>20 OR q NOT BETWEEN 0 AND 999 THEN RAISE EXCEPTION 'Invalid size or quantity'; END IF;
  SELECT id INTO vid FROM public.product_variants WHERE product_id=pid AND size=sz FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.product_variants(product_id,size,stock,rack)VALUES(pid,sz,q,coalesce(_product->>'rack',''))RETURNING id INTO vid;
  ELSE UPDATE public.product_variants SET stock=stock+q WHERE id=vid; END IF;
  PERFORM public.ensure_variant_code(vid);
  IF q>0 THEN INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id)VALUES('QUICK-ADD',vid,v_brand||' '||nm||' ('||sz||')',q,'Quick add',auth.uid()); END IF;
  result:=result||jsonb_build_object('id',vid,'size',sz);
 END LOOP;
 RETURN jsonb_build_object('product_id',pid,'variants',result,'existing',existing);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
