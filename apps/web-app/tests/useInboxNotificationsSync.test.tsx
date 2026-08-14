import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { Event as NostrToolsEvent } from "nostr-tools";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getConversationKeyMock,
  nip44DecryptMock,
  querySyncMock,
  subscribeMock,
  unwrapEventMock,
} = vi.hoisted(() => ({
  getConversationKeyMock: vi.fn(() => new Uint8Array([9, 9, 9])),
  nip44DecryptMock: vi.fn(),
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

import { useInboxNotificationsSync } from "../src/app/hooks/messages/useInboxNotificationsSync";
import { LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC } from "../src/app/lib/bankPaymentOffer";
import type { LocalNostrMessage } from "../src/app/types/appTypes";
import { createLinkyBankPaymentOfferEvent } from "../src/testUtils/bankPaymentOfferEvent";

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

const waitForInboxSubscription = async () => {
  await act(async () => {
    await vi.waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledTimes(1);
    });
  });
};

describe("useInboxNotificationsSync", () => {
  afterEach(() => {
    querySyncMock.mockReset();
    subscribeMock.mockReset();
    unwrapEventMock.mockReset();
    nip44DecryptMock.mockReset();
    getConversationKeyMock.mockClear();
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
        contacts: [],
        currentNsec: "nsec-test",
        enabled: false,
        maybeShowPwaNotification: vi.fn(async () => {}),
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast: vi.fn(),
        route: { kind: "contacts" },
        setContactAttentionById: vi.fn(),
        t: (key: string) => key,
        updateLocalNostrMessage: vi.fn(),
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
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => key,
        updateLocalNostrMessage,
      });

      return null;
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness />);
    });
    await waitForInboxSubscription();

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

  it("continues backfill and subscribes after one event throws", async () => {
    const firstWrap = createWrapEvent("wrap-throwing");
    const secondWrap = createWrapEvent("wrap-after-throw");
    querySyncMock.mockResolvedValue([firstWrap, secondWrap]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
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
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification: vi.fn(async () => {}),
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast: vi.fn(),
        route: { kind: "contacts" },
        setContactAttentionById: vi.fn(),
        t: (key: string) => key,
        updateLocalNostrMessage: vi.fn(),
      });
      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await waitForInboxSubscription();

    expect(appendLocalNostrMessage).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });

  it("ignores events whose inner content is still an encrypted payload", async () => {
    const wrapEvent = createWrapEvent("wrap-encrypted-1");
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => key,
        updateLocalNostrMessage,
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

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("shows an in-app toast for incoming messages outside the active chat only", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    // Only live subscription events surface toasts; bootstrap querySync
    // results are stored silently, so deliver the wrap through onevent.
    const wrapEvent = createWrapEvent("wrap-known-1");
    const liveEventHandlers: Array<(event: typeof wrapEvent) => void> = [];
    querySyncMock.mockResolvedValue([]);
    subscribeMock.mockImplementation(
      (
        _relays: unknown,
        _filter: unknown,
        handlers: { onevent: (event: typeof wrapEvent) => void },
      ) => {
        liveEventHandlers.push(handlers.onevent);
        return { close: vi.fn(async () => {}) };
      },
    );
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-known-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "hi from Bob",
      created_at: 1730000002,
      tags: [["p", MY_PUBKEY]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const renderHarness = async (routeId: string) => {
      const Harness = () => {
        useInboxNotificationsSync({
          appendLocalNostrMessage,
          contacts: [
            {
              id: "contact-bob",
              name: "Bob",
              npub: "npub-known",
            },
          ],
          currentNsec: "nsec-test",
          maybeShowPwaNotification,
          nostrFetchRelays: [],
          nostrMessageWrapIdsRef: { current: new Set<string>() },
          nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
          nostrMessagesRecent: [],
          pushToast,
          route: { kind: "chat", id: routeId },
          setContactAttentionById,
          t: (key: string) =>
            key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
          updateLocalNostrMessage,
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
      liveEventHandlers[0]?.(wrapEvent);
    });

    expect(pushToast).toHaveBeenCalledWith(
      "Bob: hi from Bob",
      expect.objectContaining({
        onClick: expect.any(Function),
      }),
    );

    await act(async () => {
      root.unmount();
    });

    querySyncMock.mockReset();
    unwrapEventMock.mockReset();
    pushToast.mockReset();

    querySyncMock.mockResolvedValue([]);
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-known-2"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "this stays silent",
      created_at: 1730000003,
      tags: [["p", MY_PUBKEY]],
    });

    const activeRoot = await renderHarness("contact-bob");
    await act(async () => {
      liveEventHandlers.at(-1)?.(createWrapEvent("wrap-known-2"));
    });

    expect(pushToast).not.toHaveBeenCalled();

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
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      ...offerEvent,
      id: eventId("rumor-expired-offer-1"),
    });

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const onBankPaymentOfferMessage = vi.fn();
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "known-contact",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        onBankPaymentOfferMessage,
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => key,
        updateLocalNostrMessage,
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

    expect(onBankPaymentOfferMessage).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
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
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      ...settledEvent,
      id: eventId("rumor-settled-offer"),
    });

    const onBankPaymentOfferMessage = vi.fn();
    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage: vi.fn(() => "message-1"),
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification: vi.fn(async () => {}),
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        onBankPaymentOfferMessage,
        pushToast: vi.fn(),
        route: { kind: "contacts" },
        setContactAttentionById: vi.fn(),
        t: (key: string) => key,
        updateLocalNostrMessage: vi.fn(),
      });
      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await flushEffects();
    await flushEffects();

    expect(onBankPaymentOfferMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-bob",
        content: settledEvent.content,
        direction: "out",
      }),
    );

    await act(async () => root.unmount());
  });

  it("surfaces a declined proxy payment and opens the contact chat from the toast", async () => {
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
    const liveEventHandlers: Array<(event: typeof wrapEvent) => void> = [];
    querySyncMock.mockResolvedValue([]);
    subscribeMock.mockImplementation(
      (
        _relays: unknown,
        _filter: unknown,
        handlers: { onevent: (event: typeof wrapEvent) => void },
      ) => {
        liveEventHandlers.push(handlers.onevent);
        return { close: vi.fn(async () => {}) };
      },
    );
    unwrapEventMock.mockReturnValue({
      ...declineEvent,
      id: eventId("rumor-declined-offer"),
    });

    const maybeShowPwaNotification = vi.fn(async () => {});
    const onBankPaymentOfferMessage = vi.fn();
    const onOpenInboxMessageToast = vi.fn();
    const pushToast = vi.fn(
      (_message: string, options?: { onClick?: () => void }) => {
        options?.onClick?.();
      },
    );
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
        bankPaymentOfferMessages: [knownOfferMessage],
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        onBankPaymentOfferMessage,
        onOpenInboxMessageToast,
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "bankPaymentOfferDeclinedNotification") {
            return "Payment was declined.";
          }
          return key;
        },
        updateLocalNostrMessage: vi.fn(),
      });
      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    await flushEffects();
    await flushEffects();
    await act(async () => {
      liveEventHandlers[0]?.(wrapEvent);
    });

    expect(onBankPaymentOfferMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-bob",
        direction: "out",
      }),
    );
    expect(pushToast).toHaveBeenCalledWith(
      "Bob: Payment was declined.",
      expect.objectContaining({ onClick: expect.any(Function) }),
    );
    expect(onOpenInboxMessageToast).toHaveBeenCalledWith({
      contactId: "contact-bob",
    });
    expect(maybeShowPwaNotification).toHaveBeenCalledWith(
      "Bob",
      "Payment was declined.",
      eventId("wrap-declined-offer"),
    );
    expect(setContactAttentionById).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it("treats self-authored copies matched by client id as outgoing and silent", async () => {
    const wrapEvent = createWrapEvent("wrap-self-copy-1");
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
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
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => key,
        updateLocalNostrMessage,
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

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("routes incoming messages to a known contact when the peer is only identifiable from p tags", async () => {
    const wrapEvent = createWrapEvent("wrap-known-via-ptag-1");
    const liveEventHandlers: Array<(event: typeof wrapEvent) => void> = [];
    querySyncMock.mockResolvedValue([]);
    subscribeMock.mockImplementation(
      (
        _relays: unknown,
        _filter: unknown,
        handlers: { onevent: (event: typeof wrapEvent) => void },
      ) => {
        liveEventHandlers.push(handlers.onevent);
        return { close: vi.fn(async () => {}) };
      },
    );
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: eventId("rumor-known-via-ptag-1"),
      pubkey:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      content: "hello from Bob",
      created_at: 1730000005,
      tags: [
        ["p", KNOWN_CONTACT_PUBKEY],
        ["p", MY_PUBKEY],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-known-via-ptag");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) =>
          key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
        updateLocalNostrMessage,
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
      liveEventHandlers[0]?.(wrapEvent);
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
    expect(pushToast).toHaveBeenCalledWith(
      "Bob: hello from Bob",
      expect.objectContaining({
        onClick: expect.any(Function),
      }),
    );
    expect(maybeShowPwaNotification).toHaveBeenCalledWith(
      "Bob",
      "hello from Bob",
      `msg_${KNOWN_CONTACT_PUBKEY}`,
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
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
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

    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();
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
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
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
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) =>
          key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
        updateLocalNostrMessage,
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

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
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
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
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
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) =>
          key === "chatIncomingMessageToast" ? "{name}: {message}" : key,
        updateLocalNostrMessage,
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

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
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
    const liveEventHandlers: Array<(event: typeof wrapEvent) => void> = [];
    querySyncMock.mockResolvedValue([]);
    subscribeMock.mockImplementation(
      (
        _relays: unknown,
        _filter: unknown,
        handlers: { onevent: (event: typeof wrapEvent) => void },
      ) => {
        liveEventHandlers.push(handlers.onevent);
        return { close: vi.fn(async () => {}) };
      },
    );
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: eventId("rumor-payment-notice-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "payment_notice",
      created_at: 1730000007,
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
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
      liveEventHandlers[0]?.(wrapEvent);
    });

    expect(pushToast).toHaveBeenCalledWith("Bob: You received money");
    expect(maybeShowPwaNotification).toHaveBeenCalledWith(
      "Bob",
      "You received money",
      eventId("wrap-payment-notice-1"),
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
    const liveEventHandlers: Array<(event: typeof wrapEvent) => void> = [];
    querySyncMock.mockResolvedValue([]);
    subscribeMock.mockImplementation(
      (
        _relays: unknown,
        _filter: unknown,
        handlers: { onevent: (event: typeof wrapEvent) => void },
      ) => {
        liveEventHandlers.push(handlers.onevent);
        return { close: vi.fn(async () => {}) };
      },
    );
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: eventId("payment-notice-repeat-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "payment_notice",
      created_at: 1730000008,
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    interface HarnessProps {
      routeKind: "contacts" | "wallet";
    }

    const Harness = ({ routeKind }: HarnessProps) => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast,
        route: { kind: routeKind },
        setContactAttentionById,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
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
      liveEventHandlers[0]?.(wrapEvent);
    });

    await act(async () => {
      root.render(<Harness routeKind="wallet" />);
    });
    await flushEffects();
    await flushEffects();
    // The route change re-runs the inbox effect and resubscribes; the same
    // wrap arriving again must be deduped by the seen-wrap-id set.
    await act(async () => {
      liveEventHandlers.at(-1)?.(wrapEvent);
    });

    await act(async () => {
      root.render(<Harness routeKind="contacts" />);
    });
    await flushEffects();
    await flushEffects();
    await act(async () => {
      liveEventHandlers.at(-1)?.(wrapEvent);
    });

    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(pushToast).toHaveBeenCalledWith("Bob: You received money");
    expect(maybeShowPwaNotification).toHaveBeenCalledTimes(1);
    expect(maybeShowPwaNotification).toHaveBeenCalledWith(
      "Bob",
      "You received money",
      eventId("wrap-payment-notice-repeat-1"),
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
    const liveEventHandlers: Array<(event: typeof wrapEvent) => void> = [];
    subscribeMock.mockImplementation(
      (
        _relays: unknown,
        _filter: unknown,
        handlers: { onevent: (event: typeof wrapEvent) => void },
      ) => {
        liveEventHandlers.push(handlers.onevent);
        return { close: vi.fn(async () => {}) };
      },
    );
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: eventId("payment-notice-restart-1"),
      pubkey: KNOWN_CONTACT_PUBKEY,
      content: "payment_notice",
      created_at: 1730000200,
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
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
      liveEventHandlers[0]?.(wrapEvent);
    });

    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(maybeShowPwaNotification).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRoot.unmount();
    });

    // After a restart the same wrap comes back through bootstrap catch-up;
    // the persisted seen-wrap-id set must keep it silent.
    querySyncMock.mockResolvedValue([wrapEvent]);
    const secondRoot = createRoot(document.createElement("div"));
    await act(async () => {
      secondRoot.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();

    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(maybeShowPwaNotification).toHaveBeenCalledTimes(1);
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
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
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
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
    const updateLocalNostrMessage = vi.fn();
    const setContactAttentionById: React.Dispatch<
      React.SetStateAction<Record<string, number>>
    > = vi.fn();

    const Harness = () => {
      useInboxNotificationsSync({
        appendLocalNostrMessage,
        contacts: [
          {
            id: "contact-bob",
            name: "Bob",
            npub: "npub-known",
          },
        ],
        currentNsec: "nsec-test",
        maybeShowPwaNotification,
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
        pushToast,
        route: { kind: "contacts" },
        setContactAttentionById,
        t: (key: string) => {
          if (key === "chatIncomingMessageToast") return "{name}: {message}";
          if (key === "notificationReceivedMoney") return "You received money";
          return key;
        },
        updateLocalNostrMessage,
      });

      return null;
    };

    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();

    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();
    expect(appendLocalNostrMessage).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
