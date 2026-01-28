import React from "react";

interface AdvancedPageProps {
  __APP_VERSION__: string;
  allowPromisesEnabled: boolean;
  cashuIsBusy: boolean;
  connectedRelayCount: number;
  copyNostrKeys: () => void;
  copySeed: () => void;
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
  logoutArmed: boolean;
  navigateToEvoluServers: () => void;
  navigateToMints: () => void;
  navigateToNostrRelays: () => void;
  navigateToPaymentsHistory: () => void;
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
  currentNsec,
  seedMnemonic,
  tokensRestoreIsBusy,
  cashuIsBusy,
  payWithCashuEnabled,
  allowPromisesEnabled,
  relayUrls,
  connectedRelayCount,
  nostrRelayOverallStatus,
  evoluServerUrls,
  evoluConnectedServerCount,
  evoluOverallStatus,
  defaultMintDisplay,
  dedupeContactsIsBusy,
  logoutArmed,
  importDataFileInputRef,
  copyNostrKeys,
  copySeed,
  restoreMissingTokens,
  setPayWithCashuEnabled,
  setAllowPromisesEnabled,
  navigateToNostrRelays,
  navigateToEvoluServers,
  navigateToMints,
  navigateToPaymentsHistory,
  exportAppData,
  requestImportAppData,
  dedupeContacts,
  handleImportAppDataFilePicked,
  requestLogout,
  t,
  __APP_VERSION__,
}: AdvancedPageProps): React.ReactElement {
  return (
    <section className="panel">
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
            >
              {t("copyCurrent")}
            </button>
          </div>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🌱
          </span>
          <span className="settings-label">{t("seed")}</span>
        </div>
        <div className="settings-right">
          <div className="badge-box">
            <button
              className="ghost"
              onClick={copySeed}
              disabled={!seedMnemonic}
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
              onClick={() => {
                void restoreMissingTokens();
              }}
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
        onClick={navigateToNostrRelays}
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
        onClick={navigateToEvoluServers}
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
        onClick={navigateToMints}
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

      <button
        type="button"
        className="settings-row settings-link"
        onClick={navigateToPaymentsHistory}
        aria-label={t("paymentsHistory")}
        title={t("paymentsHistory")}
      >
        <div className="settings-left">
          <span className="settings-icon" aria-hidden="true">
            🧾
          </span>
          <span className="settings-label">{t("paymentsHistory")}</span>
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

      <div className="settings-row">
        <button
          type="button"
          className="btn-wide secondary"
          onClick={() => {
            void dedupeContacts();
          }}
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
