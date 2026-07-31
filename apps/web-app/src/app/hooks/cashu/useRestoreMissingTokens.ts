import type { Proof as CashuProof } from "@cashu/cashu-ts";
import type * as Evolu from "@evolu/common";
import React from "react";
import {
  ensureCashuDeterministicCounterAtLeast,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  getCashuRestoreCursor,
  setCashuRestoreCursor,
} from "../../../utils/cashuDeterministic";
import {
  createLoadedCashuWallet,
  decodeCashuTokenForMint,
} from "../../../utils/cashuWallet";
import { sumCashuProofAmounts } from "../../../utils/cashuProofs";
import { MAIN_MINT_URL, normalizeMintUrl } from "../../../utils/mint";
import {
  buildSparseCashuTokenPayload,
  createCashuTokenId,
  hasMatchingCashuToken,
} from "../../lib/cashuTokenIdentity";
import type {
  CashuTokenRowLike,
  LoggedPaymentEventParams,
  MintUrlInput,
} from "../../types/appTypes";
import { scanCashuRestoreKeyset } from "./cashuRestoreScanner";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface UseRestoreMissingTokensParams {
  cashuIsBusy: boolean;
  cashuTokensAll: readonly CashuTokenRowLike[];
  defaultMintUrl: string | null;
  enqueueCashuOp: (op: () => Promise<void>) => Promise<void>;
  upsert: EvoluMutations["upsert"];
  isMintDeleted: (mintUrl: string) => boolean;
  logPaymentEvent: (event: LoggedPaymentEventParams) => void;
  mintInfoDeduped: readonly { canonicalUrl?: string | null }[];
  pushToast: (message: string) => void;
  readSeenMintsFromStorage: () => string[];
  rememberSeenMint: (mintUrl: MintUrlInput) => void;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
  setCashuIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setTokensRestoreIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  t: (key: string) => string;
  tokensRestoreIsBusy: boolean;
}

