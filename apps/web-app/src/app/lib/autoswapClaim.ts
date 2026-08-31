import * as Evolu from "@evolu/common";
import { createLoadedCashuWallet } from "../../utils/cashuWallet";
import { getCashuDeterministicSeedFromStorage } from "../../utils/cashuDeterministic";
import { isCashuOutputsAlreadySignedError } from "../../utils/cashuErrors";
import { getCashuLib } from "../../utils/cashuLib";
import { LOCAL_PENDING_AUTOSWAP_CLAIM_STORAGE_KEY_PREFIX } from "../../utils/constants";
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSetJson,
} from "../../utils/storage";
import { getUnknownErrorMessage } from "../../utils/unknown";
import { createCashuTokenId } from "./cashuTokenIdentity";
import { mintTopupProofs } from "./topupProofRecovery";

const CLAIMED_AUTOSWAP_QUOTE_STORAGE_KEY_PREFIX = "linky.autoswap.claimed.v1";

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

const encodeStorageSegment = (value: string): string =>
  encodeURIComponent(String(value ?? "").trim());

export const makeClaimedAutoswapQuoteStorageKey = (args: {
  mintUrl: string;
  ownerId: string;
  quote: string;
}): string =>
  `${CLAIMED_AUTOSWAP_QUOTE_STORAGE_KEY_PREFIX}.${encodeStorageSegment(
    args.ownerId,
  )}.${encodeStorageSegment(args.mintUrl)}.${encodeStorageSegment(args.quote)}`;

export interface ClaimedAutoswapQuoteStorage {
  amount: number;
  claimedAtMs: number;
  mintUrl: string;
  quote: string;
  token: string;
  unit: string | null;
}

const isClaimedAutoswapQuoteStorage = (
  value: unknown,
): value is ClaimedAutoswapQuoteStorage => {
  const unit = readObjectField(value, "unit");
  return (
    typeof readObjectField(value, "amount") === "number" &&
    typeof readObjectField(value, "claimedAtMs") === "number" &&
    typeof readObjectField(value, "mintUrl") === "string" &&
    typeof readObjectField(value, "quote") === "string" &&
    typeof readObjectField(value, "token") === "string" &&
    (unit === null || typeof unit === "string")
  );
};

export const readClaimedAutoswapQuoteFromStorage = (
  key: string,
): ClaimedAutoswapQuoteStorage | null => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isClaimedAutoswapQuoteStorage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Raw bolt11 mint-quote request; autoswap sizes target-mint invoices with it. */
export const requestMintQuoteBolt11 = async (args: {
  amountSat: number;
  mintUrl: string;
  signal?: AbortSignal;
}): Promise<{ invoice: string; quoteId: string }> => {
  const { amountSat, mintUrl } = args;
  const targetUrl = `${mintUrl.replace(/\/+$/, "")}/v1/mint/quote/bolt11`;

  const quoteRes = await fetch(targetUrl, {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    mode: "cors",
    body: JSON.stringify({ amount: amountSat, unit: "sat" }),
    ...(args.signal ? { signal: args.signal } : {}),
  });

  if (!quoteRes.ok) {
    throw new Error(`Mint quote HTTP ${quoteRes.status}`);
  }

  const rawText = await quoteRes.text();
  let mintQuote: Record<string, unknown> | null = null;
  try {
    const parsed = rawText ? JSON.parse(rawText) : null;
    mintQuote = isRecord(parsed) ? parsed : null;
  } catch {
    throw new Error(
      `Mint quote parse failed (${quoteRes.status}): ${rawText.slice(0, 200)}`,
    );
  }

  const quoteId = String(mintQuote?.quote ?? mintQuote?.id ?? "").trim();
  const invoice = String(
    mintQuote?.request ?? mintQuote?.pr ?? mintQuote?.paymentRequest ?? "",
  ).trim();

  if (!quoteId || !invoice) {
    throw new Error(
      `Missing mint quote (quote=${quoteId || "-"}, invoice=${invoice || "-"})`,
    );
  }

  return { quoteId, invoice };
};

export const readMintQuoteState = (value: unknown): string => {
  const state = readObjectField(value, "state");
  if (state !== undefined && state !== null) return String(state);
  const status = readObjectField(value, "status");
  return String(status ?? "");
};

