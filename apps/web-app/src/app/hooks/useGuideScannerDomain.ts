import React from "react";
import type { NavigatorWithOptionalCameraPermissions } from "../../types/browser";
import type { Route } from "../../types/route";
import { appendPushDebugLog } from "../../utils/pushDebugLog";
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

const formatScanDebugDetails = (details?: Record<string, unknown>) => {
  if (!details) {
    return null;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return "[unserializable scan details]";
  }
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

  React.useEffect(() => {
    scanIsOpenRef.current = scanIsOpen;
  }, [scanIsOpen]);

  const logScanDebug = React.useCallback(
    (message: string, details?: Record<string, unknown>) => {
      console.log("[linky][scan]", message, formatScanDebugDetails(details));
      void appendPushDebugLog("client", `scan ${message}`, details);
    },
    [],
  );

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
    stopScanStream();
  }, [stopScanStream]);

  const openScanForEntryPoint = React.useCallback(
    (entryPoint: ScanEntryPoint) => {
      setScanEntryPoint(entryPoint);
      setScanIsOpen(true);

      const requestId = (scanOpenRequestIdRef.current += 1);
      const media = navigator.mediaDevices as
        | {
            getUserMedia?: (
              constraints: MediaStreamConstraints,
            ) => Promise<MediaStream>;
          }
        | undefined;

      if (!media?.getUserMedia) {
        pushToast(t("scanCameraError"));
        stopScanStream();
        return;
      }

      if (typeof globalThis.isSecureContext === "boolean" && !isSecureContext) {
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
        } catch (error) {
          const err = error as { message?: unknown; name?: unknown };
          const name = String(err?.name ?? "").trim();
          const message = String(err?.message ?? error ?? "").trim();

          let permissionState: string | null = null;
          try {
            const permissions = (
              navigator as NavigatorWithOptionalCameraPermissions
            ).permissions;
            const result = await permissions?.query?.({ name: "camera" });
            permissionState = String(result?.state ?? "").trim() || null;
          } catch {
            // ignore
          }

          logScanDebug("getUserMedia failed", {
            href: globalThis.location?.href ?? null,
            isSecureContext:
              typeof globalThis.isSecureContext === "boolean"
                ? globalThis.isSecureContext
                : null,
            message,
            name,
            permissionState,
          });

          const isPermissionDenied =
            name === "NotAllowedError" ||
            /permission/i.test(message) ||
            /denied/i.test(message);

          pushToast(
            isPermissionDenied
              ? t("scanPermissionDenied")
              : t("scanCameraError"),
          );
          stopScanStream();
        }
      })();
    },
    [logScanDebug, pushToast, stopScanStream, t],
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
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
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

      const detectorCtor = window.BarcodeDetector;
      const detector = detectorCtor
        ? new detectorCtor({ formats: ["qr_code"] })
        : null;
      const jsQr = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (cancelled) {
          return;
        }
        if (!video || video.readyState < 2) {
          rafId = window.requestAnimationFrame(() => {
            void tick();
          });
          return;
        }

        const now = Date.now();
        if (now - lastScanAt < 200) {
          rafId = window.requestAnimationFrame(() => {
            void tick();
          });
          return;
        }
        lastScanAt = now;

        try {
          if (handled) {
            return;
          }

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
            const width = video.videoWidth || 0;
            const height = video.videoHeight || 0;
            if (width > 0 && height > 0) {
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(video, 0, 0, width, height);
              const imageData = ctx.getImageData(0, 0, width, height);
              const result = jsQr(imageData.data, width, height);
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

        rafId = window.requestAnimationFrame(() => {
          void tick();
        });
      };

      rafId = window.requestAnimationFrame(() => {
        void tick();
      });
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
