import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { NOSTR_RELAYS } from "./nostrProfile";
import { getSharedNostrPool } from "./utils/nostrPool";

export const PROFILE_STATUS_CURRENCIES = ["BTC", "CZK", "USD"] as const;
export const STATUS_FILTER_PREFIX = "status:";

export type ProfileStatusCurrency = (typeof PROFILE_STATUS_CURRENCIES)[number];

type CachedStatusValue = {
  fetchedAt: number;
  status: string | null;
};

let nostrToolsPromise: Promise<typeof import("nostr-tools")> | null = null;

const STORAGE_STATUS_PREFIX = "linky_nostr_status_v1:";
const STATUS_NONE_TTL_MS = 2 * 60 * 1000;

const now = () => Date.now();

const getNostrTools = () => {
  if (!nostrToolsPromise) nostrToolsPromise = import("nostr-tools");
  return nostrToolsPromise;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const normalizeRelayUrls = (urls: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of urls) {
    const url = String(raw ?? "").trim();
    if (!url) continue;
    if (!(url.startsWith("wss://") || url.startsWith("ws://"))) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }

  return out;
};

const normalizeStatusText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const CURRENCY_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;

const parseCurrencyStatusCodes = (
  status: string | null | undefined,
): string[] | null => {
  const normalizedStatus = normalizeStatusText(status);
  if (!normalizedStatus) return null;

  const parts = normalizedStatus
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const uniqueParts = [...new Set(parts)];
  if (uniqueParts.length !== parts.length) return null;
  if (!uniqueParts.every((part) => CURRENCY_CODE_PATTERN.test(part))) {
    return null;
  }

  return uniqueParts;
};

const parseLinkyProfileExchangeStatus = (
  status: string | null | undefined,
): ProfileStatusCurrency[] | null => {
  const parts = parseCurrencyStatusCodes(status);
  if (!parts) return null;
  if (parts.length === 0) return null;

  const validCurrencies = new Set<string>(PROFILE_STATUS_CURRENCIES);
  if (!parts.every((part) => validCurrencies.has(part))) return null;

  return parts.filter((part): part is ProfileStatusCurrency =>
    validCurrencies.has(part),
  );
};

const getExpirationTimestamp = (event: NostrToolsEvent): number | null => {
  for (const tag of event.tags) {
    if (tag[0] !== "expiration") continue;
    const expiration = Number(tag[1] ?? "");
    if (!Number.isFinite(expiration) || expiration <= 0) return null;
    return expiration;
  }

  return null;
};

const isExpiredStatusEvent = (event: NostrToolsEvent): boolean => {
  const expiration = getExpirationTimestamp(event);
  if (expiration === null) return false;
  return expiration <= Math.floor(Date.now() / 1000);
};

const hasGeneralStatusIdentifier = (event: NostrToolsEvent): boolean => {
  return event.tags.some(
    (tag) => Array.isArray(tag) && tag[0] === "d" && tag[1] === "general",
  );
};

export const parseProfileExchangeStatusCurrencies = (
  status: string | null | undefined,
): ProfileStatusCurrency[] => {
  return parseLinkyProfileExchangeStatus(status) ?? [];
};

export const formatDisplayGeneralStatus = (params: {
  status: string | null | undefined;
  providesLabel: string;
}): string | null => {
  const normalizedStatus = normalizeStatusText(params.status);
  if (!normalizedStatus) return null;

  const currencyCodes = parseCurrencyStatusCodes(normalizedStatus);
  if (!currencyCodes || currencyCodes.length === 0) {
    return normalizedStatus;
  }

  return `${params.providesLabel} ${currencyCodes.join(", ")}`;
};

export const extractStatusFilterCurrencies = (
  status: string | null | undefined,
): string[] => {
  return parseCurrencyStatusCodes(status) ?? [];
};

export const buildStatusFilterValue = (currency: string): string => {
  return `${STATUS_FILTER_PREFIX}${String(currency ?? "")
    .trim()
    .toUpperCase()}`;
};

