import { Effect } from "effect";
import {
  Amount,
  Autoswap,
  AutoswapDraft,
  Bolt11Invoice,
  CurrencyUnit,
  KeysetId,
  QuoteId,
  Receive,
  ReceiveDraft,
  runLinkshu,
  UnixSeconds,
} from "../../src";
import type { KeyValueStoreService } from "../../src";
import {
  PENDING_AUTOSWAP_CLAIM_KEY_PREFIX,
  PendingAutoswapClaim,
  pendingClaims,
} from "../../src/autoswap/internal/pendingClaim";
import {
  acceptedTotalOf,
  durableStorage,
  fundToken,
  loadMintWallet,
  mintUrl,
  randomSeed,
} from "./helpers";

// The dev stack runs a single mint, so source and target are the same url: the
// FakeWallet backend pays the target's mint-quote invoice out of the source's
// melt, which is the shape of the cross-mint flow the app performs.

const pendingKeys = (kv: KeyValueStoreService) =>
  Effect.runPromise(kv.listKeys(PENDING_AUTOSWAP_CLAIM_KEY_PREFIX));

describe("autoswap against the local mint", () => {
  it("moves a mint's balance through a melt into one claimed row", async () => {
    const { kv, tokens, layers } = durableStorage();
    const funded = await fundToken(256);

    const receipt = await runLinkshu(
      { bip39Seed: randomSeed(), ...layers },
      Effect.gen(function* () {
        yield* (yield* Receive).receive(new ReceiveDraft({ text: funded }));
        return yield* (yield* Autoswap).claim(
          new AutoswapDraft({ sourceMint: mintUrl, targetMint: mintUrl }),
        );
      }),
    );

    expect(receipt.sourceMint).toBe(mintUrl);
    expect(receipt.targetMint).toBe(mintUrl);
    expect(receipt.movedAmount).toBeGreaterThan(0);

    const rows = await Effect.runPromise(tokens.loadAll);
    const claimed = rows.find((row) => row.id === receipt.rowId);
    expect(claimed?.state).toBe("accepted");

    // Everything that survived the swap is balance, and the fees it cost stay
    // small: the mint charges a Lightning reserve plus input_fee_ppk = 100.
    const accepted = acceptedTotalOf(rows);
    expect(accepted).toBeGreaterThanOrEqual(receipt.movedAmount);
    expect(256 - accepted).toBeLessThanOrEqual(16);
    expect(await pendingKeys(kv)).toEqual([]);
  });

  it("claims a pending record left behind by an interrupted run, exactly once", async () => {
    const seed = randomSeed();
    const { kv, tokens, layers } = durableStorage();

    // The state an interrupted claim leaves: the invoice is settled at the
    // mint (the FakeWallet backend pays its own quotes) and the record names
    // the quote to mint against, but no run ever minted it.
    const wallet = await loadMintWallet();
    const quote = await wallet.createMintQuoteBolt11(64);
    await Effect.runPromise(
      pendingClaims.write(
        kv,
        new PendingAutoswapClaim({
          quoteId: QuoteId.make(quote.quote),
          mint: mintUrl,
          unit: CurrencyUnit.make("sat"),
          keysetId: KeysetId.make(wallet.keysetId),
          amount: Amount.make(64),
          invoice: Bolt11Invoice.make(quote.request),
          sourceMint: mintUrl,
          createdAt: UnixSeconds.make(Math.floor(Date.now() / 1000)),
          mintCounter: null,
        }),
      ),
    );

    const resumeOnce = () =>
      runLinkshu(
        { bip39Seed: seed, ...layers },
        Effect.flatMap(Autoswap, (autoswap) => autoswap.resumePendingClaims),
      );

    const first = await resumeOnce();
    expect(first).toHaveLength(1);
    expect(first[0].status).toBe("claimed");
    expect(first[0].amount).toBe(64);
    expect(await pendingKeys(kv)).toEqual([]);

    // The record is cleared, so a second pass has nothing left to claim and
    // the 64 sats stay a single row.
    expect(await resumeOnce()).toEqual([]);
    const rows = await Effect.runPromise(tokens.loadAll);
    expect(rows).toHaveLength(1);
    expect(acceptedTotalOf(rows)).toBe(64);
  });
});
