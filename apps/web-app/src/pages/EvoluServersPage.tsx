import type { SyncOwner } from "@evolu/common";
import React from "react";
import { useNavigation } from "../hooks/useRouting";

interface EvoluServersPageProps {
  evoluDatabaseBytes: number | null;
  evoluHasError: boolean;
  evoluHistoryCount: number | null;
  evoluServerStatusByUrl: Record<
    string,
    "connected" | "checking" | "disconnected"
  >;
  evoluServerUrls: string[];
  evoluTableCounts: Record<string, number | null>;
  isEvoluServerOffline: (url: string) => boolean;
  pendingClearDatabase: boolean;
  requestClearDatabase: () => void;
  syncOwner: SyncOwner | null;
  t: (key: string) => string;
}

const ONE_MB = 1024 * 1024;
const OVERHEAD_BYTES = 172 * 1024; // 172 KB overhead prázdné SQLite DB

export function EvoluServersPage({
  evoluDatabaseBytes,
  evoluHasError,
  evoluHistoryCount,
  evoluServerStatusByUrl,
  evoluServerUrls,
  evoluTableCounts,
  isEvoluServerOffline,
  pendingClearDatabase,
  requestClearDatabase,
  syncOwner,
  t,
}: EvoluServersPageProps): React.ReactElement {
  const navigateTo = useNavigation();

  const rawDbBytes = evoluDatabaseBytes ?? 0;
  const dataBytes = rawDbBytes - OVERHEAD_BYTES;
  const percentage = Math.min(Math.max((dataBytes / ONE_MB) * 100, -100), 100);

  // Determine color based percentage - using direct colors instead of CSS variables
  const getProgressColor = () => {
    if (percentage > 90) return "#ef4444"; // Red
    if (percentage > 70) return "#f59e0b"; // Orange/Amber
    return "#22c55e"; // Green
  };

  const totalCurrentRows = Object.values(evoluTableCounts).reduce<number>(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const historyRows = evoluHistoryCount ?? 0;

  return (
    <section className="panel">
      {/* Server list */}
      {evoluServerUrls.length === 0 ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {t("evoluServersEmpty")}
        </p>
      ) : (
        <div style={{ marginBottom: 24 }}>
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
                onClick={() => navigateTo({ route: "evoluServer", id: url })}
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

      {/* Database info section */}
      {evoluDatabaseBytes !== null && (
        <>
          <div className="settings-row" style={{ marginTop: 24 }}>
            <div className="settings-left">
              <span className="settings-label">Used data</span>
            </div>
            <div className="settings-right">
              <span className="muted" />
            </div>
          </div>

          {/* Progress bar showing usage of 1MB limit */}
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <div
              style={{
                width: "100%",
                height: 8,
                backgroundColor: "var(--color-border)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${percentage}%`,
                  height: "100%",
                  backgroundColor: getProgressColor(),
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div
              style={{ marginTop: 4, textAlign: "center", fontSize: 12 }}
              className="muted"
            >
              {percentage.toFixed(1)}% {t("evoluOfLimit")}
            </div>
          </div>

          <div className="settings-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className={pendingClearDatabase ? "btn-wide danger" : "btn-wide"}
              onClick={requestClearDatabase}
            >
              {t("evoluClearDatabase")}
            </button>
          </div>

          {/* Row counts with links */}
          <h3 style={{ marginTop: 24, marginBottom: 12 }}>
            {t("evoluRowCounts")}
          </h3>

          <div
            className="settings-row settings-link"
            onClick={() => navigateTo({ route: "evoluCurrentData" })}
            style={{ cursor: "pointer" }}
          >
            <div className="settings-left">
              <span className="settings-label">{t("evoluData")}</span>
            </div>
            <div className="settings-right">
              <span className="muted">{totalCurrentRows} rows</span>
              <span className="settings-chevron" aria-hidden="true">
                &gt;
              </span>
            </div>
          </div>

          <div
            className="settings-row settings-link"
            onClick={() => navigateTo({ route: "evoluHistoryData" })}
            style={{ cursor: "pointer" }}
          >
            <div className="settings-left">
              <span className="settings-label">{t("evoluHistory")}</span>
            </div>
            <div className="settings-right">
              <span className="muted">{historyRows} rows</span>
              <span className="settings-chevron" aria-hidden="true">
                &gt;
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
