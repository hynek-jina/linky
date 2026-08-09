import { Schema } from "effect";
import { WrapDelivery } from "./delivery";
import { ClientId, RumorId, UnixSeconds } from "./primitives";

const deliveryFailureFields = {
  rumorId: RumorId,
  clientId: ClientId,
  sentAt: UnixSeconds,
  selfCopy: WrapDelivery,
  recipientCopy: WrapDelivery,
};

/** No relay accepted anything — not even the self copy. */
export class NoRelayReachable extends Schema.TaggedError<NoRelayReachable>()(
  "NoRelayReachable",
  deliveryFailureFields,
) {}

/**
 * The self copy landed but no relay accepted the recipient's wrap: the peer
 * will never see this event. Never silently degraded into "sent".
 */
export class RecipientNotReached extends Schema.TaggedError<RecipientNotReached>()(
  "RecipientNotReached",
  deliveryFailureFields,
) {}

export const WrapSendError = Schema.Union(
  RecipientNotReached,
  NoRelayReachable,
);
export type WrapSendError = typeof WrapSendError.Type;
