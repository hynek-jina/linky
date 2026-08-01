import { describe, expect, it } from "vitest";
import type {
  BuildNotificationRecordInput,
  NotificationRecord,
} from "./notificationRecord";
import {
  applyNotificationRetention,
  buildNotificationRecord,
  capNotificationRecords,
  countUnreadNotificationRecords,
  isNotificationRecord,
  isNotificationRecordEnvelope,
  mergeNotificationRecordsById,
  NOTIFICATION_MAX_RECORD_BACKDATE_MS,
  NOTIFICATION_PREVIEW_MAX_LENGTH,
  NOTIFICATION_READ_PRUNE_MS,
  NOTIFICATION_RECORD_CAP,
  pruneReadNotificationRecords,
  resolveRecordCreatedAtMs,
  sortNotificationRecords,
  truncateNotificationPreview,
} from "./notificationRecord";

const NOW = 1_800_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Local factory — the repo has no test-utils module and this plan must not create one.
 * Defaults describe an unread, never-alerted chat message.
 */
const makeRecord = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  alertedAt: null,
  chatId: "contact-1",
  conversationKey: "a".repeat(64),
  createdAtMs: NOW,
  deliveredAt: NOW,
  id: "wrap-1",
  kind: "chatMessage",
  preview: "hello",
  readAt: null,
  senderLabel: "Alice",
  ...overrides,
});

/** Plain-object shape for guard tests: the guard takes `unknown`, never a typed record. */
const makeRawRecord = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  alertedAt: null,
  chatId: "contact-1",
  conversationKey: "a".repeat(64),
  createdAtMs: NOW,
  deliveredAt: NOW,
  id: "wrap-1",
  kind: "chatMessage",
  preview: "hello",
  readAt: null,
  senderLabel: "Alice",
  ...overrides,
});

const idsOf = (records: readonly NotificationRecord[]): readonly string[] =>
  records.map((record) => record.id);

describe("notification record constants", () => {
  it("pins the cap, the read-prune window and the preview budget", () => {
    expect(NOTIFICATION_RECORD_CAP).toBe(200);
    expect(NOTIFICATION_READ_PRUNE_MS).toBe(30 * DAY_MS);
    expect(NOTIFICATION_PREVIEW_MAX_LENGTH).toBe(80);
    // The backdate clamp mirrors apps/push's 3-day catch-up lookback: it bounds how
    // far display order (createdAtMs) may diverge from receipt order (deliveredAt).
    expect(NOTIFICATION_MAX_RECORD_BACKDATE_MS).toBe(3 * DAY_MS);
  });
});

describe("truncateNotificationPreview", () => {
  it("returns a short input unchanged", () => {
    const short = "a".repeat(40);
    expect(truncateNotificationPreview(short)).toBe(short);
  });

  it("clamps a long input to exactly the preview budget, ending with an ellipsis", () => {
    const result = truncateNotificationPreview("a".repeat(200));
    expect(result).toHaveLength(NOTIFICATION_PREVIEW_MAX_LENGTH);
    expect(result.endsWith("…")).toBe(true);
  });

  it("trims leading and trailing whitespace before measuring", () => {
    expect(truncateNotificationPreview("   hello   ")).toBe("hello");
    const padded = `   ${"b".repeat(78)}   `;
    expect(truncateNotificationPreview(padded)).toBe("b".repeat(78));
  });

  it("returns an empty string for empty or whitespace-only input", () => {
    expect(truncateNotificationPreview("")).toBe("");
    expect(truncateNotificationPreview("   \n\t ")).toBe("");
  });
});

