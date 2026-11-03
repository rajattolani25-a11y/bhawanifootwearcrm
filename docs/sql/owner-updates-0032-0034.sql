-- Run the complete script after approved migration 0031.
-- Definition updates only; this script never runs a reset or cancels an existing bill.

-- Approved whole-app audit fixes. Applying this file does not reset a store,
-- rewrite old bills, convert historical costing, or reclaim spent rewards.
BEGIN;
DO $$ BEGIN
 IF public.reward_amount('regular',15)<>100 OR public.reward_amount('premium',15)<>200 THEN
  RAISE EXCEPTION 'Apply approved migration 0031_fixed_loyalty_rewards first, then retry 0032. No changes committed.';
 END IF;
END $$;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_request_id uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS request_result jsonb;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS stamp_regular_reversed boolean;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS stamp_premium_reversed boolean;
CREATE UNIQUE INDEX IF NOT EXISTS sales_client_request_unique ON public.sales(client_request_id) WHERE client_request_id IS NOT NULL;
ALTER TABLE public.loyalty_rewards ADD COLUMN IF NOT EXISTS earned_sale_id uuid REFERENCES public.sales(id);
ALTER TABLE public.loyalty_rewards ADD COLUMN IF NOT EXISTS earned_visit_number integer;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS replacement_variant_id uuid REFERENCES public.product_variants(id);
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS replacement_size text;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS refund_mode text CHECK(refund_mode IN ('Cash','UPI','Card','Bank'));
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS operation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS sale_returns_operation_unique ON public.sale_returns(operation_id) WHERE operation_id IS NOT NULL;

