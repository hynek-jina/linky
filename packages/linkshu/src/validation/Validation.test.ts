import type { Proof as CashuProof } from "@cashu/cashu-ts";
import { Amount, getEncodedToken } from "@cashu/cashu-ts";
import { Effect, Exit, Layer, Stream } from "effect";
import { MintUnreachable } from "../domain/errors";
import { MintUrl, TokenRowId, TokenText } from "../domain/primitives";
import type { LinkshuInspectorEvent } from "../inspector/events";
import { Inspector } from "../inspector/Inspector";
import { WalletInstances } from "../mint/internal/WalletInstances";
import type { LoadedWallet } from "../mint/internal/WalletInstances";
import { inMemoryTokenStore } from "../ports/inMemoryTokenStore";
import { NewTokenRow, TokenStore } from "../ports/TokenStore";
import type { StoredTokenRow } from "../ports/TokenStore";
import { parseTokenText } from "../token/codec";
import type { TokenState } from "../token/domain";
import { Validation } from "./Validation";

const mint = MintUrl.make("https://mint.example");
const keysetHex = "009a1f293253e41e";

const proof = (amount: number, secret: string): CashuProof => ({
  id: keysetHex,
  amount: Amount.from(amount),
  secret,
  C: "02" + "ab".repeat(32),
});

const tokenOf = (...proofs: ReadonlyArray<CashuProof>): string =>
  getEncodedToken({ mint, unit: "sat", proofs: [...proofs] });

const tokenA = tokenOf(proof(4, "sec-a1"), proof(2, "sec-a2"));
const tokenB = tokenOf(proof(8, "sec-b1"));
const spentToken = tokenOf(proof(3, "sec-z1"));
const foreignToken = getEncodedToken({
  mint: "https://other.example",
  unit: "sat",
  proofs: [proof(16, "sec-o1")],
});

type StateName = "UNSPENT" | "PENDING" | "SPENT";

interface HarnessArgs {
  stateOf?: (secret: string) => StateName;
  checkStatesError?: unknown;
  /** Answer fewer states than asked, to emulate a truncated response. */
  truncateTo?: number;
  walletUnreachable?: boolean;
}

const makeWallet = (args: HarnessArgs): LoadedWallet => ({
  keysetId: keysetHex,
  keyChain: { getKeysets: () => [] },
  getMintInfo: () => {
    throw new Error("not under test");
  },
  receive: () => Promise.reject(new Error("not under test")),
  send: () => Promise.reject(new Error("not under test")),
  restore: () => Promise.reject(new Error("not under test")),
  createMintQuoteBolt11: () => Promise.reject(new Error("not under test")),
  checkMintQuoteBolt11: () => Promise.reject(new Error("not under test")),
  mintProofsBolt11: () => Promise.reject(new Error("not under test")),
  createMeltQuoteBolt11: () => Promise.reject(new Error("not under test")),
  checkMeltQuoteBolt11: () => Promise.reject(new Error("not under test")),
  meltProofsBolt11: () => Promise.reject(new Error("not under test")),
  batchRestore: () => Promise.reject(new Error("not under test")),
  checkProofsStates: (proofs) =>
    args.checkStatesError !== undefined
      ? Promise.reject(args.checkStatesError)
      : Promise.resolve(
          proofs.slice(0, args.truncateTo ?? proofs.length).map((entry) => ({
            Y: entry.secret ?? "",
            state: args.stateOf?.(entry.secret ?? "") ?? "UNSPENT",
            witness: null,
          })),
        ),
});

const makeHarness = (args: HarnessArgs) => {
  const events: Array<LinkshuInspectorEvent> = [];
  const wallet = makeWallet(args);
  const layer = Validation.DefaultWithoutDependencies.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.succeed(
          WalletInstances,
          WalletInstances.make({
            // Only the mint under test loads; anything else is a second mint
            // this wallet cannot reach right now.
            get: (requested) =>
              requested === mint && args.walletUnreachable !== true
                ? Effect.succeed(wallet)
                : Effect.fail(
                    new MintUnreachable({ mint: requested, detail: null }),
                  ),
          }),
        ),
        inMemoryTokenStore,
        Layer.succeed(Inspector, {
          emit: (build) => {
            events.push(build());
          },
          events: Stream.empty,
        }),
      ),
    ),
  );
  const run = <A, E>(program: Effect.Effect<A, E, Validation | TokenStore>) =>
    Effect.runPromiseExit(program.pipe(Effect.provide(layer)));
  return { run, events };
};

