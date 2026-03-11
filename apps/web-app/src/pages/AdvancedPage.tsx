import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigation } from "../hooks/useRouting";
import { LIGHTNING_INVOICE_AUTO_PAY_LIMIT_OPTIONS } from "../utils/constants";
import { formatInteger } from "../utils/formatting";

interface AdvancedPageProps {
  __APP_VERSION__: string;
  cashuIsBusy: boolean;
  cashuSeedMnemonic: string | null;
  connectedRelayCount: number;
  copyCashuSeed: () => void;
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
  payWithCashuEnabled: boolean;
  pushToast: (message: string) => void;
  relayUrls: string[];
  requestImportAppData: () => void;
  requestDeriveNostrKeys: () => Promise<void>;
  requestLogout: () => void;
  restoreMissingTokens: () => Promise<void>;
  seedMnemonic: string | null;
  setLightningInvoiceAutoPayLimit: (value: number) => void;
  setPayWithCashuEnabled: (value: boolean) => void;
  t: (key: string) => string;
  tokensRestoreIsBusy: boolean;
}

export function AdvancedPage({
  __APP_VERSION__,
  cashuIsBusy,
  cashuSeedMnemonic,
  connectedRelayCount,
  copyCashuSeed,
  copyNostrKeys,
  copySeed,
  currentNpub,
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
  payWithCashuEnabled,
  pushToast,
  relayUrls,
  requestImportAppData,
  requestDeriveNostrKeys,
  requestLogout,
  restoreMissingTokens,
  seedMnemonic,
  setLightningInvoiceAutoPayLimit,
  setPayWithCashuEnabled,
  t,
  tokensRestoreIsBusy,
}: AdvancedPageProps): React.ReactElement {
  const navigateTo = useNavigation();
  const [pushStatus, setPushStatus] = useState<string>("");
  const [pushError, setPushError] = useState<string>("");
  const [nostrDeriveArmed, setNostrDeriveArmed] = useState(false);
  const armTimeoutRef = useRef<number | null>(null);
  const hasSeedMnemonic = String(seedMnemonic ?? "").trim().length > 0;
  const hasCurrentNsec = String(currentNsec ?? "").trim().length > 0;

  const clearArmTimeout = useCallback(() => {
    if (armTimeoutRef.current !== null) {
      window.clearTimeout(armTimeoutRef.current);
      armTimeoutRef.current = null;
    }
  }, []);

  const armNostrAction = useCallback(() => {
    clearArmTimeout();
    setNostrDeriveArmed(true);
    pushToast(t("nostrDeriveArmedHint"));
    armTimeoutRef.current = window.setTimeout(() => {
      setNostrDeriveArmed(false);
      armTimeoutRef.current = null;
    }, 5000);
  }, [clearArmTimeout, pushToast, t]);

  useEffect(() => {
    return () => {
      clearArmTimeout();
    };
  }, [clearArmTimeout]);

  useEffect(() => {
    clearArmTimeout();
    setNostrDeriveArmed(false);
  }, [clearArmTimeout]);

  const handleRegisterNotifications = async () => {
    setPushStatus(t("notificationsRegistering"));
    setPushError("");

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushError(t("notificationsUnsupported"));
      return;
    }

    if (!currentNpub) {
      setPushError(t("notificationsNotLoggedIn"));
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        const { registerPushNotifications } =
          await import("../utils/pushNotifications");
        const result = await registerPushNotifications(
          currentNpub,
          relayUrls.slice(0, 3),
        );

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

  return (
    <section className="panel">
      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🔑
          </span>
          <span className="settings-label">{t("keys")}</span>
        </div>
        <div className="settings-right">
          <div className="badge-box">
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
                if (nostrDeriveArmed) {
                  clearArmTimeout();
                  setNostrDeriveArmed(false);
                  void requestDeriveNostrKeys();
                  return;
                }
                armNostrAction();
              }}
              style={
                nostrDeriveArmed
                  ? {
                      color: "var(--color-error)",
                      borderColor: "var(--color-error)",
                    }
                  : undefined
              }
              disabled={!hasCurrentNsec}
            >
              {t("derive")}
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

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🌰
          </span>
          <span className="settings-label">{t("cashuSeed")}</span>
        </div>
        <div className="settings-right">
          <div className="badge-box">
            <button
              className="ghost"
              onClick={copyCashuSeed}
              disabled={!cashuSeedMnemonic}
            >
              {t("copyCurrent")}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🪙
          </span>
          <span className="settings-label">{t("tokens")}</span>
        </div>
        <div className="settings-right">
          <div className="badge-box">
            <button
              className="ghost"
              onClick={() => void restoreMissingTokens()}
              disabled={!hasSeedMnemonic || tokensRestoreIsBusy || cashuIsBusy}
            >
              {tokensRestoreIsBusy ? t("restoring") : t("restore")}
            </button>
          </div>
        </div>
      </div>

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
          <div className="badge-box badge-box-wrap">
            {LIGHTNING_INVOICE_AUTO_PAY_LIMIT_OPTIONS.map((limit) => (
              <button
                key={limit}
                type="button"
                className={
                  limit === lightningInvoiceAutoPayLimit
                    ? "ghost settings-choice is-selected"
                    : "ghost settings-choice"
                }
                onClick={() => setLightningInvoiceAutoPayLimit(limit)}
                aria-pressed={limit === lightningInvoiceAutoPayLimit}
              >
                {formatInteger(limit)}
              </button>
            ))}
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
            disabled={!currentNpub}
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
        <button
          type="button"
          className={logoutArmed ? "btn-wide danger" : "btn-wide"}
          onClick={requestLogout}
        >
          {t("logout")}
        </button>
      </div>

      <div
        className="muted"
        style={{ marginTop: 14, textAlign: "center", fontSize: 12 }}
      >
        {t("appVersionLabel")}: v{__APP_VERSION__}
      </div>
    </section>
  );
}
