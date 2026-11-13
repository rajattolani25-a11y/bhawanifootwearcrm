# POS scanning and print labels

Frontend changes only; no migration or database function edit. Codes keep their existing stable variant identity. Existing barcode/SKU labels still work.

- QR increases from12mm to16mm inside the existing64×38mm sheet and50×38mm roll labels. Black-on-white vector artwork retains four clear modules around the code. Explicit SVG dimensions are essential for PDF rendering.
- A4 keeps three64mm labels across, even when generated from a phone. Sheet PDF uses202mm of content plus4mm margins, preserving label scale. Roll PDFs keep one50×38mm label per page. Label rows are not split across PDF pages.
- Label PDFs use bounded, lossless PNG tiles with fast compression; bill/ledger PDFs retain their existing JPEG path. This avoids compression artifacts around small code modules without adding any database/file-storage usage.
- Print at100% / Actual size with matching paper and clean, dark output. Printer calibration, glare, lens quality and focus still matter; browser tests cannot guarantee every physical printer/phone.
- Camera decoding stays lazy. The existing ZXing library is now declared directly because its decode hints are used. QR,Code128 and common retail codes are tried; rear720p/24fps capture and180ms retry are preferred. Continuous focus/torch apply only when supported, with torch failure feedback.
- The latest scan handler is kept independently of camera lifetime: unrelated POS renders do not reopen the camera. A synchronous successful-result latch prevents duplicate frame additions. Repeated unknown codes are throttled; an accepted scan closes immediately. Camera tracks stop on close/background, resume when visible, and stop even if a pending camera startup resolves after close. Permission failures offer retry and typed-code fallback.
- An in-memory variant-code index avoids repeatedly searching all articles. Shared legacy codes fail safely instead of choosing a wrong size. Zero-stock scans do not add a pair. Hardware scans cannot add behind another dialog.
- Shared product-add form now uses English source copy for descriptions, size hints, placeholders, cost warnings and validation, with Hindi/Hinglish translations retained.

Verification uses intercepted synthetic backends only: `camera-scanner-browser-audit.mjs`, `pos-scanner-browser-audit.mjs`, `label-dock-audit.mjs`, `label-pdf-decoding-audit.mjs` (requires Poppler after the dock test). The label tests decode both QR andCode128 using ZXing, inspect clipping/geometry and inspect downloaded PDFs at203dpi. Existing retail/category/PDF/browser checks cover adjacent flows. No live sale, stock mutation or customer message is created.

Owner update13 November2026: printed labels and the Barcodes selection list show MRP only, without selling price or strikethrough. Every A4/roll label has a complete square0.3mm black cutting border; existing label dimensions, QR quiet zones and scan identities remain. Print at100%/Actual size.
