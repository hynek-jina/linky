import { RelayListsDraft, RelayUrl } from "@linky/linkstr";
import {
  fetchOwnRelayListsAtom,
  publishRelayListsAtom,
  useAtomSet,
} from "@linky/linkstr-react";
import { Exit, Schema } from "effect";
import React from "react";
import { navigateTo } from "../../hooks/useRouting";
import type { Route } from "../../types/route";
import { NOSTR_RELAYS } from "../../utils/nostrRelays";

interface UseRelayDomainParams {
  currentNpub: string | null;
  currentNsec: string | null;
  networkEnabled: boolean;
  route: Route;
  setStatus: (value: string | null) => void;
  t: (key: string) => string;
}

interface UseRelayDomainResult {
  canSaveNewRelay: boolean;
  newRelayUrl: string;
  nostrFetchRelays: string[];
  pendingRelayDeleteUrl: string | null;
  relayUrls: string[];
  requestDeleteSelectedRelay: () => void;
  saveNewRelay: () => void;
  selectedRelayUrl: string | null;
  setNewRelayUrl: React.Dispatch<React.SetStateAction<string>>;
}

const isRelayUrl = Schema.is(RelayUrl);

function haveSameRelayUrls(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((url, index) => url === right[index]);
}

function relayProfileSyncKey(npub: string, urls: readonly string[]): string {
  return `${npub}|${Array.from(
    new Set(urls.map((relay) => relay.trim()).filter(Boolean)),
  )
    .sort()
    .join(",")}`;
}