describe("buildNotificationRecord", () => {
  const baseInput: BuildNotificationRecordInput = {
    chatId: "contact-1",
    conversationKey: "a".repeat(64),
    id: "wrap-1",
    kind: "chatMessage",
    nowMs: NOW,
    preview: "hello",
    senderLabel: "Alice",
  };

  // This is the ONLY case in which the two timestamps agree, because `baseInput`
  // carries no `eventCreatedAtSec`. `createdAtMs` is clamped SEND time and
  // `deliveredAt` is receipt time; do not restore the old blanket assertion that
  // `createdAtMs` is always `nowMs` — that assertion WAS the D4 ordering defect.
  it("falls back to the injected nowMs for both timestamps when the record has no eventCreatedAtSec", () => {
    const record = buildNotificationRecord(baseInput);
    expect("eventCreatedAtSec" in record).toBe(false);
    expect(record.createdAtMs).toBe(NOW);
    expect(record.deliveredAt).toBe(NOW);
  });

  // T-10. Phase 8 step 12 measured the Notifications list as
  // `K10, K6, K5, K2, K9, K7, K8, K3, K4, K1` against a send order of `K1 … K10`,
  // and its control run with honest outer timestamps produced `M1 … M10` — exactly
  // reversed. Both are the same defect: `createdAtMs` was receipt time, so a
  // backfill drained in relay order (newest outer `created_at` first, over an axis
  // NIP-59 randomises) landed in arrival order rather than send order.
  it("sorts ten records into send order when eventCreatedAtSec descends while nowMs ascends", () => {
    // One hour before NOW, so every candidate sits inside the clamp window.
    const SEND_BASE_SEC = NOW / 1000 - 3600;
    const records = Array.from({ length: 10 }, (_unused, index) =>
      buildNotificationRecord({
        ...baseInput,
        // Newest SEND time arrives FIRST …
        eventCreatedAtSec: SEND_BASE_SEC - index * 60,
        id: `wrap-${String(index + 1).padStart(2, "0")}`,
        // … and therefore gets the EARLIEST receipt stamp.
        nowMs: NOW + index * 400,
      }),
    );
    const expectedSendOrder = [
      "wrap-01",
      "wrap-02",
      "wrap-03",
      "wrap-04",
      "wrap-05",
      "wrap-06",
      "wrap-07",
      "wrap-08",
      "wrap-09",
      "wrap-10",
    ];

    expect(idsOf(sortNotificationRecords(records))).toEqual(expectedSendOrder);

    // Without this half the case passes on any monotonic key: prove the result is
    // NOT arrival order by showing receipt order is its exact reverse.
    const byDeliveredAtDesc = [...records].sort(
      (left, right) => right.deliveredAt - left.deliveredAt,
    );
    expect(idsOf(byDeliveredAtDesc)).toEqual([...expectedSendOrder].reverse());
  });

  // T-11. `eventCreatedAtSec` is attacker-controlled and this is an ordering, cap
  // and display key, so both directions are clamped. Driven through the pure
  // resolver AND through `buildNotificationRecord`, because only the second is on
  // the ingest path.
  it("clamps a future eventCreatedAtSec to nowMs and a thirty-day-old one to nowMs minus three days", () => {
    // 1. Far future → nowMs (T-09-01: 200 forward-dated wraps must not pin the top).
    const farFutureSec = (NOW + 10 * DAY_MS) / 1000;
    expect(resolveRecordCreatedAtMs(farFutureSec, NOW)).toBe(NOW);
    expect(
      buildNotificationRecord({ ...baseInput, eventCreatedAtSec: farFutureSec })
        .createdAtMs,
    ).toBe(NOW);

    // 2. One second into the future → nowMs.
    const nearFutureSec = NOW / 1000 + 1;
    expect(resolveRecordCreatedAtMs(nearFutureSec, NOW)).toBe(NOW);
    expect(
      buildNotificationRecord({
        ...baseInput,
        eventCreatedAtSec: nearFutureSec,
      }).createdAtMs,
    ).toBe(NOW);

    // 3. Thirty days old → the backdate floor (T-09-02: must not sink below the cap).
    const thirtyDaysAgoSec = (NOW - 30 * DAY_MS) / 1000;
    expect(resolveRecordCreatedAtMs(thirtyDaysAgoSec, NOW)).toBe(
      NOW - NOTIFICATION_MAX_RECORD_BACKDATE_MS,
    );
    expect(
      buildNotificationRecord({
        ...baseInput,
        eventCreatedAtSec: thirtyDaysAgoSec,
      }).createdAtMs,
    ).toBe(NOW - NOTIFICATION_MAX_RECORD_BACKDATE_MS);

    // 4. Inside the window → passed through unchanged, in ms.
    const twoDaysAgoSec = (NOW - 2 * DAY_MS) / 1000;
    expect(resolveRecordCreatedAtMs(twoDaysAgoSec, NOW)).toBe(NOW - 2 * DAY_MS);
    expect(
      buildNotificationRecord({
        ...baseInput,
        eventCreatedAtSec: twoDaysAgoSec,
      }).createdAtMs,
    ).toBe(NOW - 2 * DAY_MS);

    // 5. Absent → nowMs. (exactOptionalPropertyTypes: omit the key, never pass undefined.)
    expect(resolveRecordCreatedAtMs(undefined, NOW)).toBe(NOW);
    expect(buildNotificationRecord(baseInput).createdAtMs).toBe(NOW);

    // 6. Non-finite → nowMs (T-09-03). NaN fails `>` and `<` alike, so the
    // Number.isFinite guard must run BEFORE the range comparisons or a NaN sort key
    // makes the whole list order undefined.
    expect(resolveRecordCreatedAtMs(Number.POSITIVE_INFINITY, NOW)).toBe(NOW);
    expect(resolveRecordCreatedAtMs(Number.NaN, NOW)).toBe(NOW);
    expect(
      buildNotificationRecord({
        ...baseInput,
        eventCreatedAtSec: Number.POSITIVE_INFINITY,
      }).createdAtMs,
    ).toBe(NOW);
    expect(
      buildNotificationRecord({ ...baseInput, eventCreatedAtSec: Number.NaN })
        .createdAtMs,
    ).toBe(NOW);
  });

  it("starts unread and un-alerted", () => {
    const record = buildNotificationRecord(baseInput);
    expect(record.alertedAt).toBeNull();
    expect(record.readAt).toBeNull();
  });

  it("never sets dismissedAt", () => {
    const record = buildNotificationRecord(baseInput);
    expect("dismissedAt" in record).toBe(false);
  });

  it("omits absent optional keys instead of writing undefined", () => {
    const record = buildNotificationRecord(baseInput);
    expect("messageId" in record).toBe(false);
    expect("offerId" in record).toBe(false);
    expect("eventCreatedAtSec" in record).toBe(false);
  });

  it("keeps supplied optional keys", () => {
    const record = buildNotificationRecord({
      ...baseInput,
      eventCreatedAtSec: 1_700_000_000,
      messageId: "message-1",
      offerId: "offer-1",
    });
    expect(record.messageId).toBe("message-1");
    expect(record.offerId).toBe("offer-1");
    expect(record.eventCreatedAtSec).toBe(1_700_000_000);
  });

  it("stores the preview clamped to the budget", () => {
    const record = buildNotificationRecord({
      ...baseInput,
      preview: "a".repeat(200),
    });
    expect(record.preview).toHaveLength(NOTIFICATION_PREVIEW_MAX_LENGTH);
  });

  it("round-trips the npubCashClaim shape with null chatId and conversationKey", () => {
    const record = buildNotificationRecord({
      ...baseInput,
      chatId: null,
      conversationKey: null,
      id: "npubCashClaim:token-1",
      kind: "npubCashClaim",
    });
    expect(record.chatId).toBeNull();
    expect(record.conversationKey).toBeNull();
    expect(record.kind).toBe("npubCashClaim");
    expect(isNotificationRecord(record)).toBe(true);
  });
});

