function requestResources() {
  return Promise.all([
    import("lottie-web/build/player/lottie_light"),
    import("@/assets/bill-success.json"),
  ]).then(([{ default: lottie }, { default: animationData }]) => ({ lottie, animationData }));
}

let cached: ReturnType<typeof requestResources> | undefined;

/** Share the lazy load between counter preparation and the saved-bill decoration. */
export function loadReceiptResources() {
  cached ??= requestResources().catch((error) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
