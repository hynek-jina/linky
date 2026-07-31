import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { useRelaySettingsContext } from "../app/context/SystemSettingsContexts";

export function NostrRelayPage(): React.ReactElement {
  const {
    pendingRelayDeleteUrl,
    requestDeleteSelectedRelay,
    selectedRelayUrl,
  } = useRelaySettingsContext();
  const { t } = useAppShellCore();
  return (
    <section className="panel">
      {selectedRelayUrl ? (
        <>
          <div className="settings-row">
            <div className="settings-left">
              <span className="relay-url">{selectedRelayUrl}</span>
            </div>
          </div>

          <div className="settings-row">
            <button
              className={
                pendingRelayDeleteUrl === selectedRelayUrl
                  ? "btn-wide danger"
                  : "btn-wide"
              }
              onClick={requestDeleteSelectedRelay}
            >
              {t("delete")}
            </button>
          </div>
        </>
      ) : (
        <p className="lede">{t("errorPrefix")}</p>
      )}
    </section>
  );
}
