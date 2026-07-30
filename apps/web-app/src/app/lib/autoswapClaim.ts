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
import {
  isClaimableMintQuoteState,
  readMintQuoteState,
} from "../hooks/topup/topupMintQuoteState";
import { createCashuTokenId } from "./cashuTokenIdentity";
import {
  encodeStorageSegment,
  makeClaimedAutoswapQuoteStorageKey,
  readClaimedTopupQuoteFromStorage,
  type ClaimedTopupQuoteStorage,
} from "./topupQuoteStorage";
import { mintTopupProofs } from "./topupProofRecovery";

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
      claimed: ClaimedTopupQuoteStorage,
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

    const claimedBeforeRun = readClaimedTopupQuoteFromStorage(claimStorageKey);
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