const readMintQuoteEnumValue = (
  value: unknown,
  field: "ISSUED" | "PAID",
): string | null => {
  const enumValue = readObjectField(value, field);
  if (enumValue === undefined || enumValue === null) return null;
  return String(enumValue);
};

const normalizeMintQuoteState = (value: string): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const isClaimableMintQuoteState = (
  state: string,
  mintQuoteStateEnum: unknown,
): boolean => {
  const normalized = normalizeMintQuoteState(state);
  if (!normalized) return false;
  if (normalized === "paid" || normalized === "issued") return true;

  const paidState = readMintQuoteEnumValue(mintQuoteStateEnum, "PAID");
  if (normalizeMintQuoteState(paidState ?? "") === normalized) return true;

  const issuedState = readMintQuoteEnumValue(mintQuoteStateEnum, "ISSUED");
  return normalizeMintQuoteState(issuedState ?? "") === normalized;
};

export interface AutoswapPendingClaim {
  amount: number;
  createdAtMs: number;
  invoice: string;
  mintUrl: string;
  quote: string;
  unit: string;
}

const isAutoswapPendingClaim = (
  value: unknown,
): value is AutoswapPendingClaim => {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "amount") === "number" &&
    typeof Reflect.get(value, "createdAtMs") === "number" &&
    typeof Reflect.get(value, "invoice") === "string" &&
    typeof Reflect.get(value, "mintUrl") === "string" &&
    typeof Reflect.get(value, "quote") === "string" &&
    typeof Reflect.get(value, "unit") === "string"
  );
};

export const makePendingAutoswapClaimsKey = (ownerId: string): string =>
  `${LOCAL_PENDING_AUTOSWAP_CLAIM_STORAGE_KEY_PREFIX}.${encodeStorageSegment(
    ownerId,
  )}`;

export const readPendingAutoswapClaims = (
  key: string,
): AutoswapPendingClaim[] => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAutoswapPendingClaim) : [];
  } catch {
    return [];
  }
};

const writePendingAutoswapClaims = (
  key: string,
  claims: AutoswapPendingClaim[],
): void => {
  if (claims.length === 0) {
    safeLocalStorageRemove(key);
    return;
  }
  safeLocalStorageSetJson(key, claims);
};

export const appendPendingAutoswapClaim = (
  key: string,
  claim: AutoswapPendingClaim,
): void => {
  const next = readPendingAutoswapClaims(key).filter(
    (entry) => entry.quote !== claim.quote || entry.mintUrl !== claim.mintUrl,
  );
  next.push(claim);
  writePendingAutoswapClaims(key, next);
};

export const removePendingAutoswapClaim = (
  key: string,
  args: { mintUrl: string; quote: string },
): void => {
  const next = readPendingAutoswapClaims(key).filter(
    (entry) => !(entry.quote === args.quote && entry.mintUrl === args.mintUrl),
  );
  writePendingAutoswapClaims(key, next);
};

interface AutoswapClaimContext {
  upsert: (
    table: "cashuToken",
    payload: {
      id: ReturnType<typeof createCashuTokenId>;
      token: typeof Evolu.NonEmptyString.Type;
      state: typeof Evolu.NonEmptyString100.Type;
    },
    options?: { ownerId: Evolu.OwnerId },
  ) => { ok: boolean; error?: unknown };
  isCashuTokenKnownAny: (token: string) => boolean;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
}

type AutoswapClaimOutcome =
  | { kind: "claimed" }
  | { kind: "in_flight" }
  | { kind: "not_claimable_yet" }
  | { kind: "dropped"; reason: string }
  | { kind: "failed"; reason: string };

type LoadedCashuWallet = Awaited<ReturnType<typeof createLoadedCashuWallet>>;

