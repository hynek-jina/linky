// RED-first spec for the owner-scoped, debounced, merge-on-flush notification
// record store.
//
// Three properties here are load-bearing and are asserted from the outside, not
// by reading the implementation:
//   1. `upsert` RETURNS the merged record. A freshly built record always carries
//      `alertedAt: null`, so an alert decision taken on the built record can
//      never match the "already alerted" rule and would re-alert on every
//      redelivery. Only the merged value carries the stored timestamps.
//   2. `dismissedAt` never implies `readAt` — clearing the shade is not reading.
//   3. `markChatRead` cancels the native shade entry by `conversationKey`, never
//      by `chatId`: the Java tag is `"linky.chat:" + pubkey`, while `chatId`
//      CHANGES when an unknown contact is saved.
//
// Storage caveat (AGENTS.md Gotchas): jsdom's `Storage` is a Proxy, so assigning
// `localStorage.setItem` on the INSTANCE stores an item keyed "setItem" and the
// real method keeps working. Every stub below goes through
// `vi.spyOn(Storage.prototype, "setItem")` and is undone by
// `vi.restoreAllMocks()`. And because every `safeLocalStorage*` call swallows its
// error, each storage case also asserts `getLocalStorageFailureCount()` —
// otherwise the test would pass while verifying nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLastLocalStorageFailure,
  getLocalStorageFailureCount,
  resetLocalStorageFailures,
} from "../../utils/storage";
import {
  countUnreadNotificationRecords,
  isNotificationRecordEnvelope,
  type NotificationRecord,
  type NotificationRecordEnvelope,
} from "./notificationRecord";
import {
  getNotificationStoreLastReadBackOk,
  NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS,
  notificationRecordStore,
} from "./notificationRecordStore";

const { cancelAllMock, cancelConversationMock } = vi.hoisted(() => ({
  cancelAllMock: vi.fn((): boolean => true),
  cancelConversationMock: vi.fn(
    (conversationKey: string): boolean => conversationKey.length > 0,
  ),
}));

vi.mock("../../platform/nativeBridge", () => ({
  cancelAllNativeConversationNotifications: cancelAllMock,
  cancelNativeConversationNotification: cancelConversationMock,
}));

const OWNER_1_KEY = "linky.notifications.v1.owner-1";
const OWNER_2_KEY = "linky.notifications.v1.owner-2";
/** `makeLocalStorageKey` falls back to "anon" before the owner id resolves. */
const ANON_KEY = "linky.notifications.v1.anon";

const BASE_NOW = 1_750_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const makeRecord = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  alertedAt: null,
  chatId: "chat-1",
  conversationKey: "pubkey-1",
  createdAtMs: BASE_NOW,
  deliveredAt: BASE_NOW,
  id: "wrap-1",
  kind: "chatMessage",
  preview: "hello",
  readAt: null,
  senderLabel: "Alice",
  ...overrides,
});

const idsOf = (records: readonly NotificationRecord[]): string[] =>
  records.map((record) => record.id);

const findById = (id: string): NotificationRecord | undefined =>
  notificationRecordStore.get().find((record) => record.id === id);

/** Re-narrows a persisted payload instead of casting it. */
const readEnvelope = (key: string): NotificationRecordEnvelope => {
  const raw = localStorage.getItem(key);
  const parsed: unknown = raw === null ? null : JSON.parse(raw);
  if (!isNotificationRecordEnvelope(parsed)) {
    throw new Error(`No valid notification envelope under ${key}`);
  }
  return parsed;
};

/** Valid records plus deliberately malformed entries, as they arrive on the wire. */
type SeedEntry = NotificationRecord | Record<string, unknown>;

const seedEnvelope = (
  key: string,
  epoch: number,
  records: readonly SeedEntry[],
): void => {
  localStorage.setItem(key, JSON.stringify({ epoch, records }));
};

beforeEach(() => {
  localStorage.clear();
  resetLocalStorageFailures();
  cancelAllMock.mockClear();
  cancelConversationMock.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(BASE_NOW);
});

