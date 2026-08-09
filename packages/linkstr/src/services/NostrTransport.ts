import { Context, Duration, Effect, Layer, Schema } from "effect";
import { SimplePool } from "nostr-tools";
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

const PUBLISH_TIMEOUT = Duration.seconds(10);

const settleRelayPublish = (
  relay: RelayUrl,
  attempt: Promise<string> | undefined,
): Effect.Effect<RelayPublishResult> => {
  if (attempt === undefined) {
    return Effect.succeed(
      new RelayPublishResult({ relay, accepted: false, detail: "no attempt" }),
    );
  }
  return Effect.tryPromise({
    try: () => attempt,
    catch: (reason) => String(reason),
  }).pipe(
    Effect.timeoutFail({
      duration: PUBLISH_TIMEOUT,
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
};

export const NostrTransportSimplePool: Layer.Layer<NostrTransport> =
  Layer.scoped(
    NostrTransport,
    Effect.gen(function* () {
      const pool = yield* Effect.acquireRelease(
        // Ping + reconnect: without them a dropped websocket (mobile
        // background, network switch) permanently kills the connection.
        Effect.sync(
          () => new SimplePool({ enablePing: true, enableReconnect: true }),
        ),
        (p) => Effect.sync(() => p.destroy()),
      );

      const publish: NostrTransportService["publish"] = (relays, event) =>
        Effect.suspend(() => {
          const attempts = pool.publish([...relays], event);
          return Effect.forEach(
            relays,
            (relay, index) => settleRelayPublish(relay, attempts[index]),
            { concurrency: "unbounded" },
          );
        });

      return { publish };
    }),
  );
