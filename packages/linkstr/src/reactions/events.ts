import { Schema } from "effect";
import {
  ClientId,
  Pubkey,
  RumorId,
  UnixSeconds,
  WrapId,
} from "../domain/primitives";
import { Emoji } from "./domain";

export class ReactionAdded extends Schema.TaggedClass<ReactionAdded>()(
  "ReactionAdded",
  {
    reactionId: RumorId,
    target: RumorId,
    from: Pubkey,
    emoji: Emoji,
    sentAt: UnixSeconds,
  },
) {}

/**
 * Our own reaction observed on a relay — the echo of the self copy, or a send
 * from another device. The reconciliation signal, distinct by construction
 * from an incoming reaction.
 */
export class OwnReactionConfirmed extends Schema.TaggedClass<OwnReactionConfirmed>()(
  "OwnReactionConfirmed",
  {
    reactionId: RumorId,
    target: RumorId,
    emoji: Emoji,
    clientId: Schema.NullOr(ClientId),
    sentAt: UnixSeconds,
  },
) {}

export class ReactionRetracted extends Schema.TaggedClass<ReactionRetracted>()(
  "ReactionRetracted",
  {
    reactionIds: Schema.NonEmptyArray(RumorId),
    from: Pubkey,
    sentAt: UnixSeconds,
  },
) {}

export const ReactionInboxEvent = Schema.Union(
  ReactionAdded,
  OwnReactionConfirmed,
  ReactionRetracted,
);
export type ReactionInboxEvent = typeof ReactionInboxEvent.Type;

export const DropReason = Schema.Literal(
  "malformed-wrap",
  "not-addressed-to-me",
  "unwrap-failed",
  "malformed-rumor",
  "sender-is-wrap-key",
  "unsupported-kind",
  "invalid-reaction",
  "invalid-retraction",
);
export type DropReason = typeof DropReason.Type;

/** A wrap we chose not to surface, with a typed, observable reason. */
export class WrapDropped extends Schema.TaggedClass<WrapDropped>()(
  "WrapDropped",
  {
    wrapId: Schema.NullOr(WrapId),
    reason: DropReason,
  },
) {}
