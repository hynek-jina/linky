import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../../cashu";
import { acceptCashuToken } from "../../../cashuAccept";
import type { CashuTokenId } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "../../../utils/cashuDeterministic";
import { getCashuLib } from "../../../utils/cashuLib";
import {
  createLoadedCashuWallet,
  decodeCashuTokenForMint,
} from "../../../utils/cashuWallet";
import { dedupeCashuProofs } from "../../../utils/cashuProofs";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../../utils/constants";
import { normalizeMintUrl } from "../../../utils/mint";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { buildPaymentFailureAmountAttempts } from "../../lib/paymentAmountFallback";
import {
  CASHU_TOKEN_STATE_ACCEPTED,
  CASHU_TOKEN_STATE_ERROR,
  CASHU_TOKEN_STATE_EXTERNALIZED,
  CASHU_TOKEN_STATE_PENDING,
  isCashuTokenAcceptedState,
  isCashuTokenEmittedState,
  normalizeCashuTokenState,
} from "../../lib/cashuTokenState";
import type { CashuTokenRowLike } from "../../types/appTypes";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

type CashuTokenRow = CashuTokenRowLike & { id?: CashuTokenId | string | null };
type CashuTokenUpdatePayload = Readonly<{
  id: CashuTokenId;
  amount?: number | null;
  error?: string | null;
  isDeleted?: number;
  mint?: string | null;
  rawToken?: string | null;
  state?: string | null;
  token?: string;
  unit?: string | null;
}>;

interface ProofLike {
  C?: string;
  amount?: number;
  id?: string;
  secret?: string;
}

interface UseCashuTokenChecksParams {
  appOwnerId: Evolu.OwnerId | null;
  cashuBulkCheckIsBusy: boolean;
  cashuIsBusy: boolean;
  cashuTokensAll: readonly CashuTokenRow[];
  pendingCashuDeleteId: CashuTokenId | null;
  pushToast: (message: string) => void;
  setCashuBulkCheckIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingCashuDeleteId: React.Dispatch<
    React.SetStateAction<CashuTokenId | null>
  >;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  update: EvoluMutations["update"];
}