describe("isNotificationRecord", () => {
  it("accepts a minimal valid record", () => {
    expect(isNotificationRecord(makeRawRecord())).toBe(true);
  });

  it("rejects non-object values", () => {
    expect(isNotificationRecord(null)).toBe(false);
    expect(isNotificationRecord(undefined)).toBe(false);
    expect(isNotificationRecord("str")).toBe(false);
    expect(isNotificationRecord(42)).toBe(false);
    expect(isNotificationRecord([])).toBe(false);
  });

  it("rejects a missing or non-string id", () => {
    expect(
      isNotificationRecord({
        alertedAt: null,
        chatId: "contact-1",
        conversationKey: null,
        createdAtMs: NOW,
        deliveredAt: NOW,
        kind: "chatMessage",
        preview: "hello",
        readAt: null,
        senderLabel: "Alice",
      }),
    ).toBe(false);
    expect(isNotificationRecord(makeRawRecord({ id: 42 }))).toBe(false);
  });

  it("rejects a missing or unknown kind", () => {
    expect(
      isNotificationRecord({
        alertedAt: null,
        chatId: "contact-1",
        conversationKey: null,
        createdAtMs: NOW,
        deliveredAt: NOW,
        id: "wrap-1",
        preview: "hello",
        readAt: null,
        senderLabel: "Alice",
      }),
    ).toBe(false);
    expect(isNotificationRecord(makeRawRecord({ kind: "reaction" }))).toBe(
      false,
    );
  });

  it("rejects wrongly typed timestamps", () => {
    expect(
      isNotificationRecord(makeRawRecord({ createdAtMs: "recently" })),
    ).toBe(false);
    expect(isNotificationRecord(makeRawRecord({ readAt: "yes" }))).toBe(false);
    expect(isNotificationRecord(makeRawRecord({ deliveredAt: null }))).toBe(
      false,
    );
  });

  it("treats dismissedAt as absent-or-number, never null", () => {
    expect(isNotificationRecord(makeRawRecord({ dismissedAt: null }))).toBe(
      false,
    );
    expect(isNotificationRecord(makeRawRecord({ dismissedAt: NOW }))).toBe(
      true,
    );
    expect(isNotificationRecord(makeRawRecord())).toBe(true);
  });

  it("accepts null alertedAt and readAt", () => {
    expect(
      isNotificationRecord(makeRawRecord({ alertedAt: null, readAt: null })),
    ).toBe(true);
    expect(
      isNotificationRecord(makeRawRecord({ alertedAt: NOW, readAt: NOW })),
    ).toBe(true);
  });

  it("accepts null chatId and conversationKey", () => {
    expect(
      isNotificationRecord(
        makeRawRecord({
          chatId: null,
          conversationKey: null,
          kind: "npubCashClaim",
        }),
      ),
    ).toBe(true);
    expect(isNotificationRecord(makeRawRecord({ chatId: 7 }))).toBe(false);
  });

  it("rejects a non-string preview or senderLabel", () => {
    expect(isNotificationRecord(makeRawRecord({ preview: 1 }))).toBe(false);
    expect(isNotificationRecord(makeRawRecord({ senderLabel: null }))).toBe(
      false,
    );
  });

  it("rejects wrongly typed optional scalars", () => {
    expect(
      isNotificationRecord(makeRawRecord({ eventCreatedAtSec: "1700" })),
    ).toBe(false);
    expect(isNotificationRecord(makeRawRecord({ messageId: 5 }))).toBe(false);
    expect(isNotificationRecord(makeRawRecord({ offerId: {} }))).toBe(false);
  });
});

