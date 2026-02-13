import React from "react";
import type { Route } from "../../types/route";
import { useContactsGuide } from "./guide/useContactsGuide";

interface UseGuideScannerDomainParams {
  cashuBalance: number;
  contacts: readonly Record<string, unknown>[];
  contactsOnboardingHasPaid: boolean;
  contactsOnboardingHasSentMessage: boolean;
  openMenu: () => void;
  openNewContactPage: () => void;
  onScannedText: (rawValue: string) => Promise<void>;
  pushToast: (message: string) => void;
  route: Route;
  t: (key: string) => string;
}

type UseGuideScannerDomainResult = ReturnType<typeof useContactsGuide> & {
  closeScan: () => void;
  openScan: () => void;
  scanIsOpen: boolean;
  scanVideoRef: React.RefObject<HTMLVideoElement | null>;
};

export const useGuideScannerDomain = ({
  cashuBalance,
  contacts,
  contactsOnboardingHasPaid,
  contactsOnboardingHasSentMessage,
  openMenu,
  openNewContactPage,
  onScannedText,
  pushToast,
  route,
  t,
}: UseGuideScannerDomainParams): UseGuideScannerDomainResult => {
  const contactsGuideDomain = useContactsGuide({
    cashuBalance,
    contacts,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    openMenu,
    openNewContactPage,
    route,
  });

  const [scanIsOpen, setScanIsOpen] = React.useState(false);
  const [scanStream, setScanStream] = React.useState<MediaStream | null>(null);

  const scanVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const scanOpenRequestIdRef = React.useRef(0);
  const scanIsOpenRef = React.useRef(false);

  React.useEffect(() => {
    scanIsOpenRef.current = scanIsOpen;
  }, [scanIsOpen]);

  const closeScan = React.useCallback(() => {
    setScanIsOpen(false);
    scanOpenRequestIdRef.current += 1;

    const video = scanVideoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
      try {
        (video as unknown as { srcObject: MediaStream | null }).srcObject =
          null;
      } catch {
        // ignore
      }
    }

    setScanStream((prev) => {
      if (prev) {
        for (const track of prev.getTracks()) {
          try {
            track.stop();
          } catch {
            // ignore
          }
        }
      }

      return null;
    });
  }, []);

  const openScan = React.useCallback(() => {
    setScanIsOpen(true);

    const requestId = (scanOpenRequestIdRef.current += 1);

    const media = navigator.mediaDevices as
      | { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> }
      | undefined;
    if (!media?.getUserMedia) {
      pushToast(t("scanCameraError"));
      closeScan();
      return;
    }

    if (typeof globalThis.isSecureContext === "boolean" && !isSecureContext) {
      pushToast(t("scanRequiresHttps"));
      closeScan();
      return;
    }

    void (async () => {
      try {
        const acceptStream = (stream: MediaStream) => {
          if (
            requestId !== scanOpenRequestIdRef.current ||
            !scanIsOpenRef.current
          ) {
            for (const track of stream.getTracks()) {
              try {
                track.stop();
              } catch {
                // ignore
              }
            }
            return false;
          }

          setScanStream(stream);
          return true;
        };

        const tryGet = async (constraints: MediaStreamConstraints) => {
          const stream = await media.getUserMedia!(constraints);
          return acceptStream(stream);
        };

        const ok = await tryGet({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        }).catch(() => false);

        if (!ok) {
          await tryGet({ video: true, audio: false });
        }
      } catch (e) {
        const err = e as unknown as { name?: unknown; message?: unknown };
        const name = String(err?.name ?? "").trim();
        const message = String(err?.message ?? e ?? "").trim();

        let permissionState: string | null = null;
        try {
          const permissions = (
            navigator as unknown as {
              permissions?: {
                query?: (desc: unknown) => Promise<{ state?: unknown }>;
              };
            }
          ).permissions;
          const res = await permissions?.query?.({ name: "camera" });
          permissionState = String(res?.state ?? "").trim() || null;
        } catch {
          // ignore
        }

        console.log("[linky][scan] getUserMedia failed", {
          name,
          message,
          permissionState,
          href: globalThis.location?.href ?? null,
          isSecureContext:
            typeof globalThis.isSecureContext === "boolean"
              ? globalThis.isSecureContext
              : null,
        });

        const isPermissionDenied =
          name === "NotAllowedError" ||
          /permission/i.test(message) ||
          /denied/i.test(message);

        if (isPermissionDenied) pushToast(t("scanPermissionDenied"));
        else pushToast(t("scanCameraError"));

        closeScan();
      }
    })();
  }, [closeScan, pushToast, t]);

  const handleScannedTextRef = React.useRef(onScannedText);
  React.useEffect(() => {
    handleScannedTextRef.current = onScannedText;
  }, [onScannedText]);

  React.useEffect(() => {
    if (!scanIsOpen) return;
    if (!scanStream) return;

    let cancelled = false;
    let stream: MediaStream | null = scanStream;
    let rafId: number | null = null;
    let lastScanAt = 0;
    let handled = false;

    const stop = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = null;

      const video = scanVideoRef.current;
      if (video) {
        try {
          video.pause();
        } catch {
          // ignore
        }
        try {
          (video as unknown as { srcObject: MediaStream | null }).srcObject =
            null;
        } catch {
          // ignore
        }
      }

      if (stream) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            // ignore
          }
        }
      }
      stream = null;
    };

    const run = async () => {
      if (cancelled) {
        stop();
        return;
      }

      const video = scanVideoRef.current;
      if (!video) {
        stop();
        return;
      }

      try {
        video.srcObject = stream;
      } catch {
        // ignore
      }

      try {
        video.setAttribute("playsinline", "true");
        video.muted = true;
      } catch {
        // ignore
      }

      try {
        await video.play();
      } catch {
        // ignore
      }

      type BarcodeDetectorInstance = {
        detect: (
          image: HTMLVideoElement,
        ) => Promise<Array<{ rawValue?: unknown }>>;
      };
      type BarcodeDetectorConstructor = new (options: {
        formats: string[];
      }) => BarcodeDetectorInstance;

      const detectorCtor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;

      const detector = detectorCtor
        ? new detectorCtor({ formats: ["qr_code"] })
        : null;

      const jsQr = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (cancelled) return;
        if (!video || video.readyState < 2) {
          rafId = window.requestAnimationFrame(() => void tick());
          return;
        }

        const now = Date.now();
        if (now - lastScanAt < 200) {
          rafId = window.requestAnimationFrame(() => void tick());
          return;
        }
        lastScanAt = now;

        try {
          if (handled) return;

          if (detector) {
            const codes = await detector.detect(video);
            const value = String(codes?.[0]?.rawValue ?? "").trim();
            if (value) {
              handled = true;
              stop();
              await handleScannedTextRef.current(value);
              return;
            }
          } else if (jsQr && ctx) {
            const w = video.videoWidth || 0;
            const h = video.videoHeight || 0;
            if (w > 0 && h > 0) {
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              const imageData = ctx.getImageData(0, 0, w, h);
              const result = jsQr(imageData.data, w, h);
              const value = String(result?.data ?? "").trim();
              if (value) {
                handled = true;
                stop();
                await handleScannedTextRef.current(value);
                return;
              }
            }
          }
        } catch {
          // ignore and continue scanning
        }

        rafId = window.requestAnimationFrame(() => void tick());
      };

      rafId = window.requestAnimationFrame(() => void tick());
    };

    void run();
    return () => {
      cancelled = true;
      stop();
    };
  }, [scanIsOpen, scanStream]);

  return {
    closeScan,
    ...contactsGuideDomain,
    openScan,
    scanIsOpen,
    scanVideoRef,
  };
};
