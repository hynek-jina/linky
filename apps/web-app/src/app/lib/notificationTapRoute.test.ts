// RED-first spec for the shared "what happens when the user taps this record"
// helper. The Phase 5 banner and the Phase 6 Notifications page both call this,
// which is the only reason the two surfaces cannot drift.
//
// Three properties here are load-bearing:
//   1. `openNotificationRecord` marks the record read through
//      `notificationRecordStore.markRead` — the SINGLE writer of read state — and
//      does so BEFORE it navigates, and even when navigation resolves to null.
//      The ordering is asserted through `mock.invocationCallOrder`, not by
//      reading the implementation.
//   2. Every one of the four `NotificationRecordKind` values resolves. Two of
//      them encode research decisions that are settled, not guesses: see the
//      `paymentReceived` and `npubCashClaim` blocks below.
//   3. A synthetic `unknown:<pubkeyHex>` chat id passes through UNCHANGED into
//      the plain-string `{ route: "chat"; id: string }` action. It must never be
//      routed through the branded `{ route: "contact"; id: ContactId }` member —
//      that would be a plain string masquerading as an Evolu branded id
//      (threat T-04-17).
//
// The store is mocked so this file never touches localStorage and so `markRead`
// is observable as a spy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationRecord } from "./notificationRecord";
import {
  findNotificationRecordByOuterEventId,
  type NotificationOpenDeps,
  openNotificationRecord,
  resolveNotificationNavigation,
} from "./notificationTapRoute";
// Raw module text for the "no relay call" half of T-09. A behavioural mock
// cannot prove an ABSENCE; a source read can. Vite's `?raw` is used rather than
// `node:fs` because the web-app tsconfig has no Node types — the same idiom
// `NotificationsUnreadBadge.test.tsx` and `i18n/translations.test.ts` use.
import notificationTapRouteSource from "./notificationTapRoute.ts?raw";

const { markReadMock } = vi.hoisted(() => ({
  markReadMock: vi.fn<(id: string, nowMs: number) => void>(),
}));

vi.mock("./notificationRecordStore", () => ({
  notificationRecordStore: { markRead: markReadMock },
}));

const BASE_NOW = 1_750_000_000_000;
/** The moment of the tap — deliberately later than `createdAtMs`. */
const TAP_NOW = BASE_NOW + 5_000;

const makeRecord = (
  overrides: Partial<NotificationRecord> = {},
): NotificationRecord => ({
  alertedAt: null,
  chatId: "c1",
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

const makeNavigateSpy = () => vi.fn<NotificationOpenDeps["navigate"]>();
const makeScrollSpy = () =>
  vi.fn<NonNullable<NotificationOpenDeps["scrollToMessage"]>>();

beforeEach(() => {
  markReadMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveNotificationNavigation — chatMessage", () => {
  it("routes to the chat with the plain-string chat id", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({ chatId: "c1", kind: "chatMessage" }),
      ),
    ).toEqual({ id: "c1", route: "chat" });
  });

  it("returns null when the chat id is null", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({ chatId: null, kind: "chatMessage" }),
      ),
    ).toBeNull();
  });

  it("returns null when the chat id is blank", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({ chatId: "   ", kind: "chatMessage" }),
      ),
    ).toBeNull();
  });

  // A saved contact and an unknown thread are BOTH plain strings here. The
  // `unknown:<pubkeyHex>` id must survive verbatim: routing it through the
  // branded `{ route: "contact"; id: ContactId }` action would smuggle a
  // non-Evolu string into a branded slot (T-04-17).
  it("passes an unknown:<pubkeyHex> chat id through unchanged", () => {
    const chatId = "unknown:0123456789abcdef";
    expect(
      resolveNotificationNavigation(
        makeRecord({ chatId, kind: "chatMessage" }),
      ),
    ).toEqual({ id: chatId, route: "chat" });
  });
});

