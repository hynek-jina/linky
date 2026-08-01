/**
 * The in-app notification banner's queue / collapse / dwell engine.
 *
 * The whole of BANNER-01's behavioural claim lives here: the >= 10 s dwell, the
 * hold-to-pause bookkeeping, FIFO promotion behind a cap of two, per-sender
 * collapse, the "+N" arithmetic, the touch-acceptance delay and the
 * self-restraint rule. All of it is decided as pure functions of
 * `(state, event, nowMs)`, which is what makes those criteria provable with fake
 * timers instead of on a device.
 *
 * The file is deliberately two halves:
 *
 *   PURE half   — no clock read, no `document`, no storage. EVERY entry point
 *                 takes `nowMs` as an argument, exactly the discipline
 *                 `buildNotificationRecord` (notificationRecord.ts) and
 *                 `openNotificationRecord` (notificationTapRoute.ts) already use.
 *                 The component owns the only timer and calls `tickBanners`.
 *
 *   IMPURE half — the module-level external store, copied in shape from
 *                 `mainSwipeProgressStore.ts`, plus the single production caller
 *                 of `notificationRecordStore.markDismissed`.
 *
 * Reference stability is a hard requirement, not a nicety: React's external-store
 * hook compares snapshots with `Object.is`, so any pure function that produced no
 * change MUST return its argument state unchanged, and the store's setter must
 * skip the emit when the next state is identical. Otherwise every tick re-renders.
 */
import React from "react";
import type { NotificationRecord } from "./notificationRecord";
import { notificationRecordStore } from "./notificationRecordStore";

/**
 * The GUARANTEED MINIMUM time on screen: the ceiling of Material's 4-10 s
 * snackbar range, and roughly four times the ~2.5 s toast dwell that produced
 * the original bug report.
 */
export const BANNER_DWELL_MS = 10_000;
/**
 * Headroom on top of `BANNER_DWELL_MS`, added when the dwell is anchored to the
 * on-screen commit.
 *
 * The anchor runs in a LAYOUT effect, which is after React's DOM mutation but
 * still before the browser paints — so the pixel appears some time after the
 * clock starts. Plan 05-08 measured that gap on a Pixel 6 emulator: negligible
 * for a light commit, but ~220-260 ms for the heavy commit that expires two
 * cards and promotes a queued one in one pass. Arming exactly `BANNER_DWELL_MS`
 * from the layout instant therefore delivered 9 995.7-10 016.7 ms of measured
 * on-screen time — straddling a criterion that is a hard ">=".
 *
 * The criterion is a FLOOR, not a target, so the deadline carries the gap rather
 * than sitting on it. 300 ms covers the worst measured commit-to-paint gap plus
 * `setTimeout` jitter and is far below the ~1 s at which a duration difference
 * becomes perceptible.
 */
export const BANNER_DWELL_COMMIT_MARGIN_MS = 300;
/** The deadline actually armed once an entry is on screen. */
export const BANNER_ANCHORED_DWELL_MS =
  BANNER_DWELL_MS + BANNER_DWELL_COMMIT_MARGIN_MS;
export const BANNER_MAX_VISIBLE = 2;
/**
 * Taps inside this window are refused. Android gives a heads-up a 700 ms
 * `touch_acceptance_delay` for the same reason; 400 ms comfortably clears the
 * 180 ms CSS entrance without the banner feeling dead. Enforced in the reducer
 * rather than in CSS so it is testable (threat T-05-05).
 */
export const BANNER_TAP_ACCEPT_DELAY_MS = 400;
export const BANNER_SELF_RESTRAINT_DISMISSALS = 2;
export const BANNER_SELF_RESTRAINT_WINDOW_MS = 10_000;
/** AOSP `heads_up_default_snooze_length_ms`. Not an invented number. */
export const BANNER_SUPPRESSION_MS = 60_000;

