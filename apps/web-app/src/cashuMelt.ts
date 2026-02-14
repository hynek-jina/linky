import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "./utils/cashuDeterministic";
import type {
  MeltProofsResponse,
  MeltQuoteResponse,
  Proof,
  SendResponse,
} from "@cashu/cashu-ts";
import { getCashuLib } from "./utils/cashuLib";
import { getUnknownErrorMessage } from "./utils/unknown";

type CashuPayResult = {
  ok: true;
  // Actual fee charged by the mint (may be 0 even if feeReserve > 0).
  feePaid: number;
  feeReserve: number;
  mint: string;
  paidAmount: number;
  remainingAmount: number;
  remainingToken: string | null;
  unit: string | null;
};

type CashuPayErrorResult = {
  ok: false;
  error: string;
  feePaid: number;
  feeReserve: number;
  mint: string;
  paidAmount: number;
  // If we already swapped, this token should represent the user's funds.
  remainingAmount: number;
  remainingToken: string | null;
  unit: string | null;
};

const getProofAmountSum = (proofs: Array<{ amount: number }>) =>
  proofs.reduce((sum, proof) => sum + proof.amount, 0);

interface ParsedMeltProofsResponse {
  change: Proof[];
  fee?: number;
  feePaid?: number;
  fee_paid?: number;
  quote: MeltQuoteResponse;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isProof = (value: unknown): value is Proof => {
  if (!isRecord(value)) return false;
  return (
    typeof value.amount === "number" &&
    typeof value.secret === "string" &&
    typeof value.C === "string" &&
    typeof value.id === "string"
  );
};

const isProofArray = (value: unknown): value is Proof[] => {
  return Array.isArray(value) && value.every(isProof);
};

const isMeltQuoteResponse = (value: unknown): value is MeltQuoteResponse => {
  if (!isRecord(value)) return false;
  return (
    typeof value.quote === "string" &&
    typeof value.amount === "number" &&
    typeof value.fee_reserve === "number" &&
    typeof value.state === "string" &&
    typeof value.expiry === "number" &&
    typeof value.request === "string" &&
    typeof value.unit === "string"
  );
};

const isOptionalFee = (value: unknown): value is number | undefined => {
  return value === undefined || typeof value === "number";
};

const parseMeltProofsResponse = (
  value: unknown,
): ParsedMeltProofsResponse | null => {
  if (!isRecord(value)) return null;
  if (!isMeltQuoteResponse(value.quote)) return null;
  if (!(value.change === undefined || isProofArray(value.change))) return null;
  if (
    !isOptionalFee(value.fee_paid) ||
    !isOptionalFee(value.feePaid) ||
    !isOptionalFee(value.fee)
  ) {
    return null;
  }
  return {
    quote: value.quote,
    change: value.change ?? [],
    ...(value.fee_paid !== undefined ? { fee_paid: value.fee_paid } : {}),
    ...(value.feePaid !== undefined ? { feePaid: value.feePaid } : {}),
    ...(value.fee !== undefined ? { fee: value.fee } : {}),
  };
};

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

    const run = async (): Promise<CashuPayResult | CashuPayErrorResult> => {
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

      let swapped: SendResponse | null = null;
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

      const keepLen = swapped.keep.length;
      const sendLen = swapped.send.length;
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
      const recoveryProofs = [...swapped.keep, ...swapped.send];
      const recoveryAmount = getProofAmountSum(recoveryProofs);
      const recoveryToken =
        recoveryProofs.length > 0
          ? getEncodedToken({
              mint,
              proofs: recoveryProofs,
              unit: walletUnit,
            })
          : null;

      let melt: ParsedMeltProofsResponse | null = null;

      try {
        const parseMeltResponse = (
          response: MeltProofsResponse,
        ): ParsedMeltProofsResponse => {
          const parsedResponse = parseMeltProofsResponse(response);
          if (!parsedResponse) {
            throw new Error("Invalid melt response");
          }
          return parsedResponse;
        };

        const meltOnce = async (counter: number) =>
          parseMeltResponse(
            await wallet.meltProofs(quote, swapped.send, {
              counter,
            }),
          );

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
          melt = parseMeltResponse(
            await wallet.meltProofs(quote, swapped.send),
          );
        }
      } catch (e) {
        return {
          ok: false,
          mint,
          unit: unit ?? null,
          paidAmount,
          feeReserve,
          feePaid: 0,
          remainingAmount: recoveryAmount,
          remainingToken: recoveryToken,
          error: getUnknownErrorMessage(e, "melt failed"),
        };
      }

      if (det) {
        bumpCashuDeterministicCounter({
          mintUrl: mint,
          unit: walletUnit,
          keysetId,
          used: melt?.change.length ?? 0,
        });
      }

      const feePaid = (() => {
        const raw = melt?.fee_paid ?? melt?.feePaid ?? melt?.fee ?? 0;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
      })();

      const remainingProofs = [...swapped.keep, ...(melt?.change ?? [])];
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
      error: getUnknownErrorMessage(e, "melt failed"),
    };
  }
};
