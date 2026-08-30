import { Effect, Layer } from "effect";
import {
  Amount,
  Bip39Seed,
  FeeProbe,
  FeeProbeDraft,
  KeyValueStore,
  makeInMemoryKeyValueStore,
  MintUrl,
  runLinkshu,
} from "../../src";
import type { Bip39Seed as Bip39SeedType } from "../../src";
import { FEE_PROBE_CACHE_KEY_PREFIX } from "../../src/feeProbe/internal/feeProbeCache";

// The dev stack runs a single mint, so it plays both roles: it issues the
// probe invoice and prices melting against it. Nothing pays the invoice.
const mintUrl = MintUrl.make(
  process.env.LINKSHU_MINT_URL ?? "http://localhost:3338",
);

const randomSeed = (): Bip39SeedType =>
  Bip39Seed.make(crypto.getRandomValues(new Uint8Array(64)));

const draft = new FeeProbeDraft({
  mint: mintUrl,
  probeMint: mintUrl,
  amount: Amount.make(1_000),
});

describe("fee probe against the local mint", () => {
  it("reads a fee reserve from a real melt quote and caches it", async () => {
    const kv = makeInMemoryKeyValueStore();
    const layers = { keyValueStore: Layer.succeed(KeyValueStore, kv) };

    const first = await runLinkshu(
      { bip39Seed: randomSeed(), ...layers },
      Effect.flatMap(FeeProbe, (probe) => probe.probeLightningFee(draft)),
    );

    expect(first.mint).toBe(mintUrl);
    expect(first.probeMint).toBe(mintUrl);
    expect(first.amount).toBeGreaterThan(0);
    expect(first.feeReserve).toBeGreaterThanOrEqual(0);
    expect(first.percent).toBeCloseTo((first.feeReserve / first.amount) * 100);

    expect(
      await Effect.runPromise(kv.listKeys(FEE_PROBE_CACHE_KEY_PREFIX)),
    ).toHaveLength(1);

    // A second runtime over the same storage answers from the cache.
    const second = await runLinkshu(
      { bip39Seed: randomSeed(), ...layers },
      Effect.flatMap(FeeProbe, (probe) => probe.probeLightningFee(draft)),
    );
    expect(second).toEqual(first);
  });

  it("fails with a typed error when the probed mint does not exist", async () => {
    const failure = await runLinkshu(
      { bip39Seed: randomSeed() },
      Effect.flip(
        Effect.flatMap(FeeProbe, (probe) =>
          probe.probeLightningFee(
            new FeeProbeDraft({
              mint: mintUrl,
              probeMint: MintUrl.make("http://localhost:3339"),
            }),
          ),
        ),
      ),
    );

    expect(["MintUnreachable", "MintRejected"]).toContain(failure._tag);
  });
});
