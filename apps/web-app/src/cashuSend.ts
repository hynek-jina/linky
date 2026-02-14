import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "./utils/cashuDeterministic";
import type { Proof, ProofState, SendResponse } from "@cashu/cashu-ts";
import { getCashuLib } from "./utils/cashuLib";
import { getUnknownErrorMessage } from "./utils/unknown";

const getProofAmountSum = (proofs: Array<{ amount: number }>) =>
  proofs.reduce((sum, proof) => sum + proof.amount, 0);

export type CashuSendResult =
  | {
      ok: true;
      mint: string;
      remainingAmount: number;
      remainingToken: string | null;
      sendAmount: number;
      sendToken: string;
      unit: string | null;
    }
  | {
      ok: false;
      error: string;
      mint: string;
      remainingAmount: number;
      remainingToken: string | null;
      sendAmount: number;
      unit: string | null;
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
      error: getUnknownErrorMessage(e, "decode failed"),
    };
  }

  const wallet = new CashuWallet(new CashuMint(mint), {
    ...(unit ? { unit } : {}),
    ...(det ? { bip39seed: det.bip39seed } : {}),
  });

  const isOutputsAlreadySignedError = (e: unknown): boolean => {
    const m = getUnknownErrorMessage(e, "").toLowerCase();
    return (
      m.includes("outputs have already been signed") ||
      m.includes("already been signed before") ||
      m.includes("keyset id already signed")
    );
  };

  let spendableProofs = allProofs;
  try {
    await wallet.loadMint();

    const walletUnit = wallet.unit;
    const keysetId = wallet.keysetId;

    try {
      // Ignore already-spent proofs so stale local token rows do not block send.
      const states = await wallet.checkProofsStates(allProofs);
      const asArray: ProofState[] = Array.isArray(states) ? states : [];
      const filtered = allProofs.filter((_, idx) => {
        const state = String(asArray[idx]?.state ?? "").trim();
        return state === "UNSPENT";
      });
      if (filtered.length > 0) {
        spendableProofs = filtered;
      }
    } catch {
      // Keep previous behavior if state checks are unavailable.
    }

    const have = getProofAmountSum(spendableProofs);
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
              await wallet.swap(sendAmount, spendableProofs, { counter });

            let counter = counter0;
            let swapped: SendResponse | null = null;
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

            const keepLen = swapped.keep.length;
            const sendLen = swapped.send.length;
            bumpCashuDeterministicCounter({
              mintUrl: mint,
              unit: walletUnit,
              keysetId,
              used: keepLen + sendLen,
            });

            return swapped;
          },
        )
      : wallet.swap(sendAmount, spendableProofs));

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

    try {
      const denomSummary = (proofs: Proof[]) =>
        proofs.reduce<Record<string, number>>((acc, p) => {
          const amt = Number(p.amount ?? 0) || 0;
          if (amt > 0) acc[String(amt)] = (acc[String(amt)] ?? 0) + 1;
          return acc;
        }, {});
      console.log("[linky][pay] swap-denoms", {
        mint,
        send: denomSummary(sendProofs),
        keep: denomSummary(remainingProofs),
      });
    } catch {
      // ignore logging errors
    }

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
      remainingAmount: getProofAmountSum(spendableProofs),
      remainingToken: null,
      error: getUnknownErrorMessage(e, "swap failed"),
    };
  }
};
