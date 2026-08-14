import { Registry } from "./index";
import type { Atom, Result } from "./index";
import {
  BankOfferDraft,
  BankOfferId,
  ClientId,
  NostrSecretKey,
  NostrTransport,
  Pubkey,
  RelayPublishResult,
  RelayUrl,
} from "@linky/linkstr";
import type { NostrTransportService } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { sendBankOfferAtom } from "./bankOffers";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";

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
const relay = RelayUrl.make("wss://relay.test");

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
          (relayUrl) =>
            new RelayPublishResult({
              relay: relayUrl,
              accepted: true,
              detail: null,
            }),
        );
      }),
    subscribe: () => Effect.die("subscribe not under test"),
    fetch: () => Effect.die("fetch not under test"),
  });

const configWith = (transport: Layer.Layer<NostrTransport>): LinkstrConfig => ({
  secretKey: alice.secretKey,
  readRelays: [relay],
  writeRelays: [relay],
  transport,
});

const settle = <A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true }),
  );

describe("sendBankOfferAtom", () => {
  it("delivers through the configured transport and returns a receipt", async () => {
    const registry = Registry.make();
    const published: Array<PublishedWrap> = [];
    registry.set(linkstrConfigAtom, configWith(stubTransport(published)));

    registry.set(
      sendBankOfferAtom,
      new BankOfferDraft({
        to: bob.pubkey,
        offerId: BankOfferId.make("offer-react"),
        offerer: alice.pubkey,
        status: "offered",
        amountText: "1 000 Kč",
        text: "Zaplatíš za mě bankovní platbu?",
        clientId: ClientId.make("client-react"),
      }),
    );
    const exit = await settle(registry, sendBankOfferAtom);

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value).toEqual(
      expect.objectContaining({
        offerId: "offer-react",
        status: "offered",
        clientId: "client-react",
      }),
    );
    expect(exit.value.snapshotId).toMatch(/^[0-9a-f]{64}$/);
    expect(published.map(recipientOf)).toEqual([bob.pubkey, alice.pubkey]);
  });
});