afterEach(() => {
  notificationRecordStore.bindOwner(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("notificationRecordStore — bind / rebind", () => {
  it("buffers an upsert made while unbound and flushes it to the real owner key on bind", () => {
    notificationRecordStore.upsert(makeRecord({ id: "early" }));

    // Live in memory before login completes, but nothing persisted yet.
    expect(idsOf(notificationRecordStore.get())).toEqual(["early"]);
    expect(localStorage.getItem(ANON_KEY)).toBeNull();

    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    expect(idsOf(readEnvelope(OWNER_1_KEY).records)).toEqual(["early"]);
    // Pitfall 2: nothing may land under the pre-login "anon" key and vanish.
    expect(localStorage.getItem(ANON_KEY)).toBeNull();
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("flushes the previous owner before adopting the next one", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "owner-1-record" }));

    notificationRecordStore.bindOwner(OWNER_2_KEY);

    expect(idsOf(readEnvelope(OWNER_1_KEY).records)).toEqual([
      "owner-1-record",
    ]);
    // Owner scoping IS the access-control boundary (T-04-08).
    expect(idsOf(notificationRecordStore.get())).toEqual([]);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("re-reads the newly bound key and exposes its records newest-first", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 9_000, [
      makeRecord({ createdAtMs: BASE_NOW - 2_000, id: "old" }),
      makeRecord({ createdAtMs: BASE_NOW, id: "new" }),
      makeRecord({ createdAtMs: BASE_NOW - 1_000, id: "mid" }),
    ]);

    notificationRecordStore.bindOwner(OWNER_1_KEY);

    expect(idsOf(notificationRecordStore.get())).toEqual(["new", "mid", "old"]);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("survives unparseable persisted JSON and reports it under getJson", () => {
    localStorage.setItem(OWNER_1_KEY, "{");

    expect(() => {
      notificationRecordStore.bindOwner(OWNER_1_KEY);
    }).not.toThrow();

    expect(idsOf(notificationRecordStore.get())).toEqual([]);
    // A corrupt payload is data corruption, not a storage fault (T-04-09).
    expect(getLocalStorageFailureCount()).toBe(1);
    expect(getLastLocalStorageFailure()?.operation).toBe("getJson");
    expect(getLastLocalStorageFailure()?.key).toBe(OWNER_1_KEY);
  });

  it("ignores a bare array where an envelope is expected", () => {
    localStorage.setItem(OWNER_1_KEY, "[]");

    notificationRecordStore.bindOwner(OWNER_1_KEY);

    expect(idsOf(notificationRecordStore.get())).toEqual([]);
    // Parsed fine, just not an envelope — no storage failure to report.
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("ignores an envelope whose epoch is not a number", () => {
    localStorage.setItem(OWNER_1_KEY, JSON.stringify({ epoch: "x" }));

    notificationRecordStore.bindOwner(OWNER_1_KEY);

    expect(idsOf(notificationRecordStore.get())).toEqual([]);
    expect(notificationRecordStore.getSyncEpochMs()).toBe(BASE_NOW);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("keeps the one valid record in an envelope holding two malformed entries", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 5_000, [
      makeRecord({ id: "good" }),
      { id: "missing-everything" },
      { ...makeRecord({ id: "bad-kind" }), kind: "reaction" },
    ]);

    expect(() => {
      notificationRecordStore.bindOwner(OWNER_1_KEY);
    }).not.toThrow();

    // Partial corruption must not cost the user every surviving record.
    expect(idsOf(notificationRecordStore.get())).toEqual(["good"]);
    expect(notificationRecordStore.getSyncEpochMs()).toBe(BASE_NOW - 5_000);
    expect(getLocalStorageFailureCount()).toBe(0);
  });
});

describe("notificationRecordStore — persistence and retention", () => {
  it("keeps ten records with a stable id order across a simulated reload", async () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    for (let index = 0; index < 10; index += 1) {
      notificationRecordStore.upsert(
        makeRecord({
          createdAtMs: BASE_NOW - index * 1_000,
          id: `wrap-${index}`,
        }),
      );
    }
    notificationRecordStore.flushNow();

    const before = idsOf(notificationRecordStore.get());
    expect(before).toHaveLength(10);
    expect(getLocalStorageFailureCount()).toBe(0);

    notificationRecordStore.bindOwner(null);

    // A fresh module instance is the closest thing to an app reload.
    vi.resetModules();
    const reloaded = await import("./notificationRecordStore");
    reloaded.notificationRecordStore.bindOwner(OWNER_1_KEY);

    expect(idsOf(reloaded.notificationRecordStore.get())).toEqual(before);
    expect(getLocalStorageFailureCount()).toBe(0);

    reloaded.notificationRecordStore.bindOwner(null);
  });

  it("evicts the oldest read record over the cap and keeps every unread one", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    for (let index = 0; index < 200; index += 1) {
      notificationRecordStore.upsert(
        makeRecord({
          createdAtMs: BASE_NOW - index * 1_000,
          id: `unread-${String(index).padStart(3, "0")}`,
        }),
      );
    }
    notificationRecordStore.upsert(
      makeRecord({
        createdAtMs: BASE_NOW - 31 * DAY_MS,
        id: "stale-read",
        readAt: BASE_NOW - 30 * DAY_MS,
      }),
    );
    expect(notificationRecordStore.get()).toHaveLength(201);

    notificationRecordStore.flushNow();

    const persisted = readEnvelope(OWNER_1_KEY).records;
    expect(persisted).toHaveLength(200);
    expect(idsOf(persisted)).not.toContain("stale-read");
    expect(countUnreadNotificationRecords(persisted)).toBe(200);
    expect(idsOf(notificationRecordStore.get())).not.toContain("stale-read");
    expect(getLocalStorageFailureCount()).toBe(0);
  });
});

describe("notificationRecordStore — idempotency and the upsert return value", () => {
  it("collapses two upserts of the same id into one record with the newer preview", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1", preview: "first" }));
    notificationRecordStore.upsert(makeRecord({ id: "w1", preview: "second" }));

    expect(notificationRecordStore.get()).toHaveLength(1);
    expect(findById("w1")?.preview).toBe("second");
  });

  it("never reverts a persisted readAt when a redelivered wrap carries null", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "w1", readAt: 100 }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);

    notificationRecordStore.upsert(makeRecord({ id: "w1", readAt: null }));
    notificationRecordStore.flushNow();

    expect(readEnvelope(OWNER_1_KEY).records[0]?.readAt).toBe(100);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("returns the MERGED record, which is the only way decision row 1 (already-alerted) can match a redelivered wrap", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ alertedAt: null, id: "w1" }));
    notificationRecordStore.markAlerted("w1", 500);

    // Plan 04-07's `wrapKnownFromEvolu` fall-through makes redelivery routine, and
    // a freshly BUILT record always carries `alertedAt: null`. If the call site
    // decided on the built record, every redelivery would alert again.
    const merged = notificationRecordStore.upsert(
      makeRecord({ alertedAt: null, id: "w1", preview: "new" }),
    );

    expect(merged.alertedAt).toBe(500);
    expect(merged.preview).toBe("new");
  });

  it("returns a record deeply equal to the input for a brand-new id", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    const input = makeRecord({ id: "fresh" });

    expect(notificationRecordStore.upsert(input)).toEqual(input);
  });

  it("returns the same object identity that get() holds for that id", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1", preview: "first" }));

    const merged = notificationRecordStore.upsert(
      makeRecord({ id: "w1", preview: "second" }),
    );

    expect(findById("w1")).toBe(merged);
  });
});

