import React from "react";

import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  cancelAllNativeConversationNotifications,
  cancelNativePushPlaceholder,
  type NativeLocalNotificationPostResult,
  postNativeLocalNotification,
  supportsNativeLocalNotifications,
} from "../platform/nativeBridge";
import { isNativePlatform } from "../platform/runtime";
import {
  appendPushDebugLog,
  clearPushDebugLog,
  readPushDebugLog,
  type PushDebugLogEntry,
} from "../utils/pushDebugLog";
import {
  registerPushNotifications,
  requestNotificationPermission,
  unregisterPushNotifications,
} from "../utils/pushNotifications";

interface PushDebugMessage {
  receivedAtIso: string;
  text: string;
}

interface PushDebugReport {
  cacheKeys: string[];
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  localStorageKeys: string[];
  notificationPermission: string;
  pushSubscriptionApplicationServerKey: string | null;
  pushSubscriptionEndpoint: string | null;
  pushSubscriptionKeys: {
    hasAuth: boolean;
    hasP256dh: boolean;
  } | null;
  serviceWorkerController: boolean;
  serviceWorkerRegistrations: Array<{
    activeScriptUrl: string | null;
    installingScriptUrl: string | null;
    scope: string;
    waitingScriptUrl: string | null;
  }>;
  storedDebugLog: PushDebugLogEntry[];
}

const INITIAL_REPORT: PushDebugReport = {
  cacheKeys: [],
  hasPushManager: false,
  hasServiceWorker: false,
  localStorageKeys: [],
  notificationPermission: "unsupported",
  pushSubscriptionApplicationServerKey: null,
  pushSubscriptionEndpoint: null,
  pushSubscriptionKeys: null,
  storedDebugLog: [],
  serviceWorkerController: false,
  serviceWorkerRegistrations: [],
};

function formatPostResult(
  result: NativeLocalNotificationPostResult | null,
): string {
  return `${result?.status ?? "null"} / ${result?.delivery ?? "-"}`;
}

async function resetServiceWorkersAndCaches(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  }

  if ("caches" in globalThis) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }
}