describe("resolveNotificationNavigation — paymentReceived", () => {
  // SETTLED: research open question 4. `paymentReceived` resolves to the SAME
  // target as `chatMessage`. The payment notice itself is never stored in chat
  // history, but the Cashu token message is — in that same chat — and if the
  // token message has not arrived yet the chat is still the right destination.
  it("routes to the same chat target as chatMessage", () => {
    const paymentAction = resolveNotificationNavigation(
      makeRecord({ chatId: "c1", kind: "paymentReceived" }),
    );
    const chatAction = resolveNotificationNavigation(
      makeRecord({ chatId: "c1", kind: "chatMessage" }),
    );

    expect(paymentAction).toEqual({ id: "c1", route: "chat" });
    expect(paymentAction).toEqual(chatAction);
  });

  it("returns null when the chat id is null", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({ chatId: null, kind: "paymentReceived" }),
      ),
    ).toBeNull();
  });
});

describe("resolveNotificationNavigation — bankPaymentOffer", () => {
  it("routes to the offer detail with both ids", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({
          chatId: "c1",
          kind: "bankPaymentOffer",
          offerId: "o1",
        }),
      ),
    ).toEqual({ chatId: "c1", offerId: "o1", route: "bankPaymentOffer" });
  });

  it("returns null when the offer id is missing", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({ chatId: "c1", kind: "bankPaymentOffer" }),
      ),
    ).toBeNull();
  });

  it("returns null when the chat id is missing", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({ chatId: null, kind: "bankPaymentOffer", offerId: "o1" }),
      ),
    ).toBeNull();
  });
});

describe("resolveNotificationNavigation — npubCashClaim", () => {
  // SETTLED: research assumption A1. The claim notification's title is
  // `t("mints")`, but the actionable destination is the wallet balance, and the
  // roadmap's Phase 6 wording is "navigates to wallet / offer detail".
  it("routes to the wallet even though it carries no chat id", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({
          chatId: null,
          conversationKey: null,
          kind: "npubCashClaim",
        }),
      ),
    ).toEqual({ route: "wallet" });
  });

  it("still routes to the wallet when a stray chat id is present", () => {
    expect(
      resolveNotificationNavigation(
        makeRecord({ chatId: "c1", kind: "npubCashClaim" }),
      ),
    ).toEqual({ route: "wallet" });
  });
});

describe("resolveNotificationNavigation — purity", () => {
  it("never writes read state", () => {
    resolveNotificationNavigation(makeRecord());
    resolveNotificationNavigation(makeRecord({ kind: "npubCashClaim" }));

    expect(markReadMock).not.toHaveBeenCalled();
  });

  it("does not mutate the record it was given", () => {
    const record = makeRecord();
    const before = { ...record };

    resolveNotificationNavigation(record);

    expect(record).toEqual(before);
  });
});

