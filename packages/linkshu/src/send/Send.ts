import type { SendResponse } from "@cashu/cashu-ts";
import { Effect, Either, Schema } from "effect";
import {
  InsufficientFunds,
  MintRejected,
  TokenAlreadySpent,
} from "../domain/errors";
import type { MintUnreachable } from "../domain/errors";
import { CurrencyUnit, NonNegativeAmount } from "../domain/primitives";
import type { Amount, MintUrl } from "../domain/primitives";
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
  isInsufficientBalanceError,
  isRecoverableOutputCollision,
} from "../internal/outputCollisions";
import { checkProofStates, spentSecrets } from "../internal/proofStates";
import {
  boundKeysetId,
  classifyMintError,
  WalletInstances,
} from "../mint/internal/WalletInstances";
import type { LoadedWallet } from "../mint/internal/WalletInstances";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { StoredTokenRow } from "../ports/TokenStore";
import { encodeCashuProofs } from "../token/internal/cashuProofs";
import { insertRowInState, transitionRow } from "../token/internal/lifecycle";
import type { Proof } from "../token/domain";
import { SendReceipt } from "./domain";
import type { SendDraft, SendError } from "./domain";
import {
  collectSendSources,
  dedupeSourceProofs,
  partitionBySpentSecrets,
} from "./internal/sources";

const sat = CurrencyUnit.make("sat");

const MAX_SWAP_ATTEMPTS = 5;
/**
 * Deterministic counter block reserved for the swap's send outputs; keep
 * outputs start right after it. Advancing past `block + freshKeepCount`
 * therefore clears every counter either side could have used.
 */
const SEND_OUTPUT_BLOCK = 64;
/** A failed attempt may have burned both blocks. */
const COLLISION_FALLBACK_BUMP = SEND_OUTPUT_BLOCK * 2;

/** Serialized onto rows NUT-07 reports fully spent. */
const encodeSpentRowError = Schema.encodeSync(
  Schema.parseJson(TokenAlreadySpent),
);

/** Token text carries proof secrets; the receipt's other fields are safe. */
const redactReceipt = (receipt: SendReceipt): unknown => ({
  rowId: receipt.rowId,
  mint: receipt.mint,
  unit: receipt.unit,
  amount: receipt.amount,
  changeAmount: receipt.changeAmount,
  feePaid: receipt.feePaid,
});

const malformedSwapProofs = (mint: MintUrl): MintRejected =>
  new MintRejected({
    mint,
    code: null,
    detail: "mint returned malformed proofs from the swap",
  });

/**
 * Sending is one call: select the mint's `accepted` rows, drop proofs NUT-07
 * reports spent, swap the amount out with disjoint send/keep deterministic
 * counter blocks, persist the change as a fresh `accepted` row, and persist
 * the send token as a row in the drafted state. The source rows are removed;
 * funds are never outside the store even when the caller crashes mid-flow.
 */
