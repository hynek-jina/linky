import { Context, Effect, Either, Layer, Schema } from "effect";
import { StoredOutboxJob } from "./domain";
import type { OutboxJobId } from "./domain";

export interface OutboxStoreService {
  readonly insert: (job: StoredOutboxJob) => Effect.Effect<void>;
  readonly update: (job: StoredOutboxJob) => Effect.Effect<void>;
  readonly remove: (jobId: OutboxJobId) => Effect.Effect<void>;
  /** Jobs in insertion order. */
  readonly loadAll: Effect.Effect<ReadonlyArray<StoredOutboxJob>>;
}

/**
 * Minimal synchronous string key-value storage. The web `localStorage`
 * satisfies it as-is; other platforms adapt their own storage.
 */
export interface OutboxStringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const StoredJobsJson = Schema.parseJson(Schema.Array(StoredOutboxJob));
const decodeJobs = Schema.decodeUnknownEither(StoredJobsJson);
const encodeJobs = Schema.encodeSync(StoredJobsJson);

const makeInMemory = (): OutboxStoreService => {
  const jobs = new Map<string, StoredOutboxJob>();
  const put = (job: StoredOutboxJob): Effect.Effect<void> =>
    Effect.sync(() => {
      jobs.set(job.jobId, job);
    });
  return {
    insert: put,
    update: put,
    remove: (jobId) =>
      Effect.sync(() => {
        jobs.delete(jobId);
      }),
    loadAll: Effect.sync(() => [...jobs.values()]),
  };
};

const makeStringStorage = (
  storage: OutboxStringStorage,
  key: string,
): OutboxStoreService => {
  const load = (): ReadonlyArray<StoredOutboxJob> => {
    const raw = storage.getItem(key);
    if (raw === null) return [];
    return Either.getOrElse(decodeJobs(raw), () => []);
  };
  const save = (jobs: ReadonlyArray<StoredOutboxJob>): void => {
    storage.setItem(key, encodeJobs(jobs));
  };
  return {
    insert: (job) => Effect.sync(() => save([...load(), job])),
    update: (job) =>
      Effect.sync(() =>
        save(
          load().map((stored) => (stored.jobId === job.jobId ? job : stored)),
        ),
      ),
    remove: (jobId) =>
      Effect.sync(() =>
        save(load().filter((stored) => stored.jobId !== jobId)),
      ),
    loadAll: Effect.sync(load),
  };
};

/** Storage port of the outbox: one durable, insertion-ordered job list. */
export class OutboxStore extends Context.Tag("linkstr/OutboxStore")<
  OutboxStore,
  OutboxStoreService
>() {
  /** Non-durable; for tests and as the platform-agnostic default. */
  static readonly inMemory: Layer.Layer<OutboxStore> = Layer.sync(
    OutboxStore,
    makeInMemory,
  );

  /**
   * One storage key holding the JSON-encoded job array; an unreadable stored
   * value decodes as an empty list. Platform code supplies the storage
   * (web: `localStorage`).
   */
  static fromStringStorage(
    storage: OutboxStringStorage,
    key: string,
  ): Layer.Layer<OutboxStore> {
    return Layer.sync(OutboxStore, () => makeStringStorage(storage, key));
  }
}