describe("isNotificationRecordEnvelope", () => {
  it("accepts an envelope with a numeric epoch and valid records", () => {
    expect(
      isNotificationRecordEnvelope({ epoch: 1, records: [makeRawRecord()] }),
    ).toBe(true);
    expect(isNotificationRecordEnvelope({ epoch: 0, records: [] })).toBe(true);
  });

  it("rejects a non-numeric epoch, a missing epoch, a bare array and null", () => {
    expect(isNotificationRecordEnvelope({ epoch: "1", records: [] })).toBe(
      false,
    );
    expect(isNotificationRecordEnvelope({ records: [] })).toBe(false);
    expect(isNotificationRecordEnvelope([])).toBe(false);
    expect(isNotificationRecordEnvelope(null)).toBe(false);
  });

  it("rejects an envelope carrying a hostile record", () => {
    expect(
      isNotificationRecordEnvelope({
        epoch: 1,
        records: [makeRawRecord(), makeRawRecord({ kind: "reaction" })],
      }),
    ).toBe(false);
    expect(isNotificationRecordEnvelope({ epoch: 1, records: {} })).toBe(false);
  });
});

describe("sortNotificationRecords", () => {
  it("puts the newest createdAtMs first", () => {
    const sorted = sortNotificationRecords([
      makeRecord({ createdAtMs: NOW - 2000, id: "old" }),
      makeRecord({ createdAtMs: NOW, id: "new" }),
      makeRecord({ createdAtMs: NOW - 1000, id: "mid" }),
    ]);
    expect(idsOf(sorted)).toEqual(["new", "mid", "old"]);
  });

  it("breaks a createdAtMs tie by id ascending", () => {
    const sorted = sortNotificationRecords([
      makeRecord({ createdAtMs: NOW, id: "c" }),
      makeRecord({ createdAtMs: NOW, id: "a" }),
      makeRecord({ createdAtMs: NOW, id: "b" }),
    ]);
    expect(idsOf(sorted)).toEqual(["a", "b", "c"]);
  });

  it("is stable across repeated calls", () => {
    const input = [
      makeRecord({ createdAtMs: NOW, id: "b" }),
      makeRecord({ createdAtMs: NOW, id: "a" }),
      makeRecord({ createdAtMs: NOW - 1, id: "z" }),
    ];
    const first = sortNotificationRecords(input);
    const second = sortNotificationRecords(first);
    const third = sortNotificationRecords(second);
    expect(idsOf(first)).toEqual(idsOf(second));
    expect(idsOf(second)).toEqual(idsOf(third));
  });

  it("does not mutate its input", () => {
    const input = [
      makeRecord({ createdAtMs: NOW - 2000, id: "old" }),
      makeRecord({ createdAtMs: NOW, id: "new" }),
    ];
    sortNotificationRecords(input);
    expect(idsOf(input)).toEqual(["old", "new"]);
  });
});

