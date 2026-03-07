import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const querySyncMock = vi.fn();
const subscribeMock = vi.fn();
const unwrapEventMock = vi.fn();

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
});
