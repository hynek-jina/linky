import { Schema } from "effect";
import { RelayPublishResult } from "../services/NostrTransport";
import { EventId, RelayUrl, UnixSeconds, WrapId } from "./primitives";

export class RelayRejection extends Schema.Class<RelayRejection>(
  "RelayRejection",
)({
  relay: RelayUrl,
  detail: Schema.NullOr(Schema.String),
}) {}

/** Per-wrap delivery outcome: which relays accepted this signed wrap. */
export class WrapDelivery extends Schema.Class<WrapDelivery>("WrapDelivery")({
  wrapId: WrapId,
  acceptedBy: Schema.Array(RelayUrl),
  rejectedBy: Schema.Array(RelayRejection),
}) {
  get accepted(): boolean {
    return this.acceptedBy.length > 0;
  }
}

/** Outcome of publishing one signed plain event to the write relays. */
export class PlainEventReceipt extends Schema.Class<PlainEventReceipt>(
  "PlainEventReceipt",
)({
  eventId: EventId,
  kind: Schema.Int,
  sentAt: UnixSeconds,
  results: Schema.Array(RelayPublishResult),
}) {
  get accepted(): boolean {
    return this.results.some((result) => result.accepted);
  }
}
