/**
 * Owner-scoped, debounced, merge-on-flush store for `NotificationRecord`s.
 *
 * THIS MODULE IS THE ONLY WRITER OF `readAt`, `alertedAt` AND `dismissedAt`.
 * The "one writer per event class" rule is enforced here so it stays
 * grep-provable; no route, component or sync hook may mutate those fields.
 * `dismissedAt` NEVER implies `readAt` — clearing the shade is not reading.
 *
 * It is an external store rather than React context because the unread badge
 * must not remount when the shell re-renders, and `useSyncExternalStore`
 * compares snapshots with `Object.is`: `get()` therefore returns a STABLE array
 * reference until a mutation actually replaces it.
 *
 * It knows nothing about routes or about the alert decision. It receives plain
 * timestamps; the caller translates a decision outcome into `markAlerted` /
 * `markRead` calls.
 */
import {
  cancelAllNativeConversationNotifications,
  cancelNativeConversationNotification,
} from "../../platform/nativeBridge";
import {
  getLastLocalStorageFailure,
  getLocalStorageFailureCount,
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
  type LocalStorageFailure,
} from "../../utils/storage";
import React from "react";
import {
  applyNotificationRetention,
  countUnreadNotificationRecords,
  isNotificationRecord,
  isNotificationRecordEnvelope,
  mergeNotificationRecordsById,
  type NotificationRecord,
  type NotificationRecordEnvelope,
} from "./notificationRecord";

export const NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS = 250;

export interface NotificationRecordStore {
  /**
   * Bind to a fully-formed owner key (the caller composes it with
   * makeLocalStorageKey(LOCAL_NOTIFICATIONS_STORAGE_KEY_PREFIX)).
   * Flushes the PREVIOUS key first, then re-reads the new one.
   * `null` unbinds: flush, clear in-memory state, remove the flush listeners.
   */
  bindOwner: (storageKey: string | null) => void;
  /** Forces the debounced write immediately. Also called on pagehide / visibilitychange->hidden. */
  flushNow: () => void;
  /** Stable reference until a mutation replaces it — useSyncExternalStore compares with Object.is. */
  get: () => readonly NotificationRecord[];
  /** The persisted first-initialisation watermark for this owner, or null when unbound. */
  getSyncEpochMs: () => number | null;
  markAlerted: (id: string, atMs: number) => void;
  markAllRead: (nowMs: number) => void;
  /**
   * Marks every record with this chatId and `deliveredAt <= nowMs` read, then cancels the
   * native shade entry for each DISTINCT non-null conversationKey it touched.
   * Returns those keys so the behaviour is assertable.
   */
  markChatRead: (chatId: string, nowMs: number) => readonly string[];
  /** Write-once, informational. MUST NOT touch readAt. */
  markDismissed: (id: string, atMs: number) => void;
  markRead: (id: string, nowMs: number) => void;
  /**
   * Clears `readAt` on ONE record the human explicitly un-read.
   *
   * Takes no `nowMs`: it removes a timestamp rather than writing one.
   * Never re-posts a shade entry — a cancelled notification cannot be
   * un-cancelled, and re-alerting a message the user has already seen would be
   * a surprise. `alertedAt` deliberately stays set, so decision row 1
   * (`already-alerted`) still short-circuits any redelivery.
   */
  markUnread: (id: string) => void;
  subscribe: (listener: () => void) => () => void;
  /**
   * Idempotent by record id. Buffers in memory while unbound.
   *
   * RETURNS the merged record now held by the store. Callers MUST feed this returned value to
   * `resolveNotificationAlert`, never the freshly built one: a redelivered wrap always builds
   * with `alertedAt: null`, so decision row 1 (`already-alerted`) can only ever match if the
   * call site sees the STORED timestamps.
   */
  upsert: (record: NotificationRecord) => NotificationRecord;
}

/**
 * The JSON value space, so a persisted payload can be handed to a guard without
 * ever being cast. `safeLocalStorageGetJson` casts internally — that is not
 * validation, so everything read back here is re-narrowed below.
 */
