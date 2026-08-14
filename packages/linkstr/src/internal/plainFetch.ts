import { Effect, Either } from "effect";
import type { Filter } from "nostr-tools";
import { RelayRejection } from "../domain/delivery";
import { AllRelaysUnreachable } from "../domain/errors";
import type { RelayUrl } from "../domain/primitives";
import type { NostrTransportService } from "../services/NostrTransport";
import type { SignedPlainEvent } from "./nostrEvent";
import { decodeVerifiedPlainEvent } from "./plainEvent";

/**
 * One-shot fetch fanned out across relays: merge what the reachable relays
 * returned (malformed or forged events dropped), newest first so callers pick
 * a winner with `find`. Fails only when no relay answered at all.
 */
export const fetchPlainEvents = (
  transport: NostrTransportService,
  relays: ReadonlyArray<RelayUrl>,
  filter: Filter,
): Effect.Effect<Array<SignedPlainEvent>, AllRelaysUnreachable> =>
  Effect.gen(function* () {
    const outcomes = yield* Effect.forEach(
      relays,
      (relay) => Effect.either(transport.fetch(relay, filter)),
      { concurrency: "unbounded" },
    );
    const answered = outcomes.filter(Either.isRight);
    if (answered.length === 0) {
      return yield* new AllRelaysUnreachable({
        failures: outcomes
          .filter(Either.isLeft)
          .map(
            ({ left }) =>
              new RelayRejection({ relay: left.relay, detail: left.detail }),
          ),
      });
    }
    return answered
      .flatMap(({ right }) => right)
      .flatMap((raw) =>
        Either.match(decodeVerifiedPlainEvent(raw), {
          onLeft: () => [],
          onRight: (event) => [event],
        }),
      )
      .sort((a, b) => b.created_at - a.created_at);
  });
