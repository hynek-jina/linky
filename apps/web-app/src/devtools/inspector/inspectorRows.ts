// Shared contract between the reporter (app side), the Vite collector
// middleware (server/inspectorCollector.ts), and the standalone inspector page
// (/inspector.html). Keep this file free of browser and Vite globals: it is
// imported from both the app bundle and the Vite node config.

export const INSPECTOR_REPORT_PATH = "/__inspector/report";
export const INSPECTOR_EVENTS_PATH = "/__inspector/events";
export const INSPECTOR_STREAM_PATH = "/__inspector/stream";
export const INSPECTOR_CLEAR_PATH = "/__inspector/clear";

/** Linky-level operation vs raw nostr traffic. */
export type InspectorChannel = "operation" | "wire";

/**
 * Correlation ids shared between an operation and the wire events it produced
 * (or was produced from). Rows sharing any id belong to the same story.
 */
export interface InspectorRowLinks {
  /** Nostr event ids of gift wraps involved. */
  wrapIds?: string[];
  /** Inner rumor id (e.g. a reaction id). */
  rumorId?: string;
  /** Optimistic-update correlation id. */
  clientId?: string;
  /** Relay url, when relay-specific. */
  relay?: string;
}

export interface InspectorRow {
  /** Wall-clock ms, stamped by the reporting app. */
  at: number;
  channel: InspectorChannel;
  /** Event type, e.g. "reactions.react", "WirePublished", "InboxRouted". */
  tag: string;
  /** One-line human description, prebuilt by the reporter. */
  summary: string;
  links: InspectorRowLinks;
  /** Full serialized event, shown in the detail pane. */
  payload: unknown;
}

export interface CollectedInspectorRow extends InspectorRow {
  /** Monotonic id assigned by the collector, unique per dev-server run. */
  id: number;
  /** Per-tab app instance id of the reporting tab. */
  client: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const isInspectorChannel = (
  value: unknown,
): value is InspectorChannel => {
  return value === "operation" || value === "wire";
};

const readStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((entry) => typeof entry === "string");
  return strings.length > 0 ? strings : null;
};

const parseInspectorRowLinks = (value: unknown): InspectorRowLinks => {
  if (!isRecord(value)) return {};
  const links: InspectorRowLinks = {};
  const wrapIds = readStringArray(value.wrapIds);
  if (wrapIds) links.wrapIds = wrapIds;
  if (typeof value.rumorId === "string" && value.rumorId) {
    links.rumorId = value.rumorId;
  }
  if (typeof value.clientId === "string" && value.clientId) {
    links.clientId = value.clientId;
  }
  if (typeof value.relay === "string" && value.relay) {
    links.relay = value.relay;
  }
  return links;
};

export const parseInspectorRow = (value: unknown): InspectorRow | null => {
  if (!isRecord(value)) return null;
  const { at, channel, tag, summary, links, payload } = value;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  if (!isInspectorChannel(channel)) return null;
  if (typeof tag !== "string" || !tag) return null;
  if (typeof summary !== "string") return null;
  return {
    at,
    channel,
    tag,
    summary,
    links: parseInspectorRowLinks(links),
    payload,
  };
};

export const parseCollectedInspectorRow = (
  value: unknown,
): CollectedInspectorRow | null => {
  if (!isRecord(value)) return null;
  const { id, client } = value;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  if (typeof client !== "string") return null;
  const row = parseInspectorRow(value);
  if (!row) return null;
  return { ...row, id, client };
};

/**
 * Ids that correlate rows with each other. The relay url is deliberately not
 * one: it is location metadata and would link most wire rows to each other.
 */
export const inspectorLinkIds = (links: InspectorRowLinks): string[] => {
  const ids = links.wrapIds ? [...links.wrapIds] : [];
  if (links.rumorId) ids.push(links.rumorId);
  if (links.clientId) ids.push(links.clientId);
  return ids;
};
