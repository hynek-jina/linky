import * as Evolu from "@evolu/common";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React from "react";
import { createSendTokenWithTokensAtMint } from "../../cashuSend";
import {
  createCredoPromiseToken,
  createCredoSettlementToken,
} from "../../credo";
import type { CashuTokenId, ContactId } from "../../evolu";
import { navigateTo } from "../../hooks/useRouting";
import { NOSTR_RELAYS } from "../../nostrProfile";
import type { Route } from "../../types/route";
import {
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  PROMISE_EXPIRES_SEC,
  PROMISE_TOTAL_CAP_SAT,
} from "../../utils/constants";
import { previewTokenText } from "../../utils/formatting";
import { safeLocalStorageSet } from "../../utils/storage";
import { getUnknownErrorMessage } from "../../utils/unknown";
import { makeLocalId } from "../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../lib/nostrPool";
import type {
  CashuTokenRowLike,
  ContactRowLike,
  CredoTokenRow,
  MintUrlInput,
  NewLocalNostrMessage,
  PaymentLogData,
  PublishWrappedResult,
  UpdateLocalNostrMessage,
} from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

type ContactRow = ContactRowLike & { id: ContactId };
type CashuTokenWithMetaRow = CashuTokenRowLike & { id: CashuTokenId | string };

interface UsePaySelectedContactParams {
  allowPromisesEnabled: boolean;
  appendLocalNostrMessage: (message: NewLocalNostrMessage) => string;
  applyCredoSettlement: (args: {
    amount: number;
    promiseId: string;
    settledAtSec: number;
  }) => void;
  buildCashuMintCandidates: (
    mintGroups: Map<string, { tokens: string[]; sum: number }>,
    preferredMint: string | null,
  ) => Array<{ mint: string; sum: number; tokens: string[] }>;
  cashuBalance: number;
  cashuIsBusy: boolean;
  cashuOwnerId: Evolu.OwnerId | null;
  cashuTokensWithMeta: CashuTokenWithMetaRow[];
  chatForceScrollToBottomRef: React.MutableRefObject<boolean>;
  chatSeenWrapIdsRef: React.MutableRefObject<Set<string>>;
  contactPayMethod: "cashu" | "lightning" | null;
  credoTokensActive: CredoTokenRow[];
  currentNpub: string | null;
  currentNsec: string | null;
  defaultMintUrl: string | null;
  displayUnit: string;
  enqueuePendingPayment: (payload: {
    amountSat: number;
    contactId: ContactId;
    messageId?: string;
  }) => void;
  formatInteger: (value: number) => string;
  getCredoAvailableForContact: (contactNpub: string) => number;
  getCredoRemainingAmount: (row: CredoTokenRow) => number;
  insert: EvoluMutations["insert"];
  insertCredoPromise: (args: {
    amount: number;
    createdAtSec: number;
    direction: "in" | "out";
    expiresAtSec: number;
    issuer: string;
    promiseId: string;
    recipient: string;
    token: string;
    unit: string;
  }) => void;
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
  normalizeMintUrl: (mintUrl: MintUrlInput) => string | null;
  payAmount: string;
  payWithCashuEnabled: boolean;
  publishWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    wrapForMe: NostrToolsEvent,
    wrapForContact: NostrToolsEvent,
  ) => Promise<PublishWrappedResult>;
  pushToast: (message: string) => void;
  refreshLocalNostrMessages: () => void;
  route: Route;
  selectedContact: ContactRow | null;
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setContactPayMethod: React.Dispatch<
    React.SetStateAction<"cashu" | "lightning" | null>
  >;
  setContactsOnboardingHasPaid: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title?: string) => void;
  t: (key: string) => string;
  totalCredoOutstandingOut: number;
  triggerChatScrollToBottom: (messageId?: string) => void;
  update: EvoluMutations["update"];
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

