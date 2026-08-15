import { RelayUrl } from "@linky/linkstr";
import { Schema } from "effect";

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
