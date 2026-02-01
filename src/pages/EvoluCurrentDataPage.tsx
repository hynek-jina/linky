import React, { useState, useEffect } from "react";

interface EvoluCurrentDataPageProps {
  loadCurrentData: () => Promise<Record<string, any[]>>;
  t: (key: string) => string;
}

export function EvoluCurrentDataPage({
  loadCurrentData,
  t,
}: EvoluCurrentDataPageProps): React.ReactElement {
  const [currentData, setCurrentData] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentData().then((data) => {
      setCurrentData(data);
      setIsLoading(false);
    });
  }, [loadCurrentData]);

  const tableNames = Object.keys(currentData).filter(
    (name) => currentData[name]?.length > 0
  );

  const filteredData = selectedTable
    ? { [selectedTable]: currentData[selectedTable] || [] }
    : currentData;

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
        <nav className="group-filter-bar" aria-label={t("filterByTable")} style={{ marginBottom: 16 }}>
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
            <h3 style={{ marginBottom: 8 }}>{tableName} ({rows.length} rows)</h3>
            {rows.length > 0 ? (
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--color-bg-tertiary)", borderBottom: "1px solid var(--color-border)" }}>
                    {Object.keys(rows[0]).map((key) => (
                      <th key={key} style={{ padding: 4, textAlign: "left" }}>
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((val, vidx) => (
                        <td key={vidx} style={{ padding: 4, borderBottom: "1px solid var(--color-border)" }}>
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
