import { describe, expect, it } from "vitest";
import {
  isLinkyBankPaymentOfferPaymentNoticeEvent,
  LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
  LINKY_PAYMENT_NOTICE_KIND,
} from "./pushWrappedEvent";

const paymentNotice = (extraTags: string[][] = []) => ({
  kind: LINKY_PAYMENT_NOTICE_KIND,
  tags: [
    ["p", "recipient"],
    ["p", "sender"],
    ["client", "notice-client"],
    ["linky", "payment_notice"],
    ...extraTags,
  ],
});

describe("payment notice context", () => {
  it("marks proxy-payment reimbursements separately from ordinary payments", () => {
    const proxyNotice = paymentNotice([
      ["context", LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER],
      ["offer", "offer-123"],
    ]);
    const ordinaryNotice = paymentNotice();

    expect(isLinkyBankPaymentOfferPaymentNoticeEvent(proxyNotice)).toBe(true);
    expect(isLinkyBankPaymentOfferPaymentNoticeEvent(ordinaryNotice)).toBe(
      false,
    );
  });
});
