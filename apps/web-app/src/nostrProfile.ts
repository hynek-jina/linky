import { getSharedNostrPool } from "./utils/nostrPool";
import { isHttpUrl } from "./utils/validation";
import type { Event as NostrToolsEvent } from "nostr-tools";
import type { JsonRecord } from "./types/json";

export type NostrProfileMetadata = {
  displayName?: string;
  image?: string;
  lud06?: string;
  lud16?: string;
  name?: string;
  picture?: string;
};

let nostrToolsPromise: Promise<typeof import("nostr-tools")> | null = null;

const getNostrTools = () => {
  if (!nostrToolsPromise) nostrToolsPromise = import("nostr-tools");
  return nostrToolsPromise;
};

export const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.0xchat.com",
  "wss://shu01.shugur.net",
];

const STORAGE_PICTURE_PREFIX = "linky_nostr_profile_picture_v1:";
const STORAGE_METADATA_PREFIX = "linky_nostr_profile_metadata_v1:";

const AVATAR_CACHE_NAME = "linky_nostr_avatar_cache_v1";

const isJsonRecord = (value: unknown): value is JsonRecord => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const getCurrentOrigin = (): string | null => {
  try {
    const origin = globalThis.location?.origin;
    if (typeof origin !== "string") return null;
    const trimmed = origin.trim();
    return trimmed || null;
  } catch {
    return null;
  }
};

const canUseCacheStorage = (): boolean => {
  try {
    return typeof caches !== "undefined" && typeof Request !== "undefined";
  } catch {
    return false;
  }
};

const makeAvatarCacheRequest = (npub: string): Request | null => {
  try {
    const origin = getCurrentOrigin();
    if (!origin) return null;
    const url = new URL(
      `/__linky_cache/nostr_avatar/${encodeURIComponent(npub)}`,
      origin,
    );
    return new Request(url.toString());
  } catch {
    return null;
  }
};

export const loadCachedProfileAvatarObjectUrl = async (
  npub: string,
): Promise<string | null> => {
  const trimmed = String(npub ?? "").trim();
  if (!trimmed) return null;
  if (!canUseCacheStorage()) return null;

  const req = makeAvatarCacheRequest(trimmed);
  if (!req) return null;

  try {
    const cache = await caches.open(AVATAR_CACHE_NAME);
    const match = await cache.match(req);
    if (!match) return null;
    const blob = await match.blob();
    if (!blob || blob.size <= 0) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};

export const cacheProfileAvatarFromUrl = async (
  npub: string,
  avatarUrl: string,
  options?: { signal?: AbortSignal },
): Promise<string | null> => {
  const trimmed = String(npub ?? "").trim();
  if (!trimmed) return null;
  if (!isHttpUrl(avatarUrl)) return null;
  if (!canFetchAvatarAsBlob(avatarUrl)) return null;
  if (!canUseCacheStorage()) return null;
  if (options?.signal?.aborted) return null;

  const req = makeAvatarCacheRequest(trimmed);
  if (!req) return null;

  try {
    const init: RequestInit = options?.signal ? { signal: options.signal } : {};
    const res = await fetch(avatarUrl, init);
    if (!res.ok) return null;

    const cache = await caches.open(AVATAR_CACHE_NAME);
    // Store by npub so we can retrieve offline deterministically.
    await cache.put(req, res.clone());

    const blob = await res.blob();
    if (!blob || blob.size <= 0) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
};

export const deleteCachedProfileAvatar = async (
  npub: string,
): Promise<void> => {
  const trimmed = String(npub ?? "").trim();
  if (!trimmed) return;
  if (!canUseCacheStorage()) return;
  const req = makeAvatarCacheRequest(trimmed);
  if (!req) return;

  try {
    const cache = await caches.open(AVATAR_CACHE_NAME);
    await cache.delete(req);
  } catch {
    // ignore
  }
};

type CachedValue = {
  fetchedAt: number;
  url: string | null;
};

// Negative cache (null results) should be short; relays can be slow/unreliable.
const PICTURE_NONE_TTL_MS = 2 * 60 * 1000;
const METADATA_NONE_TTL_MS = 2 * 60 * 1000;

const now = () => Date.now();

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

function canFetchAvatarAsBlob(avatarUrl: string): boolean {
  // Fetching cross-origin images as blobs requires permissive CORS headers.
  // Many image hosts block this (and the browser logs a CORS error).
  // We still show the image via <img src=...>; we only skip blob caching.
  try {
    const url = new URL(avatarUrl);
    const origin = getCurrentOrigin();
    if (origin && url.origin === origin) return true;

    const host = url.hostname.toLowerCase();
    // Used for deterministic defaults.
    if (host === "api.dicebear.com") return true;

    return false;
  } catch {
    return false;
  }
}

export const loadCachedProfilePicture = (
  npub: string,
): CachedValue | undefined => {
  try {
    const raw = localStorage.getItem(STORAGE_PICTURE_PREFIX + npub);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isJsonRecord(parsed)) return undefined;

    const url = parsed.url;
    const fetchedAt = parsed.fetchedAt;

    if (typeof fetchedAt !== "number") return undefined;
    if (!(typeof url === "string" || url === null)) return undefined;

    if (url === null && now() - fetchedAt > PICTURE_NONE_TTL_MS)
      return undefined;

    return { url, fetchedAt };
  } catch {
    return undefined;
  }
};

export const saveCachedProfilePicture = (npub: string, url: string | null) => {
  try {
    const value: CachedValue = { url, fetchedAt: now() };
    localStorage.setItem(STORAGE_PICTURE_PREFIX + npub, JSON.stringify(value));
  } catch {
    // ignore
  }
};

type CachedMetadataValue = {
  fetchedAt: number;
  metadata: NostrProfileMetadata | null;
};

const isNostrProfileMetadata = (
  value: unknown,
): value is NostrProfileMetadata => {
  if (!isJsonRecord(value)) return false;
  return (
    (value.displayName === undefined ||
      typeof value.displayName === "string") &&
    (value.image === undefined || typeof value.image === "string") &&
    (value.lud06 === undefined || typeof value.lud06 === "string") &&
    (value.lud16 === undefined || typeof value.lud16 === "string") &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.picture === undefined || typeof value.picture === "string")
  );
};

