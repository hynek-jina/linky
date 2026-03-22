import { parseCashuToken } from "../../cashu";
import type { CashuTokenRowLike, MintUrlInput } from "../types/appTypes";
import { extractCashuTokenFromText } from "./tokenText";

export interface CashuTokenMessageInfo {
  amount: number | null;
  isValid: boolean;
  mintDisplay: string | null;
  mintUrl: string | null;
  tokenRaw: string;
}

const getMintDisplay = (mintValue: MintUrlInput): string | null => {
  const mintText = String(mintValue ?? "").trim();
  if (!mintText) return null;
  try {
    return new URL(mintText).host;
  } catch {
    return mintText;
  }
};

const isKnownCashuToken = (
  cashuTokensAll: readonly CashuTokenRowLike[],
  tokenRaw: string,
): boolean => {
  return cashuTokensAll.some((row) => {
    if (row.isDeleted) return false;
    const storedRaw = String(row.rawToken ?? "").trim();
    const storedToken = String(row.token ?? "").trim();
    return (
      (storedRaw !== "" && storedRaw === tokenRaw) ||
      (storedToken !== "" && storedToken === tokenRaw)
    );
  });
};

export const getCashuTokenMessageInfo = (
  text: string,
  cashuTokensAll: readonly CashuTokenRowLike[],
): CashuTokenMessageInfo | null => {
  const tokenRaw = extractCashuTokenFromText(text);
  if (!tokenRaw) return null;

  const parsed = parseCashuToken(tokenRaw);
  if (!parsed) return null;

  return {
    tokenRaw,
    mintDisplay: getMintDisplay(parsed.mint),
    mintUrl: parsed.mint ? String(parsed.mint) : null,
    amount: Number.isFinite(parsed.amount) ? parsed.amount : null,
    // Best-effort: "valid" means not yet imported into wallet.
    isValid: !isKnownCashuToken(cashuTokensAll, tokenRaw),
  };
};
