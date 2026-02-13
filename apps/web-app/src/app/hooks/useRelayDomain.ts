import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../nostrProfile";
import { navigateTo } from "../../hooks/useRouting";
import type { Route } from "../../types/route";
import { getSharedAppNostrPool } from "../lib/nostrPool";

interface UseRelayDomainParams {
  currentNpub: string | null;
  currentNsec: string | null;
  route: Route;
  setStatus: (value: string | null) => void;
  t: (key: string) => string;
}

interface UseRelayDomainResult {
  canSaveNewRelay: boolean;
  connectedRelayCount: number;
  newRelayUrl: string;
  nostrFetchRelays: string[];
  nostrRelayOverallStatus: "connected" | "checking" | "disconnected";
  pendingRelayDeleteUrl: string | null;
  relayStatusByUrl: Record<string, "checking" | "connected" | "disconnected">;
  relayUrls: string[];
  requestDeleteSelectedRelay: () => void;
  saveNewRelay: () => void;
  selectedRelayUrl: string | null;
  setNewRelayUrl: React.Dispatch<React.SetStateAction<string>>;
}

export const useRelayDomain = ({
  currentNpub,
  currentNsec,
  route,
  setStatus,
  t,
}: UseRelayDomainParams): UseRelayDomainResult => {
  const [newRelayUrl, setNewRelayUrl] = React.useState<string>("");
  const [relayStatusByUrl, setRelayStatusByUrl] = React.useState<
    Record<string, "checking" | "connected" | "disconnected">
  >(() => ({}));
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

  React.useEffect(() => {
    if (!currentNpub) return;

    const initPush = async () => {
      try {
        const {
          isPushRegistered,
          registerPushNotifications,
          updatePushSubscriptionRelays,
        } = await import("../../utils/pushNotifications");

        if (isPushRegistered()) {
          await updatePushSubscriptionRelays(relayUrls.slice(0, 3));
        } else {
          const granted = await Notification.requestPermission();
          if (granted === "granted") {
            await registerPushNotifications(currentNpub, relayUrls.slice(0, 3));
          }
        }
      } catch (error) {
        console.error("Push notification initialization error:", error);
      }
    };

    if ("serviceWorker" in navigator && "PushManager" in window) {
      void initPush();
    }
  }, [currentNpub, relayUrls]);

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

  const checkRelayConnection = React.useCallback(
    (url: string, timeoutMs = 2500) => {
      return new Promise<boolean>((resolve) => {
        let ws: WebSocket | null = null;
        let done = false;

        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          try {
            ws?.close();
          } catch {
            // ignore
          }
          resolve(ok);
        };

        try {
          ws = new WebSocket(url);
        } catch {
          finish(false);
          return;
        }

        const timer = window.setTimeout(() => finish(false), timeoutMs);

        ws.addEventListener("open", () => {
          window.clearTimeout(timer);
          finish(true);
        });

        ws.addEventListener("error", () => {
          window.clearTimeout(timer);
          finish(false);
        });

        ws.addEventListener("close", () => {
          window.clearTimeout(timer);
          finish(false);
        });
      });
    },
    [],
  );

  React.useEffect(() => {
    if (relayUrls.length === 0) return;

    let cancelled = false;
    setRelayStatusByUrl((prev) => {
      const next = { ...prev };
      for (const url of relayUrls) next[url] = "checking";
      return next;
    });

    (async () => {
      const results = await Promise.all(
        relayUrls.map(async (url) => {
          const ok = await checkRelayConnection(url);
          return [url, ok] as const;
        }),
      );

      if (cancelled) return;
      setRelayStatusByUrl((prev) => {
        const next = { ...prev };
        for (const [url, ok] of results) {
          next[url] = ok ? "connected" : "disconnected";
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [checkRelayConnection, relayUrls]);

  const connectedRelayCount = React.useMemo(() => {
    return relayUrls.reduce((sum, url) => {
      return sum + (relayStatusByUrl[url] === "connected" ? 1 : 0);
    }, 0);
  }, [relayStatusByUrl, relayUrls]);

  const nostrRelayOverallStatus = React.useMemo<
    "connected" | "checking" | "disconnected"
  >(() => {
    if (relayUrls.length === 0) return "disconnected";
    if (connectedRelayCount > 0) return "connected";
    const anyChecking = relayUrls.some(
      (url) => (relayStatusByUrl[url] ?? "checking") === "checking",
    );
    return anyChecking ? "checking" : "disconnected";
  }, [connectedRelayCount, relayStatusByUrl, relayUrls]);

  const selectedRelayUrl = React.useMemo(() => {
    if (route.kind !== "nostrRelay") return null;
    const url = String(route.id ?? "").trim();
    return url || null;
  }, [route]);

  const publishNostrRelayList = React.useCallback(
    async (urls: string[]) => {
      if (!currentNsec) throw new Error("Missing nsec");

      const { finalizeEvent, getPublicKey, nip19 } =
        await import("nostr-tools");

      const decoded = nip19.decode(currentNsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");
      const privBytes = decoded.data;
      const pubkey = getPublicKey(privBytes);

      const cleanUrls = urls.map((u) => String(u ?? "").trim()).filter(Boolean);
      const unique: string[] = [];
      const seen = new Set<string>();
      for (const u of cleanUrls) {
        if (seen.has(u)) continue;
        seen.add(u);
        unique.push(u);
      }

      console.log("[linky][nostr] publish relay list", {
        count: unique.length,
        urls: unique,
      });

      const baseEvent = {
        kind: 10002,
        created_at: Math.floor(Date.now() / 1000),
        tags: unique.map((u) => ["r", u] as string[]),
        content: "",
        pubkey,
      } satisfies UnsignedEvent;

      const signed: NostrToolsEvent = finalizeEvent(baseEvent, privBytes);

      const relaysToUse = (() => {
        const combined = [...NOSTR_RELAYS, ...unique];
        const out: string[] = [];
        const seen2 = new Set<string>();
        for (const u of combined) {
          const s = String(u ?? "").trim();
          if (!s) continue;
          if (seen2.has(s)) continue;
          seen2.add(s);
          out.push(s);
        }
        return out;
      })();

      const pool = await getSharedAppNostrPool();
      const publishResults = await Promise.allSettled(
        pool.publish(relaysToUse, signed),
      );
      const anySuccess = publishResults.some((r) => r.status === "fulfilled");
      if (!anySuccess) {
        const firstError = publishResults.find(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        )?.reason;
        throw new Error(String(firstError ?? "publish failed"));
      }
    },
    [currentNsec],
  );

  const relayProfileSyncForNpubRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!currentNpub) return;

    if (relayProfileSyncForNpubRef.current === currentNpub) return;
    relayProfileSyncForNpubRef.current = currentNpub;

    let cancelled = false;

    const run = async () => {
      try {
        const { nip19 } = await import("nostr-tools");

        const decoded = nip19.decode(currentNpub);
        if (decoded.type !== "npub") return;
        const pubkey = decoded.data;

        const pool = await getSharedAppNostrPool();
        const queryRelays = (() => {
          const combined = [...NOSTR_RELAYS, ...relayUrls];
          const out: string[] = [];
          const seen = new Set<string>();
          for (const u of combined) {
            const s = String(u ?? "").trim();
            if (!s) continue;
            if (seen.has(s)) continue;
            seen.add(s);
            out.push(s);
          }
          return out;
        })();

        const events = await pool.querySync(
          queryRelays,
          { kinds: [10002], authors: [pubkey], limit: 5 },
          { maxWait: 5000 },
        );

        const relayListEvents = Array.isArray(events) ? events : [];

        const newest = relayListEvents
          .slice()
          .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];

        const urls = (() => {
          const tags = Array.isArray(newest?.tags) ? newest.tags : [];
          const extracted: string[] = [];
          for (const tag of tags) {
            if (!Array.isArray(tag)) continue;
            if (tag[0] !== "r") continue;
            const url = String(tag[1] ?? "").trim();
            if (!url) continue;
            extracted.push(url);
          }
          const unique: string[] = [];
          const seen = new Set<string>();
          for (const u of extracted) {
            if (seen.has(u)) continue;
            seen.add(u);
            unique.push(u);
          }
          return unique;
        })();

        console.log("[linky][nostr] relay list", {
          eventId: String(newest?.id ?? ""),
          createdAt: newest?.created_at ?? null,
          urls,
        });

        if (cancelled) return;

        if (urls.length > 0) {
          setRelayUrls(urls);
          return;
        }

        setRelayUrls([...NOSTR_RELAYS]);
        if (!currentNsec) return;
        await publishNostrRelayList(NOSTR_RELAYS);
      } catch (e) {
        console.log("[linky][nostr] relay sync failed", {
          error: String(e ?? "unknown"),
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [currentNpub, currentNsec, publishNostrRelayList, relayUrls]);

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
    setRelayUrls(nextUrls);
    void publishNostrRelayList(nextUrls).catch((e) => {
      console.log("[linky][nostr] publish relay list failed", {
        error: String(e ?? "unknown"),
      });
    });

    setNewRelayUrl("");
    navigateTo({ route: "nostrRelays" });
  }, [newRelayUrl, publishNostrRelayList, relayUrls, setStatus, t]);

  const requestDeleteSelectedRelay = React.useCallback(() => {
    if (route.kind !== "nostrRelay") return;
    if (!selectedRelayUrl) return;
    if (relayUrls.length <= 1) {
      setStatus(`${t("errorPrefix")}: ${t("fillAtLeastOne")}`);
      return;
    }

    if (pendingRelayDeleteUrl === selectedRelayUrl) {
      const nextUrls = relayUrls.filter((u) => u !== selectedRelayUrl);
      setRelayUrls(nextUrls);
      setPendingRelayDeleteUrl(null);
      void publishNostrRelayList(nextUrls).catch((e) => {
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
    pendingRelayDeleteUrl,
    publishNostrRelayList,
    relayUrls,
    route.kind,
    selectedRelayUrl,
    setStatus,
    t,
  ]);

  const canSaveNewRelay = Boolean(String(newRelayUrl ?? "").trim());

  return {
    canSaveNewRelay,
    connectedRelayCount,
    newRelayUrl,
    nostrFetchRelays,
    nostrRelayOverallStatus,
    pendingRelayDeleteUrl,
    relayStatusByUrl,
    relayUrls,
    requestDeleteSelectedRelay,
    saveNewRelay,
    selectedRelayUrl,
    setNewRelayUrl,
  };
};
