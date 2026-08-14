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
import {
  encodeEditRumor,
  encodeImageMessageRumor,
  encodeTextMessageRumor,
} from "./codec";
import {
  ChatMessageReceipt,
  MessageEditReceipt,
  type EditMessageDraft,
  type ImageMessageDraft,
  type TextMessageDraft,
} from "./domain";

const freshClientId = Effect.sync(() => ClientId.make(crypto.randomUUID()));

const nowSeconds = Clock.currentTimeMillis.pipe(
  Effect.map((millis) => UnixSeconds.make(Math.floor(millis / 1000))),
);

const inspectOperation =
  (inspector: InspectorService, name: string, params: unknown) =>
  <A extends ChatMessageReceipt | MessageEditReceipt, E>(
    operation: Effect.Effect<A, E>,
  ): Effect.Effect<A, E> =>
    operation.pipe(
      Effect.tap((receipt) =>
        Effect.sync(() =>
          inspector.emit(
            new OperationSucceeded({
              name,
              params,
              rumorId: receipt.messageId,
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

export class Chat extends Effect.Service<Chat>()("linkstr/Chat", {
  effect: Effect.gen(function* () {
    const context = {
      identity: yield* LinkstrIdentity,
      transport: yield* NostrTransport,
      relayPolicy: yield* RelayPolicy,
    };
    const inspector = yield* Inspector.orNoop;

    const sendText = (
      draft: TextMessageDraft,
    ): Effect.Effect<
      ChatMessageReceipt,
      RecipientNotReached | NoRelayReachable
    > =>
      Effect.gen(function* () {
        const clientId = draft.clientId ?? (yield* freshClientId);
        const sentAt = yield* nowSeconds;
        const rumor = encodeTextMessageRumor(
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
          pushMarkRecipientCopy: true,
        });
        return new ChatMessageReceipt({
          messageId: RumorId.make(rumor.id),
          clientId,
          sentAt,
          ...copies,
        });
      }).pipe(inspectOperation(inspector, "chat.sendText", draft));

    const sendImage = (
      draft: ImageMessageDraft,
    ): Effect.Effect<
      ChatMessageReceipt,
      RecipientNotReached | NoRelayReachable
    > =>
      Effect.gen(function* () {
        const clientId = draft.clientId ?? (yield* freshClientId);
        const sentAt = yield* nowSeconds;
        const rumor = encodeImageMessageRumor(
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
          pushMarkRecipientCopy: true,
        });
        return new ChatMessageReceipt({
          messageId: RumorId.make(rumor.id),
          clientId,
          sentAt,
          ...copies,
        });
      }).pipe(inspectOperation(inspector, "chat.sendImage", draft));

    const edit = (
      draft: EditMessageDraft,
    ): Effect.Effect<
      MessageEditReceipt,
      RecipientNotReached | NoRelayReachable
    > =>
      Effect.gen(function* () {
        const clientId = draft.clientId ?? (yield* freshClientId);
        const sentAt = yield* nowSeconds;
        const rumor = encodeEditRumor(
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
        return new MessageEditReceipt({
          messageId: RumorId.make(rumor.id),
          editOf: draft.editOf,
          clientId,
          sentAt,
          ...copies,
        });
      }).pipe(inspectOperation(inspector, "chat.edit", draft));

    return { sendText, sendImage, edit } as const;
  }),
}) {}
