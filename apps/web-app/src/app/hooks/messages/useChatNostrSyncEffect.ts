import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import {
  getInitialNostrIdentitySource,
  getInitialNostrIdentitySwitchedAtSec,
} from "../../../utils/storage";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import type {
  ChatMessageRowLike,
  ContactIdentityRowLike,
  LocalNostrReaction,
  NewLocalNostrMessage,
  NewLocalNostrReaction,
  PaymentLogData,
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
import { privateImageMessageFromEvent } from "../../lib/privateImageMessage";
import {
  readUnknownPubkeyHex,
  resolveNostrChatIdentity,
} from "./contactIdentity";
import type { KnownNostrMessageIdentityIndex } from "./messageHelpers";
import { hasKnownNostrMessageIdentity } from "./messageHelpers";

const normalizeText = (value: unknown): string => String(value ?? "").trim();

interface UseChatNostrSyncEffectParams {
  appendLocalNostrMessage: (message: NewLocalNostrMessage) => string;
  appendLocalNostrReaction: (reaction: NewLocalNostrReaction) => string;
  chatMessages: readonly ChatMessageRowLike[];
  chatMessagesLatestRef: React.MutableRefObject<readonly ChatMessageRowLike[]>;
  chatSeenWrapIdsRef: React.MutableRefObject<Set<string>>;
  currentNsec: string | null;
  enabled?: boolean;
  knownNostrMessageIdentityIndex: KnownNostrMessageIdentityIndex;
  logPayStep: (step: string, data?: PaymentLogData) => void;
  nostrMessageWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrReactionWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrReactionsLatestRef: React.MutableRefObject<LocalNostrReaction[]>;
  route: { kind: string };
  selectedContact: ContactIdentityRowLike | null;
  softDeleteLocalNostrReactionsByWrapIds: (wrapIds: readonly string[]) => void;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
  updateLocalNostrReaction: UpdateLocalNostrReaction;
}

export const useChatNostrSyncEffect = ({
  appendLocalNostrMessage,
  appendLocalNostrReaction,
  chatMessages,
  chatMessagesLatestRef,
  chatSeenWrapIdsRef,
  currentNsec,
  enabled = true,
  knownNostrMessageIdentityIndex,
  logPayStep,
  nostrMessageWrapIdsRef,
  nostrReactionWrapIdsRef,
  nostrReactionsLatestRef,
  route,
  selectedContact,
  softDeleteLocalNostrReactionsByWrapIds,
  updateLocalNostrMessage,
  updateLocalNostrReaction,
}: UseChatNostrSyncEffectParams) => {
  const latestValuesRef = React.useRef({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    chatSeenWrapIdsRef,
    knownNostrMessageIdentityIndex,
    logPayStep,
    nostrMessageWrapIdsRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    selectedContact,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  });

  React.useEffect(() => {
    latestValuesRef.current = {
      appendLocalNostrMessage,
      appendLocalNostrReaction,
      chatMessages,
      chatMessagesLatestRef,
      chatSeenWrapIdsRef,
      knownNostrMessageIdentityIndex,
      logPayStep,
      nostrMessageWrapIdsRef,
      nostrReactionWrapIdsRef,
      nostrReactionsLatestRef,
      selectedContact,
      softDeleteLocalNostrReactionsByWrapIds,
      updateLocalNostrMessage,
      updateLocalNostrReaction,
    };
  }, [
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    chatSeenWrapIdsRef,
    knownNostrMessageIdentityIndex,
    logPayStep,
    nostrMessageWrapIdsRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    selectedContact,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  ]);

  const selectedContactId = normalizeText(selectedContact?.id);
  const selectedContactNpub = normalizeText(selectedContact?.npub);
  const selectedContactUnknownPubkeyHex =
    readUnknownPubkeyHex(selectedContact) ?? "";

  React.useEffect(() => {
    // NIP-17 inbox sync + subscription while a chat is open.
    if (!enabled) return;
    if (route.kind !== "chat") return;
    const selectedContactAtStart = latestValuesRef.current.selectedContact;
    if (!selectedContactAtStart) return;

    if (!currentNsec) return;

    let cancelled = false;
    const identitySinceSec =
      getInitialNostrIdentitySource() === "custom"
        ? getInitialNostrIdentitySwitchedAtSec()
        : null;

    const existingWrapIds = latestValuesRef.current.chatSeenWrapIdsRef.current;
    for (const m of latestValuesRef.current.chatMessages) {
      const id = String(m.wrapId ?? "");
      if (id) existingWrapIds.add(id);
    }

    const run = async () => {
      try {
        const { unwrapEvent } = await import("nostr-tools/nip17");
        const identity = await resolveNostrChatIdentity(
          currentNsec,
          selectedContactAtStart,
        );
        if (!identity) return;
        const { contactPubHex, myPubHex, privBytes } = identity;

        const pool = await getSharedAppNostrPool();

        const processWrap = (wrap: NostrToolsEvent) => {
          try {
            const wrapId = String(wrap?.id ?? "");
            if (!wrapId) return;
            if (existingWrapIds.has(wrapId)) return;
            if (
              hasKnownNostrMessageIdentity(
                latestValuesRef.current.knownNostrMessageIdentityIndex,
                {
                  wrapId,
                },
              )
            ) {
              existingWrapIds.add(wrapId);
              return;
            }
            existingWrapIds.add(wrapId);

            const inner = unwrapEvent(wrap, privBytes);
            if (!inner) return;

            const innerPub = String(inner.pubkey ?? "").trim();
            const tags = Array.isArray(inner.tags) ? inner.tags : [];
            const createdAtSecRaw = Number(inner.created_at ?? 0);
            const createdAtSec =
              Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
                ? Math.trunc(createdAtSecRaw)
                : Math.ceil(Date.now() / 1e3);

            if (identitySinceSec && createdAtSec < identitySinceSec) return;

            if (cancelled) return;

            if (inner.kind === 14 || inner.kind === 15) {
              const latest = latestValuesRef.current;
              if (latest.nostrMessageWrapIdsRef.current.has(wrapId)) return;
              if (isInvalidInnerRumorPubkey(innerPub, wrap.pubkey)) return;

              const content =
                inner.kind === 15
                  ? (privateImageMessageFromEvent(inner) ?? "")
                  : String(inner.content ?? "");
              if (!content.trim()) return;
              const pTags = tags
                .filter((tag) => Array.isArray(tag) && tag[0] === "p")
                .map((tag) => String(tag[1] ?? "").trim());
              const taggedPeerPub =
                pTags.find((tag) => tag && tag !== myPubHex) ?? "";
              if (
                inner.kind === 14 &&
                isNestedEncryptedNip44PayloadForAnyPubkey(
                  content,
                  [innerPub, taggedPeerPub, wrap.pubkey],
                  privBytes,
                )
              ) {
                return;
              }
              const tagClientId = extractClientTag(tags);
              const rumorId = inner.id ? String(inner.id).trim() : null;
              const hasOutgoingLocalMatch =
                innerPub === myPubHex
                  ? false
                  : latest.chatMessagesLatestRef.current.some((message) => {
                      if (String(message.direction ?? "").trim() !== "out") {
                        return false;
                      }
                      if (
                        tagClientId &&
                        String(message.clientId ?? "").trim() ===
                          String(tagClientId).trim()
                      ) {
                        return true;
                      }
                      return (
                        rumorId &&
                        String(message.rumorId ?? "").trim() === rumorId
                      );
                    });
              const mentionsContact = pTags.includes(contactPubHex);
              const addressesMe = pTags.includes(myPubHex);
              const isIncoming =
                innerPub === contactPubHex || taggedPeerPub === contactPubHex;
              const isOutgoing =
                innerPub === myPubHex ||
                (addressesMe && mentionsContact && hasOutgoingLocalMatch);
              if (!isIncoming && !isOutgoing) return;
              if (isOutgoing && !mentionsContact) return;

              const { replyToId, rootMessageId } =
                extractReplyContextFromTags(tags);
              const editedFromId = extractEditedFromTag(tags);
              const effectivePubkey = isOutgoing
                ? myPubHex
                : taggedPeerPub === contactPubHex
                  ? contactPubHex
                  : innerPub;
              const messageDirection = isOutgoing ? "out" : "in";

              if (
                hasKnownNostrMessageIdentity(
                  latest.knownNostrMessageIdentityIndex,
                  {
                    contactId: String(selectedContactAtStart.id),
                    direction: messageDirection,
                    ...(tagClientId ? { clientId: tagClientId } : {}),
                    ...(rumorId ? { rumorId } : {}),
                    wrapId,
                  },
                )
              ) {
                return;
              }

              if (editedFromId) {
                const messages = latest.chatMessagesLatestRef.current;
                const target = messages.find((message) => {
                  if (String(message.direction ?? "") !== messageDirection)
                    return false;
                  return (
                    String(message.rumorId ?? "").trim() === editedFromId ||
                    String(message.editedFromId ?? "").trim() === editedFromId
                  );
                });

                if (target) {
                  const targetId = String(target.id ?? "").trim();
                  if (!targetId) return;
                  const existingOriginal =
                    String(target.originalContent ?? "").trim() ||
                    String(target.content ?? "");
                  latest.updateLocalNostrMessage(targetId, {
                    content,
                    status: "sent",
                    wrapId,
                    pubkey: effectivePubkey,
                    ...(tagClientId ? { clientId: tagClientId } : {}),
                    isEdited: true,
                    editedAtSec: createdAtSec,
                    editedFromId,
                    originalContent: existingOriginal || null,
                  });
                  return;
                }
              }

              if (!editedFromId && rumorId) {
                const messages = latest.chatMessagesLatestRef.current;
                const existingEditedVersion = messages.find((message) => {
                  if (normalizeText(message.direction) !== messageDirection)
                    return false;
                  return normalizeText(message.editedFromId) === rumorId;
                });

                if (existingEditedVersion) {
                  const existingEditedVersionId = normalizeText(
                    existingEditedVersion.id,
                  );
                  if (!existingEditedVersionId) return;

                  const hasOriginalContent = Boolean(
                    normalizeText(existingEditedVersion.originalContent),
                  );

                  if (hasOriginalContent) return;

                  latest.updateLocalNostrMessage(existingEditedVersionId, {
                    originalContent: content,
                  });
                  return;
                }
              }

              if (isOutgoing) {
                const messages = latest.chatMessagesLatestRef.current;
                const pending = messages.find((message) => {
                  const isOut = String(message.direction ?? "") === "out";
                  const isPending =
                    String(message.status ?? "sent") === "pending";
                  if (!isOut || !isPending) return false;
                  if (tagClientId) {
                    return (
                      String(message.clientId ?? "").trim() ===
                      String(tagClientId).trim()
                    );
                  }
                  if (rumorId) {
                    return (
                      String(message.rumorId ?? "").trim() ===
                      String(rumorId).trim()
                    );
                  }
                  return (
                    String(message.content ?? "").trim() === content.trim()
                  );
                });
                if (pending) {
                  latest.updateLocalNostrMessage(String(pending.id ?? ""), {
                    status: "sent",
                    wrapId,
                    pubkey: effectivePubkey,
                    ...(tagClientId ? { clientId: String(tagClientId) } : {}),
                    ...(rumorId ? { rumorId } : {}),
                    ...(replyToId ? { replyToId } : {}),
                    ...(rootMessageId ? { rootMessageId } : {}),
                  });
                  latest.logPayStep("message-ack", {
                    contactId: String(selectedContactAtStart.id ?? ""),
                    clientId: tagClientId ? String(tagClientId) : null,
                    wrapId,
                  });
                  return;
                }
              }

              const existingMessage = latest.chatMessagesLatestRef.current.find(
                (message) => {
                  if (String(message.direction ?? "") !== messageDirection)
                    return false;
                  if (
                    rumorId &&
                    String(message.rumorId ?? "").trim() === rumorId
                  ) {
                    return true;
                  }
                  if (tagClientId) {
                    return (
                      String(message.clientId ?? "").trim() ===
                      String(tagClientId).trim()
                    );
                  }
                  return (
                    String(message.content ?? "").trim() === content.trim()
                  );
                },
              );
              if (existingMessage) {
                latest.updateLocalNostrMessage(
                  String(existingMessage.id ?? ""),
                  {
                    status: "sent",
                    wrapId,
                    pubkey: effectivePubkey,
                    ...(tagClientId ? { clientId: String(tagClientId) } : {}),
                    ...(!editedFromId && rumorId ? { rumorId } : {}),
                    ...(replyToId ? { replyToId } : {}),
                    ...(rootMessageId ? { rootMessageId } : {}),
                    ...(editedFromId ? { editedFromId } : {}),
                  },
                );
                return;
              }

              const stableRumorId = resolveStableMessageRumorId(
                rumorId,
                editedFromId,
              );

              latest.appendLocalNostrMessage({
                contactId: String(selectedContactAtStart.id),
                direction: messageDirection,
                content,
                wrapId,
                rumorId: stableRumorId,
                pubkey: effectivePubkey,
                createdAtSec,
                ...(tagClientId ? { clientId: String(tagClientId) } : {}),
                ...(replyToId ? { replyToId } : {}),
                ...(rootMessageId ? { rootMessageId } : {}),
                ...(editedFromId
                  ? {
                      isEdited: true,
                      editedAtSec: createdAtSec,
                      editedFromId,
                    }
                  : {}),
              });
              return;
            }

            if (inner.kind === 7) {
              const latest = latestValuesRef.current;
              const tagsArray = Array.isArray(inner.tags) ? inner.tags : [];
              const messageId = tagsArray
                .find((tag) => Array.isArray(tag) && tag[0] === "e")
                ?.at(1);
              const normalizedMessageId = String(messageId ?? "").trim();
              if (!normalizedMessageId) return;

              const kindTag = tagsArray
                .find((tag) => Array.isArray(tag) && tag[0] === "k")
                ?.at(1);
              if (
                kindTag &&
                String(kindTag) !== "14" &&
                String(kindTag) !== "15"
              )
                return;

              const knownRumorIds = new Set(
                latest.chatMessagesLatestRef.current
                  .map((message) => String(message.rumorId ?? "").trim())
                  .filter(Boolean),
              );
              if (!knownRumorIds.has(normalizedMessageId)) return;

              const emoji = String(inner.content ?? "").trim();
              if (!emoji) return;

              const reactionWrapId = String(inner.id ?? "").trim() || wrapId;
              if (!reactionWrapId) return;
              if (latest.nostrReactionWrapIdsRef.current.has(reactionWrapId))
                return;

              const clientId = extractClientTag(tagsArray);
              const reactions = latest.nostrReactionsLatestRef.current;
              const existingByWrap = reactions.find(
                (reaction) =>
                  String(reaction.wrapId ?? "").trim() === reactionWrapId,
              );
              if (existingByWrap) {
                latest.updateLocalNostrReaction(existingByWrap.id, {
                  status: "sent",
                  wrapId: reactionWrapId,
                  ...(clientId ? { clientId } : {}),
                });
                return;
              }

              const existingByClient = clientId
                ? reactions.find(
                    (reaction) =>
                      String(reaction.clientId ?? "").trim() === clientId,
                  )
                : null;
              if (existingByClient) {
                latest.updateLocalNostrReaction(existingByClient.id, {
                  status: "sent",
                  wrapId: reactionWrapId,
                  messageId: normalizedMessageId,
                  reactorPubkey: innerPub,
                  emoji,
                  ...(clientId ? { clientId } : {}),
                });
                return;
              }

              const duplicateByIdentity = reactions.find(
                (reaction) =>
                  String(reaction.messageId ?? "").trim() ===
                    normalizedMessageId &&
                  String(reaction.reactorPubkey ?? "").trim() === innerPub &&
                  String(reaction.emoji ?? "").trim() === emoji,
              );
              if (duplicateByIdentity) return;

              latest.appendLocalNostrReaction({
                messageId: normalizedMessageId,
                reactorPubkey: innerPub,
                emoji,
                createdAtSec,
                wrapId: reactionWrapId,
                status: "sent",
                ...(clientId ? { clientId } : {}),
              });
              return;
            }

            if (inner.kind === 5) {
              const referencedIds = extractDeleteReferencedIds(inner.tags);
              if (referencedIds.length === 0) return;
              latestValuesRef.current.softDeleteLocalNostrReactionsByWrapIds(
                referencedIds,
              );
            }
          } catch {
            // ignore individual events
          }
        };

        const existing = await pool.querySync(
          NOSTR_RELAYS,
          { kinds: [1059], "#p": [myPubHex], limit: 50 },
          { maxWait: 5000 },
        );

        if (!cancelled) {
          for (const e of Array.isArray(existing) ? existing : [])
            processWrap(e);
        }

        const sub = pool.subscribe(
          NOSTR_RELAYS,
          { kinds: [1059], "#p": [myPubHex] },
          {
            onevent: (e: NostrToolsEvent) => {
              if (cancelled) return;
              processWrap(e);
            },
          },
        );

        return () => {
          void sub.close("chat closed");
        };
      } catch {
        return;
      }
    };

    let cleanup: (() => void) | undefined;
    void run().then((nextCleanup) => {
      if (cancelled) {
        nextCleanup?.();
        return;
      }
      cleanup = nextCleanup;
    });

    return () => {
      cancelled = true;
      cleanup?.();
      cleanup = undefined;
    };
  }, [
    currentNsec,
    enabled,
    route.kind,
    selectedContactId,
    selectedContactNpub,
    selectedContactUnknownPubkeyHex,
  ]);
};
