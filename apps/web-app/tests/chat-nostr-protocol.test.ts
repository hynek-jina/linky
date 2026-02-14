import { describe, expect, it } from "vitest";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
} from "../src/app/types/appTypes";
import {
  aggregateReactions,
  applyEditToMessage,
  applyReactionDeletes,
  extractDeleteReferencedIds,
  extractReplyContextFromTags,
} from "../src/app/hooks/messages/chatNostrProtocol";
import { dedupeNostrMessagesByPriority } from "../src/app/hooks/messages/messageHelpers";

const makeMessage = (
  id: string,
  overrides?: Partial<LocalNostrMessage>,
): LocalNostrMessage => ({
  id,
  contactId: "contact-1",
  content: `message-${id}`,
  createdAtSec: Number(id) || 1,
  direction: "in",
  pubkey: "pub-1",
  rumorId: `rumor-${id}`,
  wrapId: `wrap-${id}`,
  ...overrides,
});

const makeReaction = (
  id: string,
  overrides?: Partial<LocalNostrReaction>,
): LocalNostrReaction => ({
  id,
  messageId: "rumor-1",
  reactorPubkey: "pub-1",
  emoji: "👍",
  createdAtSec: Number(id) || 1,
  wrapId: `reaction-${id}`,
  ...overrides,
});

describe("extractReplyContextFromTags", () => {
  it("uses marked root/reply tags when present", () => {
    const ctx = extractReplyContextFromTags([
      ["e", "root-id", "", "root"],
      ["e", "reply-id", "", "reply"],
    ]);

    expect(ctx.rootMessageId).toBe("root-id");
    expect(ctx.replyToId).toBe("reply-id");
  });

  it("falls back to first/last e tags when marks are missing", () => {
    const ctx = extractReplyContextFromTags([
      ["e", "first-id"],
      ["e", "last-id"],
    ]);

    expect(ctx.rootMessageId).toBe("first-id");
    expect(ctx.replyToId).toBe("last-id");
  });
});

describe("applyEditToMessage", () => {
  it("keeps original content and marks edited metadata", () => {
    const next = applyEditToMessage(
      makeMessage("1", { content: "hello", originalContent: null }),
      "hello edited",
      200,
      "rumor-1",
    );

    expect(next.content).toBe("hello edited");
    expect(next.originalContent).toBe("hello");
    expect(next.isEdited).toBe(true);
    expect(next.editedAtSec).toBe(200);
    expect(next.editedFromId).toBe("rumor-1");
  });
});

describe("reactions", () => {
  it("aggregates counts and own highlight", () => {
    const chips = aggregateReactions(
      [
        makeReaction("1", { emoji: "👍", reactorPubkey: "me" }),
        makeReaction("2", { emoji: "👍", reactorPubkey: "other" }),
        makeReaction("3", { emoji: "❤️", reactorPubkey: "other" }),
      ],
      "me",
    );

    expect(chips).toEqual([
      { emoji: "👍", count: 2, reactedByMe: true },
      { emoji: "❤️", count: 1, reactedByMe: false },
    ]);
  });

  it("removes deleted reactions referenced by kind-5 e tags", () => {
    const deleteIds = extractDeleteReferencedIds([
      ["e", "reaction-2"],
      ["e", "reaction-3"],
    ]);
    const remaining = applyReactionDeletes(
      [
        makeReaction("1", { wrapId: "reaction-1" }),
        makeReaction("2", { wrapId: "reaction-2" }),
        makeReaction("3", { wrapId: "reaction-3" }),
      ],
      deleteIds,
    );

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.wrapId).toBe("reaction-1");
  });
});

describe("dedupeNostrMessagesByPriority", () => {
  it("prefers wrap-id identity over client-id and rumor fallback", () => {
    const deduped = dedupeNostrMessagesByPriority([
      makeMessage("1", {
        wrapId: "wrap-fixed",
        clientId: "client-fixed",
        rumorId: "rumor-fixed",
      }),
      makeMessage("2", {
        wrapId: "wrap-fixed",
        rumorId: "rumor-other",
      }),
      makeMessage("3", {
        wrapId: "wrap-other",
        clientId: "client-fixed",
        rumorId: "rumor-third",
      }),
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.wrapId).toBe("wrap-fixed");
    expect(deduped[0]?.clientId).toBe("client-fixed");
  });
});
