import { Clock, Duration, Effect, Either, Option, Queue, Stream } from "effect";
import type { Scope } from "effect";
import type { Filter } from "nostr-tools";
import { NoReadRelaysConfigured } from "../domain/errors";
import type { RelayUrl } from "../domain/primitives";
import type { InboxDelivery } from "../inbox/events";
import {
  LINKY_PUSH_MARKER_TAG,
  LINKY_PUSH_MARKER_VALUE,
} from "../internal/giftWrap";
import { resubscribeForever } from "../internal/resubscribe";
import { NostrTransport } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { decodePushWrap } from "./codec";
import type { PushWrap } from "./codec";

export interface DeliveredPushWrap {
  readonly delivery: InboxDelivery;
  readonly wrap: PushWrap;
}

export interface PushInboxOptions {
  readonly lookback: Duration.Duration;
  readonly resubscribeDelay?: Duration.Duration;
}

interface RawArrival {
  readonly delivery: InboxDelivery;
  readonly raw: unknown;
}

const GIFT_WRAP_KIND = 1059;
const DEFAULT_RESUBSCRIBE_DELAY = Duration.seconds(5);
const SEEN_WRAPS_CAPACITY = 4096;

const makeSeenWrapIds = () => {
  const seen = new Set<string>();
  return {
    has: (wrapId: string): boolean => seen.has(wrapId),
    add: (wrapId: string): void => {
      seen.add(wrapId);
      if (seen.size > SEEN_WRAPS_CAPACITY) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
    },
  };
};

/**
 * Identity-free kind-1059 watcher for push infrastructure. It owns one honest
 * subscription per relay, reconnects with a fresh rolling lookback, validates
 * outer events, and dedupes authenticated wraps across relays.
 */
export class PushInbox extends Effect.Service<PushInbox>()(
  "linkstr/PushInbox",
  {
    effect: Effect.gen(function* () {
      const transport = yield* NostrTransport;
      const relayPolicy = yield* RelayPolicy;

      const open = (
        options: PushInboxOptions,
      ): Effect.Effect<
        Stream.Stream<DeliveredPushWrap>,
        NoReadRelaysConfigured,
        Scope.Scope
      > =>
        Effect.gen(function* () {
          const relays = relayPolicy.readRelays;
          if (relays.length === 0) return yield* new NoReadRelaysConfigured();
          const rawWraps = yield* Effect.acquireRelease(
            Queue.unbounded<RawArrival>(),
            Queue.shutdown,
          );
          const seenWrapIds = makeSeenWrapIds();
          const resubscribeDelay =
            options.resubscribeDelay ?? DEFAULT_RESUBSCRIBE_DELAY;

          const subscribe = (relay: RelayUrl) =>
            Effect.gen(function* () {
              const nowSeconds = Math.floor(
                (yield* Clock.currentTimeMillis) / 1000,
              );
              const lookbackSeconds = Math.floor(
                Duration.toMillis(options.lookback) / 1000,
              );
              const filter: Filter = {
                kinds: [GIFT_WRAP_KIND],
                [`#${LINKY_PUSH_MARKER_TAG}`]: [LINKY_PUSH_MARKER_VALUE],
                since: Math.max(nowSeconds - lookbackSeconds, 0),
              };
              let eoseSeen = false;
              yield* transport.subscribe(
                relay,
                filter,
                (raw) => {
                  Queue.unsafeOffer(rawWraps, {
                    delivery: eoseSeen ? "live" : "backfill",
                    raw,
                  });
                },
                { onEose: () => (eoseSeen = true) },
              );
            });

          yield* Effect.forEach(relays, (relay) =>
            Effect.forkScoped(
              resubscribeForever(subscribe(relay), resubscribeDelay),
            ),
          );

          const processRaw = ({
            delivery,
            raw,
          }: RawArrival): Option.Option<DeliveredPushWrap> =>
            Either.match(decodePushWrap(raw), {
              onLeft: () => Option.none(),
              onRight: (wrap) => {
                if (seenWrapIds.has(wrap.wrapId)) return Option.none();
                seenWrapIds.add(wrap.wrapId);
                return Option.some({ delivery, wrap });
              },
            });

          return Stream.fromQueue(rawWraps).pipe(Stream.filterMap(processRaw));
        });

      return { open } as const;
    }),
  },
) {}
