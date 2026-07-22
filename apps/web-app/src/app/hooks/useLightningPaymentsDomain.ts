import * as Evolu from "@evolu/common";
import React from "react";
import type { CashuTokenId } from "../../evolu";
import {
  fetchLnurlInvoiceForTarget,
  getLnurlPayDisplayText,
  inferLightningAddressFromLnurlTarget,
  type LnurlPaySuccessAction,
} from "../../lnurlPay";
import { CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY } from "../../utils/constants";
import type { DisplayAmountParts } from "../../utils/displayAmounts";
import {
  getLightningInvoicePreview,
  type LightningInvoicePreview,
} from "../../utils/lightningInvoice";
import { safeLocalStorageSet } from "../../utils/storage";
import { getUnknownErrorMessage } from "../../utils/unknown";
import { resolveCashuRowStoredOwnerLane } from "../lib/cashuOwnerLane";
import {
  createCashuTokenId,
  hasMatchingCashuToken,
  isDeletedCashuRow,
  readCashuTokenAliases,
} from "../lib/cashuTokenIdentity";
import { isCashuTokenAcceptedState } from "../lib/cashuTokenState";
import {
  buildPaymentAmountAttempts,
  buildPaymentFailureAmountAttempts,
  isRetryablePaymentAmountFailure,
} from "../lib/paymentAmountFallback";
import { selectSingleMintCandidateForAmount } from "../lib/paymentMintSelection";
import type {
  CashuTokenRowLike,
  ContactPayRowLike,
  LoggedPaymentEventParams,
  MintUrlInput,
} from "../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../evolu").useEvolu>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readLightningPreimage = (value: unknown): string | null => {
  if (!isRecord(value)) return null;
  if ("paymentPreimage" in value) {
    const preimage = readOptionalString(value.paymentPreimage);
    if (preimage) return preimage;
  }
  if ("preimage" in value) {
    const preimage = readOptionalString(value.preimage);
    if (preimage) return preimage;
  }
  return null;
};

type CashuTokenWithMetaRow = CashuTokenRowLike & { id: CashuTokenId };
type ContactRow = ContactPayRowLike;

const isCashuTokenRowWithId = (
  row: CashuTokenRowLike,
): row is CashuTokenWithMetaRow => {
  return typeof row.id === "string" && row.id.trim().length > 0;
};

export const findAcceptedCashuRowsToDelete = (args: {
  fallbackMintUrl: string;
  normalizeMintUrl: (url: MintUrlInput) => string | null;
  rows: readonly CashuTokenRowLike[];
  tokenTexts: readonly string[];
}): CashuTokenWithMetaRow[] => {
  const usedTokens = new Set(
    args.tokenTexts
      .map((tokenText) => String(tokenText ?? "").trim())
      .filter(Boolean),
  );
  if (usedTokens.size === 0) return [];

  const exactRows: CashuTokenWithMetaRow[] = [];
  for (const row of args.rows) {
    if (!isCashuTokenRowWithId(row)) continue;
    if (isDeletedCashuRow(row)) continue;
    if (!isCashuTokenAcceptedState(row.state)) continue;
    const matchesInput = readCashuTokenAliases(row).some((alias) =>
      usedTokens.has(alias),
    );
    if (matchesInput) exactRows.push(row);
  }

  if (exactRows.length > 0) return exactRows;

  const fallbackMint = args.normalizeMintUrl(args.fallbackMintUrl);
  if (!fallbackMint) return [];

  const fallbackRows: CashuTokenWithMetaRow[] = [];
  for (const row of args.rows) {
    if (!isCashuTokenRowWithId(row)) continue;
    if (isDeletedCashuRow(row)) continue;
    if (!isCashuTokenAcceptedState(row.state)) continue;
    if (args.normalizeMintUrl(row.mint) !== fallbackMint) continue;
    fallbackRows.push(row);
  }

  return fallbackRows;
};

