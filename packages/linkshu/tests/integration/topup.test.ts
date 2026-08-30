import { Effect, Layer } from "effect";
import {
  Amount,
  Bip39Seed,
  KeyValueStore,
  makeInMemoryKeyValueStore,
  makeInMemoryTokenStore,
  MintUrl,
  Send,
  SendDraft,
  TokenStore,
  Topup,
  TopupDraft,
  runLinkshu,
} from "../../src";
import type { Bip39Seed as Bip39SeedType } from "../../src";
import { PENDING_TOPUP_KEY_PREFIX } from "../../src/topup/internal/pendingTopup";

// The dev-stack Nutshell FakeWallet mint (docker-compose.dev.yml `cashu-mint`)
// auto-settles every bolt11 invoice it issues, so a fresh quote turns PAID
// without anything paying it.
const mintUrl = MintUrl.make(
  process.env.LINKSHU_MINT_URL ?? "http://localhost:3338",
);

// Fresh seed per run: deterministic counters live at the mint, so a reused
// seed would start every run inside an already-signed counter range.
const randomSeed = (): Bip39SeedType =>
  Bip39Seed.make(crypto.getRandomValues(new Uint8Array(64)));

/**
 * Storage that outlives the runtime using it. Two `runLinkshu` calls over one
 * of these are a process restart: nothing survives in memory, everything
 * survives in the ports.
 */
const durableStorage = () => {
  const kv = makeInMemoryKeyValueStore();
  const tokens = makeInMemoryTokenStore();
  return {
    kv,
    tokens,
    layers: {
      keyValueStore: Layer.succeed(KeyValueStore, kv),
      tokenStore: Layer.succeed(TokenStore, tokens),
    },
  };
};

describe("topup vertical against the local mint", () => {
  it("drives quote, poll, and mint into one accepted row", async () => {
    const { kv, tokens, layers } = durableStorage();

    const { quote, receipt } = await runLinkshu(
      { bip39Seed: randomSeed(), ...layers },
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* (yield* Topup).start(
            new TopupDraft({ mint: mintUrl, amount: Amount.make(32) }),
          );
          return { quote: handle.quote, receipt: yield* handle.result };
        }),
      ),
    );

    expect(quote.mint).toBe(mintUrl);
    expect(quote.invoice.toLowerCase().startsWith("ln")).toBe(true);
    expect(quote.amount).toBe(32);

    expect(receipt.quoteId).toBe(quote.quoteId);
    expect(receipt.amount).toBe(32);
    expect(receipt.tokenText.startsWith("cashu")).toBe(true);

    const rows = await Effect.runPromise(tokens.loadAll);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("accepted");
    expect(rows[0].id).toBe(receipt.rowId);

    // A finished topup leaves no pending work behind.
    expect(
      await Effect.runPromise(kv.listKeys(PENDING_TOPUP_KEY_PREFIX)),
    ).toEqual([]);
  });

  it("resumes a topup interrupted after quote creation and spends the result", async () => {
    const seed = randomSeed();
    const { kv, tokens, layers } = durableStorage();

    // Run one: the quote is created and persisted, then the runtime dies —
    // closing the scope interrupts the poll before it can mint anything.
    const quote = await runLinkshu(
      { bip39Seed: seed, ...layers },
      Effect.scoped(
        Effect.map(
          Effect.flatMap(Topup, (topup) =>
            topup.start(
              new TopupDraft({ mint: mintUrl, amount: Amount.make(64) }),
            ),
          ),
          (handle) => handle.quote,
        ),
      ),
    );

    expect(quote.invoice.toLowerCase().startsWith("ln")).toBe(true);
    expect(await Effect.runPromise(tokens.loadAll)).toEqual([]);
    expect(
      await Effect.runPromise(kv.listKeys(PENDING_TOPUP_KEY_PREFIX)),
    ).toHaveLength(1);

    // Run two: nothing in memory, the same storage. The invoice settled while
    // nobody was watching, and the topup finishes itself.
    const { resumed, receipt, sent } = await runLinkshu(
      { bip39Seed: seed, ...layers },
      Effect.scoped(
        Effect.gen(function* () {
          const handles = yield* (yield* Topup).resumePending;
          const first = handles[0];
          if (first === undefined) throw new Error("no pending topup resumed");
          const receipt = yield* first.result;
          // The counter must be past the minted slots, or this collides.
          const sent = yield* (yield* Send).send(
            new SendDraft({
              mint: mintUrl,
              amount: Amount.make(8),
              produceAs: "issued",
            }),
          );
          return { resumed: handles.length, receipt, sent };
        }),
      ),
    );

    expect(resumed).toBe(1);
    expect(receipt.quoteId).toBe(quote.quoteId);
    expect(receipt.amount).toBe(64);
    expect(sent.amount).toBe(8);

    // The record is gone and the funds are rows, not a dangling quote.
    expect(
      await Effect.runPromise(kv.listKeys(PENDING_TOPUP_KEY_PREFIX)),
    ).toEqual([]);
    const accepted = (await Effect.runPromise(tokens.loadAll)).filter(
      (row) => row.state === "accepted",
    );
    expect(accepted.length).toBeGreaterThan(0);
  });

  it("resumes the same quote rather than minting it twice", async () => {
    const seed = randomSeed();
    const { kv, tokens, layers } = durableStorage();

    const quote = await runLinkshu(
      { bip39Seed: seed, ...layers },
      Effect.scoped(
        Effect.map(
          Effect.flatMap(Topup, (topup) =>
            topup.start(
              new TopupDraft({ mint: mintUrl, amount: Amount.make(16) }),
            ),
          ),
          (handle) => handle.quote,
        ),
      ),
    );

    const resumeOnce = () =>
      runLinkshu(
        { bip39Seed: seed, ...layers },
        Effect.scoped(
          Effect.gen(function* () {
            const handles = yield* (yield* Topup).resumePending;
            const first = handles[0];
            return first === undefined ? null : yield* first.result;
          }),
        ),
      );

    const first = await resumeOnce();
    expect(first?.quoteId).toBe(quote.quoteId);
    expect(first?.amount).toBe(16);

    // The record is cleared, so a second resume has nothing left to claim and
    // the 16 sats stay a single row.
    expect(await resumeOnce()).toBeNull();
    expect(
      await Effect.runPromise(kv.listKeys(PENDING_TOPUP_KEY_PREFIX)),
    ).toEqual([]);
    expect(await Effect.runPromise(tokens.loadAll)).toHaveLength(1);
  });
});
