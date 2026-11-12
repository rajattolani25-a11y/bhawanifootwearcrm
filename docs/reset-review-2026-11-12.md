# Reset review — local source and isolated database

No live reset was executed. The reviewed reset is owner-only, requires exact RESET and a saved checksummed v2 backup with a current fingerprint. Its business-table cleanup is a fixed TRUNCATE CONTINUE IDENTITY RESTRICT, never CASCADE. Failure rolls back database changes. A new/unlisted foreign-key dependency blocks reset rather than silently deleting unknown data.

With default preserve toggles ON:

- Kept: invoking owner's login/access; shop identity, GST/UPI/contact details; saved hero/theme/design; billing and operational/delivery settings. Device language/display preferences remain.
- Cleared: products/variants/stock and movements; sales, lines, returns, costs, purchases, payments and dues; customers/suppliers; online orders; expenses, coupons/redemptions and loyalty business data. Installed optional bargaining policies/sessions participate through the reviewed compatibility patch.
- Other Auth accounts/profiles remain, but their shop roles are revoked. This includes other owners/staff. Reset does not delete Auth accounts or change the invoking owner's password.
- Marketing offer_* settings (including promotions and custom Showcase configuration) clear even when operational settings are preserved. Built-in Showcase artwork lives in application assets and remains available as the app's default artwork.
- Bill numbering continues by default; restart is an explicit separate option.
- Product/custom-poster/promotion files enter the durable Storage API cleanup queue. Preserved hero artwork is excluded. Pending cleanup must be retried separately; a committed database reset must not be run again just because file cleanup failed. Base database allocation/default app assets need not become zero MB.

Isolated PostgreSQL maintenance audit passed, including owner/backup/fingerprint guards, rollback, preservation and physical allocation reclaim. Bargaining and Showcase audits separately passed their backup/reset/restore integrations, with old v2 compatibility. No maintenance/financial SQL definition was changed for this review. These tests verify repository definitions, not the installed production definition or its optional patches.
