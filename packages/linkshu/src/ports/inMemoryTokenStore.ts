import { Clock, Effect, Layer } from "effect";
import { TokenRowId, UnixSeconds } from "../domain/primitives";
import { StoredTokenRow, TokenStore } from "./TokenStore";
import type { TokenStoreService } from "./TokenStore";

/** One non-durable store instance; see `makeInMemoryKeyValueStore`. */
export const makeInMemoryTokenStore = (): TokenStoreService => {
  const rows = new Map<TokenRowId, StoredTokenRow>();
  return {
    insert: (row) =>
      Effect.map(Clock.currentTimeMillis, (millis) => {
        const stored = new StoredTokenRow({
          id: TokenRowId.make(crypto.randomUUID()),
          originalTokenText: row.originalTokenText,
          tokenText: row.tokenText,
          state: row.state,
          error: row.error,
          createdAt: UnixSeconds.make(Math.floor(millis / 1000)),
        });
        rows.set(stored.id, stored);
        return stored;
      }),
    update: (id, patch) =>
      Effect.sync(() => {
        const current = rows.get(id);
        if (current === undefined) return;
        rows.set(
          id,
          new StoredTokenRow({
            ...current,
            ...(patch.tokenText !== undefined
              ? { tokenText: patch.tokenText }
              : {}),
            ...(patch.state !== undefined ? { state: patch.state } : {}),
            ...(patch.error !== undefined ? { error: patch.error } : {}),
          }),
        );
      }),
    remove: (id) =>
      Effect.sync(() => {
        rows.delete(id);
      }),
    loadAll: Effect.sync(() => [...rows.values()]),
  };
};

/** Non-durable, single-process; for tests and quick experiments. */
export const inMemoryTokenStore: Layer.Layer<TokenStore> = Layer.sync(
  TokenStore,
  makeInMemoryTokenStore,
);
