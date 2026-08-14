import { Effect } from "effect";
import type { NoRelayReachable, RecipientNotReached } from "../domain/errors";
import { RumorId } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import {
  freshClientId,
  inspectOperation,
  nowSeconds,
} from "../internal/operations";
import type { OperationReceiptSummary } from "../internal/operations";
import { deliverRumorToPeer } from "../internal/wrapDelivery";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import { NostrTransport } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import {
  encodeEditRumor,
  encodeImageMessageRumor,
  encodeTextMessageRumor,
  encodeTokenMessageRumor,
} from "./codec";
import {
  ChatMessageReceipt,
  MessageEditReceipt,
  type EditMessageDraft,
  type ImageMessageDraft,
  type TextMessageDraft,
  type TokenMessageDraft,
} from "./domain";

const summarizeReceipt = (
  receipt: ChatMessageReceipt | MessageEditReceipt,
): OperationReceiptSummary => ({
  rumorId: receipt.messageId,
  clientId: receipt.clientId,
  sentAt: receipt.sentAt,
  selfCopy: receipt.selfCopy,
  recipientCopy: receipt.recipientCopy,
});

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
        const sentAt = draft.sentAt ?? (yield* nowSeconds);
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
      }).pipe(
        inspectOperation(inspector, "chat.sendText", draft, summarizeReceipt),
      );

    const sendImage = (
      draft: ImageMessageDraft,
    ): Effect.Effect<
      ChatMessageReceipt,
      RecipientNotReached | NoRelayReachable
    > =>
      Effect.gen(function* () {
        const clientId = draft.clientId ?? (yield* freshClientId);
        const sentAt = draft.sentAt ?? (yield* nowSeconds);
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
      }).pipe(
        inspectOperation(inspector, "chat.sendImage", draft, summarizeReceipt),
      );

    const sendToken = (
      draft: TokenMessageDraft,
    ): Effect.Effect<
      ChatMessageReceipt,
      RecipientNotReached | NoRelayReachable
    > =>
      Effect.gen(function* () {
        const clientId = draft.clientId ?? (yield* freshClientId);
        const sentAt = draft.sentAt ?? (yield* nowSeconds);
        const rumor = encodeTokenMessageRumor(
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
        return new ChatMessageReceipt({
          messageId: RumorId.make(rumor.id),
          clientId,
          sentAt,
          ...copies,
        });
      }).pipe(
        inspectOperation(inspector, "chat.sendToken", draft, summarizeReceipt),
      );

    const edit = (
      draft: EditMessageDraft,
    ): Effect.Effect<
      MessageEditReceipt,
      RecipientNotReached | NoRelayReachable
    > =>
      Effect.gen(function* () {
        const clientId = draft.clientId ?? (yield* freshClientId);
        const sentAt = draft.sentAt ?? (yield* nowSeconds);
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
      }).pipe(
        inspectOperation(inspector, "chat.edit", draft, summarizeReceipt),
      );

    return { sendText, sendImage, sendToken, edit } as const;
  }),
}) {}
