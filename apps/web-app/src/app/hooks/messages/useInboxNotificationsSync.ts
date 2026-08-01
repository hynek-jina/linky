import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import { cancelNativePushPlaceholder } from "../../../platform/nativeBridge";
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
import {
  resolveNotificationAlert,
  type NotificationDeliveryOrigin,
} from "../../lib/notificationAlert";
import {
  buildNotificationRecord,
  type NotificationRecord,
  type NotificationRecordKind,
} from "../../lib/notificationRecord";
import { notificationRecordStore } from "../../lib/notificationRecordStore";
import { resolveCurrentVisibleSurface } from "../../lib/notificationSurface";
import { notifyNotificationRecord } from "../../lib/notify";
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
  type NostrInboxDelivery,
  type NostrInboxInsertedMessageOutcome,
  type NostrInboxObservedMessage,
  type NostrInboxPaymentNoticeOutcome,
} from "./nostrInboxPipeline";

const PAYMENT_NOTICE_SEEN_WRAP_IDS_STORAGE_KEY_PREFIX =
  "linky.nostr.payment_notice_seen_wrap_ids.v1";
const MAX_PERSISTED_PAYMENT_NOTICE_WRAP_IDS = 200;
const PAYMENT_NOTICE_MATCH_WINDOW_SECONDS = 120;

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

/**
 * Per-owner "how far have I caught up" watermark. Wall-clock SECONDS at which a
 * catch-up drain last COMPLETED — never a `created_at`, because `created_at` is
 * exactly the axis NIP-59 randomises and is therefore untrustworthy as a
 * position marker.
 *
 * This is NOT the notification record store's `epoch`. `notificationRecordStore`'s
 * `epochMs` is a first-initialisation watermark that `resolveNotificationAlert`
 * row 2 compares against `eventCreatedAtSec`; a MOVING watermark stored in that
 * field would silently start marking new records read. Two concepts, two keys.
 */
const INBOX_SYNC_WATERMARK_STORAGE_KEY_PREFIX =
  "linky.nostr.inbox_sync_watermark.v1";

/**
 * The catch-up window when no watermark exists yet. Deliberately the same number
 * as `apps/push/src/config.ts`'s `CATCH_UP_LOOKBACK_SECONDS`, so client and
 * server bound the same window.
 */
const INBOX_CATCH_UP_LOOKBACK_SECONDS = 3 * 24 * 60 * 60;

/**
 * Slack subtracted from a PERSISTED watermark. This is the load-bearing
 * arithmetic.
 *
 * `app/lib/pushWrappedEvent.ts` randomises the OUTER wrap `created_at` up to
 * `TWO_DAYS_SECONDS` into the past, and the relay filters on that outer value.
 * A `since` equal to the last sync time would therefore skip a message sent one
 * second ago whose wrap is stamped two days old — D1 through a different door.
 * Three days over a two-day maximum backdate leaves 24 h for clock skew and for
 * `randomTimestampSeconds`'s rounding.
 */
const INBOX_BACKDATE_SLACK_SECONDS = INBOX_CATCH_UP_LOOKBACK_SECONDS;

/**
 * Clock-skew allowance, and nothing more.
 *
 * The rule is "a live message is one sent after this subscription started". This
 * allowance exists only so a sender whose clock runs slightly behind still
 * alerts; it must never be wide enough for a genuine backlog to hide inside it.
 *
 * 300 s was the original value and was calibrated against the wrong quantity —
 * the NIP-59-randomised OUTER age (36-45 h, which is what plan 09-08 reported)
 * rather than the inner rumor age (68-86 s for those very same wraps). It
 * therefore demoted nothing: plan 09-10 measured the faithful backlog gap at
 * 60-94 s, entirely inside the window, and the predicate demoted 0 of 10 on
 * every faithful run.
 *
 * That failure is structural rather than a tuning accident. A subscription
 * necessarily starts before a wrap is delivered to it, so a wrap whose inner
 * rumor is younger than this allowance AT DELIVERY can never be demoted, for any
 * `bootstrapStartedAtSec`. Raising the value cannot help; it widens the live
 * window. It has to come down.
 *
 * 30 s is far wider than realistic NTP skew between phones and comfortably below
 * the measured 60 s floor. The trade it makes is deliberate and asymmetric: a
 * live message from a sender more than 30 s behind is RECORDED and appears in
 * the list, it simply does not alert. A missed alert is recoverable; a missed
 * message is not.
 */
