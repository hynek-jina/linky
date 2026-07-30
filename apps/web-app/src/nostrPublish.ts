import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { getSharedAppNostrPool } from "./app/lib/nostrPool";
import type { JsonRecord } from "./types/json";

export type PublishResult = {
  anySuccess: boolean;
};

export const publishKind0ProfileMetadata = async (params: {
  privBytes: Uint8Array;
  relays: string[];
  content: JsonRecord;
}): Promise<PublishResult> => {
  const { privBytes, relays, content } = params;
  const { finalizeEvent, getPublicKey } = await import("nostr-tools");

  const pubkey = getPublicKey(privBytes);

  const tags: string[][] = [];
  const baseEvent = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify(content),
    pubkey,
  } satisfies UnsignedEvent;

  const signed: NostrToolsEvent = finalizeEvent(baseEvent, privBytes);

  const pool = await getSharedAppNostrPool();
  const publishResults = await Promise.allSettled(pool.publish(relays, signed));
  const anySuccess = publishResults.some((r) => r.status === "fulfilled");
  return { anySuccess };
};
