import { Schema } from "effect";
import {
  ChatMessageReceipt,
  EditMessageDraft,
  ImageMessageDraft,
  MessageEditReceipt,
  TextMessageDraft,
  TokenMessageDraft,
} from "../chat/domain";
import { ClientId, Pubkey, RumorId, UnixSeconds } from "../domain/primitives";
import {
  PaymentTelemetryDraft,
  PaymentTelemetryReceipt,
} from "../paymentTelemetry/domain";
import { ReactionDraft, ReactionReceipt } from "../reactions/domain";

export const OutboxJobId = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("OutboxJobId"),
);
export type OutboxJobId = typeof OutboxJobId.Type;

/** Opaque app correlation id (e.g. the app's DB row id), echoed on results. */
export const OutboxRef = Schema.NonEmptyTrimmedString.pipe(
  Schema.brand("OutboxRef"),
);
export type OutboxRef = typeof OutboxRef.Type;

export const ChatTextOperation = Schema.TaggedStruct("chat.text", {
  draft: TextMessageDraft,
});
export type ChatTextOperation = typeof ChatTextOperation.Type;

export const ChatTokenOperation = Schema.TaggedStruct("chat.token", {
  draft: TokenMessageDraft,
});
export type ChatTokenOperation = typeof ChatTokenOperation.Type;

export const ChatImageOperation = Schema.TaggedStruct("chat.image", {
  draft: ImageMessageDraft,
});
export type ChatImageOperation = typeof ChatImageOperation.Type;

export const ChatEditOperation = Schema.TaggedStruct("chat.edit", {
  draft: EditMessageDraft,
});
export type ChatEditOperation = typeof ChatEditOperation.Type;

export const ReactionOperation = Schema.TaggedStruct("reaction", {
  draft: ReactionDraft,
});
export type ReactionOperation = typeof ReactionOperation.Type;

export const PaymentTelemetryOperation = Schema.TaggedStruct(
  "paymentTelemetry",
  {
    draft: PaymentTelemetryDraft,
    recipient: Pubkey,
  },
);
export type PaymentTelemetryOperation = typeof PaymentTelemetryOperation.Type;

export const OutboxOperation = Schema.Union(
  ChatTextOperation,
  ChatTokenOperation,
  ChatImageOperation,
  ChatEditOperation,
  ReactionOperation,
  PaymentTelemetryOperation,
);
export type OutboxOperation = typeof OutboxOperation.Type;

/**
 * Operations whose rumor is fully determined at enqueue time, so every retry
 * republishes the same rumor id. Telemetry is the exception: it mints a fresh
 * ephemeral author per attempt.
 */
export type RumorFixedOperation = Exclude<
  OutboxOperation,
  PaymentTelemetryOperation
>;

export class EnqueueReceipt extends Schema.Class<EnqueueReceipt>(
  "EnqueueReceipt",
)({
  jobId: OutboxJobId,
  ref: OutboxRef,
  /** Deterministic: every delivery retry publishes this exact rumor id. */
  rumorId: RumorId,
  clientId: ClientId,
  sentAt: UnixSeconds,
}) {}

// MessageEditReceipt before ChatMessageReceipt: the union decodes
// structurally and the edit receipt is a field superset of the chat one.
export const OutboxReceipt = Schema.Union(
  MessageEditReceipt,
  ChatMessageReceipt,
  ReactionReceipt,
  PaymentTelemetryReceipt,
);
export type OutboxReceipt = typeof OutboxReceipt.Type;

const LEGACY_RUMOR_ID_KEYS = ["messageId", "reactionId", "telemetryId"];

const UnknownRecord = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});

const unifyRumorIdKey = (
  record: Record<string, unknown>,
): Record<string, unknown> => {
  if ("rumorId" in record) return record;
  const legacyKey = LEGACY_RUMOR_ID_KEYS.find((key) => key in record);
  if (legacyKey === undefined) return record;
  const { [legacyKey]: rumorId, ...rest } = record;
  return { ...rest, rumorId };
};

/** Persisted receipts predating the unified `rumorId` field still decode. */
const StoredOutboxReceipt = Schema.compose(
  Schema.transform(UnknownRecord, UnknownRecord, {
    strict: true,
    decode: unifyRumorIdKey,
    encode: (record) => record,
  }),
  OutboxReceipt,
  { strict: false },
);

export const OutboxFailureReason = Schema.Literal(
  "identity-changed",
  "unexpected-error",
);
export type OutboxFailureReason = typeof OutboxFailureReason.Type;

export class OutboxJobSucceeded extends Schema.TaggedClass<OutboxJobSucceeded>()(
  "OutboxJobSucceeded",
  {
    jobId: OutboxJobId,
    ref: OutboxRef,
    receipt: StoredOutboxReceipt,
  },
) {}

export class OutboxJobFailed extends Schema.TaggedClass<OutboxJobFailed>()(
  "OutboxJobFailed",
  {
    jobId: OutboxJobId,
    ref: OutboxRef,
    reason: OutboxFailureReason,
    detail: Schema.String,
  },
) {}

export const OutboxResult = Schema.Union(OutboxJobSucceeded, OutboxJobFailed);
export type OutboxResult = typeof OutboxResult.Type;

export const OutboxJobState = Schema.Union(
  Schema.TaggedStruct("queued", {}),
  Schema.TaggedStruct("awaiting-ack", { result: OutboxResult }),
);
export type OutboxJobState = typeof OutboxJobState.Type;

export class StoredOutboxJob extends Schema.Class<StoredOutboxJob>(
  "StoredOutboxJob",
)({
  jobId: OutboxJobId,
  ref: OutboxRef,
  /** Normalized at enqueue: `clientId` and `sentAt` are filled in. */
  operation: OutboxOperation,
  /** Identity the job was enqueued under; never sent under another key. */
  pubkey: Pubkey,
  enqueuedAt: UnixSeconds,
  state: OutboxJobState,
}) {}
