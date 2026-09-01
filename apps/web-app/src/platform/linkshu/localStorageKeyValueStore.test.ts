import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLocalStorageKeyValueStore } from "./localStorageKeyValueStore";

const run = Effect.runPromise;

describe("makeLocalStorageKeyValueStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips values through set, get, and remove", async () => {
    const store = makeLocalStorageKeyValueStore();

    expect(await run(store.get("linkshu.counter"))).toBeNull();

    await run(store.set("linkshu.counter", "7"));
    expect(await run(store.get("linkshu.counter"))).toBe("7");

    await run(store.set("linkshu.counter", "8"));
    expect(await run(store.get("linkshu.counter"))).toBe("8");

    await run(store.remove("linkshu.counter"));
    expect(await run(store.get("linkshu.counter"))).toBeNull();
  });

  it("lists only this store's keys matching the prefix", async () => {
    const store = makeLocalStorageKeyValueStore();
    await run(store.set("linkshu.counter.a", "1"));
    await run(store.set("linkshu.counter.b", "2"));
    await run(store.set("linkshu.cursor.a", "3"));
    localStorage.setItem("linky.lang", "en");

    expect([...(await run(store.listKeys("linkshu.counter.")))].sort()).toEqual(
      ["linkshu.counter.a", "linkshu.counter.b"],
    );
    expect([...(await run(store.listKeys("linkshu.")))].sort()).toEqual([
      "linkshu.counter.a",
      "linkshu.counter.b",
      "linkshu.cursor.a",
    ]);
    expect(await run(store.listKeys(""))).toHaveLength(3);
  });

  it("keeps leases invisible to get and listKeys", async () => {
    const store = makeLocalStorageKeyValueStore();
    const lease = await run(store.tryAcquireLease("linkshu.lock", 60_000));

    expect(lease).not.toBeNull();
    expect(await run(store.get("linkshu.lock"))).toBeNull();
    expect(await run(store.listKeys(""))).toHaveLength(0);
  });

  it("holds a lease for its ttl and frees it on expiry", async () => {
    vi.useFakeTimers();
    const store = makeLocalStorageKeyValueStore();

    const first = await run(store.tryAcquireLease("linkshu.lock", 60_000));
    expect(first).not.toBeNull();
    expect(await run(store.tryAcquireLease("linkshu.lock", 60_000))).toBeNull();

    vi.advanceTimersByTime(60_001);
    const second = await run(store.tryAcquireLease("linkshu.lock", 60_000));
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it("releases only when the caller holds the live lease", async () => {
    const store = makeLocalStorageKeyValueStore();
    const other = await run(store.tryAcquireLease("linkshu.other", 60_000));
    const held = await run(store.tryAcquireLease("linkshu.lock", 60_000));
    if (other === null || held === null) throw new Error("lease not acquired");

    await run(store.releaseLease("linkshu.lock", other));
    expect(await run(store.tryAcquireLease("linkshu.lock", 60_000))).toBeNull();

    await run(store.releaseLease("linkshu.lock", held));
    expect(
      await run(store.tryAcquireLease("linkshu.lock", 60_000)),
    ).not.toBeNull();
  });

  it("leases and values on the same key do not collide", async () => {
    const store = makeLocalStorageKeyValueStore();
    await run(store.set("linkshu.lock", "value"));
    const lease = await run(store.tryAcquireLease("linkshu.lock", 60_000));

    expect(lease).not.toBeNull();
    expect(await run(store.get("linkshu.lock"))).toBe("value");

    await run(store.remove("linkshu.lock"));
    expect(await run(store.tryAcquireLease("linkshu.lock", 60_000))).toBeNull();
  });
});
