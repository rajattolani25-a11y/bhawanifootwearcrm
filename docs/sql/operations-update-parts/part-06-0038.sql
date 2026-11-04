-- Part 6. Source: 0038_server_bill_validation.sql. No reset/import/sale is executed.
BEGIN;
-- Validate the current loyalty/retry/void-aware billing implementation in place.
CREATE OR REPLACE FUNCTION public.checked_sale_payload(_sale jsonb,_items jsonb,_reward numeric,_coupon numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it jsonb; p record; subtotal numeric:=0; discount numeric; taxable numeric; tax numeric; total numeric; paid numeric; due numeric; fee numeric:=coalesce((_sale->>'delivery_charge')::numeric,0);
 mode text:=coalesce(_sale->>'payment_mode','Cash'); kind text:=coalesce(_sale->>'bill_type','simple'); taxmode text:=coalesce(_sale->>'tax_mode','inclusive'); rate numeric:=coalesce((_sale->>'gst_rate')::numeric,0); split numeric:=coalesce((_sale->>'split_cash')::numeric,0);
 b public.catalog_bookings%ROWTYPE; booking uuid:=nullif(_sale->>'catalog_booking_id','')::uuid; expected numeric; key text;
BEGIN
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Enter valid bill items'; END IF;
 IF mode NOT IN ('Cash','UPI','Card','Split','Credit') OR kind NOT IN ('gst','simple') OR taxmode NOT IN ('inclusive','exclusive') OR rate NOT BETWEEN 0 AND 28 OR rate::text IN ('NaN','Infinity','-Infinity') OR fee<0 OR fee::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid payment, tax or delivery settings'; END IF;
 IF kind='simple' THEN rate:=0; END IF;
 IF booking IS NOT NULL THEN
  IF current_setting('app.catalog_billing',true) IS DISTINCT FROM booking::text THEN RAISE EXCEPTION 'Use online order completion to make this invoice'; END IF;
  SELECT * INTO b FROM public.catalog_bookings WHERE id=booking AND status IN ('confirmed','packed','shipped') AND receipt_recorded FOR UPDATE;
  IF NOT FOUND OR jsonb_array_length(_items)<>1 OR fee IS DISTINCT FROM coalesce(b.delivery_charge,0) THEN RAISE EXCEPTION 'Order invoice does not match payment'; END IF;
 ELSIF fee<>0 THEN RAISE EXCEPTION 'Delivery charge must come from the linked order'; END IF;
 -- Deterministic lock order across receiving, stock edits and simultaneous carts.
 PERFORM 1 FROM public.product_variants WHERE id IN(SELECT(x->>'variant_id')::uuid FROM jsonb_array_elements(_items)x)ORDER BY id FOR UPDATE;
 FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
  IF nullif(it->>'variant_id','') IS NULL OR coalesce(it->>'qty','') !~ '^[1-9][0-9]*$' OR (it->>'qty')::numeric>1000000 OR nullif(it->>'price','') IS NULL OR (it->>'price')::numeric<0 OR (it->>'price')::numeric::text IN ('NaN','Infinity','-Infinity') OR coalesce((it->>'discount')::numeric,0)<>0 THEN RAISE EXCEPTION 'Invalid quantity or price'; END IF;
  SELECT pv.size,pv.product_id,pr.selling_price,pr.status INTO p FROM public.product_variants pv JOIN public.products pr ON pr.id=pv.product_id WHERE pv.id=(it->>'variant_id')::uuid;
  IF NOT FOUND OR p.status<>'Active' OR p.size IS DISTINCT FROM it->>'size' THEN RAISE EXCEPTION 'Product or size changed. Reload cart before billing.'; END IF;
  expected:=CASE WHEN booking IS NULL THEN p.selling_price ELSE b.price END;
  IF booking IS NOT NULL AND ((it->>'variant_id')::uuid<>b.variant_id OR (it->>'qty')::integer<>1) OR round((it->>'price')::numeric,2)<>round(expected,2) THEN RAISE EXCEPTION 'Price changed. Refresh cart and review the current price.'; END IF;
  subtotal:=subtotal+(it->>'price')::numeric*(it->>'qty')::integer;
 END LOOP;
 subtotal:=round(subtotal+fee,2);discount:=coalesce((_sale->>'discount')::numeric,0);
 IF discount::text IN ('NaN','Infinity','-Infinity') OR discount<least(subtotal,coalesce(_reward,0)+coalesce(_coupon,0)) OR discount>subtotal OR discount<0 THEN RAISE EXCEPTION 'Invalid or unapplied discount'; END IF;
 discount:=round(discount,2);
 IF taxmode='inclusive' OR rate=0 THEN total:=subtotal-discount;taxable:=round(total/(1+rate/100),2);
 ELSE taxable:=subtotal-discount;total:=round(taxable*(1+rate/100),2);END IF;
 tax:=total-taxable;paid:=coalesce((_sale->>'paid_amount')::numeric,total);due:=total-paid;
 IF paid<0 OR paid>total OR paid::text IN ('NaN','Infinity','-Infinity') OR paid<>round(paid,2) OR split<0 OR split>paid OR split::text IN ('NaN','Infinity','-Infinity') OR mode<>'Split' AND split<>0 THEN RAISE EXCEPTION 'Enter valid non-negative payment amounts'; END IF;
 IF mode='Credit' AND paid>0 THEN RAISE EXCEPTION 'Choose Cash, UPI or Card for partial payment; Credit means unpaid';END IF;
 IF due>0 AND nullif(_sale->>'customer_id','') IS NULL THEN RAISE EXCEPTION 'Select a customer for an outstanding balance'; END IF;
 FOREACH key IN ARRAY ARRAY['subtotal','discount','taxable','gst_amount','total','due_amount'] LOOP
  expected:=CASE key WHEN 'subtotal'THEN subtotal WHEN 'discount'THEN discount WHEN 'taxable'THEN taxable WHEN 'gst_amount'THEN tax WHEN 'total'THEN total ELSE due END;
  IF _sale ? key AND round((_sale->>key)::numeric,2) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Bill % does not match its items and payments. Reload and retry.',key;END IF;
 END LOOP;
 RETURN _sale||jsonb_build_object('subtotal',subtotal,'discount',discount,'taxable',taxable,'gst_amount',tax,'gst_rate',rate,'total',total,'paid_amount',paid,'due_amount',due,'split_cash',split,'bill_type',kind,'tax_mode',taxmode,'payment_mode',mode);
END $$;
REVOKE ALL ON FUNCTION public.checked_sale_payload(jsonb,jsonb,numeric,numeric) FROM PUBLIC,anon,authenticated;
DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure)INTO d;
 IF position('-- server-bill-validation-v38' IN d)=0 THEN
  IF position('-- retail-integrity-request-v1'IN d)=0 OR position('-- void-bill-retry-guard'IN d)=0 OR (SELECT count(*)FROM regexp_matches(d,'  v_bill :=','g'))<>1 THEN RAISE EXCEPTION 'Apply updates0032-0034 first; unsupported billing definition';END IF;
  d:=replace(d,'  v_bill :=',E'  -- server-bill-validation-v38\n  _sale:=public.checked_sale_payload(_sale,_items,v_reward_amt,v_coupon_amt);\n  v_total:=(_sale->>''total'')::numeric;\n  v_bill :=');
  EXECUTE d;
 END IF;