describe("mergeNotificationRecordsById", () => {
  it("collapses the same id into one record", () => {
    const merged = mergeNotificationRecordsById(
      [makeRecord({ id: "wrap-1" })],
      [makeRecord({ id: "wrap-1" })],
    );
    expect(merged).toHaveLength(1);
  });

  it("never reverts a non-null readAt to null", () => {
    const merged = mergeNotificationRecordsById(
      [makeRecord({ id: "wrap-1", readAt: 100 })],
      [makeRecord({ id: "wrap-1", readAt: null })],
    );
    expect(merged[0]?.readAt).toBe(100);
  });

  it("adopts an incoming readAt when the persisted one is null", () => {
    const merged = mergeNotificationRecordsById(
      [makeRecord({ id: "wrap-1", readAt: null })],
      [makeRecord({ id: "wrap-1", readAt: 500 })],
    );
    expect(merged[0]?.readAt).toBe(500);
  });

  it("keeps the earlier timestamp when both sides have one", () => {
    const merged = mergeNotificationRecordsById(
      [makeRecord({ id: "wrap-1", readAt: 100 })],
      [makeRecord({ id: "wrap-1", readAt: 500 })],
    );
    expect(merged[0]?.readAt).toBe(100);
  });

  it("applies the same monotonic rule to alertedAt", () => {
    expect(
      mergeNotificationRecordsById(
        [makeRecord({ alertedAt: 100, id: "wrap-1" })],
        [makeRecord({ alertedAt: null, id: "wrap-1" })],
      )[0]?.alertedAt,
    ).toBe(100);
    expect(
      mergeNotificationRecordsById(
        [makeRecord({ alertedAt: null, id: "wrap-1" })],
        [makeRecord({ alertedAt: 500, id: "wrap-1" })],
      )[0]?.alertedAt,
    ).toBe(500);
    expect(
      mergeNotificationRecordsById(
        [makeRecord({ alertedAt: 500, id: "wrap-1" })],
        [makeRecord({ alertedAt: 100, id: "wrap-1" })],
      )[0]?.alertedAt,
    ).toBe(100);
  });

  it("applies the same monotonic rule to dismissedAt without touching readAt", () => {
    const kept = mergeNotificationRecordsById(
      [makeRecord({ dismissedAt: 100, id: "wrap-1" })],
      [makeRecord({ id: "wrap-1" })],
    );
    expect(kept[0]?.dismissedAt).toBe(100);
    expect(kept[0]?.readAt).toBeNull();

    const adopted = mergeNotificationRecordsById(
      [makeRecord({ id: "wrap-1" })],
      [makeRecord({ dismissedAt: 500, id: "wrap-1" })],
    );
    expect(adopted[0]?.dismissedAt).toBe(500);
    expect(adopted[0]?.readAt).toBeNull();

    const earliest = mergeNotificationRecordsById(
      [makeRecord({ dismissedAt: 500, id: "wrap-1" })],
      [makeRecord({ dismissedAt: 100, id: "wrap-1" })],
    );
    expect(earliest[0]?.dismissedAt).toBe(100);
  });

  it("omits dismissedAt entirely when neither side has one", () => {
    const merged = mergeNotificationRecordsById(
      [makeRecord({ id: "wrap-1" })],
      [makeRecord({ id: "wrap-1" })],
    );
    expect("dismissedAt" in (merged[0] ?? {})).toBe(false);
  });

  it("takes incoming content fields", () => {
    const merged = mergeNotificationRecordsById(
      [makeRecord({ id: "wrap-1", preview: "old", senderLabel: "Old" })],
      [makeRecord({ id: "wrap-1", preview: "new", senderLabel: "New" })],
    );
    expect(merged[0]?.preview).toBe("new");
    expect(merged[0]?.senderLabel).toBe("New");
  });

  it("keeps ids present on only one side", () => {
    const merged = mergeNotificationRecordsById(
      [makeRecord({ createdAtMs: NOW - 1, id: "only-persisted" })],
      [makeRecord({ createdAtMs: NOW, id: "only-incoming" })],
    );
    expect(idsOf(merged)).toEqual(["only-incoming", "only-persisted"]);
  });
});

