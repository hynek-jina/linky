import { describe, expect, it } from "vitest";
import type { Route } from "../../types/route";
import type {
  NotificationAlertDecision,
  NotificationAlertInput,
  NotificationAlertRule,
  NotificationDeliveryOrigin,
} from "./notificationAlert";
import { resolveNotificationAlert } from "./notificationAlert";
import type {
  NotificationRecord,
  NotificationRecordKind,
} from "./notificationRecord";
import type {
  NotificationRouteLike,
  NotificationSurface,
} from "./notificationSurface";

const NOW = 1_800_000_000_000;
const DELIVERED = 1_700_000_000_000;
/** Deliberately the plan's small watermark: it must differ from NOW/DELIVERED. */
const SYNC_EPOCH = 1_000_000;

const chatRoute: Route = { kind: "chat", id: "c1" };
const otherChatRoute: Route = { kind: "chat", id: "c2" };
const offerRoute: Route = {
  chatId: "c1",
  kind: "bankPaymentOffer",
  offerId: "o1",
};
const topupInvoiceRoute: Route = { kind: "topupInvoice" };
const walletRoute: Route = { kind: "wallet" };

const chatSurface: NotificationSurface = { chatId: "c1", kind: "chat" };
const offerSurface: NotificationSurface = {
  kind: "bankPaymentOffer",
  offerId: "o1",
};
const topupInvoiceSurface: NotificationSurface = { kind: "topupInvoice" };
const notificationsPageSurface: NotificationSurface = {
  kind: "notificationsPage",
};

const ALL_DECISIONS: readonly NotificationAlertDecision[] = [
  "no-post",
  "post-and-alert",
  "post-quietly",
];

const ALL_RULES: readonly NotificationAlertRule[] = [
  "already-alerted",
  "already-alerted-elsewhere",
  "catch-up-post-epoch",
  "catch-up-pre-epoch",
  "elsewhere",
  "notifications-page-open",
  "record-surface-open",
];

const ALL_ORIGINS: readonly NotificationDeliveryOrigin[] = [
  "already-alerted-elsewhere",
  "catch-up",
  "live",
];

const ALL_KINDS: readonly NotificationRecordKind[] = [
  "bankPaymentOffer",
  "chatMessage",
  "npubCashClaim",
  "paymentReceived",
];

/** Local factory — this repo has no shared test-utils module, by design. */
const makeRecord = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  alertedAt: null,
  chatId: "c1",
  conversationKey: "a".repeat(64),
  createdAtMs: DELIVERED,
  deliveredAt: DELIVERED,
  id: "wrap-1",
  kind: "chatMessage",
  preview: "hello",
  readAt: null,
  senderLabel: "Alice",
  ...overrides,
});

const makeInput = (
  overrides: Partial<NotificationAlertInput> = {},
): NotificationAlertInput => ({
  nowMs: NOW,
  origin: "live",
  record: makeRecord(),
  route: walletRoute,
  syncEpochMs: null,
  visibleSurface: null,
  ...overrides,
});

const recordOfKind = (kind: NotificationRecordKind): NotificationRecord => {
  if (kind === "npubCashClaim") {
    return makeRecord({ chatId: null, conversationKey: null, kind });
  }
  if (kind === "bankPaymentOffer") {
    return makeRecord({ kind, offerId: "o1" });
  }
  return makeRecord({ kind });
};

describe("resolveNotificationAlert row 1 — already-alerted", () => {
  // This row is only reachable in production when the call site passes the record
  // RETURNED by `notificationRecordStore.upsert(...)`, never the freshly built one:
  // a fresh build always has `alertedAt: null`, so a redelivered wrap would re-alert.
  // Redelivery is NORMAL after plan 04-07's `wrapKnownFromEvolu` fall-through, not an
  // edge case, so plans 04-06/04-07/04-08 must feed the stored record in.
  it("never re-alerts a record that was already alerted, and leaves its stamps untouched", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "live",
        record: makeRecord({ alertedAt: 500 }),
        route: walletRoute,
      }),
    );
    expect(outcome).toEqual({
      alertedAt: 500,
      decision: "no-post",
      readAt: null,
      rule: "already-alerted",
    });
  });

  it("returns BOTH stamps unchanged when the record was already read too", () => {
    // Proves the stamping step in plans 04-06/04-07/04-08 is a provable no-op on
    // redelivery: neither alertedAt nor readAt may be rewritten.
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "live",
        record: makeRecord({ alertedAt: 500, readAt: 700 }),
      }),
    );
    expect(outcome.decision).toBe("no-post");
    expect(outcome.rule).toBe("already-alerted");
    expect(outcome.alertedAt).toBe(500);
    expect(outcome.readAt).toBe(700);
  });

  it("wins over every other row, including a live wrap on a foreign surface", () => {
    for (const origin of ALL_ORIGINS) {
      const outcome = resolveNotificationAlert(
        makeInput({
          origin,
          record: makeRecord({ alertedAt: 500 }),
          route: chatRoute,
          syncEpochMs: SYNC_EPOCH,
          visibleSurface: chatSurface,
        }),
      );
      expect(outcome.rule).toBe("already-alerted");
      expect(outcome.decision).toBe("no-post");
      expect(outcome.alertedAt).toBe(500);
    }
  });
});

