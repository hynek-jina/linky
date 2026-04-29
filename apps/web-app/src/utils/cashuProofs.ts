import type { Proof, ProofState } from "@cashu/cashu-ts";

const buildProofKey = (proof: Proof): string => {
  return [
    String(proof.id ?? "").trim(),
    String(proof.secret ?? "").trim(),
    String(proof.C ?? "").trim(),
    String(Number(proof.amount ?? 0) || 0),
  ].join("|");
};

export const dedupeCashuProofs = (proofs: readonly Proof[]): Proof[] => {
  const seen = new Set<string>();
  const unique: Proof[] = [];

  for (const proof of proofs) {
    const key = buildProofKey(proof);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(proof);
  }

  return unique;
};

export const filterUnspentCashuProofs = (
  proofs: readonly Proof[],
  states: readonly ProofState[],
): Proof[] => {
  if (proofs.length === 0) return [];
  if (states.length !== proofs.length) return [...proofs];

  return proofs.filter((_, idx) => {
    const state = String(states[idx]?.state ?? "").trim();
    return state === "UNSPENT";
  });
};

export type CashuProofGroup<TId> = {
  id: TId;
  proofs: readonly Proof[];
};

export type CashuProofGroupPartition<TId> = {
  // Groups that still have at least one UNSPENT proof, narrowed to just those.
  liveGroups: Array<{ id: TId; proofs: Proof[] }>;
  // IDs of groups whose every proof came back SPENT — caller should mark these
  // as definitively spent without falling back to the merge-swap path.
  fullySpentIds: TId[];
  // IDs of groups for which the mint did not return a state for at least one
  // proof. The mint's response is incomplete, so we can't decide either way;
  // caller should treat these as "transient" / unknown.
  unknownStateIds: TId[];
};

// Partitions a set of token-row → proofs groups using a single batched call to
// `wallet.checkProofsStates`. The mint's response is keyed by Y; cashu-ts
// re-emits the states aligned to input order, so we can slice them per group.
//
// Why this exists: `useCashuTokenChecks` previously merged all proofs across
// rows at the same mint and ran one swap to "verify". A single spent token in
// the merged set caused the mint to reject the entire swap, after which the
// catch-handler matched "spent" in the message and marked the *primary* token
// row as invalid — even when its own proofs were perfectly fine. This helper
// gives the caller per-row spent/unspent fidelity so it can mark only truly
// spent rows.
export const partitionCashuProofGroupsByState = <TId>(
  groups: ReadonlyArray<CashuProofGroup<TId>>,
  states: readonly ProofState[],
): CashuProofGroupPartition<TId> => {
  const liveGroups: Array<{ id: TId; proofs: Proof[] }> = [];
  const fullySpentIds: TId[] = [];
  const unknownStateIds: TId[] = [];

  let cursor = 0;
  for (const group of groups) {
    const groupStates = states.slice(cursor, cursor + group.proofs.length);
    cursor += group.proofs.length;

    if (groupStates.length !== group.proofs.length) {
      // Mint response was truncated relative to what we asked about — bail
      // out for this group rather than guessing.
      unknownStateIds.push(group.id);
      continue;
    }

    const unspent: Proof[] = [];
    let sawUnknown = false;
    let sawSpent = false;

    for (let i = 0; i < group.proofs.length; i += 1) {
      const state = String(groupStates[i]?.state ?? "")
        .trim()
        .toUpperCase();
      if (state === "UNSPENT") {
        unspent.push(group.proofs[i]);
      } else if (state === "SPENT") {
        sawSpent = true;
      } else {
        // PENDING or any other state we don't understand — don't claim
        // certainty about this row.
        sawUnknown = true;
      }
    }

    if (unspent.length > 0) {
      liveGroups.push({ id: group.id, proofs: unspent });
    } else if (sawSpent && !sawUnknown) {
      fullySpentIds.push(group.id);
    } else {
      unknownStateIds.push(group.id);
    }
  }

  return { liveGroups, fullySpentIds, unknownStateIds };
};
