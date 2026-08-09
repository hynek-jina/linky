import { Clock, Effect } from "effect";
import { RelayRejection, WrapDelivery } from "../domain/delivery";
import { NoRelayReachable, RecipientNotReached } from "../domain/errors";
import { ClientId, RumorId, UnixSeconds } from "../domain/primitives";
import type { Pubkey } from "../domain/primitives";
import { wrapRumorFor } from "../internal/giftWrap";
import type { Rumor } from "../internal/nostrEvent";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import { NostrTransport } from "../services/NostrTransport";
import type { RelayPublishResult } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { encodeReactionRumor, encodeRetractionRumor } from "./codec";
import {
  ReactionReceipt,
  RetractionReceipt,
  type ReactionDraft,
  type RetractionDraft,
} from "./domain";

const freshClientId = Effect.sync(() => ClientId.make(crypto.randomUUID()));

const nowSeconds = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => UnixSeconds.make(Math.floor(millis / 1000))),
);

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

interface WrapPublishOutcome {
  readonly selfCopy: WrapDelivery;
  readonly recipientCopy: WrapDelivery;
}

export class Reactions extends Effect.Service<Reactions>()(
  "linkstr/Reactions",
  {
    effect: Effect.gen(function* () {
      const identity = yield* LinkstrIdentity;
      const transport = yield* NostrTransport;
      const relayPolicy = yield* RelayPolicy;

      /**
       * NIP-17: the same rumor is wrapped twice — once to self (cross-device
       * echo), once to the peer — so both copies share one rumor id.
       */
      const publishToPeer = (
        rumor: Rumor,
        peer: Pubkey,
      ): Effect.Effect<WrapPublishOutcome> =>
        Effect.gen(function* () {
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
          return {
            selfCopy: toWrapDelivery(selfWrap.id, selfResults),
            recipientCopy: toWrapDelivery(recipientWrap.id, recipientResults),
          };
        });

      const deliverRumor = (
        rumor: Rumor,
        peer: Pubkey,
        clientId: ClientId,
      ): Effect.Effect<
        WrapPublishOutcome,
        RecipientNotReached | NoRelayReachable
      > =>
        Effect.gen(function* () {
          const outcome = yield* publishToPeer(rumor, peer);
          if (outcome.recipientCopy.accepted) return outcome;
          if (outcome.selfCopy.accepted) {
            return yield* new RecipientNotReached({
              rumorId: RumorId.make(rumor.id),
              clientId,
              selfCopy: outcome.selfCopy,
              recipientCopy: outcome.recipientCopy,
            });
          }
          return yield* new NoRelayReachable({
            relays: relayPolicy.writeRelays,
          });
        });

      const react = (
        draft: ReactionDraft,
      ): Effect.Effect<
        ReactionReceipt,
        RecipientNotReached | NoRelayReachable
      > =>
        Effect.gen(function* () {
          const clientId = draft.clientId ?? (yield* freshClientId);
          const sentAt = yield* nowSeconds;
          const rumor = encodeReactionRumor(
            draft,
            identity.pubkey,
            sentAt,
            clientId,
          );
          const { selfCopy, recipientCopy } = yield* deliverRumor(
            rumor,
            draft.to,
            clientId,
          );
          return new ReactionReceipt({
            reactionId: RumorId.make(rumor.id),
            clientId,
            sentAt,
            selfCopy,
            recipientCopy,
          });
        });

      const retract = (
        draft: RetractionDraft,
      ): Effect.Effect<
        RetractionReceipt,
        RecipientNotReached | NoRelayReachable
      > =>
        Effect.gen(function* () {
          const clientId = draft.clientId ?? (yield* freshClientId);
          const sentAt = yield* nowSeconds;
          const rumor = encodeRetractionRumor(
            draft,
            identity.pubkey,
            sentAt,
            clientId,
          );
          const { selfCopy, recipientCopy } = yield* deliverRumor(
            rumor,
            draft.to,
            clientId,
          );
          return new RetractionReceipt({
            retractionId: RumorId.make(rumor.id),
            clientId,
            sentAt,
            selfCopy,
            recipientCopy,
          });
        });

      return { react, retract } as const;
    }),
  },
) {}
