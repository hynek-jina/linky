import { isRecord } from "./unknown";
import type { JsonRecord, JsonValue } from "../types/json";
import { sleep } from "./time";

const PUSH_DEBUG_CACHE_NAME = "linky-push-debug-v1";
const PUSH_DEBUG_LOG_URL = "/__debug__/push-log.json";
const PUSH_DEBUG_LOG_LIMIT = 100;
const PUSH_DEBUG_LOG_BATCH_DELAY_MS = 50;
const pendingPushDebugEntries: PushDebugLogEntry[] = [];
let pushDebugLogFlushPromise: Promise<void> | null = null;

export interface PushDebugLogEntry {
  details?: JsonValue;
  message: string;
  source: string;
  timestamp: string;
}

function normalizeJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack ?? null,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (isRecord(value)) {
    const out: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = normalizeJsonValue(entry);
    }
    return out;
  }

  return String(value);
}

async function readStoredLog(): Promise<PushDebugLogEntry[]> {
  const cache = await caches.open(PUSH_DEBUG_CACHE_NAME);
  const response = await cache.match(PUSH_DEBUG_LOG_URL);
  if (!response) {
    return [];
  }

  try {
    const json: unknown = await response.json();
    if (!Array.isArray(json)) {
      return [];
    }

    const entries: PushDebugLogEntry[] = [];
    for (const entry of json) {
      if (!isRecord(entry)) {
        continue;
      }
      const timestamp = entry.timestamp;
      const source = entry.source;
      const message = entry.message;
      const details = entry.details;
      if (
        typeof timestamp !== "string" ||
        typeof source !== "string" ||
        typeof message !== "string"
      ) {
        continue;
      }
      entries.push({
        timestamp,
        source,
        message,
        ...(details === undefined
          ? {}
          : { details: normalizeJsonValue(details) }),
      });
    }
    return entries;
  } catch {
    return [];
  }
}

async function writeStoredLog(entries: PushDebugLogEntry[]): Promise<void> {
  const cache = await caches.open(PUSH_DEBUG_CACHE_NAME);
  await cache.put(
    PUSH_DEBUG_LOG_URL,
    new Response(JSON.stringify(entries), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    }),
  );
}

function schedulePushDebugLogFlush(): Promise<void> {
  if (pushDebugLogFlushPromise) return pushDebugLogFlushPromise;

  pushDebugLogFlushPromise = sleep(PUSH_DEBUG_LOG_BATCH_DELAY_MS)
    .then(async () => {
      const nextEntries = pendingPushDebugEntries.splice(0);
      if (nextEntries.length === 0) return;

      try {
        const existing = await readStoredLog();
        await writeStoredLog(
          [...nextEntries.reverse(), ...existing].slice(
            0,
            PUSH_DEBUG_LOG_LIMIT,
          ),
        );
      } catch {
        // Ignore debug logging failures.
      }
    })
    .finally(() => {
      pushDebugLogFlushPromise = null;
      if (pendingPushDebugEntries.length > 0) {
        void schedulePushDebugLogFlush();
      }
    });

  return pushDebugLogFlushPromise;
}

export async function appendPushDebugLog(
  source: string,
  message: string,
  details?: unknown,
): Promise<void> {
  if (!("caches" in globalThis)) {
    return;
  }

  pendingPushDebugEntries.push({
    message,
    source,
    timestamp: new Date().toISOString(),
    ...(details === undefined ? {} : { details: normalizeJsonValue(details) }),
  });

  await schedulePushDebugLogFlush();
}

export async function readPushDebugLog(): Promise<PushDebugLogEntry[]> {
  if (!("caches" in globalThis)) {
    return [];
  }

  await pushDebugLogFlushPromise;
  return readStoredLog();
}

export async function clearPushDebugLog(): Promise<void> {
  if (!("caches" in globalThis)) {
    return;
  }

  try {
    pendingPushDebugEntries.length = 0;
    await pushDebugLogFlushPromise;
    const cache = await caches.open(PUSH_DEBUG_CACHE_NAME);
    await cache.delete(PUSH_DEBUG_LOG_URL);
  } catch {
    // Ignore debug logging failures.
  }
}