-- Staff retains operational return columns, never the private cost reversal.
REVOKE SELECT ON public.sale_returns FROM authenticated;
GRANT SELECT(id,sale_id,sale_item_id,variant_id,product_name,size,qty,refund,kind,damaged,note,created_at,taxable_reversal,gst_reversal,cash_refund,replacement_variant_id,replacement_size,refund_mode,operation_id) ON public.sale_returns TO authenticated;
CREATE OR REPLACE FUNCTION public.return_cost_reversals(_ids uuid[])
RETURNS TABLE(id uuid,cost_reversal numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF cardinality(_ids)>1000 THEN RAISE EXCEPTION 'Cost page too large'; END IF;
 RETURN QUERY SELECT r.id,r.cost_reversal FROM public.sale_returns r WHERE r.id=ANY(_ids);
END $$;
REVOKE ALL ON FUNCTION public.return_cost_reversals(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.return_cost_reversals(uuid[]) TO authenticated;

-- Only an owner can acknowledge a persisted reward exception.
CREATE OR REPLACE FUNCTION public.guard_return_reward_review() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.action='return_reward_reviewed' AND NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_return_reward_review ON public.loyalty_events;
CREATE TRIGGER guard_return_reward_review BEFORE INSERT ON public.loyalty_events FOR EACH ROW EXECUTE FUNCTION public.guard_return_reward_review();

-- Minimal guarded patches preserve the CURRENT billing implementation.
DO $patch$
DECLARE d text; patched integer;
BEGIN
 SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure) INTO d;
 IF position('-- retail-integrity-request-v1' IN d)=0 THEN
  IF (SELECT count(*) FROM regexp_matches(d,'v_sale_id uuid;', 'g'))<>1
     OR (SELECT count(*) FROM regexp_matches(d,'if not public.is_member\(auth.uid\(\)\) then raise exception ''Not allowed''; end if;', 'g'))<>1
     OR (SELECT count(*) FROM regexp_matches(d,'return jsonb_build_object\(''sale_id'', v_sale_id', 'g'))<>1
     OR (SELECT count(*) FROM regexp_matches(d,'insert into public.loyalty_rewards\(customer_id, card, milestone, amount\)', 'g'))<>2 THEN
    RAISE EXCEPTION 'Unexpected create_sale definition; no changes committed. Request a compatible patch.';
  END IF;
  d:=replace(d,'v_sale_id uuid;',E'-- retail-integrity-request-v1\n  v_request uuid := nullif(_sale->>''request_id'','''')::uuid; v_hash text; v_existing public.sales%ROWTYPE; v_result jsonb;\n  v_sale_id uuid;');
  d:=replace(d,'if not public.is_member(auth.uid()) then raise exception ''Not allowed''; end if;',E'if not public.is_member(auth.uid()) then raise exception ''Not allowed''; end if;\n  if v_request is not null then\n    perform pg_advisory_xact_lock(hashtextextended(v_request::text,32));\n    v_hash := md5(jsonb_build_object(''sale'',_sale,''items'',_items)::text);\n    select * into v_existing from public.sales where client_request_id=v_request;\n    if found then\n      if v_existing.staff_id is distinct from auth.uid() or v_existing.request_hash is distinct from v_hash then raise exception ''Billing request already belongs to another transaction''; end if;\n      return v_existing.request_result;\n    end if;\n  end if;');
  d:=replace(d,'insert into public.loyalty_rewards(customer_id, card, milestone, amount) values (v_cust,''regular'',v_new, public.reward_amount(''regular'',v_new));','insert into public.loyalty_rewards(customer_id, card, milestone, amount,earned_sale_id,earned_visit_number) values (v_cust,''regular'',v_new, public.reward_amount(''regular'',v_new),v_sale_id,c.regular_visits+1);');
  d:=replace(d,'insert into public.loyalty_rewards(customer_id, card, milestone, amount) values (v_cust,''premium'',v_new, public.reward_amount(''premium'',v_new));','insert into public.loyalty_rewards(customer_id, card, milestone, amount,earned_sale_id,earned_visit_number) values (v_cust,''premium'',v_new, public.reward_amount(''premium'',v_new),v_sale_id,c.premium_visits+1);');
  IF position('c.regular_visits+1' IN d)=0 OR position('c.premium_visits+1' IN d)=0 THEN RAISE EXCEPTION 'Unexpected reward issuance; no changes committed'; END IF;
  -- Keep the original return object, then persist it with the bill atomically.
  d:=replace(d,'return jsonb_build_object(''sale_id'', v_sale_id','v_result := jsonb_build_object(''sale_id'', v_sale_id');
  d:=regexp_replace(d,'end \$function\$',E'  update public.sales set client_request_id=v_request,request_hash=v_hash,request_result=v_result where id=v_sale_id;\n  return v_result;\nend $function$');
  -- pg_get_functiondef uses its own $function$ delimiter.
  IF position('request_result=v_result where id=v_sale_id' IN d)=0 THEN RAISE EXCEPTION 'Unexpected billing function terminator; no changes committed'; END IF;
  EXECUTE d;
 END IF;
END $patch$;

-- Remaining physical pairs for one original invoice line. New exchanges transfer
-- a position to its replacement size; historical unlinked exchanges stay consumed.
CREATE OR REPLACE FUNCTION public.sale_return_positions(_item uuid)
RETURNS TABLE(variant_id uuid,size text,qty integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 RETURN QUERY WITH movements AS (
  SELECT si.variant_id,si.size,si.qty::bigint AS delta FROM public.sale_items si WHERE si.id=_item
  UNION ALL SELECT r.variant_id,r.size,-r.qty::bigint FROM public.sale_returns r WHERE r.sale_item_id=_item
  UNION ALL SELECT r.replacement_variant_id,r.replacement_size,r.qty::bigint FROM public.sale_returns r WHERE r.sale_item_id=_item AND r.kind='exchange' AND r.replacement_variant_id IS NOT NULL
 ) SELECT m.variant_id,max(m.size),sum(m.delta)::integer FROM movements m GROUP BY m.variant_id HAVING sum(m.delta)>0;
END $$;
REVOKE ALL ON FUNCTION public.sale_return_positions(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sale_return_positions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.process_sale_return(
 _sale_item_id uuid,_variant_id uuid,_qty integer,_damaged boolean,_kind text,
 _note text DEFAULT '',_refund_mode text DEFAULT NULL,_replacement_variant_id uuid DEFAULT NULL,_operation_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE si public.sale_items%ROWTYPE; sa public.sales%ROWTYPE; previous public.sale_returns%ROWTYPE;
 available integer; old_size text; replacement public.product_variants%ROWTYPE; old_product uuid;
 already integer; gross numeric; refund numeric:=0; tax_part numeric:=0; gst_part numeric:=0; cost_part numeric:=0; due_part numeric:=0; payout numeric:=0;
 c public.customers%ROWTYPE; v_card text; threshold numeric; reverse_stamp boolean; visit_count integer; r record; review boolean:=false;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _kind IS NULL OR _kind NOT IN ('return','defect','exchange') OR _qty IS NULL OR _qty<=0 OR _damaged IS NULL THEN RAISE EXCEPTION 'Invalid return'; END IF;
 IF _operation_id IS NULL THEN RAISE EXCEPTION 'A return request identifier is required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_operation_id::text,33));
 SELECT * INTO previous FROM public.sale_returns WHERE operation_id=_operation_id;
 IF FOUND THEN
  IF previous.sale_item_id IS DISTINCT FROM _sale_item_id OR previous.variant_id IS DISTINCT FROM _variant_id OR previous.qty<>_qty OR previous.kind<>_kind OR previous.damaged<>_damaged OR previous.replacement_variant_id IS DISTINCT FROM _replacement_variant_id OR previous.refund_mode IS DISTINCT FROM _refund_mode THEN RAISE EXCEPTION 'Return request does not match the previous operation'; END IF;
  RETURN jsonb_build_object('refund',previous.refund,'payout',previous.cash_refund,'replayed',true);
 END IF;
 -- Lock bill before line: all return/exchange operations on a bill serialize.
 SELECT s.* INTO sa FROM public.sales s JOIN public.sale_items i ON i.sale_id=s.id WHERE i.id=_sale_item_id FOR UPDATE OF s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 SELECT * INTO si FROM public.sale_items WHERE id=_sale_item_id FOR UPDATE;
 SELECT p.qty,p.size INTO available,old_size FROM public.sale_return_positions(si.id) p WHERE p.variant_id IS NOT DISTINCT FROM _variant_id;
 IF coalesce(available,0)<_qty THEN RAISE EXCEPTION 'This size is no longer returnable. Reload the bill.'; END IF;
 IF _kind='exchange' THEN
  IF _damaged OR _variant_id IS NULL OR _replacement_variant_id IS NULL OR _replacement_variant_id=_variant_id THEN RAISE EXCEPTION 'Choose a different available size for exchange'; END IF;
  -- Stable lock order also prevents opposite simultaneous swaps deadlocking.
  PERFORM 1 FROM public.product_variants WHERE id IN (_variant_id,_replacement_variant_id) ORDER BY id FOR UPDATE;
  SELECT product_id INTO old_product FROM public.product_variants WHERE id=_variant_id;
  SELECT * INTO replacement FROM public.product_variants WHERE id=_replacement_variant_id;
  IF NOT FOUND OR replacement.product_id IS DISTINCT FROM old_product THEN RAISE EXCEPTION 'Size exchange must use the same article. Use a return and separate purchase for a different article.'; END IF;
  IF replacement.stock<_qty THEN RAISE EXCEPTION 'Replacement size is out of stock'; END IF;
  UPDATE public.product_variants SET stock=stock-_qty WHERE id=replacement.id;
  INSERT INTO public.stock_movements(type,variant_id,product_name,qty_out,note,user_id) VALUES('EXCHANGE-OUT',replacement.id,si.product_name||' ('||replacement.size||')',_qty,sa.bill_no,auth.uid());
 ELSE
  IF _replacement_variant_id IS NOT NULL THEN RAISE EXCEPTION 'Replacement is only valid for a size exchange'; END IF;
  IF _refund_mode IS NOT NULL AND _refund_mode NOT IN ('Cash','UPI','Card','Bank') THEN RAISE EXCEPTION 'Invalid refund method'; END IF;
  SELECT coalesce(sum(qty),0) INTO already FROM public.sale_returns WHERE sale_item_id=si.id AND kind<>'exchange';
  -- Cumulative rounding means separately returning three pairs cannot over-refund a paisa.
  gross:=si.price;
  refund:=coalesce(round(gross*(already+_qty)*greatest(sa.subtotal-sa.discount,0)/nullif(sa.subtotal,0)*CASE WHEN sa.tax_mode='exclusive' AND sa.bill_type='gst' THEN 1+sa.gst_rate/100 ELSE 1 END,2)-round(gross*already*greatest(sa.subtotal-sa.discount,0)/nullif(sa.subtotal,0)*CASE WHEN sa.tax_mode='exclusive' AND sa.bill_type='gst' THEN 1+sa.gst_rate/100 ELSE 1 END,2),0);
  tax_part:=coalesce(round(sa.taxable*gross*(already+_qty)/nullif(sa.subtotal,0),2)-round(sa.taxable*gross*already/nullif(sa.subtotal,0),2),0);
  gst_part:=coalesce(round(sa.gst_amount*gross*(already+_qty)/nullif(sa.subtotal,0),2)-round(sa.gst_amount*gross*already/nullif(sa.subtotal,0),2),0);
  SELECT coalesce((SELECT unit_cost FROM public.sale_item_costs WHERE sale_item_id=si.id),(SELECT sc.total_cost/nullif((SELECT sum(qty) FROM public.sale_items WHERE sale_id=sa.id),0) FROM public.sale_costs sc WHERE sc.sale_id=sa.id),0)*_qty INTO cost_part;
  due_part:=least(refund,sa.due_amount);payout:=refund-due_part;
  IF payout>0 AND _refund_mode IS NULL THEN RAISE EXCEPTION 'Confirm the actual refund payment method'; END IF;
  UPDATE public.sales SET due_amount=greatest(due_amount-due_part,0) WHERE id=sa.id;
 END IF;
 IF _variant_id IS NOT NULL THEN
  UPDATE public.product_variants SET stock=stock+CASE WHEN _damaged THEN 0 ELSE _qty END,damaged_stock=damaged_stock+CASE WHEN _damaged THEN _qty ELSE 0 END WHERE id=_variant_id;
 END IF;
 INSERT INTO public.sale_returns(sale_id,sale_item_id,variant_id,product_name,size,qty,refund,kind,damaged,note,taxable_reversal,gst_reversal,cost_reversal,cash_refund,refund_mode,replacement_variant_id,replacement_size,operation_id)
 VALUES(sa.id,si.id,_variant_id,si.product_name,coalesce(old_size,si.size),_qty,refund,_kind,_damaged,coalesce(_note,''),tax_part,gst_part,cost_part,payout,_refund_mode,_replacement_variant_id,replacement.size,_operation_id);
 INSERT INTO public.stock_movements(type,variant_id,product_name,qty_in,note,user_id) VALUES(CASE WHEN _kind='exchange' THEN 'EXCHANGE-IN' WHEN _damaged THEN 'RETURN-DAMAGED' ELSE 'RETURN' END,_variant_id,si.product_name||' ('||coalesce(old_size,si.size)||')',_qty,sa.bill_no||' '||coalesce(_note,''),auth.uid());
 IF _kind<>'exchange' AND sa.customer_id IS NOT NULL THEN
  SELECT * INTO c FROM public.customers WHERE id=sa.customer_id FOR UPDATE;
  PERFORM set_config('app.loyalty_bypass','1',true);
  FOREACH v_card IN ARRAY ARRAY['regular','premium'] LOOP
   threshold:=CASE WHEN v_card='regular' THEN 299 ELSE 999 END;
   reverse_stamp:=CASE WHEN v_card='regular' THEN sa.stamp_regular AND NOT coalesce(sa.stamp_regular_reversed,false) ELSE sa.stamp_premium AND NOT coalesce(sa.stamp_premium_reversed,false) END;
   IF reverse_stamp AND sa.total-(SELECT coalesce(sum(sr.refund),0) FROM public.sale_returns sr WHERE sr.sale_id=sa.id AND sr.kind<>'exchange')<threshold THEN
    IF v_card='regular' THEN
     UPDATE public.customers SET regular_stamps=(regular_stamps+19)%20,regular_visits=greatest(regular_visits-1,0) WHERE id=c.id RETURNING regular_visits INTO visit_count;
     UPDATE public.sales SET stamp_regular_reversed=true WHERE id=sa.id;
    ELSE
     UPDATE public.customers SET premium_stamps=(premium_stamps+19)%20,premium_visits=greatest(premium_visits-1,0) WHERE id=c.id RETURNING premium_visits INTO visit_count;
     UPDATE public.sales SET stamp_premium_reversed=true WHERE id=sa.id;
    END IF;
    FOR r IN SELECT * FROM public.loyalty_rewards lr WHERE lr.customer_id=c.id AND lr.card=v_card AND lr.earned_visit_number>visit_count AND lr.status IN ('active','used') FOR UPDATE LOOP
     IF r.status='active' THEN UPDATE public.loyalty_rewards SET status='cancelled' WHERE id=r.id;
     ELSE review:=true; END IF;
     INSERT INTO public.loyalty_events(reward_id,customer_id,action,note,sale_id) VALUES(r.id,c.id,CASE WHEN r.status='used' THEN 'return_reward_review' ELSE 'return_reward_cancelled' END,'Purchase eligibility removed after return; spent rewards are never automatically charged back',sa.id);
    END LOOP;
    FOR r IN SELECT * FROM public.loyalty_rewards lr WHERE lr.customer_id=c.id AND lr.card=v_card AND lr.earned_visit_number IS NULL AND lr.status IN ('active','used') LOOP
     review:=true;
     INSERT INTO public.loyalty_events(reward_id,customer_id,action,note,sale_id) VALUES(r.id,c.id,'return_reward_review','Historical voucher has no source purchase link. Owner must review; no automatic cancellation or charge.',sa.id);
    END LOOP;
   END IF;
  END LOOP;
  UPDATE public.customers SET last_stamp_date=(SELECT max((s.sale_date AT TIME ZONE 'Asia/Kolkata')::date) FROM public.sales s WHERE s.customer_id=c.id AND ((s.stamp_regular AND NOT coalesce(s.stamp_regular_reversed,false)) OR (s.stamp_premium AND NOT coalesce(s.stamp_premium_reversed,false)))) WHERE id=c.id;
 END IF;
 RETURN jsonb_build_object('refund',refund,'payout',payout,'refund_mode',_refund_mode,'loyalty_review',review,'replacement_size',replacement.size);
END $$;
REVOKE ALL ON FUNCTION public.process_sale_return(uuid,uuid,integer,boolean,text,text,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.process_sale_return(uuid,uuid,integer,boolean,text,text,text,uuid,uuid) TO authenticated;
-- Old clients must not perform an unlinked exchange or a refund with no method.
CREATE OR REPLACE FUNCTION public.process_return(_sale_item_id uuid,_qty integer,_damaged boolean,_kind text,_note text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'Reload the app to use the verified return / size exchange flow.'; END $$;

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


-- Cancel an incorrect bill atomically; keep its original invoice/audit record.
BEGIN;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS voided_by uuid;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS void_refund_mode text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS void_metadata jsonb;
CREATE INDEX IF NOT EXISTS sales_voided_at_idx ON public.sales(voided_at) WHERE voided_at IS NOT NULL;
REVOKE DELETE ON public.sales FROM authenticated;
CREATE OR REPLACE FUNCTION public.sale_is_active(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_member(auth.uid()) AND EXISTS(SELECT 1 FROM public.sales s WHERE s.id=_id AND s.voided_at IS NULL)
$$;
REVOKE ALL ON FUNCTION public.sale_is_active(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sale_is_active(uuid) TO authenticated;
-- Restrictive policies also constrain the existing owner-all permissive policies.
DROP POLICY IF EXISTS "Hide void bills from normal queries" ON public.sales;
CREATE POLICY "Hide void bills from normal queries" ON public.sales AS RESTRICTIVE FOR SELECT TO authenticated USING(voided_at IS NULL);
DROP POLICY IF EXISTS "Hide void bill lines" ON public.sale_items;
CREATE POLICY "Hide void bill lines" ON public.sale_items AS RESTRICTIVE FOR SELECT TO authenticated USING(public.sale_is_active(sale_id));
DROP POLICY IF EXISTS "Hide void bill costs" ON public.sale_costs;
CREATE POLICY "Hide void bill costs" ON public.sale_costs AS RESTRICTIVE FOR SELECT TO authenticated USING(public.sale_is_active(sale_id));
DROP POLICY IF EXISTS "Hide void line costs" ON public.sale_item_costs;
CREATE POLICY "Hide void line costs" ON public.sale_item_costs AS RESTRICTIVE FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.sale_items i WHERE i.id=sale_item_id));
DROP POLICY IF EXISTS "Hide void reversal entries" ON public.sale_returns;
CREATE POLICY "Hide void reversal entries" ON public.sale_returns AS RESTRICTIVE FOR SELECT TO authenticated USING(sale_id IS NULL OR public.sale_is_active(sale_id));
DROP POLICY IF EXISTS "Hide void collections" ON public.credit_payments;
CREATE POLICY "Hide void collections" ON public.credit_payments AS RESTRICTIVE FOR SELECT TO authenticated USING(public.sale_is_active(sale_id));
DROP POLICY IF EXISTS "Owner reads void event notes" ON public.loyalty_events;
CREATE POLICY "Owner reads void event notes" ON public.loyalty_events AS RESTRICTIVE FOR SELECT TO authenticated USING(action<>'bill_voided' OR public.has_role(auth.uid(),'owner'));
CREATE OR REPLACE FUNCTION public.void_sale(_sale_id uuid,_confirmation text,_reason text,_payment_settled boolean,_refund_mode text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sales%ROWTYPE;i record;r jsonb;restored integer:=0;redemptions jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT * INTO s FROM public.sales WHERE id=_sale_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bill not found'; END IF;
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF s.voided_at IS NOT NULL THEN RETURN jsonb_build_object('voided',true,'bill_no',s.bill_no,'replayed',true); END IF;
 IF _confirmation IS DISTINCT FROM s.bill_no OR length(trim(coalesce(_reason,'')))<3 OR length(_reason)>500 THEN RAISE EXCEPTION 'Type the exact bill number and a reason (3 to 500 characters)'; END IF;
 IF s.paid_amount>0 AND (_payment_settled IS DISTINCT FROM true OR _refund_mode IS NULL OR _refund_mode NOT IN ('Cash','UPI','Card','Bank')) THEN RAISE EXCEPTION 'Confirm the original payment is settled and select its refund/reversal method'; END IF;
 IF EXISTS(SELECT 1 FROM public.sale_returns WHERE sale_id=s.id) OR EXISTS(SELECT 1 FROM public.credit_payments WHERE sale_id=s.id) OR EXISTS(SELECT 1 FROM public.catalog_bookings WHERE sale_id=s.id) THEN RAISE EXCEPTION 'This bill has returns, later collections or an online order. Reconcile those transactions instead of cancelling it.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.sale_items WHERE sale_id=s.id) OR EXISTS(SELECT 1 FROM public.sale_items WHERE sale_id=s.id AND variant_id IS NULL) THEN RAISE EXCEPTION 'This historical bill has unlinked product sizes. Reconcile inventory before cancellation.'; END IF;
 IF s.reward_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.loyalty_rewards WHERE id=s.reward_id) THEN RAISE EXCEPTION 'The original redeemed reward is missing. Owner reconciliation is required.'; END IF;
 IF EXISTS(SELECT 1 FROM public.loyalty_rewards WHERE earned_sale_id=s.id AND status='used') THEN RAISE EXCEPTION 'A reward earned by this bill has already been spent. Owner reconciliation is required.'; END IF;
 PERFORM 1 FROM public.product_variants WHERE id IN(SELECT variant_id FROM public.sale_items WHERE sale_id=s.id) ORDER BY id FOR UPDATE;
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 FOR i IN SELECT * FROM public.sale_items WHERE sale_id=s.id ORDER BY id LOOP
  r:=public.process_sale_return(i.id,i.variant_id,i.qty,false,'return','Void incorrect bill: '||trim(_reason),_refund_mode,NULL,gen_random_uuid());
  IF coalesce((r->>'loyalty_review')::boolean,false) THEN RAISE EXCEPTION 'Historical or spent loyalty rewards require owner review before this bill can be cancelled. No changes saved.'; END IF;
  UPDATE public.stock_movements SET type='VOID-RESTORE',note=s.bill_no||' - Incorrect bill cancelled' WHERE type='RETURN' AND variant_id=i.variant_id AND note=s.bill_no||' Void incorrect bill: '||trim(_reason) AND user_id=auth.uid();
  restored:=restored+i.qty;
 END LOOP;
 IF s.reward_id IS NOT NULL THEN
  UPDATE public.loyalty_rewards SET status='active',used_sale_id=NULL WHERE id=s.reward_id AND used_sale_id=s.id AND status='used';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(cr)),'[]'::jsonb) INTO redemptions FROM public.coupon_redemptions cr WHERE cr.sale_id=s.id;
 IF s.coupon_id IS NOT NULL THEN
  PERFORM 1 FROM public.coupons WHERE id=s.coupon_id FOR UPDATE;
  UPDATE public.coupons SET used_count=greatest(used_count-(SELECT count(*)::integer FROM public.coupon_redemptions WHERE sale_id=s.id AND coupon_id=s.coupon_id),0) WHERE id=s.coupon_id;
  DELETE FROM public.coupon_redemptions WHERE sale_id=s.id;
 END IF;
 UPDATE public.sales SET due_amount=0,voided_at=clock_timestamp(),voided_by=auth.uid(),void_reason=trim(_reason),void_refund_mode=_refund_mode,void_metadata=jsonb_build_object('original_due',s.due_amount,'original_paid',s.paid_amount,'coupon_redemptions',redemptions) WHERE id=s.id;
 INSERT INTO public.loyalty_events(customer_id,action,note,sale_id) VALUES(s.customer_id,'bill_voided',s.bill_no||': '||trim(_reason),s.id);
 RETURN jsonb_build_object('voided',true,'bill_no',s.bill_no,'pairs_restored',restored);
END $$;
REVOKE ALL ON FUNCTION public.void_sale(uuid,text,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.void_sale(uuid,text,text,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.list_void_sales(_offset integer DEFAULT 0,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE rows jsonb; v_count bigint;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _offset<0 OR _limit<1 OR _limit>100 THEN RAISE EXCEPTION 'Invalid page'; END IF;
 SELECT count(*) INTO v_count FROM public.sales WHERE voided_at IS NOT NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO rows FROM (SELECT id,bill_no,customer_name,total,voided_at,void_reason FROM public.sales WHERE voided_at IS NOT NULL ORDER BY voided_at DESC,id LIMIT _limit OFFSET _offset)x;
 RETURN jsonb_build_object('rows',rows,'count',v_count);
END $$;
REVOKE ALL ON FUNCTION public.list_void_sales(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_void_sales(integer,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.stored_bill_line_count() RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 RETURN (SELECT count(*) FROM public.sale_items);
END $$;
REVOKE ALL ON FUNCTION public.stored_bill_line_count() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stored_bill_line_count() TO authenticated;
-- A cashier recovering a lost response must not present a cancelled bill as valid.
DO $patch$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure) INTO d;
 IF position('-- void-bill-retry-guard' IN d)=0 THEN
  IF position('if v_existing.staff_id is distinct from auth.uid()' IN d)=0 THEN RAISE EXCEPTION 'Apply approved update 0032 first. No changes committed.'; END IF;
  d:=replace(d,'if v_existing.staff_id is distinct from auth.uid()',E'-- void-bill-retry-guard\n      if v_existing.voided_at is not null then raise exception ''The original billing request was cancelled. Start a fresh bill if needed.''; end if;\n      if v_existing.staff_id is distinct from auth.uid()');
  EXECUTE d;
 END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT to_regprocedure('public.void_sale(uuid,text,text,boolean,text)') IS NOT NULL AS void_bill_ready;
