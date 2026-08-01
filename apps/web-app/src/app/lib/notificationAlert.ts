import {
  isOpenBankPaymentOffer,
  isOpenChatForContact,
} from "./inboxNotificationRoute";
import type { NotificationRecord } from "./notificationRecord";
import type {
  NotificationRouteLike,
  NotificationSurface,
} from "./notificationSurface";

/**
 * Where this record's wrap came from. The origin is a first-class input, not an
 * implementation detail: a backlog replay at app open must produce records
 * without a banner storm, so it can never share a code path with a live wrap.
 */
export type NotificationDeliveryOrigin =
  /** FCM/SW already told the human (Phase 7 producer; Phase 4 ships none). */
  | "already-alerted-elsewhere"
  /** processWrap(event, false) — the bootstrap querySync backlog. */
  | "catch-up"
  /** processWrap(event, true) — subscribe().onevent. */
  | "live";

/**
 * "post" here means the OS SHADE ENTRY, never the record. The record is written
 * BEFORE this function is called, unconditionally, in all three branches.
 * Reading `no-post` as "no record" is exactly how STORE-01's bug comes back.
 */
export type NotificationAlertDecision =
  | "no-post"
  | "post-and-alert"
  | "post-quietly";

/** Which row of the decision table matched. Exposed so the table is directly assertable. */
export type NotificationAlertRule =
  | "already-alerted"
  | "already-alerted-elsewhere"
  | "catch-up-post-epoch"
  | "catch-up-pre-epoch"
  | "elsewhere"
  | "notifications-page-open"
  | "record-surface-open";

export interface NotificationAlertInput {
  /** Passed in — this function calls no clock of its own. */
  nowMs: number;
  origin: NotificationDeliveryOrigin;
  /**
   * The STORED record, i.e. the value returned by `notificationRecordStore.upsert`
   * — not the freshly built one. A fresh build always has `alertedAt: null`, so
   * feeding it here makes the first row unreachable and a redelivered wrap alerts
   * a second time.
   */
  record: NotificationRecord;
  route: NotificationRouteLike;
  /** null = no watermark yet, so the pre-epoch row cannot match. */
  syncEpochMs: number | null;
  visibleSurface: NotificationSurface | null;
}

export interface NotificationAlertOutcome {
  alertedAt: number | null;
  decision: NotificationAlertDecision;
  readAt: number | null;
  rule: NotificationAlertRule;
}

const MS_PER_SECOND = 1000;

/**
 * Ownership is a conjunction: the visible surface supplies the VISIBILITY half,
 * the already-unit-tested route predicates supply the IDENTITY half. Neither
 * alone is enough — a surface without a matching route is stale state, and a
 * matching route without a visible surface is a backgrounded app.
 */
const surfaceOwnsRecord = (
  surface: NotificationSurface | null,
  record: NotificationRecord,
  route: NotificationRouteLike,
): boolean => {
  if (surface === null) {
    return false;
  }
  if (surface.kind === "chat") {
    return record.chatId !== null && isOpenChatForContact(route, record.chatId);
  }
  if (surface.kind === "bankPaymentOffer") {
    return (
      record.offerId !== undefined &&
      isOpenBankPaymentOffer(route, record.offerId)
    );
  }
  if (surface.kind === "topupInvoice") {
    // The wallet top-up screen is the npub.cash claim's own surface: the money it
    // is waiting for has just landed, on screen, in the UI the user is staring at.
    return record.kind === "npubCashClaim";
  }
  // notificationsPage is its own row below, never this one.
  return false;
};

/**
 * PURE: no clock, no DOM read, no store access. The seven rows below are the
 * decision table, evaluated in order — first match wins — and each returns the
 * decision together with the two timestamp stamps the caller must persist.
 */
