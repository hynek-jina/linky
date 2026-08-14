import { Registry } from "./index";
import type { Atom, Result } from "./index";
import {
  NostrSecretKey,
  NostrTransport,
  Pubkey,
  RelayListEntry,
  RelayListsDraft,
  RelayPublishResult,
  RelayUrl,
} from "@linky/linkstr";
import type { NostrTransportService } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";
import type { Event as NostrToolsEvent } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import { publishMuteListAtom } from "./muteList";
import { fetchOwnRelayListsAtom, publishRelayListsAtom } from "./relayLists";

type PublishedEvent = Parameters<NostrTransportService["publish"]>[1];

const secretKey = NostrSecretKey.make(generateSecretKey());
const alicePubkey = Pubkey.make(getPublicKey(secretKey));
const bobPubkey = Pubkey.make(getPublicKey(generateSecretKey()));

const relayA = RelayUrl.make("wss://relay-a.test");
const relayOne = RelayUrl.make("wss://one.test");
const relayDm = RelayUrl.make("wss://dm.test");

const makeFakeTransport = (
  published: Array<PublishedEvent>,
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
  subscribe: () => Effect.die("subscribe not under test"),
  fetch: () => Effect.succeed(stored),
});

const configWith = (transport: NostrTransportService): LinkstrConfig => ({
  secretKey,
  readRelays: [relayA],
  writeRelays: [relayA],
  transport: Layer.succeed(NostrTransport, transport),
});

const settle = <A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true }),
  );

describe("publishRelayListsAtom", () => {
  it("publishes both list kinds and returns the paired receipt", async () => {
    const registry = Registry.make();
    const published: Array<PublishedEvent> = [];
    registry.set(linkstrConfigAtom, configWith(makeFakeTransport(published)));

    registry.set(
      publishRelayListsAtom,
      new RelayListsDraft({
        relays: [new RelayListEntry({ relay: relayOne, marker: "write" })],
        dmRelays: [relayDm],
      }),
    );
    const exit = await settle(registry, publishRelayListsAtom);

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.relayList.kind).toBe(10002);
    expect(exit.value.dmRelayList.kind).toBe(10050);
    expect(published.map((event) => event.kind).sort()).toEqual([10002, 10050]);
  });
});

describe("fetchOwnRelayListsAtom", () => {
  it("fetches the configured identity's lists", async () => {
    const registry = Registry.make();
    const stored = [
      finalizeEvent(
        {
          kind: 10002,
          tags: [["r", relayOne, "read"]],
          content: "",
          created_at: 1_754_000_000,
        },
        secretKey,
      ),
    ];
    registry.set(linkstrConfigAtom, configWith(makeFakeTransport([], stored)));

    registry.set(fetchOwnRelayListsAtom, undefined);
    const exit = await settle(registry, fetchOwnRelayListsAtom);

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.relays).toEqual([
      expect.objectContaining({ relay: relayOne, marker: "read" }),
    ]);
    expect(exit.value.dmRelays).toBeNull();
  });
});

describe("publishMuteListAtom", () => {
  it("publishes the mute list for the configured identity", async () => {
    const registry = Registry.make();
    const published: Array<PublishedEvent> = [];
    registry.set(linkstrConfigAtom, configWith(makeFakeTransport(published)));

    registry.set(publishMuteListAtom, [bobPubkey]);
    const exit = await settle(registry, publishMuteListAtom);

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.kind).toBe(10000);
    const event = published[0];
    expect(event?.pubkey).toBe(alicePubkey);
    expect(event?.tags).toEqual([["p", bobPubkey]]);
  });
});