describe("notificationRecordStore — debounce and force flush", () => {
  it("coalesces a ten-upsert burst into exactly one setItem for the owner key", () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    notificationRecordStore.bindOwner(OWNER_1_KEY);

    for (let index = 0; index < 10; index += 1) {
      notificationRecordStore.upsert(makeRecord({ id: `wrap-${index}` }));
    }

    expect(localStorage.getItem(OWNER_1_KEY)).toBeNull();
    expect(setItemSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS);

    const ownerWrites = setItemSpy.mock.calls.filter(
      ([key]) => key === OWNER_1_KEY,
    );
    expect(ownerWrites).toHaveLength(1);
    expect(readEnvelope(OWNER_1_KEY).records).toHaveLength(10);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("force-flushes on visibilitychange -> hidden without advancing timers", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "last-arrival" }));
    expect(localStorage.getItem(OWNER_1_KEY)).toBeNull();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    // Pitfall 3: the 250 ms timer never fires if the WebView is frozen.
    expect(idsOf(readEnvelope(OWNER_1_KEY).records)).toEqual(["last-arrival"]);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("force-flushes on pagehide without advancing timers", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "last-arrival" }));
    expect(localStorage.getItem(OWNER_1_KEY)).toBeNull();

    window.dispatchEvent(new Event("pagehide"));

    expect(idsOf(readEnvelope(OWNER_1_KEY).records)).toEqual(["last-arrival"]);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("stops force-flushing once the owner is unbound", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));
    notificationRecordStore.bindOwner(null);

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    window.dispatchEvent(new Event("pagehide"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(getLocalStorageFailureCount()).toBe(0);
  });
});

