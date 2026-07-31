import * as Evolu from "@evolu/common";
import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import { createSendTokenWithTokensAtMint } from "../../../cashuSend";
import type { CashuTokenRow, ContactId } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY } from "../../../utils/constants";
import type { DisplayAmountParts } from "../../../utils/displayAmounts";
import { normalizeMintUrl } from "../../../utils/mint";
import { safeLocalStorageSet } from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { makeLocalId } from "../../../utils/validation";
import type { AppNostrPool } from "../../lib/nostrPool";
import { LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER } from "../../lib/pushWrappedEvent";
import type { CashuTokenWithMeta } from "../../lib/tokenText";
import type {
  ContactRowLike,
  LocalNostrMessage,
  LoggedPaymentEventParams,
  NewLocalNostrMessage,
  PaymentLogData,
  PublishWrappedResult,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";
import type { ReplyContext } from "../messages/useSendChatMessage";
import { buildCashuMessagePaymentPayload } from "./buildCashuMessagePaymentPayload";
import type { CashuMessagePaymentHookResult } from "./cashuMessagePaymentTypes";
import {
  type CashuTokenUpdate,
  type CashuTokenUpsert,
  logCashuMessagePublishFailure,
  logCashuMessageSwapFailure,
  persistCashuMessagePaymentResult,
  persistCashuMessageSwapAttempt,
} from "./persistCashuMessagePayment";
import { publishCashuMessagePayment } from "./publishCashuMessagePayment";
import { selectCashuMessagePayment } from "./selectCashuMessagePayment";

type AppendLocalNostrMessage = (message: NewLocalNostrMessage) => string;

const ContactIdSchema = Evolu.id("Contact");

interface UsePayContactWithCashuMessageParams {
  activePublishClientIdsRef: React.MutableRefObject<Set<string>>;
  appendLocalNostrMessage: AppendLocalNostrMessage;
  buildCashuMintCandidates: (
    mintGroups: Map<string, { sum: number; tokens: string[] }>,
    preferredMint: string,
  ) => Array<{ mint: string; sum: number; tokens: string[] }>;
  cashuBalance: number;
  cashuTokensAll: readonly CashuTokenRow[];
  cashuTokensWithMeta: readonly CashuTokenWithMeta[];
  currentNpub: string | null;
  currentNsec: string | null;
  defaultMintUrl: string | null;
  enqueuePendingPayment: (payload: {
    amountSat: number;
    contactId: ContactId;
    messageId?: string;
  }) => void;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  logPayStep: (step: string, data?: PaymentLogData) => void;
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
  nostrMessagesLocal: LocalNostrMessage[];
  payWithCashuEnabled: boolean;
  publishSingleWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    event: NostrToolsEvent,
  ) => Promise<{ anySuccess: boolean; error: string | null }>;
  publishWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    wrapForMe: NostrToolsEvent,
    wrapForContact: NostrToolsEvent,
  ) => Promise<PublishWrappedResult>;
  pushToast: (message: string) => void;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
  setContactsOnboardingHasPaid: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title: string) => void;
  t: (key: string) => string;
  update: CashuTokenUpdate;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
  upsert: CashuTokenUpsert;
}

