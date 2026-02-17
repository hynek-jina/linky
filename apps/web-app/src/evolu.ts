import * as Evolu from "@evolu/common";
import { createEvolu, SimpleName } from "@evolu/common";
import { createUseEvolu, EvoluProvider } from "@evolu/react";
import { evoluReactWebDeps } from "@evolu/react-web";
import { useCallback, useEffect, useMemo, useState } from "react";
import { INITIAL_MNEMONIC_STORAGE_KEY } from "./mnemonic";
import type { JsonValue } from "./types/json";
import {
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
} from "./utils/storage";

const isEvoluLoggingEnabled = (): boolean => {
  if (!import.meta.env.DEV) return false;

  // Enable only when explicitly requested, because SQL logging is very noisy.
  // Toggle in devtools: localStorage.setItem('linky_debug_evolu_sql', '1')
  try {
    return localStorage.getItem("linky_debug_evolu_sql") === "1";
  } catch {
    return false;
  }
};

export const EVOLU_SERVERS_STORAGE_KEY = "linky.evoluServers.v1";

// Backwards-compatible flag that allows removing the built-in default servers.
// Without this, we can only store "extras" and the defaults would always be re-added.
export const EVOLU_SERVERS_DEFAULT_REMOVED_STORAGE_KEY =
  "linky.evoluServers.defaultRemoved.v1";

export const EVOLU_SERVERS_DISABLED_STORAGE_KEY =
  "linky.evoluServers.disabled.v1";

export type EvoluServerStatus = "checking" | "connected" | "disconnected";

export type EvoluDatabaseInfo = {
  bytes: number | null;
  tableCounts: Record<string, number | null>;
  historyCount: number | null;
  updatedAtMs: number | null;
};

export const DEFAULT_EVOLU_SERVER_URLS: ReadonlyArray<string> = [
  "wss://free.evoluhq.com",
];

// Generate a valid SimpleName (1-42 chars, alphanumeric + dash) from mnemonic
// Each user gets their own SQLite database file
const generateDbNameFromMnemonic = (mnemonic: string): string => {
  // Simple hash function to create a short unique identifier
  let hash = 0;
  for (let i = 0; i < mnemonic.length; i++) {
    const char = mnemonic.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to positive hex string, take first 8 chars for brevity
  const hashHex = Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8);
  return `linky-${hashHex}`;
};

type Stringifiable =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | { toString(): string }
  | null
  | undefined;

type EvoluServerUrlInput = Stringifiable;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
};

const toJsonValue = (value: unknown): JsonValue => {
  if (isJsonValue(value)) return value;
  if (value === undefined) return null;
  return String(value);
};

type EvoluQueryRow = Record<string, unknown>;

const readCount = (rows: ReadonlyArray<EvoluQueryRow>): number => {
  const first = rows[0];
  if (!first) return 0;
  return Number(first.count ?? 0);
};

const toByteArray = (value: unknown): number[] => {
  if (value instanceof Uint8Array) return Array.from(value);
  if (!isRecord(value)) return [];
  const entries = Object.values(value);
  if (entries.some((entry) => typeof entry !== "number")) return [];
  const out: number[] = [];
  for (const entry of entries) {
    if (typeof entry === "number") out.push(entry);
  }
  return out;
};

const toJsonRows = (
  rows: ReadonlyArray<EvoluQueryRow>,
): Record<string, JsonValue>[] =>
  rows.flatMap((row) => {
    const normalized: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = toJsonValue(value);
    }
    return [normalized];
  });

interface EvoluSelectBuilder {
  select(cb: (eb: EvoluExpressionBuilder) => unknown): EvoluSelectBuilder;
  selectAll(): EvoluSelectBuilder;
  orderBy(column: string, direction: string): EvoluSelectBuilder;
  limit(n: number): EvoluSelectBuilder;
  offset(n: number): EvoluSelectBuilder;
}

interface EvoluExpressionBuilder {
  fn: { countAll(): { as(name: string): unknown } };
}

interface EvoluQueryBuilder {
  selectFrom(table: string): EvoluSelectBuilder;
}

const createUntypedQuery = (
  instance: EvoluInstance,
  cb: (db: EvoluQueryBuilder) => EvoluSelectBuilder,
): unknown => {
  const fn = Reflect.get(Object(instance), "createQuery");
  if (typeof fn !== "function") return null;
  return fn.call(instance, cb);
};

