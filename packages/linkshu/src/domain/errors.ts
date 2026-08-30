import { Schema } from "effect";
import {
  Amount,
  CurrencyUnit,
  KeysetId,
  MintUrl,
  NonNegativeAmount,
  QuoteId,
  TokenRowId,
} from "./primitives";

/**
 * Every failure the package reports is a `Schema.TaggedError`: serializable
 * by design so callers can persist it (token rows carry their last failure),
 * branch on `_tag`, and render it without string matching.
 *
 * The split between `MintUnreachable` (transient: network, timeout, 5xx —
 * retry later, never mark state) and `MintRejected` (definitive protocol
 * rejection) is the package's error-classification rule; internals map raw
 * cashu-ts/mint failures onto it and the raw error never crosses the
 * boundary.
 */

/** No token found in the given text, or the token could not be decoded. */
export class TokenParseFailed extends Schema.TaggedError<TokenParseFailed>()(
  "TokenParseFailed",
  {
    reason: Schema.Literal(
      "empty",
      "no-token-found",
      "undecodable",
      "no-proofs",
      "multiple-mints",
    ),
    detail: Schema.NullOr(Schema.String),
  },
) {}

/** Dedup by token text: this token already has a row (any state). */
export class TokenAlreadyKnown extends Schema.TaggedError<TokenAlreadyKnown>()(
  "TokenAlreadyKnown",
  {
    rowId: TokenRowId,
  },
) {}

/** The mint definitively reported the proofs as spent (NUT-07 / code 11001). */
export class TokenAlreadySpent extends Schema.TaggedError<TokenAlreadySpent>()(
  "TokenAlreadySpent",
  {
    mint: MintUrl,
  },
) {}

/** Transient failure talking to the mint; retrying later may succeed. */
export class MintUnreachable extends Schema.TaggedError<MintUnreachable>()(
  "MintUnreachable",
  {
    mint: MintUrl,
    detail: Schema.NullOr(Schema.String),
  },
) {}

/** Definitive protocol rejection by the mint (NUT error code when known). */
export class MintRejected extends Schema.TaggedError<MintRejected>()(
  "MintRejected",
  {
    mint: MintUrl,
    code: Schema.NullOr(Schema.Int),
    detail: Schema.String,
  },
) {}

export class InsufficientFunds extends Schema.TaggedError<InsufficientFunds>()(
  "InsufficientFunds",
  {
    mint: MintUrl,
    required: Amount,
    available: NonNegativeAmount,
  },
) {}

export class QuoteExpired extends Schema.TaggedError<QuoteExpired>()(
  "QuoteExpired",
  {
    quoteId: QuoteId,
    mint: MintUrl,
  },
) {}

/** The mint accepted the melt but the Lightning payment did not settle. */
export class PaymentFailed extends Schema.TaggedError<PaymentFailed>()(
  "PaymentFailed",
  {
    mint: MintUrl,
    quoteId: QuoteId,
    detail: Schema.NullOr(Schema.String),
  },
) {}

/**
 * The cross-context lease protecting this deterministic counter could not be
 * acquired in time; another tab/process holds it. Nothing was derived.
 */
export class CounterLockTimeout extends Schema.TaggedError<CounterLockTimeout>()(
  "CounterLockTimeout",
  {
    mint: MintUrl,
    unit: CurrencyUnit,
    keysetId: KeysetId,
  },
) {}

export class TokenRowNotFound extends Schema.TaggedError<TokenRowNotFound>()(
  "TokenRowNotFound",
  {
    rowId: TokenRowId,
  },
) {}