export const isStatusFilterValue = (
  value: string | null | undefined,
): boolean => {
  return String(value ?? "").startsWith(STATUS_FILTER_PREFIX);
};

export const parseStatusFilterValue = (
  value: string | null | undefined,
): string | null => {
  if (!isStatusFilterValue(value)) return null;
  const currency = String(value ?? "")
    .slice(STATUS_FILTER_PREFIX.length)
    .trim();
  return currency || null;
};

export const buildProfileExchangeStatus = (
  currencies: readonly ProfileStatusCurrency[],
): string | null => {
  const selected = PROFILE_STATUS_CURRENCIES.filter((currency) =>
    currencies.includes(currency),
  );

  return selected.length > 0 ? selected.join(", ") : null;
};

export const loadCachedNostrGeneralStatus = (
  npub: string,
): CachedStatusValue | undefined => {
  try {
    const raw = localStorage.getItem(STORAGE_STATUS_PREFIX + npub);
    if (!raw) return undefined;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;

    const fetchedAt = parsed.fetchedAt;
    if (typeof fetchedAt !== "number") return undefined;

    const status =
      parsed.status === undefined ? null : normalizeStatusText(parsed.status);
    if (status === null && now() - fetchedAt > STATUS_NONE_TTL_MS) {
      return undefined;
    }

    return { fetchedAt, status };
  } catch {
    return undefined;
  }
};

export const saveCachedNostrGeneralStatus = (
  npub: string,
  status: string | null,
) => {
  try {
    const value: CachedStatusValue = {
      fetchedAt: now(),
      status: normalizeStatusText(status),
    };
    localStorage.setItem(STORAGE_STATUS_PREFIX + npub, JSON.stringify(value));
  } catch {
    // ignore
  }
};

export const fetchNostrGeneralStatus = async (
  npub: string,
  options?: { signal?: AbortSignal; relays?: string[] },
): Promise<string | null> => {
  const trimmed = npub.trim();
  if (!trimmed) return null;
  if (options?.signal?.aborted) return null;

  const relays = normalizeRelayUrls(
    options?.relays && options.relays.length > 0
      ? options.relays
      : NOSTR_RELAYS,
  );
  if (relays.length === 0) return null;

  const { nip19 } = await getNostrTools();

  let pubkey: string;
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "npub") return null;
    if (typeof decoded.data !== "string") return null;
    pubkey = decoded.data;
  } catch {
    return null;
  }

  const pool = await getSharedNostrPool();

  try {
    let events: NostrToolsEvent[] = [];
    try {
      events = await pool.querySync(
        relays,
        { kinds: [30315], authors: [pubkey], limit: 20 },
        { maxWait: 8000 },
      );
    } catch {
      return null;
    }

    const newest = events
      .slice()
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .find(
        (event) =>
          hasGeneralStatusIdentifier(event) && !isExpiredStatusEvent(event),
      );

    if (!newest) return null;
    return normalizeStatusText(newest.content);
  } finally {
    // Keep the shared pool open.
  }
};

export const publishNostrGeneralStatus = async (params: {
  privBytes: Uint8Array;
  relays: string[];
  status: string | null;
}): Promise<{ anySuccess: boolean; publishedTo: string[] }> => {
  const { privBytes, relays, status } = params;
  const { finalizeEvent, getPublicKey } = await getNostrTools();
  const pubkey = getPublicKey(privBytes);

  const baseEvent = {
    kind: 30315,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["d", "general"]],
    content: normalizeStatusText(status) ?? "",
    pubkey,
  } satisfies UnsignedEvent;

  const signed = finalizeEvent(baseEvent, privBytes);
  const pool = await getSharedNostrPool();
  const publishResults = await Promise.allSettled(pool.publish(relays, signed));
  const anySuccess = publishResults.some(
    (result) => result.status === "fulfilled",
  );

  return {
    anySuccess,
    publishedTo: relays,
  };
};
