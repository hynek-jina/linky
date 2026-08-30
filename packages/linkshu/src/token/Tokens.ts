import { Effect, Schema } from "effect";
import { InvalidTokenTransition, WalletBalances, WalletToken } from "./domain";
import { TokenRowNotFound } from "../domain/errors";
import { Amount, TokenRowId } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { TokenStore } from "../ports/TokenStore";
import type { ReceiveError, ReceiveReceipt } from "../receive/domain";

export class DeletedSpentToken extends Schema.Class<DeletedSpentToken>(
  "DeletedSpentToken",
)({
  rowId: TokenRowId,
  amount: Amount,
}) {}

/**
 * Read model and lifecycle transitions over the stored rows. The transition
 * functions are the only way rows change state outside the operation
 * verticals — platforms never write states themselves.
 */
export class Tokens extends Effect.Service<Tokens>()("linkshu/Tokens", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* TokenStore;
    yield* Inspector.orNoop;

    /** All live rows enriched with metadata derived from their token text. */
    const list: Effect.Effect<ReadonlyArray<WalletToken>> =
      notImplemented("tokens.list");

    const balances: Effect.Effect<WalletBalances> =
      notImplemented("tokens.balances");

    /** `accepted` → `reserved`: earmark a row for a pending handover. */
    const reserve = (
      rowId: TokenRowId,
    ): Effect.Effect<void, TokenRowNotFound | InvalidTokenTransition> =>
      notImplemented("tokens.reserve", { rowId });

    /** `accepted` | `reserved` → `issued`: the token left as a QR/share. */
    const markIssued = (
      rowId: TokenRowId,
    ): Effect.Effect<void, TokenRowNotFound | InvalidTokenTransition> =>
      notImplemented("tokens.markIssued", { rowId });

    /** → `externalized`: the token was handed off outside the app. */
    const markExternalized = (
      rowId: TokenRowId,
    ): Effect.Effect<void, TokenRowNotFound | InvalidTokenTransition> =>
      notImplemented("tokens.markExternalized", { rowId });

    /**
     * Bring an emitted or errored row back to `accepted` by re-receiving its
     * token text (fresh proofs; the old encoding dies at the mint).
     */
    const returnToWallet = (
      rowId: TokenRowId,
    ): Effect.Effect<ReceiveReceipt, ReceiveError | TokenRowNotFound> =>
      notImplemented("tokens.returnToWallet", { rowId });

    /** Remove every row NUT-07 has definitively marked spent. */
    const deleteSpent: Effect.Effect<ReadonlyArray<DeletedSpentToken>> =
      notImplemented("tokens.deleteSpent");

    return {
      list,
      balances,
      reserve,
      markIssued,
      markExternalized,
      returnToWallet,
      deleteSpent,
    } as const;
  }),
}) {}
