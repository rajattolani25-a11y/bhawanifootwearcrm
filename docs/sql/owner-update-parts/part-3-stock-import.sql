-- PART 3 OF 5. Run after Part 2.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.process_sale_return(uuid,uuid,integer,boolean,text,text,text,uuid,uuid)') IS NULL THEN RAISE EXCEPTION 'Run Parts 1 and 2 first'; END IF;
END $$;
-- Owner-only transactional CSV import. Omitted/blank identifiers are preserved.
CREATE OR REPLACE FUNCTION public.import_stock_csv(_rows jsonb,_mode text,_preview boolean DEFAULT true,_operation_id uuid DEFAULT NULL,_expected jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; pid uuid; v public.product_variants%ROWTYPE; b text; a text; sz text; q integer; delta integer; oldqty integer; nextqty integer; cost numeric; count_match integer; numeric_key text; n integer:=0; plan jsonb:='[]'; request_hash text; previous_note jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _mode IS NULL OR _mode NOT IN ('add','replace') OR _preview IS NULL THEN RAISE EXCEPTION 'Choose add or replace stock'; END IF;
 IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows)=0 OR jsonb_array_length(_rows)>2000 THEN RAISE EXCEPTION 'Import 1 to 2000 size rows at a time'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_rows) x GROUP BY lower(trim(coalesce(x->>'brand',''))),lower(trim(coalesce(x->>'article',''))),trim(coalesce(x->>'size','')) HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate article/size in CSV; combine the rows first'; END IF;
 PERFORM pg_advisory_xact_lock(320032);
 request_hash:=md5(jsonb_build_object('rows',_rows,'mode',_mode,'expected',_expected)::text);
 IF _expected IS NOT NULL AND (jsonb_typeof(_expected)<>'array' OR jsonb_array_length(_expected)<>jsonb_array_length(_rows)) THEN RAISE EXCEPTION 'Invalid stock preview'; END IF;
 IF NOT _preview THEN
  IF _operation_id IS NULL THEN RAISE EXCEPTION 'Import request identifier required'; END IF;
  SELECT note::jsonb INTO previous_note FROM public.stock_movements WHERE id=_operation_id AND type='CSV-IMPORT';
  IF FOUND THEN
   IF previous_note->>'hash' IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'Import request does not match previous operation'; END IF;
   RETURN jsonb_build_object('rows',(previous_note->>'rows')::integer,'mode',_mode,'preview',false,'plan','[]'::jsonb,'replayed',true);
  END IF;
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
  b:=upper(trim(coalesce(r->>'brand',''))); a:=trim(coalesce(r->>'article','')); sz:=trim(coalesce(r->>'size',''));
  IF a='' OR sz='' OR coalesce(r->>'qty','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Every row needs article, size and a whole non-negative qty'; END IF;
  q:=(r->>'qty')::integer; IF q>1000000 THEN RAISE EXCEPTION 'Quantity too large'; END IF;
  FOREACH numeric_key IN ARRAY ARRAY['cost','mrp','selling_price','price'] LOOP
   IF nullif(trim(r->>numeric_key),'') IS NOT NULL AND trim(r->>numeric_key) !~ '^[0-9]+([.][0-9]{1,2})?$' THEN RAISE EXCEPTION 'CSV % must be a non-negative amount with at most two decimals',numeric_key; END IF;
  END LOOP;
  IF (coalesce(nullif(trim(r->>'cost'),''),'0'))::numeric<0 OR (coalesce(nullif(trim(r->>'mrp'),''),'0'))::numeric<0 OR (coalesce(nullif(trim(coalesce(nullif(trim(r->>'selling_price'),''),nullif(trim(r->>'price'),''))),''),'0'))::numeric<0 THEN RAISE EXCEPTION 'Prices and cost cannot be negative'; END IF;
  SELECT count(*),min(id::text)::uuid INTO count_match,pid FROM public.products WHERE lower(trim(brand))=lower(b) AND lower(trim(article))=lower(a);
  IF count_match>1 THEN RAISE EXCEPTION 'Ambiguous article: % %. Resolve duplicate products first.',b,a; END IF;
  IF pid IS NULL AND NOT _preview THEN
   INSERT INTO public.products(brand,article,category,color,mrp,selling_price) VALUES(b,a,coalesce(r->>'category',''),coalesce(r->>'color',''),coalesce(nullif(r->>'mrp','')::numeric,0),coalesce(nullif(coalesce(nullif(trim(r->>'selling_price'),''),nullif(trim(r->>'price'),'')),'')::numeric,nullif(r->>'mrp','')::numeric,0)) RETURNING id INTO pid;
  END IF;
  SELECT * INTO v FROM public.product_variants WHERE product_id=pid AND size=sz FOR UPDATE;
  oldqty:=coalesce(v.stock,0);
  IF NOT _preview AND _expected IS NOT NULL AND ((nullif(_expected->n->>'variant_id','')::uuid IS DISTINCT FROM v.id) OR (_expected->n->>'before')::integer IS DISTINCT FROM oldqty) THEN RAISE EXCEPTION 'Stock changed since preview. Validate and preview the CSV again.'; END IF;
  nextqty:=CASE WHEN _mode='add' THEN oldqty+q ELSE q END;delta:=nextqty-oldqty;
  IF NOT _preview THEN
   IF v.id IS NULL THEN
    INSERT INTO public.product_variants(product_id,size,stock,barcode,sku,rack) VALUES(pid,sz,nextqty,nullif(trim(r->>'barcode'),''),nullif(trim(r->>'sku'),''),coalesce(r->>'rack','')) RETURNING * INTO v;
   ELSE
    UPDATE public.product_variants SET stock=nextqty,barcode=coalesce(nullif(trim(r->>'barcode'),''),barcode),sku=coalesce(nullif(trim(r->>'sku'),''),sku),rack=coalesce(nullif(trim(r->>'rack'),''),rack) WHERE id=v.id;
   END IF;
   PERFORM public.ensure_variant_code(v.id);
   IF delta<>0 THEN INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,qty_out,note,user_id) VALUES('CSV-'||upper(_mode),v.id,b||' '||a||' ('||sz||')',greatest(delta,0),greatest(-delta,0),'Owner-confirmed CSV stock import',auth.uid()); END IF;
   cost:=nullif(trim(r->>'cost'),'')::numeric;
   IF cost IS NOT NULL THEN INSERT INTO public.product_costs(product_id,purchase_price) VALUES(pid,cost) ON CONFLICT(product_id) DO UPDATE SET purchase_price=excluded.purchase_price; END IF;
  END IF;
  plan:=plan||jsonb_build_object('brand',b,'article',a,'size',sz,'variant_id',v.id,'before',oldqty,'after',nextqty,'delta',delta,'new_product',count_match=0);
  n:=n+1;
 END LOOP;
 IF NOT _preview THEN INSERT INTO public.stock_movements(id,type,product_name,note,user_id) VALUES(_operation_id,'CSV-IMPORT','CSV stock import',jsonb_build_object('hash',request_hash,'rows',n,'mode',_mode)::text,auth.uid()); END IF;
 RETURN jsonb_build_object('rows',n,'mode',_mode,'preview',_preview,'plan',plan);
END $$;
REVOKE ALL ON FUNCTION public.import_stock_csv(jsonb,text,boolean,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_stock_csv(jsonb,text,boolean,uuid,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.retail_integrity_version() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 32 $$;
REVOKE ALL ON FUNCTION public.retail_integrity_version() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.retail_integrity_version() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- All results should be true. This query does not execute an import or return.
SELECT public.retail_integrity_version()=32 AS update_ready,
 NOT has_column_privilege('authenticated','public.sale_returns','cost_reversal','SELECT') AS private_return_cost_protected,
 to_regprocedure('public.process_sale_return(uuid,uuid,integer,boolean,text,text,text,uuid,uuid)') IS NOT NULL AS linked_exchange_ready,
 to_regprocedure('public.import_stock_csv(jsonb,text,boolean,uuid,jsonb)') IS NOT NULL AS safe_csv_ready;
