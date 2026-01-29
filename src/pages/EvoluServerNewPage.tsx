import React from "react";
import { useNavigation } from "../hooks/useRouting";

interface EvoluServerNewPageProps {
  evoluServerUrls: string[];
  evoluWipeStorageIsBusy: boolean;
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
  evoluServerUrls,
  evoluWipeStorageIsBusy,
  newEvoluServerUrl,
  normalizeEvoluServerUrl,
  pushToast,
  saveEvoluServerUrls,
  setNewEvoluServerUrl,
  setStatus,
  t,
  wipeEvoluStorage,
}: EvoluServerNewPageProps): React.ReactElement {
  const navigateTo = useNavigation();
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
              navigateTo({ route: "evoluServers" });
              return;
            }

            saveEvoluServerUrls([...evoluServerUrls, normalized]);
            setNewEvoluServerUrl("");
            setStatus(t("evoluAddServerSaved"));
            navigateTo({ route: "evoluServers" });
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
