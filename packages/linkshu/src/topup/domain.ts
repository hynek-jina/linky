import { Effect, Schema } from "effect";
import {
  CounterLockTimeout,
  MintRejected,
  MintUnreachable,
  QuoteExpired,
} from "../domain/errors";
import {
  Amount,
  Bolt11Invoice,
  MintUrl,
  QuoteId,
  TokenRowId,
  TokenText,
  UnixSeconds,
} from "../domain/primitives";

export class TopupDraft extends Schema.Class<TopupDraft>("TopupDraft")({
  mint: MintUrl,
  amount: Amount,
}) {}

/** The mint quote to display: pay `invoice` and the topup completes itself. */
export class TopupQuote extends Schema.Class<TopupQuote>("TopupQuote")({
  quoteId: QuoteId,
  mint: MintUrl,
  amount: Amount,
  invoice: Bolt11Invoice,
  expiresAt: Schema.NullOr(UnixSeconds),
}) {}

export class TopupReceipt extends Schema.Class<TopupReceipt>("TopupReceipt")({
  rowId: TokenRowId,
  tokenText: TokenText,
  mint: MintUrl,
  amount: Amount,
  quoteId: QuoteId,
}) {}

export const TopupError = Schema.Union(
  MintUnreachable,
  MintRejected,
  QuoteExpired,
  CounterLockTimeout,
);
export type TopupError = typeof TopupError.Type;

/**
 * A running topup: `quote` is available immediately for display; `result`
 * resolves once the invoice is paid and the proofs are minted and persisted.
 * The handle is scoped — closing the scope stops the polling, while the
 * persisted quote stays claimable through `resumePending` for a day.
 */
export interface TopupHandle {
  readonly quote: TopupQuote;
  readonly result: Effect.Effect<TopupReceipt, TopupError>;
}
