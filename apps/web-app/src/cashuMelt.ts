import type {
  MeltQuoteBolt11Response,
  MeltProofsResponse,
  Proof,
  ProofState,
  SendResponse,
} from "@cashu/cashu-ts";
import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "./utils/cashuDeterministic";
import { isCashuRecoverableOutputCollisionError } from "./utils/cashuErrors";
import { getCashuLib } from "./utils/cashuLib";
import {
  cashuAmountToNumber,
  dedupeCashuProofs,
  filterUnspentCashuProofs,
  sumCashuProofAmounts,
} from "./utils/cashuProofs";
import {
  createLoadedCashuWallet,
  decodeCashuTokenForMint,
} from "./utils/cashuWallet";
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

// Number of NUT-08 blank outputs cashu-ts will emit for a given fee reserve.
// Mirrors cashu-ts CashuWallet.createBlankOutputs:
//   r = Math.ceil(Math.log2(feeReserve)) || 1; if (r<0) r = 0;
// Important: every one of these B_'s consumes a deterministic counter slot
// on the wallet, AND lands in the mint's `promises` table with c_ IS NULL
// before LN payment. If the mint's change generation returns no signatures
// (overpaid_fee <= 0) and the mint does not clean up its blanks, those rows
// remain forever (see report.md). We must bump the counter past the full
// blank range — not just the change count actually returned — or a future
// derivation against the same counter will collide with the orphan B_'s.
const computeNumberOfBlankOutputs = (feeReserve: number): number => {
  const fr =
    Number.isFinite(feeReserve) && feeReserve > 0 ? Math.trunc(feeReserve) : 0;
  if (fr <= 0) return 0;
  const r = Math.ceil(Math.log2(fr)) || 1;
  return r < 0 ? 0 : r;
};

