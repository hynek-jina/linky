import {
  finalizeEvent,
  getPublicKey,
  type Event as NostrToolsEvent,
  type UnsignedEvent,
} from "nostr-tools";
import { encrypt, getConversationKey } from "nostr-tools/nip44";
import { unwrapEvent, wrapEvent } from "nostr-tools/nip59";
import { describe, expect, it, vi } from "vitest";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import {
  createLinkyBankPaymentOfferEvent,
  LINKY_BANK_PAYMENT_OFFER_KIND,
} from "../../lib/bankPaymentOffer";
import { createLinkyPaymentNoticeEvent } from "../../lib/pushWrappedEvent";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
  NewLocalNostrMessage,
  NewLocalNostrReaction,
} from "../../types/appTypes";
import { buildUnknownContactId } from "./contactIdentity";
import { buildKnownNostrMessageIdentityIndex } from "./messageHelpers";
import {
  createNostrInboxSeenState,
  processNostrInboxWrap,
  resolveNostrInboxRelays,
  type NostrInboxDelivery,
  type NostrInboxPolicy,
} from "./nostrInboxPipeline";

const createSecretKey = (lastByte: number): Uint8Array => {
  const secretKey = new Uint8Array(32);
  secretKey[31] = lastByte;
  return secretKey;
};

const recipientPrivateKey = createSecretKey(2);
const recipientPubkey = getPublicKey(recipientPrivateKey);
const senderPrivateKey = createSecretKey(3);
const senderPubkey = getPublicKey(senderPrivateKey);
const otherPrivateKey = createSecretKey(4);
const otherPubkey = getPublicKey(otherPrivateKey);
const CONTACT_ID = "contact-1";
const RUMOR_ID = "a".repeat(64);
const REACTION_ID = "b".repeat(64);

const createMessageWrap = (
  content: string,
  extraTags: string[][] = [],
  kind = 14,
): NostrToolsEvent =>
  wrapEvent(
    {
      kind,
      created_at: 1_700_000_000,
      content,
      tags: [["p", recipientPubkey], ["p", senderPubkey], ...extraTags],
    },
    senderPrivateKey,
    recipientPubkey,
  );

const encryptJson = (
  value: unknown,
  privateKey: Uint8Array,
  publicKey: string,
): string =>
  encrypt(JSON.stringify(value), getConversationKey(privateKey, publicKey));

const createControlledWrap = (
  rumor: unknown,
  outerPrivateKey = createSecretKey(20),
): NostrToolsEvent => {
  const seal = finalizeEvent(
    {
      kind: 13,
      content: encryptJson(rumor, senderPrivateKey, recipientPubkey),
      created_at: 1_700_000_001,
      tags: [],
    },
    senderPrivateKey,
  );
  return finalizeEvent(
    {
      kind: 1059,
      content: encryptJson(seal, outerPrivateKey, recipientPubkey),
      created_at: 1_700_000_002,
      tags: [["p", recipientPubkey]],
    },
    outerPrivateKey,
  );
};

const validRumor = (
  overrides: Partial<UnsignedEvent & { id: string }> = {},
): UnsignedEvent & { id: string } => ({
  kind: 14,
  created_at: 1_700_000_000,
  content: "hello",
  pubkey: senderPubkey,
  tags: [
    ["p", recipientPubkey],
    ["p", senderPubkey],
  ],
  id: RUMOR_ID,
  ...overrides,
});

const buildCashuToken = (): string => {
  const payload = JSON.stringify({
    token: [
      {
        mint: "https://mint.example",
        proofs: [{ amount: 21, secret: "secret", C: "c", id: "keyset" }],
      },
    ],
  });
  return `cashuA${btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")}`;
};

interface HarnessOptions {
  blockedPubkeys?: readonly string[];
  handlesSpecialEvents?: boolean;
  identitySinceSec?: number | null;
  messages?: LocalNostrMessage[];
  ownsConversation?: NostrInboxPolicy["ownsConversation"];
  persistAppendedMessages?: boolean;
  persistAppendedReactions?: boolean;
  reactions?: LocalNostrReaction[];
  resolveConversation?: NostrInboxPolicy["resolveConversation"];
  resolveUnknownConversation?: NostrInboxPolicy["resolveUnknownConversation"];
}

