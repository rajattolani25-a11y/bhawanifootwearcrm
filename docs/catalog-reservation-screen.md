# Fullscreen catalog reservation

The approved Ivory reservation screen replaces only the saved-order view. It mounts after `createBooking` succeeds, including recovery of the exact saved order. Product details, checkout and tracking retain their existing behavior. No website-opening intro, payment gateway, backend/RPC change, new migration, new dependency or new uploaded image is included.

- Full-viewport dialog with the larger illustrated shoebox and smaller selected product photo; actual saved shop, product, size, order number and server-authoritative amounts.
- Original price, optional coupon discount, delivery charge, amount due now and pickup remainder render from the booking result. Delivery never displays a fictitious pickup balance. The product photo is snapshotted when the request succeeds so a catalog refresh cannot replace the reserved product image.
- Status explicitly remains PAYMENT PENDING; the artwork is a reservation flourish, not bank confirmation. UPI and tracking actions appear immediately. Screenshot proof still opens the shop's WhatsApp chat; no file picker, upload or automatic outbound message.
- English, Hindi and Hinglish copy; customer dark preference; owner master motion flag and device reduced-motion preference. Animation is finite, approximately1.2seconds, and does not delay any action.
- Existing signed cover photo is reused. A tiny local64x64 alpha inspection chooses the shoebox artwork for transparent photos or a framed-image fallback for opaque/tainted photos. CORS failure retries display without CORS; an unavailable image falls back to a branded box and leaves payment actions usable. No automatic background removal or3D model generation is claimed.
- Scoped CSS only. The shared dialog, global CSS, hero themes, inventory, checkout pricing, stock reservation, payment verification and billing calculations are unchanged. The fullscreen dialog clears the shared centering utilities explicitly and focuses its container without scrolling to the payment button.

Validation: TypeScript, production build and semantic lint; six focused real-browser suites with synthetic API responses cover reservation/recovery, product actions, gallery, themes and Ivory background. The new suite tests320/390/430/768/1440px, pending-vs-paid copy, exact selected photo/size and999/500/499 amounts, dark mode, all three languages, motion OFF/reduced-motion, opaque/missing-image fallbacks and a discounted delivery breakdown. No live order or payment is created by these tests.

Deployment: publish the matching frontend after GitHub sync, then reload the catalog tab. No additional SQL beyond the already approved/applied0035–0040 backend is needed for this presentation change.
