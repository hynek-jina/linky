import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { getSharedNostrPool } from "./utils/nostrPool";

export type PublishResult = {
  anySuccess: boolean;
  publishedTo: string[];
};

export const publishKind0ProfileMetadata = async (params: {
  privBytes: Uint8Array;
  relays: string[];
  content: Record<string, unknown>;
}): Promise<PublishResult> => {
  const { privBytes, relays, content } = params;
  const { finalizeEvent, getPublicKey } = await import("nostr-tools");

  const pubkey = getPublicKey(privBytes);

  const baseEvent = {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [] as string[][],
    content: JSON.stringify(content),
    pubkey,
  } satisfies UnsignedEvent;

  const signed: NostrToolsEvent = finalizeEvent(baseEvent, privBytes);

  const pool = await getSharedNostrPool();
  const publishResults = await Promise.allSettled(pool.publish(relays, signed));
  const anySuccess = publishResults.some((r) => r.status === "fulfilled");
  return {
    anySuccess,
    publishedTo: relays,
  };
};
