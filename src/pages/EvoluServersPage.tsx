import React from "react";

interface EvoluServersPageProps {
  evoluServerUrls: string[];
  evoluServerStatusByUrl: Record<
    string,
    "connected" | "checking" | "disconnected"
  >;
  evoluHasError: boolean;
  syncOwner: unknown;
  isEvoluServerOffline: (url: string) => boolean;
  navigateToEvoluServer: (url: string) => void;
  t: (key: string) => string;
}

export function EvoluServersPage({
  evoluServerUrls,
  evoluServerStatusByUrl,
  evoluHasError,
  syncOwner,
  isEvoluServerOffline,
  navigateToEvoluServer,
  t,
}: EvoluServersPageProps): React.ReactElement {
  return (
    <section className="panel">
      {evoluServerUrls.length === 0 ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {t("evoluServersEmpty")}
        </p>
      ) : (
        <div>
          {evoluServerUrls.map((url) => {
            const offline = isEvoluServerOffline(url);
            const state = offline
              ? "disconnected"
              : evoluHasError
                ? "disconnected"
                : (evoluServerStatusByUrl[url] ?? "checking");

            const isSynced =
              Boolean(syncOwner) &&
              !evoluHasError &&
              !offline &&
              state === "connected";

            return (
              <button
                type="button"
                className="settings-row settings-link"
                key={url}
                onClick={() => navigateToEvoluServer(url)}
              >
                <div className="settings-left">
                  <span className="relay-url">{url}</span>
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
                  <span className="muted" style={{ marginLeft: 10 }}>
                    {offline
                      ? t("evoluServerOfflineStatus")
                      : isSynced
                        ? t("evoluSyncOk")
                        : state === "checking"
                          ? t("evoluSyncing")
                          : t("evoluNotSynced")}
                  </span>
                  <span className="settings-chevron" aria-hidden="true">
                    &gt;
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
