import type { Proof, ProofState } from "@cashu/cashu-ts";

interface CashuRestoreBatch {
  lastCounterWithSignature?: number;
  proofs: Proof[];
}

interface ScanCashuRestoreKeysetParams {
  batchRestore: (counterStart: number) => Promise<CashuRestoreBatch>;
  checkProofsStates: (proofs: Proof[]) => Promise<ProofState[]>;
  deterministicCounter: number | null;
  knownSecrets: ReadonlySet<string>;
  rescanWindow: number;
  savedCursor: number;
}

export type CashuRestoreKeysetScanResult =
  | { status: "unavailable" }
  | {
      status: "ok";
      nextCursor: number | null;
      proofs: Proof[];
    };

const getNextCursor = (...values: Array<number | undefined>): number | null => {
  const lastCounter = Math.max(
    ...values.map((value) =>
      typeof value === "number" && Number.isFinite(value) ? value : -1,
    ),
  );
  return lastCounter >= 0 ? lastCounter + 1 : null;
};

export const scanCashuRestoreKeyset = async ({
  batchRestore,
  checkProofsStates,
  deterministicCounter,
  knownSecrets,
  rescanWindow,
  savedCursor,
}: ScanCashuRestoreKeysetParams): Promise<CashuRestoreKeysetScanResult> => {
  const highWater = Math.max(
    savedCursor,
    typeof deterministicCounter === "number" &&
      Number.isFinite(deterministicCounter)
      ? deterministicCounter
      : 0,
  );
  const start = Math.max(0, highWater - rescanWindow);

  let restored: CashuRestoreBatch;
  try {
    restored = await batchRestore(start);
  } catch {
    return { status: "unavailable" };
  }

  let nextCursor = getNextCursor(restored.lastCounterWithSignature);

  const getSpendableFreshProofs = async (
    proofs: readonly Proof[],
  ): Promise<Proof[]> => {
    const freshProofs = proofs.filter((proof) => {
      const secret = String(proof.secret ?? "").trim();
      return secret && !knownSecrets.has(secret);
    });
    if (freshProofs.length === 0) return [];

    try {
      const states = await checkProofsStates(freshProofs);
      return freshProofs.filter(
        (_, index) => String(states[index]?.state ?? "").trim() === "UNSPENT",
      );
    } catch {
      return [];
    }
  };

  let spendableProofs = await getSpendableFreshProofs(restored.proofs);

  if (spendableProofs.length === 0 && start > 0) {
    try {
      const deep = await batchRestore(0);
      nextCursor = getNextCursor(
        restored.lastCounterWithSignature,
        deep.lastCounterWithSignature,
      );
      spendableProofs = await getSpendableFreshProofs(deep.proofs);
    } catch {
      // Keep the windowed scan result.
    }
  }

  return { status: "ok", nextCursor, proofs: spendableProofs };
};
