import React, { useState } from "react";
import { useNavigation } from "../hooks/useRouting";

interface AdvancedPageProps {
  __APP_VERSION__: string;
  allowPromisesEnabled: boolean;
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
  logoutArmed: boolean;
  nostrRelayOverallStatus: "connected" | "checking" | "disconnected";
  payWithCashuEnabled: boolean;
  relayUrls: string[];
  requestImportAppData: () => void;
  requestLogout: () => void;
  restoreMissingTokens: () => Promise<void>;
  seedMnemonic: string | null;
  setAllowPromisesEnabled: (value: boolean) => void;
  setPayWithCashuEnabled: (value: boolean) => void;
  t: (key: string) => string;
  tokensRestoreIsBusy: boolean;
}

export function AdvancedPage({
  __APP_VERSION__,
  allowPromisesEnabled,
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
  isSeedLogin,
  logoutArmed,
  nostrRelayOverallStatus,
  payWithCashuEnabled,
  relayUrls,
  requestImportAppData,
  requestLogout,
  restoreMissingTokens,
  seedMnemonic,
  setAllowPromisesEnabled,
  setPayWithCashuEnabled,
  t,
  tokensRestoreIsBusy,
}: AdvancedPageProps): React.ReactElement {
  const navigateTo = useNavigation();
  const [pushStatus, setPushStatus] = useState<string>("");
  const [pushError, setPushError] = useState<string>("");

  const handleRegisterNotifications = async () => {
    setPushStatus("Registruji...");
    setPushError("");

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushError("Notifikace nejsou podporovány");
      return;
    }

    if (!currentNpub) {
      setPushError("Nejste přihlášeni");
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
          setPushStatus("✅ Zaregistrováno");
        } else {
          setPushError(`❌ ${result.error || "Chyba"}`);
        }
      } else {
        setPushError("❌ Zamítnuto");
      }
    } catch {
      setPushError("❌ Chyba");
    }
  };

  return (
    <section className="panel">
      {isSeedLogin && (
        <div className="settings-row">
          <div className="settings-left">
            <span className="settings-icon" aria-hidden="true">
              🔑
            </span>
            <span className="settings-label">{t("keys")}</span>
          </div>
          <div className="settings-right">
            <div className="badge-box">
              <button className="ghost" onClick={copySeed}>
                {t("copyCurrent")}
              </button>
            </div>
          </div>
        </div>
      )}

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
              onClick={copyNostrKeys}
              disabled={!currentNsec}
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
              disabled={!seedMnemonic || tokensRestoreIsBusy || cashuIsBusy}
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

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            ❤️
          </span>
          <span className="settings-label">{t("allowPromises")}</span>
        </div>
        <div className="settings-right">
          <label className="switch">
            <input
              className="switch-input"
              type="checkbox"
              aria-label={t("allowPromises")}
              checked={allowPromisesEnabled}
              onChange={(e) => setAllowPromisesEnabled(e.target.checked)}
            />
          </label>
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
          <span className="settings-label">Notifikace</span>
        </div>
        <div className="settings-right">
          <button
            className="ghost"
            onClick={handleRegisterNotifications}
            disabled={!currentNpub}
          >
            Povolit
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
