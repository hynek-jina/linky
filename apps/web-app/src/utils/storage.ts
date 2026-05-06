import {
  getDefaultAllowedDisplayCurrencies,
  getDefaultDisplayCurrency,
} from "./browserPreferences";
import {
  ALLOW_PROMISES_STORAGE_KEY,
  CASHU_AUTOSWAP_STORAGE_KEY,
  DISPLAY_ALLOWED_CURRENCIES_STORAGE_KEY,
  DISPLAY_CURRENCY_STORAGE_KEY,
  LIGHTNING_INVOICE_AUTO_PAY_LIMIT_SAT,
  LIGHTNING_INVOICE_AUTO_PAY_LIMIT_STORAGE_KEY,
  NOSTR_NSEC_STORAGE_KEY,
  PAY_WITH_CASHU_STORAGE_KEY,
  UNIT_TOGGLE_STORAGE_KEY,
} from "./constants";
import {
  normalizeAllowedDisplayCurrencies,
  parseDisplayCurrency,
  type DisplayCurrency,
} from "./displayAmounts";

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
      localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY),
    );
    if (stored && allowedCurrencies.includes(stored)) return stored;

    const legacyDefault =
      localStorage.getItem(UNIT_TOGGLE_STORAGE_KEY) === "1"
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
    const rawStored = localStorage.getItem(
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
      localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY),
    );
    const legacyDefault =
      storedCurrency ??
      (localStorage.getItem(UNIT_TOGGLE_STORAGE_KEY) === "1"
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
    const raw = localStorage.getItem(PAY_WITH_CASHU_STORAGE_KEY);
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
    const raw = localStorage.getItem(CASHU_AUTOSWAP_STORAGE_KEY);
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
