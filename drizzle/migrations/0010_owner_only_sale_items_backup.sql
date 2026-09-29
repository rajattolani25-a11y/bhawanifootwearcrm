CREATE OR REPLACE FUNCTION public.backup_sale_items(_offset integer DEFAULT 0, _limit integer DEFAULT 1000)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN RAISE EXCEPTION 'Owner access required'; END IF;
  IF _offset < 0 OR _limit < 1 OR _limit > 1000 THEN RAISE EXCEPTION 'Invalid backup page'; END IF;
  RETURN QUERY SELECT to_jsonb(si) FROM public.sale_items si ORDER BY si.id LIMIT _limit OFFSET _offset;
END $$;
REVOKE ALL ON FUNCTION public.backup_sale_items(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backup_sale_items(integer, integer) TO authenticated;