describe("resolveNotificationAlert row 2 — catch-up-pre-epoch", () => {
  it("lands a pre-epoch catch-up wrap already read so a SLIP-39 restore cannot flood the unread count", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "catch-up",
        record: makeRecord({ eventCreatedAtSec: 900 }),
        syncEpochMs: SYNC_EPOCH,
      }),
    );
    expect(outcome).toEqual({
      alertedAt: DELIVERED,
      decision: "no-post",
      readAt: DELIVERED,
      rule: "catch-up-pre-epoch",
    });
  });

  it("compares the INNER rumor created_at in seconds, not the receipt time", () => {
    // eventCreatedAtSec is SECONDS: 999 * 1000 = 999_000 < 1_000_000, so it is
    // pre-epoch even though createdAtMs (receipt time) is far in the future.
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "catch-up",
        record: makeRecord({ createdAtMs: NOW, eventCreatedAtSec: 999 }),
        syncEpochMs: SYNC_EPOCH,
      }),
    );
    expect(outcome.rule).toBe("catch-up-pre-epoch");
    expect(outcome.readAt).toBe(DELIVERED);
  });

  it("does not apply to a live wrap, however old its inner created_at", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "live",
        record: makeRecord({ eventCreatedAtSec: 1 }),
        syncEpochMs: SYNC_EPOCH,
      }),
    );
    expect(outcome.rule).toBe("elsewhere");
    expect(outcome.decision).toBe("post-and-alert");
  });
});

describe("resolveNotificationAlert row 3 — catch-up-post-epoch", () => {
  it("writes the record, posts nothing, and keeps it unread", () => {
    // Criterion 5: 10 backlogged wraps produce 10 records, zero shade posts and an
    // unread count of 10.
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "catch-up",
        record: makeRecord({ eventCreatedAtSec: 2000 }),
        syncEpochMs: SYNC_EPOCH,
      }),
    );
    expect(outcome).toEqual({
      alertedAt: DELIVERED,
      decision: "no-post",
      readAt: null,
      rule: "catch-up-post-epoch",
    });
  });

  it("falls through to post-epoch when there is no watermark yet", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "catch-up",
        record: makeRecord({ eventCreatedAtSec: 1 }),
        syncEpochMs: null,
      }),
    );
    expect(outcome.rule).toBe("catch-up-post-epoch");
    expect(outcome.readAt).toBeNull();
  });

  it("falls through to post-epoch when the record carries no inner created_at", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "catch-up",
        record: makeRecord(),
        syncEpochMs: SYNC_EPOCH,
      }),
    );
    expect(outcome.rule).toBe("catch-up-post-epoch");
    expect(outcome.readAt).toBeNull();
  });

  it("beats every surface: a catch-up wrap for the open chat is still no-post", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        origin: "catch-up",
        route: chatRoute,
        visibleSurface: chatSurface,
      }),
    );
    expect(outcome.decision).toBe("no-post");
    expect(outcome.rule).toBe("catch-up-post-epoch");
  });
});

describe("resolveNotificationAlert row 4 — already-alerted-elsewhere", () => {
  /**
   * W5: `post-quietly`, not `no-post`, and the divergence is deliberate. The
   * generic SW/FCM entry carries no sender and no preview while the reconstructed
   * record carries the decrypted ones, so we re-post quietly rather than stay
   * silent. The precondition is on the consumer: Phase 7 MUST cancel the SW
   * notification / native push placeholder for that `outerEventId` before emitting
   * an `already-alerted-elsewhere` record, or it will duplicate.
   */
  it("re-posts quietly with the decrypted sender and preview", () => {
    const outcome = resolveNotificationAlert(
      makeInput({ origin: "already-alerted-elsewhere" }),
    );
    expect(outcome).toEqual({
      alertedAt: DELIVERED,
      decision: "post-quietly",
      readAt: null,
      rule: "already-alerted-elsewhere",
    });
  });

  it("is NOT no-post — simplifying this row would silently change the Phase 7 contract", () => {
    const outcome = resolveNotificationAlert(
      makeInput({ origin: "already-alerted-elsewhere" }),
    );
    expect(outcome.decision).not.toBe("no-post");
  });

  it("applies to every record kind", () => {
    for (const kind of ALL_KINDS) {
      const outcome = resolveNotificationAlert(
        makeInput({
          origin: "already-alerted-elsewhere",
          record: recordOfKind(kind),
        }),
      );
      expect(outcome.rule).toBe("already-alerted-elsewhere");
      expect(outcome.decision).toBe("post-quietly");
    }
  });
});

