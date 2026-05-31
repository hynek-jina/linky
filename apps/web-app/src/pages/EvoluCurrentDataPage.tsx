import React, { useEffect, useState } from "react";
import type { loadEvoluCurrentData } from "../evolu";
import {
  CASHU_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  CONTACTS_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  MESSAGES_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
  TRANSACTIONS_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
} from "../utils/constants";

interface EvoluCurrentDataPageProps {
  evoluCashuOwnerEditsUntilRotation: number;
  evoluCashuOwnerId: string | null;
  evoluCashuOwnerIndex: number;
  evoluCashuVisibleOwnerIds: readonly string[];
  evoluContactsOwnerEditsUntilRotation: number;
  evoluContactsOwnerId: string | null;
  evoluContactsOwnerIndex: number;
  evoluMessagesBackupOwnerId: string | null;
  evoluMessagesOwnerEditsUntilRotation: number;
  evoluMessagesOwnerId: string | null;
  evoluMessagesOwnerIndex: number;
  evoluMessagesVisibleOwnerIds: readonly string[];
  evoluTransactionsBackupOwnerId: string | null;
  evoluTransactionsOwnerEditsUntilRotation: number;
  evoluTransactionsOwnerId: string | null;
  evoluTransactionsOwnerIndex: number;
  evoluTransactionsVisibleOwnerIds: readonly string[];
  requestManualRotateCashuOwner: () => Promise<void>;
  requestManualRotateContactsOwner: () => Promise<void>;
  requestManualRotateMessagesOwner: () => Promise<void>;
  requestManualRotateTransactionsOwner: () => Promise<void>;
  rotateCashuOwnerIsBusy: boolean;
  rotateContactsOwnerIsBusy: boolean;
  rotateMessagesOwnerIsBusy: boolean;
  rotateTransactionsOwnerIsBusy: boolean;
  loadCurrentData: typeof loadEvoluCurrentData;
  t: (key: string) => string;
}

function readRowOwnerId(row: unknown): string {
  if (typeof row !== "object" || row === null) return "";
  if (!("ownerId" in row)) return "";
  const ownerId = row.ownerId;
  if (typeof ownerId !== "string") return "";
  return ownerId.trim();
}

function isTrackedTable(tableName: string): boolean {
  return (
    tableName === "contact" ||
    tableName === "cashuToken" ||
    tableName === "nostrMessage" ||
    tableName === "nostrReaction" ||
    tableName === "transaction"
  );
}

