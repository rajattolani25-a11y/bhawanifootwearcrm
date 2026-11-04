// Run label-dock-audit.mjs first. Requires Poppler pdftoppm for real PDF raster inspection.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { PNG } from "pngjs";
import {
  MultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";
const out = process.env.LABEL_AUDIT_OUT || "/tmp/solestack-audit/catalog-release";
const results = [];
for (const kind of ["sheet", "roll"]) {
  const stem = out + `/label-${kind}-203dpi`;
  execFileSync("pdftoppm", [
    "-f",
    "1",
    "-singlefile",
    "-r",
    "203",
    "-png",
    out + `/label-${kind}.pdf`,
    stem,
  ]);
  const png = PNG.sync.read(await fs.readFile(stem + ".png"));
  const unit = 203 / 25.4,
    x = Math.round((kind === "sheet" ? 7 : 0) * unit),
    y = x;
  const width = Math.round((kind === "sheet" ? 64 : 50) * unit),
    height = Math.round(38 * unit);
  const geometry = JSON.parse(await fs.readFile(out + `/label-${kind}-geometry.json`, "utf8"));
  for (const format of [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]) {
    const qr = format === BarcodeFormat.QR_CODE;
    const cropX = x + Math.round(((qr ? geometry.qrX : geometry.barcodeX) * 203) / 96);
    const cropY = y + Math.round(((qr ? geometry.qrY : geometry.barcodeY) * 203) / 96);
    const cropWidth = Math.round(((qr ? geometry.qrWidth : geometry.barcodeWidth) * 203) / 96);
    const cropHeight = Math.round(((qr ? geometry.qrHeight : geometry.barcodeHeight) * 203) / 96);
    const gray = new Uint8ClampedArray(cropWidth * cropHeight);
    for (let j = 0; j < cropHeight; j++)
      for (let i = 0; i < cropWidth; i++) {
        const n = ((j + cropY) * png.width + i + cropX) * 4;
        gray[j * cropWidth + i] = (png.data[n] + 2 * png.data[n + 1] + png.data[n + 2]) / 4;
      }
    const reader = new MultiFormatReader();
    reader.setHints(
      new Map([
        [DecodeHintType.POSSIBLE_FORMATS, [format]],
        [DecodeHintType.TRY_HARDER, true],
      ]),
    );
    process.stderr.write(`Checking ${kind} ${qr ? "QR" : "Code128"} at203dpi\n`);
    const result = reader.decodeWithState(
      new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, cropWidth, cropHeight))),
    );
    assert.equal(result.getText(), "SS1234567890");
    if (format === BarcodeFormat.QR_CODE) {
      const [a, b] = result.getResultPoints();
      const distance = Math.hypot(a.getX() - b.getX(), a.getY() - b.getY()) / unit;
      // Version1 QR: finder centres are14 modules apart in a29-module square (including quiet zone).
      const physicalQrWidth = (distance * 29) / 14;
      assert(
        Math.abs(physicalQrWidth - 16) < 0.7,
        `${kind} QR physical width ${physicalQrWidth}mm`,
      );
      results.push({ layout: kind, physicalQrWidthMm: +physicalQrWidth.toFixed(2) });
    }
  }
}
console.log(
  JSON.stringify({
    result: "PASS",
    checks: [
      "QR and Code128 both decoded from actual downloaded sheet/roll PDFs rasterized at203dpi",
      "16mm QR physical size preserved on A4 sheet and50x38mm roll",
    ],
    results,
  }),
);
