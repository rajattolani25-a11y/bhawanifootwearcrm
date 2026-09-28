# SoleStack reliability and retail-profile upgrade

## Goal
Make the daily counter flow trustworthy on phone and desktop: correct stock/cost/accounting numbers, dependable bill/label/poster output, scan-ready QR + barcode labels, and clear product/supplier drill-down profiles.

## Dashboard live copy
Replace the current greeting with a shorter live retail message:

**Good morning, Rajat. The counter is live.**

**Today’s sales, stock movement and urgent actions—updated as they happen.**

Keep the IST clock and LIVE ticker beside it; the greeting changes automatically for morning, afternoon and evening.

## What the audit found
- Purchase cost is initialized as `0` every time an article/size is selected, even when that product already has a saved cost.
- Zero-cost receiving is currently accepted, so COGS and profit can become wrong without warning.
- Inventory Matrix uses cached stock without its own live refresh, so recent billing/receiving can show stale quantities.
- Bill and barcode printing depend on a popup and the browser print dialog. Phone browsers and in-app browsers often block or mishandle this; Bluetooth thermal printers usually need their companion app.
- Barcode scanning only works reliably while the POS search box has focus.
- Printed labels contain Code 128 only; missing codes fall back to a shortened ID that is not a safe permanent retail code.
- Product cards and supplier cards do not open full profiles.
- Current accounting mixes sales performance, cash movement and purchasing, and needs return/GST/credit/split-payment edge cases separated clearly.
- Poster generation lacks a true preview and its text-heavy template reads as generated rather than like a retail campaign.

## Changes to build

### Mobile-safe bill, barcode and poster output
- Replace popup-only output with an in-app print preview that works without opening a new tab.
- Add three explicit actions: **Print via phone**, **Share file**, and **Download**. Phone sharing will hand the bill/labels/poster to WhatsApp, Files, AirPrint, or the printer’s companion app when supported.
- Keep Thermal, A4 and Premium bill layouts; add A4 sheet and thermal-roll label presets.
- Show a clear fallback when a phone/browser cannot directly print instead of only saying “allow popups.”
- Poster output gets Preview, Print, Share and Download from the same mobile-safe flow.

### QR + Code 128 and scan-anywhere
- Add a QR code beside Code 128 on every label. Both will encode the same permanent variant code so either a retail scanner or phone camera can identify the exact article and size.
- Persist a unique code before printing; never print a shortened database ID as a fallback.
- Add a global scanner buffer so a paired USB/Bluetooth scanner works even when focus is in customer, payment or another POS field.
- Add a camera-scan button for phones, using native barcode detection where available and a safe fallback where needed.
- After a successful scan, add the exact size to cart, give sound/visual confirmation and keep scanning ready.

### Product profile
- Make every product card and matrix article tappable.
- Open a detailed product profile with photo, brand/article, category/colour, MRP/selling price, owner-only purchase cost and margin, size-wise available/damaged/minimum stock, rack, SKU/barcode/QR, stock value, recent sales, purchases and movement history.
- Owner actions: edit article details, cost, image and size information. Staff sees selling and stock details only—never cost or profit.
- Reuse this profile from Products, Inventory Matrix, Purchase search and Barcode screens.

### Supplier profile
- Make each supplier card tappable.
- Open supplier contact/GST/address, total purchases, paid amount, outstanding balance, invoice list and recent supplied articles.
- Add payment recording with date, mode, amount, note and immutable history; supplier pending becomes purchases minus recorded payments.
- Keep WhatsApp catalogue/rate-list action with cleaner professional copy.

### Purchase cost and receiving
- When an article size is selected, prefill its latest saved purchase cost instead of `0`.
- Make cost clearly editable per receiving line, with a shared “apply cost to selected sizes” action.
- Block positive-quantity receiving when cost is blank/zero unless the owner explicitly marks it as free/sample stock.
- Record historical line cost and update the article’s current cost only after a valid receipt.
- Show subtotal, purchase GST, invoice total, amount paid and supplier due separately.

### Inventory Matrix correction
- Refresh immediately after sales, purchases, returns and manual adjustments.
- Use natural footwear-size sorting, keep the full relevant size header stable, and distinguish unavailable size, zero stock, low stock and healthy stock.
- Display available pairs separately from damaged pairs; totals must not mix the two.
- Add product-profile drill-down from each row and exact variant details from each cell.
- CSV export will include real owner-only cost values; staff export remains cost-free.

### Accounting correction
- Separate three reports instead of forcing one number to represent everything:
  - **Profit & Loss:** net sales excluding GST, less returned-sale value excluding GST, less returned-item COGS adjustment, less COGS, less expenses.
  - **Cash Book:** actual Cash/UPI/Card/Bank receipts, credit collections, refunds paid, supplier payments and expenses by mode.
  - **Tax & Payables:** output GST, purchase-input GST, customer receivables and supplier dues.
- Credit collection changes cash/receivable only; it must not count again as sales revenue.
- Split bills count only their actual cash portion in cash and the balance in the correct non-cash mode.
- Returns reverse revenue, GST and COGS using the original bill proportions; exchanges do not become profit or refund unless there is a real price difference.
- Missing product cost is surfaced as **Cost missing**, never silently treated as zero profit cost.
- Add reconciliation rows and CSV exports so totals can be checked against bills, returns, expenses, purchases and collections.

### Professional poster system
- Replace the current text-heavy canvas with a clean footwear campaign layout: large contained product photo, compact shop mark, product hierarchy, price, size chips and one clear reserve/contact action.
- Add live 9:16 preview before output, safe text wrapping, photo-error handling and no emoji/garbled symbols.
- Keep editable campaign tags and professional WhatsApp copy, without fake urgency or generic AI wording.

## Data and safety rules
- Keep stock changes through the existing atomic sale/receive/return functions.
- Keep cost, profit, supplier payment and accounting details owner-only.
- Add an auditable supplier-payment record and strengthen receipt validation in database functions.
- Credit collections remain RPC-only; direct ledger inserts will be removed.
- No paid API will be introduced.

## Verification
- Test owner and staff visibility independently.
- Test inclusive/exclusive GST, discounts, split pay, credit collection, full/partial return, damaged return, exchange, purchase payment and missing-cost cases with expected totals.
- Test live matrix updates after sale, purchase, return and adjustment.
- Test Code 128 and QR with a physical scanner and Android/iPhone cameras.
- Test bill, labels and poster on Android Chrome and iPhone Safari using print, share and download fallbacks.
- Real Bluetooth printer output will still require the phone’s installed print service or printer companion app; the app will provide a shareable/printable file for that handoff.
