// RED-first spec for the in-app notification banner queue (BANNER-01).
//
// Everything the roadmap's criteria 1, 1b, 2, 3, 4a (write side) and 4c claim is
// decided in this one module, as pure functions of `(state, event, nowMs)`. That
// is the whole reason those criteria are provable here with fake timers instead
// of on a device.
//
// Four properties are load-bearing and each has an explicitly named case:
//   1. Dwell is >= 10 000 ms, and a PAUSE resumes the REMAINDER. A regression that
//      re-arms a fresh full timeout is caught by an explicit negative assertion,
//      not by an approximate one that would merely drift.
//   2. Collapse is keyed on the SENDER (`conversationKey ?? chatId ?? kind`),
//      never on `record.id` — keying on the id would make collapse unreachable.
//      The badge is `collapsedCount - 1`; the off-by-one is pinned literally.
//   3. A queued entry starts burning its dwell on PROMOTION, not on enqueue, so a
//      promoted banner gets a FULL dwell. Nothing is ever destroyed unshown —
//      the exact inverse of `useToasts.ts`'s silent eviction.
//   4. A user dismissal calls `markDismissed` for EVERY folded record and never
//      touches read state. The mocked store exposes ONLY `markDismissed`, so any
//      attempt to reach `markRead` from this module is a TypeError rather than a
//      silently passing test.
//
// The record store is mocked so this file never touches localStorage and so
// `markDismissed` is observable as a spy (same shape as
// `notificationTapRoute.test.ts`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anchorBannerDwell,
  BANNER_ANCHORED_DWELL_MS,
  BANNER_DWELL_COMMIT_MARGIN_MS,
  BANNER_DWELL_MS,
  BANNER_MAX_VISIBLE,
  BANNER_SELF_RESTRAINT_DISMISSALS,
  BANNER_SELF_RESTRAINT_WINDOW_MS,
  BANNER_SUPPRESSION_MS,
  BANNER_TAP_ACCEPT_DELAY_MS,
  canAcceptBannerTap,
  clearNotificationBanners,
  collapseKeyForRecord,
  dismissBanner,
  dismissNotificationBanner,
  EMPTY_NOTIFICATION_BANNER_STATE,
  enqueueBanner,
  enqueueNotificationBanner,
  type NotificationBannerState,
  nextBannerExpiryMs,
  notificationBannerStore,
  pauseBanner,
  resumeBanner,
  tickBanners,
  tickNotificationBanners,
} from "./notificationBannerQueue";
import type { NotificationRecord } from "./notificationRecord";
import { notificationRecordStore } from "./notificationRecordStore";

const { markDismissedMock } = vi.hoisted(() => ({
  markDismissedMock: vi.fn<(id: string, atMs: number) => void>(),
}));

vi.mock("./notificationRecordStore", () => ({
  notificationRecordStore: { markDismissed: markDismissedMock },
}));

/** The single wall-clock origin for every case in this file. */
const T = 1_750_000_000_000;

const makeRecord = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  alertedAt: null,
  chatId: "chat-alice",
  conversationKey: "pubkey-alice",
  createdAtMs: T,
  deliveredAt: T,
  id: "wrap-1",
  kind: "chatMessage",
  preview: "hello",
  readAt: null,
  senderLabel: "Alice",
  ...overrides,
});

