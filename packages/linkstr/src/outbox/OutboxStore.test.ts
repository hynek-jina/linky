import { Effect, Layer } from "effect";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import {
  ChatMessageReceipt,
  MessageEditReceipt,
  MessageText,
  TextMessageDraft,
} from "../chat/domain";
import { WrapDelivery } from "../domain/delivery";
import {
  ClientId,
  NostrSecretKey,
  Pubkey,
  RelayUrl,
  RumorId,
  UnixSeconds,
  WrapId,
} from "../domain/primitives";
import {
  PaymentTelemetryDraft,
  PaymentTelemetryReceipt,
} from "../paymentTelemetry/domain";
import {
  OutboxJobFailed,
  OutboxJobId,
  OutboxJobSucceeded,
  OutboxRef,
  StoredOutboxJob,
} from "./domain";
import type { OutboxJobState, OutboxReceipt } from "./domain";
import { OutboxStore } from "./OutboxStore";
import type { OutboxStoreService } from "./OutboxStore";

const secretKey = NostrSecretKey.make(generateSecretKey());
const pubkey = Pubkey.make(getPublicKey(secretKey));
const relay = RelayUrl.make("wss://relay.test");
const rumorId = RumorId.make("ab".repeat(32));
const clientId = ClientId.make("client-42");
const sentAt = UnixSeconds.make(1_700_000_000);
const storageKey = "test.outbox";

const delivery = (suffix: string): WrapDelivery =>
  new WrapDelivery({
    wrapId: WrapId.make(suffix.repeat(32)),
    acceptedBy: [relay],
    rejectedBy: [],
  });

const makeJob = (id: string, state?: OutboxJobState): StoredOutboxJob =>
  new StoredOutboxJob({
    jobId: OutboxJobId.make(id),
    ref: OutboxRef.make(`ref-${id}`),
    operation: {
      _tag: "chat.text",
      draft: new TextMessageDraft({
        to: pubkey,
        content: MessageText.make("hi"),
        clientId,
        sentAt,
      }),
    },
    pubkey,
    enqueuedAt: sentAt,
    state: state ?? { _tag: "queued" },
  });

