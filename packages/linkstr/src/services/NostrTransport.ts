import { Context, Duration, Effect, Layer, Schema } from "effect";
import { SimplePool } from "nostr-tools";
import type { Event as NostrToolsEvent, Filter } from "nostr-tools";
import { RelayUrl } from "../domain/primitives";
import type { SignedPlainEvent, SignedWrapEvent } from "../internal/nostrEvent";

export class RelayPublishResult extends Schema.Class<RelayPublishResult>(
  "RelayPublishResult",
)({
  relay: RelayUrl,
  accepted: Schema.Boolean,
  detail: Schema.NullOr(Schema.String),
}) {}

export class RelayUnreachable extends Schema.TaggedError<RelayUnreachable>()(
  "RelayUnreachable",
  {
    relay: RelayUrl,
    detail: Schema.NullOr(Schema.String),
  },
) {}

/**
 * Publishing never fails as an Effect: it reports a per-relay outcome and the
 * caller derives delivery semantics. Retry policy deliberately does not live
 * here — it belongs to the outbox.
 *
 * Subscribing runs one live subscription on one relay: raw events flow through
 * `onEvent` until the relay ends the subscription, which resolves the effect
 * with the close reason. Interruption closes the subscription. Resubscribe and
 * backfill policy live in the inbox machine, not here.
 *
 * Fetching is the one-shot variant: collect stored events from one relay until
 * EOSE (or a bounded timeout, returning what arrived), then close.
 */
export interface NostrTransportService {
  readonly publish: (
    relays: ReadonlyArray<RelayUrl>,
    event: SignedWrapEvent | SignedPlainEvent,
  ) => Effect.Effect<ReadonlyArray<RelayPublishResult>>;
  readonly subscribe: (
    relay: RelayUrl,
    filter: Filter,
    onEvent: (event: NostrToolsEvent) => void,
  ) => Effect.Effect<string, RelayUnreachable>;
  readonly fetch: (
    relay: RelayUrl,
    filter: Filter,
  ) => Effect.Effect<ReadonlyArray<NostrToolsEvent>, RelayUnreachable>;
}

export class NostrTransport extends Context.Tag("linkstr/NostrTransport")<
  NostrTransport,
  NostrTransportService
>() {}

export interface RelaySubscriptionParams {
  readonly onevent: (event: NostrToolsEvent) => void;
  readonly oneose?: () => void;
  readonly onclose?: (reason: string) => void;
}

export interface RelaySubscriptionHandle {
  readonly close: (reason?: string) => void;
}

export interface RelayConnection {
  readonly publish: (event: NostrToolsEvent) => Promise<string>;
  readonly subscribe: (
    filters: Array<Filter>,
    params: RelaySubscriptionParams,
  ) => RelaySubscriptionHandle;
}

/** The slice of a nostr-tools pool the transport needs; fakeable in tests. */
export interface RelayPool {
  readonly ensureRelay: (
    url: string,
    params?: { connectionTimeout?: number },
  ) => Promise<RelayConnection>;
}

const CONNECTION_TIMEOUT_MS = 6_000;
const DEFAULT_PUBLISH_TIMEOUT = Duration.seconds(10);
const DEFAULT_FETCH_EOSE_TIMEOUT = Duration.seconds(5);

/**
 * `SimplePool.publish` resolves — not rejects — with a "connection failure: …"
 * string for unreachable relays, so it cannot distinguish acceptance from
 * failure. Going through `ensureRelay().publish()` keeps the pool's connection
 * reuse while only an actual relay OK resolves the promise.
 */
