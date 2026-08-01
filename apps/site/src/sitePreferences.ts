import type { SiteDisplayCurrency } from "./siteDisplayCurrency";

export type SiteLocale = "cs" | "de" | "en";

const getPrimaryBrowserLanguage = (): string => {
  if (typeof navigator === "undefined") return "";

  const preferredLanguages = Array.isArray(navigator.languages)
    ? navigator.languages
    : [];

  for (const language of preferredLanguages) {
    const normalized = String(language ?? "")
      .trim()
      .toLowerCase();
    if (normalized) return normalized;
  }

  return String(navigator.language ?? "")
    .trim()
    .toLowerCase();
};

export const getDefaultSiteLocale = (): SiteLocale => {
  const language = getPrimaryBrowserLanguage();

  if (language.startsWith("cs")) return "cs";
  if (language.startsWith("de")) return "de";
  return "en";
};

export const getDefaultSiteDisplayCurrency = (): SiteDisplayCurrency => {
  const language = getPrimaryBrowserLanguage();

  if (language.startsWith("cs")) return "czk";
  if (language.startsWith("de")) return "eur";
  if (language.startsWith("en")) return "usd";
  return "sat";
};
