import { Effect } from "effect";
import { Inspector } from "../inspector/Inspector";
import { notImplemented } from "../internal/skeleton";
import { CashuSeed } from "../ports/CashuSeed";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { SendDraft, SendError, SendReceipt } from "./domain";

/**
 * Sending is one call: select the mint's `accepted` rows, drop proofs NUT-07
 * reports spent, swap the amount out with disjoint send/keep deterministic
 * counter blocks, persist the change as a fresh `accepted` row, and persist
 * the send token as a row in the drafted state. The source rows are removed;
 * funds are never outside the store even when the caller crashes mid-flow.
 */
export class Send extends Effect.Service<Send>()("linkshu/Send", {
  effect: Effect.gen(function* () {
    // Contract-level dependency declarations; bodies land with the vertical.
    yield* CashuSeed;
    yield* KeyValueStore;
    yield* TokenStore;
    yield* Inspector.orNoop;

    const send = (draft: SendDraft): Effect.Effect<SendReceipt, SendError> =>
      notImplemented("send.send", { draft });

    return { send } as const;
  }),
}) {}
