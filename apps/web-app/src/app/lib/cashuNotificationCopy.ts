import { extractCashuTokenFromText } from "./tokenText";

export const isCashuNotificationMessage = (text: string): boolean => {
  return extractCashuTokenFromText(text) !== null;
};

export const getReceivedMoneyCopyForLanguage = (
  language: string | null | undefined,
): string => {
  const normalized = String(language ?? "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("cs")) {
    return "Přijali jste peníze";
  }
  return "You received money";
};

export const getBankPaymentReimbursementCopyForLanguage = (
  language: string | null | undefined,
): string => {
  const normalized = String(language ?? "")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("cs")) {
    return "Dorazily ti saty za bankovní platbu";
  }
  return "Your sats for the bank payment have arrived";
};
