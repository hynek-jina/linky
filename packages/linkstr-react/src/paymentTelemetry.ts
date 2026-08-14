import { PaymentTelemetry } from "@linky/linkstr";
import type { PaymentTelemetryDraft, Pubkey } from "@linky/linkstr";
import { Effect } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

export interface PublishPaymentTelemetryParams {
  readonly draft: PaymentTelemetryDraft;
  readonly recipient: Pubkey;
}

export const publishPaymentTelemetryAtom =
  linkstrRuntimeAtom.fn<PublishPaymentTelemetryParams>()((params) =>
    Effect.flatMap(PaymentTelemetry, (paymentTelemetry) =>
      paymentTelemetry.publishPaymentTelemetry(params.draft, params.recipient),
    ),
  );
