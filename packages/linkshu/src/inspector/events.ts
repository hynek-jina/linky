import { Schema } from "effect";
import {
  Amount,
  CurrencyUnit,
  DeterministicCounter,
  KeysetId,
  MintUrl,
  NonNegativeAmount,
  QuoteId,
  TokenRowId,
} from "../domain/primitives";
import { TokenState } from "../token/domain";

/**
 * Diagnostic taps over everything linkshu does, emitted only when the
 * optional `Inspector` service is provided. `Schema.Unknown` fields carry
 * raw values for display; nothing in the package reads them back, and no
 * event ever carries seed material or proof secrets.
 */

/** A wallet operation finished, e.g. `name: "receive.receive"`. */
export class OperationSucceeded extends Schema.TaggedClass<OperationSucceeded>()(
  "OperationSucceeded",
  {
    name: Schema.String,
    params: Schema.Unknown,
    result: Schema.Unknown,
  },
) {}

export class OperationFailed extends Schema.TaggedClass<OperationFailed>()(
  "OperationFailed",
  {
    name: Schema.String,
    params: Schema.Unknown,
    error: Schema.Unknown,
  },
) {}

/** A stored token row changed state; `from` is null for fresh rows. */
export class TokenLifecycleChanged extends Schema.TaggedClass<TokenLifecycleChanged>()(
  "TokenLifecycleChanged",
  {
    rowId: TokenRowId,
    from: Schema.NullOr(TokenState),
    to: TokenState,
    reason: Schema.String,
  },
) {}

/** A deterministic counter moved — the audit trail for collision recovery. */
export class CounterAdvanced extends Schema.TaggedClass<CounterAdvanced>()(
  "CounterAdvanced",
  {
    mint: MintUrl,
    unit: CurrencyUnit,
    keysetId: KeysetId,
    from: DeterministicCounter,
    to: DeterministicCounter,
    reason: Schema.Literal("used", "collision-recovery", "restore"),
  },
) {}

/** A mint/melt quote was observed in a new state while a flow polled it. */
export class QuoteStateChanged extends Schema.TaggedClass<QuoteStateChanged>()(
  "QuoteStateChanged",
  {
    flow: Schema.Literal("topup", "autoswap", "melt"),
    quoteId: QuoteId,
    mint: MintUrl,
    state: Schema.String,
  },
) {}

/**
 * A mint's Lightning fee was measured. Both quote ids travel so a consumer
 * can correlate the row with the mint's own quote traffic on either side.
 */
export class LightningFeeProbed extends Schema.TaggedClass<LightningFeeProbed>()(
  "LightningFeeProbed",
  {
    mint: MintUrl,
    probeMint: MintUrl,
    /** Melt quote at `mint` — the priced side. */
    meltQuoteId: QuoteId,
    /** Mint quote at `probeMint` whose (unpaid) invoice was priced. */
    mintQuoteId: QuoteId,
    amount: Amount,
    feeReserve: NonNegativeAmount,
    percent: Schema.Number,
  },
) {}

export const LinkshuInspectorEvent = Schema.Union(
  OperationSucceeded,
  OperationFailed,
  TokenLifecycleChanged,
  CounterAdvanced,
  QuoteStateChanged,
  LightningFeeProbed,
);
export type LinkshuInspectorEvent = typeof LinkshuInspectorEvent.Type;