export interface NotificationBannerEntry {
  collapseKey: string;
  /** Starts at 1. The badge renders `collapsedCount - 1` and is hidden at 1. */
  collapsedCount: number;
  /**
   * The instant this entry actually reached the SCREEN, or null until it has.
   *
   * Enqueue and paint are not the same moment: `notify.ts` enqueues synchronously
   * while it is still decrypting a wrap, and the card only lands in the DOM one
   * React commit later — 125-394 ms later on the Pixel 6 emulator (plan 05-08).
   * Arming the deadline at enqueue therefore left a VISIBLE dwell of
   * `BANNER_DWELL_MS - commitLatency`, measured at 9 646 ms against a >= 10 000 ms
   * criterion. `anchorBannerDwell` re-bases the clock onto this instant.
   */
  dwellAnchoredAtMs: number | null;
  enqueuedAtMs: number;
  /** Wall-clock instant this entry expires. Null while queued or paused. */
  expiresAtMs: number | null;
  latestRecord: NotificationRecord;
  pausedAtMs: number | null;
  recordIds: readonly string[];
  /** Dwell left. Authoritative while queued or paused; re-armed into expiresAtMs on resume. */
  remainingMs: number;
  /** Null while queued; set on promotion, which is when dwell starts. */
  shownAtMs: number | null;
}

export interface NotificationBannerState {
  queued: readonly NotificationBannerEntry[];
  recentDismissals: readonly number[];
  /**
   * D-05-07. Two user dismissals inside `BANNER_SELF_RESTRAINT_WINDOW_MS` stop
   * BANNERS for `BANNER_SUPPRESSION_MS` — never the record, never the shade
   * entry, never the unread count, which is the entire justification for
   * skipping an alert at all.
   *
   * Because this is a SECOND mechanism that produces "no banner", the enqueue
   * outcome is discriminated: a caller or a CDP probe can tell reducer-level
   * self-restraint (`"suppressed"`) from decision-level suppression
   * (`resolveNotificationAlert` returning `no-post`, which never reaches this
   * module at all). This mitigation is required, not optional. The suppression
   * lives in memory, so an app restart clears it.
   */
  suppressedUntilMs: number;
  visible: readonly NotificationBannerEntry[];
}

/**
 * `suppressed` = the self-restraint rule dropped it INSIDE the reducer.
 * That is deliberately distinguishable from decision-level suppression
 * (`resolveNotificationAlert` returning `no-post`, which never reaches here).
 */
export type NotificationBannerEnqueueOutcome =
  | "collapsed"
  | "queued"
  | "shown"
  | "suppressed";

export type NotificationBannerDismissCause = "auto" | "tap" | "user";

/**
 * D-05-06. Banner state is in-memory only and dies with the page. It is
 * deliberately NOT persisted and takes no `linky.` key: the durable artifact is
 * the NotificationRecord, which the record store already keeps owner-scoped.
 * Reviving banners after a reload would re-alert the human about messages they
 * have already seen.
 */
export const EMPTY_NOTIFICATION_BANNER_STATE: NotificationBannerState = {
  queued: [],
  recentDismissals: [],
  suppressedUntilMs: 0,
  visible: [],
};

// ---------------------------------------------------------------------------
// Pure half
// ---------------------------------------------------------------------------

/**
 * Blank-safe part normalisation, mirroring `normalizeId` in
 * `notificationTapRoute.ts`: a whitespace-only field is treated exactly like an
 * absent one, so a tampered record cannot open a banner slot keyed on `" "`.
 */
const normalizeKeyPart = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * The collapse key is the SENDER: `conversationKey ?? chatId ?? kind`.
 *
 * `conversationKey` (the sender pubkey) comes first because it survives the
 * unknown-contact -> saved-contact rename that MUTATES `chatId`. `kind` is the
 * last resort so repeated npub.cash claims — the one kind with no peer — fold
 * into a single "+N" entry rather than N separate banners.
 *
 * It is NEVER `record.id`. Every wrap carries a unique id, so keying on it would
 * make collapse unreachable and criterion 2 unsatisfiable.
 */
export const collapseKeyForRecord = (record: NotificationRecord): string =>
  normalizeKeyPart(record.conversationKey) ??
  normalizeKeyPart(record.chatId) ??
  record.kind;

