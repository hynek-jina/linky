import type { Event as NostrEvent } from "nostr-tools";

export type ProofAction = "subscribe" | "unsubscribe";

export interface WebPushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface WebPushSubscriptionData {
  endpoint: string;
  expirationTime: number | null;
  keys: WebPushSubscriptionKeys;
}

export interface OwnershipProofInput {
  pubkey: string;
  event: NostrEvent;
}

export interface ChallengeRecord {
  nonce: string;
  pubkey: string;
  action: ProofAction;
  expiresAt: number;
  usedAt: number | null;
}

export interface StoredSubscription {
  id: number;
  endpoint: string;
  expirationTime: number | null;
  keys: WebPushSubscriptionKeys;
}

export interface PushNotificationData {
  type: "nostr_inbox";
  outerEventId: string;
  recipientPubkey: string;
  createdAt: number;
  relayHints: string[];
}

export interface PushNotificationEnvelope {
  title: string;
  body: string;
  data: PushNotificationData;
}

export interface SubscribeRequestBody {
  installationId: string | null;
  subscription: WebPushSubscriptionData;
  recipientPubkeys: string[];
  proofs: OwnershipProofInput[];
}

export interface UnsubscribeRequestBody {
  endpoint: string;
  recipientPubkeys: string[] | null;
  proofs: OwnershipProofInput[];
}
