import * as Evolu from "@evolu/common";
import {
  BankOfferDraft,
  BankOfferId,
  ChatMessageReceipt,
  ClientId,
  decodeNpub,
  encodeNpub,
  identityFromNsec,
  MessageEditReceipt,
  OutboxJobFailed,
  OutboxJobSucceeded,
  Pubkey,
  ReactionReceipt,
  UnixSeconds,
} from "@linky/linkstr";
import type { ProfileMetadata } from "@linky/linkstr";
import {
  fetchProfilesAtom,
  publishMuteListAtom,
  sendBankOfferAtom,
  useAtomSet,
  useOutboxResults,
} from "@linky/linkstr-react";
import { Exit, Schema } from "effect";
import React, { useMemo, useState } from "react";
import {
  deriveDefaultProfile,
  omitSyntheticContactLightningAddress,
} from "../../../derivedProfile";
import { useEvolu, type ContactId } from "../../../evolu";
import { navigateTo, useRouting } from "../../../hooks/useRouting";
import { useDeferredOnlineReady } from "../../../hooks/useDeferredOnlineReady";
import { type Lang } from "../../../i18n";
import {
  getProfilePictureUrl,
  loadCachedProfile,
  releaseAllAvatarObjectUrls,
} from "../../../profileCache";
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
import { getContactGroups } from "../../../utils/contactGroups";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { setStoredPushContactNames } from "../../../utils/pushContactNamesStorage";
import { getBankPaymentOfferCurrency } from "../../../utils/spdPayment";
import {
  getInitialBankPaymentOfferRecipientCount,
  safeLocalStorageGet,
  safeLocalStorageGetJson,
  safeLocalStorageSetJson,
  withLocalStorageLeaseLock,
} from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { appendPushDebugLog } from "../../../utils/pushDebugLog";
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
import { useChatReadCursorSync } from "../messages/useChatReadCursorSync";
import {
  useEditChatMessage,
  type EditChatContext,
} from "../messages/useEditChatMessage";
import {
  useSendChatMessage,
  type ReplyContext,
} from "../messages/useSendChatMessage";
import { useLinkstrInboxSync } from "../messages/useLinkstrInboxSync";
import { useSendReaction } from "../messages/useSendReaction";
import { useLinkstrInspectorBridge } from "../../../devtools/inspector/useLinkstrInspectorBridge";
import { useLinkstrConfigSync } from "../useLinkstrConfigSync";
import {
  fetchAndCacheProfiles,
  useLinkstrProfileSync,
} from "../useLinkstrProfileSync";
// ONE-TIME MIGRATION import — remove together with src/app/migrations/.
import { useRestoreClobberedContactNames } from "../../migrations/useRestoreClobberedContactNames";
import { useContactsDomain } from "../useContactsDomain";
import { useEvoluNostrBootstrapReady } from "../useEvoluNostrBootstrapReady";
import { useFeedbackContact } from "../useFeedbackContact";
import { useMessagesDomain } from "../useMessagesDomain";
import { usePushRegistrationLifecycle } from "../usePushRegistrationLifecycle";
import { useRelayDomain } from "../useRelayDomain";
import { findUniqueContactByLightningAddress } from "../../lib/contactIdentity";
import { resolveContactRowOwnerLane } from "../../lib/contactOwnerLane";
import {
  forgetLinkyBankPaymentOfferSpdPayload,
  getLinkyBankPaymentOfferExpiresAtSec,
  getLinkyBankPaymentOfferInfo,
  getLinkyBankPaymentOfferMessageText,
  getLinkyBankPaymentOfferStatusRank,
  getLastBankPaymentOfferResponseSecByContactId,
  isLinkyBankPaymentOfferExpired,
  isLinkyBankPaymentOfferTerminalStatus,
  isLinkyBankPaymentOfferWholeOfferTerminalStatus,
  LINKY_BANK_PAYMENT_OFFER_DETAILS_LOCK_KEY_PREFIX,
  LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT,
  LINKY_BANK_PAYMENT_OFFER_MAX_RECIPIENT_COUNT,
  LINKY_BANK_PAYMENT_OFFER_MIN_RECIPIENT_COUNT,
  markLinkyBankPaymentOfferBankDetailsSent,
  mergeBankPaymentOffersIntoLastMessageByContactId,
  readLinkyBankPaymentOfferSpdRecord,
  rememberLinkyBankPaymentOfferSpdPayload,
  type LinkyBankPaymentOfferStatus,
} from "../../lib/bankPaymentOffer";
import { collectUnreadNewestIncomingByContactId } from "../../lib/chatUnread";
import { buildLinkyPaymentRequestDeclineMessage } from "../../lib/paymentRequestMessage";
import {
  parsePrivateImageMessage,
  privateImagePreviewText,
} from "../../lib/privateImageMessage";
import type {
  ContactRowLike,
  LocalNostrMessage,
  PaymentLogData,
} from "../../types/appTypes";

const inMemoryNostrPictureCache = new Map<string, string | null>();

const isPubkey = Schema.is(Pubkey);
const isBankOfferId = Schema.is(BankOfferId);
const isNonEmptyTrimmedString = Schema.is(Schema.NonEmptyTrimmedString);
const isPositiveInt = Schema.is(Schema.Int.pipe(Schema.positive()));
const isUnixSeconds = Schema.is(UnixSeconds);