/**
 * Folds one more record into an existing entry.
 *
 * `collapsedCount` always increments (it is the "+N" arithmetic and counts
 * arrivals), while `recordIds` is a SET: re-enqueueing the same record id is
 * idempotent, so a redelivered wrap cannot make the dismissal write twice.
 * `shownAtMs` is untouched — the touch-acceptance delay runs from the banner's
 * first appearance, not from the latest collapse.
 */
const mergeRecordIntoEntry = (
  entry: NotificationBannerEntry,
  record: NotificationRecord,
  nowMs: number,
  isVisible: boolean,
): NotificationBannerEntry => ({
  ...entry,
  collapsedCount: entry.collapsedCount + 1,
  expiresAtMs:
    isVisible && entry.pausedAtMs === null ? nowMs + BANNER_DWELL_MS : null,
  latestRecord: record,
  recordIds: entry.recordIds.includes(record.id)
    ? entry.recordIds
    : [...entry.recordIds, record.id],
  remainingMs: BANNER_DWELL_MS,
});

const makeEntry = (
  record: NotificationRecord,
  nowMs: number,
  isVisible: boolean,
): NotificationBannerEntry => ({
  collapseKey: collapseKeyForRecord(record),
  collapsedCount: 1,
  dwellAnchoredAtMs: null,
  enqueuedAtMs: nowMs,
  expiresAtMs: isVisible ? nowMs + BANNER_DWELL_MS : null,
  latestRecord: record,
  pausedAtMs: null,
  recordIds: [record.id],
  remainingMs: BANNER_DWELL_MS,
  shownAtMs: isVisible ? nowMs : null,
});

/**
 * Shared post-removal step: fill every free visible slot from the head of the
 * queue. Dwell STARTS HERE, not at enqueue, so a promoted entry always gets the
 * full `BANNER_DWELL_MS` on screen. Anything else would let an entry burn its
 * dwell while invisible, which is exactly the silent-drop failure this queue
 * exists to prevent.
 */
const promoteQueue = (
  visible: readonly NotificationBannerEntry[],
  queued: readonly NotificationBannerEntry[],
  nowMs: number,
): {
  queued: NotificationBannerEntry[];
  visible: NotificationBannerEntry[];
} => {
  const nextVisible = [...visible];
  const nextQueued = [...queued];
  while (nextVisible.length < BANNER_MAX_VISIBLE && nextQueued.length > 0) {
    const head = nextQueued.shift();
    if (head === undefined) break;
    nextVisible.push({
      ...head,
      // Null again on purpose: a promoted card also reaches the DOM one commit
      // after promotion, so it re-anchors exactly like a freshly shown one.
      dwellAnchoredAtMs: null,
      expiresAtMs: nowMs + BANNER_DWELL_MS,
      pausedAtMs: null,
      remainingMs: BANNER_DWELL_MS,
      shownAtMs: nowMs,
    });
  }
  return { queued: nextQueued, visible: nextVisible };
};

