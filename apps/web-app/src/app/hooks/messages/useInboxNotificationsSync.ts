import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { formatShortNpub } from "../../../utils/formatting";
import { BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY } from "../../../utils/constants";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { safeLocalStorageGetJson } from "../../../utils/storage";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import type {
  ContactNameRowLike,
  LocalNostrMessage,
  LocalNostrReaction,
  NewLocalNostrMessage,
  NewLocalNostrReaction,
  NostrMessageSummaryRow,
  RouteWithOptionalId,
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
} from "./chatNostrProtocol";
import { buildUnknownContactId, normalizePubkeyHex } from "./contactIdentity";

type AppendLocalNostrMessage = (message: NewLocalNostrMessage) => string;
type AppendLocalNostrReaction = (reaction: NewLocalNostrReaction) => string;

interface UseInboxNotificationsSyncParams<
  TContact extends ContactNameRowLike & { npub?: string | null | undefined },
  TRoute extends RouteWithOptionalId,
> {
  appendLocalNostrMessage: AppendLocalNostrMessage;
  appendLocalNostrReaction: AppendLocalNostrReaction;
  contacts: readonly TContact[];
  currentNsec: string | null;
  getCashuTokenMessageInfo: (text: string) => {
    amount: number | null;
    isValid: boolean;
  } | null;
  maybeShowPwaNotification: (
    title: string,
    body: string,
    tag?: string,
  ) => Promise<void>;
  nostrFetchRelays: string[];
  nostrMessageWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrMessagesLatestRef: React.MutableRefObject<LocalNostrMessage[]>;
  nostrMessagesRecent: readonly NostrMessageSummaryRow[];
  nostrReactionWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrReactionsLatestRef: React.MutableRefObject<LocalNostrReaction[]>;
  pushToast: (message: string) => void;
  route: TRoute;
  setContactAttentionById: React.Dispatch<
    React.SetStateAction<Record<string, number>>
  >;
  softDeleteLocalNostrReactionsByWrapIds: (wrapIds: readonly string[]) => void;
  t: (key: string) => string;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
  updateLocalNostrReaction: UpdateLocalNostrReaction;
}

export const useInboxNotificationsSync = <
  TContact extends ContactNameRowLike & { npub?: string | null | undefined },
  TRoute extends RouteWithOptionalId,
