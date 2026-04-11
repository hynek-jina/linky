import React from "react";
import {
  startNativeQrScan,
  supportsNativeQrScan,
} from "../../platform/nativeBridge";
import type {
  NavigatorWithOptionalCameraPermissions,
  WindowWithOptionalBarcodeDetector,
} from "../../types/browser";
import type { Route } from "../../types/route";
import { AnimatedQrDecoder } from "../../utils/animatedQr";
import type { ContactRowLike } from "../types/appTypes";
import { useContactsGuide } from "./guide/useContactsGuide";

interface UseGuideScannerDomainParams {
  cashuBalance: number;
  contacts: readonly ContactRowLike[];
  contactsOnboardingHasPaid: boolean;
  contactsOnboardingHasSentMessage: boolean;
  openMenu: () => void;
  openNewContactPage: () => void;
  onScannedText: (rawValue: string) => Promise<void>;
  pushToast: (message: string) => void;
  route: Route;
  t: (key: string) => string;
}

export type ScanEntryPoint = "contacts" | "wallet";

type UseGuideScannerDomainResult = ReturnType<typeof useContactsGuide> & {
  closeScan: () => void;
  openScan: () => void;
  openWalletScan: () => void;
  scanAllowsManualContact: boolean;
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
  const [scanEntryPoint, setScanEntryPoint] =
    React.useState<ScanEntryPoint | null>(null);
  const [scanStream, setScanStream] = React.useState<MediaStream | null>(null);

  const scanVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const scanOpenRequestIdRef = React.useRef(0);
  const scanIsOpenRef = React.useRef(false);
  const animatedQrDecoderRef = React.useRef(new AnimatedQrDecoder());

  React.useEffect(() => {
    scanIsOpenRef.current = scanIsOpen;
  }, [scanIsOpen]);

  const stopScanStream = React.useCallback(() => {
    const video = scanVideoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
      try {
        video.srcObject = null;
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

  const closeScan = React.useCallback(() => {
    setScanIsOpen(false);
    setScanEntryPoint(null);
    scanOpenRequestIdRef.current += 1;
    animatedQrDecoderRef.current.reset();
    stopScanStream();
  }, [stopScanStream]);

  const startNativeScanFallback = React.useCallback((): boolean => {
    if (!supportsNativeQrScan()) {
      return false;
    }

    closeScan();
    animatedQrDecoderRef.current.reset();

    void (async () => {
      while (true) {
        const result = await startNativeQrScan();
        if (!result) {
          animatedQrDecoderRef.current.reset();
          pushToast(t("scanCameraError"));
          return;
        }

        if (!result.value) {
          animatedQrDecoderRef.current.reset();
          if (!result.cancelled) {
            pushToast(result.message ?? t("scanCameraError"));
          }
          return;
        }

        const animatedResult = animatedQrDecoderRef.current.receive(
          result.value,
        );
        if (animatedResult.accepted) {
          const completedText = String(
            animatedResult.completeText ?? "",
          ).trim();
          if (!completedText) {
            continue;
          }

          await handleScannedTextRef.current(completedText);
          return;
        }

        animatedQrDecoderRef.current.reset();
        await handleScannedTextRef.current(result.value);
        return;
      }
    })();

    return true;
  }, [closeScan, pushToast, t]);

  const openScanForEntryPoint = React.useCallback(
    (entryPoint: ScanEntryPoint) => {
      setScanEntryPoint(entryPoint);
      setScanIsOpen(true);

      const requestId = (scanOpenRequestIdRef.current += 1);

      const media = navigator.mediaDevices as
        | { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> }
        | undefined;
      if (!media?.getUserMedia) {
        if (startNativeScanFallback()) {
          return;
        }

        pushToast(t("scanCameraError"));
        stopScanStream();
        return;
      }

      if (typeof globalThis.isSecureContext === "boolean" && !isSecureContext) {
        if (startNativeScanFallback()) {
          return;
        }

        pushToast(t("scanRequiresHttps"));
        stopScanStream();
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
          const err = e as { name?: unknown; message?: unknown };
          const name = String(err?.name ?? "").trim();
          const message = String(err?.message ?? e ?? "").trim();

          let permissionState: string | null = null;
          try {
            const permissions = (
              navigator as NavigatorWithOptionalCameraPermissions
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

          if (!isPermissionDenied && startNativeScanFallback()) {
            return;
          }

          if (isPermissionDenied) pushToast(t("scanPermissionDenied"));
          else pushToast(t("scanCameraError"));

          stopScanStream();
        }
      })();
    },
    [pushToast, startNativeScanFallback, stopScanStream, t],
  );

  const openScan = React.useCallback(() => {
    openScanForEntryPoint("contacts");
  }, [openScanForEntryPoint]);

  const openWalletScan = React.useCallback(() => {
    openScanForEntryPoint("wallet");
  }, [openScanForEntryPoint]);

  const handleScannedTextRef = React.useRef(onScannedText);
  React.useEffect(() => {
    handleScannedTextRef.current = onScannedText;
  }, [onScannedText]);

  const handleDetectedScanValue = React.useCallback(async (value: string) => {
    const animatedResult = animatedQrDecoderRef.current.receive(value);
    if (animatedResult.accepted) {
      const completedText = String(animatedResult.completeText ?? "").trim();
      if (!completedText) {
        return false;
      }

      await handleScannedTextRef.current(completedText);
      return true;
    }

    await handleScannedTextRef.current(value);
    return true;
  }, []);

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
          video.srcObject = null;
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

      const detectorCtor = (window as WindowWithOptionalBarcodeDetector)
        .BarcodeDetector;

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
              const didHandle = await handleDetectedScanValue(value);
              if (didHandle) {
                handled = true;
                stop();
                return;
              }
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
                const didHandle = await handleDetectedScanValue(value);
                if (didHandle) {
                  handled = true;
                  stop();
                  return;
                }
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
  }, [handleDetectedScanValue, scanIsOpen, scanStream]);

  return {
    closeScan,
    ...contactsGuideDomain,
    openScan,
    openWalletScan,
    scanAllowsManualContact: scanEntryPoint === "contacts",
    scanIsOpen,
    scanVideoRef,
  };
};
