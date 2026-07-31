import * as Evolu from "@evolu/common";
import {
  getPublicKey,
  nip19,
  SimplePool,
  type Event as NostrToolsEvent,
  type UnsignedEvent,
} from "nostr-tools";
import { describe, expect, it, vi } from "vitest";
import type { AppNostrPool } from "../../lib/nostrPool";
import { LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER } from "../../lib/pushWrappedEvent";
import type {
  LocalNostrMessage,
  PublishWrappedResult,
} from "../../types/appTypes";
import { publishCashuMessagePayment } from "./publishCashuMessagePayment";

const privateKey = new Uint8Array(32).fill(1);
const contactPrivateKey = new Uint8Array(32).fill(2);
const currentNsec = nip19.nsecEncode(privateKey);
const contactPublicKey = getPublicKey(contactPrivateKey);
const contactNpub = nip19.npubEncode(contactPublicKey);
const contactId = Evolu.createIdFromString<"Contact">("contact");

type PublishSingleWrapped = (
  pool: AppNostrPool,
  relays: string[],
  event: NostrToolsEvent,
) => Promise<{ anySuccess: boolean; error: string | null }>;

type PublishWrapped = (
  pool: AppNostrPool,
  relays: string[],
  wrapForMe: NostrToolsEvent,
  wrapForContact: NostrToolsEvent,
) => Promise<PublishWrappedResult>;

const createWrap = (
  event: Partial<UnsignedEvent>,
  recipientPublicKey: string,
): NostrToolsEvent => ({
  content: event.content ?? "",
  created_at: event.created_at ?? 1,
  id: `wrap-${recipientPublicKey}`,
  kind: 1059,
  pubkey: event.pubkey ?? "",
  sig: "signature",
  tags: event.tags ?? [],
});

const createArgs = () => {
  const ids = ["token-client", "notice-client"];
  const nostrMessagesLocal: LocalNostrMessage[] = [];
  const appendLocalNostrMessage = vi.fn(() => "new-local-message");
  const updateLocalNostrMessage = vi.fn();
  const wrapWithoutPushMarker = vi.fn(
    (
      event: Partial<UnsignedEvent>,
      _senderPrivateKey: Uint8Array,
      recipientPublicKey: string,
    ) => createWrap(event, recipientPublicKey),
  );
  const wrapWithPushMarker = vi.fn(
    (
      event: Partial<UnsignedEvent>,
      _senderPrivateKey: Uint8Array,
      recipientPublicKey: string,
    ) => createWrap(event, recipientPublicKey),
  );

  return {
    activePublishClientIds: new Set<string>(),
    appendLocalNostrMessage,
    batches: [
      {
        amount: 100,
        mint: "https://mint.example",
        token: "cashu-token",
        unit: "sat",
      },
    ],
    chatSeenWrapIds: new Set<string>(),
    contactId,
    contactNpub,
    currentNsec,
    dependencies: {
      getPool: async () => new SimplePool(),
      makeId: () => ids.shift() ?? "unexpected-client",
      nowSec: () => 1_730_000_000,
      wrapWithPushMarker,
      wrapWithoutPushMarker,
    },
    logPayStep: vi.fn(),
    nostrMessagesLocal,
    pendingMessageId: null,
    publishSingleWrappedWithRetry: vi
      .fn<PublishSingleWrapped>()
      .mockResolvedValue({
        anySuccess: true,
        error: null,
      }),
    publishWrappedWithRetry: vi.fn<PublishWrapped>().mockResolvedValue({
      anySuccess: true,
      error: null,
    }),
    relays: ["wss://relay.example"],
    updateLocalNostrMessage,
    wrapWithPushMarker,
    wrapWithoutPushMarker,
  };
};

