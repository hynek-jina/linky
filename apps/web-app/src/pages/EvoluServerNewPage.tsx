import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  useAdvancedSettingsContext,
  useEvoluSettingsContext,
} from "../app/context/SystemSettingsContexts";
import { normalizeEvoluServerUrl } from "../evolu";
import { useNavigation } from "../hooks/useRouting";

export function EvoluServerNewPage(): React.ReactElement {
  const {
    evoluServerUrls,
    evoluWipeStorageIsBusy,
    newEvoluServerUrl,
    saveEvoluServerUrls,
    setNewEvoluServerUrl,
    setStatus,
    wipeEvoluStorage,
  } = useEvoluSettingsContext();
  const { t } = useAppShellCore();
  const { pushToast } = useAdvancedSettingsContext();
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
