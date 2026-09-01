import { Effect } from "effect";
import type { TokenText } from "../../domain/primitives";
import { TokenLifecycleChanged } from "../../inspector/events";
import type { InspectorService } from "../../inspector/Inspector";
import { NewTokenRow } from "../../ports/TokenStore";
import type { StoredTokenRow, TokenStoreService } from "../../ports/TokenStore";
import { InvalidTokenTransition } from "../domain";
import type { TokenState } from "../domain";

/**
 * The package-owned lifecycle state machine (see `token/domain.ts` for state
 * semantics). Operation verticals move rows exclusively through these
 * helpers; the token store persists rows without interpreting them.
 */
const LEGAL_TRANSITIONS: Record<TokenState, ReadonlyArray<TokenState>> = {
  pending: ["accepted", "error"],
  accepted: ["reserved", "issued", "externalized", "error"],
  // `error` included: a reserved row whose proofs the mint reports spent is
  // dead, and the earmark cannot keep it alive.
  reserved: ["accepted", "issued", "externalized", "error"],
  issued: ["accepted", "externalized", "error"],
  externalized: ["accepted"],
  error: ["accepted"],
};

export const isLegalTransition = (from: TokenState, to: TokenState): boolean =>
  LEGAL_TRANSITIONS[from].includes(to);

export interface InsertRowArgs {
  readonly originalTokenText: TokenText;
  readonly tokenText: TokenText;
  readonly state: TokenState;
  readonly reason: string;
}

export const insertRowInState = (
  store: TokenStoreService,
  inspector: InspectorService,
  args: InsertRowArgs,
): Effect.Effect<StoredTokenRow> =>
  store
    .insert(
      new NewTokenRow({
        originalTokenText: args.originalTokenText,
        tokenText: args.tokenText,
        state: args.state,
        error: null,
      }),
    )
    .pipe(
      Effect.tap((row) =>
        Effect.sync(() =>
          inspector.emit(
            () =>
              new TokenLifecycleChanged(
                {
                  rowId: row.id,
                  from: null,
                  to: args.state,
                  reason: args.reason,
                },
                { disableValidation: true },
              ),
          ),
        ),
      ),
    );

export interface TransitionUpdate {
  readonly tokenText?: TokenText;
  /** Serialized tagged error; only meaningful when transitioning to `error`. */
  readonly error?: string;
}

/** Persists a legal state transition; `error` is cleared outside `error`. */
export const transitionRow = (
  store: TokenStoreService,
  inspector: InspectorService,
  row: StoredTokenRow,
  to: TokenState,
  reason: string,
  update?: TransitionUpdate,
): Effect.Effect<void, InvalidTokenTransition> => {
  if (!isLegalTransition(row.state, to)) {
    return Effect.fail(
      new InvalidTokenTransition({ rowId: row.id, from: row.state, to }),
    );
  }
  return store
    .update(row.id, {
      state: to,
      error: to === "error" ? (update?.error ?? null) : null,
      ...(update?.tokenText !== undefined
        ? { tokenText: update.tokenText }
        : {}),
    })
    .pipe(
      Effect.tap(() =>
        Effect.sync(() =>
          inspector.emit(
            () =>
              new TokenLifecycleChanged(
                { rowId: row.id, from: row.state, to, reason },
                { disableValidation: true },
              ),
          ),
        ),
      ),
    );
};

/**
 * Rewrites the proofs a row holds without changing its state — validation
 * pruning spent proofs and merging siblings locally. The state machine is
 * untouched, so the event reports the state on both sides.
 */
export const rewriteRowTokenText = (
  store: TokenStoreService,
  inspector: InspectorService,
  row: StoredTokenRow,
  tokenText: TokenText,
  reason: string,
): Effect.Effect<void> =>
  store
    .update(row.id, { tokenText })
    .pipe(
      Effect.tap(() =>
        Effect.sync(() =>
          inspector.emit(
            () =>
              new TokenLifecycleChanged(
                { rowId: row.id, from: row.state, to: row.state, reason },
                { disableValidation: true },
              ),
          ),
        ),
      ),
    );

/**
 * Dedup lookup: a token is known when its text matches a row's original
 * encoding (stable row identity) or its current one (a re-signed encoding
 * the wallet already owns).
 */
export const findRowByTokenText = (
  rows: ReadonlyArray<StoredTokenRow>,
  tokenText: TokenText,
): StoredTokenRow | null =>
  rows.find(
    (row) => row.originalTokenText === tokenText || row.tokenText === tokenText,
  ) ?? null;
