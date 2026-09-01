import { Context, Effect, Schema } from "effect";
import { TokenRowId, TokenText, UnixSeconds } from "../domain/primitives";
import { TokenState } from "../token/domain";

/**
 * One persisted token row. The store is dumb on purpose: every lifecycle
 * transition, dedup decision, and error classification is package logic —
 * implementations only persist what they are given. Adapter specifics (Evolu
 * owner lanes, deterministic ids derived from `originalTokenText`, sparse
 * payloads) live entirely on the platform side.
 */
export class StoredTokenRow extends Schema.Class<StoredTokenRow>(
  "StoredTokenRow",
)({
  id: TokenRowId,
  /**
   * The token text this row was first created from — the row's stable
   * identity for dedup, even after `tokenText` is rewritten by swaps.
   */
  originalTokenText: TokenText,
  /** Latest spendable encoding; rewritten as lifecycle moves proofs forward. */
  tokenText: TokenText,
  state: TokenState,
  /** Serialized tagged error of the last failure; null outside `error`. */
  error: Schema.NullOr(Schema.String),
  createdAt: UnixSeconds,
}) {}

export class NewTokenRow extends Schema.Class<NewTokenRow>("NewTokenRow")({
  originalTokenText: TokenText,
  tokenText: TokenText,
  state: TokenState,
  error: Schema.NullOr(Schema.String),
}) {}

export interface TokenRowPatch {
  readonly tokenText?: TokenText;
  readonly state?: TokenState;
  readonly error?: string | null;
}

export interface TokenStoreService {
  /** Assigns the row id (platforms may derive it from `originalTokenText`). */
  readonly insert: (row: NewTokenRow) => Effect.Effect<StoredTokenRow>;
  readonly update: (
    id: TokenRowId,
    patch: TokenRowPatch,
  ) => Effect.Effect<void>;
  /** Removal may be a soft delete; removed rows never reappear in `loadAll`. */
  readonly remove: (id: TokenRowId) => Effect.Effect<void>;
  /** All live rows; the package holds no row cache of its own. */
  readonly loadAll: Effect.Effect<ReadonlyArray<StoredTokenRow>>;
}

export class TokenStore extends Context.Tag("linkshu/TokenStore")<
  TokenStore,
  TokenStoreService
>() {}
