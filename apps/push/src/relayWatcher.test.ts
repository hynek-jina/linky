import { describe, expect, it } from "bun:test";

import { SeenEventIdCache } from "./relayWatcher";

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
