# SoleStack complete retail upgrade

## Goal
Turn the current working system into a fast, polished footwear counter workspace where billing remains fully usable on the current 942×570 screen, and finish the requested sharing, poster, credit, settings, theme and dashboard improvements without removing any existing module.

## Locked visual direction
- Charcoal & Ember palette: `#1a1a1a`, `#2d2d2d`, `#4a4a4a`, `#e85d3a`, translated into light and dark semantic theme tokens.
- Libre Baskerville headings with IBM Plex Sans body text.
- Performance Retail Workspace composition with the existing fixed module sidebar.
- Compact controls, crisp borders, restrained shadows, maximum 8px corners, ember reserved for primary actions and important alerts.
- The POS follows the selected product-led workspace: search and stock on the left, a fixed transaction panel on the right, with only product/cart lists scrolling.

## What will be built

### 1. Counter-ready POS
- Fit search, customer, cart, billing options, payment, totals, hold and completion within the visible counter screen.
- Replace oversized empty areas with compact product cards, image/placeholder, stock status and immediately tappable sizes.
- Keep barcode shortcuts, held bills, loyalty rewards, GST modes, split payments and print styles.
- Strengthen credit billing with customer requirement, advance received, due balance and visible validation.
- Add a completion panel with Print, WhatsApp, SMS/Text, native Share/Copy and New Bill actions.

### 2. Professional bill communication
- Use clean customer-facing English without broken emoji characters.
- Include shop name, customer name, bill number, amount paid/due, loyalty reward and exchange policy where relevant.
- Add reusable message helpers so POS completion and Sales History send consistent messages.

### 3. Product images, community and posters
- Add an optional product image field and owner image upload flow using the app’s storage.
- Render images in products/POS/community cards, with a reliable branded fallback when missing.
- Rebuild the 9:16 canvas poster to load and contain the actual product image before drawing the text layout.
- Add poster preview, single-product professional message, campaign tag presets, Copy, Download, WhatsApp and device Share actions.

### 4. Credit / udhaar workflow
- Add owner-safe collection recording against a sale, preserving an audit trail rather than silently editing totals.
- Show outstanding balance, paid amount, customer and collection history.
- Add “Collect due” from Sales History and customer records; reflect collections in dashboard/accounting totals.

### 5. Settings and appearance
- Add Light, Dark and System modes, persisted across sessions and available from the shared sidebar plus Settings.
- Add an owner-only reset panel with mandatory backup download, explicit typed confirmation and a server-validated database reset function.
- Reset transactional/business data while preserving the owner account, roles and required store-settings row.

### 6. Dashboard redesign
- Add a small live India date/time display.
- Apply the selected workspace styling and tighten the first screen into sales, target, profit/stock for owner, credit, trend, payment/category mix, activity, reorder and dead-stock signals.
- Preserve staff privacy: staff never sees purchase cost, profit or Settings.

### 7. Finish and verify
- Add complete route-specific title, description, Open Graph and Twitter metadata to every content page.
- Verify the owner and staff views, 942×570 POS, desktop dashboard, mobile navigation, bill completion/share, poster generation with image, credit collection, theme persistence and safe reset confirmation.
- Keep final owner testing open only for actions needing a real printer or real WhatsApp/SMS app.

## Technical details
- Database changes will use one migration with explicit grants, row-level access rules, product image URL, credit-payment audit records, atomic collection and owner-only reset functions.
- Product media will use a dedicated image bucket and authenticated access rules; no paid API is introduced.
- All actions continue through existing atomic sale, stock-in and return functions; no stock or cost shortcut is added.
- Theme and sharing helpers will be centralized so all screens use the same behavior and copy.