export type NotificationRecordKind =
  | "bankPaymentOffer"
  | "chatMessage"
  | "npubCashClaim"
  | "paymentReceived";

const NOTIFICATION_RECORD_KINDS: readonly NotificationRecordKind[] = [
  "bankPaymentOffer",
  "chatMessage",
  "npubCashClaim",
  "paymentReceived",
];

/**
 * A device-local, owner-scoped record of one people-or-money event.
 *
 * Three timestamps, not one boolean, mirroring Signal's two-flag design
 * (`messages.read` + `messages.notified`):
 *   deliveredAt — always set; the record exists
 *   alertedAt   — Signal's `notified`: we have already told the human
 *   readAt      — Signal's `read`:     the human has seen the content
 *
 * `dismissedAt` is a FOURTH, optional field and MUST NEVER imply `readAt`.
 * Signal's DeleteNotificationReceiver marks messages notified, never read, and
 * users depend on clearing the shade not clearing their unread state. Unread is
 * exactly `readAt === null`.
 *
 * `chatId` is a plain string ON PURPOSE: it holds either a branded Evolu
 * ContactId or a synthetic `unknown:<pubkeyHex>` id (utils/constants.ts
 * UNKNOWN_CONTACT_ID_PREFIX). Do not "fix" it to ContactId.
 */
export interface NotificationRecord {
  alertedAt: number | null;
  /** Contact/thread this belongs to; null for npubCashClaim. Routing key. */
  chatId: string | null;
  /** Native shade identity: tag = "linky.chat:" + conversationKey. Sender pubkey hex. */
  conversationKey: string | null;
  /** Sort key. Clamped SEND time in ms, from the inner rumor's created_at. */
  createdAtMs: number;
  /** RECEIPT time in ms: when this store first wrote the record. */
  deliveredAt: number;
  /** Shade/banner swipe. NEVER implies readAt. */
  dismissedAt?: number;
  /** Inner rumor created_at in SECONDS — only used for the syncEpochMs comparison. */
  eventCreatedAtSec?: number;
  /** Idempotency key. Outer wrap event id where available. */
  id: string;
  kind: NotificationRecordKind;
  /** Evolu message row id when one exists (chatMessage only). */
  messageId?: string;
  /** bankPaymentOffer only. */
  offerId?: string;
  /** <= NOTIFICATION_PREVIEW_MAX_LENGTH chars, plaintext. */
  preview: string;
  readAt: number | null;
  senderLabel: string;
}

/** One read / one write: the watermark travels with the records. */
export interface NotificationRecordEnvelope {
  epoch: number;
  records: readonly NotificationRecord[];
}

export const NOTIFICATION_RECORD_CAP = 200;
export const NOTIFICATION_READ_PRUNE_MS = 30 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_PREVIEW_MAX_LENGTH = 80;

/**
 * How far into the past a record's `createdAtMs` may be pulled by the sender's
 * own `eventCreatedAtSec`.
 *
 * Matches `apps/push/src/config.ts`'s `CATCH_UP_LOOKBACK_SECONDS` (3 days) and
 * covers NIP-59's 2-day randomisation window with 24 h of margin for clock skew.
 */
export const NOTIFICATION_MAX_RECORD_BACKDATE_MS = 3 * 24 * 60 * 60 * 1000;

export interface BuildNotificationRecordInput {
  chatId: string | null;
  conversationKey: string | null;
  eventCreatedAtSec?: number;
  id: string;
  kind: NotificationRecordKind;
  messageId?: string;
  nowMs: number;
  offerId?: string;
  preview: string;
  senderLabel: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNotificationRecordKind = (
  value: unknown,
): value is NotificationRecordKind =>
  typeof value === "string" &&
  NOTIFICATION_RECORD_KINDS.some((kind) => kind === value);

/** number | null, present. */
const isNullableTimestamp = (value: unknown): boolean =>
  value === null || typeof value === "number";

/** number | null, present. */
const isNullableString = (value: unknown): boolean =>
  value === null || typeof value === "string";

/** Absent or the given primitive — never an explicit `undefined` on the wire. */
const isAbsentOr = (
  container: Record<string, unknown>,
  key: string,
  expected: "number" | "string",
): boolean => (key in container ? typeof container[key] === expected : true);

/**
 * Privacy + quota guard. This clamp is the only thing standing between a hostile
 * multi-megabyte message body and the localStorage quota, so it runs before the
 * record is built, not at render time.
 */
export const truncateNotificationPreview = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.length <= NOTIFICATION_PREVIEW_MAX_LENGTH) {
    return trimmed;
  }
  // The ellipsis counts inside the budget, so the result is never longer than the max.
  return `${trimmed.slice(0, NOTIFICATION_PREVIEW_MAX_LENGTH - 1)}…`;
};

