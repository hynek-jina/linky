import { Registry } from "./index";
import type { Atom, Result } from "./index";
import {
  ClientId,
  NostrSecretKey,
  NostrTransport,
  Pubkey,
  RelayPublishResult,
  RelayUrl,
  SeenReceiptDraft,
  UnixSeconds,
} from "@linky/linkstr";
import type { NostrTransportService } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import { sendSeenReceiptAtom } from "./seenReceipts";

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
const carol = makeIdentity();

const relayA = RelayUrl.make("wss://relay-a.test");

const draft = new SeenReceiptDraft({
  to: carol.pubkey,
  sinceSec: UnixSeconds.make(1_753_000_000),
  seenUpToSec: UnixSeconds.make(1_753_999_000),
  clientId: ClientId.make("client-42"),
});

const recipientOf = (wrap: PublishedWrap): string | null =>
  wrap.tags.find((tag) => tag[0] === "p")?.[1] ?? null;

const stubTransport = (
  published: Array<PublishedWrap>,
): Layer.Layer<NostrTransport> =>
  Layer.succeed(NostrTransport, {
    publish: (relays, wrap) =>
      Effect.sync(() => {
        published.push(wrap);
        return relays.map(
          (relay) =>
            new RelayPublishResult({ relay, accepted: true, detail: null }),
        );
      }),
    subscribe: () => Effect.die("subscribe not under test"),
    fetch: () => Effect.die("fetch not under test"),
  });

const configWith = (
  identity: Identity,
  transport: Layer.Layer<NostrTransport>,
): LinkstrConfig => ({
  secretKey: identity.secretKey,
  readRelays: [relayA],
  writeRelays: [relayA],
  transport,
});

const settle = <A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true }),
  );

describe("sendSeenReceiptAtom", () => {
  it("delivers via the configured transport and returns a receipt", async () => {
    const registry = Registry.make();
    const published: Array<PublishedWrap> = [];
    registry.set(
      linkstrConfigAtom,
      configWith(alice, stubTransport(published)),
    );

    registry.set(sendSeenReceiptAtom, draft);
    const exit = await settle(registry, sendSeenReceiptAtom);

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.clientId).toBe("client-42");
    expect(exit.value.rumorId).toMatch(/^[0-9a-f]{64}$/);

    expect(published).toHaveLength(2);
    const recipients = published.map(recipientOf);
    expect(recipients).toContain(alice.pubkey);
    expect(recipients).toContain(carol.pubkey);
  });

  it("fails with LinkstrNotConfigured while logged out", async () => {
    const registry = Registry.make();

    registry.set(sendSeenReceiptAtom, draft);
    const exit = await settle(registry, sendSeenReceiptAtom);

    expect(exit).toEqual(
      Exit.fail(expect.objectContaining({ _tag: "LinkstrNotConfigured" })),
    );
  });
});
