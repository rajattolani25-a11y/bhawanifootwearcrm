# Safe reset, recovery and owner handover

Implemented in migration `0025_safe_store_reset.sql`. Applying the migration adds
maintenance support; it **does not execute a reset or transfer ownership**.

## Deployment

1. Sync the commit into the connected Lovable project.
2. Have Lovable apply **only migration 0025_safe_store_reset**, once, through its
   migration runner or SQL editor as one transaction. The repository migration journal includes it.
   Do not replay all older migrations manually.
3. Publish → Update the frontend. Open Settings → Data & backup and verify that
   the support check succeeds. Older backends block this reset UI. The old
   `reset_store_data(text)` deliberately rejects older clients.

No production SQL admin connection was available during implementation. The
migration was tested against all checked-in migrations in disposable PostgreSQL,
not applied to the live shop. Publishing the frontend is not proof of a successful
backend migration. Normal billing/stock RPC implementations were not modified.

## Reset policy

| Area | Behaviour |
| --- | --- |
| Sales/items/cost snapshots/returns/credit payments | Clear |
| Purchases/supplier repayments/expenses | Clear |
| Inventory/products/variants/costs/stock movements | Clear |
| Customers/suppliers, including opening balances | Clear |
| Loyalty, coupons and redemptions | Clear |
| Catalog bookings/orders, including billed orders/history | Clear before their sales/variant parents |
| Current owner login/profile/role | Always preserve |
| Other accounts | Revoke app roles; sign-in accounts and profiles remain, awaiting approval |
| Shop identity (name, address, phone, GSTIN, UPI ID) | Preserve by default; explicit checkbox can reset to database defaults |
| Catalog hero, its separate photo, theme/appearance switches | Preserve by default; explicit checkbox can reset them to database defaults |
| Hero product link | Cleared when the linked product is deleted, even when the design is kept |
| Billing/print settings, daily target, catalog ordering/advance/hold and delivery preferences | Preserve by default; separate checkbox can reset to defaults |
| Festival offer settings and coupon references | Reset to defaults; coupon records/redemption history are removed |
| Product photos, separate unused hero photos | Queue for actual Storage API deletion; kept hero file excluded |
| Bill counter | Continue by default; explicit restart option can reuse numbers on old printed invoices |
| Held bills and saved poster campaigns | Clear on initiating device; other active devices detect generation change on focus or 30-second foreground check |
| Device language and light/dark preference | Preserve |
| Built-in themes, templates and schema/default definitions | Preserve |

No database `storage.objects` metadata is deleted by reset SQL. The Storage API
removes binaries and metadata; only confirmed-absent files leave the owner-only
cleanup queue. Failed cleanup is visible and retryable without repeating reset.
A restrictive Storage policy also protects photos referenced by current product
or hero rows, including during concurrent cleanup/restoration. Old signed image
URLs may remain valid until their existing expiry; deleting a file is not a way
to recall already downloaded copies.

## Use reset

Pause other billing/editing/maintenance sessions; temporarily disable catalog
ordering if customers may order during this maintenance window. In Settings →
Data & backup (only Download backup, Reset business data and Restore backup are
shown initially; old offline import is collapsed):

1. Download **business + photo backup**.
2. Select that actual saved file again; the app verifies format, required table
   manifest, envelope checksum and each embedded photo's SHA-256/byte count.
3. Open Reset business data, review the short preserve summary and type **RESET**.
   Detailed choices live inside the closed Advanced: change what stays section;
   normal reset requires no extra settings configuration.
4. Reset runs as one database transaction and rejects a backup if the store has
   changed since it was captured. Download/verify again if this happens.
5. Wait for photo cleanup. If it fails, use Retry photo cleanup. Do not run reset
   again to retry files. Reload when finished.

The backup contains sensitive business data. Auth passwords, sessions and private
service keys are never exported. Team metadata is reference only. Browser backup
limits are **100 MB JSON / 50 MB photo bytes**; larger stores fail closed and need
an administrator-managed database + Storage backup. This is not an unlimited,
full Supabase-project/Auth disaster recovery export.

