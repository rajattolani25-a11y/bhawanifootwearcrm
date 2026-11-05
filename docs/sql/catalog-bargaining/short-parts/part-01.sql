ROLLBACK;
BEGIN;
DO $$ BEGIN IF public.operational_safety_version()<>40 THEN RAISE EXCEPTION 'Apply and verify operations update 0040 first'; END IF; END $$;
CREATE TABLE IF NOT EXISTS public.catalog_bargain_policies ( product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false, kind text NOT NULL CHECK(kind IN('amount','percent')),
 min_discount numeric NOT NULL DEFAULT 0 CHECK(min_discount>=0 AND min_discount::text NOT IN('NaN','Infinity','-Infinity')),
 max_discount numeric NOT NULL DEFAULT 0 CHECK(max_discount>=min_discount AND max_discount::text NOT IN('NaN','Infinity','-Infinity')),
 rounding integer NOT NULL DEFAULT 5 CHECK(rounding IN(5,10)), revision uuid NOT NULL DEFAULT gen_random_uuid() );
CREATE TABLE IF NOT EXISTS public.catalog_bargain_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
 variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
 client_hash text NOT NULL, generation uuid NOT NULL, policy_revision uuid NOT NULL,
 listed_price numeric NOT NULL, price numeric NOT NULL, offer numeric NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 2), bids jsonb NOT NULL DEFAULT '[]',
 quote_id uuid NOT NULL DEFAULT gen_random_uuid(), state text NOT NULL DEFAULT 'counter', heading integer NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), order_request_id uuid, UNIQUE(product_id,client_hash) );
CREATE INDEX IF NOT EXISTS catalog_bargain_sessions_age ON public.catalog_bargain_sessions(created_at);
ALTER TABLE public.catalog_bargain_policies ENABLE ROW LEVEL SECURITY; ALTER TABLE public.catalog_bargain_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_bargain_policies,public.catalog_bargain_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.catalog_bargain_policies TO authenticated; DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'AND tablename='catalog_bargain_policies'AND policyname='owner reads bargain rules') THEN
  CREATE POLICY "owner reads bargain rules" ON public.catalog_bargain_policies FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'owner')); END IF;
END $$; ALTER TABLE public.catalog_bookings ADD COLUMN IF NOT EXISTS bargain_id uuid;
CREATE OR REPLACE FUNCTION public.owner_catalog_bargain_policy(_product_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.catalog_bargain_policies%ROWTYPE; BEGIN IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT * INTO p FROM public.catalog_bargain_policies WHERE product_id=_product_id;
 RETURN coalesce(to_jsonb(p)-'product_id',jsonb_build_object('enabled',false,'kind','amount','min_discount',0,'max_discount',0,'rounding',5,'revision',null));
END $$; REVOKE ALL ON FUNCTION public.owner_catalog_bargain_policy(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_catalog_bargain_policy(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.save_catalog_bargain_policy(_product_id uuid,_policy jsonb,_expected_revision uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE price numeric; p public.catalog_bargain_policies%ROWTYPE; en boolean:=(_policy->>'enabled')::boolean;
 kind text:=_policy->>'kind'; lo numeric:=(_policy->>'min_discount')::numeric; hi numeric:=(_policy->>'max_discount')::numeric; step integer:=(_policy->>'rounding')::integer; floor_price numeric; ceiling numeric;
BEGIN IF NOT public.has_role(auth.uid(),'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
 SELECT selling_price INTO price FROM public.products WHERE id=_product_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
 IF en IS NULL OR kind NOT IN('amount','percent') OR kind IS NULL OR step NOT IN(5,10) OR step IS NULL OR lo IS NULL OR hi IS NULL OR lo<0 OR hi<lo OR lo::text IN('NaN','Infinity','-Infinity') OR hi::text IN('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Enter a valid minimum and maximum discount.'; END IF;
 IF en THEN
  IF price<=0 OR hi<=0 OR kind='percent'AND hi>=100 OR kind='amount'AND hi>=price THEN RAISE EXCEPTION 'The maximum discount must leave a price above zero.'; END IF;
  floor_price:=ceil((price-CASE WHEN kind='percent'THEN price*hi/100 ELSE hi END)/step)*step;
  ceiling:=floor((price-CASE WHEN kind='percent'THEN price*lo/100 ELSE lo END)/step)*step;
  IF floor_price>ceiling OR floor_price>=price OR floor_price<=0 THEN RAISE EXCEPTION 'This range has no valid rounded bargain price. Widen the range or change rounding.'; END IF;
 END IF; SELECT * INTO p FROM public.catalog_bargain_policies WHERE product_id=_product_id FOR UPDATE;
 IF p.revision IS DISTINCT FROM _expected_revision THEN RAISE EXCEPTION 'Bargaining rules changed. Reload before saving.'; END IF;
 INSERT INTO public.catalog_bargain_policies(product_id,enabled,kind,min_discount,max_discount,rounding)VALUES(_product_id,en,kind,lo,hi,step)
 ON CONFLICT(product_id)DO UPDATE SET enabled=en,kind=EXCLUDED.kind,min_discount=lo,max_discount=hi,rounding=step,revision=gen_random_uuid();
 RETURN public.owner_catalog_bargain_policy(_product_id); END $$; REVOKE ALL ON FUNCTION public.save_catalog_bargain_policy(uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_catalog_bargain_policy(uuid,jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.catalog_bargain_enabled() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT '[]'::jsonb $$; REVOKE ALL ON FUNCTION public.catalog_bargain_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_bargain_enabled() TO anon,authenticated;
COMMIT;