END $patch$;
DO $locks$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure)INTO d;
 IF position('-- customer-lock-v38'IN d)=0 THEN
  IF position('perform set_config(''app.loyalty_bypass'',''1'', true);'IN d)=0 THEN RAISE EXCEPTION 'Unsupported customer billing lock layout';END IF;
  d:=replace(d,'perform set_config(''app.loyalty_bypass'',''1'', true);',E'-- customer-lock-v38\n  PERFORM pg_advisory_xact_lock(hashtextextended(''customer:''||v_cust::text,400));\n  PERFORM 1 FROM public.product_variants WHERE id IN(SELECT(x->>''variant_id'')::uuid FROM jsonb_array_elements(_items)x)ORDER BY id FOR UPDATE;\n  perform set_config(''app.loyalty_bypass'',''1'', true);');
  EXECUTE d;
 END IF;
 SELECT pg_get_functiondef('public.process_sale_return(uuid,uuid,integer,boolean,text,text,text,uuid,uuid)'::regprocedure)INTO d;
 IF position('-- customer-lock-v38'IN d)=0 THEN
  IF position('-- Lock bill before line:'IN d)=0 THEN RAISE EXCEPTION 'Unsupported return locking layout';END IF;
  d:=replace(d,'-- Lock bill before line:',E'-- customer-lock-v38\n PERFORM pg_advisory_xact_lock(hashtextextended(''customer:''||(SELECT s.customer_id::text FROM public.sales s JOIN public.sale_items i ON i.sale_id=s.id WHERE i.id=_sale_item_id),400));\n -- Lock bill before line:');EXECUTE d;
 END IF;
 SELECT pg_get_functiondef('public.void_sale(uuid,text,text,boolean,text)'::regprocedure)INTO d;
 IF position('-- customer-lock-v38'IN d)=0 THEN
  IF position(' SELECT * INTO s FROM public.sales WHERE id=_sale_id FOR UPDATE;'IN d)=0 THEN RAISE EXCEPTION 'Unsupported cancellation locking layout';END IF;
  d:=replace(d,' SELECT * INTO s FROM public.sales WHERE id=_sale_id FOR UPDATE;',E' -- customer-lock-v38\n PERFORM pg_advisory_xact_lock(hashtextextended(''customer:''||(SELECT customer_id::text FROM public.sales WHERE id=_sale_id),400));\n SELECT * INTO s FROM public.sales WHERE id=_sale_id FOR UPDATE;');EXECUTE d;
 END IF;
