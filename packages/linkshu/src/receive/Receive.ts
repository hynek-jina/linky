import type { Proof as CashuProof } from "@cashu/cashu-ts";
import { Effect, Either, Schema } from "effect";
import {
  MintRejected,
  TokenAlreadyKnown,
  TokenAlreadySpent,
  TokenParseFailed,
} from "../domain/errors";
import type { CounterLockTimeout, MintUnreachable } from "../domain/errors";
import { CurrencyUnit } from "../domain/primitives";
import type { MintUrl, TokenText } from "../domain/primitives";
import { Inspector } from "../inspector/Inspector";
import { recoverFromCollision } from "../internal/collisionRecovery";
import {
  advanceCounterTo,
  readCounter,
  withCounterLock,
} from "../internal/counters";
import type { CounterScope } from "../internal/counters";
import { inspectOperationWith } from "../internal/operations";
import {
  isRecoverableOutputCollision,
  isTokenAlreadySpentError,
} from "../internal/outputCollisions";
import {
  boundKeysetId,
  classifyMintError,
  WalletInstances,
} from "../mint/internal/WalletInstances";
import type { LoadedWallet } from "../mint/internal/WalletInstances";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { StoredTokenRow } from "../ports/TokenStore";
import { extractTokenText, parseTokenText } from "../token/codec";
import { encodeCashuProofs } from "../token/internal/cashuProofs";
import {
  findRowByTokenText,
  insertRowInState,
  transitionRow,
} from "../token/internal/lifecycle";
import { ReceiveDraft, ReceiveError, ReceiveReceipt } from "./domain";

const sat = CurrencyUnit.make("sat");

const MAX_SWAP_ATTEMPTS = 5;
/** Fallback bump (one output block) when restore cannot locate the collision. */
const COLLISION_FALLBACK_BUMP = 64;

type AcceptFailure =
  | MintUnreachable
  | MintRejected
  | TokenAlreadySpent
  | CounterLockTimeout;

const isTransient = (error: AcceptFailure): boolean =>
  error._tag === "MintUnreachable" || error._tag === "CounterLockTimeout";

/** Serialized onto `error` rows; every member is a tagged Schema error. */
const encodeStoredError = Schema.encodeSync(Schema.parseJson(ReceiveError));

interface ParsedDraft {
  readonly tokenText: TokenText;
  readonly mint: MintUrl;
  readonly unit: CurrencyUnit;
  readonly memo: string | null;
}

const parseDraft = (
  draft: ReceiveDraft,
): Effect.Effect<ParsedDraft, TokenParseFailed> =>
  Effect.suspend(() => {
    if (draft.text.trim() === "") {
      return new TokenParseFailed({ reason: "empty", detail: null });
    }
    const tokenText = extractTokenText(draft.text);
    if (tokenText === null) {
      return new TokenParseFailed({ reason: "no-token-found", detail: null });
    }
    const parsed = parseTokenText(tokenText);
    if (parsed === null) {
      return new TokenParseFailed({ reason: "undecodable", detail: null });
    }
    if (parsed.mint === null) {
      return new TokenParseFailed({
        reason: "undecodable",
        detail: "token does not state its mint",
      });
    }
    return Effect.succeed({
      tokenText,
      mint: parsed.mint,
      unit: parsed.unit ?? sat,
      memo: parsed.memo,
    });
  });

/** Token text (draft and receipt encodings) carries proof secrets. */
const redactReceipt = (receipt: ReceiveReceipt): unknown => ({
  rowId: receipt.rowId,
  mint: receipt.mint,
  unit: receipt.unit,
  amount: receipt.amount,
});

/**
 * Receiving a token is one call: extract and decode the text, dedup against
 * stored rows by token text, re-sign the proofs at the mint with
 * deterministic outputs (recovering counter collisions via targeted NUT-09
 * lookups), and persist the row through its lifecycle (fresh → `accepted`,
 * or `error` carrying the serialized failure on definitive rejection —
 * transient failures leave no `error` row behind).
 */
