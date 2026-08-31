import type { Proof, ProofLike } from "@cashu/cashu-ts";
import * as Evolu from "@evolu/common";
import React from "react";
import { parseCashuToken } from "../../../cashu";
import { acceptCashuToken } from "../../../cashuAccept";
import type { CashuTokenId, CashuTokenRow } from "../../../evolu";
import { navigateTo } from "../../../hooks/useRouting";
import { getCashuDeterministicSeedFromStorage } from "../../../utils/cashuDeterministic";
import { getCashuLib } from "../../../utils/cashuLib";
import {
  dedupeCashuProofs,
  sumCashuProofAmounts,
} from "../../../utils/cashuProofs";
import {
  createLoadedCashuWallet,
  decodeCashuTokenForMint,
} from "../../../utils/cashuWallet";
import { LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY } from "../../../utils/constants";
import { normalizeMintUrl } from "../../../utils/mint";
import {
  safeLocalStorageGet,
  safeLocalStorageSet,
} from "../../../utils/storage";
import {
  CASHU_TOKEN_STATE_ACCEPTED,
  CASHU_TOKEN_STATE_ERROR,
  CASHU_TOKEN_STATE_EXTERNALIZED,
  CASHU_TOKEN_STATE_PENDING,
  isCashuTokenAcceptedState,
  isDefinitiveCashuError,
  isCashuTokenEmittedState,
  isTransientCashuError,
  normalizeCashuTokenState,
} from "../../lib/cashuTokenState";
import { resolveCashuTokenStoredOwnerLaneById } from "../../lib/cashuOwnerLane";
import { checkCashuProofGroupsByState, isCashuProof } from "./cashuProofState";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

