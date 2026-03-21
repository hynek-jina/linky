import { Schema } from "effect";
import { NostrPublicKeyHex } from "../../identity";
import { UnixTimeSeconds } from "../../utils/schemas";
import { NostrEventId } from "./NostrEvent";

export const ChatMessageId = NostrEventId.pipe(Schema.brand("ChatMessageId"));
export const ChatReactMessageId = NostrEventId.pipe(
  Schema.brand("ChatReactMessageId"),
);
export const ChatRemoveReactMessageId = NostrEventId.pipe(
  Schema.brand("ChatRemoveReactMessageId"),
);

export const ChatMessageDraft = Schema.Struct({
  createdAt: UnixTimeSeconds,
  content: Schema.NonEmptyString,
  recipients: Schema.Array(NostrPublicKeyHex).pipe(Schema.minItems(1)),
  replyToEventId: Schema.optional(NostrEventId),
  rootEventId: Schema.optional(NostrEventId),
});
export type ChatMessageDraft = typeof ChatMessageDraft.Type;

export const ChatMessage = Schema.Struct({
  id: ChatMessageId,
  authorPubkey: NostrPublicKeyHex,
  createdAt: UnixTimeSeconds,
  content: Schema.NonEmptyString,
  recipients: Schema.Array(NostrPublicKeyHex).pipe(Schema.minItems(1)),
  replyToEventId: Schema.optional(NostrEventId),
  rootEventId: Schema.optional(NostrEventId),
});
export type ChatMessage = typeof ChatMessage.Type;

export const ChatReactMessageDraft = Schema.Struct({
  createdAt: UnixTimeSeconds,
  recipients: Schema.Array(NostrPublicKeyHex).pipe(Schema.minItems(1)),
  targetMessageId: ChatMessageId,
  targetMessageAuthorPubkey: NostrPublicKeyHex,
  reaction: Schema.NonEmptyString,
});
export type ChatReactMessageDraft = typeof ChatReactMessageDraft.Type;

export const ChatReactMessage = Schema.Struct({
  id: ChatReactMessageId,
  authorPubkey: NostrPublicKeyHex,
  createdAt: UnixTimeSeconds,
  recipients: Schema.Array(NostrPublicKeyHex).pipe(Schema.minItems(1)),
  targetMessageId: ChatMessageId,
  targetMessageAuthorPubkey: NostrPublicKeyHex,
  reaction: Schema.NonEmptyString,
});
export type ChatReactMessage = typeof ChatReactMessage.Type;

export const ChatRemoveReactMessageDraft = Schema.Struct({
  createdAt: UnixTimeSeconds,
  recipients: Schema.Array(NostrPublicKeyHex).pipe(Schema.minItems(1)),
  targetMessageId: ChatMessageId,
  targetMessageAuthorPubkey: NostrPublicKeyHex,
  removedReactionIds: Schema.Array(ChatReactMessageId).pipe(Schema.minItems(1)),
});
export type ChatRemoveReactMessageDraft =
  typeof ChatRemoveReactMessageDraft.Type;

export const ChatRemoveReactMessage = Schema.Struct({
  id: ChatRemoveReactMessageId,
  authorPubkey: NostrPublicKeyHex,
  createdAt: UnixTimeSeconds,
  recipients: Schema.Array(NostrPublicKeyHex).pipe(Schema.minItems(1)),
  targetMessageId: ChatMessageId,
  targetMessageAuthorPubkey: NostrPublicKeyHex,
  removedReactionIds: Schema.Array(ChatReactMessageId).pipe(Schema.minItems(1)),
});
export type ChatRemoveReactMessage = typeof ChatRemoveReactMessage.Type;