const seedRow = (tokenText: string, state: TokenState) =>
  Effect.flatMap(TokenStore, (store) =>
    store.insert(
      new NewTokenRow({
        originalTokenText: TokenText.make(tokenText),
        tokenText: TokenText.make(tokenText),
        state,
        error: null,
      }),
    ),
  );

/** Seeds rows, runs one validation call, and reports the resulting store. */
const withRows = <A, E>(
  seeds: ReadonlyArray<readonly [string, TokenState]>,
  operation: (validation: Validation) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    yield* Effect.forEach(seeds, ([tokenText, state]) =>
      seedRow(tokenText, state),
    );
    const result = yield* operation(yield* Validation);
    return { result, rows: yield* (yield* TokenStore).loadAll };
  });

const checkSeededRow = (tokenText: string, state: TokenState = "accepted") =>
  Effect.gen(function* () {
    const row = yield* seedRow(tokenText, state);
    const validation = yield* Validation;
    const result = yield* validation.checkRow(row.id);
    return { result, rows: yield* (yield* TokenStore).loadAll };
  });

const amountOf = (row: StoredTokenRow | undefined): number | undefined =>
  row === undefined ? undefined : parseTokenText(row.tokenText)?.amount;

describe("Validation.checkAll", () => {
  it("marks fully spent rows error and merges the survivors into one row", async () => {
    const { run, events } = makeHarness({
      stateOf: (secret) => (secret === "sec-z1" ? "SPENT" : "UNSPENT"),
    });

    const exit = await run(
      withRows(
        [
          [tokenA, "accepted"],
          [tokenB, "accepted"],
          [spentToken, "accepted"],
          [foreignToken, "accepted"],
        ],
        (validation) => validation.checkAll,
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    const { result, rows } = exit.value;

    expect(result.checkedRows).toBe(3);
    expect(result.markedSpent).toHaveLength(1);
    expect(result.markedSpent[0]?.amount).toBe(3);
    expect(result.mergedRows).toHaveLength(1);
    // The other mint is its own group, and it is not reachable here.
    expect(result.unavailableMints).toEqual(["https://other.example"]);

    const errored = rows.find((row) => row.state === "error");
    expect(errored?.tokenText).toBe(spentToken);
    expect(JSON.parse(errored?.error ?? "")).toMatchObject({
      _tag: "TokenAlreadySpent",
      mint,
    });

    // A and B collapsed into one accepted row holding all 14 sats; the
    // foreign mint's row was never part of the call.
    const merged = rows.filter(
      (row) => row.state === "accepted" && row.tokenText !== foreignToken,
    );
    expect(merged).toHaveLength(1);
    expect(amountOf(merged[0])).toBe(14);
    expect(rows.some((row) => row.tokenText === foreignToken)).toBe(true);

    // No key material: neither token text nor proof secrets in any event.
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("cashu");
    expect(serialized).not.toContain("sec-a1");
  });

  it("keeps a partially spent row alive with only its surviving proofs", async () => {
    const { run } = makeHarness({
      stateOf: (secret) => (secret === "sec-a1" ? "SPENT" : "UNSPENT"),
    });

    const exit = await run(
      withRows([[tokenA, "accepted"]], (validation) => validation.checkAll),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.markedSpent).toEqual([]);
    expect(exit.value.rows).toHaveLength(1);
    expect(exit.value.rows[0]?.state).toBe("accepted");
    expect(amountOf(exit.value.rows[0])).toBe(2);
  });

  it("changes nothing when every proof is still unspent", async () => {
    const { run } = makeHarness({});

    const exit = await run(
      withRows([[tokenA, "accepted"]], (validation) => validation.checkAll),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.mergedRows).toEqual([]);
    expect(exit.value.rows[0]?.tokenText).toBe(tokenA);
  });

  it("never marks anything on a truncated response", async () => {
    const { run } = makeHarness({ stateOf: () => "SPENT", truncateTo: 1 });

    const exit = await run(
      withRows(
        [
          [tokenA, "accepted"],
          [tokenB, "accepted"],
        ],
        (validation) => validation.checkAll,
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    // Only one of the three proofs was answered, so no row is fully covered.
    expect(exit.value.result.markedSpent).toEqual([]);
    expect(exit.value.rows.every((row) => row.state === "accepted")).toBe(true);
  });

  it("treats a pending proof as unknown rather than spent", async () => {
    const { run } = makeHarness({
      stateOf: (secret) => (secret === "sec-a1" ? "PENDING" : "SPENT"),
    });

    const exit = await run(
      withRows([[tokenA, "accepted"]], (validation) => validation.checkAll),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.markedSpent).toEqual([]);
    expect(exit.value.rows[0]?.state).toBe("accepted");
  });

  it("reports a failed check as an unavailable mint and touches nothing", async () => {
    const { run } = makeHarness({
      checkStatesError: new TypeError("fetch failed"),
    });

    const exit = await run(
      withRows([[tokenA, "accepted"]], (validation) => validation.checkAll),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.unavailableMints).toEqual([mint]);
    expect(exit.value.result.checkedRows).toBe(0);
    expect(exit.value.rows[0]?.tokenText).toBe(tokenA);
  });

  it("reports an unloadable mint as unavailable", async () => {
    const { run } = makeHarness({ walletUnreachable: true });

    const exit = await run(
      withRows([[tokenA, "accepted"]], (validation) => validation.checkAll),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.unavailableMints).toEqual([mint]);
    expect(exit.value.rows[0]?.state).toBe("accepted");
  });

  it("leaves emitted and in-flight rows to their own flows", async () => {
    const { run } = makeHarness({ stateOf: () => "SPENT" });

    const exit = await run(
      withRows(
        [
          [tokenA, "issued"],
          [tokenB, "pending"],
        ],
        (validation) => validation.checkAll,
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.checkedRows).toBe(0);
    expect(exit.value.rows.map((row) => row.state)).toEqual([
      "issued",
      "pending",
    ]);
  });
});

describe("Validation.checkRow", () => {
  it("marks a spent row and reports it", async () => {
    const { run } = makeHarness({ stateOf: () => "SPENT" });

    const exit = await run(checkSeededRow(tokenA));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.status).toBe("spent");
    expect(exit.value.rows[0]?.state).toBe("error");
  });

  it("marks a spent reserved row, whose earmark cannot keep it alive", async () => {
    const { run } = makeHarness({ stateOf: () => "SPENT" });

    const exit = await run(checkSeededRow(tokenA, "reserved"));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.status).toBe("spent");
    expect(exit.value.rows[0]?.state).toBe("error");
  });

  it("reports a live row and prunes what the mint took", async () => {
    const { run } = makeHarness({
      stateOf: (secret) => (secret === "sec-a1" ? "SPENT" : "UNSPENT"),
    });

    const exit = await run(checkSeededRow(tokenA));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.status).toBe("live");
    expect(amountOf(exit.value.rows[0])).toBe(2);
  });

  it("reports unavailable when the mint gives no usable answer", async () => {
    const { run } = makeHarness({
      checkStatesError: new TypeError("fetch failed"),
    });

    const exit = await run(checkSeededRow(tokenA));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.status).toBe("unavailable");
    expect(exit.value.rows[0]?.state).toBe("accepted");
  });

  it("fails with TokenRowNotFound for an unknown row", async () => {
    const { run } = makeHarness({});

    const exit = await run(
      Effect.flatMap(Validation, (validation) =>
        Effect.flip(validation.checkRow(TokenRowId.make("missing"))),
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value).toMatchObject({ _tag: "TokenRowNotFound" });
  });
});

describe("Validation.checkIssued", () => {
  it("removes issued rows the recipient has claimed", async () => {
    const { run } = makeHarness({
      stateOf: (secret) => (secret === "sec-b1" ? "SPENT" : "UNSPENT"),
    });

    const exit = await run(
      withRows(
        [
          [tokenA, "issued"],
          [tokenB, "issued"],
        ],
        (validation) => validation.checkIssued,
      ),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.claimed).toHaveLength(1);
    expect(exit.value.result.claimed[0]?.amount).toBe(8);
    expect(exit.value.rows).toHaveLength(1);
    expect(exit.value.rows[0]?.tokenText).toBe(tokenA);
  });

  it("keeps unclaimed issued rows untouched", async () => {
    const { run } = makeHarness({});

    const exit = await run(
      withRows([[tokenA, "issued"]], (validation) => validation.checkIssued),
    );

    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    expect(exit.value.result.claimed).toEqual([]);
    expect(exit.value.rows[0]?.state).toBe("issued");
  });
});
