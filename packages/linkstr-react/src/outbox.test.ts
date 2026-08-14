import { Registry } from "./index";
import type { Atom, Result } from "./index";
import {
  ClientId,
  MessageText,
  NostrSecretKey,
  NostrTransport,
  OutboxRef,
  OutboxStore,
  Pubkey,
  RelayPublishResult,
  RelayUrl,
  StoredOutboxJob,
  TextMessageDraft,
} from "@linky/linkstr";
import type { NostrTransportService, OutboxResult } from "@linky/linkstr";
import { Effect, Exit, Layer, Schema } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { LinkstrConfig } from "./config";
import { linkstrConfigAtom } from "./config";
import {
  enqueueOutboxAtom,
  outboxResultsAtom,
  outboxResultsHandlerAtom,
} from "./outbox";

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

const storageKey = "test.outbox";

const configWith = (
  transport: Layer.Layer<NostrTransport>,
  storage: StubStorage,
): LinkstrConfig => ({
  secretKey: alice.secretKey,
  readRelays: [relay],
  writeRelays: [relay],
  transport,
  outboxStore: OutboxStore.fromStringStorage(storage, storageKey),
});

const settle = <A, E>(
  registry: Registry.Registry,
  atom: Atom.Atom<Result.Result<A, E>>,
): Promise<Exit.Exit<A, E>> =>
  Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true }),
  );

const decodeStoredJobs = Schema.decodeUnknownSync(
  Schema.parseJson(Schema.Array(StoredOutboxJob)),
);

interface StubStorage {
  readonly map: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const stubStorage = (): StubStorage => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
};

const textInput = (ref: string) => ({
  op: {
    _tag: "chat.text" as const,
    draft: new TextMessageDraft({
      to: bob.pubkey,
      content: MessageText.make("hello"),
      clientId: ClientId.make("client-react"),
    }),
  },
  ref: OutboxRef.make(ref),
});

describe("outbox atoms", () => {
  it("enqueues, delivers, and acks only after the handler resolves", async () => {
    const storage = stubStorage();
    const registry = Registry.make();
    const published: Array<PublishedWrap> = [];
    registry.set(
      linkstrConfigAtom,
      configWith(stubTransport(published), storage),
    );

    const handled: Array<OutboxResult> = [];
    registry.set(outboxResultsHandlerAtom, {
      onResult: async (result) => {
        handled.push(result);
      },
    });
    const unmount = registry.mount(outboxResultsAtom);

    registry.set(enqueueOutboxAtom, textInput("row-1"));
    const exit = await settle(registry, enqueueOutboxAtom);

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.ref).toBe("row-1");
    expect(exit.value.messageId).toMatch(/^[0-9a-f]{64}$/);
    expect(exit.value.clientId).toBe("client-react");

    await expect.poll(() => handled.length).toBe(1);
    expect(handled[0]).toEqual(
      expect.objectContaining({
        _tag: "OutboxJobSucceeded",
        jobId: exit.value.jobId,
        ref: "row-1",
      }),
    );
    expect(published).toHaveLength(2);

    // Acked after the handler resolved: the durable job list is empty again.
    await expect
      .poll(() => decodeStoredJobs(storage.map.get(storageKey) ?? "[]"))
      .toEqual([]);
    unmount();
  });

  it("does not ack when the handler rejects", async () => {
    const storage = stubStorage();
    const registry = Registry.make();
    registry.set(linkstrConfigAtom, configWith(stubTransport([]), storage));

    let calls = 0;
    registry.set(outboxResultsHandlerAtom, {
      onResult: () => {
        calls += 1;
        return Promise.reject(new Error("persist failed"));
      },
    });
    const unmount = registry.mount(outboxResultsAtom);

    registry.set(enqueueOutboxAtom, textInput("row-1"));
    const exit = await settle(registry, enqueueOutboxAtom);
    expect(Exit.isSuccess(exit)).toBe(true);

    await expect.poll(() => calls).toBe(1);
    const jobs = decodeStoredJobs(storage.map.get(storageKey) ?? "[]");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.state._tag).toBe("awaiting-ack");
    unmount();
  });
});
