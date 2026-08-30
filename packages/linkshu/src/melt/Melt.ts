import { Effect } from "effect";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { CashuSeed } from "../ports/CashuSeed";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { MeltDraft, MeltError, MeltQuote, MeltReceipt } from "./domain";

/**
 * Paying a bolt11 invoice from the wallet: quote, swap `amount + feeReserve`
 * out (fee-inclusive), melt, and account NUT-08 blank outputs by advancing
 * the deterministic counter past the full blank range — not just the change
 * actually returned — so orphaned blind signatures at the mint can never
 * collide with later derivations. Change and any post-swap remainder are
 * persisted as `accepted` rows before the receipt resolves; a failure after
 * the swap loses no funds.
 */
export class Melt extends Effect.Service<Melt>()("linkshu/Melt", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* CashuSeed;
    yield* KeyValueStore;
    yield* TokenStore;
    yield* Inspector.orNoop;

    /** Price the payment without touching any stored token. */
    const quote = (draft: MeltDraft): Effect.Effect<MeltQuote, MeltError> =>
      notImplemented("melt.quote", { draft });

    const melt = (draft: MeltDraft): Effect.Effect<MeltReceipt, MeltError> =>
      notImplemented("melt.melt", { draft });

    return { quote, melt } as const;
  }),
}) {}
