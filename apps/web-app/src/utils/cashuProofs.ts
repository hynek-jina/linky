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
