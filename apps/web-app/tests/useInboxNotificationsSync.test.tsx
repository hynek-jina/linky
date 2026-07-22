import React, { act } from "react";
import { createRoot } from "react-dom/client";
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
  getPublicKey: vi.fn(() => "me-pubkey-hex"),
  nip19: {
    decode: vi.fn((value: string) => {
      if (value === "nsec-test") {
        return { type: "nsec", data: new Uint8Array([1, 2, 3]) };
      }
      if (value === "npub-known") {
        return { type: "npub", data: "known-contact-pubkey" };
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
import {
  createLinkyBankPaymentOfferEvent,
  LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC,
} from "../src/app/lib/bankPaymentOffer";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
} from "../src/app/types/appTypes";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flushEffects = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
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
        appendLocalNostrReaction: vi.fn(() => "reaction-1"),
        contacts: [],
        currentNsec: "nsec-test",
        enabled: false,
        maybeShowPwaNotification: vi.fn(async () => {}),
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast: vi.fn(),
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
    const wrapEvent = { id: "wrap-unknown-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-unknown-1",
      pubkey:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      content: "hello from unknown",
      created_at: 1730000000,
      tags: [["p", "me-pubkey-hex"]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast,
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

    expect(appendLocalNostrMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId:
          "unknown:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        content: "hello from unknown",
        direction: "in",
        pubkey:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        rumorId: "rumor-unknown-1",
        wrapId: "wrap-unknown-1",
      }),
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("ignores events whose inner content is still an encrypted payload", async () => {
    const wrapEvent = { id: "wrap-encrypted-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-encrypted-1",
      pubkey:
        "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      content: "encrypted-inner-payload",
      created_at: 1730000001,
      tags: [["p", "me-pubkey-hex"]],
    });
    nip44DecryptMock.mockReturnValue('{"kind":14}');

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast,
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

    const wrapEvent = { id: "wrap-known-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-known-1",
      pubkey: "known-contact-pubkey",
      content: "hi from Bob",
      created_at: 1730000002,
      tags: [["p", "me-pubkey-hex"]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
          maybeShowPwaNotification,
          nostrFetchRelays: [],
          nostrMessageWrapIdsRef: { current: new Set<string>() },
          nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
          nostrMessagesRecent: [],
          nostrReactionWrapIdsRef: { current: new Set<string>() },
          nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
          pushToast,
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
    subscribeMock.mockReset();
    unwrapEventMock.mockReset();
    pushToast.mockReset();

    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-known-2",
      pubkey: "known-contact-pubkey",
      content: "this stays silent",
      created_at: 1730000003,
      tags: [["p", "me-pubkey-hex"]],
    });

    const activeRoot = await renderHarness("contact-bob");

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
      offererPublicKey: "known-contact-pubkey",
      recipientPublicKey: "me-pubkey-hex",
      senderPublicKey: "known-contact-pubkey",
      status: "offered",
    });
    const wrapEvent = { id: "wrap-expired-offer-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      ...offerEvent,
      id: "rumor-expired-offer-1",
    });

    const appendLocalNostrMessage = vi.fn(() => "message-1");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const onBankPaymentOfferMessage = vi.fn();
    const pushToast = vi.fn();
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
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        onBankPaymentOfferMessage,
        pushToast,
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

    expect(onBankPaymentOfferMessage).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("treats self-authored copies matched by client id as outgoing and silent", async () => {
    const wrapEvent = { id: "wrap-self-copy-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-self-copy-1",
      pubkey:
        "feedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed",
      content: "hi from me",
      created_at: 1730000004,
      tags: [
        ["p", "known-contact-pubkey"],
        ["p", "me-pubkey-hex"],
        ["client", "client-fixed"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-append");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
              pubkey: "me-pubkey-hex",
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
        pushToast,
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

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("routes incoming messages to a known contact when the peer is only identifiable from p tags", async () => {
    const wrapEvent = { id: "wrap-known-via-ptag-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-known-via-ptag-1",
      pubkey:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      content: "hello from Bob",
      created_at: 1730000005,
      tags: [
        ["p", "known-contact-pubkey"],
        ["p", "me-pubkey-hex"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-known-via-ptag");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast,
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

    expect(appendLocalNostrMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-bob",
        content: "hello from Bob",
        direction: "in",
        pubkey: "known-contact-pubkey",
        rumorId: "rumor-known-via-ptag-1",
        wrapId: "wrap-known-via-ptag-1",
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
      "msg_known-contact-pubkey",
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

    const wrapEvent = { id: "wrap-cashu-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-cashu-1",
      pubkey: "known-contact-pubkey",
      content:
        "cashuAeyJ0b2tlbiI6W3sibWludCI6Imh0dHBzOi8vbWludC5leGFtcGxlIiwicHJvb2ZzIjpbeyJhbW91bnQiOjIxfV19XX0",
      created_at: 1730000006,
      tags: [["p", "me-pubkey-hex"]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-cashu");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast,
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

    const wrapEvent = { id: "wrap-stored-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-stored-1",
      pubkey: "known-contact-pubkey",
      content: "already saved",
      created_at: 1730000100,
      tags: [["p", "me-pubkey-hex"]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-stored");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
              pubkey: "known-contact-pubkey",
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
        pushToast,
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

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();
    expect(updateLocalNostrMessage).toHaveBeenCalledWith("stored-message-1", {
      status: "sent",
      wrapId: "wrap-stored-1",
      pubkey: "known-contact-pubkey",
      rumorId: "rumor-stored-1",
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

    const wrapEvent = { id: "wrap-deleted-contact-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 14,
      id: "rumor-deleted-contact-1",
      pubkey: deletedContactPubkey,
      content: "stale thread message",
      created_at: 1730000200,
      tags: [["p", "me-pubkey-hex"]],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-deleted");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast,
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

    expect(appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
    expect(updateLocalNostrMessage).toHaveBeenCalledWith(
      "stored-message-deleted-1",
      expect.objectContaining({
        pubkey: deletedContactPubkey,
        rumorId: "rumor-deleted-contact-1",
        status: "sent",
        wrapId: "wrap-deleted-contact-1",
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

    const wrapEvent = { id: "wrap-payment-notice-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: "rumor-payment-notice-1",
      pubkey: "known-contact-pubkey",
      content: "payment_notice",
      created_at: 1730000007,
      tags: [
        ["p", "known-contact-pubkey"],
        ["p", "me-pubkey-hex"],
        ["linky", "payment_notice"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-payment-notice");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast,
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

    expect(pushToast).toHaveBeenCalledWith("Bob: You received money");
    expect(maybeShowPwaNotification).toHaveBeenCalledWith(
      "Bob",
      "You received money",
      "wrap-payment-notice-1",
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

    const wrapEvent = { id: "wrap-payment-notice-repeat-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: "payment-notice-repeat-1",
      pubkey: "known-contact-pubkey",
      content: "payment_notice",
      created_at: 1730000008,
      tags: [
        ["p", "known-contact-pubkey"],
        ["p", "me-pubkey-hex"],
        ["linky", "payment_notice"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-payment-notice");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast,
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
      root.render(<Harness routeKind="wallet" />);
    });
    await flushEffects();
    await flushEffects();

    await act(async () => {
      root.render(<Harness routeKind="contacts" />);
    });
    await flushEffects();
    await flushEffects();

    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(pushToast).toHaveBeenCalledWith("Bob: You received money");
    expect(maybeShowPwaNotification).toHaveBeenCalledTimes(1);
    expect(maybeShowPwaNotification).toHaveBeenCalledWith(
      "Bob",
      "You received money",
      "wrap-payment-notice-repeat-1",
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

    const wrapEvent = { id: "wrap-payment-notice-restart-1" };
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: "payment-notice-restart-1",
      pubkey: "known-contact-pubkey",
      content: "payment_notice",
      created_at: 1730000200,
      tags: [
        ["p", "known-contact-pubkey"],
        ["p", "me-pubkey-hex"],
        ["linky", "payment_notice"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-payment-notice");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
        maybeShowPwaNotification,
        nostrFetchRelays: [],
        nostrMessageWrapIdsRef: { current: new Set<string>() },
        nostrMessagesLatestRef: { current: [] as LocalNostrMessage[] },
        nostrMessagesRecent: [],
        nostrReactionWrapIdsRef: { current: new Set<string>() },
        nostrReactionsLatestRef: { current: [] as LocalNostrReaction[] },
        pushToast,
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

    querySyncMock.mockResolvedValue([wrapEvent]);
    const firstRoot = createRoot(document.createElement("div"));
    await act(async () => {
      firstRoot.render(<Harness />);
    });
    await flushEffects();
    await flushEffects();

    expect(pushToast).toHaveBeenCalledTimes(1);
    expect(maybeShowPwaNotification).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstRoot.unmount();
    });

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

    const wrapEvent = { id: "wrap-payment-notice-stored-token-1" };
    querySyncMock.mockResolvedValue([wrapEvent]);
    subscribeMock.mockReturnValue({
      close: vi.fn(async () => {}),
    });
    unwrapEventMock.mockReturnValue({
      kind: 24133,
      id: "payment-notice-stored-token-1",
      pubkey: "known-contact-pubkey",
      content: "payment_notice",
      created_at: 1730000300,
      tags: [
        ["p", "known-contact-pubkey"],
        ["p", "me-pubkey-hex"],
        ["linky", "payment_notice"],
      ],
    });
    nip44DecryptMock.mockImplementation(() => {
      throw new Error("not encrypted");
    });

    const appendLocalNostrMessage = vi.fn(() => "message-payment-notice");
    const appendLocalNostrReaction = vi.fn(() => "reaction-1");
    const maybeShowPwaNotification = vi.fn(async () => {});
    const pushToast = vi.fn();
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
              pubkey: "known-contact-pubkey",
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
        pushToast,
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

    expect(pushToast).not.toHaveBeenCalled();
    expect(maybeShowPwaNotification).not.toHaveBeenCalled();
    expect(setContactAttentionById).not.toHaveBeenCalled();
    expect(appendLocalNostrMessage).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
