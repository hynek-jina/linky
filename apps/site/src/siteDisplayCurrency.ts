export type SiteDisplayCurrency = "sat" | "btc" | "czk" | "eur" | "chf" | "usd";

export const siteDisplayCurrencies: readonly SiteDisplayCurrency[] = [
  "sat",
  "btc",
  "czk",
  "eur",
  "chf",
  "usd",
];

import { getDefaultSiteDisplayCurrency } from "./sitePreferences";

export const siteDisplayCurrencyStorageKey = "linky.display_currency.v1";

export const parseSiteDisplayCurrency = (
  value: string | null | undefined,
): SiteDisplayCurrency => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "btc" || normalized === "b") return "btc";
  if (normalized === "czk") return "czk";
  if (normalized === "eur") return "eur";
  if (normalized === "chf") return "chf";
  if (normalized === "usd") return "usd";
  return "sat";
};

export const getInitialSiteDisplayCurrency = (): SiteDisplayCurrency => {
  if (typeof window === "undefined") return getDefaultSiteDisplayCurrency();
  return parseSiteDisplayCurrency(
    window.localStorage.getItem(siteDisplayCurrencyStorageKey) ??
      getDefaultSiteDisplayCurrency(),
  );
};
