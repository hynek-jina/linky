import type {
  MeltProofsResponse,
  MeltQuoteResponse,
  Proof,
  ProofState,
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
  dedupeCashuProofs,
  filterUnspentCashuProofs,
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

const getProofAmountSum = (proofs: Array<{ amount: number }>) =>
  proofs.reduce((sum, proof) => sum + proof.amount, 0);

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
  const { CashuMint, CashuWallet, getDecodedToken, getTokenMetadata } =
    await getCashuLib();

  const det = getCashuDeterministicSeedFromStorage();
  const wallet = await createLoadedCashuWallet({
    CashuMint,
    CashuWallet,
    mintUrl: mint,
    ...(unit ? { unit } : {}),
    ...(det ? { bip39seed: det.bip39seed } : {}),
  });

  const allProofs: Proof[] = [];
  for (const tokenText of tokens) {
    const decoded = decodeCashuTokenForMint({
      tokenText,
      mintUrl: mint,
      keysets: wallet.keysets,
      getDecodedToken,
      getTokenMetadata,
    });
    for (const proof of decoded.proofs ?? []) {
      allProofs.push({
        amount: Number(proof.amount ?? 0),
        secret: proof.secret,
        C: proof.C,
        id: proof.id,
      });
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

    const quote = await wallet.createMeltQuote(invoice);
    const paidAmount = quote.amount ?? 0;
    const feeReserve = quote.fee_reserve ?? 0;
    const quotedTotal = paidAmount + feeReserve;

    // Standard NUT-05 / NUT-08 melt: hand wallet.meltProofs the spendable
    // proofs as-is (sum >= quote.amount + quote.fee_reserve) and let the
    // mint return the difference as NUT-08 blinded change. cashu-ts builds
    // the blank outputs internally; no pre-swap is needed and no extra
    // input fee is paid for re-denominating proofs.
    const have = getProofAmountSum(spendableProofs);
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
            await wallet.meltProofs(quote, spendableProofs, {
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
            await wallet.meltProofs(quote, spendableProofs),
          );
        }
      } catch (e) {
        // Without a pre-swap there are no intermediate proofs to encode as
        // a recovery token. The original spendableProofs are either still
        // unspent at the source mint (mint never accepted them) or already
        // committed (mint accepted but we lost the response). The autoswap
        // / LN-pay caller will retry-with-smaller-amount on retryable
        // errors; for the rare "appeared-failed-but-committed" race the
        // user can fall back to the existing Restore action in Advanced,
        // which scans the deterministic counter range for stranded proofs.
        return {
          ok: false,
          mint,
          unit: unit ?? null,
          paidAmount,
          feeReserve,
          feePaid: 0,
          remainingAmount: getProofAmountSum(spendableProofs),
          remainingToken: null,
          error: getUnknownErrorMessage(e, "melt failed"),
        };
      }

      if (det) {
        // Advance past the full blank-output range, not just the change count.
        // cashu-ts emits N = computeNumberOfBlankOutputs(feeReserve) B_'s
        // starting at the post-melt counter. All N are persisted by the mint
        // before LN payment, but only the signed ones (`change.length`) are
        // returned. If we only bump by `change.length` here, the next melt
        // can re-derive a B_ that is already sitting in the mint's promises
        // table as `c_ IS NULL` and we'll get OutputsArePending (NUT 11004).
        const blankCount = computeNumberOfBlankOutputs(feeReserve);
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

      const remainingProofs = melt?.change ?? [];
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
      remainingAmount: getProofAmountSum(contextSpendableProofs),
      remainingToken: null,
      error: getUnknownErrorMessage(e, "melt failed"),
    };
  }
};