const createHarness = (options: HarnessOptions = {}) => {
  const messages = options.messages ?? [];
  const reactions = options.reactions ?? [];
  const messageWrapIds = new Set(
    messages.map((message) => message.wrapId).filter(Boolean),
  );
  const reactionWrapIds = new Set(
    reactions.map((reaction) => reaction.wrapId).filter(Boolean),
  );
  const seen = createNostrInboxSeenState();
  const acknowledgements: {
    clientId: string | null;
    contactId: string;
    wrapId: string;
  }[] = [];
  const deletedReactionIds: string[][] = [];
  const blockedPubkeys = new Set(options.blockedPubkeys ?? []);
  const appendMessage = vi.fn((message: NewLocalNostrMessage): string => {
    const id = `message-${messages.length + 1}`;
    if (options.persistAppendedMessages !== false) {
      messages.push({ ...message, id, status: message.status ?? "sent" });
    }
    messageWrapIds.add(message.wrapId);
    return id;
  });
  const appendReaction = vi.fn((reaction: NewLocalNostrReaction): string => {
    const id = `reaction-${reactions.length + 1}`;
    if (options.persistAppendedReactions !== false) {
      reactions.push({ ...reaction, id, status: reaction.status ?? "sent" });
    }
    reactionWrapIds.add(reaction.wrapId);
    return id;
  });
  const updateMessage = vi.fn(
    (
      id: string,
      updates: Parameters<
        typeof processNostrInboxWrap
      >[0]["effects"]["updateMessage"] extends (
        id: string,
        updates: infer T,
      ) => void
        ? T
        : never,
    ) => {
      const message = messages.find((candidate) => candidate.id === id);
      if (message) Object.assign(message, updates);
      if (updates.wrapId) messageWrapIds.add(updates.wrapId);
    },
  );
  const updateReaction = vi.fn(
    (
      id: string,
      updates: Parameters<
        typeof processNostrInboxWrap
      >[0]["effects"]["updateReaction"] extends (
        id: string,
        updates: infer T,
      ) => void
        ? T
        : never,
    ) => {
      const reaction = reactions.find((candidate) => candidate.id === id);
      if (reaction) Object.assign(reaction, updates);
      if (updates.wrapId) reactionWrapIds.add(updates.wrapId);
    },
  );
  const deleteReactionsByWrapIds = vi.fn((wrapIds: readonly string[]) => {
    deletedReactionIds.push([...wrapIds]);
  });
  const resolveConversation =
    options.resolveConversation ??
    ((peerPubkey: string) =>
      peerPubkey === senderPubkey ? { contactId: CONTACT_ID } : null);
  const resolveUnknownConversation =
    options.resolveUnknownConversation ??
    ((peerPubkey: string) => {
      const contactId = buildUnknownContactId(peerPubkey);
      return contactId ? { contactId } : null;
    });

  const process = (
    wrap: NostrToolsEvent,
    delivery: NostrInboxDelivery = "live",
  ) =>
    processNostrInboxWrap({
      delivery,
      effects: {
        acknowledgeOutgoingMessage: (acknowledgement) => {
          acknowledgements.push(acknowledgement);
        },
        appendMessage,
        appendReaction,
        deleteReactionsByWrapIds,
        updateMessage,
        updateReaction,
      },
      identity: {
        identitySinceSec: options.identitySinceSec ?? null,
        privateKey: recipientPrivateKey,
        pubkey: recipientPubkey,
      },
      policy: {
        handlesSpecialEvents: options.handlesSpecialEvents ?? true,
        isBlockedIncomingPubkey: (pubkey) => blockedPubkeys.has(pubkey),
        isCancelled: () => false,
        ownsConversation: options.ownsConversation ?? (() => true),
        resolveConversation,
        resolveUnknownConversation,
      },
      seen,
      snapshot: {
        knownMessageIdentities: buildKnownNostrMessageIdentityIndex(messages),
        messageWrapIds,
        messages,
        reactionWrapIds,
        reactions,
      },
      unwrapEvent,
      wrap,
    });

  return {
    acknowledgements,
    appendMessage,
    appendReaction,
    deletedReactionIds,
    messages,
    process,
    reactions,
    seen,
    updateMessage,
    updateReaction,
  };
};

const createStoredMessage = (
  overrides: Partial<LocalNostrMessage> = {},
): LocalNostrMessage => ({
  contactId: CONTACT_ID,
  content: "original",
  createdAtSec: 1_699_999_999,
  direction: "in",
  id: "stored-message",
  pubkey: senderPubkey,
  rumorId: RUMOR_ID,
  status: "sent",
  wrapId: "c".repeat(64),
  ...overrides,
});

describe("resolveNostrInboxRelays", () => {
  it("normalizes configured relays and falls back to the defaults", () => {
    expect(
      resolveNostrInboxRelays([
        " wss://relay.example ",
        "invalid",
        "wss://relay.example",
      ]),
    ).toEqual(["wss://relay.example"]);
    expect(resolveNostrInboxRelays([])).toEqual(NOSTR_RELAYS);
    expect(resolveNostrInboxRelays(["invalid"])).toEqual(NOSTR_RELAYS);
  });
});

