import { Mint, Wallet, getEncodedToken } from "@cashu/cashu-ts";
import { Effect } from "effect";
import {
  Amount,
  Bip39Seed,
  MintUrl,
  NewTokenRow,
  Receive,
  ReceiveDraft,
  Send,
  SendDraft,
  TokenStore,
  TokenText,
  decodeTokenText,
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
const fundToken = async (amountSat: number): Promise<string> => {
  const wallet = new Wallet(new Mint(mintUrl), { unit: "sat" });
  await wallet.loadMint();
  const quote = await wallet.createMintQuoteBolt11(amountSat);
  const proofs = await wallet.mintProofsBolt11(amountSat, quote, undefined, {
    type: "random",
  });
  return getEncodedToken({ mint: mintUrl, unit: "sat", proofs });
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

describe("send vertical against the local mint", () => {
  it("sends an amount as a token another wallet can receive, keeping change", async () => {
    const funded = await fundToken(20);

    // Wallet A funds itself and sends 5 in one runtime (in-memory stores).
    const a = await runLinkshu(
      { bip39Seed: randomSeed() },
      Effect.gen(function* () {
        const receive = yield* Receive;
        const send = yield* Send;
        const funding = yield* receive.receive(
          new ReceiveDraft({ text: funded }),
        );
        const receipt = yield* send.send(
          new SendDraft({
            mint: mintUrl,
            amount: Amount.make(5),
            produceAs: "issued",
          }),
        );
        return { funding, receipt, rows: yield* (yield* TokenStore).loadAll };
      }),
    );

    expect(a.receipt.mint).toBe(mintUrl);
    expect(a.receipt.unit).toBe("sat");
    expect(a.receipt.amount).toBe(5);
    // Nothing leaks: funding = sent + kept change + swap fee.
    expect(a.funding.amount).toBe(
      5 + a.receipt.changeAmount + a.receipt.feePaid,
    );
    expect(parseTokenText(a.receipt.tokenText)?.amount).toBe(5);

    // The funding row is gone; change is an accepted row, the send is issued.
    const issued = a.rows.find((row) => row.state === "issued");
    expect(issued?.id).toBe(a.receipt.rowId);
    expect(issued?.tokenText).toBe(a.receipt.tokenText);
    const accepted = a.rows.filter((row) => row.state === "accepted");
    if (a.receipt.changeAmount > 0) {
      expect(accepted).toHaveLength(1);
      expect(parseTokenText(accepted[0].tokenText)?.amount).toBe(
        a.receipt.changeAmount,
      );
    } else {
      expect(accepted).toHaveLength(0);
    }
    expect(a.rows.some((row) => row.originalTokenText === funded)).toBe(false);

    // Wallet B (separate seed and storage) receives the produced token. The
    // mint uses v2 keyset ids, so decoding the v4 token needs the keyset list.
    const keysetIds = (await new Mint(mintUrl).getKeySets()).keysets.map(
      (keyset) => keyset.id,
    );
    const sendProofCount = decodeTokenText(a.receipt.tokenText, keysetIds)
      ?.proofs.length;
    expect(sendProofCount).toBeGreaterThan(0);
    const b = await receiveOnce(randomSeed(), a.receipt.tokenText);
    expect(b.receipt.amount).toBe(5 - inputFee(sendProofCount ?? 0));
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0].state).toBe("accepted");
  });

  it("fails with typed InsufficientFunds both before and at the mint", async () => {
    const funded = await fundToken(8);

    const { funding, beyondBalance, exactBalance } = await runLinkshu(
      { bip39Seed: randomSeed() },
      Effect.gen(function* () {
        const receive = yield* Receive;
        const send = yield* Send;
        const funding = yield* receive.receive(
          new ReceiveDraft({ text: funded }),
        );
        const draftFor = (amount: number) =>
          new SendDraft({
            mint: mintUrl,
            amount: Amount.make(amount),
            produceAs: "issued",
          });
        // More than the balance: rejected locally before any mint call.
        const beyondBalance = yield* Effect.flip(
          send.send(draftFor(funding.amount + 1)),
        );
        // Exactly the balance: the swap fee cannot be covered, so the mint
        // library reports the shortfall.
        const exactBalance = yield* Effect.flip(
          send.send(draftFor(funding.amount)),
        );
        return { funding, beyondBalance, exactBalance };
      }),
    );

    expect(beyondBalance).toMatchObject({
      _tag: "InsufficientFunds",
      mint: mintUrl,
      required: funding.amount + 1,
      available: funding.amount,
    });
    expect(exactBalance).toMatchObject({
      _tag: "InsufficientFunds",
      mint: mintUrl,
      available: funding.amount,
    });
  });

  it("excludes NUT-07 spent rows before sending and marks them error", async () => {
    // A token another wallet already claimed: its proofs are spent at the mint.
    const spentToken = await fundToken(4);
    await receiveOnce(randomSeed(), spentToken);

    const funded = await fundToken(10);
    const { funding, receipt, rows } = await runLinkshu(
      { bip39Seed: randomSeed() },
      Effect.gen(function* () {
        const receive = yield* Receive;
        const send = yield* Send;
        const tokenStore = yield* TokenStore;
        const funding = yield* receive.receive(
          new ReceiveDraft({ text: funded }),
        );
        // A stale accepted row pointing at the spent proofs (e.g. state
        // synced from a device that missed the spend).
        yield* tokenStore.insert(
          new NewTokenRow({
            originalTokenText: TokenText.make(spentToken),
            tokenText: TokenText.make(spentToken),
            state: "accepted",
            error: null,
          }),
        );
        const receipt = yield* send.send(
          new SendDraft({
            mint: mintUrl,
            amount: Amount.make(3),
            produceAs: "pending",
          }),
        );
        return { funding, receipt, rows: yield* tokenStore.loadAll };
      }),
    );

    // The send succeeded from the live row alone.
    expect(receipt.amount).toBe(3);
    expect(funding.amount).toBe(3 + receipt.changeAmount + receipt.feePaid);

    const staleRow = rows.find((row) => row.tokenText === spentToken);
    expect(staleRow?.state).toBe("error");
    expect(JSON.parse(staleRow?.error ?? "")).toMatchObject({
      _tag: "TokenAlreadySpent",
      mint: mintUrl,
    });
    expect(rows.find((row) => row.id === receipt.rowId)?.state).toBe("pending");
  });
});
