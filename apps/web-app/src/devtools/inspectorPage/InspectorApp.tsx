import React from "react";

import {
  INSPECTOR_CLEAR_PATH,
  INSPECTOR_STREAM_PATH,
  parseInspectorEvent,
  type InspectorChannel,
  type InspectorDirection,
  type InspectorEvent,
} from "../inspectorEvents";
import { describeInspectorEvent } from "../inspectorGlossary";

const MAX_EVENTS = 5_000;
const MAX_RENDERED_EVENTS = 2_000;
const FLUSH_INTERVAL_MS = 100;
const FOLLOW_THRESHOLD_PX = 32;
const CHANNELS: InspectorChannel[] = ["nostr", "cashu", "evolu"];

interface ChannelSelection {
  cashu: boolean;
  evolu: boolean;
  nostr: boolean;
}

interface AppClient {
  id: string;
  /** First-seen order, used for the friendly "App N" label. */
  label: string;
  eventCount: number;
}

interface TimelineRowProps {
  clientLabel: string | null;
  event: InspectorEvent;
  isSelected: boolean;
  onSelect: (event: InspectorEvent) => void;
}

interface DetailPaneProps {
  event: InspectorEvent;
  onClose: () => void;
}

const formatTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const directionGlyph = (direction?: InspectorDirection): string => {
  if (direction === "out") return "→";
  if (direction === "in") return "←";
  return "·";
};

const parseDirectionFilter = (value: string): "all" | InspectorDirection => {
  if (value === "in" || value === "out") return value;
  return "all";
};

const dataSearchText = (event: InspectorEvent): string => {
  if (event.data === undefined) return "";
  return JSON.stringify(event.data);
};

function TimelineRow({
  clientLabel,
  event,
  isSelected,
  onSelect,
}: TimelineRowProps): React.ReactElement {
  return (
    <button
      aria-pressed={isSelected}
      className={`timeline-row channel-${event.channel}${isSelected ? " selected" : ""}`}
      onClick={() => onSelect(event)}
      title={describeInspectorEvent(event)}
      type="button"
    >
      <time className="event-time" dateTime={event.ts}>
        {formatTime(event.ts)}
      </time>
      {clientLabel !== null && (
        <span className="client-tag">{clientLabel}</span>
      )}
      <span className="channel-badge">{event.channel}</span>
      <span
        aria-label={event.direction ?? "no direction"}
        className={`direction direction-${event.direction ?? "none"}`}
      >
        {directionGlyph(event.direction)}
      </span>
      <span className="event-type">{event.type}</span>
      <span className="event-summary">{event.summary}</span>
    </button>
  );
}

function DetailPane({ event, onClose }: DetailPaneProps): React.ReactElement {
  const [copyStatus, setCopyStatus] = React.useState<
    "idle" | "copied" | "failed"
  >("idle");
  const json = React.useMemo(() => JSON.stringify(event, null, 2), [event]);

  React.useEffect(() => {
    setCopyStatus("idle");
  }, [event]);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }, [json]);

  return (
    <aside aria-label="Event detail" className="detail-pane">
      <div className="detail-header">
        <div>
          <p className="detail-eyebrow">Event #{event.seq}</p>
          <h2>{event.type}</h2>
        </div>
        <button
          aria-label="Close event detail"
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
          <dt>seq</dt>
          <dd>{event.seq}</dd>
        </div>
        <div>
          <dt>ts</dt>
          <dd>{event.ts}</dd>
        </div>
        <div>
          <dt>channel</dt>
          <dd className={`detail-channel channel-${event.channel}`}>
            {event.channel}
          </dd>
        </div>
        <div>
          <dt>direction</dt>
          <dd>{event.direction ?? "none"}</dd>
        </div>
        <div>
          <dt>app</dt>
          <dd>{event.client ?? "—"}</dd>
        </div>
        <div>
          <dt>summary</dt>
          <dd>{event.summary || "—"}</dd>
        </div>
      </dl>

      <div className="json-heading">
        <span>What is this?</span>
      </div>
      <p className="event-description">{describeInspectorEvent(event)}</p>

      <div className="json-heading">
        <span>Full event JSON</span>
        <button className="secondary-button" onClick={handleCopy} type="button">
          {copyStatus === "copied"
            ? "Copied"
            : copyStatus === "failed"
              ? "Copy failed"
              : "Copy JSON"}
        </button>
      </div>
      <pre className="json-block">{json}</pre>
    </aside>
  );
}

