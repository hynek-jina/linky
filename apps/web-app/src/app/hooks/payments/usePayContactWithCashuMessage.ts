import type { CashuTokenId, ContactId } from "../../../evolu";
import * as Evolu from "@evolu/common";
import React from "react";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { createSendTokenWithTokensAtMint } from "../../../cashuSend";
import {
  createCredoPromiseToken,
  createCredoSettlementToken,
} from "../../../credo";
import { navigateTo } from "../../../hooks/useRouting";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import {
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  PROMISE_EXPIRES_SEC,
  PROMISE_TOTAL_CAP_SAT,
} from "../../../utils/constants";
import { getCredoRemainingAmount } from "../../../utils/credo";
import { previewTokenText } from "../../../utils/formatting";
import { normalizeMintUrl } from "../../../utils/mint";
import { safeLocalStorageSet } from "../../../utils/storage";
import { makeLocalId } from "../../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import type { CredoTokenRow, LocalNostrMessage } from "../../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

type AppendLocalNostrMessage = (
  message: Omit<LocalNostrMessage, "id" | "status"> & {
    status?: "sent" | "pending";
  },
) => string;

type UpdateLocalNostrMessage = (
  id: string,
  updates: Partial<
    Pick<
      LocalNostrMessage,
      "wrapId" | "status" | "pubkey" | "content" | "clientId" | "localOnly"
    >
  >,
) => void;

interface UsePayContactWithCashuMessageParams {
  allowPromisesEnabled: boolean;
  appendLocalNostrMessage: AppendLocalNostrMessage;
  applyCredoSettlement: (args: {
    amount: number;
    promiseId: string;
    settledAtSec: number;
  }) => void;
  buildCashuMintCandidates: (
    mintGroups: Map<string, { sum: number; tokens: string[] }>,
    preferredMint: string,
  ) => Array<{ mint: string; sum: number; tokens: string[] }>;
  cashuBalance: number;
  cashuTokensWithMeta: readonly {
    amount?: unknown;
    id?: unknown;
    mint?: unknown;
    rawToken?: unknown;
    state?: unknown;
    token?: unknown;
  }[];
  chatSeenWrapIdsRef: React.MutableRefObject<Set<string>>;
  credoTokensActive: readonly unknown[];
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
  logPayStep: (step: string, data?: Record<string, unknown>) => void;
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
  ) => Promise<{ anySuccess: boolean; error: unknown | null }>;
  pushToast: (message: string) => void;
  setContactsOnboardingHasPaid: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title: string) => void;
  t: (key: string) => string;
  totalCredoOutstandingOut: number;
  update: EvoluMutations["update"];
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

export const usePayContactWithCashuMessage = <
  TContact extends {
    id?: unknown;
    lnAddress?: unknown;
    name?: unknown;
    npub?: unknown;
  },
