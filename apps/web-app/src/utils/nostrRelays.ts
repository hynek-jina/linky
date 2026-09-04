import { RelayUrl } from "@linky/linkstr";
import { Option, Schema } from "effect";

const isRelayUrl = Schema.is(RelayUrl);

const DEFAULT_NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.0xchat.com",
];

const envRelays = Array.from(
  new Set(
    (import.meta.env.VITE_NOSTR_RELAYS ?? "")
      .split(",")
      .map((url) => url.trim())
      .filter(isRelayUrl),
  ),
);

export const NOSTR_RELAYS =
  envRelays.length > 0 ? envRelays : DEFAULT_NOSTR_RELAYS;

// NIP-50 relays for profile text search; the default read relays do not
// index kind-0 content, so contact search would find nothing without them.
const DEFAULT_NOSTR_SEARCH_RELAYS = [
  "wss://search.nos.today",
  "wss://nostr.wine",
];

const envSearchRelays = Array.from(
  new Set(
    (import.meta.env.VITE_NOSTR_SEARCH_RELAYS ?? "")
      .split(",")
      .map((url) => url.trim())
      .filter(isRelayUrl),
  ),
);

export const NOSTR_SEARCH_RELAYS: ReadonlyArray<RelayUrl> =
  envSearchRelays.length > 0
    ? envSearchRelays
    : DEFAULT_NOSTR_SEARCH_RELAYS.filter(isRelayUrl);

// Startup bootstrap cache of the user's published relay lists (kinds
// 10002/10050), so a cold launch connects to the last known set instead of
// the defaults and rarely needs a runtime rebuild. The signed nostr events
// stay authoritative; the timestamps let a fetch result that is older than
// the cache be recognized as a stale relay response.
const RELAY_CACHE_KEY_PREFIX = "linky.nostr_relays.v1";

const CachedRelayListsSchema = Schema.Struct({
  relayUrls: Schema.Array(Schema.String),
  relaysUpdatedAt: Schema.NullOr(Schema.Number),
  dmRelaysUpdatedAt: Schema.NullOr(Schema.Number),
});

type CachedRelayLists = typeof CachedRelayListsSchema.Type;

const decodeCachedRelayLists = Schema.decodeUnknownOption(
  CachedRelayListsSchema,
);

export const loadCachedRelayLists = (
  pubkey: string,
): CachedRelayLists | null => {
  const raw = localStorage.getItem(`${RELAY_CACHE_KEY_PREFIX}.${pubkey}`);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const decoded = decodeCachedRelayLists(parsed);
  if (Option.isNone(decoded)) return null;
  const relayUrls = Array.from(
    new Set(decoded.value.relayUrls.filter(isRelayUrl)),
  );
  if (relayUrls.length === 0) return null;
  return { ...decoded.value, relayUrls };
};

export const saveCachedRelayLists = (
  pubkey: string,
  lists: CachedRelayLists,
): void => {
  try {
    localStorage.setItem(
      `${RELAY_CACHE_KEY_PREFIX}.${pubkey}`,
      JSON.stringify(lists),
    );
  } catch {
    // Best-effort cache: quota or private-mode failures just skip it.
  }
};
