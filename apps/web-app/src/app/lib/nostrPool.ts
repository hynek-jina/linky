import type { SimplePool as NostrToolsSimplePool } from "nostr-tools";

export type AppNostrPool = Pick<
  NostrToolsSimplePool,
  "publish" | "querySync" | "subscribe"
>;

let sharedAppNostrPoolPromise: Promise<AppNostrPool> | null = null;

export const getSharedAppNostrPool = async (): Promise<AppNostrPool> => {
  if (sharedAppNostrPoolPromise) return sharedAppNostrPoolPromise;

  sharedAppNostrPoolPromise = (async () => {
    const { SimplePool } = await import("nostr-tools");
    return new SimplePool();
  })().catch((error) => {
    sharedAppNostrPoolPromise = null;
    throw error;
  });

  return sharedAppNostrPoolPromise;
};
