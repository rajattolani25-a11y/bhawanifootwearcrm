ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0 CHECK (opening_balance >= 0);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0 CHECK (opening_balance >= 0);

create or replace function public.guard_customer_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.loyalty_bypass', true),'') = '1' or public.has_role(auth.uid(),'owner') then
    return new;
  end if;
  if new.is_premium is distinct from old.is_premium
     or new.regular_stamps is distinct from old.regular_stamps
     or new.premium_stamps is distinct from old.premium_stamps
     or new.regular_visits is distinct from old.regular_visits
     or new.premium_visits is distinct from old.premium_visits
     or new.last_stamp_date is distinct from old.last_stamp_date
     or new.opening_balance is distinct from old.opening_balance then
    raise exception 'Only the Owner can change premium, stamps or opening balance';
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.reset_store_data(_confirmation text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF upper(trim(coalesce(_confirmation,''))) <> 'RESET' THEN RAISE EXCEPTION 'Confirmation text does not match'; END IF;
 DELETE FROM public.coupon_redemptions WHERE id IS NOT NULL; DELETE FROM public.coupons WHERE id IS NOT NULL;
 DELETE FROM public.loyalty_events WHERE id IS NOT NULL; DELETE FROM public.loyalty_rewards WHERE id IS NOT NULL;
 DELETE FROM public.credit_payments WHERE id IS NOT NULL; DELETE FROM public.sale_returns WHERE id IS NOT NULL;
 DELETE FROM public.sale_costs WHERE sale_id IS NOT NULL; DELETE FROM public.sale_item_costs WHERE sale_item_id IS NOT NULL;
 DELETE FROM public.sale_items WHERE id IS NOT NULL; DELETE FROM public.sales WHERE id IS NOT NULL;
 DELETE FROM public.expenses WHERE id IS NOT NULL; DELETE FROM public.supplier_payments WHERE id IS NOT NULL;
 DELETE FROM public.purchases WHERE id IS NOT NULL; DELETE FROM public.stock_movements WHERE id IS NOT NULL;
 DELETE FROM public.product_costs WHERE product_id IS NOT NULL; DELETE FROM public.product_variants WHERE id IS NOT NULL;
 DELETE FROM public.products WHERE id IS NOT NULL; DELETE FROM public.suppliers WHERE id IS NOT NULL; DELETE FROM public.customers WHERE id IS NOT NULL;
END $function$;