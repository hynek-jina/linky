import { Effect } from "effect";
import { TokenRowId, TokenText } from "../domain/primitives";
import { inMemoryTokenStore } from "./inMemoryTokenStore";
import { NewTokenRow, TokenStore } from "./TokenStore";

const run = <A, E>(program: Effect.Effect<A, E, TokenStore>): Promise<A> =>
  Effect.runPromise(program.pipe(Effect.provide(inMemoryTokenStore)));

const newRow = (suffix: string): NewTokenRow =>
  new NewTokenRow({
    originalTokenText: TokenText.make(`cashuAoriginal${suffix}`),
    tokenText: TokenText.make(`cashuAcurrent${suffix}`),
    state: "pending",
    error: null,
  });

describe("inMemoryTokenStore", () => {
  it("insert assigns distinct ids and a positive createdAt", async () => {
    const [first, second] = await run(
      Effect.gen(function* () {
        const store = yield* TokenStore;
        return [
          yield* store.insert(newRow("1")),
          yield* store.insert(newRow("2")),
        ];
      }),
    );
    expect(first.id).not.toBe(second.id);
    expect(first.createdAt).toBeGreaterThan(0);
    expect(first.originalTokenText).toBe("cashuAoriginal1");
  });

  it("loadAll returns inserted rows", async () => {
    const rows = await run(
      Effect.gen(function* () {
        const store = yield* TokenStore;
        const inserted = yield* store.insert(newRow("1"));
        const all = yield* store.loadAll;
        expect(all).toEqual([inserted]);
        return all;
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it("update patches only the given fields", async () => {
    const updated = await run(
      Effect.gen(function* () {
        const store = yield* TokenStore;
        const inserted = yield* store.insert(newRow("1"));
        yield* store.update(inserted.id, { state: "accepted" });
        yield* store.update(TokenRowId.make("missing"), { state: "error" });
        const all = yield* store.loadAll;
        expect(all).toHaveLength(1);
        return all[0];
      }),
    );
    expect(updated.state).toBe("accepted");
    expect(updated.tokenText).toBe("cashuAcurrent1");
    expect(updated.error).toBeNull();
  });

  it("remove hides the row from loadAll", async () => {
    const rows = await run(
      Effect.gen(function* () {
        const store = yield* TokenStore;
        const kept = yield* store.insert(newRow("1"));
        const removed = yield* store.insert(newRow("2"));
        yield* store.remove(removed.id);
        const all = yield* store.loadAll;
        expect(all).toEqual([kept]);
        return all;
      }),
    );
    expect(rows).toHaveLength(1);
  });
});
