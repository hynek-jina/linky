import type {
  MintProofsConfig,
  MintQuoteBolt11Response,
} from "@cashu/cashu-ts";
import { Clock, Duration, Effect, Either, Fiber, Schema } from "effect";
import type { Scope } from "effect";
import {
  MintRejected,
  QuoteAlreadyIssued,
  QuoteExpired,
} from "../domain/errors";
import type { MintUnreachable } from "../domain/errors";
import {
  Bolt11Invoice,
  CurrencyUnit,
  QuoteId,
  UnixSeconds,
} from "../domain/primitives";
import { QuoteStateChanged } from "../inspector/events";
import { Inspector } from "../inspector/Inspector";
import { inspectOperationWith } from "../internal/operations";
import {
  checkMintQuote,
  claimMintQuote,
  QUOTE_ISSUED,
  QUOTE_UNPAID,
} from "../internal/quoteClaim";
import type {
  QuoteClaimContext,
  QuoteClaimError,
} from "../internal/quoteClaim";
import {
  boundKeysetId,
  classifyMintError,
  WalletInstances,
} from "../mint/internal/WalletInstances";
import type { LoadedWallet } from "../mint/internal/WalletInstances";
import { KeyValueStore } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import { TopupQuote, TopupReceipt } from "./domain";
import type {
  PaidQuoteDraft,
  TopupAdoptError,
  TopupDraft,
  TopupError,
  TopupHandle,
  TopupLockingOptions,
} from "./domain";
import {
  deadlineOf,
  PendingTopup,
  readPendingTopup,
  readPendingTopups,
  removePendingTopup,
  writePendingTopup,
} from "./internal/pendingTopup";

const sat = CurrencyUnit.make("sat");

/** Mirrors the web app's claim poll; bolt11 mint quotes settle in seconds. */
const POLL_INTERVAL = Duration.seconds(5);
/** Transient poll failures are expected offline; a run of them is not. */
const MAX_CONSECUTIVE_POLL_FAILURES = 10;

const decodeQuoteId = Schema.decodeUnknownOption(QuoteId);
const decodeInvoice = Schema.decodeUnknownOption(Bolt11Invoice);
const decodeExpiry = Schema.decodeUnknownOption(UnixSeconds);

/** Token text carries proof secrets; the receipt's other fields are safe. */
const redactReceipt = (receipt: TopupReceipt): unknown => ({
  rowId: receipt.rowId,
  mint: receipt.mint,
  amount: receipt.amount,
  quoteId: receipt.quoteId,
});

const quoteOf = (pending: PendingTopup): TopupQuote =>
  new TopupQuote({
    quoteId: pending.quoteId,
    mint: pending.mint,
    amount: pending.amount,
    invoice: pending.invoice,
    expiresAt: pending.expiresAt,
  });

const nowSeconds: Effect.Effect<number> = Effect.map(
  Clock.currentTimeMillis,
  (millis) => Math.floor(millis / 1000),
);

/**
 * A locked quote can only be minted with its key, so a record missing it is
 * rejected before any slot is reserved and stays pending for a resume that
 * brings the key.
 */
const mintConfigFor = (
  pending: PendingTopup,
  options: TopupLockingOptions,
): Effect.Effect<MintProofsConfig | undefined, MintRejected> => {
  if (!pending.locked) return Effect.succeed(undefined);
  if (options.lockingKey === undefined) {
    return Effect.fail(
      new MintRejected({
        mint: pending.mint,
        code: null,
        detail: "quote is locked to a key this wallet was not given",
      }),
    );
  }
  return Effect.succeed({ privkey: options.lockingKey });
};

/**
 * Self-recovering Lightning topup. `start` creates a mint quote, persists it
 * as pending, and polls until it is claimable; minting recovers counter
 * collisions (including reclaiming already-signed outputs via NUT-09) and
 * records the reserved counter slots durably before the outputs are derived,
 * so a crash at any stage resumes without losing funds or re-deriving over a
 * burned slot. The row is written before the pending record is cleared, so
 * the funds are never outside the store. `adopt` feeds the same claim a
 * quote some other party created and paid on the owner's behalf.
 */