export const useRestoreMissingTokens = ({
  cashuIsBusy,
  cashuTokensAll,
  defaultMintUrl,
  enqueueCashuOp,
  upsert,
  isMintDeleted,
  logPaymentEvent,
  mintInfoDeduped,
  pushToast,
  readSeenMintsFromStorage,
  rememberSeenMint,
  resolveOwnerIdForWrite,
  setCashuIsBusy,
  setTokensRestoreIsBusy,
  t,
  tokensRestoreIsBusy,
}: UseRestoreMissingTokensParams) => {
  return React.useCallback(async () => {
    if (tokensRestoreIsBusy) return;
    if (cashuIsBusy) return;

    await enqueueCashuOp(async () => {
      setTokensRestoreIsBusy(true);
      setCashuIsBusy(true);

      try {
        const det = getCashuDeterministicSeedFromStorage();
        if (!det) {
          pushToast(t("seedMissing"));
          return;
        }

        const ownerId = await resolveOwnerIdForWrite();

        const { getCashuLib } = await import("../../../utils/cashuLib");
        const { Mint, Wallet, getEncodedToken, getTokenMetadata } =
          await getCashuLib();

        const walletByMintUnit = new Map<
          string,
          Promise<Awaited<ReturnType<typeof createLoadedCashuWallet>>>
        >();
        const getWalletForMintUnit = (mintUrl: string, unit: string) => {
          const normalizedMint = normalizeMintUrl(mintUrl);
          const normalizedUnit = String(unit ?? "").trim() || "sat";
          const key = `${normalizedMint}|${normalizedUnit}`;
          const existing = walletByMintUnit.get(key);
          if (existing) return existing;

          const created = createLoadedCashuWallet({
            Mint,
            Wallet,
            mintUrl: normalizedMint,
            unit: normalizedUnit,
            bip39seed: det.bip39seed,
          });
          walletByMintUnit.set(key, created);
          return created;
        };

        const existingSecretsByMintUnit = new Map<string, Set<string>>();
        const keyOf = (mintUrl: string, unit: string) =>
          `${normalizeMintUrl(mintUrl)}|${String(unit ?? "").trim() || "sat"}`;

        const ensureSet = (mintUrl: string, unit: string) => {
          const key = keyOf(mintUrl, unit);
          const existing = existingSecretsByMintUnit.get(key);
          if (existing) return existing;
          const next = new Set<string>();
          existingSecretsByMintUnit.set(key, next);
          return next;
        };

        for (const row of cashuTokensAll) {
          if (row.isDeleted) continue;
          const state = String(row.state ?? "").trim();
          if (state && state !== "accepted") continue;

          const tokenText = String(row.token ?? row.rawToken ?? "").trim();
          if (!tokenText) continue;

          try {
            const tokenMetadata = getTokenMetadata(tokenText);
            const mintUrl = String(tokenMetadata.mint ?? row.mint ?? "").trim();
            if (!mintUrl) continue;
            const unit =
              String(tokenMetadata.unit ?? row.unit ?? "").trim() || "sat";
            const wallet = await getWalletForMintUnit(mintUrl, unit);
            const decoded = decodeCashuTokenForMint({
              tokenText,
              mintUrl,
              getTokenMetadata,
              wallet,
            });
            const proofs: CashuProof[] = Array.isArray(decoded?.proofs)
              ? decoded.proofs
              : [];

            const set = ensureSet(mintUrl, wallet.unit);
            for (const p of proofs) {
              const secret = String(p?.secret ?? "").trim();
              if (secret) set.add(secret);
            }
          } catch {
            // ignore invalid token strings
          }
        }

        const mintCandidates = new Set<string>();
        for (const key of existingSecretsByMintUnit.keys()) {
          const mint = key.split("|")[0] ?? "";
          if (mint) mintCandidates.add(mint);
        }

        // Important: allow restoring tokens even if the user deleted the last
        // token for a mint locally. Evolu deletes are soft-deletes, so we can
        // still use the stored mint URL as a scan candidate.
        for (const row of cashuTokensAll) {
          const mintFromColumn = String(row.mint ?? "").trim();
          if (mintFromColumn) {
            mintCandidates.add(normalizeMintUrl(mintFromColumn));
            continue;
          }

          const tokenText = String(row.token ?? row.rawToken ?? "").trim();
          if (!tokenText) continue;
          try {
            const tokenMetadata = getTokenMetadata(tokenText);
            const mintUrl = String(tokenMetadata.mint ?? "").trim();
            if (mintUrl) mintCandidates.add(normalizeMintUrl(mintUrl));
          } catch {
            // ignore invalid token strings
          }
        }
        for (const m of mintInfoDeduped) {
          const url = String(m.canonicalUrl ?? "").trim();
          if (url) mintCandidates.add(normalizeMintUrl(url));
        }
        if (defaultMintUrl)
          mintCandidates.add(normalizeMintUrl(defaultMintUrl));
        mintCandidates.add(normalizeMintUrl(MAIN_MINT_URL));

        // Fallback: if the user deleted all token rows (or the query doesn't
        // expose deleted rows), still scan mints we have ever seen.
        for (const seen of readSeenMintsFromStorage()) {
          mintCandidates.add(normalizeMintUrl(seen));
        }

        // Ensure our main mint is always remembered.
        rememberSeenMint(MAIN_MINT_URL);

        const alwaysIncludeMints = new Set<string>();
        const mainMint = normalizeMintUrl(MAIN_MINT_URL);
        if (mainMint) alwaysIncludeMints.add(mainMint);
        const defaultMint = normalizeMintUrl(defaultMintUrl);
        if (defaultMint) alwaysIncludeMints.add(defaultMint);

        const mintsPreFilter = Array.from(mintCandidates)
          .map((u) => normalizeMintUrl(u))
          .filter(Boolean);

        const mints = mintsPreFilter.filter(
          (u) => alwaysIncludeMints.has(u) || !isMintDeleted(u),
        );

        if (mints.length === 0) {
          pushToast(t("restoreNothing"));
          return;
        }

        let restoredProofsTotal = 0;
        let createdTokensTotal = 0;
        const restoreRescanWindow = 4000;

        for (const mintUrl of mints) {
          const units = (() => {
            const set = new Set<string>();
            for (const key of existingSecretsByMintUnit.keys()) {
              const [m, u] = key.split("|");
              if (m === normalizeMintUrl(mintUrl) && u) set.add(u);
            }
            // If we don't know the unit (older stored tokens omitted it), try common ones.
            if (set.size === 0) {
              set.add("sat");
              set.add("msat");
            }
            return Array.from(set);
          })();

          for (const unit of units) {
            let wallet: Awaited<ReturnType<typeof createLoadedCashuWallet>>;

            try {
              // Reuse the loadMint() result if we've already touched this
              // mint+unit earlier in the same restore pass — getWalletForMintUnit
              // memoises by `${mintUrl}|${unit}` so we don't repay
              // info+keysets+keys per nested loop iteration.
              wallet = await getWalletForMintUnit(mintUrl, unit);
            } catch {
              // skip unreachable mints
              continue;
            }

            const keysets = wallet.keyChain.getKeysets();
            for (const ks of keysets) {
              const ksUnit = String(
                (ks as { unit?: unknown })?.unit ?? "",
              ).trim();
              if (ksUnit && ksUnit !== wallet.unit) continue;
              const keysetId = String(
                (ks as { id?: unknown })?.id ?? "",
              ).trim();
              if (!keysetId) continue;

              const savedCursor = getCashuRestoreCursor({
                mintUrl,
                unit: wallet.unit,
                keysetId,
              });

              const detCounter = getCashuDeterministicCounter({
                mintUrl,
                unit: wallet.unit,
                keysetId,
              });
              const knownSecrets = ensureSet(mintUrl, wallet.unit);
              const scan = await scanCashuRestoreKeyset({
                savedCursor,
                deterministicCounter: detCounter,
                knownSecrets,
                rescanWindow: restoreRescanWindow,
                // Scan up to 300 counter positions in 100-position restore
                // requests. Wider gaps cost every user 5–50s; stale counters
                // are deliberately handled by wipeCashuDeterministicState.
                batchRestore: async (counterStart) =>
                  await wallet.batchRestore(300, 100, counterStart, keysetId),
                checkProofsStates: async (proofs) =>
                  await wallet.checkProofsStates(proofs),
              });
              if (scan.status === "unavailable") continue;

              if (scan.nextCursor !== null) {
                setCashuRestoreCursor({
                  mintUrl,
                  unit: wallet.unit,
                  keysetId,
                  cursor: scan.nextCursor,
                });
                ensureCashuDeterministicCounterAtLeast({
                  mintUrl,
                  unit: wallet.unit,
                  keysetId,
                  atLeast: scan.nextCursor,
                });
              }

              const spendableProofs = scan.proofs;

              if (spendableProofs.length === 0) continue;

              for (const p of spendableProofs) {
                const secret = String(p?.secret ?? "").trim();
                if (secret) knownSecrets.add(secret);
              }

              restoredProofsTotal += spendableProofs.length;

              // Keep tokens reasonably sized.
              const chunkSize = 200;
              for (let i = 0; i < spendableProofs.length; i += chunkSize) {
                const chunk = spendableProofs.slice(i, i + chunkSize);
                const amount = sumCashuProofAmounts(chunk);
                if (!Number.isFinite(amount) || amount <= 0) continue;

                const token = getEncodedToken({
                  mint: mintUrl,
                  proofs: chunk,
                  unit: wallet.unit,
                  memo: "restored",
                });

                const payload = buildSparseCashuTokenPayload({
                  id: createCashuTokenId(token),
                  token,
                  state: "accepted",
                });

                if (hasMatchingCashuToken(cashuTokensAll, payload)) {
                  continue;
                }

                const r = ownerId
                  ? upsert("cashuToken", payload, { ownerId })
                  : upsert("cashuToken", payload);

                if (r.ok) {
                  createdTokensTotal += 1;
                  logPaymentEvent({
                    direction: "in",
                    status: "ok",
                    amount: Math.floor(amount),
                    fee: null,
                    mint: mintUrl,
                    unit: wallet.unit,
                    error: null,
                    contactId: null,
                    method: "cashu_restore",
                    phase: "restore",
                  });
                }
              }
            }
          }
        }

        if (restoredProofsTotal === 0 || createdTokensTotal === 0) {
          pushToast(t("restoreNothing"));
          return;
        }

        pushToast(
          t("restoreDone")
            .replace("{proofs}", String(restoredProofsTotal))
            .replace("{tokens}", String(createdTokensTotal)),
        );
      } catch (e) {
        pushToast(`${t("restoreFailed")}: ${String(e ?? "unknown")}`);
      } finally {
        setCashuIsBusy(false);
        setTokensRestoreIsBusy(false);
      }
    });
  }, [
    cashuIsBusy,
    cashuTokensAll,
    defaultMintUrl,
    enqueueCashuOp,
    upsert,
    isMintDeleted,
    logPaymentEvent,
    mintInfoDeduped,
    pushToast,
    readSeenMintsFromStorage,
    rememberSeenMint,
    resolveOwnerIdForWrite,
    setCashuIsBusy,
    setTokensRestoreIsBusy,
    t,
    tokensRestoreIsBusy,
  ]);
};
