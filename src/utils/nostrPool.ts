import type { Event as NostrToolsEvent } from "nostr-tools";

type NostrPool = {
  publish: (
    relays: string[],
    event: NostrToolsEvent
  ) => Array<Promise<unknown>>;
  querySync: (
    relays: string[],
    filter: Record<string, unknown>,
    opts: { maxWait: number }
  ) => Promise<unknown>;
  subscribe: (
    relays: string[],
    filters: any[],
    opts: { onevent: (event: NostrToolsEvent) => void }
  ) => { close: (reason?: string) => Promise<void> | void };
};

let sharedPoolPromise: Promise<NostrPool> | null = null;

export const getSharedNostrPool = async (): Promise<NostrPool> => {
  if (sharedPoolPromise) return sharedPoolPromise;

  sharedPoolPromise = (async () => {
    const { SimplePool } = await import("nostr-tools");
    const pool = new SimplePool();
    return pool as unknown as NostrPool;
  })().catch((error) => {
    sharedPoolPromise = null;
    throw error;
  });

  return sharedPoolPromise;
};
