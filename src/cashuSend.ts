import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "./utils/cashuDeterministic";
import { getCashuLib } from "./utils/cashuLib";

type Proof = {
  amount: number;
  secret: string;
  C: string;
  id: string;
};

const getProofAmountSum = (proofs: Array<{ amount: number }>) =>
  proofs.reduce((sum, proof) => sum + proof.amount, 0);

export type CashuSendResult =
  | {
      ok: true;
      mint: string;
      unit: string | null;
      sendAmount: number;
      sendToken: string;
      remainingAmount: number;
      remainingToken: string | null;
    }
  | {
      ok: false;
      mint: string;
      unit: string | null;
      sendAmount: number;
      remainingAmount: number;
      remainingToken: string | null;
      error: string;
    };

export const createSendTokenWithTokensAtMint = async (args: {
  amount: number;
  mint: string;
  tokens: string[];
  unit?: string | null;
}): Promise<CashuSendResult> => {
  const { amount, mint, tokens, unit } = args;

  const sendAmount = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  if (sendAmount <= 0) {
    return {
      ok: false,
      mint,
      unit: unit ?? null,
      sendAmount,
      remainingAmount: 0,
      remainingToken: null,
      error: "invalid amount",
    };
  }

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
      sendAmount,
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

    const have = getProofAmountSum(allProofs);
    if (have < sendAmount) {
      return {
        ok: false,
        mint,
        unit: unit ?? null,
        sendAmount,
        remainingAmount: have,
        remainingToken: null,
        error: `Insufficient funds (need ${sendAmount}, have ${have})`,
      };
    }

    const swapped = await (det
      ? withCashuDeterministicCounterLock(
          { mintUrl: mint, unit: walletUnit, keysetId },
          async () => {
            const counter0 = getCashuDeterministicCounter({
              mintUrl: mint,
              unit: walletUnit,
              keysetId,
            });

            const swapOnce = async (counter: number) =>
              await wallet.swap(sendAmount, allProofs, { counter });

            let counter = counter0;
            let swapped: { keep?: unknown[]; send?: unknown[] } | undefined;
            let lastError: unknown;
            for (let attempt = 0; attempt < 5; attempt += 1) {
              try {
                swapped = await swapOnce(counter);
                lastError = null;
                break;
              } catch (e) {
                lastError = e;
                if (!isOutputsAlreadySignedError(e)) throw e;
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

            const keepLen = Array.isArray(swapped.keep)
              ? swapped.keep.length
              : 0;
            const sendLen = Array.isArray(swapped.send)
              ? swapped.send.length
              : 0;
            bumpCashuDeterministicCounter({
              mintUrl: mint,
              unit: walletUnit,
              keysetId,
              used: keepLen + sendLen,
            });

            return swapped as any;
          },
        )
      : wallet.swap(sendAmount, allProofs));

    // Recovery: if the caller fails after swap, this token should represent
    // the user's full funds (keep + send).
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

    const sendProofs = swapped.send ?? [];
    const sendToken =
      sendProofs.length > 0
        ? getEncodedToken({
            mint,
            proofs: sendProofs,
            unit: walletUnit,
          })
        : null;

    if (!sendToken) {
      return {
        ok: false,
        mint,
        unit: walletUnit,
        sendAmount,
        remainingAmount: recoveryAmount,
        remainingToken: recoveryToken,
        error: "swap produced empty send token",
      };
    }

    const remainingProofs = swapped.keep ?? [];
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
      ok: true,
      mint,
      unit: walletUnit,
      sendAmount,
      sendToken,
      remainingAmount,
      remainingToken,
    };
  } catch (e) {
    return {
      ok: false,
      mint,
      unit: unit ?? null,
      sendAmount,
      remainingAmount: getProofAmountSum(allProofs),
      remainingToken: null,
      error: String(e ?? "swap failed"),
    };
  }
};
