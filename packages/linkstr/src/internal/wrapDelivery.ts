import { Effect } from "effect";
import { RelayRejection, WrapDelivery } from "../domain/delivery";
import { NoRelayReachable, RecipientNotReached } from "../domain/errors";
import type { ClientId, Pubkey, UnixSeconds } from "../domain/primitives";
import { RumorId } from "../domain/primitives";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import type {
  NostrTransportService,
  RelayPublishResult,
} from "../services/NostrTransport";
import type { RelayPolicyService } from "../services/RelayPolicy";
import { wrapRumorFor } from "./giftWrap";
import type { Rumor } from "./nostrEvent";

export interface GiftWrapDeliveryContext {
  readonly identity: LinkstrIdentityService;
  readonly transport: NostrTransportService;
  readonly relayPolicy: RelayPolicyService;
}

export interface DeliveredCopies {
  readonly selfCopy: WrapDelivery;
  readonly recipientCopy: WrapDelivery;
}

const toWrapDelivery = (
  wrapId: WrapDelivery["wrapId"],
  results: ReadonlyArray<RelayPublishResult>,
): WrapDelivery =>
  new WrapDelivery({
    wrapId,
    acceptedBy: results.filter((r) => r.accepted).map((r) => r.relay),
    rejectedBy: results
      .filter((r) => !r.accepted)
      .map((r) => new RelayRejection({ relay: r.relay, detail: r.detail })),
  });

/**
 * NIP-17 delivery, shared by all verticals: the same rumor is wrapped twice —
 * once to self (cross-device echo), once to the peer — so both copies share
 * one rumor id. Success requires the recipient copy to be accepted by at
 * least one relay.
 */
export const deliverRumorToPeer = (
  { identity, relayPolicy, transport }: GiftWrapDeliveryContext,
  params: {
    readonly rumor: Rumor;
    readonly peer: Pubkey;
    readonly clientId: ClientId;
    readonly sentAt: UnixSeconds;
  },
): Effect.Effect<DeliveredCopies, RecipientNotReached | NoRelayReachable> =>
  Effect.gen(function* () {
    const { clientId, peer, rumor, sentAt } = params;
    const relays = relayPolicy.writeRelays;
    const [selfWrap, recipientWrap] = yield* Effect.all([
      Effect.sync(() =>
        wrapRumorFor(rumor, identity.secretKey, identity.pubkey),
      ),
      Effect.sync(() => wrapRumorFor(rumor, identity.secretKey, peer)),
    ]);
    const [selfResults, recipientResults] = yield* Effect.all(
      [
        transport.publish(relays, selfWrap),
        transport.publish(relays, recipientWrap),
      ],
      { concurrency: "unbounded" },
    );
    const copies: DeliveredCopies = {
      selfCopy: toWrapDelivery(selfWrap.id, selfResults),
      recipientCopy: toWrapDelivery(recipientWrap.id, recipientResults),
    };
    if (copies.recipientCopy.accepted) return copies;

    const failure = {
      rumorId: RumorId.make(rumor.id),
      clientId,
      sentAt,
      ...copies,
    };
    return yield* copies.selfCopy.accepted
      ? new RecipientNotReached(failure)
      : new NoRelayReachable(failure);
  });