describe("resolveNotificationAlert row 5 — record-surface-open", () => {
  it("suppresses a chat message whose own chat is on screen and marks it read now", () => {
    const outcome = resolveNotificationAlert(
      makeInput({ route: chatRoute, visibleSurface: chatSurface }),
    );
    expect(outcome).toEqual({
      alertedAt: DELIVERED,
      decision: "no-post",
      readAt: NOW,
      rule: "record-surface-open",
    });
  });

  it("alerts for another contact's message while chat c1 is open", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        record: makeRecord({ chatId: "c2", id: "wrap-2" }),
        route: chatRoute,
        visibleSurface: chatSurface,
      }),
    );
    expect(outcome.decision).toBe("post-and-alert");
    expect(outcome.rule).toBe("elsewhere");
    expect(outcome.readAt).toBeNull();
  });

  it("still alerts when the app is backgrounded on the record's OWN chat route", () => {
    // The failure mode this milestone exists to fix: a hidden document has no
    // visible surface even though the route still points at the chat.
    const outcome = resolveNotificationAlert(
      makeInput({ route: chatRoute, visibleSurface: null }),
    );
    expect(outcome.decision).toBe("post-and-alert");
    expect(outcome.rule).toBe("elsewhere");
  });

  it("suppresses a bankPaymentOffer record whose offer screen is open", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        record: recordOfKind("bankPaymentOffer"),
        route: offerRoute,
        visibleSurface: offerSurface,
      }),
    );
    expect(outcome.decision).toBe("no-post");
    expect(outcome.rule).toBe("record-surface-open");
    expect(outcome.readAt).toBe(NOW);
  });

  it("alerts for a different offerId while another offer screen is open", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        record: makeRecord({ kind: "bankPaymentOffer", offerId: "o2" }),
        route: offerRoute,
        visibleSurface: offerSurface,
      }),
    );
    expect(outcome.decision).toBe("post-and-alert");
    expect(outcome.rule).toBe("elsewhere");
  });

  it("suppresses a paymentReceived record whose chat is open", () => {
    // Today the OS-notification call for paymentReceived and bankPaymentOffer is
    // NOT guarded by the active-chat check while chatMessage's is; routing all four
    // kinds through this one function fixes that pre-existing inconsistency by
    // construction. This is not a behaviour regression.
    const outcome = resolveNotificationAlert(
      makeInput({
        record: recordOfKind("paymentReceived"),
        route: chatRoute,
        visibleSurface: chatSurface,
      }),
    );
    expect(outcome.decision).toBe("no-post");
    expect(outcome.rule).toBe("record-surface-open");
    expect(outcome.readAt).toBe(NOW);
  });

  it("treats the topupInvoice screen as the npubCashClaim record's own surface", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        record: recordOfKind("npubCashClaim"),
        route: topupInvoiceRoute,
        visibleSurface: topupInvoiceSurface,
      }),
    );
    expect(outcome).toEqual({
      alertedAt: DELIVERED,
      decision: "no-post",
      readAt: NOW,
      rule: "record-surface-open",
    });
  });

  it("does not let the topupInvoice screen swallow a chat message", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        route: topupInvoiceRoute,
        visibleSurface: topupInvoiceSurface,
      }),
    );
    expect(outcome.decision).toBe("post-and-alert");
    expect(outcome.rule).toBe("elsewhere");
  });

  it("alerts for a chat record with a null chatId even on an open chat", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        record: makeRecord({ chatId: null }),
        route: chatRoute,
        visibleSurface: chatSurface,
      }),
    );
    expect(outcome.decision).toBe("post-and-alert");
    expect(outcome.rule).toBe("elsewhere");
  });

  it("alerts when the surface says chat but the route has already moved on", () => {
    // The surface supplies the VISIBILITY conjunct; the tested route predicates
    // supply the IDENTITY conjunct. Both are required.
    const outcome = resolveNotificationAlert(
      makeInput({ route: otherChatRoute, visibleSurface: chatSurface }),
    );
    expect(outcome.decision).toBe("post-and-alert");
    expect(outcome.rule).toBe("elsewhere");
  });
});