type ParsedOutboxRef =
  | { id: string; kind: "message" }
  | { id: string; kind: "reaction" };

const parseOutboxRef = (ref: string): ParsedOutboxRef | null => {
  for (const kind of ["message", "reaction"] as const) {
    const prefix = `${kind}:`;
    if (!ref.startsWith(prefix)) continue;
    const id = ref.slice(prefix.length).trim();
    return id ? { id, kind } : null;
  }
  return null;
};

const positiveInt = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const integer = Math.trunc(value);
  return isPositiveInt(integer) ? integer : undefined;
};

const positiveUnixSeconds = (value: unknown): UnixSeconds | undefined => {
  const integer = positiveInt(value);
  return integer !== undefined && isUnixSeconds(integer) ? integer : undefined;
};

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

const BANK_PAYMENT_OFFER_RESPONDER_RETRY_MS = 30_000;

const hasPendingBankPaymentOfferResponderWork = (
  messages: readonly LocalNostrMessage[],
  offererPubkeyHex: string,
  nowSec: number,
): boolean => {
  const entriesByOfferId = new Map<
    string,
    { hasPendingAccepted: boolean; wholeOfferTerminal: boolean }
  >();
  for (const message of messages) {
    const info = getLinkyBankPaymentOfferInfo(String(message.content ?? ""));
    if (
      !info ||
      String(info.offererPublicKey ?? "").trim() !== offererPubkeyHex
    ) {
      continue;
    }

    const entry = entriesByOfferId.get(info.offerId) ?? {
      hasPendingAccepted: false,
      wholeOfferTerminal: false,
    };
    if (isLinkyBankPaymentOfferWholeOfferTerminalStatus(info.status)) {
      entry.wholeOfferTerminal = true;
    } else if (
      info.status === "accepted" &&
      !isLinkyBankPaymentOfferExpired(
        info,
        Number(message.createdAtSec ?? 0),
        nowSec,
      )
    ) {
      entry.hasPendingAccepted = true;
    }
    entriesByOfferId.set(info.offerId, entry);
  }

  return Array.from(entriesByOfferId.values()).some(
    (entry) => entry.hasPendingAccepted && !entry.wholeOfferTerminal,
  );
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
  const pubkey = normalizePubkeyHex(pubkeyHex);
  return pubkey ? encodeNpub(Pubkey.make(pubkey)) : null;
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
  const sendBankOffer = useAtomSet(sendBankOfferAtom, {
    mode: "promiseExit",
  });
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
    const identity = identityFromNsec(currentNsec);
    if (!cancelled) setChatOwnPubkeyHex(identity?.pubkey ?? null);

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

  const [nostrMetadataByNpub, setNostrMetadataByNpub] = useState<
    Record<string, ProfileMetadata | null>
  >({});

  React.useEffect(() => {
    return () => {
      releaseAllAvatarObjectUrls();
      inMemoryNostrPictureCache.clear();
    };
  }, [currentNsec]);

  const [chatDraft, setChatDraft] = useState<string>("");

  const [chatSendIsBusy, setChatSendIsBusy] = useState(false);

  const [replyContext, setReplyContext] = useState<ReplyContext | null>(null);

  const replyContextRef = React.useRef<ReplyContext | null>(null);

  const [editContext, setEditContext] = useState<EditChatContext | null>(null);

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

  const nostrMetadataInFlight = React.useRef<Set<string>>(new Set());

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

      const pubkey = decodeNpub(npub);
      if (!pubkey) continue;
      records.push({ name, npub, pubkey });
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

  const reassignNostrConversationContactId = React.useCallback(
    (fromContactId: string, toContactId: string): number => {
      const normalizedFrom = String(fromContactId ?? "").trim();
      const normalizedTo = String(toContactId ?? "").trim();
      if (!normalizedFrom || !normalizedTo || normalizedFrom === normalizedTo) {
        return 0;
      }

      const movedMessageCount = reassignLocalNostrMessagesContactId(
        normalizedFrom,
        normalizedTo,
      );
      setBankPaymentOfferMessages((previous) => {
        let changed = false;
        const next = previous.map((message) => {
          if (String(message.contactId ?? "").trim() !== normalizedFrom) {
            return message;
          }
          changed = true;
          return { ...message, contactId: normalizedTo };
        });
        return changed ? next : previous;
      });
      return movedMessageCount;
    },
    [reassignLocalNostrMessagesContactId],
  );

  reassignContactMessagesRef.current = reassignNostrConversationContactId;

  const lastVisibleMessageByContactId = React.useMemo(
    () =>
      mergeBankPaymentOffersIntoLastMessageByContactId(
        lastMessageByContactId,
        bankPaymentOfferMessages,
      ),
    [bankPaymentOfferMessages, lastMessageByContactId],
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
  const deferredOnlineReady = useDeferredOnlineReady();
  const canRunNostrNetworkWork = deferredOnlineReady && nostrBootstrapReady;

  usePushRegistrationLifecycle({
    currentNsec,
    enabled: deferredOnlineReady,
  });

  const {
    canSaveNewRelay,
    newRelayUrl,
    nostrFetchRelays,
    pendingRelayDeleteUrl,
    relayUrls,
    requestDeleteSelectedRelay,
    saveNewRelay,
    selectedRelayUrl,
    setNewRelayUrl,
  } = useRelayDomain({
    currentNpub,
    currentNsec,
    networkEnabled: canRunNostrNetworkWork,
    route,
    setStatus,
    t,
  });

  useLinkstrConfigSync({ currentNsec, nostrFetchRelays });
  useLinkstrInspectorBridge();

  useLinkstrProfileSync({
    contacts,
    contactsOwnerId,
    contactsVisibleOwnerIds,
    currentNpub,
    enabled: nostrBootstrapReady,
    routeKind: route.kind,
    setNostrMetadataByNpub,
    setNostrPictureByNpub,
    setNostrStatusByNpub,
    update,
  });

  // ONE-TIME MIGRATION — remove together with src/app/migrations/.
  useRestoreClobberedContactNames({
    contacts,
    contactsOwnerId,
    contactsVisibleOwnerIds,
    update,
  });

  const [contactNewPrefill, setContactNewPrefill] = React.useState<null | {
    lnAddress: string;
    npub: string | null;
    suggestedName: string | null;
  }>(null);

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

    for (const [contactId, lastMessage] of lastVisibleMessageByContactId) {
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
    lastVisibleMessageByContactId,
    nostrMessagesLocal,
    unknownNameByNpub,
  ]);

  React.useEffect(() => {
    // The lightning-address match guesses identity and writes an npub, so it
    // only considers active contacts; a direct npub match also reclaims
    // threads of archived contacts.
    const activeContacts = contacts.filter((contact) => {
      const archivedAtSec = Number(contact.archivedAtSec ?? 0);
      return !Number.isFinite(archivedAtSec) || archivedAtSec <= 0;
    });

    for (const unknownContact of unknownContacts) {
      const unknownContactId = String(unknownContact.id ?? "").trim();
      const unknownNpub = normalizeNpubIdentifier(unknownContact.npub);
      if (!unknownContactId || !unknownNpub) continue;

      let knownContact = contacts.find((contact) => {
        const knownContactId = String(contact.id ?? "").trim();
        if (!knownContactId || knownContactId === unknownContactId) {
          return false;
        }
        return normalizeNpubIdentifier(contact.npub) === unknownNpub;
      });

      let matchedByLightningAddress = false;
      let matchedMetadata: ProfileMetadata | null = null;
      if (!knownContact) {
        matchedMetadata = loadCachedProfile(unknownNpub)?.metadata ?? null;
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

      reassignNostrConversationContactId(unknownContactId, knownContactId);
    }
  }, [
    contacts,
    contactsOwnerId,
    contactsVisibleOwnerIds,
    reassignNostrConversationContactId,
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

  const fetchProfilesOneShot = useAtomSet(fetchProfilesAtom, {
    mode: "promiseExit",
  });

  // Unknown senders and mentioned npubs are not watched; a cached read or one
  // batched profile fetch feeds both their display name and avatar.
  React.useEffect(() => {
    let cancelled = false;

    const applyMetadata = (npub: string, metadata: ProfileMetadata | null) => {
      if (cancelled) return;
      const name = metadata ? getBestNostrName(metadata) : null;
      setUnknownNameByNpub((prev) =>
        prev[npub] !== undefined ? prev : { ...prev, [npub]: name },
      );
      const url = getProfilePictureUrl(metadata);
      if (url) {
        setNostrPictureByNpub((prev) =>
          npub in prev ? prev : { ...prev, [npub]: url },
        );
      }
    };

    const run = async () => {
      const uncached: string[] = [];
      for (const npub of prefetchedMessageNpubs) {
        if (unknownNameByNpub[npub] !== undefined) continue;

        const cached = loadCachedProfile(npub);
        if (cached) {
          applyMetadata(npub, cached.metadata);
          continue;
        }

        if (!nostrBootstrapReady) continue;
        if (nostrMetadataInFlight.current.has(npub)) continue;
        uncached.push(npub);
      }
      if (uncached.length === 0) return;

      for (const npub of uncached) nostrMetadataInFlight.current.add(npub);
      try {
        const fetched = await fetchAndCacheProfiles(
          fetchProfilesOneShot,
          uncached,
        );
        for (const [npub, metadata] of fetched) applyMetadata(npub, metadata);
      } finally {
        for (const npub of uncached) nostrMetadataInFlight.current.delete(npub);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    fetchProfilesOneShot,
    nostrBootstrapReady,
    prefetchedMessageNpubs,
    unknownNameByNpub,
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
      const groupNames = getContactGroups(contact);
      const normalizedNpub = normalizeNpubIdentifier(contact.npub);
      const statusFilterValues = normalizedNpub
        ? extractStatusFilterCurrencies(nostrStatusByNpub[normalizedNpub])
        : [];
      const haystack = [
        contact.name,
        contact.npub,
        contact.lnAddress,
        ...groupNames,
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
        groupNames,
        haystack,
        statusFilterValues,
      };
    });
  }, [displayContacts, nostrStatusByNpub]);

  const { statusFilterCounts, statusFilterCurrencies } = React.useMemo(() => {
    const currencyCounts = new Map<string, number>();

    for (const contact of displayContacts) {
      if (Number(contact.archivedAtSec ?? 0) > 0) continue;
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
    if (archivedCount > 0) {
      options.push({
        count: archivedCount,
        label: t("archiveFilter"),
        value: ARCHIVED_CONTACTS_FILTER,
      });
    }
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
      const leftSpecialOrder =
        left.value === ARCHIVED_CONTACTS_FILTER
          ? 2
          : left.value === NO_GROUP_FILTER
            ? 1
            : 0;
      const rightSpecialOrder =
        right.value === ARCHIVED_CONTACTS_FILTER
          ? 2
          : right.value === NO_GROUP_FILTER
            ? 1
            : 0;
      if (leftSpecialOrder !== rightSpecialOrder) {
        return leftSpecialOrder - rightSpecialOrder;
      }
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

  const chatLastSeenAtSecByContactId = React.useMemo(() => {
    const byContactId = new Map<string, number>();
    for (const contact of contacts) {
      const contactId = String(contact.id ?? "").trim();
      const lastSeenAtSec = Number(contact.chatLastSeenAtSec ?? 0);
      if (!contactId || !Number.isFinite(lastSeenAtSec) || lastSeenAtSec <= 0) {
        continue;
      }
      byContactId.set(contactId, lastSeenAtSec);
    }
    return byContactId;
  }, [contacts]);

  const unreadByContactId = React.useMemo(
    () =>
      collectUnreadNewestIncomingByContactId(
        [...nostrMessagesLocal, ...bankPaymentOfferMessages],
        chatLastSeenAtSecByContactId,
      ),
    [
      bankPaymentOfferMessages,
      chatLastSeenAtSecByContactId,
      nostrMessagesLocal,
    ],
  );

  const visibleContacts = useVisibleContacts<DisplayContact>({
    activeGroup,
    contactNameCollator,
    contactsSearchData: displayContactsSearchData,
    contactsSearchParts,
    lastMessageByContactId: lastVisibleMessageByContactId,
    noGroupFilterValue: NO_GROUP_FILTER,
    pinnedContactId: recentlyAddedContactId,
    unreadByContactId,
  });

  const bankPaymentOfferCurrency =
    route.kind === "bankPayment"
      ? getBankPaymentOfferCurrency(route.spdPayload)
      : null;

  const lastBankPaymentOfferResponseSecByContactId = React.useMemo(
    () =>
      getLastBankPaymentOfferResponseSecByContactId(bankPaymentOfferMessages),
    [bankPaymentOfferMessages],
  );

  const bankPaymentOfferContacts = React.useMemo(() => {
    if (!bankPaymentOfferCurrency) return [];

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
        ).includes(bankPaymentOfferCurrency)
      ) {
        return [];
      }

      return [
        {
          ...contact,
          lastBankPaymentResponseSec:
            lastBankPaymentOfferResponseSecByContactId.get(
              String(contact.id ?? "").trim(),
            ) ?? null,
          pictureUrl: nostrPictureByNpub[normalizedNpub] ?? null,
        },
      ];
    });
  }, [
    bankPaymentOfferCurrency,
    lastBankPaymentOfferResponseSecByContactId,
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
        groups: [],
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

  const requestBankPaymentOffer = React.useCallback(
    async (args: {
      amountSat?: unknown;
      amountText: string;
      contacts: readonly { id?: unknown; name?: unknown; npub?: unknown }[];
      spdPayload?: unknown;
    }): Promise<{ chatId: string; offerId: string } | null> => {
      const amountSatRaw = Number(args.amountSat ?? 0);
      const amountSat =
        Number.isFinite(amountSatRaw) && amountSatRaw > 0
          ? Math.round(amountSatRaw)
          : null;
      const amountText = String(args.amountText ?? "").trim();
      const spdPayload = String(args.spdPayload ?? "").trim();
      if (!amountText) {
        setStatus(t("spdPaymentOfferMissingAmount"));
        return null;
      }
      if (args.contacts.length === 0) {
        setStatus(t("spdPaymentOfferFailed"));
        return null;
      }
      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return null;
      }

      try {
        const identity = identityFromNsec(currentNsec);
        if (!identity) throw new Error("invalid nsec");
        const myPubHex = identity.pubkey;

        const recipients: {
          contactId: string;
          contactPubHex: string;
        }[] = [];
        for (const contact of args.contacts) {
          const contactId = String(contact.id ?? "").trim();
          const contactNpub = normalizeNpubIdentifier(contact.npub);
          if (!contactId || !contactNpub) continue;

          const contactPubHex = decodeNpub(contactNpub);
          if (!contactPubHex) continue;
          recipients.push({ contactId, contactPubHex });
        }

        if (recipients.length === 0) {
          setStatus(t("chatMissingContactNpub"));
          return null;
        }

        const offerId = makeLocalId();
        if (!isBankOfferId(offerId)) {
          setStatus(t("spdPaymentOfferFailed"));
          return null;
        }
        if (spdPayload) {
          // Persisted so the offer survives an app reload: the auto-responder
          // needs this payload when a recipient's acceptance arrives later.
          rememberLinkyBankPaymentOfferSpdPayload({
            offerId,
            ownerPubkey: myPubHex,
            spdPayload,
          });
        }

        let sentCount = 0;
        let firstSentContactId = "";

        for (const recipient of recipients) {
          if (!isPubkey(recipient.contactPubHex)) continue;

          const clientId = ClientId.make(makeLocalId());
          const text = getLinkyBankPaymentOfferMessageText(
            amountText,
            "offered",
          );
          if (!isNonEmptyTrimmedString(text)) continue;

          const exit = await sendBankOffer(
            new BankOfferDraft({
              to: recipient.contactPubHex,
              offerId,
              offerer: myPubHex,
              status: "offered",
              amountText,
              text,
              ...(amountSat !== null && isPositiveInt(amountSat)
                ? { amountSat }
                : {}),
              clientId,
            }),
          );

          if (!Exit.isSuccess(exit)) continue;
          sentCount += 1;
          if (!firstSentContactId) {
            firstSentContactId = recipient.contactId;
          }

          upsertBankPaymentOfferMessage({
            clientId,
            contactId: recipient.contactId,
            content: exit.value.content,
            createdAtSec: exit.value.sentAt,
            direction: "out",
            id: `bank-payment-offer:${recipient.contactId}:${offerId}`,
            localOnly: true,
            pubkey: myPubHex,
            rumorId: null,
            status: "sent",
            wrapId: exit.value.selfCopy.wrapId,
          });
        }

        if (sentCount === 0) {
          setStatus(t("spdPaymentOfferFailed"));
          return null;
        }

        return { chatId: firstSentContactId, offerId };
      } catch (error) {
        setStatus(
          `${t("errorPrefix")}: ${getUnknownErrorMessage(error, "publish failed")}`,
        );
        return null;
      }
    },
    [currentNsec, sendBankOffer, setStatus, t, upsertBankPaymentOfferMessage],
  );

  const respondToBankPaymentOffer = React.useCallback(
    async (
      message: LocalNostrMessage,
      nextStatus: LinkyBankPaymentOfferStatus,
      options?: {
        expiresAtSec?: number | null;
        extensionSec?: number | null;
        spdPayload?: string | null;
        withPush?: boolean;
      },
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
        const identity = identityFromNsec(currentNsec);
        if (!identity) throw new Error("invalid nsec");
        const myPubHex = identity.pubkey;
        const messageDirection = String(message.direction ?? "").trim();
        const offererPublicKey =
          String(offerInfo.offererPublicKey ?? "").trim() ||
          (messageDirection === "out"
            ? myPubHex
            : String(message.pubkey ?? "").trim());

        if (!isPubkey(offererPublicKey)) {
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
          contactPubkey = decodeNpub(contactNpub);
        }

        const messagePubkey = String(message.pubkey ?? "").trim();
        const recipientPublicKey =
          offererPublicKey === myPubHex
            ? (contactPubkey ??
              (messagePubkey !== myPubHex ? messagePubkey : ""))
            : offererPublicKey;
        if (!isPubkey(recipientPublicKey) || recipientPublicKey === myPubHex) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const offerId = offerInfo.offerId;
        const amountText = offerInfo.amountText;
        if (!isBankOfferId(offerId) || !isNonEmptyTrimmedString(amountText)) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const clientId = ClientId.make(makeLocalId());
        const initiatedAtSec = positiveUnixSeconds(
          offerInfo.initiatedAtSec ?? Number(message.createdAtSec ?? 0),
        );
        const bankPaidAtSec = positiveUnixSeconds(
          offerInfo.bankPaidAtSec ??
            (offerInfo.status === "bank_paid"
              ? offerInfo.statusUpdatedAtSec
              : null),
        );
        const expiresAtSec = positiveUnixSeconds(options?.expiresAtSec);
        const extensionSec = positiveInt(options?.extensionSec);
        const amountSat = positiveInt(offerInfo.amountSat);
        const spdPayload = String(
          options?.spdPayload ?? offerInfo.spdPayload ?? "",
        ).trim();
        const text = getLinkyBankPaymentOfferMessageText(
          amountText,
          nextStatus,
          extensionSec,
        );
        if (!isNonEmptyTrimmedString(text)) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const exit = await sendBankOffer(
          new BankOfferDraft({
            to: recipientPublicKey,
            offerId,
            offerer: offererPublicKey,
            status: nextStatus,
            amountText,
            text,
            ...(amountSat === undefined ? {} : { amountSat }),
            ...(initiatedAtSec === undefined ? {} : { initiatedAtSec }),
            ...(bankPaidAtSec === undefined ? {} : { bankPaidAtSec }),
            ...(expiresAtSec === undefined ? {} : { expiresAtSec }),
            ...(extensionSec === undefined ? {} : { extensionSec }),
            ...(isNonEmptyTrimmedString(spdPayload) ? { spdPayload } : {}),
            ...(options?.withPush === undefined
              ? {}
              : { pushMark: options.withPush }),
            clientId,
          }),
        );
        if (!Exit.isSuccess(exit)) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        upsertBankPaymentOfferMessage({
          clientId,
          contactId: String(message.contactId ?? "").trim(),
          content: exit.value.content,
          createdAtSec: exit.value.sentAt,
          direction: offererPublicKey === myPubHex ? "out" : "in",
          id: `bank-payment-offer:${offerInfo.offerId}`,
          localOnly: true,
          pubkey: offererPublicKey === myPubHex ? myPubHex : offererPublicKey,
          rumorId: null,
          status: "sent",
          wrapId: exit.value.selfCopy.wrapId,
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
      sendBankOffer,
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
      nextStatus: LinkyBankPaymentOfferStatus,
      options?: {
        expiresAtSec?: number | null;
        extensionSec?: number | null;
        spdPayload?: string | null;
        withPush?: boolean;
      },
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
    let retryTimeoutHandle: number | undefined;

    const run = async () => {
      try {
        const identity = identityFromNsec(currentNsec);
        if (!identity) return;
        const myPubHex = identity.pubkey;
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

          if (
            group.some(
              (entry) =>
                entry.info &&
                isLinkyBankPaymentOfferWholeOfferTerminalStatus(
                  entry.info.status,
                ),
            )
          ) {
            forgetLinkyBankPaymentOfferSpdPayload(offerId);
            continue;
          }

          const notifyNonWinningCandidates = async (
            winner: LocalNostrMessage,
          ): Promise<void> => {
            const winnerContactId = String(winner.contactId ?? "").trim();
            for (const entry of group) {
              const contactId = String(entry.message.contactId ?? "").trim();
              if (!contactId || contactId === winnerContactId) continue;
              if (
                entry.info?.status !== "offered" &&
                entry.info?.status !== "accepted"
              ) {
                continue;
              }

              await respondToBankPaymentOffer(
                entry.message,
                "accepted_by_other",
              );
            }
          };

          const activeBankDetails = group
            .filter(
              (entry) =>
                entry.info?.status === "bank_details_sent" ||
                entry.info?.status === "bank_paid",
            )
            .sort((left, right) => {
              const leftSec =
                left.info?.statusUpdatedAtSec ??
                Number(left.message.createdAtSec ?? 0);
              const rightSec =
                right.info?.statusUpdatedAtSec ??
                Number(right.message.createdAtSec ?? 0);
              return leftSec - rightSec;
            })[0];
          if (activeBankDetails) {
            try {
              await withLocalStorageLeaseLock({
                key: `${LINKY_BANK_PAYMENT_OFFER_DETAILS_LOCK_KEY_PREFIX}.${offerId}`,
                timeoutMs: 0,
                fn: async () => {
                  await notifyNonWinningCandidates(activeBankDetails.message);
                },
              });
            } catch {
              // Another tab is already closing the non-winning candidates.
            }
            continue;
          }

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

          const candidateKey = `${offerId}:${String(candidate.message.contactId ?? "").trim()}`;
          const record = readLinkyBankPaymentOfferSpdRecord({
            offerId,
            ownerPubkey: myPubHex,
          });
          // Details go to exactly one winner, so any recorded send blocks the
          // offer — a per-candidate check would let a tab with a lagging
          // message view send the same bank details to a second recipient.
          if (!record || record.sentCandidateKeys.length > 0) {
            continue;
          }

          try {
            await withLocalStorageLeaseLock({
              key: `${LINKY_BANK_PAYMENT_OFFER_DETAILS_LOCK_KEY_PREFIX}.${offerId}`,
              timeoutMs: 0,
              fn: async () => {
                // Re-read under the lock: another tab may have just sent.
                const lockedRecord = readLinkyBankPaymentOfferSpdRecord({
                  offerId,
                  ownerPubkey: myPubHex,
                });
                if (!lockedRecord) return;
                if (lockedRecord.sentCandidateKeys.length > 0) return;

                const sent = await respondToBankPaymentOffer(
                  candidate.message,
                  "bank_details_sent",
                  {
                    spdPayload: lockedRecord.spdPayload,
                  },
                );
                // Marked only after a successful publish so an interrupted
                // send retries; the lease lock covers the concurrent window.
                if (sent) {
                  markLinkyBankPaymentOfferBankDetailsSent({
                    candidateKey,
                    offerId,
                  });
                  await notifyNonWinningCandidates(candidate.message);
                }
              },
            });
          } catch {
            // Another tab holds the send lock for this offer; let it finish.
          }
        }

        if (cancelled) return;
        // A failed publish or a skipped lease lock leaves the message state
        // unchanged, so nothing re-runs this effect; keep retrying while an
        // accepted entry of my own offer is still waiting for bank details.
        if (
          hasPendingBankPaymentOfferResponderWork(
            bankPaymentOfferMessages,
            myPubHex,
            Math.floor(Date.now() / 1e3),
          )
        ) {
          retryTimeoutHandle = window.setTimeout(() => {
            void run();
          }, BANK_PAYMENT_OFFER_RESPONDER_RETRY_MS);
        }
      } catch {
        // Best effort; the sender can retry when the accepted event reappears.
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (retryTimeoutHandle !== undefined) {
        window.clearTimeout(retryTimeoutHandle);
      }
    };
  }, [bankPaymentOfferMessages, currentNsec, respondToBankPaymentOffer]);

  const bankPaymentOfferExpiryGroups = React.useMemo(() => {
    if (!currentNpub || bankPaymentOfferMessages.length === 0) return [];

    const myPubHex = decodeNpub(currentNpub);
    if (!myPubHex) return [];

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

      const expiresAtSec = Math.max(
        ...group
          .filter((entry) => entry.info.status === activeStatus)
          .map(
            (entry) =>
              getLinkyBankPaymentOfferExpiresAtSec(
                entry.info,
                Number(entry.message.createdAtSec ?? 0),
              ) ?? nowSec,
          ),
      );
      return [
        {
          expiresAtMs: expiresAtSec * 1_000,
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

  useOutboxResults(async (result) => {
    const ref = String(result.ref);
    const parsedRef = parseOutboxRef(ref);
    if (!parsedRef) return;

    if (result instanceof OutboxJobFailed) {
      void appendPushDebugLog("client", "outbox job failed", {
        detail: result.detail,
        reason: result.reason,
        ref,
      });
      return;
    }
    if (!(result instanceof OutboxJobSucceeded)) return;

    const receipt = result.receipt;
    if (
      parsedRef.kind === "message" &&
      (receipt instanceof ChatMessageReceipt ||
        receipt instanceof MessageEditReceipt)
    ) {
      updateLocalNostrMessage(parsedRef.id, {
        rumorId: receipt.messageId,
        status: "sent",
        wrapId: receipt.selfCopy.wrapId,
      });
      return;
    }
    if (parsedRef.kind === "reaction" && receipt instanceof ReactionReceipt) {
      updateLocalNostrReaction(parsedRef.id, {
        status: "sent",
        wrapId: receipt.reactionId,
      });
    }
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

    const archivedAtSec = Math.ceil(Date.now() / 1e3);
    const storedContactOwnerId = contactToArchive
      ? resolveContactRowOwnerLane(contactToArchive, contactsVisibleOwnerIds)
      : null;
    const archiveOwnerId = storedContactOwnerId ?? contactsOwnerId;
    // Archiving marks the conversation read; the messages stay on this contact
    // and a newer incoming message restores it from the archive.
    const payload = {
      id,
      archivedAtSec,
      chatLastSeenAtSec: Math.max(
        archivedAtSec,
        Number(contactToArchive?.chatLastSeenAtSec ?? 0) || 0,
      ),
    };
    const result = archiveOwnerId
      ? update("contact", payload, { ownerId: archiveOwnerId })
      : update("contact", payload);
    if (result.ok) {
      setStatus(t("contactArchived"));
      closeContactDetail();
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const unarchiveContact = React.useCallback(
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
          const unknownContactId = buildUnknownContactId(
            decodeNpub(restoredNpub),
          );
          if (unknownContactId) {
            reassignNostrConversationContactId(unknownContactId, String(id));
          }
        }
      }
      return result;
    },
    [
      contacts,
      contactsOwnerId,
      contactsVisibleOwnerIds,
      reassignNostrConversationContactId,
      update,
    ],
  );

  const restoreArchivedContact = React.useCallback(
    (id: ContactId) => {
      const result = unarchiveContact(id);
      if (result.ok) {
        setStatus(t("contactRestored"));
        closeContactDetail();
        return;
      }
      setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
    },
    [closeContactDetail, setStatus, t, unarchiveContact],
  );

  const publishMuteList = useAtomSet(publishMuteListAtom, {
    mode: "promiseExit",
  });

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

      // Local blocklist applies either way; the mute list is best effort.
      if (currentNsec) {
        void publishMuteList(mergedBlockedPubkeys.filter(isPubkey));
      }

      return true;
    },
    [currentNsec, publishMuteList],
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

  // An incoming message newer than the archive brings the contact back.
  React.useEffect(() => {
    for (const contact of contacts) {
      const archivedAtSec = Number(contact.archivedAtSec ?? 0);
      if (!Number.isFinite(archivedAtSec) || archivedAtSec <= 0) continue;
      const contactId = String(contact.id ?? "").trim();
      if (!contactId) continue;
      const newestIncomingAtSec = unreadByContactId.get(contactId) ?? 0;
      if (newestIncomingAtSec <= archivedAtSec) continue;
      unarchiveContact(contact.id);
    }
  }, [contacts, unarchiveContact, unreadByContactId]);

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

    const blockedPubkey = decodeNpub(normalizedNpub);

    if (!blockedPubkey) {
      setStatus(t("chatMissingContactNpub"));
      return;
    }

    await blockPubkeyAndPublishMuteList(blockedPubkey);

    const contactId = String(selectedContact.id ?? "").trim();
    if (contactId) {
      removeLocalNostrMessagesByContactId(contactId);
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
    [contactPayBackToChatRef, contacts, openContactPay],
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
      reassignNostrConversationContactId(contactId, existing.id);
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
    contactsOwnerId,
    buildSavedContactName,
    contacts,
    insert,
    pendingUnknownContactAddRef,
    reassignNostrConversationContactId,
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

      return decodeNpub(normalizedNpub);
    })();

    if (!unknownPubkeyHex) return;

    await blockPubkeyAndPublishMuteList(unknownPubkeyHex);

    removeLocalNostrMessagesByContactId(contactId);
    setStatus(t("chatUnknownContactBlocked"));
    navigateTo({ route: "contacts" });
  }, [
    blockPubkeyAndPublishMuteList,
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
        const groupNames = getContactGroups(contact);
        return [
          {
            name,
            npub,
            groupName: groupName || null,
            groupNames,
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

  const addNpubMessageContacts = React.useCallback(
    (rawNpubs: readonly string[]) => {
      const savedNpubs = new Set(
        contacts.flatMap((contact) => {
          const npub = normalizeNpubIdentifier(contact.npub);
          return npub ? [npub] : [];
        }),
      );
      const myNpub = normalizeNpubIdentifier(currentNpub);
      if (myNpub) savedNpubs.add(myNpub);

      const newNpubs: string[] = [];
      for (const rawNpub of rawNpubs) {
        const npub = normalizeNpubIdentifier(rawNpub);
        if (!npub || savedNpubs.has(npub)) continue;
        savedNpubs.add(npub);
        newNpubs.push(npub);
      }
      if (newNpubs.length === 0) return;

      if (
        activeContactsOwnerContactCount + newNpubs.length >
        MAX_CONTACTS_PER_OWNER
      ) {
        setStatus(
          t("contactsLimitReached").replace(
            "{max}",
            String(MAX_CONTACTS_PER_OWNER),
          ),
        );
        return;
      }

      const payloads = newNpubs.flatMap((npub) => {
        const defaultProfile = deriveDefaultProfile(npub, lang);
        const name = Evolu.NonEmptyString1000.fromUnknown(
          buildSavedContactName(
            unknownNameByNpub[npub] ?? defaultProfile.name,
            npub,
          ),
        );
        const parsedNpub = Evolu.NonEmptyString1000.fromUnknown(npub);
        if (!name.ok || !parsedNpub.ok) return [];

        return [
          {
            name: name.value,
            npub: parsedNpub.value,
            lnAddress: null,
            groupName: null,
          },
        ];
      });
      if (payloads.length !== newNpubs.length) {
        setStatus(`${t("errorPrefix")}: ${t("invalidNpub")}`);
        return;
      }

      for (const payload of payloads) {
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
      }

      setStatus(t("contactsSaved").replace("{count}", String(payloads.length)));
    },
    [
      activeContactsOwnerContactCount,
      buildSavedContactName,
      contacts,
      contactsOwnerId,
      currentNpub,
      insert,
      lang,
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
    reassignNostrConversationContactId(pending.sourceContactId, existing.id);
    setStatus(t("contactSaved"));
    navigateTo({ route: "chat", id: String(existing.id) });
  }, [contacts, reassignNostrConversationContactId, setStatus, t]);

  const sendChatMessage = useSendChatMessage({
    appendLocalNostrMessage,
    chatDraft,
    chatSendIsBusy,
    currentNsec,
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
    async (file: File, replyToMessage?: LocalNostrMessage) => {
      if (editContext) return;
      const replyToId = String(replyToMessage?.rumorId ?? "").trim();
      await sendChatMessage({
        clearDraft: false,
        imageFile: file,
        ...(replyToId
          ? {
              replyContext: {
                replyToId,
                rootMessageId:
                  String(replyToMessage?.rootMessageId ?? "").trim() ||
                  replyToId,
                replyToContent:
                  String(replyToMessage?.content ?? "").trim() || null,
              },
            }
          : {}),
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
        messageRumorId,
        targetKind: parsePrivateImageMessage(message.content)
          ? "image"
          : "text",
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

  const dispatchInboxEvent = useLinkstrInboxSync({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    bankPaymentOfferMessages,
    contacts,
    currentNsec,
    enabled: nostrBootstrapReady,
    formatDisplayedAmountText,
    logPayStep,
    maybeShowPwaNotification,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrReactionWrapIdsRef,
    nostrReactionsLocal,
    onBankPaymentOfferMessage: upsertBankPaymentOfferMessage,
    onOpenInboxMessageToast: openInboxMessageToast,
    pushToast,
    route,
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

  useChatReadCursorSync({
    chatMessages: chatMessagesWithBankPaymentOffers,
    contactsOwnerId,
    contactsVisibleOwnerIds,
    route,
    selectedContact,
    update,
  });

  return {
    activeContactsOwnerContactCount,
    activeGroup,
    addNewContactFromIdentifier,
    addNewContactFromSearchResult,
    addNpubMessageContacts,
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
    chatSendIsBusy,
    closeContactDetail,
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
    dispatchInboxEvent,
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
    lastMessageByContactId: lastVisibleMessageByContactId,
    mentionContacts,
    newRelayUrl,
    nostrBootstrapReady,
    nostrFetchRelays,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrMessagesRecent,
    nostrMetadataByNpub,
    nostrPictureByNpub,
    nostrReactionWrapIdsRef,
    nostrReactionsLocal,
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
    reactionsByMessageId,
    reassignLocalNostrMessagesContactId: reassignNostrConversationContactId,
    relayUrls,
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
    unreadByContactId,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
    upsertBankPaymentOfferMessage,
    visibleContacts,
  };
};
