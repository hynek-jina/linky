import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import type { PushToastOptions } from "../../../hooks/useToasts";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY } from "../../../utils/constants";
import { formatShortNpub } from "../../../utils/formatting";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import {
  getInitialNostrIdentitySource,
  getInitialNostrIdentitySwitchedAtSec,
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
} from "../../../utils/storage";
import {
  getLinkyBankPaymentOfferInfo,
  getLinkyBankPaymentOfferText,
  isLinkyBankPaymentOfferEvent,
  isLinkyBankPaymentOfferTerminalStatus,
  LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC,
  type LinkyBankPaymentOfferInfo,
} from "../../lib/bankPaymentOffer";
import { isCashuNotificationMessage } from "../../lib/cashuNotificationCopy";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import { isLinkyPaymentNoticeEvent } from "../../lib/pushWrappedEvent";
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
import type { KnownNostrMessageIdentityIndex } from "./messageHelpers";
import { hasKnownNostrMessageIdentity } from "./messageHelpers";

const PAYMENT_NOTICE_SEEN_WRAP_IDS_STORAGE_KEY_PREFIX =
  "linky.nostr.payment_notice_seen_wrap_ids.v1";
const MAX_PERSISTED_PAYMENT_NOTICE_WRAP_IDS = 200;
const PAYMENT_NOTICE_MATCH_WINDOW_SECONDS = 120;

const isBankPaymentOfferExpired = (
  offerInfo: LinkyBankPaymentOfferInfo,
  createdAtSec: number,
  nowSec: number,
): boolean => {
  const phaseStartedAtSecRaw =
    offerInfo.statusUpdatedAtSec && offerInfo.statusUpdatedAtSec > 0
      ? offerInfo.statusUpdatedAtSec
      : createdAtSec;
  const phaseStartedAtSec =
    Number.isFinite(phaseStartedAtSecRaw) && phaseStartedAtSecRaw > 0
      ? Math.trunc(phaseStartedAtSecRaw)
      : null;
  if (!phaseStartedAtSec) return false;

  return nowSec - phaseStartedAtSec >= LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC;
};

const getPaymentNoticeSeenWrapIdsStorageKey = (pubkeyHex: string): string =>
  `${PAYMENT_NOTICE_SEEN_WRAP_IDS_STORAGE_KEY_PREFIX}.${pubkeyHex}`;

const readSeenPaymentNoticeWrapIds = (pubkeyHex: string): Set<string> => {
  const values = safeLocalStorageGetJson<string[]>(
    getPaymentNoticeSeenWrapIdsStorageKey(pubkeyHex),
    [],
  )
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(-MAX_PERSISTED_PAYMENT_NOTICE_WRAP_IDS);

  return new Set(values);
};

const persistSeenPaymentNoticeWrapIds = (
  pubkeyHex: string,
  wrapIds: Set<string>,
): void => {
  safeLocalStorageSetJson(
    getPaymentNoticeSeenWrapIdsStorageKey(pubkeyHex),
    Array.from(wrapIds).slice(-MAX_PERSISTED_PAYMENT_NOTICE_WRAP_IDS),
  );
};

type AppendLocalNostrMessage = (message: NewLocalNostrMessage) => string;
type AppendLocalNostrReaction = (reaction: NewLocalNostrReaction) => string;

interface OpenInboxMessageToastParams {
  contactId: string;
  messageId?: string;
}

interface UseInboxNotificationsSyncParams<
  TContact extends ContactNameRowLike & { npub?: string | null | undefined },
  TRoute extends RouteWithOptionalId,