export const enqueueBanner = (
  state: NotificationBannerState,
  record: NotificationRecord,
  nowMs: number,
): {
  outcome: NotificationBannerEnqueueOutcome;
  state: NotificationBannerState;
} => {
  // 1. Self-restraint. The record is already durable; only the banner is lost.
  if (nowMs < state.suppressedUntilMs) {
    return { outcome: "suppressed", state };
  }

  const collapseKey = collapseKeyForRecord(record);

  // 2. Collapse into a visible entry and reset its dwell.
  const visibleIndex = state.visible.findIndex(
    (entry) => entry.collapseKey === collapseKey,
  );
  if (visibleIndex >= 0) {
    const nextVisible = [...state.visible];
    nextVisible[visibleIndex] = mergeRecordIntoEntry(
      state.visible[visibleIndex],
      record,
      nowMs,
      true,
    );
    return { outcome: "collapsed", state: { ...state, visible: nextVisible } };
  }

  // 3. Collapse into a queued entry, keeping its position and its unstarted dwell.
  const queuedIndex = state.queued.findIndex(
    (entry) => entry.collapseKey === collapseKey,
  );
  if (queuedIndex >= 0) {
    const nextQueued = [...state.queued];
    nextQueued[queuedIndex] = mergeRecordIntoEntry(
      state.queued[queuedIndex],
      record,
      nowMs,
      false,
    );
    return { outcome: "collapsed", state: { ...state, queued: nextQueued } };
  }

  // 4. A free slot: show it now.
  if (state.visible.length < BANNER_MAX_VISIBLE) {
    return {
      outcome: "shown",
      state: {
        ...state,
        visible: [...state.visible, makeEntry(record, nowMs, true)],
      },
    };
  }

  // 5. Otherwise queue it, FIFO.
  //
  // DELIBERATE NON-GOAL: `queued` is UNBOUNDED in Phase 5. The research's
  // `MAX_QUEUED_BANNERS` overflow-collapse was considered and NOT adopted, so
  // worst-case drain is `distinct_senders x BANNER_DWELL_MS`. In practice that is
  // bounded by per-sender collapse (one chatty sender occupies one slot forever)
  // and by the self-restraint rule (threat T-05-01). The ten-sender test pins the
  // behaviour so it is defined rather than undefined. Nothing is ever dropped —
  // that is the whole point, and the exact inverse of `useToasts`'s eviction.
  return {
    outcome: "queued",
    state: {
      ...state,
      queued: [...state.queued, makeEntry(record, nowMs, false)],
    },
  };
};

/**
 * Re-bases a visible entry's dwell onto the instant it actually reached the
 * screen. Called once per entry, from the component's LAYOUT effect — after the
 * DOM mutation and before paint.
 *
 * This is what makes `BANNER_DWELL_MS` a guarantee about ON-SCREEN time rather
 * than about time since the alert decision, and it arms
 * `BANNER_ANCHORED_DWELL_MS` rather than `BANNER_DWELL_MS` so the criterion's
 * floor survives the commit-to-paint gap.
 *
 * Idempotent by construction: an already-anchored entry returns the argument
 * state unchanged, which is what stops the layout effect from looping through
 * the store's emit.
 */
export const anchorBannerDwell = (
  state: NotificationBannerState,
  collapseKey: string,
  nowMs: number,
): NotificationBannerState => {
  const index = state.visible.findIndex(
    (entry) => entry.collapseKey === collapseKey,
  );
  // A queued entry is not on screen, so there is nothing to anchor it to.
  if (index < 0) return state;

  const entry = state.visible[index];
  if (entry.dwellAnchoredAtMs !== null) return state;

  const nextVisible = [...state.visible];
  nextVisible[index] = {
    ...entry,
    dwellAnchoredAtMs: nowMs,
    // A hold that began before the first commit banks the FULL dwell rather than
    // the fraction that had already burned down while the card was invisible.
    expiresAtMs:
      entry.pausedAtMs === null ? nowMs + BANNER_ANCHORED_DWELL_MS : null,
    remainingMs: BANNER_ANCHORED_DWELL_MS,
    // The tap-acceptance delay guards against tap-jacking during the entrance,
    // so it too has to run from the on-screen instant, not from the alert.
    shownAtMs: nowMs,
  };
  return { ...state, visible: nextVisible };
};

/**
 * Expires every visible entry whose armed deadline has passed, then refills.
 * A tick removal is cause `"auto"`: it records NO dismissal for the
 * self-restraint tally and writes NOTHING to the record store.
 */
export const tickBanners = (
  state: NotificationBannerState,
  nowMs: number,
): NotificationBannerState => {
  const survivors = state.visible.filter(
    (entry) => entry.expiresAtMs === null || entry.expiresAtMs > nowMs,
  );
  if (survivors.length === state.visible.length) return state;

  const promoted = promoteQueue(survivors, state.queued, nowMs);
  return { ...state, queued: promoted.queued, visible: promoted.visible };
};