export const makeRelayPoolTransport = (
  pool: RelayPool,
  options?: {
    publishTimeout?: Duration.Duration;
    fetchEoseTimeout?: Duration.Duration;
  },
): NostrTransportService => {
  const publishTimeout = options?.publishTimeout ?? DEFAULT_PUBLISH_TIMEOUT;
  const fetchEoseTimeout =
    options?.fetchEoseTimeout ?? DEFAULT_FETCH_EOSE_TIMEOUT;

  const publishToRelay = (
    relay: RelayUrl,
    event: SignedWrapEvent | SignedPlainEvent,
  ): Effect.Effect<RelayPublishResult> =>
    Effect.tryPromise({
      try: async () => {
        const connection = await pool.ensureRelay(relay, {
          connectionTimeout: CONNECTION_TIMEOUT_MS,
        });
        return await connection.publish(event);
      },
      catch: (reason) => String(reason),
    }).pipe(
      Effect.timeoutFail({
        duration: publishTimeout,
        onTimeout: () => "publish timed out",
      }),
      Effect.match({
        onSuccess: (detail) =>
          new RelayPublishResult({
            relay,
            accepted: true,
            detail: detail || null,
          }),
        onFailure: (detail) =>
          new RelayPublishResult({ relay, accepted: false, detail }),
      }),
    );

  const subscribeToRelay = (
    relay: RelayUrl,
    filter: Filter,
    onEvent: (event: NostrToolsEvent) => void,
  ): Effect.Effect<string, RelayUnreachable> =>
    Effect.async<string, RelayUnreachable>((resume) => {
      let handle: RelaySubscriptionHandle | null = null;
      let interrupted = false;
      pool
        .ensureRelay(relay, { connectionTimeout: CONNECTION_TIMEOUT_MS })
        .then(
          (connection) => {
            if (interrupted) return;
            handle = connection.subscribe([filter], {
              onevent: onEvent,
              onclose: (reason) => resume(Effect.succeed(reason)),
            });
          },
          (reason) =>
            resume(new RelayUnreachable({ relay, detail: String(reason) })),
        );
      return Effect.sync(() => {
        interrupted = true;
        handle?.close();
      });
    });

  // The EOSE timeout lives inside the async body (not Effect.timeout) so a
  // relay that never sends EOSE still yields the events collected so far.
  const fetchFromRelay = (
    relay: RelayUrl,
    filter: Filter,
  ): Effect.Effect<ReadonlyArray<NostrToolsEvent>, RelayUnreachable> =>
    Effect.async<ReadonlyArray<NostrToolsEvent>, RelayUnreachable>((resume) => {
      const events: Array<NostrToolsEvent> = [];
      let handle: RelaySubscriptionHandle | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        if (timer !== null) clearTimeout(timer);
        handle?.close();
        resume(Effect.succeed(events));
      };
      pool
        .ensureRelay(relay, { connectionTimeout: CONNECTION_TIMEOUT_MS })
        .then(
          (connection) => {
            if (done) return;
            timer = setTimeout(settle, Duration.toMillis(fetchEoseTimeout));
            handle = connection.subscribe([filter], {
              onevent: (event) => {
                events.push(event);
              },
              oneose: settle,
              onclose: settle,
            });
          },
          (reason) => {
            if (done) return;
            done = true;
            resume(new RelayUnreachable({ relay, detail: String(reason) }));
          },
        );
      return Effect.sync(() => {
        done = true;
        if (timer !== null) clearTimeout(timer);
        handle?.close();
      });
    });

  return {
    publish: (relays, event) =>
      Effect.forEach(relays, (relay) => publishToRelay(relay, event), {
        concurrency: "unbounded",
      }),
    subscribe: subscribeToRelay,
    fetch: fetchFromRelay,
  };
};

export const NostrTransportSimplePool: Layer.Layer<NostrTransport> =
  Layer.scoped(
    NostrTransport,
    Effect.map(
      Effect.acquireRelease(
        // Ping + reconnect: without them a dropped websocket (mobile
        // background, network switch) permanently kills the connection.
        Effect.sync(
          () => new SimplePool({ enablePing: true, enableReconnect: true }),
        ),
        (pool) => Effect.sync(() => pool.destroy()),
      ),
      makeRelayPoolTransport,
    ),
  );