export class Receive extends Effect.Service<Receive>()("linkshu/Receive", {
  dependencies: [WalletInstances.Default],
  effect: Effect.gen(function* () {
    const kv = yield* KeyValueStore;
    const tokenStore = yield* TokenStore;
    const instances = yield* WalletInstances;
    const inspector = yield* Inspector.orNoop;

    const swapAtMint = (
      wallet: LoadedWallet,
      scope: CounterScope,
      tokenText: TokenText,
    ): Effect.Effect<ReadonlyArray<CashuProof>, AcceptFailure> =>
      withCounterLock(
        kv,
        scope,
      )(
        Effect.gen(function* () {
          let counter = yield* readCounter(kv, scope);
          let lastCollision: unknown = null;
          for (let attempt = 0; attempt < MAX_SWAP_ATTEMPTS; attempt += 1) {
            const outcome = yield* Effect.either(
              Effect.tryPromise({
                try: () =>
                  wallet.receive(tokenText, undefined, {
                    type: "deterministic",
                    counter,
                  }),
                catch: (error): unknown => error,
              }),
            );
            if (Either.isRight(outcome)) {
              const proofs = outcome.right;
              yield* advanceCounterTo(
                kv,
                inspector,
                scope,
                counter + proofs.length,
                "used",
              );
              return proofs;
            }
            const raw = outcome.left;
            if (isTokenAlreadySpentError(raw)) {
              return yield* new TokenAlreadySpent({ mint: scope.mint });
            }
            if (!isRecoverableOutputCollision(raw)) {
              return yield* Effect.fail(classifyMintError(scope.mint, raw));
            }
            lastCollision = raw;
            counter = yield* recoverFromCollision(
              {
                kv,
                inspector,
                wallet,
                scope,
                fallbackBump: COLLISION_FALLBACK_BUMP,
              },
              counter,
              raw,
            );
          }
          return yield* Effect.fail(
            classifyMintError(scope.mint, lastCollision),
          );
        }),
      );

    const acceptRow = (
      row: StoredTokenRow,
      parsed: ParsedDraft,
    ): Effect.Effect<ReceiveReceipt, AcceptFailure> =>
      Effect.gen(function* () {
        const wallet = yield* instances.get(parsed.mint, parsed.unit);
        const keysetId = yield* boundKeysetId(parsed.mint, wallet);
        const scope: CounterScope = {
          mint: parsed.mint,
          unit: parsed.unit,
          keysetId,
        };
        const proofs = yield* swapAtMint(wallet, scope, parsed.tokenText);
        const encoded = encodeCashuProofs({
          mint: parsed.mint,
          unit: parsed.unit,
          memo: parsed.memo,
          proofs,
        });
        if (encoded === null) {
          return yield* new MintRejected({
            mint: parsed.mint,
            code: null,
            detail: "mint returned malformed proofs from the swap",
          });
        }
        // `pending` → `accepted` is always legal; failing here is a package bug.
        yield* Effect.orDie(
          transitionRow(tokenStore, inspector, row, "accepted", "receive", {
            tokenText: encoded.tokenText,
          }),
        );
        return new ReceiveReceipt({
          rowId: row.id,
          tokenText: encoded.tokenText,
          mint: parsed.mint,
          unit: parsed.unit,
          amount: encoded.amount,
        });
      });

    const settleFailedRow = (
      row: StoredTokenRow,
      error: AcceptFailure,
    ): Effect.Effect<never, AcceptFailure> =>
      (isTransient(error)
        ? tokenStore.remove(row.id)
        : Effect.orDie(
            transitionRow(tokenStore, inspector, row, "error", "receive", {
              error: encodeStoredError(error),
            }),
          )
      ).pipe(Effect.zipRight(Effect.fail(error)));

    const receive = (
      draft: ReceiveDraft,
    ): Effect.Effect<ReceiveReceipt, ReceiveError> =>
      Effect.gen(function* () {
        const parsed = yield* parseDraft(draft);
        const known = findRowByTokenText(
          yield* tokenStore.loadAll,
          parsed.tokenText,
        );
        if (known !== null) {
          return yield* new TokenAlreadyKnown({ rowId: known.id });
        }
        const row = yield* insertRowInState(tokenStore, inspector, {
          originalTokenText: parsed.tokenText,
          tokenText: parsed.tokenText,
          state: "pending",
          reason: "receive",
        });
        return yield* acceptRow(row, parsed).pipe(
          Effect.catchAll((error) => settleFailedRow(row, error)),
        );
      }).pipe(
        // Params stay empty: the only input is token text (proof secrets).
        inspectOperationWith(inspector, "receive.receive", {}, redactReceipt),
      );

    return { receive } as const;
  }),
}) {}
