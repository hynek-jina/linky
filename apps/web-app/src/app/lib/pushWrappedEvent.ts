export const LINKY_PAYMENT_NOTICE_KIND = 24133;
export const LINKY_PAYMENT_NOTICE_VALUE = "payment_notice";
export const LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER =
  "bank_payment_offer";
export function isLinkyBankPaymentOfferPaymentNoticeEvent(event: {
  kind: number;
  tags: string[][];
}): boolean {
  return (
    isLinkyPaymentNoticeEvent(event) &&
    event.tags.some(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === "context" &&
        tag[1] === LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
    )
  );
}

export function isLinkyPaymentNoticeEvent(event: {
  kind: number;
  tags: string[][];
}): boolean {
  return (
    event.kind === LINKY_PAYMENT_NOTICE_KIND &&
    event.tags.some(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === "linky" &&
        tag[1] === LINKY_PAYMENT_NOTICE_VALUE,
    )
  );
}
