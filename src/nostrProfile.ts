type NostrEvent = {
  created_at?: number;
  content: string;
};

export type NostrProfileMetadata = {
  name?: string;
  displayName?: string;
  lud16?: string;
  lud06?: string;
  picture?: string;
  image?: string;
};

let nostrToolsPromise: Promise<typeof import("nostr-tools")> | null = null;

const getNostrTools = () => {
  if (!nostrToolsPromise) nostrToolsPromise = import("nostr-tools");
  return nostrToolsPromise;
};

export const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

const STORAGE_PICTURE_PREFIX = "linky_nostr_profile_picture_v1:";
const STORAGE_METADATA_PREFIX = "linky_nostr_profile_metadata_v1:";

type CachedValue = {
  url: string | null;
  fetchedAt: number;
};

// Negative cache (null results) should be short; relays can be slow/unreliable.
const PICTURE_NONE_TTL_MS = 2 * 60 * 1000;
const METADATA_NONE_TTL_MS = 2 * 60 * 1000;

const now = () => Date.now();

const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const loadCachedProfilePicture = (
  npub: string
): CachedValue | undefined => {
  try {
    const raw = localStorage.getItem(STORAGE_PICTURE_PREFIX + npub);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedValue;
    if (!parsed || typeof parsed !== "object") return undefined;

    const url = "url" in parsed ? (parsed as CachedValue).url : undefined;
    const fetchedAt =
      "fetchedAt" in parsed ? (parsed as CachedValue).fetchedAt : undefined;

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
  metadata: NostrProfileMetadata | null;
  fetchedAt: number;
};

export const loadCachedProfileMetadata = (
  npub: string
): CachedMetadataValue | undefined => {
  try {
    const raw = localStorage.getItem(STORAGE_METADATA_PREFIX + npub);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedMetadataValue;
    if (!parsed || typeof parsed !== "object") return undefined;

    const fetchedAt =
      "fetchedAt" in parsed ? (parsed as CachedMetadataValue).fetchedAt : null;
    if (typeof fetchedAt !== "number") return undefined;

    const metadata =
      "metadata" in parsed ? (parsed as CachedMetadataValue).metadata : null;
    if (!(metadata === null || (typeof metadata === "object" && metadata))) {
      return undefined;
    }

    if (metadata === null && now() - fetchedAt > METADATA_NONE_TTL_MS)
      return undefined;

    return {
      fetchedAt,
      metadata: metadata as NostrProfileMetadata | null,
    };
  } catch {
    return undefined;
  }
};

export const saveCachedProfileMetadata = (
  npub: string,
  metadata: NostrProfileMetadata | null
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
  options?: { signal?: AbortSignal }
): Promise<NostrProfileMetadata | null> => {
  const trimmed = npub.trim();
  if (!trimmed) return null;
  if (options?.signal?.aborted) return null;

  const { SimplePool, nip19 } = await getNostrTools();

  let pubkey: string;
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "npub") return null;
    pubkey = decoded.data as string;
  } catch {
    return null;
  }

  const pool = new SimplePool();

  try {
    const events = await pool.querySync(
      NOSTR_RELAYS,
      { kinds: [0], authors: [pubkey], limit: 5 },
      { maxWait: 5000 }
    );

    const newest = (events as NostrEvent[])
      .slice()
      .sort(
        (a: NostrEvent, b: NostrEvent) =>
          (b.created_at ?? 0) - (a.created_at ?? 0)
      )[0];

    if (!newest?.content) return null;

    let raw: unknown;
    try {
      raw = JSON.parse(newest.content);
    } catch {
      return null;
    }

    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;

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
    pool.close(NOSTR_RELAYS);
  }
};

export const fetchNostrProfilePicture = async (
  npub: string,
  options?: { signal?: AbortSignal }
): Promise<string | null> => {
  const cached = loadCachedProfileMetadata(npub);
  let metadata = cached?.metadata;
  if (metadata == null) {
    metadata = await fetchNostrProfileMetadata(npub, options);
    saveCachedProfileMetadata(npub, metadata);
  }

  const picture = metadata?.picture;
  if (isHttpUrl(picture)) return picture;

  const image = metadata?.image;
  if (isHttpUrl(image)) return image;

  return null;
};
