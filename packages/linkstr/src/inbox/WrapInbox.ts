import {
  Clock,
  Duration,
  Effect,
  Either,
  Option,
  Queue,
  Ref,
  Schema,
  Stream,
} from "effect";
import type { Scope } from "effect";
import type { Filter } from "nostr-tools";
import { UnixSeconds, WrapId } from "../domain/primitives";
import type { RelayUrl } from "../domain/primitives";
import type { Rumor, SignedWrapEvent } from "../internal/nostrEvent";
import {
  decodeReactionRumor,
  REACTION_KIND,
  RETRACTION_KIND,
} from "../reactions/codec";
import type { ReactionInboxEvent } from "../reactions/events";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import { NostrTransport } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { authenticateWrap } from "./authenticateWrap";
import { WrapDropped } from "./events";

export type WrapInboxEvent = ReactionInboxEvent | WrapDropped;

export class NoReadRelaysConfigured extends Schema.TaggedError<NoReadRelaysConfigured>()(
  "NoReadRelaysConfigured",
  {},
) {}

export interface WrapInboxOptions {
  /** Cursor persisted by the caller from a previous session's `cursor`. */
  readonly since?: UnixSeconds;
  readonly resubscribeDelay?: Duration.Duration;
}

export interface WrapInboxFeed {
  /** Single-consumer: fan out downstream if multiple listeners are needed. */
  readonly events: Stream.Stream<WrapInboxEvent>;
  /**
   * Latest authenticated wrap timestamp delivered through `events`. Persist it
   * after handling the delivered events and pass it back as `since` on the
   * next session; the machine widens it by the NIP-59 backdate margin itself.
   */
  readonly cursor: Effect.Effect<UnixSeconds | null>;
}

const GIFT_WRAP_KIND = 1059;

/** NIP-59 wraps carry timestamps randomized up to two days into the past. */
export const NIP59_BACKDATE_MARGIN_SECONDS = 2 * 24 * 60 * 60;

const DEFAULT_RESUBSCRIBE_DELAY = Duration.seconds(5);

const SEEN_WRAPS_CAPACITY = 4096;

// FIFO eviction via Set insertion order; an evicted id can only re-emit a
// wrap consumers already reconciled (inbox facts are idempotent by rumor id).
// Only authenticated wraps are recorded: a tampered copy of a wrap must not
// mark its id as seen, or it would suppress the honest copy from another relay.
const makeSeenWrapIds = (): {
  has: (wrapId: string) => boolean;
  add: (wrapId: string) => void;
} => {
  const seen = new Set<string>();
  return {
    has: (wrapId) => seen.has(wrapId),
    add: (wrapId) => {
      seen.add(wrapId);
      if (seen.size > SEEN_WRAPS_CAPACITY) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
    },
  };
};

const decodeWrapIdField = Schema.decodeUnknownEither(
  Schema.Struct({ id: WrapId }),
);

const wrapIdOf = (raw: unknown): string | null =>
  Either.match(decodeWrapIdField(raw), {
    onLeft: () => null,
    onRight: ({ id }) => id,
  });

const routeRumor = (
  wrap: SignedWrapEvent,
  rumor: Rumor,
  identity: LinkstrIdentityService,
): WrapInboxEvent => {
  switch (rumor.kind) {
    case REACTION_KIND:
    case RETRACTION_KIND:
      return Either.match(decodeReactionRumor(rumor, identity.pubkey), {
        onLeft: (reason) => new WrapDropped({ wrapId: wrap.id, reason }),
        onRight: (event) => event,
      });
    // TODO: future verticals (kind 14/15 chat, payment notices, …) dispatch
    // on rumor.kind here.
    default:
      return new WrapDropped({ wrapId: wrap.id, reason: "unsupported-kind" });
  }
};

