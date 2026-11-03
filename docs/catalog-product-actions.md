# Catalog product view

Approved cream/evergreen layout: product descriptions are hidden from collection
cards and shown only after a product opens. Photos, product name/price and sizes
precede the optional description. Blank descriptions have no empty section.

Header/back/close controls and WhatsApp/Get this pair actions are outside the
scrolling body. Actions remain visible on mobile and desktop, including short
landscape screens; the body does not extend behind them. Footer uses safe-area
padding. Gallery keeps existing cover/fallback/lazy extra-photo behaviour.

Get this pair first focuses/highlights the size picker if no size is selected;
only an available size can proceed. Checkout uses the existing booking function
and selected variant. Delivery-only shops default to their enabled method. Owner
ordering flags and WhatsApp contact configuration remain respected. The actions
are absent on later checkout steps. Product portal follows customer light/dark.

No migration or new animation package is required for this layout. Description
storage remains the existing approved migration 0030. Global dialog/overlay CSS,
pricing, stock, payments and booking RPCs have not been changed by this layout.

Browser audit: `tests/catalog-product-actions-audit.mjs`, plus existing gallery,
description editor and coupon/order-flow audits. It checks pinned geometry at
320/390/768/1440 widths and landscape, touch targets, overflow, size prompt,
availability, WhatsApp URL, mock checkout, owner flags and dark mode. No live
order, payment or message is sent. Screenshots use a sample price/product fixture.
