import React from "react";
import type { BeforeInstallPromptEventLike } from "../types/browser";
import {
  getTelemetryAppRuntime,
  getTelemetryDevicePlatform,
  isNativePlatform,
} from "../platform/runtime";
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
  return Reflect.get(window.navigator, "standalone") === true;
};

const getUserAgent = (): string => {
  if (typeof navigator === "undefined") return "";
  return String(navigator.userAgent ?? "");
};

const isMobileBrowser = (): boolean => {
  const platform = getTelemetryDevicePlatform();
  return platform === "android" || platform === "iphone" || platform === "ipad";
};

const isIosBrowser = (): boolean => {
  const platform = getTelemetryDevicePlatform();
  return platform === "iphone" || platform === "ipad";
};

const isIosSafari = (): boolean => {
  if (!isIosBrowser()) return false;
  const userAgent = getUserAgent();
  return (
    /safari/i.test(userAgent) &&
    !/crios|fxios|edgios|opios|duckduckgo/i.test(userAgent)
  );
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
  if (typeof Reflect.get(event, "prompt") !== "function") return false;
  const userChoice = Reflect.get(event, "userChoice");
  return userChoice !== undefined && userChoice !== null;
};

export const InstallPwaBanner: React.FC<InstallPwaBannerProps> = ({ t }) => {
  const [visible, setVisible] = React.useState(false);
  const [prompting, setPrompting] = React.useState(false);
  const deferredPromptRef = React.useRef<BeforeInstallPromptEventLike | null>(
    null,
  );
  const isIos = React.useMemo(() => isIosBrowser(), []);
  const isSafariOnIos = React.useMemo(() => isIosSafari(), []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativePlatform()) return;
    if (isStandaloneDisplay()) return;
    if (getTelemetryAppRuntime() === "pwa") return;
    if (!isMobileBrowser()) return;
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

    // iOS never fires beforeinstallprompt. Some Android browsers also skip it,
    // so mobile visitors still get the manual install path.
    scheduleShow();

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
  const intro = isIos
    ? isSafariOnIos
      ? t("installPwaIntroIos")
      : t("installPwaIntroIosOtherBrowser")
    : canPromptNative
      ? t("installPwaIntroAndroidPrompt")
      : t("installPwaIntroAndroidManual");
  const steps = isIos
    ? [
        {
          icon: "↑",
          text: t("installPwaStepIosShare"),
        },
        {
          icon: "+",
          text: t("installPwaStepIosAdd"),
        },
      ]
    : [
        {
          icon: "⋮",
          text: t("installPwaStepAndroidMenu"),
        },
        {
          icon: "+",
          text: t("installPwaStepAndroidAdd"),
        },
      ];

  return (
    <div className="install-pwa-overlay" role="presentation">
      <section
        className="install-pwa-sheet"
        role="dialog"
        aria-modal="false"
        aria-labelledby="install-pwa-title"
        aria-describedby="install-pwa-description"
      >
        <header className="install-pwa-header">
          <h2 id="install-pwa-title">{t("installPwaTitle")}</h2>
          <button
            type="button"
            className="install-pwa-cancel"
            onClick={dismiss}
          >
            {t("installPwaDismiss")}
          </button>
        </header>

        <p id="install-pwa-description" className="install-pwa-intro">
          {intro}
        </p>

        <ol className="install-pwa-steps">
          {steps.map((step) => (
            <li key={step.text}>
              <span className="install-pwa-step-icon" aria-hidden="true">
                {step.icon}
              </span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>

        {canPromptNative ? (
          <button
            type="button"
            className="install-pwa-install"
            onClick={() => {
              void install();
            }}
            disabled={prompting}
          >
            {t("installPwaInstall")}
          </button>
        ) : null}
      </section>
    </div>
  );
};
