import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import type { PushToastOptions } from "../../../hooks/useToasts";
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
  isLinkyBankPaymentOfferExpired,
  isLinkyBankPaymentOfferTerminalStatus,
  isLinkyBankPaymentOfferWholeOfferTerminalStatus,
} from "../../lib/bankPaymentOffer";
import { isCashuNotificationMessage } from "../../lib/cashuNotificationCopy";
import { formatChatMessagePreviewText } from "../../lib/chatMessageDisplay";
import {
  isOpenBankPaymentOffer,
  isOpenChatForContact,
} from "../../lib/inboxNotificationRoute";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import {
  getLinkyBankPaymentOfferPaymentNoticeOfferId,
  isLinkyBankPaymentOfferPaymentNoticeEvent,
} from "../../lib/pushWrappedEvent";
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
import { buildUnknownContactId, normalizePubkeyHex } from "./contactIdentity";
import type { KnownNostrMessageIdentityIndex } from "./messageHelpers";
import {
  createNostrInboxSeenState,
  processNostrInboxWrap,
  resolveNostrInboxRelays,
  type NostrInboxBankPaymentOfferOutcome,
  type NostrInboxInsertedMessageOutcome,
  type NostrInboxPaymentNoticeOutcome,
} from "./nostrInboxPipeline";

const PAYMENT_NOTICE_SEEN_WRAP_IDS_STORAGE_KEY_PREFIX =
  "linky.nostr.payment_notice_seen_wrap_ids.v1";
const MAX_PERSISTED_PAYMENT_NOTICE_WRAP_IDS = 200;
const PAYMENT_NOTICE_MATCH_WINDOW_SECONDS = 120;
// NIP-59 randomizes outer wrap created_at up to two days into the past, so a
// fresh wrap can rank below dozens of older-looking ones; backfill needs a
// since window (matching the push service's catch-up) rather than a small
// newest-first limit.
const INBOX_BACKFILL_SINCE_SEC = 3 * 24 * 60 * 60;
const INBOX_BACKFILL_LIMIT = 500;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const getPaymentNoticeSeenWrapIdsStorageKey = (pubkeyHex: string): string =>
  `${PAYMENT_NOTICE_SEEN_WRAP_IDS_STORAGE_KEY_PREFIX}.${pubkeyHex}`;

