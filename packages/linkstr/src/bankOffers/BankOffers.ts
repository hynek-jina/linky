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
import { encodeBankOfferRumor } from "./codec";
import {
  BankOfferReceipt,
  shouldPushBankOfferStatus,
  type BankOfferDraft,
} from "./domain";

const summarizeReceipt = (
  receipt: BankOfferReceipt,
): OperationReceiptSummary => ({
  rumorId: receipt.snapshotId,
  clientId: receipt.clientId,
  sentAt: receipt.sentAt,
  selfCopy: receipt.selfCopy,
  recipientCopy: receipt.recipientCopy,
});

export class BankOffers extends Effect.Service<BankOffers>()(
  "linkstr/BankOffers",
  {
    effect: Effect.gen(function* () {
      const context = {
        identity: yield* LinkstrIdentity,
        transport: yield* NostrTransport,
        relayPolicy: yield* RelayPolicy,
      };
      const inspector = yield* Inspector.orNoop;

      const send = (
        draft: BankOfferDraft,
      ): Effect.Effect<
        BankOfferReceipt,
        RecipientNotReached | NoRelayReachable
      > =>
        Effect.gen(function* () {
          const clientId = draft.clientId ?? (yield* freshClientId);
          const sentAt = yield* nowSeconds;
          const rumor = encodeBankOfferRumor(
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
            pushMarkRecipientCopy:
              draft.pushMark ?? shouldPushBankOfferStatus(draft.status),
            order: "recipientFirst",
          });
          return new BankOfferReceipt({
            snapshotId: RumorId.make(rumor.id),
            offerId: draft.offerId,
            status: draft.status,
            content: rumor.content,
            clientId,
            sentAt,
            ...copies,
          });
        }).pipe(
          inspectOperation(
            inspector,
            "bankOffers.send",
            draft,
            summarizeReceipt,
          ),
        );

      return { send } as const;
    }),
  },
) {}
