import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  PasswordManagerSaveForm,
  type PasswordManagerSaveFormHandle,
} from "../components/PasswordManagerSaveForm";
import { useNavigation } from "../hooks/useRouting";
import type { PasswordManagerSaveResult } from "../platform/passwordManager";
import { LIGHTNING_INVOICE_AUTO_PAY_LIMIT_OPTIONS } from "../utils/constants";

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
  activeNostrIdentitySource,
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
  showProfileQrOnTiltEnabled,
  pushToast,
  relayUrls,
  requestImportAppData,
  requestDeriveNostrKeys,
  requestPasteNostrKeys,
  requestLogout,
  saveSeedToPasswordManager,
  seedMnemonic,
  setLightningInvoiceAutoPayLimit,
  setPayWithCashuEnabled,
  setCashuAutoswapEnabled,
  setShowProfileQrOnTiltEnabled,
  t,
}: AdvancedPageProps): React.ReactElement {
  const navigateTo = useNavigation();
  const { formatDisplayedAmountParts } = useAppShellCore();
  const [pushStatus, setPushStatus] = useState<string>("");
  const [pushError, setPushError] = useState<string>("");
  const [armedNostrAction, setArmedNostrAction] = useState<
    "derive" | "paste" | null
  >(null);
  const armTimeoutRef = useRef<number | null>(null);
  const passwordManagerSaveFormRef =
    useRef<PasswordManagerSaveFormHandle | null>(null);
  const hasSeedMnemonic = String(seedMnemonic ?? "").trim().length > 0;
  const hasCurrentNsec = String(currentNsec ?? "").trim().length > 0;
  const isCustomNostrIdentity = activeNostrIdentitySource === "custom";
  const customAutoPayLimitSelected =
    !LIGHTNING_INVOICE_AUTO_PAY_LIMIT_OPTIONS.some(
      (limit) => limit === lightningInvoiceAutoPayLimit,
    );
  const appVersionLabel = __APP_COMMIT_SHA__
    ? `v${__APP_VERSION__} (${__APP_COMMIT_SHA__})`
    : `v${__APP_VERSION__}`;

  const getAutoPayLimitLabel = useCallback(
    (limit: number) => {
      if (limit === 0) return "0";
      const displayAmount = formatDisplayedAmountParts(limit);
      return `${displayAmount.approxPrefix}${displayAmount.amountText}`;
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

  const armNostrAction = useCallback(
    (action: "derive" | "paste") => {
      clearArmTimeout();
      setArmedNostrAction(action);
      pushToast(
        t(action === "derive" ? "nostrDeriveArmedHint" : "nostrPasteArmedHint"),
      );
      armTimeoutRef.current = window.setTimeout(() => {
        setArmedNostrAction(null);
        armTimeoutRef.current = null;
      }, 5000);
    },
    [clearArmTimeout, pushToast, t],
  );

  useEffect(() => {
    return () => {
      clearArmTimeout();
    };
  }, [clearArmTimeout]);

  useEffect(() => {
    clearArmTimeout();
    setArmedNostrAction(null);
  }, [clearArmTimeout]);

  const handleRegisterNotifications = async () => {
    setPushStatus(t("notificationsRegistering"));
    setPushError("");

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushError(t("notificationsUnsupported"));
      return;
    }

    if (!currentNsec) {
      setPushError(t("notificationsNotLoggedIn"));
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        const { registerPushNotifications } =
          await import("../utils/pushNotifications");
        const result = await registerPushNotifications(currentNsec);

        if (result.success) {
          setPushStatus(`✅ ${t("notificationsRegistered")}`);
        } else {
          setPushError(`❌ ${result.error || t("notificationsError")}`);
        }
      } else {
        setPushError(`❌ ${t("notificationsDenied")}`);
      }
    } catch {
      setPushError(`❌ ${t("notificationsError")}`);
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
    <section className="panel">
      <PasswordManagerSaveForm
        ref={passwordManagerSaveFormRef}
        username={passwordManagerSeedUsername}
        password={String(seedMnemonic ?? "")}
      />

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🔑
          </span>
          <span className="settings-label">{t("keys")}</span>
        </div>
        <div className="settings-right">
          <div className="badge-box">
            <button
              className="ghost"
              onClick={() => void handleSaveSeed()}
              disabled={!hasSeedMnemonic}
            >
              {t("onboardingBackupSave")}
            </button>
            <button className="ghost" onClick={copySeed} data-guide="copy-seed">
              {t("copyCurrent")}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🦤
          </span>
          <span className="settings-label">{t("nostrKeys")}</span>
        </div>
        <div className="settings-right">
          <div className="badge-box">
            <button
              className="ghost"
              onClick={() => {
                const targetAction = isCustomNostrIdentity ? "derive" : "paste";
                if (armedNostrAction === targetAction) {
                  clearArmTimeout();
                  setArmedNostrAction(null);
                  void (isCustomNostrIdentity
                    ? requestDeriveNostrKeys()
                    : requestPasteNostrKeys());
                  return;
                }
                armNostrAction(targetAction);
              }}
              style={
                armedNostrAction !== null
                  ? {
                      color: "var(--color-error)",
                      borderColor: "var(--color-error)",
                    }
                  : undefined
              }
              disabled={!hasCurrentNsec || !hasSeedMnemonic}
            >
              {t(isCustomNostrIdentity ? "derive" : "paste")}
            </button>
            <button
              className="ghost"
              onClick={copyNostrKeys}
              disabled={!hasCurrentNsec}
              data-guide="copy-nostr-keys"
            >
              {t("copyCurrent")}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="settings-row settings-link"
        onClick={() => navigateTo({ route: "cashuTokens" })}
        aria-label={t("tokens")}
        title={t("tokens")}
      >
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🪙
          </span>
          <span className="settings-label">{t("tokens")}</span>
        </div>
        <div className="settings-right">
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </div>
      </button>

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🥜
          </span>
          <span className="settings-label">{t("payWithCashu")}</span>
        </div>
        <div className="settings-right">
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              aria-label={t("payWithCashu")}
              checked={payWithCashuEnabled}
              onChange={(e) => setPayWithCashuEnabled(e.target.checked)}
            />
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🔄
          </span>
          <span className="settings-label">{t("cashuAutoswap")}</span>
        </div>
        <div className="settings-right">
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              aria-label={t("cashuAutoswap")}
              checked={cashuAutoswapEnabled}
              onChange={(e) => setCashuAutoswapEnabled(e.target.checked)}
            />
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🔄
          </span>
          <span className="settings-label">{t("showProfileQrOnTilt")}</span>
        </div>
        <div className="settings-right">
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              aria-label={t("showProfileQrOnTilt")}
              checked={showProfileQrOnTiltEnabled}
              onChange={(e) => setShowProfileQrOnTiltEnabled(e.target.checked)}
            />
          </label>
        </div>
      </div>

      <div className="settings-row settings-row-stack-mobile">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            ⚡
          </span>
          <span className="settings-label">
            {t("lightningInvoiceAutoPayLimit")}
          </span>
        </div>
        <div className="settings-right settings-right-wrap">
          <div className="badge-box autopay-limit-options" role="group">
            {LIGHTNING_INVOICE_AUTO_PAY_LIMIT_OPTIONS.map((limit) => (
              <button
                key={limit}
                type="button"
                className={
                  !customAutoPayLimitSelected &&
                  limit === lightningInvoiceAutoPayLimit
                    ? "ghost settings-choice is-selected"
                    : "ghost settings-choice"
                }
                onClick={() => setLightningInvoiceAutoPayLimit(limit)}
                aria-pressed={
                  !customAutoPayLimitSelected &&
                  limit === lightningInvoiceAutoPayLimit
                }
              >
                {getAutoPayLimitLabel(limit)}
              </button>
            ))}
            <button
              type="button"
              className={
                customAutoPayLimitSelected
                  ? "ghost settings-choice is-selected"
                  : "ghost settings-choice"
              }
              onClick={() => navigateTo({ route: "advancedAutoPayLimit" })}
              aria-pressed={customAutoPayLimitSelected}
            >
              {customAutoPayLimitSelected
                ? getAutoPayLimitLabel(lightningInvoiceAutoPayLimit)
                : t("custom")}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="settings-row settings-link"
        onClick={() => navigateTo({ route: "nostrRelays" })}
        aria-label={t("nostrRelay")}
        title={t("nostrRelay")}
      >
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            📡
          </span>
          <span className="settings-label">{t("nostrRelay")}</span>
        </div>
        <div className="settings-right">
          <span className="relay-count" aria-label="relay status">
            {connectedRelayCount}/{relayUrls.length}
          </span>
          <span
            className={
              nostrRelayOverallStatus === "connected"
                ? "status-dot connected"
                : nostrRelayOverallStatus === "checking"
                  ? "status-dot checking"
                  : "status-dot disconnected"
            }
            aria-label={nostrRelayOverallStatus}
            title={nostrRelayOverallStatus}
            style={{ marginLeft: 10 }}
          />
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </div>
      </button>

      <button
        type="button"
        className="settings-row settings-link"
        onClick={() => navigateTo({ route: "evoluServers" })}
        aria-label={t("evoluServer")}
        title={t("evoluServer")}
      >
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            ☁
          </span>
          <span className="settings-label">{t("evoluServer")}</span>
        </div>
        <div className="settings-right">
          <span className="relay-count" aria-label="evolu sync status">
            {evoluConnectedServerCount}/{evoluServerUrls.length}
          </span>
          <span
            className={
              evoluOverallStatus === "connected"
                ? "status-dot connected"
                : evoluOverallStatus === "checking"
                  ? "status-dot checking"
                  : "status-dot disconnected"
            }
            aria-label={evoluOverallStatus}
            title={evoluOverallStatus}
            style={{ marginLeft: 10 }}
          />
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </div>
      </button>

      <button
        type="button"
        className="settings-row settings-link"
        onClick={() => navigateTo({ route: "mints" })}
        aria-label={t("mints")}
        title={t("mints")}
      >
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🏦
          </span>
          <span className="settings-label">{t("mints")}</span>
        </div>
        <div className="settings-right">
          {defaultMintDisplay ? (
            <span className="relay-url">{defaultMintDisplay}</span>
          ) : (
            <span className="muted">—</span>
          )}
          <span className="settings-chevron" aria-hidden="true">
            &gt;
          </span>
        </div>
      </button>

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            📦
          </span>
          <span className="settings-label">{t("data")}</span>
        </div>
        <div className="settings-right">
          <div className="badge-box">
            <button className="ghost" onClick={exportAppData}>
              {t("exportData")}
            </button>
            <button className="ghost" onClick={requestImportAppData}>
              {t("importData")}
            </button>
          </div>
        </div>
      </div>

      {/* Push Notifications */}
      <div
        className="settings-row"
        style={{ marginTop: 20, borderTop: "1px solid #eee", paddingTop: 20 }}
      >
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🔔
          </span>
          <span className="settings-label">{t("notifications")}</span>
        </div>
        <div className="settings-right">
          <button
            className="ghost"
            onClick={handleRegisterNotifications}
            disabled={!currentNsec}
          >
            {t("enable")}
          </button>
        </div>
      </div>

      {pushStatus && (
        <div className="settings-row">
          <div style={{ padding: "8px", fontSize: "12px", color: "#666" }}>
            {pushStatus}
          </div>
        </div>
      )}

      {pushError && (
        <div className="settings-row">
          <div style={{ padding: "8px", fontSize: "12px", color: "#c00" }}>
            {pushError}
          </div>
        </div>
      )}

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🧪
          </span>
          <span className="settings-label">Push / SW debug</span>
        </div>
        <div className="settings-right">
          <button
            className="ghost"
            onClick={() => navigateTo({ route: "advancedPushDebug" })}
          >
            Open
          </button>
        </div>
      </div>

      <div className="settings-row">
        <button
          type="button"
          className="btn-wide secondary"
          onClick={() => void dedupeContacts()}
          disabled={dedupeContactsIsBusy}
        >
          {t("dedupeContacts")}
        </button>
      </div>

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

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            ♻️
          </span>
          <span className="settings-label">{t("reloadApp")}</span>
        </div>
        <div className="settings-right">
          <button
            type="button"
            className="ghost"
            onClick={() => void handleReloadApp()}
          >
            {t("reloadNow")}
          </button>
        </div>
      </div>

      <div className="settings-row">
        <button
          type="button"
          className={
            logoutArmed
              ? "btn-wide secondary danger-armed"
              : "btn-wide secondary"
          }
          onClick={requestLogout}
        >
          {t("logout")}
        </button>
      </div>

      <div
        className="muted"
        style={{ marginTop: 14, textAlign: "center", fontSize: 12 }}
      >
        {t("appVersionLabel")}: {appVersionLabel}
      </div>
    </section>
  );
}
