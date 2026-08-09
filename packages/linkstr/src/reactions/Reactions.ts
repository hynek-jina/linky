import { Clock, Effect } from "effect";
import type { NoRelayReachable, RecipientNotReached } from "../domain/errors";
import { ClientId, RumorId, UnixSeconds } from "../domain/primitives";
import { deliverRumorToPeer } from "../internal/wrapDelivery";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import { NostrTransport } from "../services/NostrTransport";
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

export class Reactions extends Effect.Service<Reactions>()(
  "linkstr/Reactions",
  {
    effect: Effect.gen(function* () {
      const context = {
        identity: yield* LinkstrIdentity,
        transport: yield* NostrTransport,
        relayPolicy: yield* RelayPolicy,
      };

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
            context.identity.pubkey,
            sentAt,
            clientId,
          );
          const copies = yield* deliverRumorToPeer(context, {
            rumor,
            peer: draft.to,
            clientId,
            sentAt,
          });
          return new ReactionReceipt({
            reactionId: RumorId.make(rumor.id),
            clientId,
            sentAt,
            ...copies,
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
            context.identity.pubkey,
            sentAt,
            clientId,
          );
          const copies = yield* deliverRumorToPeer(context, {
            rumor,
            peer: draft.to,
            clientId,
            sentAt,
          });
          return new RetractionReceipt({
            retractionId: RumorId.make(rumor.id),
            clientId,
            sentAt,
            ...copies,
          });
        });

      return { react, retract } as const;
    }),
  },
) {}
