import type { MintQuoteBolt11Response, Proof } from "@cashu/cashu-ts";
import { Amount as CashuAmount, MintOperationError } from "@cashu/cashu-ts";
import {
  Effect,
  Exit,
  Fiber,
  Layer,
  Stream,
  TestClock,
  TestContext,
} from "effect";
import type { Scope } from "effect";
import {
  Amount,
  Bolt11Invoice,
  CurrencyUnit,
  KeysetId,
  MintUrl,
  QuoteId,
  UnixSeconds,
} from "../domain/primitives";
import type { LinkshuInspectorEvent } from "../inspector/events";
import { Inspector } from "../inspector/Inspector";
import { deterministicCounterKey } from "../internal/counters";
import { WalletInstances } from "../mint/internal/WalletInstances";
import type { LoadedWallet } from "../mint/internal/WalletInstances";
import { makeInMemoryKeyValueStore } from "../ports/inMemoryKeyValueStore";
import { makeInMemoryTokenStore } from "../ports/inMemoryTokenStore";
import { KeyValueStore } from "../ports/KeyValueStore";
import type { KeyValueStoreService } from "../ports/KeyValueStore";
import { TokenStore } from "../ports/TokenStore";
import type { TokenStoreService } from "../ports/TokenStore";
import { TopupDraft } from "./domain";
import {
  PENDING_TOPUP_KEY_PREFIX,
  PendingTopup,
  writePendingTopup,
} from "./internal/pendingTopup";
import { Topup } from "./Topup";

const mint = MintUrl.make("https://mint.example");
const keysetHex = "009a1f293253e41e";
const sat = CurrencyUnit.make("sat");
const counterKey = deterministicCounterKey({
  mint,
  unit: sat,
  keysetId: KeysetId.make(keysetHex),
});

const invoice = "lnbc160n1pexampleinvoice";
const quoteId = "quote-1";

const proof = (amount: number, secret: string): Proof => ({
  id: keysetHex,
  amount: CashuAmount.from(amount),
  secret,
  C: "02" + "ab".repeat(32),
});

const mintedProofs = [proof(8, "topup-a"), proof(8, "topup-b")];

const quoteResponse = (
  state: "UNPAID" | "PAID" | "ISSUED",
  expiry: number | null = null,
): MintQuoteBolt11Response => ({
  quote: quoteId,
  request: invoice,
  unit: "sat",
  amount: CashuAmount.from(16),
  state,
  expiry,
});

interface FakeWalletArgs {
  /** The quote `start` creates; defaults to a fresh unpaid one. */
  readonly created?: MintQuoteBolt11Response;
  /** One entry per `checkMintQuoteBolt11` call; the last one repeats. */
  readonly states: ReadonlyArray<MintQuoteBolt11Response>;
  /** Replaces the state sequence entirely when set. */
  readonly check?: () => Promise<MintQuoteBolt11Response>;
  readonly mintProofs?: (counter: number) => Promise<Proof[]>;
  readonly restore?: () => Promise<{
    proofs: Proof[];
    lastCounterWithSignature?: number;
  }>;
}

const makeWallet = (args: FakeWalletArgs) => {
  const mintCounters: number[] = [];
  const restoreCalls: Array<{ start: number; count: number }> = [];
  let checks = 0;
  const wallet: LoadedWallet = {
    keysetId: keysetHex,
    keyChain: { getKeysets: () => [] },
    getMintInfo: () => {
      throw new Error("not under test");
    },
    receive: () => Promise.reject(new Error("not under test")),
    send: () => Promise.reject(new Error("not under test")),
    checkProofsStates: (proofs) =>
      Promise.resolve(
        proofs.map((entry) => ({
          Y: entry.secret ?? "",
          state: "UNSPENT" as const,
          witness: null,
        })),
      ),
    createMintQuoteBolt11: () =>
      Promise.resolve(args.created ?? quoteResponse("UNPAID")),
    checkMintQuoteBolt11: () => {
      if (args.check !== undefined) return args.check();
      const response =
        args.states[Math.min(checks, args.states.length - 1)] ??
        quoteResponse("UNPAID");
      checks += 1;
      return Promise.resolve(response);
    },
    mintProofsBolt11: (_amount, _quote, _config, outputType) => {
      const counter =
        outputType?.type === "deterministic" ? outputType.counter : -1;
      mintCounters.push(counter);
      return args.mintProofs
        ? args.mintProofs(counter)
        : Promise.resolve(mintedProofs);
    },
    restore: (start, count) => {
      restoreCalls.push({ start, count });
      return args.restore
        ? args.restore()
        : Promise.reject(new Error("restore unavailable"));
    },
    createMeltQuoteBolt11: () => Promise.reject(new Error("not under test")),
    checkMeltQuoteBolt11: () => Promise.reject(new Error("not under test")),
    meltProofsBolt11: () => Promise.reject(new Error("not under test")),
    batchRestore: () => Promise.reject(new Error("not under test")),
  };
  return { wallet, mintCounters, restoreCalls };
};