const loadUntypedQueryRows = async (
  instance: EvoluInstance,
  query: unknown,
): Promise<ReadonlyArray<EvoluQueryRow>> => {
  const fn = Reflect.get(Object(instance), "loadQuery");
  if (typeof fn !== "function") return [];
  try {
    const rows = await fn.call(instance, query);
    if (!Array.isArray(rows)) return [];
    const result: EvoluQueryRow[] = [];
    for (const row of rows) {
      if (isRecord(row)) result.push(row);
    }
    return result;
  } catch {
    return [];
  }
};

export const normalizeEvoluServerUrl = (
  value: EvoluServerUrlInput,
): string | null => {
  const raw = String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "wss:" && u.protocol !== "ws:") return null;
    const pathname = u.pathname.replace(/\/+$/, "");
    // Preserve pathname (some servers may be hosted under a path), but drop
    // search/hash for stable identity.
    return `${u.origin}${pathname === "/" ? "" : pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
};

const normalizeUrlList = (
  urls: ReadonlyArray<EvoluServerUrlInput>,
): ReadonlyArray<string> => {
  const combined = urls
    .map(normalizeEvoluServerUrl)
    .filter((v): v is string => Boolean(v));

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const url of combined) {
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(url);
  }

  return unique;
};

export const getEvoluDisabledServerUrls = (): ReadonlyArray<string> => {
  const stored = safeLocalStorageGetJson<ReadonlyArray<EvoluServerUrlInput>>(
    EVOLU_SERVERS_DISABLED_STORAGE_KEY,
    [],
  );
  return normalizeUrlList(stored);
};

export const isEvoluServerDisabled = (url: string): boolean => {
  const normalized = normalizeEvoluServerUrl(url);
  if (!normalized) return false;
  const disabled = getEvoluDisabledServerUrls();
  return disabled.some((u) => u.toLowerCase() === normalized.toLowerCase());
};

export const setEvoluServerDisabled = (
  url: string,
  disabled: boolean,
): void => {
  const normalized = normalizeEvoluServerUrl(url);
  if (!normalized) return;
  const current = [...getEvoluDisabledServerUrls()];
  const lower = normalized.toLowerCase();
  const next = disabled
    ? normalizeUrlList([...current, normalized])
    : normalizeUrlList(current.filter((u) => u.toLowerCase() !== lower));
  safeLocalStorageSetJson(EVOLU_SERVERS_DISABLED_STORAGE_KEY, next);
};

export const toggleEvoluServerDisabled = (url: string): boolean => {
  const next = !isEvoluServerDisabled(url);
  setEvoluServerDisabled(url, next);
  return next;
};

export const getEvoluConfiguredServerUrls = (): ReadonlyArray<string> => {
  const stored = safeLocalStorageGetJson<ReadonlyArray<EvoluServerUrlInput>>(
    EVOLU_SERVERS_STORAGE_KEY,
    [],
  );

  const defaultRemoved = Boolean(
    safeLocalStorageGetJson<boolean>(
      EVOLU_SERVERS_DEFAULT_REMOVED_STORAGE_KEY,
      false,
    ),
  );

  const combined = [
    ...(defaultRemoved ? [] : DEFAULT_EVOLU_SERVER_URLS),
    ...stored,
  ];

  const unique = normalizeUrlList(combined);

  // If everything is removed, return empty list (= local-only instance).
  return unique;
};

export const getEvoluServerUrls = (): ReadonlyArray<string> => {
  // Back-compat alias: historically used as "the server list".
  // Now returns configured (including disabled) so UIs can display everything.
  return getEvoluConfiguredServerUrls();
};

export const getEvoluActiveServerUrls = (): ReadonlyArray<string> => {
  const configured = getEvoluConfiguredServerUrls();
  const disabled = getEvoluDisabledServerUrls();
  const disabledLower = new Set(disabled.map((u) => u.toLowerCase()));
  return configured.filter((u) => !disabledLower.has(u.toLowerCase()));
};

export const setEvoluServerUrls = (urls: ReadonlyArray<string>): void => {
  const normalized = urls
    .map(normalizeEvoluServerUrl)
    .filter((v): v is string => Boolean(v));

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const url of normalized) {
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(url);
  }

  // Persist whether defaults are removed, and persist only non-default extras.
  const defaultsLower = new Set(
    DEFAULT_EVOLU_SERVER_URLS.map((u) => u.toLowerCase()),
  );
  const hasAnyDefault = unique.some((u) => defaultsLower.has(u.toLowerCase()));
  safeLocalStorageSetJson(
    EVOLU_SERVERS_DEFAULT_REMOVED_STORAGE_KEY,
    !hasAnyDefault,
  );

  const extras = unique.filter((u) => !defaultsLower.has(u.toLowerCase()));
  safeLocalStorageSetJson(EVOLU_SERVERS_STORAGE_KEY, extras);
};

export const EVOLU_SERVER_URLS: ReadonlyArray<string> =
  getEvoluActiveServerUrls();

export const buildEvoluTransports = (
  urls: ReadonlyArray<string>,
): ReadonlyArray<{ type: "WebSocket"; url: string }> =>
  urls.map((url) => ({ type: "WebSocket", url }));

export const EVOLU_TRANSPORTS: ReadonlyArray<{
  type: "WebSocket";
  url: string;
}> = buildEvoluTransports(EVOLU_SERVER_URLS);

export const probeWebSocketConnection = (
  url: string,
  timeoutMs = 2500,
): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    let ws: WebSocket | null = null;
    let done = false;

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try {
        ws?.close();
      } catch {
        // ignore
      }
      resolve(ok);
    };

    try {
      ws = new WebSocket(url);
    } catch {
      finish(false);
      return;
    }

    const timer = window.setTimeout(() => finish(false), timeoutMs);

    ws.addEventListener("open", () => {
      window.clearTimeout(timer);
      finish(true);
    });

    ws.addEventListener("error", () => {
      window.clearTimeout(timer);
      finish(false);
    });

    ws.addEventListener("close", () => {
      window.clearTimeout(timer);
      finish(false);
    });
  });
};

// Primary key pro Contact tabulku
const ContactId = Evolu.id("Contact");
export type ContactId = typeof ContactId.Type;

// Primary key pro CashuToken tabulku
const CashuTokenId = Evolu.id("CashuToken");
export type CashuTokenId = typeof CashuTokenId.Type;

// Primary key pro CredoToken tabulku
const CredoTokenId = Evolu.id("CredoToken");
export type CredoTokenId = typeof CredoTokenId.Type;

// Primary key pro NostrIdentity tabulku
const NostrIdentityId = Evolu.id("NostrIdentity");
export type NostrIdentityId = typeof NostrIdentityId.Type;

// Primary key pro NostrMessage tabulku
const NostrMessageId = Evolu.id("NostrMessage");
export type NostrMessageId = typeof NostrMessageId.Type;

// Primary key pro NostrReaction tabulku
const NostrReactionId = Evolu.id("NostrReaction");
export type NostrReactionId = typeof NostrReactionId.Type;

// Primary key pro PaymentEvent tabulku
const PaymentEventId = Evolu.id("PaymentEvent");
export type PaymentEventId = typeof PaymentEventId.Type;

// Primary key pro AppState tabulku (snapshoty nastavení/progresu)
const AppStateId = Evolu.id("AppState");
export type AppStateId = typeof AppStateId.Type;

// Primary key pro MintInfo tabulku (metadata o mintech)
const MintId = Evolu.id("Mint");
export type MintId = typeof MintId.Type;

// Primary key pro OwnerMeta tabulku (metadata pro owner lane routing)
const OwnerMetaId = Evolu.id("OwnerMeta");
export type OwnerMetaId = typeof OwnerMetaId.Type;

// Schema pro Linky app
export const Schema = {
  contact: {
    id: ContactId,
    name: Evolu.nullOr(Evolu.NonEmptyString1000),
    npub: Evolu.nullOr(Evolu.NonEmptyString1000),
    lnAddress: Evolu.nullOr(Evolu.NonEmptyString1000),
    groupName: Evolu.nullOr(Evolu.NonEmptyString1000),
  },
  nostrIdentity: {
    id: NostrIdentityId,
    // Bech32 NIP-19 secret key, must start with "nsec".
    nsec: Evolu.NonEmptyString1000,
  },
  nostrMessage: {
    id: NostrMessageId,
    contactId: ContactId,
    // "in" | "out"
    direction: Evolu.NonEmptyString100,
    // Decrypted plaintext message.
    content: Evolu.NonEmptyString,
    // Gift-wrapped event id (kind 1059) used for de-duplication.
    wrapId: Evolu.NonEmptyString1000,
    // Inner (rumor) event id (kind 14, unsigned) if available.
    rumorId: Evolu.nullOr(Evolu.NonEmptyString1000),
    // Sender pubkey hex (64 chars) of the inner message.
    // Can be null for local-only queued placeholders.
    pubkey: Evolu.nullOr(Evolu.NonEmptyString1000),
    // created_at (seconds) from the inner event when available.
    createdAtSec: Evolu.PositiveInt,
    // Client-generated id for optimistic send/ack matching.
    clientId: Evolu.nullOr(Evolu.NonEmptyString1000),
    // "sent" | "pending"
    status: Evolu.nullOr(Evolu.NonEmptyString100),
    // "1" for local-only placeholders.
    localOnly: Evolu.nullOr(Evolu.NonEmptyString100),
    // Reply metadata (NIP-10).
    replyToId: Evolu.nullOr(Evolu.NonEmptyString1000),
    replyToContent: Evolu.nullOr(Evolu.NonEmptyString),
    rootMessageId: Evolu.nullOr(Evolu.NonEmptyString1000),
    // Edit metadata.
    editedAtSec: Evolu.nullOr(Evolu.PositiveInt),
    editedFromId: Evolu.nullOr(Evolu.NonEmptyString1000),
    // "1" if the message content was edited.
    isEdited: Evolu.nullOr(Evolu.NonEmptyString100),
    // First known message content before edits.
    originalContent: Evolu.nullOr(Evolu.NonEmptyString),
  },
  nostrReaction: {
    id: NostrReactionId,
    // Target message rumor id.
    messageId: Evolu.NonEmptyString1000,
    reactorPubkey: Evolu.NonEmptyString1000,
    emoji: Evolu.NonEmptyString100,
    createdAtSec: Evolu.PositiveInt,
    // Gift-wrapped event id carrying the reaction or delete.
    wrapId: Evolu.NonEmptyString1000,
    // Client-generated id for optimistic send/ack matching.
    clientId: Evolu.nullOr(Evolu.NonEmptyString1000),
    // "sent" | "pending"
    status: Evolu.nullOr(Evolu.NonEmptyString100),
  },
  cashuToken: {
    id: CashuTokenId,
    // Most recent (accepted) token.
    token: Evolu.NonEmptyString,
    // Original pasted token (useful for debugging/re-accept).
    rawToken: Evolu.nullOr(Evolu.NonEmptyString),
    // Stored only if token references exactly one mint.
    mint: Evolu.nullOr(Evolu.NonEmptyString1000),
    unit: Evolu.nullOr(Evolu.NonEmptyString100),
    // Stored total amount (usually in sats) when known.
    amount: Evolu.nullOr(Evolu.PositiveInt),
    // "pending" | "accepted" | "error"
    state: Evolu.nullOr(Evolu.NonEmptyString100),
    error: Evolu.nullOr(Evolu.NonEmptyString1000),
  },

  credoToken: {
    id: CredoTokenId,
    promiseId: Evolu.NonEmptyString1000,
    issuer: Evolu.NonEmptyString1000,
    recipient: Evolu.NonEmptyString1000,
    amount: Evolu.PositiveInt,
    unit: Evolu.NonEmptyString100,
    createdAtSec: Evolu.PositiveInt,
    expiresAtSec: Evolu.PositiveInt,
    settledAmount: Evolu.nullOr(Evolu.PositiveInt),
    settledAtSec: Evolu.nullOr(Evolu.PositiveInt),
    // "in" | "out"
    direction: Evolu.NonEmptyString100,
    contactId: Evolu.nullOr(ContactId),
    // Raw credo token message (wire format)
    rawToken: Evolu.nullOr(Evolu.NonEmptyString1000),
  },

  paymentEvent: {
    id: PaymentEventId,
    // Seconds since epoch.
    createdAtSec: Evolu.PositiveInt,
    // "in" | "out"
    direction: Evolu.NonEmptyString100,
    // Amount in sats (or unit's base), when known.
    amount: Evolu.nullOr(Evolu.PositiveInt),
    // Fee reserve / fee paid, when known.
    fee: Evolu.nullOr(Evolu.PositiveInt),
    // Mint URL when known.
    mint: Evolu.nullOr(Evolu.NonEmptyString1000),
    unit: Evolu.nullOr(Evolu.NonEmptyString100),
    // "ok" | "error"
    status: Evolu.NonEmptyString100,
    error: Evolu.nullOr(Evolu.NonEmptyString1000),
    // Optional: link to a contact (e.g., pay-to-contact).
    contactId: Evolu.nullOr(ContactId),
  },

  appState: {
    id: AppStateId,
    // "1" when dismissed.
    contactsOnboardingDismissed: Evolu.nullOr(Evolu.NonEmptyString100),
    // "1" when the user has successfully paid at least once.
    contactsOnboardingHasPaid: Evolu.nullOr(Evolu.NonEmptyString100),
    // Active guide task key (e.g., "add_contact" | "topup" | "pay" | "message").
    contactsGuideTask: Evolu.nullOr(Evolu.NonEmptyString100),
    // Persisted as (stepIndex + 1) so it fits PositiveInt.
    contactsGuideStepPlusOne: Evolu.nullOr(Evolu.PositiveInt),
    // Optional: which contact the guide is bound to.
    contactsGuideTargetContactId: Evolu.nullOr(ContactId),
  },

  mintInfo: {
    // We use mint URL as a stable id (so one row per mint).
    id: MintId,
    url: Evolu.NonEmptyString1000,
    firstSeenAtSec: Evolu.PositiveInt,
    lastSeenAtSec: Evolu.PositiveInt,
    // "1" when mint claims MPP support (NUT-15). Null/"0" means unknown/false.
    supportsMpp: Evolu.nullOr(Evolu.NonEmptyString100),
    // JSON blobs (best-effort, may be truncated).
    feesJson: Evolu.nullOr(Evolu.NonEmptyString1000),
    infoJson: Evolu.nullOr(Evolu.NonEmptyString1000),
    lastCheckedAtSec: Evolu.nullOr(Evolu.PositiveInt),
  },

  ownerMeta: {
    id: OwnerMetaId,
    scope: Evolu.NonEmptyString100,
    value: Evolu.NonEmptyString1000,
  },
};

// Create Evolu instance for a specific user (mnemonic)
// Each user gets their own SQLite database file based on their mnemonic
export const createEvoluForUser = (mnemonic: string | null) => {
  const dbName = mnemonic ? generateDbNameFromMnemonic(mnemonic) : "linky-anon";

  const validatedName = SimpleName.from(dbName);
  // Fallback to a safe name if generation fails
  const finalName = validatedName.ok
    ? validatedName.value
    : SimpleName.orThrow("linky-default");

  const externalAppOwner = (() => {
    if (!mnemonic) return null;
    const mnemonicResult = Evolu.Mnemonic.fromUnknown(mnemonic);
    if (!mnemonicResult.ok) return null;
    const ownerSecret = Evolu.mnemonicToOwnerSecret(mnemonicResult.value);
    return Evolu.createAppOwner(ownerSecret);
  })();

  return createEvolu(evoluReactWebDeps)(Schema, {
    name: finalName,
    transports: EVOLU_TRANSPORTS,
    enableLogging: isEvoluLoggingEnabled(),
    ...(externalAppOwner ? { externalAppOwner } : {}),
  });
};

// Type for the Evolu instance
type EvoluInstance = ReturnType<typeof createEvoluForUser>;

// Global evolu instance - will be set when user is determined
let globalEvoluInstance: EvoluInstance | null = null;

// Initialize or get the Evolu instance for current user
export const getEvolu = (mnemonic?: string | null): EvoluInstance => {
  if (mnemonic !== undefined) {
    // Create new instance for this specific mnemonic
    globalEvoluInstance = createEvoluForUser(mnemonic);
  }

  if (!globalEvoluInstance) {
    // Try to get mnemonic from storage on first call
    const storedMnemonic = (() => {
      if (typeof localStorage === "undefined") return null;
      try {
        return localStorage.getItem(INITIAL_MNEMONIC_STORAGE_KEY);
      } catch {
        return null;
      }
    })();
    globalEvoluInstance = createEvoluForUser(storedMnemonic);
  }

  return globalEvoluInstance;
};

// Legacy export for backward compatibility - gets the current global instance
export const evolu = getEvolu();

export const useEvoluSyncOwner = (enabled: boolean): Evolu.SyncOwner | null => {
  const [syncOwner, setSyncOwner] = useState<Evolu.SyncOwner | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    void getEvolu()
      .appOwner.then((owner) => {
        if (cancelled) return;
        setSyncOwner(owner);
      })
      .catch(() => {
        if (cancelled) return;
        setSyncOwner(null);
      });

    return () => {
      cancelled = true;
      setSyncOwner(null);
    };
  }, [enabled]);

  return enabled ? syncOwner : null;
};

type EvoluLastError = Error | string | null;

const toEvoluLastError = (value: unknown): EvoluLastError => {
  if (value === null || value === undefined) return null;
  if (value instanceof Error) return value;
  return String(value);
};

export const useEvoluLastError = (opts?: {
  logToConsole?: boolean;
}): EvoluLastError => {
  const logToConsole = opts?.logToConsole ?? false;
  const [lastError, setLastError] = useState<EvoluLastError>(null);

  useEffect(() => {
    const instance = getEvolu();
    const unsub = instance.subscribeError(() => {
      const err = toEvoluLastError(instance.getError());
      setLastError(err);
      if (logToConsole && err) console.log("[linky][evolu] error", err);
    });

    return () => {
      try {
        unsub();
      } catch {
        // ignore
      }
    };
  }, [logToConsole]);

  return lastError;
};

export const getEvoluDatabaseInfo = async (): Promise<{
  bytes: number;
  tableCounts: Record<string, number | null>;
  historyCount: number | null;
}> => {
  const tables = [
    "contact",
    "cashuToken",
    "credoToken",
    "nostrIdentity",
    "nostrMessage",
    "nostrReaction",
    "paymentEvent",
    "appState",
    "mintInfo",
    "ownerMeta",
  ] as const;

  const instance = getEvolu();

  // Get SQLite file size from OPFS for current user only
  const dbBytesPromise = (async () => {
    try {
      const root = await navigator.storage?.getDirectory?.();
      if (!root) return 0;

      // Get current user's mnemonic
      const mnemonic = (() => {
        try {
          return localStorage.getItem(INITIAL_MNEMONIC_STORAGE_KEY);
        } catch {
          return null;
        }
      })();

      // Generate expected directory name
      const expectedDir = mnemonic
        ? (() => {
            let hash = 0;
            for (let i = 0; i < mnemonic.length; i++) {
              hash = ((hash << 5) - hash + mnemonic.charCodeAt(i)) | 0;
            }
            return `.linky-${Math.abs(hash).toString(16).padStart(8, "0").slice(0, 8)}`;
          })()
        : ".linky-anon";

      let totalSize = 0;
      const allDirs: string[] = [];
      // @ts-expect-error OPFS FileSystemDirectoryHandle.entries() not yet in all TS libs
      for await (const [name, handle] of root.entries()) {
        if (handle.kind === "directory") allDirs.push(name);
        if (name === expectedDir && handle.kind === "directory") {
          for await (const [sub, subH] of handle.entries()) {
            if (sub === ".opaque" && subH.kind === "directory") {
              let maxSize = 0;
              for await (const [, fileH] of subH.entries()) {
                if (fileH.kind === "file") {
                  const f = await fileH.getFile();
                  if (f.size > maxSize) maxSize = f.size;
                }
              }
              totalSize = maxSize; // Take only the largest file (main SQLite)
            }
          }
          break;
        }
      }
      return totalSize;
    } catch {
      return 0;
    }
  })();

  const tableCountsPromise = (async () => {
    const out: Record<string, number | null> = {};
    for (const table of tables) {
      try {
        const q = createUntypedQuery(instance, (db) =>
          db.selectFrom(table).select((eb) => eb.fn.countAll().as("count")),
        );
        const rows = await loadUntypedQueryRows(instance, q);
        out[table] = readCount(rows);
      } catch {
        out[table] = null;
      }
    }
    return out;
  })();

  // Count history entries (time travel mutations)
  const historyCountPromise = (async () => {
    try {
      const q = createUntypedQuery(instance, (db) =>
        db
          .selectFrom("evolu_history")
          .select((eb) => eb.fn.countAll().as("count")),
      );
      const rows = await loadUntypedQueryRows(instance, q);
      return readCount(rows);
    } catch {
      return null;
    }
  })();

  const [bytes, tableCounts, historyCount] = await Promise.all([
    dbBytesPromise,
    tableCountsPromise,
    historyCountPromise,
  ]);

  return { bytes, tableCounts, historyCount };
};

// Helper to convert Uint8Array to base64
const uint8ArrayToBase64 = (bytes: unknown): string => {
  const arr = toByteArray(bytes);
  if (arr.length === 0) return "";
  try {
    const binString = arr.map((x) => String.fromCharCode(x)).join("");
    return btoa(binString);
  } catch {
    return "";
  }
};

// Helper to convert timestamp bytes to readable date
// Evolu timestamp format: 16 bytes, hybrid logical clock (HLC)
// First 8 bytes: [millis (48 bits) + counter (16 bits)] in big-endian
// Reference: https://evolu.dev/docs/how-evolu-works
const timestampToDate = (timestampBytes: unknown): string => {
  const arr = toByteArray(timestampBytes);
  if (arr.length < 8) return "";
  try {
    // Convert bytes to milliseconds since epoch
    // First 6 bytes = 48-bit milliseconds timestamp (big-endian)
    let millis = 0;
    for (let i = 0; i < 6; i++) {
      millis = millis * 256 + arr[i];
    }
    const date = new Date(millis);
    if (isNaN(date.getTime())) return "Invalid timestamp";
    return date.toLocaleString("cs-CZ");
  } catch (err) {
    console.error("Timestamp conversion error:", err);
    return "Invalid timestamp";
  }
};

/** Row shape returned by loadEvoluHistoryData. */
export interface EvoluHistoryRow {
  table: string;
  column: string;
  id: string;
  value: JsonValue;
  timestamp: string;
  [key: string]: JsonValue;
}

// Load history data from evolu_history table with pagination support
export const loadEvoluHistoryData = async (
  limit = 100,
  offset = 0,
): Promise<EvoluHistoryRow[]> => {
  const instance = getEvolu();
  try {
    const q = createUntypedQuery(instance, (db) =>
      db
        .selectFrom("evolu_history")
        .selectAll()
        .orderBy("timestamp", "desc")
        .limit(limit)
        .offset(offset),
    );
    const rows = await loadUntypedQueryRows(instance, q);
    const rawRows = toJsonRows(rows);
    const formattedRows: EvoluHistoryRow[] = rawRows.map((row) => ({
      ...row,
      table: String(row.table ?? ""),
      column: String(row.column ?? ""),
      ownerId: uint8ArrayToBase64(row.ownerId),
      id: uint8ArrayToBase64(row.id),
      value: toJsonValue(row.value),
      timestamp: timestampToDate(row.timestamp),
    }));
    return formattedRows;
  } catch (err) {
    console.error("Failed to load evolu_history:", err);
    return [];
  }
};

// Load current data from all tables
export const loadEvoluCurrentData = async (): Promise<
  Record<string, Record<string, JsonValue>[]>
> => {
  const tables = [
    "contact",
    "cashuToken",
    "credoToken",
    "nostrIdentity",
    "nostrMessage",
    "nostrReaction",
    "paymentEvent",
    "appState",
    "mintInfo",
    "ownerMeta",
  ] as const;

  const instance = getEvolu();
  const result: Record<string, Record<string, JsonValue>[]> = {};

  for (const table of tables) {
    try {
      const q = createUntypedQuery(instance, (db) =>
        db.selectFrom(table).selectAll().limit(100),
      );
      const rows = await loadUntypedQueryRows(instance, q);
      result[table] = toJsonRows(rows);
    } catch {
      result[table] = [];
    }
  }

  return result;
};

export const wipeEvoluStorage = (): void => {
  const storedMnemonic = (() => {
    try {
      return localStorage.getItem(INITIAL_MNEMONIC_STORAGE_KEY);
    } catch {
      return null;
    }
  })();

  const mnemonicResult = Evolu.Mnemonic.fromUnknown(storedMnemonic);
  if (!mnemonicResult.ok) {
    throw new Error("Missing stored mnemonic");
  }

  // Clear any leftover internal snapshot from older builds.
  try {
    localStorage.removeItem("linky.evolu.compactionSnapshot.v1");
  } catch {
    // ignore
  }

  // Hard wipe Evolu local storage (journal + state) and reload.
  void getEvolu().restoreAppOwner(mnemonicResult.value, { reload: true });
};

export const useEvoluDatabaseInfoState = (opts?: {
  enabled?: boolean;
  onError?: (err: unknown) => void;
}) => {
  const enabled = opts?.enabled ?? true;
  const onError = opts?.onError;

  const [info, setInfo] = useState<EvoluDatabaseInfo>(() => ({
    bytes: null,
    tableCounts: {},
    historyCount: null,
    updatedAtMs: null,
  }));
  const [isBusy, setIsBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const next = await getEvoluDatabaseInfo();
      setInfo({
        bytes: next.bytes,
        tableCounts: next.tableCounts,
        historyCount: next.historyCount,
        updatedAtMs: Date.now(),
      });
    } catch (err) {
      onError?.(err);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, onError]);

  useEffect(() => {
    if (!enabled) return;
    if (info.bytes !== null) return;
    void refresh();
  }, [enabled, info.bytes, refresh]);

  return {
    info,
    isBusy,
    refresh,
  } as const;
};

export const useEvoluServersManager = (opts?: {
  probeIntervalMs?: number;
  probeTimeoutMs?: number;
}) => {
  const probeIntervalMs = opts?.probeIntervalMs ?? 15000;
  const probeTimeoutMs = opts?.probeTimeoutMs ?? 3500;

  const [configuredUrls, setConfiguredUrlsState] = useState<string[]>(() => [
    ...getEvoluConfiguredServerUrls(),
  ]);
  const [disabledUrls, setDisabledUrlsState] = useState<string[]>(() => [
    ...getEvoluDisabledServerUrls(),
  ]);
  const [statusByUrl, setStatusByUrl] = useState<
    Record<string, EvoluServerStatus>
  >(() => ({}));
  const [reloadRequired, setReloadRequired] = useState(false);

  const disabledLower = useMemo(() => {
    const s = new Set<string>();
    for (const u of disabledUrls) s.add(u.toLowerCase());
    return s;
  }, [disabledUrls]);

  const isOffline = useCallback(
    (url: string): boolean => disabledLower.has(url.toLowerCase()),
    [disabledLower],
  );

  const activeUrls = useMemo(
    () => configuredUrls.filter((u) => !isOffline(u)),
    [configuredUrls, isOffline],
  );

  const refreshFromStorage = useCallback(() => {
    setConfiguredUrlsState([...getEvoluConfiguredServerUrls()]);
    setDisabledUrlsState([...getEvoluDisabledServerUrls()]);
  }, []);

  const setServerUrls = useCallback(
    (nextUrls: string[]) => {
      setEvoluServerUrls(nextUrls);
      refreshFromStorage();
      setReloadRequired(true);
    },
    [refreshFromStorage],
  );

  const setServerOffline = useCallback(
    (url: string, offline: boolean) => {
      setEvoluServerDisabled(url, offline);
      refreshFromStorage();
      setReloadRequired(true);
    },
    [refreshFromStorage],
  );

  useEffect(() => {
    if (activeUrls.length === 0) return;
    let cancelled = false;

    const run = async () => {
      setStatusByUrl((prev) => {
        const next = { ...prev };
        for (const url of activeUrls) next[url] = "checking";
        return next;
      });

      const results = await Promise.all(
        activeUrls.map(async (url) => {
          const ok = await probeWebSocketConnection(url, probeTimeoutMs);
          return [url, ok] as const;
        }),
      );

      if (cancelled) return;
      setStatusByUrl((prev) => {
        const next = { ...prev };
        for (const [url, ok] of results)
          next[url] = ok ? "connected" : "disconnected";
        return next;
      });
    };

    void run();
    const intervalId = window.setInterval(run, probeIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeUrls, probeIntervalMs, probeTimeoutMs]);

  return {
    configuredUrls,
    disabledUrls,
    activeUrls,
    statusByUrl,
    reloadRequired,
    refreshFromStorage,
    setServerUrls,
    isOffline,
    setServerOffline,
  } as const;
};

// Export EvoluProvider pro použití v main.tsx
export { EvoluProvider };

// Vytvoř typovaný React Hook - now using getEvolu() to ensure we get the right instance
export const useEvolu = createUseEvolu(getEvolu());
