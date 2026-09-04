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
 * Topup's durable bookkeeping, next to the deterministic counters and keyed
 * the same way. A record is written before every network call that could
 * strand funds, so an interrupted topup is always reconstructible from
 * storage alone: the quote to poll, and the counter slots a mint attempt has
 * already burned.
 */

export const PENDING_TOPUP_KEY_PREFIX = "linkshu.pendingTopup.";

/**
 * Poll deadline for quotes without a mint-stated expiry: past it the poll
 * ends at the next mint-confirmed UNPAID answer instead of running forever.
 */
export const PENDING_TOPUP_TTL_SECONDS = 24 * 60 * 60;

export class PendingTopup extends Schema.Class<PendingTopup>("PendingTopup")({
  quoteId: QuoteId,
  mint: MintUrl,
  unit: CurrencyUnit,
  keysetId: KeysetId,
  amount: Amount,
  invoice: Bolt11Invoice,
  /** Mint-stated quote expiry; null when the mint sets none. */
  expiresAt: Schema.NullOr(UnixSeconds),
  createdAt: UnixSeconds,
  /**
   * First deterministic slot reserved for this quote's mint attempt, or null
   * before any attempt. Set (and persisted) before the outputs are derived,
   * so a resumed attempt re-derives exactly the same blinded messages instead
   * of burning a second block.
   */
  mintCounter: Schema.NullOr(Schema.Int),
  /** NUT-20 locked quote: minting needs the owner's key. Absent in records written before adoption existed. */
  locked: Schema.optionalWith(Schema.Boolean, { default: () => false }),
}) {}

export const pendingTopupKey = (mint: MintUrl, quoteId: QuoteId): string =>
  PENDING_TOPUP_KEY_PREFIX + [mint, quoteId].map(encodeURIComponent).join(".");

const encodePending = Schema.encodeSync(Schema.parseJson(PendingTopup));
const decodePending = Schema.decodeUnknownOption(
  Schema.parseJson(PendingTopup),
);

export const writePendingTopup = (
  kv: KeyValueStoreService,
  pending: PendingTopup,
): Effect.Effect<void> =>
  kv.set(
    pendingTopupKey(pending.mint, pending.quoteId),
    encodePending(pending),
  );

export const removePendingTopup = (
  kv: KeyValueStoreService,
  pending: PendingTopup,
): Effect.Effect<void> =>
  kv.remove(pendingTopupKey(pending.mint, pending.quoteId));

export const readPendingTopup = (
  kv: KeyValueStoreService,
  mint: MintUrl,
  quoteId: QuoteId,
): Effect.Effect<PendingTopup | null> =>
  Effect.map(kv.get(pendingTopupKey(mint, quoteId)), (raw) => {
    const decoded = decodePending(raw);
    return decoded._tag === "Some" ? decoded.value : null;
  });

/** Every stored record; entries that no longer decode are dropped. */
export const readPendingTopups = (
  kv: KeyValueStoreService,
): Effect.Effect<ReadonlyArray<PendingTopup>> =>
  Effect.gen(function* () {
    const pendings: PendingTopup[] = [];
    for (const key of yield* kv.listKeys(PENDING_TOPUP_KEY_PREFIX)) {
      const decoded = decodePending(yield* kv.get(key));
      if (decoded._tag === "Some") pendings.push(decoded.value);
    }
    return pendings;
  });

export const deadlineOf = (pending: PendingTopup): number =>
  pending.expiresAt ?? pending.createdAt + PENDING_TOPUP_TTL_SECONDS;