export const createPaySelectedContact = ({
  allowPromisesEnabled,
  appendLocalNostrMessage,
  applyCredoSettlement,
  buildCashuMintCandidates,
  cashuBalance,
  cashuIsBusy,
  cashuOwnerId,
  cashuTokensWithMeta,
  chatForceScrollToBottomRef,
  chatSeenWrapIdsRef,
  contactPayMethod,
  credoTokensActive,
  currentNpub,
  currentNsec,
  defaultMintUrl,
  displayUnit,
  enqueuePendingPayment,
  formatInteger,
  getCredoAvailableForContact,
  getCredoRemainingAmount,
  insert,
  insertCredoPromise,
  logPayStep,
  logPaymentEvent,
  normalizeMintUrl,
  payAmount,
  payWithCashuEnabled,
  publishWrappedWithRetry,
  pushToast,
  refreshLocalNostrMessages,
  route,
  selectedContact,
  setCashuIsBusy,
  setContactPayMethod,
  setContactsOnboardingHasPaid,
  setStatus,
  showPaidOverlay,
  t,
  totalCredoOutstandingOut,
  triggerChatScrollToBottom,
  update,
  updateLocalNostrMessage,
}: UsePaySelectedContactParams): (() => Promise<void>) => {
  type CashuTokenInsertPayload = {
    amount?: typeof Evolu.PositiveInt.Type | null;
    error?: typeof Evolu.NonEmptyString1000.Type | null;
    mint?: typeof Evolu.NonEmptyString1000.Type | null;
    rawToken?: typeof Evolu.NonEmptyString.Type | null;
    state: typeof Evolu.NonEmptyString100.Type;
    token: typeof Evolu.NonEmptyString.Type;
    unit?: typeof Evolu.NonEmptyString100.Type | null;
  };

  const insertCashuToken = (
    payload: CashuTokenInsertPayload,
  ): ReturnType<EvoluMutations["insert"]> => {
    const sparsePayload: {
      token: typeof Evolu.NonEmptyString.Type;
      state: typeof Evolu.NonEmptyString100.Type;
      amount?: typeof Evolu.PositiveInt.Type;
      error?: typeof Evolu.NonEmptyString1000.Type;
      mint?: typeof Evolu.NonEmptyString1000.Type;
      rawToken?: typeof Evolu.NonEmptyString.Type;
      unit?: typeof Evolu.NonEmptyString100.Type;
    } = {
      token: payload.token,
      state: payload.state,
    };

    if (payload.rawToken) sparsePayload.rawToken = payload.rawToken;
    if (payload.mint) sparsePayload.mint = payload.mint;
    if (payload.unit) sparsePayload.unit = payload.unit;
    if (payload.amount) sparsePayload.amount = payload.amount;
    if (payload.error) sparsePayload.error = payload.error;

    if (cashuOwnerId)
      return insert("cashuToken", sparsePayload, { ownerId: cashuOwnerId });
    return insert("cashuToken", sparsePayload);
  };

  const markCashuTokenDeleted = (id: CashuTokenId): void => {
    const payload = { id, isDeleted: Evolu.sqliteTrue };
    if (cashuOwnerId) {
      update("cashuToken", payload, { ownerId: cashuOwnerId });
      return;
    }
    update("cashuToken", payload);
  };

  return async () => {
    if (route.kind !== "contactPay") return;
    if (!selectedContact) return;

    const selectedContactId = selectedContact.id;

    const lnAddress = String(selectedContact.lnAddress ?? "").trim();
    const contactNpub = String(selectedContact.npub ?? "").trim();
    const canPayViaLightning = Boolean(lnAddress);
    const canPayViaCashuMessage =
      (payWithCashuEnabled || allowPromisesEnabled) && Boolean(contactNpub);

    const method: "cashu" | "lightning" =
      contactPayMethod === "cashu" || contactPayMethod === "lightning"
        ? contactPayMethod
        : canPayViaCashuMessage
          ? "cashu"
          : "lightning";

    // If cashu-pay is disabled or contact missing npub, force lightning.
    if (method === "cashu" && !canPayViaCashuMessage) {
      if (!payWithCashuEnabled) {
        setStatus(t("payWithCashuDisabled"));
      } else {
        setStatus(t("chatMissingContactNpub"));
      }
      return;
    }

    // If lightning isn't possible, but cashu message is, fall back to cashu.
    if (
      method === "lightning" &&
      !canPayViaLightning &&
      canPayViaCashuMessage
    ) {
      setContactPayMethod("cashu");
      // Continue as cashu.
    }

    const isOffline =
      typeof navigator !== "undefined" && navigator.onLine === false;
    const effectiveMethod: "cashu" | "lightning" =
      (method === "lightning" &&
        !canPayViaLightning &&
        canPayViaCashuMessage) ||
      (isOffline && canPayViaCashuMessage)
        ? "cashu"
        : method;

    if (effectiveMethod === "lightning") {
      if (!lnAddress) return;
    }

    const amountSat = Number.parseInt(payAmount.trim(), 10);
    if (!Number.isFinite(amountSat) || amountSat <= 0) {
      setStatus(`${t("errorPrefix")}: ${t("payInvalidAmount")}`);
      return;
    }

    const availableCredo = contactNpub
      ? getCredoAvailableForContact(contactNpub)
      : 0;
    const useCredoAmount = Math.min(availableCredo, amountSat);
    const remainingAfterCredo = Math.max(0, amountSat - useCredoAmount);

    logPayStep("start", {
      contactId: String(selectedContact.id ?? ""),
      method,
      effectiveMethod,
      amountSat,
      availableCredo,
      remainingAfterCredo,
      cashuBalance,
      allowPromisesEnabled,
      payWithCashuEnabled,
    });

    if (effectiveMethod === "lightning") {
      if (remainingAfterCredo > cashuBalance) {
        setStatus(t("payInsufficient"));
        return;
      }
    } else {
      const cashuToSend = Math.min(cashuBalance, remainingAfterCredo);
      const promiseAmount = Math.max(0, remainingAfterCredo - cashuToSend);
      if (promiseAmount > 0) {
        if (!allowPromisesEnabled) {
          setStatus(t("payInsufficient"));
          return;
        }
        if (totalCredoOutstandingOut + promiseAmount > PROMISE_TOTAL_CAP_SAT) {
          setStatus(t("payPromiseLimit"));
          return;
        }
      }
    }

    if (cashuIsBusy) {
      setStatus(t("payPaying"));
      return;
    }
    setCashuIsBusy(true);

    try {
      if (effectiveMethod === "cashu") {
        if (!currentNsec || !currentNpub) {
          setStatus(t("profileMissingNpub"));
          return;
        }
        if (!contactNpub) {
          setStatus(t("chatMissingContactNpub"));
          return;
        }

        const isOffline =
          typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          const displayName =
            String(selectedContact.name ?? "").trim() ||
            String(selectedContact.lnAddress ?? "").trim() ||
            t("appTitle");
          const messageId = appendLocalNostrMessage({
            contactId: String(selectedContact.id),
            direction: "out",
            content: t("payQueuedMessage")
              .replace("{amount}", formatInteger(amountSat))
              .replace("{unit}", displayUnit)
              .replace("{name}", displayName),
            wrapId: `pending:pay:${makeLocalId()}`,
            rumorId: null,
            pubkey: "",
            createdAtSec: Math.floor(Date.now() / 1000),
            status: "pending",
          });
          refreshLocalNostrMessages();
          triggerChatScrollToBottom(messageId);
          logPayStep("queued-offline", {
            contactId: String(selectedContact.id ?? ""),
            amountSat,
            messageId,
          });
          enqueuePendingPayment({
            contactId: selectedContact.id,
            amountSat,
            messageId,
          });
          setStatus(t("payQueued"));
          showPaidOverlay(
            t("paidQueuedTo")
              .replace("{amount}", formatInteger(amountSat))
              .replace("{unit}", displayUnit)
              .replace("{name}", displayName),
          );
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          return;
        }

        setStatus(t("payPaying"));

        const cashuToSend = Math.min(cashuBalance, remainingAfterCredo);
        const promiseAmount = Math.max(0, remainingAfterCredo - cashuToSend);

        const sendBatches: Array<{
          token: string;
          amount: number;
          mint: string;
          unit: string | null;
        }> = [];
        const tokensToDeleteByMint = new Map<string, CashuTokenId[]>();
        const sendTokenMetaByText = new Map<
          string,
          { mint: string; unit: string | null; amount: number }
        >();

        let lastError: unknown = null;
        let lastMint: string | null = null;

        if (cashuToSend > 0) {
          const mintGroups = new Map<
            string,
            { tokens: string[]; sum: number }
          >();
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
          const candidates = buildCashuMintCandidates(
            mintGroups,
            preferredMint,
          );

          logPayStep("mint-candidates", {
            count: candidates.length,
            candidates: candidates.map((c) => ({
              mint: c.mint,
              sum: c.sum,
              tokenCount: c.tokens.length,
            })),
          });

          if (candidates.length === 0) {
            setStatus(t("payInsufficient"));
            return;
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

              const remainingToken = split.remainingToken;
              const remainingAmount = split.remainingAmount;

              if (remainingToken && remainingAmount > 0) {
                const inserted = insertCashuToken({
                  token: remainingToken as typeof Evolu.NonEmptyString.Type,
                  rawToken: null,
                  mint: split.mint as typeof Evolu.NonEmptyString1000.Type,
                  unit: split.unit
                    ? (split.unit as typeof Evolu.NonEmptyString100.Type)
                    : null,
                  amount:
                    remainingAmount > 0
                      ? (remainingAmount as typeof Evolu.PositiveInt.Type)
                      : null,
                  state: "accepted" as typeof Evolu.NonEmptyString100.Type,
                  error: null,
                });
                if (!inserted.ok) throw inserted.error;
              }

              if (!tokensToDeleteByMint.has(candidate.mint)) {
                const ids = cashuTokensWithMeta
                  .filter(
                    (row) =>
                      String(row.state ?? "") === "accepted" &&
                      String(row.mint ?? "").trim() === candidate.mint,
                  )
                  .map((row) => row.id as CashuTokenId);
                tokensToDeleteByMint.set(candidate.mint, ids);
              }
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
              contactId: selectedContact.id,
            });
            setStatus(
              lastError
                ? `${t("payFailed")}: ${getUnknownErrorMessage(lastError, "unknown")}`
                : t("payInsufficient"),
            );
            return;
          }
        }

        const settlementPlans: Array<{
          row: CredoTokenRow;
          amount: number;
        }> = [];

        if (useCredoAmount > 0) {
          const candidates = credoTokensActive
            .filter((row) => {
              const r = row as CredoTokenRow;
              return (
                String(r.direction ?? "") === "in" &&
                String(r.issuer ?? "").trim() === contactNpub
              );
            })
            .sort(
              (a, b) =>
                Number((a as CredoTokenRow).expiresAtSec ?? 0) -
                Number((b as CredoTokenRow).expiresAtSec ?? 0),
            );

          let remaining = useCredoAmount;
          for (const row of candidates) {
            if (remaining <= 0) break;
            const available = getCredoRemainingAmount(row);
            if (available <= 0) continue;
            const useAmount = Math.min(available, remaining);
            if (useAmount <= 0) continue;
            settlementPlans.push({ row, amount: useAmount });
            remaining -= useAmount;
          }
        }

        try {
          const { nip19, getPublicKey } = await import("nostr-tools");
          const { wrapEvent } = await import("nostr-tools/nip59");

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
          const nowSec = Math.floor(Date.now() / 1000);

          for (const plan of settlementPlans) {
            const row = plan.row as CredoTokenRow;
            const promiseId = String(row.promiseId ?? "").trim();
            const issuer = String(row.issuer ?? "").trim();
            const recipient = String(row.recipient ?? "").trim() || currentNpub;
            if (!promiseId || !issuer || !recipient) continue;
            const settlement = createCredoSettlementToken({
              recipientNsec: privBytes,
              promiseId,
              issuerNpub: issuer,
              recipientNpub: recipient,
              amount: plan.amount,
              unit: "sat",
              settledAtSec: nowSec,
            });
            messagePlans.push({
              text: settlement.token,
              onSuccess: () =>
                applyCredoSettlement({
                  promiseId,
                  amount: plan.amount,
                  settledAtSec: nowSec,
                }),
            });
          }

          if (promiseAmount > 0) {
            const expiresAtSec = nowSec + PROMISE_EXPIRES_SEC;
            const promiseCreated = createCredoPromiseToken({
              issuerNpub: currentNpub,
              issuerNsec: privBytes,
              recipientNpub: contactNpub,
              amount: promiseAmount,
              unit: "sat",
              expiresAtSec,
              createdAtSec: nowSec,
            });
            messagePlans.push({
              text: promiseCreated.token,
              onSuccess: () =>
                insertCredoPromise({
                  promiseId: promiseCreated.promiseId,
                  token: promiseCreated.token,
                  issuer: currentNpub,
                  recipient: contactNpub,
                  amount: promiseAmount,
                  unit: "sat",
                  createdAtSec: nowSec,
                  expiresAtSec,
                  direction: "out",
                }),
            });
          }

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

          if (selectedContactId) {
            chatForceScrollToBottomRef.current = true;
            navigateTo({ route: "chat", id: selectedContactId });
          }

          const publishedSendTokens = new Set<string>();
          let publishFailedError: unknown = null;
          let hasPendingMessages = false;

          for (const plan of messagePlans) {
            const messageText = plan.text;
            const clientId = makeLocalId();
            const isCredoMessage = messageText.startsWith("credoA");
            logPayStep("publish-pending", {
              clientId,
              isCredoMessage,
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

            const pendingId = appendLocalNostrMessage({
              contactId: String(selectedContact.id),
              direction: "out",
              content: messageText,
              wrapId: `pending:${clientId}`,
              rumorId: null,
              pubkey: myPubHex,
              createdAtSec: baseEvent.created_at,
              status: "pending",
              clientId,
            });
            refreshLocalNostrMessages();
            triggerChatScrollToBottom(pendingId);

            const wrapForMe = wrapEvent(
              baseEvent,
              privBytes,
              myPubHex,
            ) as NostrToolsEvent;
            const wrapForContact = wrapEvent(
              baseEvent,
              privBytes,
              contactPubHex,
            ) as NostrToolsEvent;

            const publishOutcome = await publishWrappedWithRetry(
              pool,
              NOSTR_RELAYS,
              wrapForMe,
              wrapForContact,
            );

            const anySuccess = publishOutcome.anySuccess;
            if (!anySuccess) {
              const firstError = publishOutcome.error;
              hasPendingMessages = true;
              logPayStep("publish-failed", {
                clientId,
                error: getUnknownErrorMessage(firstError, "publish failed"),
                isCredoMessage,
              });
              if (!isCredoMessage) {
                publishFailedError = firstError ?? new Error("publish failed");
                break;
              }
              pushToast(
                `${t("payFailed")}: ${getUnknownErrorMessage(firstError, "publish failed")}`,
              );
            }

            if (anySuccess) {
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
                isCredoMessage,
              });
              plan.onSuccess?.();
              if (sendTokenMetaByText.has(messageText)) {
                publishedSendTokens.add(messageText);
              }
            }
          }

          if (sendTokenMetaByText.size > 0) {
            const unsentTokens = Array.from(sendTokenMetaByText.keys()).filter(
              (token) => !publishedSendTokens.has(token),
            );
            for (const tokenText of unsentTokens) {
              const meta = sendTokenMetaByText.get(tokenText);
              if (!meta) continue;
              insertCashuToken({
                token: tokenText as typeof Evolu.NonEmptyString.Type,
                rawToken: null,
                mint: meta.mint as typeof Evolu.NonEmptyString1000.Type,
                unit: meta.unit
                  ? (meta.unit as typeof Evolu.NonEmptyString100.Type)
                  : null,
                amount:
                  meta.amount > 0
                    ? (meta.amount as typeof Evolu.PositiveInt.Type)
                    : null,
                state: "pending" as typeof Evolu.NonEmptyString100.Type,
                error: null,
              });
            }

            for (const ids of tokensToDeleteByMint.values()) {
              for (const id of ids) {
                markCashuTokenDeleted(id);
              }
            }
          }

          if (publishFailedError) {
            logPayStep("publish-queued", {
              error: getUnknownErrorMessage(
                publishFailedError,
                "publish failed",
              ),
            });
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
            contactId: selectedContact.id,
          });

          const displayName =
            String(selectedContact.name ?? "").trim() ||
            String(selectedContact.lnAddress ?? "").trim() ||
            t("appTitle");

          showPaidOverlay(
            (hasPendingMessages ? t("paidQueuedTo") : t("paidSentTo"))
              .replace("{amount}", formatInteger(amountSat))
              .replace("{unit}", displayUnit)
              .replace("{name}", displayName),
          );

          setStatus(hasPendingMessages ? t("payQueued") : t("paySuccess"));
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          chatForceScrollToBottomRef.current = true;
          navigateTo({ route: "chat", id: selectedContact.id });
          return;
        } catch (e) {
          lastError = e;
        }

        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: amountSat,
          fee: null,
          mint: lastMint,
          unit: "sat",
          error: getUnknownErrorMessage(lastError, "unknown"),
          contactId: selectedContact.id,
        });
        setStatus(
          `${t("payFailed")}: ${getUnknownErrorMessage(lastError, "unknown")}`,
        );
        return;
      }

      if (remainingAfterCredo <= 0) {
        try {
          if (!currentNsec || !currentNpub || !contactNpub) {
            setStatus(t("profileMissingNpub"));
            return;
          }

          const settlementPlans: Array<{ row: CredoTokenRow; amount: number }> =
            [];
          if (useCredoAmount > 0) {
            const candidates = credoTokensActive
              .filter((row) => {
                const r = row as CredoTokenRow;
                return (
                  String(r.direction ?? "") === "in" &&
                  String(r.issuer ?? "").trim() === contactNpub
                );
              })
              .sort(
                (a, b) =>
                  Number((a as CredoTokenRow).expiresAtSec ?? 0) -
                  Number((b as CredoTokenRow).expiresAtSec ?? 0),
              );

            let remaining = useCredoAmount;
            for (const row of candidates) {
              if (remaining <= 0) break;
              const available = getCredoRemainingAmount(row);
              if (available <= 0) continue;
              const useAmount = Math.min(available, remaining);
              if (useAmount <= 0) continue;
              settlementPlans.push({ row, amount: useAmount });
              remaining -= useAmount;
            }
          }

          const { nip19, getPublicKey } = await import("nostr-tools");
          const { wrapEvent } = await import("nostr-tools/nip59");

          const decodedMe = nip19.decode(currentNsec);
          if (decodedMe.type !== "nsec") throw new Error("invalid nsec");
          const privBytes = decodedMe.data as Uint8Array;
          const myPubHex = getPublicKey(privBytes);

          const decodedContact = nip19.decode(contactNpub);
          if (decodedContact.type !== "npub") throw new Error("invalid npub");
          const contactPubHex = decodedContact.data as string;

          const pool = await getSharedAppNostrPool();
          const nowSec = Math.floor(Date.now() / 1000);
          const messagePlans: Array<{
            text: string;
            onSuccess?: () => void;
          }> = [];

          for (const plan of settlementPlans) {
            const row = plan.row as CredoTokenRow;
            const promiseId = String(row.promiseId ?? "").trim();
            const issuer = String(row.issuer ?? "").trim();
            const recipient = String(row.recipient ?? "").trim() || currentNpub;
            if (!promiseId || !issuer || !recipient) continue;
            const settlement = createCredoSettlementToken({
              recipientNsec: privBytes,
              promiseId,
              issuerNpub: issuer,
              recipientNpub: recipient,
              amount: plan.amount,
              unit: "sat",
              settledAtSec: nowSec,
            });
            messagePlans.push({
              text: settlement.token,
              onSuccess: () =>
                applyCredoSettlement({
                  promiseId,
                  amount: plan.amount,
                  settledAtSec: nowSec,
                }),
            });
          }

          for (const plan of messagePlans) {
            const messageText = plan.text;
            const clientId = makeLocalId();
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

            const pendingId = appendLocalNostrMessage({
              contactId: String(selectedContact.id),
              direction: "out",
              content: messageText,
              wrapId: `pending:${clientId}`,
              rumorId: null,
              pubkey: myPubHex,
              createdAtSec: baseEvent.created_at,
              status: "pending",
              clientId,
            });

            const wrapForMe = wrapEvent(
              baseEvent,
              privBytes,
              myPubHex,
            ) as NostrToolsEvent;
            const wrapForContact = wrapEvent(
              baseEvent,
              privBytes,
              contactPubHex,
            ) as NostrToolsEvent;

            const publishOutcome = await publishWrappedWithRetry(
              pool,
              NOSTR_RELAYS,
              wrapForMe,
              wrapForContact,
            );

            const anySuccess = publishOutcome.anySuccess;
            if (!anySuccess) {
              const firstError = publishOutcome.error;
              pushToast(
                `${t("payFailed")}: ${getUnknownErrorMessage(firstError, "publish failed")}`,
              );
            }

            if (anySuccess) {
              chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));
              if (pendingId) {
                updateLocalNostrMessage(pendingId, {
                  status: "sent",
                  wrapId: String(wrapForMe.id ?? ""),
                  pubkey: myPubHex,
                });
              }
              plan.onSuccess?.();
            }
          }

          logPaymentEvent({
            direction: "out",
            status: "ok",
            amount: amountSat,
            fee: null,
            mint: null,
            unit: "sat",
            error: null,
            contactId: selectedContact.id,
          });

          const displayName =
            String(selectedContact.name ?? "").trim() ||
            String(selectedContact.lnAddress ?? "").trim() ||
            t("appTitle");

          showPaidOverlay(
            t("paidSentTo")
              .replace("{amount}", formatInteger(amountSat))
              .replace("{unit}", displayUnit)
              .replace("{name}", displayName),
          );

          setStatus(t("paySuccess"));
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          chatForceScrollToBottomRef.current = true;
          navigateTo({ route: "chat", id: selectedContact.id });
          return;
        } catch (e) {
          setStatus(
            `${t("payFailed")}: ${getUnknownErrorMessage(e, "unknown")}`,
          );
          return;
        }
      }

      const isLightningOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (isLightningOffline) {
        setStatus(`${t("payFailed")}: ${t("evoluServerOfflineStatus")}`);
        return;
      }

      setStatus(t("payFetchingInvoice"));
      let invoice: string;
      try {
        const { fetchLnurlInvoiceForLightningAddress } =
          await import("../../lnurlPay");
        invoice = await fetchLnurlInvoiceForLightningAddress(
          lnAddress,
          remainingAfterCredo,
        );
      } catch (e) {
        const message = getUnknownErrorMessage(e, "unknown");
        const lower = message.toLowerCase();
        const isNetworkError =
          lower.includes("failed to fetch") ||
          lower.includes("networkerror") ||
          lower.includes("network error");
        const offline =
          typeof navigator !== "undefined" && navigator.onLine === false;
        if (offline && isNetworkError) {
          setStatus(`${t("payFailed")}: ${t("evoluServerOfflineStatus")}`);
        } else {
          setStatus(`${t("payFailed")}: ${message}`);
        }
        return;
      }

      setStatus(t("payPaying"));

      // Try mints (largest balance first) until one succeeds.
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

      if (candidates.length === 0) {
        setStatus(t("payInsufficient"));
        return;
      }

      let lastError: unknown = null;
      let lastMint: string | null = null;
      for (const candidate of candidates) {
        try {
          const { meltInvoiceWithTokensAtMint } =
            await import("../../cashuMelt");
          const result = await meltInvoiceWithTokensAtMint({
            invoice,
            mint: candidate.mint,
            tokens: candidate.tokens,
            unit: "sat",
          });

          if (!result.ok) {
            // Best-effort recovery: if we swapped, persist the recovery token
            // and remove old rows so the wallet doesn't keep stale proofs.
            if (result.remainingToken && result.remainingAmount > 0) {
              const recoveryToken = result.remainingToken;
              const inserted = insertCashuToken({
                token: recoveryToken as typeof Evolu.NonEmptyString.Type,
                rawToken: null,
                mint: result.mint as typeof Evolu.NonEmptyString1000.Type,
                unit: result.unit
                  ? (result.unit as typeof Evolu.NonEmptyString100.Type)
                  : null,
                amount:
                  result.remainingAmount > 0
                    ? (result.remainingAmount as typeof Evolu.PositiveInt.Type)
                    : null,
                state: "accepted" as typeof Evolu.NonEmptyString100.Type,
                error: null,
              });

              if (inserted.ok) {
                for (const row of cashuTokensWithMeta) {
                  if (
                    String(row.state ?? "") === "accepted" &&
                    String(row.mint ?? "").trim() === candidate.mint
                  ) {
                    markCashuTokenDeleted(row.id as CashuTokenId);
                  }
                }
              }
            }

            lastError = result.error;
            lastMint = candidate.mint;

            // If the mint didn't swap (no remainingToken), it's safe to try
            // another mint (e.g. a larger token or higher fee reserve).
            if (!result.remainingToken) {
              continue;
            }

            logPaymentEvent({
              direction: "out",
              status: "error",
              amount: amountSat,
              fee: null,
              mint: result.mint,
              unit: result.unit,
              error: String(result.error ?? "unknown"),
              contactId: selectedContact.id,
            });

            // Stop here: at this point the mint may have swapped proofs.
            setStatus(
              `${t("payFailed")}: ${String(result.error ?? "unknown")}`,
            );
            return;
          }

          // Persist change first, then remove old rows for that mint.
          if (result.remainingToken && result.remainingAmount > 0) {
            const inserted = insertCashuToken({
              token: result.remainingToken as typeof Evolu.NonEmptyString.Type,
              rawToken: null,
              mint: result.mint as typeof Evolu.NonEmptyString1000.Type,
              unit: result.unit
                ? (result.unit as typeof Evolu.NonEmptyString100.Type)
                : null,
              amount:
                result.remainingAmount > 0
                  ? (result.remainingAmount as typeof Evolu.PositiveInt.Type)
                  : null,
              state: "accepted" as typeof Evolu.NonEmptyString100.Type,
              error: null,
            });
            if (!inserted.ok) throw inserted.error;
          }

          for (const row of cashuTokensWithMeta) {
            if (
              String(row.state ?? "") === "accepted" &&
              String(row.mint ?? "").trim() === candidate.mint
            ) {
              markCashuTokenDeleted(row.id as CashuTokenId);
            }
          }

          if (useCredoAmount > 0) {
            try {
              if (!currentNsec || !currentNpub || !contactNpub) {
                throw new Error("missing credo context");
              }

              const settlementPlans: Array<{
                row: CredoTokenRow;
                amount: number;
              }> = [];
              const candidates = credoTokensActive
                .filter((row) => {
                  const r = row as CredoTokenRow;
                  return (
                    String(r.direction ?? "") === "in" &&
                    String(r.issuer ?? "").trim() === contactNpub
                  );
                })
                .sort(
                  (a, b) =>
                    Number((a as CredoTokenRow).expiresAtSec ?? 0) -
                    Number((b as CredoTokenRow).expiresAtSec ?? 0),
                );

              let remaining = useCredoAmount;
              for (const row of candidates) {
                if (remaining <= 0) break;
                const available = getCredoRemainingAmount(row);
                if (available <= 0) continue;
                const useAmount = Math.min(available, remaining);
                if (useAmount <= 0) continue;
                settlementPlans.push({ row, amount: useAmount });
                remaining -= useAmount;
              }

              const { nip19, getPublicKey } = await import("nostr-tools");
              const { wrapEvent } = await import("nostr-tools/nip59");

              const decodedMe = nip19.decode(currentNsec);
              if (decodedMe.type !== "nsec") throw new Error("invalid nsec");
              const privBytes = decodedMe.data as Uint8Array;
              const myPubHex = getPublicKey(privBytes);

              const decodedContact = nip19.decode(contactNpub);
              if (decodedContact.type !== "npub")
                throw new Error("invalid npub");
              const contactPubHex = decodedContact.data as string;

              const pool = await getSharedAppNostrPool();
              const nowSec = Math.floor(Date.now() / 1000);

              for (const plan of settlementPlans) {
                const row = plan.row as CredoTokenRow;
                const promiseId = String(row.promiseId ?? "").trim();
                const issuer = String(row.issuer ?? "").trim();
                const recipient =
                  String(row.recipient ?? "").trim() || currentNpub;
                if (!promiseId || !issuer || !recipient) continue;
                const settlement = createCredoSettlementToken({
                  recipientNsec: privBytes,
                  promiseId,
                  issuerNpub: issuer,
                  recipientNpub: recipient,
                  amount: plan.amount,
                  unit: "sat",
                  settledAtSec: nowSec,
                });

                const messageText = settlement.token;
                const baseEvent = {
                  created_at: Math.ceil(Date.now() / 1e3),
                  kind: 14,
                  pubkey: myPubHex,
                  tags: [
                    ["p", contactPubHex],
                    ["p", myPubHex],
                  ],
                  content: messageText,
                } satisfies UnsignedEvent;

                const wrapForMe = wrapEvent(
                  baseEvent,
                  privBytes,
                  myPubHex,
                ) as NostrToolsEvent;
                const wrapForContact = wrapEvent(
                  baseEvent,
                  privBytes,
                  contactPubHex,
                ) as NostrToolsEvent;

                chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));

                const publishOutcome = await publishWrappedWithRetry(
                  pool,
                  NOSTR_RELAYS,
                  wrapForMe,
                  wrapForContact,
                );

                const anySuccess = publishOutcome.anySuccess;
                if (!anySuccess) {
                  const firstError = publishOutcome.error;
                  pushToast(
                    `${t("payFailed")}: ${getUnknownErrorMessage(firstError, "publish failed")}`,
                  );
                }

                appendLocalNostrMessage({
                  contactId: String(selectedContact.id),
                  direction: "out",
                  content: messageText,
                  wrapId: String(wrapForMe.id ?? ""),
                  rumorId: null,
                  pubkey: myPubHex,
                  createdAtSec: baseEvent.created_at,
                });

                applyCredoSettlement({
                  promiseId,
                  amount: plan.amount,
                  settledAtSec: nowSec,
                });
              }
            } catch (e) {
              pushToast(
                `${t("payFailed")}: ${getUnknownErrorMessage(e, "unknown")}`,
              );
            }
          }

          logPaymentEvent({
            direction: "out",
            status: "ok",
            amount: amountSat,
            fee: (() => {
              const feePaid = Number(
                (result as { feePaid?: unknown }).feePaid ?? 0,
              );
              return Number.isFinite(feePaid) && feePaid > 0 ? feePaid : null;
            })(),
            mint: result.mint,
            unit: result.unit,
            error: null,
            contactId: selectedContact.id,
          });

          const displayName =
            String(selectedContact.name ?? "").trim() ||
            String(selectedContact.lnAddress ?? "").trim() ||
            t("appTitle");

          showPaidOverlay(
            t("paidSentTo")
              .replace("{amount}", formatInteger(amountSat))
              .replace("{unit}", displayUnit)
              .replace("{name}", displayName),
          );

          setStatus(t("paySuccess"));
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          navigateTo({ route: "chat", id: selectedContact.id });
          return;
        } catch (e) {
          lastError = e;
          lastMint = candidate.mint;
        }
      }

      logPaymentEvent({
        direction: "out",
        status: "error",
        amount: amountSat,
        fee: null,
        mint: lastMint,
        unit: "sat",
        error: getUnknownErrorMessage(lastError, "unknown"),
        contactId: selectedContact.id,
      });
      setStatus(
        `${t("payFailed")}: ${getUnknownErrorMessage(lastError, "unknown")}`,
      );
    } finally {
      setCashuIsBusy(false);
    }
  };
};
