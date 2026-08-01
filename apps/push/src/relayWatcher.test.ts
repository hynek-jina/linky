import { describe, expect, it } from "bun:test";
import type { VerifiedEvent } from "nostr-tools";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { SubCloser, SubscribeManyParams } from "nostr-tools/abstract-pool";
import type { Filter } from "nostr-tools/filter";

import type {
  RelayWatcherPool,
  RelayWatcherPushDelivery,
  RelayWatcherStorage,
} from "./relayWatcher";
import { RelayWatcher, SeenEventIdCache } from "./relayWatcher";
import type {
  PushNotificationData,
  StoredNativeSubscription,
  StoredSubscription,
} from "./types";

describe("SeenEventIdCache", () => {
  it("drops expired entries on direct lookup", () => {
    const cache = new SeenEventIdCache({
      ttlMs: 10,
      maxEntries: 10,
    });

    cache.markSeen("event-1", 100);

    expect(cache.has("event-1", 109)).toBe(true);
    expect(cache.has("event-1", 110)).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("prunes only expired prefixes during periodic cleanup", () => {
    const cache = new SeenEventIdCache({
      ttlMs: 10,
      maxEntries: 10,
    });

    cache.markSeen("event-1", 100);
    cache.markSeen("event-2", 105);
    cache.markSeen("event-3", 120);

    cache.pruneExpired(115);

    expect(cache.size).toBe(1);
    expect(cache.has("event-1", 115)).toBe(false);
    expect(cache.has("event-2", 115)).toBe(false);
    expect(cache.has("event-3", 115)).toBe(true);
  });

  it("evicts the oldest cached ids when the cache reaches capacity", () => {
    const cache = new SeenEventIdCache({
      ttlMs: 100,
      maxEntries: 2,
    });

    cache.markSeen("event-1", 100);
    cache.markSeen("event-2", 101);
    cache.markSeen("event-3", 102);

    expect(cache.size).toBe(2);
    expect(cache.has("event-1", 150)).toBe(false);
    expect(cache.has("event-2", 150)).toBe(true);
    expect(cache.has("event-3", 150)).toBe(true);
  });
});

const recipientPubkey = getPublicKey(generateSecretKey());

// Fixtures must be really signed: validateGiftWrapForPush runs verifyEvent, so a
// hand-built unsigned event is rejected before the delivery path is reached and
// every "no delivery" assertion would pass vacuously against broken and fixed
// code alike.
function makeGiftWrap(seed: number): VerifiedEvent {
  return finalizeEvent(
    {
      kind: 1059,
      created_at: Math.floor(Date.now() / 1000) - seed,
      content: `ciphertext-${seed}`,
      tags: [
        ["p", recipientPubkey, "wss://relay.hint"],
        ["linky", "push"],
      ],
    },
    generateSecretKey(),
  );
}

interface RelayWatcherHarness {
  calls: string[];
  webDeliveries: PushNotificationData[];
  nativeDeliveries: PushNotificationData[];
  watcher: RelayWatcher;
  openedSubscriptions: SubscribeManyParams[];
}

function makeHarness(): RelayWatcherHarness {
  const calls: string[] = [];
  const webDeliveries: PushNotificationData[] = [];
  const nativeDeliveries: PushNotificationData[] = [];
  const persistedSeen = new Set<string>();

  const webSubscription: StoredSubscription = {
    id: 1,
    endpoint: "https://push.example/endpoint-1",
    installationId: "install-1",
    expirationTime: null,
    keys: { p256dh: "p256dh-1", auth: "auth-1" },
  };
  const nativeSubscription: StoredNativeSubscription = {
    id: 2,
    installationId: "install-1",
    platform: "android",
    token: "fcm-token-1",
  };

  const storage: RelayWatcherStorage = {
    // The trailing firstSeenAt parameter is omitted rather than named `_firstSeenAt`:
    // typescript-eslint's no-unused-vars runs with args: "after-used" and no `^_`
    // ignore pattern here, so a trailing placeholder would be a lint error.
    recordSeenEvent(eventId) {
      calls.push(`recordSeenEvent:${eventId}`);
      if (persistedSeen.has(eventId)) {
        return false;
      }
      persistedSeen.add(eventId);
      return true;
    },
    pruneSeenEvents() {},
    getSubscriptionsForPubkeys(pubkeys) {
      const out = new Map<string, StoredSubscription[]>();
      for (const pubkey of pubkeys) {
        if (pubkey === recipientPubkey) {
          out.set(pubkey, [webSubscription]);
        }
      }
      return out;
    },
    getNativeSubscriptionsForPubkeys(pubkeys) {
      const out = new Map<string, StoredNativeSubscription[]>();
      for (const pubkey of pubkeys) {
        if (pubkey === recipientPubkey) {
          out.set(pubkey, [nativeSubscription]);
        }
      }
      return out;
    },
  };

  const pushDelivery: RelayWatcherPushDelivery = {
    async deliverWeb(_subscription, payloadData) {
      calls.push(`deliverWeb:${payloadData.outerEventId}`);
      webDeliveries.push(payloadData);
    },
    async deliverNative(_subscription, payloadData) {
      calls.push(`deliverNative:${payloadData.outerEventId}`);
      nativeDeliveries.push(payloadData);
    },
  };

  const openedSubscriptions: SubscribeManyParams[] = [];
  const pool: RelayWatcherPool = {
    subscribeMany(
      _relays: string[],
      _filter: Filter,
      params: SubscribeManyParams,
    ): SubCloser {
      openedSubscriptions.push(params);
      return { close() {} };
    },
    close() {},
  };

  const watcher = new RelayWatcher({
    relayUrls: ["wss://relay.test"],
    storage,
    pushDelivery,
    eventDedupeTtlMs: 60_000,
    pool,
    // Keeps a 10-minute setInterval from being left armed in the test process;
    // the deterministic refresh trigger is the direct restartSubscription() call.
    subscriptionRefreshMs: 60_000,
  });

  return {
    calls,
    webDeliveries,
    nativeDeliveries,
    watcher,
    openedSubscriptions,
  };
}

// handleEvent performs no await before the delivery loop, so onevent() runs the
// whole gate/dedupe path synchronously and one macrotask tick settles the
// delivery promises.
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe("RelayWatcher subscription refresh race", () => {
  it("delivers a wrap that arrives after a restart and before EOSE", async () => {
    const {
      watcher,
      openedSubscriptions,
      calls,
      webDeliveries,
      nativeDeliveries,
    } = makeHarness();

    watcher.start();
    openedSubscriptions[0]?.oneose?.();

    watcher.restartSubscription("test refresh");
    expect(openedSubscriptions.length).toBe(2);

    const wrap = makeGiftWrap(1);
    openedSubscriptions[1]?.onevent?.(wrap);
    await flush();

    expect(webDeliveries.map((delivery) => delivery.outerEventId)).toEqual([
      wrap.id,
    ]);
    expect(nativeDeliveries.map((delivery) => delivery.outerEventId)).toEqual([
      wrap.id,
    ]);
    expect(calls).toEqual([
      `recordSeenEvent:${wrap.id}`,
      `deliverWeb:${wrap.id}`,
      `deliverNative:${wrap.id}`,
    ]);

    await watcher.stop();
  });

  it("still suppresses the historical backlog before the first EOSE", async () => {
    const {
      watcher,
      openedSubscriptions,
      calls,
      webDeliveries,
      nativeDeliveries,
    } = makeHarness();

    watcher.start();

    const wrap = makeGiftWrap(2);
    openedSubscriptions[0]?.onevent?.(wrap);
    await flush();

    expect(webDeliveries).toEqual([]);
    expect(nativeDeliveries).toEqual([]);
    expect(calls).toContain(`recordSeenEvent:${wrap.id}`);

    await watcher.stop();
  });

  it("does not re-deliver an already delivered wrap", async () => {
    const { watcher, openedSubscriptions, webDeliveries, nativeDeliveries } =
      makeHarness();

    watcher.start();
    openedSubscriptions[0]?.oneose?.();

    const wrap = makeGiftWrap(3);
    openedSubscriptions[0]?.onevent?.(wrap);
    openedSubscriptions[0]?.onevent?.(wrap);
    await flush();

    watcher.restartSubscription("test refresh");
    expect(openedSubscriptions.length).toBe(2);
    openedSubscriptions[1]?.onevent?.(wrap);
    openedSubscriptions[1]?.onevent?.(wrap);
    await flush();

    expect(webDeliveries.map((delivery) => delivery.outerEventId)).toEqual([
      wrap.id,
    ]);
    expect(nativeDeliveries.map((delivery) => delivery.outerEventId)).toEqual([
      wrap.id,
    ]);

    await watcher.stop();
  });

  it("keeps delivering after a relay onclose without waiting for a new EOSE", async () => {
    const { watcher, openedSubscriptions, webDeliveries, nativeDeliveries } =
      makeHarness();

    watcher.start();
    openedSubscriptions[0]?.oneose?.();
    openedSubscriptions[0]?.onclose?.(["relay dropped"]);

    const wrap = makeGiftWrap(4);
    openedSubscriptions[0]?.onevent?.(wrap);
    await flush();

    expect(webDeliveries.map((delivery) => delivery.outerEventId)).toEqual([
      wrap.id,
    ]);
    expect(nativeDeliveries.map((delivery) => delivery.outerEventId)).toEqual([
      wrap.id,
    ]);

    await watcher.stop();
  });
});
