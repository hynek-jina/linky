import * as Evolu from "@evolu/common";
import React from "react";
import type { CashuTokenId } from "../../evolu";
import {
  fetchLnurlInvoiceForTarget,
  getLnurlPayDisplayText,
  inferLightningAddressFromLnurlTarget,
  isLightningAddress,
} from "../../lnurlPay";
import { CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY } from "../../utils/constants";
import type { DisplayAmountParts } from "../../utils/displayAmounts";
import { getLightningInvoicePreview } from "../../utils/lightningInvoice";
import { safeLocalStorageSet } from "../../utils/storage";
import { getUnknownErrorMessage } from "../../utils/unknown";
import { isCashuTokenAcceptedState } from "../lib/cashuTokenState";
import {
  buildPaymentFailureAmountAttempts,
  buildPaymentAmountAttempts,
  isRetryablePaymentAmountFailure,
} from "../lib/paymentAmountFallback";
import { requiresMultipleMintsForAmount } from "../lib/paymentMintSelection";
import type {
  CashuTokenRowLike,
  ContactPayRowLike,
  LocalMintInfoRow,
  LoggedPaymentEventParams,
  MintUrlInput,
} from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

type CashuTokenWithMetaRow = CashuTokenRowLike & { id: CashuTokenId };
type ContactRow = ContactPayRowLike;

interface UseLightningPaymentsDomainParams {
  buildCashuMintCandidates: (
    mintGroups: Map<string, { tokens: string[]; sum: number }>,
    preferredMint: string | null,
  ) => Array<{ mint: string; sum: number; tokens: string[] }>;
  canPayWithCashu: boolean;
  cashuBalance: number;
  cashuIsBusy: boolean;
  cashuOwnerId: Evolu.OwnerId | null;
  cashuTokensWithMeta: CashuTokenWithMetaRow[];
  contacts: readonly ContactRow[];
  defaultMintUrl: string | null;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  insert: EvoluMutations["insert"];
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
  mintInfoByUrl: Map<string, LocalMintInfoRow>;
  normalizeMintUrl: (url: MintUrlInput) => string | null;
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setContactsOnboardingHasPaid: React.Dispatch<React.SetStateAction<boolean>>;
  setPostPaySaveContact: React.Dispatch<
    React.SetStateAction<{ amountSat: number; lnAddress: string } | null>
  >;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  showPaidOverlay: (title?: string) => void;
  t: (key: string) => string;
  update: EvoluMutations["update"];
}