/**
 * Resolves a record's SORT key from the inner rumor's send time.
 *
 * `eventCreatedAtSec` is the sealed rumor's `created_at` — the sender's real
 * clock. NIP-59 randomises the OUTER wrap timestamp, not this one, so it is the
 * only honest send time available and it is already decrypted and already
 * persisted.
 *
 * It is also ATTACKER-CONTROLLED, and this is an ordering key, so both
 * directions are clamped:
 *   - forward-dating is a real (mild) griefing vector: 200 far-future wraps
 *     would pin themselves at the top of `sortNotificationRecords` and evict
 *     every genuine record through the 200-record cap;
 *   - far-backdating would sink a record below the cap so the human never sees
 *     it.
 *
 * Note that `notificationAlert.ts`'s "backdating is self-harm, not an attack"
 * comment is correct for the `catch-up-pre-epoch` ALERT rule and does NOT
 * transfer here. Do not delete this clamp on the strength of that comment.
 *
 * The clamp also bounds how far display order can diverge from receipt order
 * (<= 3 days), which is what keeps the cap sane without splitting the sort into
 * two keys.
 */
export const resolveRecordCreatedAtMs = (
  eventCreatedAtSec: number | undefined,
  nowMs: number,
): number => {
  if (eventCreatedAtSec === undefined) return nowMs;
  const candidate = eventCreatedAtSec * 1000;
  // Number.isFinite runs BEFORE the range comparisons on purpose: NaN fails `>`
  // and `<` alike, so a later guard would let it fall through into the record and
  // make the whole list order undefined.
  if (!Number.isFinite(candidate)) return nowMs;
  if (candidate > nowMs) return nowMs;
  if (candidate < nowMs - NOTIFICATION_MAX_RECORD_BACKDATE_MS) {
    return nowMs - NOTIFICATION_MAX_RECORD_BACKDATE_MS;
  }
  return candidate;
};

/**
 * Builds a fresh, unread, un-alerted record. `nowMs` is an input rather than a
 * `Date.now()` call so every test is deterministic.
 *
 * `createdAtMs` is clamped SEND time, resolved from the inner rumor's
 * `eventCreatedAtSec` by `resolveRecordCreatedAtMs` — NIP-59 randomises the OUTER
 * wrap timestamp, not the rumor's, so the rumor is the only honest send time.
 * `deliveredAt` is RECEIPT time. They coincide only when the record carries no
 * `eventCreatedAtSec`.
 */
export const buildNotificationRecord = (
  input: BuildNotificationRecordInput,
): NotificationRecord => ({
  alertedAt: null,
  chatId: input.chatId,
  conversationKey: input.conversationKey,
  createdAtMs: resolveRecordCreatedAtMs(input.eventCreatedAtSec, input.nowMs),
  // UNCHANGED — the sole receipt-time field. No Java change is needed for D4 and
  // none may be made: `notify.ts` forwards neither `createdAtMs` nor `deliveredAt`
  // into the native payload, and `LinkyNotificationSupport.resolveWhen` ignores its
  // timestamp argument entirely and returns receipt time (pinned by three JVM
  // tests). Plumbing a record timestamp into the native `when` would trip the
  // platform's `PeekOldWhenSuppressor` and kill every heads-up.
  deliveredAt: input.nowMs,
  // exactOptionalPropertyTypes: omit optional keys, never set them to undefined.
  ...(input.eventCreatedAtSec === undefined
    ? {}
    : { eventCreatedAtSec: input.eventCreatedAtSec }),
  id: input.id,
  kind: input.kind,
  ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
  ...(input.offerId === undefined ? {} : { offerId: input.offerId }),
  preview: truncateNotificationPreview(input.preview),
  readAt: null,
  senderLabel: input.senderLabel,
});

/**
 * Narrows an arbitrary persisted entry. Records survive across app versions and
 * any script in the origin can have written them, so every field is checked
 * explicitly — nothing here is cast.
 */
export const isNotificationRecord = (
  value: unknown,
): value is NotificationRecord => {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== "string") {
    return false;
  }
  if (!isNotificationRecordKind(value.kind)) {
    return false;
  }
  if (typeof value.createdAtMs !== "number") {
    return false;
  }
  if (typeof value.deliveredAt !== "number") {
    return false;
  }
  if (typeof value.preview !== "string") {
    return false;
  }
  if (typeof value.senderLabel !== "string") {
    return false;
  }
  if (!isNullableTimestamp(value.alertedAt)) {
    return false;
  }
  if (!isNullableTimestamp(value.readAt)) {
    return false;
  }
  if (!isNullableString(value.chatId)) {
    return false;
  }
  if (!isNullableString(value.conversationKey)) {
    return false;
  }
  // Optional fields are absent-or-correct-type. A `null` dismissedAt is invalid:
  // dismissal is recorded by presence, and an unread record simply has no key.
  if (!isAbsentOr(value, "dismissedAt", "number")) {
    return false;
  }
  if (!isAbsentOr(value, "eventCreatedAtSec", "number")) {
    return false;
  }
  if (!isAbsentOr(value, "messageId", "string")) {
    return false;
  }
  return isAbsentOr(value, "offerId", "string");
};

export const isNotificationRecordEnvelope = (
  value: unknown,
): value is NotificationRecordEnvelope => {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.epoch !== "number") {
    return false;
  }
  const { records } = value;
  if (!Array.isArray(records)) {
    return false;
  }
  return records.every((entry) => isNotificationRecord(entry));
};

