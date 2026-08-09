import { Context, Duration, Effect, Layer, Schema } from "effect";
import { SimplePool } from "nostr-tools";
import type { Event as NostrToolsEvent } from "nostr-tools";
import { RelayUrl } from "../domain/primitives";
import type { SignedWrapEvent } from "../internal/nostrEvent";

export class RelayPublishResult extends Schema.Class<RelayPublishResult>(
  "RelayPublishResult",
)({
  relay: RelayUrl,
  accepted: Schema.Boolean,
  detail: Schema.NullOr(Schema.String),
}) {}

/**
 * Publishing never fails as an Effect: it reports a per-relay outcome and the
 * caller derives delivery semantics. Retry policy deliberately does not live
 * here — it belongs to the outbox.
 */
export interface NostrTransportService {
  readonly publish: (
    relays: ReadonlyArray<RelayUrl>,
    event: SignedWrapEvent,
  ) => Effect.Effect<ReadonlyArray<RelayPublishResult>>;
}

export class NostrTransport extends Context.Tag("linkstr/NostrTransport")<
  NostrTransport,
  NostrTransportService
>() {}

/** The slice of a nostr-tools pool the transport needs; fakeable in tests. */
export interface RelayPool {
  readonly ensureRelay: (
    url: string,
    params?: { connectionTimeout?: number },
  ) => Promise<{ publish: (event: NostrToolsEvent) => Promise<string> }>;
}

const CONNECTION_TIMEOUT_MS = 6_000;
const DEFAULT_PUBLISH_TIMEOUT = Duration.seconds(10);

/**
 * `SimplePool.publish` resolves — not rejects — with a "connection failure: …"
 * string for unreachable relays, so it cannot distinguish acceptance from
 * failure. Going through `ensureRelay().publish()` keeps the pool's connection
 * reuse while only an actual relay OK resolves the promise.
 */
export const makeRelayPoolTransport = (
  pool: RelayPool,
  options?: { publishTimeout?: Duration.Duration },
): NostrTransportService => {
  const publishTimeout = options?.publishTimeout ?? DEFAULT_PUBLISH_TIMEOUT;

  const publishToRelay = (
    relay: RelayUrl,
    event: SignedWrapEvent,
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

  return {
    publish: (relays, event) =>
      Effect.forEach(relays, (relay) => publishToRelay(relay, event), {
        concurrency: "unbounded",
      }),
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