/** One record per distinct sender, so each gets its own collapse key. */
const senderRecord = (
  index: number,
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord =>
  makeRecord({
    chatId: `chat-${index}`,
    conversationKey: `pubkey-${index}`,
    id: `wrap-${index}`,
    preview: `message ${index}`,
    senderLabel: `Sender ${index}`,
    ...overrides,
  });

/** Folds a list of records through `enqueueBanner`, collecting the outcomes. */
const enqueueAll = (
  records: readonly (readonly [NotificationRecord, number])[],
  initial: NotificationBannerState = EMPTY_NOTIFICATION_BANNER_STATE,
): { outcomes: string[]; state: NotificationBannerState } => {
  const outcomes: string[] = [];
  let state = initial;
  for (const [record, atMs] of records) {
    const result = enqueueBanner(state, record, atMs);
    outcomes.push(result.outcome);
    state = result.state;
  }
  return { outcomes, state };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T);
  markDismissedMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe("dwell (criterion 1)", () => {
  it("shows one enqueued record immediately with a full dwell armed", () => {
    const { outcome, state } = enqueueBanner(
      EMPTY_NOTIFICATION_BANNER_STATE,
      makeRecord(),
      T,
    );

    expect(outcome).toBe("shown");
    expect(state.visible).toHaveLength(1);
    expect(state.queued).toHaveLength(0);
    expect(state.visible[0].shownAtMs).toBe(T);
    expect(state.visible[0].enqueuedAtMs).toBe(T);
    expect(state.visible[0].expiresAtMs).toBe(T + 10_000);
    expect(state.visible[0].remainingMs).toBe(10_000);
    expect(state.visible[0].pausedAtMs).toBeNull();
    expect(state.visible[0].collapsedCount).toBe(1);
  });

  it("is still visible one millisecond before the dwell elapses, and returns the SAME state reference", () => {
    const { state } = enqueueBanner(
      EMPTY_NOTIFICATION_BANNER_STATE,
      makeRecord(),
      T,
    );

    const ticked = tickBanners(state, T + 9_999);

    expect(ticked.visible).toHaveLength(1);
    expect(ticked).toBe(state);
  });

  it("self-dismisses exactly at the dwell boundary", () => {
    const { state } = enqueueBanner(
      EMPTY_NOTIFICATION_BANNER_STATE,
      makeRecord(),
      T,
    );

    const ticked = tickBanners(state, T + 10_000);

    expect(ticked.visible).toHaveLength(0);
    expect(ticked).not.toBe(state);
  });

  it("pins BANNER_DWELL_MS at exactly 10 000 ms (the criterion is 'at least 10 seconds')", () => {
    expect(BANNER_DWELL_MS).toBe(10_000);
    expect(BANNER_MAX_VISIBLE).toBe(2);
  });
});

// ---------------------------------------------------------------------------

// The emulator gate (plan 05-08) measured the ACTUAL on-screen dwell of a real
// gift wrap's banner at 9 646 ms — below the >= 10 000 ms the roadmap criterion
// requires. The cause is structural rather than flaky: `expiresAtMs` was armed at
// the ENQUEUE instant, while the card only reaches the DOM one React commit
// later. On the Pixel 6 emulator that gap measured 125-394 ms, so the visible
// dwell was `BANNER_DWELL_MS - commitLatency` and could never reach 10 000 ms on
// any real device. `anchorBannerDwell` re-bases the clock to the instant the
// entry actually reached the screen; the component calls it from a LAYOUT effect,
// which runs after the DOM mutation and before paint.
describe("dwell anchoring (criterion 1, on-screen time)", () => {
  const shownState = (atMs: number = T): NotificationBannerState =>
    enqueueBanner(EMPTY_NOTIFICATION_BANNER_STATE, makeRecord(), atMs).state;

  it("re-bases the dwell onto the instant the entry actually reached the screen", () => {
    const state = anchorBannerDwell(shownState(), "pubkey-alice", T + 400);
    const entry = state.visible[0];

    expect(entry.dwellAnchoredAtMs).toBe(T + 400);
    expect(entry.expiresAtMs).toBe(T + 400 + BANNER_ANCHORED_DWELL_MS);
    expect(entry.shownAtMs).toBe(T + 400);
  });

  it("arms the anchored deadline ABOVE BANNER_DWELL_MS, because the criterion is a floor", () => {
    // The anchor runs in a layout effect, so the pixel appears some time AFTER
    // the clock starts. Plan 05-08 measured that commit-to-paint gap at ~220-260
    // ms on the heavy promote-a-queued-card commit, and arming exactly
    // BANNER_DWELL_MS from the layout instant delivered 9 995.7-10 016.7 ms of
    // measured on-screen time — straddling a hard ">= 10 000".
    expect(BANNER_DWELL_MS).toBe(10_000);
    expect(BANNER_DWELL_COMMIT_MARGIN_MS).toBeGreaterThan(0);
    expect(BANNER_ANCHORED_DWELL_MS).toBe(
      BANNER_DWELL_MS + BANNER_DWELL_COMMIT_MARGIN_MS,
    );
  });

  it("gives a full BANNER_DWELL_MS of ON-SCREEN time however late the commit lands", () => {
    const anchored = anchorBannerDwell(shownState(), "pubkey-alice", T + 5_000);

    // Still there at exactly the criterion's floor...
    const atFloor = tickBanners(anchored, T + 5_000 + BANNER_DWELL_MS);
    expect(atFloor.visible).toHaveLength(1);

    const justBefore = tickBanners(
      anchored,
      T + 5_000 + BANNER_ANCHORED_DWELL_MS - 1,
    );
    expect(justBefore.visible).toHaveLength(1);

    // ...and gone at the armed boundary.
    const atBoundary = tickBanners(
      anchored,
      T + 5_000 + BANNER_ANCHORED_DWELL_MS,
    );
    expect(atBoundary.visible).toHaveLength(0);
  });

  it("runs the tap-acceptance delay from the on-screen instant, not the enqueue instant", () => {
    const anchored = anchorBannerDwell(shownState(), "pubkey-alice", T + 300);
    const entry = anchored.visible[0];

    // 400 ms after the ENQUEUE, but only 100 ms after the card was on screen.
    expect(canAcceptBannerTap(entry, T + BANNER_TAP_ACCEPT_DELAY_MS)).toBe(
      false,
    );
    expect(
      canAcceptBannerTap(entry, T + 300 + BANNER_TAP_ACCEPT_DELAY_MS),
    ).toBe(true);
  });

  it("is idempotent: a second anchor returns the SAME state reference", () => {
    const first = anchorBannerDwell(shownState(), "pubkey-alice", T + 400);
    const second = anchorBannerDwell(first, "pubkey-alice", T + 900);

    // Reference identity, not deep equality — the store skips its emit on
    // `Object.is`, and that is what stops the layout effect from looping.
    expect(second).toBe(first);
    expect(second.visible[0].expiresAtMs).toBe(
      T + 400 + BANNER_ANCHORED_DWELL_MS,
    );
  });

  it("returns the SAME state reference for an unknown collapse key", () => {
    const state = shownState();
    expect(anchorBannerDwell(state, "pubkey-nobody", T + 400)).toBe(state);
  });

  it("never anchors a queued entry, which has not reached the screen at all", () => {
    const { state } = enqueueAll([
      [senderRecord(1), T],
      [senderRecord(2), T],
      [senderRecord(3), T],
    ]);

    expect(state.queued).toHaveLength(1);
    expect(anchorBannerDwell(state, "pubkey-3", T + 400)).toBe(state);
    expect(state.queued[0].dwellAnchoredAtMs).toBeNull();
  });

  it("banks rather than arms when the entry was paused before it reached the screen", () => {
    const paused = pauseBanner(shownState(), "pubkey-alice", T + 100);
    const anchored = anchorBannerDwell(paused, "pubkey-alice", T + 400);
    const entry = anchored.visible[0];

    expect(entry.dwellAnchoredAtMs).toBe(T + 400);
    expect(entry.expiresAtMs).toBeNull();
    expect(entry.pausedAtMs).toBe(T + 100);
    // The hold started before the card was on screen, so the full dwell is banked
    // rather than the fraction that had already burned down.
    expect(entry.remainingMs).toBe(BANNER_ANCHORED_DWELL_MS);
  });

  it("re-anchors a PROMOTED entry, which reaches the screen one commit after promotion", () => {
    const { state } = enqueueAll([
      [senderRecord(1), T],
      [senderRecord(2), T],
      [senderRecord(3), T],
    ]);

    const promoted = tickBanners(
      anchorBannerDwell(anchorBannerDwell(state, "pubkey-1", T), "pubkey-2", T),
      T + BANNER_ANCHORED_DWELL_MS,
    );
    const third = promoted.visible.find(
      (entry) => entry.collapseKey === "pubkey-3",
    );
    expect(third?.dwellAnchoredAtMs).toBeNull();

    const commitMs = T + BANNER_ANCHORED_DWELL_MS + 300;
    const anchored = anchorBannerDwell(promoted, "pubkey-3", commitMs);
    expect(anchored.visible[0].expiresAtMs).toBe(
      commitMs + BANNER_ANCHORED_DWELL_MS,
    );
  });
});

describe("pause (criterion 1b)", () => {
  const shown = (): NotificationBannerState =>
    enqueueBanner(EMPTY_NOTIFICATION_BANNER_STATE, makeRecord(), T).state;

  it("banks the remaining dwell and disarms the expiry", () => {
    const paused = pauseBanner(shown(), "pubkey-alice", T + 3_000);

    expect(paused.visible[0].pausedAtMs).toBe(T + 3_000);
    expect(paused.visible[0].remainingMs).toBe(7_000);
    expect(paused.visible[0].expiresAtMs).toBeNull();
  });

  it("never expires while paused, however long the hold lasts", () => {
    const paused = pauseBanner(shown(), "pubkey-alice", T + 3_000);

    const ticked = tickBanners(paused, T + 60_000);

    expect(ticked.visible).toHaveLength(1);
    expect(ticked).toBe(paused);
  });

  it("resumes the REMAINDER, not a fresh full dwell", () => {
    const paused = pauseBanner(shown(), "pubkey-alice", T + 3_000);

    const resumed = resumeBanner(paused, "pubkey-alice", T + 60_000);

    expect(resumed.visible[0].expiresAtMs).toBe(T + 67_000);
    expect(resumed.visible[0].pausedAtMs).toBeNull();
    // The regression guard: a re-armed fresh timeout would land here instead.
    expect(resumed.visible[0].expiresAtMs).not.toBe(
      T + 60_000 + BANNER_DWELL_MS,
    );
  });

  it("still totals exactly 10 000 ms of un-paused time across two hold/release cycles", () => {
    let state = shown();
    state = pauseBanner(state, "pubkey-alice", T + 2_000); // 2 000 burned, 8 000 left
    state = resumeBanner(state, "pubkey-alice", T + 5_000); // expires T + 13 000
    state = pauseBanner(state, "pubkey-alice", T + 9_000); // 4 000 more burned
    state = resumeBanner(state, "pubkey-alice", T + 20_000); // expires T + 24 000

    expect(state.visible[0].expiresAtMs).toBe(T + 24_000);
    expect(tickBanners(state, T + 23_999).visible).toHaveLength(1);
    expect(tickBanners(state, T + 24_000).visible).toHaveLength(0);
  });

  it("returns the SAME state reference for a pause of an unknown key", () => {
    const state = shown();

    expect(pauseBanner(state, "pubkey-nobody", T + 1_000)).toBe(state);
    expect(resumeBanner(state, "pubkey-alice", T + 1_000)).toBe(state);
  });
});

// ---------------------------------------------------------------------------

describe("collapse (criterion 2)", () => {
  const fiveFromOneSender = () =>
    enqueueAll([
      [makeRecord({ id: "wrap-1", preview: "one" }), T],
      [makeRecord({ id: "wrap-2", preview: "two" }), T + 2_000],
      [makeRecord({ id: "wrap-3", preview: "three" }), T + 4_000],
      [makeRecord({ id: "wrap-4", preview: "four" }), T + 6_000],
      [makeRecord({ id: "wrap-5", preview: "five" }), T + 8_000],
    ]);

  it("folds five records from one sender into ONE entry carrying the newest body", () => {
    const { state } = fiveFromOneSender();

    expect(state.visible).toHaveLength(1);
    expect(state.queued).toHaveLength(0);
    expect(state.visible[0].collapsedCount).toBe(5);
    expect(state.visible[0].recordIds).toHaveLength(5);
    expect(state.visible[0].latestRecord.id).toBe("wrap-5");
    expect(state.visible[0].latestRecord.preview).toBe("five");
  });

  it("renders the badge as collapsedCount - 1, which is literally 4 here", () => {
    const { state } = fiveFromOneSender();

    expect(state.visible[0].collapsedCount - 1).toBe(4);
  });

  it("leaves a single record at collapsedCount 1, so the badge value is 0 and must be hidden", () => {
    const { state } = enqueueBanner(
      EMPTY_NOTIFICATION_BANNER_STATE,
      makeRecord(),
      T,
    );

    expect(state.visible[0].collapsedCount).toBe(1);
    expect(state.visible[0].collapsedCount - 1).toBe(0);
  });

  it("RESETS the dwell on every collapse", () => {
    const { state } = fiveFromOneSender();

    expect(state.visible[0].expiresAtMs).toBe(T + 18_000);
    expect(state.visible[0].remainingMs).toBe(BANNER_DWELL_MS);
    expect(tickBanners(state, T + 17_999).visible).toHaveLength(1);
    expect(tickBanners(state, T + 18_000).visible).toHaveLength(0);
  });

  it("reports 'shown' once and 'collapsed' for every subsequent record", () => {
    const { outcomes } = fiveFromOneSender();

    expect(outcomes).toEqual([
      "shown",
      "collapsed",
      "collapsed",
      "collapsed",
      "collapsed",
    ]);
  });

  it("does not move shownAtMs on a collapse (the tap delay runs from first appearance)", () => {
    const { state } = fiveFromOneSender();

    expect(state.visible[0].shownAtMs).toBe(T);
    expect(state.visible[0].enqueuedAtMs).toBe(T);
  });

  it("is idempotent on record id: the same id twice counts twice but is stored once", () => {
    const sameId = enqueueAll([
      [makeRecord({ id: "wrap-1" }), T],
      [makeRecord({ id: "wrap-1" }), T + 1_000],
    ]);
    const distinctIds = enqueueAll([
      [makeRecord({ id: "wrap-1" }), T],
      [makeRecord({ id: "wrap-2" }), T + 1_000],
    ]);

    expect(sameId.state.visible[0].collapsedCount).toBe(2);
    expect(sameId.state.visible[0].recordIds).toEqual(["wrap-1"]);
    expect(distinctIds.state.visible[0].collapsedCount).toBe(2);
    expect(distinctIds.state.visible[0].recordIds).toEqual([
      "wrap-1",
      "wrap-2",
    ]);
  });

  it("collapses into a QUEUED entry without giving it a dwell or a shownAtMs", () => {
    const { outcomes, state } = enqueueAll([
      [senderRecord(1), T],
      [senderRecord(2), T + 1_000],
      [senderRecord(3), T + 2_000],
      [
        senderRecord(3, { id: "wrap-3b", preview: "second from three" }),
        T + 3_000,
      ],
    ]);

    expect(outcomes).toEqual(["shown", "shown", "queued", "collapsed"]);
    expect(state.queued).toHaveLength(1);
    expect(state.queued[0].collapsedCount).toBe(2);
    expect(state.queued[0].shownAtMs).toBeNull();
    expect(state.queued[0].expiresAtMs).toBeNull();
    expect(state.queued[0].remainingMs).toBe(BANNER_DWELL_MS);
    expect(state.queued[0].latestRecord.preview).toBe("second from three");
  });
});

// ---------------------------------------------------------------------------

describe("collapseKey", () => {
  it("prefers conversationKey over chatId", () => {
    expect(
      collapseKeyForRecord(
        makeRecord({ chatId: "chat-x", conversationKey: "pubkey-x" }),
      ),
    ).toBe("pubkey-x");
  });

  it("falls back to chatId when conversationKey is null", () => {
    expect(
      collapseKeyForRecord(
        makeRecord({ chatId: "chat-x", conversationKey: null }),
      ),
    ).toBe("chat-x");
  });

  it("falls back to chatId when conversationKey is blank whitespace", () => {
    expect(
      collapseKeyForRecord(
        makeRecord({ chatId: "chat-x", conversationKey: "   " }),
      ),
    ).toBe("chat-x");
  });

  it("falls back to kind when both are null, so repeated npubCashClaims collapse into one entry", () => {
    const claim = (id: string) =>
      makeRecord({
        chatId: null,
        conversationKey: null,
        id,
        kind: "npubCashClaim",
      });

    expect(collapseKeyForRecord(claim("npubCashClaim:a"))).toBe(
      "npubCashClaim",
    );

    const { state } = enqueueAll([
      [claim("npubCashClaim:a"), T],
      [claim("npubCashClaim:b"), T + 1_000],
    ]);

    expect(state.visible).toHaveLength(1);
    expect(state.visible[0].collapsedCount).toBe(2);
  });

  it("is NEVER the record id: two ids under one conversationKey produce ONE entry", () => {
    const first = makeRecord({ id: "wrap-1" });
    const second = makeRecord({ id: "wrap-2" });

    // Keying on the id would yield two distinct keys and therefore two banners.
    expect(first.id).not.toBe(second.id);
    expect(collapseKeyForRecord(first)).not.toBe(first.id);
    expect(collapseKeyForRecord(first)).toBe(collapseKeyForRecord(second));

    const { state } = enqueueAll([
      [first, T],
      [second, T + 1_000],
    ]);

    expect(state.visible).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe("queue (criterion 3)", () => {
  const threeSenders = () =>
    enqueueAll([
      [senderRecord(1), T],
      [senderRecord(2), T],
      [senderRecord(3), T],
    ]);

  it("shows two and queues the third", () => {
    const { outcomes, state } = threeSenders();

    expect(outcomes).toEqual(["shown", "shown", "queued"]);
    expect(state.visible).toHaveLength(2);
    expect(state.queued).toHaveLength(1);
  });

  it("does not start the queued entry's dwell at enqueue time", () => {
    const { state } = threeSenders();

    expect(state.queued[0].shownAtMs).toBeNull();
    expect(state.queued[0].expiresAtMs).toBeNull();
    expect(state.queued[0].enqueuedAtMs).toBe(T);
    expect(state.queued[0].remainingMs).toBe(BANNER_DWELL_MS);
  });

  it("promotes the queue head with a FULL dwell that starts at promotion", () => {
    const promoted = tickBanners(threeSenders().state, T + 10_000);

    expect(promoted.visible).toHaveLength(1);
    expect(promoted.queued).toHaveLength(0);
    expect(promoted.visible[0].latestRecord.id).toBe("wrap-3");
    expect(promoted.visible[0].shownAtMs).toBe(T + 10_000);
    expect(promoted.visible[0].expiresAtMs).toBe(T + 20_000);

    // The assertion that fails if dwell burns while queued.
    expect(tickBanners(promoted, T + 19_999).visible).toHaveLength(1);
    expect(tickBanners(promoted, T + 20_000).visible).toHaveLength(0);
  });

  it("destroys nothing unshown: every enqueued id is visible at some point", () => {
    const { state } = threeSenders();
    const seen = new Set<string>();
    const collect = (next: NotificationBannerState) => {
      for (const entry of next.visible) {
        for (const recordId of entry.recordIds) seen.add(recordId);
      }
    };

    collect(state);
    collect(tickBanners(state, T + 10_000));

    expect([...seen].sort()).toEqual(["wrap-1", "wrap-2", "wrap-3"]);
  });

  it("queues without an upper bound: worst-case drain is distinct_senders x BANNER_DWELL_MS", () => {
    const { outcomes, state } = enqueueAll(
      Array.from(
        { length: 10 },
        (_unused, index): [NotificationRecord, number] => [
          senderRecord(index + 1),
          T,
        ],
      ),
    );

    expect(state.visible).toHaveLength(2);
    expect(state.queued).toHaveLength(8);
    expect(outcomes.filter((outcome) => outcome === "queued")).toHaveLength(8);
    expect(state.queued.map((entry) => entry.latestRecord.id)).toEqual([
      "wrap-3",
      "wrap-4",
      "wrap-5",
      "wrap-6",
      "wrap-7",
      "wrap-8",
      "wrap-9",
      "wrap-10",
    ]);
  });
});

// ---------------------------------------------------------------------------

describe("tap acceptance (criterion 4c)", () => {
  const visibleEntry = () =>
    enqueueBanner(EMPTY_NOTIFICATION_BANNER_STATE, makeRecord(), T).state
      .visible[0];

  it("refuses a tap on the very frame the banner appears", () => {
    expect(canAcceptBannerTap(visibleEntry(), T)).toBe(false);
  });

  it("refuses a tap one millisecond before the acceptance delay elapses", () => {
    expect(canAcceptBannerTap(visibleEntry(), T + 399)).toBe(false);
  });

  it("accepts a tap exactly at the acceptance delay", () => {
    expect(canAcceptBannerTap(visibleEntry(), T + 400)).toBe(true);
  });

  it("refuses a tap on a queued entry, which has never been shown", () => {
    const { state } = enqueueAll([
      [senderRecord(1), T],
      [senderRecord(2), T],
      [senderRecord(3), T],
    ]);

    expect(state.queued[0].shownAtMs).toBeNull();
    expect(canAcceptBannerTap(state.queued[0], T + 100_000)).toBe(false);
  });

  it("pins the acceptance delay above the 180 ms CSS entrance duration fixed in plan 05-03", () => {
    expect(BANNER_TAP_ACCEPT_DELAY_MS).toBe(400);
    // 180 ms is the entrance animation; a delay below it would accept taps mid-slide.
    expect(BANNER_TAP_ACCEPT_DELAY_MS).toBeGreaterThan(180);
  });
});

// ---------------------------------------------------------------------------

describe("dismiss (criterion 4a, write side)", () => {
  const threeFoldedIntoOne = () =>
    enqueueAll([
      [makeRecord({ id: "wrap-1" }), T],
      [makeRecord({ id: "wrap-2" }), T + 1_000],
      [makeRecord({ id: "wrap-3" }), T + 2_000],
    ]).state;

  it("returns EVERY folded record id, not just latestRecord.id", () => {
    const { dismissedRecordIds, state } = dismissBanner(
      threeFoldedIntoOne(),
      "pubkey-alice",
      T + 3_000,
      "user",
    );

    expect(dismissedRecordIds).toEqual(["wrap-1", "wrap-2", "wrap-3"]);
    expect(state.visible).toHaveLength(0);
  });

  it("returns no ids at all for an auto expiry or a tap", () => {
    expect(
      dismissBanner(threeFoldedIntoOne(), "pubkey-alice", T + 3_000, "auto")
        .dismissedRecordIds,
    ).toEqual([]);
    expect(
      dismissBanner(threeFoldedIntoOne(), "pubkey-alice", T + 3_000, "tap")
        .dismissedRecordIds,
    ).toEqual([]);
  });

  it("calls markDismissed once per folded record, each with the dismissal instant", () => {
    clearNotificationBanners();
    enqueueNotificationBanner(makeRecord({ id: "wrap-1" }), T);
    enqueueNotificationBanner(makeRecord({ id: "wrap-2" }), T + 1_000);
    enqueueNotificationBanner(makeRecord({ id: "wrap-3" }), T + 2_000);

    dismissNotificationBanner("pubkey-alice", T + 3_000, "user");

    expect(markDismissedMock).toHaveBeenCalledTimes(3);
    expect(markDismissedMock.mock.calls).toEqual([
      ["wrap-1", T + 3_000],
      ["wrap-2", T + 3_000],
      ["wrap-3", T + 3_000],
    ]);
  });

  it("never calls markDismissed for an auto expiry or a tap", () => {
    clearNotificationBanners();
    enqueueNotificationBanner(makeRecord({ id: "wrap-1" }), T);
    dismissNotificationBanner("pubkey-alice", T + 1_000, "auto");

    enqueueNotificationBanner(makeRecord({ id: "wrap-2" }), T + 2_000);
    dismissNotificationBanner("pubkey-alice", T + 3_000, "tap");

    expect(markDismissedMock).not.toHaveBeenCalled();
  });

  it("cannot reach read state at all: the store surface here is exactly markDismissed", () => {
    expect(Object.keys(notificationRecordStore)).toEqual(["markDismissed"]);
  });

  it("frees a slot and promotes the queue head with a full dwell", () => {
    const { state } = enqueueAll([
      [senderRecord(1), T],
      [senderRecord(2), T],
      [senderRecord(3), T],
    ]);

    const after = dismissBanner(state, "pubkey-1", T + 4_000, "user").state;

    expect(after.visible).toHaveLength(2);
    expect(after.queued).toHaveLength(0);
    expect(after.visible[1].latestRecord.id).toBe("wrap-3");
    expect(after.visible[1].shownAtMs).toBe(T + 4_000);
    expect(after.visible[1].expiresAtMs).toBe(T + 14_000);
  });
});

// ---------------------------------------------------------------------------

describe("self-restraint", () => {
  const twoVisible = () =>
    enqueueAll([
      [senderRecord(1), T],
      [senderRecord(2), T],
    ]).state;

  it("pins the constants (60 000 ms is AOSP heads_up_default_snooze_length_ms)", () => {
    expect(BANNER_SELF_RESTRAINT_DISMISSALS).toBe(2);
    expect(BANNER_SELF_RESTRAINT_WINDOW_MS).toBe(10_000);
    expect(BANNER_SUPPRESSION_MS).toBe(60_000);
  });

  it("does not suppress after a single user dismissal", () => {
    const after = dismissBanner(twoVisible(), "pubkey-1", T, "user").state;

    expect(after.suppressedUntilMs).toBe(0);
    expect(after.recentDismissals).toEqual([T]);
    expect(enqueueBanner(after, senderRecord(3), T + 1).outcome).toBe("shown");
  });

  it("suppresses for 60 000 ms after two user dismissals 5 000 ms apart, and resets the tally", () => {
    let state = dismissBanner(twoVisible(), "pubkey-1", T, "user").state;
    state = dismissBanner(state, "pubkey-2", T + 5_000, "user").state;

    expect(state.suppressedUntilMs).toBe(T + 5_000 + 60_000);
    expect(state.recentDismissals).toEqual([]);
  });

  it("reports a suppressed enqueue as its own outcome and leaves the state reference untouched", () => {
    let state = dismissBanner(twoVisible(), "pubkey-1", T, "user").state;
    state = dismissBanner(state, "pubkey-2", T + 5_000, "user").state;

    const result = enqueueBanner(state, senderRecord(9), T + 6_000);

    expect(result.outcome).toBe("suppressed");
    expect(result.state).toBe(state);
    expect(result.state.visible).toHaveLength(0);
    expect(result.state.queued).toHaveLength(0);
  });

  it("accepts an enqueue again at exactly suppressedUntilMs", () => {
    let state = dismissBanner(twoVisible(), "pubkey-1", T, "user").state;
    state = dismissBanner(state, "pubkey-2", T + 5_000, "user").state;

    const result = enqueueBanner(
      state,
      senderRecord(9),
      state.suppressedUntilMs,
    );

    expect(result.outcome).toBe("shown");
  });

  it("does not trigger for two dismissals 10 001 ms apart (outside the window)", () => {
    let state = dismissBanner(twoVisible(), "pubkey-1", T, "user").state;
    state = dismissBanner(state, "pubkey-2", T + 10_001, "user").state;

    expect(state.suppressedUntilMs).toBe(0);
    expect(state.recentDismissals).toEqual([T + 10_001]);
  });

  it("never counts an auto expiry", () => {
    let state = dismissBanner(twoVisible(), "pubkey-1", T, "auto").state;
    state = dismissBanner(state, "pubkey-2", T + 1_000, "user").state;

    expect(state.suppressedUntilMs).toBe(0);
    expect(state.recentDismissals).toEqual([T + 1_000]);
  });

  it("never counts a tap", () => {
    let state = dismissBanner(twoVisible(), "pubkey-1", T, "tap").state;
    state = dismissBanner(state, "pubkey-2", T + 1_000, "user").state;

    expect(state.suppressedUntilMs).toBe(0);
    expect(state.recentDismissals).toEqual([T + 1_000]);
  });

  it("needs two FRESH user dismissals to re-arm after a trigger", () => {
    let state = dismissBanner(twoVisible(), "pubkey-1", T, "user").state;
    state = dismissBanner(state, "pubkey-2", T + 5_000, "user").state;
    const firstSuppression = state.suppressedUntilMs;

    // One fresh dismissal after the suppression lapses is NOT enough.
    const resumeAt = firstSuppression;
    state = enqueueBanner(state, senderRecord(3), resumeAt).state;
    state = dismissBanner(state, "pubkey-3", resumeAt, "user").state;
    expect(state.suppressedUntilMs).toBe(firstSuppression);

    // The second one re-arms.
    state = enqueueBanner(state, senderRecord(4), resumeAt + 1_000).state;
    state = dismissBanner(state, "pubkey-4", resumeAt + 1_000, "user").state;
    expect(state.suppressedUntilMs).toBe(
      resumeAt + 1_000 + BANNER_SUPPRESSION_MS,
    );
  });
});

// ---------------------------------------------------------------------------

describe("nextBannerExpiryMs", () => {
  it("is null when nothing is visible", () => {
    expect(nextBannerExpiryMs(EMPTY_NOTIFICATION_BANNER_STATE)).toBeNull();
  });

  it("is null when the only visible entry is paused", () => {
    const shown = enqueueBanner(
      EMPTY_NOTIFICATION_BANNER_STATE,
      makeRecord(),
      T,
    ).state;

    expect(
      nextBannerExpiryMs(pauseBanner(shown, "pubkey-alice", T + 1_000)),
    ).toBeNull();
  });

  it("is the minimum expiry when two are running", () => {
    const { state } = enqueueAll([
      [senderRecord(1), T],
      [senderRecord(2), T + 3_000],
    ]);

    expect(nextBannerExpiryMs(state)).toBe(T + 10_000);
  });
});

// ---------------------------------------------------------------------------

describe("store (reference stability)", () => {
  it("returns the identical snapshot reference across two calls with no mutation", () => {
    clearNotificationBanners();

    expect(notificationBannerStore.get()).toBe(notificationBannerStore.get());
  });

  it("does NOT notify on a tick that expired nothing", () => {
    clearNotificationBanners();
    enqueueNotificationBanner(makeRecord(), T);

    const listener = vi.fn<() => void>();
    const unsubscribe = notificationBannerStore.subscribe(listener);
    const before = notificationBannerStore.get();
    tickNotificationBanners(T + 1_000);

    expect(listener).not.toHaveBeenCalled();
    expect(notificationBannerStore.get()).toBe(before);
    unsubscribe();
  });

  it("notifies on an enqueue", () => {
    clearNotificationBanners();

    const listener = vi.fn<() => void>();
    const unsubscribe = notificationBannerStore.subscribe(listener);
    const outcome = enqueueNotificationBanner(makeRecord(), T);

    expect(outcome).toBe("shown");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(notificationBannerStore.get().visible).toHaveLength(1);
    unsubscribe();
  });

  it("clears everything, including the suppression tally, and notifies", () => {
    clearNotificationBanners();
    enqueueNotificationBanner(senderRecord(1), T);
    enqueueNotificationBanner(senderRecord(2), T);
    enqueueNotificationBanner(senderRecord(3), T);
    dismissNotificationBanner("pubkey-1", T, "user");
    dismissNotificationBanner("pubkey-2", T + 1_000, "user");

    expect(notificationBannerStore.get().suppressedUntilMs).toBeGreaterThan(0);

    const listener = vi.fn<() => void>();
    const unsubscribe = notificationBannerStore.subscribe(listener);
    clearNotificationBanners();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(notificationBannerStore.get()).toEqual(
      EMPTY_NOTIFICATION_BANNER_STATE,
    );
    expect(notificationBannerStore.get().suppressedUntilMs).toBe(0);
    expect(notificationBannerStore.get().recentDismissals).toEqual([]);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    clearNotificationBanners();

    const listener = vi.fn<() => void>();
    const unsubscribe = notificationBannerStore.subscribe(listener);
    unsubscribe();
    enqueueNotificationBanner(makeRecord(), T);

    expect(listener).not.toHaveBeenCalled();
  });

  it("is pure: identical calls 50 ms of clock apart agree, and the record is not mutated", async () => {
    const record = makeRecord();
    const snapshot = { ...record };

    const first = enqueueBanner(EMPTY_NOTIFICATION_BANNER_STATE, record, T);
    await vi.advanceTimersByTimeAsync(50);
    const second = enqueueBanner(EMPTY_NOTIFICATION_BANNER_STATE, record, T);

    expect(second.outcome).toBe(first.outcome);
    expect(second.state).toEqual(first.state);
    expect(record).toEqual(snapshot);
    expect(EMPTY_NOTIFICATION_BANNER_STATE.visible).toHaveLength(0);
  });
});
