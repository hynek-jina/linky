import * as Evolu from "@evolu/common";
import {
  StoredTokenRow,
  TokenRowId,
  TokenStore,
  TokenText,
  UnixSeconds,
} from "@linky/linkshu";
import type { TokenStoreService } from "@linky/linkshu";
import { Effect, Layer, Schema } from "effect";
import { resolveCashuRowStoredOwnerLane } from "../../app/lib/cashuOwnerLane";
import {
  createCashuTokenId,
  isDeletedCashuRow,
} from "../../app/lib/cashuTokenIdentity";
import {
  CASHU_TOKEN_STATE_ACCEPTED,
  CASHU_TOKEN_STATE_ERROR,
  normalizeCashuTokenState,
} from "../../app/lib/cashuTokenState";
import type { CashuTokenId, CashuTokenRow } from "../../evolu";

/**
 * Linkshu's `TokenStore` port over the Evolu `cashuToken` table.
 *
 * Writes go through the sparse-payload convention (deprecated columns such as
 * `rawToken`/`mint`/`unit`/`amount` are never written), new rows get a
 * deterministic id derived from `originalTokenText`, and removal is a soft
 * delete. Mutations target the owner lane the row is stored in — writing
 * through the active lane when the row lives in an older `cashu-n` lane
 * silently no-ops (see `resolveCashuRowStoredOwnerLane`).
 */

/**
 * Catch-all tagged shape for pre-linkshu plain-text `error` values, applied
 * at the read boundary; rows written by linkshu carry serialized tagged
 * errors and pass through unchanged.
 */
export class LegacyError extends Schema.TaggedError<LegacyError>()(
  "LegacyError",
  { detail: Schema.String },
) {}

const encodeLegacyError = Schema.encodeSync(Schema.parseJson(LegacyError));
const decodeTokenText = Schema.decodeUnknownOption(TokenText);

export type EvoluCashuMutationResult =
  | { readonly ok: true }
  | { readonly error: unknown; readonly ok: false };

export interface EvoluCashuTokenInsertPayload {
  readonly error?: typeof Evolu.NonEmptyString1000.Type;
  readonly id: CashuTokenId;
  readonly originalTokenText: typeof Evolu.NonEmptyString.Type;
  readonly state: typeof Evolu.NonEmptyString100.Type;
  readonly token: typeof Evolu.NonEmptyString.Type;
}

export interface EvoluCashuTokenUpdatePayload {
  readonly error?: typeof Evolu.NonEmptyString1000.Type | null;
  readonly id: CashuTokenId;
  readonly isDeleted?: typeof Evolu.sqliteTrue;
  readonly state?: typeof Evolu.NonEmptyString100.Type;
  readonly token?: typeof Evolu.NonEmptyString.Type;
}

export type EvoluCashuTokenUpsert = (
  table: "cashuToken",
  payload: EvoluCashuTokenInsertPayload,
  options: { readonly ownerId: Evolu.OwnerId },
) => EvoluCashuMutationResult;

export type EvoluCashuTokenUpdate = (
  table: "cashuToken",
  payload: EvoluCashuTokenUpdatePayload,
  options: { readonly ownerId: Evolu.OwnerId },
) => EvoluCashuMutationResult;

export interface EvoluTokenStoreDeps {
  /** All cashuToken rows visible to the wallet, across cashu owner lanes. */
  readonly loadTokenRows: () => Promise<ReadonlyArray<CashuTokenRow>>;
  readonly update: EvoluCashuTokenUpdate;
  readonly upsert: EvoluCashuTokenUpsert;
  /** Active cashu write lane; new rows are inserted there. */
  readonly getWriteOwnerId: () => Evolu.OwnerId;
}

const parseTokenText = (value: string | null): TokenText | null => {
  if (value === null) return null;
  const decoded = decodeTokenText(value.trim());
  return decoded._tag === "Some" ? decoded.value : null;
};

const isSerializedTaggedError = (text: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(text);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof Reflect.get(parsed, "_tag") === "string"
    );
  } catch {
    return false;
  }
};

const toPortableErrorText = (error: string | null): string | null => {
  const text = (error ?? "").trim();
  if (!text) return null;
  if (isSerializedTaggedError(text)) return text;
  return encodeLegacyError(new LegacyError({ detail: text }));
};

