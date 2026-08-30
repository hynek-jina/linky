import { Effect } from "effect";
import type { Scope } from "effect";
import type { MintRejected, MintUnreachable } from "../domain/errors";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { CashuSeed } from "../ports/CashuSeed";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { TopupDraft, TopupHandle } from "./domain";

/**
 * Self-recovering Lightning topup. `start` creates a mint quote, persists it
 * as pending, and polls until it is claimable; minting recovers counter
 * collisions (including reclaiming already-signed outputs via NUT-09) and
 * records the claim durably before the row is written, so a crash between
 * the two is healed on resume rather than double-minted. A quote whose
 * deterministic recovery is exhausted is dropped instead of retried forever.
 */
export class Topup extends Effect.Service<Topup>()("linkshu/Topup", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* CashuSeed;
    yield* KeyValueStore;
    yield* TokenStore;
    yield* Inspector.orNoop;

    const start = (
      draft: TopupDraft,
    ): Effect.Effect<
      TopupHandle,
      MintUnreachable | MintRejected,
      Scope.Scope
    > => notImplemented("topup.start", { draft });

    /**
     * Re-attach to quotes persisted by earlier sessions (reload, crash).
     * Expired pending quotes are pruned rather than returned.
     */
    const resumePending: Effect.Effect<
      ReadonlyArray<TopupHandle>,
      never,
      Scope.Scope
    > = notImplemented("topup.resumePending");

    return { start, resumePending } as const;
  }),
}) {}
