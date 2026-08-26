import { reportInspectorRows } from "../../devtools/inspector";
import { getInspectorEmissionEnabled } from "../../devtools/inspector/inspectorEnabled";
import { requestMintQuoteBolt11 } from "../hooks/topup/useTopupInvoiceQuoteEffects";

export const LIGHTNING_FEE_PROBE_AMOUNT_SAT = 10_000;
export const LIGHTNING_FEE_PROBE_TIMEOUT_MS = 15_000;
export const LIGHTNING_FEE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LIGHTNING_FEE_CACHE_KEY = "linky.lightning_fee_probe.v1";

export interface LightningFeeProbeResult {
  amountSat: number;
  feeReserveSat: number;
  percent: number;
}

interface CachedLightningFee {
  at: number;
  result: LightningFeeProbeResult;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readNonNegativeInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;

const isProbeResult = (value: unknown): value is LightningFeeProbeResult =>
  isRecord(value) &&
  readNonNegativeInteger(value.amountSat) !== null &&
  readNonNegativeInteger(value.feeReserveSat) !== null &&
  typeof value.percent === "number" &&
  Number.isFinite(value.percent);

const readCache = (): Record<string, CachedLightningFee> => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(LIGHTNING_FEE_CACHE_KEY) ?? "{}",
    );
    if (!isRecord(parsed)) return {};
    const entries: Record<string, CachedLightningFee> = {};
    for (const [mintUrl, entry] of Object.entries(parsed)) {
      if (
        isRecord(entry) &&
        typeof entry.at === "number" &&
        isProbeResult(entry.result)
      ) {
        entries[mintUrl] = { at: entry.at, result: entry.result };
      }
    }
    return entries;
  } catch {
    return {};
  }
};

const writeCache = (entries: Record<string, CachedLightningFee>): void => {
  try {
    localStorage.setItem(LIGHTNING_FEE_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // Storage is a convenience; the probe result is still returned.
  }
};

export const getCachedLightningFee = (
  mintUrl: string,
  nowMs = Date.now(),
): LightningFeeProbeResult | null => {
  const entry = readCache()[mintUrl];
  if (!entry || nowMs - entry.at > LIGHTNING_FEE_CACHE_TTL_MS) return null;
  return entry.result;
};

const cacheLightningFee = (
  mintUrl: string,
  result: LightningFeeProbeResult,
  nowMs: number,
): void => {
  const entries = readCache();
  for (const [url, entry] of Object.entries(entries)) {
    if (nowMs - entry.at > LIGHTNING_FEE_CACHE_TTL_MS) delete entries[url];
  }
  entries[mintUrl] = { at: nowMs, result };
  writeCache(entries);
};

const reportProbe = (args: {
  meltQuoteId: string;
  mintQuoteId: string;
  mintUrl: string;
  probeMintUrl: string;
  result: LightningFeeProbeResult;
}): void => {
  if (!getInspectorEmissionEnabled()) return;
  const { result } = args;
  reportInspectorRows([
    {
      at: Date.now(),
      channel: "cashu",
      tag: "mint.lightningFeeProbe",
      summary: `${args.mintUrl} melt fee_reserve ${result.feeReserveSat} sat on ${result.amountSat} sat (${result.percent.toFixed(2)} %)`,
      links: { meltQuote: args.meltQuoteId, mintQuote: args.mintQuoteId },
      context: { mint: args.mintUrl, probeMint: args.probeMintUrl },
      payload: result,
    },
  ]);
};

const withTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

// Mints publish no Lightning fee in NUT-06; the only way to learn it is to
// ask for a melt quote. An unpaid invoice from another mint serves as the
// probe so the quote is for an external (non-internal) payment.
export const probeLightningFee = async (args: {
  amountSat?: number;
  mintUrl: string;
  probeMintUrl: string;
  timeoutMs?: number;
}): Promise<LightningFeeProbeResult> => {
  const amountSat = args.amountSat ?? LIGHTNING_FEE_PROBE_AMOUNT_SAT;
  const timeoutMs = args.timeoutMs ?? LIGHTNING_FEE_PROBE_TIMEOUT_MS;

  return await withTimeout(async (signal) => {
    const { invoice, quoteId: mintQuoteId } = await requestMintQuoteBolt11({
      amountSat,
      mintUrl: args.probeMintUrl,
      signal,
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
        signal,
      },
    );
    if (!res.ok) throw new Error(`Melt quote HTTP ${res.status}`);

    const quote: unknown = await res.json();
    const feeReserveSat = isRecord(quote)
      ? readNonNegativeInteger(quote.fee_reserve)
      : null;
    if (feeReserveSat === null) {
      throw new Error("Melt quote missing fee_reserve");
    }
    const quotedAmount = isRecord(quote)
      ? readNonNegativeInteger(quote.amount)
      : null;
    const baseAmount = quotedAmount ? quotedAmount : amountSat;
    const result = {
      amountSat: baseAmount,
      feeReserveSat,
      percent: (feeReserveSat / baseAmount) * 100,
    };
    const meltQuoteId = isRecord(quote) ? String(quote.quote ?? "") : "";
    cacheLightningFee(args.mintUrl, result, Date.now());
    reportProbe({
      meltQuoteId,
      mintQuoteId,
      mintUrl: args.mintUrl,
      probeMintUrl: args.probeMintUrl,
      result,
    });
    return result;
  }, timeoutMs);
};
