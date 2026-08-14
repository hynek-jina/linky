import { Effect } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { PaymentTelemetryNotDelivered } from "../domain/errors";
import { NostrSecretKey, Pubkey, RumorId } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import { inspectOperation, nowSeconds } from "../internal/operations";
import type { OperationReceiptSummary } from "../internal/operations";
import { deliverRumorToRecipient } from "../internal/wrapDelivery";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import { NostrTransport } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { encodePaymentTelemetryRumor } from "./codec";
import { PaymentTelemetryReceipt, type PaymentTelemetryDraft } from "./domain";

const summarizeReceipt = (
  receipt: PaymentTelemetryReceipt,
): OperationReceiptSummary => ({
  rumorId: receipt.telemetryId,
  clientId: receipt.clientId,
  sentAt: receipt.sentAt,
  selfCopy: null,
  recipientCopy: receipt.recipientCopy,
});

export class PaymentTelemetry extends Effect.Service<PaymentTelemetry>()(
  "linkstr/PaymentTelemetry",
  {
    effect: Effect.gen(function* () {
      const context = {
        identity: yield* LinkstrIdentity,
        transport: yield* NostrTransport,
        relayPolicy: yield* RelayPolicy,
      };
      const inspector = yield* Inspector.orNoop;

      const publishPaymentTelemetry = (
        draft: PaymentTelemetryDraft,
        recipient: Pubkey,
      ): Effect.Effect<PaymentTelemetryReceipt, PaymentTelemetryNotDelivered> =>
        Effect.gen(function* () {
          const senderSecretKey = NostrSecretKey.make(generateSecretKey());
          const author = Pubkey.make(getPublicKey(senderSecretKey));
          const sentAt = yield* nowSeconds;
          const rumor = encodePaymentTelemetryRumor(
            draft,
            author,
            recipient,
            sentAt,
          );
          const telemetryId = RumorId.make(rumor.id);
          const recipientCopy = yield* deliverRumorToRecipient(context, {
            rumor,
            recipient,
            senderSecretKey,
          });
          if (!recipientCopy.accepted) {
            return yield* new PaymentTelemetryNotDelivered({
              telemetryId,
              clientId: draft.id,
              sentAt,
              recipientCopy,
            });
          }
          return new PaymentTelemetryReceipt({
            telemetryId,
            clientId: draft.id,
            sentAt,
            recipientCopy,
          });
        }).pipe(
          inspectOperation(
            inspector,
            "paymentTelemetry.publish",
            { draft, recipient },
            summarizeReceipt,
          ),
        );

      return { publishPaymentTelemetry } as const;
    }),
  },
) {}
