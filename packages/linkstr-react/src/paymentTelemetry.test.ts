import { Registry } from "./index";
import type { Atom, Result } from "./index";
import {
  ClientId,
  NostrSecretKey,
  NostrTransport,
  OutboxRef,
  PaymentTelemetryDraft,
  PaymentTelemetryReceipt,
  Pubkey,
  RelayPublishResult,
  RelayUrl,
  UnixSeconds,
} from "@linky/linkstr";
import type { NostrTransportService, OutboxResult } from "@linky/linkstr";
import { Effect, Exit, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import { outboxResultsAtom, outboxResultsHandlerAtom } from "./outbox";
import { enqueuePaymentTelemetryAtom } from "./paymentTelemetry";

type PublishedEvent = Parameters<NostrTransportService["publish"]>[1];

const secretKey = NostrSecretKey.make(generateSecretKey());
const recipientSecretKey = NostrSecretKey.make(generateSecretKey());
const recipient = Pubkey.make(getPublicKey(recipientSecretKey));
const relay = RelayUrl.make("wss://relay.test");

const settle = <A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true }),
  );

const draft = new PaymentTelemetryDraft({
  id: ClientId.make("telemetry-react"),
  createdAtSec: UnixSeconds.make(1_754_000_000),
  direction: "out",
  status: "ok",
  method: "lightning_invoice",
  phase: "complete",
  mint: null,
  amountBucket: "lte_100",
  feeBucket: null,
  errorCode: null,
  errorDetail: null,
  appHost: null,
  devicePlatform: null,
  appRuntime: null,
  appVersion: "26.9.0",
});

describe("enqueuePaymentTelemetryAtom", () => {
  it("delivers through the outbox and reports a telemetry receipt", async () => {
    const published: Array<PublishedEvent> = [];
    const transport = Layer.succeed(NostrTransport, {
      publish: (relays, event) =>
        Effect.sync(() => {
          published.push(event);
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
    const config: LinkstrConfig = {
      secretKey,
      readRelays: [relay],
      writeRelays: [relay],
      transport,
    };
    const registry = Registry.make();
    registry.set(linkstrConfigAtom, config);

    const handled: Array<OutboxResult> = [];
    registry.set(outboxResultsHandlerAtom, {
      onResult: async (result) => {
        handled.push(result);
      },
    });
    const unmount = registry.mount(outboxResultsAtom);

    registry.set(enqueuePaymentTelemetryAtom, {
      draft,
      recipient,
      ref: OutboxRef.make("telemetry:telemetry-react"),
    });
    const exit = await settle(registry, enqueuePaymentTelemetryAtom);

    expect(Exit.isSuccess(exit)).toBe(true);
    await expect.poll(() => handled.length).toBe(1);
    expect(published).toHaveLength(1);

    const result = handled[0];
    expect(result).toEqual(
      expect.objectContaining({
        _tag: "OutboxJobSucceeded",
        ref: "telemetry:telemetry-react",
      }),
    );
    if (result?._tag !== "OutboxJobSucceeded") return;
    expect(result.receipt).toBeInstanceOf(PaymentTelemetryReceipt);
    if (!(result.receipt instanceof PaymentTelemetryReceipt)) return;
    expect(result.receipt.clientId).toBe(draft.id);
    unmount();
  });
});
