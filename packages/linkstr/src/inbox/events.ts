import { Schema } from "effect";
import { WrapId } from "../domain/primitives";

export const DropReason = Schema.Literal(
  "malformed-wrap",
  "not-addressed-to-me",
  "unwrap-failed",
  "invalid-seal",
  "sender-forged",
  "malformed-rumor",
  "forged-rumor-id",
  "unsupported-kind",
  "invalid-reaction",
  "invalid-retraction",
  "invalid-message",
  "invalid-image",
  "invalid-edit",
  "empty-message",
  "nested-payload",
  "invalid-notice",
  "invalid-bank-offer",
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
