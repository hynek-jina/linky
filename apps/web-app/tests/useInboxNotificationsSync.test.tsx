import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelNativePushPlaceholderMock,
  getConversationKeyMock,
  nip44DecryptMock,
  notifyNotificationRecordMock,
  querySyncMock,
  subscribeMock,
  unwrapEventMock,
} = vi.hoisted(() => ({
  cancelNativePushPlaceholderMock: vi.fn(() => false),
  getConversationKeyMock: vi.fn(() => new Uint8Array([9, 9, 9])),
  nip44DecryptMock: vi.fn(),
  notifyNotificationRecordMock: vi.fn(async () => ({
    nativeResult: null,
    posted: "none" as const,
  })),
  querySyncMock: vi.fn(),
  subscribeMock: vi.fn(),
  unwrapEventMock: vi.fn(),
}));

vi.mock("nostr-tools", () => ({
  getPublicKey: vi.fn(() => "1".repeat(64)),
  nip19: {
    decode: vi.fn((value: string) => {
      if (value === "nsec-test") {
        return { type: "nsec", data: new Uint8Array([1, 2, 3]) };
      }
      if (value === "npub-known") {
        return { type: "npub", data: "2".repeat(64) };
      }
      throw new Error(`Unexpected decode value: ${value}`);
    }),
    npubEncode: vi.fn((value: string) => `npub:${value}`),
  },
}));

vi.mock("nostr-tools/nip17", () => ({
  unwrapEvent: unwrapEventMock,
}));

vi.mock("nostr-tools/nip44", () => ({
  decrypt: nip44DecryptMock,
  getConversationKey: getConversationKeyMock,
}));

vi.mock("../src/app/lib/nostrPool", () => ({
  getSharedAppNostrPool: vi.fn(async () => ({
    querySync: querySyncMock,
    subscribe: subscribeMock,
  })),
}));

// Phase 4 routes every OS notification through notifyNotificationRecord; the old
// per-call-site PWA callback is retired. Mocking the dispatcher keeps these tests on
// the hook's decision, not on the native/PWA delivery layer (covered by notify.test.ts).
vi.mock("../src/app/lib/notify", () => ({
  notifyNotificationRecord: notifyNotificationRecordMock,
}));

// Partial mock: `notificationRecordStore` imports the two conversation-cancel
// wrappers from the same module, so only the placeholder cancel is overridden.
vi.mock("../src/platform/nativeBridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/platform/nativeBridge")>()),
  cancelNativePushPlaceholder: cancelNativePushPlaceholderMock,
}));

import { useInboxNotificationsSync } from "../src/app/hooks/messages/useInboxNotificationsSync";
import {
  createLinkyBankPaymentOfferEvent,
  LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC,
} from "../src/app/lib/bankPaymentOffer";
import { notificationRecordStore } from "../src/app/lib/notificationRecordStore";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
} from "../src/app/types/appTypes";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const MY_PUBKEY = "1".repeat(64);
const KNOWN_CONTACT_PUBKEY = "2".repeat(64);
const OUTER_PUBKEY = "3".repeat(64);

const eventId = (label: string): string =>
  Array.from(new TextEncoder().encode(label))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .padEnd(64, "0")
    .slice(0, 64);

const createWrapEvent = (label: string): NostrToolsEvent => ({
  content: "encrypted",
  created_at: 1_730_000_000,
  id: eventId(label),
  kind: 1059,
  pubkey: OUTER_PUBKEY,
  sig: "4".repeat(128),
  tags: [["p", MY_PUBKEY]],
});

const flushEffects = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

// Bound at module evaluation, BEFORE any `vi.spyOn(Date, "now")` can run. The
// catch-up-boundary suite below pins `Date.now` to a fixed millisecond so it can
// assert exact `since` arithmetic; `waitForCondition`'s only timeout escape is a
// `Date.now()` comparison, so a frozen clock would make that deadline
// unreachable and every failing predicate would surface as an opaque
// `Test timed out in 5000ms` instead of the observed value.
const realNow = Date.now.bind(Date);