describe("notificationRecordStore — first-flush read-back assertion", () => {
  it("reports a successful read-back on the first flush after a bind", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));
    notificationRecordStore.flushNow();

    expect(getNotificationStoreLastReadBackOk()).toBe(true);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("detects a silently failed first write without throwing at the call site", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));

    expect(() => {
      notificationRecordStore.flushNow();
    }).not.toThrow();

    // T-04-11: a swallowed write must not look like a success.
    expect(getLocalStorageFailureCount()).toBe(1);
    expect(getLastLocalStorageFailure()?.operation).toBe("set");
    expect(getLastLocalStorageFailure()?.key).toBe(OWNER_1_KEY);
    expect(getNotificationStoreLastReadBackOk()).toBe(false);
  });
});

describe("notificationRecordStore — read-state writers", () => {
  it("markRead sets only the targeted record's readAt", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));
    notificationRecordStore.upsert(makeRecord({ id: "w2" }));

    notificationRecordStore.markRead("w1", 1_000);

    expect(findById("w1")?.readAt).toBe(1_000);
    expect(findById("w2")?.readAt).toBeNull();
  });

  it("markRead cancels the shade entry once the conversation has no unread left", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: "pk-a", id: "a1" }),
    );
    cancelConversationMock.mockClear();

    notificationRecordStore.markRead("a1", 1_000);

    expect(cancelConversationMock).toHaveBeenCalledTimes(1);
    expect(cancelConversationMock).toHaveBeenCalledWith("pk-a");
  });

  it("markRead leaves the shade entry alone while that conversation still has unread", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: "pk-a", id: "a1" }),
    );
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: "pk-a", id: "a2" }),
    );
    cancelConversationMock.mockClear();

    notificationRecordStore.markRead("a1", 1_000);

    // The entry still stands for a2, which nobody has read.
    expect(cancelConversationMock).not.toHaveBeenCalled();

    notificationRecordStore.markRead("a2", 2_000);

    expect(cancelConversationMock).toHaveBeenCalledTimes(1);
    expect(cancelConversationMock).toHaveBeenCalledWith("pk-a");
  });

  it("markRead never cancels another conversation's entry", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: "pk-a", id: "a1" }),
    );
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: "pk-b", id: "b1" }),
    );
    cancelConversationMock.mockClear();

    notificationRecordStore.markRead("a1", 1_000);

    expect(cancelConversationMock).toHaveBeenCalledTimes(1);
    expect(cancelConversationMock).toHaveBeenCalledWith("pk-a");
    expect(findById("b1")?.readAt).toBeNull();
  });

  it("markRead makes no cancel call for a record with no conversationKey", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: null, id: "n1" }),
    );
    cancelConversationMock.mockClear();

    notificationRecordStore.markRead("n1", 1_000);

    expect(cancelConversationMock).not.toHaveBeenCalled();
  });

  it("markRead on an already-read record cancels nothing", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: "pk-a", id: "a1", readAt: 500 }),
    );
    cancelConversationMock.mockClear();

    notificationRecordStore.markRead("a1", 1_000);

    expect(findById("a1")?.readAt).toBe(500);
    expect(cancelConversationMock).not.toHaveBeenCalled();
  });

  it("markChatRead marks its own chat up to nowMs and leaves later arrivals unread", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({ chatId: "c1", createdAtMs: BASE_NOW - 1_000, id: "c1-old" }),
    );
    // Migrated onto `deliveredAt`: this record means "arrived after this pass",
    // and since plan 09-05 that is measured on receipt time, not on the sender's
    // clamped send time. `makeRecord`'s default `deliveredAt: BASE_NOW` would
    // otherwise make it a within-the-pass arrival under the new bound.
    notificationRecordStore.upsert(
      makeRecord({
        chatId: "c1",
        createdAtMs: BASE_NOW + 5_000,
        deliveredAt: BASE_NOW + 5_000,
        id: "c1-new",
      }),
    );
    notificationRecordStore.upsert(
      makeRecord({ chatId: "c2", createdAtMs: BASE_NOW - 1_000, id: "c2-any" }),
    );

    notificationRecordStore.markChatRead("c1", BASE_NOW);

    expect(findById("c1-old")?.readAt).toBe(BASE_NOW);
    // A message arriving while the chat is open is the alert path's job (row 5).
    expect(findById("c1-new")?.readAt).toBeNull();
    expect(findById("c2-any")?.readAt).toBeNull();
  });

  it("markChatRead cancels once per DISTINCT conversationKey and never with the chatId", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({ chatId: "c1", conversationKey: "pubkey-a", id: "a1" }),
    );
    notificationRecordStore.upsert(
      makeRecord({ chatId: "c1", conversationKey: "pubkey-a", id: "a2" }),
    );
    notificationRecordStore.upsert(
      makeRecord({ chatId: "c1", conversationKey: "pubkey-b", id: "b1" }),
    );
    notificationRecordStore.upsert(
      makeRecord({ chatId: "c1", conversationKey: null, id: "n1" }),
    );
    notificationRecordStore.upsert(
      makeRecord({ chatId: "c2", conversationKey: "pubkey-c", id: "c1r" }),
    );

    const keys = notificationRecordStore.markChatRead("c1", BASE_NOW);

    expect([...keys].sort()).toEqual(["pubkey-a", "pubkey-b"]);
    expect(cancelConversationMock).toHaveBeenCalledTimes(2);
    expect(cancelConversationMock).toHaveBeenCalledWith("pubkey-a");
    expect(cancelConversationMock).toHaveBeenCalledWith("pubkey-b");
    // The Java tag is "linky.chat:" + pubkey, and chatId CHANGES when an unknown
    // contact is saved — cancelling by chatId would orphan the shade entry.
    expect(cancelConversationMock).not.toHaveBeenCalledWith("c1");
    expect(cancelConversationMock).not.toHaveBeenCalledWith("pubkey-c");
  });

  it("markChatRead makes no cancel call for a record whose conversationKey is null", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({ chatId: "c1", conversationKey: null, id: "n1" }),
    );

    expect(notificationRecordStore.markChatRead("c1", BASE_NOW)).toEqual([]);
    expect(cancelConversationMock).not.toHaveBeenCalled();
    expect(findById("n1")?.readAt).toBe(BASE_NOW);
  });

  // T-14 / T-09-23. The stuck-unread-badge case: a post-dated rumor must not
  // escape the bulk chat-open pass for good.
  //
  // Plan 09-01 clamps `createdAtMs` to `[nowMs - 3d, nowMs]` at BUILD time, so a
  // future value can only reach the store through a PERSISTED envelope — one
  // written by another tab, by an older build, or by any script in this origin
  // that tampered with the key. That is exactly the case the bound has to
  // survive, which is why this record is seeded rather than upserted.
  it("markChatRead claims a record whose createdAtMs is in the future but whose deliveredAt is past", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 10_000, [
      makeRecord({
        chatId: "chat-1",
        conversationKey: "pubkey-1",
        createdAtMs: BASE_NOW + 60_000,
        deliveredAt: BASE_NOW - 1_000,
        id: "wrap-postdated",
        readAt: null,
      }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);

    notificationRecordStore.markChatRead("chat-1", BASE_NOW);

    expect(findById("wrap-postdated")?.readAt).toBe(BASE_NOW);

    // And it must survive the debounced merge-on-flush, not just the snapshot.
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);
    expect(readEnvelope(OWNER_1_KEY).records[0]?.readAt).toBe(BASE_NOW);

    // Half a claim is not a claim: the badge clears but the shade entry would
    // stand forever. Cancelled by conversationKey, NEVER by chatId — the Java
    // tag is "linky.chat:" + pubkey, and chatId changes when an unknown contact
    // is saved.
    expect(cancelConversationMock).toHaveBeenCalledTimes(1);
    expect(cancelConversationMock).toHaveBeenCalledWith("pubkey-1");
    expect(cancelConversationMock).not.toHaveBeenCalledWith("chat-1");
  });

  // T-09-24. The mirror, which is what keeps the bound from being DELETED rather
  // than moved. Its two keys disagree in the opposite direction from T-14: a past
  // `createdAtMs` (which the old bound would have claimed) and a future
  // `deliveredAt` (which the correct bound refuses).
  it("markChatRead still refuses a record delivered after this pass", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(
      makeRecord({
        chatId: "chat-1",
        conversationKey: "pubkey-late",
        createdAtMs: BASE_NOW - 60_000,
        deliveredAt: BASE_NOW + 1,
        id: "wrap-late",
      }),
    );

    notificationRecordStore.markChatRead("chat-1", BASE_NOW);

    // Decision row 5's territory: a message arriving while the chat is open is
    // marked read by the alert path, and this bulk writer must not claim it.
    expect(findById("wrap-late")?.readAt).toBeNull();
    expect(cancelConversationMock).not.toHaveBeenCalledWith("pubkey-late");
  });

  // The third leg of the trio — "leaves another chat's records untouched" — is
  // NOT duplicated here. `markChatRead marks its own chat up to nowMs and leaves
  // later arrivals unread` above already asserts it via its `c2-any` record, so
  // the pair above cannot both pass under a "read everything" predicate.

  it("markAllRead marks every unread record and cancels Linky's own group once", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));
    notificationRecordStore.upsert(makeRecord({ id: "w2" }));
    notificationRecordStore.upsert(makeRecord({ id: "w3", readAt: 100 }));

    notificationRecordStore.markAllRead(BASE_NOW);

    expect(findById("w1")?.readAt).toBe(BASE_NOW);
    expect(findById("w2")?.readAt).toBe(BASE_NOW);
    expect(findById("w3")?.readAt).toBe(100);
    // T-04-12: Linky's own group, never NotificationManagerCompat.cancelAll().
    expect(cancelAllMock).toHaveBeenCalledTimes(1);
  });

  it("markAlerted sets alertedAt and does not touch readAt", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));

    notificationRecordStore.markAlerted("w1", 500);

    expect(findById("w1")?.alertedAt).toBe(500);
    expect(findById("w1")?.readAt).toBeNull();
  });

  it("markDismissed records the swipe and leaves the record unread", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));

    notificationRecordStore.markDismissed("w1", 500);

    expect(findById("w1")?.dismissedAt).toBe(500);
    // Criterion 7: Android fires the same delete intent for "Clear all" and for
    // some OEM auto-clears — a swipe carries no evidence of reading.
    expect(findById("w1")?.readAt).toBeNull();
    expect(countUnreadNotificationRecords(notificationRecordStore.get())).toBe(
      1,
    );
  });

  it("markDismissed is write-once", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));

    notificationRecordStore.markDismissed("w1", 500);
    notificationRecordStore.markDismissed("w1", 900);

    expect(findById("w1")?.dismissedAt).toBe(500);
  });

  it("markRead on an unknown id is a no-op and does not emit", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));
    const listener = vi.fn();
    const unsubscribe = notificationRecordStore.subscribe(listener);
    const before = notificationRecordStore.get();

    notificationRecordStore.markRead("does-not-exist", 1_000);

    expect(listener).not.toHaveBeenCalled();
    expect(notificationRecordStore.get()).toBe(before);
    unsubscribe();
  });
});