export const loadCachedProfileMetadata = (
  npub: string,
): CachedMetadataValue | undefined => {
  try {
    const raw = localStorage.getItem(STORAGE_METADATA_PREFIX + npub);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isJsonRecord(parsed)) return undefined;

    const fetchedAt = parsed.fetchedAt;
    if (typeof fetchedAt !== "number") return undefined;

    const metadata =
      parsed.metadata === undefined ? null : (parsed.metadata ?? null);
    if (!(metadata === null || isNostrProfileMetadata(metadata))) {
      return undefined;
    }

    if (metadata === null && now() - fetchedAt > METADATA_NONE_TTL_MS)
      return undefined;

    return {
      fetchedAt,
      metadata,
    };
  } catch {
    return undefined;
  }
};

export const saveCachedProfileMetadata = (
  npub: string,
  metadata: NostrProfileMetadata | null,
) => {
  try {
    const value: CachedMetadataValue = { metadata, fetchedAt: now() };
    localStorage.setItem(STORAGE_METADATA_PREFIX + npub, JSON.stringify(value));
  } catch {
    // ignore
  }
};

const asTrimmedNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const fetchNostrProfileMetadata = async (
  npub: string,
  options?: { signal?: AbortSignal; relays?: string[] },
): Promise<NostrProfileMetadata | null> => {
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
        { kinds: [0], authors: [pubkey], limit: 5 },
        { maxWait: 8000 },
      );
    } catch {
      return null;
    }

    const newest = events
      .slice()
      .sort(
        (a: NostrToolsEvent, b: NostrToolsEvent) =>
          (b.created_at ?? 0) - (a.created_at ?? 0),
      )[0];

    if (!newest?.content) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(newest.content);
    } catch {
      return null;
    }

    if (!isJsonRecord(raw)) return null;
    const obj = raw;

    const name = asTrimmedNonEmptyString(obj.name);
    const displayName =
      asTrimmedNonEmptyString(obj.display_name) ??
      asTrimmedNonEmptyString(obj.displayName);
    const lud16 = asTrimmedNonEmptyString(obj.lud16);
    const lud06 = asTrimmedNonEmptyString(obj.lud06);

    const picture = asTrimmedNonEmptyString(obj.picture);
    const image = asTrimmedNonEmptyString(obj.image);

    const metadata: NostrProfileMetadata = {
      ...(name ? { name } : {}),
      ...(displayName ? { displayName } : {}),
      ...(lud16 ? { lud16 } : {}),
      ...(lud06 ? { lud06 } : {}),
      ...(picture ? { picture } : {}),
      ...(image ? { image } : {}),
    };

    // If nothing useful, treat as null so we can TTL it.
    if (Object.keys(metadata).length === 0) return null;
    return metadata;
  } finally {
    // Intentionally keep the shared pool open to reduce churn and
    // avoid "WebSocket is already in CLOSING or CLOSED state" noise.
  }
};

export const fetchNostrProfilePicture = async (
  npub: string,
  options?: { signal?: AbortSignal; relays?: string[] },
): Promise<string | null> => {
  const cached = loadCachedProfileMetadata(npub);
  const cachedMeta = cached?.metadata ?? null;

  const cachedPicture = cachedMeta?.picture;
  if (isHttpUrl(cachedPicture)) return cachedPicture;
  const cachedImage = cachedMeta?.image;
  if (isHttpUrl(cachedImage)) return cachedImage;

  // If there's no cached picture, try fetching (important when switching relays).
  const metadata = await fetchNostrProfileMetadata(npub, options);
  saveCachedProfileMetadata(npub, metadata);

  const picture = metadata?.picture;
  if (isHttpUrl(picture)) return picture;

  const image = metadata?.image;
  if (isHttpUrl(image)) return image;

  return null;
};
