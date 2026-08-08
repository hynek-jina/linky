import type { AbstractSimplePool } from "nostr-tools/pool";

export type AppNostrPool = Pick<
  AbstractSimplePool,
  "listConnectionStatus" | "publish" | "querySync" | "subscribe"
>;

let sharedAppNostrPoolPromise: Promise<AppNostrPool> | null = null;

export const getSharedAppNostrPool = async (): Promise<AppNostrPool> => {
  if (sharedAppNostrPoolPromise) return sharedAppNostrPoolPromise;

  sharedAppNostrPoolPromise = (async () => {
    const { createNostrPool } = await import("./createNostrPool");
    // Without these, a dropped relay websocket (mobile background, network
    // switch) permanently kills live subscriptions like the inbox sync; ping
    // detects half-dead sockets and reconnect resumes subs with since=last+1.
    return createNostrPool({ enablePing: true, enableReconnect: true });
  })().catch((error) => {
    sharedAppNostrPoolPromise = null;
    throw error;
  });

  return sharedAppNostrPoolPromise;
};