>({
  allowPromisesEnabled,
  appendLocalNostrMessage,
  applyCredoSettlement,
  buildCashuMintCandidates,
  cashuBalance,
  cashuTokensWithMeta,
  chatSeenWrapIdsRef,
  credoTokensActive,
  currentNpub,
  currentNsec,
  defaultMintUrl,
  displayUnit,
  enqueuePendingPayment,
  formatInteger,
  getCredoAvailableForContact,
  insert,
  insertCredoPromise,
  logPayStep,
  logPaymentEvent,
  nostrMessagesLocal,
  payWithCashuEnabled,
  publishWrappedWithRetry,
  pushToast,
  setContactsOnboardingHasPaid,
  setStatus,
  showPaidOverlay,
  t,
  totalCredoOutstandingOut,
  update,
  updateLocalNostrMessage,
}: UsePayContactWithCashuMessageParams) => {
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
        allowPromisesEnabled,
        payWithCashuEnabled,
      });

      const isOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (isOffline) {
        const displayName =
          String(contact.name ?? "").trim() ||
          String(contact.lnAddress ?? "").trim() ||
          t("appTitle");
        const clientId = makeLocalId();
        const messageId = appendLocalNostrMessage({
          contactId: String(contact.id ?? ""),
          direction: "out",
          content: t("payQueuedMessage")
            .replace("{amount}", formatInteger(amountSat))
            .replace("{unit}", displayUnit)
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
              .replace("{amount}", formatInteger(amountSat))
              .replace("{unit}", displayUnit)
              .replace("{name}", displayName),
          );
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          navigateTo({ route: "chat", id: contact.id as ContactId });
        }
        return { ok: true, queued: true };
      }

      if (notify) setStatus(t("payPaying"));

      const availableCredo = contactNpub
        ? getCredoAvailableForContact(contactNpub)
        : 0;
      const useCredoAmount = Math.min(availableCredo, amountSat);
      const remainingAfterCredo = Math.max(0, amountSat - useCredoAmount);

      const cashuToSend = Math.min(cashuBalance, remainingAfterCredo);
      const promiseAmount = Math.max(0, remainingAfterCredo - cashuToSend);
      if (promiseAmount > 0) {
        if (!allowPromisesEnabled) {
          if (notify) setStatus(t("payInsufficient"));
          return { ok: false, queued: false, error: "insufficient" };
        }
        if (totalCredoOutstandingOut + promiseAmount > PROMISE_TOTAL_CAP_SAT) {
          if (notify) setStatus(t("payPromiseLimit"));
          return { ok: false, queued: false, error: "promise limit" };
        }
      }

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
        const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
        for (const row of cashuTokensWithMeta) {
          if (String(row.state ?? "") !== "accepted") continue;
          const mint = String(row.mint ?? "").trim();
          if (!mint) continue;
          const tokenText = String(row.token ?? row.rawToken ?? "").trim();
          if (!tokenText) continue;

          const amount = Number((row.amount ?? 0) as unknown as number) || 0;
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
              const inserted = insert("cashuToken", {
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
            error: String(lastError ?? "insufficient funds"),
            contactId: contact.id as ContactId,
          });
          if (notify) {
            setStatus(
              lastError
                ? `${t("payFailed")}: ${String(lastError)}`
                : t("payInsufficient"),
            );
          }
          return { ok: false, queued: false, error: String(lastError ?? "") };
        }
      }

      const settlementPlans: Array<{
        row: unknown;
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

        const publishedSendTokens = new Set<string>();
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
            logPayStep("publish-failed", {
              clientId,
              error: String(firstError ?? "publish failed"),
              isCredoMessage,
            });
            hasPendingMessages = true;
            if (notify) {
              pushToast(
                `${t("payFailed")}: ${String(firstError ?? "publish failed")}`,
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
            isCredoMessage,
          });

          plan.onSuccess?.();
          if (sendTokenMetaByText.has(messageText)) {
            publishedSendTokens.add(messageText);
          }
        }

        if (sendTokenMetaByText.size > 0) {
          const unsentTokens = Array.from(sendTokenMetaByText.keys()).filter(
            (token) => !publishedSendTokens.has(token),
          );
          for (const tokenText of unsentTokens) {
            const meta = sendTokenMetaByText.get(tokenText);
            if (!meta) continue;
            insert("cashuToken", {
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
              update("cashuToken", {
                id,
                isDeleted: Evolu.sqliteTrue,
              });
            }
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

          showPaidOverlay(
            (hasPendingMessages ? t("paidQueuedTo") : t("paidSentTo"))
              .replace("{amount}", formatInteger(amountSat))
              .replace("{unit}", displayUnit)
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
          error: String(e ?? "unknown"),
          contactId: contact.id as ContactId,
        });
        if (notify) {
          setStatus(`${t("payFailed")}: ${String(e ?? "unknown")}`);
        }
        return { ok: false, queued: false, error: String(e ?? "unknown") };
      }
    },
    [
      allowPromisesEnabled,
      cashuBalance,
      cashuTokensWithMeta,
      currentNpub,
      currentNsec,
      displayUnit,
      enqueuePendingPayment,
      formatInteger,
      getCredoAvailableForContact,
      insert,
      insertCredoPromise,
      logPayStep,
      logPaymentEvent,
      pushToast,
      showPaidOverlay,
      t,
      totalCredoOutstandingOut,
      update,
      applyCredoSettlement,
      buildCashuMintCandidates,
      updateLocalNostrMessage,
      appendLocalNostrMessage,
      publishWrappedWithRetry,
      credoTokensActive,
      nostrMessagesLocal,
      setContactsOnboardingHasPaid,
      payWithCashuEnabled,
      defaultMintUrl,
    ],
  );
};
