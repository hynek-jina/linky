import { Effect } from "effect";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { KeyValueStore } from "../ports/KeyValueStore";
import type {
  FeeProbeDraft,
  FeeProbeError,
  LightningFeeProbeResult,
} from "./domain";

/**
 * Lightning fee estimation. NUT-06 publishes no Lightning fee, so the only
 * way to learn one is to request a melt quote for a real invoice: quote a
 * mint quote at `probeMint`, ask `mint` to price melting against it, and
 * read the fee reserve. Results are cached in storage per mint with a
 * day-scale TTL; no funds move. Cashu-side input fees (`input_fee_ppk`) are
 * a separate figure, exposed on `MintInfo`.
 */
export class FeeProbe extends Effect.Service<FeeProbe>()("linkshu/FeeProbe", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* KeyValueStore;
    yield* Inspector.orNoop;

    const probeLightningFee = (
      draft: FeeProbeDraft,
    ): Effect.Effect<LightningFeeProbeResult, FeeProbeError> =>
      notImplemented("feeProbe.probeLightningFee", { draft });

    return { probeLightningFee } as const;
  }),
}) {}
