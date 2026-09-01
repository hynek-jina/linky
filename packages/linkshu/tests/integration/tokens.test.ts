import { Mint, Wallet, getEncodedToken } from "@cashu/cashu-ts";
import { Effect } from "effect";
import {
  Bip39Seed,
  MintUrl,
  Receive,
  ReceiveDraft,
  TokenStore,
  Tokens,
  runLinkshu,
} from "../../src";
import type { Bip39Seed as Bip39SeedType } from "../../src";

// The dev-stack Nutshell FakeWallet mint (docker-compose.dev.yml `cashu-mint`).
const mintUrl = MintUrl.make(
  process.env.LINKSHU_MINT_URL ?? "http://localhost:3338",
);

// Fresh seed per run: deterministic counters live at the mint, so a reused
// seed would start every run inside an already-signed counter range.
const randomSeed = (): Bip39SeedType =>
  Bip39Seed.make(crypto.getRandomValues(new Uint8Array(64)));

/** Mints fresh sats via a bolt11 quote the FakeWallet backend auto-settles. */
const fundToken = async (amountSat: number): Promise<string> => {
  const wallet = new Wallet(new Mint(mintUrl), { unit: "sat" });
  await wallet.loadMint();
  const quote = await wallet.createMintQuoteBolt11(amountSat);
  const proofs = await wallet.mintProofsBolt11(amountSat, quote, undefined, {
    type: "random",
  });
  return getEncodedToken({ mint: mintUrl, unit: "sat", proofs });
};

/** Somebody else claims the token: its proofs are spent at the mint. */
const claimExternally = async (tokenText: string): Promise<void> => {
  const wallet = new Wallet(new Mint(mintUrl), { unit: "sat" });
  await wallet.loadMint();
  await wallet.receive(tokenText, undefined, { type: "random" });
};

describe("tokens vertical against the local mint", () => {
  it("returns an issued token to the wallet, killing the issued encoding", async () => {
    const funded = await fundToken(64);

    const { issued, returned, listed, rows, balances } = await runLinkshu(
      { bip39Seed: randomSeed() },
      Effect.gen(function* () {
        const tokens = yield* Tokens;
        const issued = yield* (yield* Receive).receive(
          new ReceiveDraft({ text: funded }),
        );
        yield* tokens.markIssued(issued.rowId);

        const returned = yield* tokens.returnToWallet(issued.rowId);
        return {
          issued,
          returned,
          listed: yield* tokens.list,
          rows: yield* (yield* TokenStore).loadAll,
          balances: yield* tokens.balances,
        };
      }),
    );

    // Fresh proofs on a fresh row; the mint's input fee is the difference.
    expect(returned.rowId).not.toBe(issued.rowId);
    expect(returned.amount).toBeLessThanOrEqual(issued.amount);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: returned.rowId, state: "accepted" });
    expect(balances.total).toBe(returned.amount);
    expect(
      listed.map((token) => [token.id, token.state, token.amount]),
    ).toEqual([[returned.rowId, "accepted", returned.amount]]);

    // The encoding that was handed out is dead at the mint.
    await expect(claimExternally(issued.tokenText)).rejects.toThrow();
  });

  it("deletes a row the mint reports spent and keeps the live one", async () => {
    const claimed = await fundToken(12);
    const kept = await fundToken(20);

    const { deleted, spentRowId, keptRowId, rows } = await runLinkshu(
      { bip39Seed: randomSeed() },
      Effect.gen(function* () {
        const receive = yield* Receive;
        const tokens = yield* Tokens;
        const spent = yield* receive.receive(
          new ReceiveDraft({ text: claimed }),
        );
        const live = yield* receive.receive(new ReceiveDraft({ text: kept }));

        // Nothing is spent yet: a sweep must not touch either row.
        expect(yield* tokens.deleteSpent).toEqual([]);

        yield* Effect.promise(() => claimExternally(spent.tokenText));

        return {
          deleted: yield* tokens.deleteSpent,
          spentRowId: spent.rowId,
          keptRowId: live.rowId,
          rows: yield* (yield* TokenStore).loadAll,
        };
      }),
    );

    expect(deleted.map((token) => token.rowId)).toEqual([spentRowId]);
    expect(rows.map((row) => row.id)).toEqual([keptRowId]);
    expect(rows[0].state).toBe("accepted");
  });
});
