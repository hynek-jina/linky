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
        getCashuTokenMessageInfo: () => null,
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
        getCashuTokenMessageInfo: () => null,
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
          getCashuTokenMessageInfo: () => null,
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

    expect(pushToast).toHaveBeenCalledWith("Bob: hi from Bob");

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
        getCashuTokenMessageInfo: () => null,
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
});
