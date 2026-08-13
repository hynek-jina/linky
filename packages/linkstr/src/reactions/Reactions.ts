import { Clock, Effect } from "effect";
import type { NoRelayReachable, RecipientNotReached } from "../domain/errors";
import { ClientId, RumorId, UnixSeconds } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import type { InspectorService } from "../inspector/Inspector";
import { OperationFailed, OperationSucceeded } from "../inspector/events";
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

const inspectOperation =
  (inspector: InspectorService, name: string, params: unknown) =>
  <A extends ReactionReceipt | RetractionReceipt, E>(
    operation: Effect.Effect<A, E>,
  ): Effect.Effect<A, E> =>
    operation.pipe(
      Effect.tap((receipt) =>
        Effect.sync(() =>
          inspector.emit(
            new OperationSucceeded({
              name,
              params,
              rumorId:
                receipt instanceof ReactionReceipt
                  ? receipt.reactionId
                  : receipt.retractionId,
              clientId: receipt.clientId,
              sentAt: receipt.sentAt,
              selfCopy: receipt.selfCopy,
              recipientCopy: receipt.recipientCopy,
            }),
          ),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() =>
          inspector.emit(new OperationFailed({ name, params, error })),
        ),
      ),
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
      const inspector = yield* Inspector.orNoop;

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
        }).pipe(inspectOperation(inspector, "reactions.react", draft));

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
        }).pipe(inspectOperation(inspector, "reactions.retract", draft));

      return { react, retract } as const;
    }),
  },
) {}
