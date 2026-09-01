import { Schema } from "effect";
import {
  CounterLockTimeout,
  InsufficientFunds,
  MintRejected,
  MintUnreachable,
} from "../domain/errors";
import {
  Amount,
  CurrencyUnit,
  MintUrl,
  NonNegativeAmount,
  TokenRowId,
  TokenText,
} from "../domain/primitives";

export class SendDraft extends Schema.Class<SendDraft>("SendDraft")({
  mint: MintUrl,
  amount: Amount,
  memo: Schema.optional(Schema.NonEmptyString),
  /**
   * State the produced row starts in: `issued` for a token shown to someone
   * (QR/share, watched until claimed), `pending` for a token travelling out
   * through a messenger the caller confirms separately.
   */
  produceAs: Schema.Literal("issued", "pending"),
}) {}

export class SendReceipt extends Schema.Class<SendReceipt>("SendReceipt")({
  /** Row holding the produced send token, in the drafted state. */
  rowId: TokenRowId,
  tokenText: TokenText,
  mint: MintUrl,
  unit: CurrencyUnit,
  amount: Amount,
  /** Change kept after the swap; persisted as a fresh `accepted` row. */
  changeAmount: NonNegativeAmount,
  feePaid: NonNegativeAmount,
}) {}

export const SendError = Schema.Union(
  InsufficientFunds,
  MintUnreachable,
  MintRejected,
  CounterLockTimeout,
);
export type SendError = typeof SendError.Type;
