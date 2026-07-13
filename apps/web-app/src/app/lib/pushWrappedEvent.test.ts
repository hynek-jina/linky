import { describe, expect, it } from "vitest";
import {
  createLinkyPaymentNoticeEvent,
  isLinkyBankPaymentOfferPaymentNoticeEvent,
  LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
} from "./pushWrappedEvent";

describe("payment notice context", () => {
  it("marks proxy-payment reimbursements separately from ordinary payments", () => {
    const proxyNotice = createLinkyPaymentNoticeEvent({
      clientId: "proxy-notice",
      context: LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
      createdAt: 1_700_000_000,
      recipientPublicKey: "recipient",
      senderPublicKey: "sender",
    });
    const ordinaryNotice = createLinkyPaymentNoticeEvent({
      clientId: "ordinary-notice",
      createdAt: 1_700_000_000,
      recipientPublicKey: "recipient",
      senderPublicKey: "sender",
    });

    expect(isLinkyBankPaymentOfferPaymentNoticeEvent(proxyNotice)).toBe(true);
    expect(isLinkyBankPaymentOfferPaymentNoticeEvent(ordinaryNotice)).toBe(
      false,
    );
  });
});
