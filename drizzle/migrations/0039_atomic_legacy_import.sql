-- Imports the supported offline JSON format atomically into an empty business.
-- Existing populated shops are never overwritten. Re-imports are no-ops.
BEGIN;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS operation_id uuid;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS operation_hash text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS operation_result jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS stock_operation_marker_unique ON public.stock_movements(operation_id)WHERE operation_id IS NOT NULL;
-- Private validator: malformed historic money aborts the whole import.
CREATE OR REPLACE FUNCTION public.check_legacy_money(_row jsonb,_keys text[])RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE k text; value numeric;
BEGIN
 FOREACH k IN ARRAY _keys LOOP
  IF nullif(_row->>k,'') IS NOT NULL THEN
   value:=(_row->>k)::numeric;
   IF value<0 OR value::text IN('NaN','Infinity','-Infinity') OR value<>round(value,2) THEN RAISE EXCEPTION'Invalid legacy amount: %',k;END IF;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.check_legacy_money(jsonb,text[])FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.import_legacy_store(_payload jsonb,_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h text:=md5(_payload::text); previous public.stock_movements%ROWTYPE; t text; occupied boolean; k text; x jsonb; it jsonb; config jsonb;
 pid uuid; vid uuid; cid uuid; sid uuid; saleid uuid; lineid uuid; variants jsonb:='{}'; customers_map jsonb:='{}'; suppliers_map jsonb:='{}';
 items jsonb; cost numeric; known boolean; subtotal numeric; qty integer; price numeric; total numeric; paid numeric; due numeric; result jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner')THEN RAISE EXCEPTION'Owner access required';END IF;
 IF _request_id IS NULL OR jsonb_typeof(_payload)<>'object'OR _payload?'format'OR _payload?'product_variants'OR jsonb_typeof(_payload->'products')<>'array'THEN RAISE EXCEPTION'This is not a supported legacy offline backup. Use verified restore for cloud backups.';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,36));
 IF EXISTS(SELECT 1 FROM public.stock_movements WHERE operation_id=_request_id AND type='OP-ABANDONED')THEN RAISE EXCEPTION'This request was closed by the Owner';END IF;
 PERFORM pg_advisory_xact_lock(39001);
 SELECT * INTO previous FROM public.stock_movements WHERE type='LEGACY-IMPORT'AND(operation_id=_request_id OR operation_hash=h)LIMIT 1;
 IF FOUND THEN IF previous.operation_hash IS DISTINCT FROM h THEN RAISE EXCEPTION'Import retry differs from the original';END IF;RETURN previous.operation_result||jsonb_build_object('replayed',true);END IF;
 FOR k,x IN SELECT * FROM jsonb_each(_payload)LOOP
  IF k NOT IN('products','customers','suppliers','sales','purchases','movements','settings')AND ((jsonb_typeof(x)='array'AND x<>'[]'::jsonb)OR(jsonb_typeof(x)='object'AND x<>'{}'::jsonb))THEN RAISE EXCEPTION'Legacy collection % needs a reviewed converter; nothing was imported',k;END IF;
  IF jsonb_typeof(x)='array'AND jsonb_array_length(x)>50000 THEN RAISE EXCEPTION'Legacy file is too large for this importer';END IF;
 END LOOP;
 FOREACH t IN ARRAY public.maintenance_business_tables()LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',t);
  IF t='stock_movements'THEN SELECT EXISTS(SELECT 1 FROM public.stock_movements WHERE type<>'OP-ABANDONED')INTO occupied;ELSE EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',t)INTO occupied;END IF;
  IF occupied THEN RAISE EXCEPTION'Legacy import requires an empty business. Existing records will not be overwritten.';END IF;
 END LOOP;
 config:=coalesce(_payload->'settings','{}');
 UPDATE public.store_settings SET business_name=coalesce(nullif(config->>'businessName',''),business_name),business_phone=coalesce(config->>'businessPhone',business_phone),business_address=coalesce(config->>'businessAddress',business_address),gstin=coalesce(config->>'gstin',gstin),bill_footer=coalesce(config->>'billFooter',bill_footer)WHERE id=1;
 FOR x IN SELECT * FROM jsonb_array_elements(_payload->'products')LOOP
  PERFORM public.check_legacy_money(x,ARRAY['mrp','sellingPrice','purchasePrice']);
  IF coalesce(x->>'id','')='' OR x?'article'OR x?'selling_price'OR nullif(btrim(x->>'name'),'')IS NULL THEN RAISE EXCEPTION'Invalid legacy product';END IF;
  SELECT id INTO pid FROM public.products WHERE lower(brand)=lower(coalesce(x->>'brand',''))AND lower(article)=lower(x->>'name')AND lower(coalesce(color,''))=lower(coalesce(x->>'color',''))AND category=coalesce(x->>'category','');
  IF NOT FOUND THEN
   INSERT INTO public.products(legacy_id,brand,article,category,color,gender,season,status,mrp,selling_price,created_at)
   VALUES(x->>'id',coalesce(x->>'brand',''),x->>'name',coalesce(x->>'category',''),coalesce(x->>'color',''),x->>'gender',x->>'season',coalesce(x->>'status','Active'),coalesce((x->>'mrp')::numeric,0),coalesce((x->>'sellingPrice')::numeric,0),coalesce((x->>'createdAt')::timestamptz,now()))RETURNING id INTO pid;
   IF(x->>'purchasePrice')::numeric>0 THEN INSERT INTO public.product_costs(product_id,purchase_price)VALUES(pid,(x->>'purchasePrice')::numeric);END IF;
  END IF;
  qty:=coalesce((x->>'stock')::integer,0);IF qty<0 THEN RAISE EXCEPTION'Invalid legacy stock';END IF;
  INSERT INTO public.product_variants(legacy_id,product_id,size,sku,barcode,stock,min_stock,rack)
  VALUES(x->>'id',pid,coalesce(x->>'size','NA'),x->>'sku',coalesce(nullif(x->>'barcode',''),nullif(x->>'sku','')),qty,coalesce((x->>'minStock')::integer,3),coalesce(x->>'shelf',''))RETURNING id INTO vid;
  PERFORM public.ensure_variant_code(vid);variants:=variants||jsonb_build_object(x->>'id',vid);
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'customers','[]'))LOOP
  PERFORM public.check_legacy_money(x,ARRAY['openingBalance']);
  INSERT INTO public.customers(legacy_id,mobile,name,shoe_size,brand_preference,is_premium,regular_stamps,premium_stamps,regular_visits,premium_visits,last_stamp_date,created_at,opening_balance)
  VALUES(x->>'id',coalesce(nullif(x->>'phone',''),x->>'id'),coalesce(x->>'name',''),coalesce(x->>'sizePreference',''),coalesce(x->>'brandPreference',''),coalesce((x->>'isPremium')::boolean,false),coalesce((x->>'regularStamps')::integer,0),coalesce((x->>'premiumStamps')::integer,0),coalesce((x->>'regularVisits')::integer,0),coalesce((x->>'premiumVisits')::integer,0),(x->>'lastStampDate')::date,coalesce((x->>'createdAt')::timestamptz,now()),coalesce((x->>'openingBalance')::numeric,0))RETURNING id INTO cid;
  customers_map:=customers_map||jsonb_build_object(x->>'id',cid);
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'suppliers','[]'))LOOP
  PERFORM public.check_legacy_money(x,ARRAY['openingBalance']);
  INSERT INTO public.suppliers(legacy_id,name,phone,address,created_at,opening_balance)VALUES(x->>'id',x->>'name',coalesce(x->>'phone',''),coalesce(x->>'address',''),coalesce((x->>'createdAt')::timestamptz,now()),coalesce((x->>'openingBalance')::numeric,0))RETURNING id INTO sid;
  suppliers_map:=suppliers_map||jsonb_build_object(x->>'id',sid);
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'sales','[]'))LOOP
  PERFORM public.check_legacy_money(x,ARRAY['subtotal','total','taxable','discount','gstRate','gstAmount','splitCash','paidAmount','dueAmount']);
  items:=x->'items';IF jsonb_typeof(items)<>'array'OR jsonb_array_length(items)=0 THEN RAISE EXCEPTION'Legacy bill has no items';END IF;
  total:=coalesce((x->>'total')::numeric,0);paid:=coalesce((x->>'paidAmount')::numeric,0);due:=coalesce((x->>'dueAmount')::numeric,0);
  IF coalesce(x->>'paymentMode','Cash')NOT IN('Cash','UPI','Card','Split','Credit')OR coalesce((x->>'splitCash')::numeric,0)>paid OR coalesce((x->>'gstRate')::numeric,0)>28 THEN RAISE EXCEPTION'Invalid legacy payment or tax settings';END IF;
  IF due>0 AND nullif(x->>'customerId','')IS NULL THEN RAISE EXCEPTION'Legacy credit bill needs a customer';END IF;
  IF round(coalesce((x->>'taxable')::numeric,total)+coalesce((x->>'gstAmount')::numeric,0),2)<>total OR round(coalesce((x->>'subtotal')::numeric,0)-coalesce((x->>'discount')::numeric,0)+CASE WHEN x->>'taxMode'='exclusive' THEN coalesce((x->>'gstAmount')::numeric,0)ELSE 0 END,2)<>total THEN RAISE EXCEPTION'Legacy tax and discount do not reconcile';END IF;
  IF total<0 OR paid<0 OR due<0 OR round(paid+due,2)<>round(total,2)THEN RAISE EXCEPTION'Legacy bill payment does not reconcile';END IF;
  IF nullif(x->>'customerId','')IS NOT NULL AND NOT customers_map?(x->>'customerId')THEN RAISE EXCEPTION'Legacy bill references a missing customer';END IF;
  SELECT sum((j->>'price')::numeric*(j->>'qty')::integer)INTO subtotal FROM jsonb_array_elements(items)j;
  IF round(subtotal,2)IS DISTINCT FROM round((x->>'subtotal')::numeric,2)THEN RAISE EXCEPTION'Legacy bill subtotal does not match items';END IF;
  INSERT INTO public.sales(legacy_id,bill_no,sale_date,customer_id,customer_name,payment_mode,split_cash,bill_type,tax_mode,subtotal,discount,taxable,gst_rate,gst_amount,total,paid_amount,due_amount)
  VALUES(x->>'id',x->>'billNo',coalesce((x->>'date')::timestamptz,now()),(customers_map->>(x->>'customerId'))::uuid,coalesce(x->>'customerName','Walk-in'),coalesce(x->>'paymentMode','Cash'),coalesce((x->>'splitCash')::numeric,0),coalesce(x->>'billType','simple'),coalesce(x->>'taxMode','inclusive'),subtotal,coalesce((x->>'discount')::numeric,0),coalesce((x->>'taxable')::numeric,total),coalesce((x->>'gstRate')::numeric,0),coalesce((x->>'gstAmount')::numeric,0),total,paid,due)RETURNING id INTO saleid;
  cost:=0;known:=true;
  FOR it IN SELECT * FROM jsonb_array_elements(items)LOOP
   PERFORM public.check_legacy_money(it,ARRAY['price','discount','cost']);
   vid:=(variants->>(it->>'productId'))::uuid;IF vid IS NULL OR coalesce((it->>'qty')::integer,0)<=0 OR coalesce((it->>'price')::numeric,-1)<0 THEN RAISE EXCEPTION'Invalid legacy sale item or missing size';END IF;
   INSERT INTO public.sale_items(sale_id,variant_id,product_name,size,sku,price,qty,discount)VALUES(saleid,vid,coalesce(it->>'name',''),coalesce(it->>'size',''),it->>'sku',(it->>'price')::numeric,(it->>'qty')::integer,coalesce((it->>'discount')::numeric,0))RETURNING id INTO lineid;
   IF(it->>'cost')::numeric>0 THEN
    INSERT INTO public.sale_item_costs(sale_item_id,unit_cost)VALUES(lineid,(it->>'cost')::numeric)ON CONFLICT(sale_item_id)DO UPDATE SET unit_cost=excluded.unit_cost;
    cost:=cost+(it->>'cost')::numeric*(it->>'qty')::integer;
   ELSE
    DELETE FROM public.sale_item_costs WHERE sale_item_id=lineid;known:=false;
   END IF;
  END LOOP;
  IF known THEN INSERT INTO public.sale_costs(sale_id,total_cost,profit)VALUES(saleid,cost,coalesce((x->>'taxable')::numeric,total)-cost);END IF;
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'purchases','[]'))LOOP
  PERFORM public.check_legacy_money(x,ARRAY['purchasePrice','gstRate','gstAmount','total','paidAmount']);
  IF coalesce((x->>'quantity')::integer,0)<=0 OR coalesce((x->>'paidAmount')::numeric,0)>coalesce((x->>'total')::numeric,0)OR coalesce((x->>'gstRate')::numeric,0)>28 OR round(coalesce((x->>'purchasePrice')::numeric,0)*(x->>'quantity')::integer+coalesce((x->>'gstAmount')::numeric,0),2)<>coalesce((x->>'total')::numeric,0)THEN RAISE EXCEPTION'Invalid legacy purchase totals';END IF;
  vid:=(variants->>(x->>'productId'))::uuid;IF vid IS NULL THEN RAISE EXCEPTION'Legacy purchase references missing size';END IF;
  IF nullif(x->>'supplierId','')IS NOT NULL AND NOT suppliers_map?(x->>'supplierId')THEN RAISE EXCEPTION'Legacy purchase references missing supplier';END IF;
  INSERT INTO public.purchases(legacy_id,purchase_date,supplier_id,supplier_name,invoice_no,status,variant_id,quantity,purchase_price,gst_rate,gst_amount,total,paid_amount)
  VALUES(x->>'id',coalesce((x->>'date')::timestamptz,now()),(suppliers_map->>(x->>'supplierId'))::uuid,coalesce(x->>'supplierName',''),coalesce(x->>'invoiceNo',''),coalesce(x->>'status','Received'),vid,(x->>'quantity')::integer,coalesce((x->>'purchasePrice')::numeric,0),coalesce((x->>'gstRate')::numeric,0),coalesce((x->>'gstAmount')::numeric,0),coalesce((x->>'total')::numeric,0),coalesce((x->>'paidAmount')::numeric,0));
 END LOOP;
 FOR x IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'movements','[]'))LOOP
  vid:=(variants->>(x->>'productId'))::uuid;IF vid IS NULL THEN RAISE EXCEPTION'Legacy movement references missing size';END IF;
  INSERT INTO public.stock_movements(legacy_id,moved_at,type,variant_id,product_name,qty_in,qty_out,note)VALUES(x->>'id',coalesce((x->>'date')::timestamptz,now()),coalesce(x->>'type','IMPORT'),vid,coalesce(x->>'productName',''),coalesce((x->>'qtyIn')::integer,0),coalesce((x->>'qtyOut')::integer,0),coalesce(x->>'note',''));
 END LOOP;
 IF jsonb_array_length(coalesce(_payload->'movements','[]'))=0 THEN
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note)SELECT'IMPORT-SNAPSHOT',v.id,p.brand||' '||p.article||' ('||v.size||')',v.stock,'Opening closing-stock snapshot; historical invoices do not deduct stock again'FROM public.product_variants v JOIN public.products p ON p.id=v.product_id WHERE v.stock>0;
 END IF;
 -- Imported BILL numbers must never collide with newly allocated invoices.
 PERFORM setval('public.bill_seq',greatest((SELECT last_value FROM public.bill_seq),coalesce((SELECT max(substring(bill_no FROM '^BILL-[0-9]{8}-([0-9]+)$')::bigint)FROM public.sales),0),1),true);
 result:=jsonb_build_object('products',(SELECT count(*)FROM public.products),'sizes',(SELECT count(*)FROM public.product_variants),'sales',(SELECT count(*)FROM public.sales),'purchases',(SELECT count(*)FROM public.purchases));
 INSERT INTO public.stock_movements(type,product_name,qty_in,qty_out,note,operation_id,operation_hash,operation_result)VALUES('LEGACY-IMPORT','Verified legacy import',0,0,'Atomic import completed',_request_id,h,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.import_legacy_store(jsonb,uuid)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_legacy_store(jsonb,uuid)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
