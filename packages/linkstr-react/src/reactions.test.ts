// Registry comes through the package index to cover the atom-react re-export.
import { Registry } from "./index";
import type { Atom, Result } from "./index";
import {
  ClientId,
  NostrSecretKey,
  NostrTransport,
  Pubkey,
  RelayPublishResult,
  RelayUrl,
  RetractionDraft,
  RumorId,
} from "@linky/linkstr";
import type { NostrTransportService } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
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
const carol = makeIdentity();

const relayA = RelayUrl.make("wss://relay-a.test");
const relayB = RelayUrl.make("wss://relay-b.test");

const draft = new RetractionDraft({
  to: carol.pubkey,
  reactionIds: [RumorId.make("ab".repeat(32))],
  clientId: ClientId.make("client-42"),
});

const recipientOf = (wrap: PublishedWrap): string | null =>
  wrap.tags.find((tag) => tag[0] === "p")?.[1] ?? null;

const makeStubService = (
  published: Array<PublishedWrap>,
  acceptFor: (recipient: string | null, relay: RelayUrl) => boolean,
): NostrTransportService => ({
  publish: (relays, wrap) =>
    Effect.sync(() => {
      published.push(wrap);
      return relays.map(
        (relay) =>
          new RelayPublishResult({
            relay,
            accepted: acceptFor(recipientOf(wrap), relay),
            detail: acceptFor(recipientOf(wrap), relay) ? null : "blocked",
          }),
      );
    }),
  subscribe: () => Effect.die("subscribe not under test"),
  fetch: () => Effect.die("fetch not under test"),
});

/** Transport stub with an observable scope, to prove runtime rebuilds dispose it. */
const stubTransport = (
  published: Array<PublishedWrap>,
  acceptFor: (recipient: string | null, relay: RelayUrl) => boolean,
  onDispose?: () => void,
): Layer.Layer<NostrTransport> =>
  Layer.scoped(
    NostrTransport,
    Effect.acquireRelease(
      Effect.sync(() => makeStubService(published, acceptFor)),
      () => Effect.sync(() => onDispose?.()),
    ),
  );

const configWith = (
  identity: Identity,
  transport: Layer.Layer<NostrTransport>,
): LinkstrConfig => ({
  secretKey: identity.secretKey,
  readRelays: [relayA, relayB],
  writeRelays: [relayA, relayB],
  transport,
});

// suspendOnWaiting skips the stale previous Result while a re-invocation runs.
const settle = <A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true }),
  );

const retract = (registry: Registry.Registry, retraction: RetractionDraft) => {
  registry.set(retractReactionAtom, retraction);
  return settle(registry, retractReactionAtom);
};

describe("retractReactionAtom", () => {
  it("delivers via the configured transport and returns a receipt", async () => {
    const registry = Registry.make();
    const published: Array<PublishedWrap> = [];
    registry.set(
      linkstrConfigAtom,
      configWith(
        alice,
        stubTransport(published, () => true),
      ),
    );

    const exit = await retract(registry, draft);

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.clientId).toBe("client-42");
    expect(exit.value.retractionId).toMatch(/^[0-9a-f]{64}$/);

    expect(published).toHaveLength(2);
    const recipients = published.map(recipientOf);
    expect(recipients).toContain(alice.pubkey);
    expect(recipients).toContain(carol.pubkey);
  });

  it("fails with LinkstrNotConfigured while logged out", async () => {
    const registry = Registry.make();

    const exit = await retract(registry, draft);

    expect(exit).toEqual(
      Exit.fail(expect.objectContaining({ _tag: "LinkstrNotConfigured" })),
    );
  });

  it("rebuilds the runtime on config change and disposes the old one", async () => {
    const registry = Registry.make();
    const unmount = registry.mount(retractReactionAtom);
    const disposed: Array<string> = [];
    const publishedAsAlice: Array<PublishedWrap> = [];
    const publishedAsBob: Array<PublishedWrap> = [];

    registry.set(
      linkstrConfigAtom,
      configWith(
        alice,
        stubTransport(
          publishedAsAlice,
          () => true,
          () => disposed.push("alice"),
        ),
      ),
    );
    await retract(registry, draft);
    expect(publishedAsAlice.map(recipientOf)).toContain(alice.pubkey);

    registry.set(
      linkstrConfigAtom,
      configWith(
        bob,
        stubTransport(
          publishedAsBob,
          () => true,
          () => disposed.push("bob"),
        ),
      ),
    );
    const exit = await retract(registry, draft);

    expect(Exit.isSuccess(exit)).toBe(true);
    // The self copy now seals to bob: the new identity signed the send.
    expect(publishedAsBob.map(recipientOf)).toContain(bob.pubkey);
    expect(publishedAsBob.map(recipientOf)).not.toContain(alice.pubkey);
    await expect.poll(() => disposed).toEqual(["alice"]);

    unmount();
  });
});
