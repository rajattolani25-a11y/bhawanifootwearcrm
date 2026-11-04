-- Part 8. Source: 0040_billing_defaults_and_readiness.sql. No reset/import/sale is executed.
BEGIN;
-- Optional invoice defaults remain inside the existing Billing settings section.
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS default_bill_type text CHECK(default_bill_type IN('simple','gst'));
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS default_tax_mode text CHECK(default_tax_mode IN('inclusive','exclusive'));
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS default_gst_rate numeric CHECK(default_gst_rate IN(0,5,12,18,28));
CREATE OR REPLACE FUNCTION public.resolve_pending_operation(_request_id uuid,_abandon boolean DEFAULT false,_confirmation text DEFAULT '')RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner')THEN RAISE EXCEPTION'Owner access required';END IF;
 IF _request_id IS NULL THEN RAISE EXCEPTION'Invalid request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,36));
 IF EXISTS(SELECT 1 FROM public.credit_payments WHERE operation_id=_request_id)THEN RETURN jsonb_build_object('state','committed','kind','payment');END IF;
 IF EXISTS(SELECT 1 FROM public.supplier_payments WHERE operation_id=_request_id)THEN RETURN jsonb_build_object('state','committed','kind','supplier payment');END IF;
 IF EXISTS(SELECT 1 FROM public.purchases WHERE operation_id=_request_id)THEN RETURN jsonb_build_object('state','committed','kind','stock receipt');END IF;
 SELECT operation_result INTO result FROM public.stock_movements WHERE operation_id=_request_id;
 IF FOUND THEN RETURN coalesce(result,'{}'::jsonb)||jsonb_build_object('state',CASE WHEN result->>'state'='abandoned'THEN'abandoned'ELSE'committed'END);END IF;
 IF NOT _abandon THEN RETURN jsonb_build_object('state','not_recorded');END IF;
 IF _confirmation IS DISTINCT FROM'ABANDON'THEN RAISE EXCEPTION'Type ABANDON after checking transaction history';END IF;
 INSERT INTO public.stock_movements(type,product_name,qty_in,qty_out,note,user_id,operation_id,operation_result)
 VALUES('OP-ABANDONED','Unconfirmed request closed',0,0,'Owner verified no committed transaction; any late retry is blocked',auth.uid(),_request_id,jsonb_build_object('state','abandoned'));
 RETURN jsonb_build_object('state','abandoned');
END $$;
REVOKE ALL ON FUNCTION public.resolve_pending_operation(uuid,boolean,text)FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resolve_pending_operation(uuid,boolean,text)TO authenticated;
CREATE OR REPLACE FUNCTION public.operational_safety_version()RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT 40$$;
-- Financial and quantity mutations are reachable only through checked RPCs.
REVOKE INSERT,UPDATE,DELETE ON public.credit_payments,public.supplier_payments,public.sales,public.sale_items,public.sale_costs,public.sale_item_costs,public.sale_returns,public.purchases,public.stock_movements,public.product_costs FROM authenticated;
REVOKE INSERT,DELETE ON public.product_variants FROM authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT true AS part_08_applied;