interface Storage {
  readonly kv: KeyValueStoreService;
  readonly tokens: TokenStoreService;
}

const freshStorage = (): Storage => ({
  kv: makeInMemoryKeyValueStore(),
  tokens: makeInMemoryTokenStore(),
});

/** One runtime over the given storage — a second one models a restart. */
const makeHarness = (wallet: LoadedWallet, storage: Storage) => {
  const events: Array<LinkshuInspectorEvent> = [];
  const layer = Topup.DefaultWithoutDependencies.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.succeed(
          WalletInstances,
          WalletInstances.make({ get: () => Effect.succeed(wallet) }),
        ),
        Layer.succeed(KeyValueStore, storage.kv),
        Layer.succeed(TokenStore, storage.tokens),
        Layer.succeed(Inspector, {
          emit: (build) => {
            events.push(build());
          },
          events: Stream.empty,
        }),
      ),
    ),
  );
  const run = <A, E>(program: Effect.Effect<A, E, Topup | Scope.Scope>) =>
    Effect.runPromiseExit(program.pipe(Effect.scoped, Effect.provide(layer)));
  return { run, events };
};

const draft = new TopupDraft({ mint, amount: Amount.make(16) });

const pendingKeys = (kv: KeyValueStoreService) =>
  Effect.runPromise(kv.listKeys(PENDING_TOPUP_KEY_PREFIX));

const startAndAwait = Effect.gen(function* () {
  const topup = yield* Topup;
  const handle = yield* topup.start(draft);
  return { quote: handle.quote, receipt: yield* handle.result };
});

const resumeAndAwait = Effect.gen(function* () {
  const topup = yield* Topup;
  const handles = yield* topup.resumePending;
  const first = handles[0];
  return {
    count: handles.length,
    receipt: first === undefined ? null : yield* first.result,
  };
});

