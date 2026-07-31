import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { normalizeRelayUrls } from "../../../utils/nostrRelays";
import {
  isLinkyBankPaymentOfferEvent,
  getLinkyBankPaymentOfferInfo,
} from "../../lib/bankPaymentOffer";
import { isCashuNotificationMessage } from "../../lib/cashuNotificationCopy";
import { privateImageMessageFromEvent } from "../../lib/privateImageMessage";
import { isLinkyPaymentNoticeEvent } from "../../lib/pushWrappedEvent";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
  NewLocalNostrMessage,
  NewLocalNostrReaction,
  UpdateLocalNostrMessage,
  UpdateLocalNostrReaction,
} from "../../types/appTypes";
import {
  extractClientTag,
  extractDeleteReferencedIds,
  extractEditedFromTag,
  extractReplyContextFromTags,
  isInvalidInnerRumorPubkey,
  isNestedEncryptedNip44PayloadForAnyPubkey,
  resolveStableMessageRumorId,
} from "./chatNostrProtocol";
import { normalizePubkeyHex } from "./contactIdentity";
import type { KnownNostrMessageIdentityIndex } from "./messageHelpers";
import { hasKnownNostrMessageIdentity } from "./messageHelpers";

const HEX_EVENT_ID_RE = /^[a-f0-9]{64}$/;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const isEventId = (value: unknown): value is string =>
  typeof value === "string" && HEX_EVENT_ID_RE.test(value.trim().toLowerCase());

const isNostrTags = (value: unknown): value is string[][] =>
  Array.isArray(value) &&
  value.every(
    (tag) =>
      Array.isArray(tag) && tag.every((part) => typeof part === "string"),
  );

export interface DecodedNostrInboxRumor extends UnsignedEvent {
  id?: string;
}

const isDecodedNostrInboxRumor = (
  value: unknown,
): value is DecodedNostrInboxRumor => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("kind" in value) || !Number.isFinite(value.kind)) return false;
  if (!("created_at" in value) || !Number.isFinite(value.created_at)) {
    return false;
  }
  if (!("content" in value) || typeof value.content !== "string") return false;
  if (!("pubkey" in value) || !normalizePubkeyHex(value.pubkey)) return false;
  if (!("tags" in value) || !isNostrTags(value.tags)) return false;
  if ("id" in value && value.id !== undefined && typeof value.id !== "string") {
    return false;
  }
  return true;
};

const hasValidOuterWrap = (
  wrap: NostrToolsEvent,
  recipientPubkey: string,
): boolean => {
  if (wrap.kind !== 1059) return false;
  if (!isEventId(wrap.id)) return false;
  if (!normalizePubkeyHex(wrap.pubkey)) return false;
  if (!isNostrTags(wrap.tags)) return false;
  if (typeof wrap.content !== "string" || !wrap.content) return false;
  return wrap.tags.some(
    (tag) =>
      tag[0] === "p" &&
      normalizePubkeyHex(tag[1]) === normalizePubkeyHex(recipientPubkey),
  );
};

const readTagValues = (tags: readonly string[][], tagName: string): string[] =>
  tags
    .filter((tag) => tag[0] === tagName)
    .map((tag) => normalizeText(tag[1]))
    .filter(Boolean);

export const resolveNostrInboxRelays = (
  relays: readonly string[],
): string[] => {
  const normalized = normalizeRelayUrls(relays);
  return normalized.length > 0 ? normalized : [...NOSTR_RELAYS];
};

export type NostrInboxDelivery = "backfill" | "live";

interface DeferredNostrInboxReaction {
  delivery: NostrInboxDelivery;
  reactionId: string;
  reactorPubkey: string;
  wrap: NostrToolsEvent;
}

interface NostrInboxMessageReference {
  contactId: string;
  // Persisted rows store the stable rumor id, so reactions resolved through
  // this reference must join on it rather than the raw e-tag value.
  messageRumorId: string;
  pubkey: string;
}

interface NostrInboxReactionReference {
  emoji: string;
  messageId: string;
  reactorPubkey: string;
  wrapId: string;
}

export interface NostrInboxSeenState {
  deferredReactions: Map<string, DeferredNostrInboxReaction>;
  deletedReactionWrapIds: Set<string>;
  messageIdentities: Set<string>;
  messageReferences: Map<string, NostrInboxMessageReference>;
  reactionIdentities: Set<string>;
  reactionReferences: Map<string, NostrInboxReactionReference>;
  wrapIds: Set<string>;
}

export const createNostrInboxSeenState = (): NostrInboxSeenState => ({
  deferredReactions: new Map(),
  deletedReactionWrapIds: new Set(),
  messageIdentities: new Set(),
  messageReferences: new Map(),
  reactionIdentities: new Set(),
  reactionReferences: new Map(),
  wrapIds: new Set(),
});