type CashuTokenUpdatePayload = Readonly<{
  id: CashuTokenId;
  error?: string | null;
  isDeleted?: number;
  state?: string | null;
  token?: string;
}>;

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
  // Hook-level wallet cache shared by ALL check paths: bulk
  // `checkAllCashuTokensAndDeleteInvalid`, single-token
  // `checkAndRefreshCashuToken`, issued-claim bulk +
  // single-token. `createLoadedCashuWallet` does
  // loadMint() = GET /v1/info + /v1/keysets + /v1/keys/<id> internally;
  // without caching, every retry / interval pays that 3-call tax. Keyed
  // by `${mintUrl}|${unit}`; cleared on hook unmount (logout / shell
  // teardown). Wallets are read-only here (NUT-07 checkstate / metadata
  // for token decode), so sharing across operations is safe.
  type LoadedCashuWallet = Awaited<ReturnType<typeof createLoadedCashuWallet>>;
  const cashuWalletCacheRef = React.useRef<
    Map<string, Promise<LoadedCashuWallet>>
  >(new Map());
  React.useEffect(() => {
    const cache = cashuWalletCacheRef.current;
    return () => {
      cache.clear();
    };
  }, []);
  const loadCachedCashuWallet = React.useCallback(
    async (args: {
      mintUrl: string;
      unit: string;
    }): Promise<LoadedCashuWallet> => {
      const key = `${args.mintUrl}|${args.unit}`;
      const cached = cashuWalletCacheRef.current.get(key);
      if (cached) return await cached;

      const loading = (async () => {
        const { Mint, Wallet } = await getCashuLib();
        const det = getCashuDeterministicSeedFromStorage();
        return await createLoadedCashuWallet({
          Mint,
          Wallet,
          mintUrl: args.mintUrl,
          unit: args.unit,
          ...(det ? { bip39seed: det.bip39seed } : {}),
        });
      })();
      cashuWalletCacheRef.current.set(key, loading);

      try {
        return await loading;
      } catch (error) {
        if (cashuWalletCacheRef.current.get(key) === loading) {
          cashuWalletCacheRef.current.delete(key);
        }
        throw error;
      }
    },
    [],
  );

  const updateCashuToken = React.useCallback(
    function (
      payload: CashuTokenUpdatePayload,
    ): ReturnType<EvoluMutations["update"]> {
      const ownerId = resolveCashuTokenStoredOwnerLaneById(
        cashuTokensAll,
        payload.id,
        appOwnerId,
      );

      return ownerId
        ? update("cashuToken", payload, { ownerId })
        : update("cashuToken", payload);
    },
    [appOwnerId, cashuTokensAll, update],
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
      const result = updateCashuToken({ id, isDeleted: Evolu.sqliteTrue });
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
    [cashuTokensAll, setPendingCashuDeleteId, setStatus, t, updateCashuToken],
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

      const normalizeProofs = (items: ProofLike[]): Proof[] =>
        items.filter(isCashuProof);

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

              if (acceptedTokenText) {
                safeLocalStorageSet(
                  LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
                  acceptedTokenText,
                );
              }

              const result = updateCashuToken({
                id: primaryRow.id,
                token: acceptedTokenText as typeof Evolu.NonEmptyString.Type,
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
              const definitive = isDefinitiveCashuError(e);
              const transient = isTransientCashuError(e);

              if (definitive && !transient) {
                updateCashuToken({
                  id: primaryRow.id,
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

        const { getEncodedToken, getTokenMetadata } = await getCashuLib();

        const tokenMetadata = getTokenMetadata(tokenText);
        const mint = String(tokenMetadata.mint ?? primaryRow.mint ?? "").trim();
        if (!mint) throw new Error("Token mint missing");

        const unit =
          String(tokenMetadata.unit ?? primaryRow.unit ?? "").trim() || "sat";
        const wallet = await loadCachedCashuWallet({ mintUrl: mint, unit });

        const decoded = decodeCashuTokenForMint({
          tokenText,
          mintUrl: mint,
          getTokenMetadata,
          wallet,
        });

        const normalizedMint = normalizeMintUrl(mint);
        const normalizedUnit = String(wallet.unit ?? unit).trim() || "sat";

        // Build per-candidate proof groups so we can ask the mint about each
        // row's proofs separately. Previously this loop flattened all proofs
        // into a single merge — if any token in the merge was spent, the
        // subsequent swap failed with "Token already spent" and the catch
        // handler marked the *primary* row as invalid even when its own
        // proofs were unspent (user could still claim it in another wallet).
        type Candidate = {
          id: CashuTokenId;
          isPrimary: boolean;
          proofs: Proof[];
        };
        const candidates: Candidate[] = [];

        for (const candidate of rows) {
          if (candidate.isDeleted) continue;
          const candidateState = normalizeCashuTokenState(candidate.state);
          if (candidateState === CASHU_TOKEN_STATE_PENDING) continue;

          const candidateIsPrimary = candidate.id === primaryRow.id;

          // After a re-accept the primary row's in-memory `token` is the
          // pre-swap text (its proofs are now spent on the mint). Use the
          // freshly accepted `tokenText` for the primary candidate so we
          // check the live proofs, not the consumed ones.
          const candidateText = candidateIsPrimary
            ? tokenText
            : String(candidate.token ?? candidate.rawToken ?? "").trim();
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
              getTokenMetadata,
              wallet,
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

          const candidateProofs = normalizeProofs(
            Array.isArray(candidateDecoded?.proofs)
              ? candidateDecoded.proofs
              : [],
          );
          if (!candidateProofs.length) continue;

          candidates.push({
            id: candidate.id,
            isPrimary: candidate.id === primaryRow.id,
            proofs: candidateProofs,
          });
        }

        // Fall back to the primary row's own decoded proofs if no candidates
        // matched (e.g. all rows are pending or fail to decode against the
        // active keyset). Mark this synthetic group as the primary so the
        // partition logic still tracks it.
        if (candidates.length === 0) {
          const fallbackProofs = normalizeProofs(
            Array.isArray(decoded?.proofs) ? decoded.proofs : [],
          );
          if (fallbackProofs.length) {
            candidates.push({
              id: primaryRow.id,
              isPrimary: true,
              proofs: fallbackProofs,
            });
          }
        }

        if (candidates.length === 0) {
          throw new Error("Token proofs missing");
        }

        // Bulk state check across all candidate proofs in one round-trip.
        // cashu-ts batches into chunks of 100 internally and re-emits states
        // aligned to input order, so partitioning by group offset is safe.
        const proofStateCheck = await checkCashuProofGroupsByState(
          candidates.map((candidate) => ({
            id: candidate.id,
            proofs: candidate.proofs,
          })),
          async (proofs) => await wallet.checkProofsStates(proofs),
        );

        let liveCandidates: Array<{
          id: CashuTokenId;
          proofs: Proof[];
        }>;

        if (proofStateCheck.status === "ok") {
          const partition = proofStateCheck.partition;

          // Mark every fully-spent row as error individually. Crucially we
          // do NOT mark unrelated rows just because one row in the same
          // mint+unit group is spent.
          for (const id of partition.fullySpentIds) {
            updateCashuToken({
              id,
              state: "error" as typeof Evolu.NonEmptyString100.Type,
              error:
                "Token already spent" as typeof Evolu.NonEmptyString1000.Type,
            });
          }

          // If the primary row is fully spent, surface that to the user and
          // stop — there is nothing to refresh.
          const primaryFullySpent = partition.fullySpentIds.some(
            (id) => id === primaryRow.id,
          );
          if (primaryFullySpent) {
            setStatus(`${t("cashuCheckFailed")}: Token already spent`);
            pushToast(t("cashuInvalid"));
            return "invalid";
          }

          liveCandidates = partition.liveGroups;

          // If no row has any unspent proofs left, the entire group is dead.
          if (liveCandidates.length === 0) {
            setStatus(`${t("cashuCheckFailed")}: Token already spent`);
            pushToast(t("cashuInvalid"));
            return "invalid";
          }
        } else {
          // State check unreachable — verify only the primary row to avoid
          // poisoning it with another row's spent proofs in the swap merge.
          const primary = candidates.find((c) => c.isPrimary);
          liveCandidates = primary
            ? [{ id: primary.id, proofs: primary.proofs }]
            : [{ id: candidates[0].id, proofs: candidates[0].proofs }];
        }

        const mergeIds = liveCandidates.map((candidate) => candidate.id);

        const proofs = dedupeCashuProofs(
          liveCandidates.flatMap((c) => c.proofs),
        );
        if (!proofs.length) throw new Error("Token proofs missing");

        const total = sumCashuProofAmounts(proofs);
        if (!Number.isFinite(total) || total <= 0) {
          throw new Error("Invalid token amount");
        }

        const walletUnit = wallet.unit;

        // Authoritative validity per NUT-07: the bulk checkProofsStates
        // response above is the truth. We do NOT run a NUT-03 swap here —
        // a swap consumes the proofs at the mint and can fail (counter
        // collisions, transient mint errors) for reasons unrelated to
        // token validity, which previously surfaced as "valid token marked
        // spent" in the UI. Verification stops at NUT-07; merge across
        // rows is handled locally by re-encoding the surviving proofs into
        // a single token (no mint round-trip).
        const verifiedToken = getEncodedToken({
          mint,
          proofs,
          unit: walletUnit,
        });
        const persistResult = updateCashuToken({
          id: primaryRow.id,
          token: verifiedToken as typeof Evolu.NonEmptyString.Type,
          state:
            CASHU_TOKEN_STATE_ACCEPTED as typeof Evolu.NonEmptyString100.Type,
          error: null,
        });

        if (!persistResult.ok) {
          throw new Error(String(persistResult.error));
        }

        for (const mergeId of mergeIds) {
          if (mergeId === primaryRow.id) continue;
          updateCashuToken({
            id: mergeId,
            isDeleted: Evolu.sqliteTrue,
          });
        }

        setStatus(null);
        pushToast(t("cashuCheckOk"));
        return "ok";
      } catch (e) {
        const message = String(e).trim() || "Token invalid";
        const definitive = isDefinitiveCashuError(e);
        const transient = isTransientCashuError(e);

        if (definitive && !transient) {
          updateCashuToken({
            id: primaryRow.id,
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
    [
      cashuIsBusy,
      loadCachedCashuWallet,
      pushToast,
      setCashuIsBusy,
      setStatus,
      t,
      updateCashuToken,
    ],
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
        if (row.isDeleted) continue;
        if (isCashuTokenEmittedState(row.state)) continue;
        const id = row.id;

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
        if (!primaryRow) continue;

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
