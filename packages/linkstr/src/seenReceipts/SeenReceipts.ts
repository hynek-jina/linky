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
import { encodeSeenReceiptRumor } from "./codec";
import { SeenReceiptSendReceipt, type SeenReceiptDraft } from "./domain";

const summarizeReceipt = (
  receipt: SeenReceiptSendReceipt,
): OperationReceiptSummary => ({
  rumorId: receipt.receiptId,
  clientId: receipt.clientId,
  sentAt: receipt.sentAt,
  selfCopy: receipt.selfCopy,
  recipientCopy: receipt.recipientCopy,
});

export class SeenReceipts extends Effect.Service<SeenReceipts>()(
  "linkstr/SeenReceipts",
  {
    effect: Effect.gen(function* () {
      const context = {
        identity: yield* LinkstrIdentity,
        transport: yield* NostrTransport,
        relayPolicy: yield* RelayPolicy,
      };
      const inspector = yield* Inspector.orNoop;

      const send = (
        draft: SeenReceiptDraft,
      ): Effect.Effect<
        SeenReceiptSendReceipt,
        RecipientNotReached | NoRelayReachable
      > =>
        Effect.gen(function* () {
          const clientId = draft.clientId ?? (yield* freshClientId);
          const sentAt = draft.sentAt ?? (yield* nowSeconds);
          const rumor = encodeSeenReceiptRumor(
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
          return new SeenReceiptSendReceipt({
            receiptId: RumorId.make(rumor.id),
            clientId,
            sentAt,
            ...copies,
          });
        }).pipe(
          inspectOperation(
            inspector,
            "seenReceipts.send",
            draft,
            summarizeReceipt,
          ),
        );

      return { send } as const;
    }),
  },
) {}