/**
 * Owns the app's single kind-1059 subscription: one filter per read relay,
 * wraps deduped across relays, authenticated and routed by rumor kind into
 * typed inbox facts. Each relay runs its own resubscribe loop, so one dead
 * relay never stalls the others; every (re)subscription backfills from the
 * cursor minus the NIP-59 backdate margin.
 */
export class WrapInbox extends Effect.Service<WrapInbox>()(
  "linkstr/WrapInbox",
  {
    effect: Effect.gen(function* () {
      const identity = yield* LinkstrIdentity;
      const transport = yield* NostrTransport;
      const relayPolicy = yield* RelayPolicy;

      const open = (
        options?: WrapInboxOptions,
      ): Effect.Effect<WrapInboxFeed, NoReadRelaysConfigured, Scope.Scope> =>
        Effect.gen(function* () {
          const relays = relayPolicy.readRelays;
          if (relays.length === 0) return yield* new NoReadRelaysConfigured();
          const resubscribeDelay =
            options?.resubscribeDelay ?? DEFAULT_RESUBSCRIBE_DELAY;

          // TODO(durable cursor): when a persistence service exists, load
          // `since` and checkpoint the cursor there instead of leaving both
          // to the caller.
          const cursor = yield* Ref.make<UnixSeconds | null>(
            options?.since ?? null,
          );
          const rawWraps = yield* Effect.acquireRelease(
            Queue.unbounded<unknown>(),
            Queue.shutdown,
          );
          const seenWrapIds = makeSeenWrapIds();

          const filterFrom = (since: UnixSeconds | null): Filter => ({
            kinds: [GIFT_WRAP_KIND],
            "#p": [identity.pubkey],
            ...(since === null
              ? {}
              : {
                  since: Math.max(since - NIP59_BACKDATE_MARGIN_SECONDS, 0),
                }),
          });

          const subscribeFromCursor = (relay: RelayUrl) =>
            Effect.gen(function* () {
              const filter = filterFrom(yield* Ref.get(cursor));
              yield* transport.subscribe(relay, filter, (event) => {
                Queue.unsafeOffer(rawWraps, event);
              });
            });

          const keepSubscribed = (relay: RelayUrl) =>
            subscribeFromCursor(relay).pipe(
              Effect.ignore,
              Effect.andThen(Effect.sleep(resubscribeDelay)),
              Effect.forever,
            );

          yield* Effect.forEach(relays, (relay) =>
            Effect.forkScoped(keepSubscribed(relay)),
          );

          const advanceCursor = (wrapCreatedAt: number): Effect.Effect<void> =>
            Effect.gen(function* () {
              const nowSeconds = Math.floor(
                (yield* Clock.currentTimeMillis) / 1000,
              );
              // Clamped: a sender-controlled future timestamp must not push
              // the cursor past real time, or restarts would skip everything
              // published before it.
              const next = Math.min(wrapCreatedAt, nowSeconds);
              yield* Ref.update(cursor, (current) =>
                next > (current ?? 0) ? UnixSeconds.make(next) : current,
              );
            });

          const processRaw = (
            raw: unknown,
          ): Effect.Effect<Option.Option<WrapInboxEvent>> =>
            Effect.suspend(() => {
              const wrapId = wrapIdOf(raw);
              if (wrapId !== null && seenWrapIds.has(wrapId)) {
                return Effect.succeedNone;
              }
              return Either.match(authenticateWrap(raw, identity), {
                onLeft: (dropped) =>
                  Effect.succeedSome<WrapInboxEvent>(dropped),
                onRight: ({ rumor, wrap }) =>
                  Effect.sync(() => seenWrapIds.add(wrap.id)).pipe(
                    Effect.andThen(advanceCursor(wrap.created_at)),
                    Effect.as(Option.some(routeRumor(wrap, rumor, identity))),
                  ),
              });
            });

          const events = Stream.fromQueue(rawWraps).pipe(
            Stream.mapEffect(processRaw),
            Stream.filterMap((event) => event),
          );

          return { events, cursor: Ref.get(cursor) };
        });

      return { open } as const;
    }),
  },
) {}