type PersistedJson =
  | boolean
  | number
  | string
  | null
  | PersistedJson[]
  | { [key: string]: PersistedJson };

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let records: readonly NotificationRecord[] = [];
/**
 * Ids the human explicitly un-read.
 *
 * `mergeTimestamp` treats a PRESENT persisted timestamp as authoritative over an
 * incoming `null` (`notificationRecord.ts`, `mergeTimestamp`), which is exactly
 * what stops a redelivered gift wrap from un-reading a record. That asymmetry is
 * deliberate and is NOT changed here. The cost is that a plain
 * `readAt: null` mutation is silently restored by the next debounced flush
 * (~250 ms later): the badge would increment and then decrement with nothing
 * logged and nothing thrown.
 *
 * This set is the narrow exception: consulted once inside `flush()`, and dropped
 * as soon as the flush that wrote `readAt: null` has landed — after which the
 * persisted copy is null too and the merge is a no-op. Signal needed the same
 * thing and gave it a first-class `ReadStatus.ForcedUnread` state rather than
 * clearing a flag.
 */
let unreadOverrideIds = new Set<string>();
let storageKey: string | null = null;
let epochMs: number | null = null;
/** Records upserted before the owner id resolved. Flushed in on `bindOwner`. */
let pendingBuffer: readonly NotificationRecord[] = [];
let flushTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let listenersInstalled = false;
let readBackPending = false;
let lastReadBackOk: boolean | null = null;
let lastReadBackFailure: LocalStorageFailure | null = null;

const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const get = (): readonly NotificationRecord[] => records;

const getSyncEpochMs = (): number | null => epochMs;

/**
 * Outcome of the first-flush read-back for the current owner: `true` when the
 * write was verified, `false` when it silently failed, `null` when no flush has
 * happened yet for this binding.
 */
export const getNotificationStoreLastReadBackOk = (): boolean | null =>
  lastReadBackOk;

/**
 * The repo's existing failure record captured at the moment a read-back failed —
 * deliberately not a new signal.
 */
export const getNotificationStoreLastReadBackFailure =
  (): LocalStorageFailure | null => lastReadBackFailure;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const readPersistedJson = (key: string): PersistedJson =>
  safeLocalStorageGetJson<PersistedJson>(key, null);

/**
 * Narrows a persisted payload into an envelope.
 *
 * The strict guard is the fast path. When it rejects, a second pass salvages a
 * partially corrupt envelope by filtering entries individually: one drifted
 * record written by an older app version or by any script in the origin must
 * not cost the user every surviving record (T-04-09).
 */
