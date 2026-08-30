import { Effect, Exit } from "effect";
import { CurrencyUnit, KeysetId, MintUrl } from "../../domain/primitives";
import type { CounterScope } from "../../internal/counters";
import { KeyValueStore } from "../../ports/KeyValueStore";
import { inMemoryKeyValueStore } from "../../ports/inMemoryKeyValueStore";
import {
  advanceRestoreCursor,
  readRestoreCursor,
  readSeenKeysets,
  rememberKeysets,
  restoreCursorKey,
} from "./restoreState";

const mint = MintUrl.make("https://mint.example");
const otherMint = MintUrl.make("https://other.example");
const sat = CurrencyUnit.make("sat");
const keysetA = KeysetId.make("009a1f293253e41e");
const keysetB = KeysetId.make("009a1f293253e41f");

const scope: CounterScope = { mint, unit: sat, keysetId: keysetA };

const run = <A, E>(program: Effect.Effect<A, E, KeyValueStore>) =>
  Effect.runPromiseExit(program.pipe(Effect.provide(inMemoryKeyValueStore)));

describe("restore cursors", () => {
  it("keys a cursor by mint, unit, and keyset", () => {
    expect(restoreCursorKey(scope)).toBe(
      "linkshu.restoreCursor.https%3A%2F%2Fmint.example.sat.009a1f293253e41e",
    );
    expect(restoreCursorKey({ ...scope, keysetId: keysetB })).not.toBe(
      restoreCursorKey(scope),
    );
  });

  it("reads an absent or malformed cursor as the start of the tree", async () => {
    const exit = await run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore;
        const absent = yield* readRestoreCursor(kv, scope);
        yield* kv.set(restoreCursorKey(scope), "not-a-number");
        const malformed = yield* readRestoreCursor(kv, scope);
        yield* kv.set(restoreCursorKey(scope), "-5");
        const negative = yield* readRestoreCursor(kv, scope);
        return { absent, malformed, negative };
      }),
    );

    expect(exit).toEqual(
      Exit.succeed({ absent: 0, malformed: 0, negative: 0 }),
    );
  });

  it("never moves a cursor backwards", async () => {
    const exit = await run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore;
        const forward = yield* advanceRestoreCursor(kv, scope, 4200);
        const backward = yield* advanceRestoreCursor(kv, scope, 300);
        return {
          forward,
          backward,
          stored: yield* kv.get(restoreCursorKey(scope)),
        };
      }),
    );

    expect(exit).toEqual(
      Exit.succeed({ forward: 4200, backward: 4200, stored: "4200" }),
    );
  });
});

describe("seen keysets", () => {
  it("remembers keysets per mint and unit, and reads them back", async () => {
    const exit = await run(
      Effect.gen(function* () {
        const kv = yield* KeyValueStore;
        yield* rememberKeysets(kv, mint, sat, [keysetA, keysetB]);
        yield* rememberKeysets(kv, otherMint, sat, [keysetA]);
        // Re-remembering is a no-op, not a duplicate.
        yield* rememberKeysets(kv, mint, sat, [keysetA]);
        return {
          ours: [...(yield* readSeenKeysets(kv, mint, sat))].sort(),
          theirs: yield* readSeenKeysets(kv, otherMint, sat),
          otherUnit: yield* readSeenKeysets(kv, mint, CurrencyUnit.make("usd")),
        };
      }),
    );

    expect(exit).toEqual(
      Exit.succeed({
        ours: [keysetA, keysetB],
        theirs: [keysetA],
        otherUnit: [],
      }),
    );
  });
});
