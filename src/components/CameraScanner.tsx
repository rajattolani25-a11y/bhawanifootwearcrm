import { useEffect, useRef, useState } from "react";
import { Flashlight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";

const COPY = {
  english: {
    loading: "Starting camera…",
    ready: "Keep the full QR or barcode in view. Hold steady and avoid glare.",
    failed:
      "Camera unavailable. Allow camera access in your browser, or enter the label code in product search.",
    retry: "Retry camera",
    lightOn: "Turn on light",
    lightOff: "Turn off light",
    lightFailed: "Camera light could not be changed. Try more room lighting.",
  },
  hindi: {
    loading: "कैमरा शुरू हो रहा है…",
    ready: "पूरा QR या बारकोड कैमरे में रखें। फ़ोन स्थिर रखें और चमक से बचें।",
    failed:
      "कैमरा उपलब्ध नहीं है। ब्राउज़र में कैमरे की अनुमति दें या प्रोडक्ट खोज में लेबल कोड डालें।",
    retry: "कैमरा फिर शुरू करें",
    lightOn: "लाइट चालू करें",
    lightOff: "लाइट बंद करें",
    lightFailed: "कैमरे की लाइट नहीं बदली जा सकी। कमरे में रोशनी बढ़ाएँ।",
  },
  hinglish: {
    loading: "Camera shuru ho raha hai…",
    ready: "Poora QR ya barcode camera mein rakhein. Phone steady rakhein aur glare se bachein.",
    failed:
      "Camera nahi khul saka. Browser mein camera permission dein ya product search mein label code daalein.",
    retry: "Camera dobara kholein",
    lightOn: "Light on karein",
    lightOff: "Light off karein",
    lightFailed: "Camera light badal nahi saki. Room ki roshni badhayein.",
  },
};
type CameraCapabilities = MediaTrackCapabilities & { focusMode?: string[]; torch?: boolean };
type CameraOptions = MediaTrackConstraintSet & { focusMode?: string; torch?: boolean };

/** One accepted result per opening. Parent rerenders never restart a live camera. */
export function CameraScanner({ onScan }: { onScan: (code: string) => boolean }) {
  const { lang } = useLang();
  const copy = COPY[lang];
  const video = useRef<HTMLVideoElement>(null);
  const scan = useRef(onScan);
  const track = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(true);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);
  const [lightError, setLightError] = useState(false);
  const [lightBusy, setLightBusy] = useState(false);
  useEffect(() => {
    scan.current = onScan;
  }, [onScan]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let accepted = false;
    let previous = "";
    let previousAt = -Infinity;
    let controls: { stop: () => void } | undefined;
    const target = video.current;
    setError(false);
    setReady(false);
    setTorch(false);
    setTorchAvailable(false);
    setLightError(false);
    void (async () => {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      if (!active || !target) return;
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 500,
      });
      controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
        },
        target,
        (result) => {
          if (!active || accepted || !result) return;
          const code = result.getText().trim();
          const now = performance.now();
          if (!code || (code === previous && now - previousAt < 1500)) return;
          previous = code;
          previousAt = now;
          // Latch before calling parent: a second camera frame cannot add the same pair twice.
          accepted = true;
          if (!scan.current(code)) accepted = false;
        },
      );
      if (!active) {
        controls.stop();
        return;
      }
      const stream = target.srcObject as MediaStream | null;
      const camera = stream?.getVideoTracks()[0];
      track.current = camera ?? null;
      setReady(true);
      const capabilities = camera?.getCapabilities?.() as CameraCapabilities | undefined;
      setTorchAvailable(!!capabilities?.torch);
      if (camera && capabilities?.focusMode?.includes("continuous")) {
        await camera
          .applyConstraints({ advanced: [{ focusMode: "continuous" } as CameraOptions] })
          .catch(() => {});
      }
    })().catch(() => {
      if (active) setError(true);
    });
    return () => {
      active = false;
      controls?.stop();
      const stream = target?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      if (target) target.srcObject = null;
      track.current = null;
    };
  }, [retry, visible]);
  async function toggleLight() {
    const camera = track.current;
    if (!camera || lightBusy) return;
    const next = !torch;
    setLightBusy(true);
    setLightError(false);
    try {
      await camera.applyConstraints({ advanced: [{ torch: next } as CameraOptions] });
      if (track.current === camera) setTorch(next);
    } catch {
      setLightError(true);
    } finally {
      setLightBusy(false);
    }
  }
  return (
    <div data-camera-scanner data-no-translate className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video
          ref={video}
          muted
          playsInline
          autoPlay
          className="aspect-video w-full object-contain"
          aria-label="Label camera"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[12%] rounded-xl border-2 border-white/80"
        />
      </div>
      {error ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            {copy.failed}
          </p>
          <Button type="button" variant="outline" onClick={() => setRetry((r) => r + 1)}>
            <RotateCcw className="h-4 w-4" />
            {copy.retry}
          </Button>
        </>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {ready ? copy.ready : copy.loading}
        </p>
      )}
      {torchAvailable && !error && (
        <Button
          type="button"
          variant="outline"
          disabled={lightBusy}
          aria-pressed={torch}
          onClick={() => void toggleLight()}
        >
          <Flashlight className="h-4 w-4" />
          {torch ? copy.lightOff : copy.lightOn}
        </Button>
      )}
      {lightError && (
        <p role="alert" className="text-sm text-destructive">
          {copy.lightFailed}
        </p>
      )}
    </div>
  );
}
