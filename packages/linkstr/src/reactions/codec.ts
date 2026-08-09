import { Either, Schema } from "effect";
import { getEventHash } from "nostr-tools";
import { ClientId, RumorId } from "../domain/primitives";
import type { Pubkey, UnixSeconds } from "../domain/primitives";
import { firstTagValue, Rumor, tagValues } from "../internal/nostrEvent";
import type { NostrTags } from "../internal/nostrEvent";
import { Emoji } from "./domain";
import type { ReactionDraft, RetractionDraft, TargetKind } from "./domain";
import {
  OwnReactionConfirmed,
  ReactionAdded,
  ReactionRetracted,
} from "./events";
import type { DropReason, ReactionInboxEvent } from "./events";

export const REACTION_KIND = 7;
export const RETRACTION_KIND = 5;

const targetKindTag: Record<TargetKind, "14" | "15"> = {
  text: "14",
  image: "15",
};

const isRumorId = Schema.is(RumorId);
const isClientId = Schema.is(ClientId);
const isEmoji = Schema.is(Emoji);

const rumorWithHash = (fields: {
  pubkey: Pubkey;
  created_at: UnixSeconds;
  kind: number;
  tags: NostrTags;
  content: string;
}): Rumor => new Rumor({ ...fields, id: getEventHash(fields) });

export const encodeReactionRumor = (
  draft: ReactionDraft,
  author: Pubkey,
  sentAt: UnixSeconds,
  clientId: ClientId,
): Rumor =>
  rumorWithHash({
    pubkey: author,
    created_at: sentAt,
    kind: REACTION_KIND,
    tags: [
      ["p", draft.targetAuthor],
      ["p", draft.to],
      ["p", author],
      ["e", draft.target],
      ["k", targetKindTag[draft.targetKind]],
      ["client", clientId],
    ],
    content: draft.emoji,
  });

export const encodeRetractionRumor = (
  draft: RetractionDraft,
  author: Pubkey,
  sentAt: UnixSeconds,
  clientId: ClientId,
): Rumor =>
  rumorWithHash({
    pubkey: author,
    created_at: sentAt,
    kind: RETRACTION_KIND,
    tags: [
      ["p", draft.to],
      ["p", author],
      ...draft.reactionIds.map(
        (reactionId): Array<string> => ["e", reactionId],
      ),
      ["client", clientId],
    ],
    content: "",
  });

const decodeAddedOrConfirmed = (
  rumor: Rumor,
  me: Pubkey,
): Either.Either<ReactionInboxEvent, DropReason> => {
  const target = firstTagValue(rumor.tags, "e");
  if (target === null || !isRumorId(target)) {
    return Either.left("invalid-reaction");
  }
  // Reactions to anything but chat messages are foreign to Linky.
  const kindTag = firstTagValue(rumor.tags, "k");
  if (kindTag !== null && kindTag !== "14" && kindTag !== "15") {
    return Either.left("invalid-reaction");
  }
  const reactionId = rumor.id;
  if (!isRumorId(reactionId)) return Either.left("invalid-reaction");
  const emoji = rumor.content.trim();
  if (!isEmoji(emoji)) return Either.left("invalid-reaction");

  if (rumor.pubkey === me) {
    const clientTag = firstTagValue(rumor.tags, "client");
    return Either.right(
      new OwnReactionConfirmed({
        reactionId,
        target,
        emoji,
        clientId:
          clientTag !== null && isClientId(clientTag) ? clientTag : null,
        sentAt: rumor.created_at,
      }),
    );
  }

  return Either.right(
    new ReactionAdded({
      reactionId,
      target,
      from: rumor.pubkey,
      emoji,
      sentAt: rumor.created_at,
    }),
  );
};

const decodeRetracted = (
  rumor: Rumor,
): Either.Either<ReactionInboxEvent, DropReason> => {
  const [head, ...tail] = tagValues(rumor.tags, "e").filter(isRumorId);
  if (head === undefined) return Either.left("invalid-retraction");
  return Either.right(
    new ReactionRetracted({
      reactionIds: [head, ...tail],
      from: rumor.pubkey,
      sentAt: rumor.created_at,
    }),
  );
};

export const decodeReactionRumor = (
  rumor: Rumor,
  me: Pubkey,
): Either.Either<ReactionInboxEvent, DropReason> => {
  switch (rumor.kind) {
    case REACTION_KIND:
      return decodeAddedOrConfirmed(rumor, me);
    case RETRACTION_KIND:
      return decodeRetracted(rumor);
    default:
      return Either.left("unsupported-kind");
  }
};
