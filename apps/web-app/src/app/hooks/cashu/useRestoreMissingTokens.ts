import type { Proof as CashuProof } from "@cashu/cashu-ts";
import * as Evolu from "@evolu/common";
import React from "react";
import type { ContactId } from "../../../evolu";
import {
  ensureCashuDeterministicCounterAtLeast,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  getCashuRestoreCursor,
  setCashuRestoreCursor,
} from "../../../utils/cashuDeterministic";
import { MAIN_MINT_URL, normalizeMintUrl } from "../../../utils/mint";

type EvoluMutations = ReturnType<typeof import("../../../evolu").useEvolu>;

interface UseRestoreMissingTokensParams {
  cashuIsBusy: boolean;
  cashuTokensAll: readonly Record<string, unknown>[];
  defaultMintUrl: string | null;
  enqueueCashuOp: (op: () => Promise<void>) => Promise<void>;
  insert: EvoluMutations["insert"];
  isMintDeleted: (mintUrl: string) => boolean;
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
  mintInfoDeduped: readonly { canonicalUrl?: unknown }[];
  pushToast: (message: string) => void;
  readSeenMintsFromStorage: () => string[];
  rememberSeenMint: (mintUrl: unknown) => void;
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
  insert,
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
        const { CashuMint, CashuWallet, getDecodedToken, getEncodedToken } =
          await getCashuLib();

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
          const r = row as {
            isDeleted?: unknown;
            mint?: unknown;
            rawToken?: unknown;
            state?: unknown;
            token?: unknown;
            unit?: unknown;
          };
          if (r.isDeleted) continue;
          const state = String(r.state ?? "").trim();
          if (state && state !== "accepted") continue;

          const tokenText = String(r.token ?? r.rawToken ?? "").trim();
          if (!tokenText) continue;

