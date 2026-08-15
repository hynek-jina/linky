import { Context, Effect, Layer } from "effect";
import { UnixSeconds } from "../domain/primitives";

export interface InboxCursorStoreService {
  readonly load: Effect.Effect<UnixSeconds | null>;
  readonly save: (cursor: UnixSeconds) => Effect.Effect<void>;
}

/**
 * Minimal synchronous string key-value storage. The web `localStorage`
 * satisfies it as-is; other platforms adapt their own storage.
 */
export interface CursorStringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const makeInMemory = (): InboxCursorStoreService => {
  let cursor: UnixSeconds | null = null;
  return {
    load: Effect.sync(() => cursor),
    save: (next) =>
      Effect.sync(() => {
        cursor = next;
      }),
  };
};

const makeStringStorage = (
  storage: CursorStringStorage,
  key: string,
): InboxCursorStoreService => ({
  load: Effect.sync(() => {
    const value = Number(storage.getItem(key));
    return Number.isInteger(value) && value > 0
      ? UnixSeconds.make(value)
      : null;
  }),
  save: (cursor) => Effect.sync(() => storage.setItem(key, String(cursor))),
});

/** Storage port of the wrap inbox: the one persisted backfill cursor. */
export class InboxCursorStore extends Context.Tag("linkstr/InboxCursorStore")<
  InboxCursorStore,
  InboxCursorStoreService
>() {
  /** Non-durable; for tests and as the platform-agnostic default. */
  static readonly inMemory: Layer.Layer<InboxCursorStore> = Layer.sync(
    InboxCursorStore,
    makeInMemory,
  );

  /**
   * One storage key holding the cursor as a plain integer string; anything
   * unreadable loads as no cursor. Platform code supplies the storage
   * (web: `localStorage`).
   */
  static fromStringStorage(
    storage: CursorStringStorage,
    key: string,
  ): Layer.Layer<InboxCursorStore> {
    return Layer.sync(InboxCursorStore, () => makeStringStorage(storage, key));
  }
}
