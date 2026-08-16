import { Duration, Effect, Layer, Stream } from "effect";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { Event as NostrToolsEvent, Filter } from "nostr-tools";
import { Pubkey, RelayUrl } from "../domain/primitives";
import type {
  RelayConnection,
  RelayPool,
  RelaySubscriptionParams,
} from "../services/NostrTransport";
import {
  makeRelayPoolTransport,
  NostrTransport,
} from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import type { DeliveredPushWrap } from "./PushInbox";
import { PushInbox } from "./PushInbox";

interface FakeSubscription {
  readonly filters: Array<Filter>;
  readonly params: RelaySubscriptionParams;
  closed: boolean;
}

const STRICT_FILTER_CLOSE_REASON = "bad req: unindexed tag filter";

const hasMultiLetterTagFilter = (filters: ReadonlyArray<Filter>): boolean =>
  filters.some((filter) =>
    Object.keys(filter).some(
      (key) => key.startsWith("#") && key.slice(1).length !== 1,
    ),
  );

class FakeRelay {
  readonly subscriptions: Array<FakeSubscription> = [];

  readonly connection: RelayConnection = {
    publish: () => Promise.resolve("stored"),
    subscribe: (filters, params) => {
      const subscription = { filters, params, closed: false };
      this.subscriptions.push(subscription);
      if (hasMultiLetterTagFilter(filters)) {
        subscription.closed = true;
        params.onclose?.(STRICT_FILTER_CLOSE_REASON);
      }
      return { close: () => (subscription.closed = true) };
    },
  };

  emit(event: NostrToolsEvent): void {
    for (const subscription of this.subscriptions) {
      if (!subscription.closed) subscription.params.onevent(event);
    }
  }

  eose(): void {
    for (const subscription of this.subscriptions) {
      if (!subscription.closed) subscription.params.oneose?.();
    }
  }
}

const eventually = (predicate: () => boolean): Effect.Effect<void, Error> => {
  const poll: Effect.Effect<void> = Effect.suspend(() =>
    predicate()
      ? Effect.void
      : Effect.sleep(Duration.millis(2)).pipe(Effect.andThen(() => poll)),
  );
  return poll.pipe(
    Effect.timeoutFail({
      duration: Duration.seconds(2),
      onTimeout: () => new Error("condition not met within 2s"),
    }),
  );
};

const secretKey = generateSecretKey();
const recipient = Pubkey.make(getPublicKey(generateSecretKey()));

const pushWrap = (content: string): NostrToolsEvent =>
  finalizeEvent(
    {
      kind: 1059,
      created_at: Math.floor(Date.now() / 1000),
      content,
      tags: [
        ["p", recipient, "wss://hint.test"],
        ["linky", "push"],
      ],
    },
    secretKey,
  );

describe("PushInbox", () => {
  it("rejects multi-letter tag filters like a strict production relay", async () => {
    const relay = RelayUrl.make("wss://strict-relay.test");
    const fake = new FakeRelay();
    const pool: RelayPool = {
      ensureRelay: () => Promise.resolve(fake.connection),
    };
    const transport = makeRelayPoolTransport(pool);
    let delivered = 0;

    const reason = await Effect.runPromise(
      transport.subscribe(
        relay,
        { "#linky": ["push"] },
        () => (delivered += 1),
      ),
    );
    fake.emit(pushWrap("rejected"));

    expect(reason).toBe(STRICT_FILTER_CLOSE_REASON);
    expect(fake.subscriptions[0]?.closed).toBe(true);
    expect(delivered).toBe(0);
  });

  it("validates, phases and dedupes push wraps across relays", async () => {
    const relayA = RelayUrl.make("wss://relay-a.test");
    const relayB = RelayUrl.make("wss://relay-b.test");
    const fakeA = new FakeRelay();
    const fakeB = new FakeRelay();
    const relays = new Map<string, FakeRelay>([
      [relayA, fakeA],
      [relayB, fakeB],
    ]);
    const pool: RelayPool = {
      ensureRelay: (url) => {
        const relay = relays.get(url);
        return relay === undefined
          ? Promise.reject(new Error("unknown relay"))
          : Promise.resolve(relay.connection);
      },
    };
    const layer = PushInbox.Default.pipe(
      Layer.provide(
        Layer.mergeAll(
          RelayPolicy.fixed({ readRelays: [relayA, relayB], writeRelays: [] }),
          Layer.succeed(NostrTransport, makeRelayPoolTransport(pool)),
        ),
      ),
    );

    await Effect.gen(function* () {
      const inbox = yield* PushInbox;
      const events = yield* inbox.open({
        lookback: Duration.days(3),
        resubscribeDelay: Duration.millis(10),
      });
      const collected: Array<DeliveredPushWrap> = [];
      yield* Effect.forkScoped(
        Stream.runForEach(events, (event) =>
          Effect.sync(() => collected.push(event)),
        ),
      );
      yield* eventually(
        () =>
          fakeA.subscriptions.length === 1 && fakeB.subscriptions.length === 1,
      );

      const filter = fakeA.subscriptions[0]?.filters[0];
      const expectedSince =
        Math.floor(Date.now() / 1000) - Duration.toSeconds(Duration.days(3));
      expect(filter?.kinds).toEqual([1059]);
      expect(filter?.since).toBeGreaterThanOrEqual(expectedSince - 2);
      expect(filter?.since).toBeLessThanOrEqual(expectedSince + 2);
      expect(
        Object.keys(filter ?? {}).filter(
          (key) => key.startsWith("#") && key.slice(1).length !== 1,
        ),
      ).toEqual([]);

      const historical = pushWrap("historical");
      fakeA.emit(historical);
      yield* eventually(() => collected.length === 1);
      fakeB.eose();
      fakeB.emit(historical);
      yield* Effect.sleep(Duration.millis(10));
      expect(collected).toHaveLength(1);
      expect(collected[0]?.delivery).toBe("backfill");

      fakeA.eose();
      const live = pushWrap("live");
      fakeA.emit({ ...live, content: "tampered" });
      fakeB.emit(live);
      yield* eventually(() => collected.length === 2);
      expect(collected[1]).toEqual({
        delivery: "live",
        wrap: {
          wrapId: live.id,
          recipient,
          createdAt: live.created_at,
          relayHints: ["wss://hint.test"],
        },
      });
    }).pipe(Effect.scoped, Effect.provide(layer), Effect.runPromise);
  });
});
