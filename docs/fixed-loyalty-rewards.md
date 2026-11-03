# Fixed loyalty rewards

The owner changed the requested rule to **Regular ₹100 / Premium ₹200** at every
fifth eligible visit. Milestones are 5, 10, 15 and 20, followed by the existing
20-stamp reset and repeat (visit 25 earns the same amount again).

The old repository/backend rule was escalating: Regular 100/250/600 and Premium
200/500/1200 at 5/10/20 stamps. It skipped 15. Customer card previews mirrored those
old values. New card previews/milestone markers include 15 and keep amounts fixed.

## Apply manually

Run the complete `drizzle/migrations/0031_fixed_loyalty_rewards.sql` in SQL Editor.
Three final checks should be true, then Publish → Update from Lovable. SQL has not
been applied to the live database by this workspace.

The migration replaces only `reward_amount` and patches the two milestone checks
in the CURRENT `create_sale` definition. It refuses an unexpected definition and
rolls back the transaction, rather than replacing unrecognised billing logic.
Repeat application is safe. No existing row, reward, bill, customer count, coupon,
stock, payment, GST, reset function or grant is rewritten. Already-issued active/
used vouchers keep their original entitlement; this rule is for future rewards.

Eligibility stays as before: regular bills ₹299–₹998.99, premium ₹999+, one stamp
per customer per IST day, and the POS stamp switch still applies. A premium bill
receives the premium stamp only, not both cards. No new settings are introduced.

## Validation

`python tests/fixed-loyalty-db-audit.py` runs genuine billing on offline disposable
PostgreSQL 17. It reproduces the old schedule, checks both cards across 25 eligible
visits, 15th reward, cycle reset, same-day cap, minimum amount, stamp-off switch,
old voucher preservation, idempotence, and full rollback for incompatible billing
code. It also compares the complete billing function definition to prove only the
two milestone expressions changed. No live database is accessed.

`node --experimental-strip-types --test tests/loyalty-schedule.test.mjs` checks the
UI schedule for both cards through the reset. Existing discounts and redemption
continue to use the stored voucher amount, including pre-change vouchers.