const parseEnvelope = (
  value: PersistedJson,
): NotificationRecordEnvelope | null => {
  if (isNotificationRecordEnvelope(value)) {
    return value;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { epoch, records: persistedRecords } = value;
  if (typeof epoch !== "number" || !Array.isArray(persistedRecords)) {
    return null;
  }
  const salvaged: NotificationRecord[] = [];
  for (const entry of persistedRecords) {
    if (isNotificationRecord(entry)) salvaged.push(entry);
  }
  return { epoch, records: salvaged };
};

const sameRecords = (
  left: readonly NotificationRecord[],
  right: readonly NotificationRecord[],
): boolean =>
  left.length === right.length &&
  left.every((record, index) => record === right[index]);

const clearFlushTimer = (): void => {
  if (flushTimer === null) return;
  globalThis.clearTimeout(flushTimer);
  flushTimer = null;
};

/**
 * Coalescing, not trailing-edge: an already-pending timer is left alone, so a
 * burst of gift wraps is guaranteed to land within one debounce window of its
 * FIRST record rather than being pushed further away by every new arrival.
 */
const scheduleFlush = (): void => {
  if (storageKey === null || flushTimer !== null) return;
  flushTimer = globalThis.setTimeout(() => {
    flushTimer = null;
    flush();
  }, NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS);
};

/**
 * Re-read, merge by id, prune, cap, write. The re-read is what makes debouncing
 * safe: a second tab or a racing rebind cannot drop records written while this
 * flush was pending.
 */
function flush(): void {
  clearFlushTimer();
  const key = storageKey;
  if (key === null) return;

  const nowMs = Date.now();
  const persisted = parseEnvelope(readPersistedJson(key));
  const epoch = persisted?.epoch ?? epochMs ?? nowMs;
  const merged = mergeNotificationRecordsById(
    persisted?.records ?? [],
    records,
  );
  const next = applyNotificationRetention(applyUnreadOverrides(merged), nowMs);

  const failureCountBefore = getLocalStorageFailureCount();
  safeLocalStorageSetJson(key, { epoch, records: next });
  epochMs = epoch;

  if (readBackPending) {
    readBackPending = false;
    // A swallowed write and a corrupt read-back are different faults, so the
    // failure counter is consulted as well as the payload itself (T-04-11).
    const wroteCleanly = getLocalStorageFailureCount() === failureCountBefore;
    const readBack = parseEnvelope(readPersistedJson(key));
    const persistedIds = new Set(
      (readBack?.records ?? []).map((record) => record.id),
    );
    lastReadBackOk =
      wroteCleanly &&
      readBack !== null &&
      next.every((record) => persistedIds.has(record.id));
    // Report once through the repo's existing signal: no throw, no retry loop,
    // no logging of record content.
    lastReadBackFailure = lastReadBackOk ? null : getLastLocalStorageFailure();
  }

  // The write carried readAt: null into the envelope, so the persisted copy now
  // agrees and the merge is a no-op from here on. `failureCountBefore` is
  // already computed above; a swallowed write must NOT drop the guard, or the
  // next flush would restore the timestamp. This sits BEFORE the `sameRecords`
  // early return — after it, the common no-change path would leak the override.
  if (
    unreadOverrideIds.size > 0 &&
    getLocalStorageFailureCount() === failureCountBefore
  ) {
    unreadOverrideIds = new Set();
  }

  if (sameRecords(records, next)) return;
  records = next;
  emit();
}

const flushNow = (): void => {
  flush();
};

// ---------------------------------------------------------------------------
// Force-flush listeners
// ---------------------------------------------------------------------------

const handleVisibilityChange = (): void => {
  if (document.visibilityState !== "hidden") return;
  flush();
};

const handlePageHide = (): void => {
  flush();
};

/**
 * On Android the WebView is frozen rather than killed, so the debounce timer
 * *may* resume — "may" is not durability.
 */
const installFlushListeners = (): void => {
  if (listenersInstalled) return;
  if (typeof document === "undefined" || typeof window === "undefined") return;
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);
  listenersInstalled = true;
};

const removeFlushListeners = (): void => {
  if (!listenersInstalled) return;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("pagehide", handlePageHide);
  listenersInstalled = false;
};

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

const bindOwner = (nextKey: string | null): void => {
  if (storageKey !== null) {
    // Flush the PREVIOUS owner before the key changes, or its last records are
    // lost — and owner scoping is the access-control boundary here (T-04-08).
    flush();
  }
  clearFlushTimer();
  // AFTER the previous owner's flush has had its chance to honour them, and
  // before the key changes (T-06-SEC-01: the set has no owner key of its own,
  // so a stale id could otherwise force `readAt: null` on a DIFFERENT owner's
  // record that happens to share that id). One line covers bind and unbind.
  unreadOverrideIds = new Set();
  storageKey = nextKey;
  readBackPending = false;
  lastReadBackOk = null;
  lastReadBackFailure = null;

  if (nextKey === null) {
    pendingBuffer = [];
    epochMs = null;
    if (records.length > 0) records = [];
    removeFlushListeners();
    emit();
    return;
  }

  const persisted = parseEnvelope(readPersistedJson(nextKey));
  epochMs = persisted?.epoch ?? Date.now();
  records = mergeNotificationRecordsById(
    persisted?.records ?? [],
    pendingBuffer,
  );
  pendingBuffer = [];
  readBackPending = true;
  installFlushListeners();
  // Persists the epoch watermark even when no record ever arrives.
  scheduleFlush();
  emit();
};

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * The single mutation path. The early return is what keeps `get()`
 * referentially stable when nothing actually changed — without it
 * `useSyncExternalStore` re-renders the badge on every call.
 */
