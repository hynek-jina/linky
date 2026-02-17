import React, { useEffect, useState } from "react";
import type { loadEvoluCurrentData } from "../evolu";

interface EvoluCurrentDataPageProps {
  evoluCashuOwnerId: string | null;
  evoluContactsOwnerId: string | null;
  evoluMessagesBackupOwnerId: string | null;
  evoluMessagesOwnerId: string | null;
  requestManualRotateContactsOwner: () => Promise<void>;
  requestManualRotateMessagesOwner: () => Promise<void>;
  rotateContactsOwnerIsBusy: boolean;
  rotateMessagesOwnerIsBusy: boolean;
  loadCurrentData: typeof loadEvoluCurrentData;
  t: (key: string) => string;
}

export function EvoluCurrentDataPage({
  evoluCashuOwnerId,
  evoluContactsOwnerId,
  evoluMessagesBackupOwnerId,
  evoluMessagesOwnerId,
  requestManualRotateContactsOwner,
  requestManualRotateMessagesOwner,
  rotateContactsOwnerIsBusy,
  rotateMessagesOwnerIsBusy,
  loadCurrentData,
  t,
}: EvoluCurrentDataPageProps): React.ReactElement {
  const [currentData, setCurrentData] = useState<
    Awaited<ReturnType<typeof loadEvoluCurrentData>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentData().then((data) => {
      setCurrentData(data);
      setIsLoading(false);
    });
  }, [loadCurrentData]);

  const readRowOwnerId = (row: unknown): string => {
    if (typeof row !== "object" || row === null) return "";
    if (!("ownerId" in row)) return "";
    const ownerId = row.ownerId;
    if (typeof ownerId !== "string") return "";
    return ownerId.trim();
  };

  const filteredCurrentData = React.useMemo(() => {
    const activeContactsOwnerId = String(evoluContactsOwnerId ?? "").trim();
    const activeCashuOwnerId = String(evoluCashuOwnerId ?? "").trim();
    const activeMessagesOwnerId = String(evoluMessagesOwnerId ?? "").trim();
    const backupMessagesOwnerId = String(
      evoluMessagesBackupOwnerId ?? "",
    ).trim();
    const visibleMessageOwnerIds = new Set(
      [activeMessagesOwnerId, backupMessagesOwnerId].filter(Boolean),
    );

    return Object.fromEntries(
      Object.entries(currentData).map(([tableName, rows]) => {
        if (
          tableName !== "contact" &&
          tableName !== "cashuToken" &&
          tableName !== "credoToken" &&
          tableName !== "nostrMessage" &&
          tableName !== "nostrReaction"
        ) {
          return [tableName, rows];
        }
        if (tableName === "contact") {
          if (!activeContactsOwnerId) return [tableName, []];
          return [
            tableName,
            rows.filter((row) => readRowOwnerId(row) === activeContactsOwnerId),
          ];
        }
        if (tableName === "cashuToken" || tableName === "credoToken") {
          if (!activeCashuOwnerId) return [tableName, []];
          return [
            tableName,
            rows.filter((row) => readRowOwnerId(row) === activeCashuOwnerId),
          ];
        }
        if (visibleMessageOwnerIds.size === 0) return [tableName, []];
        return [
          tableName,
          rows.filter((row) => visibleMessageOwnerIds.has(readRowOwnerId(row))),
        ];
      }),
    ) as Awaited<ReturnType<typeof loadEvoluCurrentData>>;
  }, [
    currentData,
    evoluCashuOwnerId,
    evoluContactsOwnerId,
    evoluMessagesBackupOwnerId,
    evoluMessagesOwnerId,
  ]);

  const tableNames = Object.keys(filteredCurrentData).filter(
    (name) => filteredCurrentData[name]?.length > 0,
  );

  const filteredData = selectedTable
    ? { [selectedTable]: filteredCurrentData[selectedTable] || [] }
    : filteredCurrentData;

  if (isLoading) {
    return (
      <section className="panel">
        <p className="muted">{t("loading")}...</p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ paddingTop: 8 }}>
      {/* Filter by table - same style as contacts page */}
      {tableNames.length > 0 && (
        <nav
          className="group-filter-bar"
          aria-label={t("filterByTable")}
          style={{ marginBottom: 16 }}
        >
          <div className="group-filter-inner">
            <button
              type="button"
              className={
                selectedTable === null
                  ? "group-filter-btn is-active"
                  : "group-filter-btn"
              }
              onClick={() => setSelectedTable(null)}
            >
              {t("all")}
            </button>
            {tableNames.map((tableName) => (
              <button
                key={tableName}
                type="button"
                className={
                  selectedTable === tableName
                    ? "group-filter-btn is-active"
                    : "group-filter-btn"
                }
                onClick={() => setSelectedTable(tableName)}
                title={tableName}
              >
                {tableName}
              </button>
            ))}
          </div>
        </nav>
      )}

      <div style={{ maxHeight: 600, overflow: "auto" }}>
        {Object.entries(filteredData).map(([tableName, rows]) => (
          <div key={tableName} style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 8 }}>
              {tableName} ({rows.length} rows)
            </h3>
            {(tableName === "contact" ||
              tableName === "cashuToken" ||
              tableName === "credoToken") && (
              <div style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (rotateContactsOwnerIsBusy) return;
                    void requestManualRotateContactsOwner();
                  }}
                  disabled={rotateContactsOwnerIsBusy}
                >
                  {rotateContactsOwnerIsBusy
                    ? t("evoluContactsOwnerRotating")
                    : t("evoluContactsOwnerRotate")}
                </button>
              </div>
            )}
            {(tableName === "nostrMessage" ||
              tableName === "nostrReaction") && (
              <div style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (rotateMessagesOwnerIsBusy) return;
                    void requestManualRotateMessagesOwner();
                  }}
                  disabled={rotateMessagesOwnerIsBusy}
                >
                  {rotateMessagesOwnerIsBusy
                    ? t("evoluMessagesOwnerRotating")
                    : t("evoluMessagesOwnerRotate")}
                </button>
              </div>
            )}
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
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    {Object.keys(rows[0])
                      .filter((k) => !["createdAt", "updatedAt"].includes(k))
                      .map((key) => (
                        <th key={key} style={{ padding: 4, textAlign: "left" }}>
                          {key}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      {Object.entries(row)
                        .filter(
                          ([k]) => !["createdAt", "updatedAt"].includes(k),
                        )
                        .map(([, val], vidx) => (
                          <td
                            key={vidx}
                            style={{
                              padding: 4,
                              borderBottom: "1px solid var(--color-border)",
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
    </section>
  );
}
