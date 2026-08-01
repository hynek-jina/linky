/**
 * The in-app notification banner surface (Phase 5, BANNER-01).
 *
 * Presentational only. Every behavioural decision — the >= 10 s dwell, the
 * hold-to-pause remainder, FIFO promotion behind a cap of two, per-sender
 * collapse, the "+N" arithmetic, the tap-acceptance delay and the self-restraint
 * rule — was already made in `notificationBannerQueue`. This file renders that
 * state, carries the gestures, and owns the single clock that wakes the reducer.
 *
 * This component registers NO visible surface. `surfaceFromRoute`'s `case "chat"`
 * plus decision row 5 already make criterion 5 hold with zero code here, and a
 * call to `registerVisibleSurface` from this file would set the module-level
 * override that `resolveCurrentVisibleSurface` returns in preference to the
 * route-derived surface — so the banner would suppress every subsequent alert
 * for as long as it happened to be on screen (research D-05-08). That is a real
 * bug, not a missing feature.
 */
import React from "react";
import {
  anchorNotificationBannerDwell,
  canAcceptBannerTap,
  dismissNotificationBanner,
  type NotificationBannerEntry,
  nextBannerExpiryMs,
  notificationBannerStore,
  pauseNotificationBanner,
  resumeNotificationBanner,
  tickNotificationBanners,
  useNotificationBanners,
} from "../app/lib/notificationBannerQueue";
import { openNotificationRecord } from "../app/lib/notificationTapRoute";
import { navigateTo } from "../hooks/useRouting";

/** `SWIPE_REPLY_THRESHOLD` / `SWIPE_REPLY_VERTICAL_TOLERANCE` (ChatMessage.tsx:98-99), */
/** which that file exports neither of, so the values are restated rather than imported. */
const BANNER_SWIPE_THRESHOLD_PX = 48;
const BANNER_SWIPE_PERPENDICULAR_TOLERANCE_PX = 24;
/**
 * Past this, the gesture is a drag and can no longer become a tap — even when it
 * never reaches the swipe threshold. A partial drag that navigated on release
 * would be the same accidental-open bug the acceptance delay exists to stop.
 */
const BANNER_TAP_MOVE_SLOP_PX = 10;
/**
 * A press held longer than this is a HOLD, not a tap: releasing it resumes the
 * banked dwell and opens nothing.
 *
 * Without this ceiling "holding pauses the dwell, releasing resumes the
 * remainder" would be unobservable — every release later than the 400 ms
 * acceptance delay would navigate away instead of resuming, and a user who held
 * the card to finish reading it would be thrown into the chat for their trouble.
 * The value is `LONG_PRESS_MS` (`ChatMessage.tsx:100`), the press ceiling this
 * repo already uses.
 */
const BANNER_TAP_MAX_PRESS_MS = 450;

interface BannerGesture {
  moved: boolean;
  pressedAtMs: number;
  x: number;
  y: number;
}