// D3, layer 2. The record store's `id` IS the outer wrap id for every chat and
// payment record (`buildNotificationRecord({ id: wrapId, … })` at four sites in
// `useInboxNotificationsSync.ts`), and `notify.ts` forwards that same
// `record.id` as the payload's `outerEventId`. So a tapped notification can be
// resolved to its destination from LOCAL state alone — no
// `pool.querySync({ ids: [outerEventId] }, { maxWait: 2500 })`, no relay
// availability in the loop.
describe("findNotificationRecordByOuterEventId — T-09", () => {
  const KNOWN_CONTACT_RECORD = makeRecord({
    chatId: "contact-7",
    id: "wrap-known",
  });
  const UNKNOWN_THREAD_CHAT_ID = `unknown:${"b".repeat(64)}`;
  const UNKNOWN_THREAD_RECORD = makeRecord({
    chatId: UNKNOWN_THREAD_CHAT_ID,
    id: "wrap-unknown",
  });
  // The one producer whose id is NOT an outer wrap id: `useNpubCashClaim` uses
  // a colon-prefixed synthetic id, which no outer event id can ever equal.
  const CLAIM_RECORD = makeRecord({
    chatId: null,
    conversationKey: null,
    id: "npubCashClaim:token-1",
    kind: "npubCashClaim",
  });
  const BLANK_ID_RECORD = makeRecord({ chatId: "c-blank", id: "   " });

  const records: readonly NotificationRecord[] = [
    KNOWN_CONTACT_RECORD,
    UNKNOWN_THREAD_RECORD,
    CLAIM_RECORD,
    BLANK_ID_RECORD,
  ];

  it("resolves an outerEventId to the stored record's chatId, including the unknown: form, with no relay call", () => {
    const unknownThread = findNotificationRecordByOuterEventId(
      records,
      "wrap-unknown",
    );
    expect(unknownThread).toBe(UNKNOWN_THREAD_RECORD);
    expect(
      unknownThread === null
        ? null
        : resolveNotificationNavigation(unknownThread),
    ).toEqual({ id: UNKNOWN_THREAD_CHAT_ID, route: "chat" });

    const knownContact = findNotificationRecordByOuterEventId(
      records,
      "wrap-known",
    );
    expect(knownContact).toBe(KNOWN_CONTACT_RECORD);
    expect(
      knownContact === null
        ? null
        : resolveNotificationNavigation(knownContact),
    ).toEqual({ id: "contact-7", route: "chat" });

    // An id matching nothing simply finds nothing — the caller falls through to
    // the existing, unchanged strict path (T-09-18).
    expect(
      findNotificationRecordByOuterEventId(records, "wrap-nobody"),
    ).toBeNull();

    // A blank id must not match `BLANK_ID_RECORD` (T-09-20).
    expect(findNotificationRecordByOuterEventId(records, "   ")).toBeNull();
    expect(findNotificationRecordByOuterEventId(records, "")).toBeNull();

    // The "no relay call" half. Read from disk, not mocked: an absence is not
    // observable through a behavioural double.
    expect(notificationTapRouteSource).toContain(
      "findNotificationRecordByOuterEventId",
    );
    expect(notificationTapRouteSource).not.toContain("getSharedAppNostrPool");
    expect(notificationTapRouteSource).not.toContain("querySync");
    expect(notificationTapRouteSource).not.toContain("nostr-tools");
  });

  it("returns null against an empty record list", () => {
    expect(findNotificationRecordByOuterEventId([], "wrap-known")).toBeNull();
  });

  it("trims the incoming id before matching", () => {
    expect(
      findNotificationRecordByOuterEventId(records, "  wrap-known  "),
    ).toBe(KNOWN_CONTACT_RECORD);
  });

  it("never mutates the records it was given, and writes no read state", () => {
    const before = records.map((record) => ({ ...record }));

    findNotificationRecordByOuterEventId(records, "wrap-known");

    expect(records).toEqual(before);
    expect(markReadMock).not.toHaveBeenCalled();
  });

  // T-04-17, preserved. Same statement the purity describe above makes: the
  // resolved action carries a PLAIN-STRING id and stays on the `chat` member.
  // Routing a synthetic `unknown:<pubkeyHex>` id through the branded
  // `{ route: "contact"; id: ContactId }` member would launder a non-Evolu
  // string into a branded slot (T-09-19).
  it("never produces the branded contact action for a record found by outer event id", () => {
    for (const outerEventId of ["wrap-unknown", "wrap-known"]) {
      const record = findNotificationRecordByOuterEventId(
        records,
        outerEventId,
      );
      const action =
        record === null ? null : resolveNotificationNavigation(record);

      expect(action).not.toBeNull();
      expect(action === null ? null : action.route).toBe("chat");
      expect(action === null ? null : action.route).not.toBe("contact");
      expect(action !== null && "id" in action ? typeof action.id : null).toBe(
        "string",
      );
    }
  });
});

