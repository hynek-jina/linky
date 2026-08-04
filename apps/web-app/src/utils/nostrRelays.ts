export const normalizeRelayUrls = (urls: readonly string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of urls) {
    const url = value.trim();
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    normalized.push(url);
  }

  return normalized;
};

const DEFAULT_NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.0xchat.com",
];

const envRelays = normalizeRelayUrls(
  (import.meta.env.VITE_NOSTR_RELAYS ?? "").split(","),
);

export const NOSTR_RELAYS =
  envRelays.length > 0 ? envRelays : DEFAULT_NOSTR_RELAYS;
