import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { wrapEvent } from "nostr-tools/nip59";

export const LINKY_PUSH_MARKER_TAG = "linky";
export const LINKY_PUSH_MARKER_VALUE = "push";
export const LINKY_PAYMENT_NOTICE_KIND = 24133;
export const LINKY_PAYMENT_NOTICE_VALUE = "payment_notice";
export const LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER =
  "bank_payment_offer";
export const LINKY_PAYMENT_TELEMETRY_KIND = 24134;

export function wrapEventWithoutPushMarker(
  event: Partial<UnsignedEvent>,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
): NostrToolsEvent {
  return wrapEvent(event, senderPrivateKey, recipientPublicKey);
}

export function hasLinkyPushMarker(event: { tags: string[][] }): boolean {
  return event.tags.some(
    (tag) =>
      Array.isArray(tag) &&
      tag[0] === LINKY_PUSH_MARKER_TAG &&
      tag[1] === LINKY_PUSH_MARKER_VALUE,
  );
}

export function getLinkyBankPaymentOfferPaymentNoticeOfferId(event: {
  kind: number;
  tags: string[][];
}): string | null {
  if (!isLinkyBankPaymentOfferPaymentNoticeEvent(event)) return null;

  const offerId = event.tags.find(
    (tag) => Array.isArray(tag) && tag[0] === "offer" && tag[1]?.trim(),
  )?.[1];
  return offerId?.trim() || null;
}

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
        tag[0] === LINKY_PUSH_MARKER_TAG &&
        tag[1] === LINKY_PAYMENT_NOTICE_VALUE,
    )
  );
}