describe("resolveNotificationAlert row 6 — notifications-page-open", () => {
  it("posts nothing but keeps the record unread so the page shows its dot", () => {
    for (const kind of ALL_KINDS) {
      const outcome = resolveNotificationAlert(
        makeInput({
          record: recordOfKind(kind),
          visibleSurface: notificationsPageSurface,
        }),
      );
      expect(outcome).toEqual({
        alertedAt: DELIVERED,
        decision: "no-post",
        readAt: null,
        rule: "notifications-page-open",
      });
    }
  });

  it("applies even while the route still points at an unrelated chat", () => {
    const outcome = resolveNotificationAlert(
      makeInput({
        route: otherChatRoute,
        visibleSurface: notificationsPageSurface,
      }),
    );
    expect(outcome.rule).toBe("notifications-page-open");
  });
});

describe("resolveNotificationAlert row 7 — elsewhere", () => {
  it("alerts for every kind when no surface owns the record", () => {
    for (const kind of ALL_KINDS) {
      const outcome = resolveNotificationAlert(
        makeInput({ record: recordOfKind(kind) }),
      );
      expect(outcome).toEqual({
        alertedAt: DELIVERED,
        decision: "post-and-alert",
        readAt: null,
        rule: "elsewhere",
      });
    }
  });

  it("does NOT downgrade to post-quietly merely because the app is foregrounded", () => {
    // Criterion 1. This assertion STANDS in Phase 5 and is deliberately NOT
    // flipped: row 7 has no visibility input, so downgrading here would make
    // `post-and-alert` reachable only while backgrounded and the banner it
    // drives would never render. The banner-versus-heads-up split lives in
    // `notify.ts`, which downgrades the native post to the quiet channel exactly
    // when the banner is carrying the alert. In Phase 4 a downgrade here would
    // have meant no visible alert at all.
    const outcome = resolveNotificationAlert(
      makeInput({ route: walletRoute, visibleSurface: null }),
    );
    expect(outcome.decision).toBe("post-and-alert");
    expect(outcome.decision).not.toBe("post-quietly");
  });
});

interface SurfaceCase {
  label: string;
  route: NotificationRouteLike;
  visibleSurface: NotificationSurface | null;
}

const SURFACE_CASES: readonly SurfaceCase[] = [
  { label: "chat-open", route: chatRoute, visibleSurface: chatSurface },
  { label: "offer-open", route: offerRoute, visibleSurface: offerSurface },
  {
    label: "topup-invoice",
    route: topupInvoiceRoute,
    visibleSurface: topupInvoiceSurface,
  },
  {
    label: "notifications-page",
    route: walletRoute,
    visibleSurface: notificationsPageSurface,
  },
  { label: "elsewhere", route: walletRoute, visibleSurface: null },
  { label: "hidden-document", route: chatRoute, visibleSurface: null },
];

describe("resolveNotificationAlert decision matrix", () => {
  for (const kind of ALL_KINDS) {
    for (const surfaceCase of SURFACE_CASES) {
      for (const origin of ALL_ORIGINS) {
        it(`${kind} / ${surfaceCase.label} / ${origin} stays inside the decision union`, () => {
          const outcome = resolveNotificationAlert(
            makeInput({
              origin,
              record: recordOfKind(kind),
              route: surfaceCase.route,
              syncEpochMs: SYNC_EPOCH,
              visibleSurface: surfaceCase.visibleSurface,
            }),
          );
          expect(ALL_DECISIONS).toContain(outcome.decision);
          expect(ALL_RULES).toContain(outcome.rule);
          if (origin === "catch-up") {
            // A backlog replay must never alert, whatever is on screen.
            expect(outcome.decision).toBe("no-post");
          }
        });
      }
    }
  }
});

describe("resolveNotificationAlert purity", () => {
  it("returns deeply equal outcomes for identical inputs 50 ms apart", async () => {
    const input = makeInput({ route: chatRoute, visibleSurface: chatSurface });
    const first = resolveNotificationAlert(input);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = resolveNotificationAlert(input);
    expect(second).toEqual(first);
  });

  it("does not mutate the record it is handed", () => {
    const record = makeRecord({ eventCreatedAtSec: 900 });
    const snapshot = { ...record };
    resolveNotificationAlert(
      makeInput({ origin: "catch-up", record, syncEpochMs: SYNC_EPOCH }),
    );
    expect(record).toEqual(snapshot);
  });
});
