import { Effect } from "effect";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { CashuSeed } from "../ports/CashuSeed";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type {
  AutoswapClaimResult,
  AutoswapDraft,
  AutoswapError,
  AutoswapReceipt,
} from "./domain";

/**
 * Consolidating a foreign mint's balance into the main mint: quote a topup
 * at the target, melt the source balance against that invoice (probing fees
 * first and stepping the amount down on shortage), persist the claim before
 * touching rows, then mint at the target. Pending claims survive crashes and
 * are drained by `resumePendingClaims`; a partial melt's remainder is
 * re-persisted as `accepted` so funds are never orphaned. When to trigger a
 * swap (thresholds, debounce, opt-in) stays caller policy.
 */
export class Autoswap extends Effect.Service<Autoswap>()("linkshu/Autoswap", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* CashuSeed;
    yield* KeyValueStore;
    yield* TokenStore;
    yield* Inspector.orNoop;

    /** Move the source mint's whole spendable balance to the target mint. */
    const claim = (
      draft: AutoswapDraft,
    ): Effect.Effect<AutoswapReceipt, AutoswapError> =>
      notImplemented("autoswap.claim", { draft });

    /** One pass over persisted pending claims from any earlier session. */
    const resumePendingClaims: Effect.Effect<
      ReadonlyArray<AutoswapClaimResult>
    > = notImplemented("autoswap.resumePendingClaims");

    return { claim, resumePendingClaims } as const;
  }),
}) {}
