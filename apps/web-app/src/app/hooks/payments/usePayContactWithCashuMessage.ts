import * as Evolu from "@evolu/common";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React from "react";
import { createSendTokenWithTokensAtMint } from "../../../cashuSend";
import type { CashuTokenId, ContactId } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY } from "../../../utils/constants";
import type { DisplayAmountParts } from "../../../utils/displayAmounts";
import { previewTokenText } from "../../../utils/formatting";
import { normalizeMintUrl } from "../../../utils/mint";
import { safeLocalStorageSet } from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { makeLocalId } from "../../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import {
  createLinkyPaymentNoticeEvent,
  wrapEventWithPushMarker,
  wrapEventWithoutPushMarker,
} from "../../lib/pushWrappedEvent";
import type {
  CashuTokenRowLike,
  ContactRowLike,
  LocalNostrMessage,
  NewLocalNostrMessage,
  PaymentLogData,
  PublishWrappedResult,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

type AppendLocalNostrMessage = (message: NewLocalNostrMessage) => string;

interface UsePayContactWithCashuMessageParams {
  appendLocalNostrMessage: AppendLocalNostrMessage;
  buildCashuMintCandidates: (
    mintGroups: Map<string, { sum: number; tokens: string[] }>,
    preferredMint: string,
  ) => Array<{ mint: string; sum: number; tokens: string[] }>;
  cashuBalance: number;
  cashuTokensWithMeta: readonly CashuTokenRowLike[];
  chatSeenWrapIdsRef: React.MutableRefObject<Set<string>>;
  currentNpub: string | null;
  currentNsec: string | null;
  defaultMintUrl: string | null;
  enqueuePendingPayment: (payload: {
    amountSat: number;
    contactId: ContactId;
    messageId?: string;
  }) => void;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  insert: EvoluMutations["insert"];
  logPayStep: (step: string, data?: PaymentLogData) => void;
  logPaymentEvent: (event: {
    amount?: number | null;
    contactId?: ContactId | null;
    direction: "in" | "out";
    error?: string | null;
    fee?: number | null;
    mint?: string | null;
    status: "ok" | "error";
    unit?: string | null;
  }) => void;
  nostrMessagesLocal: LocalNostrMessage[];
  payWithCashuEnabled: boolean;
  publishWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    wrapForMe: NostrToolsEvent,
    wrapForContact: NostrToolsEvent,
  ) => Promise<PublishWrappedResult>;
  publishSingleWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    event: NostrToolsEvent,
  ) => Promise<{ anySuccess: boolean; error: string | null }>;
  pushToast: (message: string) => void;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
  setContactsOnboardingHasPaid: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title: string) => void;
  t: (key: string) => string;
  update: EvoluMutations["update"];
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