// The hook's bootstrap is a multi-step async chain (shared-pool promise ->
// subscribe -> per-event processing). A fixed number of flushEffects()
// ticks is an under-specified wait: under machine load the chain needs one more
// macrotask than the test happens to grant, and the assertion reads zero calls.
// Poll the condition instead, so the wait scales with load rather than failing.
const waitForCondition = async (
  predicate: () => boolean,
  description: string,
  timeoutMs = 5000,
): Promise<void> => {
  const deadline = realNow() + timeoutMs;
  for (;;) {
    await flushEffects();
    if (predicate()) {
      return;
    }
    if (realNow() >= deadline) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for ${description}`,
      );
    }
  }
};

// --- The EOSE-capable subscribe capture -------------------------------------
//
// Wave-0 gaps this closes: the suite captured only `handlers.onevent`, never
// asserted the relay FILTER at all, and had no way to signal EOSE. Every wrap in
// this file now arrives the way the relay actually delivers it — through the one
// subscription the hook opens — so delivery origin is a property of WHEN the wrap
// lands relative to EOSE rather than of which mock the test happened to prime.

interface CapturedInboxSubscription {
  filter: Record<string, unknown>;
  onevent: (event: { id: string }) => void;
  oneose: (() => void) | undefined;
  relays: readonly string[];
}

interface InboxSubscribeParamsLike {
  onevent: (event: { id: string }) => void;
  oneose?: (() => void) | undefined;
}

const capturedSubscriptions: CapturedInboxSubscription[] = [];

/** Installs the EOSE-capable capture. Called from `beforeEach`, after the mock resets. */
const installSubscribeCapture = (): void => {
  subscribeMock.mockImplementation(
    (
      relays: readonly string[],
      filter: Record<string, unknown>,
      params: InboxSubscribeParamsLike,
    ) => {
      capturedSubscriptions.push({
        filter,
        onevent: params.onevent,
        oneose: params.oneose,
        relays,
      });
      return { close: vi.fn(async () => {}) };
    },
  );
};

/** Throws a NAMED error when nothing subscribed — a silent undefined here reads as a passing test. */
const latestSubscription = (): CapturedInboxSubscription => {
  const latest = capturedSubscriptions.at(-1);
  if (!latest) {
    throw new Error(
      "latestSubscription: nothing subscribed — the inbox effect never reached pool.subscribe",
    );
  }
  return latest;
};

/** The relay-filter assertion seam. Gap 3. */
const readInboxFilter = (): Record<string, unknown> =>
  latestSubscription().filter;

/** Pre-EOSE delivery. Historical replay. */
const deliverCatchUpWrap = (event: { id: string }): void => {
  latestSubscription().onevent(event);
};

/**
 * Gap 2. Tolerates an ABSENT `oneose` on purpose, so a pre-fix run fails on the
 * behavioural assertion rather than on a TypeError.
 */
const signalEose = (): void => {
  latestSubscription().oneose?.();
};

/** Post-EOSE delivery. Real-time. */
const deliverLiveWrap = (event: { id: string }): void => {
  signalEose();
  latestSubscription().onevent(event);
};

/**
 * An inner rumor `created_at` recent enough to clear plan 09-09's live-recency
 * gate.
 *
 * Post-EOSE delivery alone is no longer enough to be classified `live`: the hook
 * now also requires the INNER rumor to be no older than the subscription start
 * minus `INBOX_LIVE_CLOCK_SKEW_ALLOWANCE_SECONDS` (30 s since plan 09-11; 5 min
 * as originally shipped), so a relay that replays its oldest tail after `oneose`
 * can no longer alert. A fixture that means "this is a genuinely live wrap" must
 * therefore stamp a live clock; the 2024 constants these cases used to carry now
 * describe a 2-year-old backlog message and are suppressed for exactly the
 * reason 09-09 exists.
 *
 * Cases that mean "this is history" keep their fixed 2024 stamps.
 */
const liveRumorCreatedAtSec = (): number => Math.floor(Date.now() / 1e3);

beforeEach(() => {
  capturedSubscriptions.length = 0;
  installSubscribeCapture();
});

describe("useInboxNotificationsSync", () => {
  afterEach(() => {
    querySyncMock.mockReset();
    subscribeMock.mockReset();
    unwrapEventMock.mockReset();
    nip44DecryptMock.mockReset();
    getConversationKeyMock.mockClear();
    notifyNotificationRecordMock.mockClear();
    cancelNativePushPlaceholderMock.mockClear();
    localStorage.clear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("does not open the Nostr inbox before Evolu bootstrap is ready", async () => {
    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage: vi.fn(() => "message-1"),
        appendLocalNostrReaction: vi.fn(() => "reaction-1"),
        contacts: [],
        currentNsec: "nsec-test",
        enabled: false,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById: vi.fn(),
        softDeleteLocalNostrReactionsByWrapIds: vi.fn(),
        t: (key: string) => key,
        updateLocalNostrMessage: vi.fn(),
        updateLocalNostrReaction: vi.fn(),
      });
      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await flushEffects();

    expect(querySyncMock).not.toHaveBeenCalled();
    expect(subscribeMock).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("stores an incoming message under a local unknown-thread id for unknown pubkeys", async () => {
    const wrapEvent = createWrapEvent("wrap-unknown-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-unknown-1"),
      pubkey:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      content: "hello from unknown",
      created_at: 1730000000,
      tags: [["p", MY_PUBKEY]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => key,
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await waitForCondition(
      () => capturedSubscriptions.length > 0,
      "the inbox subscription to be opened",
    );
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(appendLocalNostrMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId:
          "unknown:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        content: "hello from unknown",
        direction: "in",
        pubkey:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        rumorId: eventId("rumor-unknown-1"),
        wrapId: eventId("wrap-unknown-1"),
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  // Ported from the pre-EOSE-harness shape: the drain is no longer a separate
  // `querySync` call, so "backfill" is now the pre-EOSE stretch of the one
  // subscription and both wraps are delivered through it.
  it("continues the pre-EOSE drain after one event throws", async () => {
    const firstWrap = createWrapEvent("wrap-throwing");
    const secondWrap = createWrapEvent("wrap-after-throw");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock
      .mockReturnValueOnce({
        kind: 14,
        id: eventId("rumor-throwing"),
        pubkey: KNOWN_CONTACT_PUBKEY,
        content: "first",
        created_at: 1730000000,
        tags: [["p", MY_PUBKEY]],
      })
      .mockReturnValueOnce({
        kind: 14,
        id: eventId("rumor-after-throw"),
        pubkey: KNOWN_CONTACT_PUBKEY,
        content: "second",
        created_at: 1730000001,
        tags: [["p", MY_PUBKEY]],
      });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });
    const appendLocalNostrMessage = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("write failed");
      })
      .mockReturnValue("message-2");

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction: vi.fn(() => "reaction-1"),
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById: vi.fn(),
        softDeleteLocalNostrReactionsByWrapIds: vi.fn(),
        t: (key: string) => key,
        updateLocalNostrMessage: vi.fn(),
        updateLocalNostrReaction: vi.fn(),
      });
      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await waitForCondition(
      () => capturedSubscriptions.length > 0,
      "the inbox subscription to be opened",
    );

    await act(async () => {
      deliverCatchUpWrap(firstWrap);
      deliverCatchUpWrap(secondWrap);
    });

    expect(appendLocalNostrMessage).toHaveBeenCalledTimes(2);
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("ignores events whose inner content is still an encrypted payload", async () => {
    const wrapEvent = createWrapEvent("wrap-encrypted-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-encrypted-1"),
      pubkey:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      content: "encrypted-inner-payload",
      created_at: 1730000001,
      tags: [["p", MY_PUBKEY]],
    });
    nip44DecryptMock.mockReturnValue('{"kind":14}');

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => key,
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(notifyNotificationRecordMock).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("alerts for incoming messages outside the active chat only", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    // Only post-EOSE events alert; a pre-EOSE replay is stored silently, so
    // deliver the wrap after the boundary marker.
    const wrapEvent = createWrapEvent("wrap-known-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-known-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "hi from Bob",
      created_at: liveRumorCreatedAtSec(),
      tags: [["p", MY_PUBKEY]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const renderHarness = async (routeId: string) => {
      const Harness = () => {
        useInboxNotificationsSync({
          appendLocalNostrMessage,
          appendLocalNostrReaction,
          contacts: [
            {
              id: "contact-bob",
              name: "Bob",
              npub: "npub-known",
            },
          ],
          currentNsec: "nsec-test",
          nostrFetchRelays: [],
          nostrMessageWrapIdsRef: { current: new Set<string>() },
          nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
          nostrMessagesRecent: [],
          nostrReactionWrapIdsRef: { current: new Set<string>() },
          nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
          route: { kind: "chat", id: routeId },
          setContactAttentionById,
          softDeleteLocalNostrReactionsByWrapIds,
          t: (key: string) =>
            key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
          updateLocalNostrMessage,
          updateLocalNostrReaction,
        });

        return null;
      };

      const root = createRoot(document.createElement("div"));
      await act(async () => {
        root.render(<Harness />);
      });
      await flushEffects();
      await flushEffects();
      return root;
    };

    const root = await renderHarness("contact-alice");
    await act(async () => {
      deliverLiveWrap(wrapEvent);
    });

    // Phase 5: the in-app alert is the banner, enqueued by `notify.ts` from this
    // dispatch. A message from a contact whose chat is NOT open resolves to
    // `post-and-alert`, which is the only decision that can produce a banner.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "post-and-alert",
        record: expect.objectContaining({
          chatId: "contact-bob",
          conversationKey: KNOWN_CONTACT_PUBKEY,
          id: eventId("wrap-known-1"),
          kind: "chatMessage",
          preview: "hi from Bob",
          senderLabel: "Bob",
        }),
      }),
    );

    await act(async () => {
      root.unmount();
    });

    querySyncMock.mockReset();
    unwrapEventMock.mockReset();
    appendLocalNostrMessage.mockClear();
    notifyNotificationRecordMock.mockClear();

    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-known-2"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "this stays silent",
      created_at: liveRumorCreatedAtSec(),
      tags: [["p", MY_PUBKEY]],
    });

    const activeRoot = await renderHarness("contact-bob");
    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-known-2"));
    });

    // Criterion 2. `if (isActiveChatContact) return;` is a duplicate-INSERT guard
    // owned by the active-chat subscription, so no Evolu row is written here — but
    // the durable record is written ABOVE it, and the alert is suppressed by the
    // decision table (row 5, record-surface-open) rather than by a missing record.
    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "no-post",
        record: expect.objectContaining({
          chatId: "contact-bob",
          conversationKey: KNOWN_CONTACT_PUBKEY,
          id: eventId("wrap-known-2"),
          kind: "chatMessage",
          preview: "this stays silent",
          senderLabel: "Bob",
        }),
      }),
    );

    await act(async () => {
      activeRoot.unmount();
    });
  });

  it("ignores expired bank payment offer events during inbox bootstrap", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const oldCreatedAtSec =
      Math.floor(Date.now() / 1e3) -
      LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC -
      10;
    const offerEvent = createLinkyBankPaymentOfferEvent({
      amountSat: 80,
      amountText: "80 sat",
      clientId: "expired-offer-client",
      createdAt: oldCreatedAtSec,
      offerId: "expired-offer",
      offererPublicKey: KNOWN_CONTACT_PUBKEY,
      recipientPublicKey: MY_PUBKEY,
      senderPublicKey: KNOWN_CONTACT_PUBKEY,
      status: "offered",
    });
    const wrapEvent = createWrapEvent("wrap-expired-offer-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      ...offerEvent,
      id: eventId("rumor-expired-offer-1"),
    });

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const onBankPaymentOfferMessage = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "known-contact",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        onBankPaymentOfferMessage,
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => key,
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(onBankPaymentOfferMessage).not.toHaveBeenCalled();
    // isExpiredOffer is a RECORD gate, not an alert gate: a dead offer is not
    // actionable, so it never becomes a record and never reaches the dispatcher.
    expect(notifyNotificationRecordMock).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("restores a terminal proxy-payment state even when bootstrap has not seen the offer yet", async () => {
    const createdAt = Math.floor(Date.now() / 1e3);
    const settledEvent = createLinkyBankPaymentOfferEvent({
      amountSat: 80,
      amountText: "80 sat",
      clientId: "settled-client",
      createdAt,
      offerId: "offer-settled",
      offererPublicKey: MY_PUBKEY,
      recipientPublicKey: MY_PUBKEY,
      senderPublicKey: KNOWN_CONTACT_PUBKEY,
      status: "settled",
    });
    const wrapEvent = createWrapEvent("wrap-settled-offer");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      ...settledEvent,
      id: eventId("rumor-settled-offer"),
    });

    const onBankPaymentOfferMessage = vi.fn();
    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage: vi.fn(() => "message-1"),
        appendLocalNostrReaction: vi.fn(() => "reaction-1"),
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        onBankPaymentOfferMessage,
        route: { kind: "contacts" },
        setContactAttentionById: vi.fn(),
        softDeleteLocalNostrReactionsByWrapIds: vi.fn(),
        t: (key: string) => key,
        updateLocalNostrMessage: vi.fn(),
        updateLocalNostrReaction: vi.fn(),
      });
      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(onBankPaymentOfferMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-bob",
        content: settledEvent.content,
        direction: "out",
      }),
    );

    await act(async () => root.unmount());
  });

  it("surfaces a declined proxy payment with the contact chat as the record's tap target", async () => {
    const createdAt = Math.floor(Date.now() / 1e3);
    const originalOffer = createLinkyBankPaymentOfferEvent({
      amountSat: 80,
      amountText: "80 sat",
      clientId: "offer-client",
      createdAt: createdAt - 10,
      offerId: "offer-declined",
      offererPublicKey: MY_PUBKEY,
      recipientPublicKey: KNOWN_CONTACT_PUBKEY,
      senderPublicKey: MY_PUBKEY,
      status: "offered",
    });
    const declineEvent = createLinkyBankPaymentOfferEvent({
      amountSat: 80,
      amountText: "80 sat",
      clientId: "decline-client",
      createdAt,
      offerId: "offer-declined",
      offererPublicKey: MY_PUBKEY,
      recipientPublicKey: MY_PUBKEY,
      senderPublicKey: KNOWN_CONTACT_PUBKEY,
      status: "declined",
    });
    const wrapEvent = createWrapEvent("wrap-declined-offer");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      ...declineEvent,
      id: eventId("rumor-declined-offer"),
    });

    const onBankPaymentOfferMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();
    const knownOfferMessage: LocalNostrMessage = {
      clientId: "offer-client",
      contactId: "contact-bob",
      content: originalOffer.content,
      createdAtSec: createdAt - 10,
      direction: "out",
      id: "known-offer-message",
      localOnly: true,
      pubkey: MY_PUBKEY,
      rumorId: null,
      status: "sent",
      wrapId: "known-offer-wrap",
    };

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage: vi.fn(() => "message-1"),
        appendLocalNostrReaction: vi.fn(() => "reaction-1"),
        bankPaymentOfferMessages: [knownOfferMessage],
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        onBankPaymentOfferMessage,
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds: vi.fn(),
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "bankPaymentOfferDeclinedNotification") {
            return "Payment was declined.";
          }
          return key;
        },
        updateLocalNostrMessage: vi.fn(),
        updateLocalNostrReaction: vi.fn(),
      });
      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverLiveWrap(wrapEvent);
    });

    expect(onBankPaymentOfferMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-bob",
        direction: "out",
      }),
    );
    // The declined terminal notice writes its record before any alert reasoning and
    // dispatches from the STORED record instead of the retired callback. The tap
    // target now travels on the record as `chatId` and is executed by
    // `openNotificationRecord` (pinned by notificationTapRoute.test.ts), not by a
    // toast onClick.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "post-and-alert",
        record: expect.objectContaining({
          chatId: "contact-bob",
          conversationKey: KNOWN_CONTACT_PUBKEY,
          id: eventId("wrap-declined-offer"),
          kind: "bankPaymentOffer",
          preview: "Payment was declined.",
          senderLabel: "Bob",
        }),
      }),
    );
    expect(setContactAttentionById).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("treats self-authored copies matched by client id as outgoing and silent", async () => {
    const wrapEvent = createWrapEvent("wrap-self-copy-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-self-copy-1"),
      pubkey:
        "feedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed",
      content: "hi from me",
      created_at: 1730000004,
      tags: [
        ["p", KNOWN_CONTACT_PUBKEY],
        ["p", MY_PUBKEY],
        ["client", "client-fixed"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-append");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: {
          current: [
            {
              id: "local-pending-1",
              contactId: "contact-bob",
              direction: "out",
              content: "hi from me",
              wrapId: "pending:client-fixed",
              rumorId: "rumor-self-copy-1",
              pubkey: MY_PUBKEY,
              createdAtSec: 1730000003,
              status: "pending",
              clientId: "client-fixed",
              localOnly: false,
              replyToId: null,
              replyToContent: null,
              rootMessageId: null,
              editedAtSec: null,
              editedFromId: null,
              isEdited: false,
              originalContent: null,
            },
          ] satisfies LocalNostrMessage[],
        },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => key,
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(notifyNotificationRecordMock).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("routes incoming messages to a known contact when the peer is only identifiable from p tags", async () => {
    const wrapEvent = createWrapEvent("wrap-known-via-ptag-1");
    // Bound once: the record assertion below pins `eventCreatedAtSec`, so the
    // fixture and the expectation must read the same live stamp.
    const rumorCreatedAtSec = liveRumorCreatedAtSec();
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-known-via-ptag-1"),
      pubkey:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      content: "hello from Bob",
      created_at: rumorCreatedAtSec,
      tags: [
        ["p", KNOWN_CONTACT_PUBKEY],
        ["p", MY_PUBKEY],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-known-via-ptag");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) =>
          key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverLiveWrap(wrapEvent);
    });

    expect(appendLocalNostrMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-bob",
        content: "hello from Bob",
        direction: "in",
        pubkey: KNOWN_CONTACT_PUBKEY,
        rumorId: eventId("rumor-known-via-ptag-1"),
        wrapId: eventId("wrap-known-via-ptag-1"),
      }),
    );
    // Phase 4: the chat message is a durable record first, an alert second.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "post-and-alert",
        record: expect.objectContaining({
          chatId: "contact-bob",
          conversationKey: KNOWN_CONTACT_PUBKEY,
          eventCreatedAtSec: rumorCreatedAtSec,
          id: eventId("wrap-known-via-ptag-1"),
          kind: "chatMessage",
          preview: "hello from Bob",
          senderLabel: "Bob",
        }),
      }),
    );
    // The Phase 3 handoff: decrypting the wrap retires the generic FCM placeholder
    // that announced it.
    expect(cancelNativePushPlaceholderMock).toHaveBeenCalledWith(
      eventId("wrap-known-via-ptag-1"),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps incoming cashu token messages silent in notification surfaces", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const wrapEvent = createWrapEvent("wrap-cashu-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-cashu-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content:
        "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vbWludC5leGFtcGxlIiwicHJvb2ZzIjpbeyJhbW91bnQiOjIxfV19XX0",
      created_at: 1730000006,
      tags: [["p", MY_PUBKEY]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-cashu");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(setContactAttentionById).not.toHaveBeenCalled();
    // `!isCashuMessage` is a RECORD gate, not an alert gate (T-04-26): the payment
    // notice is the sole recorded carrier of a Cashu payment, so one payment must
    // never yield two records.
    expect(notifyNotificationRecordMock).not.toHaveBeenCalled();
    expect(appendLocalNostrMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-bob",
        content:
          "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vbWludC5leGFtcGxlIiwicHJvb2ZzIjpbeyJhbW91bnQiOjIxfV19XX0",
        direction: "in",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("does not replay a stored incoming message as a fresh notification", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const wrapEvent = createWrapEvent("wrap-stored-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-stored-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "already saved",
      created_at: 1730000100,
      tags: [["p", MY_PUBKEY]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-stored");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: {
          current: [
            {
              id: "stored-message-1",
              contactId: "contact-bob",
              content: "already saved",
              createdAtSec: 1730000100,
              direction: "in",
              pubkey: KNOWN_CONTACT_PUBKEY,
              replyToId: null,
              replyToContent: null,
              rootMessageId: null,
              rumorId: null,
              status: "sent",
              wrapId: "old-wrap",
              editedAtSec: null,
              editedFromId: null,
              isEdited: false,
              originalContent: null,
            },
          ] satisfies LocalNostrMessage[],
        },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) =>
          key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    // The record is still written — the existing-message update path is a RECORD
    // gate for the Evolu row, not for the record — but a backlog replay never alerts:
    // the decision table returns `no-post` for every catch-up wrap.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "no-post",
        record: expect.objectContaining({ kind: "chatMessage" }),
      }),
    );
    expect(setContactAttentionById).not.toHaveBeenCalled();
    expect(updateLocalNostrMessage).toHaveBeenCalledWith("stored-message-1", {
      status: "sent",
      wrapId: eventId("wrap-stored-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      rumorId: eventId("rumor-stored-1"),
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("does not replay a deleted contact message when the stored thread still uses the old contact id", async () => {
    const deletedContactPubkey =
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const wrapEvent = createWrapEvent("wrap-deleted-contact-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-deleted-contact-1"),
      pubkey: deletedContactPubkey,
      content: "stale thread message",
      created_at: 1730000200,
      tags: [["p", MY_PUBKEY]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-deleted");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: {
          current: [
            {
              id: "stored-message-deleted-1",
              contactId: "contact-deleted-1",
              content: "stale thread message",
              createdAtSec: 1730000200,
              direction: "in",
              pubkey: deletedContactPubkey,
              replyToId: null,
              replyToContent: null,
              rootMessageId: null,
              rumorId: "rumor-deleted-contact-1",
              status: "sent",
              wrapId: "old-wrap-deleted-1",
              editedAtSec: null,
              editedFromId: null,
              isEdited: false,
              originalContent: null,
            },
          ] satisfies LocalNostrMessage[],
        },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) =>
          key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    // The record is still written — the existing-message update path is a RECORD
    // gate for the Evolu row, not for the record — but a backlog replay never alerts:
    // the decision table returns `no-post` for every catch-up wrap.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "no-post",
        record: expect.objectContaining({ kind: "chatMessage" }),
      }),
    );
    expect(updateLocalNostrMessage).toHaveBeenCalledWith(
      "stored-message-deleted-1",
      expect.objectContaining({
        pubkey: deletedContactPubkey,
        rumorId: eventId("rumor-deleted-contact-1"),
        status: "sent",
        wrapId: eventId("wrap-deleted-contact-1"),
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("shows a single notify-only payment notice without storing a chat message", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const wrapEvent = createWrapEvent("wrap-payment-notice-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: eventId("rumor-payment-notice-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "payment_notice",
      created_at: liveRumorCreatedAtSec(),
      tags: [
        ["p", KNOWN_CONTACT_PUBKEY],
        ["p", MY_PUBKEY],
        ["linky", "payment_notice"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-payment-notice");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverLiveWrap(wrapEvent);
    });

    // The durable record is written before any alert reasoning, and the OS notification
    // is dispatched from that STORED record rather than the retired callback.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "post-and-alert",
        record: expect.objectContaining({
          chatId: "contact-bob",
          conversationKey: KNOWN_CONTACT_PUBKEY,
          id: eventId("wrap-payment-notice-1"),
          kind: "paymentReceived",
          preview: "You received money",
          senderLabel: "Bob",
        }),
      }),
    );
    expect(appendLocalNostrMessage).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("does not replay the same payment notice when the inbox effect reruns on navigation", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const wrapEvent = createWrapEvent("wrap-payment-notice-repeat-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: eventId("payment-notice-repeat-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "payment_notice",
      created_at: liveRumorCreatedAtSec(),
      tags: [
        ["p", KNOWN_CONTACT_PUBKEY],
        ["p", MY_PUBKEY],
        ["linky", "payment_notice"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-payment-notice");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    interface HarnessProps {
      routeKind: "contacts" | "wallet";
    }

    const Harness = ({ routeKind }: HarnessProps) => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: routeKind },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness routeKind="contacts" />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverLiveWrap(wrapEvent);
    });

    await act(async () => {
      root.render(<Harness routeKind="wallet" />);
    });
    await flushEffects();
    await flushEffects();
    // The route change re-runs the inbox effect and resubscribes; the same
    // wrap arriving again must be deduped by the seen-wrap-id set.
    await act(async () => {
      deliverLiveWrap(wrapEvent);
    });

    await act(async () => {
      root.render(<Harness routeKind="contacts" />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverLiveWrap(wrapEvent);
    });

    expect(notifyNotificationRecordMock).toHaveBeenCalledTimes(1);
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "post-and-alert",
        record: expect.objectContaining({
          id: eventId("wrap-payment-notice-repeat-1"),
          kind: "paymentReceived",
          preview: "You received money",
        }),
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("does not replay a payment notice after an app restart once it was seen", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const wrapEvent = createWrapEvent("wrap-payment-notice-restart-1");
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: eventId("payment-notice-restart-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "payment_notice",
      created_at: liveRumorCreatedAtSec(),
      tags: [
        ["p", KNOWN_CONTACT_PUBKEY],
        ["p", MY_PUBKEY],
        ["linky", "payment_notice"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-payment-notice");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    querySyncMock.mockResolvedValue([]);
    const firstRoot = createRoot(document.createElement("div"));
    await act(async () => {
      firstRoot.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverLiveWrap(wrapEvent);
    });

    expect(notifyNotificationRecordMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRoot.unmount();
    });

    // After a restart the same wrap comes back through the pre-EOSE catch-up
    // replay; the persisted seen-wrap-id set must keep it silent.
    querySyncMock.mockResolvedValue([]);
    const secondRoot = createRoot(document.createElement("div"));
    await act(async () => {
      secondRoot.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    expect(notifyNotificationRecordMock).toHaveBeenCalledTimes(1);
    expect(setContactAttentionById).toHaveBeenCalledTimes(1);

    await act(async () => {
      secondRoot.unmount();
    });
  });

  it("keeps a historical payment notice silent when the matching token is already stored", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const wrapEvent = createWrapEvent("wrap-payment-notice-stored-token-1");
    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: eventId("payment-notice-stored-token-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "payment_notice",
      created_at: 1730000300,
      tags: [
        ["p", KNOWN_CONTACT_PUBKEY],
        ["p", MY_PUBKEY],
        ["linky", "payment_notice"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-payment-notice");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const updateLocalNostrMessage = vi.fn();
    const updateLocalNostrReaction = vi.fn();
    const softDeleteLocalNostrReactionsByWrapIds = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        appendLocalNostrReaction,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: {
          current: [
            {
              id: "stored-cashu-1",
              contactId: "contact-bob",
              content:
                "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vbWludC5leGFtcGxlIiwicHJvb2ZzIjpbeyJhbW91bnQiOjIxfV19XX0",
              createdAtSec: 1730000300,
              direction: "in",
              pubkey: KNOWN_CONTACT_PUBKEY,
              replyToId: null,
              replyToContent: null,
              rootMessageId: null,
              rumorId: "rumor-cashu-stored-1",
              status: "sent",
              wrapId: "wrap-cashu-stored-1",
              editedAtSec: null,
              editedFromId: null,
              isEdited: false,
              originalContent: null,
            },
          ] satisfies LocalNostrMessage[],
        },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        route: { kind: "contacts" },
        setContactAttentionById,
        softDeleteLocalNostrReactionsByWrapIds,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
        updateLocalNostrReaction,
      });

      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      deliverCatchUpWrap(wrapEvent);
    });

    // hasStoredIncomingCashuToken is a RECORD gate, not an alert gate: the notice never
    // becomes a record, so nothing reaches the dispatcher either.
    expect(notifyNotificationRecordMock).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();
    expect(appendLocalNostrMessage).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});

describe("useInboxNotificationsSync — the catch-up boundary", () => {
  // Round on purpose: Math.floor(FIXED_NOW_MS / 1000) is exact, so every `since`
  // assertion below is plain integer arithmetic with no rounding slack.
  const FIXED_NOW_MS = 1_800_000_000_000;
  const FIXED_NOW_SEC = 1_800_000_000;
  const THREE_DAYS_SEC = 3 * 24 * 60 * 60;
  const TWO_DAYS_SEC = 2 * 24 * 60 * 60;
  // `getPublicKey` is mocked to MY_PUBKEY, so this is the key the hook
  // derives for this identity. Owner-scoped by construction (T-09-10): there is
  // no shared key, so one identity's sync position cannot leak into another's.
  const WATERMARK_KEY = `linky.nostr.inbox_sync_watermark.v1.${MY_PUBKEY}`;

  const KNOWN_CONTACTS = [
    { id: "contact-bob", name: "Bob", npub: "npub-known" },
  ] as const;

  let restoreDateNow: (() => void) | null = null;
  let setPinnedNowMs: ((valueMs: number) => void) | null = null;

  // No `vi.useFakeTimers()` here on purpose: `flushEffects` awaits real
  // macrotasks, so a fake timer queue would deadlock the whole suite. Only the
  // clock READING is pinned.
  beforeEach(() => {
    const spy = vi.spyOn(Date, "now");
    spy.mockReturnValue(FIXED_NOW_MS);
    setPinnedNowMs = (valueMs: number) => {
      spy.mockReturnValue(valueMs);
    };
    restoreDateNow = () => {
      spy.mockRestore();
    };
    querySyncMock.mockResolvedValue([]);
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });
  });

  afterEach(() => {
    restoreDateNow?.();
    restoreDateNow = null;
    setPinnedNowMs = null;
    querySyncMock.mockReset();
    subscribeMock.mockReset();
    unwrapEventMock.mockReset();
    nip44DecryptMock.mockReset();
    getConversationKeyMock.mockClear();
    notifyNotificationRecordMock.mockClear();
    cancelNativePushPlaceholderMock.mockClear();
    // A watermark leaked from a previous case silently changes the next case's
    // `since`, which is the one value every assertion here turns on.
    localStorage.clear();
  });

  const advancePinnedNowMs = (deltaMs: number): void => {
    if (!setPinnedNowMs) {
      throw new Error("advancePinnedNowMs: the clock pin is not installed");
    }
    setPinnedNowMs(FIXED_NOW_MS + deltaMs);
  };

  interface BoundaryHarnessProps {
    contacts?: readonly { id: string; name: string; npub: string }[];
    routeId?: string;
  }

  const BoundaryHarness = ({ contacts, routeId }: BoundaryHarnessProps) => {
    useInboxNotificationsSync({
      appendLocalNostrMessage: vi.fn(() => "message-1"),
      appendLocalNostrReaction: vi.fn(() => "reaction-1"),
      contacts: contacts ?? [],
      currentNsec: "nsec-test",
      nostrFetchRelays: [],
      nostrMessageWrapIdsRef: { current: new Set<string>() },
      nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
      nostrMessagesRecent: [],
      nostrReactionWrapIdsRef: { current: new Set<string>() },
      nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
      route:
        routeId === undefined
          ? { kind: "contacts" }
          : { kind: "chat", id: routeId },
      setContactAttentionById: vi.fn(),
      softDeleteLocalNostrReactionsByWrapIds: vi.fn(),
      t: (key: string) =>
        key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
      updateLocalNostrMessage: vi.fn(),
      updateLocalNostrReaction: vi.fn(),
    });

    return null;
  };

  const renderBoundary = async (props?: BoundaryHarnessProps) => {
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<BoundaryHarness {...(props ?? {})} />);
    });
    await waitForCondition(
      () => capturedSubscriptions.length > 0,
      "the inbox subscription to be opened",
    );
    return root;
  };

  /**
   * The configuration that yields `post-and-alert` on the live path: a normal
   * incoming chat message from a KNOWN sender, document visible, route on some
   * OTHER chat. Shared by T-04, T-05 and T-06 so the three differ in exactly one
   * variable — where the wrap lands relative to EOSE.
   */
  const primeKnownSenderWrap = (
    rumorId: string,
    createdAtSec: number,
  ): void => {
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: rumorId,
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "hi from Bob",
      created_at: createdAtSec,
      tags: [["p", MY_PUBKEY]],
    });
  };

  it("bootstraps the inbox with a since-bounded filter that carries no limit", async () => {
    const root = await renderBoundary();

    // The bootstrap query is GONE, not merely bounded. One relay request.
    expect(querySyncMock).not.toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalledTimes(1);

    const filter = readInboxFilter();
    expect(filter.kinds).toEqual([1059]);
    expect(filter["#p"]).toEqual([MY_PUBKEY]);
    // `toBeUndefined()` is NOT enough: an explicit `limit: undefined` key would
    // satisfy it while still being a count bound the author meant to set. D1 is
    // closed only when the key is ABSENT from the filter object (T-09-07).
    expect("limit" in filter).toBe(false);
    expect(typeof filter.since).toBe("number");

    await act(async () => root.unmount());
  });

  it("applies the backdate slack: since is three days older than the persisted watermark", async () => {
    // A drain that completed ten minutes ago.
    const watermarkSec = FIXED_NOW_SEC - 600;
    localStorage.setItem(WATERMARK_KEY, JSON.stringify(watermarkSec));

    const root = await renderBoundary();

    expect(readInboxFilter().since).toBe(watermarkSec - THREE_DAYS_SEC);
    // `app/lib/pushWrappedEvent.ts` backdates the OUTER wrap `created_at` by up
    // to TWO_DAYS_SECONDS and the relay filters on that outer value, so a slack
    // smaller than two days re-creates D1 through a different door: a message
    // sent one second ago whose wrap is stamped two days old falls outside the
    // window and is never fetched again.
    expect(
      FIXED_NOW_SEC - Number(readInboxFilter().since),
    ).toBeGreaterThanOrEqual(TWO_DAYS_SEC);

    await act(async () => root.unmount());
  });

  it("falls back to now minus the lookback and advances the watermark only at EOSE", async () => {
    expect(localStorage.getItem(WATERMARK_KEY)).toBeNull();

    const root = await renderBoundary();

    // No watermark: the fallback is a wall-clock lookback and takes NO slack.
    // Slacking it as well would double-count and make the first drain six days
    // wide, which is not the window 09-08's first-run backlog is calibrated for.
    expect(readInboxFilter().since).toBe(FIXED_NOW_SEC - THREE_DAYS_SEC);
    // A drain that has not completed must not move the watermark (T-09-12).
    expect(localStorage.getItem(WATERMARK_KEY)).toBeNull();

    await act(async () => {
      deliverCatchUpWrap(createWrapEvent("wrap-boundary-watermark-1"));
    });
    // Without this half the case passes under an implementation that advances on
    // the first event, which is precisely the crash-mid-drain loss path.
    expect(localStorage.getItem(WATERMARK_KEY)).toBeNull();

    await act(async () => {
      signalEose();
    });
    expect(Number(localStorage.getItem(WATERMARK_KEY))).toBe(FIXED_NOW_SEC);

    // The latch is one-shot on OUR side too, not only in the pool. The clock is
    // advanced FIRST: under a frozen clock a second write would reproduce the
    // same value and this assertion would be vacuous.
    advancePinnedNowMs(60_000);
    await act(async () => {
      signalEose();
    });
    expect(Number(localStorage.getItem(WATERMARK_KEY))).toBe(FIXED_NOW_SEC);

    await act(async () => root.unmount());
  });

  it("classifies a wrap delivered before EOSE as catch-up", async () => {
    primeKnownSenderWrap("rumor-boundary-catch-up", 1730000400);
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverCatchUpWrap(createWrapEvent("wrap-boundary-catch-up"));
    });

    // T-04 and T-05 are a PAIR and neither is meaningful alone. This fixture
    // reaching `no-post` only proves the EOSE gate if the SAME fixture reaches
    // `post-and-alert` on the other side of the boundary — a broken sender
    // fixture (wrong npub, missing p tag, blocked pubkey) would also produce
    // `no-post`, or no dispatch at all, for reasons that have nothing to do with
    // origin. T-05 is that control.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "no-post" }),
    );

    await act(async () => root.unmount());
  });

  it("classifies a wrap delivered after EOSE as live", async () => {
    // `FIXED_NOW_SEC`, not the 2024 constant this fixture used to carry: plan
    // 09-09 made post-EOSE delivery necessary but no longer sufficient, so a
    // two-year-old inner rumor is `catch-up` on either side of the boundary. The
    // case's intent — the control half of the T-04 pair — is unchanged: it still
    // differs from T-04 in exactly one variable, which side of EOSE it lands on.
    primeKnownSenderWrap("rumor-boundary-live", FIXED_NOW_SEC);
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-boundary-live"));
    });

    // The control half of the T-04 pair: identical setup, opposite side of EOSE.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "post-and-alert" }),
    );

    await act(async () => root.unmount());
  });

  it("supplies the recipient pubkey the tap parser hard-requires", async () => {
    primeKnownSenderWrap("rumor-boundary-recipient", 1730000403);
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-boundary-recipient"));
    });

    // D3. Without this field the native payload omits `recipientPubkey`,
    // `readNotificationOpenTarget` returns `null` on tap, and the notification
    // lands on the generic `#contacts` fallback instead of the sender's chat
    // (Phase 8, Finding 3). `getPublicKey` is mocked to MY_PUBKEY in this
    // suite, so this also pins that the value written is the RECIPIENT — this
    // device's own identity — and never a correspondent's pubkey (T-09-31).
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientPubkey: MY_PUBKEY }),
    );

    await act(async () => root.unmount());
  });

  it("records a wrap that arrives before EOSE", async () => {
    primeKnownSenderWrap("rumor-boundary-record", 1730000402);
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverCatchUpWrap(createWrapEvent("wrap-boundary-record"));
    });

    // STORE-01. The dispatcher only ever receives the value
    // `notificationRecordStore.upsert` RETURNED, so a record carrying this wrap
    // id proves the durable write happened BEFORE the alert reasoning. The
    // pitfall this pins: `apps/push/src/relayWatcher.ts`'s catch-up gate DOES
    // return, because the server's job is delivery. The client's job is
    // recording first, so this gate may only change the origin VALUE — turning
    // it into an early `return` would drop the record entirely and reintroduce
    // exactly the loss class this milestone exists to remove (T-09-13).
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          id: eventId("wrap-boundary-record"),
        }),
      }),
    );

    // Deliberately NOT calling `bindOwner`. An unbound store reports
    // `getSyncEpochMs() === null`, which is what makes `resolveNotificationAlert`
    // skip row 2 `catch-up-pre-epoch` and take row 3 `catch-up-post-epoch` — the
    // row that yields `readAt: null`. Binding would set `epochMs = Date.now()`
    // while every wrap fixture in this file carries a 2024 `created_at`, so the
    // record would be classified pre-epoch and marked READ, failing this case
    // for a reason unrelated to the EOSE gate. Asserted rather than assumed, so
    // the reason row 2 is skipped is explicit. If a future change binds an owner
    // in this suite, this fixture must carry an `inner.created_at` at or after
    // the bound epoch.
    expect(notificationRecordStore.getSyncEpochMs()).toBeNull();

    const stored = notificationRecordStore
      .get()
      .find((record) => record.id === eventId("wrap-boundary-record"));
    expect(stored).toBeDefined();
    expect(stored?.readAt).toBeNull();

    await act(async () => root.unmount());
  });

  // --- Plan 09-09: classify by the MESSAGE, not by relay timing --------------
  //
  // The EOSE latch above classifies by WHEN A BYTE ARRIVED, which is a property
  // of the relay rather than of the message. `nostr-tools`' pool fires `oneose`
  // once every relay has EOSE'd **or** its `baseEoseTimeout` (4400 ms) elapses,
  // and relays replay newest-outer-`created_at`-first — so a slow relay is still
  // streaming its OLDEST tail when the latch flips, and those stragglers take the
  // `live` branch. Plan 09-08's device gate measured exactly that shape: run 1
  // posted the 45.97 h wrap, run 2 posted the FOUR oldest (36.5 / 40.0 / 42.6 /
  // 43.3 h) while a 16.6 h one did not escape.
  //
  // The four cases below therefore all deliver AFTER EOSE and differ in exactly
  // one variable — the age of the INNER rumor.
  const FORTY_HOURS_SEC = 40 * 60 * 60;

  it("classifies a post-EOSE straggler with an old rumor as catch-up", async () => {
    // The exact shape 09-08 observed: post-EOSE delivery, 40 h-old inner rumor.
    primeKnownSenderWrap(
      "rumor-boundary-straggler",
      FIXED_NOW_SEC - FORTY_HOURS_SEC,
    );
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-boundary-straggler"));
    });

    // Criterion 1. Same fixture, same side of EOSE, same route as the
    // `post-and-alert` control below — only the rumor age differs.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "no-post",
        record: expect.objectContaining({
          id: eventId("wrap-boundary-straggler"),
        }),
      }),
    );

    // Suppressing the ALERT may never suppress the RECORD: catch-up-post-epoch
    // leaves the record unread so the list and the badge still carry it.
    const stored = notificationRecordStore
      .get()
      .find((record) => record.id === eventId("wrap-boundary-straggler"));
    expect(stored).toBeDefined();
    expect(stored?.readAt).toBeNull();

    await act(async () => root.unmount());
  });

  it("still classifies a genuinely live wrap as live after EOSE", async () => {
    primeKnownSenderWrap("rumor-boundary-genuine-live", FIXED_NOW_SEC);
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-boundary-genuine-live"));
    });

    // Criterion 2, and the guard against over-suppression. Without it the
    // straggler case above passes vacuously under an implementation that
    // classifies EVERYTHING as catch-up.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "post-and-alert",
        record: expect.objectContaining({
          id: eventId("wrap-boundary-genuine-live"),
        }),
      }),
    );

    await act(async () => root.unmount());
  });

  it("tolerates modest sender clock skew", async () => {
    // RE-POINTED by plan 09-11, from -60 s to -20 s. This case previously
    // asserted that a rumor 60 s behind the subscription start still alerts.
    // That expectation was INVERTED by the recalibration and is now T-19's
    // `no-post`: plan 09-10 measured the faithful device backlog at an inner
    // age of 60-94 s at ingest, so "60 s behind" is exactly the backlog case
    // D2 requires us to suppress, not a skew case. The case itself is kept —
    // it is the over-suppression guard, and without it a zero-allowance
    // implementation (`sec >= bootstrapStartedAtSec`) would pass the whole
    // file. Only its operating point moved, to sit inside the 30 s allowance.
    primeKnownSenderWrap("rumor-boundary-skew", FIXED_NOW_SEC - 20);
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-boundary-skew"));
    });

    // Criterion 3. The failure direction the allowance buys is stated in the
    // source: too small costs an ALERT on a live message, never the MESSAGE.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "post-and-alert",
        record: expect.objectContaining({ id: eventId("wrap-boundary-skew") }),
      }),
    );

    await act(async () => root.unmount());
  });

  it("records a suppressed straggler exactly once", async () => {
    primeKnownSenderWrap(
      "rumor-boundary-straggler-record",
      FIXED_NOW_SEC - FORTY_HOURS_SEC,
    );
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-boundary-straggler-record"));
    });

    // STORE-01, mirroring T-06. This gate may only change the origin VALUE:
    // turning it into an early `return` would drop the record entirely and
    // reintroduce exactly the loss class this milestone exists to remove. The
    // dispatcher only ever receives the value `notificationRecordStore.upsert`
    // RETURNED, so a record carrying this wrap id proves the durable write
    // happened before the alert reasoning.
    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({
          id: eventId("wrap-boundary-straggler-record"),
        }),
      }),
    );

    // Unbound store => `getSyncEpochMs() === null`, so row 2 `catch-up-pre-epoch`
    // is skipped and row 3 `catch-up-post-epoch` is the row under test. Asserted
    // rather than assumed, exactly as in T-06.
    expect(notificationRecordStore.getSyncEpochMs()).toBeNull();

    // "Exactly once": the store is id-keyed and idempotent, so a suppressed
    // straggler must leave ONE unread record, not zero and not a duplicate.
    const matches = notificationRecordStore
      .get()
      .filter(
        (record) => record.id === eventId("wrap-boundary-straggler-record"),
      );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.readAt).toBeNull();

    await act(async () => root.unmount());
  });

  // --- Plan 09-11: the allowance is a CLOCK-SKEW allowance ------------------
  //
  // The two cases above bracket the boundary at 40 h vs 0 s, which every value
  // from 30 s to 40 h satisfies. They therefore could not detect that 300 s was
  // calibrated against the wrong quantity. Plan 09-08 described the escaping
  // wraps as 36-45.97 h old; those are NIP-59-randomised OUTER ages. The same
  // wraps' INNER rumor ages were 68-86 s, and plan 09-10 measured the faithful
  // device backlog at an inner age of 60-94 s at ingest — entirely inside a
  // 300 s window, which is why the predicate demoted 0 of 10 on every faithful
  // run.
  //
  // The general form: a subscription necessarily starts before a wrap is
  // delivered to it, so a wrap whose inner rumor is younger than the allowance
  // AT DELIVERY can never be demoted, for any `bootstrapStartedAtSec`. The pair
  // below therefore brackets the boundary tightly, at 60 s and 20 s.
  const MEASURED_FAITHFUL_BACKLOG_FLOOR_SEC = 60;

  it("demotes a post-EOSE straggler sent barely before the subscription started", async () => {
    // The faithful device case reduced to a unit test. 60 s is the FLOOR of the
    // 60-94 s inner-rumor age plan 09-10 measured across faithful runs F1/F2/F3
    // (see 09-10-SUMMARY.md, "Why it failed"); picking the floor means passing
    // here implies the whole measured range is covered. This case fails at
    // 300 s (`post-and-alert`) and passes at 30 s.
    primeKnownSenderWrap(
      "rumor-boundary-measured-backlog",
      FIXED_NOW_SEC - MEASURED_FAITHFUL_BACKLOG_FLOOR_SEC,
    );
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-boundary-measured-backlog"));
    });

    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "no-post",
        record: expect.objectContaining({
          id: eventId("wrap-boundary-measured-backlog"),
        }),
      }),
    );

    // Suppressing the ALERT may never suppress the RECORD. The asymmetry the
    // recalibration deliberately buys: a missed alert is recoverable from the
    // list, a missed message is not.
    const stored = notificationRecordStore
      .get()
      .find(
        (record) => record.id === eventId("wrap-boundary-measured-backlog"),
      );
    expect(stored).toBeDefined();
    expect(stored?.readAt).toBeNull();

    await act(async () => root.unmount());
  });

  it("still alerts within the clock-skew allowance", async () => {
    // 20 s behind the subscription start, i.e. inside the 30 s allowance. This
    // pins the allowance as REAL: an implementation that drops it to zero
    // (`sec >= bootstrapStartedAtSec`) fails here, and so does one that keeps
    // narrowing it in response to a future backlog measurement.
    primeKnownSenderWrap("rumor-boundary-allowance", FIXED_NOW_SEC - 20);
    const root = await renderBoundary({
      contacts: KNOWN_CONTACTS,
      routeId: "contact-alice",
    });

    await act(async () => {
      deliverLiveWrap(createWrapEvent("wrap-boundary-allowance"));
    });

    expect(notifyNotificationRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "post-and-alert",
        record: expect.objectContaining({
          id: eventId("wrap-boundary-allowance"),
        }),
      }),
    );

    await act(async () => root.unmount());
  });
});
