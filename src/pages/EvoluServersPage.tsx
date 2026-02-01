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
  onClearDatabase: () => void;
  syncOwner: unknown;
  t: (key: string) => string;
}

const ONE_MB = 1024 * 1024;
const OVERHEAD_BYTES = 168 * 1024; // 168 KB overhead prázdné DB

export function EvoluServersPage({
  evoluDatabaseBytes,
  evoluHasError,
  evoluHistoryCount,
  evoluServerStatusByUrl,
  evoluServerUrls,
  evoluTableCounts,
  isEvoluServerOffline,
  onClearDatabase,
  syncOwner,
  t,
}: EvoluServersPageProps): React.ReactElement {
  const navigateTo = useNavigation();

  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KiB", "MiB", "GiB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    const digits = unitIndex === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  };

  const rawDbBytes = evoluDatabaseBytes ?? 0;
  const dataBytes = Math.max(0, rawDbBytes - OVERHEAD_BYTES);
  const percentage = Math.min((dataBytes / ONE_MB) * 100, 100);

  // Determine color based percentage - using direct colors instead of CSS variables
  const getProgressColor = () => {
    if (percentage > 90) return "#ef4444"; // Red
    if (percentage > 70) return "#f59e0b"; // Orange/Amber
    return "#22c55e"; // Green
  };

  const totalCurrentRows = Object.values(evoluTableCounts).reduce<number>(
    (sum, count) => sum + (count ?? 0),
    0
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
          <h3 style={{ marginTop: 24, marginBottom: 12 }}>
            {t("evoluLocalDataSize")}
          </h3>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">{t("evoluRawDbSize")}</span>
            </div>
            <div className="settings-right">
              <span className="muted">{formatBytes(dataBytes)} / 1 MiB</span>
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
            <div style={{ marginTop: 4, textAlign: "center", fontSize: 12 }} className="muted">
              {percentage.toFixed(1)}% {t("evoluOfLimit")}
            </div>
          </div>

          <div className="settings-row" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn-wide danger"
              onClick={onClearDatabase}
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
              <span className="settings-chevron" aria-hidden="true">&gt;</span>
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
              <span className="settings-chevron" aria-hidden="true">&gt;</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
