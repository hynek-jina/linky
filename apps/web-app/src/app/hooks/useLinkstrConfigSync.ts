import {
  identityFromNsec,
  InboxCursorStore,
  OutboxStore,
  RelayUrl,
} from "@linky/linkstr";
import {
  linkstrConfigAtom,
  useAtomSet,
  type LinkstrConfig,
} from "@linky/linkstr-react";
import { Schema } from "effect";
import React from "react";
import { NOSTR_RELAYS } from "../../utils/nostrRelays";

const isRelayUrl = Schema.is(RelayUrl);

const OUTBOX_STORAGE_KEY = "linky.outbox";
const INBOX_CURSOR_STORAGE_KEY_PREFIX = "linky.inbox_cursor";

export const buildLinkstrConfig = (
  currentNsec: string | null,
  fetchRelays: readonly string[],
): LinkstrConfig | null => {
  if (!currentNsec) return null;
  const identity = identityFromNsec(currentNsec.trim());
  if (!identity) return null;
  return {
    secretKey: identity.secretKey,
    readRelays: fetchRelays.filter(isRelayUrl),
    // Writes stay on the default relay set for now, matching the legacy
    // publish paths; widening writes to user relays is a separate decision.
    writeRelays: NOSTR_RELAYS.filter(isRelayUrl),
    outboxStore: OutboxStore.fromStringStorage(
      localStorage,
      OUTBOX_STORAGE_KEY,
    ),
    inboxCursorStore: InboxCursorStore.fromStringStorage(
      localStorage,
      `${INBOX_CURSOR_STORAGE_KEY_PREFIX}.${identity.pubkey}`,
    ),
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
