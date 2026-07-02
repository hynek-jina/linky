import { parseCashuToken } from "../../cashu";
import type { CashuTokenRowLike, MintUrlInput } from "../types/appTypes";
import { getLinkyBankPaymentOfferInfo } from "./bankPaymentOffer";
import { createCashuTokenId } from "./cashuTokenIdentity";
import { parsePrivateImageMessage } from "./privateImageMessage";
import { extractCashuTokenFromText } from "./tokenText";

export interface CashuTokenMessageInfo {
  amount: number | null;
  isValid: boolean;
  mintDisplay: string | null;
  mintUrl: string | null;
  tokenRaw: string;
  unit: string | null;
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
  const tokenId = String(createCashuTokenId(tokenRaw));
  return cashuTokensAll.some((row) => {
    const storedRaw = String(row.rawToken ?? "").trim();
    const storedToken = String(row.token ?? "").trim();
    return (
      String(row.id ?? "") === tokenId ||
      (storedRaw !== "" && storedRaw === tokenRaw) ||
      (storedToken !== "" && storedToken === tokenRaw)
    );
  });
};

export const getCashuTokenMessageInfo = (
  text: string,
  cashuTokensAll: readonly CashuTokenRowLike[],
): CashuTokenMessageInfo | null => {
  if (getLinkyBankPaymentOfferInfo(text)) return null;
  if (parsePrivateImageMessage(text)) return null;

  const tokenRaw = extractCashuTokenFromText(text);
  if (!tokenRaw) return null;

  const parsed = parseCashuToken(tokenRaw);
  if (!parsed) return null;

  return {
    tokenRaw,
    mintDisplay: getMintDisplay(parsed.mint),
    mintUrl: parsed.mint ? String(parsed.mint) : null,
    amount: Number.isFinite(parsed.amount) ? parsed.amount : null,
    unit: parsed.unit,
    // Best-effort: "valid" means not yet imported into wallet.
    isValid: !isKnownCashuToken(cashuTokensAll, tokenRaw),
  };
};