> {
  appendLocalNostrMessage: AppendLocalNostrMessage;
  appendLocalNostrReaction: AppendLocalNostrReaction;
  bankPaymentOfferMessages?: readonly LocalNostrMessage[];
  contacts: readonly TContact[];
  currentNsec: string | null;
  maybeShowPwaNotification: (
    title: string,
    body: string,
    tag?: string,
  ) => Promise<void>;
  nostrFetchRelays: string[];
  knownNostrMessageIdentityIndex?: KnownNostrMessageIdentityIndex;
  nostrMessageWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrMessagesLatestRef: React.MutableRefObject<LocalNostrMessage[]>;
  nostrMessagesRecent: readonly NostrMessageSummaryRow[];
  nostrReactionWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrReactionsLatestRef: React.MutableRefObject<LocalNostrReaction[]>;
  onBankPaymentOfferMessage?: (message: LocalNostrMessage) => void;
  onOpenInboxMessageToast?: (params: OpenInboxMessageToastParams) => void;
  pushToast: (message: string, options?: PushToastOptions) => void;
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
  bankPaymentOfferMessages = [],
  contacts,
  currentNsec,
  maybeShowPwaNotification,
  nostrFetchRelays,
  knownNostrMessageIdentityIndex = {
    clientIds: new Set<string>(),
    rumorKeys: new Set<string>(),
    wrapIds: new Set<string>(),
  },
  nostrMessageWrapIdsRef,
  nostrMessagesLatestRef,
  nostrMessagesRecent,
  nostrReactionWrapIdsRef,
  nostrReactionsLatestRef,
  onBankPaymentOfferMessage = () => {},
  onOpenInboxMessageToast = () => {},
  pushToast,
  route,
  setContactAttentionById,
  softDeleteLocalNostrReactionsByWrapIds,
  t,
  updateLocalNostrMessage,
  updateLocalNostrReaction,
}: UseInboxNotificationsSyncParams<TContact, TRoute>) => {
  const paymentNoticeWrapIdsRef = React.useRef<Set<string>>(new Set());
  const bankPaymentOfferWrapIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    // Best-effort: keep syncing the NIP-17 inbox globally so messages from
    // other contacts still arrive while a chat is open. The currently opened
    // chat contact is deduplicated below to avoid duplicate inserts.
    if (!currentNsec) return;

    const activeChatId = route.kind === "chat" ? String(route.id ?? "") : null;

    let cancelled = false;
    const identitySinceSec =
      getInitialNostrIdentitySource() === "custom"
        ? getInitialNostrIdentitySwitchedAtSec()
        : null;

    const seenWrapIds = new Set<string>();
    for (const message of nostrMessagesRecent) {
      const wrapId = String(message.wrapId ?? "").trim();
      if (wrapId) seenWrapIds.add(wrapId);
    }
    for (const wrapId of paymentNoticeWrapIdsRef.current) {
      const normalizedWrapId = String(wrapId ?? "").trim();
      if (normalizedWrapId) seenWrapIds.add(normalizedWrapId);
    }
    for (const wrapId of bankPaymentOfferWrapIdsRef.current) {
      const normalizedWrapId = String(wrapId ?? "").trim();
      if (normalizedWrapId) seenWrapIds.add(normalizedWrapId);
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
        const persistedPaymentNoticeWrapIds =
          readSeenPaymentNoticeWrapIds(myPubHex);
        paymentNoticeWrapIdsRef.current = new Set([
          ...persistedPaymentNoticeWrapIds,
          ...paymentNoticeWrapIdsRef.current,
        ]);
        for (const wrapId of paymentNoticeWrapIdsRef.current) {
          const normalizedWrapId = String(wrapId ?? "").trim();
          if (normalizedWrapId) seenWrapIds.add(normalizedWrapId);
        }

        const rememberSeenPaymentNoticeWrapId = (wrapId: string) => {
          const normalizedWrapId = String(wrapId ?? "").trim();
          if (!normalizedWrapId) return;
          seenWrapIds.add(normalizedWrapId);
          paymentNoticeWrapIdsRef.current.add(normalizedWrapId);
          persistSeenPaymentNoticeWrapIds(
            myPubHex,
            paymentNoticeWrapIdsRef.current,
          );
        };

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

        const hasStoredIncomingCashuToken = (
          contactId: string,
          createdAtSec: number,
        ): boolean => {
          return nostrMessagesLatestRef.current.some((message) => {
            if (String(message.contactId ?? "").trim() !== contactId) {
              return false;
            }
            if (String(message.direction ?? "").trim() !== "in") {
              return false;
            }

            const messageCreatedAtSec = Number(message.createdAtSec ?? 0);
            if (
              !Number.isFinite(messageCreatedAtSec) ||
              messageCreatedAtSec <= 0
            ) {
              return false;
            }

            if (
              Math.abs(messageCreatedAtSec - createdAtSec) >
              PAYMENT_NOTICE_MATCH_WINDOW_SECONDS
            ) {
              return false;
            }

            return isCashuNotificationMessage(String(message.content ?? ""));
          });
        };

        const pool = await getSharedAppNostrPool();

        const processWrap = (wrap: NostrToolsEvent) => {
          try {
            const wrapId = String(wrap?.id ?? "");
            if (!wrapId) return;
            if (seenWrapIds.has(wrapId)) return;
            if (
              hasKnownNostrMessageIdentity(knownNostrMessageIdentityIndex, {
                wrapId,
              })
            ) {
              seenWrapIds.add(wrapId);
              return;
            }
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

            if (identitySinceSec && createdAtSec < identitySinceSec) return;

            if (cancelled) return;

            if (isLinkyPaymentNoticeEvent(inner)) {
              const tags = Array.isArray(inner.tags) ? inner.tags : [];
              const pTags = tags
                .filter((tag) => Array.isArray(tag) && tag[0] === "p")
                .map((tag) => String(tag[1] ?? "").trim())
                .filter(Boolean);
              const taggedPeerPub =
                pTags.find((pub) => pub && pub !== myPubHex) ?? "";
              const addressesMe = pTags.includes(myPubHex);
              if (!addressesMe) return;
              const resolvedPeerPub =
                taggedPeerPub && taggedPeerPub !== myPubHex
                  ? taggedPeerPub
                  : senderPub;
              if (!resolvedPeerPub || resolvedPeerPub === myPubHex) return;
              if (isBlockedPubkey(resolvedPeerPub)) return;

              const contact = findContactByPubkey(resolvedPeerPub);
              const contactId = contact
                ? String(contact.id ?? "").trim()
                : String(buildUnknownContactId(resolvedPeerPub) ?? "").trim();
              if (!contactId) return;

              const isActiveChatContact =
                Boolean(activeChatId) &&
                String(contactId) === String(activeChatId);

              if (hasStoredIncomingCashuToken(contactId, createdAtSec)) {
                rememberSeenPaymentNoticeWrapId(wrapId);
                return;
              }

              rememberSeenPaymentNoticeWrapId(wrapId);

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
                  pushToast(
                    t("chatIncomingMessageToast")
                      .replace("{name}", senderLabel)
                      .replace("{message}", t("notificationReceivedMoney")),
                  );
                }
              }

              const title =
                contact?.name ??
                (contact ? t("appTitle") : t("unknownContactTitle"));
              void maybeShowPwaNotification(
                title,
                t("notificationReceivedMoney"),
                wrapId,
              );
              return;
            }

            if (isLinkyBankPaymentOfferEvent(inner)) {
              const offerInfo = getLinkyBankPaymentOfferInfo(content);
              const offerText = getLinkyBankPaymentOfferText(content);
              if (!offerText) return;
              const offerId = String(offerInfo?.offerId ?? "").trim();
              const isTerminalOffer = offerInfo
                ? isLinkyBankPaymentOfferTerminalStatus(offerInfo.status)
                : false;
              let hasKnownOffer = false;
              let hasTerminalKnownOffer = false;
              if (offerId) {
                for (const message of bankPaymentOfferMessages) {
                  const knownInfo = getLinkyBankPaymentOfferInfo(
                    String(message.content ?? ""),
                  );
                  if (knownInfo?.offerId !== offerId) continue;

                  hasKnownOffer = true;
                  if (isLinkyBankPaymentOfferTerminalStatus(knownInfo.status)) {
                    hasTerminalKnownOffer = true;
                    break;
                  }
                }
              }
              const isExpiredOffer =
                offerInfo && !isTerminalOffer
                  ? isBankPaymentOfferExpired(
                      offerInfo,
                      createdAtSec,
                      Math.floor(Date.now() / 1e3),
                    )
                  : false;

              const tags = Array.isArray(inner.tags) ? inner.tags : [];
              const pTags = tags
                .filter((tag) => Array.isArray(tag) && tag[0] === "p")
                .map((tag) => String(tag[1] ?? "").trim())
                .filter(Boolean);
              const tagClientId = extractClientTag(tags);
              const taggedPeerPub =
                pTags.find((pub) => pub && pub !== myPubHex) ?? "";
              const addressesMe = pTags.includes(myPubHex);
              if (!addressesMe) return;
              const offererPub =
                String(offerInfo?.offererPublicKey ?? "").trim() ||
                (senderPub === myPubHex ? myPubHex : senderPub);
              const isOutgoing = offererPub === myPubHex;
              const isSelfAuthored = senderPub === myPubHex;
              const resolvedPeerPub =
                [taggedPeerPub, senderPub, offererPub].find(
                  (pub) => pub && pub !== myPubHex,
                ) ?? "";
              if (!resolvedPeerPub || resolvedPeerPub === myPubHex) return;
              if (isBlockedPubkey(resolvedPeerPub)) return;

              const contact = findContactByPubkey(resolvedPeerPub);
              const contactId = contact
                ? String(contact.id ?? "").trim()
                : String(buildUnknownContactId(resolvedPeerPub) ?? "").trim();
              if (!contactId) return;

              bankPaymentOfferWrapIdsRef.current.add(wrapId);
              seenWrapIds.add(wrapId);

              if (
                isExpiredOffer ||
                (!isTerminalOffer && hasTerminalKnownOffer)
              ) {
                return;
              }

              if (isTerminalOffer && !hasKnownOffer) {
                return;
              }

              const offerMessage: LocalNostrMessage = {
                contactId,
                content,
                createdAtSec,
                direction: isOutgoing ? "out" : "in",
                id: `bank-payment-offer:${wrapId}`,
                localOnly: true,
                pubkey: isOutgoing ? myPubHex : offererPub,
                rumorId: null,
                status: "sent",
                wrapId,
              };
              if (tagClientId) {
                offerMessage.clientId = tagClientId;
              }
              onBankPaymentOfferMessage(offerMessage);

              if (isTerminalOffer) {
                return;
              }

              const isActiveChatContact =
                Boolean(activeChatId) &&
                String(contactId) === String(activeChatId);
              if (!isActiveChatContact && !isSelfAuthored) {
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
                  pushToast(
                    t("chatIncomingMessageToast")
                      .replace("{name}", senderLabel)
                      .replace("{message}", offerText),
                  );
                }
              }

              if (!isSelfAuthored) {
                const title =
                  contact?.name ??
                  (contact ? t("appTitle") : t("unknownContactTitle"));
                void maybeShowPwaNotification(title, offerText, wrapId);
              }
              return;
            }

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
              const isCashuMessage = isCashuNotificationMessage(content);

              const messageDirection = isOutgoing ? "out" : "in";
              const rumorKey = rumorId
                ? `${String(contactId)}|${messageDirection}|${rumorId}`
                : "";
              if (rumorKey) {
                if (seenRumorKeys.has(rumorKey)) return;
                seenRumorKeys.add(rumorKey);
              }

              if (
                hasKnownNostrMessageIdentity(knownNostrMessageIdentityIndex, {
                  contactId,
                  direction: messageDirection,
                  ...(tagClientId ? { clientId: tagClientId } : {}),
                  ...(rumorId ? { rumorId } : {}),
                  wrapId,
                })
              ) {
                return;
              }

              const { replyToId, rootMessageId } =
                extractReplyContextFromTags(tags);
              const editedFromId = extractEditedFromTag(tags);
              const effectivePubkey = isOutgoing ? myPubHex : resolvedPeerPub;
              const normalizedIncomingPeerPubkey = isOutgoing
                ? null
                : normalizePubkeyHex(effectivePubkey);

              const matchesStoredIncomingPeer = (
                message: LocalNostrMessage,
              ): boolean => {
                if (isOutgoing || !normalizedIncomingPeerPubkey) return false;
                return (
                  normalizePubkeyHex(message.pubkey) ===
                  normalizedIncomingPeerPubkey
                );
              };

              if (editedFromId) {
                const target = nostrMessagesLatestRef.current.find(
                  (message) => {
                    const matchesContactId =
                      String(message.contactId ?? "") === String(contactId);
                    if (
                      !matchesContactId &&
                      !matchesStoredIncomingPeer(message)
                    ) {
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

              // Avoid duplicate inserts while the active chat subscription is
              // handling messages for that contact.
              if (isActiveChatContact) return;

              const existingMessage = nostrMessagesLatestRef.current.find(
                (message) => {
                  const matchesContactId =
                    String(message.contactId ?? "") === String(contactId);
                  if (
                    !matchesContactId &&
                    !matchesStoredIncomingPeer(message)
                  ) {
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

              const insertedMessageId = appendLocalNostrMessage({
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

              if (!isOutgoing && !isCashuMessage) {
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
                    {
                      onClick: () => {
                        onOpenInboxMessageToast({
                          contactId,
                          ...(insertedMessageId
                            ? { messageId: insertedMessageId }
                            : {}),
                        });
                      },
                    },
                  );
                }

                const title =
                  contact?.name ??
                  (contact ? t("appTitle") : t("unknownContactTitle"));
                void maybeShowPwaNotification(
                  title,
                  content.trim(),
                  `msg_${resolvedPeerPub}`,
                );
              }
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
    bankPaymentOfferMessages,
    contacts,
    currentNsec,
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
    maybeShowPwaNotification,
    nostrFetchRelays,
    knownNostrMessageIdentityIndex,
    nostrMessagesRecent,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    onBankPaymentOfferMessage,
    onOpenInboxMessageToast,
    pushToast,
    route,
    setContactAttentionById,
    softDeleteLocalNostrReactionsByWrapIds,
    t,
  ]);
};
