import React, { useState } from "react";
import type { EvoluHistoryRow, loadEvoluCurrentData } from "../evolu";

interface EvoluDataDetailPageProps {
  evoluDatabaseBytes: number | null;
  evoluTableCounts: Record<string, number | null>;
  evoluHistoryCount: number | null;
  evoluContactsOwnerEditCount: number;
  evoluContactsOwnerId: string | null;
  evoluContactsOwnerIndex: number;
  evoluContactsOwnerNewContactsCount: number;
  evoluContactsOwnerPointer: string;
  pendingClearDatabase: boolean;
  requestClearDatabase: () => void;
  loadHistoryData: () => Promise<EvoluHistoryRow[]>;
  loadCurrentData: typeof loadEvoluCurrentData;
  t: (key: string) => string;
}

const ONE_MB = 1024 * 1024;

export function EvoluDataDetailPage({
  evoluDatabaseBytes,
  evoluTableCounts,
  evoluHistoryCount,
  evoluContactsOwnerEditCount,
  evoluContactsOwnerId,
  evoluContactsOwnerIndex,
  evoluContactsOwnerNewContactsCount,
  evoluContactsOwnerPointer,
  pendingClearDatabase,
  requestClearDatabase,
  loadHistoryData,
  loadCurrentData,
  t,
}: EvoluDataDetailPageProps): React.ReactElement {
  const [ownerView, setOwnerView] = useState<"all" | "meta" | "contacts">(
    "all",
  );
  const [showHistoryData, setShowHistoryData] = useState(false);
  const [showCurrentData, setShowCurrentData] = useState(false);
  const [historyData, setHistoryData] = useState<EvoluHistoryRow[]>([]);
  const [currentData, setCurrentData] = useState<
    Awaited<ReturnType<typeof loadEvoluCurrentData>>
  >({});
  const [isLoading, setIsLoading] = useState(false);

  const readRowOwnerId = (row: unknown): string => {
    if (typeof row !== "object" || row === null) return "";
    if (!("ownerId" in row)) return "";
    const ownerId = row.ownerId;
    if (typeof ownerId !== "string") return "";
    return ownerId.trim();
  };

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
  const percentage = Math.min((rawDbBytes / ONE_MB) * 100, 100);

  // Separate tables into user data and system tables
  const userTables = [
    "contact",
    "cashuToken",
    "credoToken",
    "nostrIdentity",
    "nostrMessage",
    "nostrReaction",
  ];
  const systemTables = ["ownerMeta"];

  const tableEntries = Object.entries(evoluTableCounts);
  const scopedEntries = tableEntries.filter(([name]) => {
    if (ownerView === "meta") return name === "ownerMeta";
    if (ownerView === "contacts") return name === "contact";
    return true;
  });
  const userTableEntries = scopedEntries
    .filter(([name]) => userTables.includes(name))
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));
  const systemTableEntries = scopedEntries
    .filter(([name]) => systemTables.includes(name))
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

  const totalCurrentRows = scopedEntries.reduce<number>(
    (sum, [, count]) => sum + (count ?? 0),
    0,
  );
  const historyRows = evoluHistoryCount ?? 0;
  const totalRows = totalCurrentRows + historyRows;

  // Calculate row distribution percentages
  const calculatePercentage = (rows: number) => {
    if (totalRows === 0) return 0;
    return Math.round((rows / totalRows) * 100);
  };

  const handleShowHistory = async () => {
    if (!showHistoryData && historyData.length === 0) {
      setIsLoading(true);
      const data = await loadHistoryData();
      setHistoryData(data);
      setIsLoading(false);
    }
    setShowHistoryData(!showHistoryData);
  };

  const handleShowCurrent = async () => {
    if (!showCurrentData && Object.keys(currentData).length === 0) {
      setIsLoading(true);
      const data = await loadCurrentData();
      setCurrentData(data);
      setIsLoading(false);
    }
    setShowCurrentData(!showCurrentData);
  };

  const currentDataEntries = React.useMemo(() => {
    const activeContactsOwnerId = String(evoluContactsOwnerId ?? "").trim();

    return Object.entries(currentData)
      .filter(([tableName]) => {
        if (ownerView === "meta") return tableName === "ownerMeta";
        if (ownerView === "contacts") return tableName === "contact";
        return true;
      })
      .map(([tableName, rows]) => {
        if (tableName !== "contact") return [tableName, rows] as const;
        if (!activeContactsOwnerId) return [tableName, rows] as const;
        return [
          tableName,
          rows.filter((row) => readRowOwnerId(row) === activeContactsOwnerId),
        ] as const;
      });
  }, [currentData, evoluContactsOwnerId, ownerView]);

  return (
    <section className="panel">
      {evoluDatabaseBytes !== null ? (
        <>
          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">{t("evoluRawDbSize")}</span>
            </div>
            <div className="settings-right">
              <span className="muted">{formatBytes(rawDbBytes)} / 1 MiB</span>
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
                  backgroundColor:
                    percentage > 90
                      ? "var(--color-error)"
                      : percentage > 70
                        ? "var(--color-warning)"
                        : "var(--color-success)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <div
              style={{ marginTop: 4, textAlign: "center", fontSize: 12 }}
              className="muted"
            >
              {percentage.toFixed(1)}% z 1 MiB limitu
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

          <h3 style={{ marginTop: 24, marginBottom: 12 }}>
            {t("evoluRowCounts")}
          </h3>

          <div
            className="settings-row"
            style={{ gap: 8, display: "flex", marginBottom: 12 }}
          >
            <button
              type="button"
              className={ownerView === "all" ? "secondary" : "btn-wide"}
              onClick={() => setOwnerView("all")}
            >
              {t("all")}
            </button>
            <button
              type="button"
              className={ownerView === "meta" ? "secondary" : "btn-wide"}
              onClick={() => setOwnerView("meta")}
            >
              {t("evoluOwnerViewMeta")}
            </button>
            <button
              type="button"
              className={ownerView === "contacts" ? "secondary" : "btn-wide"}
              onClick={() => setOwnerView("contacts")}
            >
              {t("contactsTitle")}
            </button>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">{t("evoluContactsOwner")}</span>
            </div>
            <div className="settings-right">
              <span className="muted">{evoluContactsOwnerPointer}</span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">
                {t("evoluContactsOwnerIndex")}
              </span>
            </div>
            <div className="settings-right">
              <span className="muted">{evoluContactsOwnerIndex}</span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">
                {t("evoluContactsOwnerNewContacts")}
              </span>
            </div>
            <div className="settings-right">
              <span className="muted">
                {evoluContactsOwnerNewContactsCount} / 10
              </span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">
                {t("evoluContactsOwnerEdits")}
              </span>
            </div>
            <div className="settings-right">
              <span className="muted">{evoluContactsOwnerEditCount} / 50</span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">{t("evoluCurrentData")}</span>
            </div>
            <div className="settings-right">
              <span className="muted">{totalCurrentRows} rows</span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">{t("evoluHistoryData")}</span>
            </div>
            <div className="settings-right">
              <span className="muted">{historyRows} rows</span>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-label">{t("evoluTotalRows")}</span>
            </div>
            <div className="settings-right">
              <span className="muted">{totalRows} rows</span>
            </div>
          </div>

          {/* Buttons to view data */}
          <div
            className="settings-row"
            style={{ marginTop: 16, gap: 8, display: "flex" }}
          >
            <button
              type="button"
              className="secondary"
              onClick={handleShowCurrent}
              disabled={isLoading}
            >
              {showCurrentData
                ? t("evoluHideCurrentData")
                : t("evoluShowCurrentData")}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={handleShowHistory}
              disabled={isLoading}
            >
              {showHistoryData
                ? t("evoluHideHistoryData")
                : t("evoluShowHistoryData")}
            </button>
          </div>

          {isLoading && (
            <p className="muted" style={{ marginTop: 8 }}>
              {t("loading")}...
            </p>
          )}

          {/* Current Data Table View */}
          {showCurrentData && (
            <div style={{ marginTop: 16 }}>
              <h4>{t("evoluCurrentDataJson")}</h4>
              <div style={{ maxHeight: 400, overflow: "auto" }}>
                {currentDataEntries.map(([tableName, rows]) => (
                  <div key={tableName} style={{ marginBottom: 16 }}>
                    <h5 style={{ marginBottom: 8 }}>
                      {tableName} ({rows.length} rows)
                    </h5>
                    {rows.length > 0 ? (
                      <table
                        style={{
                          width: "100%",
                          fontSize: 11,
                          borderCollapse: "collapse",
                        }}
                      >
                        <thead>
                          <tr
                            style={{
                              backgroundColor: "var(--color-bg-tertiary)",
                            }}
                          >
                            {Object.keys(rows[0]).map((key) => (
                              <th
                                key={key}
                                style={{
                                  padding: 4,
                                  textAlign: "left",
                                  borderBottom: "1px solid var(--color-border)",
                                }}
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => (
                            <tr key={idx}>
                              {Object.values(row).map((val, vidx) => (
                                <td
                                  key={vidx}
                                  style={{
                                    padding: 4,
                                    borderBottom:
                                      "1px solid var(--color-border)",
                                  }}
                                >
                                  {typeof val === "object" && val !== null
                                    ? JSON.stringify(val).slice(0, 50)
                                    : String(val ?? "").slice(0, 50)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="muted">{t("evoluServersEmpty")}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History Data Table View - All individual records */}
          {showHistoryData && (
            <div style={{ marginTop: 16 }}>
              <h4>{t("evoluHistoryDataJson")}</h4>
              <div style={{ maxHeight: 400, overflow: "auto" }}>
                {historyData.length > 0 ? (
                  <table
                    style={{
                      width: "100%",
                      fontSize: 11,
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr
                        style={{ backgroundColor: "var(--color-bg-tertiary)" }}
                      >
                        <th
                          style={{
                            padding: 4,
                            textAlign: "left",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >
                          {t("evoluTable")}
                        </th>
                        <th
                          style={{
                            padding: 4,
                            textAlign: "left",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >
                          {t("evoluColumn")}
                        </th>
                        <th
                          style={{
                            padding: 4,
                            textAlign: "left",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >
                          {t("evoluId")}
                        </th>
                        <th
                          style={{
                            padding: 4,
                            textAlign: "left",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >
                          {t("evoluValue")}
                        </th>
                        <th
                          style={{
                            padding: 4,
                            textAlign: "left",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >
                          {t("evoluTimestamp")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.map((row, idx) => (
                        <tr key={idx}>
                          <td
                            style={{
                              padding: 4,
                              borderBottom: "1px solid var(--color-border)",
                            }}
                          >
                            {row.table}
                          </td>
                          <td
                            style={{
                              padding: 4,
                              borderBottom: "1px solid var(--color-border)",
                            }}
                          >
                            {row.column}
                          </td>
                          <td
                            style={{
                              padding: 4,
                              borderBottom: "1px solid var(--color-border)",
                              fontSize: 10,
                              maxWidth: 100,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={row.id}
                          >
                            {row.id}
                          </td>
                          <td
                            style={{
                              padding: 4,
                              borderBottom: "1px solid var(--color-border)",
                              maxWidth: 150,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={String(row.value ?? "")}
                          >
                            {typeof row.value === "object" && row.value !== null
                              ? JSON.stringify(row.value).slice(0, 40)
                              : String(row.value ?? "").slice(0, 40)}
                          </td>
                          <td
                            style={{
                              padding: 4,
                              borderBottom: "1px solid var(--color-border)",
                              fontSize: 10,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {row.timestamp}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted">{t("evoluServersEmpty")}</p>
                )}
              </div>
            </div>
          )}

          <h3 style={{ marginTop: 24, marginBottom: 12 }}>
            {t("evoluUserTables")}
          </h3>

          {userTableEntries.length === 0 ? (
            <p className="muted">{t("evoluServersEmpty")}</p>
          ) : (
            userTableEntries.map(([tableName, count]) => {
              const rows = count ?? 0;
              const percentage = calculatePercentage(rows);
              const estimatedTableBytes =
                totalRows > 0 ? Math.round((rows / totalRows) * rawDbBytes) : 0;

              return (
                <div key={tableName} className="settings-row">
                  <div className="settings-left">
                    <span className="settings-label">{tableName}</span>
                  </div>
                  <div className="settings-right">
                    <span className="muted">
                      {rows} rows ({percentage}%)
                    </span>
                    <span
                      className="muted"
                      style={{ marginLeft: 8, fontSize: 12 }}
                    >
                      ~{formatBytes(estimatedTableBytes)}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {systemTableEntries.length > 0 && (
            <>
              <h3 style={{ marginTop: 24, marginBottom: 12 }}>
                {t("evoluSystemTables")}
              </h3>
              {systemTableEntries.map(([tableName, count]) => {
                const rows = count ?? 0;
                const percentage = calculatePercentage(rows);
                const estimatedTableBytes =
                  totalRows > 0
                    ? Math.round((rows / totalRows) * rawDbBytes)
                    : 0;

                return (
                  <div key={tableName} className="settings-row">
                    <div className="settings-left">
                      <span className="settings-label">{tableName}</span>
                    </div>
                    <div className="settings-right">
                      <span className="muted">
                        {rows} rows ({percentage}%)
                      </span>
                      <span
                        className="muted"
                        style={{ marginLeft: 8, fontSize: 12 }}
                      >
                        ~{formatBytes(estimatedTableBytes)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
            {t("evoluSizeEstimateHint")}
          </p>
        </>
      ) : (
        <p className="muted">{t("evoluCapacityMeasuring")}</p>
      )}
    </section>
  );
}
