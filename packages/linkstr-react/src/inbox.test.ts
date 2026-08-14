import { Registry } from "./index";
import {
  ClientId,
  Emoji,
  NIP59_BACKDATE_MARGIN_SECONDS,
  NostrSecretKey,
  NostrTransport,
  Pubkey,
  ReactionDraft,
  RelayPublishResult,
  RelayUrl,
  RumorId,
  UnixSeconds,
} from "@linky/linkstr";
import type { NostrTransportService, WrapInboxEvent } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { Event as NostrToolsEvent, Filter } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import { wrapInboxAtom, wrapInboxHandlerAtom } from "./inbox";
import { sendReactionAtom } from "./reactions";

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
  fetch: () => Effect.die("fetch not under test"),
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
const wrapFromBob = async (emoji: string): Promise<NostrToolsEvent> => {
  const registry = Registry.make();
  const published: Array<PublishedWrap> = [];
  registry.set(
    linkstrConfigAtom,
    configWith(bob, makeFakeTransport(published, [])),
  );
  registry.set(
    sendReactionAtom,
    new ReactionDraft({
      to: alice.pubkey,
      target: RumorId.make("ab".repeat(32)),
      targetKind: "text",
      targetAuthor: alice.pubkey,
      emoji: Emoji.make(emoji),
      clientId: ClientId.make("client-inbox"),
    }),
  );
  const exit = await Effect.runPromiseExit(
    Registry.getResult(registry, sendReactionAtom, { suspendOnWaiting: true }),
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
  it("feeds inbound wraps through the handler and reports the cursor", async () => {
    const wrap = await wrapFromBob("🔥");
    const registry = Registry.make();
    const subscriptions: Array<FakeSubscription> = [];
    const handled: Array<WrapInboxEvent> = [];
    const cursors: Array<UnixSeconds> = [];

    registry.set(
      linkstrConfigAtom,
      configWith(alice, makeFakeTransport([], subscriptions)),
    );
    registry.set(wrapInboxHandlerAtom, {
      onEvent: (event) => {
        handled.push(event);
      },
      onCursor: (cursor) => {
        cursors.push(cursor);
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
        _tag: "ReactionAdded",
        from: bob.pubkey,
        emoji: "🔥",
      }),
    );
    expect(cursors).toEqual([wrap.created_at]);

    // The same wrap from the second relay is deduped, not re-handled.
    subscriptions[1]?.onEvent(wrap);
    const second = await wrapFromBob("👍");
    subscriptions[1]?.onEvent(second);
    await expect.poll(() => handled.length).toBe(2);
    expect(handled[1]).toEqual(
      expect.objectContaining({ _tag: "ReactionAdded", emoji: "👍" }),
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
