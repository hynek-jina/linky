import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools";
import { NostrSecretKey, Pubkey, RelayUrl } from "../domain/primitives";
import { SignedPlainEvent, tagValues } from "../internal/nostrEvent";
import { LinkstrIdentity } from "../services/LinkstrIdentity";
import type { LinkstrIdentityService } from "../services/LinkstrIdentity";
import { NostrTransport, RelayPublishResult } from "../services/NostrTransport";
import { RelayPolicy } from "../services/RelayPolicy";
import { MuteList } from "./MuteList";

const makeIdentity = (): LinkstrIdentityService => {
  const secretKey = NostrSecretKey.make(generateSecretKey());
  return { pubkey: Pubkey.make(getPublicKey(secretKey)), secretKey };
};

const alice = makeIdentity();
const bob = makeIdentity();
const carol = makeIdentity();

const relayA = RelayUrl.make("wss://relay-a.test");

const stubTransport = (
  published: Array<SignedPlainEvent>,
  accept: boolean,
): Layer.Layer<NostrTransport> =>
  Layer.succeed(NostrTransport, {
    publish: (relays, event) =>
      Effect.sync(() => {
        if (!(event instanceof SignedPlainEvent)) {
          throw new Error("mute list publishes only plain events");
        }
        published.push(event);
        return relays.map(
          (relay) =>
            new RelayPublishResult({
              relay,
              accepted: accept,
              detail: accept ? null : "blocked",
            }),
        );
      }),
    subscribe: () => Effect.die("subscribe not under test"),
    fetch: () => Effect.die("fetch not under test"),
  });

const runWith = <A, E>(
  transport: Layer.Layer<NostrTransport>,
  program: Effect.Effect<A, E, MuteList>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    program.pipe(
      Effect.provide(
        MuteList.Default.pipe(
          Layer.provide(
            Layer.mergeAll(
              LinkstrIdentity.fromSecretKey(alice.secretKey),
              RelayPolicy.fixed({
                readRelays: [relayA],
                writeRelays: [relayA],
              }),
              transport,
            ),
          ),
        ),
      ),
    ),
  );

describe("MuteList.publishMuteList", () => {
  it("publishes a signed kind 10000 with p tags and empty content", async () => {
    const published: Array<SignedPlainEvent> = [];
    const exit = await runWith(
      stubTransport(published, true),
      Effect.flatMap(MuteList, (muteList) =>
        muteList.publishMuteList([bob.pubkey, carol.pubkey]),
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    const event = published[0];
    if (event === undefined) throw new Error("nothing published");
    expect(event.kind).toBe(10000);
    expect(event.content).toBe("");
    expect(verifyEvent(event)).toBe(true);
    expect(tagValues(event.tags, "p")).toEqual([bob.pubkey, carol.pubkey]);
    expect(exit.value.eventId).toBe(event.id);
    expect(exit.value.results).toEqual([
      expect.objectContaining({ relay: relayA, accepted: true }),
    ]);
  });

  it("fails with NoRelayAcceptedEvent when no relay accepts", async () => {
    const exit = await runWith(
      stubTransport([], false),
      Effect.flatMap(MuteList, (muteList) =>
        muteList.publishMuteList([bob.pubkey]),
      ),
    );

    expect(exit).toEqual(
      Exit.fail(
        expect.objectContaining({ _tag: "NoRelayAcceptedEvent", kind: 10000 }),
      ),
    );
  });
});