export class Send extends Effect.Service<Send>()("linkshu/Send", {
  dependencies: [WalletInstances.Default],
  effect: Effect.gen(function* () {
    const kv = yield* KeyValueStore;
    const tokenStore = yield* TokenStore;
    const instances = yield* WalletInstances;
    const inspector = yield* Inspector.orNoop;

    const spentProofSecrets = (
      wallet: LoadedWallet,
      mint: MintUrl,
      proofs: ReadonlyArray<Proof>,
    ): Effect.Effect<ReadonlySet<string>, MintUnreachable | MintRejected> =>
      checkProofStates(wallet, mint, proofs).pipe(
        Effect.map((states) => spentSecrets(proofs, states)),
      );

    const markSpentRows = (
      rows: ReadonlyArray<StoredTokenRow>,
      mint: MintUrl,
    ): Effect.Effect<void> =>
      Effect.forEach(
        rows,
        (row) =>
          // `accepted` → `error` is always legal; failing here is a package bug.
          Effect.orDie(
            transitionRow(tokenStore, inspector, row, "error", "send", {
              error: encodeSpentRowError(new TokenAlreadySpent({ mint })),
            }),
          ),
        { discard: true },
      );

    const swapAtMint = (
      wallet: LoadedWallet,
      scope: CounterScope,
      amount: Amount,
      proofs: ReadonlyArray<Proof>,
      available: number,
    ): Effect.Effect<SendResponse, SendError> =>
      withCounterLock(
        kv,
        scope,
      )(
        Effect.gen(function* () {
          const offeredSecrets = new Set(proofs.map((proof) => proof.secret));
          let counter = yield* readCounter(kv, scope);
          let lastCollision: unknown = null;
          for (let attempt = 0; attempt < MAX_SWAP_ATTEMPTS; attempt += 1) {
            const outcome = yield* Effect.either(
              Effect.tryPromise({
                try: () =>
                  wallet.send(amount, [...proofs], undefined, {
                    send: { type: "deterministic", counter },
                    keep: {
                      type: "deterministic",
                      counter: counter + SEND_OUTPUT_BLOCK,
                    },
                  }),
                catch: (error): unknown => error,
              }),
            );
            if (Either.isRight(outcome)) {
              const swapped = outcome.right;
              // Keep mixes fresh change with passthrough inputs; only the
              // fresh ones consumed keep-block counters.
              const freshKeepCount = swapped.keep.filter(
                (proof) => !offeredSecrets.has(proof.secret),
              ).length;
              yield* advanceCounterTo(
                kv,
                inspector,
                scope,
                counter + SEND_OUTPUT_BLOCK + freshKeepCount,
                "used",
              );
              return swapped;
            }
            const raw = outcome.left;
            if (isInsufficientBalanceError(raw)) {
              return yield* new InsufficientFunds({
                mint: scope.mint,
                required: amount,
                available: NonNegativeAmount.make(available),
              });
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

    const send = (draft: SendDraft): Effect.Effect<SendReceipt, SendError> =>
      Effect.gen(function* () {
        const wallet = yield* instances.get(draft.mint, sat);
        const keysetId = yield* boundKeysetId(draft.mint, wallet);
        const scope: CounterScope = { mint: draft.mint, unit: sat, keysetId };

        const sources = collectSendSources(
          yield* tokenStore.loadAll,
          draft.mint,
          sat,
          wallet.keyChain.getKeysets().map((keyset) => keyset.id),
        );
        const spentSecrets = yield* spentProofSecrets(
          wallet,
          draft.mint,
          dedupeSourceProofs(sources),
        );
        const { fullySpentRows, liveRows, spendable, available } =
          partitionBySpentSecrets(sources, spentSecrets);
        // Definitive NUT-07 knowledge sticks even when the send itself fails.
        yield* markSpentRows(fullySpentRows, draft.mint);

        if (available < draft.amount) {
          return yield* new InsufficientFunds({
            mint: draft.mint,
            required: draft.amount,
            available: NonNegativeAmount.make(available),
          });
        }

        const swapped = yield* swapAtMint(
          wallet,
          scope,
          draft.amount,
          spendable,
          available,
        );
        const sendEncoded = encodeCashuProofs({
          mint: draft.mint,
          unit: sat,
          memo: draft.memo ?? null,
          proofs: swapped.send,
        });
        const keepEncoded =
          swapped.keep.length > 0
            ? encodeCashuProofs({
                mint: draft.mint,
                unit: sat,
                memo: null,
                proofs: swapped.keep,
              })
            : null;
        if (
          sendEncoded === null ||
          (swapped.keep.length > 0 && keepEncoded === null)
        ) {
          return yield* malformedSwapProofs(draft.mint);
        }
        const changeAmount = keepEncoded?.amount ?? 0;
        const feePaid = available - sendEncoded.amount - changeAmount;
        if (feePaid < 0) {
          return yield* malformedSwapProofs(draft.mint);
        }

        // Change lands as `accepted` before the sources go away, so the funds
        // are never outside the store even if the caller crashes mid-flow.
        if (keepEncoded !== null) {
          yield* insertRowInState(tokenStore, inspector, {
            originalTokenText: keepEncoded.tokenText,
            tokenText: keepEncoded.tokenText,
            state: "accepted",
            reason: "send-change",
          });
        }
        const sendRow = yield* insertRowInState(tokenStore, inspector, {
          originalTokenText: sendEncoded.tokenText,
          tokenText: sendEncoded.tokenText,
          state: draft.produceAs,
          reason: "send",
        });
        yield* Effect.forEach(liveRows, (row) => tokenStore.remove(row.id), {
          discard: true,
        });

        return new SendReceipt({
          rowId: sendRow.id,
          tokenText: sendEncoded.tokenText,
          mint: draft.mint,
          unit: sat,
          amount: sendEncoded.amount,
          changeAmount: NonNegativeAmount.make(changeAmount),
          feePaid: NonNegativeAmount.make(feePaid),
        });
      }).pipe(
        inspectOperationWith(
          inspector,
          "send.send",
          {
            mint: draft.mint,
            amount: draft.amount,
            produceAs: draft.produceAs,
          },
          redactReceipt,
        ),
      );

    return { send } as const;
  }),
}) {}