interface NotificationBannerProps {
  t: (key: string) => string;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  t,
}) => {
  /*
   * This component renders ONLY from the banner queue, never from
   * `useNotificationRecords()`. Records are written for EVERY event including
   * cold-start catch-up — that is the entire point of the record store — so
   * subscribing to them here would turn every reconnect into the banner storm
   * this phase exists to avoid (research P5). The two stores are deliberately
   * separate: `notificationRecordStore` is durable history, this queue is the
   * ephemeral on-screen surface.
   */
  const state = useNotificationBanners();

  /** Per-collapse-key pointer origin. A ref, so a drag never re-renders. */
  const gesturesRef = React.useRef(new Map<string, BannerGesture>());

  /*
   * The dwell is a promise about ON-SCREEN time, so its clock starts HERE — after
   * React has put the card in the DOM and before the browser paints — never at
   * the instant `notify.ts` enqueued it.
   *
   * The two are not the same moment. `notify.ts` enqueues synchronously in the
   * middle of decrypting a wrap, and the commit lands one React pass later: the
   * plan 05-08 emulator gate measured 125-394 ms of that gap on a Pixel 6 and,
   * with the deadline armed at enqueue, an on-screen dwell of 9 646 ms against a
   * >= 10 000 ms criterion. Since the gap is device latency it has no upper
   * bound, so no larger `BANNER_DWELL_MS` would have fixed it.
   *
   * `useLayoutEffect` rather than `useEffect`: a passive effect runs AFTER paint,
   * which would anchor the clock a frame late and, worse, leave a window in which
   * a card is visible with a stale deadline. Anchoring is idempotent — the
   * reducer returns the same state reference once an entry is anchored, the store
   * skips its emit, and this effect therefore settles after exactly one extra
   * commit instead of looping.
   */
  React.useLayoutEffect(() => {
    const nowMs = Date.now();
    for (const entry of state.visible) {
      if (entry.dwellAnchoredAtMs !== null) continue;
      anchorNotificationBannerDwell(entry.collapseKey, nowMs);
    }
  }, [state]);

  /*
   * The reducer holds the dwell authority; this effect is the ONLY clock in the
   * feature and it merely wakes the reducer. One timeout at a time, re-armed on
   * every state change — no interval, no animation frame, no per-entry timer.
   *
   * It is also SELF-HEALING, and that is load-bearing rather than defensive.
   * `window.setTimeout` is allowed to fire fractionally early. When it does, the
   * reducer expires nothing, returns the SAME state reference, the store skips
   * its emit, and this effect — keyed on the state snapshot — never re-runs. The
   * banner would then sit on screen forever. So after each tick the callback
   * re-reads the store and re-arms while an expiry is still pending and still in
   * the future. Fake timers fire exactly, so only the hand-fired test case in
   * the spec can catch a regression here.
   */
  React.useEffect(() => {
    let timeoutId: number | null = null;

    const arm = (expiryMs: number): void => {
      timeoutId = window.setTimeout(
        () => {
          timeoutId = null;
          tickNotificationBanners(Date.now());
          const followUpMs = nextBannerExpiryMs(notificationBannerStore.get());
          if (followUpMs === null || followUpMs <= Date.now()) return;
          arm(followUpMs);
        },
        Math.max(0, expiryMs - Date.now()),
      );
    };

    const nextMs = nextBannerExpiryMs(state);
    if (nextMs !== null) arm(nextMs);

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [state]);

  /*
   * The `pointerType !== "touch"` guard from `ChatMessage.tsx:541,565` is
   * deliberately NOT copied. A mouse drag should dismiss a banner on desktop and
   * on the web build too; this is an omission by decision, not by oversight.
   */
  const handlePointerDown = React.useCallback(
    (
      entry: NotificationBannerEntry,
      event: React.PointerEvent<HTMLButtonElement>,
    ): void => {
      const nowMs = Date.now();
      gesturesRef.current.set(entry.collapseKey, {
        moved: false,
        pressedAtMs: nowMs,
        x: event.clientX,
        y: event.clientY,
      });
      pauseNotificationBanner(entry.collapseKey, nowMs);
    },
    [],
  );

  const handlePointerMove = React.useCallback(
    (
      entry: NotificationBannerEntry,
      event: React.PointerEvent<HTMLButtonElement>,
    ): void => {
      const gesture = gesturesRef.current.get(entry.collapseKey);
      if (gesture === undefined) return;

      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (
        Math.abs(dx) > BANNER_TAP_MOVE_SLOP_PX ||
        Math.abs(dy) > BANNER_TAP_MOVE_SLOP_PX
      ) {
        gesture.moved = true;
      }

      const horizontal =
        Math.abs(dx) >= BANNER_SWIPE_THRESHOLD_PX &&
        Math.abs(dy) <= BANNER_SWIPE_PERPENDICULAR_TOLERANCE_PX;
      // Upward is the Android heads-up dismissal; downward is deliberately inert.
      const verticalUp =
        dy <= -BANNER_SWIPE_THRESHOLD_PX &&
        Math.abs(dx) <= BANNER_SWIPE_PERPENDICULAR_TOLERANCE_PX;
      if (!horizontal && !verticalUp) return;

      // Dropping the origin is what stops the following `pointerup` from also
      // firing the tap path on a card that is already gone.
      gesturesRef.current.delete(entry.collapseKey);
      dismissNotificationBanner(entry.collapseKey, Date.now(), "user");
    },
    [],
  );

  /*
   * `canAcceptBannerTap` is checked HERE, in the handler, rather than by timing
   * CSS `pointer-events` — CSS timing is untestable, and Android ships a 700 ms
   * `touch_acceptance_delay` for exactly this reason (research P7).
   *
   * `scrollToMessage` is deliberately omitted from the deps (research D-05-11
   * option a): it is `triggerChatScrollToBottom`, which is hook state rather
   * than a module export, so passing it would drag this component into the
   * shell's prop graph and re-render scope. Opening a chat already scrolls to
   * the bottom for a fresh incoming message, and two of the four toasts this
   * banner replaces had no tap handler at all, so no path regresses.
   *
   * Only the newest folded record is opened. The others are marked read by the
   * route-observing chat-open bulk writer (`useAppShellComposition.tsx:464-467`),
   * never by a loop in this file.
   */
  const handlePointerUp = React.useCallback(
    (entry: NotificationBannerEntry): void => {
      const nowMs = Date.now();
      const gesture = gesturesRef.current.get(entry.collapseKey);
      gesturesRef.current.delete(entry.collapseKey);
      resumeNotificationBanner(entry.collapseKey, nowMs);

      if (gesture === undefined || gesture.moved) return;
      if (nowMs - gesture.pressedAtMs > BANNER_TAP_MAX_PRESS_MS) return;
      if (!canAcceptBannerTap(entry, nowMs)) return;

      openNotificationRecord(entry.latestRecord, {
        navigate: navigateTo,
        nowMs,
      });
      // Cause "tap" writes nothing: the record was just marked read for real.
      dismissNotificationBanner(entry.collapseKey, nowMs, "tap");
    },
    [],
  );

  const handlePointerCancel = React.useCallback(
    (entry: NotificationBannerEntry): void => {
      gesturesRef.current.delete(entry.collapseKey);
      resumeNotificationBanner(entry.collapseKey, Date.now());
    },
    [],
  );

  const handlePointerEnter = React.useCallback(
    (entry: NotificationBannerEntry): void => {
      pauseNotificationBanner(entry.collapseKey, Date.now());
    },
    [],
  );

  /*
   * A dismissal writes `dismissedAt` and nothing else. Unread is exactly
   * `readAt === null`, so clearing the banner must never clear unread state —
   * the store call behind this is the single writer, and cause "user" is the
   * only cause that writes at all.
   */
  const handleClose = React.useCallback(
    (
      entry: NotificationBannerEntry,
      event: React.MouseEvent<HTMLButtonElement>,
    ): void => {
      event.stopPropagation();
      dismissNotificationBanner(entry.collapseKey, Date.now(), "user");
    },
    [],
  );

  if (state.visible.length === 0) return null;

  return (
    <div
      className="notification-banner-container"
      role="status"
      aria-live="polite"
      aria-label={t("notificationBannerLabel")}
    >
      {state.visible.map((entry) => (
        // Keyed by the collapse key, which is stable across a collapse — never
        // by array index, which would remount a card when a slot frees.
        <div
          className="notification-banner"
          data-collapse-key={entry.collapseKey}
          key={entry.collapseKey}
        >
          <button
            className="notification-banner-card"
            type="button"
            aria-label={t("notificationBannerOpen")}
            onPointerCancel={() => handlePointerCancel(entry)}
            onPointerDown={(event) => handlePointerDown(entry, event)}
            onPointerEnter={() => handlePointerEnter(entry)}
            onPointerLeave={() => handlePointerCancel(entry)}
            onPointerMove={(event) => handlePointerMove(entry, event)}
            onPointerUp={() => handlePointerUp(entry)}
          >
            <span className="notification-banner-sender">
              {entry.latestRecord.senderLabel}
            </span>
            <span className="notification-banner-preview">
              {entry.latestRecord.preview}
            </span>
          </button>
          {entry.collapsedCount > 1 ? (
            <span
              className="notification-banner-count"
              aria-label={t("notificationBannerMore").replace(
                "{count}",
                String(entry.collapsedCount - 1),
              )}
            >
              +{entry.collapsedCount - 1}
            </span>
          ) : null}
          <button
            className="notification-banner-close"
            type="button"
            aria-label={t("notificationBannerDismiss")}
            onClick={(event) => handleClose(entry, event)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
