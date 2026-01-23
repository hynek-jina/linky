import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "./utils/cashuDeterministic";
import { getCashuLib } from "./utils/cashuLib";

type CashuPayResult = {
  ok: true;
  mint: string;
  unit: string | null;
  paidAmount: number;
  feeReserve: number;
  // Actual fee charged by the mint (may be 0 even if feeReserve > 0).
  feePaid: number;
  remainingAmount: number;
  remainingToken: string | null;
};

type CashuPayErrorResult = {
  ok: false;
  mint: string;
  unit: string | null;
  paidAmount: number;
  feeReserve: number;
  feePaid: number;
  // If we already swapped, this token should represent the user's funds.
  remainingAmount: number;
  remainingToken: string | null;
  error: string;
};

type Proof = {
  amount: number;
  secret: string;
  C: string;
  id: string;
};

const getProofAmountSum = (proofs: Array<{ amount: number }>) =>
  proofs.reduce((sum, proof) => sum + proof.amount, 0);

export const meltInvoiceWithTokensAtMint = async (args: {
  invoice: string;
  mint: string;
  tokens: string[];
  unit?: string | null;
}): Promise<CashuPayResult | CashuPayErrorResult> => {
  const { invoice, mint, tokens, unit } = args;
  const { CashuMint, CashuWallet, getDecodedToken, getEncodedToken } =
    await getCashuLib();

  const det = getCashuDeterministicSeedFromStorage();

  const allProofs: Proof[] = [];

  try {
    for (const tokenText of tokens) {
      const decoded = getDecodedToken(tokenText);
      if (!decoded?.mint) throw new Error("Token mint missing");
      if (decoded.mint !== mint) throw new Error("Mixed mints not supported");
      for (const proof of decoded.proofs ?? []) {
        allProofs.push({
          amount: Number(proof.amount ?? 0),
          secret: proof.secret,
          C: proof.C,
          id: proof.id,
        });
      }
    }
  } catch (e) {
    return {
      ok: false,
      mint,
      unit: unit ?? null,
      paidAmount: 0,
      feeReserve: 0,
      feePaid: 0,
      remainingAmount: 0,
      remainingToken: null,
      error: String(e ?? "decode failed"),
    };
  }

  const wallet = new CashuWallet(new CashuMint(mint), {
    ...(unit ? { unit } : {}),
    ...(det ? { bip39seed: det.bip39seed } : {}),
  });

  const isOutputsAlreadySignedError = (e: unknown): boolean => {
    const m = String(e ?? "").toLowerCase();
    return (
      m.includes("outputs have already been signed") ||
      m.includes("already been signed before") ||
      m.includes("keyset id already signed")
    );
  };

  try {
    await wallet.loadMint();

    const walletUnit = wallet.unit;
    const keysetId = wallet.keysetId;

    const quote = await wallet.createMeltQuote(invoice);
    const paidAmount = quote.amount ?? 0;
    const feeReserve = quote.fee_reserve ?? 0;
    const total = paidAmount + feeReserve;

    const have = getProofAmountSum(allProofs);
    if (have < total) {
      return {
        ok: false,
        mint,
        unit: unit ?? null,
        paidAmount,
        feeReserve,
        feePaid: 0,
        remainingAmount: have,
        remainingToken: null,
        error: `Insufficient funds (need ${total}, have ${have})`,
      };
    }

    const run = async () => {
      const counter0 = det
        ? getCashuDeterministicCounter({
            mintUrl: mint,
            unit: walletUnit,
            keysetId,
          })
        : undefined;

      // Swap to get exact proofs for amount+fees; returns keep+send proofs.
      const swapOnce = async (counter: number) =>
        await wallet.swap(total, allProofs, { counter });

      let swapped: any;
      let lastError: unknown;
      if (typeof counter0 === "number") {
        let counter = counter0;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try {
            swapped = await swapOnce(counter);
            lastError = null;
            break;
          } catch (e) {
            lastError = e;
            if (!isOutputsAlreadySignedError(e) || !det) throw e;
            bumpCashuDeterministicCounter({
              mintUrl: mint,
              unit: walletUnit,
              keysetId,
              used: 64,
            });
            counter = getCashuDeterministicCounter({
              mintUrl: mint,
              unit: walletUnit,
              keysetId,
            });
          }
        }
        if (!swapped) throw lastError ?? new Error("swap failed");
      } else {
        swapped = await wallet.swap(total, allProofs);
      }

      const keepLen = Array.isArray(swapped.keep) ? swapped.keep.length : 0;
      const sendLen = Array.isArray(swapped.send) ? swapped.send.length : 0;
      const counterAfterSwap = det
        ? bumpCashuDeterministicCounter({
            mintUrl: mint,
            unit: walletUnit,
            keysetId,
            used: keepLen + sendLen,
          })
        : undefined;

      // If anything fails after this point, old proofs may already be invalid.
      // So we prepare a "recovery" token from the swapped proofs.
      const recoveryProofs = [...(swapped.keep ?? []), ...(swapped.send ?? [])];
      const recoveryAmount = getProofAmountSum(recoveryProofs);
      const recoveryToken =
        recoveryProofs.length > 0
          ? getEncodedToken({
              mint,
              proofs: recoveryProofs,
              unit: walletUnit,
            })
          : null;

      let melt:
        | {
            change?: Proof[];
            fee_paid?: unknown;
            feePaid?: unknown;
            fee?: unknown;
          }
        | (Record<string, unknown> & { change?: Proof[] })
        | null = null;

      try {
        const meltOnce = async (counter: number) =>
          (await wallet.meltProofs(quote, swapped.send, { counter })) as any;

        if (typeof counterAfterSwap === "number") {
          let counter = counterAfterSwap;
          let lastError: unknown;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
              melt = await meltOnce(counter);
              lastError = null;
              break;
            } catch (e) {
              lastError = e;
              if (!isOutputsAlreadySignedError(e) || !det) throw e;
              bumpCashuDeterministicCounter({
                mintUrl: mint,
                unit: walletUnit,
                keysetId,
                used: 64,
              });
              counter = getCashuDeterministicCounter({
                mintUrl: mint,
                unit: walletUnit,
                keysetId,
              });
            }
          }
          if (!melt) throw lastError ?? new Error("melt failed");
        } else {
          melt = (await wallet.meltProofs(quote, swapped.send)) as any;
        }
      } catch (e) {
        return {
          ok: false as const,
          mint,
          unit: unit ?? null,
          paidAmount,
          feeReserve,
          feePaid: 0,
          remainingAmount: recoveryAmount,
          remainingToken: recoveryToken,
          error: String(e ?? "melt failed"),
        };
      }

      if (det) {
        bumpCashuDeterministicCounter({
          mintUrl: mint,
          unit: walletUnit,
          keysetId,
          used: Array.isArray(melt?.change) ? melt.change.length : 0,
        });
      }

      const feePaid = (() => {
        const m = (melt ?? {}) as Record<string, unknown>;
        const raw =
          (m.fee_paid as unknown) ??
          (m.feePaid as unknown) ??
          (m.fee as unknown) ??
          0;
        const n = Number(raw ?? 0);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
      })();

      const remainingProofs = [
        ...(swapped.keep ?? []),
        ...(melt?.change ?? []),
      ];
      const remainingAmount = getProofAmountSum(remainingProofs);

      const remainingToken =
        remainingProofs.length > 0
          ? getEncodedToken({
              mint,
              proofs: remainingProofs,
              unit: walletUnit,
            })
          : null;

      return {
        ok: true as const,
        mint,
        unit: walletUnit,
        paidAmount,
        feeReserve,
        feePaid,
        remainingAmount,
        remainingToken,
      };
    };

    return det
      ? await withCashuDeterministicCounterLock(
          { mintUrl: mint, unit: walletUnit, keysetId },
          run,
        )
      : await run();
  } catch (e) {
    return {
      ok: false,
      mint,
      unit: unit ?? null,
      paidAmount: 0,
      feeReserve: 0,
      feePaid: 0,
      remainingAmount: getProofAmountSum(allProofs),
      remainingToken: null,
      error: String(e ?? "melt failed"),
    };
  }
};
