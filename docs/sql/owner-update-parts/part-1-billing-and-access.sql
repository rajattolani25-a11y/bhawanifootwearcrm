-- PART 1 OF 5. Run this entire part together. Requires approved 0031.
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


COMMIT;
SELECT position('-- retail-integrity-request-v1' IN pg_get_functiondef('public.create_sale(jsonb,jsonb)'::regprocedure))>0 AND NOT has_column_privilege('authenticated','public.sale_returns','cost_reversal','SELECT') AS part_1_ready;
