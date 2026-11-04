/** Decode a replacement offscreen before swapping it into an existing visible frame. */
export function decodeImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    const finish = (ready: boolean) => {
      image.onload = null;
      image.onerror = null;
      resolve(ready);
    };
    image.onload = () => {
      void image
        .decode()
        .catch(() => undefined)
        .then(() => finish(image.naturalWidth > 0));
    };
    image.onerror = () => finish(false);
    image.src = src;
  });
}