export interface NostrInboxIdentity {
  identitySinceSec: number | null;
  privateKey: Uint8Array;
  pubkey: string;
}

export interface NostrInboxSnapshot {
  knownMessageIdentities: KnownNostrMessageIdentityIndex;
  messageWrapIds: ReadonlySet<string>;
  messages: readonly LocalNostrMessage[];
  reactionWrapIds: ReadonlySet<string>;
  reactions: readonly LocalNostrReaction[];
}

export interface NostrInboxConversation {
  contactId: string;
}

interface NostrInboxConversationContext {
  contactId: string;
  direction: "in" | "out";
  peerPubkey: string;
}

export interface NostrInboxPolicy {
  handlesSpecialEvents: boolean;
  isBlockedIncomingPubkey: (pubkey: string) => boolean;
  isCancelled: () => boolean;
  ownsConversation: (context: NostrInboxConversationContext) => boolean;
  resolveConversation: (peerPubkey: string) => NostrInboxConversation | null;
  resolveUnknownConversation: (
    peerPubkey: string,
  ) => NostrInboxConversation | null;
}

export interface NostrInboxAcknowledgement {
  clientId: string | null;
  contactId: string;
  wrapId: string;
}

export interface NostrInboxEffects {
  acknowledgeOutgoingMessage?: (
    acknowledgement: NostrInboxAcknowledgement,
  ) => void;
  appendMessage: (message: NewLocalNostrMessage) => string;
  appendReaction: (reaction: NewLocalNostrReaction) => string;
  deleteReactionsByWrapIds: (wrapIds: readonly string[]) => void;
  updateMessage: UpdateLocalNostrMessage;
  updateReaction: UpdateLocalNostrReaction;
}

interface NostrInboxBaseOutcome {
  delivery: NostrInboxDelivery;
  wrapId: string;
}

export interface NostrInboxInsertedMessageOutcome extends NostrInboxBaseOutcome {
  contactId: string;
  content: string;
  createdAtSec: number;
  direction: "in" | "out";
  isCashuMessage: boolean;
  kind: "inserted-message";
  messageId: string;
  peerPubkey: string;
}

export interface NostrInboxPaymentNoticeOutcome extends NostrInboxBaseOutcome {
  contactId: string;
  createdAtSec: number;
  kind: "payment-notice";
  peerPubkey: string;
  rumor: DecodedNostrInboxRumor;
}

export interface NostrInboxBankPaymentOfferOutcome extends NostrInboxBaseOutcome {
  contactId: string;
  createdAtSec: number;
  isOutgoing: boolean;
  isSelfAuthored: boolean;
  kind: "bank-payment-offer";
  offererPubkey: string;
  peerPubkey: string;
  rumor: DecodedNostrInboxRumor;
}

export type NostrInboxOutcome =
  | NostrInboxInsertedMessageOutcome
  | NostrInboxPaymentNoticeOutcome
  | NostrInboxBankPaymentOfferOutcome
  | (NostrInboxBaseOutcome & {
      acknowledgement?: NostrInboxAcknowledgement;
      kind:
        | "backfilled-original"
        | "edited-message"
        | "ignored"
        | "reconciled-message"
        | "reconciled-reaction"
        | "inserted-reaction"
        | "deleted-reactions";
      reason?: string;
    });

interface ProcessNostrInboxWrapParams {
  delivery: NostrInboxDelivery;
  effects: NostrInboxEffects;
  identity: NostrInboxIdentity;
  policy: NostrInboxPolicy;
  seen: NostrInboxSeenState;
  snapshot: NostrInboxSnapshot;
  unwrapEvent: (
    wrap: NostrToolsEvent,
    recipientPrivateKey: Uint8Array,
  ) => unknown;
  wrap: NostrToolsEvent;
}

const ignored = (
  delivery: NostrInboxDelivery,
  wrapId: string,
  reason: string,
): NostrInboxOutcome => ({
  delivery,
  kind: "ignored",
  reason,
  wrapId,
});

const matchesIncomingPeer = (
  message: LocalNostrMessage,
  direction: "in" | "out",
  peerPubkey: string,
): boolean =>
  direction === "in" &&
  normalizePubkeyHex(message.pubkey) === normalizePubkeyHex(peerPubkey);

const matchesConversation = (
  message: LocalNostrMessage,
  contactId: string,
  direction: "in" | "out",
  peerPubkey: string,
): boolean =>
  normalizeText(message.direction) === direction &&
  (normalizeText(message.contactId) === contactId ||
    matchesIncomingPeer(message, direction, peerPubkey));

