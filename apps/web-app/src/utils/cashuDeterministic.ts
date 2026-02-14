import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { INITIAL_MNEMONIC_STORAGE_KEY } from "../mnemonic";
import { safeLocalStorageGet, safeLocalStorageSetJson } from "./storage";

export type CashuDeterministicSeed = {
  mnemonic: string;
  bip39seed: Uint8Array;
};

const normalizeMintUrlLoose = (value: string): string => {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
};

export const getCashuDeterministicSeedFromStorage =
  (): CashuDeterministicSeed | null => {
    const mnemonic = String(
      safeLocalStorageGet(INITIAL_MNEMONIC_STORAGE_KEY) ?? "",
    ).trim();
    if (!mnemonic) return null;
    if (!validateMnemonic(mnemonic, wordlist)) return null;
    return {
      mnemonic,
      bip39seed: mnemonicToSeedSync(mnemonic),
    };
  };

const CASHU_COUNTER_STORAGE_PREFIX = "linky.cashu.detCounter.v1";
const CASHU_RESTORE_CURSOR_STORAGE_PREFIX = "linky.cashu.restoreCursor.v1";
const CASHU_COUNTER_LOCK_PREFIX = "linky.cashu.detCounterLock.v1";

// In-memory per-keyset queue to ensure we never reuse the same deterministic
// output counter range due to overlapping async mint operations.
// Note: this does not coordinate across browser tabs/windows.
const counterLocks = new Map<string, Promise<void>>();

export const withCashuDeterministicCounterLock = async <T>(
  args: {
    mintUrl: string;
    unit: string;
    keysetId: string;
  },
  fn: () => Promise<T>,
): Promise<T> => {
  const key = makeCounterKey(CASHU_COUNTER_LOCK_PREFIX, args);
  const prev = counterLocks.get(key) ?? Promise.resolve();
  const run = prev.then(() => fn());
  const queue = run.then(
    () => undefined,
    () => undefined,
  );

  counterLocks.set(key, queue);
  try {
    return await run;
  } finally {
    if (counterLocks.get(key) === queue) {
      counterLocks.delete(key);
    }
  }
};

const makeCounterKey = (
  prefix: string,
  args: {
    mintUrl: string;
    unit: string;
    keysetId: string;
  },
): string => {
  const mint = normalizeMintUrlLoose(args.mintUrl);
  const unit = String(args.unit ?? "").trim() || "sat";
  const keysetId = String(args.keysetId ?? "").trim();
  return `${prefix}:${encodeURIComponent(mint)}:${encodeURIComponent(
    unit,
  )}:${encodeURIComponent(keysetId)}`;
};

const getStoredNumber = (key: string, fallback: number): number => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
};

export const getCashuDeterministicCounter = (args: {
  mintUrl: string;
  unit: string;
  keysetId: string;
}): number => {
  const key = makeCounterKey(CASHU_COUNTER_STORAGE_PREFIX, args);
  return getStoredNumber(key, 0);
};

export const bumpCashuDeterministicCounter = (args: {
  mintUrl: string;
  unit: string;
  keysetId: string;
  used: number;
}): number => {
  const key = makeCounterKey(CASHU_COUNTER_STORAGE_PREFIX, args);
  const current = getStoredNumber(key, 0);
  const used = Number.isFinite(args.used)
    ? Math.max(0, Math.floor(args.used))
    : 0;
  const next = current + used;
  // Use raw number for easy read/debug.
  safeLocalStorageSetJson(key, next);
  return next;
};

export const ensureCashuDeterministicCounterAtLeast = (args: {
  mintUrl: string;
  unit: string;
  keysetId: string;
  atLeast: number;
}): number => {
  const key = makeCounterKey(CASHU_COUNTER_STORAGE_PREFIX, args);
  const current = getStoredNumber(key, 0);
  const atLeast =
    Number.isFinite(args.atLeast) && args.atLeast > 0
      ? Math.floor(args.atLeast)
      : 0;
  const next = Math.max(current, atLeast);
  safeLocalStorageSetJson(key, next);
  return next;
};

export const getCashuRestoreCursor = (args: {
  mintUrl: string;
  unit: string;
  keysetId: string;
}): number => {
  const key = makeCounterKey(CASHU_RESTORE_CURSOR_STORAGE_PREFIX, args);
  return getStoredNumber(key, 0);
};

export const setCashuRestoreCursor = (args: {
  mintUrl: string;
  unit: string;
  keysetId: string;
  cursor: number;
}): number => {
  const key = makeCounterKey(CASHU_RESTORE_CURSOR_STORAGE_PREFIX, args);
  const cursor =
    Number.isFinite(args.cursor) && args.cursor > 0
      ? Math.floor(args.cursor)
      : 0;
  safeLocalStorageSetJson(key, cursor);
  return cursor;
};
