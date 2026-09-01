import {
  StoredTokenRow,
  TokenRowId,
  TokenStore,
  UnixSeconds,
} from "@linky/linkshu";
import type { TokenStoreService } from "@linky/linkshu";
import { Clock, Effect, Layer, Schema } from "effect";
import { makeJsonFile } from "./jsonFile";

/**
 * The `TokenStore` port over a JSON array of the port's own row schema, so
 * the file is exactly what the package handed over — no adapter mapping to
 * drift, and the wallet stays readable with any text editor.
 */
const TokenFile = Schema.Array(StoredTokenRow);

export const makeFileTokenStore = (filePath: string): TokenStoreService => {
  const file = makeJsonFile(filePath, TokenFile, []);
  return {
    insert: (row) =>
      Effect.flatMap(Clock.currentTimeMillis, (millis) =>
        file.modify((rows) => {
          const stored = new StoredTokenRow({
            id: TokenRowId.make(crypto.randomUUID()),
            originalTokenText: row.originalTokenText,
            tokenText: row.tokenText,
            state: row.state,
            error: row.error,
            createdAt: UnixSeconds.make(Math.floor(millis / 1000)),
          });
          return [[...rows, stored], stored];
        }),
      ),

    update: (id, patch) =>
      file.modify((rows) => [
        rows.map((row) =>
          row.id === id
            ? new StoredTokenRow({
                ...row,
                ...(patch.tokenText !== undefined
                  ? { tokenText: patch.tokenText }
                  : {}),
                ...(patch.state !== undefined ? { state: patch.state } : {}),
                ...(patch.error !== undefined ? { error: patch.error } : {}),
              })
            : row,
        ),
        undefined,
      ]),

    remove: (id) =>
      file.modify((rows) => [rows.filter((row) => row.id !== id), undefined]),

    loadAll: file.read,
  };
};

export const fileTokenStore = (filePath: string): Layer.Layer<TokenStore> =>
  Layer.sync(TokenStore, () => makeFileTokenStore(filePath));
