# Animation playback and billing feedback

The public appearance row and hero RPC were read with the publishable key:
all three appearance switches are true; a hero is configured with motion true.
The user also reports successful owner save/reload and publication. No production
write or live bill was performed. The published app URL could not be inspected
from this workspace because its proxy returned 403; this is not evidence of a
website outage.

## Confirmed issue and correction

The gallery changed products without playing its intended keyed entry: actual
frame sampling showed only transform:none and opacity:1. `initial={false}` on
each newly mounted Motion element skipped the entry keyframes. The POS row used
the same pattern. Entries now have explicit, partly visible start values and
animate to their resting position. Gallery next/previous use direction-aware
32px slide/fade/scale over 360ms. POS rows use a 16px slide/fade over 280ms when
first visible, so the mobile Cart can reveal the entry after it was hidden.
Owner motion OFF and device reduced-motion remain static. There is no autoplay,
new dependency, image, continuous loop or storage usage.

## Billing feedback

There was no deliberate 3–5 second timer in the submit handler. The receipt's
lazy player/data were first requested when the saved-bill dialog mounted, so a
cold connection could delay the decoration. The same lazy resources now warm
while the counter has a cart, are shared with the success component and retry
after a failed load. A static check remains immediately available. Success is
still shown only after create_sale confirms the bill; it never awaits the
decoration. Network/database save time itself has not been measured or changed.

Saving feedback now starts before customer lookup, and one submission lock
covers lookup, validation and the sale request with finally cleanup. Sales
payloads and all monetary calculations are unchanged. No database migration,
RLS policy or backend RPC was edited for this correction.

## Verification

- TypeScript, production build and six data/billing tests passed.
- Existing catalog/coupon/receipt browser regression passed.
- New `tests/motion-playback-audit.mjs` samples actual rendered frame states.
  The passing run measured 24 gallery transform states, both navigation
  directions, desktop row entry, mobile Cart entry, owner OFF, device reduced
  motion and no mobile overflow.
- An actual POS route with mocked responses was tested while animation loading
  was held unresolved. The saved-bill popup appeared 111ms after the mocked
  database response, before the animation download was released. Repeated F8
  generated one mocked request. Its two-item total remained 1677.90. No real
  sale/order/payment/message was created; real-device speed is not established.
- Inspected saved-bill and mobile Cart screenshots.

Evidence: `docs/audit/evidence/motion-playback/`. Reproduce with Vite at
localhost:8080 and Playwright/Chromium installed:

```sh
node tests/motion-playback-audit.mjs
```

PLAYWRIGHT_MODULE and CHROMIUM_PATH override their default locations. This is a
frontend correction; sync GitHub main and Publish → Update in Lovable. There is
no new SQL step.
