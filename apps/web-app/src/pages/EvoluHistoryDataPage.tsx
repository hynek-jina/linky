import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { useEvoluSettingsContext } from "../app/context/SystemSettingsContexts";
import { loadEvoluHistoryData, type EvoluHistoryRow } from "../evolu";
import { base64 } from "@scure/base";
import { decodeBase64Url } from "../utils/base64";

const BATCH_SIZE = 50;

export function EvoluHistoryDataPage(): React.ReactElement {
  const { evoluHistoryAllowedOwnerIds } = useEvoluSettingsContext();
  const { t } = useAppShellCore();
  const [historyData, setHistoryData] = useState<EvoluHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const normalizeOwnerId = useCallback((value: string): string => {
    const bytes = decodeBase64Url(value);
    return bytes?.length ? base64.encode(bytes) : value.trim();
  }, []);

  const allowedOwnerIds = useMemo(() => {
    const values = evoluHistoryAllowedOwnerIds
      .map((ownerId) => String(ownerId ?? "").trim())
      .filter(Boolean);

    const out = new Set<string>();
    for (const value of values) {
      out.add(value);
      out.add(normalizeOwnerId(value));
    }
    return out;
  }, [evoluHistoryAllowedOwnerIds, normalizeOwnerId]);

  const readRowOwnerId = useCallback(
    (row: EvoluHistoryRow): string => {
      const ownerId = row.ownerId;
      if (typeof ownerId !== "string") return "";
      const normalized = normalizeOwnerId(ownerId);
      if (normalized) return normalized;
      return ownerId.trim();
    },
    [normalizeOwnerId],
  );

  useEffect(() => {
    loadEvoluHistoryData(BATCH_SIZE, 0).then((data) => {
      setHistoryData(data);
      setIsLoading(false);
      setHasMore(data.length === BATCH_SIZE);
    });
  }, []);

  const visibleHistoryData = useMemo(() => {
    if (allowedOwnerIds.size === 0) return [];
    return historyData.filter((row) =>
      allowedOwnerIds.has(readRowOwnerId(row)),
    );
  }, [allowedOwnerIds, historyData, readRowOwnerId]);

  const tableNames = useMemo(() => {
    const tables = new Set<string>();
    visibleHistoryData.forEach((row) => {
      if (row.table) tables.add(row.table);
    });
    return Array.from(tables).sort();
  }, [visibleHistoryData]);

  const filteredData = useMemo(() => {
    if (!selectedTable) return visibleHistoryData;
    return visibleHistoryData.filter((row) => row.table === selectedTable);
  }, [selectedTable, visibleHistoryData]);

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    const newOffset = offset + BATCH_SIZE;

    try {
      const newData = await loadEvoluHistoryData(BATCH_SIZE, newOffset);

      if (newData.length > 0) {
        setHistoryData((prev) => [...prev, ...newData]);
        setOffset(newOffset);
        setHasMore(newData.length === BATCH_SIZE);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load more history:", err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, offset]);

  if (isLoading) {
    return (
      <section className="panel panel-plain page-loading-panel">
        <p className="muted">{t("loading")}...</p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ paddingTop: 8 }}>
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
        {filteredData.length > 0 ? (
          <table
            style={{
              width: "100%",
              fontSize: 11,
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
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
              {filteredData.map((row, idx) => (
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
          <p className="muted">{t("evoluNoDataYet")}</p>
        )}

        {hasMore && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="secondary"
            >
              {isLoadingMore ? t("loadingMore") : t("loadMore")}
            </button>
          </div>
        )}

        {!hasMore && historyData.length > 0 && (
          <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
            {t("allRecordsLoaded")}
          </p>
        )}
      </div>
    </section>
  );
}