/**
 * Banks the REMAINING dwell and disarms the deadline. Never clears and re-arms a
 * fresh full timeout: that would let a user hold and release repeatedly to
 * extend one banner forever, and it would make elapsed time untestable.
 */
export const pauseBanner = (
  state: NotificationBannerState,
  collapseKey: string,
  nowMs: number,
): NotificationBannerState => {
  const index = state.visible.findIndex(
    (entry) => entry.collapseKey === collapseKey,
  );
  if (index < 0) return state;

  const entry = state.visible[index];
  const expiresAtMs = entry.expiresAtMs;
  if (entry.pausedAtMs !== null || expiresAtMs === null) return state;

  const nextVisible = [...state.visible];
  nextVisible[index] = {
    ...entry,
    expiresAtMs: null,
    pausedAtMs: nowMs,
    remainingMs: Math.max(0, expiresAtMs - nowMs),
  };
  return { ...state, visible: nextVisible };
};

/** Re-arms the banked REMAINDER, never `BANNER_DWELL_MS`. */
export const resumeBanner = (
  state: NotificationBannerState,
  collapseKey: string,
  nowMs: number,
): NotificationBannerState => {
  const index = state.visible.findIndex(
    (entry) => entry.collapseKey === collapseKey,
  );
  if (index < 0) return state;

  const entry = state.visible[index];
  if (entry.pausedAtMs === null) return state;

  const nextVisible = [...state.visible];
  nextVisible[index] = {
    ...entry,
    expiresAtMs: nowMs + entry.remainingMs,
    pausedAtMs: null,
  };
  return { ...state, visible: nextVisible };
};

/** Removes the entry and promotes the queue head. Records self-restraint only for `"user"`. */
export const dismissBanner = (
  state: NotificationBannerState,
  collapseKey: string,
  nowMs: number,
  cause: NotificationBannerDismissCause,
): {
  /** The record ids the CALLER must mark dismissed. Empty unless cause === "user". */
  dismissedRecordIds: readonly string[];
  state: NotificationBannerState;
} => {
  const visibleIndex = state.visible.findIndex(
    (entry) => entry.collapseKey === collapseKey,
  );
  const queuedIndex =
    visibleIndex >= 0
      ? -1
      : state.queued.findIndex((entry) => entry.collapseKey === collapseKey);
  if (visibleIndex < 0 && queuedIndex < 0) {
    return { dismissedRecordIds: [], state };
  }

  const removed =
    visibleIndex >= 0 ? state.visible[visibleIndex] : state.queued[queuedIndex];
  const survivors =
    visibleIndex >= 0
      ? state.visible.filter((_entry, index) => index !== visibleIndex)
      : state.visible;
  const remainingQueue =
    queuedIndex >= 0
      ? state.queued.filter((_entry, index) => index !== queuedIndex)
      : state.queued;
  const promoted = promoteQueue(survivors, remainingQueue, nowMs);

  // Auto-expiry and tap never count towards self-restraint and never hand the
  // caller anything to write: only a deliberate human "go away" does.
  if (cause !== "user") {
    return {
      dismissedRecordIds: [],
      state: { ...state, queued: promoted.queued, visible: promoted.visible },
    };
  }

  const recentDismissals = [...state.recentDismissals, nowMs].filter(
    (atMs) => atMs >= nowMs - BANNER_SELF_RESTRAINT_WINDOW_MS,
  );
  const triggered = recentDismissals.length >= BANNER_SELF_RESTRAINT_DISMISSALS;

  return {
    // EVERY folded record, not just `latestRecord.id` (D-05-05's naming trap).
    dismissedRecordIds: removed.recordIds,
    state: {
      queued: promoted.queued,
      // Cleared on trigger, so re-arming takes two FRESH dismissals.
      recentDismissals: triggered ? [] : recentDismissals,
      suppressedUntilMs: triggered
        ? nowMs + BANNER_SUPPRESSION_MS
        : state.suppressedUntilMs,
      visible: promoted.visible,
    },
  };
};