const telemetryDraft = new PaymentTelemetryDraft({
  id: clientId,
  createdAtSec: sentAt,
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

const succeededWith = (id: string, receipt: OutboxReceipt): OutboxJobState => ({
  _tag: "awaiting-ack",
  result: new OutboxJobSucceeded({
    jobId: OutboxJobId.make(id),
    ref: OutboxRef.make(`ref-${id}`),
    receipt,
  }),
});

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

const buildStore = (layer: Layer.Layer<OutboxStore>): OutboxStoreService =>
  Effect.runSync(OutboxStore.pipe(Effect.provide(layer)));

const run = <A>(effect: Effect.Effect<A>): A => Effect.runSync(effect);

describe("OutboxStore.fromStringStorage", () => {
  it("persists jobs under the given key across store rebuilds", () => {
    const storage = stubStorage();

    const store = buildStore(
      OutboxStore.fromStringStorage(storage, storageKey),
    );
    run(store.insert(makeJob("job-1")));
    run(store.insert(makeJob("job-2")));
    run(
      store.update(
        makeJob("job-1", {
          _tag: "awaiting-ack",
          result: new OutboxJobFailed({
            jobId: OutboxJobId.make("job-1"),
            ref: OutboxRef.make("ref-job-1"),
            reason: "unexpected-error",
            detail: "boom",
          }),
        }),
      ),
    );
    run(store.remove(OutboxJobId.make("job-2")));

    expect([...storage.map.keys()]).toEqual([storageKey]);

    const rebuilt = buildStore(
      OutboxStore.fromStringStorage(storage, storageKey),
    );
    const jobs = run(rebuilt.loadAll);
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    expect(job).toBeInstanceOf(StoredOutboxJob);
    expect(job?.jobId).toBe("job-1");
    expect(job?.state._tag).toBe("awaiting-ack");
    if (job?.state._tag !== "awaiting-ack") return;
    expect(job.state.result).toBeInstanceOf(OutboxJobFailed);
  });

  it("revives receipt classes through the JSON roundtrip", () => {
    const storage = stubStorage();

    const chatReceipt = new ChatMessageReceipt({
      rumorId,
      clientId,
      sentAt,
      selfCopy: delivery("cd"),
      recipientCopy: delivery("ef"),
    });
    const editReceipt = new MessageEditReceipt({
      rumorId,
      editOf: RumorId.make("12".repeat(32)),
      clientId,
      sentAt,
      selfCopy: delivery("cd"),
      recipientCopy: delivery("ef"),
    });

    const store = buildStore(
      OutboxStore.fromStringStorage(storage, storageKey),
    );
    run(store.insert(makeJob("chat", succeededWith("chat", chatReceipt))));
    run(store.insert(makeJob("edit", succeededWith("edit", editReceipt))));

    const [chatJob, editJob] = run(
      buildStore(OutboxStore.fromStringStorage(storage, storageKey)).loadAll,
    );
    if (
      chatJob?.state._tag !== "awaiting-ack" ||
      editJob?.state._tag !== "awaiting-ack" ||
      !(chatJob.state.result instanceof OutboxJobSucceeded) ||
      !(editJob.state.result instanceof OutboxJobSucceeded)
    ) {
      throw new Error("expected two awaiting-ack successes");
    }
    expect(chatJob.state.result.receipt).toBeInstanceOf(ChatMessageReceipt);
    expect(editJob.state.result.receipt).toBeInstanceOf(MessageEditReceipt);
  });

  it("revives a telemetry job with its operation and receipt", () => {
    const storage = stubStorage();
    const telemetryReceipt = new PaymentTelemetryReceipt({
      rumorId,
      clientId,
      sentAt,
      recipientCopy: delivery("ef"),
    });
    const job = new StoredOutboxJob({
      ...makeJob("telemetry", succeededWith("telemetry", telemetryReceipt)),
      operation: {
        _tag: "paymentTelemetry",
        draft: telemetryDraft,
        recipient: pubkey,
      },
    });

    run(
      buildStore(OutboxStore.fromStringStorage(storage, storageKey)).insert(
        job,
      ),
    );

    const [stored] = run(
      buildStore(OutboxStore.fromStringStorage(storage, storageKey)).loadAll,
    );
    if (
      stored?.state._tag !== "awaiting-ack" ||
      !(stored.state.result instanceof OutboxJobSucceeded)
    ) {
      throw new Error("expected an awaiting-ack success");
    }
    expect(stored.operation).toEqual(job.operation);
    expect(stored.state.result.receipt).toBeInstanceOf(PaymentTelemetryReceipt);
  });

  it("decodes receipts persisted under the legacy per-vertical id keys", () => {
    const storage = stubStorage();
    const receipt = new ChatMessageReceipt({
      rumorId,
      clientId,
      sentAt,
      selfCopy: delivery("cd"),
      recipientCopy: delivery("ef"),
    });
    run(
      buildStore(OutboxStore.fromStringStorage(storage, storageKey)).insert(
        makeJob("legacy", succeededWith("legacy", receipt)),
      ),
    );
    const stored = storage.map.get(storageKey);
    if (stored === undefined) throw new Error("nothing stored");
    storage.map.set(storageKey, stored.replace('"rumorId"', '"messageId"'));

    const [job] = run(
      buildStore(OutboxStore.fromStringStorage(storage, storageKey)).loadAll,
    );
    if (
      job?.state._tag !== "awaiting-ack" ||
      !(job.state.result instanceof OutboxJobSucceeded)
    ) {
      throw new Error("expected an awaiting-ack success");
    }
    expect(job.state.result.receipt).toBeInstanceOf(ChatMessageReceipt);
    expect(job.state.result.receipt.rumorId).toBe(rumorId);
  });

  it("treats an unreadable stored value as empty", () => {
    const storage = stubStorage();
    storage.map.set(storageKey, "not json at all");

    const store = buildStore(
      OutboxStore.fromStringStorage(storage, storageKey),
    );
    expect(run(store.loadAll)).toEqual([]);
    run(store.insert(makeJob("job-1")));
    expect(run(store.loadAll)).toHaveLength(1);
  });
});

describe("OutboxStore.inMemory", () => {
  it("keeps insertion order through insert, update, and remove", () => {
    const store = buildStore(OutboxStore.inMemory);
    run(store.insert(makeJob("job-1")));
    run(store.insert(makeJob("job-2")));
    run(store.insert(makeJob("job-3")));
    run(
      store.update(
        makeJob("job-2", {
          _tag: "awaiting-ack",
          result: new OutboxJobFailed({
            jobId: OutboxJobId.make("job-2"),
            ref: OutboxRef.make("ref-job-2"),
            reason: "identity-changed",
            detail: "test",
          }),
        }),
      ),
    );
    run(store.remove(OutboxJobId.make("job-1")));

    const jobs = run(store.loadAll);
    expect(jobs.map((job) => job.jobId)).toEqual(["job-2", "job-3"]);
    expect(jobs[0]?.state._tag).toBe("awaiting-ack");
  });
});