interface UseLightningPaymentsDomainParams {
  buildCashuMintCandidates: (
    mintGroups: Map<string, { tokens: string[]; sum: number }>,
    preferredMint: string | null,
  ) => Array<{ mint: string; sum: number; tokens: string[] }>;
  canPayWithCashu: boolean;
  cashuBalance: number;
  cashuIsBusy: boolean;
  cashuOwnerId: Evolu.OwnerId | null;
  cashuTokensAll: readonly CashuTokenRowLike[];
  cashuTokensWithMeta: CashuTokenWithMetaRow[];
  cashuVisibleOwnerIds: readonly Evolu.OwnerId[];
  contacts: readonly ContactRow[];
  defaultMintUrl: string | null;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  upsert: EvoluMutations["upsert"];
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
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
  cashuTokensAll,
  cashuTokensWithMeta,
  cashuVisibleOwnerIds,
  contacts,
  defaultMintUrl,
  formatDisplayedAmountParts,
  upsert,
  logPaymentEvent,
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
    state: typeof Evolu.NonEmptyString100.Type;
    token: typeof Evolu.NonEmptyString.Type;
    unit: typeof Evolu.NonEmptyString100.Type | null;
  };

  const insertCashuToken = React.useCallback(
    (
      payload: CashuTokenInsertPayload,
      options?: { ignoreAliases?: readonly string[] },
    ) => {
      const ignoredAliases = new Set(
        (options?.ignoreAliases ?? [])
          .map((alias) => String(alias ?? "").trim())
          .filter(Boolean),
      );
      const duplicateRows =
        ignoredAliases.size > 0
          ? cashuTokensAll.filter((row) => {
              return !readCashuTokenAliases(row).some((alias) =>
                ignoredAliases.has(alias),
              );
            })
          : cashuTokensAll;

      if (hasMatchingCashuToken(duplicateRows, payload)) {
        return { ok: true, error: null, skippedDuplicate: true };
      }

      const sparsePayload: {
        id: CashuTokenId;
        state: typeof Evolu.NonEmptyString100.Type;
        token: typeof Evolu.NonEmptyString.Type;
        error?: typeof Evolu.NonEmptyString1000.Type;
      } = {
        id: createCashuTokenId(payload.token),
        token: payload.token,
        state: payload.state,
      };
      if (payload.error) sparsePayload.error = payload.error;

      const result = cashuOwnerId
        ? upsert("cashuToken", sparsePayload, { ownerId: cashuOwnerId })
        : upsert("cashuToken", sparsePayload);

      return {
        ok: result.ok,
        error: result.ok
          ? null
          : getUnknownErrorMessage(result.error, "unknown"),
        skippedDuplicate: false,
      };
    },
    [cashuOwnerId, cashuTokensAll, upsert],
  );

  const markCashuTokenDeleted = React.useCallback(
    (row: CashuTokenWithMetaRow) => {
      const payload = { id: row.id, isDeleted: Evolu.sqliteTrue };
      const ownerCandidates = new Map<string, Evolu.OwnerId>();
      const addOwnerCandidate = (ownerId: Evolu.OwnerId | null) => {
        if (!ownerId) return;
        ownerCandidates.set(String(ownerId), ownerId);
      };

      addOwnerCandidate(resolveCashuRowStoredOwnerLane(row));
      addOwnerCandidate(cashuOwnerId);
      for (const ownerId of cashuVisibleOwnerIds) {
        addOwnerCandidate(ownerId);
      }

      if (ownerCandidates.size === 0) return update("cashuToken", payload);

      let firstError: unknown = null;
      let firstSuccess: ReturnType<EvoluMutations["update"]> | null = null;
      for (const ownerId of ownerCandidates.values()) {
        const result = update("cashuToken", payload, { ownerId });
        if (result.ok) {
          if (!firstSuccess) firstSuccess = result;
          continue;
        }
        if (firstError === null) firstError = result.error;
      }

      if (firstSuccess) return firstSuccess;

      return {
        ok: false,
        error: firstError ?? "cashu token delete failed",
      };
    },
    [cashuOwnerId, cashuVisibleOwnerIds, update],
  );

  const deleteAcceptedCashuTokensByText = React.useCallback(
    (tokenTexts: readonly string[], fallbackMintUrl: string) => {
      const rowsToDelete = findAcceptedCashuRowsToDelete({
        fallbackMintUrl,
        normalizeMintUrl,
        rows: cashuTokensAll,
        tokenTexts,
      });
      if (rowsToDelete.length === 0) {
        throw new Error("No local rows matched spent Cashu token inputs");
      }

      for (const row of rowsToDelete) {
        const deleted = markCashuTokenDeleted(row);
        if (!deleted.ok) throw deleted.error;
      }
    },
    [cashuTokensAll, markCashuTokenDeleted, normalizeMintUrl],
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
        const invoicePreview = getLightningInvoicePreview(normalized);
        const invoiceAmountSat = invoicePreview?.amountSat;

        if (candidates.length === 0) {
          setStatus(t("payInsufficient"));
          return false;
        }

        const selectedCandidate = selectSingleMintCandidateForAmount(
          candidates,
          invoiceAmountSat ?? 0,
        );
        if (!selectedCandidate) {
          setStatus(t("payInsufficient"));
          return false;
        }

        let lastError: unknown = null;
        let lastMint: string | null = null;
        for (const candidate of [selectedCandidate]) {
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
                const inserted = insertCashuToken(
                  {
                    token: recoveryToken as typeof Evolu.NonEmptyString.Type,
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
                  },
                  { ignoreAliases: candidate.tokens },
                );

                if (inserted.ok) {
                  deleteAcceptedCashuTokensByText(
                    candidate.tokens,
                    candidate.mint,
                  );
                }
              }

              lastError = result.error;
              lastMint = candidate.mint;

              logPaymentEvent({
                direction: "out",
                status: "error",
                amount: null,
                details: {
                  ...(result.remainingToken
                    ? { gainedToken: result.remainingToken }
                    : {}),
                  ...(normalized ? { lightningInvoice: normalized } : {}),
                  ...(invoicePreview?.description
                    ? { lightningMemo: invoicePreview.description }
                    : {}),
                  ...(readLightningPreimage(result)
                    ? { lightningPreimage: readLightningPreimage(result) }
                    : {}),
                  usedInputTokens: candidate.tokens,
                },
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

            const localPersistenceErrors: string[] = [];
            try {
              if (result.remainingToken && result.remainingAmount > 0) {
                const inserted = insertCashuToken(
                  {
                    token:
                      result.remainingToken as typeof Evolu.NonEmptyString.Type,
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
                  },
                  { ignoreAliases: candidate.tokens },
                );
                if (!inserted.ok) {
                  localPersistenceErrors.push(
                    `change insert: ${String(inserted.error ?? "unknown")}`,
                  );
                }
              }

              deleteAcceptedCashuTokensByText(candidate.tokens, candidate.mint);
            } catch (e) {
              localPersistenceErrors.push(
                `spent delete: ${getUnknownErrorMessage(e, "unknown")}`,
              );
            }

            logPaymentEvent({
              direction: "out",
              status: "ok",
              amount: result.paidAmount,
              details: {
                ...(result.remainingToken
                  ? { gainedToken: result.remainingToken }
                  : {}),
                ...(normalized ? { lightningInvoice: normalized } : {}),
                ...(invoicePreview?.description
                  ? { lightningMemo: invoicePreview.description }
                  : {}),
                ...(readLightningPreimage(result)
                  ? { lightningPreimage: readLightningPreimage(result) }
                  : {}),
                ...(localPersistenceErrors.length > 0
                  ? { localPersistenceError: localPersistenceErrors.join("; ") }
                  : {}),
                usedInputTokens: candidate.tokens,
              },
              fee: null,
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
          details: {
            ...(normalized ? { lightningInvoice: normalized } : {}),
            ...(invoicePreview?.description
              ? { lightningMemo: invoicePreview.description }
              : {}),
          },
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
      deleteAcceptedCashuTokensByText,
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
      if (!paymentTarget) return false;
      if (!Number.isFinite(amountSat) || amountSat <= 0) {
        setStatus(`${t("errorPrefix")}: ${t("payInvalidAmount")}`);
        return false;
      }
      if (!canPayWithCashu) return false;
      if (cashuIsBusy) return false;
      setCashuIsBusy(true);

      const displayTarget = getLnurlPayDisplayText(paymentTarget);
      let resolvedLightningAddress =
        inferLightningAddressFromLnurlTarget(paymentTarget);

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

        const preferredMint = normalizeMintUrl(defaultMintUrl ?? "");
        const candidates = buildCashuMintCandidates(mintGroups, preferredMint);

        if (candidates.length === 0) {
          setStatus(t("payInsufficient"));
          return false;
        }

        const selectedCandidate = selectSingleMintCandidateForAmount(
          candidates,
          amountSat,
        );
        if (!selectedCandidate) {
          setStatus(t("payInsufficient"));
          return false;
        }

        const amountAttempts = buildPaymentAmountAttempts(
          amountSat,
          selectedCandidate.sum,
        );
        const queuedAmountAttempts = [...amountAttempts];
        const seenAmountAttempts = new Set(queuedAmountAttempts);
        let finalErrorMessage: string | null = null;
        let finalErrorMint: string | null = null;
        let lastAttemptInvoice: string | null = null;
        let lastAttemptInvoicePreview: LightningInvoicePreview | null = null;

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

          let attemptInvoice: string;
          let attemptInvoicePreview: LightningInvoicePreview | null = null;
          let attemptSuccessAction: LnurlPaySuccessAction | null = null;
          try {
            const invoiceResult = await fetchLnurlInvoiceForTarget(
              paymentTarget,
              attemptedAmountSat,
            );
            if (invoiceResult.lightningAddress) {
              resolvedLightningAddress = invoiceResult.lightningAddress;
            }
            attemptInvoice = invoiceResult.pr;
            attemptSuccessAction = invoiceResult.successAction;
            attemptInvoicePreview = getLightningInvoicePreview(attemptInvoice);
            lastAttemptInvoice = attemptInvoice;
            lastAttemptInvoicePreview = attemptInvoicePreview;
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

          let lastError: unknown = null;
          let lastMint: string | null = null;
          let shouldRetryWithLowerAmount = false;

          for (const candidate of [selectedCandidate]) {
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
                  const inserted = insertCashuToken(
                    {
                      token: recoveryToken as typeof Evolu.NonEmptyString.Type,
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
                    },
                    { ignoreAliases: candidate.tokens },
                  );

                  if (inserted.ok) {
                    deleteAcceptedCashuTokensByText(
                      candidate.tokens,
                      candidate.mint,
                    );
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

              const localPersistenceErrors: string[] = [];
              try {
                if (result.remainingToken && result.remainingAmount > 0) {
                  const inserted = insertCashuToken(
                    {
                      token:
                        result.remainingToken as typeof Evolu.NonEmptyString.Type,
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
                    },
                    { ignoreAliases: candidate.tokens },
                  );
                  if (!inserted.ok) {
                    localPersistenceErrors.push(
                      `change insert: ${String(inserted.error ?? "unknown")}`,
                    );
                  }
                }

                deleteAcceptedCashuTokensByText(
                  candidate.tokens,
                  candidate.mint,
                );
              } catch (e) {
                localPersistenceErrors.push(
                  `spent delete: ${getUnknownErrorMessage(e, "unknown")}`,
                );
              }

              const successActionMessage =
                attemptSuccessAction?.tag === "message"
                  ? attemptSuccessAction.message
                  : null;
              const successActionUrl =
                attemptSuccessAction?.tag === "url"
                  ? attemptSuccessAction.url
                  : null;
              const successActionUrlDescription =
                attemptSuccessAction?.tag === "url"
                  ? attemptSuccessAction.description
                  : null;
              const paidLightningAddress = resolvedLightningAddress;
              const knownContact = paidLightningAddress
                ? contacts.find(
                    (contact) =>
                      String(contact.lnAddress ?? "")
                        .trim()
                        .toLowerCase() === paidLightningAddress.toLowerCase(),
                  )
                : null;
              const knownContactId = knownContact?.id ?? null;

              logPaymentEvent({
                direction: "out",
                status: "ok",
                amount: result.paidAmount,
                details: {
                  lightningAddress: paidLightningAddress,
                  ...(result.remainingToken
                    ? { gainedToken: result.remainingToken }
                    : {}),
                  ...(attemptInvoice
                    ? { lightningInvoice: attemptInvoice }
                    : {}),
                  ...(attemptInvoicePreview?.description
                    ? { lightningMemo: attemptInvoicePreview.description }
                    : {}),
                  ...(readLightningPreimage(result)
                    ? { lightningPreimage: readLightningPreimage(result) }
                    : {}),
                  ...(localPersistenceErrors.length > 0
                    ? {
                        localPersistenceError:
                          localPersistenceErrors.join("; "),
                      }
                    : {}),
                  ...(successActionMessage
                    ? { lnurlSuccessMessage: successActionMessage }
                    : {}),
                  ...(successActionUrl
                    ? { lnurlSuccessUrl: successActionUrl }
                    : {}),
                  ...(successActionUrlDescription
                    ? {
                        lnurlSuccessUrlDescription: successActionUrlDescription,
                      }
                    : {}),
                  usedInputTokens: candidate.tokens,
                },
                fee: null,
                mint: result.mint,
                unit: result.unit,
                error: null,
                contactId: knownContactId,
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

              if (successActionMessage) {
                setStatus(
                  t("lnurlSuccessActionMessage").replace(
                    "{message}",
                    successActionMessage,
                  ),
                );
              } else if (successActionUrl) {
                setStatus(
                  t("lnurlSuccessActionUrl")
                    .replace("{description}", successActionUrlDescription ?? "")
                    .replace("{url}", successActionUrl),
                );
              }

              safeLocalStorageSet(
                CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
                "1",
              );
              setContactsOnboardingHasPaid(true);

              if (paidLightningAddress && !knownContact?.id) {
                setPostPaySaveContact({
                  lnAddress: paidLightningAddress,
                  amountSat: result.paidAmount,
                });
              }
              return true;
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
          details: {
            lightningAddress: resolvedLightningAddress,
            ...(lastAttemptInvoice
              ? { lightningInvoice: lastAttemptInvoice }
              : {}),
            ...(lastAttemptInvoicePreview?.description
              ? { lightningMemo: lastAttemptInvoicePreview.description }
              : {}),
          },
          fee: null,
          mint: finalErrorMint,
          unit: "sat",
          error: finalErrorMessage,
          contactId:
            contacts.find(
              (contact) =>
                resolvedLightningAddress !== null &&
                String(contact.lnAddress ?? "")
                  .trim()
                  .toLowerCase() === resolvedLightningAddress.toLowerCase(),
            )?.id ?? null,
          method: "lightning_address",
          phase: finalErrorMint ? "melt" : "invoice_fetch",
        });
        setStatus(`${t("payFailed")}: ${finalErrorMessage}`);
        return false;
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      buildCashuMintCandidates,
      canPayWithCashu,
      cashuIsBusy,
      cashuTokensWithMeta,
      contacts,
      defaultMintUrl,
      formatDisplayedAmountParts,
      insertCashuToken,
      logPaymentEvent,
      deleteAcceptedCashuTokensByText,
      normalizeMintUrl,
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