const readSeenPaymentNoticeWrapIds = (pubkeyHex: string): Set<string> => {
  const values = safeLocalStorageGetJson<string[]>(
    getPaymentNoticeSeenWrapIdsStorageKey(pubkeyHex),
    [],
  )
    .map(normalizeText)
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

interface InboxContact {
  id: string;
  name: string | null;
  npub: string | null;
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
  enabled?: boolean;
  formatDisplayedAmountText?: (amountSat: number) => string;
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
  enabled = true,
  formatDisplayedAmountText = (amountSat: number) => `${amountSat} sat`,
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
  const latestValuesRef = React.useRef({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    bankPaymentOfferMessages,
    contacts,
    formatDisplayedAmountText,
    knownNostrMessageIdentityIndex,
    maybeShowPwaNotification,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    onBankPaymentOfferMessage,
    onOpenInboxMessageToast,
    pushToast,
    route,
    setContactAttentionById,
    softDeleteLocalNostrReactionsByWrapIds,
    t,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  });
  latestValuesRef.current = {
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    bankPaymentOfferMessages,
    contacts,
    formatDisplayedAmountText,
    knownNostrMessageIdentityIndex,
    maybeShowPwaNotification,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    onBankPaymentOfferMessage,
    onOpenInboxMessageToast,
    pushToast,
    route,
    setContactAttentionById,
    softDeleteLocalNostrReactionsByWrapIds,
    t,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  };
  const relaySignature = resolveNostrInboxRelays(nostrFetchRelays).join("\n");

  React.useEffect(() => {
    if (!enabled || !currentNsec) return;

    let cancelled = false;
    const relays = relaySignature.split("\n");
    const identitySinceSec =
      getInitialNostrIdentitySource() === "custom"
        ? getInitialNostrIdentitySwitchedAtSec()
        : null;
    const seen = createNostrInboxSeenState();
    for (const message of latestValuesRef.current.nostrMessagesRecent) {
      const wrapId = normalizeText(message.wrapId);
      if (wrapId) seen.wrapIds.add(wrapId);
    }
    for (const wrapId of paymentNoticeWrapIdsRef.current) {
      if (normalizeText(wrapId)) seen.wrapIds.add(normalizeText(wrapId));
    }
    for (const wrapId of bankPaymentOfferWrapIdsRef.current) {
      if (normalizeText(wrapId)) seen.wrapIds.add(normalizeText(wrapId));
    }

    const run = async () => {
      try {
        const { getPublicKey, nip19 } = await import("nostr-tools");
        const { unwrapEvent } = await import("nostr-tools/nip17");
        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          return;
        }
        const privateKey = decodedMe.data;
        const myPubkey = getPublicKey(privateKey);
        paymentNoticeWrapIdsRef.current = new Set([
          ...readSeenPaymentNoticeWrapIds(myPubkey),
          ...paymentNoticeWrapIdsRef.current,
        ]);
        for (const wrapId of paymentNoticeWrapIdsRef.current) {
          if (normalizeText(wrapId)) seen.wrapIds.add(normalizeText(wrapId));
        }

        const rememberPaymentNotice = (wrapId: string) => {
          const normalizedWrapId = normalizeText(wrapId);
          if (!normalizedWrapId) return;
          seen.wrapIds.add(normalizedWrapId);
          paymentNoticeWrapIdsRef.current.add(normalizedWrapId);
          persistSeenPaymentNoticeWrapIds(
            myPubkey,
            paymentNoticeWrapIdsRef.current,
          );
        };

        const contactByPubkey = new Map<string, InboxContact>();
        let indexedContacts: readonly TContact[] | null = null;
        const refreshContactIndex = (): void => {
          const latestContacts = latestValuesRef.current.contacts;
          if (indexedContacts === latestContacts) return;
          indexedContacts = latestContacts;
          contactByPubkey.clear();
          for (const contact of latestContacts) {
            const archivedAtSec = Number(contact.archivedAtSec ?? 0);
            if (Number.isFinite(archivedAtSec) && archivedAtSec > 0) continue;
            const npub = normalizeNpubIdentifier(contact.npub);
            if (!npub) continue;
            try {
              const decoded = nip19.decode(npub);
              if (decoded.type !== "npub" || typeof decoded.data !== "string") {
                continue;
              }
              const pubkey = normalizePubkeyHex(decoded.data);
              const id = normalizeText(contact.id);
              if (!pubkey || !id) continue;
              contactByPubkey.set(pubkey, {
                id,
                name: normalizeText(contact.name) || null,
                npub,
              });
            } catch {
              // ignore invalid contact keys
            }
          }
        };
        const findContact = (pubkey: string): InboxContact | null => {
          refreshContactIndex();
          const normalizedPubkey = normalizePubkeyHex(pubkey);
          return normalizedPubkey
            ? (contactByPubkey.get(normalizedPubkey) ?? null)
            : null;
        };
        refreshContactIndex();

        const isBlockedPubkey = (pubkey: string): boolean => {
          const normalizedPubkey = normalizePubkeyHex(pubkey);
          if (!normalizedPubkey) return false;
          return safeLocalStorageGetJson(BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY, [])
            .map(normalizePubkeyHex)
            .filter((entry): entry is string => Boolean(entry))
            .includes(normalizedPubkey);
        };

        const hasStoredIncomingCashuToken = (
          contactId: string,
          createdAtSec: number,
        ): boolean =>
          latestValuesRef.current.nostrMessagesLatestRef.current.some(
            (message) =>
              normalizeText(message.contactId) === contactId &&
              normalizeText(message.direction) === "in" &&
              Number.isFinite(message.createdAtSec) &&
              Math.abs(message.createdAtSec - createdAtSec) <=
                PAYMENT_NOTICE_MATCH_WINDOW_SECONDS &&
              isCashuNotificationMessage(message.content),
          );

        const senderLabel = (
          contact: InboxContact | null,
          peerPubkey: string,
        ): string =>
          contact?.name ??
          formatShortNpub(contact?.npub ?? nip19.npubEncode(peerPubkey)) ??
          latestValuesRef.current.t("unknownContactTitle");

        const showVisibleToast = (
          message: string,
          options?: PushToastOptions,
        ): void => {
          try {
            if (document.visibilityState === "visible") {
              if (options) {
                latestValuesRef.current.pushToast(message, options);
              } else {
                latestValuesRef.current.pushToast(message);
              }
            }
          } catch {
            // No document in non-browser environments.
          }
        };

        const handlePaymentNotice = (
          outcome: NostrInboxPaymentNoticeOutcome,
        ): void => {
          rememberPaymentNotice(outcome.wrapId);
          if (
            hasStoredIncomingCashuToken(outcome.contactId, outcome.createdAtSec)
          ) {
            return;
          }
          if (outcome.delivery !== "live") return;

          const latest = latestValuesRef.current;
          const contact = findContact(outcome.peerPubkey);
          const paymentNoticeText = isLinkyBankPaymentOfferPaymentNoticeEvent(
            outcome.rumor,
          )
            ? latest.t("notificationReceivedBankPaymentReimbursement")
            : latest.t("notificationReceivedMoney");
          const isActiveChat = isOpenChatForContact(
            latest.route,
            outcome.contactId,
          );
          const offerId =
            getLinkyBankPaymentOfferPaymentNoticeOfferId(outcome.rumor) ?? "";
          const isActiveOffer = isOpenBankPaymentOffer(latest.route, offerId);
          if (!isActiveChat && !isActiveOffer) {
            latest.setContactAttentionById((previous) => ({
              ...previous,
              [outcome.contactId]: Date.now(),
            }));
            showVisibleToast(
              latest
                .t("chatIncomingMessageToast")
                .replace("{name}", senderLabel(contact, outcome.peerPubkey))
                .replace("{message}", paymentNoticeText),
            );
          }
          const title =
            contact?.name ??
            (contact ? latest.t("appTitle") : latest.t("unknownContactTitle"));
          void latest.maybeShowPwaNotification(
            title,
            paymentNoticeText,
            outcome.wrapId,
          );
        };

        const handleBankPaymentOffer = (
          outcome: NostrInboxBankPaymentOfferOutcome,
        ): void => {
          const latest = latestValuesRef.current;
          const content = outcome.rumor.content;
          const offerInfo = getLinkyBankPaymentOfferInfo(content);
          const offerText = getLinkyBankPaymentOfferText(content);
          if (!offerText) return;
          const offerId = normalizeText(offerInfo?.offerId);
          const isTerminalOffer = offerInfo
            ? isLinkyBankPaymentOfferTerminalStatus(offerInfo.status)
            : false;
          // Whole-offer statuses only: one recipient's declined thread must
          // not swallow another recipient's later acceptance of the offer.
          const hasTerminalKnownOffer = offerId
            ? latest.bankPaymentOfferMessages.some((message) => {
                const knownInfo = getLinkyBankPaymentOfferInfo(message.content);
                return (
                  knownInfo?.offerId === offerId &&
                  isLinkyBankPaymentOfferWholeOfferTerminalStatus(
                    knownInfo.status,
                  )
                );
              })
            : false;
          const isExpiredOffer =
            offerInfo && !isTerminalOffer
              ? isLinkyBankPaymentOfferExpired(
                  offerInfo,
                  outcome.createdAtSec,
                  Math.floor(Date.now() / 1e3),
                )
              : false;

          bankPaymentOfferWrapIdsRef.current.add(outcome.wrapId);
          seen.wrapIds.add(outcome.wrapId);
          if (isExpiredOffer || (!isTerminalOffer && hasTerminalKnownOffer)) {
            return;
          }

          const offerMessage: LocalNostrMessage = {
            contactId: outcome.contactId,
            content,
            createdAtSec: outcome.createdAtSec,
            direction: outcome.isOutgoing ? "out" : "in",
            id: `bank-payment-offer:${outcome.wrapId}`,
            localOnly: true,
            pubkey: outcome.offererPubkey,
            rumorId: null,
            status: "sent",
            wrapId: outcome.wrapId,
            ...(normalizeText(
              outcome.rumor.tags.find((tag) => tag[0] === "client")?.[1],
            )
              ? {
                  clientId: normalizeText(
                    outcome.rumor.tags.find((tag) => tag[0] === "client")?.[1],
                  ),
                }
              : {}),
          };
          latest.onBankPaymentOfferMessage(offerMessage);
          if (outcome.delivery !== "live") return;

          const contact = findContact(outcome.peerPubkey);
          const activeChat = isOpenChatForContact(
            latest.route,
            outcome.contactId,
          );
          const activeOffer = isOpenBankPaymentOffer(latest.route, offerId);
          if (isTerminalOffer) {
            if (
              offerInfo?.status === "accepted_by_other" &&
              !outcome.isOutgoing &&
              !outcome.isSelfAuthored &&
              !activeChat &&
              !activeOffer
            ) {
              latest.setContactAttentionById((previous) => ({
                ...previous,
                [outcome.contactId]: Date.now(),
              }));
              const notificationText = latest.t(
                "bankPaymentOfferAcceptedByOther",
              );
              const label = senderLabel(contact, outcome.peerPubkey);
              showVisibleToast(
                latest
                  .t("chatIncomingMessageToast")
                  .replace("{name}", label)
                  .replace("{message}", notificationText),
                {
                  onClick: () =>
                    latest.onOpenInboxMessageToast({
                      contactId: outcome.contactId,
                    }),
                },
              );
              void latest.maybeShowPwaNotification(
                label,
                notificationText,
                outcome.wrapId,
              );
            }
            if (
              offerInfo?.status === "declined" &&
              outcome.isOutgoing &&
              !outcome.isSelfAuthored &&
              !activeChat &&
              !activeOffer
            ) {
              latest.setContactAttentionById((previous) => ({
                ...previous,
                [outcome.contactId]: Date.now(),
              }));
              const notificationText = latest.t(
                "bankPaymentOfferDeclinedNotification",
              );
              const label = senderLabel(contact, outcome.peerPubkey);
              showVisibleToast(
                latest
                  .t("chatIncomingMessageToast")
                  .replace("{name}", label)
                  .replace("{message}", notificationText),
                {
                  onClick: () =>
                    latest.onOpenInboxMessageToast({
                      contactId: outcome.contactId,
                    }),
                },
              );
              void latest.maybeShowPwaNotification(
                label,
                notificationText,
                outcome.wrapId,
              );
            }
            return;
          }

          if (!activeChat && !activeOffer && !outcome.isSelfAuthored) {
            latest.setContactAttentionById((previous) => ({
              ...previous,
              [outcome.contactId]: Date.now(),
            }));
            showVisibleToast(
              latest
                .t("chatIncomingMessageToast")
                .replace("{name}", senderLabel(contact, outcome.peerPubkey))
                .replace("{message}", offerText),
            );
          }
          if (!outcome.isSelfAuthored) {
            const title =
              contact?.name ??
              (contact
                ? latest.t("appTitle")
                : latest.t("unknownContactTitle"));
            void latest.maybeShowPwaNotification(
              title,
              offerText,
              outcome.wrapId,
            );
          }
        };

        const handleInsertedMessage = (
          outcome: NostrInboxInsertedMessageOutcome,
        ): void => {
          if (
            outcome.delivery !== "live" ||
            outcome.direction !== "in" ||
            outcome.isCashuMessage
          ) {
            return;
          }
          const latest = latestValuesRef.current;
          if (isOpenChatForContact(latest.route, outcome.contactId)) return;
          const contact = findContact(outcome.peerPubkey);
          latest.setContactAttentionById((previous) => ({
            ...previous,
            [outcome.contactId]: Date.now(),
          }));
          const formattedPreview = formatChatMessagePreviewText({
            content: outcome.content,
            direction: outcome.direction,
            formatDisplayedAmountText: latest.formatDisplayedAmountText,
            t: latest.t,
          });
          const preview =
            formattedPreview.length > 80
              ? `${formattedPreview.slice(0, 80)}…`
              : formattedPreview;
          showVisibleToast(
            latest
              .t("chatIncomingMessageToast")
              .replace("{name}", senderLabel(contact, outcome.peerPubkey))
              .replace("{message}", preview),
            {
              onClick: () =>
                latest.onOpenInboxMessageToast({
                  contactId: outcome.contactId,
                  ...(outcome.messageId
                    ? { messageId: outcome.messageId }
                    : {}),
                }),
            },
          );
          const title =
            contact?.name ??
            (contact ? latest.t("appTitle") : latest.t("unknownContactTitle"));
          void latest.maybeShowPwaNotification(
            title,
            formattedPreview,
            `msg_${outcome.peerPubkey}`,
          );
        };

        const processWrap = (
          wrap: NostrToolsEvent,
          delivery: "backfill" | "live",
        ) => {
          try {
            const latest = latestValuesRef.current;
            const outcome = processNostrInboxWrap({
              delivery,
              effects: {
                appendMessage: latest.appendLocalNostrMessage,
                appendReaction: latest.appendLocalNostrReaction,
                deleteReactionsByWrapIds:
                  latest.softDeleteLocalNostrReactionsByWrapIds,
                updateMessage: latest.updateLocalNostrMessage,
                updateReaction: latest.updateLocalNostrReaction,
              },
              identity: {
                identitySinceSec,
                privateKey,
                pubkey: myPubkey,
              },
              policy: {
                handlesSpecialEvents: true,
                isBlockedIncomingPubkey: isBlockedPubkey,
                isCancelled: () => cancelled,
                ownsConversation: ({ contactId }) =>
                  !isOpenChatForContact(
                    latestValuesRef.current.route,
                    contactId,
                  ),
                resolveConversation: (peerPubkey) => {
                  const contact = findContact(peerPubkey);
                  return contact ? { contactId: contact.id } : null;
                },
                resolveUnknownConversation: (peerPubkey) => {
                  const contactId = buildUnknownContactId(peerPubkey);
                  return contactId ? { contactId } : null;
                },
              },
              seen,
              snapshot: {
                knownMessageIdentities: latest.knownNostrMessageIdentityIndex,
                messageWrapIds: latest.nostrMessageWrapIdsRef.current,
                messages: latest.nostrMessagesLatestRef.current,
                reactionWrapIds: latest.nostrReactionWrapIdsRef.current,
                reactions: latest.nostrReactionsLatestRef.current,
              },
              unwrapEvent,
              wrap,
            });

            if (outcome.kind === "payment-notice") {
              handlePaymentNotice(outcome);
            } else if (outcome.kind === "bank-payment-offer") {
              handleBankPaymentOffer(outcome);
            } else if (outcome.kind === "inserted-message") {
              handleInsertedMessage(outcome);
            }
          } catch {
            return;
          }
        };

        const pool = await getSharedAppNostrPool();
        let backfillInFlight = false;
        const backfill = async () => {
          if (backfillInFlight) return;
          backfillInFlight = true;
          try {
            const existing = await pool.querySync(
              relays,
              {
                kinds: [1059],
                "#p": [myPubkey],
                limit: INBOX_BACKFILL_LIMIT,
                since: Math.floor(Date.now() / 1e3) - INBOX_BACKFILL_SINCE_SEC,
              },
              { maxWait: 5000 },
            );
            if (cancelled) return;
            for (const event of existing) processWrap(event, "backfill");
          } catch {
            // Best effort; the live subscription still runs.
          } finally {
            backfillInFlight = false;
          }
        };
        await backfill();
        if (cancelled) return;

        const sub = pool.subscribe(
          relays,
          { kinds: [1059], "#p": [myPubkey] },
          {
            onevent: (event: NostrToolsEvent) => {
              if (!cancelled) processWrap(event, "live");
            },
          },
        );
        // The pool reconnects dropped sockets, but its resumed subscription
        // filters by last emitted created_at, which the NIP-59 timestamp
        // randomization defeats; re-query on foreground/online so wraps
        // missed offline (e.g. offer acceptances) arrive without a restart.
        const refreshAfterOffline = () => {
          if (!cancelled && document.visibilityState === "visible") {
            void backfill();
          }
        };
        document.addEventListener("visibilitychange", refreshAfterOffline);
        window.addEventListener("online", refreshAfterOffline);
        return () => {
          document.removeEventListener("visibilitychange", refreshAfterOffline);
          window.removeEventListener("online", refreshAfterOffline);
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
  }, [currentNsec, enabled, relaySignature]);
};