          try {
            const decoded = getDecodedToken(tokenText);
            const mintUrl = String(decoded?.mint ?? r.mint ?? "").trim();
            if (!mintUrl) continue;
            const unit = String(decoded?.unit ?? r.unit ?? "").trim() || "sat";
            const proofs: CashuProof[] = Array.isArray(decoded?.proofs)
              ? decoded.proofs
              : [];

            const set = ensureSet(mintUrl, unit);
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
          const r = row as {
            mint?: unknown;
            rawToken?: unknown;
            token?: unknown;
          };

          const mintFromColumn = String(r.mint ?? "").trim();
          if (mintFromColumn) {
            mintCandidates.add(normalizeMintUrl(mintFromColumn));
            continue;
          }

          const tokenText = String(r.token ?? r.rawToken ?? "").trim();
          if (!tokenText) continue;
          try {
            const decoded = getDecodedToken(tokenText);
            const mintUrl = String(decoded?.mint ?? "").trim();
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
            const wallet = new CashuWallet(new CashuMint(mintUrl), {
              unit,
              bip39seed: det.bip39seed,
            });

            try {
              await wallet.loadMint();
            } catch {
              // skip unreachable mints
              continue;
            }

            const keysets = await wallet.getKeySets();
            for (const ks of keysets) {
              const ksUnit = String(
                (ks as Record<string, unknown>)?.unit ?? "",
              ).trim();
              if (ksUnit && ksUnit !== wallet.unit) continue;
              const keysetId = String(
                (ks as Record<string, unknown>)?.id ?? "",
              ).trim();
              if (!keysetId) continue;

              const savedCursor = getCashuRestoreCursor({
                mintUrl,
                unit: wallet.unit,
                keysetId,
              });

              // If the user deleted tokens locally, scanning only forward from the
              // persisted cursor can miss them (they may be below the cursor).
              // Scan a recent window behind the current high-water mark.
              const detCounter = getCashuDeterministicCounter({
                mintUrl,
                unit: wallet.unit,
                keysetId,
              });
              const highWater = Math.max(
                savedCursor,
                typeof detCounter === "number" && Number.isFinite(detCounter)
                  ? detCounter
                  : 0,
              );
              const start = Math.max(0, highWater - restoreRescanWindow);

              const batchRestore = async (counterStart: number) =>
                await wallet.batchRestore(300, 100, counterStart, keysetId);

              let restored: {
                lastCounterWithSignature?: number;
                proofs: CashuProof[];
              };
              try {
                restored = await batchRestore(start);
              } catch {
                continue;
              }

              const last = restored.lastCounterWithSignature;
              if (typeof last === "number" && Number.isFinite(last)) {
                setCashuRestoreCursor({
                  mintUrl,
                  unit: wallet.unit,
                  keysetId,
                  cursor: last + 1,
                });
                ensureCashuDeterministicCounterAtLeast({
                  mintUrl,
                  unit: wallet.unit,
                  keysetId,
                  atLeast: last + 1,
                });
              }

              const knownSecrets = ensureSet(mintUrl, wallet.unit);

              const filterFresh = (proofs: CashuProof[]) =>
                (proofs ?? []).filter((p) => {
                  const secret = String(p?.secret ?? "").trim();
                  return secret && !knownSecrets.has(secret);
                });

              const filterSpendable = async (proofs: CashuProof[]) => {
                if (proofs.length === 0) return proofs;
                try {
                  const states = await wallet.checkProofsStates(proofs);
                  return proofs.filter((_, idx) => {
                    const state = String(
                      (states as Record<string, unknown>[])?.[idx]?.state ?? "",
                    ).trim();
                    return state === "UNSPENT";
                  });
                } catch {
                  return proofs;
                }
              };

              // Windowed scan first.
              let freshProofs = filterFresh(restored.proofs ?? []);
              let spendableProofs = await filterSpendable(freshProofs);

              // If user deleted older tokens and our cursor is far ahead, the window
              // may not include them. Fall back to a one-time deep scan from 0.
              if (spendableProofs.length === 0 && start > 0) {
                try {
                  const deep = await batchRestore(0);

                  // Prefer advancing cursors based on the furthest scan.
                  const last0 = restored.lastCounterWithSignature;
                  const last1 = deep.lastCounterWithSignature;
                  const maxLast = Math.max(
                    typeof last0 === "number" && Number.isFinite(last0)
                      ? last0
                      : -1,
                    typeof last1 === "number" && Number.isFinite(last1)
                      ? last1
                      : -1,
                  );
                  if (maxLast >= 0) {
                    setCashuRestoreCursor({
                      mintUrl,
                      unit: wallet.unit,
                      keysetId,
                      cursor: maxLast + 1,
                    });
                    ensureCashuDeterministicCounterAtLeast({
                      mintUrl,
                      unit: wallet.unit,
                      keysetId,
                      atLeast: maxLast + 1,
                    });
                  }

                  restored = deep;
                  freshProofs = filterFresh(restored.proofs ?? []);
                  spendableProofs = await filterSpendable(freshProofs);
                } catch {
                  /* restore attempt failed, skip */
                }
              }

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
                const amount = chunk.reduce(
                  (sum: number, p) => sum + (Number(p?.amount ?? 0) || 0),
                  0,
                );
                if (!Number.isFinite(amount) || amount <= 0) continue;

                const token = getEncodedToken({
                  mint: mintUrl,
                  proofs: chunk,
                  unit: wallet.unit,
                  memo: "restored",
                });

                const payload = {
                  token: token as typeof Evolu.NonEmptyString.Type,
                  rawToken: null,
                  mint: mintUrl as typeof Evolu.NonEmptyString1000.Type,
                  unit: wallet.unit as typeof Evolu.NonEmptyString100.Type,
                  amount: Math.floor(amount) as typeof Evolu.PositiveInt.Type,
                  state: "accepted" as typeof Evolu.NonEmptyString100.Type,
                  error: null,
                };

                const r = ownerId
                  ? insert("cashuToken", payload, { ownerId })
                  : insert("cashuToken", payload);

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
    insert,
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