describe("openNotificationRecord", () => {
  it("marks the record read through the store exactly once", () => {
    const navigate = makeNavigateSpy();

    openNotificationRecord(makeRecord({ id: "wrap-9" }), {
      navigate,
      nowMs: TAP_NOW,
    });

    expect(markReadMock).toHaveBeenCalledTimes(1);
    expect(markReadMock).toHaveBeenCalledWith("wrap-9", TAP_NOW);
  });

  it("marks read BEFORE it navigates", () => {
    const navigate = makeNavigateSpy();

    openNotificationRecord(makeRecord(), { navigate, nowMs: TAP_NOW });

    const markReadOrder = markReadMock.mock.invocationCallOrder[0];
    const navigateOrder = navigate.mock.invocationCallOrder[0];
    expect(markReadOrder).toBeDefined();
    expect(navigateOrder).toBeDefined();
    expect(markReadOrder as number).toBeLessThan(navigateOrder as number);
  });

  it("navigates once with the resolved action", () => {
    const navigate = makeNavigateSpy();

    openNotificationRecord(makeRecord({ chatId: "c7" }), {
      navigate,
      nowMs: TAP_NOW,
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ id: "c7", route: "chat" });
  });

  it("navigates to the wallet for an npubCashClaim record", () => {
    const navigate = makeNavigateSpy();

    openNotificationRecord(
      makeRecord({
        chatId: null,
        conversationKey: null,
        kind: "npubCashClaim",
      }),
      { navigate, nowMs: TAP_NOW },
    );

    expect(navigate).toHaveBeenCalledWith({ route: "wallet" });
  });

  it("still marks read but does NOT navigate when the action resolves to null", () => {
    const navigate = makeNavigateSpy();

    openNotificationRecord(makeRecord({ chatId: null, id: "wrap-null" }), {
      navigate,
      nowMs: TAP_NOW,
    });

    expect(markReadMock).toHaveBeenCalledTimes(1);
    expect(markReadMock).toHaveBeenCalledWith("wrap-null", TAP_NOW);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("scrolls to the message after navigating for a chatMessage with a messageId", () => {
    const navigate = makeNavigateSpy();
    const scrollToMessage = makeScrollSpy();

    openNotificationRecord(makeRecord({ messageId: "m1" }), {
      navigate,
      nowMs: TAP_NOW,
      scrollToMessage,
    });

    expect(scrollToMessage).toHaveBeenCalledTimes(1);
    expect(scrollToMessage).toHaveBeenCalledWith("m1");

    const navigateOrder = navigate.mock.invocationCallOrder[0];
    const scrollOrder = scrollToMessage.mock.invocationCallOrder[0];
    expect(navigateOrder).toBeDefined();
    expect(scrollOrder).toBeDefined();
    expect(navigateOrder as number).toBeLessThan(scrollOrder as number);
  });

  it("does not scroll for a chatMessage without a messageId", () => {
    const navigate = makeNavigateSpy();
    const scrollToMessage = makeScrollSpy();

    openNotificationRecord(makeRecord(), {
      navigate,
      nowMs: TAP_NOW,
      scrollToMessage,
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(scrollToMessage).not.toHaveBeenCalled();
  });

  it("does not scroll for a chatMessage whose messageId is blank", () => {
    const navigate = makeNavigateSpy();
    const scrollToMessage = makeScrollSpy();

    openNotificationRecord(makeRecord({ messageId: "  " }), {
      navigate,
      nowMs: TAP_NOW,
      scrollToMessage,
    });

    expect(scrollToMessage).not.toHaveBeenCalled();
  });

  // Only `chatMessage` scrolls. A `paymentReceived` record shares the chat
  // destination, but the notice itself is never stored in chat history, so the
  // id it carries would not resolve to a rendered row.
  it("does not scroll for a paymentReceived record that carries a messageId", () => {
    const navigate = makeNavigateSpy();
    const scrollToMessage = makeScrollSpy();

    openNotificationRecord(
      makeRecord({ kind: "paymentReceived", messageId: "m1" }),
      { navigate, nowMs: TAP_NOW, scrollToMessage },
    );

    expect(navigate).toHaveBeenCalledWith({ id: "c1", route: "chat" });
    expect(scrollToMessage).not.toHaveBeenCalled();
  });

  it("does not throw when scrollToMessage is omitted entirely", () => {
    const navigate = makeNavigateSpy();

    expect(() => {
      openNotificationRecord(makeRecord({ messageId: "m1" }), {
        navigate,
        nowMs: TAP_NOW,
      });
    }).not.toThrow();

    expect(markReadMock).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