const mutateRecords = (
  mapper: (record: NotificationRecord) => NotificationRecord,
): boolean => {
  let changed = false;
  const next = records.map((record) => {
    const mapped = mapper(record);
    if (mapped !== record) changed = true;
    return mapped;
  });
  if (!changed) return false;
  records = next;
  emit();
  scheduleFlush();
  return true;
};

/**
 * Forces `readAt: null` back onto the merge result for every id the human
 * explicitly un-read. Applied between the merge and retention inside `flush()`,
 * because the merge is precisely what would otherwise restore the timestamp.
 */
const applyUnreadOverrides = (
  candidates: readonly NotificationRecord[],
): readonly NotificationRecord[] => {
  if (unreadOverrideIds.size === 0) return candidates;
  return candidates.map((record) =>
    unreadOverrideIds.has(record.id) && record.readAt !== null
      ? { ...record, readAt: null }
      : record,
  );
};

/**
 * Idempotent by record id, and it RETURNS the merged record on purpose.
 *
 * A freshly built record always carries `alertedAt: null`, so an alert decision
 * taken on the built value can never match decision row 1 (`already-alerted`)
 * and would re-alert on every redelivery. Only the merged value carries the
 * stored timestamps, and redelivery is routine rather than exceptional once the
 * "this device already has the MESSAGE" gates become fall-through flags.
 *
 * While unbound it buffers instead of persisting — but still updates the
 * snapshot, emits, and returns the merged record, so the UI and the alert
 * decision are live before login completes.
 */
const upsert = (record: NotificationRecord): NotificationRecord => {
  records = mergeNotificationRecordsById(records, [record]);
  if (storageKey === null) {
    pendingBuffer = mergeNotificationRecordsById(pendingBuffer, [record]);
  }
  emit();
  scheduleFlush();
  // The fallback can only fire if the merge dropped the id, which would itself
  // be a bug in mergeNotificationRecordsById.
  return records.find((entry) => entry.id === record.id) ?? record;
};

/**
 * Cancels the shade entry only once the conversation has NO unread record left.
 * Cancelling on every `markRead` would hide a conversation's still-unread
 * messages from the shade; never cancelling leaves a stale entry standing for a
 * conversation the user has fully read, which is what the Phase 8 checklist
 * calls out. The tag is derived from `conversationKey`, never from `chatId` —
 * the latter changes when an unknown contact is saved (see `markChatRead`).
 */
const markRead = (id: string, nowMs: number): void => {
  const target = records.find((record) => record.id === id);
  if (target === undefined || target.readAt !== null) return;
  // Re-reading always beats a stale override, so drop it BEFORE the mutation.
  unreadOverrideIds.delete(id);
  const changed = mutateRecords((record) =>
    record.id === id && record.readAt === null
      ? { ...record, readAt: nowMs }
      : record,
  );
  if (!changed) return;
  const conversationKey = target.conversationKey;
  if (conversationKey === null) return;
  const stillUnread = records.some(
    (record) =>
      record.conversationKey === conversationKey && record.readAt === null,
  );
  if (stillUnread) return;
  // The wrapper returns false when the bridge is absent, so there is nothing
  // to branch on here.
  cancelNativeConversationNotification(conversationKey);
};

/**
 * Accepted multi-tab tradeoff: a second tab that marked this same record read
 * inside the same 250 ms debounce window loses that write, because this tab's
 * flush forces `readAt: null` over the merge result. That is strictly better
 * than the reversion bug it replaces, and it matches the store's existing
 * last-writer-wins-per-field posture.
 */
const markUnread = (id: string): void => {
  const target = records.find((record) => record.id === id);
  if (target === undefined || target.readAt === null) return;
  unreadOverrideIds.add(id);
  mutateRecords((record) =>
    record.id === id ? { ...record, readAt: null } : record,
  );
};

const markAlerted = (id: string, atMs: number): void => {
  mutateRecords((record) =>
    record.id === id && record.alertedAt === null
      ? { ...record, alertedAt: atMs }
      : record,
  );
};

