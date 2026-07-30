import type { Proof, ProofState, SendResponse } from "@cashu/cashu-ts";
import {
  bumpCashuDeterministicCounter,
  CASHU_DETERMINISTIC_OUTPUT_BLOCK_SIZE,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  getCashuSwapCounterUsage,
  getCashuSwapOutputCounters,
  withCashuDeterministicCounterLock,
} from "./utils/cashuDeterministic";
import { isCashuRecoverableOutputCollisionError } from "./utils/cashuErrors";
import { getCashuLib } from "./utils/cashuLib";
import {
  dedupeCashuProofs,
  filterUnspentCashuProofs,
  sumCashuProofAmounts,
} from "./utils/cashuProofs";
import {
  createLoadedCashuWallet,
  decodeCashuTokenForMint,
} from "./utils/cashuWallet";
import { getUnknownErrorMessage } from "./utils/unknown";

export type CashuSendResult =
  | {
      ok: true;
      mint: string;
      remainingAmount: number;
      remainingToken: string | null;
      sendAmount: number;
      sendProofs: Proof[];
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

export const sendWithCashuDeterministicCounters = async <
  TResult extends { keep: readonly Proof[] },
>(
  args: {
    deterministic: boolean;
    keysetId: string;
    mintUrl: string;
    unit: string;
  },
  send: (counter: number | null) => Promise<TResult>,
): Promise<TResult> => {
  if (!args.deterministic) return await send(null);

  let counter = getCashuDeterministicCounter(args);
  let result: TResult | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      result = await send(counter);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (!isCashuRecoverableOutputCollisionError(error)) throw error;
      bumpCashuDeterministicCounter({
        ...args,
        used: CASHU_DETERMINISTIC_OUTPUT_BLOCK_SIZE * 2,
      });
      counter = getCashuDeterministicCounter(args);
    }
  }

  if (!result) throw lastError ?? new Error("swap failed");

  bumpCashuDeterministicCounter({
    ...args,
    used: getCashuSwapCounterUsage(result.keep.length),
  });
  return result;
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

  const { Mint, Wallet, getEncodedToken, getTokenMetadata } =
    await getCashuLib();

  const det = getCashuDeterministicSeedFromStorage();
  const wallet = await createLoadedCashuWallet({
    Mint,
    Wallet,
    mintUrl: mint,
    ...(unit ? { unit } : {}),
    ...(det ? { bip39seed: det.bip39seed } : {}),
  });
  const walletUnit = wallet.unit;
  const keysetId = wallet.keysetId;

  const allProofs: Proof[] = [];

  try {
    for (const tokenText of tokens) {
      const decoded = decodeCashuTokenForMint({
        tokenText,
        mintUrl: mint,
        getTokenMetadata,
        wallet,
      });
      for (const proof of decoded.proofs ?? []) {
        allProofs.push(proof);
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

  let spendableProofs = dedupeCashuProofs(allProofs);
  try {
    try {
      // Ignore already-spent proofs so stale local token rows do not block send.
      const states = await wallet.checkProofsStates(spendableProofs);
      const asArray: ProofState[] = Array.isArray(states) ? states : [];
      spendableProofs = filterUnspentCashuProofs(spendableProofs, asArray);
    } catch {
      // Keep previous behavior if state checks are unavailable.
    }

    const have = sumCashuProofAmounts(spendableProofs);
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

    const swapOnce = async (counter: number | null) => {
      if (typeof counter === "number") {
        const outputCounters = getCashuSwapOutputCounters(counter);
        return await wallet.send(sendAmount, spendableProofs, undefined, {
          send: {
            type: "deterministic",
            counter: outputCounters.send,
          },
          keep: {
            type: "deterministic",
            counter: outputCounters.keep,
          },
        });
      }
      return await wallet.send(sendAmount, spendableProofs);
    };

    const runSwap = async (): Promise<SendResponse> => {
      return await sendWithCashuDeterministicCounters(
        {
          deterministic: det !== null,
          mintUrl: mint,
          unit: walletUnit,
          keysetId,
        },
        swapOnce,
      );
    };

    const swapped = await (det
      ? withCashuDeterministicCounterLock(
          { mintUrl: mint, unit: walletUnit, keysetId },
          runSwap,
        )
      : runSwap());

    // Recovery: if the caller fails after swap, this token should represent
    // the user's full funds (keep + send).
    const recoveryProofs = [...(swapped.keep ?? []), ...(swapped.send ?? [])];
    const recoveryAmount = sumCashuProofAmounts(recoveryProofs);
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
    const remainingAmount = sumCashuProofAmounts(remainingProofs);
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
      sendProofs,
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
      remainingAmount: sumCashuProofAmounts(spendableProofs),
      remainingToken: null,
      error: getUnknownErrorMessage(e, "swap failed"),
    };
  }
};
