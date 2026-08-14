import { Registry } from "./index";
import type { Atom, Result } from "./index";
import {
  NostrSecretKey,
  NostrTransport,
  ProfileMetadata,
  Pubkey,
  RelayPublishResult,
  RelayUrl,
  StatusDraft,
  UnixSeconds,
} from "@linky/linkstr";
import type { NostrTransportService, ProfileWatchEvent } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { Event as NostrToolsEvent, Filter } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import {
  fetchProfileAtom,
  profileWatchAtom,
  profileWatchHandlerAtom,
  publishProfileAtom,
  publishStatusAtom,
  watchedProfilesAtom,
} from "./profiles";

type PublishedEvent = Parameters<NostrTransportService["publish"]>[1];

interface Identity {
  readonly secretKey: NostrSecretKey;
  readonly pubkey: Pubkey;
}

const makeIdentity = (): Identity => {
  const secretKey = NostrSecretKey.make(generateSecretKey());
  return { secretKey, pubkey: Pubkey.make(getPublicKey(secretKey)) };
};

const alice = makeIdentity();
const bob = makeIdentity();
const carol = makeIdentity();

const relayA = RelayUrl.make("wss://relay-a.test");

const base = 1_754_000_000;

interface FakeSubscription {
  readonly relay: RelayUrl;
  readonly filter: Filter;
  readonly onEvent: (event: NostrToolsEvent) => void;
}

const makeFakeTransport = (
  published: Array<PublishedEvent>,
  subscriptions: Array<FakeSubscription>,
  stored: ReadonlyArray<NostrToolsEvent> = [],
): NostrTransportService => ({
  publish: (relays, event) =>
    Effect.sync(() => {
      published.push(event);
      return relays.map(
        (relay) =>
          new RelayPublishResult({ relay, accepted: true, detail: null }),
      );
    }),
  subscribe: (relay, filter, onEvent) =>
    Effect.suspend(() => {
      const subscription: FakeSubscription = { relay, filter, onEvent };
      subscriptions.push(subscription);
      return Effect.never.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            subscriptions.splice(subscriptions.indexOf(subscription), 1);
          }),
        ),
      );
    }),
  fetch: () => Effect.succeed(stored),
});

const configWith = (
  identity: Identity,
  transport: NostrTransportService,
): LinkstrConfig => ({
  secretKey: identity.secretKey,
  readRelays: [relayA],
  writeRelays: [relayA],
  transport: Layer.succeed(NostrTransport, transport),
});

const profileEvent = (
  identity: Identity,
  content: string,
  createdAt: number,
): NostrToolsEvent =>
  finalizeEvent(
    { kind: 0, tags: [], content, created_at: createdAt },
    identity.secretKey,
  );

const settle = <A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true }),
  );

describe("profileWatchAtom", () => {
  it("feeds facts through the handler and resubscribes when the set changes", async () => {
    const registry = Registry.make();
    const subscriptions: Array<FakeSubscription> = [];
    const handled: Array<ProfileWatchEvent> = [];

    registry.set(
      linkstrConfigAtom,
      configWith(alice, makeFakeTransport([], subscriptions)),
    );
    registry.set(profileWatchHandlerAtom, {
      onEvent: (event) => {
        handled.push(event);
      },
    });
    const unmount = registry.mount(profileWatchAtom);

    // No watched pubkeys yet: the subscription stays closed.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(subscriptions).toHaveLength(0);

    registry.set(watchedProfilesAtom, [bob.pubkey]);
    await expect.poll(() => subscriptions.length).toBe(1);
    expect(subscriptions[0]?.filter).toEqual({
      kinds: [0, 30315],
      authors: [bob.pubkey],
    });

    subscriptions[0]?.onEvent(
      profileEvent(bob, JSON.stringify({ name: "bob" }), base + 1),
    );
    await expect.poll(() => handled.length).toBe(1);
    expect(handled[0]).toEqual(
      expect.objectContaining({
        _tag: "ProfileUpdated",
        pubkey: bob.pubkey,
        metadata: expect.objectContaining({ name: "bob" }),
      }),
    );

    // Growing the set replaces the subscription without a runtime rebuild.
    registry.set(watchedProfilesAtom, [bob.pubkey, carol.pubkey]);
    await expect
      .poll(() => subscriptions[0]?.filter.authors)
      .toEqual([bob.pubkey, carol.pubkey]);
    expect(subscriptions).toHaveLength(1);

    unmount();
    await expect.poll(() => subscriptions.length).toBe(0);
  });
});

describe("fetchProfileAtom", () => {
  it("returns the typed fetch result", async () => {
    const registry = Registry.make();
    registry.set(
      linkstrConfigAtom,
      configWith(
        alice,
        makeFakeTransport(
          [],
          [],
          [profileEvent(bob, JSON.stringify({ display_name: "Bob" }), base)],
        ),
      ),
    );

    registry.set(fetchProfileAtom, bob.pubkey);
    const exit = await settle(registry, fetchProfileAtom);

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value).toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({
          pubkey: bob.pubkey,
          metadata: expect.objectContaining({ displayName: "Bob" }),
        }),
        status: null,
      }),
    );
  });
});

describe("publishProfileAtom / publishStatusAtom", () => {
  it("publishes through the configured transport and returns receipts", async () => {
    const registry = Registry.make();
    const published: Array<PublishedEvent> = [];
    registry.set(
      linkstrConfigAtom,
      configWith(alice, makeFakeTransport(published, [])),
    );

    registry.set(publishProfileAtom, new ProfileMetadata({ name: "alice" }));
    const profileExit = await settle(registry, publishProfileAtom);
    expect(Exit.isSuccess(profileExit)).toBe(true);

    registry.set(
      publishStatusAtom,
      new StatusDraft({
        content: "stacking",
        expiresAt: UnixSeconds.make(base + 60),
      }),
    );
    const statusExit = await settle(registry, publishStatusAtom);
    expect(Exit.isSuccess(statusExit)).toBe(true);

    expect(published.map((event) => event.kind)).toEqual([0, 30315]);
  });
});
