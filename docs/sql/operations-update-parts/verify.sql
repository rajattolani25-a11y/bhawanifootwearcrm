-- Read-only final check. Ready must be true; then publish matching frontend.
SELECT public.operational_safety_version()=40
 AND to_regprocedure('public.adjust_inventory(uuid,integer,integer,integer,integer,text,text,text)')IS NOT NULL
 AND to_regprocedure('public.receive_customer_payment(uuid,numeric,text,text,uuid)')IS NOT NULL
 AND to_regprocedure('public.collect_credit_payment_v2(uuid,numeric,text,text,uuid)')IS NOT NULL
 AND to_regprocedure('public.record_supplier_payment_v2(uuid,numeric,text,text,uuid,uuid)')IS NOT NULL
 AND to_regprocedure('public.receive_stock_v2(uuid,text,text,jsonb,uuid)')IS NOT NULL
 AND to_regprocedure('public.create_catalog_order(uuid,text,text,text,text,text,text,uuid,jsonb)')IS NOT NULL
 AND to_regprocedure('public.record_catalog_refund(uuid,text,text,uuid)')IS NOT NULL
 AND to_regprocedure('public.import_legacy_store(jsonb,uuid)')IS NOT NULL
 AND to_regprocedure('public.resolve_pending_operation(uuid,boolean,text)')IS NOT NULL
 AND NOT has_table_privilege('authenticated','public.credit_payments','INSERT')
 AND NOT has_table_privilege('authenticated','public.product_variants','UPDATE')
 AS ready_for_matching_frontend;
SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')AS optional_idle_scheduler_available;
