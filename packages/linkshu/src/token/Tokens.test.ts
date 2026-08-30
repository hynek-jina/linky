import { Amount, getEncodedToken } from "@cashu/cashu-ts";
import { Effect, Layer } from "effect";
import { TokenText } from "../domain/primitives";
import { inMemoryTokenStore } from "../ports/inMemoryTokenStore";
import { NewTokenRow, TokenStore } from "../ports/TokenStore";
import type { TokenState } from "./domain";
import { Tokens } from "./Tokens";

const token = (mint: string, amount: number, secret: string): TokenText =>
  TokenText.make(
    getEncodedToken({
      mint,
      unit: "sat",
      proofs: [
        {
          id: "009a1f293253e41e",
          amount: Amount.from(amount),
          secret,
          C: "02" + "ab".repeat(32),
        },
      ],
    }),
  );

const row = (state: TokenState, tokenText: TokenText): NewTokenRow =>
  new NewTokenRow({
    originalTokenText: tokenText,
    tokenText,
    state,
    error: null,
  });

const balancesOf = (rows: ReadonlyArray<NewTokenRow>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* TokenStore;
      yield* Effect.forEach(rows, store.insert);
      return yield* (yield* Tokens).balances;
    }).pipe(
      Effect.provide(Layer.provideMerge(Tokens.Default, inMemoryTokenStore)),
    ),
  );

describe("Tokens.balances", () => {
  it("is empty for an empty wallet", async () => {
    const balances = await balancesOf([]);
    expect(balances.total).toBe(0);
    expect(balances.spendable).toBe(0);
    expect(balances.perMint).toEqual([]);
  });

  it("sums accepted rows per mint; spendable is the largest single mint", async () => {
    const balances = await balancesOf([
      row("accepted", token("https://mint.one", 4, "a")),
      row("accepted", token("https://mint.one", 2, "b")),
      row("accepted", token("https://mint.two", 5, "c")),
    ]);

    expect(balances.total).toBe(11);
    expect(balances.spendable).toBe(6);
    expect(
      balances.perMint.map(({ mint, amount }) => [String(mint), amount]),
    ).toEqual([
      ["https://mint.one", 6],
      ["https://mint.two", 5],
    ]);
  });

  it("counts only accepted rows", async () => {
    const balances = await balancesOf([
      row("accepted", token("https://mint.one", 4, "a")),
      row("pending", token("https://mint.one", 8, "b")),
      row("reserved", token("https://mint.one", 16, "c")),
      row("issued", token("https://mint.one", 32, "d")),
      row("externalized", token("https://mint.one", 64, "e")),
      row("error", token("https://mint.one", 128, "f")),
    ]);

    expect(balances.total).toBe(4);
    expect(balances.spendable).toBe(4);
  });
});
