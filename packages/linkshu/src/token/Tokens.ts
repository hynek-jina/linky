import { Effect, Schema } from "effect";
import { parseTokenText } from "./codec";
import {
  InvalidTokenTransition,
  MintBalance,
  WalletBalances,
  WalletToken,
} from "./domain";
import { TokenRowNotFound } from "../domain/errors";
import { Amount, NonNegativeAmount, TokenRowId } from "../domain/primitives";
import type { MintUrl } from "../domain/primitives";
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
    const tokenStore = yield* TokenStore;
    // Contract-level dependency declaration; used once the vertical lands.
    yield* Inspector.orNoop;

    /** All live rows enriched with metadata derived from their token text. */
    const list: Effect.Effect<ReadonlyArray<WalletToken>> =
      notImplemented("tokens.list");

    const balances: Effect.Effect<WalletBalances> = Effect.map(
      tokenStore.loadAll,
      (rows) => {
        const perMint = new Map<MintUrl, number>();
        for (const row of rows) {
          if (row.state !== "accepted") continue;
          const parsed = parseTokenText(row.tokenText);
          if (parsed === null || parsed.mint === null) continue;
          perMint.set(
            parsed.mint,
            (perMint.get(parsed.mint) ?? 0) + parsed.amount,
          );
        }
        const amounts = [...perMint.values()];
        return new WalletBalances({
          total: NonNegativeAmount.make(amounts.reduce((a, b) => a + b, 0)),
          spendable: NonNegativeAmount.make(Math.max(0, ...amounts)),
          perMint: [...perMint].map(
            ([mint, amount]) =>
              new MintBalance({
                mint,
                amount: NonNegativeAmount.make(amount),
              }),
          ),
        });
      },
    );

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
