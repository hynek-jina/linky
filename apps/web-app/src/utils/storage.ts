import {
  getDefaultAllowedDisplayCurrencies,
  getDefaultDisplayCurrency,
} from "./browserPreferences";
import {
  BANK_PAYMENT_OFFER_RECIPIENT_COUNT_STORAGE_KEY,
  CASHU_AUTOSWAP_STORAGE_KEY,
  DISPLAY_ALLOWED_CURRENCIES_STORAGE_KEY,
  DISPLAY_CURRENCY_STORAGE_KEY,
  LIGHTNING_INVOICE_AUTO_PAY_LIMIT_SAT,
  LIGHTNING_INVOICE_AUTO_PAY_LIMIT_STORAGE_KEY,
  NOSTR_IDENTITY_SOURCE_STORAGE_KEY,
  NOSTR_IDENTITY_SWITCHED_AT_SEC_STORAGE_KEY,
  NOSTR_NSEC_STORAGE_KEY,
  PAY_WITH_CASHU_STORAGE_KEY,
  SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY,
  UNIT_TOGGLE_STORAGE_KEY,
} from "./constants";
import {
  normalizeAllowedDisplayCurrencies,
  parseDisplayCurrency,
  type DisplayCurrency,
} from "./displayAmounts";
import { getUnknownErrorMessage } from "./unknown";

interface StorageStructuredValue {
  toString(): string;
}

interface StorageObjectPayload {
  [key: string]: StoragePayload;
}

type StoragePayload =
  | boolean
  | number
  | StorageObjectPayload
  | StorageStructuredValue
  | StoragePayload[]
  | string
  | null
  | undefined;

interface LocalStorageLeaseLockRecord {
  expiresAtMs: number;
  owner: string;
}

const isLocalStorageLeaseLockRecord = (
  value: unknown,
): value is LocalStorageLeaseLockRecord => {
  if (typeof value !== "object" || value === null) return false;
  const owner = Reflect.get(value, "owner");
  const expiresAtMs = Reflect.get(value, "expiresAtMs");
  return typeof owner === "string" && typeof expiresAtMs === "number";
};

const createLeaseLockOwner = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (typeof randomUuid === "string" && randomUuid.trim()) return randomUuid;
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
};

const sleep = async (delayMs: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
};

export type LocalStorageOperation =
  | "get"
  | "set"
  | "remove"
  | "getJson"
  | "setJson";

export interface LocalStorageFailure {
  operation: LocalStorageOperation;
  key: string;
  message: string;
}

let localStorageFailureCount = 0;
let lastLocalStorageFailure: LocalStorageFailure | null = null;
let localStorageFailureReporter:
  | ((failure: LocalStorageFailure) => void)
  | null = null;

// Every localStorage access below is best-effort and swallows its error, which
// makes a broken environment indistinguishable from a successful no-op. The
// counter/last-failure record make the swallowed failure assertable without
// letting anything throw at the call site.
const reportLocalStorageFailure = (
  operation: LocalStorageOperation,
  key: string,
  error: unknown,
): void => {
  localStorageFailureCount += 1;
  const failure: LocalStorageFailure = {
    operation,
    key,
    message: getUnknownErrorMessage(error, "unknown localStorage error"),
  };
  lastLocalStorageFailure = failure;
  try {
    localStorageFailureReporter?.(failure);
  } catch {
    // A broken reporter must never break a best-effort storage call.
  }
};

export const getLocalStorageFailureCount = (): number =>
  localStorageFailureCount;

export const getLastLocalStorageFailure = (): LocalStorageFailure | null =>
  lastLocalStorageFailure;

export const resetLocalStorageFailures = (): void => {
  localStorageFailureCount = 0;
  lastLocalStorageFailure = null;
};

export const setLocalStorageFailureReporter = (
  reporter: ((failure: LocalStorageFailure) => void) | null,
): void => {
  localStorageFailureReporter = reporter;
};

export const safeLocalStorageGet = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    reportLocalStorageFailure("get", key, e);
    return null;
  }
};

export const safeLocalStorageSet = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    reportLocalStorageFailure("set", key, e);
  }
};

export const safeLocalStorageRemove = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    reportLocalStorageFailure("remove", key, e);
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
  } catch (e) {
    // A corrupt payload is data corruption, not a storage fault; report it
    // under its own operation so the two stay distinguishable.
    reportLocalStorageFailure("getJson", key, e);
    return fallback;
  }
};

export const safeLocalStorageSetJson = (
  key: string,
  value: StoragePayload,
): void => {
  try {
    safeLocalStorageSet(key, JSON.stringify(value));
  } catch (e) {
    reportLocalStorageFailure("setJson", key, e);
  }
};

