import { Effect } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { PaymentTelemetryNotDelivered } from "../domain/errors";
import { NostrSecretKey, Pubkey } from "../domain/primitives";
import { nowSeconds } from "../internal/time";
import { makeWrapSendContext, sendToRecipient } from "../internal/wrapSend";
import { encodePaymentTelemetryRumor } from "./codec";
import { PaymentTelemetryReceipt, type PaymentTelemetryDraft } from "./domain";

export class PaymentTelemetry extends Effect.Service<PaymentTelemetry>()(
  "linkstr/PaymentTelemetry",
  {
    effect: Effect.gen(function* () {
      const context = yield* makeWrapSendContext;

      /** Signed by a fresh ephemeral key per attempt, so nothing links sends. */
      const publishPaymentTelemetry = (
        draft: PaymentTelemetryDraft,
        recipient: Pubkey,
      ): Effect.Effect<PaymentTelemetryReceipt, PaymentTelemetryNotDelivered> =>
        Effect.gen(function* () {
          const senderSecretKey = NostrSecretKey.make(generateSecretKey());
          const author = Pubkey.make(getPublicKey(senderSecretKey));
          const sentAt = yield* nowSeconds;
          return yield* sendToRecipient(
            context,
            "paymentTelemetry.publish",
            { draft, recipient },
            {
              rumor: encodePaymentTelemetryRumor(
                draft,
                author,
                recipient,
                sentAt,
              ),
              recipient,
              clientId: draft.id,
              sentAt,
              senderSecretKey,
              receipt: (outcome) =>
                new PaymentTelemetryReceipt({
                  telemetryId: outcome.rumorId,
                  clientId: outcome.clientId,
                  sentAt: outcome.sentAt,
                  recipientCopy: outcome.recipientCopy,
                }),
              notDelivered: (outcome) =>
                new PaymentTelemetryNotDelivered({
                  telemetryId: outcome.rumorId,
                  clientId: outcome.clientId,
                  sentAt: outcome.sentAt,
                  recipientCopy: outcome.recipientCopy,
                }),
            },
          );
        });

      return { publishPaymentTelemetry } as const;
    }),
  },
) {}
