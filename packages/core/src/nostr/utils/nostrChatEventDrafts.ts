import { Schema } from "effect";
import type { NostrPublicKeyHex } from "../../identity";
import type {
  ChatMessageDraft,
  ChatReactMessageDraft,
  ChatRemoveReactMessageDraft,
} from "../domain/ChatMessage";
import type { NostrEventDraft } from "../domain/NostrEvent";
import { NostrTag } from "../domain/NostrTag";

const decodeTag = Schema.decodeUnknownSync(NostrTag);

const createTag = (
  name: string,
  value: string,
  ...extra: string[]
): ReturnType<typeof decodeTag> => decodeTag([name, value, ...extra]);

const dedupePublicKeys = (
  publicKeys: ReadonlyArray<NostrPublicKeyHex>,
): NostrPublicKeyHex[] => {
  const seen = new Set<string>();
  const unique: NostrPublicKeyHex[] = [];

  for (const publicKey of publicKeys) {
    if (seen.has(publicKey)) continue;
    seen.add(publicKey);
    unique.push(publicKey);
  }

  return unique;
};

const createRecipientTags = (
  recipients: ReadonlyArray<NostrPublicKeyHex>,
): ReadonlyArray<ReturnType<typeof decodeTag>> =>
  dedupePublicKeys(recipients).map((recipient) => createTag("p", recipient));

export const makeChatMessageEventDraft = (
  message: ChatMessageDraft,
): NostrEventDraft => ({
  content: message.content,
  created_at: message.createdAt,
  kind: 14,
  tags: [
    ...createRecipientTags(message.recipients),
    ...(message.rootEventId
      ? [createTag("e", message.rootEventId, "", "root")]
      : []),
    ...(message.replyToEventId
      ? [createTag("e", message.replyToEventId, "", "reply")]
      : []),
  ],
});

export const makeChatMessageReactionEventDraft = (
  reaction: ChatReactMessageDraft,
): NostrEventDraft => ({
  content: reaction.reaction,
  created_at: reaction.createdAt,
  kind: 7,
  tags: [
    ...createRecipientTags([
      reaction.targetMessageAuthorPubkey,
      ...reaction.recipients,
    ]),
    createTag("e", reaction.targetMessageId),
    createTag("k", "14"),
  ],
});

export const makeCancelChatMessageReactionEventDraft = (
  reactionCancellation: ChatRemoveReactMessageDraft,
): NostrEventDraft => ({
  content: "",
  created_at: reactionCancellation.createdAt,
  kind: 5,
  tags: [
    ...createRecipientTags([
      reactionCancellation.targetMessageAuthorPubkey,
      ...reactionCancellation.recipients,
    ]),
    ...reactionCancellation.removedReactionIds.map((reactionId) =>
      createTag("e", reactionId),
    ),
  ],
});