interface ParsedMeltProofsResponse {
  change: Proof[];
  fee?: number;
  feePaid?: number;
  fee_paid?: number;
  quote: MeltQuoteBolt11Response;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isProof = (value: unknown): value is Proof => {
  if (!isRecord(value)) return false;
  return (
    "amount" in value &&
    typeof value.secret === "string" &&
    typeof value.C === "string" &&
    typeof value.id === "string"
  );
};

const isProofArray = (value: unknown): value is Proof[] => {
  return Array.isArray(value) && value.every(isProof);
};

const isMeltQuoteResponse = (
  value: unknown,
): value is MeltQuoteBolt11Response => {
  if (!isRecord(value)) return false;
  return (
    typeof value.quote === "string" &&
    "amount" in value &&
    "fee_reserve" in value &&
    typeof value.state === "string" &&
    (typeof value.expiry === "number" || value.expiry === null) &&
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

// Caller-supplied cache so the outer retry loop (autoswap) doesn't pay for
// loadMint() + checkProofsStates on every iteration. The melt-quote step is
// the only thing that genuinely depends on the per-attempt amount, so we let
// callers prepareMeltMintContext once and pass it through unchanged.
export interface MeltMintContext {
  spendableProofs: Proof[];
  wallet: Awaited<ReturnType<typeof createLoadedCashuWallet>>;
}

export const prepareMeltMintContext = async (args: {
  mint: string;
  tokens: string[];
  unit?: string | null;
}): Promise<MeltMintContext> => {
  const { mint, tokens, unit } = args;
  const { Mint, Wallet, getTokenMetadata } = await getCashuLib();

  const det = getCashuDeterministicSeedFromStorage();
  const wallet = await createLoadedCashuWallet({
    Mint,
    Wallet,
    mintUrl: mint,
    ...(unit ? { unit } : {}),
    ...(det ? { bip39seed: det.bip39seed } : {}),
  });

  const allProofs: Proof[] = [];
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

  let spendableProofs = dedupeCashuProofs(allProofs);
  try {
    const states = await wallet.checkProofsStates(spendableProofs);
    const asArray: ProofState[] = Array.isArray(states) ? states : [];
    spendableProofs = filterUnspentCashuProofs(spendableProofs, asArray);
  } catch {
    // Keep previous behavior if state checks are unavailable.
  }

  return { wallet, spendableProofs };
};

export const meltInvoiceWithTokensAtMint = async (args: {
  context?: MeltMintContext;
  invoice: string;
  mint: string;
  tokens: string[];
  unit?: string | null;
}): Promise<CashuPayResult | CashuPayErrorResult> => {
  const { invoice, mint, tokens, unit } = args;
  const { getEncodedToken } = await getCashuLib();

  const det = getCashuDeterministicSeedFromStorage();
  let context: MeltMintContext;
  try {
    context =
      args.context ??
      (await prepareMeltMintContext({
        mint,
        tokens,
        ...(unit ? { unit } : {}),
      }));
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
  const { wallet, spendableProofs: contextSpendableProofs } = context;
  const walletUnit = wallet.unit;
  const keysetId = wallet.keysetId;

  try {
    const spendableProofs = contextSpendableProofs;

    const quote = await wallet.createMeltQuoteBolt11(invoice);
    const paidAmount = cashuAmountToNumber(quote.amount);
    const feeReserve = cashuAmountToNumber(quote.fee_reserve);
    const quotedTotal = paidAmount + feeReserve;

    const have = sumCashuProofAmounts(spendableProofs);
    if (have < quotedTotal) {
      return {
        ok: false,
        mint,
        unit: unit ?? null,
        paidAmount,
        feeReserve,
        feePaid: 0,
        remainingAmount: have,
        remainingToken: null,
        error: `Insufficient funds (need ${quotedTotal}, have ${have})`,
      };
    }

    const run = async (): Promise<CashuPayResult | CashuPayErrorResult> => {
      const amountToSend = quote.amount.add(quote.fee_reserve);
      let swapped: SendResponse | null = null;

      const swapOnce = async (counter: number | null) => {
        if (typeof counter === "number") {
          return await wallet.send(
            amountToSend,
            spendableProofs,
            { includeFees: true },
            {
              send: { type: "deterministic", counter },
              keep: { type: "deterministic", counter: 0 },
            },
          );
        }

        return await wallet.send(amountToSend, spendableProofs, {
          includeFees: true,
        });
      };

      try {
        const counter0 = det
          ? getCashuDeterministicCounter({
              mintUrl: mint,
              unit: walletUnit,
              keysetId,
            })
          : null;

        if (typeof counter0 === "number") {
          let counter = counter0;
          let lastError: unknown;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
              swapped = await swapOnce(counter);
              lastError = null;
              break;
            } catch (e) {
              lastError = e;
              if (!isCashuRecoverableOutputCollisionError(e) || !det) throw e;
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

          bumpCashuDeterministicCounter({
            mintUrl: mint,
            unit: walletUnit,
            keysetId,
            used: swapped.keep.length + swapped.send.length,
          });
        } else {
          swapped = await swapOnce(null);
        }
      } catch (e) {
        return {
          ok: false,
          mint,
          unit: unit ?? null,
          paidAmount,
          feeReserve,
          feePaid: 0,
          remainingAmount: sumCashuProofAmounts(spendableProofs),
          remainingToken: null,
          error: getUnknownErrorMessage(e, "swap failed"),
        };
      }

      const proofsToKeep = swapped.keep ?? [];
      const proofsToMelt = swapped.send ?? [];
      const recoveryProofs = [...proofsToKeep, ...proofsToMelt];
      const recoveryAmount = sumCashuProofAmounts(recoveryProofs);
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
            await wallet.meltProofsBolt11(quote, proofsToMelt, undefined, {
              type: "deterministic",
              counter,
            }),
          );

        const counter0 = det
          ? getCashuDeterministicCounter({
              mintUrl: mint,
              unit: walletUnit,
              keysetId,
            })
          : undefined;

        if (typeof counter0 === "number") {
          let counter = counter0;
          let lastError: unknown;
          for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
              melt = await meltOnce(counter);
              lastError = null;
              break;
            } catch (e) {
              lastError = e;
              if (!isCashuRecoverableOutputCollisionError(e) || !det) throw e;
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
            await wallet.meltProofsBolt11(quote, proofsToMelt),
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
        // Advance past the full blank-output range, not just the change count.
        // cashu-ts emits N = computeNumberOfBlankOutputs(excess) B_'s
        // starting at the post-melt counter. All N are persisted by the mint
        // before LN payment, but only the signed ones (`change.length`) are
        // returned. If we only bump by `change.length` here, the next melt
        // can re-derive a B_ that is already sitting in the mint's promises
        // table as `c_ IS NULL` and we'll get OutputsArePending (NUT 11004).
        const meltOutputExcess = Math.max(
          0,
          sumCashuProofAmounts(proofsToMelt) - paidAmount,
        );
        const blankCount = computeNumberOfBlankOutputs(meltOutputExcess);
        const changeCount = melt?.change.length ?? 0;
        bumpCashuDeterministicCounter({
          mintUrl: mint,
          unit: walletUnit,
          keysetId,
          used: Math.max(blankCount, changeCount),
        });
      }

      const feePaid = (() => {
        const raw = melt?.fee_paid ?? melt?.feePaid ?? melt?.fee ?? 0;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
      })();

      const remainingProofs = [...proofsToKeep, ...(melt?.change ?? [])];
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
      remainingAmount: sumCashuProofAmounts(contextSpendableProofs),
      remainingToken: null,
      error: getUnknownErrorMessage(e, "melt failed"),
    };
  }
};
