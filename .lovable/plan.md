# Catalog "Buy Now" + Delivery + Order Tracking (3 languages)

## Catalog redesign
- Language picker moves out of the big header into a small "EN / हिं / Hinglish" chip in a slim top bar (with Track Order + Call).
- Cleaner header: shop name, address, open-now line, trust badges.
- Sticky search + category chips; better product cards (photo, brand, price, MRP cut, "few sizes left" tag, size chips).
- Product page as a bottom sheet on phone: big photo, size grid, clear price summary, one main button.
- Friendly empty/error states; works smoothly on small phones.

## Customer flow (catalog)
One clean button after size selection: **"Get this pair"**. It opens a small chooser:

```text
How do you want it?
( ) Pickup from store   - Free      -> pay advance (existing Reserve, %)
( ) Local delivery      - Rs 20-30  -> full payment + address
( ) Outside city        - Rs 50-80  -> full payment + address
```

- "Ask on WhatsApp & visit store" stays as the main button (no change).
- Delivery: name, mobile, address, pincode/area. Total = price + delivery charge.
- Pay with UPI (same direct UPI link, 0% fee), then "Send payment screenshot on WhatsApp" with order no., amount, product, size, delivery type pre-filled.
- Stock is held immediately (same as Reserve), so no double-selling.

## Track Order (catalog)
- "Track Order" button on the catalog header: enter order no. + mobile.
- Shows a timeline: Order placed -> Payment confirmed -> Packed / Ready for pickup -> Out for delivery -> Delivered / Picked up. Cancelled / Refunded shown clearly.
- Shows only that order's own details; nothing else is public.

## Owner side ("Online Bookings" screen, renamed "Online Orders")
- Tag on each order: Pickup / Local / Outside, with address for delivery.
- Buttons to move status step by step; each step opens a ready WhatsApp message to the customer.
- "Mark delivered / picked up" creates the bill through the existing safe sale path (stock never double-counts).
- Reject & refund: releases stock, status "Cancelled - refund initiated".

## Settings (Catalog card)
- Switches: Allow home delivery (on/off), Allow outside-city delivery (on/off).
- Charges: local (default Rs 30), outside (default Rs 80), optional free-local-delivery above Rs X.
- Local area note (e.g. "Within city") shown to customer.

## Owner controls (Settings > Online Catalog)
- Master switches: Catalog on/off, Store pickup reserve on/off, Local delivery on/off, Outside delivery on/off.
- Advance %, hold hours, local/outside charges, free delivery above Rs X, delivery area note, UPI ID, WhatsApp number.
- Toggle "show 'few left' tag", per-product show in catalog (existing), bulk show/hide.
- Live preview link + copy/share catalog link on WhatsApp.

## WhatsApp messages
- All customer and owner messages rewritten in a clean professional format: greeting, shop name, order no., item, size, amount, delivery type, status, and thank-you line; sent in the chosen language.

## Language
- Every new label, button, status, error and WhatsApp message added in English, Hindi and Hinglish.
- English setting shows pure English everywhere (no Hinglish leaking); catalog language picker applies to the tracking screen too.

## Technical details
- Extend `catalog_bookings`: `fulfillment` (pickup/local/outside), `delivery_charge`, `address`, `area`, `status` values (placed, paid, packed, out_for_delivery, delivered, cancelled, refunded), `status_history` jsonb.
- `store_settings`: delivery_enabled, outside_enabled, local_charge, outside_charge, free_delivery_above, delivery_note.
- `create_catalog_booking` takes fulfillment + address; computes charge server-side (never trusts browser); pickup = advance %, delivery = full amount.
- New security-definer `track_catalog_order(booking_no, mobile)` returning only status timeline + product/size/amount; called via publishable-key server fn.
- New owner/member RPC `update_catalog_order_status`; delivered calls existing `complete_catalog_booking`.
- Expiry job only auto-releases unpaid orders.
- All strings added to `i18n-dict.ts` EXTRA and message templates.