export const usePayContactWithCashuMessage = <TContact extends ContactRowLike>({
  appendLocalNostrMessage,
  buildCashuMintCandidates,
  cashuBalance,
  cashuTokensWithMeta,
  chatSeenWrapIdsRef,
  currentNpub,
  currentNsec,
  defaultMintUrl,
  enqueuePendingPayment,
  formatDisplayedAmountParts,
  insert,
  logPayStep,
  logPaymentEvent,
  nostrMessagesLocal,
  payWithCashuEnabled,
  publishWrappedWithRetry,
  publishSingleWrappedWithRetry,
  pushToast,
  resolveOwnerIdForWrite,
  setContactsOnboardingHasPaid,
  setStatus,
  showPaidOverlay,
  t,
  update,
  updateLocalNostrMessage,
}: UsePayContactWithCashuMessageParams) => {
  const buildCashuTokenPayload = React.useCallback(
    (args: {
      amount: number | null;
      mint: string | null;
      state: "accepted" | "pending";
      token: string;
      unit: string | null;
    }) => {
      const payload: {
        token: typeof Evolu.NonEmptyString.Type;
        state: typeof Evolu.NonEmptyString100.Type;
        amount?: typeof Evolu.PositiveInt.Type;
        mint?: typeof Evolu.NonEmptyString1000.Type;
        unit?: typeof Evolu.NonEmptyString100.Type;
      } = {
        token: args.token as typeof Evolu.NonEmptyString.Type,
        state: args.state as typeof Evolu.NonEmptyString100.Type,
      };

      const mint = String(args.mint ?? "").trim();
      if (mint) payload.mint = mint as typeof Evolu.NonEmptyString1000.Type;

      const unit = String(args.unit ?? "").trim();
      if (unit) payload.unit = unit as typeof Evolu.NonEmptyString100.Type;

      if (typeof args.amount === "number" && args.amount > 0) {
        payload.amount = args.amount as typeof Evolu.PositiveInt.Type;
      }

      return payload;
    },
    [],
  );

  return React.useCallback(
    async (args: {
      contact: TContact;
      amountSat: number;
      fromQueue?: boolean;
      pendingMessageId?: string;
    }): Promise<{ ok: boolean; queued: boolean; error?: string }> => {
      const { contact, amountSat, fromQueue, pendingMessageId } = args;
      const notify = !fromQueue;

      const normalizedPendingMessageId =
        typeof pendingMessageId === "string" && pendingMessageId.trim()
          ? pendingMessageId.trim()
          : null;

      if (!currentNsec || !currentNpub) {
        if (notify) setStatus(t("profileMissingNpub"));
        return { ok: false, queued: false, error: "missing nsec" };
      }

      const contactNpub = String(contact.npub ?? "").trim();
      if (!contactNpub) {
        if (notify) setStatus(t("chatMissingContactNpub"));
        return { ok: false, queued: false, error: "missing contact npub" };
      }

      logPayStep("start", {
        contactId: String(contact.id ?? ""),
        amountSat,
        fromQueue: Boolean(fromQueue),
        cashuBalance,
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
          contactId: String(contact.id ?? ""),
          direction: "out",
          content: t("payQueuedMessage")
            .replace(
              "{amount}",
              `${displayAmount.approxPrefix}${displayAmount.amountText}`,
            )
            .replace("{unit}", displayAmount.unitLabel)
            .replace("{name}", displayName),
          wrapId: `pending:pay:${clientId}`,
          rumorId: null,
          pubkey: "",
          createdAtSec: Math.floor(Date.now() / 1000),
          status: "pending",
          clientId,
          localOnly: true,
        });
        logPayStep("queued-offline", {
          contactId: String(contact.id ?? ""),
          amountSat,
          messageId,
        });
        enqueuePendingPayment({
          contactId: contact.id as ContactId,
          amountSat,
          messageId,
        });
        if (notify) {
          setStatus(t("payQueued"));
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
          navigateTo({ route: "chat", id: contact.id as ContactId });
        }
        return { ok: true, queued: true };
      }

      if (notify) setStatus(t("payPaying"));

      const cashuWriteOwnerId = await resolveOwnerIdForWrite();

      const insertCashuToken = (
        payload: ReturnType<typeof buildCashuTokenPayload>,
      ) => {
        return cashuWriteOwnerId
          ? insert("cashuToken", payload, { ownerId: cashuWriteOwnerId })
          : insert("cashuToken", payload);
      };

      const updateCashuToken = (payload: {
        id: CashuTokenId;
        isDeleted: typeof Evolu.sqliteTrue;
      }) => {
        return cashuWriteOwnerId
          ? update("cashuToken", payload, { ownerId: cashuWriteOwnerId })
          : update("cashuToken", payload);
      };

      const remainingAmount = amountSat;

      const cashuToSend = Math.min(cashuBalance, remainingAmount);

      const sendBatches: Array<{
        token: string;
        amount: number;
        mint: string;
        unit: string | null;
      }> = [];
      const sendTokenMetaByText = new Map<
        string,
        { mint: string; unit: string | null; amount: number }
      >();

      let lastError: unknown = null;
      let lastMint: string | null = null;

      if (cashuToSend > 0) {
        const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
        for (const row of cashuTokensWithMeta) {
          if (String(row.state ?? "") !== "accepted") continue;
          const mint = String(row.mint ?? "").trim();
          if (!mint) continue;
          const tokenText = String(row.token ?? row.rawToken ?? "").trim();
          if (!tokenText) continue;

          const amount = Number(row.amount ?? 0) || 0;
          const entry = mintGroups.get(mint) ?? { tokens: [], sum: 0 };
          entry.tokens.push(tokenText);
          entry.sum += amount;
          mintGroups.set(mint, entry);
        }

        const preferredMint = normalizeMintUrl(defaultMintUrl ?? "");
        const candidates = buildCashuMintCandidates(mintGroups, preferredMint);

        logPayStep("mint-candidates", {
          count: candidates.length,
          candidates: candidates.map((c) => ({
            mint: c.mint,
            sum: c.sum,
            tokenCount: c.tokens.length,
          })),
        });

        if (candidates.length === 0) {
          if (notify) setStatus(t("payInsufficient"));
          return { ok: false, queued: false, error: "insufficient" };
        }

        let remaining = cashuToSend;

        for (const candidate of candidates) {
          if (remaining <= 0) break;
          const useAmount = Math.min(remaining, candidate.sum);
          if (useAmount <= 0) continue;

          try {
            logPayStep("swap-request", {
              mint: candidate.mint,
              amount: useAmount,
              tokenCount: candidate.tokens.length,
            });
            const split = await createSendTokenWithTokensAtMint({
              amount: useAmount,
              mint: candidate.mint,
              tokens: candidate.tokens,
              unit: "sat",
            });

            if (!split.ok) {
              lastError = split.error;
              lastMint = candidate.mint;
              continue;
            }

            const spentTokenIds = cashuTokensWithMeta
              .filter(
                (row) =>
                  String(row.state ?? "") === "accepted" &&
                  String(row.mint ?? "").trim() === candidate.mint,
              )
              .map((row) => row.id as CashuTokenId);

            for (const id of spentTokenIds) {
              const deleted = updateCashuToken({
                id,
                isDeleted: Evolu.sqliteTrue,
              });
              if (!deleted.ok) throw deleted.error;
            }

            const remainingToken = split.remainingToken;
            const remainingAmount = split.remainingAmount;

            if (remainingToken && remainingAmount > 0) {
              const inserted = insertCashuToken(
                buildCashuTokenPayload({
                  token: remainingToken,
                  mint: split.mint,
                  unit: split.unit ?? null,
                  amount: remainingAmount,
                  state: "accepted",
                }),
              );
              if (!inserted.ok) throw inserted.error;
            }

            sendBatches.push({
              token: split.sendToken,
              amount: split.sendAmount,
              mint: split.mint,
              unit: split.unit ?? null,
            });
            logPayStep("swap-ok", {
              mint: split.mint,
              sendAmount: split.sendAmount,
              remainingAmount: split.remainingAmount,
              sendToken: previewTokenText(split.sendToken),
              remainingToken: previewTokenText(split.remainingToken),
            });
            sendTokenMetaByText.set(split.sendToken, {
              mint: split.mint,
              unit: split.unit ?? null,
              amount: split.sendAmount,
            });
            remaining -= split.sendAmount;
          } catch (e) {
            lastError = e;
            lastMint = candidate.mint;
          }
        }

        if (remaining > 0) {
          logPaymentEvent({
            direction: "out",
            status: "error",
            amount: amountSat,
            fee: null,
            mint: lastMint,
            unit: "sat",
            error: getUnknownErrorMessage(lastError, "insufficient funds"),
            contactId: contact.id as ContactId,
          });
          if (notify) {
            setStatus(
              lastError
                ? `${t("payFailed")}: ${getUnknownErrorMessage(lastError, "unknown")}`
                : t("payInsufficient"),
            );
          }
          return {
            ok: false,
            queued: false,
            error: getUnknownErrorMessage(lastError, ""),
          };
        }
      }

      try {
        const { nip19, getPublicKey } = await import("nostr-tools");

        const decodedMe = nip19.decode(currentNsec);
        if (decodedMe.type !== "nsec") throw new Error("invalid nsec");
        const privBytes = decodedMe.data as Uint8Array;
        const myPubHex = getPublicKey(privBytes);

        const decodedContact = nip19.decode(contactNpub);
        if (decodedContact.type !== "npub") throw new Error("invalid npub");
        const contactPubHex = decodedContact.data as string;

        const pool = await getSharedAppNostrPool();

        const messagePlans: Array<{
          text: string;
          onSuccess?: () => void;
        }> = [];

        for (const batch of sendBatches) {
          logPayStep("plan-send-token", {
            mint: batch.mint,
            amount: batch.amount,
            token: previewTokenText(batch.token),
          });
          messagePlans.unshift({
            text: String(batch.token ?? "").trim(),
          });
        }

        const publishedSendTokens = new Set<string>();
        let publishedAnyTokenMessage = false;
        let hasPendingMessages = false;
        const canReusePendingMessage = Boolean(
          normalizedPendingMessageId &&
          nostrMessagesLocal.some(
            (m) => String(m.id ?? "") === normalizedPendingMessageId,
          ),
        );
        let reusedPendingMessage = false;

        for (const plan of messagePlans) {
          const messageText = plan.text;
          const clientId = makeLocalId();
          logPayStep("publish-pending", {
            clientId,
            token: previewTokenText(messageText),
          });
          const baseEvent = {
            created_at: Math.ceil(Date.now() / 1e3),
            kind: 14,
            pubkey: myPubHex,
            tags: [
              ["p", contactPubHex],
              ["p", myPubHex],
              ["client", clientId],
            ],
            content: messageText,
          } satisfies UnsignedEvent;

          let pendingId = "";
          if (canReusePendingMessage && !reusedPendingMessage) {
            pendingId = normalizedPendingMessageId ?? "";
            reusedPendingMessage = true;
            updateLocalNostrMessage(pendingId, {
              status: "pending",
              wrapId: `pending:${clientId}`,
              pubkey: myPubHex,
              content: messageText,
              clientId,
              localOnly: false,
            });
          } else {
            pendingId = appendLocalNostrMessage({
              contactId: String(contact.id ?? ""),
              direction: "out",
              content: messageText,
              wrapId: `pending:${clientId}`,
              rumorId: null,
              pubkey: myPubHex,
              createdAtSec: baseEvent.created_at,
              status: "pending",
              clientId,
            });
          }

          const wrapForMe = wrapEventWithoutPushMarker(
            baseEvent,
            privBytes,
            myPubHex,
          );
          const wrapForContact = wrapEventWithoutPushMarker(
            baseEvent,
            privBytes,
            contactPubHex,
          );

          const publishOutcome = await publishWrappedWithRetry(
            pool,
            NOSTR_RELAYS,
            wrapForMe,
            wrapForContact,
          );

          const anySuccess = publishOutcome.anySuccess;
          if (!anySuccess) {
            const firstError = publishOutcome.error;
            logPayStep("publish-failed", {
              clientId,
              error: getUnknownErrorMessage(firstError, "publish failed"),
            });
            hasPendingMessages = true;
            if (notify) {
              pushToast(
                `${t("payFailed")}: ${getUnknownErrorMessage(firstError, "publish failed")}`,
              );
            }
            continue;
          }

          chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));
          if (pendingId) {
            updateLocalNostrMessage(pendingId, {
              status: "sent",
              wrapId: String(wrapForMe.id ?? ""),
              pubkey: myPubHex,
            });
          }
          logPayStep("publish-ok", {
            clientId,
            wrapId: String(wrapForMe.id ?? ""),
          });

          plan.onSuccess?.();
          publishedAnyTokenMessage = true;
          if (sendTokenMetaByText.has(messageText)) {
            publishedSendTokens.add(messageText);
          }
        }

        if (publishedAnyTokenMessage) {
          const paymentNoticeClientId = makeLocalId();
          const paymentNoticeEvent = createLinkyPaymentNoticeEvent({
            clientId: paymentNoticeClientId,
            createdAt: Math.ceil(Date.now() / 1e3),
            recipientPublicKey: contactPubHex,
            senderPublicKey: myPubHex,
          });
          const paymentNoticeWrap = wrapEventWithPushMarker(
            paymentNoticeEvent,
            privBytes,
            contactPubHex,
          );
          const paymentNoticeOutcome = await publishSingleWrappedWithRetry(
            pool,
            NOSTR_RELAYS,
            paymentNoticeWrap,
          );
          logPayStep("payment-notice-publish", {
            anySuccess: paymentNoticeOutcome.anySuccess,
            clientId: paymentNoticeClientId,
            error: paymentNoticeOutcome.error,
            wrapId: String(paymentNoticeWrap.id ?? ""),
          });
        }

        if (sendTokenMetaByText.size > 0) {
          const unsentTokens = Array.from(sendTokenMetaByText.keys()).filter(
            (token) => !publishedSendTokens.has(token),
          );
          for (const tokenText of unsentTokens) {
            const meta = sendTokenMetaByText.get(tokenText);
            if (!meta) continue;
            insertCashuToken(
              buildCashuTokenPayload({
                token: tokenText,
                mint: meta.mint,
                unit: meta.unit ?? null,
                amount: meta.amount,
                state: "pending",
              }),
            );
          }
        }

        const usedMints = Array.from(new Set(sendBatches.map((b) => b.mint)));

        logPaymentEvent({
          direction: "out",
          status: "ok",
          amount: amountSat,
          fee: null,
          mint:
            usedMints.length === 0
              ? null
              : usedMints.length === 1
                ? usedMints[0]
                : "multi",
          unit: "sat",
          error: null,
          contactId: contact.id as ContactId,
        });

        if (notify) {
          const displayName =
            String(contact.name ?? "").trim() ||
            String(contact.lnAddress ?? "").trim() ||
            t("appTitle");
          const displayAmount = formatDisplayedAmountParts(amountSat);

          showPaidOverlay(
            (hasPendingMessages ? t("paidQueuedTo") : t("paidSentTo"))
              .replace(
                "{amount}",
                `${displayAmount.approxPrefix}${displayAmount.amountText}`,
              )
              .replace("{unit}", displayAmount.unitLabel)
              .replace("{name}", displayName),
          );

          setStatus(hasPendingMessages ? t("payQueued") : t("paySuccess"));
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          navigateTo({ route: "chat", id: contact.id as ContactId });
        }

        return { ok: true, queued: hasPendingMessages };
      } catch (e) {
        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: amountSat,
          fee: null,
          mint: lastMint,
          unit: "sat",
          error: getUnknownErrorMessage(e, "unknown"),
          contactId: contact.id as ContactId,
        });
        if (notify) {
          setStatus(
            `${t("payFailed")}: ${getUnknownErrorMessage(e, "unknown")}`,
          );
        }
        return {
          ok: false,
          queued: false,
          error: getUnknownErrorMessage(e, "unknown"),
        };
      }
    },
    [
      cashuBalance,
      cashuTokensWithMeta,
      chatSeenWrapIdsRef,
      currentNpub,
      currentNsec,
      enqueuePendingPayment,
      formatDisplayedAmountParts,
      insert,
      logPayStep,
      logPaymentEvent,
      pushToast,
      resolveOwnerIdForWrite,
      setStatus,
      showPaidOverlay,
      t,
      update,
      buildCashuMintCandidates,
      buildCashuTokenPayload,
      updateLocalNostrMessage,
      appendLocalNostrMessage,
      publishWrappedWithRetry,
      publishSingleWrappedWithRetry,
      nostrMessagesLocal,
      setContactsOnboardingHasPaid,
      payWithCashuEnabled,
      defaultMintUrl,
    ],
  );
};
