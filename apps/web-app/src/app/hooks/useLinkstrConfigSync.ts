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
  const relays = fetchRelays.filter(isRelayUrl);
  return {
    secretKey: identity.secretKey,
    readRelays: relays,
    writeRelays: relays,
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
