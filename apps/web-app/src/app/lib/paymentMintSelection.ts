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

export interface SendMintBalance {
  amount: number;
  mint: string;
}

/**
 * Picks the mint an exact-amount linkshu send should spend from: foreign
 * mints first (largest balance wins), the preferred/default mint last —
 * mirroring `buildCashuMintCandidates` so sends drain foreign balances
 * before touching the main mint.
 */
export const selectSendMintForAmount = (
  balances: readonly SendMintBalance[],
  preferredMint: string | null,
  amountSat: number,
): string | null => {
  if (!Number.isFinite(amountSat) || amountSat <= 0) return null;
  const preferred = normalizeMint(preferredMint ?? "");
  const isPreferred = (mint: string): boolean =>
    Boolean(preferred) && normalizeMint(mint) === preferred;

  return (
    [...balances]
      .sort((a, b) => {
        if (isPreferred(a.mint) !== isPreferred(b.mint)) {
          return isPreferred(a.mint) ? 1 : -1;
        }
        return b.amount - a.amount;
      })
      .find((entry) => entry.amount >= amountSat)?.mint ?? null
  );
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