export const useLightningPaymentsDomain = ({
  buildCashuMintCandidates,
  canPayWithCashu,
  cashuBalance,
  cashuIsBusy,
  cashuOwnerId,
  cashuTokensWithMeta,
  contacts,
  defaultMintUrl,
  formatDisplayedAmountParts,
  insert,
  logPaymentEvent,
  mintInfoByUrl,
  normalizeMintUrl,
  setCashuIsBusy,
  setContactsOnboardingHasPaid,
  setPostPaySaveContact,
  setStatus,
  showPaidOverlay,
  t,
  update,
}: UseLightningPaymentsDomainParams) => {
  type CashuTokenInsertPayload = {
    amount: typeof Evolu.PositiveInt.Type | null;
    error: typeof Evolu.NonEmptyString1000.Type | null;
    mint: typeof Evolu.NonEmptyString1000.Type | null;
    rawToken: typeof Evolu.NonEmptyString.Type | null;
    state: typeof Evolu.NonEmptyString100.Type;
    token: typeof Evolu.NonEmptyString.Type;
    unit: typeof Evolu.NonEmptyString100.Type | null;
  };

  const insertCashuToken = React.useCallback(
    (payload: CashuTokenInsertPayload) => {
      const sparsePayload: {
        state: typeof Evolu.NonEmptyString100.Type;
        token: typeof Evolu.NonEmptyString.Type;
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
    },
    [cashuOwnerId, insert],
  );

  const markCashuTokenDeleted = React.useCallback(
    (id: CashuTokenId) => {
      const payload = { id, isDeleted: Evolu.sqliteTrue };
      if (cashuOwnerId)
        return update("cashuToken", payload, { ownerId: cashuOwnerId });
      return update("cashuToken", payload);
    },
    [cashuOwnerId, update],
  );

  const payLightningInvoiceWithCashu = React.useCallback(
    async (invoice: string) => {
      const normalized = invoice.trim();
      if (!normalized) return false;

      if (cashuIsBusy) return false;
      if (cashuBalance <= 0) {
        setStatus(t("payInsufficient"));
        return false;
      }

      setCashuIsBusy(true);
      try {
        setStatus(t("payPaying"));

        const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
        for (const row of cashuTokensWithMeta) {
          if (!isCashuTokenAcceptedState(row.state)) continue;
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
        const invoiceAmountSat =
          getLightningInvoicePreview(normalized)?.amountSat;

        if (candidates.length === 0) {
          setStatus(t("payInsufficient"));
          return false;
        }

        if (
          typeof invoiceAmountSat === "number" &&
          requiresMultipleMintsForAmount(candidates, invoiceAmountSat)
        ) {
          const errorMessage = t("payMultiMintUnsupported");
          logPaymentEvent({
            direction: "out",
            status: "error",
            amount: invoiceAmountSat,
            fee: null,
            mint: null,
            unit: "sat",
            error: errorMessage,
            contactId: null,
            method: "lightning_invoice",
            phase: "melt",
          });
          setStatus(`${t("payFailed")}: ${errorMessage}`);
          return false;
        }

        let lastError: unknown = null;
        let lastMint: string | null = null;
        for (const candidate of candidates) {
          try {
            const { meltInvoiceWithTokensAtMint } =
              await import("../../cashuMelt");
            const result = await meltInvoiceWithTokensAtMint({
              invoice: normalized,
              mint: candidate.mint,
              tokens: candidate.tokens,
              unit: "sat",
            });

            if (!result.ok) {
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
                      isCashuTokenAcceptedState(row.state) &&
                      String(row.mint ?? "").trim() === candidate.mint
                    ) {
                      markCashuTokenDeleted(row.id);
                    }
                  }
                }
              }

              lastError = result.error;
              lastMint = candidate.mint;

              // If no swap happened, we can safely try other mints.
              if (!result.remainingToken) {
                continue;
              }

              logPaymentEvent({
                direction: "out",
                status: "error",
                amount: null,
                fee: null,
                mint: result.mint,
                unit: result.unit,
                error: String(result.error ?? "unknown"),
                contactId: null,
                method: "lightning_invoice",
                phase: "melt",
              });

              setStatus(
                `${t("payFailed")}: ${String(result.error ?? "unknown")}`,
              );
              return false;
            }

            if (result.remainingToken && result.remainingAmount > 0) {
              const inserted = insertCashuToken({
                token:
                  result.remainingToken as typeof Evolu.NonEmptyString.Type,
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
                isCashuTokenAcceptedState(row.state) &&
                String(row.mint ?? "").trim() === candidate.mint
              ) {
                markCashuTokenDeleted(row.id);
              }
            }

            logPaymentEvent({
              direction: "out",
              status: "ok",
              amount: result.paidAmount,
              fee: (() => {
                const feePaid = Number(
                  (result as { feePaid?: unknown }).feePaid ?? 0,
                );
                return Number.isFinite(feePaid) && feePaid > 0 ? feePaid : null;
              })(),
              mint: result.mint,
              unit: result.unit,
              error: null,
              contactId: null,
              method: "lightning_invoice",
              phase: "complete",
            });

            const displayAmount = formatDisplayedAmountParts(result.paidAmount);
            showPaidOverlay(
              t("paidSent")
                .replace(
                  "{amount}",
                  `${displayAmount.approxPrefix}${displayAmount.amountText}`,
                )
                .replace("{unit}", displayAmount.unitLabel),
            );

            setStatus(t("paySuccess"));
            safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
            setContactsOnboardingHasPaid(true);
            return true;
          } catch (e) {
            lastError = e;
            lastMint = candidate.mint;
          }
        }

        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: null,
          fee: null,
          mint: lastMint,
          unit: "sat",
          error: getUnknownErrorMessage(lastError, "unknown"),
          contactId: null,
          method: "lightning_invoice",
          phase: "melt",
        });
        setStatus(
          `${t("payFailed")}: ${getUnknownErrorMessage(lastError, "unknown")}`,
        );
        return false;
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      buildCashuMintCandidates,
      cashuBalance,
      cashuIsBusy,
      cashuTokensWithMeta,
      defaultMintUrl,
      formatDisplayedAmountParts,
      insertCashuToken,
      logPaymentEvent,
      markCashuTokenDeleted,
      normalizeMintUrl,
      setCashuIsBusy,
      setContactsOnboardingHasPaid,
      setStatus,
      showPaidOverlay,
      t,
    ],
  );

  const payLightningAddressWithCashu = React.useCallback(
    async (lnAddress: string, amountSat: number) => {
      const paymentTarget = String(lnAddress ?? "").trim();
      if (!paymentTarget) return;
      if (!Number.isFinite(amountSat) || amountSat <= 0) {
        setStatus(`${t("errorPrefix")}: ${t("payInvalidAmount")}`);
        return;
      }
      if (!canPayWithCashu) return;
      if (cashuIsBusy) return;
      setCashuIsBusy(true);

      const displayTarget = getLnurlPayDisplayText(paymentTarget);
      const inferredLightningAddress =
        inferLightningAddressFromLnurlTarget(paymentTarget) ?? paymentTarget;
      const canOfferSave = isLightningAddress(inferredLightningAddress);

      const knownContact = contacts.find(
        (c) =>
          String(c.lnAddress ?? "")
            .trim()
            .toLowerCase() === inferredLightningAddress.toLowerCase(),
      );
      const shouldOfferSave = canOfferSave && !knownContact?.id;

      try {
        const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
        for (const row of cashuTokensWithMeta) {
          if (!isCashuTokenAcceptedState(row.state)) continue;
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

        const candidates = Array.from(mintGroups.entries())
          .map(([mint, info]) => ({ mint, ...info }))
          .sort((a, b) => {
            const normalize = (u: string) =>
              String(u ?? "")
                .trim()
                .replace(/\/+$/, "");
            const mpp = (mint: string) => {
              const row = mintInfoByUrl.get(normalize(mint));
              return String(row?.supportsMpp ?? "") === "1" ? 1 : 0;
            };
            const dmpp = mpp(b.mint) - mpp(a.mint);
            if (dmpp !== 0) return dmpp;
            return b.sum - a.sum;
          });

        if (candidates.length === 0) {
          setStatus(t("payInsufficient"));
          return;
        }

        const amountAttempts = buildPaymentAmountAttempts(
          amountSat,
          cashuBalance,
        );
        const queuedAmountAttempts = [...amountAttempts];
        const seenAmountAttempts = new Set(queuedAmountAttempts);
        let finalErrorMessage: string | null = null;
        let finalErrorMint: string | null = null;

        for (
          let attemptIndex = 0;
          attemptIndex < queuedAmountAttempts.length;
          attemptIndex += 1
        ) {
          const attemptedAmountSat = queuedAmountAttempts[attemptIndex];
          const queueLowerAmountAttempts = (errorMessage: string): boolean => {
            const retryAttempts = buildPaymentFailureAmountAttempts(
              attemptedAmountSat,
              errorMessage,
            );
            let queuedAny = false;
            for (const retryAmountSat of retryAttempts) {
              if (seenAmountAttempts.has(retryAmountSat)) continue;
              seenAmountAttempts.add(retryAmountSat);
              queuedAmountAttempts.push(retryAmountSat);
              queuedAny = true;
            }
            return queuedAny;
          };
          const hasLowerAmountFallback =
            attemptIndex < queuedAmountAttempts.length - 1;

          if (requiresMultipleMintsForAmount(candidates, attemptedAmountSat)) {
            if (hasLowerAmountFallback) {
              continue;
            }

            finalErrorMessage = t("payMultiMintUnsupported");
            finalErrorMint = null;
            break;
          }

          let attemptInvoice: string;
          try {
            setStatus(t("payFetchingInvoice"));
            attemptInvoice = await fetchLnurlInvoiceForTarget(
              paymentTarget,
              attemptedAmountSat,
            );
          } catch (e) {
            const errorMessage = getUnknownErrorMessage(e, "unknown");
            if (
              (hasLowerAmountFallback ||
                queueLowerAmountAttempts(errorMessage)) &&
              isRetryablePaymentAmountFailure(errorMessage)
            ) {
              continue;
            }

            finalErrorMessage = errorMessage;
            finalErrorMint = null;
            break;
          }

          setStatus(t("payPaying"));

          let lastError: unknown = null;
          let lastMint: string | null = null;
          let shouldRetryWithLowerAmount = false;

          for (const candidate of candidates) {
            try {
              const { meltInvoiceWithTokensAtMint } =
                await import("../../cashuMelt");
              const result = await meltInvoiceWithTokensAtMint({
                invoice: attemptInvoice,
                mint: candidate.mint,
                tokens: candidate.tokens,
                unit: "sat",
              });

              if (!result.ok) {
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
                        isCashuTokenAcceptedState(row.state) &&
                        String(row.mint ?? "").trim() === candidate.mint
                      ) {
                        markCashuTokenDeleted(row.id);
                      }
                    }
                  }
                }

                lastError = result.error;
                lastMint = candidate.mint;

                if (
                  !result.remainingToken &&
                  queueLowerAmountAttempts(String(result.error ?? "unknown"))
                ) {
                  shouldRetryWithLowerAmount = true;
                  break;
                }

                if (!result.remainingToken) {
                  continue;
                }

                finalErrorMessage = String(result.error ?? "unknown");
                finalErrorMint = result.mint;
                break;
              }

              if (result.remainingToken && result.remainingAmount > 0) {
                const inserted = insertCashuToken({
                  token:
                    result.remainingToken as typeof Evolu.NonEmptyString.Type,
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
                  isCashuTokenAcceptedState(row.state) &&
                  String(row.mint ?? "").trim() === candidate.mint
                ) {
                  markCashuTokenDeleted(row.id);
                }
              }

              const feePaid = Number(
                (result as { feePaid?: unknown }).feePaid ?? 0,
              );

              logPaymentEvent({
                direction: "out",
                status: "ok",
                amount: result.paidAmount,
                fee: Number.isFinite(feePaid) && feePaid > 0 ? feePaid : null,
                mint: result.mint,
                unit: result.unit,
                error: null,
                contactId: null,
                method: "lightning_address",
                phase: "complete",
              });

              const displayAmount = formatDisplayedAmountParts(
                result.paidAmount,
              );
              showPaidOverlay(
                t("paidSentTo")
                  .replace(
                    "{amount}",
                    `${displayAmount.approxPrefix}${displayAmount.amountText}`,
                  )
                  .replace("{unit}", displayAmount.unitLabel)
                  .replace(
                    "{name}",
                    String(knownContact?.name ?? "").trim() || displayTarget,
                  ),
              );

              safeLocalStorageSet(
                CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
                "1",
              );
              setContactsOnboardingHasPaid(true);

              if (shouldOfferSave) {
                setPostPaySaveContact({
                  lnAddress: inferredLightningAddress,
                  amountSat: result.paidAmount,
                });
              }
              return;
            } catch (e) {
              lastError = e;
              lastMint = candidate.mint;
            }
          }

          if (finalErrorMessage) break;

          const errorMessage = getUnknownErrorMessage(lastError, "unknown");
          if (
            (hasLowerAmountFallback ||
              queueLowerAmountAttempts(errorMessage)) &&
            isRetryablePaymentAmountFailure(errorMessage)
          ) {
            shouldRetryWithLowerAmount = true;
          } else {
            finalErrorMessage = errorMessage;
            finalErrorMint = lastMint;
          }

          if (!shouldRetryWithLowerAmount) break;
        }

        if (!finalErrorMessage) {
          finalErrorMessage = "unknown";
        }

        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: amountSat,
          fee: null,
          mint: finalErrorMint,
          unit: "sat",
          error: finalErrorMessage,
          contactId: null,
          method: "lightning_address",
          phase: finalErrorMint ? "melt" : "invoice_fetch",
        });
        setStatus(`${t("payFailed")}: ${finalErrorMessage}`);
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      cashuBalance,
      canPayWithCashu,
      cashuIsBusy,
      cashuTokensWithMeta,
      contacts,
      formatDisplayedAmountParts,
      insertCashuToken,
      logPaymentEvent,
      markCashuTokenDeleted,
      mintInfoByUrl,
      setCashuIsBusy,
      setContactsOnboardingHasPaid,
      setPostPaySaveContact,
      setStatus,
      showPaidOverlay,
      t,
    ],
  );

  return {
    payLightningAddressWithCashu,
    payLightningInvoiceWithCashu,
  };
};
