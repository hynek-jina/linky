import { formatInteger, normalizeLocale } from "./formatting";

export type DisplayCurrency = "sat" | "btc" | "czk" | "usd";

export interface FiatRates {
  czkPerBtc: number;
  fetchedAtMs: number;
  usdPerBtc: number;
}

export interface DisplayAmountOptions {
  displayCurrency: DisplayCurrency;
  fiatRates: FiatRates | null;
  lang?: string;
}

export interface DisplayAmountParts {
  amountText: string;
  approxPrefix: string;
  unitLabel: string;
}

const SATS_PER_BTC = 100_000_000;

const isFiatCurrency = (
  displayCurrency: DisplayCurrency,
): displayCurrency is "czk" | "usd" =>
  displayCurrency === "czk" || displayCurrency === "usd";

const getRateForCurrency = (
  displayCurrency: "czk" | "usd",
  fiatRates: FiatRates,
): number =>
  displayCurrency === "czk" ? fiatRates.czkPerBtc : fiatRates.usdPerBtc;

const fiatFormatters = new Map<string, Intl.NumberFormat>();

export const parseDisplayCurrency = (
  value: string | null | undefined,
): DisplayCurrency | null => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "sat") return "sat";
  if (normalized === "btc" || normalized === "b") return "btc";
  if (normalized === "czk") return "czk";
  if (normalized === "usd") return "usd";
  return null;
};

export const getDisplayUnitLabel = (
  displayCurrency: DisplayCurrency,
  lang?: string,
): string => {
  switch (displayCurrency) {
    case "btc":
      return "₿";
    case "czk":
      return normalizeLocale(lang).startsWith("cs") ? "Kč" : "CZK";
    case "usd":
      return "USD";
    case "sat":
      return "sat";
  }
};

const getFiatFormatter = (
  locale: string,
  currency: "czk" | "usd",
): Intl.NumberFormat => {
  const cacheKey = `${locale}:${currency}`;
  const existing = fiatFormatters.get(cacheKey);
  if (existing) return existing;

  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
  fiatFormatters.set(cacheKey, formatter);
  return formatter;
};

const normalizeAmountSat = (amountSat: number): number => {
  if (!Number.isFinite(amountSat)) return 0;
  return Math.max(0, Math.trunc(amountSat));
};

const getFiatValue = (
  amountSat: number,
  displayCurrency: "czk" | "usd",
  fiatRates: FiatRates,
): number => {
  const btcAmount = amountSat / SATS_PER_BTC;
  const rate = getRateForCurrency(displayCurrency, fiatRates);
  return btcAmount * rate;
};

const parsePositiveInteger = (value: string): number => {
  const digitsOnly = String(value ?? "").replace(/\D/g, "");
  if (!digitsOnly) return 0;
  const parsed = Number.parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
};

const getDisplayAmountInputValue = (
  amountSat: number,
  options: DisplayAmountOptions,
): string => {
  const normalizedAmount = normalizeAmountSat(amountSat);
  if (normalizedAmount <= 0) return "";

  if (isFiatCurrency(options.displayCurrency) && options.fiatRates) {
    return String(
      Math.max(
        0,
        Math.round(
          getFiatValue(
            normalizedAmount,
            options.displayCurrency,
            options.fiatRates,
          ),
        ),
      ),
    );
  }

  return String(normalizedAmount);
};

export const toAmountSatFromDisplayInput = (
  displayValue: string,
  options: DisplayAmountOptions,
): number => {
  const parsedDisplayValue = parsePositiveInteger(displayValue);
  if (parsedDisplayValue <= 0) return 0;

  if (isFiatCurrency(options.displayCurrency) && options.fiatRates) {
    const rate = getRateForCurrency(options.displayCurrency, options.fiatRates);
    const amountSat = Math.round((parsedDisplayValue / rate) * SATS_PER_BTC);
    return Number.isFinite(amountSat) && amountSat > 0 ? amountSat : 0;
  }

  return parsedDisplayValue;
};

export const applyAmountInputKey = (
  currentAmount: string,
  key: string,
  options: DisplayAmountOptions,
): string => {
  if (key === "C") return "";

  const currentAmountSat = parsePositiveInteger(currentAmount);
  const currentDisplayValue = getDisplayAmountInputValue(
    currentAmountSat,
    options,
  );

  const nextDisplayValue =
    key === "⌫"
      ? currentDisplayValue.slice(0, -1)
      : (currentDisplayValue + key).replace(/^0+(\d)/, "$1");

  const nextAmountSat = toAmountSatFromDisplayInput(nextDisplayValue, options);
  return nextAmountSat > 0 ? String(nextAmountSat) : "";
};

export const formatDisplayAmountParts = (
  amountSat: number,
  options: DisplayAmountOptions,
): DisplayAmountParts => {
  const normalizedAmount = normalizeAmountSat(amountSat);
  const locale = normalizeLocale(options.lang);

  if (options.displayCurrency === "btc") {
    return {
      amountText: formatInteger(normalizedAmount, options.lang),
      approxPrefix: "",
      unitLabel: getDisplayUnitLabel("btc", options.lang),
    };
  }

  if (isFiatCurrency(options.displayCurrency) && options.fiatRates) {
    const currency = options.displayCurrency;
    return {
      amountText: getFiatFormatter(locale, currency).format(
        getFiatValue(normalizedAmount, currency, options.fiatRates),
      ),
      approxPrefix: "~",
      unitLabel: getDisplayUnitLabel(currency, options.lang),
    };
  }

  return {
    amountText: formatInteger(normalizedAmount, options.lang),
    approxPrefix: "",
    unitLabel: getDisplayUnitLabel("sat", options.lang),
  };
};

export const formatDisplayAmountText = (
  amountSat: number,
  options: DisplayAmountOptions,
): string => {
  const parts = formatDisplayAmountParts(amountSat, options);
  return `${parts.approxPrefix}${parts.amountText} ${parts.unitLabel}`;
};
