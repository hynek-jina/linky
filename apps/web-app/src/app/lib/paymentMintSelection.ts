interface MintGroup {
  sum: number;
  tokens: string[];
}

export interface PaymentMintCandidate extends MintGroup {
  mint: string;
}

const normalizeMint = (value: string): string =>
  String(value ?? "")
    .trim()
    .replace(/\/+$/, "");

export const buildCashuMintCandidates = (
  mintGroups: Map<string, MintGroup>,
  preferredMint: string | null,
): PaymentMintCandidate[] => {
  const preferred = normalizeMint(preferredMint ?? "");
  return Array.from(mintGroups.entries())
    .map(([mint, info]) => ({ mint, ...info }))
    .sort((a, b) => {
      const aPreferred =
        Boolean(preferred) && normalizeMint(a.mint) === preferred;
      const bPreferred =
        Boolean(preferred) && normalizeMint(b.mint) === preferred;
      if (aPreferred !== bPreferred) return aPreferred ? 1 : -1;

      return b.sum - a.sum;
    });
};

export const selectSingleMintCandidateForAmount = (
  candidates: readonly PaymentMintCandidate[],
  amountSat: number,
): PaymentMintCandidate | null => {
  if (!Number.isFinite(amountSat) || amountSat <= 0) {
    return candidates[0] ?? null;
  }

  for (const candidate of candidates) {
    const candidateSum = Number(candidate.sum ?? 0) || 0;
    if (candidateSum >= amountSat) return candidate;
  }

  return null;
};
