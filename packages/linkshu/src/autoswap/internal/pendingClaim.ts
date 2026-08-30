import { Effect, Schema } from "effect";
import {
  Amount,
  Bolt11Invoice,
  CurrencyUnit,
  KeysetId,
  MintUrl,
  QuoteId,
  UnixSeconds,
} from "../../domain/primitives";
import type { KeyValueStoreService } from "../../ports/KeyValueStore";

/**
 * Autoswap's durable bookkeeping, keyed like topup's and holding the same
 * claim-relevant fields (`ClaimableQuote`) plus where the funds came from. It
 * is written before the melt that pays the target mint quote's invoice, so a
 * crash anywhere after the payment leaves a record that names the quote to
 * mint and the counter slots an attempt already burned.
 */

export const PENDING_AUTOSWAP_CLAIM_KEY_PREFIX =
  "linkshu.pendingAutoswapClaim.";

/**
 * Past it, a record the mint answers about but never lets progress — still
 * UNPAID (the melt never happened) or rejecting the claim — is retired. A
 * mint that gives no answer at all never retires a record.
 */
export const PENDING_AUTOSWAP_CLAIM_TTL_SECONDS = 24 * 60 * 60;

export class PendingAutoswapClaim extends Schema.Class<PendingAutoswapClaim>(
  "PendingAutoswapClaim",
)({
  /** Mint quote at the target mint — what the claim mints against. */
  quoteId: QuoteId,
  /** The target (preferred) mint; `ClaimableQuote` names this field `mint`. */
  mint: MintUrl,
  unit: CurrencyUnit,
  keysetId: KeysetId,
  amount: Amount,
  invoice: Bolt11Invoice,
  /** Mint the funds were melted out of; diagnostics only. */
  sourceMint: MintUrl,
  createdAt: UnixSeconds,
  /**
   * First deterministic slot reserved for this quote's mint attempt, or null
   * before any attempt. Persisted before the outputs are derived, so a
   * resumed attempt re-derives exactly the same blinded messages instead of
   * burning a second block.
   */
  mintCounter: Schema.NullOr(Schema.Int),
}) {}

export const pendingAutoswapClaimKey = (
  mint: MintUrl,
  quoteId: QuoteId,
): string =>
  PENDING_AUTOSWAP_CLAIM_KEY_PREFIX +
  [mint, quoteId].map(encodeURIComponent).join(".");

const encodePending = Schema.encodeSync(Schema.parseJson(PendingAutoswapClaim));
const decodePending = Schema.decodeUnknownOption(
  Schema.parseJson(PendingAutoswapClaim),
);

export const writePendingClaim = (
  kv: KeyValueStoreService,
  pending: PendingAutoswapClaim,
): Effect.Effect<void> =>
  kv.set(
    pendingAutoswapClaimKey(pending.mint, pending.quoteId),
    encodePending(pending),
  );

export const removePendingClaim = (
  kv: KeyValueStoreService,
  pending: PendingAutoswapClaim,
): Effect.Effect<void> =>
  kv.remove(pendingAutoswapClaimKey(pending.mint, pending.quoteId));

export const deadlineOf = (pending: PendingAutoswapClaim): number =>
  pending.createdAt + PENDING_AUTOSWAP_CLAIM_TTL_SECONDS;

/** Every stored record; entries that no longer decode are dropped. */
export const readPendingClaims = (
  kv: KeyValueStoreService,
): Effect.Effect<ReadonlyArray<PendingAutoswapClaim>> =>
  Effect.gen(function* () {
    const pendings: PendingAutoswapClaim[] = [];
    for (const key of yield* kv.listKeys(PENDING_AUTOSWAP_CLAIM_KEY_PREFIX)) {
      const decoded = decodePending(yield* kv.get(key));
      if (decoded._tag === "Some") pendings.push(decoded.value);
    }
    return pendings;
  });
