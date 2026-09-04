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
import type { NostrTransportService, RelayHealthState } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import { Registry, Result } from "./index";
import { retractReactionAtom } from "./reactions";
import { relayHealthAtom } from "./relayHealth";

const aliceKey = NostrSecretKey.make(generateSecretKey());
const bobPubkey = Pubkey.make(getPublicKey(generateSecretKey()));

const relayA = RelayUrl.make("wss://relay-a.test");

const acceptingTransport: NostrTransportService = {
  publish: (relays) =>
    Effect.succeed(
      relays.map(
        (relay) =>
          new RelayPublishResult({ relay, accepted: true, detail: null }),
      ),
    ),
  subscribe: () => Effect.die("subscribe not under test"),
  fetch: () => Effect.die("fetch not under test"),
};

const config: LinkstrConfig = {
  secretKey: aliceKey,
  readRelays: [relayA],
  writeRelays: [relayA],
  transport: Layer.succeed(NostrTransport, acceptingTransport),
};

const draft = new RetractionDraft({
  to: bobPubkey,
  reactionIds: [RumorId.make("ab".repeat(32))],
  clientId: ClientId.make("client-relay-health"),
});

const healthOf = (
  registry: ReturnType<typeof Registry.make>,
  relay: string,
): RelayHealthState | undefined => {
  const result = registry.get(relayHealthAtom);
  return Result.isSuccess(result) ? result.value.get(relay) : undefined;
};

describe("relayHealthAtom", () => {
  it("reflects traffic-derived relay health after a publish", async () => {
    const registry = Registry.make();
    registry.set(linkstrConfigAtom, config);
    const unmount = registry.mount(relayHealthAtom);

    await expect
      .poll(() => Result.isSuccess(registry.get(relayHealthAtom)))
      .toBe(true);
    expect(healthOf(registry, relayA)).toBeUndefined();

    registry.set(retractReactionAtom, draft);
    const exit = await Effect.runPromiseExit(
      Registry.getResult(registry, retractReactionAtom, {
        suspendOnWaiting: true,
      }),
    );
    if (Exit.isFailure(exit)) throw new Error("send failed");

    await expect
      .poll(() => healthOf(registry, relayA)?.state)
      .toBe("connected");
    expect(healthOf(registry, relayA)).toEqual(
      expect.objectContaining({
        state: "connected",
        detail: null,
        lastPublish: expect.objectContaining({ accepted: true, detail: null }),
      }),
    );

    unmount();
    registry.dispose();
  });
});
