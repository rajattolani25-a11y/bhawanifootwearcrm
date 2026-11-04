-- Part 3. Source: 0036_receipts_and_retry_safety.sql. No reset/import/sale is executed.
BEGIN;
CREATE OR REPLACE FUNCTION public.receive_stock_v2(_supplier_id uuid,_supplier_name text,_invoice text,_items jsonb,_request_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h text; oldhash text; qty integer:=0; it jsonb; v record; q integer; price numeric; gst numeric; sample boolean;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _request_id IS NULL THEN RAISE EXCEPTION 'A receipt request identifier is required'; END IF;
 h:=md5(jsonb_build_array(_supplier_id,_supplier_name,_invoice,_items,auth.uid())::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,36));
 IF EXISTS(SELECT 1 FROM public.stock_movements WHERE operation_id=_request_id AND type='OP-ABANDONED') THEN RAISE EXCEPTION 'This request was closed by the Owner. Check transaction history.';END IF;
 SELECT request_hash INTO oldhash FROM public.purchases WHERE operation_id=_request_id LIMIT 1;
 IF FOUND THEN
  IF oldhash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Receipt retry differs from original request'; END IF;
  SELECT sum(quantity)::integer INTO qty FROM public.purchases WHERE operation_id=_request_id;
  RETURN qty;
 END IF;
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Add valid stock lines'; END IF;
 PERFORM 1 FROM public.product_variants WHERE id IN (SELECT (x->>'variant_id')::uuid FROM jsonb_array_elements(_items)x) ORDER BY id FOR UPDATE;
 FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
  q:=(it->>'qty')::integer;price:=(it->>'price')::numeric;gst:=coalesce((it->>'gst_rate')::numeric,0);sample:=coalesce((it->>'free_sample')::boolean,false);
  IF q IS NULL OR q NOT BETWEEN 1 AND 1000000 OR price IS NULL OR price<0 OR price::text IN ('NaN','Infinity','-Infinity') OR gst::text IN ('NaN','Infinity','-Infinity') OR gst NOT BETWEEN 0 AND 28 OR (price=0 AND NOT sample) OR (sample AND price<>0) THEN RAISE EXCEPTION 'Enter valid quantity/cost/tax or mark zero-cost sample'; END IF;
  SELECT pv.*,p.brand,p.article INTO v FROM public.product_variants pv JOIN public.products p ON p.id=pv.product_id WHERE pv.id=(it->>'variant_id')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Size not found'; END IF;
  UPDATE public.product_variants SET stock=stock+q WHERE id=v.id;
  INSERT INTO public.purchases(supplier_id,supplier_name,invoice_no,variant_id,quantity,purchase_price,gst_rate,gst_amount,total,paid_amount,free_sample,operation_id,request_hash)
  VALUES(_supplier_id,coalesce(_supplier_name,''),coalesce(_invoice,''),v.id,q,price,gst,round(price*q*gst/100,2),round(price*q*(1+gst/100),2),0,sample,_request_id,h);
  IF price>0 THEN INSERT INTO public.product_costs(product_id,purchase_price)VALUES(v.product_id,price)ON CONFLICT(product_id)DO UPDATE SET purchase_price=excluded.purchase_price; END IF;
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id)VALUES('PURCHASE',v.id,v.brand||' '||v.article||' ('||v.size||')',q,coalesce(_invoice,''),auth.uid());
  qty:=qty+q;
 END LOOP;
 RETURN qty;
END $$;
REVOKE ALL ON FUNCTION public.receive_stock_v2(uuid,text,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_stock_v2(uuid,text,text,jsonb,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.receive_stock(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT true AS part_03_applied;
