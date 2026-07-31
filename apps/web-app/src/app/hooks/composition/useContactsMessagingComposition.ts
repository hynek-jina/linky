import * as Evolu from "@evolu/common";
import {
  nip19,
  type Event as NostrToolsEvent,
  type UnsignedEvent,
} from "nostr-tools";
import React, { useMemo, useState } from "react";
import {
  deriveDefaultProfile,
  omitSyntheticContactLightningAddress,
} from "../../../derivedProfile";
import { useEvolu, type ContactId } from "../../../evolu";
import { navigateTo, useRouting } from "../../../hooks/useRouting";
import { type Lang } from "../../../i18n";
import {
  cacheProfileAvatarFromUrl,
  deleteCachedProfileAvatar,
  fetchNostrProfileMetadata,
  fetchNostrProfilePicture,
  getNostrProfilePictureUrl,
  isCachedProfilePictureStale,
  loadCachedProfileAvatarObjectUrl,
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  NOSTR_RELAYS,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
  type NostrProfileMetadata,
} from "../../../nostrProfile";
import {
  buildStatusFilterValue,
  extractStatusFilterCurrencies,
  isStatusFilterValue,
  parseStatusFilterValue,
} from "../../../nostrStatus";
import {
  ARCHIVED_CONTACTS_FILTER,
  BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  MAX_CONTACTS_PER_OWNER,
  NO_GROUP_FILTER,
} from "../../../utils/constants";
import { formatShortNpub, getBestNostrName } from "../../../utils/formatting";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { setStoredPushContactNames } from "../../../utils/pushContactNamesStorage";
import {
  getInitialBankPaymentOfferRecipientCount,
  safeLocalStorageGet,
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
} from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { makeLocalId } from "../../../utils/validation";
import { useIdentityOwnersComposition } from "./useIdentityOwnersComposition";
import { useContactEditor } from "../contacts/useContactEditor";
import { useVisibleContacts } from "../contacts/useVisibleContacts";
import {
  buildUnknownContactId,
  isUnknownContactId,
  normalizePubkeyHex,
  readUnknownContactIdPubkey,
} from "../messages/contactIdentity";
import { useChatNostrSyncEffect } from "../messages/useChatNostrSyncEffect";
import {
  useEditChatMessage,
  type EditChatContext,
} from "../messages/useEditChatMessage";
import { useInboxNotificationsSync } from "../messages/useInboxNotificationsSync";
import { useNostrPendingFlush } from "../messages/useNostrPendingFlush";
import {
  useSendChatMessage,
  type ReplyContext,
} from "../messages/useSendChatMessage";
import { useSendReaction } from "../messages/useSendReaction";
import { useContactsDomain } from "../useContactsDomain";
import { useContactsNostrPrefetchEffects } from "../useContactsNostrPrefetchEffects";
import { useEvoluNostrBootstrapReady } from "../useEvoluNostrBootstrapReady";
import { useFeedbackContact } from "../useFeedbackContact";
import { useMessagesDomain } from "../useMessagesDomain";
import { useRelayDomain } from "../useRelayDomain";
import { findUniqueContactByLightningAddress } from "../../lib/contactIdentity";
import { resolveContactRowOwnerLane } from "../../lib/contactOwnerLane";
import {
  createLinkyBankPaymentOfferEvent,
  getLinkyBankPaymentOfferInfo,
  getLinkyBankPaymentOfferStatusRank,
  isLinkyBankPaymentOfferTerminalStatus,
  LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT,
  LINKY_BANK_PAYMENT_OFFER_MAX_RECIPIENT_COUNT,
  LINKY_BANK_PAYMENT_OFFER_MIN_RECIPIENT_COUNT,
  LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC,
  LINKY_BANK_PAYMENT_OFFER_RECIPIENT_STATUS_CURRENCY,
  shouldPushLinkyBankPaymentOfferStatus,
  type LinkyBankPaymentOfferStatus,
} from "../../lib/bankPaymentOffer";
import type { AppNostrPool } from "../../lib/nostrPool";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import {
  publishSingleWrappedWithRetry as publishSingleWrappedWithRetryBase,
  publishWrappedWithRetry as publishWrappedWithRetryBase,
} from "../../lib/nostrPublishRetry";
import { buildLinkyPaymentRequestDeclineMessage } from "../../lib/paymentRequestMessage";
import {
  parsePrivateImageMessage,
  privateImagePreviewText,
} from "../../lib/privateImageMessage";
import {
  wrapEventWithoutPushMarker,
  wrapEventWithPushMarker,
} from "../../lib/pushWrappedEvent";
import type {
  ContactRowLike,
  LocalNostrMessage,
  PaymentLogData,
  PublishWrappedResult,
} from "../../types/appTypes";

const inMemoryNostrPictureCache = new Map<string, string | null>();

const INLINE_NPUB_PATTERN =
  /(?:nostr:)?npub1[023456789acdefghjklmnpqrstuvwxyz]+(?:@npub\.cash)?/gi;

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

const extractMentionedNpubs = (content: string): string[] => {
  const matches = String(content ?? "").match(INLINE_NPUB_PATTERN);
  if (!matches) return [];

  const seen = new Set<string>();
  const npubs: string[] = [];

  for (const match of matches) {
    const npub = normalizeNpubIdentifier(match);
    if (!npub || seen.has(npub)) continue;
    seen.add(npub);
    npubs.push(npub);
  }

  return npubs;
};

const clampBankPaymentOfferRecipientCount = (value: number): number => {
  if (!Number.isFinite(value)) {
    return LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT;
  }

  return Math.min(
    LINKY_BANK_PAYMENT_OFFER_MAX_RECIPIENT_COUNT,
    Math.max(LINKY_BANK_PAYMENT_OFFER_MIN_RECIPIENT_COUNT, Math.round(value)),
  );
};

interface UnknownChatContact extends ContactRowLike {
  id: string;
  isUnknownContact: true;
  unknownPubkeyHex: string | null;
}

export type DisplayContact = ContactRowLike & {
  isUnknownContact?: boolean;
  unknownPubkeyHex?: string | null;
};

interface ChatSelectedContact {
  groupName?: string | null;
  id: string;
  isUnknownContact?: boolean;
  lnAddress?: string | null;
  name?: string | null;
  npub?: string | null;
  unknownPubkeyHex?: string | null;
}

const encodeUnknownNpub = (pubkeyHex: string | null): string | null => {
  if (!pubkeyHex) return null;
  try {
    return nip19.npubEncode(pubkeyHex);
  } catch {
    return null;
  }
};

type IdentityOwnersCompositionResult = ReturnType<
  typeof useIdentityOwnersComposition
>;
type EvoluMutations = ReturnType<typeof useEvolu>;
type NostrBootstrapParams = Parameters<typeof useEvoluNostrBootstrapReady>[0];

interface UseContactsMessagingCompositionParams {
  activeSyncedNostrIdentity: IdentityOwnersCompositionResult["activeSyncedNostrIdentity"];
  appOwnerId: IdentityOwnersCompositionResult["appOwnerId"];
  appOwnerIdRef: IdentityOwnersCompositionResult["appOwnerIdRef"];
  cashuOwnerId: IdentityOwnersCompositionResult["cashuOwnerId"];
  cashuTokensAll: NostrBootstrapParams["tokensSnapshot"];
  contactPayBackToChatRef: React.MutableRefObject<ContactId | null>;
  contactsOwnerId: IdentityOwnersCompositionResult["contactsOwnerId"];
  contactsOwnerNewContactsCount: number;
  contactsVisibleOwnerIds: IdentityOwnersCompositionResult["contactsVisibleOwnerIds"];
  copyText: (value: string) => Promise<void>;
  currentNpub: string | null;
  currentNsec: string | null;
  formatDisplayedAmountText: (amountSat: number) => string;
  historicalOwnerSetsReady: boolean;
  identityOwnerId: IdentityOwnersCompositionResult["identityOwnerId"];
  insert: EvoluMutations["insert"];
  isSeedLogin: boolean;
  lang: Lang;
  legacyIdentitiesOwnerId: IdentityOwnersCompositionResult["legacyIdentitiesOwnerId"];
  legacyMessagesIdentityOwnerId: IdentityOwnersCompositionResult["legacyMessagesIdentityOwnerId"];
  logPayStep: (step: string, data?: PaymentLogData) => void;
  maybeShowPwaNotification: (
    title: string,
    body: string,
    tag?: string,
  ) => Promise<void>;
  messagesOwnerId: IdentityOwnersCompositionResult["messagesOwnerId"];
  messagesOwnerIdRef: IdentityOwnersCompositionResult["messagesOwnerIdRef"];
  messagesVisibleOwnerIds: IdentityOwnersCompositionResult["messagesVisibleOwnerIds"];
  metaOwnerId: IdentityOwnersCompositionResult["metaOwnerId"];
  nostrIdentityRows: NostrBootstrapParams["identitiesSnapshot"];
  pushToast: (message: string) => void;
  route: ReturnType<typeof useRouting>;
  setContactPaymentIntent: React.Dispatch<
    React.SetStateAction<"pay" | "request">
  >;
  setPayAmount: React.Dispatch<React.SetStateAction<string>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  syncedNostrIdentityMatchesLocal: boolean;
  syncedNostrIdentityResolution: IdentityOwnersCompositionResult["syncedNostrIdentityResolution"];
  t: (key: string) => string;
  transactionsBootstrapSnapshot: NostrBootstrapParams["transactionsSnapshot"];
  transactionsOwnerId: IdentityOwnersCompositionResult["transactionsOwnerId"];
  update: EvoluMutations["update"];
  upsert: EvoluMutations["upsert"];
}

