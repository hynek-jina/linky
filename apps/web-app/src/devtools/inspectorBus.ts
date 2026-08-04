import type { JsonRecord, JsonValue } from "../types/json";
import {
  INSPECTOR_EVENTS_PATH,
  type InspectorChannel,
  type InspectorDirection,
  type InspectorEventInput,
} from "./inspectorEvents";

// Client side of the dev inspector: taps around the Nostr pool, the Cashu
// wallet factory, and Evolu mutations call emitInspectorEvent(); this module
// batches the events and posts them to the Vite dev-server collector.
// Compiled out of production builds via the import.meta.env.DEV guard.

const FLUSH_DELAY_MS = 200;
const MAX_PENDING_EVENTS = 500;
const FAILURE_BACKOFF_MS = 5000;
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 100;
const MAX_DEPTH = 8;

let cachedEnabled: boolean | null = null;

export const isInspectorEnabled = (): boolean => {
  if (cachedEnabled !== null) return cachedEnabled;
  if (!import.meta.env.DEV) {
    cachedEnabled = false;
    return false;
  }
  // Opt-out escape hatch; requires reload because taps are installed once.
  try {
    cachedEnabled = localStorage.getItem("linky.inspector_disabled") !== "1";
  } catch {
    cachedEnabled = true;
  }
  return cachedEnabled;
};

const sanitizeValue = (value: unknown, depth: number): JsonValue => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "string") {
    if (value.length <= MAX_STRING_LENGTH) return value;
    return `${value.slice(0, MAX_STRING_LENGTH)}…(+${value.length - MAX_STRING_LENGTH} chars)`;
  }
  if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (depth >= MAX_DEPTH) return "…(max depth)";
  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => sanitizeValue(entry, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`…(+${value.length - MAX_ARRAY_LENGTH} more)`);
    }
    return items;
  }
  if (typeof value === "object") {
    const out: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) continue;
      out[key] = sanitizeValue(entry, depth + 1);
    }
    return out;
  }
  return String(value);
};

export const toInspectorJson = (value: unknown): JsonValue => {
  return sanitizeValue(value, 0);
};

export interface EmitInspectorEventArgs {
  channel: InspectorChannel;
  type: string;
  direction?: InspectorDirection;
  summary: string;
  data?: unknown;
}

const pendingEvents: InspectorEventInput[] = [];
let flushTimeoutId: ReturnType<typeof setTimeout> | null = null;
let backoffUntilMs = 0;
let droppedEventCount = 0;

const flushPendingEvents = (): void => {
  flushTimeoutId = null;
  if (pendingEvents.length === 0) return;
  if (Date.now() < backoffUntilMs) {
    scheduleFlush();
    return;
  }

  if (droppedEventCount > 0) {
    pendingEvents.unshift({
      ts: new Date().toISOString(),
      channel: "nostr",
      type: "inspector.dropped",
      summary: `inspector dropped ${droppedEventCount} event(s) under backpressure`,
    });
    droppedEventCount = 0;
  }

  const events = pendingEvents.splice(0);
  void fetch(INSPECTOR_EVENTS_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  }).catch(() => {
    // Collector unreachable (e.g. served without the dev middleware): back
    // off and drop this batch instead of buffering forever.
    backoffUntilMs = Date.now() + FAILURE_BACKOFF_MS;
  });
};

const scheduleFlush = (): void => {
  if (flushTimeoutId !== null) return;
  flushTimeoutId = setTimeout(flushPendingEvents, FLUSH_DELAY_MS);
};

export const emitInspectorEvent = (args: EmitInspectorEventArgs): void => {
  if (!isInspectorEnabled()) return;

  if (pendingEvents.length >= MAX_PENDING_EVENTS) {
    pendingEvents.shift();
    droppedEventCount += 1;
  }

  pendingEvents.push({
    ts: new Date().toISOString(),
    channel: args.channel,
    type: args.type,
    summary: args.summary,
    ...(args.direction === undefined ? {} : { direction: args.direction }),
    ...(args.data === undefined ? {} : { data: toInspectorJson(args.data) }),
  });
  scheduleFlush();
};
