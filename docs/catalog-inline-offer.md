# Inline catalog offer ticket

The saved catalog offer now appears once in normal document flow: **Spotlight → offer ticket → Shop the collection → Size/Sort/Style → products**. The old black strip above the hero is removed. If Spotlight is disabled or has too few products, the ticket precedes the collection heading without an empty placeholder. Offer OFF/null renders nothing.

`CatalogOfferTicket` reuses the existing public-safe offer DTO. No demo coupon or discount is saved. Fixed/percent value, minimum order and maximum discount come from the actual offer; fixed discounts also respect their cap. The minimum is displayed inclusively (`Orders ₹1,499+`), and percent caps remain visible. Long campaign copy is ellipsized in the summary with full text in on-demand details. An offer without a coupon remains a promotional message with no copy button or fabricated savings.

The ticket is approximately76–80px tall for the normal offer at320/390/768/1440 layouts. It caps desktop width at720px, aligned with the collection controls, and uses enough padding to keep the decorative notch away from the amount. The mobile Copy action has at least44px height. It never floats over products or navigation. Code copy reports success only after the clipboard promise resolves. Missing/denied clipboard opens user-requested details with a selected read-only code and manual-copy feedback; no false Copied state.

Offer details open only on an explicit customer action, with complete owner text, coupon, threshold/cap and checkout instructions. Copying does not apply a discount or place an order. Existing checkout/coupon validation, eligibility, one-use rules, order recovery and monetary calculations are unchanged.

A CSS light sweep runs once on first visible encounter. It respects the owner master motion setting, device reduced motion and hidden-tab pause; there is no animation loop, polling or new image upload. English/Hindi/Hinglish copy and customer dark mode work with the saved owner message kept as plain text.

The unused timed/floating OfferCard and view counter are removed. Catalog Studio's obsolete 'Show small offer card' control is replaced by a short placement explanation. The legacy `offer_card` field is preserved in storage/read/save for compatibility; the existing `offer_enabled` switch controls ticket visibility. No database columns, migrations or RPC definitions changed.

Validation uses the real CatalogView with intercepted synthetic services: old strip absent, one ticket even with legacy card=false, inline placement/bounds at four widths, exact copy and denied-copy fallback, minimum and both percentage/fixed caps, offer OFF/no coupon, motion/reduced motion, all three languages, dark mode, and no automatic popup after simulated time. Existing catalog collection and order-recovery audits pass. TypeScript, scoped ESLint, production build and diff checks pass. No live order, payment, message or database write is used for verification.