export const canAcceptBannerTap = (
  entry: NotificationBannerEntry,
  nowMs: number,
): boolean =>
  entry.shownAtMs !== null &&
  nowMs - entry.shownAtMs >= BANNER_TAP_ACCEPT_DELAY_MS;

/** The soonest expiresAtMs among visible, un-paused entries. Null when nothing is running. */
export const nextBannerExpiryMs = (
  state: NotificationBannerState,
): number | null => {
  let soonest: number | null = null;
  for (const entry of state.visible) {
    const expiresAtMs = entry.expiresAtMs;
    if (entry.pausedAtMs !== null || expiresAtMs === null) continue;
    if (soonest === null || expiresAtMs < soonest) soonest = expiresAtMs;
  }
  return soonest;
};

// ---------------------------------------------------------------------------
// Impure half — module-level external store (mainSwipeProgressStore.ts shape)
// ---------------------------------------------------------------------------

let storeState: NotificationBannerState = EMPTY_NOTIFICATION_BANNER_STATE;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

/** Skips the emit on an unchanged snapshot, so a no-op tick cannot re-render. */
const setStoreState = (nextState: NotificationBannerState): void => {
  if (Object.is(storeState, nextState)) return;
  storeState = nextState;
  emit();
};

export const notificationBannerStore = {
  get: (): NotificationBannerState => storeState,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const enqueueNotificationBanner = (
  record: NotificationRecord,
  nowMs: number,
): NotificationBannerEnqueueOutcome => {
  const result = enqueueBanner(storeState, record, nowMs);
  setStoreState(result.state);
  return result.outcome;
};

export const tickNotificationBanners = (nowMs: number): void => {
  setStoreState(tickBanners(storeState, nowMs));
};

/**
 * Called once per entry from the component's layout effect. Safe to call on
 * every commit: an already-anchored entry yields the SAME state reference, the
 * setter skips its emit, and the effect therefore does not loop.
 */
export const anchorNotificationBannerDwell = (
  collapseKey: string,
  nowMs: number,
): void => {
  setStoreState(anchorBannerDwell(storeState, collapseKey, nowMs));
};

export const pauseNotificationBanner = (
  collapseKey: string,
  nowMs: number,
): void => {
  setStoreState(pauseBanner(storeState, collapseKey, nowMs));
};

export const resumeNotificationBanner = (
  collapseKey: string,
  nowMs: number,
): void => {
  setStoreState(resumeBanner(storeState, collapseKey, nowMs));
};

/**
 * The ONLY place in this module that touches the record store.
 *
 * `markDismissed` shipped in plan 04-03 fully implemented and unit-tested but
 * entirely unwired; this is its first production caller. It is called once per
 * FOLDED record, not once per banner, and it is write-once per record so the
 * loop is idempotent.
 *
 * A dismissal must NEVER imply that the human read anything: unread is exactly
 * `readAt === null` (`countUnreadNotificationRecords`), and `dismissedAt` is a
 * fourth, purely informational timestamp. This module cannot reach read state at
 * all — that is a grep-provable invariant, and the spec's mocked store exposes
 * only `markDismissed` so an attempt would be a TypeError.
 */
export const dismissNotificationBanner = (
  collapseKey: string,
  nowMs: number,
  cause: NotificationBannerDismissCause,
): void => {
  const result = dismissBanner(storeState, collapseKey, nowMs, cause);
  setStoreState(result.state);
  for (const recordId of result.dismissedRecordIds) {
    notificationRecordStore.markDismissed(recordId, nowMs);
  }
};

/**
 * Owner-switch / logout kill switch (T-05-SEC-01). The queue holds decrypted
 * previews for the identity that was signed in, so it must be emptied — along
 * with the self-restraint tally — the instant the owner binding changes.
 */
export const clearNotificationBanners = (): void => {
  setStoreState(EMPTY_NOTIFICATION_BANNER_STATE);
};

export const useNotificationBanners = (): NotificationBannerState =>
  React.useSyncExternalStore(
    notificationBannerStore.subscribe,
    notificationBannerStore.get,
    notificationBannerStore.get,
  );
