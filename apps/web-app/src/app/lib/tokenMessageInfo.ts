import { parseCashuToken } from "../../cashu";
import {
  parseCredoMessage,
  type CredoParsedMessage,
  type CredoPromisePayload,
  type CredoSettlementPayload,
} from "../../credo";
import { extractCashuTokenFromText } from "./tokenText";

export interface CashuTokenMessageInfo {
  amount: number | null;
  isValid: boolean;
  mintDisplay: string | null;
  mintUrl: string | null;
  tokenRaw: string;
}

export interface CredoTokenMessageInfo {
  amount: number | null;
  expiresAtSec: number | null;
  isValid: boolean;
  issuer: string | null;
  kind: "promise" | "settlement";
  recipient: string | null;
  tokenRaw: string;
}

const getMintDisplay = (mintValue: unknown): string | null => {
  const mintText = String(mintValue ?? "").trim();
  if (!mintText) return null;
  try {
    return new URL(mintText).host;
  } catch {
    return mintText;
  }
};

const isKnownCashuToken = (
  cashuTokensAll: readonly unknown[],
  tokenRaw: string,
): boolean => {
  return cashuTokensAll.some((row) => {
    const record =
      row && typeof row === "object"
        ? (row as { rawToken?: unknown; token?: unknown; isDeleted?: unknown })
        : null;
    if (!record || record.isDeleted) return false;
    const stored = String(record.rawToken ?? record.token ?? "").trim();
    return stored && stored === tokenRaw;
  });
};

export const getCashuTokenMessageInfo = (
  text: string,
  cashuTokensAll: readonly unknown[],
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

const fromPromise = (
  parsed: Extract<CredoParsedMessage, { kind: "promise" }>,
): CredoTokenMessageInfo => {
  const promise = parsed.promise as CredoPromisePayload;
  const amount = Number(promise.amount ?? 0) || 0;
  return {
    tokenRaw: parsed.token,
    amount: amount > 0 ? amount : null,
    isValid: parsed.isValid,
    kind: "promise",
    issuer: String(promise.issuer ?? "").trim() || null,
    recipient: String(promise.recipient ?? "").trim() || null,
    expiresAtSec:
      Number(promise.expires_at ?? 0) > 0 ? Number(promise.expires_at) : null,
  };
};

const fromSettlement = (
  parsed: Extract<CredoParsedMessage, { kind: "settlement" }>,
): CredoTokenMessageInfo => {
  const settlement = parsed.settlement as CredoSettlementPayload;
  const amount = Number(settlement.amount ?? 0) || 0;
  return {
    tokenRaw: parsed.token,
    amount: amount > 0 ? amount : null,
    isValid: parsed.isValid,
    kind: "settlement",
    issuer: String(settlement.issuer ?? "").trim() || null,
    recipient: String(settlement.recipient ?? "").trim() || null,
    expiresAtSec: null,
  };
};

export const getCredoTokenMessageInfo = (
  text: string,
): CredoTokenMessageInfo | null => {
  const parsed = parseCredoMessage(text);
  if (!parsed) return null;
  return parsed.kind === "promise"
    ? fromPromise(parsed)
    : fromSettlement(parsed);
};