Offline devices clear persisted business drafts when they next open/reconnect
and detect the new generation. Background tabs check on becoming visible. There
is no claim that an offline device is erased remotely. If device storage is
blocked, the UI reports that manual draft cleanup is required. Auth tokens are
never cleared by business reset.

## Restore

Use Restore a verified version 2 backup, select the saved file and type
**RESTORE**. It is accepted only on the **same backend installation**, with empty
business tables and no unfinished cleanup. Cross-shop import and merging are
blocked. Photos are checksum checked, staged for retryable cleanup, and uploaded
without overwrite. Existing identical photos may be reused.

Rows restore atomically in FK order, including private cost snapshots and catalog
history. Only user triggers are temporarily suspended inside this transaction;
FK and constraint triggers stay active. Failed restores roll back all row/settings
changes and trigger state; uploaded files remain queued for cleanup. Restoring
never grants old staff/owner permissions or imports Auth passwords. Invoice
numbering resumes at least at the backed-up next number without moving a newer
counter backwards.

The old offline importer is separate. It rejects current cloud/v2 backup formats
**before any write**. Older, incomplete cloud JSON exports need a reviewed
conversion; do not feed them into the offline legacy importer.

## New owner after reset

Reset keeps the present owner, so the shop is never left open to the next public
signup. For a different owner:

1. They open `/auth`, choose **Create account**, and use their own email/password.
2. They complete email verification when required. An unverified, deleted or
   banned account is rejected by the handover RPC.
3. Current owner opens **Settings → Team → New owner / hand over this store**,
   enters the new owner's email and types **TRANSFER**, then confirms the named
   handover.
4. A single transaction makes the target Owner and removes the outgoing owner's
   app access. Existing other team roles remain; review them before handover.
5. The outgoing browser signs out; the new owner signs in/reloads. Other active
   devices refresh on the generation change. Existing last-owner safeguards stay. Queued team-role requests recheck the
   caller’s owner access after the shared handover lock.

To retain both owners, use the existing **Owner** role button in Team instead.
Do not share the old owner's password to hand over the store.

## Remix

A genuinely new, isolated backend with no owner gives its first signup Owner via
migration 0017's existing trigger (verified in isolated SQL tests). A store reset
is different: it retains Auth accounts and an owner. Do **not reset the original
shop** in order to remix it. Check the new backend project reference, Auth users,
roles, data and storage independently. A new frontend URL alone proves no database
isolation. Actual Lovable remix-copy behaviour was not exercised here.

## Verification and rollback

- `python tests/store-maintenance-db-audit.py`: network-disabled disposable
  PostgreSQL 17, all actual checked-in migrations, every backup table seeded,
  genuine role guards/signup trigger, both billed/unbilled orders. Checks stale
  backups, transaction rollback, exact round-trip rows/settings, foreign keys,
  photo policy/cleanup acknowledgements, preserve options and owner handover.
  Storage service metadata is a fixture; no real Storage binaries or live Auth.
- `tests/store-maintenance-browser-audit.mjs`: actual Settings and mobile UI,
  all off-origin HTTP/WebSockets mocked, download/reselect verification, damaged
  file refusal, Storage failure/retry, restore, legacy rejection, remote reset
  draft clearing and revoked-user approval screen.
- `tests/store-backup-format.test.mjs`: checksums, manifest failures, photo
  corruption and selective draft cleanup.

Application rollback can revert the code commit with a normal `git revert`.
Keep the additive SQL maintenance schema and its fail-closed old-reset guard;
frontend rollback does not undo an already executed data reset. For data recovery,
use the verified backup workflow before rollback. Do not drop maintenance tables
with queued files or reopen owner signup as a shortcut.

Evidence: [database checks](audit/evidence/maintenance-2026-11-02/database.json),
[browser checks](audit/evidence/maintenance-2026-11-02/browser.json),
[navigation regression](audit/evidence/maintenance-2026-11-02/navigation.json),
[verification record](audit/evidence/maintenance-2026-11-02/verification.json),
[compact mobile Settings](audit/evidence/maintenance-2026-11-02/settings-mobile.png).
All screenshots and browser actions use synthetic shop data.
