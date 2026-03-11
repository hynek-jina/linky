import {
  ALLOW_PROMISES_STORAGE_KEY,
  DISPLAY_CURRENCY_STORAGE_KEY,
  LIGHTNING_INVOICE_AUTO_PAY_LIMIT_SAT,
  LIGHTNING_INVOICE_AUTO_PAY_LIMIT_STORAGE_KEY,
  NOSTR_NSEC_STORAGE_KEY,
  PAY_WITH_CASHU_STORAGE_KEY,
  UNIT_TOGGLE_STORAGE_KEY,
} from "./constants";
import { parseDisplayCurrency, type DisplayCurrency } from "./displayAmounts";

interface StorageStructuredValue {
  toString(): string;
}

type StoragePayload =
  | bigint
  | boolean
  | number
  | StorageStructuredValue
  | string
  | symbol
  | null
  | undefined;

export const safeLocalStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeLocalStorageSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export const safeLocalStorageRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

export const safeLocalStorageGetJson = <T extends StoragePayload>(
  key: string,
  fallback: T,
): T => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const safeLocalStorageSetJson = (
  key: string,
  value: StoragePayload,
): void => {
  try {
    safeLocalStorageSet(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

export const getInitialDisplayCurrency = (): DisplayCurrency => {
  try {
    const stored = parseDisplayCurrency(
      localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY),
    );
    if (stored) return stored;
    return localStorage.getItem(UNIT_TOGGLE_STORAGE_KEY) === "1"
      ? "btc"
      : "sat";
  } catch {
    return "sat";
  }
};

export const getInitialPayWithCashuEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(PAY_WITH_CASHU_STORAGE_KEY);
    const v = String(raw ?? "").trim();
    // Default: enabled.
    if (!v) return true;
    return v === "1";
  } catch {
    return true;
  }
};

export const getInitialAllowPromisesEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(ALLOW_PROMISES_STORAGE_KEY);
    const v = String(raw ?? "").trim();
    // Default: disabled.
    if (!v) return false;
    return v === "1";
  } catch {
    return false;
  }
};

export const getInitialLightningInvoiceAutoPayLimit = (): number => {
  try {
    const raw = localStorage.getItem(
      LIGHTNING_INVOICE_AUTO_PAY_LIMIT_STORAGE_KEY,
    );
    const parsed = Number.parseInt(String(raw ?? "").trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    return LIGHTNING_INVOICE_AUTO_PAY_LIMIT_SAT;
  } catch {
    return LIGHTNING_INVOICE_AUTO_PAY_LIMIT_SAT;
  }
};

export const getInitialNostrNsec = (): string | null => {
  try {
    const raw = localStorage.getItem(NOSTR_NSEC_STORAGE_KEY);
    const v = String(raw ?? "").trim();
    return v ? v : null;
  } catch {
    return null;
  }
};
