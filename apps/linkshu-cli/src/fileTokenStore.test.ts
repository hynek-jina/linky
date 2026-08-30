import { NewTokenRow, TokenText } from "@linky/linkshu";
import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { makeFileTokenStore } from "./fileTokenStore";

/** A fresh path plus a factory, so a test can simulate a process restart. */
const wallet = () => {
  const filePath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "linkshu-cli-")),
    "tokens.json",
  );
  return { filePath, open: () => makeFileTokenStore(filePath) };
};

const row = (suffix: string): NewTokenRow =>
  new NewTokenRow({
    originalTokenText: TokenText.make(`cashuB${suffix}`),
    tokenText: TokenText.make(`cashuB${suffix}`),
    state: "accepted",
    error: null,
  });

describe("fileTokenStore", () => {
  it("loads nothing from a wallet that has never been written", async () => {
    expect(await Effect.runPromise(wallet().open().loadAll)).toEqual([]);
  });

  it("assigns an id and a creation time on insert", async () => {
    const stored = await Effect.runPromise(wallet().open().insert(row("aa")));
    expect(stored.id.length).toBeGreaterThan(0);
    expect(stored.createdAt).toBeGreaterThan(0);
    expect(stored.state).toBe("accepted");
  });

  it("survives the process that inserted the rows", async () => {
    const { open } = wallet();
    await Effect.runPromise(open().insert(row("aa")));
    await Effect.runPromise(open().insert(row("bb")));

    const reloaded = await Effect.runPromise(open().loadAll);
    expect(reloaded.map((stored) => String(stored.tokenText)).sort()).toEqual([
      "cashuBaa",
      "cashuBbb",
    ]);
  });

  it("applies only the fields a sparse patch mentions", async () => {
    const { open } = wallet();
    const stored = await Effect.runPromise(open().insert(row("aa")));
    await Effect.runPromise(open().update(stored.id, { state: "issued" }));

    const [updated] = await Effect.runPromise(open().loadAll);
    expect(updated.state).toBe("issued");
    expect(updated.tokenText).toBe(stored.tokenText);
    expect(updated.createdAt).toBe(stored.createdAt);
  });

  it("rewrites the token text a swap produced without losing the row identity", async () => {
    const { open } = wallet();
    const stored = await Effect.runPromise(open().insert(row("aa")));
    await Effect.runPromise(
      open().update(stored.id, { tokenText: TokenText.make("cashuBswapped") }),
    );

    const [updated] = await Effect.runPromise(open().loadAll);
    expect(String(updated.tokenText)).toBe("cashuBswapped");
    expect(updated.originalTokenText).toBe(stored.originalTokenText);
  });

  it("keeps removed rows out of loadAll", async () => {
    const { open } = wallet();
    const doomed = await Effect.runPromise(open().insert(row("aa")));
    await Effect.runPromise(open().insert(row("bb")));
    await Effect.runPromise(open().remove(doomed.id));

    const remaining = await Effect.runPromise(open().loadAll);
    expect(remaining.map((stored) => String(stored.tokenText))).toEqual([
      "cashuBbb",
    ]);
  });

  it("does not lose rows inserted concurrently", async () => {
    const store = wallet().open();
    await Effect.runPromise(
      Effect.all(
        Array.from({ length: 25 }, (_unused, index) =>
          store.insert(row(`x${index}`)),
        ),
        { concurrency: "unbounded" },
      ),
    );
    expect(await Effect.runPromise(store.loadAll)).toHaveLength(25);
  });

  it("stores the port's own row shape, so the file stays hand-readable", async () => {
    const { filePath, open } = wallet();
    await Effect.runPromise(open().insert(row("aa")));

    const written: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(written).toMatchObject([
      { tokenText: "cashuBaa", state: "accepted", error: null },
    ]);
  });
});
