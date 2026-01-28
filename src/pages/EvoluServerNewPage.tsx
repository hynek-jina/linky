import React from "react";

interface EvoluServerNewPageProps {
  evoluServerUrls: string[];
  evoluWipeStorageIsBusy: boolean;
  navigateToEvoluServers: () => void;
  newEvoluServerUrl: string;
  normalizeEvoluServerUrl: (url: string) => string | null;
  pushToast: (message: string) => void;
  saveEvoluServerUrls: (urls: string[]) => void;
  setNewEvoluServerUrl: (url: string) => void;
  setStatus: (message: string) => void;
  t: (key: string) => string;
  wipeEvoluStorage: () => Promise<void>;
}

export function EvoluServerNewPage({
  newEvoluServerUrl,
  evoluServerUrls,
  evoluWipeStorageIsBusy,
  setNewEvoluServerUrl,
  normalizeEvoluServerUrl,
  saveEvoluServerUrls,
  navigateToEvoluServers,
  setStatus,
  pushToast,
  wipeEvoluStorage,
  t,
}: EvoluServerNewPageProps): React.ReactElement {
  return (
    <section className="panel">
      <label htmlFor="evoluServerUrl">{t("evoluAddServerLabel")}</label>
      <input
        id="evoluServerUrl"
        value={newEvoluServerUrl}
        onChange={(e) => setNewEvoluServerUrl(e.target.value)}
        placeholder="wss://..."
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="panel-header" style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() => {
            const normalized = normalizeEvoluServerUrl(newEvoluServerUrl);
            if (!normalized) {
              pushToast(t("evoluAddServerInvalid"));
              return;
            }
            if (
              evoluServerUrls.some(
                (u) => u.toLowerCase() === normalized.toLowerCase(),
              )
            ) {
              pushToast(t("evoluAddServerAlready"));
              navigateToEvoluServers();
              return;
            }

            saveEvoluServerUrls([...evoluServerUrls, normalized]);
            setNewEvoluServerUrl("");
            setStatus(t("evoluAddServerSaved"));
            navigateToEvoluServers();
          }}
          disabled={!normalizeEvoluServerUrl(newEvoluServerUrl)}
        >
          {t("evoluAddServerButton")}
        </button>
      </div>

      <div className="settings-row">
        <button
          type="button"
          className="btn-wide danger"
          onClick={() => {
            void wipeEvoluStorage();
          }}
          disabled={evoluWipeStorageIsBusy}
        >
          {evoluWipeStorageIsBusy
            ? t("evoluWipeStorageBusy")
            : t("evoluWipeStorage")}
        </button>
      </div>
    </section>
  );
}
