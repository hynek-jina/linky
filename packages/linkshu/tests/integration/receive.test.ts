import { Mint, Wallet, getEncodedToken } from "@cashu/cashu-ts";
import { Effect } from "effect";
import {
  Bip39Seed,
  MintUrl,
  Receive,
  ReceiveDraft,
  TokenStore,
  parseTokenText,
  runLinkshu,
} from "../../src";
import type { Bip39Seed as Bip39SeedType } from "../../src";

// The dev-stack Nutshell FakeWallet mint (docker-compose.dev.yml `cashu-mint`).
const mintUrl = MintUrl.make(
  process.env.LINKSHU_MINT_URL ?? "http://localhost:3338",
);

// The local mint charges input_fee_ppk=100 on purpose (see CLAUDE.md).
const INPUT_FEE_PPK = 100;
const inputFee = (proofCount: number): number =>
  Math.ceil((proofCount * INPUT_FEE_PPK) / 1000);

// Fresh seed per run: deterministic counters live at the mint, so a reused
// seed would start every run inside an already-signed counter range.
const randomSeed = (): Bip39SeedType =>
  Bip39Seed.make(crypto.getRandomValues(new Uint8Array(64)));

/** Mints fresh sats via a bolt11 quote the FakeWallet backend auto-settles. */
const fundToken = async (
  amountSat: number,
): Promise<{ token: string; proofCount: number }> => {
  const wallet = new Wallet(new Mint(mintUrl), { unit: "sat" });
  await wallet.loadMint();
  const quote = await wallet.createMintQuoteBolt11(amountSat);
  const proofs = await wallet.mintProofsBolt11(amountSat, quote, undefined, {
    type: "random",
  });
  const token = getEncodedToken({ mint: mintUrl, unit: "sat", proofs });
  return { token, proofCount: proofs.length };
};

const receiveOnce = (seed: Bip39SeedType, text: string) =>
  runLinkshu(
    { bip39Seed: seed },
    Effect.gen(function* () {
      const receive = yield* Receive;
      const receipt = yield* receive.receive(new ReceiveDraft({ text }));
      const rows = yield* (yield* TokenStore).loadAll;
      return { receipt, rows };
    }),
  );

describe("receive vertical against the local mint", () => {
  it("accepts a funded token into an accepted row, net of the mint's input fee", async () => {
    const { token, proofCount } = await fundToken(10);
    const { receipt, rows } = await receiveOnce(randomSeed(), token);

    expect(receipt.mint).toBe(mintUrl);
    expect(receipt.unit).toBe("sat");
    expect(receipt.amount).toBe(10 - inputFee(proofCount));

    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("accepted");
    expect(rows[0].error).toBeNull();
    expect(rows[0].originalTokenText).toBe(token);
    expect(rows[0].tokenText).toBe(receipt.tokenText);
    expect(rows[0].tokenText).not.toBe(token);
    expect(parseTokenText(receipt.tokenText)?.amount).toBe(receipt.amount);
  });

  it("recovers a deliberately stale counter and still accepts", async () => {
    const seed = randomSeed();
    const first = await fundToken(8);
    const second = await fundToken(8);

    const run1 = await receiveOnce(seed, first.token);
    expect(run1.receipt.amount).toBe(8 - inputFee(first.proofCount));

    // A fresh runtime forgets the counter (in-memory KV): the second receive
    // re-derives outputs the mint already signed and must recover via the
    // restore-window scan.
    const run2 = await receiveOnce(seed, second.token);
    expect(run2.receipt.amount).toBe(8 - inputFee(second.proofCount));
    expect(run2.rows).toHaveLength(1);
    expect(run2.rows[0].state).toBe("accepted");
    expect(run2.receipt.tokenText).not.toBe(run1.receipt.tokenText);
  });

  it("dedupes a second receive of the same token text", async () => {
    const { token } = await fundToken(4);

    const { first, second, rows } = await runLinkshu(
      { bip39Seed: randomSeed() },
      Effect.gen(function* () {
        const receive = yield* Receive;
        const firstReceipt = yield* receive.receive(
          new ReceiveDraft({ text: token }),
        );
        const secondError = yield* Effect.flip(
          receive.receive(new ReceiveDraft({ text: token })),
        );
        return {
          first: firstReceipt,
          second: secondError,
          rows: yield* (yield* TokenStore).loadAll,
        };
      }),
    );

    expect(second).toMatchObject({
      _tag: "TokenAlreadyKnown",
      rowId: first.rowId,
    });
    expect(rows).toHaveLength(1);
  });

  it("persists a spent token as a typed error row", async () => {
    const { token } = await fundToken(4);
    await receiveOnce(randomSeed(), token);

    // A different wallet re-receiving the original text: its inputs are now
    // spent, a definitive rejection that must persist as an error row.
    const { error, rows } = await runLinkshu(
      { bip39Seed: randomSeed() },
      Effect.gen(function* () {
        const receive = yield* Receive;
        const failure = yield* Effect.flip(
          receive.receive(new ReceiveDraft({ text: token })),
        );
        return { error: failure, rows: yield* (yield* TokenStore).loadAll };
      }),
    );

    expect(error).toMatchObject({ _tag: "TokenAlreadySpent", mint: mintUrl });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("error");
    expect(JSON.parse(rows[0].error ?? "")).toMatchObject({
      _tag: "TokenAlreadySpent",
    });
  });
});
