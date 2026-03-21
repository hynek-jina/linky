import type { NostrEvent as NostrToolsEvent } from "nostr-tools";
import type { NostrPublicKeyHex } from "../identity";
import type { NostrEventId } from "./domain";

export type PublishedNostrEvent = NostrToolsEvent;

export interface GiftWrappedPublishedEvent {
  event: PublishedNostrEvent;
  recipient: NostrPublicKeyHex;
}

export interface GiftWrappedPublishReceipt {
  rumorId: NostrEventId;
  wraps: ReadonlyArray<GiftWrappedPublishedEvent>;
}
