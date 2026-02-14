import type { MintSupportsMppValue } from "../types/appTypes";

interface MintGroup {
  sum: number;
  tokens: string[];
}

interface MintCandidate extends MintGroup {
  mint: string;
}

const normalizeMint = (value: string): string =>
  String(value ?? "")
    .trim()
    .replace(/\/+$/, "");

const supportsMpp = <TMintInfo extends { supportsMpp?: MintSupportsMppValue }>(
  mintInfoByUrl: Map<string, TMintInfo>,
  mintUrl: string,
): number => {
  const row = mintInfoByUrl.get(normalizeMint(mintUrl));
  if (!row) return 0;
  return String(row.supportsMpp ?? "") === "1" ? 1 : 0;
};

export const buildCashuMintCandidates = <
  TMintInfo extends { supportsMpp?: MintSupportsMppValue },
>(
  mintGroups: Map<string, MintGroup>,
  preferredMint: string | null,
  mintInfoByUrl: Map<string, TMintInfo>,
): MintCandidate[] => {
  const preferred = normalizeMint(preferredMint ?? "");
  return Array.from(mintGroups.entries())
    .map(([mint, info]) => ({ mint, ...info }))
    .sort((a, b) => {
      const aPreferred =
        Boolean(preferred) && normalizeMint(a.mint) === preferred;
      const bPreferred =
        Boolean(preferred) && normalizeMint(b.mint) === preferred;
      if (aPreferred !== bPreferred) return aPreferred ? 1 : -1;

      const mppPriority =
        supportsMpp(mintInfoByUrl, b.mint) - supportsMpp(mintInfoByUrl, a.mint);
      if (mppPriority !== 0) return mppPriority;
      return b.sum - a.sum;
    });
};
