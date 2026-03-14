import { finalizeEvent, generateSecretKey } from "nostr-tools";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { encrypt, getConversationKey } from "nostr-tools/nip44";
import { createRumor, createSeal, wrapEvent } from "nostr-tools/nip59";

const GIFT_WRAP_KIND = 1059;
const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60;

export const LINKY_PUSH_MARKER_TAG = "linky";
export const LINKY_PUSH_MARKER_VALUE = "push";
export const LINKY_PAYMENT_NOTICE_KIND = 24133;
export const LINKY_PAYMENT_NOTICE_VALUE = "payment_notice";

function currentTimestampSeconds(): number {
  return Math.round(Date.now() / 1000);
}

function randomTimestampSeconds(): number {
  return Math.round(
    currentTimestampSeconds() - Math.random() * TWO_DAYS_SECONDS,
  );
}

function encryptSealForRecipient(
  seal: NostrToolsEvent,
  randomKey: Uint8Array,
  recipientPublicKey: string,
): string {
  const conversationKey = getConversationKey(randomKey, recipientPublicKey);
  return encrypt(JSON.stringify(seal), conversationKey);
}

function createPushMarkedWrap(
  seal: NostrToolsEvent,
  recipientPublicKey: string,
): NostrToolsEvent {
  const randomKey = generateSecretKey();

  return finalizeEvent(
    {
      kind: GIFT_WRAP_KIND,
      content: encryptSealForRecipient(seal, randomKey, recipientPublicKey),
      created_at: randomTimestampSeconds(),
      tags: [
        ["p", recipientPublicKey],
        [LINKY_PUSH_MARKER_TAG, LINKY_PUSH_MARKER_VALUE],
      ],
    },
    randomKey,
  );
}

export function wrapEventWithoutPushMarker(
  event: Partial<UnsignedEvent>,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
): NostrToolsEvent {
  return wrapEvent(event, senderPrivateKey, recipientPublicKey);
}

export function wrapEventWithPushMarker(
  event: Partial<UnsignedEvent>,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
): NostrToolsEvent {
  const rumor = createRumor(event, senderPrivateKey);
  const seal = createSeal(rumor, senderPrivateKey, recipientPublicKey);
  return createPushMarkedWrap(seal, recipientPublicKey);
}

export function hasLinkyPushMarker(event: { tags: string[][] }): boolean {
  return event.tags.some(
    (tag) =>
      Array.isArray(tag) &&
      tag[0] === LINKY_PUSH_MARKER_TAG &&
      tag[1] === LINKY_PUSH_MARKER_VALUE,
  );
}

export function createLinkyPaymentNoticeEvent(args: {
  clientId: string;
  createdAt: number;
  recipientPublicKey: string;
  senderPublicKey: string;
}): UnsignedEvent {
  return {
    created_at: args.createdAt,
    kind: LINKY_PAYMENT_NOTICE_KIND,
    pubkey: args.senderPublicKey,
    tags: [
      ["p", args.recipientPublicKey],
      ["p", args.senderPublicKey],
      ["client", args.clientId],
      [LINKY_PUSH_MARKER_TAG, LINKY_PAYMENT_NOTICE_VALUE],
    ],
    content: LINKY_PAYMENT_NOTICE_VALUE,
  };
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