describe("notificationRecordStore — subscription", () => {
  it("notifies subscribers on upsert and stops after unsubscribe", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    const listener = vi.fn();
    const unsubscribe = notificationRecordStore.subscribe(listener);

    notificationRecordStore.upsert(makeRecord({ id: "w1" }));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    notificationRecordStore.upsert(makeRecord({ id: "w2" }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns the same snapshot reference across calls with no mutation between", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));

    // Pitfall 1: useSyncExternalStore compares with Object.is and loops forever
    // on a fresh array per call.
    expect(notificationRecordStore.get()).toBe(notificationRecordStore.get());
  });

  it("keeps the snapshot reference and stays silent for a no-op mutation", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));
    notificationRecordStore.markRead("w1", 1_000);

    const before = notificationRecordStore.get();
    const listener = vi.fn();
    const unsubscribe = notificationRecordStore.subscribe(listener);

    notificationRecordStore.markRead("w1", 2_000);

    expect(notificationRecordStore.get()).toBe(before);
    expect(findById("w1")?.readAt).toBe(1_000);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("notificationRecordStore — mark unread", () => {
  it("keeps a record unread across the debounced flush, in memory and in storage", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.markUnread("wrap-1");

    // NOTE: this first assertion PASSES even when the bug is present. The naive
    // `readAt: null` mutation lands in memory immediately; it is the debounced
    // flush ~250 ms later that silently restores the timestamp, because
    // `mergeTimestamp(persisted, null)` returns the persisted value. Do NOT
    // "simplify" this case down to this single line — it verifies nothing.
    expect(findById("wrap-1")?.readAt).toBeNull();

    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    // The reversion assertion.
    expect(findById("wrap-1")?.readAt).toBeNull();
    // The persisted half: the badge reads memory, a reload reads the envelope.
    expect(readEnvelope(OWNER_1_KEY).records[0]?.readAt).toBeNull();

    // A bare timer advance here would run NO code at all — `flush()` schedules
    // nothing on completion — so force a REAL second flush cycle.
    notificationRecordStore.upsert(
      makeRecord({ conversationKey: "pubkey-2", id: "wrap-2" }),
    );
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    expect(findById("wrap-1")?.readAt).toBeNull();
    expect(
      readEnvelope(OWNER_1_KEY).records.find((record) => record.id === "wrap-1")
        ?.readAt,
    ).toBeNull();
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("is a no-op on an already-unread record", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "wrap-1" }));
    const before = notificationRecordStore.get();
    const listener = vi.fn();
    const unsubscribe = notificationRecordStore.subscribe(listener);

    notificationRecordStore.markUnread("wrap-1");

    expect(notificationRecordStore.get()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("is a no-op on an unknown id", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "wrap-1", readAt: 100 }));
    const before = notificationRecordStore.get();
    const listener = vi.fn();
    const unsubscribe = notificationRecordStore.subscribe(listener);

    expect(() => {
      notificationRecordStore.markUnread("does-not-exist");
    }).not.toThrow();

    expect(notificationRecordStore.get()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("does not touch any other record", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
      makeRecord({ conversationKey: "pubkey-2", id: "wrap-2", readAt: 100 }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.markUnread("wrap-1");

    expect(findById("wrap-2")?.readAt).toBe(100);

    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    expect(findById("wrap-1")?.readAt).toBeNull();
    expect(findById("wrap-2")?.readAt).toBe(100);
    expect(
      readEnvelope(OWNER_1_KEY).records.find((record) => record.id === "wrap-2")
        ?.readAt,
    ).toBe(100);
  });

  it("never re-posts or cancels a shade entry", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.markUnread("wrap-1");
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    // There is no POST wrapper imported by this module at all — the store only
    // ever cancels — so there is no post mock to assert on. A cancelled shade
    // entry cannot be un-cancelled, and re-alerting a message the user has
    // already seen would be a surprise, so neither cancel wrapper fires either.
    expect(cancelAllMock).not.toHaveBeenCalled();
    expect(cancelConversationMock).not.toHaveBeenCalled();
  });

  it("leaves alertedAt set so a redelivery still cannot re-alert", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ alertedAt: BASE_NOW, id: "wrap-1", readAt: BASE_NOW }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.markUnread("wrap-1");
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    // Decision row 1 (`already-alerted`) must still short-circuit a redelivery.
    expect(findById("wrap-1")?.alertedAt).toBe(BASE_NOW);
    expect(findById("wrap-1")?.readAt).toBeNull();
    expect(readEnvelope(OWNER_1_KEY).records[0]?.alertedAt).toBe(BASE_NOW);
  });

  it("lets a later markRead win over the override", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.markUnread("wrap-1");
    notificationRecordStore.markRead("wrap-1", BASE_NOW + 5);
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    // `mergeTimestamp` returns `Math.min(persisted, incoming)` when both are
    // present (`notificationRecord.ts`), so the persisted `BASE_NOW`
    // legitimately wins over the newer `BASE_NOW + 5` stamp. What this case
    // proves is that a STALE OVERRIDE does not null it again. Do NOT "fix" this
    // expectation to `BASE_NOW + 5` by editing `mergeTimestamp` — that
    // asymmetry is what stops a redelivered gift wrap from un-reading a record.
    expect(findById("wrap-1")?.readAt).toBe(BASE_NOW);
    expect(readEnvelope(OWNER_1_KEY).records[0]?.readAt).toBe(BASE_NOW);
  });

  it("lets markAllRead win over the override", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.markUnread("wrap-1");
    notificationRecordStore.markAllRead(BASE_NOW + 5);
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    // Same corrected expectation as the markRead case above: the earlier
    // persisted stamp wins the merge; the point is that it is non-null.
    expect(findById("wrap-1")?.readAt).toBe(BASE_NOW);
    expect(readEnvelope(OWNER_1_KEY).records[0]?.readAt).toBe(BASE_NOW);
  });

  it("lets markChatRead win over the override", () => {
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.markUnread("wrap-1");
    notificationRecordStore.markChatRead("chat-1", BASE_NOW + 5);
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    // Same corrected expectation again — `Math.min` keeps the persisted stamp.
    expect(findById("wrap-1")?.readAt).toBe(BASE_NOW);
    expect(readEnvelope(OWNER_1_KEY).records[0]?.readAt).toBe(BASE_NOW);
  });

  it("does not carry an override across an owner switch", () => {
    // T-06-SEC-01: `unreadOverrideIds` is keyed by record id and has NO owner
    // key of its own, so a stale id could otherwise force `readAt: null` on a
    // DIFFERENT identity's record that happens to share that id.
    seedEnvelope(OWNER_2_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
    ]);
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.markUnread("wrap-1");

    // WITHOUT this forced write failure the case passes whether or not
    // `bindOwner` resets the set: `bindOwner` flushes the PREVIOUS owner first,
    // and that flush already clears the override via the failure-count guard.
    // A swallowed write is what keeps the override alive across the switch and
    // makes the `bindOwner` reset line load-bearing.
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });

    notificationRecordStore.bindOwner(OWNER_2_KEY);

    setItemSpy.mockRestore();

    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    expect(findById("wrap-1")?.readAt).toBe(BASE_NOW);
    expect(readEnvelope(OWNER_2_KEY).records[0]?.readAt).toBe(BASE_NOW);
  });

  it("still refuses to let a redelivered wrap un-read a record", () => {
    // The regression guard on the UNTOUCHED merge asymmetry. This is what fails
    // if someone "fixes" `mergeTimestamp` instead of adding the override set.
    seedEnvelope(OWNER_1_KEY, BASE_NOW - 1_000, [
      makeRecord({ id: "wrap-1", readAt: BASE_NOW }),
    ]);
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.flushNow();

    notificationRecordStore.upsert(makeRecord({ id: "wrap-1", readAt: null }));
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS + 1);

    expect(findById("wrap-1")?.readAt).toBe(BASE_NOW);
    expect(readEnvelope(OWNER_1_KEY).records[0]?.readAt).toBe(BASE_NOW);
  });
});

