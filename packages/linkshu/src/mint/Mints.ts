import { Effect } from "effect";
import type { MintRejected, MintUnreachable } from "../domain/errors";
import type { MintUrl } from "../domain/primitives";
import { notImplemented } from "../internal/skeleton";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { MintInfo } from "./domain";

/**
 * Mint knowledge. Also the home of the package's single wallet-instance
 * cache (one loaded cashu-ts wallet per mint+unit, shared by every
 * vertical) — that cache is internal and never part of this interface,
 * because raw cashu-ts types do not cross the public boundary.
 */
export class Mints extends Effect.Service<Mints>()("linkshu/Mints", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* KeyValueStore;
    yield* TokenStore;

    /** Fetch and normalize the mint's published info and keyset fees. */
    const info = (
      mint: MintUrl,
    ): Effect.Effect<MintInfo, MintUnreachable | MintRejected> =>
      notImplemented("mints.info", { mint });

    /** Every mint the wallet has state for: stored rows plus seen mints. */
    const knownMints: Effect.Effect<ReadonlyArray<MintUrl>> =
      notImplemented("mints.knownMints");

    return { info, knownMints } as const;
  }),
}) {}