describe("pruneReadNotificationRecords", () => {
  it("drops a read record older than the prune window", () => {
    const records = pruneReadNotificationRecords(
      [
        makeRecord({
          createdAtMs: NOW - 31 * DAY_MS,
          deliveredAt: NOW - 31 * DAY_MS,
          id: "stale",
          readAt: NOW,
        }),
      ],
      NOW,
    );
    expect(records).toHaveLength(0);
  });

  it("keeps a read record inside the prune window", () => {
    const records = pruneReadNotificationRecords(
      [
        makeRecord({
          createdAtMs: NOW - 29 * DAY_MS,
          deliveredAt: NOW - 29 * DAY_MS,
          id: "fresh",
          readAt: NOW,
        }),
      ],
      NOW,
    );
    expect(idsOf(records)).toEqual(["fresh"]);
  });

  // T-13. Retention is about OUR custody, not the sender's clock. Keyed on
  // `createdAtMs` — which is now clamped SEND time — a genuinely-old resynced
  // message would be pruned the instant it is read. Both halves are needed: without
  // the mirror the case also passes under a predicate that simply keeps everything.
  it("prunes on deliveredAt: a read record with an old createdAtMs but a recent deliveredAt survives", () => {
    const survivor = makeRecord({
      createdAtMs: NOW - 31 * DAY_MS,
      deliveredAt: NOW - 1 * DAY_MS,
      id: "resynced-old-message",
      readAt: NOW,
    });
    expect(idsOf(pruneReadNotificationRecords([survivor], NOW))).toEqual([
      "resynced-old-message",
    ]);

    const dropped = makeRecord({
      createdAtMs: NOW,
      deliveredAt: NOW - 31 * DAY_MS,
      id: "long-held",
      readAt: NOW,
    });
    expect(pruneReadNotificationRecords([dropped], NOW)).toHaveLength(0);
  });

  it("never age-prunes an unread record, at any age", () => {
    const records = pruneReadNotificationRecords(
      [
        makeRecord({
          createdAtMs: NOW - 3650 * DAY_MS,
          id: "ancient-unread",
          readAt: null,
        }),
      ],
      NOW,
    );
    expect(idsOf(records)).toEqual(["ancient-unread"]);
  });

  it("keeps a dismissed-but-unread record: dismissal is not reading", () => {
    const records = pruneReadNotificationRecords(
      [
        makeRecord({
          createdAtMs: NOW - 3650 * DAY_MS,
          dismissedAt: NOW - 3600 * DAY_MS,
          id: "dismissed-unread",
          readAt: null,
        }),
      ],
      NOW,
    );
    expect(idsOf(records)).toEqual(["dismissed-unread"]);
  });

  it("honours an explicit maxAgeMs override", () => {
    const records = pruneReadNotificationRecords(
      [
        makeRecord({
          createdAtMs: NOW - 2 * DAY_MS,
          deliveredAt: NOW - 2 * DAY_MS,
          id: "read",
          readAt: NOW,
        }),
      ],
      NOW,
      DAY_MS,
    );
    expect(records).toHaveLength(0);
  });

  it("does not mutate its input", () => {
    const input = [
      makeRecord({
        createdAtMs: NOW - 31 * DAY_MS,
        deliveredAt: NOW - 31 * DAY_MS,
        id: "stale",
        readAt: NOW,
      }),
    ];
    pruneReadNotificationRecords(input, NOW);
    expect(input).toHaveLength(1);
  });
});

