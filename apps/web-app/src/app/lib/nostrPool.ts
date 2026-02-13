import type { Event as NostrToolsEvent } from "nostr-tools";

export type AppNostrPool = {
  publish: (
    relays: string[],
    event: NostrToolsEvent,
  ) => Array<Promise<unknown>>;
  querySync: (
    relays: string[],
    filter: Record<string, unknown>,
    opts: { maxWait: number },
  ) => Promise<unknown>;
  subscribe: (
    relays: string[],
    filter: Record<string, unknown>,
    opts: { onevent: (event: NostrToolsEvent) => void },
  ) => { close: (reason?: string) => Promise<void> | void };
};

let sharedAppNostrPoolPromise: Promise<AppNostrPool> | null = null;

export const getSharedAppNostrPool = async (): Promise<AppNostrPool> => {
  if (sharedAppNostrPoolPromise) return sharedAppNostrPoolPromise;

  sharedAppNostrPoolPromise = (async () => {
    const { SimplePool } = await import("nostr-tools");
    const pool = new SimplePool();
    return pool as unknown as AppNostrPool;
  })().catch((error) => {
    sharedAppNostrPoolPromise = null;
    throw error;
  });

  return sharedAppNostrPoolPromise;
};