END $locks$;
CREATE OR REPLACE FUNCTION public.owner_cash_today() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required';END IF;
 WITH bounds AS(SELECT(date_trunc('day',now()AT TIME ZONE'Asia/Kolkata')AT TIME ZONE'Asia/Kolkata')AS a,(date_trunc('day',now()AT TIME ZONE'Asia/Kolkata')AT TIME ZONE'Asia/Kolkata')+interval'1 day'AS b),
 invoices AS(SELECT s.*,greatest(0,s.paid_amount-coalesce((SELECT sum(p.amount)FROM public.credit_payments p WHERE p.sale_id=s.id AND p.entry_kind IS DISTINCT FROM'catalog_refund'),0))AS initial FROM public.sales s,bounds WHERE s.voided_at IS NULL AND s.sale_date>=a AND s.sale_date<b),
 received AS(SELECT coalesce(sum(CASE WHEN payment_mode='Cash'THEN initial WHEN payment_mode='Split'THEN least(split_cash,initial)ELSE 0 END),0)+(SELECT coalesce(sum(amount),0)FROM public.credit_payments,bounds WHERE payment_mode='Cash'AND entry_kind IS DISTINCT FROM'catalog_refund'AND paid_at>=a AND paid_at<b)AS amount FROM invoices),
 paid AS(SELECT(SELECT coalesce(sum(cash_refund),0)FROM public.sale_returns,bounds WHERE kind<>'exchange'AND refund_mode='Cash'AND created_at>=a AND created_at<b)+(SELECT coalesce(sum(amount),0)FROM public.credit_payments,bounds WHERE entry_kind='catalog_refund'AND payment_mode='Cash'AND paid_at>=a AND paid_at<b)+(SELECT coalesce(sum(amount),0)FROM public.supplier_payments,bounds WHERE payment_mode='Cash'AND paid_at>=a AND paid_at<b)+(SELECT coalesce(sum(amount),0)FROM public.expenses,bounds WHERE mode='Cash'AND spent_on=(a AT TIME ZONE'Asia/Kolkata')::date)AS amount),
 unknown AS(SELECT(SELECT count(*)FROM public.sale_returns,bounds WHERE kind<>'exchange'AND cash_refund>0 AND refund_mode IS NULL AND created_at>=a AND created_at<b)+(SELECT count(*)FROM invoices WHERE payment_mode='Credit'AND initial>0)AS n)
 SELECT jsonb_build_object('cash_in',received.amount,'cash_out',paid.amount,'cash_net',received.amount-paid.amount,'verified',unknown.n=0)INTO result FROM received,paid,unknown;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.owner_cash_today()FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_cash_today()TO authenticated;
CREATE INDEX IF NOT EXISTS supplier_payment_date_idx ON public.supplier_payments(paid_at);
CREATE INDEX IF NOT EXISTS expense_date_idx ON public.expenses(spent_on);
CREATE OR REPLACE FUNCTION public.operational_safety_version() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT 38$$;
REVOKE ALL ON FUNCTION public.operational_safety_version()FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.operational_safety_version()TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT true AS part_06_applied;