describe("notificationRecordStore — sync epoch", () => {
  it("persists a fresh epoch on the first bind to an empty key", () => {
    notificationRecordStore.bindOwner(OWNER_1_KEY);
    vi.advanceTimersByTime(NOTIFICATION_STORE_FLUSH_DEBOUNCE_MS);

    const envelope = readEnvelope(OWNER_1_KEY);
    expect(envelope.epoch).toBe(BASE_NOW);
    expect(envelope.records).toEqual([]);
    expect(notificationRecordStore.getSyncEpochMs()).toBe(BASE_NOW);
    expect(getLocalStorageFailureCount()).toBe(0);
  });

  it("does not overwrite an epoch already persisted for that owner", () => {
    seedEnvelope(OWNER_1_KEY, 111, []);

    notificationRecordStore.bindOwner(OWNER_1_KEY);
    notificationRecordStore.upsert(makeRecord({ id: "w1" }));
    notificationRecordStore.flushNow();

    expect(readEnvelope(OWNER_1_KEY).epoch).toBe(111);
    expect(notificationRecordStore.getSyncEpochMs()).toBe(111);
  });

  it("returns null while unbound", () => {
    expect(notificationRecordStore.getSyncEpochMs()).toBeNull();

    notificationRecordStore.bindOwner(OWNER_1_KEY);
    expect(notificationRecordStore.getSyncEpochMs()).toBe(BASE_NOW);

    notificationRecordStore.bindOwner(null);
    expect(notificationRecordStore.getSyncEpochMs()).toBeNull();
  });
});