export const useRelayDomain = ({
  currentNpub,
  currentNsec,
  networkEnabled,
  route,
  setStatus,
  t,
}: UseRelayDomainParams): UseRelayDomainResult => {
  const [newRelayUrl, setNewRelayUrl] = React.useState<string>("");
  const [relayUrls, setRelayUrls] = React.useState<string[]>(() => [
    ...NOSTR_RELAYS,
  ]);
  const [pendingRelayDeleteUrl, setPendingRelayDeleteUrl] = React.useState<
    string | null
  >(null);
  React.useEffect(() => {
    if (!pendingRelayDeleteUrl) return;
    const timeoutId = window.setTimeout(() => {
      setPendingRelayDeleteUrl(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingRelayDeleteUrl]);

  const nostrFetchRelays = React.useMemo(() => {
    const merged = [...relayUrls, ...NOSTR_RELAYS];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of merged) {
      const url = String(raw ?? "").trim();
      if (!url) continue;
      if (!(url.startsWith("wss://") || url.startsWith("ws://"))) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
    return out;
  }, [relayUrls]);

  const selectedRelayUrl = React.useMemo(() => {
    if (route.kind !== "nostrRelay") return null;
    const url = String(route.id ?? "").trim();
    return url || null;
  }, [route]);

  const publishRelayLists = useAtomSet(publishRelayListsAtom, {
    mode: "promiseExit",
  });

  const publishNostrRelayLists = React.useCallback(
    async (urls: string[]) => {
      if (!currentNsec) throw new Error("Missing nsec");

      const unique = Array.from(
        new Set(urls.map((url) => String(url ?? "").trim())),
      ).filter(isRelayUrl);

      console.log("[linky][nostr] publish relay list", {
        count: unique.length,
        urls: unique,
      });

      const exit = await publishRelayLists(
        new RelayListsDraft({
          relays: unique.map((relay) => ({ relay, marker: null })),
          dmRelays: unique,
        }),
      );
      if (Exit.isFailure(exit)) {
        throw new Error("relay list publish failed");
      }
    },
    [currentNsec, publishRelayLists],
  );

  const fetchOwnRelayLists = useAtomSet(fetchOwnRelayListsAtom, {
    mode: "promiseExit",
  });

  const relayProfileSyncForNpubRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!networkEnabled) return;
    if (!currentNpub || !currentNsec) return;

    const relaySyncKey = relayProfileSyncKey(currentNpub, relayUrls);
    if (relayProfileSyncForNpubRef.current === relaySyncKey) return;

    let cancelled = false;

    const run = async () => {
      try {
        const exit = await fetchOwnRelayLists();
        if (Exit.isFailure(exit)) {
          throw new Error("relay list fetch failed");
        }
        const lists = exit.value;

        const relayListUrls = Array.from(
          new Set((lists.relays ?? []).map((entry) => entry.relay)),
        );
        const inboxRelayUrls = Array.from(new Set(lists.dmRelays ?? []));
        const urls = relayListUrls.length > 0 ? relayListUrls : inboxRelayUrls;

        console.log("[linky][nostr] relay list", {
          inboxUrls: inboxRelayUrls,
          relayCreatedAt: lists.relaysUpdatedAt,
          relayUrls: relayListUrls,
        });

        if (cancelled) return;

        if (urls.length > 0) {
          // Record before setRelayUrls: the state change re-runs this effect,
          // and the recorded key makes that follow-up run a no-op.
          relayProfileSyncForNpubRef.current = relayProfileSyncKey(
            currentNpub,
            urls,
          );
          setRelayUrls(urls);

          if (
            currentNsec &&
            !haveSameRelayUrls(relayListUrls, inboxRelayUrls)
          ) {
            await publishNostrRelayLists(urls);
          }
          return;
        }

        relayProfileSyncForNpubRef.current = relayProfileSyncKey(
          currentNpub,
          NOSTR_RELAYS,
        );
        setRelayUrls([...NOSTR_RELAYS]);
        if (currentNsec) {
          await publishNostrRelayLists(NOSTR_RELAYS);
        }
      } catch (e) {
        relayProfileSyncForNpubRef.current = null;
        console.log("[linky][nostr] relay sync failed", {
          error: String(e ?? "unknown"),
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    currentNpub,
    currentNsec,
    fetchOwnRelayLists,
    networkEnabled,
    publishNostrRelayLists,
    relayUrls,
  ]);

  const saveNewRelay = React.useCallback(() => {
    const url = newRelayUrl.trim();
    if (!url) {
      setStatus(`${t("errorPrefix")}: ${t("fillAtLeastOne")}`);
      return;
    }

    const already = relayUrls.some((u) => u === url);
    if (already) {
      navigateTo({ route: "nostrRelays" });
      return;
    }

    const nextUrls = [...relayUrls, url];
    if (currentNpub) {
      relayProfileSyncForNpubRef.current = relayProfileSyncKey(
        currentNpub,
        nextUrls,
      );
    }
    setRelayUrls(nextUrls);
    void publishNostrRelayLists(nextUrls).catch((e) => {
      console.log("[linky][nostr] publish relay list failed", {
        error: String(e ?? "unknown"),
      });
    });

    setNewRelayUrl("");
    navigateTo({ route: "nostrRelays" });
  }, [
    currentNpub,
    newRelayUrl,
    publishNostrRelayLists,
    relayUrls,
    setStatus,
    t,
  ]);

  const requestDeleteSelectedRelay = React.useCallback(() => {
    if (route.kind !== "nostrRelay") return;
    if (!selectedRelayUrl) return;
    if (relayUrls.length <= 1) {
      setStatus(`${t("errorPrefix")}: ${t("fillAtLeastOne")}`);
      return;
    }

    if (pendingRelayDeleteUrl === selectedRelayUrl) {
      const nextUrls = relayUrls.filter((u) => u !== selectedRelayUrl);
      if (currentNpub) {
        relayProfileSyncForNpubRef.current = relayProfileSyncKey(
          currentNpub,
          nextUrls,
        );
      }
      setRelayUrls(nextUrls);
      setPendingRelayDeleteUrl(null);
      void publishNostrRelayLists(nextUrls).catch((e) => {
        console.log("[linky][nostr] publish relay list failed", {
          error: String(e ?? "unknown"),
        });
      });
      navigateTo({ route: "nostrRelays" });
      return;
    }

    setPendingRelayDeleteUrl(selectedRelayUrl);
    setStatus(t("deleteArmedHint"));
  }, [
    currentNpub,
    pendingRelayDeleteUrl,
    publishNostrRelayLists,
    relayUrls,
    route.kind,
    selectedRelayUrl,
    setStatus,
    t,
  ]);

  const canSaveNewRelay = Boolean(String(newRelayUrl ?? "").trim());

  return {
    canSaveNewRelay,
    newRelayUrl,
    nostrFetchRelays,
    pendingRelayDeleteUrl,
    relayUrls,
    requestDeleteSelectedRelay,
    saveNewRelay,
    selectedRelayUrl,
    setNewRelayUrl,
  };
};
