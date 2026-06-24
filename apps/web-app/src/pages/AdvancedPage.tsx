import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Bitcoin,
  BrushCleaning,
  ClipboardCopy,
  Cloud,
  Coins,
  Copy,
  Download,
  FlaskConical,
  KeyRound,
  Landmark,
  Languages,
  LogOut,
  MessageCircle,
  RadioTower,
  RefreshCw,
  RotateCw,
  ShieldCheck,
  Upload,
  Zap,
} from "lucide-react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import {
  PasswordManagerSaveForm,
  type PasswordManagerSaveFormHandle,
} from "../components/PasswordManagerSaveForm";
import { useNavigation } from "../hooks/useRouting";
import { getNativeNotificationPermissionState } from "../platform/nativeBridge";
import type { PasswordManagerSaveResult } from "../platform/passwordManager";
import { isNativePlatform } from "../platform/runtime";

interface AdvancedPageProps {
  __APP_VERSION__: string;
  activeNostrIdentitySource: "custom" | "derived";
  connectedRelayCount: number;
  copyNostrKeys: () => void;
  copySeed: () => void;
  currentNpub: string | null;
  currentNsec: string | null;
  dedupeContacts: () => Promise<void>;
  dedupeContactsIsBusy: boolean;
  defaultMintDisplay: string | null;
  evoluConnectedServerCount: number;
  evoluOverallStatus: "connected" | "checking" | "disconnected";
  evoluServerUrls: string[];
  exportAppData: () => void;
  handleImportAppDataFilePicked: (file: File | null) => Promise<void>;
  importDataFileInputRef: React.RefObject<HTMLInputElement | null>;
  isSeedLogin: boolean;
  lightningInvoiceAutoPayLimit: number;
  logoutArmed: boolean;
  nostrRelayOverallStatus: "connected" | "checking" | "disconnected";
  passwordManagerSeedUsername: string;
  payWithCashuEnabled: boolean;
  cashuAutoswapEnabled: boolean;
  showProfileQrOnTiltEnabled: boolean;
  pushToast: (message: string) => void;
  relayUrls: string[];
  requestImportAppData: () => void;
  requestDeriveNostrKeys: () => Promise<void>;
  requestPasteNostrKeys: () => Promise<void>;
  requestLogout: () => void;
  saveSeedToPasswordManager: () => Promise<PasswordManagerSaveResult>;
  seedMnemonic: string | null;
  setLightningInvoiceAutoPayLimit: (value: number) => void;
  setPayWithCashuEnabled: (value: boolean) => void;
  setCashuAutoswapEnabled: (value: boolean) => void;
  setShowProfileQrOnTiltEnabled: (value: boolean) => void;
  t: (key: string) => string;
}

