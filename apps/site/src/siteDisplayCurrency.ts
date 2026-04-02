export type SiteDisplayCurrency = "sat" | "btc" | "czk" | "usd";

export const siteDisplayCurrencyStorageKey = "linky.display_currency.v1";

export const parseSiteDisplayCurrency = (
  value: string | null | undefined,
): SiteDisplayCurrency => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "btc" || normalized === "b") return "btc";
  if (normalized === "czk") return "czk";
  if (normalized === "usd") return "usd";
  return "sat";
};

export const getInitialSiteDisplayCurrency = (): SiteDisplayCurrency => {
  if (typeof window === "undefined") return "sat";
  return parseSiteDisplayCurrency(
    window.localStorage.getItem(siteDisplayCurrencyStorageKey),
  );
};