// The error column caps at 1000 chars; a truncated serialized error is no
// longer valid JSON and re-reads wrapped as LegacyError.
const toErrorColumn = (
  error: string | null,
): typeof Evolu.NonEmptyString1000.Type | null => {
  const text = (error ?? "").trim().slice(0, 1000);
  if (!text) return null;
  return Evolu.NonEmptyString1000.orThrow(text);
};

const toStoredTokenRow = (row: CashuTokenRow): StoredTokenRow | null => {
  const tokenText = parseTokenText(row.token);
  if (tokenText === null) return null;

  const originalTokenText =
    parseTokenText(row.originalTokenText) ??
    parseTokenText(row.rawToken) ??
    tokenText;

  const state =
    normalizeCashuTokenState(row.state) ?? CASHU_TOKEN_STATE_ACCEPTED;

  return new StoredTokenRow({
    createdAt: UnixSeconds.make(Math.floor(Date.parse(row.createdAt) / 1000)),
    error:
      state === CASHU_TOKEN_STATE_ERROR ? toPortableErrorText(row.error) : null,
    id: TokenRowId.make(String(row.id)),
    originalTokenText,
    state,
    tokenText,
  });
};

export const makeEvoluTokenStore = (
  deps: EvoluTokenStoreDeps,
): TokenStoreService => {
  const loadLiveRows = async (): Promise<CashuTokenRow[]> =>
    (await deps.loadTokenRows()).filter((row) => !isDeletedCashuRow(row));

  const findRow = async (id: TokenRowId): Promise<CashuTokenRow | null> =>
    (await loadLiveRows()).find((row) => String(row.id) === String(id)) ?? null;

  const rowLane = (row: CashuTokenRow): Evolu.OwnerId =>
    resolveCashuRowStoredOwnerLane(row) ?? deps.getWriteOwnerId();

  const runUpdate = (
    payload: EvoluCashuTokenUpdatePayload,
    ownerId: Evolu.OwnerId,
  ): void => {
    const result = deps.update("cashuToken", payload, { ownerId });
    if (!result.ok) {
      throw new Error(`cashuToken update failed: ${String(result.error)}`);
    }
  };

  return {
    insert: (row) =>
      Effect.sync(() => {
        const id = createCashuTokenId(row.originalTokenText);
        const errorColumn = toErrorColumn(row.error);
        const result = deps.upsert(
          "cashuToken",
          {
            id,
            originalTokenText: Evolu.NonEmptyString.orThrow(
              row.originalTokenText,
            ),
            state: Evolu.NonEmptyString100.orThrow(row.state),
            token: Evolu.NonEmptyString.orThrow(row.tokenText),
            ...(errorColumn !== null ? { error: errorColumn } : {}),
          },
          { ownerId: deps.getWriteOwnerId() },
        );
        if (!result.ok) {
          throw new Error(`cashuToken upsert failed: ${String(result.error)}`);
        }
        return new StoredTokenRow({
          createdAt: UnixSeconds.make(Math.floor(Date.now() / 1000)),
          error: row.error,
          id: TokenRowId.make(String(id)),
          originalTokenText: row.originalTokenText,
          state: row.state,
          tokenText: row.tokenText,
        });
      }),

    update: (id, patch) =>
      Effect.promise(async () => {
        const target = await findRow(id);
        if (target === null) return;
        runUpdate(
          {
            id: target.id,
            ...(patch.tokenText !== undefined
              ? { token: Evolu.NonEmptyString.orThrow(patch.tokenText) }
              : {}),
            ...(patch.state !== undefined
              ? { state: Evolu.NonEmptyString100.orThrow(patch.state) }
              : {}),
            ...(patch.error !== undefined
              ? { error: toErrorColumn(patch.error) }
              : {}),
          },
          rowLane(target),
        );
      }),

    remove: (id) =>
      Effect.promise(async () => {
        const target = await findRow(id);
        if (target === null) return;
        runUpdate(
          { id: target.id, isDeleted: Evolu.sqliteTrue },
          rowLane(target),
        );
      }),

    loadAll: Effect.promise(async () => {
      const rows = await loadLiveRows();
      return rows.flatMap((row) => {
        const stored = toStoredTokenRow(row);
        return stored === null ? [] : [stored];
      });
    }),
  };
};

export const evoluTokenStore = (
  deps: EvoluTokenStoreDeps,
): Layer.Layer<TokenStore> =>
  Layer.sync(TokenStore, () => makeEvoluTokenStore(deps));
