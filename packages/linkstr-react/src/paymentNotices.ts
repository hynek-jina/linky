import { PaymentNotices } from "@linky/linkstr";
import type { PaymentNoticeDraft } from "@linky/linkstr";
import { Effect } from "effect";
import { linkstrRuntimeAtom } from "./runtime";

export const sendPaymentNoticeAtom =
  linkstrRuntimeAtom.fn<PaymentNoticeDraft>()((draft) =>
    Effect.flatMap(PaymentNotices, (paymentNotices) =>
      paymentNotices.send(draft),
    ),
  );