describe("publishCashuMessagePayment", () => {
  it("publishes kind-14 token content with reply tags and reuses one pending message", async () => {
    const args = createArgs();
    const pendingMessage: LocalNostrMessage = {
      contactId: String(contactId),
      content: "queued",
      createdAtSec: 1,
      direction: "out",
      id: "pending-message",
      pubkey: "",
      rumorId: null,
      status: "pending",
      wrapId: "pending:old",
    };

    const result = await publishCashuMessagePayment({
      ...args,
      nostrMessagesLocal: [pendingMessage],
      pendingMessageId: "pending-message",
      replyContext: {
        replyToContent: "original",
        replyToId: "reply-id",
        rootMessageId: "root-id",
      },
    });

    expect(args.appendLocalNostrMessage).not.toHaveBeenCalled();
    expect(args.updateLocalNostrMessage).toHaveBeenNthCalledWith(
      1,
      "pending-message",
      expect.objectContaining({
        clientId: "token-client",
        content: "cashu-token",
        status: "pending",
      }),
    );
    expect(args.updateLocalNostrMessage).toHaveBeenNthCalledWith(
      2,
      "pending-message",
      expect.objectContaining({
        status: "sent",
        wrapId: `wrap-${getPublicKey(privateKey)}`,
      }),
    );

    const tokenEvent = args.wrapWithoutPushMarker.mock.calls[0]?.[0];
    expect(tokenEvent).toMatchObject({
      content: "cashu-token",
      created_at: 1_730_000_000,
      kind: 14,
      pubkey: getPublicKey(privateKey),
      tags: [
        ["p", contactPublicKey],
        ["p", getPublicKey(privateKey)],
        ["client", "token-client"],
        ["e", "root-id", "", "root"],
        ["e", "reply-id", "", "reply"],
      ],
    });
    expect(args.chatSeenWrapIds).toContain(`wrap-${getPublicKey(privateKey)}`);
    expect(result).toEqual({
      hasPendingMessages: false,
      paymentNoticeError: null,
      publishErrors: [],
      publishedTokenTexts: ["cashu-token"],
      unpublishedTokenTexts: [],
    });
  });

  it.each([
    ["returned failure", false],
    ["thrown failure", true],
  ])(
    "keeps the local message pending and skips the notice on %s",
    async (_label, throws) => {
      const args = createArgs();
      if (throws) {
        args.publishWrappedWithRetry.mockRejectedValue(
          new Error("relay unavailable"),
        );
      } else {
        args.publishWrappedWithRetry.mockResolvedValue({
          anySuccess: false,
          error: "relay unavailable",
        });
      }

      const result = await publishCashuMessagePayment(args);

      expect(args.appendLocalNostrMessage).toHaveBeenCalledOnce();
      expect(args.updateLocalNostrMessage).not.toHaveBeenCalled();
      expect(args.activePublishClientIds).toEqual(new Set());
      expect(args.chatSeenWrapIds).toEqual(new Set());
      expect(args.publishSingleWrappedWithRetry).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        hasPendingMessages: true,
        publishErrors: [
          {
            clientId: "token-client",
            error: throws ? "Error: relay unavailable" : "relay unavailable",
            token: "cashu-token",
          },
        ],
        publishedTokenTexts: [],
        unpublishedTokenTexts: ["cashu-token"],
      });
    },
  );

  it("publishes a best-effort bank-offer payment notice after token success", async () => {
    const args = createArgs();
    args.publishSingleWrappedWithRetry.mockResolvedValue({
      anySuccess: false,
      error: "notice failed",
    });

    const result = await publishCashuMessagePayment({
      ...args,
      paymentNoticeContext: LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
      paymentNoticeOfferId: "offer-1",
    });

    expect(args.wrapWithPushMarker).toHaveBeenCalledOnce();
    expect(args.wrapWithPushMarker.mock.calls[0]?.[0]).toMatchObject({
      tags: expect.arrayContaining([
        ["context", LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER],
        ["offer", "offer-1"],
      ]),
    });
    expect(result).toMatchObject({
      hasPendingMessages: false,
      paymentNoticeError: "notice failed",
      publishedTokenTexts: ["cashu-token"],
      unpublishedTokenTexts: [],
    });
  });
});