export function InspectorApp(): React.ReactElement {
  const [events, setEvents] = React.useState<InspectorEvent[]>([]);
  const [isConnected, setIsConnected] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [isClearing, setIsClearing] = React.useState(false);
  const [channels, setChannels] = React.useState<ChannelSelection>({
    cashu: true,
    evolu: true,
    nostr: true,
  });
  const [direction, setDirection] = React.useState<"all" | InspectorDirection>(
    "all",
  );
  const [clientFilter, setClientFilter] = React.useState("all");
  const [textFilter, setTextFilter] = React.useState("");
  const [selectedEvent, setSelectedEvent] =
    React.useState<InspectorEvent | null>(null);
  const [isFollowing, setIsFollowing] = React.useState(true);

  const incomingEventsRef = React.useRef<InspectorEvent[]>([]);
  // Seqs are monotonic and SSE delivery is ordered (including replay), so a
  // high-water mark is enough to dedupe reconnect replays.
  const lastSeenSeqRef = React.useRef(0);
  const isPausedRef = React.useRef(false);
  const timelineRef = React.useRef<HTMLDivElement>(null);

  const flushIncomingEvents = React.useCallback(() => {
    if (isPausedRef.current || incomingEventsRef.current.length === 0) return;

    const incoming = incomingEventsRef.current;
    incomingEventsRef.current = [];
    setEvents((current) => [...current, ...incoming].slice(-MAX_EVENTS));
  }, []);

  React.useEffect(() => {
    const source = new EventSource(INSPECTOR_STREAM_PATH);
    const flushTimer = window.setInterval(
      flushIncomingEvents,
      FLUSH_INTERVAL_MS,
    );

    source.onopen = () => setIsConnected(true);
    source.onerror = () => setIsConnected(false);
    source.onmessage = (message) => {
      try {
        const parsedJson: unknown = JSON.parse(message.data);
        const event = parseInspectorEvent(parsedJson);
        if (!event || event.seq <= lastSeenSeqRef.current) return;

        lastSeenSeqRef.current = event.seq;
        incomingEventsRef.current.push(event);
        if (incomingEventsRef.current.length > MAX_EVENTS) {
          incomingEventsRef.current.shift();
        }
      } catch {
        // Malformed frames are ignored; the shared parser validates all fields.
      }
    };

    return () => {
      source.close();
      window.clearInterval(flushTimer);
    };
  }, [flushIncomingEvents]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedEvent(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // App instances observed in the stream, in first-seen order so the friendly
  // "App N" labels stay stable while events keep arriving.
  const appClients = React.useMemo((): AppClient[] => {
    const counts = new Map<string, number>();
    for (const event of events) {
      const id = event.client ?? "unknown";
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, eventCount], index) => ({
      id,
      label: `App ${index + 1}`,
      eventCount,
    }));
  }, [events]);

  const clientLabelById = React.useMemo(() => {
    const labels = new Map<string, string>();
    for (const appClient of appClients) {
      labels.set(appClient.id, appClient.label);
    }
    return labels;
  }, [appClients]);

  // If the selected app's events were cleared away, fall back to all apps so
  // the select never holds a value that is no longer offered.
  React.useEffect(() => {
    if (clientFilter !== "all" && !clientLabelById.has(clientFilter)) {
      setClientFilter("all");
    }
  }, [clientFilter, clientLabelById]);

  const matchingEvents = React.useMemo(() => {
    const query = textFilter.trim().toLocaleLowerCase();
    return events.filter((event) => {
      if (!channels[event.channel]) return false;
      if (direction !== "all" && event.direction !== direction) return false;
      if (
        clientFilter !== "all" &&
        (event.client ?? "unknown") !== clientFilter
      )
        return false;
      if (!query) return true;

      return `${event.type}\n${event.summary}\n${dataSearchText(event)}`
        .toLocaleLowerCase()
        .includes(query);
    });
  }, [channels, clientFilter, direction, events, textFilter]);

  const hiddenEventCount = Math.max(
    0,
    matchingEvents.length - MAX_RENDERED_EVENTS,
  );
  const renderedEvents = React.useMemo(
    () => matchingEvents.slice(-MAX_RENDERED_EVENTS),
    [matchingEvents],
  );

  React.useLayoutEffect(() => {
    if (!isFollowing) return;
    const timeline = timelineRef.current;
    if (timeline) timeline.scrollTop = timeline.scrollHeight;
  }, [isFollowing, renderedEvents]);

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
    if (!nextPaused) flushIncomingEvents();
  }, [flushIncomingEvents, isPaused]);

  const handleChannelToggle = React.useCallback((channel: InspectorChannel) => {
    setChannels((current) => ({
      ...current,
      [channel]: !current[channel],
    }));
  }, []);

  const handleClear = React.useCallback(async () => {
    setIsClearing(true);
    try {
      await fetch(INSPECTOR_CLEAR_PATH, { method: "POST" });
    } catch {
      // The local view can still be cleared while the collector reconnects.
    } finally {
      incomingEventsRef.current = [];
      setEvents([]);
      setSelectedEvent(null);
      setIsClearing(false);
    }
  }, []);

  return (
    <main className="inspector-app">
      <header className="top-bar">
        <div className="brand-block">
          <h1>Linky Inspector</h1>
          <span
            aria-label={isConnected ? "Connected" : "Reconnecting"}
            className={`connection-dot ${isConnected ? "connected" : "reconnecting"}`}
            title={isConnected ? "Connected" : "Reconnecting"}
          />
          <span className="connection-label">
            {isConnected ? "connected" : "reconnecting"}
          </span>
        </div>
        <div className="top-actions">
          <span className="event-count">
            {renderedEvents.length.toLocaleString()} shown /{" "}
            {events.length.toLocaleString()} total
          </span>
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
        </div>
      </header>

      <section aria-label="Event filters" className="filter-bar">
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
                  {appClient.label} · {appClient.id} ({appClient.eventCount})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="channel-filters">
          {CHANNELS.map((channel) => (
            <button
              aria-pressed={channels[channel]}
              className={`filter-chip channel-${channel}${channels[channel] ? " enabled" : ""}`}
              key={channel}
              onClick={() => handleChannelToggle(channel)}
              type="button"
            >
              {channel}
            </button>
          ))}
        </div>

        <label className="direction-filter">
          <span>Direction</span>
          <select
            onChange={(event) =>
              setDirection(parseDirectionFilter(event.target.value))
            }
            value={direction}
          >
            <option value="all">all</option>
            <option value="in">in</option>
            <option value="out">out</option>
          </select>
        </label>

        <label className="text-filter">
          <span className="visually-hidden">Filter events</span>
          <input
            onChange={(event) => setTextFilter(event.target.value)}
            placeholder="Filter type, summary, or data…"
            type="search"
            value={textFilter}
          />
        </label>
      </section>

      <div className={`workspace${selectedEvent ? " has-detail" : ""}`}>
        <section className="timeline-panel">
          <div
            aria-label="Inspector event timeline"
            className={`timeline${appClients.length > 1 ? " multi-app" : ""}`}
            onScroll={handleTimelineScroll}
            ref={timelineRef}
          >
            {hiddenEventCount > 0 && (
              <p className="hidden-events-notice">
                …{hiddenEventCount.toLocaleString()} older events hidden
              </p>
            )}
            {renderedEvents.length === 0 ? (
              <div className="empty-state">
                {events.length === 0
                  ? "Waiting for inspector events…"
                  : "No events match the current filters."}
              </div>
            ) : (
              renderedEvents.map((event) => (
                <TimelineRow
                  clientLabel={
                    appClients.length > 1
                      ? (clientLabelById.get(event.client ?? "unknown") ?? null)
                      : null
                  }
                  event={event}
                  isSelected={selectedEvent?.seq === event.seq}
                  key={event.seq}
                  onSelect={setSelectedEvent}
                />
              ))
            )}
          </div>
          {!isFollowing && renderedEvents.length > 0 && (
            <button
              className="follow-button"
              onClick={handleFollow}
              type="button"
            >
              Follow ↓
            </button>
          )}
        </section>

        {selectedEvent && (
          <DetailPane
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </div>
    </main>
  );
}
