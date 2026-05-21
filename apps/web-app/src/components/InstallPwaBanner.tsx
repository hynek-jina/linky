import React from "react";
import type {
  BeforeInstallPromptEventLike,
  NavigatorWithOptionalStandalone,
} from "../types/browser";
import {
  INSTALL_PWA_DISMISS_COOLDOWN_MS,
  INSTALL_PWA_DISMISSED_AT_MS_STORAGE_KEY,
  INSTALL_PWA_FIRST_SHOW_DELAY_MS,
} from "../utils/constants";
import { safeLocalStorageGet, safeLocalStorageSet } from "../utils/storage";

interface InstallPwaBannerProps {
  t: (key: string) => string;
}

const isStandaloneDisplay = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    // ignore
  }
  const nav = window.navigator as NavigatorWithOptionalStandalone;
  return nav.standalone === true;
};

const isIosBrowser = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
};

const readDismissedAtMs = (): number => {
  const raw = safeLocalStorageGet(INSTALL_PWA_DISMISSED_AT_MS_STORAGE_KEY);
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const isDismissCooldownActive = (): boolean => {
  const dismissedAt = readDismissedAtMs();
  if (dismissedAt <= 0) return false;
  return Date.now() - dismissedAt < INSTALL_PWA_DISMISS_COOLDOWN_MS;
};

const isBeforeInstallPromptEvent = (
  event: Event,
): event is BeforeInstallPromptEventLike => {
  if (typeof (event as { prompt?: unknown }).prompt !== "function")
    return false;
  const userChoice = (event as { userChoice?: unknown }).userChoice;
  return userChoice !== undefined && userChoice !== null;
};

export const InstallPwaBanner: React.FC<InstallPwaBannerProps> = ({ t }) => {
  const [visible, setVisible] = React.useState(false);
  const [prompting, setPrompting] = React.useState(false);
  const deferredPromptRef = React.useRef<BeforeInstallPromptEventLike | null>(
    null,
  );
  const isIos = React.useMemo(() => isIosBrowser(), []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandaloneDisplay()) return;
    if (isDismissCooldownActive()) return;

    let showTimerId: number | null = null;
    let cancelled = false;

    const scheduleShow = () => {
      if (cancelled) return;
      if (showTimerId !== null) return;
      showTimerId = window.setTimeout(() => {
        showTimerId = null;
        if (cancelled) return;
        if (isStandaloneDisplay()) return;
        if (isDismissCooldownActive()) return;
        setVisible(true);
      }, INSTALL_PWA_FIRST_SHOW_DELAY_MS);
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!isBeforeInstallPromptEvent(event)) return;
      deferredPromptRef.current = event;
      scheduleShow();
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // iOS Safari never fires beforeinstallprompt — show the instruction
    // banner directly after the same delay.
    if (isIos) scheduleShow();

    return () => {
      cancelled = true;
      if (showTimerId !== null) window.clearTimeout(showTimerId);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isIos]);

  const dismiss = React.useCallback(() => {
    safeLocalStorageSet(
      INSTALL_PWA_DISMISSED_AT_MS_STORAGE_KEY,
      String(Date.now()),
    );
    setVisible(false);
  }, []);

  const install = React.useCallback(async () => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;
    setPrompting(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        deferredPromptRef.current = null;
        setVisible(false);
      }
    } catch {
      // user cancelled or the prompt is no longer valid; keep banner so they
      // can try again if they want
    } finally {
      setPrompting(false);
    }
  }, []);

  if (!visible) return null;

  const canPromptNative = !isIos && deferredPromptRef.current !== null;
  const hint = isIos
    ? t("installPwaHintIos")
    : canPromptNative
      ? t("installPwaHintAndroid")
      : t("installPwaHintAndroid");

  return (
    <div className="install-pwa-banner" role="dialog" aria-live="polite">
      <div className="install-pwa-banner-icon" aria-hidden="true">
        ⚡
      </div>
      <div className="install-pwa-banner-text">
        <strong>{t("installPwaTitle")}</strong>
        <span>{hint}</span>
      </div>
      <div className="install-pwa-banner-actions">
        {canPromptNative ? (
          <button
            type="button"
            className="install-pwa-banner-install"
            onClick={() => {
              void install();
            }}
            disabled={prompting}
          >
            {t("installPwaInstall")}
          </button>
        ) : null}
        <button
          type="button"
          className="install-pwa-banner-dismiss"
          aria-label={t("installPwaDismiss")}
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
};