/** Newest `createdAtMs` first, ties broken by `id` ascending so the order is stable. */
export const sortNotificationRecords = (
  records: readonly NotificationRecord[],
): readonly NotificationRecord[] =>
  [...records].sort((left, right) => {
    if (left.createdAtMs !== right.createdAtMs) {
      return right.createdAtMs - left.createdAtMs;
    }
    if (left.id === right.id) {
      return 0;
    }
    return left.id < right.id ? -1 : 1;
  });

/** A present timestamp always beats an absent one; when both exist, the earlier wins. */
const mergeTimestamp = (
  persisted: number | null,
  incoming: number | null,
): number | null => {
  if (persisted === null) {
    return incoming;
  }
  if (incoming === null) {
    return persisted;
  }
  return Math.min(persisted, incoming);
};

const mergeOne = (
  persisted: NotificationRecord,
  incoming: NotificationRecord,
): NotificationRecord => {
  const dismissedAt = mergeTimestamp(
    persisted.dismissedAt ?? null,
    incoming.dismissedAt ?? null,
  );
  const eventCreatedAtSec =
    incoming.eventCreatedAtSec ?? persisted.eventCreatedAtSec;
  const messageId = incoming.messageId ?? persisted.messageId;
  const offerId = incoming.offerId ?? persisted.offerId;
  return {
    alertedAt: mergeTimestamp(persisted.alertedAt, incoming.alertedAt),
    chatId: incoming.chatId,
    conversationKey: incoming.conversationKey,
    createdAtMs: persisted.createdAtMs,
    deliveredAt: persisted.deliveredAt,
    // Merged, never derived: a dismissal must not leak into readAt.
    ...(dismissedAt === null ? {} : { dismissedAt }),
    ...(eventCreatedAtSec === undefined ? {} : { eventCreatedAtSec }),
    id: persisted.id,
    kind: incoming.kind,
    ...(messageId === undefined ? {} : { messageId }),
    ...(offerId === undefined ? {} : { offerId }),
    preview: incoming.preview,
    readAt: mergeTimestamp(persisted.readAt, incoming.readAt),
    senderLabel: incoming.senderLabel,
  };
};

/**
 * Idempotency by `id`: a re-delivered wrap updates its record instead of
 * appending a second one. Timestamps merge monotonically so a re-delivery can
 * never revert `readAt` / `alertedAt` / `dismissedAt` back to null.
 *
 * First-write-wins on `createdAtMs` is now MORE deterministic, not less: the
 * input is the immutable rumor timestamp, so a redelivery resolves to the same
 * value instead of to a fresh receipt stamp.
 */
export const mergeNotificationRecordsById = (
  persisted: readonly NotificationRecord[],
  incoming: readonly NotificationRecord[],
): readonly NotificationRecord[] => {
  const byId = new Map<string, NotificationRecord>();
  for (const record of persisted) {
    byId.set(record.id, record);
  }
  for (const record of incoming) {
    const existing = byId.get(record.id);
    byId.set(record.id, existing ? mergeOne(existing, record) : record);
  }
  return sortNotificationRecords([...byId.values()]);
};

/**
 * Age-prunes READ records only. An unread record is never dropped for age at any
 * age: the whole milestone exists because notifications disappeared before the
 * human saw them.
 *
 * The age is measured on `deliveredAt`, not on `createdAtMs`: retention is about
 * how long WE have held the record — our own custody — not about the sender's
 * clock. Keyed on `createdAtMs` (clamped send time) a genuinely-old resynced
 * message would be pruned the instant it is read.
 */
export const pruneReadNotificationRecords = (
  records: readonly NotificationRecord[],
  nowMs: number,
  maxAgeMs: number = NOTIFICATION_READ_PRUNE_MS,
): readonly NotificationRecord[] =>
  records.filter(
    (record) =>
      record.readAt === null || nowMs - record.deliveredAt <= maxAgeMs,
  );

/** Keeps the newest `cap` records. Can evict an unread record — accepted, and tested. */
export const capNotificationRecords = (
  records: readonly NotificationRecord[],
  cap: number = NOTIFICATION_RECORD_CAP,
): readonly NotificationRecord[] =>
  sortNotificationRecords(records).slice(0, cap);

/**
 * prune THEN cap — the order is load-bearing and pinned by a boundary test.
 * Capping first can evict an unread record while a 30-day-old READ record
 * survives the cull, only to be pruned a microsecond later. Pruning first spends
 * the retention budget on records the human has already seen.
 */
export const applyNotificationRetention = (
  records: readonly NotificationRecord[],
  nowMs: number,
): readonly NotificationRecord[] =>
  capNotificationRecords(
    pruneReadNotificationRecords(sortNotificationRecords(records), nowMs),
  );

/**
 * Unread is exactly `readAt === null`. It must NOT consult `dismissedAt`:
 * clearing the shade is not reading, and folding dismissal in here would
 * reintroduce the reported bug through a different door.
 */
export const countUnreadNotificationRecords = (
  records: readonly NotificationRecord[],
): number => records.filter((record) => record.readAt === null).length;
