import { Schema } from "effect";
import { WrapDelivery } from "./delivery";
import { ClientId, RelayUrl, RumorId } from "./primitives";

/** No relay accepted anything — not even the self copy. */
export class NoRelayReachable extends Schema.TaggedError<NoRelayReachable>()(
  "NoRelayReachable",
  { relays: Schema.Array(RelayUrl) },
) {}

/**
 * The self copy landed but no relay accepted the recipient's wrap: the peer
 * will never see this event. Never silently degraded into "sent".
 */
export class RecipientNotReached extends Schema.TaggedError<RecipientNotReached>()(
  "RecipientNotReached",
  {
    rumorId: RumorId,
    clientId: ClientId,
    selfCopy: WrapDelivery,
    recipientCopy: WrapDelivery,
  },
) {}

export const WrapSendError = Schema.Union(
  RecipientNotReached,
  NoRelayReachable,
);
export type WrapSendError = typeof WrapSendError.Type;
