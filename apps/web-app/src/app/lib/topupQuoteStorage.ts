import type { TopupMintQuoteDraft } from "../hooks/topup/useTopupInvoiceQuoteEffects";
import { safeLocalStorageGet } from "../../utils/storage";

export interface PendingTopupQuoteStorage {
  amount: number;
  createdAtMs: number;
  invoice?: string | null;
  mintUrl: string;
  quote: string;
  unit: string | null;
}

export interface ClaimedTopupQuoteStorage {
  amount: number;
  claimedAtMs: number;
  mintUrl: string;
  quote: string;
  token: string;
  unit: string | null;
}

const PENDING_TOPUP_QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLAIMED_TOPUP_QUOTE_STORAGE_KEY_PREFIX = "linky.topup.claimed.v1";
const CLAIMED_AUTOSWAP_QUOTE_STORAGE_KEY_PREFIX = "linky.autoswap.claimed.v1";
const CLAIMED_TOPUP_QUOTE_LOCK_STORAGE_KEY_PREFIX = "linky.topup.claimLock.v1";

export const encodeStorageSegment = (value: string): string =>
  encodeURIComponent(String(value ?? "").trim());

export const isExpiredPendingTopupQuote = (createdAtMs: number): boolean =>
  Date.now() - createdAtMs > PENDING_TOPUP_QUOTE_MAX_AGE_MS;

export const isSameTopupMintQuote = (
  left: TopupMintQuoteDraft | null,
  right: TopupMintQuoteDraft | null,
): boolean => {
  if (!left || !right) return left === right;
  return (
    left.mintUrl === right.mintUrl &&
    left.quote === right.quote &&
    left.amount === right.amount &&
    left.unit === right.unit
  );
};

export const toTopupMintQuoteDraft = (
  value: PendingTopupQuoteStorage,
): TopupMintQuoteDraft => ({
  mintUrl: value.mintUrl,
  quote: value.quote,
  amount: value.amount,
  invoice: typeof value.invoice === "string" ? value.invoice : null,
  unit: value.unit,
});

export const toPendingTopupQuoteStorage = (
  value: TopupMintQuoteDraft,
): PendingTopupQuoteStorage => ({
  mintUrl: value.mintUrl,
  quote: value.quote,
  amount: value.amount,
  invoice: value.invoice,
  unit: value.unit,
  createdAtMs: Date.now(),
});

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

const isPendingTopupQuoteStorage = (
  value: unknown,
): value is PendingTopupQuoteStorage => {
  const amount = readObjectField(value, "amount");
  const createdAtMs = readObjectField(value, "createdAtMs");
  const invoice = readObjectField(value, "invoice");
  const mintUrl = readObjectField(value, "mintUrl");
  const quote = readObjectField(value, "quote");
  const unit = readObjectField(value, "unit");

  return (
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount > 0 &&
    typeof createdAtMs === "number" &&
    Number.isFinite(createdAtMs) &&
    (invoice === undefined ||
      invoice === null ||
      typeof invoice === "string") &&
    typeof mintUrl === "string" &&
    mintUrl.trim().length > 0 &&
    typeof quote === "string" &&
    quote.trim().length > 0 &&
    (unit === null || typeof unit === "string")
  );
};

const isClaimedTopupQuoteStorage = (
  value: unknown,
): value is ClaimedTopupQuoteStorage => {
  const amount = readObjectField(value, "amount");
  const claimedAtMs = readObjectField(value, "claimedAtMs");
  const mintUrl = readObjectField(value, "mintUrl");
  const quote = readObjectField(value, "quote");
  const token = readObjectField(value, "token");
  const unit = readObjectField(value, "unit");

  return (
    typeof amount === "number" &&
    typeof claimedAtMs === "number" &&
    typeof mintUrl === "string" &&
    typeof quote === "string" &&
    typeof token === "string" &&
    (unit === null || typeof unit === "string")
  );
};

const makeClaimStorageKey = (
  prefix: string,
  args: { mintUrl: string; ownerId: string; quote: string },
): string =>
  `${prefix}.${encodeStorageSegment(args.ownerId)}.${encodeStorageSegment(
    args.mintUrl,
  )}.${encodeStorageSegment(args.quote)}`;

export const makeClaimedTopupQuoteStorageKey = (args: {
  mintUrl: string;
  ownerId: string;
  quote: string;
}): string => makeClaimStorageKey(CLAIMED_TOPUP_QUOTE_STORAGE_KEY_PREFIX, args);

export const makeClaimedAutoswapQuoteStorageKey = (args: {
  mintUrl: string;
  ownerId: string;
  quote: string;
}): string =>
  makeClaimStorageKey(CLAIMED_AUTOSWAP_QUOTE_STORAGE_KEY_PREFIX, args);

export const makeClaimedTopupQuoteLockKey = (args: {
  mintUrl: string;
  ownerId: string;
  quote: string;
}): string =>
  makeClaimStorageKey(CLAIMED_TOPUP_QUOTE_LOCK_STORAGE_KEY_PREFIX, args);

export const readClaimedTopupQuoteFromStorage = (
  key: string,
): ClaimedTopupQuoteStorage | null => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isClaimedTopupQuoteStorage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const readPendingTopupQuoteFromStorage = (
  key: string,
): PendingTopupQuoteStorage | null => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isPendingTopupQuoteStorage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const isLikelyCorsOrNetworkError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("cors") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  );
};
