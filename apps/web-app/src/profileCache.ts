import { ProfileMetadata } from "@linky/linkstr";
import { Option, Schema } from "effect";
import { isHttpUrl } from "./utils/validation";

/**
 * v2 profile caches, keyed by npub. `updatedAt` is the Nostr event
 * `created_at`, so newest-wins survives across sessions: the watch handler
 * ignores facts that are not strictly newer than what is cached here.
 */

const PROFILE_PREFIX = "linky_nostr_profile_v2:";
const STATUS_PREFIX = "linky_nostr_status_v2:";

const CachedProfile = Schema.Struct({
  metadata: ProfileMetadata,
  updatedAt: Schema.Number,
});
export type CachedProfile = typeof CachedProfile.Type;

const CachedStatus = Schema.Struct({
  /** Raw kind-30315 content; empty string means the status was cleared. */
  content: Schema.String,
  updatedAt: Schema.Number,
});
export type CachedStatus = typeof CachedStatus.Type;

const decodeCachedProfile = Schema.decodeUnknownOption(CachedProfile);
const decodeCachedStatus = Schema.decodeUnknownOption(CachedStatus);

const readJson = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache writes are best effort.
  }
};

export const loadCachedProfile = (npub: string): CachedProfile | null =>
  Option.getOrNull(decodeCachedProfile(readJson(PROFILE_PREFIX + npub)));

export const saveCachedProfile = (
  npub: string,
  metadata: ProfileMetadata,
  updatedAt: number,
): void => {
  writeJson(PROFILE_PREFIX + npub, { metadata, updatedAt });
};

export const loadCachedStatus = (npub: string): CachedStatus | null =>
  Option.getOrNull(decodeCachedStatus(readJson(STATUS_PREFIX + npub)));

export const saveCachedStatus = (
  npub: string,
  content: string,
  updatedAt: number,
): void => {
  writeJson(STATUS_PREFIX + npub, { content, updatedAt });
};

const isDataImageUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== "data:") return false;
    return /^image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(url.pathname);
  } catch {
    return false;
  }
};

export const isDisplayableProfilePictureUrl = (
  value: unknown,
): value is string => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return isHttpUrl(trimmed) || isDataImageUrl(trimmed);
};

export const getProfilePictureUrl = (
  metadata: ProfileMetadata | null | undefined,
): string | null => {
  const picture = metadata?.picture;
  return isDisplayableProfilePictureUrl(picture) ? picture.trim() : null;
};

// Avatar blobs live in CacheStorage so they render offline; keyed by npub.

const AVATAR_CACHE_NAME = "linky_nostr_avatar_cache_v1";

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

const canFetchAvatarAsBlob = (avatarUrl: string): boolean => {
  // Fetching cross-origin images as blobs requires permissive CORS headers.
  // Many image hosts block this; those avatars render via <img src> only.
  try {
    const url = new URL(avatarUrl);
    const origin = getCurrentOrigin();
    if (origin && url.origin === origin) return true;
    // Used for deterministic default avatars.
    return url.hostname.toLowerCase() === "api.dicebear.com";
  } catch {
    return false;
  }
};

export const loadCachedProfileAvatarObjectUrl = async (
  npub: string,
): Promise<string | null> => {
  const trimmed = npub.trim();
  if (!trimmed || !canUseCacheStorage()) return null;

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
): Promise<string | null> => {
  const trimmed = npub.trim();
  if (!trimmed) return null;
  if (!isHttpUrl(avatarUrl)) return null;
  if (!canFetchAvatarAsBlob(avatarUrl)) return null;
  if (!canUseCacheStorage()) return null;

  const req = makeAvatarCacheRequest(trimmed);
  if (!req) return null;

  try {
    const res = await fetch(avatarUrl);
    if (!res.ok) return null;

    const cache = await caches.open(AVATAR_CACHE_NAME);
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
  const trimmed = npub.trim();
  if (!trimmed || !canUseCacheStorage()) return;
  const req = makeAvatarCacheRequest(trimmed);
  if (!req) return;

  try {
    const cache = await caches.open(AVATAR_CACHE_NAME);
    await cache.delete(req);
  } catch {
    // ignore
  }
};