export const usePayContactWithCashuMessage = <TContact extends ContactRowLike>({
  activePublishClientIdsRef,
  appendLocalNostrMessage,
  buildCashuMintCandidates,
  cashuBalance,
  cashuTokensAll,
  cashuTokensWithMeta,
  currentNpub,
  currentNsec,
  defaultMintUrl,
  enqueuePendingPayment,
  formatDisplayedAmountParts,
  logPayStep,
  logPaymentEvent,
  nostrMessagesLocal,
  payWithCashuEnabled,
  publishSingleWrappedWithRetry,
  publishWrappedWithRetry,
  pushToast,
  resolveOwnerIdForWrite,
  setContactsOnboardingHasPaid,
  setStatus,
  showPaidOverlay,
  t,
  update,
  updateLocalNostrMessage,
  upsert,
}: UsePayContactWithCashuMessageParams) => {
  return React.useCallback(
    async (args: {
      amountSat: number;
      contact: TContact;
      fromQueue?: boolean;
      logCompletedOnly?: boolean;
      paymentNoticeContext?: typeof LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER;
      paymentNoticeOfferId?: string;
      paymentRequestId?: string | null;
      pendingMessageId?: string;
      replyContext?: ReplyContext | null;
    }): Promise<CashuMessagePaymentHookResult> => {
      const {
        amountSat,
        contact,
        fromQueue,
        logCompletedOnly = false,
        paymentNoticeContext,
        paymentNoticeOfferId,
        paymentRequestId,
        pendingMessageId,
        replyContext,
      } = args;
      const notify = !fromQueue;
      const normalizedPendingMessageId =
        typeof pendingMessageId === "string" && pendingMessageId.trim()
          ? pendingMessageId.trim()
          : null;

      if (!currentNsec || !currentNpub) {
        if (notify) setStatus(t("profileMissingNpub"));
        return { error: "missing nsec", ok: false, queued: false };
      }

      const contactNpub = String(contact.npub ?? "").trim();
      if (!contactNpub) {
        if (notify) setStatus(t("chatMissingContactNpub"));
        return { error: "missing contact npub", ok: false, queued: false };
      }

      const parsedContactId = ContactIdSchema.fromUnknown(contact.id);
      if (!parsedContactId.ok) {
        if (notify) setStatus(t("payFailed"));
        return { error: "invalid contact id", ok: false, queued: false };
      }
      const contactId = parsedContactId.value;

      logPayStep("start", {
        amountSat,
        cashuBalance,
        contactId: String(contactId),
        fromQueue: Boolean(fromQueue),
        payWithCashuEnabled,
      });

      const isOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (isOffline) {
        const displayName =
          String(contact.name ?? "").trim() ||
          String(contact.lnAddress ?? "").trim() ||
          t("appTitle");
        const displayAmount = formatDisplayedAmountParts(amountSat);
        const clientId = makeLocalId();
        const messageId = appendLocalNostrMessage({
          clientId,
          contactId: String(contactId),
          content: t("payQueuedMessage")
            .replace(
              "{amount}",
              `${displayAmount.approxPrefix}${displayAmount.amountText}`,
            )
            .replace("{unit}", displayAmount.unitLabel)
            .replace("{name}", displayName),
          createdAtSec: Math.floor(Date.now() / 1_000),
          direction: "out",
          localOnly: true,
          pubkey: "",
          rumorId: null,
          status: "pending",
          wrapId: `pending:pay:${clientId}`,
        });
        logPayStep("queued-offline", {
          amountSat,
          contactId: String(contactId),
          messageId,
        });
        enqueuePendingPayment({ amountSat, contactId, messageId });
        if (notify) {
          showPaidOverlay(
            t("paidQueuedTo")
              .replace(
                "{amount}",
                `${displayAmount.approxPrefix}${displayAmount.amountText}`,
              )
              .replace("{unit}", displayAmount.unitLabel)
              .replace("{name}", displayName),
          );
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          navigateTo({ id: contactId, route: "chat" });
        }
        return { ok: true, queued: true };
      }

      const selection = selectCashuMessagePayment({
        amountSat,
        buildCandidates: buildCashuMintCandidates,
        cashuBalance,
        defaultMintUrl,
        normalizeMintUrl,
        tokens: cashuTokensWithMeta,
      });
      logPayStep("mint-candidates", {
        candidates: selection.candidates.map((candidate) => ({
          mint: candidate.mint,
          sum: candidate.sum,
          tokenCount: candidate.tokens.length,
        })),
        count: selection.candidates.length,
      });

      if (selection.kind === "insufficient") {
        if (notify) setStatus(t("payInsufficient"));
        return { error: "insufficient", ok: false, queued: false };
      }

      const cashuWriteOwnerId = await resolveOwnerIdForWrite();
      const swap = await buildCashuMessagePaymentPayload({
        commitSwapState: async (outcome) => {
          persistCashuMessageSwapAttempt({
            cashuTokensAll,
            cashuTokensWithMeta,
            cashuWriteOwnerId,
            outcome,
            update,
            upsert,
          });
        },
        createSendToken: createSendTokenWithTokensAtMint,
        logPayStep,
        selection,
      });

      if (swap.kind !== "success") {
        logCashuMessageSwapFailure({
          amountSat,
          contactId,
          error: swap.error,
          logCompletedOnly,
          logPaymentEvent,
          mint: swap.mint,
        });
        if (notify) {
          setStatus(
            swap.error
              ? `${t("payFailed")}: ${swap.error}`
              : t("payInsufficient"),
          );
        }
        return {
          error: getUnknownErrorMessage(swap.error, ""),
          ok: false,
          queued: false,
        };
      }

      try {
        const publishing = await publishCashuMessagePayment({
          activePublishClientIds: activePublishClientIdsRef.current,
          appendLocalNostrMessage,
          batches: [swap.batch],
          contactId,
          contactNpub,
          currentNsec,
          logPayStep,
          nostrMessagesLocal,
          ...(paymentNoticeContext ? { paymentNoticeContext } : {}),
          ...(paymentNoticeOfferId ? { paymentNoticeOfferId } : {}),
          pendingMessageId: normalizedPendingMessageId,
          publishSingleWrappedWithRetry,
          publishWrappedWithRetry,
          relays: NOSTR_RELAYS,
          ...(replyContext ? { replyContext } : {}),
          updateLocalNostrMessage,
        });

        for (const publishError of publishing.publishErrors) {
          if (notify) {
            pushToast(`${t("payFailed")}: ${publishError.error}`);
          }
        }

        persistCashuMessagePaymentResult({
          cashuTokensAll,
          cashuWriteOwnerId,
          contactId,
          logCompletedOnly,
          logPaymentEvent,
          paymentRequestId: paymentRequestId ?? null,
          publishing,
          swap,
          upsert,
        });

        if (notify) {
          const displayName =
            String(contact.name ?? "").trim() ||
            String(contact.lnAddress ?? "").trim() ||
            t("appTitle");
          const displayAmount = formatDisplayedAmountParts(swap.batch.amount);
          showPaidOverlay(
            (publishing.hasPendingMessages
              ? t("paidQueuedTo")
              : t("paidSentTo")
            )
              .replace(
                "{amount}",
                `${displayAmount.approxPrefix}${displayAmount.amountText}`,
              )
              .replace("{unit}", displayAmount.unitLabel)
              .replace("{name}", displayName),
          );
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          navigateTo({ id: contactId, route: "chat" });
        }

        return { ok: true, queued: publishing.hasPendingMessages };
      } catch (error) {
        persistCashuMessagePaymentResult({
          cashuTokensAll,
          cashuWriteOwnerId,
          contactId,
          logCompletedOnly: true,
          logPaymentEvent,
          paymentRequestId: paymentRequestId ?? null,
          publishing: {
            hasPendingMessages: true,
            paymentNoticeError: null,
            publishErrors: [],
            publishedTokenTexts: [],
            unpublishedTokenTexts: [swap.batch.token],
          },
          swap,
          upsert,
        });
        logCashuMessagePublishFailure({
          amountSat,
          contactId,
          error,
          logCompletedOnly,
          logPaymentEvent,
          mint: swap.batch.mint,
        });
        const errorMessage = getUnknownErrorMessage(error, "unknown");
        if (notify) setStatus(`${t("payFailed")}: ${errorMessage}`);
        return { error: errorMessage, ok: false, queued: false };
      }
    },
    [
      activePublishClientIdsRef,
      appendLocalNostrMessage,
      buildCashuMintCandidates,
      cashuBalance,
      cashuTokensAll,
      cashuTokensWithMeta,
      currentNpub,
      currentNsec,
      defaultMintUrl,
      enqueuePendingPayment,
      formatDisplayedAmountParts,
      logPayStep,
      logPaymentEvent,
      nostrMessagesLocal,
      payWithCashuEnabled,
      publishSingleWrappedWithRetry,
      publishWrappedWithRetry,
      pushToast,
      resolveOwnerIdForWrite,
      setContactsOnboardingHasPaid,
      setStatus,
      showPaidOverlay,
      t,
      update,
      updateLocalNostrMessage,
      upsert,
    ],
  );
};
