import * as Evolu from "@evolu/common";
import React from "react";
import type { CashuTokenId } from "../../../evolu";
import { parseCashuToken } from "../../../cashu";
import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "../../../utils/cashuDeterministic";
import { getCashuLib } from "../../../utils/cashuLib";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../../utils/constants";
import { navigateTo } from "../../../hooks/useRouting";
import { normalizeMintUrl } from "../../../utils/mint";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "../../../utils/storage";
import { acceptCashuToken } from "../../../cashuAccept";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface CashuTokenRow {
  amount?: unknown;
  id?: unknown;
  isDeleted?: unknown;
  mint?: unknown;
  rawToken?: unknown;
  state?: unknown;
  token?: unknown;
  unit?: unknown;
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
  const handleDeleteCashuToken = React.useCallback(
    (
      id: CashuTokenId,
      options?: { navigate?: boolean; setStatus?: boolean },
    ) => {
      const { navigate = true, setStatus: setStatusEnabled = true } =
        options ?? {};
      const row = cashuTokensAll.find(
        (tkn) => String(tkn?.id ?? "") === String(id as unknown as string),
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

  const checkAndRefreshCashuToken = React.useCallback(
    async (
      id: CashuTokenId,
    ): Promise<"ok" | "invalid" | "transient" | "skipped"> => {
      const row = cashuTokensAll.find(
        (tkn) =>
          String(tkn?.id ?? "") === String(id as unknown as string) &&
          !tkn?.isDeleted,
      );

      if (!row) {
        pushToast(t("errorPrefix"));
        return "skipped";
      }

      const state = String((row as { state?: unknown }).state ?? "").trim();
      const storedTokenText = String(row.token ?? "").trim();
      const rawTokenText = String(row.rawToken ?? "").trim();
      const tokenText = storedTokenText || rawTokenText;
      if (!tokenText) {
        pushToast(t("errorPrefix"));
        return "skipped";
      }

      if (cashuIsBusy) return "skipped";
      setCashuIsBusy(true);
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

      try {
        if (state && state !== "accepted") {
          if (state === "pending") {
            return "skipped";
          }

          if (state === "error" && rawTokenText) {
            try {
              const accepted = await acceptCashuToken(rawTokenText);
              const result = update("cashuToken", {
                id: row.id as CashuTokenId,
                token: accepted.token as typeof Evolu.NonEmptyString.Type,
                rawToken: rawTokenText
                  ? (rawTokenText as typeof Evolu.NonEmptyString.Type)
                  : null,
                mint: accepted.mint as typeof Evolu.NonEmptyString1000.Type,
                unit: accepted.unit
                  ? (accepted.unit as typeof Evolu.NonEmptyString100.Type)
                  : null,
                amount:
                  accepted.amount > 0
                    ? (accepted.amount as typeof Evolu.PositiveInt.Type)
                    : null,
                state: "accepted" as typeof Evolu.NonEmptyString100.Type,
                error: null,
              });

              if (!result.ok) {
                throw new Error(String(result.error));
              }

              setStatus(t("cashuCheckOk"));
              pushToast(t("cashuCheckOk"));
              return "ok";
            } catch (e) {
              const message = String(e).trim() || "Token invalid";
              const definitive = looksLikeDefinitiveInvalid(message);
              const transient = looksLikeTransientError(message);

              if (definitive && !transient) {
                update("cashuToken", {
                  id: row.id as CashuTokenId,
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

          return "skipped";
        }

        const { CashuMint, CashuWallet, getDecodedToken, getEncodedToken } =
          await getCashuLib();

        const decoded = getDecodedToken(tokenText);
        const mint = String(decoded?.mint ?? row.mint ?? "").trim();
        if (!mint) throw new Error("Token mint missing");

        const unit = String(decoded?.unit ?? row.unit ?? "").trim() || "sat";
        const normalizedMint = normalizeMintUrl(mint);
        const normalizedUnit = String(unit ?? "").trim() || "sat";
        const mergedProofs: Array<{
          C?: unknown;
          amount?: unknown;
          id?: unknown;
          secret?: unknown;
        }> = [];
        const mergeIds: CashuTokenId[] = [];

        for (const candidate of cashuTokensAll) {
          const c = candidate as {
            id?: unknown;
            isDeleted?: unknown;
            mint?: unknown;
            rawToken?: unknown;
            state?: unknown;
            token?: unknown;
            unit?: unknown;
          };
          if (c.isDeleted) continue;
          if (String(c.state ?? "").trim() !== "accepted") continue;

          const candidateText = String(c.token ?? c.rawToken ?? "").trim();
          if (!candidateText) continue;

          let candidateDecoded: {
            mint?: string;
            proofs?: Array<{
              C?: unknown;
              amount?: unknown;
              id?: unknown;
              secret?: unknown;
            }>;
            unit?: string;
          } | null = null;
          try {
            candidateDecoded = getDecodedToken(candidateText);
          } catch {
            continue;
          }

          const candidateMint = String(
            candidateDecoded?.mint ?? c.mint ?? "",
          ).trim();
          if (!candidateMint) continue;
          if (normalizeMintUrl(candidateMint) !== normalizedMint) continue;

          const candidateUnit =
            String(candidateDecoded?.unit ?? c.unit ?? "").trim() || "sat";
          if (candidateUnit !== normalizedUnit) continue;

          const candidateProofs = Array.isArray(candidateDecoded?.proofs)
            ? candidateDecoded.proofs
            : [];
          if (!candidateProofs.length) continue;

          mergedProofs.push(...candidateProofs);
          if (c.id) mergeIds.push(c.id as CashuTokenId);
        }

        const normalizeProofs = (
          items: unknown[],
        ): Array<{ C: string; amount: number; id: string; secret: string }> =>
          items.filter(
            (
              p,
            ): p is { C: string; amount: number; id: string; secret: string } =>
              !!p &&
              typeof (p as { amount?: unknown }).amount === "number" &&
              typeof (p as { secret?: unknown }).secret === "string" &&
              typeof (p as { C?: unknown }).C === "string" &&
              typeof (p as { id?: unknown }).id === "string",
          );

        const proofs = normalizeProofs(
          mergedProofs.length
            ? mergedProofs
            : Array.isArray(decoded?.proofs)
              ? decoded.proofs
              : [],
        );
        if (!proofs.length) throw new Error("Token proofs missing");

        const total = proofs.reduce(
          (sum: number, p: { amount?: unknown }) =>
            sum + (Number(p?.amount ?? 0) || 0),
          0,
        );
        if (!Number.isFinite(total) || total <= 0) {
          throw new Error("Invalid token amount");
        }

        const det = getCashuDeterministicSeedFromStorage();
        const wallet = new CashuWallet(new CashuMint(mint), {
          ...(unit ? { unit } : {}),
          ...(det ? { bip39seed: det.bip39seed } : {}),
        });
        await wallet.loadMint();

        const walletUnit = wallet.unit;
        const keysetId = wallet.keysetId;
        const getSwapFeeForProofs = (): number | null => {
          const fn = (wallet as unknown as { getFeesForProofs?: unknown })
            .getFeesForProofs;
          if (typeof fn !== "function") return null;
          try {
            const fee = Number((fn as (p: unknown[]) => unknown)(proofs));
            return Number.isFinite(fee) && fee > 0 ? fee : null;
          } catch {
            return null;
          }
        };
        const parseSwapFee = (error: unknown): number | null => {
          const message = String(error ?? "");
          const feeMatch = message.match(/fee\s*:\s*(\d+)/i);
          if (!feeMatch) return null;
          const fee = Number(feeMatch[1]);
          return Number.isFinite(fee) && fee > 0 ? fee : null;
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

        let swapped: { keep?: unknown[]; send?: unknown[] };
        const initialFee = getSwapFeeForProofs();
        const applyLocalMerge = (): boolean => {
          if (mergeIds.length <= 1) return false;
          const mergedToken = getEncodedToken({
            mint,
            proofs,
            unit: walletUnit,
          });
          const result = update("cashuToken", {
            id: row.id as CashuTokenId,
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
            state: "accepted" as typeof Evolu.NonEmptyString100.Type,
            error: null,
          });

          if (!result.ok) {
            throw new Error(String(result.error));
          }

          for (const id of mergeIds) {
            if (String(id) === String(row.id ?? "")) continue;
            update("cashuToken", {
              id,
              isDeleted: Evolu.sqliteTrue,
            });
          }
          return true;
        };

        if (initialFee && total - initialFee <= 0) {
          // Token is too small to pay swap fees; merge locally if possible.
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
        try {
          swapped = (await runSwap(initialAmount)) as {
            keep?: unknown[];
            send?: unknown[];
          };
        } catch (error) {
          const message = String(error ?? "").toLowerCase();
          if (message.includes("not enough funds available for swap")) {
            // Fee/mint constraints: try local merge instead of failing.
            if (applyLocalMerge()) {
              setStatus(t("cashuCheckOk"));
              pushToast(t("cashuCheckOk"));
              return "ok";
            }
            setStatus(t("cashuCheckOk"));
            pushToast(t("cashuCheckOk"));
            return "ok";
          }
          const fee = parseSwapFee(error) ?? getSwapFeeForProofs();
          const retryAmount = fee && total - fee > 0 ? total - fee : null;
          if (!retryAmount || retryAmount === initialAmount) throw error;
          swapped = (await runSwap(retryAmount)) as {
            keep?: unknown[];
            send?: unknown[];
          };
        }
        const newProofs = [
          ...((swapped?.keep as unknown as unknown[]) ?? []),
          ...((swapped?.send as unknown as unknown[]) ?? []),
        ] as Array<{ C: string; amount: number; id: string; secret: string }>;

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

        const result = update("cashuToken", {
          id: row.id as CashuTokenId,
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
          state: "accepted" as typeof Evolu.NonEmptyString100.Type,
          error: null,
        });

        if (!result.ok) {
          throw new Error(String(result.error));
        }

        if (mergeIds.length > 0) {
          for (const id of mergeIds) {
            if (String(id) === String(row.id ?? "")) continue;
            update("cashuToken", {
              id,
              isDeleted: Evolu.sqliteTrue,
            });
          }
        }

        setStatus(t("cashuCheckOk"));
        pushToast(t("cashuCheckOk"));
        return "ok";
      } catch (e) {
        const message = String(e).trim() || "Token invalid";
        const definitive = looksLikeDefinitiveInvalid(message);
        const transient = looksLikeTransientError(message);

        if (definitive && !transient) {
          update("cashuToken", {
            id: row.id as CashuTokenId,
            state: "error" as typeof Evolu.NonEmptyString100.Type,
            error: message.slice(
              0,
              1000,
            ) as typeof Evolu.NonEmptyString1000.Type,
          });
          setStatus(`${t("cashuCheckFailed")}: ${message}`);
          pushToast(t("cashuInvalid"));
          return "invalid";
        } else {
          // Don't mark token invalid on transient mint/network issues.
          setStatus(`${t("cashuCheckFailed")}: ${message}`);
          pushToast(`${t("cashuCheckFailed")}: ${message}`);
          return "transient";
        }
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      cashuIsBusy,
      cashuTokensAll,
      pushToast,
      setCashuIsBusy,
      setStatus,
      t,
      update,
    ],
  );

  const checkAllCashuTokensAndDeleteInvalid = React.useCallback(async () => {
    if (cashuBulkCheckIsBusy) return;
    setCashuBulkCheckIsBusy(true);
    try {
      const processedKeys = new Set<string>();
      for (const row of cashuTokensAll) {
        if (row?.isDeleted) continue;
        const id = row?.id as CashuTokenId | undefined;
        if (!id) continue;

        const tokenText = String(row.token ?? row.rawToken ?? "").trim();
        const parsed = tokenText ? parseCashuToken(tokenText) : null;
        const mintRaw = String(row.mint ?? parsed?.mint ?? "").trim();
        const mintKey = mintRaw ? normalizeMintUrl(mintRaw) : "";
        const unitKey = String(row.unit ?? "").trim() || "sat";
        const groupKey = mintKey ? `${mintKey}|${unitKey}` : `id:${String(id)}`;

        if (processedKeys.has(groupKey)) continue;
        processedKeys.add(groupKey);

        const result = await checkAndRefreshCashuToken(id);
        if (result === "invalid") {
          handleDeleteCashuToken(id, { navigate: false, setStatus: false });
        }
      }
    } finally {
      setCashuBulkCheckIsBusy(false);
    }
  }, [
    cashuBulkCheckIsBusy,
    cashuTokensAll,
    checkAndRefreshCashuToken,
    handleDeleteCashuToken,
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
