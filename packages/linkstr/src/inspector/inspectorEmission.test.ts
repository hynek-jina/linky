import { Effect, Fiber, Layer, Stream } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { MessageText } from "../chat/domain";
import { linkstrServices } from "../composition";
import { NostrSecretKey, Pubkey, RelayUrl } from "../domain/primitives";
import { OutboxRef } from "../outbox/domain";
import { Outbox } from "../outbox/Outbox";
import { observeTransport } from "../relayHealth/observeTransport";
import { RelayHealth } from "../relayHealth/RelayHealth";
import { NostrTransport, RelayPublishResult } from "../services/NostrTransport";
import type { NostrTransportService } from "../services/NostrTransport";
import { Inspector } from "./Inspector";
import { inspectTransport } from "./inspectTransport";

const secretKey = NostrSecretKey.make(generateSecretKey());
const peer = Pubkey.make(getPublicKey(generateSecretKey()));
const relay = RelayUrl.make("wss://relay.test");

const eventLabel = (event: { _tag: string }): string =>
  "name" in event ? `${event._tag}:${String(event.name)}` : event._tag;

/**
 * Composes the runtime exactly like linkstr-react/src/runtime.ts and runs one
 * chat send through the outbox, returning every inspector event label seen.
 */
const collectSendEmissions = (
  publish: NostrTransportService["publish"],
): Promise<string[]> => {
  const transport = Layer.succeed(NostrTransport, {
    publish,
    subscribe: () => Effect.never,
    fetch: () => Effect.succeed([]),
  });
  const layer = linkstrServices({
    secretKey,
    readRelays: [relay],
    writeRelays: [relay],
    transport: inspectTransport(observeTransport(transport)),
  }).pipe(
    Layer.provideMerge(Inspector.live),
    Layer.provideMerge(RelayHealth.live),
  );

  const program = Effect.gen(function* () {
    const inspector = yield* Inspector;
    const collected: string[] = [];
    const consumer = yield* Stream.runForEach(inspector.events, (event) =>
      Effect.sync(() => {
        collected.push(eventLabel(event));
      }),
    ).pipe(Effect.fork);

    const outbox = yield* Outbox;
    yield* outbox.enqueue(
      {
        _tag: "chat.text",
        draft: { to: peer, content: MessageText.make("emission test") },
      },
      OutboxRef.make("emission-test-1"),
    );
    // The worker delivers asynchronously; poll until the terminal job event
    // lands instead of guessing a fixed delay.
    yield* Effect.iterate(0, {
      while: (tries) =>
        tries < 100 &&
        !collected.some((label) =>
          label.startsWith("PlainOperationSucceeded:outbox.job"),
        ) &&
        !collected.some((label) =>
          label.startsWith("OperationFailed:outbox.job"),
        ),
      body: (tries) => Effect.as(Effect.sleep("20 millis"), tries + 1),
    });
    yield* Fiber.interrupt(consumer);
    return collected;
  });

  return Effect.runPromise(Effect.scoped(Effect.provide(program, layer)));
};

describe("inspector emission through the outbox send path", () => {
  it("emits enqueue, operation, wire publishes, and job settle for a chat send", async () => {
    const collected = await collectSendEmissions((relays) =>
      Effect.succeed(
        relays.map(
          (relayUrl) =>
            new RelayPublishResult({
              relay: relayUrl,
              accepted: true,
              detail: null,
            }),
        ),
      ),
    );

    expect(collected).toContain("PlainOperationSucceeded:outbox.enqueue");
    expect(collected).toContain("OperationSucceeded:chat.sendText");
    expect(collected).toContain("PlainOperationSucceeded:outbox.job");
    expect(collected.filter((label) => label === "WirePublished")).toHaveLength(
      2,
    );
  });

  it("still emits and still delivers when the transport returns off-schema results", async () => {
    // Regression: a throwing event constructor used to swallow the emission
    // AND fail the delivery as a defect. Plain objects instead of
    // RelayPublishResult instances reproduce that exact condition.
    const collected = await collectSendEmissions((relays) =>
      Effect.succeed(
        relays.map((relayUrl) => ({
          relay: relayUrl,
          accepted: true,
          detail: null,
        })),
      ),
    );

    expect(collected).toContain("PlainOperationSucceeded:outbox.job");
    expect(collected).toContain("OperationSucceeded:chat.sendText");
    expect(collected.filter((label) => label === "WirePublished")).toHaveLength(
      2,
    );
  });
});