const markAllRead = (nowMs: number): void => {
  // Re-reading always beats a stale override.
  unreadOverrideIds.clear();
  mutateRecords((record) =>
    record.readAt === null ? { ...record, readAt: nowMs } : record,
  );
  // Scoped to Linky's own notification group — NotificationManagerCompat's
  // cancelAll(), which would clear every app's entries, is not reachable from
  // this store (T-04-12).
  cancelAllNativeConversationNotifications();
};

/**
 * Bounded by `deliveredAt <= nowMs` on purpose: a message arriving while the
 * chat is open is marked read by the alert path (decision row 5), so this bulk
 * writer must not retroactively claim records that arrive after this pass.
 *
 * The bound is on `deliveredAt`, NOT `createdAtMs`. Since phase 9 `createdAtMs`
 * is the SENDER's clamped send time and is attacker-controlled; a rumor
 * timestamped into the future would escape this pass for good and pin an unread
 * badge the user cannot clear by opening the chat. "After this pass" means after
 * in OUR clock, and `deliveredAt` is the only receipt-time field.
 *
 * The shade is cancelled by `conversationKey`, NEVER by `chatId`. The Java tag
 * is `"linky.chat:" + pubkey`, while `chatId` is a ContactId or
 * `unknown:<pubkey>` that CHANGES when an unknown contact is saved — deriving
 * one from the other through a contact lookup would break exactly at the rename
 * boundary and orphan the entry.
 */
const markChatRead = (chatId: string, nowMs: number): readonly string[] => {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) return [];

  const targetIds = new Set<string>();
  const conversationKeys = new Set<string>();
  for (const record of records) {
    if (record.chatId !== normalizedChatId) continue;
    if (record.deliveredAt > nowMs || record.readAt !== null) continue;
    targetIds.add(record.id);
    if (record.conversationKey !== null) {
      conversationKeys.add(record.conversationKey);
    }
  }
  if (targetIds.size === 0) return [];

  // Re-reading always beats a stale override.
  for (const id of targetIds) unreadOverrideIds.delete(id);

  mutateRecords((record) =>
    targetIds.has(record.id) ? { ...record, readAt: nowMs } : record,
  );

  const keys = [...conversationKeys];
  for (const key of keys) {
    // The wrapper returns false when the bridge is absent, so there is nothing
    // to branch on here.
    cancelNativeConversationNotification(key);
  }
  return keys;
};

/**
 * Write-once and purely informational. Signal's DeleteNotificationReceiver marks
 * messages notified, never read: a swipe carries no evidence of reading, and
 * Android fires the same intent for "Clear all" and for some OEM auto-clears.
 * Users depend on clearing the shade not clearing their unread state, so this
 * writer touches exactly one field and the unread predicate never consults it.
 */
const markDismissed = (id: string, atMs: number): void => {
  mutateRecords((record) =>
    record.id === id && record.dismissedAt === undefined
      ? { ...record, dismissedAt: atMs }
      : record,
  );
};

export const notificationRecordStore: NotificationRecordStore = {
  bindOwner,
  flushNow,
  get,
  getSyncEpochMs,
  markAlerted,
  markAllRead,
  markChatRead,
  markDismissed,
  markRead,
  markUnread,
  subscribe,
  upsert,
};

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const useNotificationRecords = (): readonly NotificationRecord[] =>
  React.useSyncExternalStore(subscribe, get, get);

let unreadCountSource: readonly NotificationRecord[] | null = null;
let unreadCountValue = 0;

/**
 * Memoised against the snapshot REFERENCE, and it returns a primitive, so
 * `Object.is` sees a stable value and the badge does not re-render per frame.
 */
const getUnreadCount = (): number => {
  const current = get();
  if (current !== unreadCountSource) {
    unreadCountSource = current;
    unreadCountValue = countUnreadNotificationRecords(current);
  }
  return unreadCountValue;
};

export const useUnreadNotificationCount = (): number =>
  React.useSyncExternalStore(subscribe, getUnreadCount, getUnreadCount);
