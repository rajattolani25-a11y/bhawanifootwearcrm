# Barcode review — recommendations only

No scanner, barcode values or transaction behaviour changed during this review.

Source findings:
- POS scanCode searches only the products already loaded into memory. A valid code for an unloaded product can report not found. Add an exact database lookup fallback by barcode/SKU, restricted by existing RLS, and reject ambiguous results.
- The keyboard scanner listener deliberately does not buffer keystrokes while a non-search editable field has focus. A scanner can type into customer/payment fields. Use an explicit scan mode or configurable hardware prefix/suffix; never infer scans from ordinary mobile/amount typing alone.
- Database uniqueness per column does not alone rule out a barcode colliding with a different row's SKU, or different-case codes matching the same normalized input. A first-match lookup should instead detect ambiguity and stop.
- The camera reader gets a new inline onScan callback on POS renders, while the camera effect depends on that callback. A stable callback plus a success latch avoids reader restarts and repeated frame additions. Keep deliberate repeat scans possible after a clear re-arm.
- Generated Code 128 uses margin:0; QR uses margin:0. The layout adds some white space, but does not explicitly preserve format-specific quiet zones. Add quiet zones and avoid arbitrary SVG rescaling. Test the actual printer, label dimensions and scanner. Long legacy UUID-based codes may become too dense on 50mm labels; do not regenerate existing codes.

Suggested order: scan diagnostics mode → focus-safe capture → exact DB fallback/ambiguity rejection → camera lifecycle/debounce → print calibration/quiet zones. Validate unknown/out-of-stock codes, intended repeat scans and customer/payment fields. Hardware/camera scan success rates are not established by this source review.

Further ideas: an owner data-quality screen for conflicting codes/missing costs/photos, printer profiles and a stock-adjustment approval/audit workflow. These are proposals, not implemented features.