async function loadPushDebugReport(): Promise<PushDebugReport> {
  const report: PushDebugReport = {
    ...INITIAL_REPORT,
    hasPushManager: "PushManager" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    localStorageKeys: Object.keys(localStorage).sort(),
    notificationPermission:
      "Notification" in window ? Notification.permission : "unsupported",
    serviceWorkerController: Boolean(navigator.serviceWorker?.controller),
  };

  if ("caches" in globalThis) {
    try {
      report.cacheKeys = (await caches.keys()).sort();
    } catch {
      report.cacheKeys = [];
    }
  }

  report.storedDebugLog = await readPushDebugLog();

  if (!report.hasServiceWorker) {
    return report;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    report.serviceWorkerRegistrations = registrations.map((registration) => ({
      activeScriptUrl: registration.active?.scriptURL ?? null,
      installingScriptUrl: registration.installing?.scriptURL ?? null,
      scope: registration.scope,
      waitingScriptUrl: registration.waiting?.scriptURL ?? null,
    }));

    const readyRegistration = await navigator.serviceWorker.ready;
    const subscription = await readyRegistration.pushManager.getSubscription();
    const applicationServerKey = subscription?.options.applicationServerKey;
    report.pushSubscriptionEndpoint = subscription?.endpoint ?? null;
    report.pushSubscriptionApplicationServerKey =
      applicationServerKey === null || applicationServerKey === undefined
        ? null
        : btoa(String.fromCharCode(...new Uint8Array(applicationServerKey)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    report.pushSubscriptionKeys = subscription
      ? {
          hasAuth: Boolean(subscription.getKey("auth")),
          hasP256dh: Boolean(subscription.getKey("p256dh")),
        }
      : null;
  } catch {
    // ignore best-effort debug reads
  }

  return report;
}

export function PushDebugPage(): React.ReactElement {
  const { currentNsec, t } = useAppShellCore();
  const [report, setReport] = React.useState<PushDebugReport>(INITIAL_REPORT);
  const [messages, setMessages] = React.useState<PushDebugMessage[]>([]);
  const [isBusy, setIsBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string>("");

  const refreshReport = React.useCallback(async () => {
    setReport(await loadPushDebugReport());
  }, []);

  React.useEffect(() => {
    void refreshReport();
  }, [refreshReport]);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      const nextText = JSON.stringify(event.data);
      setMessages((prev) =>
        [
          {
            receivedAtIso: new Date().toISOString(),
            text: nextText,
          },
          ...prev,
        ].slice(0, 10),
      );
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  const handleRequestPermission = React.useCallback(async () => {
    setIsBusy(true);
    try {
      const granted = await requestNotificationPermission();
      setStatus(
        granted ? t("notificationsRegistered") : t("notificationsDenied"),
      );
      await refreshReport();
    } finally {
      setIsBusy(false);
    }
  }, [refreshReport, t]);

  const handleRegister = React.useCallback(async () => {
    if (!currentNsec) {
      setStatus(t("notificationsNotLoggedIn"));
      return;
    }

    if (!isNativePlatform() && !("Notification" in window)) {
      setStatus(t("notificationsUnsupported"));
      return;
    }

    setIsBusy(true);
    try {
      if (!isNativePlatform() && Notification.permission === "default") {
        const granted = await requestNotificationPermission();
        if (!granted) {
          setStatus(t("notificationsDenied"));
          await refreshReport();
          return;
        }
      }

      const result = await registerPushNotifications(currentNsec);
      setStatus(
        result.success
          ? t("notificationsRegistered")
          : String(result.error ?? t("notificationsError")),
      );
      await refreshReport();
    } finally {
      setIsBusy(false);
    }
  }, [currentNsec, refreshReport, t]);

  const handleUnregister = React.useCallback(async () => {
    if (!currentNsec) {
      setStatus(t("notificationsNotLoggedIn"));
      return;
    }

    setIsBusy(true);
    try {
      const ok = await unregisterPushNotifications(currentNsec);
      setStatus(ok ? "Unregistered" : "Unregister failed");
      await refreshReport();
    } finally {
      setIsBusy(false);
    }
  }, [currentNsec, refreshReport, t]);

  const handleReset = React.useCallback(async () => {
    setIsBusy(true);
    try {
      await resetServiceWorkersAndCaches();
      await clearPushDebugLog();
      setStatus("Service workers and caches reset");
      await refreshReport();
    } catch (error) {
      setStatus(`Reset failed: ${String(error ?? "")}`);
    } finally {
      setIsBusy(false);
    }
  }, [refreshReport]);

  const handleClearLogs = React.useCallback(async () => {
    setIsBusy(true);
    try {
      await clearPushDebugLog();
      await appendPushDebugLog("client", "debug log cleared from UI");
      setStatus("Debug log cleared");
      await refreshReport();
    } finally {
      setIsBusy(false);
    }
  }, [refreshReport]);

  const reportText = JSON.stringify(
    {
      ...report,
      env: {
        pushServerUrl:
          import.meta.env.VITE_PUSH_SERVER_URL ??
          import.meta.env.VITE_NOTIFICATION_SERVER_URL ??
          null,
        vapidPublicKey:
          localStorage.getItem("linky.push_vapid_public_key") ?? null,
      },
      recentMessages: messages,
    },
    null,
    2,
  );

  const handleCopyLogs = React.useCallback(async () => {
    setIsBusy(true);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportText);
        setStatus("Copied debug report");
      } else {
        setStatus("Clipboard API unavailable");
      }
    } catch (error) {
      setStatus(`Copy failed: ${String(error ?? "")}`);
    } finally {
      setIsBusy(false);
    }
  }, [reportText]);

  const debugPostPayload = React.useCallback(
    (suffix: "a" | "b" | "c", senderName: string, text: string) => ({
      conversationKey: `linky-debug-sender-${suffix}`,
      eventCreatedAtSec: Math.floor(Date.now() / 1000) - 3 * 86400,
      outerEventId: `linky-debug-outer-${suffix}`,
      recipientPubkey: "linky-debug-recipient",
      relayHints: "wss://relay.damus.io",
      senderName,
      text,
    }),
    [],
  );

  const handlePostTest = React.useCallback(() => {
    const result = postNativeLocalNotification(
      debugPostPayload(
        "a",
        "Debug Alice",
        `Test — ${new Date().toLocaleTimeString()}`,
      ),
    );
    setStatus(`post: ${formatPostResult(result)}`);
  }, [debugPostPayload]);

  const handlePostBurst = React.useCallback(() => {
    const results: string[] = [];
    for (let i = 1; i <= 5; i += 1) {
      results.push(
        formatPostResult(
          postNativeLocalNotification(
            debugPostPayload(
              "a",
              "Debug Alice",
              `Burst ${i}/5 — ${new Date().toLocaleTimeString()}`,
            ),
          ),
        ),
      );
    }
    setStatus(`burst: ${results.join(" | ")}`);
  }, [debugPostPayload]);

  const handlePostThreeSenders = React.useCallback(() => {
    const time = new Date().toLocaleTimeString();
    const results = [
      postNativeLocalNotification(
        debugPostPayload(
          "a",
          "Debug Alice",
          `Hello from Debug Alice — ${time}`,
        ),
      ),
      postNativeLocalNotification(
        debugPostPayload("b", "Debug Bob", `Hello from Debug Bob — ${time}`),
      ),
      postNativeLocalNotification(
        debugPostPayload(
          "c",
          "Debug Carol",
          `Hello from Debug Carol — ${time}`,
        ),
      ),
    ];
    setStatus(`senders: ${results.map(formatPostResult).join(" | ")}`);
  }, [debugPostPayload]);

  const handleCancelAllNotifications = React.useCallback(() => {
    const ok = cancelAllNativeConversationNotifications();
    setStatus(`cancelAll: ${ok}`);
  }, []);

  const handleCancelPushPlaceholder = React.useCallback(() => {
    const ok = cancelNativePushPlaceholder("linky-debug-outer-a");
    setStatus(`cancelPlaceholder: ${ok}`);
  }, []);

  // Phase 3 shipped the five buttons below as a temporary developer trigger for the
  // native notification bridge before the real inbox path existed. Phase 4 criterion 4
  // proved the real path drives the bridge, so they are now gated behind
  // `import.meta.env.DEV`: Vite constant-folds this to `false` in any production build
  // (including the debug APK, which bundles `vite build` output), so the block is dead
  // code there and the `linky-debug-sender-*` conversation keys cannot reach a device.
  // Kept rather than deleted so the bridge stays pokeable from `bun run dev`.
  const localNotificationsSupported =
    import.meta.env.DEV && supportsNativeLocalNotifications();

  return (
    <section className="panel">
      <div className="settings-row settings-row-stack-mobile">
        <div className="settings-left">
          <span className="settings-label">Push / SW debug</span>
        </div>
        <div className="settings-right settings-right-wrap">
          <div className="badge-box badge-box-wrap">
            <button
              className="ghost"
              onClick={() => void refreshReport()}
              disabled={isBusy}
            >
              Refresh
            </button>
            <button
              className="ghost"
              onClick={() => void handleRequestPermission()}
              disabled={isBusy}
            >
              Permission
            </button>
            <button
              className="ghost"
              onClick={() => void handleRegister()}
              disabled={isBusy || !currentNsec}
            >
              Register
            </button>
            <button
              className="ghost"
              onClick={() => void handleUnregister()}
              disabled={isBusy}
            >
              Unregister
            </button>
            <button
              className="ghost"
              onClick={() => void handleReset()}
              disabled={isBusy}
            >
              Reset SW
            </button>
            <button
              className="ghost"
              onClick={() => void handleClearLogs()}
              disabled={isBusy}
            >
              Clear logs
            </button>
            <button
              className="ghost"
              onClick={() => void handleCopyLogs()}
              disabled={isBusy}
            >
              Copy logs
            </button>
            {localNotificationsSupported ? (
              <>
                <button
                  className="ghost"
                  onClick={handlePostTest}
                  disabled={isBusy}
                >
                  Post test
                </button>
                <button
                  className="ghost"
                  onClick={handlePostBurst}
                  disabled={isBusy}
                >
                  Post burst of 5
                </button>
                <button
                  className="ghost"
                  onClick={handlePostThreeSenders}
                  disabled={isBusy}
                >
                  Post 3 senders
                </button>
                <button
                  className="ghost"
                  onClick={handleCancelAllNotifications}
                  disabled={isBusy}
                >
                  Cancel all (Linky)
                </button>
                <button
                  className="ghost"
                  onClick={handleCancelPushPlaceholder}
                  disabled={isBusy}
                >
                  Cancel placeholder
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {status ? (
        <div className="settings-row">
          <div style={{ padding: "8px", fontSize: "12px", color: "#666" }}>
            {status}
          </div>
        </div>
      ) : null}

      <pre
        style={{
          overflowX: "auto",
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        {reportText}
      </pre>
    </section>
  );
}
