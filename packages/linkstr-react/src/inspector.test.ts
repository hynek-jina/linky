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
import type { InspectorEvent, NostrTransportService } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import { Registry } from "./index";
import { inspectorEventsAtom, inspectorHandlerAtom } from "./inspector";
import { retractReactionAtom } from "./reactions";

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

const configWith = (inspector: boolean): LinkstrConfig => ({
  secretKey: aliceKey,
  readRelays: [relayA],
  writeRelays: [relayA],
  transport: Layer.succeed(NostrTransport, acceptingTransport),
  inspector,
});

const draft = new RetractionDraft({
  to: bobPubkey,
  reactionIds: [RumorId.make("ab".repeat(32))],
  clientId: ClientId.make("client-inspector"),
});

const retract = async (registry: ReturnType<typeof Registry.make>) => {
  registry.set(retractReactionAtom, draft);
  const exit = await Effect.runPromiseExit(
    Registry.getResult(registry, retractReactionAtom, {
      suspendOnWaiting: true,
    }),
  );
  if (Exit.isFailure(exit)) throw new Error("send failed");
};

describe("inspectorEventsAtom", () => {
  it("streams operation and wire events to the sink, linked by wrap ids", async () => {
    const registry = Registry.make();
    const seen: Array<InspectorEvent> = [];

    registry.set(linkstrConfigAtom, configWith(true));
    registry.set(inspectorHandlerAtom, {
      onEvent: (event) => {
        seen.push(event);
      },
    });
    const unmount = registry.mount(inspectorEventsAtom);

    await retract(registry);
    await expect.poll(() => seen.length).toBe(3);

    const wires = seen.filter((event) => event._tag === "WirePublished");
    const operation = seen.find((event) => event._tag === "OperationSucceeded");
    if (operation?._tag !== "OperationSucceeded") {
      throw new Error("no OperationSucceeded observed");
    }
    expect(operation.name).toBe("reactions.retract");
    expect(operation.clientId).toBe(draft.clientId);
    if (operation.selfCopy === null) {
      throw new Error("reaction operation lost its self copy");
    }
    expect(wires.map((event) => event.wrapId).sort()).toEqual(
      [operation.selfCopy.wrapId, operation.recipientCopy.wrapId].sort(),
    );

    unmount();
    registry.dispose();
  });

  it("stays silent when the config does not enable the inspector", async () => {
    const registry = Registry.make();
    const seen: Array<InspectorEvent> = [];

    registry.set(linkstrConfigAtom, configWith(false));
    registry.set(inspectorHandlerAtom, {
      onEvent: (event) => {
        seen.push(event);
      },
    });
    const unmount = registry.mount(inspectorEventsAtom);

    await retract(registry);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toHaveLength(0);

    unmount();
    registry.dispose();
  });
});
