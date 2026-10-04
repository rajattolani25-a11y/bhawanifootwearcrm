# Shop Catalog + Photo Compression + Optional Advance Booking

## What the customer will see
- A public link: `/catalog`. No login, opens fast on phone, clean and professional with the shop name from Settings.
- Search + filters: Gents / Ladies / Kids (Boys/Girls), category, brand, price range.
- Product card: photo, brand, article, colour, selling price (MRP cut if higher), and the sizes that are **in stock right now**. Out-of-stock sizes are greyed, so nobody picks a size you don't have.
- Product page: big photo, size buttons, and two actions:
  1. **Visit store / Ask on WhatsApp** (main button): sends "Is size 8 of Article X available? I'll visit the store" to the shop WhatsApp.
  2. **Reserve this pair** (only if the owner turns booking ON). It's a small secondary option, not a big "50% advance" banner. The advance amount only shows after the customer picks a size and taps Reserve.
- Never shown: purchase cost, profit, exact stock counts, suppliers, customers, bills, settings.

## Optional advance booking (free, UPI)
- Settings (owner only): Booking ON/OFF, Shop UPI ID, Advance % (default 50), Hold time (default 24 hours).
- Customer flow: pick size, enter name + mobile, tap Reserve. The app checks live stock first. Then it shows the advance amount + a UPI pay button (PhonePe/GPay open with the amount filled in) + "Send payment screenshot on WhatsApp".
- That pair goes on hold right away, so two people can't book the last pair. If payment isn't confirmed within 30 minutes, the hold is cancelled automatically.
- New owner screen **Online Bookings**: Pending payment, Confirmed, Picked up, Cancelled. The owner taps "Payment received" after checking UPI. On pickup, "Make bill" opens POS with that item and the advance counted as already paid, so stock, sale, loyalty and Khatabook stay in sync.
- Available stock everywhere (Catalog, POS, Products) = stock minus active holds. POS warns if a size is held for a booking.
- Cancel/refund: the owner cancels and the hold is released. The advance refund is done by hand (UPI) and recorded as a note.

## Owner controls (easy)
- On each product card in Products: a **Show in catalog** switch, plus "Show all with photo" / "Hide all" buttons.
- Settings: Catalog ON/OFF, "Copy catalog link", "Share on WhatsApp".
- Only products that are switched ON and have stock appear.

## Photo compression
- Allowed photo upload: up to 5 MB (bigger photos are rejected with a clear message).
- Before upload, the phone resizes it to max 1080 px and saves it as WebP at good quality (min quality 0.82). Usually 80–150 KB, and the shoe still looks sharp.
- Replacing a photo deletes the old file, so storage doesn't fill with junk.
- Works the same in Quick Add, Products and Purchase.

## Language
- All new text is written in English in the code, with Hindi and Hinglish entries added to the dictionary. In English mode it stays fully English.
- The catalog follows the customer's own choice (small English / हिंदी / Hinglish switch on the catalog), default English.

## Testing before handover
- Open the catalog as a logged-out customer: check that cost/stock counts/admin data never show up, and that the page and its data requests carry no cost fields.
- Book a pair end-to-end: hold is created, stock shows reduced, auto-expiry works, owner confirms, POS bill with advance, final stock correct.
- Try booking the last pair twice: the second attempt is blocked.
- Upload a large photo: check the final file size and quality.
- Switch the app between all three languages on the new screens.
- Run a full security scan and fix any findings.

## Technical details
- `products.catalog_visible boolean default false`; `store_settings`: `catalog_enabled`, `booking_enabled`, `upi_id`, `advance_percent`, `hold_minutes`.
- New table `catalog_bookings` (variant_id, qty=1, name, mobile, amount, advance, status pending/confirmed/picked/cancelled/expired, expires_at, sale_id). Owner/staff read, no direct anon access; GRANTs + RLS.
- Security-definer `public_catalog()` returns only safe columns + `available boolean` per size (stock − active holds > 0). Anon EXECUTE only.
- `create_catalog_booking(variant, name, mobile)`: row lock on variant, checks availability, max 2 pending per mobile, validates 10-digit mobile. `confirm_booking`, `cancel_booking`, lazy expiry of stale pending holds inside these functions + public_catalog.
- `create_sale` accepts an optional booking_id: marks it picked and treats the advance as paid amount.
- Storage policy: anon may read `product-images` objects only for catalog-visible products, so the public server function can sign URLs with the publishable key (no admin key).
- Public route `/catalog` (SSR, own head/OG tags) and `/catalog/$productId`; data via public server function. Owner route `_authenticated/bookings` added to `modules.ts`.
- Compressor in `src/lib/product-images.ts` (canvas → WebP, fallback JPEG), delete previous object on replace.