>({
  appendLocalNostrMessage,
  appendLocalNostrReaction,
  contacts,
  currentNsec,
  getCashuTokenMessageInfo,
  maybeShowPwaNotification,
  nostrFetchRelays,
  nostrMessageWrapIdsRef,
  nostrMessagesLatestRef,
  nostrMessagesRecent,
  nostrReactionWrapIdsRef,
  nostrReactionsLatestRef,
  pushToast,
  route,
  setContactAttentionById,
  softDeleteLocalNostrReactionsByWrapIds,
  t,
  updateLocalNostrMessage,
  updateLocalNostrReaction,
}: UseInboxNotificationsSyncParams<TContact, TRoute>) => {
  React.useEffect(() => {
    // Best-effort: keep syncing the NIP-17 inbox globally so messages from
    // other contacts still arrive while a chat is open. The currently opened
    // chat contact is deduplicated below to avoid duplicate inserts.
    if (!currentNsec) return;

    const activeChatId = route.kind === "chat" ? String(route.id ?? "") : null;

    let cancelled = false;

    const seenWrapIds = new Set<string>();
    for (const message of nostrMessagesRecent) {
      const wrapId = String(message.wrapId ?? "").trim();
      if (wrapId) seenWrapIds.add(wrapId);
    }
    const seenRumorKeys = new Set<string>();
    for (const message of nostrMessagesLatestRef.current) {
      const rumorId = String(message.rumorId ?? "").trim();
      if (!rumorId) continue;

      const contactId = String(message.contactId ?? "").trim();
      const direction = String(message.direction ?? "").trim();
      if (!contactId || (direction !== "in" && direction !== "out")) continue;

      seenRumorKeys.add(`${contactId}|${direction}|${rumorId}`);
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

        // Map known contact pubkeys -> contact info.
        const contactByPubHex = new Map<
          string,
          { id: string; name: string | null; npub: string | null }
        >();
        const rememberContactPubkey = (
          pubkey: string,
          contact: { id: string; name: string | null; npub: string | null },
        ) => {
          const normalizedPubkey = normalizePubkeyHex(pubkey);
          if (normalizedPubkey) {
            contactByPubHex.set(normalizedPubkey, contact);
          }
          contactByPubHex.set(pubkey, contact);
        };
        const findContactByPubkey = (
          pubkey: string,
        ): { id: string; name: string | null; npub: string | null } | null => {
          const normalizedPubkey = normalizePubkeyHex(pubkey);
          return (
            (normalizedPubkey ? contactByPubHex.get(normalizedPubkey) : null) ??
            contactByPubHex.get(pubkey) ??
            null
          );
        };
        for (const contact of contacts) {
          const npub = normalizeNpubIdentifier(contact.npub);
          if (!npub) continue;
          try {
            const decoded = nip19.decode(npub);
            if (decoded.type !== "npub" || typeof decoded.data !== "string")
              continue;
            const pub = decoded.data.trim();
            if (!pub) continue;
            const name = String(contact.name ?? "").trim() || null;
            rememberContactPubkey(pub, {
              id: String(contact.id ?? "").trim(),
              name,
              npub,
            });
          } catch {
            // ignore
          }
        }

        const isBlockedPubkey = (pubkeyHex: string): boolean => {
          const normalizedPubkey = normalizePubkeyHex(pubkeyHex);
          if (!normalizedPubkey) return false;

          const blocked = safeLocalStorageGetJson(
            BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY,
            [],
          )
            .map((entry) => normalizePubkeyHex(entry))
            .filter((entry): entry is string => Boolean(entry));

          return blocked.includes(normalizedPubkey);
        };

        const pool = await getSharedAppNostrPool();

        const processWrap = (wrap: NostrToolsEvent) => {
          try {
            const wrapId = String(wrap?.id ?? "");
            if (!wrapId) return;
            if (seenWrapIds.has(wrapId)) return;
            seenWrapIds.add(wrapId);

            const inner = unwrapEvent(wrap, privBytes) as NostrToolsEvent;
            if (!inner) return;

            const senderPub = String(inner.pubkey ?? "").trim();
            const content = String(inner.content ?? "");
            if (!senderPub) return;

            const createdAtSecRaw = Number(inner.created_at ?? 0);
            const createdAtSec =
              Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
                ? Math.trunc(createdAtSecRaw)
                : Math.ceil(Date.now() / 1e3);

            if (cancelled) return;

            if (inner.kind === 14) {
              if (nostrMessageWrapIdsRef.current.has(wrapId)) return;
              if (isInvalidInnerRumorPubkey(senderPub, wrap.pubkey)) return;
              if (!content.trim()) return;

              const tags = Array.isArray(inner.tags) ? inner.tags : [];
              const pTags = tags
                .filter((tag) => Array.isArray(tag) && tag[0] === "p")
                .map((tag) => String(tag[1] ?? "").trim())
                .filter(Boolean);
              const taggedPeerPub =
                pTags.find((pub) => pub && pub !== myPubHex) ?? "";
              if (
                isNestedEncryptedNip44PayloadForAnyPubkey(
                  content,
                  [senderPub, taggedPeerPub, wrap.pubkey],
                  privBytes,
                )
              ) {
                return;
              }

              const tagClientId = extractClientTag(tags);
              const rumorId = inner.id ? String(inner.id).trim() : "";
              const matchedOutgoingMessage =
                senderPub === myPubHex
                  ? null
                  : (nostrMessagesLatestRef.current.find((message) => {
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
                    }) ?? null);

              const addressesMe = pTags.includes(myPubHex);
              const isOutgoing =
                senderPub === myPubHex ||
                (addressesMe && Boolean(matchedOutgoingMessage));
              if (!addressesMe && !isOutgoing) return;

              const peerPubCandidates = isOutgoing
                ? [taggedPeerPub]
                : [taggedPeerPub, senderPub];
              let resolvedPeerPub = "";
              let contact: {
                id: string;
                name: string | null;
                npub: string | null;
              } | null = null;
              for (const candidate of peerPubCandidates) {
                const nextCandidate = String(candidate ?? "").trim();
                if (!nextCandidate || nextCandidate === myPubHex) continue;
                if (!resolvedPeerPub) resolvedPeerPub = nextCandidate;
                const matchedContact = findContactByPubkey(nextCandidate);
                if (!matchedContact) continue;
                resolvedPeerPub = nextCandidate;
                contact = matchedContact;
                break;
              }
              const matchedContactId = String(
                matchedOutgoingMessage?.contactId ?? "",
              ).trim();
              if (!resolvedPeerPub && !matchedContactId) return;

              if (!isOutgoing && isBlockedPubkey(resolvedPeerPub)) {
                return;
              }

              const contactId =
                matchedContactId ||
                (contact
                  ? String(contact.id ?? "").trim()
                  : String(
                      buildUnknownContactId(resolvedPeerPub) ?? "",
                    ).trim());
              if (!contactId) return;

              const isActiveChatContact =
                Boolean(activeChatId) &&
                String(contactId) === String(activeChatId);

              const messageDirection = isOutgoing ? "out" : "in";
              const rumorKey = rumorId
                ? `${String(contactId)}|${messageDirection}|${rumorId}`
                : "";
              if (rumorKey) {
                if (seenRumorKeys.has(rumorKey)) return;
                seenRumorKeys.add(rumorKey);
              }

              const { replyToId, rootMessageId } =
                extractReplyContextFromTags(tags);
              const editedFromId = extractEditedFromTag(tags);
              const effectivePubkey = isOutgoing ? myPubHex : resolvedPeerPub;

              if (editedFromId) {
                const target = nostrMessagesLatestRef.current.find(
                  (message) => {
                    if (String(message.contactId ?? "") !== String(contactId)) {
                      return false;
                    }
                    if (String(message.direction ?? "") !== messageDirection)
                      return false;
                    return (
                      String(message.rumorId ?? "").trim() === editedFromId ||
                      String(message.editedFromId ?? "").trim() === editedFromId
                    );
                  },
                );
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
                    pubkey: effectivePubkey,
                    ...(tagClientId ? { clientId: tagClientId } : {}),
                    ...(rumorId ? { rumorId } : {}),
                    isEdited: true,
                    editedAtSec: createdAtSec,
                    editedFromId,
                    originalContent: existingOriginal || null,
                  });
                  return;
                }
              }

              if (!isOutgoing) {
                if (!isActiveChatContact) {
                  setContactAttentionById((prev) => ({
                    ...prev,
                    [contactId]: Date.now(),
                  }));

                  const shouldShowVisibleToast = (() => {
                    try {
                      return document.visibilityState === "visible";
                    } catch {
                      return false;
                    }
                  })();
                  if (shouldShowVisibleToast) {
                    const senderLabel =
                      contact?.name ??
                      formatShortNpub(
                        contact?.npub ?? nip19.npubEncode(resolvedPeerPub),
                      ) ??
                      t("unknownContactTitle");
                    const trimmedContent = content.trim();
                    const preview =
                      trimmedContent.length > 80
                        ? `${trimmedContent.slice(0, 80)}…`
                        : trimmedContent;
                    pushToast(
                      t("chatIncomingMessageToast")
                        .replace("{name}", senderLabel)
                        .replace("{message}", preview),
                    );
                  }
                }

                const title =
                  contact?.name ??
                  (contact ? t("appTitle") : t("unknownContactTitle"));
                void maybeShowPwaNotification(
                  title,
                  content.trim(),
                  `msg_${resolvedPeerPub}`,
                );

                const tokenInfo = getCashuTokenMessageInfo(content);
                if (tokenInfo?.isValid) {
                  const body = tokenInfo.amount
                    ? `${tokenInfo.amount} sat`
                    : t("cashuAccepted");
                  void maybeShowPwaNotification(
                    t("mints"),
                    body,
                    `cashu_${resolvedPeerPub}`,
                  );
                }
              }

              // Avoid duplicate inserts while the active chat subscription is
              // handling messages for that contact.
              if (isActiveChatContact) return;

              const existingMessage = nostrMessagesLatestRef.current.find(
                (message) => {
                  if (String(message.contactId ?? "") !== String(contactId)) {
                    return false;
                  }
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
                updateLocalNostrMessage(String(existingMessage.id ?? ""), {
                  status: "sent",
                  wrapId,
                  pubkey: effectivePubkey,
                  ...(tagClientId ? { clientId: tagClientId } : {}),
                  ...(rumorId ? { rumorId } : {}),
                  ...(replyToId ? { replyToId } : {}),
                  ...(rootMessageId ? { rootMessageId } : {}),
                  ...(editedFromId ? { editedFromId } : {}),
                });
                return;
              }

              appendLocalNostrMessage({
                contactId,
                direction: isOutgoing ? "out" : "in",
                content,
                wrapId,
                rumorId: rumorId || null,
                pubkey: effectivePubkey,
                createdAtSec,
                ...(tagClientId ? { clientId: tagClientId } : {}),
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
              const tags = Array.isArray(inner.tags) ? inner.tags : [];
              const messageId = tags
                .find((tag) => Array.isArray(tag) && tag[0] === "e")
                ?.at(1);
              const normalizedMessageId = String(messageId ?? "").trim();
              if (!normalizedMessageId) return;

              const knownMessage = nostrMessagesLatestRef.current.find(
                (message) =>
                  String(message.rumorId ?? "").trim() === normalizedMessageId,
              );
              if (!knownMessage) return;

              const kTag = tags
                .find((tag) => Array.isArray(tag) && tag[0] === "k")
                ?.at(1);
              if (kTag && String(kTag) !== "14") return;

              const emoji = content.trim();
              if (!emoji) return;

              const reactionWrapId = String(inner.id ?? "").trim() || wrapId;
              if (!reactionWrapId) return;
              if (nostrReactionWrapIdsRef.current.has(reactionWrapId)) return;

              const clientId = extractClientTag(tags);
              const existingByWrap = nostrReactionsLatestRef.current.find(
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
                ? nostrReactionsLatestRef.current.find(
                    (reaction) =>
                      String(reaction.clientId ?? "").trim() === clientId,
                  )
                : null;
              if (existingByClient) {
                updateLocalNostrReaction(existingByClient.id, {
                  status: "sent",
                  wrapId: reactionWrapId,
                  messageId: normalizedMessageId,
                  reactorPubkey: senderPub,
                  emoji,
                  ...(clientId ? { clientId } : {}),
                });
                return;
              }

              appendLocalNostrReaction({
                messageId: normalizedMessageId,
                reactorPubkey: senderPub,
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

        const relays = nostrFetchRelays.length
          ? nostrFetchRelays
          : NOSTR_RELAYS;

        const existing = await pool.querySync(
          relays,
          { kinds: [1059], "#p": [myPubHex], limit: 50 },
          { maxWait: 5000 },
        );

        if (!cancelled) {
          for (const event of Array.isArray(existing)
            ? (existing as NostrToolsEvent[])
            : []) {
            processWrap(event);
          }
        }

        const sub = pool.subscribe(
          relays,
          { kinds: [1059], "#p": [myPubHex] },
          {
            onevent: (event: NostrToolsEvent) => {
              if (cancelled) return;
              processWrap(event);
            },
          },
        );

        return () => {
          void sub.close("inbox sync closed");
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
    contacts,
    currentNsec,
    getCashuTokenMessageInfo,
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
    maybeShowPwaNotification,
    nostrFetchRelays,
    nostrMessagesRecent,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    pushToast,
    route,
    setContactAttentionById,
    softDeleteLocalNostrReactionsByWrapIds,
    t,
  ]);
};
