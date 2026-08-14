import { Context, Effect, Either, Layer, Schema } from "effect";
import { StoredOutboxJob } from "./domain";
import type { OutboxJobId } from "./domain";

export const OUTBOX_STORE_DEFAULT_KEY = "linkstr.outbox";

export interface OutboxStoreService {
  readonly insert: (job: StoredOutboxJob) => Effect.Effect<void>;
  readonly update: (job: StoredOutboxJob) => Effect.Effect<void>;
  readonly remove: (jobId: OutboxJobId) => Effect.Effect<void>;
  /** Jobs in insertion order. */
  readonly loadAll: Effect.Effect<ReadonlyArray<StoredOutboxJob>>;
}

interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isStringStorage = (value: unknown): value is StringStorage =>
  typeof value === "object" &&
  value !== null &&
  "getItem" in value &&
  typeof value.getItem === "function" &&
  "setItem" in value &&
  typeof value.setItem === "function";

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

const makeLocalStorage = (
  storage: StringStorage,
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
  static readonly inMemory: Layer.Layer<OutboxStore> = Layer.sync(
    OutboxStore,
    makeInMemory,
  );

  /**
   * One localStorage key holding the JSON-encoded job array. Falls back to
   * in-memory (non-durable) when the environment has no localStorage; an
   * unreadable stored value decodes as an empty list.
   */
  static localStorage(options?: {
    readonly key?: string;
  }): Layer.Layer<OutboxStore> {
    return Layer.sync(OutboxStore, () => {
      const candidate =
        "localStorage" in globalThis ? globalThis.localStorage : null;
      return isStringStorage(candidate)
        ? makeLocalStorage(candidate, options?.key ?? OUTBOX_STORE_DEFAULT_KEY)
        : makeInMemory();
    });
  }
}
