import React from "react";
import { useNavigation } from "../hooks/useRouting";

interface EvoluServerPageProps {
  evoluHasError: boolean;
  evoluServerStatusByUrl: Record<
    string,
    "connected" | "checking" | "disconnected"
  >;
  evoluServersReloadRequired: boolean;
  evoluServerUrls: string[];
  isEvoluServerOffline: (url: string) => boolean;
  pendingEvoluServerDeleteUrl: string | null;
  saveEvoluServerUrls: (urls: string[]) => void;
  selectedEvoluServerUrl: string | null;
  setEvoluServerOffline: (url: string, offline: boolean) => void;
  setPendingEvoluServerDeleteUrl: (url: string | null) => void;
  setStatus: (message: string) => void;
  syncOwner: unknown;
  t: (key: string) => string;
}

export function EvoluServerPage({
  evoluHasError,
  evoluServerStatusByUrl,
  evoluServersReloadRequired,
  evoluServerUrls,
  isEvoluServerOffline,
  pendingEvoluServerDeleteUrl,
  saveEvoluServerUrls,
  selectedEvoluServerUrl,
  setEvoluServerOffline,
  setPendingEvoluServerDeleteUrl,
  setStatus,
  syncOwner,
  t,
}: EvoluServerPageProps): React.ReactElement {
  const navigateTo = useNavigation();
  return (
    <section className="panel">
      {evoluServersReloadRequired ? (
        <>
          <p className="muted" style={{ marginTop: 2 }}>
            {t("evoluServersReloadHint")}
          </p>
          <div className="settings-row">
            <button
              type="button"
              className="btn-wide secondary"
              onClick={() => window.location.reload()}
            >
              {t("evoluServersReloadButton")}
            </button>
          </div>
        </>
      ) : null}

      {selectedEvoluServerUrl ? (
        <>
          {(() => {
            const offline = isEvoluServerOffline(selectedEvoluServerUrl);
            const isLastServer = evoluServerUrls.length <= 1;
            const state = evoluHasError
              ? "disconnected"
              : offline
                ? "disconnected"
                : (evoluServerStatusByUrl[selectedEvoluServerUrl] ??
                  "checking");
            const isSynced =
              Boolean(syncOwner) &&
              !evoluHasError &&
              !offline &&
              state === "connected";

            return (
              <>
                <div className="settings-row">
                  <div className="settings-left">
                    <span className="relay-url">{selectedEvoluServerUrl}</span>
                  </div>
                  <div className="settings-right">
                    <span
                      className={
                        state === "connected"
                          ? "status-dot connected"
                          : state === "checking"
                            ? "status-dot checking"
                            : "status-dot disconnected"
                      }
                      aria-label={state}
                      title={state}
                    />
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-left">
                    <span className="settings-label">
                      {t("evoluSyncLabel")}
                    </span>
                  </div>
                  <div className="settings-right">
                    <span className="muted">
                      {offline
                        ? t("evoluServerOfflineStatus")
                        : isSynced
                          ? t("evoluSyncOk")
                          : state === "checking"
                            ? t("evoluSyncing")
                            : t("evoluNotSynced")}
                    </span>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-left">
                    <span className="settings-label">
                      {t("evoluServerOfflineLabel")}
                    </span>
                  </div>
                  <div className="settings-right">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setEvoluServerOffline(selectedEvoluServerUrl, !offline);
                      }}
                    >
                      {offline
                        ? t("evoluServerOfflineEnable")
                        : t("evoluServerOfflineDisable")}
                    </button>
                  </div>
                </div>

                {isLastServer ? (
                  <p className="muted" style={{ marginTop: 10 }}>
                    {t("evoluDefaultServerCannotRemove")}
                  </p>
                ) : (
                  <div className="settings-row" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn-wide danger"
                      onClick={() => {
                        if (
                          pendingEvoluServerDeleteUrl === selectedEvoluServerUrl
                        ) {
                          const selectedLower =
                            selectedEvoluServerUrl.toLowerCase();
                          const nextUrls = evoluServerUrls.filter(
                            (u) => u.toLowerCase() !== selectedLower,
                          );
                          setPendingEvoluServerDeleteUrl(null);
                          setEvoluServerOffline(selectedEvoluServerUrl, false);
                          saveEvoluServerUrls(nextUrls);
                          navigateTo({ route: "evoluServers" });
                          return;
                        }

                        setStatus(t("deleteArmedHint"));
                        setPendingEvoluServerDeleteUrl(selectedEvoluServerUrl);
                      }}
                    >
                      {t("evoluServerRemove")}
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </>
      ) : (
        <p className="lede">{t("errorPrefix")}</p>
      )}
    </section>
  );
}