export function AdvancedPage({
  __APP_VERSION__,
  connectedRelayCount,
  copyNostrKeys,
  copySeed,
  currentNsec,
  dedupeContacts,
  dedupeContactsIsBusy,
  defaultMintDisplay,
  evoluConnectedServerCount,
  evoluOverallStatus,
  evoluServerUrls,
  exportAppData,
  handleImportAppDataFilePicked,
  importDataFileInputRef,
  lightningInvoiceAutoPayLimit,
  logoutArmed,
  nostrRelayOverallStatus,
  passwordManagerSeedUsername,
  payWithCashuEnabled,
  cashuAutoswapEnabled,
  pushToast,
  relayUrls,
  requestImportAppData,
  requestPasteNostrKeys,
  requestLogout,
  saveSeedToPasswordManager,
  seedMnemonic,
  setPayWithCashuEnabled,
  setCashuAutoswapEnabled,
  t,
}: AdvancedPageProps): React.ReactElement {
  const navigateTo = useNavigation();
  const { formatDisplayedAmountParts, lang } = useAppShellCore();
  const { openFeedbackContact, setLang } = useAppShellActions();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsIsBusy, setNotificationsIsBusy] = useState(false);
  const [armedSecurityAction, setArmedSecurityAction] = useState<
    "copyNostr" | "copySeed" | "pasteNostr" | "saveSeed" | null
  >(null);
  const armTimeoutRef = useRef<number | null>(null);
  const passwordManagerSaveFormRef =
    useRef<PasswordManagerSaveFormHandle | null>(null);
  const hasSeedMnemonic = String(seedMnemonic ?? "").trim().length > 0;
  const hasCurrentNsec = String(currentNsec ?? "").trim().length > 0;
  const appVersionLabel = __APP_COMMIT_SHA__
    ? `${__APP_VERSION__} (${__APP_COMMIT_SHA__})`
    : `${__APP_VERSION__}`;

  const getAutoPayLimitLabel = useCallback(
    (limit: number) => {
      const displayAmount = formatDisplayedAmountParts(limit);
      return `${displayAmount.approxPrefix}${displayAmount.amountText} ${displayAmount.unitLabel}`;
    },
    [formatDisplayedAmountParts],
  );

  const clearArmTimeout = useCallback(() => {
    if (armTimeoutRef.current !== null) {
      window.clearTimeout(armTimeoutRef.current);
      armTimeoutRef.current = null;
    }
  }, []);

  const handleReloadApp = useCallback(async () => {
    if ("serviceWorker" in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(
          registrations.map((registration) => registration.update()),
        );
      } catch {
        // Reload anyway even if the service worker update check fails.
      }
    }

    window.location.reload();
  }, []);

  const requestSecurityAction = useCallback(
    (
      action: "copyNostr" | "copySeed" | "pasteNostr" | "saveSeed",
      run: () => void | Promise<void>,
      hintKey = "sensitiveActionArmedHint",
    ) => {
      if (armedSecurityAction === action) {
        clearArmTimeout();
        setArmedSecurityAction(null);
        void run();
        return;
      }

      clearArmTimeout();
      setArmedSecurityAction(action);
      pushToast(t(hintKey));
      armTimeoutRef.current = window.setTimeout(() => {
        setArmedSecurityAction(null);
        armTimeoutRef.current = null;
      }, 5000);
    },
    [armedSecurityAction, clearArmTimeout, pushToast, t],
  );

  useEffect(() => {
    return () => {
      clearArmTimeout();
    };
  }, [clearArmTimeout]);

  useEffect(() => {
    clearArmTimeout();
    setArmedSecurityAction(null);
  }, [clearArmTimeout]);

  useEffect(() => {
    if (isNativePlatform()) {
      setNotificationsEnabled(
        getNativeNotificationPermissionState() === "granted",
      );
      return;
    }

    if (
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !("serviceWorker" in navigator)
    ) {
      setNotificationsEnabled(false);
      return;
    }

    let isActive = true;
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;
        if (isActive) setNotificationsEnabled(subscription !== null);
      } catch {
        if (isActive) setNotificationsEnabled(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const handleNotificationsChange = async (enabled: boolean) => {
    if (!currentNsec) {
      pushToast(t("notificationsNotLoggedIn"));
      return;
    }

    setNotificationsIsBusy(true);
    try {
      const {
        registerPushNotifications,
        requestNotificationPermission,
        unregisterPushNotifications,
      } = await import("../utils/pushNotifications");

      if (enabled) {
        pushToast(t("notificationsRegistering"));
        const permissionGranted = await requestNotificationPermission();
        if (!permissionGranted) {
          pushToast(t("notificationsDenied"));
          return;
        }

        const result = await registerPushNotifications(currentNsec);
        if (result.success) {
          setNotificationsEnabled(true);
          pushToast(t("notificationsRegistered"));
        } else {
          pushToast(String(result.error ?? t("notificationsError")));
        }
        return;
      }

      const disabled = await unregisterPushNotifications(currentNsec);
      if (disabled) {
        setNotificationsEnabled(false);
        pushToast(t("notificationsDisabled"));
      } else {
        pushToast(t("notificationsDisableError"));
      }
    } catch {
      pushToast(t("notificationsError"));
    } finally {
      setNotificationsIsBusy(false);
    }
  };

  const handleSaveSeed = useCallback(async () => {
    if (!hasSeedMnemonic) {
      pushToast(t("seedMissing"));
      return;
    }

    passwordManagerSaveFormRef.current?.requestSave();

    const result = await saveSeedToPasswordManager();
    if (result === "failed") {
      pushToast(t("onboardingBackupSaveFailed"));
      return;
    }

    if (result === "unsupported") {
      pushToast(t("onboardingBackupSaveUnavailable"));
      return;
    }

    if (result === "saved") {
      pushToast(t("onboardingBackupSaveRequested"));
    }
  }, [hasSeedMnemonic, pushToast, saveSeedToPasswordManager, t]);

  return (
    <section className="panel settings-page">
      <PasswordManagerSaveForm
        ref={passwordManagerSaveFormRef}
        username={passwordManagerSeedUsername}
        password={String(seedMnemonic ?? "")}
      />

      <div className="settings-section">
        <h2 className="settings-section-title">{t("settingsGeneral")}</h2>

        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Languages size={18} />
            </span>
            <span className="settings-label">{t("language")}</span>
          </div>
          <div className="settings-right">
            <select
              className="select"
              value={lang}
              onChange={(event) =>
                setLang(event.target.value === "cs" ? "cs" : "en")
              }
              aria-label={t("language")}
            >
              <option value="cs">{t("czech")}</option>
              <option value="en">{t("english")}</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => navigateTo({ route: "settingsUnits" })}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Bitcoin size={18} />
            </span>
            <span className="settings-label">{t("unit")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={openFeedbackContact}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <MessageCircle size={18} />
            </span>
            <span className="settings-label">{t("feedback")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Bell size={18} />
            </span>
            <span className="settings-label">{t("notifications")}</span>
          </div>
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              aria-label={t("notifications")}
              checked={notificationsEnabled}
              disabled={!currentNsec || notificationsIsBusy}
              onChange={(event) =>
                void handleNotificationsChange(event.target.checked)
              }
            />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">{t("settingsPayments")}</h2>

        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Coins size={18} />
            </span>
            <span className="settings-label">{t("preferCashu")}</span>
          </div>
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              aria-label={t("preferCashu")}
              checked={payWithCashuEnabled}
              onChange={(event) => setPayWithCashuEnabled(event.target.checked)}
            />
          </label>
        </div>

        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <RefreshCw size={18} />
            </span>
            <span className="settings-label">{t("cashuAutoswap")}</span>
          </div>
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              aria-label={t("cashuAutoswap")}
              checked={cashuAutoswapEnabled}
              onChange={(event) =>
                setCashuAutoswapEnabled(event.target.checked)
              }
            />
          </label>
        </div>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => navigateTo({ route: "advancedAutoPayLimit" })}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Zap size={18} />
            </span>
            <span className="settings-label">
              {t("lightningInvoiceAutoPayLimit")}
            </span>
          </span>
          <span className="settings-right">
            <span className="settings-tail-content settings-value">
              {getAutoPayLimitLabel(lightningInvoiceAutoPayLimit)}
            </span>
            <span className="settings-chevron" aria-hidden="true">
              &gt;
            </span>
          </span>
        </button>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">{t("settingsNetwork")}</h2>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => navigateTo({ route: "nostrRelays" })}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <RadioTower size={18} />
            </span>
            <span className="settings-label">Nostr</span>
          </span>
          <span className="settings-right">
            <span className="settings-tail-content settings-connection-state">
              <span className="relay-count">
                {connectedRelayCount}/{relayUrls.length}
              </span>
              <span className={`status-dot ${nostrRelayOverallStatus}`} />
            </span>
            <span className="settings-chevron" aria-hidden="true">
              &gt;
            </span>
          </span>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => navigateTo({ route: "evoluServers" })}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Cloud size={18} />
            </span>
            <span className="settings-label">Evolu</span>
          </span>
          <span className="settings-right">
            <span className="settings-tail-content settings-connection-state">
              <span className="relay-count">
                {evoluConnectedServerCount}/{evoluServerUrls.length}
              </span>
              <span className={`status-dot ${evoluOverallStatus}`} />
            </span>
            <span className="settings-chevron" aria-hidden="true">
              &gt;
            </span>
          </span>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => navigateTo({ route: "mints" })}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Landmark size={18} />
            </span>
            <span className="settings-label">Mint</span>
          </span>
          <span className="settings-right">
            {defaultMintDisplay ? (
              <span className="settings-tail-content settings-value settings-value-truncate">
                {defaultMintDisplay}
              </span>
            ) : null}
            <span className="settings-chevron" aria-hidden="true">
              &gt;
            </span>
          </span>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => navigateTo({ route: "cashuTokens" })}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Coins size={18} />
            </span>
            <span className="settings-label">{t("tokens")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={exportAppData}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Upload size={18} />
            </span>
            <span className="settings-label">{t("exportData")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={requestImportAppData}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Download size={18} />
            </span>
            <span className="settings-label">{t("importData")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => void dedupeContacts()}
          disabled={dedupeContactsIsBusy}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <BrushCleaning size={18} />
            </span>
            <span className="settings-label">{t("dedupeContacts")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <input
          ref={importDataFileInputRef}
          type="file"
          accept=".txt,.json,application/json,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            e.currentTarget.value = "";
            void handleImportAppDataFilePicked(file);
          }}
        />

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => void handleReloadApp()}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <RotateCw size={18} />
            </span>
            <span className="settings-label">{t("reloadApp")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className="settings-row settings-link"
          onClick={() => navigateTo({ route: "advancedPushDebug" })}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <FlaskConical size={18} />
            </span>
            <span className="settings-label">Push / SW Debug (log)</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>
      </div>

      <div className="settings-section">
        <h2 className="settings-section-title">{t("settingsSecurity")}</h2>

        <button
          type="button"
          className={
            armedSecurityAction === "copySeed"
              ? "settings-row settings-link settings-sensitive-action is-armed"
              : "settings-row settings-link settings-sensitive-action"
          }
          onClick={() => requestSecurityAction("copySeed", copySeed)}
          disabled={!hasSeedMnemonic}
          data-guide="copy-seed"
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <ClipboardCopy size={18} />
            </span>
            <span className="settings-label">{t("copyKeys")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className={
            armedSecurityAction === "saveSeed"
              ? "settings-row settings-link settings-sensitive-action is-armed"
              : "settings-row settings-link settings-sensitive-action"
          }
          onClick={() => requestSecurityAction("saveSeed", handleSaveSeed)}
          disabled={!hasSeedMnemonic}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <span className="settings-label">{t("saveKeysToPasswords")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className={
            armedSecurityAction === "pasteNostr"
              ? "settings-row settings-link settings-sensitive-action is-armed"
              : "settings-row settings-link settings-sensitive-action"
          }
          onClick={() =>
            requestSecurityAction(
              "pasteNostr",
              requestPasteNostrKeys,
              "nostrPasteArmedHint",
            )
          }
          disabled={!hasCurrentNsec || !hasSeedMnemonic}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <KeyRound size={18} />
            </span>
            <span className="settings-label">{t("pasteCustomNostrKeys")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className={
            armedSecurityAction === "copyNostr"
              ? "settings-row settings-link settings-sensitive-action is-armed"
              : "settings-row settings-link settings-sensitive-action"
          }
          onClick={() => requestSecurityAction("copyNostr", copyNostrKeys)}
          disabled={!hasCurrentNsec}
          data-guide="copy-nostr-keys"
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <Copy size={18} />
            </span>
            <span className="settings-label">{t("copyNostrKeys")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>

        <button
          type="button"
          className={
            logoutArmed
              ? "settings-row settings-link settings-danger-link is-armed"
              : "settings-row settings-link settings-danger-link"
          }
          onClick={requestLogout}
        >
          <span className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              <LogOut size={18} />
            </span>
            <span className="settings-label">{t("logout")}</span>
          </span>
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </button>
      </div>

      <div className="settings-version">
        <div className="muted">{appVersionLabel}</div>
      </div>
    </section>
  );
}
