import { Effect } from "effect";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { CashuSeed } from "../ports/CashuSeed";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { ReceiveDraft, ReceiveError, ReceiveReceipt } from "./domain";

/**
 * Receiving a token is one call: extract and decode the text, dedup against
 * stored rows by token text, re-sign the proofs at the mint with
 * deterministic outputs (recovering counter collisions via targeted NUT-09
 * lookups), and persist the row through its lifecycle (fresh → `accepted`,
 * or `error` carrying the serialized failure on definitive rejection —
 * transient failures leave no `error` row behind).
 */
export class Receive extends Effect.Service<Receive>()("linkshu/Receive", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* CashuSeed;
    yield* KeyValueStore;
    yield* TokenStore;
    yield* Inspector.orNoop;

    const receive = (
      draft: ReceiveDraft,
    ): Effect.Effect<ReceiveReceipt, ReceiveError> =>
      notImplemented("receive.receive", { draft });

    return { receive } as const;
  }),
}) {}
