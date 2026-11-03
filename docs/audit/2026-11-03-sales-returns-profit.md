# Returns and missing purchase cost: reporting correction

Frontend-only correction. No migration, database function, sale/return transaction,
stock deduction, reset, stored invoice or historical cost has been changed.

## Behaviour

- Dashboard reads recorded returns and subtracts their refund and GST/cost
  reversals from the relevant day. Daily trend and merchandise quantities include
  returns; negative return-only days remain visible. Return events invalidate the
  visible financial/customer/khata queries, including after another counter's event.
- Reports/Accounting lead with **net sales**. Gross sales and returns remain
  separately identified. Daily/payment-mode/article/size/GST breakdowns reflect
  recorded returns. Average original bill and original discount fields remain
  historical bill measures. Report CSV contains separate sale and negative return
  transactions; accounting CSV/PDF use the same net figures as the screen.
- Sales History and customer lifetime spend show net-after-return amounts. Original
  bill amount and returned amount remain visible. Customer directory PDF uses net
  lifetime spend. WhatsApp bill summaries include returned amount and net amount;
  the offline Hindi/Hinglish templates preserve these lines.
- All three bill print styles retain the original issued invoice, with an appended
  current return/exchange summary. This is a status summary, not a generated GST
  credit note. Download/share use that same print document.
- Customer khata adds dated returned-goods credits and actual recorded refund
  payouts as debits. A return that reduces credit due is not misrepresented as a
  customer payment. The same entries feed screen, CSV, PDF and statement sharing.
- Profit/margin are unavailable if any relevant sale or return lacks a positive
  recorded historical line cost. Mixed known/unknown bills cannot silently treat
  unknown lines as zero. Current product cost never backfills old bills. Existing
  zero-cost records are conservatively labelled missing/zero because the old data
  does not reliably establish whether a zero was intentional. No fake zero profit
  or full-revenue profit is substituted. CSV marks missing profit; PDF shows status.

Returns are recognised on **created_at (return date)**. A sale yesterday followed
by a full return today creates negative net sales today; it does not rewrite
yesterday's original sale. Size exchanges keep their existing zero-refund handling;
this correction does not create a replacement-billing/credit-note workflow.

## Existing data limit: cash refunds

`cash_refund` stores payout after due adjustment, but the return RPC records no
refund payment method. It cannot prove the payout was cash. Accounting now names
these payouts explicitly and marks net cash movement unconfirmed where a payout
exists, rather than assuming every UPI/Card refund was cash. Gross receipts by
payment mode stay labelled as receipts. Recording an actual refund payment method
would require a separately approved backend change; none was made here.

## Verification

- TypeScript check and production build pass.
- ESLint passes on the changed financial modules.
- Eight focused unit/cache checks cover full/partial/defect returns, tax/cost
  reversals, exchange exclusion, return-only negative periods, paise rounding,
  missing/mixed costs, >1,000 returns and credit-versus-payment reconciliation.
- Browser audit uses real screens with synthetic HTTP data: ₹2,200 sale / ₹1,400
  cost produces ₹800 profit; full return produces ₹0 net sales and ₹0 profit;
  returning one of two pairs produces ₹1,100 net sales and ₹400 profit. Missing
  cost shows status rather than ₹2,200 profit. Tests cover Reports, Accounting,
  Sales History, customer lifetime spend, khata exports, offline WhatsApp text,
  original invoice plus return summary in Thermal/A4/Premium, and return of an old
  bill outside the current sale-date window.
- Actual A4 PDF downloaded from the UI: valid one-page A4 PDF, visually inspected
  with original ₹2,200, returned ₹2,200 and net ₹0. No live return/write was run.

Commands:

```sh
node --experimental-strip-types --test tests/sales-returns.test.mjs tests/refresh-cache.test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/sales-financial-browser-audit.mjs
npx tsc --noEmit
npm run build
```

Evidence for this session: `/tmp/solestack-audit/sales-financial/`.
The unrelated optional catalog-description storage approval remains pending.