describe("Topup", () => {
  it("mints an accepted row once the quote reports paid", async () => {
    const storage = freshStorage();
    const { wallet, mintCounters } = makeWallet({
      states: [quoteResponse("PAID")],
    });
    const { run, events } = makeHarness(wallet, storage);

    const exit = await run(startAndAwait);

    assert(Exit.isSuccess(exit));
    expect(exit.value.quote.invoice).toBe(invoice);
    expect(exit.value.quote.quoteId).toBe(quoteId);
    expect(exit.value.receipt.amount).toBe(16);
    expect(exit.value.receipt.quoteId).toBe(quoteId);

    const rows = await Effect.runPromise(storage.tokens.loadAll);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("accepted");
    expect(rows[0].id).toBe(exit.value.receipt.rowId);

    // Counters floor at 1, and the whole reserved block is burned.
    expect(mintCounters).toEqual([1]);
    expect(await Effect.runPromise(storage.kv.get(counterKey))).toBe("65");

    // The record only exists while the topup is unfinished.
    expect(await pendingKeys(storage.kv)).toEqual([]);

    const quoteEvents = events.filter(
      (event) => event._tag === "QuoteStateChanged",
    );
    expect(quoteEvents.map((event) => event.state)).toEqual(["UNPAID", "PAID"]);
    expect(
      events.some(
        (event) =>
          event._tag === "OperationSucceeded" &&
          event.name === "topup.complete",
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event._tag === "TokenLifecycleChanged" && event.reason === "topup",
      ),
    ).toBe(true);
  });

  it("resumes an interrupted topup on a fresh runtime over the same storage", async () => {
    const storage = freshStorage();

    // First run: the quote is created but the invoice is never paid, and the
    // runtime goes away while the topup is still pending.
    const first = makeWallet({ states: [quoteResponse("UNPAID")] });
    const interrupted = await makeHarness(first.wallet, storage).run(
      Effect.gen(function* () {
        const handle = yield* (yield* Topup).start(draft);
        return handle.quote;
      }),
    );
    assert(Exit.isSuccess(interrupted));
    expect(interrupted.value.invoice).toBe(invoice);
    expect(await pendingKeys(storage.kv)).toHaveLength(1);
    expect(first.mintCounters).toEqual([]);

    // Second run: same storage, nothing in memory. The invoice was paid in
    // the meantime and the topup finishes itself.
    const second = makeWallet({ states: [quoteResponse("PAID")] });
    const { run } = makeHarness(second.wallet, storage);
    const resumed = await run(resumeAndAwait);

    assert(Exit.isSuccess(resumed));
    expect(resumed.value.count).toBe(1);
    expect(resumed.value.receipt?.amount).toBe(16);

    const rows = await Effect.runPromise(storage.tokens.loadAll);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("accepted");
    expect(await pendingKeys(storage.kv)).toEqual([]);
  });

  it("reclaims proofs a lost response already had signed, without minting twice", async () => {
    const storage = freshStorage();

    const interrupting = makeWallet({
      states: [quoteResponse("PAID")],
      // The mint signs the outputs, then the response is lost in transit.
      mintProofs: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const crashed = await makeHarness(interrupting.wallet, storage).run(
      Effect.either(startAndAwait),
    );
    assert(Exit.isSuccess(crashed));
    assert(crashed.value._tag === "Left");
    expect(crashed.value.left._tag).toBe("MintUnreachable");

    // The reserved slot survived the crash, so the resume re-derives exactly
    // the outputs the mint signed.
    expect(await pendingKeys(storage.kv)).toHaveLength(1);
    expect(interrupting.mintCounters).toEqual([1]);

    const resuming = makeWallet({
      states: [quoteResponse("ISSUED")],
      restore: () =>
        Promise.resolve({ proofs: mintedProofs, lastCounterWithSignature: 2 }),
    });
    const resumed = await makeHarness(resuming.wallet, storage).run(
      resumeAndAwait,
    );

    assert(Exit.isSuccess(resumed));
    expect(resumed.value.receipt?.amount).toBe(16);
    // Reclaimed, never re-minted.
    expect(resuming.mintCounters).toEqual([]);
    expect(resuming.restoreCalls).toEqual([{ start: 1, count: 64 }]);

    const rows = await Effect.runPromise(storage.tokens.loadAll);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("accepted");
    expect(await pendingKeys(storage.kv)).toEqual([]);
  });

  it("resolves to the stored row when the proofs landed before the crash", async () => {
    const storage = freshStorage();
    const first = makeWallet({ states: [quoteResponse("PAID")] });
    const done = await makeHarness(first.wallet, storage).run(startAndAwait);
    assert(Exit.isSuccess(done));

    // The row was written but the record never cleared — the one window
    // `persistMinted` leaves open. Resuming must find the stored proofs
    // rather than import them a second time.
    await Effect.runPromise(
      writePendingTopup(
        storage.kv,
        new PendingTopup({
          quoteId: QuoteId.make(quoteId),
          mint,
          unit: sat,
          keysetId: KeysetId.make(keysetHex),
          amount: Amount.make(16),
          invoice: Bolt11Invoice.make(invoice),
          expiresAt: null,
          createdAt: UnixSeconds.make(Math.floor(Date.now() / 1000)),
          mintCounter: 1,
        }),
      ),
    );

    const resuming = makeWallet({
      states: [quoteResponse("ISSUED")],
      restore: () =>
        Promise.resolve({ proofs: mintedProofs, lastCounterWithSignature: 2 }),
    });
    const resumed = await makeHarness(resuming.wallet, storage).run(
      resumeAndAwait,
    );

    assert(Exit.isSuccess(resumed));
    expect(resumed.value.receipt?.rowId).toBe(done.value.receipt.rowId);

    const rows = await Effect.runPromise(storage.tokens.loadAll);
    expect(rows).toHaveLength(1);
    expect(await pendingKeys(storage.kv)).toEqual([]);
  });

  it("fails with QuoteExpired and drops the record once an unpaid quote expires", async () => {
    const storage = freshStorage();
    const expired = Math.floor(Date.now() / 1000) - 60;
    const { wallet } = makeWallet({
      created: quoteResponse("UNPAID", expired),
      states: [quoteResponse("UNPAID", expired)],
    });
    const { run } = makeHarness(wallet, storage);

    const exit = await run(Effect.either(startAndAwait));

    assert(Exit.isSuccess(exit));
    assert(exit.value._tag === "Left");
    expect(exit.value.left._tag).toBe("QuoteExpired");
    expect(await Effect.runPromise(storage.tokens.loadAll)).toEqual([]);
    expect(await pendingKeys(storage.kv)).toEqual([]);
  });

  it("keeps the record when the mint is unreachable across the deadline", async () => {
    const storage = freshStorage();
    const { wallet } = makeWallet({
      // The TestClock starts the topup at t=1000s, so this deadline passes
      // 10s into the poll — well before the failure cap ends it.
      created: quoteResponse("UNPAID", 1010),
      states: [],
      check: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    const { run } = makeHarness(wallet, storage);

    const exit = await run(
      Effect.gen(function* () {
        yield* TestClock.adjust("1000 seconds");
        const fiber = yield* Effect.fork(Effect.either(startAndAwait));
        // Flush the rejected check between adjustments so the poll reaches
        // its next sleep before the clock moves.
        for (let tick = 0; tick < 12; tick += 1) {
          yield* Effect.promise(
            () => new Promise((resolve) => setTimeout(resolve, 0)),
          );
          yield* TestClock.adjust("5 seconds");
        }
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestContext.TestContext)),
    );

    assert(Exit.isSuccess(exit));
    assert(exit.value._tag === "Left");
    // Unreachable, not expired: only the mint's own UNPAID answer may expire
    // a quote — it might have been paid while we could not check.
    expect(exit.value.left._tag).toBe("MintUnreachable");
    expect(await pendingKeys(storage.kv)).toHaveLength(1);
  });

  it("rescues a paid quote whose record outlived its deadline", async () => {
    const storage = freshStorage();
    const expired = Math.floor(Date.now() / 1000) - 3600;
    // Crash window: the invoice was paid, but the process died before any
    // mint attempt reserved counters — the record must not be pruned on time.
    await Effect.runPromise(
      writePendingTopup(
        storage.kv,
        new PendingTopup({
          quoteId: QuoteId.make(quoteId),
          mint,
          unit: sat,
          keysetId: KeysetId.make(keysetHex),
          amount: Amount.make(16),
          invoice: Bolt11Invoice.make(invoice),
          expiresAt: UnixSeconds.make(expired),
          createdAt: UnixSeconds.make(expired - 600),
          mintCounter: null,
        }),
      ),
    );

    const { wallet, mintCounters } = makeWallet({
      states: [quoteResponse("PAID")],
    });
    const resumed = await makeHarness(wallet, storage).run(resumeAndAwait);

    assert(Exit.isSuccess(resumed));
    expect(resumed.value.count).toBe(1);
    expect(resumed.value.receipt?.amount).toBe(16);
    expect(mintCounters).toEqual([1]);
    expect(await pendingKeys(storage.kv)).toEqual([]);
  });

  it("drops an expired record once the mint confirms it unpaid on resume", async () => {
    const storage = freshStorage();
    const expired = Math.floor(Date.now() / 1000) - 3600;
    await Effect.runPromise(
      writePendingTopup(
        storage.kv,
        new PendingTopup({
          quoteId: QuoteId.make(quoteId),
          mint,
          unit: sat,
          keysetId: KeysetId.make(keysetHex),
          amount: Amount.make(16),
          invoice: Bolt11Invoice.make(invoice),
          expiresAt: UnixSeconds.make(expired),
          createdAt: UnixSeconds.make(expired - 600),
          mintCounter: null,
        }),
      ),
    );

    const { wallet } = makeWallet({ states: [quoteResponse("UNPAID")] });
    const resumed = await makeHarness(wallet, storage).run(
      Effect.gen(function* () {
        const handles = yield* (yield* Topup).resumePending;
        const first = handles[0];
        return first === undefined ? null : yield* Effect.either(first.result);
      }),
    );

    assert(Exit.isSuccess(resumed));
    assert(resumed.value?._tag === "Left");
    expect(resumed.value.left._tag).toBe("QuoteExpired");
    expect(await pendingKeys(storage.kv)).toEqual([]);
  });

  it("moves past a counter collision and mints on the recovered slot", async () => {
    const storage = freshStorage();
    const { wallet, mintCounters } = makeWallet({
      states: [quoteResponse("PAID")],
      mintProofs: (counter) =>
        counter === 1
          ? Promise.reject(
              new MintOperationError(
                11005,
                "outputs have already been signed before",
              ),
            )
          : Promise.resolve(mintedProofs),
      restore: () =>
        Promise.resolve({ proofs: [], lastCounterWithSignature: 100 }),
    });
    const { run } = makeHarness(wallet, storage);

    const exit = await run(startAndAwait);

    assert(Exit.isSuccess(exit));
    expect(exit.value.receipt.amount).toBe(16);
    // The NUT-09 probe found signatures past the reserved block, so the retry
    // starts beyond them rather than at the block's end.
    expect(mintCounters).toEqual([1, 101]);
    expect(await pendingKeys(storage.kv)).toEqual([]);
  });

  it("surfaces a definitive mint rejection and keeps the record for a retry", async () => {
    const storage = freshStorage();
    const { wallet } = makeWallet({
      states: [quoteResponse("PAID")],
      mintProofs: () =>
        Promise.reject(new MintOperationError(20002, "quote already issued")),
    });
    const { run } = makeHarness(wallet, storage);

    const exit = await run(Effect.either(startAndAwait));

    assert(Exit.isSuccess(exit));
    assert(exit.value._tag === "Left");
    expect(exit.value.left._tag).toBe("MintRejected");
    // A reserved counter means the invoice was paid: the record must outlive
    // the failure so the funds stay reclaimable.
    expect(await pendingKeys(storage.kv)).toHaveLength(1);
  });
});