export const claimAutoswapPendingEntry = async (args: {
  claim: AutoswapPendingClaim;
  claimOwnerKey: string;
  claimsKey: string;
  ctx: AutoswapClaimContext;
  inFlightSet: Set<string>;
  walletCache?: Map<string, LoadedCashuWallet>;
}): Promise<AutoswapClaimOutcome> => {
  const key = `${args.claim.mintUrl}|${args.claim.quote}`;
  if (args.inFlightSet.has(key)) return { kind: "in_flight" };
  args.inFlightSet.add(key);

  try {
    const claimStorageKey = makeClaimedAutoswapQuoteStorageKey({
      ownerId: args.claimOwnerKey,
      mintUrl: args.claim.mintUrl,
      quote: args.claim.quote,
    });
    const insertClaimedToken = async (
      claimed: ClaimedAutoswapQuoteStorage,
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (args.ctx.isCashuTokenKnownAny(claimed.token)) return { ok: true };

      const token = Evolu.NonEmptyString.fromUnknown(claimed.token);
      const state = Evolu.NonEmptyString100.fromUnknown("accepted");
      if (!token.ok || !state.ok) {
        return { ok: false, reason: "invalid claimed token" };
      }

      const ownerId = await args.ctx.resolveOwnerIdForWrite();
      const payload = {
        id: createCashuTokenId(claimed.token),
        token: token.value,
        state: state.value,
      };
      const result = ownerId
        ? args.ctx.upsert("cashuToken", payload, { ownerId })
        : args.ctx.upsert("cashuToken", payload);
      return result.ok
        ? { ok: true }
        : {
            ok: false,
            reason: getUnknownErrorMessage(result.error, "unknown"),
          };
    };

    const claimedBeforeRun =
      readClaimedAutoswapQuoteFromStorage(claimStorageKey);
    if (claimedBeforeRun) {
      const restored = await insertClaimedToken(claimedBeforeRun);
      if (!restored.ok) return { kind: "failed", reason: restored.reason };
      removePendingAutoswapClaim(args.claimsKey, {
        mintUrl: args.claim.mintUrl,
        quote: args.claim.quote,
      });
      return { kind: "claimed" };
    }

    const { Mint, Wallet, MintQuoteState, getEncodedToken } =
      await getCashuLib();
    const deterministicSeed = getCashuDeterministicSeedFromStorage();
    const walletCacheKey = `${args.claim.mintUrl}|${args.claim.unit || "sat"}`;
    let wallet = args.walletCache?.get(walletCacheKey);
    if (!wallet) {
      wallet = await createLoadedCashuWallet({
        Mint,
        Wallet,
        mintUrl: args.claim.mintUrl,
        unit: args.claim.unit || "sat",
        ...(deterministicSeed
          ? { bip39seed: deterministicSeed.bip39seed }
          : {}),
      });
      args.walletCache?.set(walletCacheKey, wallet);
    }

    const status = await wallet.checkMintQuoteBolt11(args.claim.quote);
    if (
      !isClaimableMintQuoteState(readMintQuoteState(status), MintQuoteState)
    ) {
      return { kind: "not_claimable_yet" };
    }

    const unit = wallet.unit ?? args.claim.unit ?? "sat";
    const proofs = await mintTopupProofs({
      amount: args.claim.amount,
      mintUrl: args.claim.mintUrl,
      quoteId: args.claim.quote,
      unit,
      wallet,
    });
    const token = String(
      getEncodedToken({ mint: args.claim.mintUrl, proofs, unit }) ?? "",
    ).trim();
    if (!token) return { kind: "failed", reason: "empty token" };

    const claimed = {
      amount: args.claim.amount,
      claimedAtMs: Date.now(),
      mintUrl: args.claim.mintUrl,
      quote: args.claim.quote,
      token,
      unit,
    };
    safeLocalStorageSetJson(claimStorageKey, claimed);

    const inserted = await insertClaimedToken(claimed);
    if (!inserted.ok) return { kind: "failed", reason: inserted.reason };

    removePendingAutoswapClaim(args.claimsKey, {
      mintUrl: args.claim.mintUrl,
      quote: args.claim.quote,
    });
    return { kind: "claimed" };
  } catch (error) {
    if (isCashuOutputsAlreadySignedError(error)) {
      removePendingAutoswapClaim(args.claimsKey, {
        mintUrl: args.claim.mintUrl,
        quote: args.claim.quote,
      });
      return {
        kind: "dropped",
        reason: getUnknownErrorMessage(error, "outputs already signed"),
      };
    }
    return {
      kind: "failed",
      reason: getUnknownErrorMessage(error, "unknown"),
    };
  } finally {
    args.inFlightSet.delete(key);
  }
};
