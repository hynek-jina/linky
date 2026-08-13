import {
  ClientId,
  Emoji,
  NostrSecretKey,
  NostrTransport,
  Pubkey,
  ReactionDraft,
  RelayPublishResult,
  RelayUrl,
  RumorId,
} from "@linky/linkstr";
import type { InspectorEvent, NostrTransportService } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import { Registry } from "./index";
import { inspectorEventsAtom, inspectorHandlerAtom } from "./inspector";
import { sendReactionAtom } from "./reactions";

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
};

const configWith = (inspector: boolean): LinkstrConfig => ({
  secretKey: aliceKey,
  readRelays: [relayA],
  writeRelays: [relayA],
  transport: Layer.succeed(NostrTransport, acceptingTransport),
  inspector,
});

const draft = new ReactionDraft({
  to: bobPubkey,
  target: RumorId.make("ab".repeat(32)),
  targetKind: "text",
  targetAuthor: bobPubkey,
  emoji: Emoji.make("🔥"),
  clientId: ClientId.make("client-inspector"),
});

const sendReaction = async (registry: ReturnType<typeof Registry.make>) => {
  registry.set(sendReactionAtom, draft);
  const exit = await Effect.runPromiseExit(
    Registry.getResult(registry, sendReactionAtom, { suspendOnWaiting: true }),
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

    await sendReaction(registry);
    await expect.poll(() => seen.length).toBe(3);

    const wires = seen.filter((event) => event._tag === "WirePublished");
    const operation = seen.find((event) => event._tag === "OperationSucceeded");
    if (operation?._tag !== "OperationSucceeded") {
      throw new Error("no OperationSucceeded observed");
    }
    expect(operation.name).toBe("reactions.react");
    expect(operation.clientId).toBe(draft.clientId);
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

    await sendReaction(registry);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toHaveLength(0);

    unmount();
    registry.dispose();
  });
});
