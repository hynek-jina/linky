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
});
