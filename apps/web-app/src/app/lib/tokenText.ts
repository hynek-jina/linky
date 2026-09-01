import { extractTokenText, parseTokenText } from "@linky/linkshu";
import type { CashuTokenRow } from "../../evolu";
import { isBankPaymentPayload } from "../../utils/spdPayment";
import type { CashuTokenMeta } from "../types/appTypes";
import { getLinkyBankPaymentOfferInfo } from "./bankPaymentOffer";

export const extractCashuTokenMeta = (
  row: Pick<CashuTokenRow, "amount" | "mint" | "rawToken" | "token" | "unit">,
): CashuTokenMeta => {
  const tokenText = String(row.token ?? row.rawToken ?? "").trim();
  const storedMint = String(row.mint ?? "").trim();
  const storedUnit = String(row.unit ?? "").trim() || null;
  const storedAmount = Number(row.amount ?? 0);

  const parsed = tokenText ? parseTokenText(tokenText) : null;

  // Old rows can still carry the former metadata snapshots. They are only a
  // fallback for malformed/legacy tokens and are no longer written.
  const fallbackAmount =
    Number.isFinite(storedAmount) && storedAmount > 0
      ? Math.floor(storedAmount)
      : null;

  return {
    tokenText,
    mint: parsed?.mint ?? (storedMint || null),
    // Cashu tokens without an explicit unit use sat by default. Linky only
    // accepts sat-denominated wallet tokens.
    unit: parsed ? (parsed.unit ?? "sat") : storedUnit,
    amount: parsed?.amount ?? fallbackAmount,
  };
};

export type CashuTokenWithMeta = Omit<
  CashuTokenRow,
  "amount" | "mint" | "unit"
> &
  CashuTokenMeta;

export const enrichCashuTokenRow = (
  row: CashuTokenRow,
): CashuTokenWithMeta | null => {
  const meta = extractCashuTokenMeta(row);
  if (
    meta.amount === null ||
    !Number.isFinite(meta.amount) ||
    meta.amount <= 0
  ) {
    return null;
  }

  return {
    ...row,
    ...meta,
  };
};

/** linkshu's `extractTokenText` behind a bank-payment-payload exclusion. */
export const extractCashuTokenFromText = (text: string): string | null => {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  if (isBankPaymentPayload(raw) || getLinkyBankPaymentOfferInfo(raw)) {
    return null;
  }
  return extractTokenText(raw);
};

export const isStandaloneCashuTokenMessage = (text: string): boolean =>
  parseTokenText(String(text ?? "")) !== null;
