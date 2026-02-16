import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
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
} from "./chatNostrProtocol";

const normalizeText = (value: unknown): string => String(value ?? "").trim();

interface UseChatNostrSyncEffectParams {
  appendLocalNostrMessage: (message: NewLocalNostrMessage) => string;
  appendLocalNostrReaction: (reaction: NewLocalNostrReaction) => string;
  chatMessages: readonly ChatMessageRowLike[];
  chatMessagesLatestRef: React.MutableRefObject<readonly ChatMessageRowLike[]>;
  chatSeenWrapIdsRef: React.MutableRefObject<Set<string>>;
  currentNsec: string | null;
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
  React.useEffect(() => {
    // NIP-17 inbox sync + subscription while a chat is open.
    if (route.kind !== "chat") return;
    if (!selectedContact) return;

    const contactNpub = normalizeNpubIdentifier(selectedContact.npub);
    if (!contactNpub) return;
    if (!currentNsec) return;

    let cancelled = false;

    const existingWrapIds = chatSeenWrapIdsRef.current;
    for (const m of chatMessages) {
      const id = String(m.wrapId ?? "");
      if (id) existingWrapIds.add(id);
    }

    const run = async () => {
      try {
        const { nip19, getPublicKey } = await import("nostr-tools");
        const { unwrapEvent } = await import("nostr-tools/nip17");

        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        )
          return;
        const privBytes = decodedMe.data;
        const myPubHex = getPublicKey(privBytes);

        let decodedContact: ReturnType<typeof nip19.decode> | null = null;
        try {
          decodedContact = nip19.decode(contactNpub);
        } catch {
          decodedContact = null;
        }
        if (
          !decodedContact ||
          decodedContact.type !== "npub" ||
          typeof decodedContact.data !== "string"
        ) {
          return;
        }
        const contactPubHex = decodedContact.data;

        const pool = await getSharedAppNostrPool();

        const processWrap = (wrap: NostrToolsEvent) => {
          try {
            const wrapId = String(wrap?.id ?? "");
            if (!wrapId) return;
            if (existingWrapIds.has(wrapId)) return;
            existingWrapIds.add(wrapId);

            const inner = unwrapEvent(wrap, privBytes) as NostrToolsEvent;
            if (!inner) return;

            const innerPub = String(inner.pubkey ?? "").trim();
            const tags = Array.isArray(inner.tags) ? inner.tags : [];
            const createdAtSecRaw = Number(inner.created_at ?? 0);
            const createdAtSec =
              Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
                ? Math.trunc(createdAtSecRaw)
                : Math.ceil(Date.now() / 1e3);

            if (cancelled) return;

            if (inner.kind === 14) {
              if (nostrMessageWrapIdsRef.current.has(wrapId)) return;

              const isIncoming = innerPub === contactPubHex;
              const isOutgoing = innerPub === myPubHex;
              if (!isIncoming && !isOutgoing) return;

              const content = String(inner.content ?? "");
              if (!content.trim()) return;

              // Ensure outgoing messages are for this contact.
              const pTags = tags
                .filter((tag) => Array.isArray(tag) && tag[0] === "p")
                .map((tag) => String(tag[1] ?? "").trim());
              const mentionsContact = pTags.includes(contactPubHex);
              if (isOutgoing && !mentionsContact) return;

              const tagClientId = extractClientTag(tags);
              const rumorId = inner.id ? String(inner.id).trim() : null;
              const { replyToId, rootMessageId } =
                extractReplyContextFromTags(tags);
              const editedFromId = extractEditedFromTag(tags);

              if (editedFromId) {
                const direction = isIncoming ? "in" : "out";
                const messages = chatMessagesLatestRef.current;
                const target = messages.find((message) => {
                  if (String(message.direction ?? "") !== direction)
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
                  updateLocalNostrMessage(targetId, {
                    content,
                    status: "sent",
                    wrapId,
                    pubkey: innerPub,
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
                const direction = isIncoming ? "in" : "out";
                const messages = chatMessagesLatestRef.current;
                const existingEditedVersion = messages.find((message) => {
                  if (normalizeText(message.direction) !== direction)
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

                  updateLocalNostrMessage(existingEditedVersionId, {
                    originalContent: content,
                  });
                  return;
                }
              }

              if (isOutgoing) {
                const messages = chatMessagesLatestRef.current;
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
                  updateLocalNostrMessage(String(pending.id ?? ""), {
                    status: "sent",
                    wrapId,
                    pubkey: innerPub,
                    ...(tagClientId ? { clientId: String(tagClientId) } : {}),
                    ...(rumorId ? { rumorId } : {}),
                    ...(replyToId ? { replyToId } : {}),
                    ...(rootMessageId ? { rootMessageId } : {}),
                  });
                  logPayStep("message-ack", {
                    contactId: String(selectedContact.id ?? ""),
                    clientId: tagClientId ? String(tagClientId) : null,
                    wrapId,
                  });
                  return;
                }
              }

              const existingMessage = chatMessagesLatestRef.current.find(
                (message) => {
                  const direction = isIncoming ? "in" : "out";
                  if (String(message.direction ?? "") !== direction)
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
                updateLocalNostrMessage(String(existingMessage.id ?? ""), {
                  status: "sent",
                  wrapId,
                  pubkey: innerPub,
                  ...(tagClientId ? { clientId: String(tagClientId) } : {}),
                  ...(!editedFromId && rumorId ? { rumorId } : {}),
                  ...(replyToId ? { replyToId } : {}),
                  ...(rootMessageId ? { rootMessageId } : {}),
                  ...(editedFromId ? { editedFromId } : {}),
                });
                return;
              }

              const stableRumorId = editedFromId || rumorId;

              appendLocalNostrMessage({
                contactId: String(selectedContact.id),
                direction: isIncoming ? "in" : "out",
                content,
                wrapId,
                rumorId: stableRumorId,
                pubkey: innerPub,
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
              const tagsArray = Array.isArray(inner.tags) ? inner.tags : [];
              const messageId = tagsArray
                .find((tag) => Array.isArray(tag) && tag[0] === "e")
                ?.at(1);
              const normalizedMessageId = String(messageId ?? "").trim();
              if (!normalizedMessageId) return;

              const kindTag = tagsArray
                .find((tag) => Array.isArray(tag) && tag[0] === "k")
                ?.at(1);
              if (kindTag && String(kindTag) !== "14") return;

              const knownRumorIds = new Set(
                chatMessagesLatestRef.current
                  .map((message) => String(message.rumorId ?? "").trim())
                  .filter(Boolean),
              );
              if (!knownRumorIds.has(normalizedMessageId)) return;

              const emoji = String(inner.content ?? "").trim();
              if (!emoji) return;

              const reactionWrapId = String(inner.id ?? "").trim() || wrapId;
              if (!reactionWrapId) return;
              if (nostrReactionWrapIdsRef.current.has(reactionWrapId)) return;

              const clientId = extractClientTag(tagsArray);
              const reactions = nostrReactionsLatestRef.current;
              const existingByWrap = reactions.find(
                (reaction) =>
                  String(reaction.wrapId ?? "").trim() === reactionWrapId,
              );
              if (existingByWrap) {
                updateLocalNostrReaction(existingByWrap.id, {
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
                updateLocalNostrReaction(existingByClient.id, {
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

              appendLocalNostrReaction({
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
              softDeleteLocalNostrReactionsByWrapIds(referencedIds);
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
          for (const e of Array.isArray(existing)
            ? (existing as NostrToolsEvent[])
            : [])
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
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    chatSeenWrapIdsRef,
    currentNsec,
    logPayStep,
    nostrMessageWrapIdsRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    route.kind,
    selectedContact,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  ]);
};