const findMatchingMessage = ({
  clientId,
  contactId,
  content,
  direction,
  messages,
  peerPubkey,
  rumorId,
  wrapId,
}: {
  clientId: string | null;
  contactId: string;
  content: string;
  direction: "in" | "out";
  messages: readonly LocalNostrMessage[];
  peerPubkey: string;
  rumorId: string;
  wrapId: string;
}): LocalNostrMessage | null => {
  const scoped = messages.filter((message) =>
    matchesConversation(message, contactId, direction, peerPubkey),
  );
  const wrapped =
    scoped.find((message) => normalizeText(message.wrapId) === wrapId) ?? null;
  if (wrapped) return wrapped;
  const rumored = rumorId
    ? (scoped.find((message) => normalizeText(message.rumorId) === rumorId) ??
      null)
    : null;
  if (rumored) return rumored;
  if (clientId) {
    return (
      scoped.find((message) => normalizeText(message.clientId) === clientId) ??
      null
    );
  }
  return (
    scoped.find(
      (message) =>
        !isEventId(message.rumorId) &&
        normalizeText(message.content) === normalizeText(content),
    ) ?? null
  );
};

const buildReactionIdentity = (
  messageId: string,
  reactorPubkey: string,
  emoji: string,
): string => `${messageId}|${reactorPubkey}|${emoji}`;

const resolveMessageConversation = ({
  identityPubkey,
  messages,
  policy,
  rumorId,
  senderPubkey,
  tagClientId,
  tags,
}: {
  identityPubkey: string;
  messages: readonly LocalNostrMessage[];
  policy: NostrInboxPolicy;
  rumorId: string;
  senderPubkey: string;
  tagClientId: string | null;
  tags: readonly string[][];
}): {
  contactId: string;
  direction: "in" | "out";
  peerPubkey: string;
} | null => {
  const pTags = readTagValues(tags, "p");
  const taggedPeerPubkey =
    pTags.find((pubkey) => pubkey !== identityPubkey) ?? "";
  const addressesRecipient = pTags.includes(identityPubkey);
  const matchedOutgoingMessage =
    senderPubkey === identityPubkey
      ? null
      : (messages.find((message) => {
          if (normalizeText(message.direction) !== "out") return false;
          if (tagClientId && normalizeText(message.clientId) === tagClientId) {
            return true;
          }
          return rumorId ? normalizeText(message.rumorId) === rumorId : false;
        }) ?? null);
  const isOutgoing =
    senderPubkey === identityPubkey ||
    (addressesRecipient && Boolean(matchedOutgoingMessage));
  if (!isOutgoing && !addressesRecipient) return null;

  const candidates = isOutgoing
    ? [taggedPeerPubkey]
    : [taggedPeerPubkey, senderPubkey];
  let peerPubkey = "";
  let conversation: NostrInboxConversation | null = null;
  for (const candidate of candidates) {
    const normalizedCandidate = normalizePubkeyHex(candidate);
    if (!normalizedCandidate || normalizedCandidate === identityPubkey) {
      continue;
    }
    if (!peerPubkey) peerPubkey = normalizedCandidate;
    const resolved = policy.resolveConversation(normalizedCandidate);
    if (!resolved) continue;
    peerPubkey = normalizedCandidate;
    conversation = resolved;
    break;
  }
  if (!conversation) {
    const fallbackPeerPubkey = normalizePubkeyHex(
      isOutgoing ? taggedPeerPubkey : senderPubkey,
    );
    if (fallbackPeerPubkey && fallbackPeerPubkey !== identityPubkey) {
      peerPubkey = fallbackPeerPubkey;
      conversation = policy.resolveUnknownConversation(fallbackPeerPubkey);
    }
  }
  if (!peerPubkey) return null;

  const contactId =
    normalizeText(matchedOutgoingMessage?.contactId) ||
    normalizeText(conversation?.contactId);
  if (!contactId) return null;
  const direction = isOutgoing ? "out" : "in";
  if (!isOutgoing && policy.isBlockedIncomingPubkey(peerPubkey)) return null;
  if (!policy.ownsConversation({ contactId, direction, peerPubkey })) {
    return null;
  }
  return { contactId, direction, peerPubkey };
};

