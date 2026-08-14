import { Effect } from "effect";
import { PaymentNoticeNotDelivered } from "../domain/errors";
import { RumorId } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import {
  freshClientId,
  inspectOperation,
  nowSeconds,
} from "../internal/operations";
import type { OperationReceiptSummary } from "../internal/operations";
import { deliverRumorToRecipient } from "../internal/wrapDelivery";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import { NostrTransport } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { encodePaymentNoticeRumor } from "./codec";
import { PaymentNoticeReceipt, type PaymentNoticeDraft } from "./domain";

const summarizeReceipt = (
  receipt: PaymentNoticeReceipt,
): OperationReceiptSummary => ({
  rumorId: receipt.noticeId,
  clientId: receipt.clientId,
  sentAt: receipt.sentAt,
  selfCopy: null,
  recipientCopy: receipt.recipientCopy,
});

export class PaymentNotices extends Effect.Service<PaymentNotices>()(
  "linkstr/PaymentNotices",
  {
    effect: Effect.gen(function* () {
      const context = {
        identity: yield* LinkstrIdentity,
        transport: yield* NostrTransport,
        relayPolicy: yield* RelayPolicy,
      };
      const inspector = yield* Inspector.orNoop;

      const send = (
        draft: PaymentNoticeDraft,
      ): Effect.Effect<PaymentNoticeReceipt, PaymentNoticeNotDelivered> =>
        Effect.gen(function* () {
          const clientId = draft.clientId ?? (yield* freshClientId);
          const sentAt = yield* nowSeconds;
          const rumor = encodePaymentNoticeRumor(
            draft,
            context.identity.pubkey,
            sentAt,
            clientId,
          );
          const noticeId = RumorId.make(rumor.id);
          const recipientCopy = yield* deliverRumorToRecipient(context, {
            rumor,
            recipient: draft.to,
            pushMark: true,
          });
          if (!recipientCopy.accepted) {
            return yield* new PaymentNoticeNotDelivered({
              noticeId,
              clientId,
              sentAt,
              recipientCopy,
            });
          }
          return new PaymentNoticeReceipt({
            noticeId,
            clientId,
            sentAt,
            recipientCopy,
          });
        }).pipe(
          inspectOperation(
            inspector,
            "paymentNotices.send",
            draft,
            summarizeReceipt,
          ),
        );

      return { send } as const;
    }),
  },
) {}
