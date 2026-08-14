import { NostrSecretKey, RelayUrl } from "@linky/linkstr";
import {
  linkstrConfigAtom,
  useAtomSet,
  type LinkstrConfig,
} from "@linky/linkstr-react";
import { Schema } from "effect";
import { nip19 } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../utils/nostrRelays";

const isNostrSecretKey = Schema.is(NostrSecretKey);
const isRelayUrl = Schema.is(RelayUrl);

export const buildLinkstrConfig = (
  currentNsec: string | null,
  fetchRelays: readonly string[],
): LinkstrConfig | null => {
  if (!currentNsec) return null;
  let secretKey: Uint8Array;
  try {
    const decoded = nip19.decode(currentNsec.trim());
    if (decoded.type !== "nsec") return null;
    secretKey = decoded.data;
  } catch {
    return null;
  }
  if (!isNostrSecretKey(secretKey)) return null;
  return {
    secretKey,
    readRelays: fetchRelays.filter(isRelayUrl),
    // Writes stay on the default relay set for now, matching the legacy
    // publish paths; widening writes to user relays is a separate decision.
    writeRelays: NOSTR_RELAYS.filter(isRelayUrl),
    inspector: import.meta.env.DEV,
  };
};

/** Keeps the linkstr runtime in sync with the active identity and relay list. */
export const useLinkstrConfigSync = ({
  currentNsec,
  nostrFetchRelays,
}: {
  currentNsec: string | null;
  nostrFetchRelays: readonly string[];
}) => {
  const setLinkstrConfig = useAtomSet(linkstrConfigAtom);
  React.useEffect(() => {
    setLinkstrConfig(buildLinkstrConfig(currentNsec, nostrFetchRelays));
  }, [currentNsec, nostrFetchRelays, setLinkstrConfig]);
};
