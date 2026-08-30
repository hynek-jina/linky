import { Effect } from "effect";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { CashuSeed } from "../ports/CashuSeed";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { RestoreDraft, RestoreReport } from "./domain";

/**
 * NUT-09 recovery of deterministic proofs from the seed. Per mint, unit, and
 * keyset: scan a bounded window behind the persisted cursor/counter high
 * water (falling back to a full scan from zero when the window finds
 * nothing), keep only unspent proofs whose secrets are not already stored,
 * persist them as `accepted` rows, and advance both the restore cursor and
 * the deterministic counter past the last signature found. Unreachable
 * mints are reported, not failed on.
 */
export class Restore extends Effect.Service<Restore>()("linkshu/Restore", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* CashuSeed;
    yield* KeyValueStore;
    yield* TokenStore;
    yield* Inspector.orNoop;

    const restore = (draft: RestoreDraft): Effect.Effect<RestoreReport> =>
      notImplemented("restore.restore", { draft });

    /**
     * Remove every counter, cursor, and lease keyed to the current seed's
     * derivation tree. Mandatory after replacing the seed: the old values
     * describe positions the new seed cannot reproduce.
     */
    const wipeSeedBoundState: Effect.Effect<void> = notImplemented(
      "restore.wipeSeedBoundState",
    );

    return { restore, wipeSeedBoundState } as const;
  }),
}) {}
