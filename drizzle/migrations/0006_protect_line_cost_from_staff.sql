CREATE TABLE public.sale_item_costs (sale_item_id uuid PRIMARY KEY REFERENCES public.sale_items(id) ON DELETE CASCADE, unit_cost numeric NOT NULL);
GRANT SELECT ON public.sale_item_costs TO authenticated;
GRANT ALL ON public.sale_item_costs TO service_role;
ALTER TABLE public.sale_item_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads line costs" ON public.sale_item_costs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'owner'));
CREATE OR REPLACE FUNCTION public.capture_sale_item_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN new; END $$;
CREATE OR REPLACE FUNCTION public.store_sale_item_cost() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cost numeric;
BEGIN
 SELECT pc.purchase_price INTO v_cost FROM public.product_variants pv JOIN public.product_costs pc ON pc.product_id=pv.product_id WHERE pv.id=new.variant_id;
 IF v_cost IS NOT NULL THEN INSERT INTO public.sale_item_costs(sale_item_id,unit_cost) VALUES (new.id,v_cost); END IF;
 RETURN new;
END $$;
CREATE TRIGGER store_sale_item_cost AFTER INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.store_sale_item_cost();
CREATE OR REPLACE FUNCTION public.reset_store_data(_confirmation text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _confirmation <> 'RESET BHAWANI FOOTWEAR' THEN RAISE EXCEPTION 'Confirmation text does not match'; END IF;
 DELETE FROM public.loyalty_events WHERE id IS NOT NULL; DELETE FROM public.loyalty_rewards WHERE id IS NOT NULL;
 DELETE FROM public.credit_payments WHERE id IS NOT NULL; DELETE FROM public.sale_returns WHERE id IS NOT NULL;
 DELETE FROM public.sale_costs WHERE sale_id IS NOT NULL; DELETE FROM public.sale_item_costs WHERE sale_item_id IS NOT NULL;
 DELETE FROM public.sale_items WHERE id IS NOT NULL; DELETE FROM public.sales WHERE id IS NOT NULL;
 DELETE FROM public.expenses WHERE id IS NOT NULL; DELETE FROM public.supplier_payments WHERE id IS NOT NULL;
 DELETE FROM public.purchases WHERE id IS NOT NULL; DELETE FROM public.stock_movements WHERE id IS NOT NULL;
 DELETE FROM public.product_costs WHERE product_id IS NOT NULL; DELETE FROM public.product_variants WHERE id IS NOT NULL;
 DELETE FROM public.products WHERE id IS NOT NULL; DELETE FROM public.suppliers WHERE id IS NOT NULL; DELETE FROM public.customers WHERE id IS NOT NULL;
END $$;
REVOKE SELECT ON public.sale_items FROM authenticated;
GRANT SELECT (id,sale_id,variant_id,product_name,size,sku,price,qty,discount) ON public.sale_items TO authenticated;
COMMENT ON COLUMN public.sale_items.unit_cost IS 'DEPRECATED: use owner-only sale_item_costs; historical values pending migration';