const INBOX_LIVE_CLOCK_SKEW_ALLOWANCE_SECONDS = 30;

const getInboxSyncWatermarkStorageKey = (pubkeyHex: string): string =>
  `${INBOX_SYNC_WATERMARK_STORAGE_KEY_PREFIX}.${pubkeyHex}`;

const readInboxSyncWatermarkSec = (pubkeyHex: string): number | null => {
  const value = safeLocalStorageGetJson<number | null>(
    getInboxSyncWatermarkStorageKey(pubkeyHex),
    null,
  );
  // T-09-09: any script in the origin can write this key. A hostile or corrupt
  // value (negative, NaN, a string, a far-future stamp) would narrow the window
  // to nothing and re-open D1, so anything that is not a finite positive number
  // falls back to `null` and therefore to the `now - 3d` lookback.
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;
};

const persistInboxSyncWatermarkSec = (
  pubkeyHex: string,
  atSec: number,
): void => {
  safeLocalStorageSetJson(getInboxSyncWatermarkStorageKey(pubkeyHex), atSec);
};

/**
 * Two branches on purpose. A persisted watermark is a wall-clock time at which a
 * drain COMPLETED, so it must be slacked back by at least the 2-day outer-
 * `created_at` randomisation `app/lib/pushWrappedEvent.ts` applies. The fallback
 * is ALREADY a wall-clock lookback wider than that window, so applying the slack
 * to it as well would double-count and make the first drain six days wide —
 * which contradicts T-03 and the first-run backlog plan 09-08 is calibrated for.
 */
const resolveInboxSinceSec = (
  watermarkSec: number | null,
  nowSec: number,
): number =>
  watermarkSec === null
    ? Math.max(0, nowSec - INBOX_CATCH_UP_LOOKBACK_SECONDS)
    : Math.max(0, watermarkSec - INBOX_BACKDATE_SLACK_SECONDS);

/**
 * EOSE stays NECESSARY and stops being SUFFICIENT.
 *
 * 09-02's EOSE latch classifies by WHEN A BYTE ARRIVED, which is a property of
 * the relay, not of the message. `nostr-tools`' pool fires `oneose` once every
 * relay has EOSE'd **or** its `baseEoseTimeout` (4400 ms) elapses, and relays
 * replay newest-outer-`created_at`-first — so a slow relay is still streaming
 * its OLDEST tail when the flag flips and those stragglers took the `live`
 * branch. That is D2, measured on-device by plan 09-08.
 *
 * A genuinely live message is one SENT after this subscription started. That is
 * a fact about the MESSAGE and is immune to replay order, relay latency and EOSE
 * timeouts.
 *
 * `rumorCreatedAtSec` MUST be the INNER rumor's `created_at`, never the outer
 * wrap's: `app/lib/pushWrappedEvent.ts` randomises the outer stamp up to two days
 * into the past, which is precisely what makes the newest-outer-first replay
 * order adversarial here. The inner rumor carries the sender's real clock.
 */
const isRecentEnoughToBeLive = (
  rumorCreatedAtSec: number,
  subscriptionStartedAtSec: number,
): boolean =>
  rumorCreatedAtSec >=
  subscriptionStartedAtSec - INBOX_LIVE_CLOCK_SKEW_ALLOWANCE_SECONDS;