export const useContactsMessagingComposition = ({
  activeSyncedNostrIdentity,
  appOwnerId,
  appOwnerIdRef,
  cashuOwnerId,
  cashuTokensAll,
  contactPayBackToChatRef,
  contactsOwnerId,
  contactsOwnerNewContactsCount,
  contactsVisibleOwnerIds,
  copyText,
  currentNpub,
  currentNsec,
  formatDisplayedAmountText,
  historicalOwnerSetsReady,
  identityOwnerId,
  insert,
  isSeedLogin,
  lang,
  legacyIdentitiesOwnerId,
  legacyMessagesIdentityOwnerId,
  logPayStep,
  maybeShowPwaNotification,
  messagesOwnerId,
  messagesOwnerIdRef,
  messagesVisibleOwnerIds,
  metaOwnerId,
  nostrIdentityRows,
  pushToast,
  route,
  setContactPaymentIntent,
  setPayAmount,
  setStatus,
  syncedNostrIdentityMatchesLocal,
  syncedNostrIdentityResolution,
  t,
  transactionsBootstrapSnapshot,
  transactionsOwnerId,
  update,
  upsert,
}: UseContactsMessagingCompositionParams) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<ContactId | null>(
    null,
  );

  const [recentlyAddedContactId, setRecentlyAddedContactId] =
    useState<ContactId | null>(null);

  const [contactsOnboardingHasPaid, setContactsOnboardingHasPaid] =
    useState<boolean>(
      () =>
        safeLocalStorageGet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY) === "1",
    );

  const [
    contactsOnboardingHasBackedUpKeys,
    setContactsOnboardingHasBackedUpKeys,
  ] = useState<boolean>(
    () =>
      safeLocalStorageGet(CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY) ===
      "1",
  );

  // Ephemeral per-contact activity indicator.
  // When a message/payment arrives, we show a dot and temporarily bump the
  // contact to the top until the user opens it.
  const [contactAttentionById, setContactAttentionById] = useState<
    Record<string, number>
  >(() => ({}));

  const [
    bankPaymentOfferRecipientCount,
    setBankPaymentOfferRecipientCountState,
  ] = useState<number>(() =>
    clampBankPaymentOfferRecipientCount(
      getInitialBankPaymentOfferRecipientCount(
        LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT,
      ),
    ),
  );

  const setBankPaymentOfferRecipientCount = React.useCallback(
    (value: number) => {
      setBankPaymentOfferRecipientCountState(
        clampBankPaymentOfferRecipientCount(value),
      );
    },
    [],
  );

  const [chatOwnPubkeyHex, setChatOwnPubkeyHex] = useState<string | null>(null);

  React.useEffect(() => {
    if (!currentNsec) {
      setChatOwnPubkeyHex(null);
      return;
    }

    let cancelled = false;
    void import("nostr-tools")
      .then(({ getPublicKey, nip19 }) => {
        const decoded = nip19.decode(currentNsec);
        if (decoded.type !== "nsec" || !(decoded.data instanceof Uint8Array)) {
          if (!cancelled) setChatOwnPubkeyHex(null);
          return;
        }
        if (!cancelled) {
          setChatOwnPubkeyHex(getPublicKey(decoded.data));
        }
      })
      .catch(() => {
        if (!cancelled) setChatOwnPubkeyHex(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentNsec]);

  const [nostrPictureByNpub, setNostrPictureByNpub] = useState<
    Record<string, string | null>
  >(() => Object.fromEntries(inMemoryNostrPictureCache.entries()));

  const [nostrStatusByNpub, setNostrStatusByNpub] = useState<
    Record<string, string | null>
  >({});

  const avatarObjectUrlsByNpubRef = React.useRef<Map<string, string>>(
    new Map(),
  );

  React.useEffect(() => {
    const objectUrls = avatarObjectUrlsByNpubRef.current;
    return () => {
      for (const url of objectUrls.values()) {
        if (!url.startsWith("blob:")) continue;
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      objectUrls.clear();
      inMemoryNostrPictureCache.clear();
    };
  }, [currentNsec]);

  const rememberBlobAvatarUrl = React.useCallback(
    (npub: string, url: string | null): string | null => {
      const key = String(npub ?? "").trim();
      if (!key) return url;

      const existing = avatarObjectUrlsByNpubRef.current.get(key);

      if (url && url.startsWith("blob:")) {
        if (existing && existing !== url) {
          try {
            URL.revokeObjectURL(existing);
          } catch {
            // ignore
          }
        }
        avatarObjectUrlsByNpubRef.current.set(key, url);
        return url;
      }

      if (existing && existing.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(existing);
        } catch {
          // ignore
        }
      }

      avatarObjectUrlsByNpubRef.current.delete(key);
      return url;
    },
    [],
  );

  const [chatDraft, setChatDraft] = useState<string>("");

  const [chatSendIsBusy, setChatSendIsBusy] = useState(false);

  const [replyContext, setReplyContext] = useState<ReplyContext | null>(null);

  const replyContextRef = React.useRef<ReplyContext | null>(null);

  const [editContext, setEditContext] = useState<EditChatContext | null>(null);

  const activeNostrMessagePublishClientIdsRef = React.useRef<Set<string>>(
    new Set(),
  );

  const chatSeenWrapIdsRef = React.useRef<Set<string>>(new Set());

  const autoAcceptedChatMessageIdsRef = React.useRef<Set<string>>(new Set());

  const activeChatRouteId = route.kind === "chat" ? String(route.id ?? "") : "";

  React.useEffect(() => {
    if (route.kind === "chat") return;
    setReplyContext(null);
    setEditContext(null);
  }, [route.kind]);

  React.useEffect(() => {
    if (!activeChatRouteId) return;
    setReplyContext(null);
    setEditContext(null);
  }, [activeChatRouteId]);

  React.useEffect(() => {
    replyContextRef.current = replyContext;
  }, [replyContext]);

  React.useEffect(() => {
    for (const [npub, url] of Object.entries(nostrPictureByNpub)) {
      inMemoryNostrPictureCache.set(npub, url ?? null);
    }
  }, [nostrPictureByNpub]);

  const chatMessagesRef = React.useRef<HTMLDivElement | null>(null);

  const chatMessageElByIdRef = React.useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );

  const [bankPaymentOfferMessages, setBankPaymentOfferMessages] = useState<
    LocalNostrMessage[]
  >([]);

  const bankPaymentOfferSpdPayloadByOfferIdRef = React.useRef<
    Map<string, string>
  >(new Map());

  const autoSentBankDetailsOfferIdsRef = React.useRef<Set<string>>(new Set());

  const bankPaymentOfferExpiryInFlightRef = React.useRef(false);

  const chatDidInitialScrollForContactRef = React.useRef<string | null>(null);

  const chatForceScrollToBottomRef = React.useRef(false);

  const chatScrollTargetIdRef = React.useRef<string | null>(null);

  const chatLastMessageCountRef = React.useRef<Record<string, number>>({});

  const triggerChatScrollToBottom = React.useCallback((messageId?: string) => {
    chatForceScrollToBottomRef.current = true;
    if (messageId) chatScrollTargetIdRef.current = messageId;

    const tryScroll = (attempt: number) => {
      const targetId = chatScrollTargetIdRef.current;
      if (targetId) {
        const el = chatMessageElByIdRef.current.get(targetId);
        if (el) {
          el.scrollIntoView({ block: "end" });
          return;
        }
      }

      const c = chatMessagesRef.current;
      if (c) c.scrollTop = c.scrollHeight;

      if (attempt < 6) {
        requestAnimationFrame(() => tryScroll(attempt + 1));
      }
    };

    requestAnimationFrame(() => tryScroll(0));
  }, []);

  const upsertBankPaymentOfferMessage = React.useCallback(
    (message: LocalNostrMessage) => {
      const messageContactId = String(message.contactId ?? "").trim();
      const messageWrapId = String(message.wrapId ?? "").trim();
      const messageClientId = String(message.clientId ?? "").trim();
      const messageId = String(message.id ?? "").trim();
      const messageOfferId =
        getLinkyBankPaymentOfferInfo(String(message.content ?? ""))?.offerId ??
        "";
      const messageOfferKey =
        messageOfferId && messageContactId
          ? `${messageContactId}:${messageOfferId}`
          : "";

      setBankPaymentOfferMessages((prev) => {
        const existingOfferMessage = messageOfferKey
          ? (prev.find((existing) => {
              const existingContactId = String(existing.contactId ?? "").trim();
              const existingOfferId = getLinkyBankPaymentOfferInfo(
                String(existing.content ?? ""),
              )?.offerId;
              return (
                `${existingContactId}:${existingOfferId ?? ""}` ===
                messageOfferKey
              );
            }) ?? null)
          : null;
        const next = prev.filter((existing) => {
          const existingContactId = String(existing.contactId ?? "").trim();
          const existingOfferId = getLinkyBankPaymentOfferInfo(
            String(existing.content ?? ""),
          )?.offerId;
          if (
            messageOfferKey &&
            `${existingContactId}:${existingOfferId ?? ""}` === messageOfferKey
          ) {
            return false;
          }

          const existingWrapId = String(existing.wrapId ?? "").trim();
          const existingClientId = String(existing.clientId ?? "").trim();
          const existingId = String(existing.id ?? "").trim();

          if (messageWrapId && existingWrapId === messageWrapId) return false;
          if (messageClientId && existingClientId === messageClientId) {
            return false;
          }
          if (messageId && existingId === messageId) return false;
          return true;
        });

        const mergedMessage = existingOfferMessage
          ? (() => {
              const existingInfo = getLinkyBankPaymentOfferInfo(
                String(existingOfferMessage.content ?? ""),
              );
              const messageInfo = getLinkyBankPaymentOfferInfo(
                String(message.content ?? ""),
              );
              const existingCreatedAt =
                Number(existingOfferMessage.createdAtSec ?? 0) || 0;
              const messageCreatedAt = Number(message.createdAtSec ?? 0) || 0;
              const existingUpdatedAt =
                existingInfo?.statusUpdatedAtSec ?? existingCreatedAt;
              const messageUpdatedAt =
                messageInfo?.statusUpdatedAtSec ?? messageCreatedAt;
              const latest =
                messageUpdatedAt > existingUpdatedAt
                  ? message
                  : messageUpdatedAt < existingUpdatedAt
                    ? existingOfferMessage
                    : messageInfo && existingInfo
                      ? getLinkyBankPaymentOfferStatusRank(
                          messageInfo.status,
                        ) >=
                        getLinkyBankPaymentOfferStatusRank(existingInfo.status)
                        ? message
                        : existingOfferMessage
                      : messageCreatedAt >= existingCreatedAt
                        ? message
                        : existingOfferMessage;

              return {
                ...existingOfferMessage,
                ...latest,
                contactId: existingOfferMessage.contactId,
                createdAtSec:
                  existingCreatedAt && messageCreatedAt
                    ? Math.min(existingCreatedAt, messageCreatedAt)
                    : existingCreatedAt || messageCreatedAt,
                direction: existingOfferMessage.direction,
                id: messageOfferKey
                  ? `bank-payment-offer:${messageOfferKey}`
                  : latest.id,
              };
            })()
          : messageOfferKey
            ? {
                ...message,
                id: `bank-payment-offer:${messageOfferKey}`,
              }
            : message;

        next.push(mergedMessage);
        next.sort((a, b) => {
          const createdA = Number(a.createdAtSec ?? 0);
          const createdB = Number(b.createdAtSec ?? 0);
          return createdA - createdB;
        });
        return next;
      });
    },
    [],
  );

  const nostrInFlight = React.useRef<Set<string>>(new Set());

  const nostrMetadataInFlight = React.useRef<Set<string>>(new Set());

  const nostrStatusInFlight = React.useRef<Set<string>>(new Set());

  const pendingUnknownContactAddRef = React.useRef<{
    sourceContactId: string;
    targetNpub: string;
  } | null>(null);

  const visibleMessageOwnerIds = React.useMemo(() => {
    const ids = [
      String(appOwnerId ?? "").trim(),
      ...messagesVisibleOwnerIds.map((ownerId) => String(ownerId ?? "").trim()),
    ].filter(Boolean);
    return Array.from(new Set(ids));
  }, [appOwnerId, messagesVisibleOwnerIds]);

  const contactNameCollator = useMemo(
    () =>
      new Intl.Collator(lang, {
        usage: "sort",
        numeric: true,
        sensitivity: "variant",
      }),
    [lang],
  );

  const reassignContactMessagesRef = React.useRef<
    (fromContactId: string, toContactId: string) => number
  >(() => 0);

  const reassignContactMessages = React.useCallback(
    (fromContactId: string, toContactId: string) =>
      reassignContactMessagesRef.current(fromContactId, toContactId),
    [],
  );

  const {
    activeGroup,
    contacts,
    contactsSearch,
    contactsSearchInputRef,
    contactsSearchParts,
    dedupeContacts,
    dedupeContactsIsBusy,
    groupCounts,
    groupNames,
    selectedContact,
    setActiveGroup,
    setContactsSearch,
    ungroupedCount,
  } = useContactsDomain({
    appOwnerId: contactsOwnerId,
    currentNsec,
    isSeedLogin,
    noGroupFilterValue: NO_GROUP_FILTER,
    pushToast,
    reassignContactMessages,
    route,
    t,
    update,
    upsert,
    visibleOwnerIds: contactsVisibleOwnerIds,
  });

  const contactsLatestRef = React.useRef(contacts);

  contactsLatestRef.current = contacts;

  React.useEffect(() => {
    const records = [];

    for (const contact of contacts) {
      const name = String(contact.name ?? "").trim();
      const npub = normalizeNpubIdentifier(contact.npub);
      if (!name || !npub) continue;

      try {
        const decoded = nip19.decode(npub);
        if (decoded.type !== "npub" || typeof decoded.data !== "string") {
          continue;
        }

        const pubkey = decoded.data.trim();
        if (!pubkey) continue;
        records.push({ name, npub, pubkey });
      } catch {
        // ignore invalid contact npubs
      }
    }

    void setStoredPushContactNames(records);
  }, [contacts]);

  const activeContactsOwnerContactCount = contactsOwnerNewContactsCount;

  const {
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    enqueuePendingPayment,
    knownNostrMessageIdentityIndex,
    lastMessageByContactId,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    nostrReactionsLocal,
    pendingPayments,
    reactionsByMessageId,
    reassignLocalNostrMessagesContactId,
    removeLocalNostrMessagesByContactId,
    removePendingPayment,
    softDeleteLocalNostrReaction,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  } = useMessagesDomain({
    appOwnerId,
    appOwnerIdRef,
    chatForceScrollToBottomRef,
    chatMessagesRef,
    messagesOwnerId,
    messagesOwnerIdRef,
    route,
    visibleMessageOwnerIds,
  });

  reassignContactMessagesRef.current = reassignLocalNostrMessagesContactId;

  const pendingArchivedContactThreadIdsRef = React.useRef(
    new Map<string, string>(),
  );

  const evoluOwnersReadyForNostr = isSeedLogin
    ? Boolean(
        cashuOwnerId &&
        contactsOwnerId &&
        identityOwnerId &&
        legacyIdentitiesOwnerId &&
        legacyMessagesIdentityOwnerId &&
        messagesOwnerId &&
        metaOwnerId &&
        transactionsOwnerId,
      ) && historicalOwnerSetsReady
    : Boolean(appOwnerId);

  const evoluNostrOwnerKey = React.useMemo(() => {
    if (!currentNpub || !evoluOwnersReadyForNostr) return "";

    return [
      currentNpub,
      appOwnerId,
      cashuOwnerId,
      contactsOwnerId,
      identityOwnerId,
      legacyIdentitiesOwnerId,
      legacyMessagesIdentityOwnerId,
      messagesOwnerId,
      metaOwnerId,
      transactionsOwnerId,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("|");
  }, [
    appOwnerId,
    cashuOwnerId,
    contactsOwnerId,
    currentNpub,
    evoluOwnersReadyForNostr,
    identityOwnerId,
    legacyIdentitiesOwnerId,
    legacyMessagesIdentityOwnerId,
    messagesOwnerId,
    metaOwnerId,
    transactionsOwnerId,
  ]);

  const nostrIdentityBootstrapReady =
    Boolean(activeSyncedNostrIdentity) &&
    !syncedNostrIdentityResolution.shouldMigrateLegacyIdentity &&
    syncedNostrIdentityMatchesLocal;

  const [
    missingSyncedIdentityFallbackKey,
    setMissingSyncedIdentityFallbackKey,
  ] = React.useState("");

  React.useEffect(() => {
    if (!isSeedLogin || !evoluNostrOwnerKey || activeSyncedNostrIdentity) {
      setMissingSyncedIdentityFallbackKey("");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMissingSyncedIdentityFallbackKey(evoluNostrOwnerKey);
    }, 8_000);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSyncedNostrIdentity, evoluNostrOwnerKey, isSeedLogin]);

  const identityBootstrapReady = isSeedLogin
    ? nostrIdentityBootstrapReady ||
      missingSyncedIdentityFallbackKey === evoluNostrOwnerKey
    : true;

  const nostrBootstrapReady = useEvoluNostrBootstrapReady({
    contactsSnapshot: contacts,
    enabled: Boolean(currentNsec),
    identitiesSnapshot: nostrIdentityRows,
    identityReady: identityBootstrapReady,
    messagesSnapshot: nostrMessagesLocal,
    ownerKey: evoluNostrOwnerKey,
    reactionsSnapshot: nostrReactionsLocal,
    tokensSnapshot: cashuTokensAll,
    transactionsSnapshot: transactionsBootstrapSnapshot,
  });

  const {
    canSaveNewRelay,
    connectedRelayCount,
    newRelayUrl,
    nostrFetchRelays,
    nostrRelayOverallStatus,
    pendingRelayDeleteUrl,
    relayStatusByUrl,
    relayUrls,
    requestDeleteSelectedRelay,
    saveNewRelay,
    selectedRelayUrl,
    setNewRelayUrl,
  } = useRelayDomain({
    currentNpub,
    currentNsec,
    networkEnabled: nostrBootstrapReady,
    route,
    setStatus,
    t,
  });

  const [contactNewPrefill, setContactNewPrefill] = React.useState<null | {
    lnAddress: string;
    npub: string | null;
    suggestedName: string | null;
  }>(null);

  useContactsNostrPrefetchEffects({
    appOwnerId: contactsOwnerId,
    canFetchFromNostr: nostrBootstrapReady,
    contacts,
    nostrFetchRelays,
    nostrInFlight,
    nostrMetadataInFlight,
    nostrStatusByNpub,
    nostrStatusInFlight,
    rememberBlobAvatarUrl,
    routeKind: route.kind,
    setNostrPictureByNpub,
    setNostrStatusByNpub,
    update,
    visibleOwnerIds: contactsVisibleOwnerIds,
  });

  const [unknownNameByNpub, setUnknownNameByNpub] = useState<
    Record<string, string | null>
  >({});

  const buildUnknownDisplayName = React.useCallback(
    (name: string | null, npub: string | null) => {
      const prefix = t("unknownContactNamePrefix");
      const normalizedName = String(name ?? "").trim();
      const fallback = npub ? formatShortNpub(npub) : t("unknownContactTitle");
      return `${prefix} ${normalizedName || fallback}`.trim();
    },
    [t],
  );

  const buildSavedContactName = React.useCallback(
    (name: string | null, npub: string | null) => {
      const normalizedName = String(name ?? "").trim();
      return (
        normalizedName ||
        (npub ? formatShortNpub(npub) : t("unknownContactTitle"))
      );
    },
    [t],
  );

  const unknownContacts = React.useMemo<UnknownChatContact[]>(() => {
    const blockedPubkeys = new Set(
      safeLocalStorageGetJson(BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY, [])
        .map((entry) => normalizePubkeyHex(entry))
        .filter((entry): entry is string => Boolean(entry)),
    );

    const unknownById = new Map<string, UnknownChatContact>();

    for (const [contactId, lastMessage] of lastMessageByContactId.entries()) {
      const normalizedContactId = String(contactId ?? "").trim();
      if (!normalizedContactId) continue;
      if (!isUnknownContactId(normalizedContactId)) continue;

      const candidatePubkeyFromLast = normalizePubkeyHex(lastMessage.pubkey);
      const candidatePubkeyFromId =
        readUnknownContactIdPubkey(normalizedContactId);
      const candidatePubkeyFromThread = nostrMessagesLocal
        .filter(
          (message) =>
            String(message.contactId ?? "").trim() === normalizedContactId,
        )
        .map((message) => normalizePubkeyHex(message.pubkey))
        .find((pubkey) => {
          if (!pubkey) return false;
          if (blockedPubkeys.has(pubkey)) return false;
          const ownPubkey = normalizePubkeyHex(chatOwnPubkeyHex);
          if (ownPubkey && ownPubkey === pubkey) return false;
          return true;
        });

      const unknownPubkeyHex =
        candidatePubkeyFromId ??
        candidatePubkeyFromThread ??
        candidatePubkeyFromLast ??
        null;
      if (unknownPubkeyHex && blockedPubkeys.has(unknownPubkeyHex)) continue;
      const ownPubkey = normalizePubkeyHex(chatOwnPubkeyHex);
      if (unknownPubkeyHex && ownPubkey && unknownPubkeyHex === ownPubkey) {
        continue;
      }

      const unknownNpub = encodeUnknownNpub(unknownPubkeyHex);
      const bestName = unknownNpub
        ? (unknownNameByNpub[unknownNpub] ?? null)
        : null;

      unknownById.set(normalizedContactId, {
        id: normalizedContactId,
        name: buildUnknownDisplayName(bestName, unknownNpub),
        npub: unknownNpub,
        lnAddress: null,
        groupName: null,
        isUnknownContact: true,
        unknownPubkeyHex,
      });
    }

    return Array.from(unknownById.values());
  }, [
    buildUnknownDisplayName,
    chatOwnPubkeyHex,
    lastMessageByContactId,
    nostrMessagesLocal,
    unknownNameByNpub,
  ]);

  React.useEffect(() => {
    const activeContacts = contacts.filter((contact) => {
      const archivedAtSec = Number(contact.archivedAtSec ?? 0);
      return !Number.isFinite(archivedAtSec) || archivedAtSec <= 0;
    });

    for (const unknownContact of unknownContacts) {
      const unknownContactId = String(unknownContact.id ?? "").trim();
      const unknownNpub = normalizeNpubIdentifier(unknownContact.npub);
      if (!unknownContactId || !unknownNpub) continue;

      let knownContact = activeContacts.find((contact) => {
        const knownContactId = String(contact.id ?? "").trim();
        if (!knownContactId || knownContactId === unknownContactId) {
          return false;
        }
        return normalizeNpubIdentifier(contact.npub) === unknownNpub;
      });

      let matchedByLightningAddress = false;
      let matchedMetadata: NostrProfileMetadata | null = null;
      if (!knownContact) {
        matchedMetadata =
          loadCachedProfileMetadata(unknownNpub)?.metadata ?? null;
        const profileLightningAddress = matchedMetadata
          ? omitSyntheticContactLightningAddress(
              String(matchedMetadata.lud16 ?? "").trim() ||
                String(matchedMetadata.lud06 ?? "").trim(),
              unknownNpub,
            )
          : "";
        const lightningContact = findUniqueContactByLightningAddress(
          activeContacts,
          profileLightningAddress,
        );
        if (lightningContact) {
          knownContact = lightningContact;
          matchedByLightningAddress = true;
        }
      }

      const knownContactId = String(knownContact?.id ?? "").trim();
      if (!knownContactId) continue;

      if (matchedByLightningAddress && knownContact) {
        const bestName = matchedMetadata
          ? getBestNostrName(matchedMetadata)
          : null;
        const parsedNpub = Evolu.NonEmptyString1000.fromUnknown(unknownNpub);
        if (!parsedNpub.ok) continue;
        const parsedName = bestName
          ? Evolu.NonEmptyString1000.fromUnknown(bestName)
          : null;
        const ownerId =
          resolveContactRowOwnerLane(knownContact, contactsVisibleOwnerIds) ??
          contactsOwnerId;
        const payload = {
          id: knownContact.id,
          npub: parsedNpub.value,
          ...(!String(knownContact.name ?? "").trim() && parsedName?.ok
            ? { name: parsedName.value }
            : {}),
        };
        const result = ownerId
          ? update("contact", payload, { ownerId })
          : update("contact", payload);
        if (!result.ok) continue;
      }

      reassignLocalNostrMessagesContactId(unknownContactId, knownContactId);
      setContactAttentionById((prev) => {
        if (prev[unknownContactId] === undefined) return prev;
        const next = { ...prev };
        delete next[unknownContactId];
        return next;
      });
    }
  }, [
    contacts,
    contactsOwnerId,
    contactsVisibleOwnerIds,
    reassignLocalNostrMessagesContactId,
    setContactAttentionById,
    unknownContacts,
    update,
  ]);

  const unknownContactNpubs = React.useMemo(() => {
    const seen = new Set<string>();
    const npubs: string[] = [];

    for (const contact of unknownContacts) {
      const npub = normalizeNpubIdentifier(contact.npub);
      if (!npub) continue;
      if (seen.has(npub)) continue;
      seen.add(npub);
      npubs.push(npub);
    }

    return npubs;
  }, [unknownContacts]);

  const chatMentionedNpubs = React.useMemo(() => {
    const seen = new Set<string>();
    const npubs: string[] = [];

    for (const message of chatMessages) {
      for (const npub of extractMentionedNpubs(String(message.content ?? ""))) {
        if (seen.has(npub)) continue;
        seen.add(npub);
        npubs.push(npub);
      }
    }

    return npubs;
  }, [chatMessages]);

  const prefetchedMessageNpubs = React.useMemo(() => {
    const seen = new Set<string>();
    const npubs: string[] = [];

    for (const npub of unknownContactNpubs) {
      if (seen.has(npub)) continue;
      seen.add(npub);
      npubs.push(npub);
    }

    for (const npub of chatMentionedNpubs) {
      if (seen.has(npub)) continue;
      seen.add(npub);
      npubs.push(npub);
    }

    return npubs;
  }, [chatMentionedNpubs, unknownContactNpubs]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const npub of prefetchedMessageNpubs) {
        if (unknownNameByNpub[npub] !== undefined) continue;

        const cached = loadCachedProfileMetadata(npub);
        if (cached) {
          const cachedName = cached.metadata
            ? getBestNostrName(cached.metadata)
            : null;
          if (!cancelled) {
            setUnknownNameByNpub((prev) =>
              prev[npub] !== undefined ? prev : { ...prev, [npub]: cachedName },
            );
          }
          continue;
        }

        if (!nostrBootstrapReady) continue;

        if (nostrMetadataInFlight.current.has(npub)) continue;
        nostrMetadataInFlight.current.add(npub);

        try {
          const metadata = await fetchNostrProfileMetadata(npub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          });
          saveCachedProfileMetadata(npub, metadata);
          if (cancelled) return;
          setUnknownNameByNpub((prev) => ({
            ...prev,
            [npub]: metadata ? getBestNostrName(metadata) : null,
          }));
        } catch {
          saveCachedProfileMetadata(npub, null);
          if (cancelled) return;
          setUnknownNameByNpub((prev) => ({
            ...prev,
            [npub]: null,
          }));
        } finally {
          nostrMetadataInFlight.current.delete(npub);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    nostrBootstrapReady,
    nostrFetchRelays,
    nostrMetadataInFlight,
    prefetchedMessageNpubs,
    unknownNameByNpub,
  ]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const npub of prefetchedMessageNpubs) {
        const cached = loadCachedProfilePicture(npub);
        const shouldRefreshCachedPicture = isCachedProfilePictureStale(cached);

        if (cached) {
          setNostrPictureByNpub((prev) =>
            prev[npub] === cached.url ? prev : { ...prev, [npub]: cached.url },
          );
        }

        try {
          const blobUrl = await loadCachedProfileAvatarObjectUrl(npub);
          if (cancelled) return;
          if (blobUrl) {
            setNostrPictureByNpub((prev) => ({
              ...prev,
              [npub]: rememberBlobAvatarUrl(npub, blobUrl),
            }));
            if (!shouldRefreshCachedPicture) continue;
          }
        } catch {
          // ignore
        }

        if (cached && !shouldRefreshCachedPicture) continue;

        if (!nostrBootstrapReady) continue;

        if (nostrInFlight.current.has(npub)) continue;
        nostrInFlight.current.add(npub);

        try {
          if (cached && shouldRefreshCachedPicture) {
            const metadata = await fetchNostrProfileMetadata(npub, {
              signal: controller.signal,
              relays: nostrFetchRelays,
            });
            if (cancelled) return;
            if (!metadata) continue;

            saveCachedProfileMetadata(npub, metadata);
            const refreshedUrl = getNostrProfilePictureUrl(metadata);
            if (refreshedUrl) {
              saveCachedProfilePicture(npub, refreshedUrl);
              const blobUrl = await cacheProfileAvatarFromUrl(
                npub,
                refreshedUrl,
                {
                  signal: controller.signal,
                },
              );
              if (cancelled) return;
              setNostrPictureByNpub((prev) => ({
                ...prev,
                [npub]: rememberBlobAvatarUrl(npub, blobUrl || refreshedUrl),
              }));
            } else {
              saveCachedProfilePicture(npub, null);
              void deleteCachedProfileAvatar(npub);
              rememberBlobAvatarUrl(npub, null);
              setNostrPictureByNpub((prev) => ({
                ...prev,
                [npub]: null,
              }));
            }
          } else {
            const url = await fetchNostrProfilePicture(npub, {
              signal: controller.signal,
              relays: nostrFetchRelays,
            });
            saveCachedProfilePicture(npub, url);
            if (cancelled) return;

            if (url) {
              const blobUrl = await cacheProfileAvatarFromUrl(npub, url, {
                signal: controller.signal,
              });
              if (cancelled) return;
              setNostrPictureByNpub((prev) => ({
                ...prev,
                [npub]: rememberBlobAvatarUrl(npub, blobUrl || url),
              }));
            } else {
              setNostrPictureByNpub((prev) => {
                const existing = prev[npub];
                if (typeof existing === "string" && existing.trim())
                  return prev;
                if (existing === null) return prev;
                return { ...prev, [npub]: null };
              });
            }
          }
        } catch {
          if (cancelled) return;
          if (!cached) {
            saveCachedProfilePicture(npub, null);
            setNostrPictureByNpub((prev) => {
              const existing = prev[npub];
              if (typeof existing === "string" && existing.trim()) return prev;
              if (existing === null) return prev;
              return { ...prev, [npub]: null };
            });
          }
        } finally {
          nostrInFlight.current.delete(npub);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    nostrBootstrapReady,
    nostrFetchRelays,
    nostrInFlight,
    prefetchedMessageNpubs,
    rememberBlobAvatarUrl,
    setNostrPictureByNpub,
  ]);

  const unknownContactById = React.useMemo(() => {
    const byId = new Map<string, UnknownChatContact>();
    for (const contact of unknownContacts) {
      const id = String(contact.id ?? "").trim();
      if (!id) continue;
      byId.set(id, contact);
    }
    return byId;
  }, [unknownContacts]);

  const selectedChatContact = React.useMemo<ChatSelectedContact | null>(() => {
    if (route.kind !== "chat" && route.kind !== "bankPaymentOffer") return null;

    const chatId = String(
      route.kind === "chat" ? route.id : route.chatId,
    ).trim();
    if (!chatId) return null;

    const source = selectedContact ?? unknownContactById.get(chatId) ?? null;
    if (!source) return null;

    const normalizedId = String(source.id ?? "").trim();
    if (!normalizedId) return null;

    const normalizedNpub = normalizeNpubIdentifier(source.npub);
    const normalizedUnknownPubkeyHex = normalizePubkeyHex(
      readObjectField(source, "unknownPubkeyHex"),
    );
    const sourceGroupName = String(source.groupName ?? "").trim();
    const isUnknownContact =
      readObjectField(source, "isUnknownContact") === true;

    return {
      id: normalizedId,
      ...(sourceGroupName ? { groupName: sourceGroupName } : {}),
      ...(source.name !== undefined
        ? { name: String(source.name ?? "").trim() || null }
        : {}),
      ...(source.lnAddress !== undefined
        ? { lnAddress: String(source.lnAddress ?? "").trim() || null }
        : {}),
      ...(normalizedNpub ? { npub: normalizedNpub } : {}),
      ...(normalizedUnknownPubkeyHex
        ? { unknownPubkeyHex: normalizedUnknownPubkeyHex }
        : {}),
      ...(isUnknownContact ? { isUnknownContact: true } : {}),
    };
  }, [route, selectedContact, unknownContactById]);

  const displayContacts = React.useMemo<DisplayContact[]>(() => {
    return [...contacts, ...unknownContacts];
  }, [contacts, unknownContacts]);

  const displayContactById = React.useMemo(() => {
    const byId = new Map<string, DisplayContact>();
    for (const contact of displayContacts) {
      const id = String(contact.id ?? "").trim();
      if (!id) continue;
      byId.set(id, contact);
    }
    return byId;
  }, [displayContacts]);

  const displayContactsSearchData = React.useMemo(() => {
    return displayContacts.map((contact) => {
      const idKey = String(contact.id ?? "").trim();
      const groupName = String(contact.groupName ?? "").trim();
      const normalizedNpub = normalizeNpubIdentifier(contact.npub);
      const statusFilterValues = normalizedNpub
        ? extractStatusFilterCurrencies(nostrStatusByNpub[normalizedNpub])
        : [];
      const haystack = [
        contact.name,
        contact.npub,
        contact.lnAddress,
        contact.groupName,
        contact.unknownPubkeyHex,
        ...statusFilterValues,
      ]
        .map((value) =>
          String(value ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
        .join(" ");

      return {
        contact,
        idKey,
        groupName,
        haystack,
        statusFilterValues,
      };
    });
  }, [displayContacts, nostrStatusByNpub]);

  const { statusFilterCounts, statusFilterCurrencies } = React.useMemo(() => {
    const currencyCounts = new Map<string, number>();

    for (const contact of displayContacts) {
      const normalizedNpub = normalizeNpubIdentifier(contact.npub);
      if (!normalizedNpub) continue;

      for (const currency of extractStatusFilterCurrencies(
        nostrStatusByNpub[normalizedNpub],
      )) {
        currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
      }
    }

    const currencies = [...currencyCounts.entries()]
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0]);
      })
      .map(([currency]) => currency);
    return {
      statusFilterCounts: currencyCounts,
      statusFilterCurrencies: currencies,
    };
  }, [displayContacts, nostrStatusByNpub]);

  const contactFilterOptions = React.useMemo(() => {
    const options: Array<{ count: number; label: string; value: string }> = [];
    if (ungroupedCount > 0) {
      options.push({
        count: ungroupedCount,
        label: t("noGroup"),
        value: NO_GROUP_FILTER,
      });
    }
    const archivedCount = displayContacts.filter(
      (contact) => Number(contact.archivedAtSec ?? 0) > 0,
    ).length;
    options.push({
      count: archivedCount,
      label: t("archiveFilter"),
      value: ARCHIVED_CONTACTS_FILTER,
    });
    for (const groupName of groupNames) {
      options.push({
        count: groupCounts.get(groupName) ?? 0,
        label: groupName,
        value: groupName,
      });
    }
    for (const currency of statusFilterCurrencies) {
      options.push({
        count: statusFilterCounts.get(currency) ?? 0,
        label: currency,
        value: buildStatusFilterValue(currency),
      });
    }
    return options.sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.label.localeCompare(right.label);
    });
  }, [
    displayContacts,
    groupCounts,
    groupNames,
    statusFilterCounts,
    statusFilterCurrencies,
    t,
    ungroupedCount,
  ]);

  React.useEffect(() => {
    if (activeGroup === ARCHIVED_CONTACTS_FILTER) return;
    if (!isStatusFilterValue(activeGroup)) return;

    const selectedCurrency = parseStatusFilterValue(activeGroup);
    if (!selectedCurrency) {
      setActiveGroup(null);
      return;
    }

    if (!statusFilterCurrencies.includes(selectedCurrency)) {
      setActiveGroup(null);
    }
  }, [activeGroup, setActiveGroup, statusFilterCurrencies]);

  const visibleContacts = useVisibleContacts<DisplayContact>({
    activeGroup,
    contactAttentionById,
    contactNameCollator,
    contactsSearchData: displayContactsSearchData,
    contactsSearchParts,
    lastMessageByContactId,
    noGroupFilterValue: NO_GROUP_FILTER,
    pinnedContactId: recentlyAddedContactId,
  });

  const bankPaymentOfferContacts = React.useMemo(() => {
    const sortedContacts = [
      ...visibleContacts.pinned,
      ...visibleContacts.conversations,
      ...visibleContacts.others,
    ];
    return sortedContacts.flatMap((contact) => {
      const normalizedNpub = normalizeNpubIdentifier(contact.npub);
      if (!normalizedNpub) return [];
      if (
        !extractStatusFilterCurrencies(
          nostrStatusByNpub[normalizedNpub],
        ).includes(LINKY_BANK_PAYMENT_OFFER_RECIPIENT_STATUS_CURRENCY)
      ) {
        return [];
      }

      return [
        {
          ...contact,
          pictureUrl: nostrPictureByNpub[normalizedNpub] ?? null,
        },
      ];
    });
  }, [
    nostrPictureByNpub,
    nostrStatusByNpub,
    visibleContacts.pinned,
    visibleContacts.conversations,
    visibleContacts.others,
  ]);

  const {
    addNewContactFromIdentifier,
    addNewContactFromSearchResult,
    clearContactForm,
    contactEditsSavable,
    contactSuggestions,
    editingId,
    form,
    handleSaveContact,
    isSavingContact,
    openScannedContactPendingNpubRef,
    refreshContactFromNostr,
    resetEditedContactFieldFromNostr,
    searchNewContact,
    setForm,
  } = useContactEditor({
    activeOwnerContactsCount: activeContactsOwnerContactCount,
    appOwnerId: contactsOwnerId,
    contactNewPrefill,
    contacts,
    currentNpub,
    insert,
    nostrFetchRelays,
    route,
    selectedContact,
    setContactNewPrefill,
    setPendingDeleteId,
    setRecentlyAddedContactId,
    setStatus,
    t,
    transactionsOwnerId,
    update,
    upsert,
  });

  const closeContactDetail = React.useCallback(() => {
    clearContactForm();
    setPendingDeleteId(null);
    navigateTo({ route: "contacts" });
  }, [clearContactForm]);

  const openNewContactPage = React.useCallback(() => {
    if (activeContactsOwnerContactCount >= MAX_CONTACTS_PER_OWNER) {
      const message = t("contactsLimitReached").replace(
        "{max}",
        String(MAX_CONTACTS_PER_OWNER),
      );
      pushToast(message);
      return;
    }

    setPendingDeleteId(null);
    setPayAmount("");
    clearContactForm();
    const prefill = contactNewPrefill;
    setContactNewPrefill(null);
    if (prefill) {
      setForm({
        name: String(prefill.suggestedName ?? ""),
        npub: String(prefill.npub ?? ""),
        lnAddress: String(prefill.lnAddress ?? ""),
        group: "",
      });
    }
    navigateTo({ route: "contactNew" });
  }, [
    activeContactsOwnerContactCount,
    clearContactForm,
    contactNewPrefill,
    pushToast,
    setContactNewPrefill,
    setForm,
    setPayAmount,
    t,
  ]);

  const canAddContact =
    activeContactsOwnerContactCount < MAX_CONTACTS_PER_OWNER;

  const publishWrappedWithRetry = React.useCallback(
    async (
      pool: AppNostrPool,
      relays: string[],
      wrapForMe: NostrToolsEvent,
      wrapForContact: NostrToolsEvent,
    ): Promise<PublishWrappedResult> => {
      return await publishWrappedWithRetryBase({
        pool,
        relays,
        wrapForMe,
        wrapForContact,
      });
    },
    [],
  );

  const publishSingleWrappedWithRetry = React.useCallback(
    async (
      pool: AppNostrPool,
      relays: string[],
      event: NostrToolsEvent,
    ): Promise<{ anySuccess: boolean; error: string | null }> => {
      return await publishSingleWrappedWithRetryBase({
        event,
        pool,
        relays,
      });
    },
    [],
  );

  const requestBankPaymentOffer = React.useCallback(
    async (args: {
      amountSat?: unknown;
      amountText: string;
      contacts: readonly { id?: unknown; name?: unknown; npub?: unknown }[];
      spdPayload?: unknown;
    }): Promise<boolean> => {
      const amountSatRaw = Number(args.amountSat ?? 0);
      const amountSat =
        Number.isFinite(amountSatRaw) && amountSatRaw > 0
          ? Math.round(amountSatRaw)
          : null;
      const amountText = String(args.amountText ?? "").trim();
      const spdPayload = String(args.spdPayload ?? "").trim();
      if (!amountText) {
        setStatus(t("spdPaymentOfferMissingAmount"));
        return false;
      }
      if (args.contacts.length === 0) {
        setStatus(t("spdPaymentOfferFailed"));
        return false;
      }
      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return false;
      }

      try {
        const { getPublicKey } = await import("nostr-tools");
        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          throw new Error("invalid nsec");
        }
        const privBytes = decodedMe.data;
        const myPubHex = getPublicKey(privBytes);

        const recipients: {
          contactId: string;
          contactPubHex: string;
        }[] = [];
        for (const contact of args.contacts) {
          const contactId = String(contact.id ?? "").trim();
          const contactNpub = normalizeNpubIdentifier(contact.npub);
          if (!contactId || !contactNpub) continue;

          const decodedContact = nip19.decode(contactNpub);
          if (
            decodedContact.type !== "npub" ||
            typeof decodedContact.data !== "string"
          ) {
            continue;
          }
          const contactPubHex = decodedContact.data.trim();
          if (!contactPubHex) continue;
          recipients.push({ contactId, contactPubHex });
        }

        if (recipients.length === 0) {
          setStatus(t("chatMissingContactNpub"));
          return false;
        }

        const offerId = makeLocalId();
        if (spdPayload) {
          bankPaymentOfferSpdPayloadByOfferIdRef.current.set(
            offerId,
            spdPayload,
          );
        }

        const pool = await getSharedAppNostrPool();
        let sentCount = 0;

        for (const recipient of recipients) {
          const clientId = makeLocalId();
          const baseEvent = createLinkyBankPaymentOfferEvent({
            amountSat,
            amountText,
            clientId,
            createdAt: Math.ceil(Date.now() / 1e3),
            offerId,
            offererPublicKey: myPubHex,
            recipientPublicKey: recipient.contactPubHex,
            senderPublicKey: myPubHex,
            status: "offered",
          });

          const wrapForMe = wrapEventWithoutPushMarker(
            baseEvent,
            privBytes,
            myPubHex,
          );
          const wrapForContact = wrapEventWithPushMarker(
            baseEvent,
            privBytes,
            recipient.contactPubHex,
          );

          const publishOutcome = await publishWrappedWithRetry(
            pool,
            NOSTR_RELAYS,
            wrapForMe,
            wrapForContact,
          );

          if (!publishOutcome.anySuccess) continue;
          sentCount += 1;

          const messageWrapId =
            String(wrapForMe.id ?? "").trim() ||
            String(wrapForContact.id ?? "").trim() ||
            `bank-payment-offer:${clientId}`;
          upsertBankPaymentOfferMessage({
            clientId,
            contactId: recipient.contactId,
            content: baseEvent.content,
            createdAtSec: baseEvent.created_at,
            direction: "out",
            id: `bank-payment-offer:${recipient.contactId}:${offerId}`,
            localOnly: true,
            pubkey: myPubHex,
            rumorId: null,
            status: "sent",
            wrapId: messageWrapId,
          });
        }

        if (sentCount === 0) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        return true;
      } catch (error) {
        setStatus(
          `${t("errorPrefix")}: ${getUnknownErrorMessage(error, "publish failed")}`,
        );
        return false;
      }
    },
    [
      currentNsec,
      publishWrappedWithRetry,
      setStatus,
      t,
      upsertBankPaymentOfferMessage,
    ],
  );

  const respondToBankPaymentOffer = React.useCallback(
    async (
      message: LocalNostrMessage,
      nextStatus: Exclude<LinkyBankPaymentOfferStatus, "offered">,
      options?: { spdPayload?: string | null; withPush?: boolean },
    ): Promise<boolean> => {
      const offerInfo = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      );
      if (!offerInfo) {
        setStatus(t("spdPaymentOfferFailed"));
        return false;
      }
      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return false;
      }

      try {
        const { getPublicKey } = await import("nostr-tools");
        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          throw new Error("invalid nsec");
        }
        const privBytes = decodedMe.data;
        const myPubHex = getPublicKey(privBytes);
        const messageDirection = String(message.direction ?? "").trim();
        const offererPublicKey =
          String(offerInfo.offererPublicKey ?? "").trim() ||
          (messageDirection === "out"
            ? myPubHex
            : String(message.pubkey ?? "").trim());

        if (!offererPublicKey) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const messageContactId = String(message.contactId ?? "").trim();
        const messageContact =
          contacts.find(
            (contact) => String(contact.id ?? "").trim() === messageContactId,
          ) ?? null;
        const contactNpub = normalizeNpubIdentifier(messageContact?.npub);
        let contactPubkey: string | null = null;
        if (contactNpub) {
          const decodedContact = nip19.decode(contactNpub);
          if (
            decodedContact.type === "npub" &&
            typeof decodedContact.data === "string"
          ) {
            contactPubkey = decodedContact.data.trim() || null;
          }
        }

        const messagePubkey = String(message.pubkey ?? "").trim();
        const recipientPublicKey =
          offererPublicKey === myPubHex
            ? (contactPubkey ??
              (messagePubkey !== myPubHex ? messagePubkey : ""))
            : offererPublicKey;
        if (!recipientPublicKey || recipientPublicKey === myPubHex) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const clientId = makeLocalId();
        const baseEvent = createLinkyBankPaymentOfferEvent({
          amountSat: offerInfo.amountSat,
          amountText: offerInfo.amountText,
          clientId,
          createdAt: Math.ceil(Date.now() / 1e3),
          offerId: offerInfo.offerId,
          offererPublicKey,
          recipientPublicKey,
          senderPublicKey: myPubHex,
          spdPayload: options?.spdPayload ?? offerInfo.spdPayload,
          status: nextStatus,
        });

        const wrapForMe = wrapEventWithoutPushMarker(
          baseEvent,
          privBytes,
          myPubHex,
        );
        const withPush =
          options?.withPush ??
          shouldPushLinkyBankPaymentOfferStatus(nextStatus);
        const wrapForContact = withPush
          ? wrapEventWithPushMarker(baseEvent, privBytes, recipientPublicKey)
          : wrapEventWithoutPushMarker(
              baseEvent,
              privBytes,
              recipientPublicKey,
            );

        const pool = await getSharedAppNostrPool();
        const publishOutcome = await publishWrappedWithRetry(
          pool,
          NOSTR_RELAYS,
          wrapForMe,
          wrapForContact,
        );

        if (!publishOutcome.anySuccess) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const messageWrapId =
          String(wrapForMe.id ?? "").trim() ||
          String(wrapForContact.id ?? "").trim() ||
          `bank-payment-offer:${clientId}`;
        upsertBankPaymentOfferMessage({
          clientId,
          contactId: String(message.contactId ?? "").trim(),
          content: baseEvent.content,
          createdAtSec: baseEvent.created_at,
          direction: offererPublicKey === myPubHex ? "out" : "in",
          id: `bank-payment-offer:${offerInfo.offerId}`,
          localOnly: true,
          pubkey: offererPublicKey === myPubHex ? myPubHex : offererPublicKey,
          rumorId: null,
          status: "sent",
          wrapId: messageWrapId,
        });

        return true;
      } catch (error) {
        setStatus(
          `${t("errorPrefix")}: ${getUnknownErrorMessage(error, "publish failed")}`,
        );
        return false;
      }
    },
    [
      currentNsec,
      contacts,
      publishWrappedWithRetry,
      setStatus,
      t,
      upsertBankPaymentOfferMessage,
    ],
  );

  const getBankPaymentOfferGroupMessages = React.useCallback(
    (message: LocalNostrMessage): LocalNostrMessage[] => {
      const offerInfo = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      );
      if (!offerInfo) return [message];

      const group = bankPaymentOfferMessages.filter((candidate) => {
        const candidateInfo = getLinkyBankPaymentOfferInfo(
          String(candidate.content ?? ""),
        );
        return candidateInfo?.offerId === offerInfo.offerId;
      });

      if (
        !group.some(
          (candidate) =>
            String(candidate.contactId ?? "").trim() ===
            String(message.contactId ?? "").trim(),
        )
      ) {
        group.push(message);
      }

      return group;
    },
    [bankPaymentOfferMessages],
  );

  const isBankPaymentOfferCanceled = React.useCallback(
    (offerId: string): boolean => {
      const normalizedOfferId = String(offerId ?? "").trim();
      if (!normalizedOfferId) return false;

      return bankPaymentOfferMessages.some((message) => {
        const info = getLinkyBankPaymentOfferInfo(
          String(message.content ?? ""),
        );
        return (
          info?.offerId === normalizedOfferId && info.status === "canceled"
        );
      });
    },
    [bankPaymentOfferMessages],
  );

  const respondToBankPaymentOfferWithGroupState = React.useCallback(
    async (
      message: LocalNostrMessage,
      nextStatus: Exclude<LinkyBankPaymentOfferStatus, "offered">,
      options?: { spdPayload?: string | null; withPush?: boolean },
    ): Promise<boolean> => {
      if (nextStatus !== "canceled" && nextStatus !== "settled") {
        return await respondToBankPaymentOffer(message, nextStatus, options);
      }

      const group = getBankPaymentOfferGroupMessages(message);
      const cancellationPushContactId =
        nextStatus === "canceled"
          ? (group
              .filter((candidate) => {
                const info = getLinkyBankPaymentOfferInfo(
                  String(candidate.content ?? ""),
                );
                return (
                  info?.status === "accepted" ||
                  info?.status === "bank_details_sent" ||
                  info?.status === "bank_paid"
                );
              })
              .sort((left, right) => {
                const leftInfo = getLinkyBankPaymentOfferInfo(
                  String(left.content ?? ""),
                );
                const rightInfo = getLinkyBankPaymentOfferInfo(
                  String(right.content ?? ""),
                );
                const rank = (status: LinkyBankPaymentOfferStatus): number =>
                  status === "bank_paid"
                    ? 0
                    : status === "bank_details_sent"
                      ? 1
                      : 2;
                const rankDifference =
                  rank(leftInfo?.status ?? "accepted") -
                  rank(rightInfo?.status ?? "accepted");
                if (rankDifference !== 0) return rankDifference;
                return (
                  Number(leftInfo?.statusUpdatedAtSec ?? left.createdAtSec) -
                  Number(rightInfo?.statusUpdatedAtSec ?? right.createdAtSec)
                );
              })[0]?.contactId ?? null)
          : null;
      let sentAny = false;

      for (const groupMessage of group) {
        const info = getLinkyBankPaymentOfferInfo(
          String(groupMessage.content ?? ""),
        );
        if (!info) continue;
        if (info.status === nextStatus) {
          sentAny = true;
          continue;
        }
        if (nextStatus === "canceled" && info.status === "settled") continue;

        const sent = await respondToBankPaymentOffer(groupMessage, nextStatus, {
          ...(options?.spdPayload !== undefined
            ? { spdPayload: options.spdPayload }
            : {}),
          withPush:
            nextStatus === "canceled" &&
            String(groupMessage.contactId ?? "").trim() ===
              String(cancellationPushContactId ?? "").trim(),
        });
        sentAny = sentAny || sent;
      }

      return sentAny;
    },
    [getBankPaymentOfferGroupMessages, respondToBankPaymentOffer],
  );

  React.useEffect(() => {
    if (!currentNsec) return;
    if (bankPaymentOfferMessages.length === 0) return;

    let cancelled = false;

    const run = async () => {
      try {
        const { getPublicKey } = await import("nostr-tools");
        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          return;
        }

        const myPubHex = getPublicKey(decodedMe.data);
        const groups = new Map<
          string,
          {
            info: ReturnType<typeof getLinkyBankPaymentOfferInfo>;
            message: LocalNostrMessage;
          }[]
        >();

        for (const message of bankPaymentOfferMessages) {
          const info = getLinkyBankPaymentOfferInfo(
            String(message.content ?? ""),
          );
          if (!info) continue;
          if (String(info.offererPublicKey ?? "").trim() !== myPubHex) {
            continue;
          }

          const group = groups.get(info.offerId) ?? [];
          group.push({ info, message });
          groups.set(info.offerId, group);
        }

        for (const [offerId, group] of groups) {
          if (cancelled) return;

          const hasActiveBankDetails = group.some(
            (entry) =>
              entry.info?.status === "bank_details_sent" ||
              entry.info?.status === "bank_paid",
          );
          if (hasActiveBankDetails) continue;

          const accepted = group
            .filter((entry) => entry.info?.status === "accepted")
            .sort((a, b) => {
              const aSec =
                a.info?.statusUpdatedAtSec ??
                Number(a.message.createdAtSec ?? 0);
              const bSec =
                b.info?.statusUpdatedAtSec ??
                Number(b.message.createdAtSec ?? 0);
              if (aSec !== bSec) return aSec - bSec;
              return String(a.message.contactId ?? "").localeCompare(
                String(b.message.contactId ?? ""),
              );
            });

          const candidate = accepted[0] ?? null;
          if (!candidate?.info) continue;

          const spdPayload =
            bankPaymentOfferSpdPayloadByOfferIdRef.current.get(offerId) ?? "";
          if (!spdPayload) continue;

          const candidateKey = `${offerId}:${String(candidate.message.contactId ?? "").trim()}`;
          if (autoSentBankDetailsOfferIdsRef.current.has(candidateKey)) {
            continue;
          }

          autoSentBankDetailsOfferIdsRef.current.add(candidateKey);
          const sent = await respondToBankPaymentOffer(
            candidate.message,
            "bank_details_sent",
            { spdPayload },
          );
          if (!sent) {
            autoSentBankDetailsOfferIdsRef.current.delete(candidateKey);
          }
        }
      } catch {
        // Best effort; the sender can retry when the accepted event reappears.
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [bankPaymentOfferMessages, currentNsec, respondToBankPaymentOffer]);

  const bankPaymentOfferExpiryGroups = React.useMemo(() => {
    if (!currentNpub || bankPaymentOfferMessages.length === 0) return [];

    let myPubHex: string;
    try {
      const decoded = nip19.decode(currentNpub);
      if (decoded.type !== "npub" || typeof decoded.data !== "string") {
        return [];
      }
      myPubHex = decoded.data;
    } catch {
      return [];
    }

    const groups = new Map<
      string,
      {
        info: NonNullable<ReturnType<typeof getLinkyBankPaymentOfferInfo>>;
        message: LocalNostrMessage;
      }[]
    >();
    for (const message of bankPaymentOfferMessages) {
      const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
      if (
        !info ||
        String(info.offererPublicKey ?? "").trim() !== myPubHex ||
        isLinkyBankPaymentOfferTerminalStatus(info.status)
      ) {
        continue;
      }
      const group = groups.get(info.offerId) ?? [];
      group.push({ info, message });
      groups.set(info.offerId, group);
    }

    const nowSec = Math.floor(Date.now() / 1e3);
    const statusPriority: LinkyBankPaymentOfferStatus[] = [
      "bank_paid",
      "bank_details_sent",
      "accepted",
      "offered",
    ];
    return Array.from(groups.values()).flatMap((group) => {
      const activeStatus = statusPriority.find((status) =>
        group.some((entry) => entry.info.status === status),
      );
      if (!activeStatus) return [];

      const phaseStartedAtSec = Math.min(
        ...group
          .filter((entry) => entry.info.status === activeStatus)
          .map(
            (entry) =>
              entry.info.statusUpdatedAtSec ||
              Number(entry.message.createdAtSec ?? 0) ||
              nowSec,
          ),
      );
      return [
        {
          expiresAtMs:
            (phaseStartedAtSec + LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC) *
            1_000,
          messages: group.map((entry) => entry.message),
        },
      ];
    });
  }, [bankPaymentOfferMessages, currentNpub]);

  React.useEffect(() => {
    const nextExpiryMs = Math.min(
      ...bankPaymentOfferExpiryGroups.map((group) => group.expiresAtMs),
    );
    if (!Number.isFinite(nextExpiryMs)) return;

    let cancelled = false;
    let timeoutId = 0;
    const expireDueGroups = () => {
      if (cancelled) return;
      if (bankPaymentOfferExpiryInFlightRef.current) {
        timeoutId = window.setTimeout(expireDueGroups, 100);
        return;
      }

      bankPaymentOfferExpiryInFlightRef.current = true;
      void (async () => {
        try {
          const nowMs = Date.now();
          for (const group of bankPaymentOfferExpiryGroups) {
            if (group.expiresAtMs > nowMs) continue;
            for (const message of group.messages) {
              if (cancelled) return;
              await respondToBankPaymentOffer(message, "canceled");
            }
          }
        } finally {
          bankPaymentOfferExpiryInFlightRef.current = false;
        }
      })();
    };
    timeoutId = window.setTimeout(
      expireDueGroups,
      Math.max(0, nextExpiryMs - Date.now()),
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [bankPaymentOfferExpiryGroups, respondToBankPaymentOffer]);

  useNostrPendingFlush({
    activePublishClientIdsRef: activeNostrMessagePublishClientIdsRef,
    chatSeenWrapIdsRef,
    contacts,
    currentNsec,
    enabled: nostrBootstrapReady,
    nostrMessagesLocal,
    nostrReactionsLocal,
    publishWrappedWithRetry,
    updateLocalNostrReaction,
    updateLocalNostrMessage,
  });

  const contactsOnboardingHasSentMessage = useMemo(() => {
    return nostrMessagesRecent.some((m) => String(m.direction ?? "") === "out");
  }, [nostrMessagesRecent]);

  const handleDelete = (id: ContactId) => {
    const normalizedContactId = String(id ?? "").trim();
    const contactToArchive =
      contacts.find(
        (contact) => String(contact.id ?? "").trim() === normalizedContactId,
      ) ?? null;
    const archivedContactNpub = normalizeNpubIdentifier(contactToArchive?.npub);
    let unknownThreadContactId: string | null = null;
    if (archivedContactNpub) {
      try {
        const decodedContact = nip19.decode(archivedContactNpub);
        if (
          decodedContact.type === "npub" &&
          typeof decodedContact.data === "string"
        ) {
          unknownThreadContactId = buildUnknownContactId(decodedContact.data);
        }
      } catch {
        unknownThreadContactId = null;
      }
    }

    const archivedAtSec = Math.ceil(Date.now() / 1e3);
    const storedContactOwnerId = contactToArchive
      ? resolveContactRowOwnerLane(contactToArchive, contactsVisibleOwnerIds)
      : null;
    const archiveOwnerId = storedContactOwnerId ?? contactsOwnerId;
    const result = archiveOwnerId
      ? update("contact", { id, archivedAtSec }, { ownerId: archiveOwnerId })
      : update("contact", { id, archivedAtSec });
    if (result.ok) {
      if (
        unknownThreadContactId &&
        unknownThreadContactId !== normalizedContactId
      ) {
        pendingArchivedContactThreadIdsRef.current.set(
          normalizedContactId,
          unknownThreadContactId,
        );
      }
      setStatus(t("contactArchived"));
      closeContactDetail();
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const restoreArchivedContact = React.useCallback(
    (id: ContactId) => {
      const contactToRestore =
        contacts.find((contact) => contact.id === id) ?? null;
      const storedContactOwnerId = contactToRestore
        ? resolveContactRowOwnerLane(contactToRestore, contactsVisibleOwnerIds)
        : null;
      const restoreOwnerId = storedContactOwnerId ?? contactsOwnerId;
      const result = restoreOwnerId
        ? update(
            "contact",
            { id, archivedAtSec: null },
            { ownerId: restoreOwnerId },
          )
        : update("contact", { id, archivedAtSec: null });

      if (result.ok) {
        const restoredNpub = normalizeNpubIdentifier(contactToRestore?.npub);
        if (restoredNpub) {
          try {
            const decodedContact = nip19.decode(restoredNpub);
            if (
              decodedContact.type === "npub" &&
              typeof decodedContact.data === "string"
            ) {
              const unknownContactId = buildUnknownContactId(
                decodedContact.data,
              );
              if (unknownContactId) {
                reassignLocalNostrMessagesContactId(
                  unknownContactId,
                  String(id),
                );
              }
            }
          } catch {
            // Ignore malformed archived contact identifiers.
          }
        }
        setStatus(t("contactRestored"));
        closeContactDetail();
        return;
      }

      setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
    },
    [
      closeContactDetail,
      contacts,
      contactsOwnerId,
      contactsVisibleOwnerIds,
      reassignLocalNostrMessagesContactId,
      setStatus,
      t,
      update,
    ],
  );

  const blockPubkeyAndPublishMuteList = React.useCallback(
    async (pubkeyHex: string): Promise<boolean> => {
      const normalizedPubkey = normalizePubkeyHex(pubkeyHex);
      if (!normalizedPubkey) return false;

      const mergedBlockedPubkeys = Array.from(
        new Set(
          safeLocalStorageGetJson(BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY, [])
            .map((entry) => normalizePubkeyHex(entry))
            .filter((entry): entry is string => Boolean(entry))
            .concat(normalizedPubkey),
        ),
      );

      safeLocalStorageSetJson(
        BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY,
        mergedBlockedPubkeys,
      );

      if (!currentNsec) return true;

      try {
        const { finalizeEvent, getPublicKey } = await import("nostr-tools");

        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          return true;
        }

        const relays = Array.from(
          new Set(
            nostrFetchRelays
              .map((relay) => String(relay ?? "").trim())
              .filter(Boolean),
          ),
        );
        if (relays.length === 0) return true;

        const privBytes = decodedMe.data;
        const pubkey = getPublicKey(privBytes);
        const baseEvent = {
          kind: 10000,
          created_at: Math.ceil(Date.now() / 1e3),
          tags: mergedBlockedPubkeys.map((blockedPubkey) => [
            "p",
            blockedPubkey,
          ]),
          content: "",
          pubkey,
        } satisfies UnsignedEvent;

        const signed = finalizeEvent(baseEvent, privBytes);
        const pool = await getSharedAppNostrPool();
        void Promise.allSettled(pool.publish(relays, signed));
      } catch {
        // Local blocklist still applies even if mute-list publish fails.
      }

      return true;
    },
    [currentNsec, nostrFetchRelays],
  );

  const requestDeleteCurrentContact = () => {
    if (!editingId) return;
    if (pendingDeleteId === editingId) {
      setPendingDeleteId(null);
      handleDelete(editingId);
      return;
    }
    setPendingDeleteId(editingId);
  };

  const { openFeedbackContact } = useFeedbackContact<(typeof contacts)[number]>(
    {
      appOwnerId: contactsOwnerId,
      contacts,
      insert,
      pushToast,
      t,
      update,
    },
  );

  const clearContactAttention = React.useCallback((contactId: string) => {
    const normalizedContactId = String(contactId ?? "").trim();
    if (!normalizedContactId) return;

    setContactAttentionById((prev) => {
      if (prev[normalizedContactId] === undefined) return prev;
      const next = { ...prev };
      delete next[normalizedContactId];
      return next;
    });
  }, []);

  React.useEffect(() => {
    for (const contact of contacts) {
      const contactId = String(contact.id ?? "").trim();
      if (!contactId) continue;
      const unknownContactId =
        pendingArchivedContactThreadIdsRef.current.get(contactId);
      if (!unknownContactId) continue;

      const archivedAtSec = Number(contact.archivedAtSec ?? 0);
      if (!Number.isFinite(archivedAtSec) || archivedAtSec <= 0) continue;

      pendingArchivedContactThreadIdsRef.current.delete(contactId);
      reassignLocalNostrMessagesContactId(contactId, unknownContactId);
      clearContactAttention(unknownContactId);
    }
  }, [clearContactAttention, contacts, reassignLocalNostrMessagesContactId]);

  const blockArchivedContact = React.useCallback(async () => {
    if (route.kind !== "contactEdit") return;
    if (!selectedContact?.id) return;

    const normalizedNpub = normalizeNpubIdentifier(selectedContact.npub);
    if (!normalizedNpub) {
      setStatus(t("chatMissingContactNpub"));
      return;
    }

    const confirmed = window.confirm(t("chatUnknownContactBlockConfirm"));
    if (!confirmed) return;

    let blockedPubkey: string | null = null;
    try {
      const decoded = nip19.decode(normalizedNpub);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        blockedPubkey = normalizePubkeyHex(decoded.data);
      }
    } catch {
      blockedPubkey = null;
    }

    if (!blockedPubkey) {
      setStatus(t("chatMissingContactNpub"));
      return;
    }

    await blockPubkeyAndPublishMuteList(blockedPubkey);

    const contactId = String(selectedContact.id ?? "").trim();
    if (contactId) {
      removeLocalNostrMessagesByContactId(contactId);
      clearContactAttention(contactId);
    }

    const result = contactsOwnerId
      ? (() => {
          const scoped = update(
            "contact",
            { id: selectedContact.id, isDeleted: Evolu.sqliteTrue },
            { ownerId: contactsOwnerId },
          );
          if (scoped.ok) return scoped;
          return update("contact", {
            id: selectedContact.id,
            isDeleted: Evolu.sqliteTrue,
          });
        })()
      : update("contact", {
          id: selectedContact.id,
          isDeleted: Evolu.sqliteTrue,
        });

    if (result.ok) {
      setStatus(t("contactBlocked"));
      closeContactDetail();
      return;
    }

    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  }, [
    blockPubkeyAndPublishMuteList,
    clearContactAttention,
    closeContactDetail,
    contactsOwnerId,
    removeLocalNostrMessagesByContactId,
    route.kind,
    selectedContact,
    setStatus,
    t,
    update,
  ]);

  const openContactPay = React.useCallback(
    (
      contactId: string,
      fromChat = false,
      intent: "pay" | "request" = "pay",
    ) => {
      const knownContact =
        contacts.find((row) => String(row.id ?? "").trim() === contactId) ??
        null;
      if (!knownContact) return;

      contactPayBackToChatRef.current = fromChat ? knownContact.id : null;
      setContactPaymentIntent(intent);
      navigateTo({ route: "contactPay", id: knownContact.id });
    },
    [contactPayBackToChatRef, contacts, setContactPaymentIntent],
  );

  const openContactDetail = React.useCallback(
    (contact: DisplayContact) => {
      const contactId = String(contact.id ?? "").trim();
      if (!contactId) return;

      setPendingDeleteId(null);
      clearContactAttention(contactId);
      contactPayBackToChatRef.current = null;

      if (contact.isUnknownContact) {
        navigateTo({ route: "chat", id: contactId });
        return;
      }

      const knownContact =
        contacts.find((row) => String(row.id ?? "").trim() === contactId) ??
        null;
      if (!knownContact) {
        navigateTo({ route: "contacts" });
        return;
      }

      const npub = String(knownContact.npub ?? "").trim();
      const ln = String(knownContact.lnAddress ?? "").trim();
      if (!npub) {
        if (ln) {
          openContactPay(knownContact.id);
          return;
        }
        navigateTo({ route: "contact", id: knownContact.id });
        return;
      }
      navigateTo({ route: "chat", id: String(knownContact.id) });
    },
    [clearContactAttention, contactPayBackToChatRef, contacts, openContactPay],
  );

  const addUnknownContactFromChat = React.useCallback(async () => {
    if (route.kind !== "chat") return;
    if (!selectedChatContact?.isUnknownContact) return;

    const contactId = String(selectedChatContact.id ?? "").trim();
    const npub = normalizeNpubIdentifier(selectedChatContact.npub);
    if (!contactId || !npub) {
      setStatus(t("chatUnknownContactAddFailed"));
      return;
    }

    const existing = contacts.find(
      (contact) => normalizeNpubIdentifier(contact.npub) === npub,
    );

    if (existing?.id) {
      reassignLocalNostrMessagesContactId(contactId, existing.id);
      clearContactAttention(contactId);
      setStatus(t("contactSaved"));
      navigateTo({ route: "chat", id: String(existing.id) });
      return;
    }

    const bestName = unknownNameByNpub[npub] ?? null;
    const savedName = buildSavedContactName(bestName, npub);
    const payload = {
      name: savedName as typeof Evolu.NonEmptyString1000.Type,
      npub: npub as typeof Evolu.NonEmptyString1000.Type,
      lnAddress: null,
      groupName: null,
    };

    pendingUnknownContactAddRef.current = {
      sourceContactId: contactId,
      targetNpub: npub,
    };

    const result = contactsOwnerId
      ? (() => {
          const scoped = insert("contact", payload, {
            ownerId: contactsOwnerId,
          });
          if (scoped.ok) return scoped;
          return insert("contact", payload);
        })()
      : insert("contact", payload);

    if (!result.ok) {
      pendingUnknownContactAddRef.current = null;
      setStatus(`${t("errorPrefix")}: ${String(result.error ?? "")}`);
      return;
    }
  }, [
    clearContactAttention,
    contactsOwnerId,
    buildSavedContactName,
    contacts,
    insert,
    pendingUnknownContactAddRef,
    reassignLocalNostrMessagesContactId,
    route.kind,
    selectedChatContact,
    setStatus,
    t,
    unknownNameByNpub,
  ]);

  const blockUnknownContactFromChat = React.useCallback(async () => {
    if (route.kind !== "chat") return;
    if (!selectedChatContact?.isUnknownContact) return;

    const confirmed = window.confirm(t("chatUnknownContactBlockConfirm"));
    if (!confirmed) return;

    const contactId = String(selectedChatContact.id ?? "").trim();
    if (!contactId) return;

    const unknownPubkeyHex = (() => {
      const directPubkey = normalizePubkeyHex(
        selectedChatContact.unknownPubkeyHex,
      );
      if (directPubkey) return directPubkey;

      const normalizedNpub = normalizeNpubIdentifier(selectedChatContact.npub);
      if (!normalizedNpub) return null;

      try {
        const decoded = nip19.decode(normalizedNpub);
        if (decoded.type !== "npub" || typeof decoded.data !== "string") {
          return null;
        }
        return normalizePubkeyHex(decoded.data);
      } catch {
        return null;
      }
    })();

    if (!unknownPubkeyHex) return;

    await blockPubkeyAndPublishMuteList(unknownPubkeyHex);

    removeLocalNostrMessagesByContactId(contactId);
    clearContactAttention(contactId);
    setStatus(t("chatUnknownContactBlocked"));
    navigateTo({ route: "contacts" });
  }, [
    blockPubkeyAndPublishMuteList,
    clearContactAttention,
    removeLocalNostrMessagesByContactId,
    route.kind,
    selectedChatContact,
    setStatus,
    t,
  ]);

  const getNpubMessageContactInfo = React.useCallback(
    (rawNpub: string) => {
      const npub = normalizeNpubIdentifier(rawNpub);
      if (!npub) return null;

      const knownContact =
        contacts.find(
          (contact) => normalizeNpubIdentifier(contact.npub) === npub,
        ) ?? null;
      const derivedProfile = deriveDefaultProfile(npub, lang);
      const displayName = buildSavedContactName(
        String(knownContact?.name ?? "").trim() ||
          unknownNameByNpub[npub] ||
          null,
        npub,
      );
      const pictureUrl =
        nostrPictureByNpub[npub] ?? derivedProfile.pictureUrl ?? null;

      return {
        displayName,
        isSaved:
          Boolean(knownContact) ||
          normalizeNpubIdentifier(currentNpub) === npub,
        npub,
        pictureUrl,
      };
    },
    [
      buildSavedContactName,
      contacts,
      currentNpub,
      lang,
      nostrPictureByNpub,
      unknownNameByNpub,
    ],
  );

  const mentionContacts = React.useMemo(
    () =>
      contacts.flatMap((contact) => {
        const name = String(contact.name ?? "").trim();
        const npub = normalizeNpubIdentifier(contact.npub);
        if (!name || !npub) return [];
        const groupName = String(contact.groupName ?? "").trim();
        return [
          {
            name,
            npub,
            groupName: groupName || null,
            statusNames: extractStatusFilterCurrencies(nostrStatusByNpub[npub]),
          },
        ];
      }),
    [contacts, nostrStatusByNpub],
  );

  const openNpubMessageContact = React.useCallback(
    (rawNpub: string) => {
      const npub = normalizeNpubIdentifier(rawNpub);
      if (!npub) return;

      const existing = contacts.find(
        (contact) => normalizeNpubIdentifier(contact.npub) === npub,
      );
      if (existing?.id) {
        navigateTo({ route: "contact", id: existing.id as ContactId });
        return;
      }

      const myNpub = normalizeNpubIdentifier(currentNpub);
      if (myNpub && myNpub === npub) {
        navigateTo({ route: "profile" });
        return;
      }

      if (activeContactsOwnerContactCount >= MAX_CONTACTS_PER_OWNER) {
        setStatus(
          t("contactsLimitReached").replace(
            "{max}",
            String(MAX_CONTACTS_PER_OWNER),
          ),
        );
        return;
      }

      const defaultProfile = deriveDefaultProfile(npub, lang);
      const payload = {
        name: buildSavedContactName(
          unknownNameByNpub[npub] ?? defaultProfile.name,
          npub,
        ) as typeof Evolu.NonEmptyString1000.Type,
        npub: npub as typeof Evolu.NonEmptyString1000.Type,
        lnAddress: null,
        groupName: null,
      };

      const result = contactsOwnerId
        ? (() => {
            const scoped = insert("contact", payload, {
              ownerId: contactsOwnerId,
            });
            if (scoped.ok) return scoped;
            return insert("contact", payload);
          })()
        : insert("contact", payload);

      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error ?? "")}`);
        return;
      }

      openScannedContactPendingNpubRef.current = npub;
      setStatus(t("contactSaved"));
    },
    [
      activeContactsOwnerContactCount,
      buildSavedContactName,
      contacts,
      contactsOwnerId,
      currentNpub,
      insert,
      lang,
      openScannedContactPendingNpubRef,
      setStatus,
      t,
      unknownNameByNpub,
    ],
  );

  React.useEffect(() => {
    const pending = pendingUnknownContactAddRef.current;
    if (!pending) return;

    const existing = contacts.find(
      (contact) =>
        normalizeNpubIdentifier(contact.npub) === pending.targetNpub &&
        Boolean(contact.id),
    );
    if (!existing?.id) return;

    pendingUnknownContactAddRef.current = null;
    reassignLocalNostrMessagesContactId(pending.sourceContactId, existing.id);
    clearContactAttention(pending.sourceContactId);
    setStatus(t("contactSaved"));
    navigateTo({ route: "chat", id: String(existing.id) });
  }, [
    clearContactAttention,
    contacts,
    reassignLocalNostrMessagesContactId,
    setStatus,
    t,
  ]);

  useChatNostrSyncEffect({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    chatSeenWrapIdsRef,
    currentNsec,
    enabled: nostrBootstrapReady,
    knownNostrMessageIdentityIndex,
    logPayStep,
    nostrMessageWrapIdsRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    route,
    selectedContact: selectedChatContact,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  });

  const sendChatMessage = useSendChatMessage({
    activePublishClientIdsRef: activeNostrMessagePublishClientIdsRef,
    appendLocalNostrMessage,
    chatDraft,
    chatSeenWrapIdsRef,
    chatSendIsBusy,
    currentNsec,
    publishWrappedWithRetry,
    route,
    replyContext,
    replyContextRef,
    selectedContact:
      route.kind === "chat" || route.kind === "bankPaymentOffer"
        ? selectedChatContact
        : selectedContact,
    setReplyContext,
    setChatDraft,
    setChatSendIsBusy,
    setStatus,
    t,
    triggerChatScrollToBottom,
    updateLocalNostrMessage,
  });

  const editChatMessage = useEditChatMessage({
    chatDraft,
    chatSendIsBusy,
    currentNsec,
    editContext,
    publishWrappedWithRetry,
    route,
    selectedContact: selectedChatContact,
    setChatDraft,
    setChatSendIsBusy,
    setEditContext,
    setStatus,
    t,
    updateLocalNostrMessage,
  });

  const sendReaction = useSendReaction({
    appendLocalNostrReaction,
    currentNsec,
    publishWrappedWithRetry,
    reactionsByMessageId,
    route,
    selectedContact: selectedChatContact,
    setStatus,
    softDeleteLocalNostrReaction,
    t,
    updateLocalNostrReaction,
  });

  const sendChatOrEditMessage = React.useCallback(async () => {
    if (editContext) {
      await editChatMessage();
      return;
    }
    await sendChatMessage();
  }, [editChatMessage, editContext, sendChatMessage]);

  const sendChatImage = React.useCallback(
    async (file: File) => {
      if (editContext) return;
      await sendChatMessage({
        clearDraft: false,
        imageFile: file,
      });
    },
    [editContext, sendChatMessage],
  );

  const onReplyToChatMessage = React.useCallback(
    (message: LocalNostrMessage) => {
      const rumorId = String(message.rumorId ?? "").trim();
      if (!rumorId) return;
      setEditContext(null);
      setReplyContext({
        replyToId: rumorId,
        rootMessageId: String(message.rootMessageId ?? "").trim() || rumorId,
        replyToContent: String(message.content ?? "").trim() || null,
      });
    },
    [],
  );

  const onEditChatMessage = React.useCallback((message: LocalNostrMessage) => {
    const isOut = String(message.direction ?? "") === "out";
    if (!isOut) return;
    const rumorId = String(message.rumorId ?? "").trim();
    if (!rumorId) return;
    const messageId = String(message.id ?? "").trim();
    if (!messageId) return;

    setReplyContext(null);
    const content = String(message.content ?? "");
    setEditContext({
      messageId,
      rumorId,
      originalContent:
        String(message.originalContent ?? "").trim() || content || "",
    });
    setChatDraft(content);
  }, []);

  const onReactToChatMessage = React.useCallback(
    (message: LocalNostrMessage, emoji: string) => {
      const messageRumorId = String(message.rumorId ?? "").trim();
      const messageAuthorPubkey = String(message.pubkey ?? "").trim();
      if (!messageRumorId || !messageAuthorPubkey) return;
      void sendReaction({
        emoji,
        messageAuthorPubkey,
        messageKind: parsePrivateImageMessage(message.content) ? 15 : 14,
        messageRumorId,
      });
    },
    [sendReaction],
  );

  const onCopyChatMessage = React.useCallback(
    (message: LocalNostrMessage) => {
      const content = String(message.content ?? "");
      const copyContent = parsePrivateImageMessage(content)
        ? privateImagePreviewText(t)
        : content;
      void copyText(copyContent);
    },
    [copyText, t],
  );

  const onDeclineChatPaymentRequest = React.useCallback(
    async (message: LocalNostrMessage) => {
      const requestRumorId = String(message.rumorId ?? "").trim();
      if (!requestRumorId) return;

      await sendChatMessage({
        clearDraft: false,
        replyContext: {
          replyToId: requestRumorId,
          rootMessageId:
            String(message.rootMessageId ?? "").trim() || requestRumorId,
          replyToContent: String(message.content ?? "").trim() || null,
        },
        text: buildLinkyPaymentRequestDeclineMessage(requestRumorId),
      });
    },
    [sendChatMessage],
  );

  const onCancelReply = React.useCallback(() => {
    setReplyContext(null);
  }, []);

  const onCancelEdit = React.useCallback(() => {
    setEditContext(null);
    setChatDraft("");
  }, []);

  const openInboxMessageToast = React.useCallback(
    (params: { contactId: string; messageId?: string }) => {
      const contactId = String(params.contactId ?? "").trim();
      if (!contactId) return;
      const messageId = String(params.messageId ?? "").trim();

      navigateTo({ route: "chat", id: contactId });
      triggerChatScrollToBottom(messageId || undefined);
    },
    [triggerChatScrollToBottom],
  );

  useInboxNotificationsSync({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    bankPaymentOfferMessages,
    contacts,
    currentNsec,
    enabled: nostrBootstrapReady,
    formatDisplayedAmountText,
    maybeShowPwaNotification,
    nostrFetchRelays,
    knownNostrMessageIdentityIndex,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    onBankPaymentOfferMessage: upsertBankPaymentOfferMessage,
    onOpenInboxMessageToast: openInboxMessageToast,
    pushToast,
    route,
    setContactAttentionById,
    softDeleteLocalNostrReactionsByWrapIds,
    t,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  });

  const chatMessagesWithBankPaymentOffers = React.useMemo(() => {
    if (route.kind !== "chat") return chatMessages;

    const activeContactId = String(route.id ?? "").trim();
    if (!activeContactId) return chatMessages;

    const offerMessages = bankPaymentOfferMessages.filter(
      (message) => String(message.contactId ?? "").trim() === activeContactId,
    );
    if (offerMessages.length === 0) return chatMessages;

    const seenKeys = new Set<string>();
    for (const message of chatMessages) {
      const offerId = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      )?.offerId;
      if (offerId) seenKeys.add(`offer:${offerId}`);
      const wrapId = String(message.wrapId ?? "").trim();
      if (wrapId) seenKeys.add(`wrap:${wrapId}`);
      const clientId = String(message.clientId ?? "").trim();
      if (clientId) seenKeys.add(`client:${clientId}`);
      const id = String(message.id ?? "").trim();
      if (id) seenKeys.add(`id:${id}`);
    }

    const merged = [...chatMessages];
    for (const message of offerMessages) {
      const offerId = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      )?.offerId;
      const wrapId = String(message.wrapId ?? "").trim();
      const clientId = String(message.clientId ?? "").trim();
      const id = String(message.id ?? "").trim();
      if (offerId && seenKeys.has(`offer:${offerId}`)) continue;
      if (wrapId && seenKeys.has(`wrap:${wrapId}`)) continue;
      if (clientId && seenKeys.has(`client:${clientId}`)) continue;
      if (id && seenKeys.has(`id:${id}`)) continue;

      merged.push(message);
      if (offerId) seenKeys.add(`offer:${offerId}`);
      if (wrapId) seenKeys.add(`wrap:${wrapId}`);
      if (clientId) seenKeys.add(`client:${clientId}`);
      if (id) seenKeys.add(`id:${id}`);
    }

    merged.sort((a, b) => {
      const createdA = Number(a.createdAtSec ?? 0);
      const createdB = Number(b.createdAtSec ?? 0);
      if (createdA !== createdB) return createdA - createdB;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });

    return merged;
  }, [bankPaymentOfferMessages, chatMessages, route]);

  return {
    activeContactsOwnerContactCount,
    activeGroup,
    activeNostrMessagePublishClientIdsRef,
    addNewContactFromIdentifier,
    addNewContactFromSearchResult,
    addUnknownContactFromChat,
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    autoAcceptedChatMessageIdsRef,
    bankPaymentOfferContacts,
    bankPaymentOfferMessages,
    bankPaymentOfferRecipientCount,
    blockArchivedContact,
    blockUnknownContactFromChat,
    buildSavedContactName,
    canAddContact,
    canSaveNewRelay,
    chatDidInitialScrollForContactRef,
    chatDraft,
    chatForceScrollToBottomRef,
    chatLastMessageCountRef,
    chatMessageElByIdRef,
    chatMessages,
    chatMessagesLatestRef,
    chatMessagesRef,
    chatMessagesWithBankPaymentOffers,
    chatOwnPubkeyHex,
    chatScrollTargetIdRef,
    chatSeenWrapIdsRef,
    chatSendIsBusy,
    closeContactDetail,
    connectedRelayCount,
    contactAttentionById,
    contactEditsSavable,
    contactFilterOptions,
    contactSuggestions,
    contacts,
    contactsLatestRef,
    contactsOnboardingHasBackedUpKeys,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    contactsSearch,
    contactsSearchInputRef,
    dedupeContacts,
    dedupeContactsIsBusy,
    displayContactById,
    displayContacts,
    editContext,
    editingId,
    enqueuePendingPayment,
    form,
    getNpubMessageContactInfo,
    groupNames,
    handleSaveContact,
    isBankPaymentOfferCanceled,
    isSavingContact,
    knownNostrMessageIdentityIndex,
    lastMessageByContactId,
    mentionContacts,
    newRelayUrl,
    nostrBootstrapReady,
    nostrFetchRelays,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrMessagesRecent,
    nostrPictureByNpub,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    nostrReactionsLocal,
    nostrRelayOverallStatus,
    nostrStatusByNpub,
    onCancelEdit,
    onCancelReply,
    onCopyChatMessage,
    onDeclineChatPaymentRequest,
    onEditChatMessage,
    onReactToChatMessage,
    onReplyToChatMessage,
    openContactDetail,
    openContactPay,
    openFeedbackContact,
    openInboxMessageToast,
    openNewContactPage,
    openNpubMessageContact,
    openScannedContactPendingNpubRef,
    pendingDeleteId,
    pendingPayments,
    pendingRelayDeleteUrl,
    publishSingleWrappedWithRetry,
    publishWrappedWithRetry,
    reactionsByMessageId,
    reassignLocalNostrMessagesContactId,
    refreshContactFromNostr,
    relayStatusByUrl,
    relayUrls,
    rememberBlobAvatarUrl,
    removeLocalNostrMessagesByContactId,
    removePendingPayment,
    replyContext,
    requestBankPaymentOffer,
    requestDeleteCurrentContact,
    requestDeleteSelectedRelay,
    resetEditedContactFieldFromNostr,
    respondToBankPaymentOfferWithGroupState,
    restoreArchivedContact,
    saveNewRelay,
    searchNewContact,
    selectedChatContact,
    selectedContact,
    selectedRelayUrl,
    sendChatImage,
    sendChatMessage,
    sendChatOrEditMessage,
    setActiveGroup,
    setBankPaymentOfferRecipientCount,
    setChatDraft,
    setContactNewPrefill,
    setContactsOnboardingHasBackedUpKeys,
    setContactsOnboardingHasPaid,
    setContactsSearch,
    setForm,
    setNewRelayUrl,
    setPendingDeleteId,
    softDeleteLocalNostrReaction,
    softDeleteLocalNostrReactionsByWrapIds,
    statusFilterCurrencies,
    triggerChatScrollToBottom,
    ungroupedCount,
    unknownNameByNpub,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
    upsertBankPaymentOfferMessage,
    visibleContacts,
  };
};