describe("capNotificationRecords", () => {
  it("keeps the newest 200 of 201 records", () => {
    const records = Array.from({ length: 201 }, (_unused, index) =>
      makeRecord({ createdAtMs: NOW - index * 1000, id: `wrap-${index}` }),
    );
    const capped = capNotificationRecords(records);
    expect(capped).toHaveLength(NOTIFICATION_RECORD_CAP);
    expect(idsOf(capped)).not.toContain("wrap-200");
    expect(idsOf(capped)).toContain("wrap-0");
  });

  it("leaves a short list unchanged", () => {
    const records = Array.from({ length: 5 }, (_unused, index) =>
      makeRecord({ createdAtMs: NOW - index * 1000, id: `wrap-${index}` }),
    );
    expect(idsOf(capNotificationRecords(records))).toEqual(idsOf(records));
  });

  it("honours an explicit cap override", () => {
    const records = Array.from({ length: 5 }, (_unused, index) =>
      makeRecord({ createdAtMs: NOW - index * 1000, id: `wrap-${index}` }),
    );
    expect(capNotificationRecords(records, 2)).toHaveLength(2);
  });
});

describe("applyNotificationRetention", () => {
  it("prunes before it caps, so no unread record is evicted for a stale read one", () => {
    // The 200 unread records span 200 days, so the oldest unread is OLDER than the
    // 31-day-old read record. Cap-first would therefore have evicted an unread record
    // (the 199-day-old one) while the stale read record survived the cull.
    const unread = Array.from({ length: 200 }, (_unused, index) =>
      makeRecord({
        createdAtMs: NOW - index * DAY_MS,
        id: `unread-${String(index).padStart(3, "0")}`,
        readAt: null,
      }),
    );
    // The prune now keys on `deliveredAt` while the cap still keys on `createdAtMs`,
    // so this case exercises BOTH keys at once: prune (deliveredAt) has to beat cap
    // (createdAtMs). `createdAtMs` stays exactly where it was.
    const staleRead = makeRecord({
      createdAtMs: NOW - 31 * DAY_MS - 1,
      deliveredAt: NOW - 31 * DAY_MS - 1,
      id: "stale-read",
      readAt: NOW - 31 * DAY_MS,
    });

    const retained = applyNotificationRetention([...unread, staleRead], NOW);

    expect(retained).toHaveLength(200);
    expect(idsOf(retained)).not.toContain("stale-read");
    for (const record of unread) {
      expect(idsOf(retained)).toContain(record.id);
    }
  });

  it("drops the oldest read record when the cap is exceeded", () => {
    const unread = Array.from({ length: 200 }, (_unused, index) =>
      makeRecord({
        createdAtMs: NOW - index * 1000,
        id: `unread-${String(index).padStart(3, "0")}`,
        readAt: null,
      }),
    );
    // Recent enough to survive the prune, oldest of the 201 so the cap takes it.
    const oldestRead = makeRecord({
      createdAtMs: NOW - 201 * 1000,
      id: "oldest-read",
      readAt: NOW,
    });

    const retained = applyNotificationRetention([...unread, oldestRead], NOW);

    expect(retained).toHaveLength(200);
    expect(idsOf(retained)).not.toContain("oldest-read");
    expect(countUnreadNotificationRecords(retained)).toBe(200);
  });

  it("does evict an unread record when all 201 are unread — accepted behaviour", () => {
    const unread = Array.from({ length: 201 }, (_unused, index) =>
      makeRecord({
        createdAtMs: NOW - index * 1000,
        id: `unread-${String(index).padStart(3, "0")}`,
        readAt: null,
      }),
    );

    const retained = applyNotificationRetention(unread, NOW);

    expect(retained).toHaveLength(NOTIFICATION_RECORD_CAP);
    expect(idsOf(retained)).not.toContain("unread-200");
    expect(countUnreadNotificationRecords(retained)).toBe(200);
  });

  it("returns records newest-first", () => {
    const retained = applyNotificationRetention(
      [
        makeRecord({ createdAtMs: NOW - 5000, id: "old" }),
        makeRecord({ createdAtMs: NOW, id: "new" }),
      ],
      NOW,
    );
    expect(idsOf(retained)).toEqual(["new", "old"]);
  });
});

describe("countUnreadNotificationRecords", () => {
  it("counts only records whose readAt is null", () => {
    expect(
      countUnreadNotificationRecords([
        makeRecord({ id: "a", readAt: null }),
        makeRecord({ id: "b", readAt: NOW }),
        makeRecord({ id: "c", readAt: null }),
      ]),
    ).toBe(2);
    expect(countUnreadNotificationRecords([])).toBe(0);
  });

  it("counts a dismissed-but-unread record as unread", () => {
    expect(
      countUnreadNotificationRecords([
        makeRecord({ dismissedAt: NOW, id: "dismissed", readAt: null }),
      ]),
    ).toBe(1);
  });

  it("counts a read record as read even when it was also dismissed", () => {
    expect(
      countUnreadNotificationRecords([
        makeRecord({ dismissedAt: NOW, id: "both", readAt: NOW }),
      ]),
    ).toBe(0);
  });

  it("ignores alertedAt entirely", () => {
    expect(
      countUnreadNotificationRecords([
        makeRecord({ alertedAt: NOW, id: "alerted", readAt: null }),
      ]),
    ).toBe(1);
  });
});