const readLocalStorageLeaseLock = (
  key: string,
): LocalStorageLeaseLockRecord | null => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isLocalStorageLeaseLockRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const withLocalStorageLeaseLock = async <T>(args: {
  key: string;
  ttlMs?: number;
  timeoutMs?: number;
  waitMs?: number;
  fn: () => Promise<T>;
}): Promise<T> => {
  const ttlMs =
    Number.isFinite(args.ttlMs) && (args.ttlMs ?? 0) > 0
      ? Math.floor(args.ttlMs ?? 0)
      : 15_000;
  const timeoutMs =
    Number.isFinite(args.timeoutMs) && (args.timeoutMs ?? 0) >= 0
      ? Math.floor(args.timeoutMs ?? 0)
      : 15_000;
  const waitMs =
    Number.isFinite(args.waitMs) && (args.waitMs ?? 0) > 0
      ? Math.floor(args.waitMs ?? 0)
      : 50;

  const owner = createLeaseLockOwner();
  const startedAt = Date.now();

  while (true) {
    const now = Date.now();
    const current = readLocalStorageLeaseLock(args.key);

    if (!current || current.expiresAtMs <= now || current.owner === owner) {
      safeLocalStorageSetJson(args.key, {
        owner,
        expiresAtMs: now + ttlMs,
      });

      const confirmed = readLocalStorageLeaseLock(args.key);
      if (confirmed?.owner === owner) break;
    }

    if (now - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for lock: ${args.key}`);
    }

    await sleep(waitMs);
  }

  const heartbeat = globalThis.setInterval(
    () => {
      const current = readLocalStorageLeaseLock(args.key);
      if (current?.owner !== owner) return;
      safeLocalStorageSetJson(args.key, {
        owner,
        expiresAtMs: Date.now() + ttlMs,
      });
    },
    Math.max(250, Math.floor(ttlMs / 3)),
  );

  try {
    return await args.fn();
  } finally {
    globalThis.clearInterval(heartbeat);
    const current = readLocalStorageLeaseLock(args.key);
    if (current?.owner === owner) {
      safeLocalStorageRemove(args.key);
    }
  }
};

export const getInitialDisplayCurrency = (): DisplayCurrency => {
  try {
    const allowedCurrencies = getInitialAllowedDisplayCurrencies();
    const stored = parseDisplayCurrency(
      safeLocalStorageGet(DISPLAY_CURRENCY_STORAGE_KEY),
    );
    if (stored && allowedCurrencies.includes(stored)) return stored;

    const legacyDefault =
      safeLocalStorageGet(UNIT_TOGGLE_STORAGE_KEY) === "1"
        ? "btc"
        : getDefaultDisplayCurrency();

    if (allowedCurrencies.includes(legacyDefault)) return legacyDefault;

    return allowedCurrencies[0] ?? legacyDefault;
  } catch {
    return getDefaultDisplayCurrency();
  }
};

export const getInitialAllowedDisplayCurrencies = (): DisplayCurrency[] => {
  try {
    const rawStored = safeLocalStorageGet(
      DISPLAY_ALLOWED_CURRENCIES_STORAGE_KEY,
    );
    if (rawStored) {
      const parsed: unknown = JSON.parse(rawStored);
      if (Array.isArray(parsed)) {
        const fallbackCurrency = getDefaultDisplayCurrency();
        const parsedCurrencies = parsed.filter(
          (value): value is string => typeof value === "string",
        );
        return normalizeAllowedDisplayCurrencies(
          parsedCurrencies,
          fallbackCurrency,
        );
      }
    }

    const storedCurrency = parseDisplayCurrency(
      safeLocalStorageGet(DISPLAY_CURRENCY_STORAGE_KEY),
    );
    const legacyDefault =
      storedCurrency ??
      (safeLocalStorageGet(UNIT_TOGGLE_STORAGE_KEY) === "1"
        ? "btc"
        : getDefaultDisplayCurrency());

    return normalizeAllowedDisplayCurrencies(
      getDefaultAllowedDisplayCurrencies().concat(legacyDefault),
      legacyDefault,
    );
  } catch {
    return getDefaultAllowedDisplayCurrencies();
  }
};

export const getInitialPayWithCashuEnabled = (): boolean => {
  try {
    const raw = safeLocalStorageGet(PAY_WITH_CASHU_STORAGE_KEY);
    const v = String(raw ?? "").trim();
    // Default: enabled.
    if (!v) return true;
    return v === "1";
  } catch {
    return true;
  }
};

export const getInitialCashuAutoswapEnabled = (): boolean => {
  try {
    const raw = safeLocalStorageGet(CASHU_AUTOSWAP_STORAGE_KEY);
    const v = String(raw ?? "").trim();
    // Opt-in: keep an explicitly stored preference, otherwise stay disabled.
    if (!v) return false;
    return v === "1";
  } catch {
    return false;
  }
};

export const getInitialShowProfileQrOnTiltEnabled = (): boolean => {
  try {
    return safeLocalStorageGet(SHOW_PROFILE_QR_ON_TILT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const getInitialLightningInvoiceAutoPayLimit = (): number => {
  try {
    const raw = safeLocalStorageGet(
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

export const getInitialBankPaymentOfferRecipientCount = (
  fallback: number,
): number => {
  try {
    const raw = safeLocalStorageGet(
      BANK_PAYMENT_OFFER_RECIPIENT_COUNT_STORAGE_KEY,
    );
    const parsed = Number.parseInt(String(raw ?? "").trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
};

export const getInitialNostrNsec = (): string | null => {
  try {
    const raw = safeLocalStorageGet(NOSTR_NSEC_STORAGE_KEY);
    const v = String(raw ?? "").trim();
    return v ? v : null;
  } catch {
    return null;
  }
};

export const getInitialNostrIdentitySource = (): "custom" | "derived" => {
  try {
    const raw = safeLocalStorageGet(NOSTR_IDENTITY_SOURCE_STORAGE_KEY);
    return String(raw ?? "").trim() === "custom" ? "custom" : "derived";
  } catch {
    return "derived";
  }
};

export const getInitialNostrIdentitySwitchedAtSec = (): number | null => {
  try {
    const raw = safeLocalStorageGet(NOSTR_IDENTITY_SWITCHED_AT_SEC_STORAGE_KEY);
    const parsed = Number.parseInt(String(raw ?? "").trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
};
