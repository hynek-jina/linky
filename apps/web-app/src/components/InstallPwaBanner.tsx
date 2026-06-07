import React from "react";
import {
  getTelemetryAppRuntime,
  getTelemetryDevicePlatform,
  isNativePlatform,
} from "../platform/runtime";
import type { BeforeInstallPromptEventLike } from "../types/browser";
import {
  INSTALL_PWA_DISMISS_COOLDOWN_MS,
  INSTALL_PWA_DISMISSED_AT_MS_STORAGE_KEY,
  INSTALL_PWA_FIRST_SHOW_DELAY_MS,
} from "../utils/constants";
import { safeLocalStorageGet, safeLocalStorageSet } from "../utils/storage";

interface InstallPwaBannerProps {
  t: (key: string) => string;
}

interface InstallStep {
  icon: React.ReactNode;
  text: string;
}

let cachedInstallPrompt: BeforeInstallPromptEventLike | null = null;
let globalListenersRegistered = false;
const installPromptListeners = new Set<
  (prompt: BeforeInstallPromptEventLike | null) => void
>();

const notifyInstallPromptListeners = (
  prompt: BeforeInstallPromptEventLike | null,
) => {
  cachedInstallPrompt = prompt;
  for (const listener of installPromptListeners) {
    listener(prompt);
  }
};

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

const registerGlobalInstallPromptListeners = () => {
  if (globalListenersRegistered) return;
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (!isBeforeInstallPromptEvent(event)) return;
    notifyInstallPromptListeners(event);
  });

  window.addEventListener("appinstalled", () => {
    notifyInstallPromptListeners(null);
  });

  globalListenersRegistered = true;
};

registerGlobalInstallPromptListeners();

const hasInstalledRelatedPwa = async (): Promise<boolean> => {
  if (typeof navigator === "undefined") return false;
  const getInstalledRelatedApps = Reflect.get(
    navigator,
    "getInstalledRelatedApps",
  );
  if (typeof getInstalledRelatedApps !== "function") return false;

  try {
    const apps = await getInstalledRelatedApps.call(navigator);
    if (!Array.isArray(apps)) return false;
    return apps.some((app) => Reflect.get(app, "platform") === "webapp");
  } catch {
    return false;
  }
};

const getInstallAppDomain = (): string => {
  if (typeof window === "undefined") return "app.linky.fit";
  return window.location.hostname || "app.linky.fit";
};

const InstallBrowserMenuIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="5" r="1.75" fill="currentColor" />
    <circle cx="12" cy="12" r="1.75" fill="currentColor" />
    <circle cx="12" cy="19" r="1.75" fill="currentColor" />
  </svg>
);

const InstallIosShareIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3.5v10"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 7 12 3.5 15.5 7"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 10.5v8a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-8"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const InstallIosSafariIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
    <path
      d="M14.8 9.2 10.2 13.8"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
    <path
      d="m14.8 9.2-1.2 4-3.4.6.6-3.4 4-1.2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const InstallAddToHomeIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z"
      stroke="currentColor"
      strokeWidth="1.9"
    />
    <path
      d="M12 8.5v7"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
    <path
      d="M8.5 12h7"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  </svg>
);

export const InstallPwaBanner: React.FC<InstallPwaBannerProps> = ({ t }) => {
  const [visible, setVisible] = React.useState(false);
  const [prompting, setPrompting] = React.useState(false);
  const [promptAvailable, setPromptAvailable] = React.useState(
    cachedInstallPrompt !== null,
  );
  const isIos = React.useMemo(() => isIosBrowser(), []);
  const isSafariOnIos = React.useMemo(() => isIosSafari(), []);
  const appDomain = React.useMemo(() => getInstallAppDomain(), []);

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

    const handleInstallPromptChange = (
      prompt: BeforeInstallPromptEventLike | null,
    ) => {
      setPromptAvailable(prompt !== null);
      if (prompt) {
        scheduleShow();
        return;
      }
      setVisible(false);
    };

    installPromptListeners.add(handleInstallPromptChange);
    handleInstallPromptChange(cachedInstallPrompt);

    // iOS never fires beforeinstallprompt. Some Android browsers also skip it,
    // so mobile visitors still get the manual install path. Chromium can also
    // report a same-scope installed PWA, which lets us suppress this banner.
    void (async () => {
      if (await hasInstalledRelatedPwa()) {
        notifyInstallPromptListeners(null);
        setVisible(false);
        return;
      }
      scheduleShow();
    })();

    return () => {
      cancelled = true;
      if (showTimerId !== null) window.clearTimeout(showTimerId);
      installPromptListeners.delete(handleInstallPromptChange);
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
    const deferredPrompt = cachedInstallPrompt;
    if (!deferredPrompt) return;
    setPrompting(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      notifyInstallPromptListeners(null);
      if (outcome === "accepted") {
        setVisible(false);
      } else {
        dismiss();
      }
    } catch {
      // user cancelled or the prompt is no longer valid; keep banner so they
      // can try again if they want
    } finally {
      setPrompting(false);
    }
  }, [dismiss]);

  if (!visible) return null;

  const canPromptNative = !isIos && promptAvailable;
  const intro = isIos
    ? isSafariOnIos
      ? t("installPwaIntroIos")
      : t("installPwaIntroIosOtherBrowser")
    : canPromptNative
      ? t("installPwaIntroAndroidPrompt")
      : t("installPwaIntroAndroidManual");
  const steps: InstallStep[] = isIos
    ? isSafariOnIos
      ? [
          {
            icon: <InstallIosShareIcon />,
            text: t("installPwaStepIosShare"),
          },
          {
            icon: <InstallAddToHomeIcon />,
            text: t("installPwaStepIosAdd"),
          },
        ]
      : [
          {
            icon: <InstallIosSafariIcon />,
            text: t("installPwaStepIosOpenSafari"),
          },
          {
            icon: <InstallIosShareIcon />,
            text: t("installPwaStepIosShare"),
          },
          {
            icon: <InstallAddToHomeIcon />,
            text: t("installPwaStepIosAdd"),
          },
        ]
    : [
        {
          icon: <InstallBrowserMenuIcon />,
          text: t("installPwaStepAndroidMenu"),
        },
        {
          icon: <InstallAddToHomeIcon />,
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

        <div
          className={
            canPromptNative
              ? "install-pwa-app-card install-pwa-app-card-with-action"
              : "install-pwa-app-card"
          }
        >
          <img src="/pwa-192x192.png" alt="" className="install-pwa-app-icon" />
          <div className="install-pwa-app-meta">
            <strong>Linky</strong>
            <span>{appDomain}</span>
          </div>
          {canPromptNative ? (
            <button
              type="button"
              className="install-pwa-install install-pwa-install-inline"
              onClick={() => {
                void install();
              }}
              disabled={prompting}
            >
              {t("installPwaInstall")}
            </button>
          ) : null}
        </div>

        <p id="install-pwa-description" className="install-pwa-intro">
          {intro}
        </p>

        {canPromptNative ? null : (
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
        )}
      </section>
    </div>
  );
};