export const resolveNotificationAlert = (
  input: NotificationAlertInput,
): NotificationAlertOutcome => {
  const { nowMs, origin, record, route, syncEpochMs, visibleSurface } = input;

  // Row 1 — already-alerted. A redelivered wrap must not re-alert, and both
  // stamps come back untouched so the caller's persist step is a provable no-op.
  if (record.alertedAt !== null) {
    return {
      alertedAt: record.alertedAt,
      decision: "no-post",
      readAt: record.readAt,
      rule: "already-alerted",
    };
  }

  if (origin === "catch-up") {
    // Row 2 — catch-up-pre-epoch. This compares the INNER rumor `created_at`
    // (SECONDS, hence the x1000), never `createdAtMs`: `createdAtMs` is receipt
    // time and is always greater than the watermark, which would make the rule
    // vacuous. Adversarial note: a sender who back-dates `inner.created_at` below
    // the watermark suppresses their OWN alert — self-harm, not an attack — and
    // the record is still written and still unread. This rule gates noise only.
    if (
      syncEpochMs !== null &&
      record.eventCreatedAtSec !== undefined &&
      record.eventCreatedAtSec * MS_PER_SECOND < syncEpochMs
    ) {
      return {
        alertedAt: record.deliveredAt,
        decision: "no-post",
        readAt: record.deliveredAt,
        rule: "catch-up-pre-epoch",
      };
    }

    // Row 3 — catch-up-post-epoch. Records and unread count, zero shade posts:
    // opening the app after being away must not alert once per backlogged wrap.
    return {
      alertedAt: record.deliveredAt,
      decision: "no-post",
      readAt: null,
      rule: "catch-up-post-epoch",
    };
  }

  // Row 4 — already-alerted-elsewhere. `post-quietly`, not `no-post`, and the
  // divergence is deliberate: an IMPORTANCE_DEFAULT entry does not peek, sound or
  // vibrate, but it does post a SECOND shade entry alongside the generic one the
  // SW/FCM layer already put there. We keep it because the generic entry carries
  // no sender and no preview while the reconstructed record carries the decrypted
  // ones. The precondition is therefore on the consumer: Phase 7 MUST cancel the
  // SW notification / native push placeholder (`cancelNativePushPlaceholder`) for
  // that `outerEventId` before emitting an `already-alerted-elsewhere` record, or
  // it will duplicate. Phase 4 ships no producer of this origin.
  if (origin === "already-alerted-elsewhere") {
    return {
      alertedAt: record.deliveredAt,
      decision: "post-quietly",
      readAt: null,
      rule: "already-alerted-elsewhere",
    };
  }

  // Row 5 — record-surface-open. The record is already on screen, so suppressing
  // the alert is not data loss; it is read, now.
  if (surfaceOwnsRecord(visibleSurface, record, route)) {
    return {
      alertedAt: record.deliveredAt,
      decision: "no-post",
      readAt: nowMs,
      rule: "record-surface-open",
    };
  }

  // Row 6 — notifications-page-open. The page shows it unread, with a dot, so it
  // is deliberately NOT stamped read here.
  if (visibleSurface?.kind === "notificationsPage") {
    return {
      alertedAt: record.deliveredAt,
      decision: "no-post",
      readAt: null,
      rule: "notifications-page-open",
    };
  }

  // Row 7 — elsewhere. Deliberate NON-rule: this does NOT downgrade to
  // `post-quietly` merely because the app is foregrounded. Posting a heads-up
  // over your own UI is first-class Android behaviour — AOSP's heads-up
  // suppressor list contains no foreground-app test — and in Phase 4 no in-app
  // banner exists yet, so a downgrade would mean a silent shade entry and no
  // visible alert at all.
  //
  // Phase 5 does NOT flip this row, and cannot: row 7's inputs are `(record,
  // route, surface, origin, syncEpochMs)` — there is no visibility input.
  // Downgrading here whenever the app is foregrounded would make
  // `post-and-alert` reachable ONLY while the app is backgrounded, and a banner
  // driven by `post-and-alert` would then never render — self-referential.
  // `post-and-alert` means "tell the human now, loudly"; WHICH surface carries
  // "loudly" is a platform-rendering question and lives in `notify.ts`, which
  // already owns the native-versus-web branch and is the single fan-in for all
  // five decision sites.
  return {
    alertedAt: record.deliveredAt,
    decision: "post-and-alert",
    readAt: null,
    rule: "elsewhere",
  };
};
