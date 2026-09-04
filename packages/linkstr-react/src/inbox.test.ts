import { Registry } from "./index";
import {
  ClientId,
  InboxCursorStore,
  NIP59_BACKDATE_MARGIN_SECONDS,
  NostrSecretKey,
  NostrTransport,
  Pubkey,
  RelayPublishResult,
  RelayUrl,
  RetractionDraft,
  RumorId,
  UnixSeconds,
  WrapId,
} from "@linky/linkstr";
import type { NostrTransportService, WrapInboxEvent } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { Event as NostrToolsEvent, Filter } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import {
  fetchWrapEventAtom,
  wrapInboxAtom,
  wrapInboxHandlerAtom,
} from "./inbox";
import { retractReactionAtom } from "./reactions";

type PublishedWrap = Parameters<NostrTransportService["publish"]>[1];

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

const relayA = RelayUrl.make("wss://relay-a.test");
const relayB = RelayUrl.make("wss://relay-b.test");

const firstReaction = RumorId.make("ab".repeat(32));
const secondReaction = RumorId.make("cd".repeat(32));

const recipientOf = (wrap: PublishedWrap): string | null =>
  wrap.tags.find((tag) => tag[0] === "p")?.[1] ?? null;

interface FakeSubscription {
  readonly relay: RelayUrl;
  readonly filter: Filter;
  readonly onEvent: (event: NostrToolsEvent) => void;
}

const makeFakeTransport = (
  published: Array<PublishedWrap>,
  subscriptions: Array<FakeSubscription>,
  stored: ReadonlyArray<NostrToolsEvent> = [],
): NostrTransportService => ({
  publish: (relays, wrap) =>
    Effect.sync(() => {
      published.push(wrap);
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

describe("fetchWrapEventAtom", () => {
  it("returns a typed inbox event", async () => {
    const wrap = await wrapFromBob(firstReaction);
    const registry = Registry.make();
    registry.set(
      linkstrConfigAtom,
      configWith(alice, makeFakeTransport([], [], [wrap])),
    );
    registry.set(fetchWrapEventAtom, { wrapId: WrapId.make(wrap.id) });

    const exit = await Effect.runPromiseExit(
      Registry.getResult(registry, fetchWrapEventAtom, {
        suspendOnWaiting: true,
      }),
    );

    expect(exit).toEqual(
      Exit.succeed(
        expect.objectContaining({
          _tag: "ReactionRetracted",
          from: bob.pubkey,
          reactionIds: [firstReaction],
        }),
      ),
    );
    registry.dispose();
  });
});

const configWith = (
  identity: Identity,
  transport: NostrTransportService,
): LinkstrConfig => ({
  secretKey: identity.secretKey,
  readRelays: [relayA, relayB],
  writeRelays: [relayA, relayB],
  transport: Layer.succeed(NostrTransport, transport),
});

/** A real inbound wrap for alice, produced through the public send API. */
const wrapFromBob = async (reactionId: RumorId): Promise<NostrToolsEvent> => {
  const registry = Registry.make();
  const published: Array<PublishedWrap> = [];
  registry.set(
    linkstrConfigAtom,
    configWith(bob, makeFakeTransport(published, [])),
  );
  registry.set(
    retractReactionAtom,
    new RetractionDraft({
      to: alice.pubkey,
      reactionIds: [reactionId],
      clientId: ClientId.make("client-inbox"),
    }),
  );
  const exit = await Effect.runPromiseExit(
    Registry.getResult(registry, retractReactionAtom, {
      suspendOnWaiting: true,
    }),
  );
  if (Exit.isFailure(exit)) throw new Error("send from bob failed");
  registry.dispose();
  const wrap = published.find(
    (candidate) => recipientOf(candidate) === alice.pubkey,
  );
  if (wrap === undefined) throw new Error("no wrap addressed to alice");
  return wrap;
};

describe("wrapInboxAtom", () => {
  it("feeds inbound wraps through the handler", async () => {
    const wrap = await wrapFromBob(firstReaction);
    const registry = Registry.make();
    const subscriptions: Array<FakeSubscription> = [];
    const handled: Array<WrapInboxEvent> = [];

    registry.set(
      linkstrConfigAtom,
      configWith(alice, makeFakeTransport([], subscriptions)),
    );
    registry.set(wrapInboxHandlerAtom, {
      onEvent: (event) => {
        handled.push(event);
      },
    });
    const unmount = registry.mount(wrapInboxAtom);

    await expect.poll(() => subscriptions.length).toBe(2);
    expect(subscriptions[0]?.filter).toEqual({
      kinds: [1059],
      "#p": [alice.pubkey],
    });

    subscriptions[0]?.onEvent(wrap);
    await expect.poll(() => handled.length).toBe(1);
    expect(handled[0]).toEqual(
      expect.objectContaining({
        _tag: "ReactionRetracted",
        from: bob.pubkey,
        reactionIds: [firstReaction],
      }),
    );

    // The same wrap from the second relay is deduped, not re-handled.
    subscriptions[1]?.onEvent(wrap);
    const second = await wrapFromBob(secondReaction);
    subscriptions[1]?.onEvent(second);
    await expect.poll(() => handled.length).toBe(2);
    expect(handled[1]).toEqual(
      expect.objectContaining({
        _tag: "ReactionRetracted",
        reactionIds: [secondReaction],
      }),
    );

    unmount();
  });

  it("backfills from the handler's since cursor", async () => {
    const registry = Registry.make();
    const subscriptions: Array<FakeSubscription> = [];
    const since = UnixSeconds.make(1_755_000_000);

    registry.set(
      linkstrConfigAtom,
      configWith(alice, makeFakeTransport([], subscriptions)),
    );
    registry.set(wrapInboxHandlerAtom, { since, onEvent: () => {} });
    const unmount = registry.mount(wrapInboxAtom);

    await expect.poll(() => subscriptions.length).toBe(2);
    expect(subscriptions[0]?.filter.since).toBe(
      since - NIP59_BACKDATE_MARGIN_SECONDS,
    );

    unmount();
  });

  it("prefers the configured cursor store over the handler's since", async () => {
    const registry = Registry.make();
    const subscriptions: Array<FakeSubscription> = [];
    const stored = UnixSeconds.make(1_756_000_000);

    registry.set(linkstrConfigAtom, {
      ...configWith(alice, makeFakeTransport([], subscriptions)),
      inboxCursorStore: Layer.succeed(InboxCursorStore, {
        load: Effect.succeed(stored),
        save: () => Effect.void,
      }),
    });
    registry.set(wrapInboxHandlerAtom, {
      since: UnixSeconds.make(1_755_000_000),
      onEvent: () => {},
    });
    const unmount = registry.mount(wrapInboxAtom);

    await expect.poll(() => subscriptions.length).toBe(2);
    expect(subscriptions[0]?.filter.since).toBe(
      stored - NIP59_BACKDATE_MARGIN_SECONDS,
    );

    unmount();
  });

  it("stays closed without a handler and closes subscriptions on unmount", async () => {
    const registry = Registry.make();
    const subscriptions: Array<FakeSubscription> = [];

    registry.set(
      linkstrConfigAtom,
      configWith(alice, makeFakeTransport([], subscriptions)),
    );
    const unmount = registry.mount(wrapInboxAtom);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(subscriptions).toHaveLength(0);

    registry.set(wrapInboxHandlerAtom, { onEvent: () => {} });
    await expect.poll(() => subscriptions.length).toBe(2);

    unmount();
    await expect.poll(() => subscriptions.length).toBe(0);
  });
});