const processMessage = ({
  delivery,
  effects,
  identity,
  policy,
  rumor,
  seen,
  snapshot,
  wrap,
}: Omit<ProcessNostrInboxWrapParams, "unwrapEvent"> & {
  rumor: DecodedNostrInboxRumor;
}): NostrInboxOutcome => {
  const wrapId = wrap.id;
  const rumorId = isEventId(rumor.id) ? rumor.id : "";
  if (isInvalidInnerRumorPubkey(rumor.pubkey, wrap.pubkey)) {
    return ignored(delivery, wrapId, "outer-rumor-pubkey");
  }

  const content =
    rumor.kind === 15
      ? (privateImageMessageFromEvent(rumor) ?? "")
      : rumor.content;
  if (!content.trim()) return ignored(delivery, wrapId, "empty-content");

  const tagClientId = extractClientTag(rumor.tags);
  const conversation = resolveMessageConversation({
    identityPubkey: identity.pubkey,
    messages: snapshot.messages,
    policy,
    rumorId,
    senderPubkey: rumor.pubkey,
    tagClientId,
    tags: rumor.tags,
  });
  if (!conversation) return ignored(delivery, wrapId, "conversation-scope");

  const { contactId, direction, peerPubkey } = conversation;
  const taggedPeerPubkey =
    readTagValues(rumor.tags, "p").find(
      (pubkey) => pubkey !== identity.pubkey,
    ) ?? "";
  if (
    rumor.kind === 14 &&
    isNestedEncryptedNip44PayloadForAnyPubkey(
      content,
      [rumor.pubkey, taggedPeerPubkey, wrap.pubkey],
      identity.privateKey,
    )
  ) {
    return ignored(delivery, wrapId, "nested-nip44");
  }

  const { replyToId, rootMessageId } = extractReplyContextFromTags(rumor.tags);
  const editedFromId = extractEditedFromTag(rumor.tags);
  if (editedFromId && !isEventId(editedFromId)) {
    return ignored(delivery, wrapId, "invalid-edit-reference");
  }
  const stableRumorId = resolveStableMessageRumorId(rumorId, editedFromId);
  const effectivePubkey = direction === "out" ? identity.pubkey : peerPubkey;
  const rememberMessageReference = (): void => {
    const reference = {
      contactId,
      messageRumorId: stableRumorId || rumorId,
      pubkey: effectivePubkey,
    };
    if (rumorId) seen.messageReferences.set(rumorId, reference);
    if (stableRumorId) seen.messageReferences.set(stableRumorId, reference);
  };

  if (editedFromId) {
    const target = snapshot.messages.find(
      (message) =>
        matchesConversation(message, contactId, direction, peerPubkey) &&
        (normalizeText(message.rumorId) === editedFromId ||
          normalizeText(message.editedFromId) === editedFromId),
    );
    if (target) {
      const targetId = normalizeText(target.id);
      if (!targetId) return ignored(delivery, wrapId, "invalid-target");
      const existingOriginal =
        normalizeText(target.originalContent) || String(target.content ?? "");
      effects.updateMessage(targetId, {
        content,
        status: "sent",
        wrapId,
        pubkey: effectivePubkey,
        ...(tagClientId ? { clientId: tagClientId } : {}),
        ...(stableRumorId ? { rumorId: stableRumorId } : {}),
        isEdited: true,
        editedAtSec: Math.trunc(rumor.created_at),
        editedFromId,
        originalContent: existingOriginal || null,
      });
      rememberMessageReference();
      return { delivery, kind: "edited-message", wrapId };
    }
  }

  if (!editedFromId && rumorId) {
    const editedVersion = snapshot.messages.find(
      (message) =>
        matchesConversation(message, contactId, direction, peerPubkey) &&
        normalizeText(message.editedFromId) === rumorId,
    );
    if (editedVersion) {
      if (normalizeText(editedVersion.originalContent)) {
        return ignored(delivery, wrapId, "known-original");
      }
      const editedVersionId = normalizeText(editedVersion.id);
      if (!editedVersionId) return ignored(delivery, wrapId, "invalid-target");
      effects.updateMessage(editedVersionId, { originalContent: content });
      rememberMessageReference();
      return { delivery, kind: "backfilled-original", wrapId };
    }
  }

  const identityKeys = [
    tagClientId ? `client:${tagClientId}` : "",
    rumorId ? `rumor:${contactId}|${direction}|${rumorId}` : "",
  ].filter(Boolean);
  if (identityKeys.some((key) => seen.messageIdentities.has(key))) {
    return ignored(delivery, wrapId, "seen-message-identity");
  }
  if (
    hasKnownNostrMessageIdentity(snapshot.knownMessageIdentities, {
      contactId,
      direction,
      ...(tagClientId ? { clientId: tagClientId } : {}),
      ...(rumorId ? { rumorId } : {}),
      wrapId,
    })
  ) {
    return ignored(delivery, wrapId, "known-message-identity");
  }

  if (direction === "out") {
    const pendingMessages = snapshot.messages.filter(
      (message) =>
        matchesConversation(message, contactId, direction, peerPubkey) &&
        normalizeText(message.status || "sent") === "pending",
    );
    const pending = tagClientId
      ? pendingMessages.find(
          (message) => normalizeText(message.clientId) === tagClientId,
        )
      : rumorId
        ? pendingMessages.find(
            (message) => normalizeText(message.rumorId) === rumorId,
          )
        : pendingMessages.find(
            (message) =>
              normalizeText(message.content) === normalizeText(content),
          );
    if (pending) {
      effects.updateMessage(normalizeText(pending.id), {
        status: "sent",
        wrapId,
        pubkey: effectivePubkey,
        ...(tagClientId ? { clientId: tagClientId } : {}),
        ...(rumorId ? { rumorId } : {}),
        ...(replyToId ? { replyToId } : {}),
        ...(rootMessageId ? { rootMessageId } : {}),
      });
      for (const key of identityKeys) seen.messageIdentities.add(key);
      const acknowledgement = {
        clientId: tagClientId,
        contactId,
        wrapId,
      };
      effects.acknowledgeOutgoingMessage?.(acknowledgement);
      rememberMessageReference();
      return {
        acknowledgement,
        delivery,
        kind: "reconciled-message",
        wrapId,
      };
    }
  }

  const existing = findMatchingMessage({
    clientId: tagClientId,
    contactId,
    content,
    direction,
    messages: snapshot.messages,
    peerPubkey,
    rumorId,
    wrapId,
  });
  if (existing) {
    effects.updateMessage(normalizeText(existing.id), {
      status: "sent",
      wrapId,
      pubkey: effectivePubkey,
      ...(tagClientId ? { clientId: tagClientId } : {}),
      ...(stableRumorId ? { rumorId: stableRumorId } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(rootMessageId ? { rootMessageId } : {}),
      ...(editedFromId ? { editedFromId } : {}),
    });
    for (const key of identityKeys) seen.messageIdentities.add(key);
    rememberMessageReference();
    return { delivery, kind: "reconciled-message", wrapId };
  }

  const messageId = effects.appendMessage({
    contactId,
    direction,
    content,
    wrapId,
    rumorId: stableRumorId,
    pubkey: effectivePubkey,
    createdAtSec: Math.trunc(rumor.created_at),
    ...(tagClientId ? { clientId: tagClientId } : {}),
    ...(replyToId ? { replyToId } : {}),
    ...(rootMessageId ? { rootMessageId } : {}),
    ...(editedFromId
      ? {
          isEdited: true,
          editedAtSec: Math.trunc(rumor.created_at),
          editedFromId,
        }
      : {}),
  });
  for (const key of identityKeys) seen.messageIdentities.add(key);
  rememberMessageReference();
  return {
    contactId,
    content,
    createdAtSec: Math.trunc(rumor.created_at),
    delivery,
    direction,
    isCashuMessage: isCashuNotificationMessage(content),
    kind: "inserted-message",
    messageId,
    peerPubkey,
    wrapId,
  };
};

const processReaction = ({
  delivery,
  effects,
  identity,
  policy,
  rumor,
  seen,
  snapshot,
  wrap,
}: Omit<ProcessNostrInboxWrapParams, "unwrapEvent"> & {
  rumor: DecodedNostrInboxRumor;
}): NostrInboxOutcome => {
  const wrapId = wrap.id;
  if (isInvalidInnerRumorPubkey(rumor.pubkey, wrap.pubkey)) {
    return ignored(delivery, wrapId, "outer-rumor-pubkey");
  }
  if (
    rumor.pubkey !== identity.pubkey &&
    policy.isBlockedIncomingPubkey(rumor.pubkey)
  ) {
    return ignored(delivery, wrapId, "blocked");
  }

  const referencedMessageId = readTagValues(rumor.tags, "e")[0] ?? "";
  if (!isEventId(referencedMessageId)) {
    return ignored(delivery, wrapId, "invalid-reaction-reference");
  }
  const snapshotMessage =
    snapshot.messages.find(
      (message) => normalizeText(message.rumorId) === referencedMessageId,
    ) ?? null;
  const messageReference = snapshotMessage
    ? null
    : (seen.messageReferences.get(referencedMessageId) ?? null);
  const knownMessage = snapshotMessage ?? messageReference;
  if (!knownMessage) return ignored(delivery, wrapId, "unknown-message");
  const resolvedMessageId =
    messageReference?.messageRumorId || referencedMessageId;

  const contactId = normalizeText(knownMessage.contactId);
  const peerPubkey =
    rumor.pubkey === identity.pubkey
      ? (normalizePubkeyHex(knownMessage.pubkey) ?? "")
      : rumor.pubkey;
  const direction = rumor.pubkey === identity.pubkey ? "out" : "in";
  if (
    !contactId ||
    !policy.ownsConversation({ contactId, direction, peerPubkey })
  ) {
    return ignored(delivery, wrapId, "conversation-scope");
  }

  const kindTag = readTagValues(rumor.tags, "k")[0] ?? "";
  if (kindTag && kindTag !== "14" && kindTag !== "15") {
    return ignored(delivery, wrapId, "unsupported-reaction-kind");
  }
  const emoji = rumor.content.trim();
  if (!emoji) return ignored(delivery, wrapId, "empty-reaction");

  const reactionWrapId = normalizeText(rumor.id) || wrapId;
  if (seen.deletedReactionWrapIds.has(reactionWrapId)) {
    return ignored(delivery, wrapId, "deleted-reaction");
  }
  if (snapshot.reactionWrapIds.has(reactionWrapId)) {
    return ignored(delivery, wrapId, "known-reaction-wrap");
  }
  const clientId = extractClientTag(rumor.tags);
  const reactionIdentity = buildReactionIdentity(
    resolvedMessageId,
    rumor.pubkey,
    emoji,
  );
  const rememberReactionReference = (): void => {
    seen.reactionReferences.set(reactionWrapId, {
      emoji,
      messageId: resolvedMessageId,
      reactorPubkey: rumor.pubkey,
      wrapId: reactionWrapId,
    });
  };
  if (seen.reactionIdentities.has(reactionIdentity)) {
    return ignored(delivery, wrapId, "seen-reaction-identity");
  }

  const existingByWrap = snapshot.reactions.find(
    (reaction) => normalizeText(reaction.wrapId) === reactionWrapId,
  );
  if (existingByWrap) {
    effects.updateReaction(existingByWrap.id, {
      status: "sent",
      wrapId: reactionWrapId,
      ...(clientId ? { clientId } : {}),
    });
    seen.reactionIdentities.add(reactionIdentity);
    rememberReactionReference();
    return { delivery, kind: "reconciled-reaction", wrapId };
  }
  const existingByClient = clientId
    ? snapshot.reactions.find(
        (reaction) => normalizeText(reaction.clientId) === clientId,
      )
    : null;
  if (existingByClient) {
    effects.updateReaction(existingByClient.id, {
      status: "sent",
      wrapId: reactionWrapId,
      messageId: resolvedMessageId,
      reactorPubkey: rumor.pubkey,
      emoji,
      ...(clientId ? { clientId } : {}),
    });
    seen.reactionIdentities.add(reactionIdentity);
    rememberReactionReference();
    return { delivery, kind: "reconciled-reaction", wrapId };
  }
  const duplicate = snapshot.reactions.some(
    (reaction) =>
      !seen.deletedReactionWrapIds.has(normalizeText(reaction.wrapId)) &&
      normalizeText(reaction.messageId) === resolvedMessageId &&
      normalizeText(reaction.reactorPubkey) === rumor.pubkey &&
      normalizeText(reaction.emoji) === emoji,
  );
  if (duplicate) return ignored(delivery, wrapId, "duplicate-reaction");

  effects.appendReaction({
    messageId: resolvedMessageId,
    reactorPubkey: rumor.pubkey,
    emoji,
    createdAtSec: Math.trunc(rumor.created_at),
    wrapId: reactionWrapId,
    status: "sent",
    ...(clientId ? { clientId } : {}),
  });
  seen.reactionIdentities.add(reactionIdentity);
  rememberReactionReference();
  return { delivery, kind: "inserted-reaction", wrapId };
};

const processReactionDelete = ({
  delivery,
  effects,
  identity,
  policy,
  rumor,
  seen,
  snapshot,
  wrap,
}: Omit<ProcessNostrInboxWrapParams, "unwrapEvent"> & {
  rumor: DecodedNostrInboxRumor;
}): NostrInboxOutcome => {
  const wrapId = wrap.id;
  if (!isEventId(rumor.id)) {
    return ignored(delivery, wrapId, "invalid-delete-id");
  }
  if (isInvalidInnerRumorPubkey(rumor.pubkey, wrap.pubkey)) {
    return ignored(delivery, wrapId, "outer-rumor-pubkey");
  }
  if (
    rumor.pubkey !== identity.pubkey &&
    policy.isBlockedIncomingPubkey(rumor.pubkey)
  ) {
    return ignored(delivery, wrapId, "blocked");
  }

  const referencedIds = extractDeleteReferencedIds(rumor.tags).filter(
    isEventId,
  );
  const deferredReactionIds = new Set<string>();
  for (const [deferredWrapId, deferred] of seen.deferredReactions) {
    if (
      !referencedIds.includes(deferred.reactionId) ||
      normalizePubkeyHex(deferred.reactorPubkey) !==
        normalizePubkeyHex(rumor.pubkey)
    ) {
      continue;
    }
    seen.deferredReactions.delete(deferredWrapId);
    seen.deletedReactionWrapIds.add(deferred.reactionId);
    seen.wrapIds.add(deferredWrapId);
    deferredReactionIds.add(deferred.reactionId);
  }
  const ownedReactions = referencedIds.flatMap((referencedId) => {
    const reaction =
      snapshot.reactions.find(
        (candidate) => normalizeText(candidate.wrapId) === referencedId,
      ) ??
      seen.reactionReferences.get(referencedId) ??
      null;
    if (
      !reaction ||
      normalizePubkeyHex(reaction.reactorPubkey) !==
        normalizePubkeyHex(rumor.pubkey)
    ) {
      return [];
    }
    const message =
      snapshot.messages.find(
        (candidate) =>
          normalizeText(candidate.rumorId) ===
          normalizeText(reaction.messageId),
      ) ??
      seen.messageReferences.get(normalizeText(reaction.messageId)) ??
      null;
    if (
      !message ||
      !policy.ownsConversation({
        contactId: message.contactId,
        direction: rumor.pubkey === identity.pubkey ? "out" : "in",
        peerPubkey: rumor.pubkey,
      })
    ) {
      return [];
    }
    return [reaction];
  });
  if (ownedReactions.length === 0 && deferredReactionIds.size === 0) {
    return ignored(delivery, wrapId, "unknown-reaction-delete");
  }
  const ownedIds = ownedReactions.map((reaction) =>
    normalizeText(reaction.wrapId),
  );
  for (const reaction of ownedReactions) {
    seen.deletedReactionWrapIds.add(normalizeText(reaction.wrapId));
    seen.reactionReferences.delete(normalizeText(reaction.wrapId));
    seen.reactionIdentities.delete(
      buildReactionIdentity(
        normalizeText(reaction.messageId),
        normalizeText(reaction.reactorPubkey),
        normalizeText(reaction.emoji),
      ),
    );
  }
  if (ownedIds.length > 0) effects.deleteReactionsByWrapIds(ownedIds);
  return { delivery, kind: "deleted-reactions", wrapId };
};

const MAX_DEFERRED_REACTIONS = 100;

const deferReaction = (
  seen: NostrInboxSeenState,
  delivery: NostrInboxDelivery,
  rumor: DecodedNostrInboxRumor,
  wrap: NostrToolsEvent,
): void => {
  if (!isEventId(rumor.id)) return;
  seen.wrapIds.delete(wrap.id);
  seen.deferredReactions.set(wrap.id, {
    delivery,
    reactionId: rumor.id,
    reactorPubkey: rumor.pubkey,
    wrap,
  });
  if (seen.deferredReactions.size <= MAX_DEFERRED_REACTIONS) return;
  const oldestWrapId = seen.deferredReactions.keys().next().value;
  if (typeof oldestWrapId === "string") {
    seen.deferredReactions.delete(oldestWrapId);
  }
};

const retryDeferredReactions = (params: ProcessNostrInboxWrapParams): void => {
  for (const [wrapId, deferred] of Array.from(
    params.seen.deferredReactions.entries(),
  )) {
    params.seen.deferredReactions.delete(wrapId);
    processNostrInboxWrap({
      ...params,
      delivery: deferred.delivery,
      wrap: deferred.wrap,
    });
  }
};

const resolveSpecialEvent = ({
  delivery,
  identity,
  policy,
  rumor,
  wrapId,
}: {
  delivery: NostrInboxDelivery;
  identity: NostrInboxIdentity;
  policy: NostrInboxPolicy;
  rumor: DecodedNostrInboxRumor;
  wrapId: string;
}):
  | NostrInboxPaymentNoticeOutcome
  | NostrInboxBankPaymentOfferOutcome
  | null => {
  if (!policy.handlesSpecialEvents) return null;
  if (!isEventId(rumor.id)) return null;
  const pTags = readTagValues(rumor.tags, "p");
  if (!pTags.includes(identity.pubkey)) return null;

  if (isLinkyPaymentNoticeEvent(rumor)) {
    const taggedPeerPubkey =
      pTags.find((pubkey) => pubkey !== identity.pubkey) ?? "";
    const peerPubkey =
      normalizePubkeyHex(taggedPeerPubkey) ??
      normalizePubkeyHex(rumor.pubkey) ??
      "";
    if (!peerPubkey || peerPubkey === identity.pubkey) return null;
    if (policy.isBlockedIncomingPubkey(peerPubkey)) return null;
    const conversation =
      policy.resolveConversation(peerPubkey) ??
      policy.resolveUnknownConversation(peerPubkey);
    if (!conversation) return null;
    return {
      contactId: conversation.contactId,
      createdAtSec: Math.trunc(rumor.created_at),
      delivery,
      kind: "payment-notice",
      peerPubkey,
      rumor,
      wrapId,
    };
  }

  if (isLinkyBankPaymentOfferEvent(rumor)) {
    const offerInfo = getLinkyBankPaymentOfferInfo(rumor.content);
    const offererPubkey =
      normalizePubkeyHex(offerInfo?.offererPublicKey) ??
      normalizePubkeyHex(rumor.pubkey) ??
      "";
    const peerPubkey =
      [
        ...pTags.map(normalizePubkeyHex),
        normalizePubkeyHex(rumor.pubkey),
        offererPubkey,
      ].find((pubkey) => Boolean(pubkey) && pubkey !== identity.pubkey) ?? "";
    if (!peerPubkey || peerPubkey === identity.pubkey) return null;
    if (policy.isBlockedIncomingPubkey(peerPubkey)) return null;
    const conversation =
      policy.resolveConversation(peerPubkey) ??
      policy.resolveUnknownConversation(peerPubkey);
    if (!conversation) return null;
    return {
      contactId: conversation.contactId,
      createdAtSec: Math.trunc(rumor.created_at),
      delivery,
      isOutgoing: offererPubkey === identity.pubkey,
      isSelfAuthored: rumor.pubkey === identity.pubkey,
      kind: "bank-payment-offer",
      offererPubkey,
      peerPubkey,
      rumor,
      wrapId,
    };
  }

  return null;
};

export const processNostrInboxWrap = ({
  delivery,
  effects,
  identity,
  policy,
  seen,
  snapshot,
  unwrapEvent,
  wrap,
}: ProcessNostrInboxWrapParams): NostrInboxOutcome => {
  const wrapId = normalizeText(wrap.id);
  if (!hasValidOuterWrap(wrap, identity.pubkey)) {
    return ignored(delivery, wrapId, "invalid-wrap");
  }
  if (seen.wrapIds.has(wrapId)) {
    return ignored(delivery, wrapId, "seen-wrap");
  }
  if (
    hasKnownNostrMessageIdentity(snapshot.knownMessageIdentities, { wrapId })
  ) {
    seen.wrapIds.add(wrapId);
    return ignored(delivery, wrapId, "known-wrap");
  }
  seen.wrapIds.add(wrapId);

  let decoded: unknown;
  try {
    decoded = unwrapEvent(wrap, identity.privateKey);
  } catch {
    return ignored(delivery, wrapId, "unwrap-failed");
  }
  if (!isDecodedNostrInboxRumor(decoded)) {
    return ignored(delivery, wrapId, "invalid-rumor");
  }
  if (!Number.isInteger(decoded.kind)) {
    return ignored(delivery, wrapId, "invalid-rumor-numbers");
  }
  // Non-positive or fractional timestamps are coerced to "now" (as both
  // pre-unification processors did) instead of dropping the event or letting
  // an epoch-zero value hit the identity cutoff and retention pruning.
  const rumor =
    Number.isInteger(decoded.created_at) && decoded.created_at > 0
      ? decoded
      : {
          ...decoded,
          created_at:
            decoded.created_at > 0
              ? Math.trunc(decoded.created_at)
              : Math.ceil(Date.now() / 1000),
        };
  if (
    identity.identitySinceSec !== null &&
    rumor.created_at < identity.identitySinceSec
  ) {
    return ignored(delivery, wrapId, "identity-cutoff");
  }
  if (isInvalidInnerRumorPubkey(rumor.pubkey, wrap.pubkey)) {
    return ignored(delivery, wrapId, "outer-rumor-pubkey");
  }
  if (policy.isCancelled()) return ignored(delivery, wrapId, "cancelled");

  const specialOutcome = resolveSpecialEvent({
    delivery,
    identity,
    policy,
    rumor,
    wrapId,
  });
  if (specialOutcome) return specialOutcome;

  if (rumor.kind === 14 || rumor.kind === 15) {
    if (snapshot.messageWrapIds.has(wrapId)) {
      return ignored(delivery, wrapId, "known-message-wrap");
    }
    const outcome = processMessage({
      delivery,
      effects,
      identity,
      policy,
      rumor,
      seen,
      snapshot,
      wrap,
    });
    retryDeferredReactions({
      delivery,
      effects,
      identity,
      policy,
      seen,
      snapshot,
      unwrapEvent,
      wrap,
    });
    return outcome;
  }
  if (rumor.kind === 7) {
    const outcome = processReaction({
      delivery,
      effects,
      identity,
      policy,
      rumor,
      seen,
      snapshot,
      wrap,
    });
    if (outcome.kind === "ignored" && outcome.reason === "unknown-message") {
      deferReaction(seen, delivery, rumor, wrap);
    } else {
      seen.deferredReactions.delete(wrapId);
    }
    return outcome;
  }
  if (rumor.kind === 5) {
    return processReactionDelete({
      delivery,
      effects,
      identity,
      policy,
      rumor,
      seen,
      snapshot,
      wrap,
    });
  }
  return ignored(delivery, wrapId, "unsupported-kind");
};
