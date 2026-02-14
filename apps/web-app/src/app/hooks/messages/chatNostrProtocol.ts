import type {
  ChatReactionChip,
  LocalNostrMessage,
  LocalNostrReaction,
} from "../../types/appTypes";

type NostrTag = readonly string[];

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const readTagValue = (tag: readonly string[], index: number): string =>
  normalizeText(tag[index]);

const getTags = (tags: unknown): NostrTag[] => {
  if (!Array.isArray(tags)) return [];
  const parsed: NostrTag[] = [];
  for (const tag of tags) {
    if (!Array.isArray(tag)) continue;
    const next = tag.map((part) => String(part ?? ""));
    parsed.push(next);
  }
  return parsed;
};

export const extractClientTag = (tags: unknown): string | null => {
  for (const tag of getTags(tags)) {
    if (tag[0] !== "client") continue;
    const value = readTagValue(tag, 1);
    if (value) return value;
  }
  return null;
};

export const extractReplyContextFromTags = (
  tags: unknown,
): {
  replyToId: string | null;
  rootMessageId: string | null;
} => {
  const eTags = getTags(tags).filter((tag) => tag[0] === "e");
  if (eTags.length === 0) return { replyToId: null, rootMessageId: null };

  let rootMessageId: string | null = null;
  let replyToId: string | null = null;
  let firstId: string | null = null;
  let lastId: string | null = null;

  for (const tag of eTags) {
    const messageId = readTagValue(tag, 1);
    if (!messageId) continue;
    if (!firstId) firstId = messageId;
    lastId = messageId;

    const marker = readTagValue(tag, 3).toLowerCase();
    if (marker === "root" && !rootMessageId) rootMessageId = messageId;
    if (marker === "reply" && !replyToId) replyToId = messageId;
  }

  if (!replyToId && lastId) replyToId = eTags.length > 1 ? lastId : null;
  if (!rootMessageId && firstId) rootMessageId = firstId;
  if (replyToId && !rootMessageId) rootMessageId = replyToId;

  return { replyToId, rootMessageId };
};

export const extractEditedFromTag = (tags: unknown): string | null => {
  for (const tag of getTags(tags)) {
    if (tag[0] !== "edited_from") continue;
    const messageId = readTagValue(tag, 1);
    if (messageId) return messageId;
  }
  return null;
};

export const extractDeleteReferencedIds = (tags: unknown): string[] => {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const tag of getTags(tags)) {
    if (tag[0] !== "e") continue;
    const id = readTagValue(tag, 1);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

export const applyEditToMessage = (
  message: LocalNostrMessage,
  nextContent: string,
  editedAtSec: number,
  editedFromId: string,
): LocalNostrMessage => {
  const currentOriginal = normalizeText(message.originalContent);
  const currentContent = String(message.content ?? "");
  const originalContent = currentOriginal || currentContent || null;

  return {
    ...message,
    content: nextContent,
    isEdited: true,
    editedAtSec,
    editedFromId,
    originalContent,
  };
};

export const aggregateReactions = (
  reactions: readonly LocalNostrReaction[],
  ownPubkey: string | null,
): ChatReactionChip[] => {
  const own = normalizeText(ownPubkey);

  // One reaction per user: keep only the latest reaction per reactor
  const latestByUser = new Map<string, LocalNostrReaction>();
  for (const reaction of reactions) {
    const reactor = normalizeText(reaction.reactorPubkey);
    if (!reactor) continue;
    const prev = latestByUser.get(reactor);
    if (!prev || reaction.createdAtSec > prev.createdAtSec) {
      latestByUser.set(reactor, reaction);
    }
  }

  const buckets = new Map<
    string,
    {
      count: number;
      reactedByMe: boolean;
    }
  >();

  for (const reaction of latestByUser.values()) {
    const emoji = normalizeText(reaction.emoji);
    const reactor = normalizeText(reaction.reactorPubkey);
    if (!emoji || !reactor) continue;

    const bucket = buckets.get(emoji) ?? {
      count: 0,
      reactedByMe: false,
    };
    bucket.count += 1;
    if (own && reactor === own) bucket.reactedByMe = true;
    buckets.set(emoji, bucket);
  }

  return [...buckets.entries()]
    .map(([emoji, value]) => ({
      emoji,
      count: value.count,
      reactedByMe: value.reactedByMe,
    }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
};

export const applyReactionDeletes = (
  reactions: readonly LocalNostrReaction[],
  deletedReactionIds: readonly string[],
): LocalNostrReaction[] => {
  const deleted = new Set(
    deletedReactionIds.map((id) => normalizeText(id)).filter(Boolean),
  );
  if (deleted.size === 0) return [...reactions];

  return reactions.filter(
    (reaction) => !deleted.has(normalizeText(reaction.wrapId)),
  );
};
