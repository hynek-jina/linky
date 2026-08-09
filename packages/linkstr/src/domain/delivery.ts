import { Schema } from "effect";
import { RelayUrl, WrapId } from "./primitives";

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
