import type {
  Event as NostrToolsEvent,
  Filter,
  SimplePool as NostrToolsSimplePool,
} from "nostr-tools";

type NostrPool = Pick<NostrToolsSimplePool, "publish" | "querySync"> & {
  subscribe: (
    relays: string[],
    filter: Filter,
    opts: { onevent: (event: NostrToolsEvent) => void; maxWait?: number },
  ) => { close: (reason?: string) => void };
};

let sharedPoolPromise: Promise<NostrPool> | null = null;

export const getSharedNostrPool = async (): Promise<NostrPool> => {
  if (sharedPoolPromise) return sharedPoolPromise;

  sharedPoolPromise = (async () => {
    const { SimplePool } = await import("nostr-tools");
    return new SimplePool();
  })().catch((error) => {
    sharedPoolPromise = null;
    throw error;
  });

  return sharedPoolPromise;
};