export class Topup extends Effect.Service<Topup>()("linkshu/Topup", {
  dependencies: [WalletInstances.Default],
  effect: Effect.gen(function* () {
    const kv = yield* KeyValueStore;
    const tokenStore = yield* TokenStore;
    const instances = yield* WalletInstances;
    const inspector = yield* Inspector.orNoop;

    const emitQuoteState = (pending: PendingTopup, state: string): void => {
      inspector.emit(
        () =>
          new QuoteStateChanged(
            {
              flow: "topup",
              quoteId: pending.quoteId,
              mint: pending.mint,
              state,
            },
            { disableValidation: true },
          ),
      );
    };

    /**
     * Polls until the mint reports the invoice settled. Transient failures
     * keep the poll alive — a topup must survive going offline — while a
     * definitive rejection (an unknown quote) ends it immediately. Expiry
     * needs the mint's own UNPAID answer: declaring it on the deadline alone
     * would drop the record for a quote that was paid while unreachable.
     */
    const pollUntilSettled = (
      wallet: LoadedWallet,
      pending: PendingTopup,
    ): Effect.Effect<void, MintUnreachable | MintRejected | QuoteExpired> =>
      Effect.gen(function* () {
        let lastState: string | null = null;
        let consecutiveFailures = 0;
        for (;;) {
          const outcome = yield* Effect.either(checkMintQuote(wallet, pending));
          if (Either.isLeft(outcome)) {
            const error = outcome.left;
            consecutiveFailures += 1;
            if (
              error._tag === "MintRejected" ||
              consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES
            ) {
              return yield* Effect.fail(error);
            }
          } else {
            consecutiveFailures = 0;
            const state = outcome.right.state;
            if (state !== lastState) {
              lastState = state;
              emitQuoteState(pending, state);
            }
            // PAID and ISSUED both mean the invoice settled; the mint step
            // decides between minting and reclaiming.
            if (state !== QUOTE_UNPAID) return;
            if ((yield* nowSeconds) > deadlineOf(pending)) {
              return yield* new QuoteExpired({
                quoteId: pending.quoteId,
                mint: pending.mint,
              });
            }
          }
          yield* Effect.sleep(POLL_INTERVAL);
        }
      });

    const claimContext = (
      wallet: LoadedWallet,
      mintConfig: MintProofsConfig | undefined,
    ): QuoteClaimContext<PendingTopup> => ({
      kv,
      inspector,
      tokenStore,
      wallet,
      reason: "topup",
      mintConfig,
      withMintCounter: (record, mintCounter) =>
        new PendingTopup({ ...record, mintCounter }),
      persist: (record) => writePendingTopup(kv, record),
      clear: (record) => removePendingTopup(kv, record),
    });

    /** The shared claim, wearing topup's receipt. */
    const mintUnderLock = (
      wallet: LoadedWallet,
      pending: PendingTopup,
      mintConfig: MintProofsConfig | undefined,
    ): Effect.Effect<TopupReceipt, QuoteClaimError> =>
      Effect.map(
        claimMintQuote(claimContext(wallet, mintConfig), pending),
        (claimed) =>
          new TopupReceipt({
            rowId: claimed.rowId,
            tokenText: claimed.tokenText,
            mint: pending.mint,
            amount: claimed.amount,
            quoteId: pending.quoteId,
          }),
      );

    const complete = (
      pending: PendingTopup,
      options: TopupLockingOptions,
    ): Effect.Effect<TopupReceipt, TopupError> =>
      Effect.gen(function* () {
        const mintConfig = yield* mintConfigFor(pending, options);
        const wallet = yield* instances.get(pending.mint, pending.unit);
        yield* pollUntilSettled(wallet, pending);
        return yield* mintUnderLock(wallet, pending, mintConfig);
      }).pipe(
        Effect.tapError((error) =>
          // An expired quote that never reserved slots was never paid.
          error._tag === "QuoteExpired" && pending.mintCounter === null
            ? removePendingTopup(kv, pending)
            : Effect.void,
        ),
        inspectOperationWith(
          inspector,
          "topup.complete",
          {
            mint: pending.mint,
            quoteId: pending.quoteId,
            amount: pending.amount,
          },
          redactReceipt,
        ),
      );

    /**
     * Polling runs in the scope, not in `result`: the topup completes itself
     * even when nobody awaits the handle, and closing the scope stops it
     * while the persisted record keeps the quote claimable.
     */
    const handleFor = (
      pending: PendingTopup,
      options: TopupLockingOptions,
    ): Effect.Effect<TopupHandle, never, Scope.Scope> =>
      Effect.map(Effect.forkScoped(complete(pending, options)), (fiber) => ({
        quote: quoteOf(pending),
        result: Fiber.join(fiber),
      }));

    const toPendingTopup = (
      draft: TopupDraft,
      keysetId: PendingTopup["keysetId"],
      quote: MintQuoteBolt11Response,
      createdAt: number,
    ): Effect.Effect<PendingTopup, MintRejected> => {
      const quoteId = decodeQuoteId(quote.quote);
      const invoice = decodeInvoice(quote.request);
      if (quoteId._tag === "None" || invoice._tag === "None") {
        return Effect.fail(
          new MintRejected({
            mint: draft.mint,
            code: null,
            detail: "mint returned a mint quote without a usable invoice",
          }),
        );
      }
      const expiry = decodeExpiry(quote.expiry);
      return Effect.succeed(
        new PendingTopup({
          quoteId: quoteId.value,
          mint: draft.mint,
          unit: sat,
          keysetId,
          amount: draft.amount,
          invoice: invoice.value,
          expiresAt: expiry._tag === "Some" ? expiry.value : null,
          createdAt: UnixSeconds.make(createdAt),
          mintCounter: null,
          locked: false,
        }),
      );
    };

    /**
     * The record is persisted before the handle exists, so the invoice the
     * caller can act on is always one the package can finish or resume.
     */
    const start = (
      draft: TopupDraft,
    ): Effect.Effect<
      TopupHandle,
      MintUnreachable | MintRejected,
      Scope.Scope
    > =>
      Effect.gen(function* () {
        const wallet = yield* instances.get(draft.mint, sat);
        const keysetId = yield* boundKeysetId(draft.mint, wallet);
        const quote = yield* Effect.tryPromise({
          try: () => wallet.createMintQuoteBolt11(draft.amount),
          catch: (error) => classifyMintError(draft.mint, error),
        });
        const pending = yield* toPendingTopup(
          draft,
          keysetId,
          quote,
          yield* nowSeconds,
        );
        yield* writePendingTopup(kv, pending);
        emitQuoteState(pending, quote.state);
        return yield* handleFor(pending, {});
      }).pipe(
        inspectOperationWith(
          inspector,
          "topup.start",
          { mint: draft.mint, amount: draft.amount },
          (handle) => ({
            quoteId: handle.quote.quoteId,
            mint: handle.quote.mint,
            amount: handle.quote.amount,
            expiresAt: handle.quote.expiresAt,
          }),
        ),
      );

    const toAdoptedPending = (
      draft: PaidQuoteDraft,
      wallet: LoadedWallet,
    ): Effect.Effect<PendingTopup, MintRejected> =>
      Effect.gen(function* () {
        const keysetId = yield* boundKeysetId(draft.mint, wallet);
        return new PendingTopup({
          quoteId: draft.quoteId,
          mint: draft.mint,
          unit: sat,
          keysetId,
          amount: draft.amount,
          invoice: draft.invoice,
          expiresAt: draft.expiresAt,
          createdAt: UnixSeconds.make(yield* nowSeconds),
          mintCounter: null,
          locked: draft.locked,
        });
      });

    /**
     * Mints a quote someone else created and paid for this wallet. The
     * caller vouches that the invoice settled, so there is no poll: the mint
     * is asked once, and a quote it already issued belongs to whichever
     * wallet minted it — unless a record of ours proves the attempt was
     * ours, in which case the claim's reclaim path takes over as usual.
     */
    const adopt = (
      draft: PaidQuoteDraft,
      options: TopupLockingOptions = {},
    ): Effect.Effect<TopupReceipt, TopupAdoptError> =>
      Effect.gen(function* () {
        const wallet = yield* instances.get(draft.mint, sat);
        const existing = yield* readPendingTopup(kv, draft.mint, draft.quoteId);
        const pending = existing ?? (yield* toAdoptedPending(draft, wallet));
        const mintConfig = yield* mintConfigFor(pending, options);
        if (existing === null) {
          const quote = yield* checkMintQuote(wallet, pending);
          emitQuoteState(pending, quote.state);
          if (quote.state === QUOTE_ISSUED) {
            return yield* new QuoteAlreadyIssued({
              quoteId: pending.quoteId,
              mint: pending.mint,
            });
          }
          if (quote.state === QUOTE_UNPAID) {
            return yield* new MintRejected({
              mint: pending.mint,
              code: null,
              detail: "mint reports the adopted quote as unpaid",
            });
          }
          yield* writePendingTopup(kv, pending);
        }
        return yield* mintUnderLock(wallet, pending, mintConfig);
      }).pipe(
        inspectOperationWith(
          inspector,
          "topup.adopt",
          {
            mint: draft.mint,
            quoteId: draft.quoteId,
            amount: draft.amount,
            locked: draft.locked,
          },
          redactReceipt,
        ),
      );

    /**
     * Every record gets a handle — even one past its deadline. Only the
     * mint's own answer may retire a record (confirmed UNPAID → expired,
     * PAID/ISSUED → minted or reclaimed); a local clock check could prune a
     * quote that was paid right before the crash.
     */
    const resumePending = (
      options: TopupLockingOptions = {},
    ): Effect.Effect<ReadonlyArray<TopupHandle>, never, Scope.Scope> =>
      Effect.gen(function* () {
        const handles: TopupHandle[] = [];
        for (const pending of yield* readPendingTopups(kv)) {
          handles.push(yield* handleFor(pending, options));
        }
        return handles;
      }).pipe(
        inspectOperationWith(
          inspector,
          "topup.resumePending",
          {},
          (handles) => ({
            resumed: handles.map((handle) => handle.quote.quoteId),
          }),
        ),
      );

    return { start, adopt, resumePending } as const;
  }),
}) {}
