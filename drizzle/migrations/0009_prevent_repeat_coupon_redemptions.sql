CREATE OR REPLACE FUNCTION public.coupon_discount(_code text, _customer uuid, _subtotal numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.coupons%ROWTYPE; amt numeric;
BEGIN
  IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT * INTO c FROM public.coupons WHERE code = upper(trim(_code));
  IF NOT FOUND OR NOT c.active THEN RAISE EXCEPTION 'Coupon not found or inactive'; END IF;
  IF _customer IS NULL THEN RAISE EXCEPTION 'Select a customer to use a coupon'; END IF;
  IF c.starts_at IS NOT NULL AND c.starts_at > now() THEN RAISE EXCEPTION 'Coupon is not active yet'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at < now() THEN RAISE EXCEPTION 'Coupon has expired'; END IF;
  IF c.usage_limit IS NOT NULL AND c.used_count >= c.usage_limit THEN RAISE EXCEPTION 'Coupon usage limit reached'; END IF;
  IF c.customer_id IS NOT NULL AND c.customer_id IS DISTINCT FROM _customer THEN RAISE EXCEPTION 'This coupon belongs to another customer'; END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE coupon_id = c.id AND customer_id = _customer) THEN RAISE EXCEPTION 'This customer has already used this coupon'; END IF;
  IF coalesce(_subtotal,0) < c.min_bill THEN RAISE EXCEPTION 'Minimum bill for this coupon is Rs %', c.min_bill; END IF;
  amt := CASE WHEN c.kind = 'percent' THEN round(_subtotal * c.value / 100, 2) ELSE c.value END;
  IF c.max_discount IS NOT NULL THEN amt := least(amt, c.max_discount); END IF;
  amt := least(amt, greatest(_subtotal,0));
  RETURN jsonb_build_object('id', c.id, 'code', c.code, 'title', c.title, 'amount', amt);
END $$;

CREATE INDEX IF NOT EXISTS coupon_redemptions_customer_coupon_idx ON public.coupon_redemptions(coupon_id, customer_id);

CREATE OR REPLACE FUNCTION public.guard_coupon_redemption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN RAISE EXCEPTION 'Select a customer to use a coupon'; END IF;
  -- create_sale locks this same coupon row before discount calculation; this also serializes other inserts.
  PERFORM 1 FROM public.coupons WHERE id = NEW.coupon_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE coupon_id = NEW.coupon_id AND customer_id = NEW.customer_id) THEN
    RAISE EXCEPTION 'This customer has already used this coupon';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_coupon_redemption_before_insert BEFORE INSERT ON public.coupon_redemptions FOR EACH ROW EXECUTE FUNCTION public.guard_coupon_redemption();