describe("message decoding and persistence", () => {
  it("persists a real kind-14 wrap with all message metadata", () => {
    const wrap = createMessageWrap("hello", [
      ["client", "client-1"],
      ["e", "d".repeat(64), "", "root"],
      ["e", "e".repeat(64), "", "reply"],
    ]);
    const rumor = unwrapEvent(wrap, recipientPrivateKey);
    const harness = createHarness();

    const outcome = harness.process(wrap);

    expect(outcome.kind).toBe("inserted-message");
    expect(harness.messages).toEqual([
      expect.objectContaining({
        clientId: "client-1",
        contactId: CONTACT_ID,
        content: "hello",
        createdAtSec: 1_700_000_000,
        direction: "in",
        pubkey: senderPubkey,
        replyToId: "e".repeat(64),
        rootMessageId: "d".repeat(64),
        rumorId: rumor.id,
        wrapId: wrap.id,
      }),
    ]);
  });

  it("persists valid kind-15 messages and accepts k=15 reactions", () => {
    const imageWrap = createMessageWrap(
      "https://cdn.example/image.enc",
      [
        ["file-type", "image/jpeg"],
        ["encryption-algorithm", "aes-gcm"],
        ["decryption-key", "1".repeat(64)],
        ["decryption-nonce", "2".repeat(24)],
        ["x", "3".repeat(64)],
        ["ox", "4".repeat(64)],
        ["size", "1234"],
        ["dim", "800x600"],
      ],
      15,
    );
    const imageRumor = unwrapEvent(imageWrap, recipientPrivateKey);
    const harness = createHarness();

    expect(harness.process(imageWrap).kind).toBe("inserted-message");
    expect(harness.messages[0]?.content).toMatch(/^linky:image:v1:/);

    const reactionWrap = wrapEvent(
      {
        kind: 7,
        created_at: 1_700_000_010,
        content: "👍",
        tags: [
          ["p", recipientPubkey],
          ["e", imageRumor.id],
          ["k", "15"],
        ],
      },
      senderPrivateKey,
      recipientPubkey,
    );
    expect(harness.process(reactionWrap).kind).toBe("inserted-reaction");
    expect(harness.reactions[0]).toEqual(
      expect.objectContaining({
        emoji: "👍",
        messageId: imageRumor.id,
        reactorPubkey: senderPubkey,
      }),
    );
  });

  it("persists backfill and live deliveries identically", () => {
    const backfillHarness = createHarness();
    const liveHarness = createHarness();
    const wrap = createMessageWrap("same");

    const backfill = backfillHarness.process(wrap, "backfill");
    const live = liveHarness.process(wrap, "live");

    expect(backfill.kind).toBe("inserted-message");
    expect(live.kind).toBe("inserted-message");
    expect(backfill.delivery).toBe("backfill");
    expect(live.delivery).toBe("live");
    expect(backfillHarness.messages).toEqual(liveHarness.messages);
  });

  it("deduplicates the same wrap and duplicate rumor/client identities", () => {
    const harness = createHarness();
    const wrap = createMessageWrap("once", [["client", "client-once"]]);
    const rumor = unwrapEvent(wrap, recipientPrivateKey);
    const duplicateWrap = createControlledWrap(rumor, createSecretKey(21));

    expect(harness.process(wrap).kind).toBe("inserted-message");
    expect(harness.process(wrap).kind).toBe("ignored");
    expect(harness.process(duplicateWrap).kind).toBe("ignored");
    expect(harness.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps repeated text with distinct client and rumor IDs", () => {
    const harness = createHarness();
    const first = createControlledWrap(
      validRumor({
        content: "ok",
        id: "d".repeat(64),
        tags: [
          ["p", recipientPubkey],
          ["p", senderPubkey],
          ["client", "client-1"],
        ],
      }),
    );
    const second = createControlledWrap(
      validRumor({
        content: "ok",
        id: "e".repeat(64),
        tags: [
          ["p", recipientPubkey],
          ["p", senderPubkey],
          ["client", "client-2"],
        ],
      }),
      createSecretKey(21),
    );

    expect(harness.process(first).kind).toBe("inserted-message");
    expect(harness.process(second).kind).toBe("inserted-message");
    expect(harness.messages).toHaveLength(2);
    expect(harness.messages.map((message) => message.rumorId)).toEqual([
      "d".repeat(64),
      "e".repeat(64),
    ]);
  });

  it("keeps repeated text with distinct rumor IDs and no client tags", () => {
    const harness = createHarness();
    const first = createControlledWrap(
      validRumor({ content: "ok", id: "d".repeat(64) }),
    );
    const second = createControlledWrap(
      validRumor({ content: "ok", id: "e".repeat(64) }),
      createSecretKey(21),
    );

    expect(harness.process(first).kind).toBe("inserted-message");
    expect(harness.process(second).kind).toBe("inserted-message");
    expect(harness.messages).toHaveLength(2);
    expect(harness.messages.map((message) => message.rumorId)).toEqual([
      "d".repeat(64),
      "e".repeat(64),
    ]);
  });

  it("requires incoming messages to address the recipient", () => {
    const wrap = wrapEvent(
      {
        kind: 14,
        created_at: 1_700_000_000,
        content: "not for you",
        tags: [["p", otherPubkey]],
      },
      senderPrivateKey,
      recipientPubkey,
    );
    const harness = createHarness();

    expect(harness.process(wrap).kind).toBe("ignored");
    expect(harness.messages).toHaveLength(0);
  });

  it("partitions active-contact scope without persisting another chat", () => {
    const harness = createHarness({
      ownsConversation: ({ contactId }) => contactId === "active-contact",
    });

    expect(harness.process(createMessageWrap("other chat")).kind).toBe(
      "ignored",
    );
    expect(harness.messages).toHaveLength(0);
  });

  it("resolves known and unknown peers and rejects blocked senders", () => {
    const known = createHarness();
    expect(known.process(createMessageWrap("known")).kind).toBe(
      "inserted-message",
    );
    expect(known.messages[0]?.contactId).toBe(CONTACT_ID);

    const unknownWrap = wrapEvent(
      {
        kind: 14,
        created_at: 1_700_000_000,
        content: "unknown",
        tags: [
          ["p", recipientPubkey],
          ["p", otherPubkey],
        ],
      },
      otherPrivateKey,
      recipientPubkey,
    );
    const unknown = createHarness();
    expect(unknown.process(unknownWrap).kind).toBe("inserted-message");
    expect(unknown.messages[0]?.contactId).toBe(
      buildUnknownContactId(otherPubkey),
    );

    const blocked = createHarness({ blockedPubkeys: [senderPubkey] });
    expect(blocked.process(createMessageWrap("blocked")).kind).toBe("ignored");
    expect(blocked.messages).toHaveLength(0);
  });

  it("prefers a known sender over an unknown multi-recipient p-tag", () => {
    const harness = createHarness({ blockedPubkeys: [otherPubkey] });
    const wrap = createControlledWrap(
      validRumor({
        tags: [
          ["p", recipientPubkey],
          ["p", otherPubkey],
          ["p", senderPubkey],
        ],
      }),
    );

    expect(harness.process(wrap).kind).toBe("inserted-message");
    expect(harness.messages[0]).toEqual(
      expect.objectContaining({
        contactId: CONTACT_ID,
        pubkey: senderPubkey,
      }),
    );
  });

  it("persists a message without a valid inner id with null rumorId", () => {
    const harness = createHarness();
    const wrap = createControlledWrap(validRumor({ id: "invalid" }));

    expect(harness.process(wrap).kind).toBe("inserted-message");
    expect(harness.messages[0]).toEqual(
      expect.objectContaining({ rumorId: null }),
    );
  });
});

describe("gift-wrap rejection rules", () => {
  it("rejects inner rumors that reuse the outer wrap pubkey", () => {
    const outerPrivateKey = createSecretKey(22);
    const wrap = createControlledWrap(
      validRumor({ pubkey: getPublicKey(outerPrivateKey) }),
      outerPrivateKey,
    );
    const harness = createHarness();

    expect(harness.process(wrap)).toMatchObject({
      kind: "ignored",
      reason: "outer-rumor-pubkey",
    });
    expect(harness.messages).toHaveLength(0);
  });

  it.each([
    ["sender", senderPrivateKey, senderPubkey],
    ["tagged peer", otherPrivateKey, otherPubkey],
    ["outer pubkey", createSecretKey(23), getPublicKey(createSecretKey(23))],
  ])("rejects nested NIP-44 content encrypted for the %s", (_, key, pubkey) => {
    const outerPrivateKey =
      pubkey === getPublicKey(createSecretKey(23))
        ? createSecretKey(23)
        : createSecretKey(24);
    const ciphertext = encrypt(
      "nested",
      getConversationKey(key, recipientPubkey),
    );
    const wrap = createControlledWrap(
      validRumor({
        content: ciphertext,
        tags: [
          ["p", recipientPubkey],
          ["p", pubkey],
        ],
      }),
      outerPrivateKey,
    );
    const harness = createHarness();

    expect(harness.process(wrap)).toMatchObject({
      kind: "ignored",
      reason: "nested-nip44",
    });
    expect(harness.messages).toHaveLength(0);
  });

  it("accepts plaintext that merely resembles encoded data", () => {
    const harness = createHarness();
    const wrap = createControlledWrap(
      validRumor({ content: "AgFub3QtcmVhbGx5LWVuY3J5cHRlZA==" }),
    );

    expect(harness.process(wrap).kind).toBe("inserted-message");
  });

  it.each([
    ["non-object", "not an object"],
    ["missing pubkey", { ...validRumor(), pubkey: undefined }],
    ["invalid pubkey", { ...validRumor(), pubkey: "bad" }],
    ["invalid tags", { ...validRumor(), tags: [["p", 1]] }],
    ["non-string content", { ...validRumor(), content: 123 }],
    ["invalid kind", { ...validRumor(), kind: Number.NaN }],
    ["invalid timestamp", { ...validRumor(), created_at: Number.NaN }],
  ])("rejects malformed decrypted values: %s", (_, rumor) => {
    const harness = createHarness();
    const outcome = harness.process(createControlledWrap(rumor));

    expect(outcome.kind).toBe("ignored");
    expect(harness.messages).toHaveLength(0);
  });

  it("rejects invalid outer metadata before unwrapping", () => {
    const valid = createMessageWrap("hello");
    const withoutRecipient = { ...valid, tags: [] };
    const invalidId = { ...valid, id: "bad" };
    const harness = createHarness();

    expect(harness.process(withoutRecipient)).toMatchObject({
      kind: "ignored",
      reason: "invalid-wrap",
    });
    expect(createHarness().process(invalidId)).toMatchObject({
      kind: "ignored",
      reason: "invalid-wrap",
    });
  });

  it("applies identity cutoffs and ignores unsupported rumor kinds", () => {
    const cutoffHarness = createHarness({ identitySinceSec: 1_700_000_001 });
    expect(cutoffHarness.process(createMessageWrap("old"))).toMatchObject({
      kind: "ignored",
      reason: "identity-cutoff",
    });

    const unsupportedHarness = createHarness();
    const unsupported = wrapEvent(
      {
        kind: 42,
        created_at: 1_700_000_000,
        content: "unsupported",
        tags: [["p", recipientPubkey]],
      },
      senderPrivateKey,
      recipientPubkey,
    );
    expect(unsupportedHarness.process(unsupported)).toMatchObject({
      kind: "ignored",
      reason: "unsupported-kind",
    });
    expect(unsupportedHarness.messages).toHaveLength(0);
  });
});

describe("message reconciliation and edits", () => {
  it("reconciles a pending outgoing row by client ID and acknowledges once", () => {
    const pending = createStoredMessage({
      clientId: "pending-client",
      content: "pay",
      direction: "out",
      pubkey: recipientPubkey,
      rumorId: null,
      status: "pending",
      wrapId: "pending:1",
    });
    const harness = createHarness({
      messages: [pending],
      resolveConversation: (peerPubkey) =>
        peerPubkey === senderPubkey ? { contactId: CONTACT_ID } : null,
    });
    const wrap = wrapEvent(
      {
        kind: 14,
        created_at: 1_700_000_000,
        content: "pay",
        tags: [
          ["p", senderPubkey],
          ["client", "pending-client"],
        ],
      },
      recipientPrivateKey,
      recipientPubkey,
    );

    expect(harness.process(wrap).kind).toBe("reconciled-message");
    expect(harness.messages).toHaveLength(1);
    expect(pending).toEqual(
      expect.objectContaining({ status: "sent", wrapId: wrap.id }),
    );
    expect(harness.acknowledgements).toEqual([
      {
        clientId: "pending-client",
        contactId: CONTACT_ID,
        wrapId: wrap.id,
      },
    ]);
  });

  it("reconciles a pending outgoing row by rumor ID without a client tag", () => {
    const wrap = wrapEvent(
      {
        kind: 14,
        created_at: 1_700_000_000,
        content: "pay",
        tags: [["p", senderPubkey]],
      },
      recipientPrivateKey,
      recipientPubkey,
    );
    const rumor = unwrapEvent(wrap, recipientPrivateKey);
    const pending = createStoredMessage({
      content: "pay",
      direction: "out",
      pubkey: recipientPubkey,
      rumorId: rumor.id,
      status: "pending",
      wrapId: "pending:2",
    });
    const harness = createHarness({
      messages: [pending],
      resolveConversation: () => ({ contactId: CONTACT_ID }),
    });

    expect(harness.process(wrap).kind).toBe("reconciled-message");
    expect(harness.messages).toHaveLength(1);
    expect(harness.acknowledgements).toHaveLength(1);
  });

  it("does not content-match a pending row when client IDs differ", () => {
    const pending = createStoredMessage({
      clientId: "old-client",
      content: "pay",
      direction: "out",
      pubkey: recipientPubkey,
      rumorId: null,
      status: "pending",
      wrapId: "pending:3",
    });
    const harness = createHarness({
      messages: [pending],
      resolveConversation: () => ({ contactId: CONTACT_ID }),
    });
    const wrap = wrapEvent(
      {
        kind: 14,
        created_at: 1_700_000_000,
        content: "pay",
        tags: [
          ["p", senderPubkey],
          ["client", "new-client"],
        ],
      },
      recipientPrivateKey,
      recipientPubkey,
    );

    expect(harness.process(wrap).kind).toBe("inserted-message");
    expect(harness.messages).toHaveLength(2);
    expect(pending).toEqual(
      expect.objectContaining({
        clientId: "old-client",
        rumorId: null,
        status: "pending",
        wrapId: "pending:3",
      }),
    );
    expect(harness.acknowledgements).toHaveLength(0);
  });

  it("applies edits while retaining the stable original rumor identity", () => {
    const original = createStoredMessage();
    const harness = createHarness({ messages: [original] });
    const editWrap = createMessageWrap("edited", [
      ["edited_from", RUMOR_ID],
      ["client", "edit-client"],
    ]);

    expect(harness.process(editWrap).kind).toBe("edited-message");
    expect(original).toEqual(
      expect.objectContaining({
        content: "edited",
        editedFromId: RUMOR_ID,
        isEdited: true,
        originalContent: "original",
        rumorId: RUMOR_ID,
      }),
    );
  });

  it("backfills missing original content after an edit arrives first", () => {
    const edited = createStoredMessage({
      content: "edited",
      editedFromId: RUMOR_ID,
      isEdited: true,
      originalContent: null,
      rumorId: RUMOR_ID,
    });
    const harness = createHarness({ messages: [edited] });
    const originalWrap = createControlledWrap(validRumor());

    expect(harness.process(originalWrap).kind).toBe("backfilled-original");
    expect(edited.content).toBe("edited");
    expect(edited.originalContent).toBe("hello");
  });
});

describe("reaction persistence", () => {
  const createReactionWrap = (
    emoji: string,
    kindTag: string,
    createdAt = 1_700_000_010,
    clientId?: string,
  ): NostrToolsEvent =>
    wrapEvent(
      {
        kind: 7,
        created_at: createdAt,
        content: emoji,
        tags: [
          ["p", recipientPubkey],
          ["e", RUMOR_ID],
          ["k", kindTag],
          ...(clientId ? [["client", clientId]] : []),
        ],
      },
      senderPrivateKey,
      recipientPubkey,
    );

  it.each(["14", "15"])("persists reactions with k=%s", (kindTag) => {
    const harness = createHarness({ messages: [createStoredMessage()] });
    expect(harness.process(createReactionWrap("👍", kindTag)).kind).toBe(
      "inserted-reaction",
    );
    expect(harness.reactions).toHaveLength(1);
  });

  it("uses the outer wrap id when a reaction has no inner id", () => {
    const harness = createHarness({ messages: [createStoredMessage()] });
    const wrap = createControlledWrap({
      ...validRumor({
        content: "👍",
        kind: 7,
        tags: [
          ["p", recipientPubkey],
          ["e", RUMOR_ID],
          ["k", "14"],
        ],
      }),
      id: undefined,
    });

    expect(harness.process(wrap).kind).toBe("inserted-reaction");
    expect(harness.reactions[0]?.wrapId).toBe(wrap.id);
  });

  it("ignores unsupported k tags", () => {
    const harness = createHarness({ messages: [createStoredMessage()] });
    expect(harness.process(createReactionWrap("👍", "1"))).toMatchObject({
      kind: "ignored",
      reason: "unsupported-reaction-kind",
    });
    expect(harness.reactions).toHaveLength(0);
  });

  it("reconciles pending reactions by client ID", () => {
    const pending: LocalNostrReaction = {
      clientId: "reaction-client",
      createdAtSec: 1_700_000_000,
      emoji: "👍",
      id: "pending-reaction",
      messageId: RUMOR_ID,
      reactorPubkey: senderPubkey,
      status: "pending",
      wrapId: "pending:reaction",
    };
    const harness = createHarness({
      messages: [createStoredMessage()],
      reactions: [pending],
    });
    const wrap = createReactionWrap(
      "👍",
      "14",
      1_700_000_010,
      pending.clientId,
    );

    expect(harness.process(wrap).kind).toBe("reconciled-reaction");
    expect(harness.reactions).toHaveLength(1);
    expect(pending.status).toBe("sent");
    expect(pending.wrapId).toBe(unwrapEvent(wrap, recipientPrivateKey).id);
  });

  it("suppresses duplicate reaction identity across different rumor IDs", () => {
    const harness = createHarness({ messages: [createStoredMessage()] });
    const first = createReactionWrap("👍", "14", 1_700_000_010);
    const second = createReactionWrap("👍", "14", 1_700_000_011);

    expect(harness.process(first).kind).toBe("inserted-reaction");
    expect(harness.process(second).kind).toBe("ignored");
    expect(harness.reactions).toHaveLength(1);
  });

  it("deletes all unique referenced reaction IDs", () => {
    const reactionOne = createStoredMessage({
      id: "message-for-reaction",
    });
    const reactions: LocalNostrReaction[] = [
      {
        createdAtSec: 1,
        emoji: "👍",
        id: "reaction-one",
        messageId: RUMOR_ID,
        reactorPubkey: senderPubkey,
        wrapId: REACTION_ID,
      },
      {
        createdAtSec: 2,
        emoji: "❤️",
        id: "reaction-two",
        messageId: RUMOR_ID,
        reactorPubkey: senderPubkey,
        wrapId: "c".repeat(64),
      },
    ];
    const harness = createHarness({
      messages: [reactionOne],
      reactions,
    });
    const deleteWrap = wrapEvent(
      {
        kind: 5,
        created_at: 1_700_000_020,
        content: "",
        tags: [
          ["p", recipientPubkey],
          ["e", REACTION_ID],
          ["e", REACTION_ID],
          ["e", "c".repeat(64)],
        ],
      },
      senderPrivateKey,
      recipientPubkey,
    );

    expect(harness.process(deleteWrap).kind).toBe("deleted-reactions");
    expect(harness.deletedReactionIds).toEqual([[REACTION_ID, "c".repeat(64)]]);
  });

  it("does not delete reactions authored by another participant", () => {
    const harness = createHarness({
      messages: [createStoredMessage()],
      reactions: [
        {
          createdAtSec: 1,
          emoji: "👍",
          id: "reaction-one",
          messageId: RUMOR_ID,
          reactorPubkey: senderPubkey,
          wrapId: REACTION_ID,
        },
      ],
    });
    const deleteWrap = wrapEvent(
      {
        kind: 5,
        created_at: 1_700_000_020,
        content: "",
        tags: [
          ["p", recipientPubkey],
          ["e", REACTION_ID],
        ],
      },
      otherPrivateKey,
      recipientPubkey,
    );

    expect(harness.process(deleteWrap)).toMatchObject({
      kind: "ignored",
      reason: "unknown-reaction-delete",
    });
    expect(harness.deletedReactionIds).toHaveLength(0);
  });

  it("accepts the same reaction again after its author deletes it", () => {
    const harness = createHarness({
      messages: [createStoredMessage()],
      persistAppendedReactions: false,
    });
    const first = createReactionWrap("👍", "14", 1_700_000_010);

    expect(harness.process(first).kind).toBe("inserted-reaction");
    const firstRumor = unwrapEvent(first, recipientPrivateKey);
    const deleteWrap = wrapEvent(
      {
        kind: 5,
        created_at: 1_700_000_020,
        content: "",
        tags: [
          ["p", recipientPubkey],
          ["e", firstRumor.id],
        ],
      },
      senderPrivateKey,
      recipientPubkey,
    );
    expect(harness.process(deleteWrap).kind).toBe("deleted-reactions");

    const second = createReactionWrap("👍", "14", 1_700_000_030);
    expect(harness.process(second).kind).toBe("inserted-reaction");
    expect(harness.appendReaction).toHaveBeenCalledTimes(2);
  });

  it("retries a reaction that arrives before its referenced message", () => {
    const harness = createHarness({ persistAppendedMessages: false });
    const reaction = createReactionWrap("👍", "14");

    expect(harness.process(reaction)).toMatchObject({
      kind: "ignored",
      reason: "unknown-message",
    });
    expect(harness.appendReaction).not.toHaveBeenCalled();

    expect(
      harness.process(createControlledWrap(validRumor()), "backfill").kind,
    ).toBe("inserted-message");
    expect(harness.appendReaction).toHaveBeenCalledTimes(1);
    expect(harness.reactions[0]).toEqual(
      expect.objectContaining({
        emoji: "👍",
        messageId: RUMOR_ID,
        reactorPubkey: senderPubkey,
      }),
    );
  });

  it("does not retry a deferred reaction deleted before its message arrives", () => {
    const harness = createHarness({ persistAppendedMessages: false });
    const reaction = createReactionWrap("👍", "14");

    expect(harness.process(reaction)).toMatchObject({
      kind: "ignored",
      reason: "unknown-message",
    });
    const reactionRumor = unwrapEvent(reaction, recipientPrivateKey);
    const deleteWrap = wrapEvent(
      {
        kind: 5,
        created_at: 1_700_000_020,
        content: "",
        tags: [
          ["p", recipientPubkey],
          ["e", reactionRumor.id],
        ],
      },
      senderPrivateKey,
      recipientPubkey,
    );

    expect(harness.process(deleteWrap).kind).toBe("deleted-reactions");
    expect(
      harness.process(createControlledWrap(validRumor()), "backfill").kind,
    ).toBe("inserted-message");
    expect(harness.appendReaction).not.toHaveBeenCalled();
    expect(harness.seen.deferredReactions).toHaveLength(0);
  });
});

describe("payment and bank-offer classification", () => {
  it("stores a Cashu message byte-for-byte once", () => {
    const cashuToken = buildCashuToken();
    const harness = createHarness();
    const wrap = createMessageWrap(cashuToken);

    const outcome = harness.process(wrap);

    expect(outcome).toMatchObject({
      direction: "in",
      isCashuMessage: true,
      kind: "inserted-message",
    });
    expect(harness.messages[0]?.content).toBe(cashuToken);
    expect(harness.process(wrap).kind).toBe("ignored");
    expect(harness.messages).toHaveLength(1);
  });

  it("classifies payment notices without appending chat messages", () => {
    const noticeEvent = createLinkyPaymentNoticeEvent({
      clientId: "notice-client",
      createdAt: 1_700_000_000,
      recipientPublicKey: recipientPubkey,
      senderPublicKey: senderPubkey,
    });
    const wrap = wrapEvent(noticeEvent, senderPrivateKey, recipientPubkey);
    const harness = createHarness();
    let notificationCount = 0;

    const backfill = harness.process(wrap, "backfill");
    if (backfill.kind === "payment-notice" && backfill.delivery === "live") {
      notificationCount += 1;
    }
    const duplicate = harness.process(wrap, "live");
    if (duplicate.kind === "payment-notice" && duplicate.delivery === "live") {
      notificationCount += 1;
    }

    expect(backfill.kind).toBe("payment-notice");
    expect(duplicate.kind).toBe("ignored");
    expect(notificationCount).toBe(0);
    expect(harness.messages).toHaveLength(0);
  });

  it("reconciles outgoing Cashu pending rows without duplicating them", () => {
    const cashuToken = buildCashuToken();
    const pending = createStoredMessage({
      clientId: "cashu-client",
      content: cashuToken,
      direction: "out",
      pubkey: recipientPubkey,
      rumorId: null,
      status: "pending",
      wrapId: "pending:cashu",
    });
    const harness = createHarness({
      messages: [pending],
      resolveConversation: () => ({ contactId: CONTACT_ID }),
    });
    const wrap = wrapEvent(
      {
        kind: 14,
        created_at: 1_700_000_000,
        content: cashuToken,
        tags: [
          ["p", senderPubkey],
          ["client", "cashu-client"],
        ],
      },
      recipientPrivateKey,
      recipientPubkey,
    );

    expect(harness.process(wrap).kind).toBe("reconciled-message");
    expect(harness.messages).toHaveLength(1);
    expect(pending.status).toBe("sent");
  });

  it.each(["offered", "declined"])(
    "routes %s bank-payment offers only through the special outcome",
    (status) => {
      const event = createLinkyBankPaymentOfferEvent({
        amountText: "100 sat",
        clientId: `offer-${status}`,
        createdAt: 1_700_000_000,
        offerId: `offer-${status}`,
        recipientPublicKey: recipientPubkey,
        senderPublicKey: senderPubkey,
        status: status === "declined" ? "declined" : "offered",
      });
      expect(event.kind).toBe(LINKY_BANK_PAYMENT_OFFER_KIND);
      const harness = createHarness();
      const outcome = harness.process(
        wrapEvent(event, senderPrivateKey, recipientPubkey),
      );

      expect(outcome.kind).toBe("bank-payment-offer");
      if (outcome.kind === "bank-payment-offer") {
        expect(outcome.offererPubkey).toBe(senderPubkey);
      }
      expect(harness.messages).toHaveLength(0);
    },
  );
});
