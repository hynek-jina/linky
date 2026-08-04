import type { JsonValue } from "../types/json";

// Shared contract between the in-app dev inspector bus, the Vite collector
// middleware (server/inspectorCollector.ts), and the standalone inspector page
// (/inspector.html). Keep this file free of browser and Vite globals: it is
// imported from both the app bundle and the Vite node config.

export const INSPECTOR_EVENTS_PATH = "/__inspector/events";
export const INSPECTOR_STREAM_PATH = "/__inspector/stream";
export const INSPECTOR_CLEAR_PATH = "/__inspector/clear";

export type InspectorChannel = "nostr" | "cashu" | "evolu";

export type InspectorDirection = "in" | "out";

export interface InspectorEventInput {
  /** ISO timestamp captured in the app when the event happened. */
  ts: string;
  channel: InspectorChannel;
  /** Machine-ish event kind, e.g. "publish", "event", "wallet.receive", "mutation.insert". */
  type: string;
  /** Omitted for meta events (subscription lifecycle, ticks). */
  direction?: InspectorDirection;
  /** One-line human-readable description shown in the timeline. */
  summary: string;
  data?: JsonValue;
}

export interface InspectorEvent extends InspectorEventInput {
  /** Monotonic id assigned by the collector, unique per dev-server run. */
  seq: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isInspectorChannel = (value: unknown): value is InspectorChannel => {
  return value === "nostr" || value === "cashu" || value === "evolu";
};

const isInspectorDirection = (value: unknown): value is InspectorDirection => {
  return value === "in" || value === "out";
};

export const parseInspectorEventInput = (
  value: unknown,
): InspectorEventInput | null => {
  if (!isRecord(value)) return null;
  const { ts, channel, type, direction, summary, data } = value;
  if (typeof ts !== "string" || !ts) return null;
  if (!isInspectorChannel(channel)) return null;
  if (typeof type !== "string" || !type) return null;
  if (typeof summary !== "string") return null;
  if (direction !== undefined && !isInspectorDirection(direction)) return null;
  return {
    ts,
    channel,
    type,
    summary,
    ...(direction === undefined ? {} : { direction }),
    // Data arrives as parsed JSON, so it is JSON-safe by construction.
    ...(data === undefined ? {} : { data: toJsonValueLenient(data) }),
  };
};

export const parseInspectorEvent = (value: unknown): InspectorEvent | null => {
  if (!isRecord(value)) return null;
  const seq = value.seq;
  if (typeof seq !== "number" || !Number.isFinite(seq)) return null;
  const input = parseInspectorEventInput(value);
  if (!input) return null;
  return { ...input, seq };
};

// Values coming from JSON.parse are already JSON values; this walk only exists
// to give them the JsonValue type without casting.
const toJsonValueLenient = (value: unknown): JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValueLenient(entry));
  }
  if (isRecord(value)) {
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      out[key] = toJsonValueLenient(entry);
    }
    return out;
  }
  return String(value);
};
