export const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.0xchat.com",
];

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
