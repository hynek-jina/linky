import { cs } from "./cs";
import { en } from "./en";

export const translations = { cs, en } as const;
export type Lang = keyof typeof translations;
export type I18nKey = keyof typeof translations.cs;

const STORAGE_KEY = "linky.lang";

const getSystemLang = (): Lang => {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("cs") ? "cs" : "en";
};

export const getInitialLang = (): Lang => {
  if (typeof localStorage === "undefined") return getSystemLang();
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "cs" || stored === "en") return stored;
  return getSystemLang();
};

export const persistLang = (lang: Lang) => {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
};
