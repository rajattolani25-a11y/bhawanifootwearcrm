-- Part 2. Source: 0036_receipts_and_retry_safety.sql. No reset/import/sale is executed.
BEGIN;
-- Adds nullable audit fields on existing backup/reset tables. No historic balance rewrite.
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS operation_id uuid;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS operation_hash text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS operation_result jsonb;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_initial numeric;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS opening_initial numeric;
ALTER TABLE public.credit_payments ALTER COLUMN sale_id DROP NOT NULL;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS entry_kind text;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.catalog_bookings(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS operation_id uuid;
ALTER TABLE public.credit_payments ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS operation_id uuid;
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS opening_amount numeric;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS operation_id uuid;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS request_hash text;
CREATE INDEX IF NOT EXISTS credit_operation_idx ON public.credit_payments(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS supplier_operation_idx ON public.supplier_payments(operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_operation_idx ON public.purchases(operation_id) WHERE operation_id IS NOT NULL;
DROP POLICY IF EXISTS "Hide void collections" ON public.credit_payments;
CREATE POLICY "Hide void collections" ON public.credit_payments AS RESTRICTIVE FOR SELECT TO authenticated USING(sale_id IS NULL OR public.sale_is_active(sale_id));
CREATE OR REPLACE FUNCTION public.guard_opening_receipt_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT'THEN
  IF current_user='authenticated'THEN
   IF NEW.opening_balance<0 OR NEW.opening_balance::text IN('NaN','Infinity','-Infinity') OR NEW.opening_balance<>round(NEW.opening_balance,2) THEN RAISE EXCEPTION'Invalid opening balance';END IF;
   IF NOT public.has_role(auth.uid(),'owner')AND NEW.opening_balance<>0 THEN RAISE EXCEPTION'Owner access required for opening balances';END IF;
   NEW.opening_initial:=NULL;
  END IF;
  RETURN NEW;
 END IF;
 IF current_user='authenticated' AND (NEW.opening_balance IS DISTINCT FROM OLD.opening_balance OR NEW.opening_initial IS DISTINCT FROM OLD.opening_initial) THEN
  RAISE EXCEPTION 'Use the verified opening-balance editor; repayment history must be preserved';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_opening_receipts ON public.customers;
CREATE TRIGGER protect_opening_receipts BEFORE INSERT OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.guard_opening_receipt_history();
DROP TRIGGER IF EXISTS protect_opening_receipts ON public.suppliers;
CREATE TRIGGER protect_opening_receipts BEFORE INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.guard_opening_receipt_history();
CREATE OR REPLACE FUNCTION public.set_party_opening(_kind text,_id uuid,_amount numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE initial numeric; remaining numeric; paid numeric;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _amount IS NULL OR _amount<0 OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Invalid opening balance'; END IF;
 IF _kind='customer' THEN
  SELECT coalesce(opening_initial,opening_balance),opening_balance INTO initial,remaining FROM public.customers WHERE id=_id FOR UPDATE;
 ELSIF _kind='supplier' THEN
  SELECT coalesce(opening_initial,opening_balance),opening_balance INTO initial,remaining FROM public.suppliers WHERE id=_id FOR UPDATE;
 ELSE RAISE EXCEPTION 'Invalid account type'; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
 paid:=initial-remaining;
 IF round(_amount,2)<paid THEN RAISE EXCEPTION 'Opening balance cannot be lower than its recorded repayments (%)',paid; END IF;
 IF _kind='customer' THEN UPDATE public.customers SET opening_initial=round(_amount,2),opening_balance=round(_amount,2)-paid WHERE id=_id;
 ELSE UPDATE public.suppliers SET opening_initial=round(_amount,2),opening_balance=round(_amount,2)-paid WHERE id=_id; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_party_opening(text,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_party_opening(text,uuid,numeric) TO authenticated;
CREATE OR REPLACE FUNCTION public.collect_credit_payment_v2(_sale_id uuid,_amount numeric,_mode text,_note text,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.sales%ROWTYPE; previous public.credit_payments%ROWTYPE; h text;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _request_id IS NULL OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') OR _mode IS NULL OR _mode NOT IN ('Cash','UPI','Card','Bank') THEN RAISE EXCEPTION 'Invalid payment or request identifier'; END IF;
 h:=md5(jsonb_build_array('credit',_sale_id,_amount,_mode,_note,auth.uid())::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,36));
 IF EXISTS(SELECT 1 FROM public.stock_movements WHERE operation_id=_request_id AND type='OP-ABANDONED') THEN RAISE EXCEPTION 'This request was closed by the Owner. Check transaction history.';END IF;
 SELECT * INTO previous FROM public.credit_payments WHERE operation_id=_request_id LIMIT 1;
 IF FOUND THEN
  IF previous.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Payment retry differs from original request'; END IF;
  SELECT * INTO s FROM public.sales WHERE id=_sale_id;
  RETURN jsonb_build_object('collected',previous.amount,'due',s.due_amount,'replayed',true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||(SELECT customer_id::text FROM public.sales WHERE id=_sale_id),400));
 SELECT * INTO s FROM public.sales WHERE id=_sale_id AND voided_at IS NULL FOR UPDATE;
 IF NOT FOUND OR _amount>s.due_amount THEN RAISE EXCEPTION 'Payment exceeds outstanding balance or bill is unavailable'; END IF;
 INSERT INTO public.credit_payments(sale_id,customer_id,amount,payment_mode,note,collected_by,entry_kind,operation_id,request_hash)
 VALUES(s.id,s.customer_id,_amount,_mode,left(coalesce(_note,''),300),auth.uid(),'credit',_request_id,h);
 UPDATE public.sales SET paid_amount=paid_amount+_amount,due_amount=due_amount-_amount WHERE id=s.id;
 RETURN jsonb_build_object('bill_no',s.bill_no,'collected',_amount,'due',s.due_amount-_amount);
END $$;
REVOKE ALL ON FUNCTION public.collect_credit_payment_v2(uuid,numeric,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collect_credit_payment_v2(uuid,numeric,text,text,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.collect_credit_payment(uuid,numeric,text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.receive_customer_payment(_customer_id uuid,_amount numeric,_mode text,_note text,_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.customers%ROWTYPE; s public.sales%ROWTYPE; h text; oldhash text; remaining numeric:=_amount; part numeric; balance numeric;
BEGIN
 IF NOT public.is_member(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF _request_id IS NULL OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') OR _mode IS NULL OR _mode NOT IN ('Cash','UPI','Card','Bank') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
 h:=md5(jsonb_build_array('customer',_customer_id,_amount,_mode,_note,auth.uid())::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,36));
 IF EXISTS(SELECT 1 FROM public.stock_movements WHERE operation_id=_request_id AND type='OP-ABANDONED') THEN RAISE EXCEPTION 'This request was closed by the Owner. Check transaction history.';END IF;
 SELECT request_hash INTO oldhash FROM public.credit_payments WHERE operation_id=_request_id LIMIT 1;
 IF FOUND THEN
  IF oldhash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Payment retry differs from original request'; END IF;
  RETURN jsonb_build_object('collected',_amount,'replayed',true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer:'||_customer_id::text,400));
 SELECT * INTO c FROM public.customers WHERE id=_customer_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
 SELECT coalesce(sum(due_amount),0)+c.opening_balance INTO balance FROM public.sales WHERE customer_id=c.id AND voided_at IS NULL;
 IF _amount>balance THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
 FOR s IN SELECT * FROM public.sales WHERE customer_id=c.id AND due_amount>0 AND voided_at IS NULL ORDER BY sale_date,id FOR UPDATE LOOP
  part:=least(s.due_amount,remaining);
  IF part<=0 THEN EXIT; END IF;
  INSERT INTO public.credit_payments(sale_id,customer_id,amount,payment_mode,note,collected_by,entry_kind,operation_id,request_hash)
  VALUES(s.id,c.id,part,_mode,left(coalesce(_note,''),300),auth.uid(),'credit',_request_id,h);
  UPDATE public.sales SET paid_amount=paid_amount+part,due_amount=due_amount-part WHERE id=s.id;
  remaining:=remaining-part;
 END LOOP;
 IF remaining>0 THEN
  IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Only the Owner can receive an opening-balance repayment'; END IF;
  INSERT INTO public.credit_payments(customer_id,amount,payment_mode,note,collected_by,entry_kind,operation_id,request_hash)
  VALUES(c.id,remaining,_mode,left(coalesce(_note,''),300),auth.uid(),'opening',_request_id,h);
  UPDATE public.customers SET opening_initial=coalesce(opening_initial,opening_balance),opening_balance=opening_balance-remaining WHERE id=c.id;
 END IF;
 RETURN jsonb_build_object('collected',_amount,'due',balance-_amount);
END $$;
REVOKE ALL ON FUNCTION public.receive_customer_payment(uuid,numeric,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_customer_payment(uuid,numeric,text,text,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_supplier_payment_v2(_supplier_id uuid,_amount numeric,_mode text,_note text,_request_id uuid,_purchase_id uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.suppliers%ROWTYPE; p public.purchases%ROWTYPE; balance numeric; remaining numeric:=_amount; part numeric; h text; prev public.supplier_payments%ROWTYPE;
BEGIN
 IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 IF _request_id IS NULL OR _amount IS NULL OR _amount<=0 OR _amount<>round(_amount,2) OR _amount::text IN ('NaN','Infinity','-Infinity') OR _mode IS NULL OR _mode NOT IN ('Cash','UPI','Card','Bank') THEN RAISE EXCEPTION 'Invalid payment'; END IF;
 h:=md5(jsonb_build_array(_supplier_id,_amount,_mode,_note,_purchase_id,auth.uid())::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,36));
 IF EXISTS(SELECT 1 FROM public.stock_movements WHERE operation_id=_request_id AND type='OP-ABANDONED') THEN RAISE EXCEPTION 'This request was closed by the Owner. Check transaction history.';END IF;
 SELECT * INTO prev FROM public.supplier_payments WHERE operation_id=_request_id LIMIT 1;
 IF FOUND THEN
  IF prev.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'Payment retry differs from original request'; END IF;
  SELECT coalesce(sum(purchase_row.total-purchase_row.paid_amount),0)+CASE WHEN _purchase_id IS NULL THEN (SELECT opening_balance FROM public.suppliers WHERE id=_supplier_id) ELSE 0 END INTO balance FROM public.purchases purchase_row WHERE purchase_row.supplier_id=_supplier_id AND (_purchase_id IS NULL OR purchase_row.id=_purchase_id);
  RETURN balance;
 END IF;
 SELECT * INTO s FROM public.suppliers WHERE id=_supplier_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Supplier not found'; END IF;
 SELECT coalesce(sum(total-paid_amount),0)+CASE WHEN _purchase_id IS NULL THEN s.opening_balance ELSE 0 END INTO balance FROM public.purchases WHERE supplier_id=s.id AND (_purchase_id IS NULL OR id=_purchase_id);
 IF _amount>balance THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
 FOR p IN SELECT * FROM public.purchases WHERE supplier_id=s.id AND total>paid_amount AND (_purchase_id IS NULL OR id=_purchase_id) ORDER BY purchase_date,id FOR UPDATE LOOP
  part:=least(p.total-p.paid_amount,remaining);
  IF part<=0 THEN EXIT; END IF;
  UPDATE public.purchases SET paid_amount=paid_amount+part WHERE id=p.id;
  remaining:=remaining-part;
 END LOOP;
 IF remaining>0 THEN UPDATE public.suppliers SET opening_initial=coalesce(opening_initial,opening_balance),opening_balance=opening_balance-remaining WHERE id=s.id; END IF;
 INSERT INTO public.supplier_payments(supplier_id,purchase_id,amount,payment_mode,note,recorded_by,opening_amount,operation_id,request_hash)
 VALUES(s.id,_purchase_id,_amount,_mode,left(coalesce(_note,''),300),auth.uid(),remaining,_request_id,h);
 RETURN balance-_amount;
END $$;
REVOKE ALL ON FUNCTION public.record_supplier_payment_v2(uuid,numeric,text,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment_v2(uuid,numeric,text,text,uuid,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_supplier_payment(uuid,numeric,text,text,uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
SELECT true AS part_02_applied;
