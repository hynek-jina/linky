import { reportInspectorRows } from "../../devtools/inspector";
import { getInspectorEmissionEnabled } from "../../devtools/inspector/inspectorEnabled";
import { cashuAmountToNumber } from "../../utils/cashuProofs";
import { requestMintQuoteBolt11 } from "../hooks/topup/useTopupInvoiceQuoteEffects";

export const LIGHTNING_FEE_PROBE_AMOUNT_SAT = 10_000;

export interface LightningFeeProbeResult {
  amountSat: number;
  feeReserveSat: number;
  percent: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const reportProbe = (
  mintUrl: string,
  probeMintUrl: string,
  result: LightningFeeProbeResult,
): void => {
  if (!getInspectorEmissionEnabled()) return;
  reportInspectorRows([
    {
      at: Date.now(),
      channel: "cashu",
      tag: "mint.lightningFeeProbe",
      summary: `${mintUrl} melt fee_reserve ${result.feeReserveSat} sat on ${result.amountSat} sat (${result.percent.toFixed(2)} %)`,
      links: {},
      context: { mint: mintUrl, probeMint: probeMintUrl },
      payload: result,
    },
  ]);
};

// Mints publish no Lightning fee in NUT-06; the only way to learn it is to
// ask for a melt quote. An unpaid invoice from another mint serves as the
// probe so the quote is for an external (non-internal) payment.
export const probeLightningFee = async (args: {
  amountSat?: number;
  mintUrl: string;
  probeMintUrl: string;
}): Promise<LightningFeeProbeResult> => {
  const amountSat = args.amountSat ?? LIGHTNING_FEE_PROBE_AMOUNT_SAT;
  const { invoice } = await requestMintQuoteBolt11({
    amountSat,
    mintUrl: args.probeMintUrl,
  });

  const res = await fetch(
    `${args.mintUrl.replace(/\/+$/, "")}/v1/melt/quote/bolt11`,
    {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      mode: "cors",
      body: JSON.stringify({ request: invoice, unit: "sat" }),
    },
  );
  if (!res.ok) throw new Error(`Melt quote HTTP ${res.status}`);

  const quote: unknown = await res.json();
  if (!isRecord(quote) || !("fee_reserve" in quote)) {
    throw new Error("Melt quote missing fee_reserve");
  }
  const feeReserveSat = cashuAmountToNumber(quote.fee_reserve);
  const quotedAmount = cashuAmountToNumber(quote.amount);
  const baseAmount = quotedAmount > 0 ? quotedAmount : amountSat;
  const result = {
    amountSat: baseAmount,
    feeReserveSat,
    percent: (feeReserveSat / baseAmount) * 100,
  };
  reportProbe(args.mintUrl, args.probeMintUrl, result);
  return result;
};
