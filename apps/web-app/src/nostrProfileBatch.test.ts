import type { Event as NostrToolsEvent } from "nostr-tools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const querySync = vi.fn();

vi.mock("./app/lib/nostrPool", () => ({
  getSharedAppNostrPool: () => Promise.resolve({ querySync }),
}));

const {
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  primeProfileMetadataCache,
  recordProfileMetadataLookup,
  recordProfilePictureLookup,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
} = await import("./nostrProfile");
const { nip19 } = await import("nostr-tools");

const RELAYS = ["wss://relay.example.com"];

const npubOf = (seed: string): string =>
  nip19.npubEncode(seed.repeat(64).slice(0, 64));

const profileEvent = (npub: string, content: object): NostrToolsEvent => {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub" || typeof decoded.data !== "string") {
    throw new Error("bad npub fixture");
  }
  return {
    content: JSON.stringify(content),
    created_at: 1_700_000_000,
    id: "id",
    kind: 0,
    pubkey: decoded.data,
    sig: "sig",
    tags: [],
  };
};

beforeEach(() => {
  querySync.mockReset();
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (i: number) => Array.from(values.keys())[i] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
});

afterEach(() => {
  localStorage.clear();
});

describe("primeProfileMetadataCache", () => {
  it("fetches many profiles in a single multi-author query", async () => {
    const a = npubOf("a1");
    const b = npubOf("b2");
    const c = npubOf("c3");

    querySync.mockResolvedValue([
      profileEvent(a, { name: "Alice", picture: "https://x.test/a.png" }),
      profileEvent(b, { name: "Bob" }),
      profileEvent(c, { name: "Carol" }),
    ]);

    await primeProfileMetadataCache([a, b, c], { relays: RELAYS });

    expect(querySync).toHaveBeenCalledTimes(1);
    const [, filter] = querySync.mock.calls[0] ?? [];
    expect(filter.kinds).toEqual([0]);
    expect(filter.authors).toHaveLength(3);

    expect(loadCachedProfileMetadata(a)?.metadata?.name).toBe("Alice");
    expect(loadCachedProfileMetadata(b)?.metadata?.name).toBe("Bob");
    expect(loadCachedProfileMetadata(c)?.metadata?.name).toBe("Carol");
  });

  it("skips npubs that are already cached", async () => {
    const a = npubOf("a1");
    const b = npubOf("b2");
    saveCachedProfileMetadata(a, { name: "Cached" });
    querySync.mockResolvedValue([profileEvent(b, { name: "Bob" })]);

    await primeProfileMetadataCache([a, b], { relays: RELAYS });

    const [, filter] = querySync.mock.calls[0] ?? [];
    expect(filter.authors).toHaveLength(1);
    expect(loadCachedProfileMetadata(a)?.metadata?.name).toBe("Cached");
  });

  it("issues no query when every npub is cached", async () => {
    const a = npubOf("a1");
    saveCachedProfileMetadata(a, { name: "Cached" });

    await primeProfileMetadataCache([a], { relays: RELAYS });

    expect(querySync).not.toHaveBeenCalled();
  });

  it("shares one in-flight query between concurrent callers", async () => {
    const a = npubOf("a1");
    querySync.mockResolvedValue([profileEvent(a, { name: "Alice" })]);

    await Promise.all([
      primeProfileMetadataCache([a], { relays: RELAYS }),
      primeProfileMetadataCache([a], { relays: RELAYS }),
      primeProfileMetadataCache([a], { relays: RELAYS }),
    ]);

    expect(querySync).toHaveBeenCalledTimes(1);
  });

  it("records no misses when the relays answer with nothing", async () => {
    const a = npubOf("a1");
    querySync.mockResolvedValue([]);

    await primeProfileMetadataCache([a], { relays: RELAYS });

    // An unreachable relay set and an absent profile look identical, so the
    // empty round must not be cached as "this profile has no metadata".
    expect(loadCachedProfileMetadata(a)).toBeUndefined();
  });

  it("records a miss for an author absent from a non-empty response", async () => {
    const a = npubOf("a1");
    const b = npubOf("b2");
    querySync.mockResolvedValue([profileEvent(a, { name: "Alice" })]);

    await primeProfileMetadataCache([a, b], { relays: RELAYS });

    expect(loadCachedProfileMetadata(b)?.metadata).toBeNull();
  });

  it("survives a rejected query without caching misses", async () => {
    const a = npubOf("a1");
    querySync.mockRejectedValue(new Error("relay down"));

    await expect(
      primeProfileMetadataCache([a], { relays: RELAYS }),
    ).resolves.toBeUndefined();
    expect(loadCachedProfileMetadata(a)).toBeUndefined();
  });
});

describe("lookup recorders keep known-good values", () => {
  it("does not blank cached metadata on an empty result", () => {
    const a = npubOf("a1");
    saveCachedProfileMetadata(a, { name: "Alice" });

    recordProfileMetadataLookup(a, null);

    expect(loadCachedProfileMetadata(a)?.metadata?.name).toBe("Alice");
  });

  it("records a miss when nothing was cached", () => {
    const a = npubOf("a1");

    recordProfileMetadataLookup(a, null);

    expect(loadCachedProfileMetadata(a)?.metadata).toBeNull();
  });

  it("does not blank a cached picture on an empty result", () => {
    const a = npubOf("a1");
    saveCachedProfilePicture(a, "https://x.test/a.png");

    recordProfilePictureLookup(a, null);

    expect(loadCachedProfilePicture(a)?.url).toBe("https://x.test/a.png");
  });

  it("still overwrites a cached picture with a new one", () => {
    const a = npubOf("a1");
    saveCachedProfilePicture(a, "https://x.test/old.png");

    recordProfilePictureLookup(a, "https://x.test/new.png");

    expect(loadCachedProfilePicture(a)?.url).toBe("https://x.test/new.png");
  });
});