export const useCashuTokenChecks = ({
  appOwnerId,
  cashuBulkCheckIsBusy,
  cashuIsBusy,
  cashuTokensAll,
  pendingCashuDeleteId,
  pushToast,
  setCashuBulkCheckIsBusy,
  setCashuIsBusy,
  setPendingCashuDeleteId,
  setStatus,
  t,
  update,
}: UseCashuTokenChecksParams) => {
  const updateCashuToken = React.useCallback(
    function (
      payload: CashuTokenUpdatePayload,
    ): ReturnType<EvoluMutations["update"]> {
      if (!appOwnerId) return update("cashuToken", payload);

      const scoped = update("cashuToken", payload, { ownerId: appOwnerId });
      if (scoped.ok) return scoped;

      return update("cashuToken", payload);
    },
    [appOwnerId, update],
  );

  const handleDeleteCashuToken = React.useCallback(
    (
      id: CashuTokenId,
      options?: { navigate?: boolean; setStatus?: boolean },
    ) => {
      const { navigate = true, setStatus: setStatusEnabled = true } =
        options ?? {};
      const row = cashuTokensAll.find(
        (tkn) => String(tkn?.id ?? "") === String(id),
      );
      const result = appOwnerId
        ? update(
            "cashuToken",
            { id, isDeleted: Evolu.sqliteTrue },
            { ownerId: appOwnerId },
          )
        : update("cashuToken", { id, isDeleted: Evolu.sqliteTrue });
      if (result.ok) {
        const token = String(row?.token ?? "").trim();
        const rawToken = String(row?.rawToken ?? "").trim();
        if (token || rawToken) {
          const remembered = String(
            safeLocalStorageGet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY) ?? "",
          ).trim();
          if (remembered && (remembered === token || remembered === rawToken)) {
            safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
          }
        }
        if (setStatusEnabled) {
          setStatus(t("cashuDeleted"));
        }
        setPendingCashuDeleteId(null);
        if (navigate) {
          navigateTo({ route: "wallet" });
        }
        return;
      }
      if (setStatusEnabled) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    },
    [appOwnerId, cashuTokensAll, setPendingCashuDeleteId, setStatus, t, update],
  );

  const refreshCashuTokenGroup = React.useCallback(
    async (args: {
      primaryRow: CashuTokenRow;
      rows: readonly CashuTokenRow[];
      manageBusy: boolean;
    }): Promise<"ok" | "invalid" | "transient" | "skipped"> => {
      const { primaryRow, rows, manageBusy } = args;

      const state = normalizeCashuTokenState(primaryRow.state);
      const storedTokenText = String(primaryRow.token ?? "").trim();
      const rawTokenText = String(primaryRow.rawToken ?? "").trim();
      const initialTokenText = storedTokenText || rawTokenText;
      if (!initialTokenText) {
        pushToast(t("errorPrefix"));
        return "skipped";
      }

      if (manageBusy) {
        if (cashuIsBusy) return "skipped";
        setCashuIsBusy(true);
      }
      setStatus(t("cashuChecking"));

      const looksLikeTransientError = (message: string) => {
        const m = message.toLowerCase();
        return (
          m.includes("failed to fetch") ||
          m.includes("networkerror") ||
          m.includes("network error") ||
          m.includes("timeout") ||
          m.includes("timed out") ||
          m.includes("econn") ||
          m.includes("enotfound") ||
          m.includes("dns") ||
          m.includes("offline") ||
          m.includes("503") ||
          m.includes("502") ||
          m.includes("504")
        );
      };

      const looksLikeDefinitiveInvalid = (message: string) => {
        const m = message.toLowerCase();
        return (
          m.includes("spent") ||
          m.includes("already spent") ||
          m.includes("not enough funds") ||
          m.includes("insufficient funds") ||
          m.includes("invalid proof") ||
          m.includes("invalid proofs") ||
          m.includes("token proofs missing") ||
          m.includes("invalid token")
        );
      };

      const normalizeProofs = (
        items: ProofLike[],
      ): Array<{ C: string; amount: number; id: string; secret: string }> =>
        items.filter(
          (p): p is { C: string; amount: number; id: string; secret: string } =>
            !!p &&
            typeof (p as { amount?: unknown }).amount === "number" &&
            typeof (p as { secret?: unknown }).secret === "string" &&
            typeof (p as { C?: unknown }).C === "string" &&
            typeof (p as { id?: unknown }).id === "string",
        );

      try {
        let tokenText = initialTokenText;
        let effectiveState = state;

        if (state && state !== CASHU_TOKEN_STATE_ACCEPTED) {
          if (state === CASHU_TOKEN_STATE_PENDING) {
            return "skipped";
          }

          if (
            (state === CASHU_TOKEN_STATE_ERROR ||
              state === CASHU_TOKEN_STATE_EXTERNALIZED) &&
            tokenText
          ) {
            try {
              const accepted = await acceptCashuToken(tokenText);
              const acceptedTokenText = String(accepted.token ?? "").trim();
              const result = updateCashuToken({
                id: primaryRow.id as CashuTokenId,
                token: acceptedTokenText as typeof Evolu.NonEmptyString.Type,
                rawToken: tokenText
                  ? (tokenText as typeof Evolu.NonEmptyString.Type)
                  : null,
                mint: accepted.mint as typeof Evolu.NonEmptyString1000.Type,
                unit: accepted.unit
                  ? (accepted.unit as typeof Evolu.NonEmptyString100.Type)
                  : null,
                amount:
                  accepted.amount > 0
                    ? (accepted.amount as typeof Evolu.PositiveInt.Type)
                    : null,
                state:
                  CASHU_TOKEN_STATE_ACCEPTED as typeof Evolu.NonEmptyString100.Type,
                error: null,
              });

              if (!result.ok) {
                throw new Error(String(result.error));
              }
              tokenText = acceptedTokenText;
              effectiveState = CASHU_TOKEN_STATE_ACCEPTED;
            } catch (e) {
              const message = String(e).trim() || "Token invalid";
              const definitive = looksLikeDefinitiveInvalid(message);
              const transient = looksLikeTransientError(message);

              if (definitive && !transient) {
                updateCashuToken({
                  id: primaryRow.id as CashuTokenId,
                  state: "error" as typeof Evolu.NonEmptyString100.Type,
                  error: message.slice(
                    0,
                    1000,
                  ) as typeof Evolu.NonEmptyString1000.Type,
                });
                setStatus(`${t("cashuCheckFailed")}: ${message}`);
                pushToast(t("cashuInvalid"));
                return "invalid";
              }

              setStatus(`${t("cashuCheckFailed")}: ${message}`);
              pushToast(`${t("cashuCheckFailed")}: ${message}`);
              return "transient";
            }
          }
          if (effectiveState !== CASHU_TOKEN_STATE_ACCEPTED) {
            return "skipped";
          }
        }

        const {
          CashuMint,
          CashuWallet,
          getDecodedToken,
          getEncodedToken,
          getTokenMetadata,
        } = await getCashuLib();

        const tokenMetadata = getTokenMetadata(tokenText);
        const mint = String(tokenMetadata.mint ?? primaryRow.mint ?? "").trim();
        if (!mint) throw new Error("Token mint missing");

        const unit =
          String(tokenMetadata.unit ?? primaryRow.unit ?? "").trim() || "sat";
        const det = getCashuDeterministicSeedFromStorage();
        const wallet = await createLoadedCashuWallet({
          CashuMint,
          CashuWallet,
          mintUrl: mint,
          ...(unit ? { unit } : {}),
          ...(det ? { bip39seed: det.bip39seed } : {}),
        });

        const decoded = decodeCashuTokenForMint({
          tokenText,
          mintUrl: mint,
          keysets: wallet.keysets,
          getDecodedToken,
          getTokenMetadata,
        });

        const normalizedMint = normalizeMintUrl(mint);
        const normalizedUnit = String(wallet.unit ?? unit).trim() || "sat";
        const mergedProofs: ProofLike[] = [];
        const mergeIds: CashuTokenId[] = [];

        for (const candidate of rows) {
          if (candidate.isDeleted) continue;
          const candidateState = normalizeCashuTokenState(candidate.state);
          if (candidateState === CASHU_TOKEN_STATE_PENDING) continue;

          const candidateText = String(
            candidate.token ?? candidate.rawToken ?? "",
          ).trim();
          if (!candidateText) continue;

          let candidateDecoded: {
            mint?: string;
            proofs?: ProofLike[];
            unit?: string;
          } | null = null;
          try {
            candidateDecoded = decodeCashuTokenForMint({
              tokenText: candidateText,
              mintUrl: mint,
              keysets: wallet.keysets,
              getDecodedToken,
              getTokenMetadata,
            });
          } catch {
            continue;
          }

          const candidateMint = String(
            candidateDecoded?.mint ?? candidate.mint ?? "",
          ).trim();
          if (!candidateMint) continue;
          if (normalizeMintUrl(candidateMint) !== normalizedMint) continue;

          const candidateUnit =
            String(candidateDecoded?.unit ?? candidate.unit ?? "").trim() ||
            "sat";
          if (candidateUnit !== normalizedUnit) continue;

          const candidateProofs = Array.isArray(candidateDecoded?.proofs)
            ? candidateDecoded.proofs
            : [];
          if (!candidateProofs.length) continue;

          mergedProofs.push(...candidateProofs);
          if (candidate.id) mergeIds.push(candidate.id as CashuTokenId);
        }

        const proofs = dedupeCashuProofs(
          normalizeProofs(
            mergedProofs.length
              ? mergedProofs
              : Array.isArray(decoded?.proofs)
                ? (decoded.proofs as ProofLike[])
                : [],
          ),
        );
        if (!proofs.length) throw new Error("Token proofs missing");

        const total = proofs.reduce(
          (sum: number, p: { amount?: number }) =>
            sum + (Number(p?.amount ?? 0) || 0),
          0,
        );
        if (!Number.isFinite(total) || total <= 0) {
          throw new Error("Invalid token amount");
        }

        const walletUnit = wallet.unit;
        const keysetId = wallet.keysetId;
        const getSwapFeeForProofs = (): number | null => {
          const fn = (
            wallet as {
              getFeesForProofs?: (
                proofs: Array<{
                  C: string;
                  amount: number;
                  id: string;
                  secret: string;
                }>,
              ) => number | null | undefined;
            }
          ).getFeesForProofs;
          if (typeof fn !== "function") return null;
          try {
            const fee = Number(fn(proofs));
            return Number.isFinite(fee) && fee > 0 ? fee : null;
          } catch {
            return null;
          }
        };
        const runSwap = async (amountToSend: number) => {
          return det
            ? withCashuDeterministicCounterLock(
                { mintUrl: mint, unit: walletUnit, keysetId },
                async () => {
                  const counter = getCashuDeterministicCounter({
                    mintUrl: mint,
                    unit: walletUnit,
                    keysetId,
                  });

                  const swapped = await wallet.swap(
                    amountToSend,
                    proofs,
                    typeof counter === "number" ? { counter } : undefined,
                  );

                  const keepLen = Array.isArray(swapped.keep)
                    ? swapped.keep.length
                    : 0;
                  const sendLen = Array.isArray(swapped.send)
                    ? swapped.send.length
                    : 0;
                  bumpCashuDeterministicCounter({
                    mintUrl: mint,
                    unit: walletUnit,
                    keysetId,
                    used: keepLen + sendLen,
                  });

                  return swapped;
                },
              )
            : wallet.swap(amountToSend, proofs);
        };

        const applyLocalMerge = (): boolean => {
          if (mergeIds.length <= 1) return false;
          const mergedToken = getEncodedToken({
            mint,
            proofs,
            unit: walletUnit,
          });
          const result = updateCashuToken({
            id: primaryRow.id as CashuTokenId,
            token: mergedToken as typeof Evolu.NonEmptyString.Type,
            rawToken: null,
            mint: mint ? (mint as typeof Evolu.NonEmptyString1000.Type) : null,
            unit: walletUnit
              ? (walletUnit as typeof Evolu.NonEmptyString100.Type)
              : null,
            amount:
              total > 0
                ? (Math.floor(total) as typeof Evolu.PositiveInt.Type)
                : null,
            state:
              CASHU_TOKEN_STATE_ACCEPTED as typeof Evolu.NonEmptyString100.Type,
            error: null,
          });

          if (!result.ok) {
            throw new Error(String(result.error));
          }

          for (const mergeId of mergeIds) {
            if (String(mergeId) === String(primaryRow.id ?? "")) continue;
            updateCashuToken({
              id: mergeId,
              isDeleted: Evolu.sqliteTrue,
            });
          }
          return true;
        };

        const initialFee = getSwapFeeForProofs();
        if (initialFee && total - initialFee <= 0) {
          if (applyLocalMerge()) {
            setStatus(t("cashuCheckOk"));
            pushToast(t("cashuCheckOk"));
            return "ok";
          }
          setStatus(t("cashuCheckOk"));
          pushToast(t("cashuCheckOk"));
          return "ok";
        }

        const initialAmount =
          initialFee && total - initialFee > 0 ? total - initialFee : total;
        const amountAttempts = [
          initialAmount,
          ...buildPaymentFailureAmountAttempts(
            initialAmount,
            initialFee ? `fee: ${initialFee}` : "",
          ),
        ];
        let swapped: { keep?: ProofLike[]; send?: ProofLike[] } | null = null;
        let swapFailure: unknown = null;
        for (const amountAttempt of amountAttempts) {
          try {
            swapped = (await runSwap(amountAttempt)) as {
              keep?: ProofLike[];
              send?: ProofLike[];
            };
            swapFailure = null;
            break;
          } catch (error) {
            swapFailure = error;
            const message = getUnknownErrorMessage(error, "").toLowerCase();
            if (message.includes("not enough funds available for swap")) {
              if (applyLocalMerge()) {
                setStatus(t("cashuCheckOk"));
                pushToast(t("cashuCheckOk"));
                return "ok";
              }
              setStatus(t("cashuCheckOk"));
              pushToast(t("cashuCheckOk"));
              return "ok";
            }

            const retryAttempts = buildPaymentFailureAmountAttempts(
              amountAttempt,
              getUnknownErrorMessage(error, ""),
            );
            let appendedRetry = false;
            for (const retryAmount of retryAttempts) {
              if (amountAttempts.includes(retryAmount)) continue;
              amountAttempts.push(retryAmount);
              appendedRetry = true;
            }
            if (appendedRetry) continue;
          }
        }
        if (!swapped) {
          throw swapFailure ?? new Error("Swap produced empty token");
        }

        const newProofs = normalizeProofs([
          ...(swapped?.keep ?? []),
          ...(swapped?.send ?? []),
        ]);
        const newTotal = newProofs.reduce(
          (sum, p) => sum + (Number(p?.amount ?? 0) || 0),
          0,
        );
        if (!Number.isFinite(newTotal) || newTotal <= 0) {
          throw new Error("Swap produced empty token");
        }

        const refreshedToken = getEncodedToken({
          mint,
          proofs: newProofs,
          unit: walletUnit,
        });
        const result = updateCashuToken({
          id: primaryRow.id as CashuTokenId,
          token: refreshedToken as typeof Evolu.NonEmptyString.Type,
          rawToken: null,
          mint: mint ? (mint as typeof Evolu.NonEmptyString1000.Type) : null,
          unit: walletUnit
            ? (walletUnit as typeof Evolu.NonEmptyString100.Type)
            : null,
          amount:
            newTotal > 0
              ? (Math.floor(newTotal) as typeof Evolu.PositiveInt.Type)
              : null,
          state:
            CASHU_TOKEN_STATE_ACCEPTED as typeof Evolu.NonEmptyString100.Type,
          error: null,
        });

        if (!result.ok) {
          throw new Error(String(result.error));
        }

        for (const mergeId of mergeIds) {
          if (String(mergeId) === String(primaryRow.id ?? "")) continue;
          updateCashuToken({
            id: mergeId,
            isDeleted: Evolu.sqliteTrue,
          });
        }

        setStatus(t("cashuCheckOk"));
        pushToast(t("cashuCheckOk"));
        return "ok";
      } catch (e) {
        const message = String(e).trim() || "Token invalid";
        const definitive = looksLikeDefinitiveInvalid(message);
        const transient = looksLikeTransientError(message);

        if (definitive && !transient) {
          updateCashuToken({
            id: primaryRow.id as CashuTokenId,
            state: "error" as typeof Evolu.NonEmptyString100.Type,
            error: message.slice(
              0,
              1000,
            ) as typeof Evolu.NonEmptyString1000.Type,
          });
          setStatus(`${t("cashuCheckFailed")}: ${message}`);
          pushToast(t("cashuInvalid"));
          return "invalid";
        }

        setStatus(`${t("cashuCheckFailed")}: ${message}`);
        pushToast(`${t("cashuCheckFailed")}: ${message}`);
        return "transient";
      } finally {
        if (manageBusy) {
          setCashuIsBusy(false);
        }
      }
    },
    [cashuIsBusy, pushToast, setCashuIsBusy, setStatus, t, updateCashuToken],
  );

  const checkAndRefreshCashuToken = React.useCallback(
    async (
      id: CashuTokenId,
    ): Promise<"ok" | "invalid" | "transient" | "skipped"> => {
      const row = cashuTokensAll.find(
        (tkn) => String(tkn?.id ?? "") === String(id) && !tkn?.isDeleted,
      );

      if (!row) {
        pushToast(t("errorPrefix"));
        return "skipped";
      }

      return await refreshCashuTokenGroup({
        primaryRow: row,
        rows: cashuTokensAll,
        manageBusy: true,
      });
    },
    [cashuTokensAll, pushToast, refreshCashuTokenGroup, t],
  );

  const checkAllCashuTokensAndDeleteInvalid = React.useCallback(async () => {
    if (cashuBulkCheckIsBusy) return;
    if (cashuIsBusy) return;
    setCashuBulkCheckIsBusy(true);
    setCashuIsBusy(true);
    try {
      const groups = new Map<string, CashuTokenRow[]>();
      for (const row of cashuTokensAll) {
        if (row?.isDeleted) continue;
        if (isCashuTokenEmittedState(row?.state)) continue;
        const id = row?.id as CashuTokenId | undefined;
        if (!id) continue;

        const tokenText = String(row.token ?? row.rawToken ?? "").trim();
        const parsed = tokenText ? parseCashuToken(tokenText) : null;
        const mintRaw = String(row.mint ?? parsed?.mint ?? "").trim();
        const mintKey = mintRaw ? normalizeMintUrl(mintRaw) : "";
        const unitKey = String(row.unit ?? "").trim() || "sat";
        const groupKey = mintKey ? `${mintKey}|${unitKey}` : `id:${String(id)}`;
        const entry = groups.get(groupKey) ?? [];
        entry.push(row);
        groups.set(groupKey, entry);
      }

      for (const rows of groups.values()) {
        const orderedRows = [...rows].sort((leftRow, rightRow) => {
          const leftAccepted = isCashuTokenAcceptedState(leftRow?.state);
          const rightAccepted = isCashuTokenAcceptedState(rightRow?.state);
          if (leftAccepted !== rightAccepted) return leftAccepted ? -1 : 1;
          return 0;
        });
        const primaryRow = orderedRows[0];
        if (!primaryRow?.id) continue;

        await refreshCashuTokenGroup({
          primaryRow,
          rows,
          manageBusy: false,
        });
      }
    } finally {
      setCashuIsBusy(false);
      setCashuBulkCheckIsBusy(false);
    }
  }, [
    cashuBulkCheckIsBusy,
    cashuIsBusy,
    cashuTokensAll,
    refreshCashuTokenGroup,
    setCashuIsBusy,
    setCashuBulkCheckIsBusy,
  ]);

  const requestDeleteCashuToken = React.useCallback(
    (id: CashuTokenId) => {
      if (pendingCashuDeleteId === id) {
        handleDeleteCashuToken(id);
        return;
      }
      setPendingCashuDeleteId(id);
      setStatus(t("deleteArmedHint"));
    },
    [
      handleDeleteCashuToken,
      pendingCashuDeleteId,
      setPendingCashuDeleteId,
      setStatus,
      t,
    ],
  );

  return {
    checkAllCashuTokensAndDeleteInvalid,
    checkAndRefreshCashuToken,
    requestDeleteCashuToken,
  };
};
