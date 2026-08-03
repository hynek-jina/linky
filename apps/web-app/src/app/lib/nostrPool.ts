import type { SimplePool as NostrToolsSimplePool } from "nostr-tools";

export type AppNostrPool = Pick<
  NostrToolsSimplePool,
  "listConnectionStatus" | "publish" | "querySync" | "subscribe"
>;

let sharedAppNostrPoolPromise: Promise<AppNostrPool> | null = null;

export const getSharedAppNostrPool = async (): Promise<AppNostrPool> => {
  if (sharedAppNostrPoolPromise) return sharedAppNostrPoolPromise;

  sharedAppNostrPoolPromise = (async () => {
    const { SimplePool } = await import("nostr-tools");
    // Without these, a dropped relay websocket (mobile background, network
    // switch) permanently kills live subscriptions like the inbox sync; ping
    // detects half-dead sockets and reconnect resumes subs with since=last+1.
    return new SimplePool({ enablePing: true, enableReconnect: true });
  })().catch((error) => {
    sharedAppNostrPoolPromise = null;
    throw error;
  });

  return sharedAppNostrPoolPromise;
};
