import React from "react";

import {
  inspectorLinkIds,
  type CollectedInspectorRow,
} from "../inspector/inspectorRows";
import { INSPECTOR_MAX_ROWS } from "../inspector/inspectorStore";
import {
  createStaticInspectorDataSource,
  type InspectorDataSource,
} from "./inspectorDataSource";
import { describeInspectorRow } from "./inspectorGlossary";
import {
  parseInspectorNdjson,
  type InspectorImportResult,
} from "./inspectorImport";

const MAX_RENDERED_ROWS = 2_000;
const FLUSH_INTERVAL_MS = 100;
const FOLLOW_THRESHOLD_PX = 32;

interface AppClient {
  id: string;
  /** First-seen order, used for the friendly "App N" label. */
  label: string;
  rowCount: number;
}

interface TimelineRowProps {
  clientLabel: string | null;
  isRelated: boolean;
  isSelected: boolean;
  onSelect: (row: CollectedInspectorRow) => void;
  row: CollectedInspectorRow;
}

interface DetailPaneProps {
  onClose: () => void;
  onJumpToRow: (row: CollectedInspectorRow) => void;
  relatedRows: CollectedInspectorRow[];
  row: CollectedInspectorRow;
}

interface InspectorAppProps {
  dataSource: InspectorDataSource;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

interface OfflineImport {
  fileName: string;
  result: InspectorImportResult;
}

const timelineRowDomId = (id: number): string => `inspector-row-${id}`;
const channelClassName = (channel: string): string =>
  `channel-${channel.replaceAll(".", "-")}`;

const formatTime = (at: number): string => {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return String(at);

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const rowSearchText = (row: CollectedInspectorRow): string => {
  const payloadText =
    row.payload === undefined ? "" : JSON.stringify(row.payload);
  return `${row.tag}\n${row.summary}\n${JSON.stringify(row.links)}\n${JSON.stringify(row.context)}\n${payloadText}`;
};

function TimelineRow({
  clientLabel,
  isRelated,
  isSelected,
  onSelect,
  row,
}: TimelineRowProps): React.ReactElement {
  return (
    <button
      aria-pressed={isSelected}
      className={`timeline-row ${channelClassName(row.channel)}${isSelected ? " selected" : ""}${isRelated ? " related" : ""}`}
      id={timelineRowDomId(row.id)}
      onClick={() => onSelect(row)}
      type="button"
    >
      <time className="row-time" dateTime={new Date(row.at).toISOString()}>
        {formatTime(row.at)}
      </time>
      {clientLabel !== null && (
        <span className="client-tag">{clientLabel}</span>
      )}
      <span className="channel-badge">{row.channel}</span>
      <span className="row-tag">{row.tag}</span>
      <span className="row-summary">{row.summary}</span>
    </button>
  );
}

interface DetailEntry {
  label: string;
  value: string;
}

const detailEntries = (
  record: Record<string, string | string[]>,
): DetailEntry[] => {
  const entries: DetailEntry[] = [];
  for (const [label, value] of Object.entries(record)) {
    if (typeof value === "string") {
      entries.push({ label, value });
      continue;
    }
    for (const entry of value) entries.push({ label, value: entry });
  }
  return entries;
};

function DetailPane({
  onClose,
  onJumpToRow,
  relatedRows,
  row,
}: DetailPaneProps): React.ReactElement {
  const [copyStatus, setCopyStatus] = React.useState<
    "idle" | "copied" | "failed"
  >("idle");
  const rowJson = React.useMemo(() => JSON.stringify(row, null, 2), [row]);
  const payloadJson = React.useMemo(
    () =>
      row.payload === undefined ? null : JSON.stringify(row.payload, null, 2),
    [row],
  );
  const links = detailEntries(row.links);
  const context = detailEntries(row.context ?? {});
  const hasLinkIds = inspectorLinkIds(row.links).length > 0;

  React.useEffect(() => {
    setCopyStatus("idle");
  }, [row]);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rowJson);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }, [rowJson]);

  return (
    <aside aria-label="Row detail" className="detail-pane">
      <div className="detail-header">
        <div>
          <p className="detail-eyebrow">Row #{row.id}</p>
          <h2>{row.tag}</h2>
        </div>
        <button
          aria-label="Close row detail"
          className="icon-button"
          onClick={onClose}
          title="Close (Escape)"
          type="button"
        >
          ✕
        </button>
      </div>

      <dl className="detail-fields">
        <div>
          <dt>time</dt>
          <dd>{formatTime(row.at)}</dd>
        </div>
        <div>
          <dt>channel</dt>
          <dd className={`detail-channel ${channelClassName(row.channel)}`}>
            {row.channel}
          </dd>
        </div>
        <div>
          <dt>app</dt>
          <dd>{row.client}</dd>
        </div>
        <div>
          <dt>summary</dt>
          <dd>{row.summary || "—"}</dd>
        </div>
      </dl>

      {links.length > 0 && (
        <>
          <div className="json-heading">
            <span>Links</span>
          </div>
          <ul className="link-list">
            {links.map((link, index) => (
              <li key={`${link.label}-${index}`}>
                <span className="link-label">{link.label}</span>
                <span className="link-value">{link.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {context.length > 0 && (
        <>
          <div className="json-heading">
            <span>Context</span>
          </div>
          <dl className="context-list">
            {context.map((entry, index) => (
              <div key={`${entry.label}-${index}`}>
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <div className="json-heading">
        <span>Related rows ({relatedRows.length})</span>
      </div>
      {relatedRows.length === 0 ? (
        <p className="related-empty">
          {hasLinkIds
            ? "No other rows share this row's link ids."
            : "This row carries no link ids to correlate by."}
        </p>
      ) : (
        <ul className="related-rows">
          {relatedRows.map((relatedRow) => (
            <li key={relatedRow.id}>
              <button
                className={`related-row ${channelClassName(relatedRow.channel)}`}
                onClick={() => onJumpToRow(relatedRow)}
                title="Jump to row"
                type="button"
              >
                <time className="row-time">{formatTime(relatedRow.at)}</time>
                <span className="channel-badge">{relatedRow.channel}</span>
                <span className="row-tag">{relatedRow.tag}</span>
                <span className="row-summary">{relatedRow.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="json-heading">
        <span>What is this?</span>
      </div>
      <p className="row-description">{describeInspectorRow(row)}</p>

      <div className="json-heading">
        <span>Payload</span>
        <button className="secondary-button" onClick={handleCopy} type="button">
          {copyStatus === "copied"
            ? "Copied"
            : copyStatus === "failed"
              ? "Copy failed"
              : "Copy row JSON"}
        </button>
      </div>
      <pre className="json-block">{payloadJson ?? "—"}</pre>
    </aside>
  );
}

export function InspectorApp({
  dataSource,
  isFullscreen = false,
  onToggleFullscreen,
}: InspectorAppProps): React.ReactElement {
  const [rows, setRows] = React.useState<CollectedInspectorRow[]>([]);
  const [isConnected, setIsConnected] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isClearing, setIsClearing] = React.useState(false);
  const [hiddenChannels, setHiddenChannels] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [clientFilter, setClientFilter] = React.useState("all");
  const [textFilter, setTextFilter] = React.useState("");
  const [selectedRow, setSelectedRow] =
    React.useState<CollectedInspectorRow | null>(null);
  const [isFollowing, setIsFollowing] = React.useState(true);
  const [offlineImport, setOfflineImport] =
    React.useState<OfflineImport | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [importMessage, setImportMessage] = React.useState<string | null>(null);

  const incomingRowsRef = React.useRef<CollectedInspectorRow[]>([]);
  // Ids are monotonic and SSE delivery is ordered (including replay), so a
  // high-water mark is enough to dedupe reconnect replays.
  const lastSeenIdRef = React.useRef(0);
  const isPausedRef = React.useRef(false);
  const timelineRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const activeDataSource = React.useMemo(
    () =>
      offlineImport
        ? createStaticInspectorDataSource(offlineImport.result.rows)
        : dataSource,
    [dataSource, offlineImport],
  );

  const flushIncomingRows = React.useCallback(() => {
    if (isPausedRef.current || incomingRowsRef.current.length === 0) return;

    const incoming = incomingRowsRef.current;
    incomingRowsRef.current = [];
    setRows((current) => [...current, ...incoming].slice(-INSPECTOR_MAX_ROWS));
  }, []);

  React.useEffect(() => {
    incomingRowsRef.current = [];
    lastSeenIdRef.current = 0;
    isPausedRef.current = false;
    setRows([]);
    setSelectedRow(null);
    setIsPaused(false);
    setIsConnected(false);

    const flushTimer = window.setInterval(flushIncomingRows, FLUSH_INTERVAL_MS);
    const disconnect = activeDataSource.connect({
      onClear: () => {
        incomingRowsRef.current = [];
        setRows([]);
        setSelectedRow(null);
      },
      onConnectionChange: setIsConnected,
      onRows: (incomingRows) => {
        for (const row of incomingRows) {
          if (row.id <= lastSeenIdRef.current) continue;
          lastSeenIdRef.current = row.id;
          incomingRowsRef.current.push(row);
          if (incomingRowsRef.current.length > INSPECTOR_MAX_ROWS) {
            incomingRowsRef.current.shift();
          }
        }
      },
    });

    return () => {
      disconnect();
      window.clearInterval(flushTimer);
    };
  }, [activeDataSource, flushIncomingRows]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedRow(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // App instances observed in the stream, in first-seen order so the friendly
  // "App N" labels stay stable while rows keep arriving.
  const appClients = React.useMemo((): AppClient[] => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.client, (counts.get(row.client) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, rowCount], index) => ({
      id,
      label: `App ${index + 1}`,
      rowCount,
    }));
  }, [rows]);

  const observedChannels = React.useMemo((): string[] => {
    const channels = new Set<string>();
    for (const row of rows) channels.add(row.channel);
    return [...channels];
  }, [rows]);

  const clientLabelById = React.useMemo(() => {
    const labels = new Map<string, string>();
    for (const appClient of appClients) {
      labels.set(appClient.id, appClient.label);
    }
    return labels;
  }, [appClients]);

  // If the selected app's rows were cleared away, fall back to all apps so
  // the select never holds a value that is no longer offered.
  React.useEffect(() => {
    if (clientFilter !== "all" && !clientLabelById.has(clientFilter)) {
      setClientFilter("all");
    }
  }, [clientFilter, clientLabelById]);

  // Rows sharing any of the selected row's link ids, computed over the full
  // buffer so the detail pane lists related rows even when filtered out.
  const relatedRows = React.useMemo(() => {
    if (!selectedRow) return [];
    const selectedIds = new Set(inspectorLinkIds(selectedRow.links));
    if (selectedIds.size === 0) return [];
    return rows.filter(
      (row) =>
        row.id !== selectedRow.id &&
        inspectorLinkIds(row.links).some((id) => selectedIds.has(id)),
    );
  }, [rows, selectedRow]);

  const relatedRowIds = React.useMemo(
    () => new Set(relatedRows.map((row) => row.id)),
    [relatedRows],
  );

  const matchingRows = React.useMemo(() => {
    const query = textFilter.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (hiddenChannels.has(row.channel)) return false;
      if (clientFilter !== "all" && row.client !== clientFilter) return false;
      if (!query) return true;
      return rowSearchText(row).toLocaleLowerCase().includes(query);
    });
  }, [clientFilter, hiddenChannels, rows, textFilter]);

  const hiddenRowCount = Math.max(0, matchingRows.length - MAX_RENDERED_ROWS);
  const renderedRows = React.useMemo(
    () => matchingRows.slice(-MAX_RENDERED_ROWS),
    [matchingRows],
  );

  React.useLayoutEffect(() => {
    if (!isFollowing) return;
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [isFollowing, renderedRows]);

  const handleTimelineScroll = React.useCallback(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const distanceFromBottom =
      timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight;
    setIsFollowing(distanceFromBottom <= FOLLOW_THRESHOLD_PX);
  }, []);

  const handleFollow = React.useCallback(() => {
    setIsFollowing(true);
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, []);

  const handlePauseToggle = React.useCallback(() => {
    const nextPaused = !isPaused;
    isPausedRef.current = nextPaused;
    setIsPaused(nextPaused);
    if (!nextPaused) flushIncomingRows();
  }, [flushIncomingRows, isPaused]);

  const handleChannelToggle = React.useCallback((channel: string) => {
    setHiddenChannels((current) => {
      const next = new Set(current);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  }, []);

  const handleJumpToRow = React.useCallback((row: CollectedInspectorRow) => {
    setSelectedRow(row);
    setIsFollowing(false);
    requestAnimationFrame(() => {
      document
        .getElementById(timelineRowDomId(row.id))
        ?.scrollIntoView({ block: "center" });
    });
  }, []);

  const handleClear = React.useCallback(async () => {
    setIsClearing(true);
    try {
      await activeDataSource.clear();
    } catch {
      // The local view can still be cleared while the collector reconnects.
    } finally {
      incomingRowsRef.current = [];
      setRows([]);
      setSelectedRow(null);
      setIsClearing(false);
    }
  }, [activeDataSource]);

  const handleImport = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file) return;

      setIsImporting(true);
      setImportMessage(`Reading ${file.name}…`);
      try {
        const result = parseInspectorNdjson(await file.text());
        incomingRowsRef.current = [];
        setRows([]);
        setSelectedRow(null);
        setOfflineImport({ fileName: file.name, result });
        const truncation =
          result.truncatedRowCount > 0
            ? `; ${result.truncatedRowCount.toLocaleString()} older rows truncated`
            : "";
        setImportMessage(
          `Imported ${result.rows.length.toLocaleString()} rows (${result.skippedLineCount.toLocaleString()} skipped${truncation}).`,
        );
      } catch {
        setImportMessage(`Could not read ${file.name}.`);
      } finally {
        setIsImporting(false);
      }
    },
    [],
  );

  const handleLeaveOffline = React.useCallback(() => {
    incomingRowsRef.current = [];
    setRows([]);
    setSelectedRow(null);
    setOfflineImport(null);
    setImportMessage(null);
  }, []);

  const statusLabel = offlineImport
    ? "offline"
    : isConnected
      ? "connected"
      : "reconnecting";

  return (
    <main className="inspector-app">
      <header className="top-bar">
        <div className="brand-block">
          <h1>Linky Inspector</h1>
          <span
            aria-label={statusLabel}
            className={`connection-dot ${statusLabel}`}
            title={statusLabel}
          />
          <span className="connection-label">{statusLabel}</span>
        </div>
        <div className="top-actions">
          {onToggleFullscreen && (
            <button
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-pressed={isFullscreen}
              className="icon-button"
              onClick={onToggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              type="button"
            >
              {isFullscreen ? "⤡" : "⤢"}
            </button>
          )}
          <span className="row-count">
            {renderedRows.length.toLocaleString()} shown /{" "}
            {rows.length.toLocaleString()} total
          </span>
          <input
            accept=".ndjson,.jsonl,.txt,application/x-ndjson,application/json,text/plain"
            className="visually-hidden"
            onChange={(event) => void handleImport(event)}
            ref={fileInputRef}
            type="file"
          />
          {offlineImport ? (
            <span className="import-pill" title={offlineImport.fileName}>
              <span>{offlineImport.fileName}</span>
              <button
                aria-label={`Close ${offlineImport.fileName} and return to the live feed`}
                onClick={handleLeaveOffline}
                title="Return to live feed"
                type="button"
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              className="secondary-button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {isImporting ? "Importing…" : "Import"}
            </button>
          )}
          {!offlineImport && (
            <>
              <button
                className={`secondary-button${isPaused ? " active" : ""}`}
                onClick={handlePauseToggle}
                type="button"
              >
                {isPaused ? "Resume" : "Pause"}
              </button>
              <button
                className="secondary-button danger-button"
                disabled={isClearing}
                onClick={() => void handleClear()}
                type="button"
              >
                {isClearing ? "Clearing…" : "Clear"}
              </button>
            </>
          )}
        </div>
      </header>

      <section aria-label="Row filters" className="filter-bar">
        {appClients.length > 1 && (
          <label className="app-filter">
            <span>App</span>
            <select
              onChange={(event) => setClientFilter(event.target.value)}
              value={clientFilter}
            >
              <option value="all">all apps</option>
              {appClients.map((appClient) => (
                <option key={appClient.id} value={appClient.id}>
                  {appClient.label} · {appClient.id.slice(0, 8)} (
                  {appClient.rowCount})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="channel-filters">
          {observedChannels.map((channel) => (
            <button
              aria-pressed={!hiddenChannels.has(channel)}
              className={`filter-chip ${channelClassName(channel)}${hiddenChannels.has(channel) ? "" : " enabled"}`}
              key={channel}
              onClick={() => handleChannelToggle(channel)}
              type="button"
            >
              {channel}
            </button>
          ))}
        </div>

        <label className="text-filter">
          <span className="visually-hidden">Filter rows</span>
          <input
            onChange={(event) => setTextFilter(event.target.value)}
            placeholder="Filter tag, summary, link id, or payload…"
            type="search"
            value={textFilter}
          />
        </label>
        {importMessage && (
          <span className="import-status" role="status" title={importMessage}>
            {importMessage}
          </span>
        )}
      </section>

      <div className={`workspace${selectedRow ? " has-detail" : ""}`}>
        <section className="timeline-panel">
          <div
            aria-label="Inspector row timeline"
            className={`timeline${appClients.length > 1 ? " multi-app" : ""}`}
            onScroll={handleTimelineScroll}
            ref={timelineRef}
          >
            {hiddenRowCount > 0 && (
              <p className="hidden-rows-notice">
                …{hiddenRowCount.toLocaleString()} older rows hidden
              </p>
            )}
            {renderedRows.length === 0 ? (
              <div className="empty-state">
                {rows.length === 0
                  ? offlineImport
                    ? "No valid inspector rows were imported."
                    : "Waiting for inspector rows…"
                  : "No rows match the current filters."}
              </div>
            ) : (
              renderedRows.map((row) => (
                <TimelineRow
                  clientLabel={
                    appClients.length > 1
                      ? (clientLabelById.get(row.client) ?? null)
                      : null
                  }
                  isRelated={relatedRowIds.has(row.id)}
                  isSelected={selectedRow?.id === row.id}
                  key={row.id}
                  onSelect={setSelectedRow}
                  row={row}
                />
              ))
            )}
          </div>
          {!isFollowing && renderedRows.length > 0 && (
            <button
              className="follow-button"
              onClick={handleFollow}
              type="button"
            >
              Follow ↓
            </button>
          )}
        </section>

        {selectedRow && (
          <DetailPane
            onClose={() => setSelectedRow(null)}
            onJumpToRow={handleJumpToRow}
            relatedRows={relatedRows}
            row={selectedRow}
          />
        )}
      </div>
    </main>
  );
}