export function EvoluCurrentDataPage({
  evoluCashuOwnerEditsUntilRotation,
  evoluCashuOwnerId,
  evoluCashuOwnerIndex,
  evoluCashuVisibleOwnerIds,
  evoluContactsOwnerEditsUntilRotation,
  evoluContactsOwnerId,
  evoluContactsOwnerIndex,
  evoluMessagesOwnerEditsUntilRotation,
  evoluMessagesOwnerId,
  evoluMessagesOwnerIndex,
  evoluMessagesVisibleOwnerIds,
  evoluTransactionsOwnerEditsUntilRotation,
  evoluTransactionsOwnerId,
  evoluTransactionsOwnerIndex,
  evoluTransactionsVisibleOwnerIds,
  requestManualRotateCashuOwner,
  requestManualRotateContactsOwner,
  requestManualRotateMessagesOwner,
  requestManualRotateTransactionsOwner,
  rotateCashuOwnerIsBusy,
  rotateContactsOwnerIsBusy,
  rotateMessagesOwnerIsBusy,
  rotateTransactionsOwnerIsBusy,
  loadCurrentData,
  t,
}: EvoluCurrentDataPageProps): React.ReactElement {
  const previewRowCount = 2;
  const [currentData, setCurrentData] = useState<
    Awaited<ReturnType<typeof loadEvoluCurrentData>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    loadCurrentData().then((data) => {
      setCurrentData(data);
      setIsLoading(false);
    });
  }, [loadCurrentData]);

  const filteredCurrentData = React.useMemo(() => {
    const activeContactsOwnerId = String(evoluContactsOwnerId ?? "").trim();
    const visibleCashuOwnerIds = new Set(
      [evoluCashuOwnerId, ...evoluCashuVisibleOwnerIds]
        .map((ownerId) => String(ownerId ?? "").trim())
        .filter(Boolean),
    );
    const visibleMessageOwnerIds = new Set(
      [evoluMessagesOwnerId, ...evoluMessagesVisibleOwnerIds]
        .map((ownerId) => String(ownerId ?? "").trim())
        .filter(Boolean),
    );
    const visibleTransactionOwnerIds = new Set(
      [evoluTransactionsOwnerId, ...evoluTransactionsVisibleOwnerIds]
        .map((ownerId) => String(ownerId ?? "").trim())
        .filter(Boolean),
    );

    return Object.fromEntries(
      Object.entries(currentData).map(([tableName, rows]) => {
        if (!isTrackedTable(tableName)) {
          return [tableName, rows];
        }
        if (tableName === "contact") {
          if (!activeContactsOwnerId) return [tableName, []];
          return [
            tableName,
            rows.filter((row) => readRowOwnerId(row) === activeContactsOwnerId),
          ];
        }
        if (tableName === "cashuToken") {
          if (visibleCashuOwnerIds.size === 0) return [tableName, []];
          return [
            tableName,
            rows.filter((row) => visibleCashuOwnerIds.has(readRowOwnerId(row))),
          ];
        }
        if (tableName === "transaction") {
          if (visibleTransactionOwnerIds.size === 0) return [tableName, []];
          return [
            tableName,
            rows.filter((row) =>
              visibleTransactionOwnerIds.has(readRowOwnerId(row)),
            ),
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
    evoluCashuVisibleOwnerIds,
    evoluContactsOwnerId,
    evoluMessagesOwnerId,
    evoluMessagesVisibleOwnerIds,
    evoluTransactionsOwnerId,
    evoluTransactionsVisibleOwnerIds,
  ]);

  const dataSections = React.useMemo(
    () =>
      Object.entries(filteredCurrentData)
        .map(([tableName, rows]) => {
          if (tableName === "contact") {
            return {
              tableName,
              rows,
              label: t("contactsTitle"),
              ownerIndex: evoluContactsOwnerIndex,
              editsUntilRotation: evoluContactsOwnerEditsUntilRotation,
              rotationLimit: CONTACTS_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
              onRotate: requestManualRotateContactsOwner,
              rotateLabel: t("evoluContactsCashuOwnerRotate"),
              rotateIsBusy: rotateContactsOwnerIsBusy,
              rotatingLabel: t("evoluContactsCashuOwnerRotating"),
            };
          }

          if (tableName === "cashuToken") {
            return {
              tableName,
              rows,
              label: t("tokens"),
              ownerIndex: evoluCashuOwnerIndex,
              editsUntilRotation: evoluCashuOwnerEditsUntilRotation,
              rotationLimit: CASHU_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
              onRotate: requestManualRotateCashuOwner,
              rotateLabel: t("evoluCashuOwnerRotate"),
              rotateIsBusy: rotateCashuOwnerIsBusy,
              rotatingLabel: t("evoluCashuOwnerRotating"),
            };
          }

          if (tableName === "nostrMessage") {
            return {
              tableName,
              rows,
              label: t("messagesTitle"),
              ownerIndex: evoluMessagesOwnerIndex,
              editsUntilRotation: evoluMessagesOwnerEditsUntilRotation,
              rotationLimit: MESSAGES_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
              onRotate: requestManualRotateMessagesOwner,
              rotateLabel: t("evoluMessagesOwnerRotate"),
              rotateIsBusy: rotateMessagesOwnerIsBusy,
              rotatingLabel: t("evoluMessagesOwnerRotating"),
            };
          }

          if (tableName === "nostrReaction") {
            return {
              tableName,
              rows,
              label: t("reactionsTitle"),
              ownerIndex: evoluMessagesOwnerIndex,
              editsUntilRotation: evoluMessagesOwnerEditsUntilRotation,
              rotationLimit: MESSAGES_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
              onRotate: requestManualRotateMessagesOwner,
              rotateLabel: t("evoluMessagesOwnerRotate"),
              rotateIsBusy: rotateMessagesOwnerIsBusy,
              rotatingLabel: t("evoluMessagesOwnerRotating"),
            };
          }

          if (tableName === "transaction") {
            return {
              tableName,
              rows,
              label: t("transactionsTitle"),
              ownerIndex: evoluTransactionsOwnerIndex,
              editsUntilRotation: evoluTransactionsOwnerEditsUntilRotation,
              rotationLimit: TRANSACTIONS_OWNER_ROTATION_TRIGGER_WRITE_COUNT,
              onRotate: requestManualRotateTransactionsOwner,
              rotateLabel: t("evoluTransactionsOwnerRotate"),
              rotateIsBusy: rotateTransactionsOwnerIsBusy,
              rotatingLabel: t("evoluTransactionsOwnerRotating"),
            };
          }

          return {
            tableName,
            rows,
            label: tableName,
            ownerIndex: null,
            editsUntilRotation: null,
            rotationLimit: null,
            onRotate: null,
            rotateLabel: null,
            rotateIsBusy: false,
            rotatingLabel: null,
          };
        })
        .filter(
          ({ tableName, rows }) => isTrackedTable(tableName) || rows.length > 0,
        ),
    [
      evoluCashuOwnerEditsUntilRotation,
      evoluCashuOwnerIndex,
      evoluContactsOwnerEditsUntilRotation,
      evoluContactsOwnerIndex,
      evoluMessagesOwnerEditsUntilRotation,
      evoluMessagesOwnerIndex,
      evoluTransactionsOwnerEditsUntilRotation,
      evoluTransactionsOwnerIndex,
      filteredCurrentData,
      requestManualRotateCashuOwner,
      requestManualRotateContactsOwner,
      requestManualRotateMessagesOwner,
      requestManualRotateTransactionsOwner,
      rotateCashuOwnerIsBusy,
      rotateContactsOwnerIsBusy,
      rotateMessagesOwnerIsBusy,
      rotateTransactionsOwnerIsBusy,
      t,
    ],
  );

  if (isLoading) {
    return (
      <section className="panel panel-plain page-loading-panel">
        <p className="muted">{t("loading")}...</p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ paddingTop: 8 }}>
      <div style={{ maxHeight: 600, overflow: "auto" }}>
        {dataSections.map(
          ({
            tableName,
            rows,
            label,
            ownerIndex,
            editsUntilRotation,
            rotationLimit,
            onRotate,
            rotateLabel,
            rotateIsBusy,
            rotatingLabel,
          }) => {
            const usedEdits =
              editsUntilRotation !== null && rotationLimit !== null
                ? Math.max(
                    0,
                    Math.min(rotationLimit, rotationLimit - editsUntilRotation),
                  )
                : null;

            const progressPercent =
              usedEdits !== null && rotationLimit !== null
                ? Math.min(100, Math.max(0, (usedEdits / rotationLimit) * 100))
                : 0;
            const isExpanded = expandedTables[tableName] === true;
            const visibleRows = isExpanded
              ? rows
              : rows.slice(0, previewRowCount);
            const hiddenRowsCount = Math.max(
              0,
              rows.length - visibleRows.length,
            );
            const toggleExpanded = () => {
              setExpandedTables((current) => ({
                ...current,
                [tableName]: !current[tableName],
              }));
            };

            return (
              <div
                key={tableName}
                style={{
                  marginBottom: 24,
                  border: "1px solid var(--color-border)",
                  borderRadius: 16,
                  overflow: "hidden",
                  backgroundColor: "var(--color-bg-secondary)",
                }}
              >
                <div
                  style={{
                    padding: 14,
                    borderBottom: "1px solid var(--color-border)",
                    background:
                      "linear-gradient(180deg, var(--color-bg-tertiary) 0%, var(--color-bg-secondary) 100%)",
                  }}
                >
                  <div
                    style={{
                      alignItems: "center",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      justifyContent: "space-between",
                      marginBottom:
                        ownerIndex !== null || editsUntilRotation !== null
                          ? 12
                          : 0,
                    }}
                  >
                    <h3 style={{ margin: 0 }}>{label}</h3>

                    {onRotate && rotateLabel && rotatingLabel && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          if (rotateIsBusy) return;
                          void onRotate();
                        }}
                        disabled={rotateIsBusy}
                      >
                        {rotateIsBusy ? rotatingLabel : rotateLabel}
                      </button>
                    )}
                  </div>

                  {(ownerIndex !== null || editsUntilRotation !== null) && (
                    <div
                      style={{
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(180px, 1fr))",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            padding: "9px 11px",
                            borderRadius: 12,
                            backgroundColor: "var(--color-bg-primary)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <div
                            style={{
                              alignItems: "baseline",
                              display: "flex",
                              gap: 8,
                              justifyContent: "space-between",
                            }}
                          >
                            <span className="muted">Rows</span>
                            <span
                              style={{
                                fontSize: 15,
                                fontWeight: 600,
                                marginLeft: "auto",
                                textAlign: "right",
                              }}
                            >
                              {rows.length}
                            </span>
                          </div>
                        </div>

                        {ownerIndex !== null && (
                          <div
                            style={{
                              padding: "9px 11px",
                              borderRadius: 12,
                              backgroundColor: "var(--color-bg-primary)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            <div
                              style={{
                                alignItems: "baseline",
                                display: "flex",
                                gap: 8,
                                justifyContent: "space-between",
                              }}
                            >
                              <span className="muted">
                                {t("evoluOwnerIndex")}
                              </span>
                              <span
                                style={{
                                  fontSize: 15,
                                  fontWeight: 600,
                                  marginLeft: "auto",
                                  textAlign: "right",
                                }}
                              >
                                {ownerIndex}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {editsUntilRotation !== null &&
                        rotationLimit !== null && (
                          <div
                            style={{
                              padding: "9px 11px",
                              borderRadius: 12,
                              backgroundColor: "var(--color-bg-primary)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            <div
                              style={{
                                alignItems: "baseline",
                                display: "flex",
                                gap: 8,
                                justifyContent: "space-between",
                                marginBottom: 8,
                              }}
                            >
                              <span className="muted">
                                {t("evoluEditsUntilRotation")}
                              </span>
                              <span
                                style={{
                                  fontSize: 15,
                                  fontWeight: 600,
                                  marginLeft: "auto",
                                  textAlign: "right",
                                }}
                              >
                                {editsUntilRotation}/{rotationLimit}
                              </span>
                            </div>

                            <div
                              style={{
                                width: "100%",
                                height: 8,
                                backgroundColor: "var(--color-border)",
                                borderRadius: 999,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${progressPercent}%`,
                                  height: "100%",
                                  backgroundColor:
                                    editsUntilRotation <=
                                    Math.round(rotationLimit * 0.1)
                                      ? "var(--color-error)"
                                      : editsUntilRotation <=
                                          Math.round(rotationLimit * 0.3)
                                        ? "var(--color-warning)"
                                        : "var(--color-success)",
                                }}
                              />
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>

                <div style={{ padding: 12 }}>
                  {rows.length > 0 ? (
                    <>
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
                              .filter(
                                (key) =>
                                  !["createdAt", "updatedAt"].includes(key),
                              )
                              .map((key) => (
                                <th
                                  key={key}
                                  style={{ padding: 4, textAlign: "left" }}
                                >
                                  {key}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((row, idx) => (
                            <tr key={idx}>
                              {Object.entries(row)
                                .filter(
                                  ([key]) =>
                                    !["createdAt", "updatedAt"].includes(key),
                                )
                                .map(([, val], valueIdx) => (
                                  <td
                                    key={valueIdx}
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

                      {(rows.length > previewRowCount || isExpanded) && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            marginTop: 10,
                          }}
                        >
                          <span className="muted">
                            {isExpanded
                              ? t("evoluShowingAllRows")
                              : t("evoluShowingPreviewRows").replace(
                                  "{count}",
                                  String(visibleRows.length),
                                )}
                          </span>
                          <button
                            type="button"
                            className="secondary"
                            onClick={toggleExpanded}
                          >
                            {isExpanded
                              ? t("evoluHideSectionDetail")
                              : t("evoluShowSectionDetail").replace(
                                  "{count}",
                                  String(hiddenRowsCount),
                                )}
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>
                      {t("evoluNoDataYet")}
                    </p>
                  )}
                </div>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}
