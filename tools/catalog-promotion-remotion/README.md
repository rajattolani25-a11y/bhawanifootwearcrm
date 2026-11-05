# Offline catalog artwork

The website serves the checked-in `public/media/catalog-promotions/street-energy.mp4`. It never imports Remotion or waits for a browser render. The original static SVG print remains visible with motion disabled, reduced motion, Data Saver, slow2G, an offscreen card, or a failed video.

To rebuild on a Linux machine with Chromium at `/usr/bin/chromium`:

```
cd tools/catalog-promotion-remotion
npm ci
npm run render
```

Adjust the `--browser-executable` option for another machine. The composition is4seconds,60FPS,720×360,H.264/YUV420p, silent and played once per mounted promotion. Type, prices, photos, buttons and countdowns remain ordinary live HTML, not burned into this decorative video. No video-generation service or runtime dependency is required for deploying the main app.
