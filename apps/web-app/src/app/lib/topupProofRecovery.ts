import type { MintProofsConfig, OutputType, Proof } from "@cashu/cashu-ts";
import {
  bumpCashuDeterministicCounter,
  ensureCashuDeterministicCounterAtLeast,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "../../utils/cashuDeterministic";
import {
  isCashuOutputsAlreadySignedError,
  isCashuOutputsArePendingError,
} from "../../utils/cashuErrors";
import {
  cashuAmountToNumber,
  sumCashuProofAmounts,
} from "../../utils/cashuProofs";

interface TopupMintProofsWalletLike {
  keysetId: string;
  mintProofsBolt11: (
    amount: number,
    quote: string,
    config?: MintProofsConfig,
    outputType?: OutputType,
  ) => Promise<Proof[]>;
  restore: (
    start: number,
    count: number,
    options?: { keysetId?: string },
  ) => Promise<{
    lastCounterWithSignature?: number;
    proofs: Proof[];
  }>;
  checkProofsStates: (proofs: Proof[]) => Promise<Array<{ state?: unknown }>>;
  unit: string;
}

const filterSpendableTopupProofs = async (
  wallet: TopupMintProofsWalletLike,
  proofs: Proof[],
): Promise<Proof[]> => {
  if (proofs.length === 0) return proofs;

  try {
    const states = await wallet.checkProofsStates(proofs);
    return proofs.filter((_, index) => {
      const state = String(states[index]?.state ?? "")
        .trim()
        .toUpperCase();
      return state === "UNSPENT";
    });
  } catch {
    return proofs;
  }
};

const findExactSubsetByAmount = (
  proofs: Proof[],
  target: number,
): Proof[] | null => {
  if (target <= 0) return null;
  const indexed = proofs
    .map((proof) => ({
      amount: cashuAmountToNumber(proof.amount),
      proof,
    }))
    .filter((entry) => entry.amount > 0 && entry.amount <= target)
    .sort((left, right) => right.amount - left.amount);
  if (indexed.length === 0) return null;

  const memo = new Set<string>();
  const findSubset = (start: number, remaining: number): Proof[] | null => {
    if (remaining === 0) return [];
    if (start >= indexed.length) return null;
    const memoKey = `${start}|${remaining}`;
    if (memo.has(memoKey)) return null;

    for (let index = start; index < indexed.length; index += 1) {
      const entry = indexed[index];
      if (!entry || entry.amount > remaining) continue;
      const rest = findSubset(index + 1, remaining - entry.amount);
      if (rest) return [entry.proof, ...rest];
    }

    memo.add(memoKey);
    return null;
  };

  return findSubset(0, target);
};

type RestoreAlreadySignedResult =
  | {
      kind: "recovery";
      lastCounterWithSignature?: number;
      proofs: Proof[];
    }
  | {
      kind: "collision";
      lastCounterWithSignature?: number;
    }
  | { kind: "empty" };

const restoreAlreadySignedTopupProofs = async (args: {
  amount: number;
  counter: number;
  keysetId: string;
  wallet: TopupMintProofsWalletLike;
}): Promise<RestoreAlreadySignedResult> => {
  const restored = await args.wallet.restore(args.counter, 100, {
    keysetId: args.keysetId,
  });
  if (restored.proofs.length === 0) return { kind: "empty" };

  const spendableProofs = await filterSpendableTopupProofs(
    args.wallet,
    restored.proofs,
  );
  if (sumCashuProofAmounts(spendableProofs) < args.amount) {
    return restored.lastCounterWithSignature === undefined
      ? { kind: "collision" }
      : {
          kind: "collision",
          lastCounterWithSignature: restored.lastCounterWithSignature,
        };
  }

  const result: RestoreAlreadySignedResult = {
    kind: "recovery",
    proofs:
      findExactSubsetByAmount(spendableProofs, args.amount) ?? spendableProofs,
  };
  if (restored.lastCounterWithSignature !== undefined) {
    result.lastCounterWithSignature = restored.lastCounterWithSignature;
  }
  return result;
};

export const mintTopupProofs = async (args: {
  amount: number;
  mintUrl: string;
  quoteId: string;
  unit: string | null;
  wallet: TopupMintProofsWalletLike;
}): Promise<Proof[]> => {
  const deterministicSeed = getCashuDeterministicSeedFromStorage();
  const unit = String(args.wallet.unit ?? args.unit ?? "").trim();
  const keysetId = String(args.wallet.keysetId ?? "").trim();

  if (!(deterministicSeed && unit && keysetId)) {
    return await args.wallet.mintProofsBolt11(args.amount, args.quoteId);
  }

  return await withCashuDeterministicCounterLock(
    { mintUrl: args.mintUrl, unit, keysetId },
    async () => {
      let counter = getCashuDeterministicCounter({
        mintUrl: args.mintUrl,
        unit,
        keysetId,
      });
      let pendingRetries = 0;
      let collisionRetries = 0;

      while (true) {
        try {
          const proofs = await args.wallet.mintProofsBolt11(
            args.amount,
            args.quoteId,
            undefined,
            { type: "deterministic", counter },
          );
          bumpCashuDeterministicCounter({
            mintUrl: args.mintUrl,
            unit,
            keysetId,
            used: proofs.length,
          });
          return proofs;
        } catch (error) {
          if (isCashuOutputsArePendingError(error) && pendingRetries < 5) {
            pendingRetries += 1;
            bumpCashuDeterministicCounter({
              mintUrl: args.mintUrl,
              unit,
              keysetId,
              used: 64,
            });
            counter = getCashuDeterministicCounter({
              mintUrl: args.mintUrl,
              unit,
              keysetId,
            });
            continue;
          }
          if (!isCashuOutputsAlreadySignedError(error)) throw error;
          if (collisionRetries >= 5) throw error;
          collisionRetries += 1;

          let restored: RestoreAlreadySignedResult;
          try {
            restored = await restoreAlreadySignedTopupProofs({
              amount: args.amount,
              counter,
              keysetId,
              wallet: args.wallet,
            });
          } catch {
            throw error;
          }

          if (restored.kind === "recovery") {
            const lastCounter = restored.lastCounterWithSignature;
            ensureCashuDeterministicCounterAtLeast({
              mintUrl: args.mintUrl,
              unit,
              keysetId,
              atLeast:
                typeof lastCounter === "number" && Number.isFinite(lastCounter)
                  ? lastCounter + 1
                  : counter + restored.proofs.length,
            });
            return restored.proofs;
          }

          if (
            restored.kind === "collision" &&
            typeof restored.lastCounterWithSignature === "number" &&
            Number.isFinite(restored.lastCounterWithSignature)
          ) {
            ensureCashuDeterministicCounterAtLeast({
              mintUrl: args.mintUrl,
              unit,
              keysetId,
              atLeast: restored.lastCounterWithSignature + 1,
            });
          } else {
            bumpCashuDeterministicCounter({
              mintUrl: args.mintUrl,
              unit,
              keysetId,
              used: 64,
            });
          }
          counter = getCashuDeterministicCounter({
            mintUrl: args.mintUrl,
            unit,
            keysetId,
          });
        }
      }
    },
  );
};