type AppendLocalNostrMessage = (message: NewLocalNostrMessage) => string;
type AppendLocalNostrReaction = (reaction: NewLocalNostrReaction) => string;

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
  nostrFetchRelays: string[];
  knownNostrMessageIdentityIndex?: KnownNostrMessageIdentityIndex;
  nostrMessageWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrMessagesLatestRef: React.MutableRefObject<LocalNostrMessage[]>;
  nostrMessagesRecent: readonly NostrMessageSummaryRow[];
  nostrReactionWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrReactionsLatestRef: React.MutableRefObject<LocalNostrReaction[]>;
  onBankPaymentOfferMessage?: (message: LocalNostrMessage) => void;
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
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    onBankPaymentOfferMessage,
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
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    onBankPaymentOfferMessage,
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

        // Captured BEFORE the drain, and written only once the drain COMPLETES.
        // A crash between here and `oneose` must re-cover this window rather
        // than skip it.
        const bootstrapStartedAtSec = Math.floor(Date.now() / 1000);

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

        /**
         * D2, plan 09-09. EOSE is NECESSARY (`delivery === "live"`) and the
         * message's own age is what makes it sufficient, so a wrap the relay chose
         * to deliver late is judged by WHEN IT WAS SENT rather than by when its
         * bytes landed.
         *
         * `createdAtSec` is the INNER rumor's stamp — see `isRecentEnoughToBeLive`
         * for why the outer wrap's is unusable.
         *
         * This selects the ORIGIN VALUE and nothing else. It must never become an
         * early return: that would violate the record-before-alert rule (STORE-01)
         * and reintroduce exactly the loss class this milestone exists to remove.
         * A demoted wrap is still recorded, still unread, still counted; it simply
         * does not alert.
         */
        const resolveOrigin = (
          delivery: NostrInboxDelivery,
          createdAtSec: number,
        ): NotificationDeliveryOrigin =>
          delivery === "live" &&
          isRecentEnoughToBeLive(createdAtSec, bootstrapStartedAtSec)
            ? "live"
            : "catch-up";

        /**
         * STORE-01, in ONE place for all four record-writing branches.
         *
         * The durable `upsert` is unconditional and precedes every ALERT gate: no
         * visibility, foreground, route, surface or origin check may sit between a
         * caller's record gates and this function. Callers pass only record gates
         * before calling it; origin, route and visible surface are alert inputs and
         * are consumed below, never as gates on the write.
         *
         * `upsert` RETURNS the merged record and everything below uses that value —
         * never the freshly built one, which always carries `alertedAt: null` and
         * would make decision row 1 (`already-alerted`) dead code on a redelivery.
         */
        const recordAndAlert = ({
          chatId,
          conversationKey,
          eventCreatedAtSec,
          id,
          kind,
          offerId,
          origin,
          preview,
          sender,
        }: {
          chatId: string | null;
          conversationKey: string | null;
          eventCreatedAtSec: number;
          id: string;
          kind: NotificationRecordKind;
          offerId?: string;
          origin: NotificationDeliveryOrigin;
          preview: string;
          sender: string;
        }): NotificationRecord => {
          const latest = latestValuesRef.current;
          const nowMs = Date.now();
          const built = buildNotificationRecord({
            chatId,
            conversationKey,
            eventCreatedAtSec,
            id,
            kind,
            nowMs,
            ...(offerId ? { offerId } : {}),
            // Untruncated on purpose — `buildNotificationRecord` owns the clamp.
            preview,
            senderLabel: sender,
          });
          const stored = notificationRecordStore.upsert(built);

          const outcome = resolveNotificationAlert({
            nowMs,
            origin,
            record: stored,
            route: latest.route,
            syncEpochMs: notificationRecordStore.getSyncEpochMs(),
            visibleSurface: resolveCurrentVisibleSurface(latest.route),
          });

          if (outcome.alertedAt !== null) {
            notificationRecordStore.markAlerted(stored.id, outcome.alertedAt);
          }
          if (outcome.readAt !== null) {
            notificationRecordStore.markRead(stored.id, outcome.readAt);
          }
          // D3 layer 1. `readNotificationOpenTarget` HARD-REQUIRES
          // `recipientPubkey` (`if (!outerEventId || !recipientPubkey) return
          // null;`), so a native notification posted without it parses to `null`
          // on tap and the user lands on the generic `#contacts` fallback instead
          // of the sender's chat — Phase 8's Finding 3. It is the recipient — this
          // device's own identity — never a sender.
          void notifyNotificationRecord({
            appTitle: latest.t("appTitle"),
            decision: outcome.decision,
            recipientPubkey: myPubkey,
            record: stored,
          });
          return stored;
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

          const latest = latestValuesRef.current;
          const contact = findContact(outcome.peerPubkey);
          const paymentNoticeText = isLinkyBankPaymentOfferPaymentNoticeEvent(
            outcome.rumor,
          )
            ? latest.t("notificationReceivedBankPaymentReimbursement")
            : latest.t("notificationReceivedMoney");
          const offerId =
            getLinkyBankPaymentOfferPaymentNoticeOfferId(outcome.rumor) ?? "";
          const origin = resolveOrigin(outcome.delivery, outcome.createdAtSec);

          // Every gate above is a RECORD gate (peer validity, blocked pubkey and
          // contactId resolution live in the pipeline; `hasStoredIncomingCashuToken`
          // is this branch's own). The write below precedes every alert gate.
          recordAndAlert({
            chatId: outcome.contactId,
            conversationKey: outcome.peerPubkey,
            eventCreatedAtSec: outcome.createdAtSec,
            id: outcome.wrapId,
            kind: "paymentReceived",
            // A bank-reimbursement notice is owned by the open offer surface,
            // exactly as the old `!isActiveBankPaymentOffer` gate intended.
            ...(offerId ? { offerId } : {}),
            origin,
            preview: paymentNoticeText,
            sender: senderLabel(contact, outcome.peerPubkey),
          });

          // B1: below the record, not above it. The record is written FIRST; only
          // this branch's remaining side effect — the contact-attention stamp,
          // which drives contact-list sort order rather than alerting — is skipped
          // for a wrap whose MESSAGE this device already has.
          if (outcome.suppressed) return;

          if (
            origin === "live" &&
            !isOpenChatForContact(latest.route, outcome.contactId) &&
            !isOpenBankPaymentOffer(latest.route, offerId)
          ) {
            latest.setContactAttentionById((previous) => ({
              ...previous,
              [outcome.contactId]: Date.now(),
            }));
          }
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

          const contact = findContact(outcome.peerPubkey);
          const origin = resolveOrigin(outcome.delivery, outcome.createdAtSec);
          const stampAttention = (): void => {
            if (
              origin !== "live" ||
              isOpenChatForContact(latest.route, outcome.contactId) ||
              isOpenBankPaymentOffer(latest.route, offerId)
            ) {
              return;
            }
            latest.setContactAttentionById((previous) => ({
              ...previous,
              [outcome.contactId]: Date.now(),
            }));
          };

          if (isTerminalOffer) {
            // RECORD gates only. The route and origin checks that used to live in
            // this condition are ALERT gates and now reach the decision through
            // `origin` and `visibleSurface`.
            if (
              offerInfo?.status === "declined" &&
              outcome.isOutgoing &&
              !outcome.isSelfAuthored
            ) {
              recordAndAlert({
                chatId: outcome.contactId,
                conversationKey: outcome.peerPubkey,
                eventCreatedAtSec: outcome.createdAtSec,
                id: outcome.wrapId,
                kind: "bankPaymentOffer",
                ...(offerId ? { offerId } : {}),
                origin,
                preview: latest.t("bankPaymentOfferDeclinedNotification"),
                sender: senderLabel(contact, outcome.peerPubkey),
              });
              if (outcome.suppressed) return;
              stampAttention();
            }
            return;
          }

          // The only RECORD gate left on the active-offer path — an offer you
          // authored is not a notification to you. `isExpiredOffer` /
          // `hasTerminalKnownOffer` already returned above and are record gates too.
          if (outcome.isSelfAuthored) return;

          recordAndAlert({
            chatId: outcome.contactId,
            conversationKey: outcome.peerPubkey,
            eventCreatedAtSec: outcome.createdAtSec,
            id: outcome.wrapId,
            kind: "bankPaymentOffer",
            ...(offerId ? { offerId } : {}),
            origin,
            preview: offerText,
            sender: senderLabel(contact, outcome.peerPubkey),
          });
          if (outcome.suppressed) return;
          stampAttention();
        };

        /**
         * The chat-message record point, reached from inside the pipeline BEFORE it
         * decides whether to write to Evolu — including when it decides not to,
         * because the active chat already stored the message or because this device
         * already has it. "Already have the MESSAGE" is not "already have a
         * RECORD": the two stores are independent.
         */
        const observeIncomingMessage = (
          message: NostrInboxObservedMessage,
        ): NotificationRecord | null => {
          // The two ONLY record gates: an outgoing message is not a notification to
          // you, and a Cashu token chat message is deliberately silent because its
          // payment notice is the sole recorded carrier — one payment must yield one
          // record (T-04-26).
          if (message.direction !== "in" || message.isCashuMessage) return null;

          const latest = latestValuesRef.current;
          const contact = findContact(message.peerPubkey);
          // W3, deliberate: the shade title uses this too, so the record-driven
          // surfaces stop diverging. An unnamed or unknown sender shows a short
          // npub, which identifies the conversation where the app name does not.
          return recordAndAlert({
            chatId: message.contactId,
            conversationKey: message.peerPubkey,
            eventCreatedAtSec: message.createdAtSec,
            id: message.wrapId,
            kind: "chatMessage",
            origin: resolveOrigin(message.delivery, message.createdAtSec),
            // W4: untruncated on purpose — the record owns the 80-char clamp.
            preview: formatChatMessagePreviewText({
              content: message.content,
              direction: message.direction,
              formatDisplayedAmountText: latest.formatDisplayedAmountText,
              t: latest.t,
            }),
            sender: senderLabel(contact, message.peerPubkey),
          });
        };

        const handleInsertedMessage = (
          outcome: NostrInboxInsertedMessageOutcome,
          record: NotificationRecord | null,
        ): void => {
          // Merge-by-id, not a second record: the store is idempotent on
          // `id = wrapId`, so this stamps the Evolu row id onto the ONE record
          // written above. `messageId` is simply not knowable at write time — the
          // write deliberately happens before the insert (T-04-29).
          if (record && outcome.messageId) {
            notificationRecordStore.upsert({
              ...record,
              messageId: outcome.messageId,
            });
          }

          if (
            resolveOrigin(outcome.delivery, outcome.createdAtSec) !== "live" ||
            outcome.direction !== "in" ||
            outcome.isCashuMessage
          ) {
            return;
          }
          const latest = latestValuesRef.current;
          // An inserted message already implies the pipeline owned the
          // conversation, i.e. its chat is not the open one.
          latest.setContactAttentionById((previous) => ({
            ...previous,
            [outcome.contactId]: Date.now(),
          }));
        };

        const processWrap = (
          wrap: NostrToolsEvent,
          delivery: NostrInboxDelivery,
        ) => {
          try {
            const latest = latestValuesRef.current;
            // Synchronous for the whole `processNostrInboxWrap` call, so the record
            // the observer wrote is still the one this wrap's outcome belongs to.
            let observedRecord: NotificationRecord | null = null;
            const outcome = processNostrInboxWrap({
              delivery,
              effects: {
                appendMessage: latest.appendLocalNostrMessage,
                appendReaction: latest.appendLocalNostrReaction,
                deleteReactionsByWrapIds:
                  latest.softDeleteLocalNostrReactionsByWrapIds,
                observeIncomingMessage: (message) => {
                  observedRecord = observeIncomingMessage(message);
                },
                // The Phase 3 handoff, closed here: FCM posts a generic placeholder
                // keyed on the OUTER event id (tag "linky.push.pending"), and this
                // is the moment the wrap stops being generic. RELEASE-BUILD-ONLY
                // behaviour: a debug APK skips the Google Services plugin, so no
                // placeholder is ever posted and the bridge simply returns false.
                onDecodedWrap: cancelNativePushPlaceholder,
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
                // This hook keeps a notification record store the Evolu message
                // store knows nothing about, so an Evolu-known wrap and an open
                // chat suppress the WRITE without skipping the RECORD.
                reportsSuppressedWrites: true,
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
              handleInsertedMessage(outcome, observedRecord);
            }
          } catch {
            return;
          }
        };

        const pool = await getSharedAppNostrPool();
        const sinceSec = resolveInboxSinceSec(
          readInboxSyncWatermarkSec(myPubkey),
          bootstrapStartedAtSec,
        );

        // Per SUBSCRIPTION instance, deliberately unlike apps/push's
        // module-lifetime `initialCatchUpComplete`. The server has durable
        // seen-id storage; the client instead relies on the record store's
        // `alertedAt` — decision row 1 (`already-alerted`) short-circuits any
        // redelivery — so a fresh drain after an effect re-entry cannot
        // double-alert. A module-level flag would be WRONG here: after a
        // `relaySignature` change the new subscription genuinely IS a new drain.
        let initialCatchUpComplete = false;

        const sub = pool.subscribe(
          relays,
          { kinds: [1059], "#p": [myPubkey], since: sinceSec },
          {
            onevent: (event: NostrToolsEvent) => {
              if (cancelled) return;
              // Failure direction is safe by construction. A slow relay that
              // delays EOSE past a genuinely-live wrap mislabels it `catch-up`
              // -> row 3 `catch-up-post-epoch` -> recorded, unread, badge
              // increments, no banner. A missed BANNER, never a missed RECORD.
              // The opposite mistake — labelling history `live` — is the one
              // that produced Phase 8's alert storm.
              processWrap(event, initialCatchUpComplete ? "live" : "backfill");
            },
            oneose: () => {
              if (cancelled || initialCatchUpComplete) return;
              initialCatchUpComplete = true;
              // Advanced ONLY here. Advancing optimistically (on a timer, or at
              // subscribe time) means a crash mid-drain permanently skips a
              // window.
              persistInboxSyncWatermarkSec(myPubkey, bootstrapStartedAtSec);
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
  }, [currentNsec, enabled, relaySignature]);
};
