import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React, { useMemo, useState } from "react";
import "./App.css";
import { parseCashuToken } from "./cashu";
import type { CashuTokenId, ContactId, NostrIdentityId } from "./evolu";
import { evolu, useEvolu } from "./evolu";
import { getInitialLang, persistLang, translations, type Lang } from "./i18n";
import { INITIAL_MNEMONIC_STORAGE_KEY } from "./mnemonic";
import {
  cacheProfileAvatarFromUrl,
  deleteCachedProfileAvatar,
  fetchNostrProfileMetadata,
  fetchNostrProfilePicture,
  loadCachedProfileAvatarObjectUrl,
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  NOSTR_RELAYS,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
  type NostrProfileMetadata,
} from "./nostrProfile";

type ContactFormState = {
  name: string;
  npub: string;
  lnAddress: string;
  group: string;
};

const UNIT_TOGGLE_STORAGE_KEY = "linky_use_btc_symbol";

const getInitialUseBitcoinSymbol = (): boolean => {
  try {
    return localStorage.getItem(UNIT_TOGGLE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const makeEmptyForm = (): ContactFormState => ({
  name: "",
  npub: "",
  lnAddress: "",
  group: "",
});

type Route =
  | { kind: "contacts" }
  | { kind: "settings" }
  | { kind: "profile" }
  | { kind: "wallet" }
  | { kind: "nostrRelays" }
  | { kind: "nostrRelay"; id: string }
  | { kind: "nostrRelayNew" }
  | { kind: "contactNew" }
  | { kind: "contact"; id: ContactId }
  | { kind: "contactEdit"; id: ContactId }
  | { kind: "contactPay"; id: ContactId }
  | { kind: "chat"; id: ContactId };

const parseRouteFromHash = (): Route => {
  const hash = globalThis.location?.hash ?? "";
  if (hash === "#") return { kind: "contacts" };
  if (hash === "#settings") return { kind: "settings" };
  if (hash === "#profile") return { kind: "profile" };
  if (hash === "#wallet") return { kind: "wallet" };
  if (hash === "#nostr-relays") return { kind: "nostrRelays" };
  if (hash === "#nostr-relay/new") return { kind: "nostrRelayNew" };

  const relayPrefix = "#nostr-relay/";
  if (hash.startsWith(relayPrefix)) {
    const rest = hash.slice(relayPrefix.length);
    const id = decodeURIComponent(String(rest ?? "")).trim();
    if (id) return { kind: "nostrRelay", id };
  }

  const chatPrefix = "#chat/";
  if (hash.startsWith(chatPrefix)) {
    const rest = hash.slice(chatPrefix.length);
    const id = decodeURIComponent(String(rest ?? "")).trim();
    if (id) return { kind: "chat", id: id as ContactId };
  }

  if (hash === "#contact/new") return { kind: "contactNew" };

  const contactPrefix = "#contact/";
  if (hash.startsWith(contactPrefix)) {
    const rest = hash.slice(contactPrefix.length);
    const [rawId, rawSub] = rest.split("/");
    const id = decodeURIComponent(String(rawId ?? "")).trim();
    const sub = String(rawSub ?? "").trim();

    if (id) {
      if (sub === "edit") return { kind: "contactEdit", id: id as ContactId };
      if (sub === "pay") return { kind: "contactPay", id: id as ContactId };
      return { kind: "contact", id: id as ContactId };
    }
  }

  return { kind: "contacts" };
};

const App = () => {
  const { insert, update } = useEvolu();

  const NO_GROUP_FILTER = "__linky_no_group__";

  const [form, setForm] = useState<ContactFormState>(makeEmptyForm());
  const [editingId, setEditingId] = useState<ContactId | null>(null);
  const [route, setRoute] = useState<Route>(() => parseRouteFromHash());
  const [status, setStatus] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<ContactId | null>(
    null
  );
  const [pendingCashuDeleteId, setPendingCashuDeleteId] =
    useState<CashuTokenId | null>(null);
  const [pendingRelayDeleteUrl, setPendingRelayDeleteUrl] = useState<
    string | null
  >(null);
  const [isPasteArmed, setIsPasteArmed] = useState(false);
  const [isNostrPasteArmed, setIsNostrPasteArmed] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const [useBitcoinSymbol, setUseBitcoinSymbol] = useState<boolean>(() =>
    getInitialUseBitcoinSymbol()
  );
  const [owner, setOwner] = useState<Awaited<typeof evolu.appOwner> | null>(
    null
  );

  const [nostrPictureByNpub, setNostrPictureByNpub] = useState<
    Record<string, string | null>
  >(() => ({}));

  const avatarObjectUrlsByNpubRef = React.useRef<Map<string, string>>(
    new Map()
  );

  const rememberBlobAvatarUrl = React.useCallback(
    (npub: string, url: string | null): string | null => {
      const key = String(npub ?? "").trim();
      if (!key) return url;

      const existing = avatarObjectUrlsByNpubRef.current.get(key);

      if (url && url.startsWith("blob:")) {
        if (existing && existing !== url) {
          try {
            URL.revokeObjectURL(existing);
          } catch {
            // ignore
          }
        }
        avatarObjectUrlsByNpubRef.current.set(key, url);
        return url;
      }

      if (existing) {
        try {
          URL.revokeObjectURL(existing);
        } catch {
          // ignore
        }
        avatarObjectUrlsByNpubRef.current.delete(key);
      }

      return url;
    },
    []
  );

  React.useEffect(() => {
    return () => {
      for (const url of avatarObjectUrlsByNpubRef.current.values()) {
        if (!url || !url.startsWith("blob:")) continue;
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      avatarObjectUrlsByNpubRef.current.clear();
    };
  }, []);

  const [cashuDraft, setCashuDraft] = useState("");
  const cashuDraftRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [cashuIsBusy, setCashuIsBusy] = useState(false);

  const [defaultMintUrl, setDefaultMintUrl] = useState<string | null>(null);

  const [newRelayUrl, setNewRelayUrl] = useState<string>("");
  const [relayStatusByUrl, setRelayStatusByUrl] = useState<
    Record<string, "checking" | "connected" | "disconnected">
  >(() => ({}));

  const [payAmount, setPayAmount] = useState<string>("");

  const [derivedNostrIdentity, setDerivedNostrIdentity] = useState<{
    nsec: string;
    npub: string;
  } | null>(null);

  const [chatDraft, setChatDraft] = useState<string>("");
  const chatSeenWrapIdsRef = React.useRef<Set<string>>(new Set());

  const [myProfileName, setMyProfileName] = useState<string | null>(null);
  const [myProfilePicture, setMyProfilePicture] = useState<string | null>(null);
  const [myProfileQr, setMyProfileQr] = useState<string | null>(null);
  const [myProfileLnAddress, setMyProfileLnAddress] = useState<string | null>(
    null
  );
  const [myProfileMetadata, setMyProfileMetadata] =
    useState<NostrProfileMetadata | null>(null);

  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [profileEditName, setProfileEditName] = useState<string>("");
  const [profileEditLnAddress, setProfileEditLnAddress] = useState<string>("");

  const npubCashClaimInFlightRef = React.useRef(false);

  const nostrInFlight = React.useRef<Set<string>>(new Set());
  const nostrMetadataInFlight = React.useRef<Set<string>>(new Set());

  const t = <K extends keyof typeof translations.cs>(key: K) =>
    translations[lang][key];

  const getInitials = (name: string) => {
    const normalized = name.trim();
    if (!normalized) return "?";
    const parts = normalized.split(/\s+/).filter(Boolean);
    const letters = parts
      .slice(0, 2)
      .map((part) => part.slice(0, 1).toUpperCase());
    return letters.join("") || "?";
  };

  const getBestNostrName = (metadata: {
    displayName?: string;
    name?: string;
  }): string | null => {
    const display = String(metadata.displayName ?? "").trim();
    if (display) return display;
    const name = String(metadata.name ?? "").trim();
    if (name) return name;
    return null;
  };

  const formatShortNpub = (npub: string): string => {
    const trimmed = String(npub ?? "").trim();
    if (!trimmed) return "";
    if (trimmed.length <= 18) return trimmed;
    return `${trimmed.slice(0, 10)}…${trimmed.slice(-6)}`;
  };

  const contactNameCollator = useMemo(
    () =>
      new Intl.Collator(lang, {
        usage: "sort",
        numeric: true,
        sensitivity: "variant",
      }),
    [lang]
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat(lang), [lang]);
  const formatInteger = (value: number) =>
    numberFormatter.format(
      Number.isFinite(value) ? Math.trunc(value) : Math.trunc(0)
    );

  React.useEffect(() => {
    const onHashChange = () => setRoute(parseRouteFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  React.useEffect(() => {
    // Reset pay amount when leaving the pay page.
    if (route.kind !== "contactPay") {
      setPayAmount("");
    }
  }, [route.kind]);

  const navigateToContacts = () => {
    window.location.assign("#");
  };

  const navigateToSettings = () => {
    window.location.assign("#settings");
  };

  const navigateToContact = (id: ContactId) => {
    window.location.assign(`#contact/${encodeURIComponent(String(id))}`);
  };

  const navigateToContactEdit = (id: ContactId) => {
    window.location.assign(`#contact/${encodeURIComponent(String(id))}/edit`);
  };

  const navigateToContactPay = (id: ContactId) => {
    window.location.assign(`#contact/${encodeURIComponent(String(id))}/pay`);
  };

  const navigateToChat = (id: ContactId) => {
    window.location.assign(`#chat/${encodeURIComponent(String(id))}`);
  };

  const navigateToNewContact = () => {
    window.location.assign("#contact/new");
  };

  const navigateToWallet = () => {
    window.location.assign("#wallet");
  };

  const navigateToProfile = () => {
    window.location.assign("#profile");
  };

  const navigateToNostrRelays = () => {
    window.location.assign("#nostr-relays");
  };

  const navigateToNostrRelay = (id: string) => {
    window.location.assign(`#nostr-relay/${encodeURIComponent(id)}`);
  };

  const navigateToNewRelay = () => {
    window.location.assign("#nostr-relay/new");
  };

  React.useEffect(() => {
    evolu.appOwner.then(setOwner);
  }, []);

  React.useEffect(() => {
    persistLang(lang);
    try {
      document.documentElement.lang = lang;
    } catch {
      // ignore
    }
  }, [lang]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        UNIT_TOGGLE_STORAGE_KEY,
        useBitcoinSymbol ? "1" : "0"
      );
    } catch {
      // ignore
    }
  }, [useBitcoinSymbol]);

  React.useEffect(() => {
    if (!pendingDeleteId) return;
    const timeoutId = window.setTimeout(() => {
      setPendingDeleteId(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingDeleteId]);

  React.useEffect(() => {
    if (!pendingCashuDeleteId) return;
    const timeoutId = window.setTimeout(() => {
      setPendingCashuDeleteId(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingCashuDeleteId]);

  React.useEffect(() => {
    if (!pendingRelayDeleteUrl) return;
    const timeoutId = window.setTimeout(() => {
      setPendingRelayDeleteUrl(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingRelayDeleteUrl]);

  React.useEffect(() => {
    if (!isPasteArmed) return;
    const timeoutId = window.setTimeout(() => {
      setIsPasteArmed(false);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [isPasteArmed]);

  React.useEffect(() => {
    if (!isNostrPasteArmed) return;
    const timeoutId = window.setTimeout(() => {
      setIsNostrPasteArmed(false);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [isNostrPasteArmed]);

  React.useEffect(() => {
    if (!status) return;
    const timeoutId = window.setTimeout(() => {
      setStatus(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [status]);

  // Query pro všechny aktivní kontakty
  const contactsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("contact")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAt", "desc")
      ),
    []
  );

  const contacts = useQuery(contactsQuery);

  const nostrIdentityQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("nostrIdentity")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAt", "desc")
      ),
    []
  );

  const nostrIdentities = useQuery(nostrIdentityQuery);
  const storedNostrIdentity = nostrIdentities[0] ?? null;

  const [storedNpubFromNsec, setStoredNpubFromNsec] = useState<string | null>(
    null
  );

  React.useEffect(() => {
    const nsec = String((storedNostrIdentity as any)?.nsec ?? "").trim();
    if (!nsec) {
      setStoredNpubFromNsec(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const { nip19, getPublicKey } = await import("nostr-tools");
        const decoded = nip19.decode(nsec);
        if (decoded.type !== "nsec") return;
        const privBytes = decoded.data as Uint8Array;
        const pubHex = getPublicKey(privBytes);
        const npub = nip19.npubEncode(pubHex);
        if (cancelled) return;
        setStoredNpubFromNsec(npub);
      } catch {
        if (cancelled) return;
        setStoredNpubFromNsec(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [storedNostrIdentity]);

  const storedNsec = String((storedNostrIdentity as any)?.nsec ?? "").trim();
  const defaultNsec = String(derivedNostrIdentity?.nsec ?? "").trim();
  const hasStoredOverride = Boolean(
    storedNsec && defaultNsec && storedNsec !== defaultNsec
  );

  const currentNsec =
    (hasStoredOverride
      ? storedNsec
      : defaultNsec || storedNsec || derivedNostrIdentity?.nsec) ?? null;

  const currentNpub =
    (hasStoredOverride ? storedNpubFromNsec : null) ??
    storedNpubFromNsec ??
    derivedNostrIdentity?.npub ??
    null;

  const [relayUrls, setRelayUrls] = useState<string[]>(() => [...NOSTR_RELAYS]);

  const relayUrlsKey = useMemo(() => relayUrls.join("|"), [relayUrls]);

  const nostrFetchRelays = useMemo(() => {
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
  }, [relayUrlsKey]);

  const nostrFetchRelaysKey = useMemo(
    () => nostrFetchRelays.join("|"),
    [nostrFetchRelays]
  );

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
    []
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
        })
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
  }, [relayUrlsKey, checkRelayConnection, relayUrls]);

  const connectedRelayCount = useMemo(() => {
    return relayUrls.reduce((sum, url) => {
      return sum + (relayStatusByUrl[url] === "connected" ? 1 : 0);
    }, 0);
  }, [relayUrls, relayStatusByUrl]);

  const selectedRelayUrl = useMemo(() => {
    if (route.kind !== "nostrRelay") return null;
    const url = String(route.id ?? "").trim();
    return url || null;
  }, [route]);

  const publishNostrRelayList = React.useCallback(
    async (urls: string[]) => {
      if (!currentNsec) throw new Error("Missing nsec");

      const { SimplePool, finalizeEvent, getPublicKey, nip19 } = await import(
        "nostr-tools"
      );

      const decoded = nip19.decode(currentNsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");
      const privBytes = decoded.data as Uint8Array;
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

      const pool = new SimplePool();
      try {
        const publishResults = await Promise.allSettled(
          pool.publish(relaysToUse, signed)
        );
        const anySuccess = publishResults.some((r) => r.status === "fulfilled");
        if (!anySuccess) {
          const firstError = publishResults.find(
            (r): r is PromiseRejectedResult => r.status === "rejected"
          )?.reason;
          throw new Error(String(firstError ?? "publish failed"));
        }
      } finally {
        pool.close(relaysToUse);
      }
    },
    [currentNsec]
  );

  const relayProfileSyncForNpubRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Source of truth: user's Nostr relay list (kind 10002, NIP-65).
    // If missing, use defaults and publish them when we have a key.
    if (!currentNpub) return;

    if (relayProfileSyncForNpubRef.current === currentNpub) return;
    relayProfileSyncForNpubRef.current = currentNpub;

    let cancelled = false;

    const run = async () => {
      try {
        const { SimplePool, nip19 } = await import("nostr-tools");

        const decoded = nip19.decode(currentNpub);
        if (decoded.type !== "npub") return;
        const pubkey = decoded.data as string;

        const pool = new SimplePool();
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

        try {
          const events = await pool.querySync(
            queryRelays,
            { kinds: [10002], authors: [pubkey], limit: 5 },
            { maxWait: 5000 }
          );

          const newest = (events as any[])
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
        } finally {
          pool.close(queryRelays);
        }
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

  const cashuTokensQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("cashuToken")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAt", "desc")
      ),
    []
  );

  const cashuTokens = useQuery(cashuTokensQuery);

  const cashuTokensAllQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db.selectFrom("cashuToken").selectAll().orderBy("createdAt", "desc")
      ),
    []
  );
  const cashuTokensAll = useQuery(cashuTokensAllQuery);

  React.useEffect(() => {
    // Debug: log Evolu state without secrets.
    // NOTE: Relays and derived npub are Nostr/runtime state, not stored in Evolu.
    console.log("[linky][evolu] snapshot", {
      nostrIdentity: {
        hasStoredIdentityRow: Boolean(storedNostrIdentity?.id),
        hasStoredOverride,
        derivedReady: Boolean(defaultNsec),
        storedEqualsDefault: Boolean(
          storedNsec && defaultNsec && storedNsec === defaultNsec
        ),
        hasNsec: Boolean(currentNsec),
      },
      cashuTokens: cashuTokens.map((t) => ({
        id: String((t as any).id ?? ""),
        mint: String((t as any).mint ?? ""),
        amount: Number((t as any).amount ?? 0) || 0,
        state: String((t as any).state ?? ""),
      })),
      cashuTokensAll: {
        count: cashuTokensAll.length,
        newest10: cashuTokensAll.slice(0, 10).map((t) => ({
          id: String((t as any).id ?? ""),
          mint: String((t as any).mint ?? ""),
          amount: Number((t as any).amount ?? 0) || 0,
          state: String((t as any).state ?? ""),
          isDeleted: Boolean((t as any).isDeleted),
        })),
      },
    });
  }, [
    cashuTokens,
    cashuTokensAll,
    currentNsec,
    storedNostrIdentity?.id,
    hasStoredOverride,
    defaultNsec,
    storedNsec,
  ]);

  const chatContactId = route.kind === "chat" ? route.id : null;

  const chatMessagesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("nostrMessage")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where(
            "contactId",
            "=",
            (chatContactId ?? "__linky_none__") as unknown as ContactId
          )
          .orderBy("createdAtSec", "asc")
      ),
    [chatContactId]
  );

  const chatMessages = useQuery(chatMessagesQuery);

  const cashuBalance = useMemo(() => {
    return cashuTokens.reduce((sum, token) => {
      const state = String(token.state ?? "");
      if (state !== "accepted") return sum;
      const amount = Number((token.amount ?? 0) as unknown as number);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [cashuTokens]);

  const canPayWithCashu = cashuBalance > 0;

  const npubCashLightningAddress = useMemo(() => {
    if (!currentNpub) return null;
    return `${currentNpub}@npub.cash`;
  }, [currentNpub]);

  const effectiveMyLightningAddress =
    myProfileLnAddress ?? npubCashLightningAddress;

  const defaultMintDisplay = useMemo(() => {
    if (!defaultMintUrl) return null;
    try {
      const u = new URL(defaultMintUrl);
      return u.host;
    } catch {
      return defaultMintUrl;
    }
  }, [defaultMintUrl]);

  const makeNip98AuthHeader = React.useCallback(
    async (url: string, method: string, payload?: Record<string, any>) => {
      if (!currentNsec) throw new Error("Missing nsec");
      const { nip19, nip98, finalizeEvent } = await import("nostr-tools");
      const decoded = nip19.decode(currentNsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");
      const privBytes = decoded.data as Uint8Array;

      const token = await nip98.getToken(
        url,
        method,
        async (event) => finalizeEvent(event as any, privBytes),
        true,
        payload
      );
      return token;
    },
    [currentNsec]
  );

  const acceptAndStoreCashuToken = React.useCallback(
    async (tokenText: string) => {
      const tokenRaw = tokenText.trim();
      if (!tokenRaw) return;

      // Parse best-effort metadata for display / fallback.
      const parsed = parseCashuToken(tokenRaw);
      const parsedMint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
      const parsedAmount =
        parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

      try {
        const { acceptCashuToken } = await import("./cashuAccept");
        const accepted = await acceptCashuToken(tokenRaw);
        insert("cashuToken", {
          token: accepted.token as typeof Evolu.NonEmptyString.Type,
          rawToken: tokenRaw as typeof Evolu.NonEmptyString.Type,
          mint: accepted.mint as typeof Evolu.NonEmptyString1000.Type,
          unit: accepted.unit
            ? (accepted.unit as typeof Evolu.NonEmptyString100.Type)
            : null,
          amount:
            accepted.amount > 0
              ? (accepted.amount as typeof Evolu.PositiveInt.Type)
              : null,
          state: "accepted" as typeof Evolu.NonEmptyString100.Type,
          error: null,
        });
        setStatus(t("cashuAccepted"));
      } catch (error) {
        const message = String(error).trim() || "Accept failed";
        insert("cashuToken", {
          token: tokenRaw as typeof Evolu.NonEmptyString.Type,
          rawToken: tokenRaw as typeof Evolu.NonEmptyString.Type,
          mint: parsedMint
            ? (parsedMint as typeof Evolu.NonEmptyString1000.Type)
            : null,
          unit: null,
          amount:
            typeof parsedAmount === "number"
              ? (parsedAmount as typeof Evolu.PositiveInt.Type)
              : null,
          state: "error" as typeof Evolu.NonEmptyString100.Type,
          error: message.slice(0, 1000) as typeof Evolu.NonEmptyString1000.Type,
        });
      }
    },
    [insert, t]
  );

  const deriveNostrIdentityFromMnemonic = React.useCallback(
    async (
      mnemonic: string
    ): Promise<{ nsec: string; npub: string } | null> => {
      const sha256 = async (input: Uint8Array) => {
        const out = await crypto.subtle.digest(
          "SHA-256",
          input as unknown as BufferSource
        );
        return new Uint8Array(out);
      };

      try {
        const { mnemonicToSeedSync } = await import("@scure/bip39");
        const { getPublicKey, nip19 } = await import("nostr-tools");

        const seed = mnemonicToSeedSync(String(mnemonic));
        const prefix = new TextEncoder().encode("linky-nostr-v1:");
        const data = new Uint8Array(prefix.length + seed.length);
        data.set(prefix);
        data.set(seed, prefix.length);

        // Try a couple of variants to guarantee a valid secp256k1 private key.
        for (let attempt = 0; attempt < 5; attempt++) {
          const attemptData = new Uint8Array(data.length + 1);
          attemptData.set(data);
          attemptData.set(new Uint8Array([attempt]), data.length);

          const privBytes = await sha256(attemptData);

          try {
            const pubHex = getPublicKey(privBytes);
            const nsec = nip19.nsecEncode(privBytes);
            const npub = nip19.npubEncode(pubHex);
            return { nsec, npub };
          } catch {
            // try next attempt
          }
        }
      } catch {
        // ignore
      }

      return null;
    },
    []
  );

  React.useEffect(() => {
    // Derive Nostr keys from owner's mnemonic (once available). Do not overwrite stored keys.
    if (!owner?.mnemonic) return;

    let cancelled = false;
    const run = async () => {
      const derived = await deriveNostrIdentityFromMnemonic(
        String(owner.mnemonic)
      );
      if (!derived) return;
      if (cancelled) return;
      setDerivedNostrIdentity(derived);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [deriveNostrIdentityFromMnemonic, owner?.mnemonic]);

  React.useEffect(() => {
    // If we have a stored nsec that equals the default (mnemonic-derived) one,
    // drop it from Evolu so only user-changed keys remain persisted.
    if (!storedNostrIdentity?.id) return;
    const storedNsec = String((storedNostrIdentity as any)?.nsec ?? "").trim();
    if (!storedNsec) return;

    const defaultNsec = String(derivedNostrIdentity?.nsec ?? "").trim();
    if (!defaultNsec) return;
    if (storedNsec !== defaultNsec) return;

    update("nostrIdentity", {
      id: storedNostrIdentity.id as unknown as NostrIdentityId,
      isDeleted: Evolu.sqliteTrue,
    });
  }, [
    derivedNostrIdentity?.nsec,
    storedNostrIdentity?.id,
    storedNostrIdentity?.nsec,
    update,
  ]);

  React.useEffect(() => {
    // Load current user's Nostr profile (name + picture) from relays.
    if (!currentNpub) return;

    const cachedBlobController = new AbortController();
    let cancelledBlob = false;
    void (async () => {
      try {
        const blobUrl = await loadCachedProfileAvatarObjectUrl(currentNpub);
        if (cancelledBlob) return;
        if (blobUrl) {
          setMyProfilePicture(rememberBlobAvatarUrl(currentNpub, blobUrl));
        }
      } catch {
        // ignore
      }
    })();

    const cachedPic = loadCachedProfilePicture(currentNpub);
    if (cachedPic) setMyProfilePicture(cachedPic.url);

    const cachedMeta = loadCachedProfileMetadata(currentNpub);
    if (cachedMeta?.metadata) {
      setMyProfileMetadata(cachedMeta.metadata);
      const bestName = getBestNostrName(cachedMeta.metadata);
      if (bestName) setMyProfileName(bestName);

      const lud16 = String(cachedMeta.metadata.lud16 ?? "").trim();
      const lud06 = String(cachedMeta.metadata.lud06 ?? "").trim();
      const ln = lud16 || lud06;
      if (ln) setMyProfileLnAddress(ln);
    }

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const [picture, metadata] = await Promise.all([
          fetchNostrProfilePicture(currentNpub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          }),
          fetchNostrProfileMetadata(currentNpub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          }),
        ]);

        if (cancelled) return;

        if (picture) {
          // Persist the source URL (for future refresh), but display a cached blob when possible.
          saveCachedProfilePicture(currentNpub, picture);

          const blobUrl = await cacheProfileAvatarFromUrl(
            currentNpub,
            picture,
            { signal: controller.signal }
          );
          if (cancelled) return;
          setMyProfilePicture(
            rememberBlobAvatarUrl(currentNpub, blobUrl || picture)
          );
        }

        if (metadata) {
          saveCachedProfileMetadata(currentNpub, metadata);
          setMyProfileMetadata(metadata);
        }

        const bestName = metadata ? getBestNostrName(metadata) : null;
        if (bestName) setMyProfileName(bestName);

        // Only clear avatar if we positively observed kind-0 metadata without picture/image.
        if (
          metadata &&
          !String(metadata.picture ?? "").trim() &&
          !String(metadata.image ?? "").trim()
        ) {
          saveCachedProfilePicture(currentNpub, null);
          void deleteCachedProfileAvatar(currentNpub);
          rememberBlobAvatarUrl(currentNpub, null);
          setMyProfilePicture(null);
        }

        if (!picture) {
          console.log("[linky][nostr] profile picture missing", {
            npub: currentNpub,
            relays: { count: nostrFetchRelays.length, urls: nostrFetchRelays },
            metadataHasPicture: Boolean(
              String(metadata?.picture ?? "").trim() ||
                String(metadata?.image ?? "").trim()
            ),
          });
        }

        const lud16 = String(metadata?.lud16 ?? "").trim();
        const lud06 = String(metadata?.lud06 ?? "").trim();
        const ln = lud16 || lud06;
        setMyProfileLnAddress(ln || null);
      } catch {
        // ignore
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
      cancelledBlob = true;
      cachedBlobController.abort();
    };
  }, [
    currentNpub,
    nostrFetchRelaysKey,
    rememberBlobAvatarUrl,
    cacheProfileAvatarFromUrl,
  ]);

  React.useEffect(() => {
    // Leave edit mode when leaving the profile screen.
    if (route.kind !== "profile") {
      setIsProfileEditing(false);
    }
  }, [route.kind]);

  React.useEffect(() => {
    // Generate QR code for the current npub on the profile page.
    if (route.kind !== "profile") {
      setMyProfileQr(null);
      return;
    }
    if (!currentNpub) {
      setMyProfileQr(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const QRCode = await import("qrcode");
        const url = await QRCode.toDataURL(currentNpub, {
          margin: 1,
          width: 240,
        });
        if (cancelled) return;
        setMyProfileQr(url);
      } catch {
        if (cancelled) return;
        setMyProfileQr(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [route.kind, currentNpub]);

  React.useEffect(() => {
    // npub.cash integration:
    // - read default mint (preferred mint) for the user
    // - auto-claim pending payments and store them as Cashu tokens
    // Active whenever the effective Lightning address is @npub.cash.
    if (!currentNpub) return;
    if (!currentNsec) return;

    const activeLnAddress = String(
      myProfileLnAddress ?? npubCashLightningAddress ?? ""
    ).trim();
    if (!activeLnAddress) return;
    if (!activeLnAddress.endsWith("@npub.cash")) return;

    let cancelled = false;
    const baseUrl = "https://npub.cash";

    const loadInfo = async () => {
      try {
        const url = `${baseUrl}/api/v1/info`;
        const auth = await makeNip98AuthHeader(url, "GET");
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: auth },
        });
        if (!res.ok) return;
        const data = (await res.json()) as unknown;
        const mintUrl = (() => {
          if (!data || typeof data !== "object") return "";
          const direct = String((data as any).mintUrl ?? "").trim();
          if (direct) return direct;
          const wrapped = (data as any).data;
          if (!wrapped || typeof wrapped !== "object") return "";
          return String(
            (wrapped as any).mintUrl ?? (wrapped as any).mintURL ?? ""
          ).trim();
        })();
        if (cancelled) return;
        if (mintUrl) setDefaultMintUrl(mintUrl);
      } catch {
        // ignore
      }
    };

    const claimOnce = async () => {
      if (npubCashClaimInFlightRef.current) return;
      npubCashClaimInFlightRef.current = true;

      try {
        const url = `${baseUrl}/api/v1/claim`;
        const auth = await makeNip98AuthHeader(url, "GET");
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: auth },
        });
        if (!res.ok) return;
        const json = (await res.json()) as any;
        if (!json || json.error) return;
        if (cancelled) return;

        const tokens: string[] = [];
        const token = String(json.data?.token ?? json.token ?? "").trim();
        if (token) tokens.push(token);
        if (Array.isArray(json.data?.tokens)) {
          for (const t of json.data.tokens) {
            const txt = String(t ?? "").trim();
            if (txt) tokens.push(txt);
          }
        }
        if (tokens.length === 0) return;

        for (const tkn of tokens) {
          if (cancelled) return;
          await acceptAndStoreCashuToken(tkn);
        }
      } catch {
        // ignore
      } finally {
        npubCashClaimInFlightRef.current = false;
      }
    };

    void loadInfo();
    void claimOnce();

    const intervalId = window.setInterval(() => {
      void claimOnce();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    acceptAndStoreCashuToken,
    currentNpub,
    currentNsec,
    makeNip98AuthHeader,
    myProfileLnAddress,
    npubCashLightningAddress,
  ]);

  // Intentionally no automatic publishing of kind-0 profile metadata.
  // We only publish profile changes when the user does so explicitly.

  React.useEffect(() => {
    // Fill missing name / lightning address from Nostr on list page only,
    // so we don't overwrite user's in-progress edits.
    if (route.kind !== "contacts") return;

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const contact of contacts) {
        const npub = String(contact.npub ?? "").trim();
        if (!npub) continue;

        const currentName = String(contact.name ?? "").trim();
        const currentLn = String(contact.lnAddress ?? "").trim();

        const needsName = !currentName;
        const needsLn = !currentLn;
        if (!needsName && !needsLn) continue;

        // Try cached metadata first.
        const cached = loadCachedProfileMetadata(npub);
        if (cached?.metadata) {
          const bestName = getBestNostrName(cached.metadata);
          const lud16 = String(cached.metadata.lud16 ?? "").trim();
          const patch: Partial<{
            name: typeof Evolu.NonEmptyString1000.Type;
            lnAddress: typeof Evolu.NonEmptyString1000.Type;
          }> = {};

          if (needsName && bestName) {
            patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
          }
          if (needsLn && lud16) {
            patch.lnAddress = lud16 as typeof Evolu.NonEmptyString1000.Type;
          }

          if (Object.keys(patch).length > 0) {
            update("contact", { id: contact.id, ...patch });
          }
          continue;
        }

        if (nostrMetadataInFlight.current.has(npub)) continue;
        nostrMetadataInFlight.current.add(npub);

        try {
          const metadata = await fetchNostrProfileMetadata(npub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          });

          saveCachedProfileMetadata(npub, metadata);
          if (cancelled) return;
          if (!metadata) continue;

          const bestName = getBestNostrName(metadata);
          const lud16 = String(metadata.lud16 ?? "").trim();

          const patch: Partial<{
            name: typeof Evolu.NonEmptyString1000.Type;
            lnAddress: typeof Evolu.NonEmptyString1000.Type;
          }> = {};

          if (needsName && bestName) {
            patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
          }
          if (needsLn && lud16) {
            patch.lnAddress = lud16 as typeof Evolu.NonEmptyString1000.Type;
          }

          if (Object.keys(patch).length > 0) {
            update("contact", { id: contact.id, ...patch });
          }
        } catch {
          saveCachedProfileMetadata(npub, null);
          if (cancelled) return;
        } finally {
          nostrMetadataInFlight.current.delete(npub);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [contacts, route.kind, update, nostrFetchRelaysKey]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const uniqueNpubs: string[] = [];
    const seen = new Set<string>();
    for (const contact of contacts) {
      const raw = (contact.npub ?? null) as unknown as string | null;
      const npub = (raw ?? "").trim();
      if (!npub) continue;
      if (seen.has(npub)) continue;
      seen.add(npub);
      uniqueNpubs.push(npub);
    }

    const run = async () => {
      for (const npub of uniqueNpubs) {
        if (nostrPictureByNpub[npub] !== undefined) continue;

        try {
          const blobUrl = await loadCachedProfileAvatarObjectUrl(npub);
          if (cancelled) return;
          if (blobUrl) {
            setNostrPictureByNpub((prev) => ({
              ...prev,
              [npub]: rememberBlobAvatarUrl(npub, blobUrl),
            }));
            continue;
          }
        } catch {
          // ignore
        }

        const cached = loadCachedProfilePicture(npub);
        if (cached) {
          setNostrPictureByNpub((prev) =>
            prev[npub] !== undefined ? prev : { ...prev, [npub]: cached.url }
          );
          continue;
        }

        if (nostrInFlight.current.has(npub)) continue;
        nostrInFlight.current.add(npub);

        try {
          const url = await fetchNostrProfilePicture(npub, {
            signal: controller.signal,
            relays: nostrFetchRelays,
          });
          saveCachedProfilePicture(npub, url);
          if (cancelled) return;

          if (url) {
            const blobUrl = await cacheProfileAvatarFromUrl(npub, url, {
              signal: controller.signal,
            });
            if (cancelled) return;
            setNostrPictureByNpub((prev) => ({
              ...prev,
              [npub]: rememberBlobAvatarUrl(npub, blobUrl || url),
            }));
          } else {
            setNostrPictureByNpub((prev) => ({ ...prev, [npub]: null }));
          }
        } catch {
          saveCachedProfilePicture(npub, null);
          if (cancelled) return;
          setNostrPictureByNpub((prev) => ({ ...prev, [npub]: null }));
        } finally {
          nostrInFlight.current.delete(npub);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    contacts,
    nostrPictureByNpub,
    nostrFetchRelaysKey,
    rememberBlobAvatarUrl,
  ]);

  const { groupNames, ungroupedCount } = useMemo(() => {
    const counts = new Map<string, number>();
    let ungrouped = 0;

    for (const contact of contacts) {
      const raw = (contact.groupName ?? null) as unknown as string | null;
      const normalized = (raw ?? "").trim();
      if (!normalized) {
        ungrouped += 1;
        continue;
      }
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }

    const names = Array.from(counts.entries())
      .sort((a, b) => {
        // First: larger groups first
        if (b[1] !== a[1]) return b[1] - a[1];
        // Tie-breaker: alphabetical
        return a[0].localeCompare(b[0]);
      })
      .map(([name]) => name);

    return { groupNames: names, ungroupedCount: ungrouped };
  }, [contacts]);

  React.useEffect(() => {
    if (!activeGroup) return;
    if (activeGroup === NO_GROUP_FILTER) return;
    if (!groupNames.includes(activeGroup)) setActiveGroup(null);
  }, [activeGroup, groupNames]);

  const visibleContacts = useMemo(() => {
    const filtered = (() => {
      if (!activeGroup) return contacts;
      if (activeGroup === NO_GROUP_FILTER) {
        return contacts.filter((contact) => {
          const raw = (contact.groupName ?? null) as unknown as string | null;
          return !(raw ?? "").trim();
        });
      }
      return contacts.filter((contact) => {
        const raw = (contact.groupName ?? null) as unknown as string | null;
        return (raw ?? "").trim() === activeGroup;
      });
    })();

    return [...filtered].sort((a, b) =>
      contactNameCollator.compare(String(a.name ?? ""), String(b.name ?? ""))
    );
  }, [activeGroup, contactNameCollator, contacts]);

  const selectedContact = useMemo(() => {
    const id =
      route.kind === "contact" ||
      route.kind === "contactEdit" ||
      route.kind === "contactPay" ||
      route.kind === "chat"
        ? route.id
        : null;

    if (!id) return null;
    return contacts.find((c) => c.id === id) ?? null;
  }, [contacts, route]);

  const clearContactForm = () => {
    setForm(makeEmptyForm());
    setEditingId(null);
  };

  const closeContactDetail = () => {
    clearContactForm();
    setPendingDeleteId(null);
    navigateToContacts();
  };

  const openNewContactPage = () => {
    setPendingDeleteId(null);
    setIsPasteArmed(false);
    setPayAmount("");
    setEditingId(null);
    setForm(makeEmptyForm());
    navigateToNewContact();
  };

  const toggleSettings = () => {
    if (route.kind === "settings") {
      navigateToContacts();
    } else {
      navigateToSettings();
    }
    setPendingDeleteId(null);
    setIsPasteArmed(false);
    setPayAmount("");
  };

  const paySelectedContact = async () => {
    if (route.kind !== "contactPay") return;
    if (!selectedContact) return;
    const lnAddress = String(selectedContact.lnAddress ?? "").trim();
    if (!lnAddress) return;
    if (!canPayWithCashu) return;

    const amountSat = Number.parseInt(payAmount.trim(), 10);
    if (!Number.isFinite(amountSat) || amountSat <= 0) {
      setStatus(`${t("errorPrefix")}: ${t("payInvalidAmount")}`);
      return;
    }

    if (amountSat > cashuBalance) {
      setStatus(t("payInsufficient"));
      return;
    }

    if (cashuIsBusy) return;
    setCashuIsBusy(true);

    try {
      setStatus(t("payFetchingInvoice"));
      const { fetchLnurlInvoiceForLightningAddress } = await import(
        "./lnurlPay"
      );
      const invoice = await fetchLnurlInvoiceForLightningAddress(
        lnAddress,
        amountSat
      );

      setStatus(t("payPaying"));

      // Try mints (largest balance first) until one succeeds.
      const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
      for (const row of cashuTokens) {
        if (String(row.state ?? "") !== "accepted") continue;
        const mint = String(row.mint ?? "").trim();
        if (!mint) continue;
        const tokenText = String(row.token ?? "").trim();
        if (!tokenText) continue;

        const amount = Number((row.amount ?? 0) as unknown as number) || 0;
        const entry = mintGroups.get(mint) ?? { tokens: [], sum: 0 };
        entry.tokens.push(tokenText);
        entry.sum += amount;
        mintGroups.set(mint, entry);
      }

      const candidates = Array.from(mintGroups.entries())
        .map(([mint, info]) => ({ mint, ...info }))
        .filter((c) => c.sum >= amountSat)
        .sort((a, b) => b.sum - a.sum);

      if (candidates.length === 0) {
        setStatus(t("payInsufficient"));
        return;
      }

      let lastError: unknown = null;
      for (const candidate of candidates) {
        try {
          const { meltInvoiceWithTokensAtMint } = await import("./cashuMelt");
          const result = await meltInvoiceWithTokensAtMint({
            invoice,
            mint: candidate.mint,
            tokens: candidate.tokens,
            unit: "sat",
          });

          // Remove old rows for that mint and insert a single new holding (change).
          for (const row of cashuTokens) {
            if (
              String(row.state ?? "") === "accepted" &&
              String(row.mint ?? "").trim() === candidate.mint
            ) {
              update("cashuToken", {
                id: row.id as CashuTokenId,
                isDeleted: Evolu.sqliteTrue,
              });
            }
          }

          if (result.remainingToken && result.remainingAmount > 0) {
            insert("cashuToken", {
              token: result.remainingToken as typeof Evolu.NonEmptyString.Type,
              rawToken: null,
              mint: result.mint as typeof Evolu.NonEmptyString1000.Type,
              unit: result.unit
                ? (result.unit as typeof Evolu.NonEmptyString100.Type)
                : null,
              amount:
                result.remainingAmount > 0
                  ? (result.remainingAmount as typeof Evolu.PositiveInt.Type)
                  : null,
              state: "accepted" as typeof Evolu.NonEmptyString100.Type,
              error: null,
            });
          }

          setStatus(t("paySuccess"));
          navigateToContact(selectedContact.id);
          return;
        } catch (e) {
          lastError = e;
        }
      }

      setStatus(`${t("payFailed")}: ${String(lastError ?? "unknown")}`);
    } finally {
      setCashuIsBusy(false);
    }
  };

  const saveCashuFromText = async (tokenText: string) => {
    const tokenRaw = tokenText.trim();
    if (!tokenRaw) {
      setStatus(t("pasteEmpty"));
      return;
    }

    if (cashuIsBusy) return;
    setCashuIsBusy(true);
    setCashuDraft("");
    setStatus(t("cashuAccepting"));

    // Parse best-effort metadata for display / fallback.
    const parsed = parseCashuToken(tokenRaw);
    const parsedMint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
    const parsedAmount =
      parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

    try {
      const { acceptCashuToken } = await import("./cashuAccept");
      const accepted = await acceptCashuToken(tokenRaw);
      const result = insert("cashuToken", {
        token: accepted.token as typeof Evolu.NonEmptyString.Type,
        rawToken: tokenRaw as typeof Evolu.NonEmptyString.Type,
        mint: accepted.mint as typeof Evolu.NonEmptyString1000.Type,
        unit: accepted.unit
          ? (accepted.unit as typeof Evolu.NonEmptyString100.Type)
          : null,
        amount:
          accepted.amount > 0
            ? (accepted.amount as typeof Evolu.PositiveInt.Type)
            : null,
        state: "accepted" as typeof Evolu.NonEmptyString100.Type,
        error: null,
      });
      if (result.ok) {
        setStatus(t("cashuAccepted"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    } catch (error) {
      const message = String(error).trim() || "Accept failed";
      const result = insert("cashuToken", {
        token: tokenRaw as typeof Evolu.NonEmptyString.Type,
        rawToken: tokenRaw as typeof Evolu.NonEmptyString.Type,
        mint: parsedMint
          ? (parsedMint as typeof Evolu.NonEmptyString1000.Type)
          : null,
        unit: null,
        amount:
          typeof parsedAmount === "number"
            ? (parsedAmount as typeof Evolu.PositiveInt.Type)
            : null,
        state: "error" as typeof Evolu.NonEmptyString100.Type,
        error: message.slice(0, 1000) as typeof Evolu.NonEmptyString1000.Type,
      });
      if (result.ok) {
        setStatus(`${t("cashuAcceptFailed")}: ${message}`);
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    } finally {
      setCashuIsBusy(false);
    }
  };

  const handleDelete = (id: ContactId) => {
    const result = update("contact", { id, isDeleted: Evolu.sqliteTrue });
    if (result.ok) {
      setStatus(t("contactDeleted"));
      closeContactDetail();
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const handleDeleteCashuToken = (id: CashuTokenId) => {
    const result = update("cashuToken", { id, isDeleted: Evolu.sqliteTrue });
    if (result.ok) {
      setStatus(t("cashuDeleted"));
      setPendingCashuDeleteId(null);
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const requestDeleteCashuToken = (id: CashuTokenId) => {
    if (pendingCashuDeleteId === id) {
      handleDeleteCashuToken(id);
      return;
    }
    setPendingCashuDeleteId(id);
    setStatus(t("deleteArmedHint"));
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setStatus(t("copiedToClipboard"));
    } catch {
      setStatus(t("copyFailed"));
    }
  };

  const requestDeleteCurrentContact = () => {
    if (!editingId) return;
    if (pendingDeleteId === editingId) {
      setPendingDeleteId(null);
      handleDelete(editingId);
      return;
    }
    setPendingDeleteId(editingId);
    setStatus(t("deleteArmedHint"));
  };

  const applyKeysFromText = async (value: string) => {
    try {
      const mnemonicResult = Evolu.Mnemonic.fromUnknown(value);
      if (!mnemonicResult.ok) {
        setStatus(Evolu.createFormatTypeError()(mnemonicResult.error));
        return;
      }

      const mnemonic = mnemonicResult.value;
      setStatus(t("keysPasting"));
      await evolu.restoreAppOwner(mnemonic, { reload: false });
      try {
        localStorage.setItem(INITIAL_MNEMONIC_STORAGE_KEY, mnemonic);
      } catch {
        // ignore
      }
      globalThis.location.reload();
    } catch (error) {
      setStatus(`${t("errorPrefix")}: ${String(error)}`);
    }
  };

  const pasteKeysFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setStatus(t("pasteNotAvailable"));
      return;
    }

    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setStatus(t("pasteEmpty"));
        return;
      }
      await applyKeysFromText(text);
    } catch {
      setStatus(t("pasteNotAvailable"));
    }
  };

  const requestPasteKeys = async () => {
    if (isPasteArmed) {
      setIsPasteArmed(false);
      await pasteKeysFromClipboard();
      return;
    }
    setIsPasteArmed(true);
    setStatus(t("pasteArmedHint"));
  };

  const openContactDetail = (contact: (typeof contacts)[number]) => {
    setPendingDeleteId(null);
    setIsPasteArmed(false);
    navigateToContact(contact.id);
  };

  React.useEffect(() => {
    if (route.kind === "contactNew") {
      setPendingDeleteId(null);
      setIsPasteArmed(false);
      setEditingId(null);
      setForm(makeEmptyForm());
      return;
    }

    if (route.kind !== "contactEdit") return;
    setPendingDeleteId(null);
    setIsPasteArmed(false);

    if (!selectedContact) {
      setEditingId(null);
      setForm(makeEmptyForm());
      return;
    }

    setEditingId(selectedContact.id);
    setForm({
      name: (selectedContact.name ?? "") as string,
      npub: (selectedContact.npub ?? "") as string,
      lnAddress: (selectedContact.lnAddress ?? "") as string,
      group: ((selectedContact.groupName ?? "") as string) ?? "",
    });
  }, [route, selectedContact]);

  const handleSaveContact = () => {
    const name = form.name.trim();
    const npub = form.npub.trim();
    const lnAddress = form.lnAddress.trim();
    const group = form.group.trim();

    if (!name && !npub && !lnAddress) {
      setStatus(t("fillAtLeastOne"));
      return;
    }

    const payload = {
      name: name ? (name as typeof Evolu.NonEmptyString1000.Type) : null,
      npub: npub ? (npub as typeof Evolu.NonEmptyString1000.Type) : null,
      lnAddress: lnAddress
        ? (lnAddress as typeof Evolu.NonEmptyString1000.Type)
        : null,
      groupName: group ? (group as typeof Evolu.NonEmptyString1000.Type) : null,
    };

    if (editingId) {
      const result = update("contact", { id: editingId, ...payload });
      if (result.ok) {
        setStatus(t("contactUpdated"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    } else {
      const result = insert("contact", payload);
      if (result.ok) {
        setStatus(t("contactSaved"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    }

    if (route.kind === "contactEdit" && editingId) {
      navigateToContact(editingId);
      return;
    }

    closeContactDetail();
  };

  const copyMnemonic = async () => {
    if (!owner || !owner.mnemonic) return;
    await navigator.clipboard?.writeText(owner.mnemonic);
    setStatus(t("keysCopied"));
  };

  const copyNostrKeys = async () => {
    if (!currentNsec) return;
    await navigator.clipboard?.writeText(currentNsec);
    setStatus(t("nostrKeysCopied"));
  };

  const applyNostrKeysFromText = async (value: string) => {
    const text = value.trim();
    if (!text || !text.startsWith("nsec")) {
      setStatus(t("nostrPasteInvalid"));
      return;
    }

    try {
      const { nip19 } = await import("nostr-tools");
      const decoded = nip19.decode(text);
      if (decoded.type !== "nsec") {
        setStatus(t("nostrPasteInvalid"));
        return;
      }

      const defaultNsec = String(derivedNostrIdentity?.nsec ?? "").trim();
      if (defaultNsec && text === defaultNsec) {
        // User set keys back to default; don't persist an override.
        if (storedNostrIdentity?.id) {
          update("nostrIdentity", {
            id: storedNostrIdentity.id as unknown as NostrIdentityId,
            isDeleted: Evolu.sqliteTrue,
          });
        }
        setStatus(t("nostrKeysUpdated"));
        return;
      }

      if (storedNostrIdentity?.id) {
        const result = update("nostrIdentity", {
          id: storedNostrIdentity.id as unknown as NostrIdentityId,
          nsec: text as typeof Evolu.NonEmptyString1000.Type,
        });
        if (!result.ok) {
          setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
          return;
        }
      } else {
        const result = insert("nostrIdentity", {
          nsec: text as typeof Evolu.NonEmptyString1000.Type,
        });
        if (!result.ok) {
          setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
          return;
        }
      }

      setStatus(t("nostrKeysUpdated"));
    } catch {
      setStatus(t("nostrPasteInvalid"));
    }
  };

  const pasteNostrKeysFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setStatus(t("pasteNotAvailable"));
      return;
    }

    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setStatus(t("pasteEmpty"));
        return;
      }
      await applyNostrKeysFromText(text);
    } catch {
      setStatus(t("pasteNotAvailable"));
    }
  };

  const requestPasteNostrKeys = async () => {
    if (isNostrPasteArmed) {
      setIsNostrPasteArmed(false);
      await pasteNostrKeysFromClipboard();
      return;
    }
    setIsNostrPasteArmed(true);
    setStatus(t("nostrPasteArmedHint"));
  };

  const deriveAndStoreNostrKeys = async () => {
    if (!owner?.mnemonic) return;

    const derived = await deriveNostrIdentityFromMnemonic(
      String(owner.mnemonic)
    );
    if (!derived) {
      setStatus(`${t("errorPrefix")}: ${t("nostrPasteInvalid")}`);
      return;
    }

    // Derived keys are the default; do not persist them as an override.
    if (storedNostrIdentity?.id) {
      update("nostrIdentity", {
        id: storedNostrIdentity.id as unknown as NostrIdentityId,
        isDeleted: Evolu.sqliteTrue,
      });
    }

    setStatus(t("nostrKeysDerived"));
    return;
  };

  React.useEffect(() => {
    // NIP-17 inbox sync + subscription while a chat is open.
    if (route.kind !== "chat") return;
    if (!selectedContact) return;

    const contactNpub = String(selectedContact.npub ?? "").trim();
    if (!contactNpub) return;
    if (!currentNsec) return;

    let cancelled = false;

    const existingWrapIds = chatSeenWrapIdsRef.current;
    existingWrapIds.clear();
    for (const m of chatMessages) {
      const id = String(m.wrapId ?? "");
      if (id) existingWrapIds.add(id);
    }

    const run = async () => {
      try {
        const { nip19, getPublicKey, SimplePool } = await import("nostr-tools");
        const { unwrapEvent } = await import("nostr-tools/nip17");

        const decodedMe = nip19.decode(currentNsec);
        if (decodedMe.type !== "nsec") return;
        const privBytes = decodedMe.data as Uint8Array;
        const myPubHex = getPublicKey(privBytes);

        const decodedContact = nip19.decode(contactNpub);
        if (decodedContact.type !== "npub") return;
        const contactPubHex = decodedContact.data as string;

        const pool = new SimplePool();

        const processWrap = (wrap: any) => {
          try {
            const wrapId = String(wrap?.id ?? "");
            if (!wrapId) return;
            if (existingWrapIds.has(wrapId)) return;
            existingWrapIds.add(wrapId);

            const inner = unwrapEvent(wrap, privBytes) as any;
            if (!inner || inner.kind !== 14) return;

            const innerPub = String(inner.pubkey ?? "");
            const content = String(inner.content ?? "").trim();
            if (!content) return;

            const createdAtSecRaw = Number(inner.created_at ?? 0);
            const createdAtSec =
              Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
                ? Math.trunc(createdAtSecRaw)
                : Math.ceil(Date.now() / 1e3);

            const isIncoming = innerPub === contactPubHex;
            const isOutgoing = innerPub === myPubHex;
            if (!isIncoming && !isOutgoing) return;

            // Ensure outgoing messages are for this contact.
            const pTags = Array.isArray(inner.tags)
              ? (inner.tags as any[])
                  .filter((t) => Array.isArray(t) && t[0] === "p")
                  .map((t) => String(t[1] ?? "").trim())
              : [];
            const mentionsContact = pTags.includes(contactPubHex);
            if (isOutgoing && !mentionsContact) return;

            if (cancelled) return;

            insert("nostrMessage", {
              contactId: selectedContact.id,
              direction: (isIncoming
                ? "in"
                : "out") as typeof Evolu.NonEmptyString100.Type,
              content: content as typeof Evolu.NonEmptyString.Type,
              wrapId: wrapId as typeof Evolu.NonEmptyString1000.Type,
              rumorId: inner.id
                ? (String(inner.id) as typeof Evolu.NonEmptyString1000.Type)
                : null,
              pubkey: innerPub as typeof Evolu.NonEmptyString1000.Type,
              createdAtSec: createdAtSec as typeof Evolu.PositiveInt.Type,
            });
          } catch {
            // ignore individual events
          }
        };

        const existing = await pool.querySync(
          NOSTR_RELAYS,
          { kinds: [1059], "#p": [myPubHex], limit: 50 },
          { maxWait: 5000 }
        );

        if (!cancelled) {
          for (const e of existing as any[]) processWrap(e);
        }

        const sub = pool.subscribe(
          NOSTR_RELAYS,
          { kinds: [1059], "#p": [myPubHex] },
          {
            onevent: (e: any) => {
              if (cancelled) return;
              processWrap(e);
            },
          }
        );

        return () => {
          void sub.close("chat closed");
          pool.close(NOSTR_RELAYS);
        };
      } catch {
        return;
      }
    };

    let cleanup: (() => void) | undefined;
    void run().then((c) => {
      cleanup = c;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [
    currentNsec,
    insert,
    route.kind,
    selectedContact?.id,
    selectedContact?.npub,
  ]);

  const sendChatMessage = async () => {
    if (route.kind !== "chat") return;
    if (!selectedContact) return;

    const text = chatDraft.trim();
    if (!text) return;

    const contactNpub = String(selectedContact.npub ?? "").trim();
    if (!contactNpub) return;
    if (!currentNsec) {
      setStatus(t("profileMissingNpub"));
      return;
    }

    try {
      const { nip19, getPublicKey, SimplePool } = await import("nostr-tools");
      const { wrapEvent } = await import("nostr-tools/nip59");

      const decodedMe = nip19.decode(currentNsec);
      if (decodedMe.type !== "nsec") throw new Error("invalid nsec");
      const privBytes = decodedMe.data as Uint8Array;
      const myPubHex = getPublicKey(privBytes);

      const decodedContact = nip19.decode(contactNpub);
      if (decodedContact.type !== "npub") throw new Error("invalid npub");
      const contactPubHex = decodedContact.data as string;

      const baseEvent = {
        created_at: Math.ceil(Date.now() / 1e3),
        kind: 14,
        tags: [
          ["p", contactPubHex],
          ["p", myPubHex],
        ],
        content: text,
      };

      const wrapForMe = wrapEvent(baseEvent as any, privBytes, myPubHex) as any;
      const wrapForContact = wrapEvent(
        baseEvent as any,
        privBytes,
        contactPubHex
      ) as any;

      chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));

      const pool = new SimplePool();
      try {
        const publishResults = await Promise.allSettled([
          ...pool.publish(NOSTR_RELAYS, wrapForMe),
          ...pool.publish(NOSTR_RELAYS, wrapForContact),
        ]);

        // Some relays may fail (websocket issues), while others succeed.
        // Treat it as success if at least one relay accepted the event.
        const anySuccess = publishResults.some((r) => r.status === "fulfilled");
        if (!anySuccess) {
          const firstError = publishResults.find(
            (r): r is PromiseRejectedResult => r.status === "rejected"
          )?.reason;
          throw new Error(String(firstError ?? "publish failed"));
        }
      } finally {
        pool.close(NOSTR_RELAYS);
      }

      insert("nostrMessage", {
        contactId: selectedContact.id,
        direction: "out" as typeof Evolu.NonEmptyString100.Type,
        content: text as typeof Evolu.NonEmptyString.Type,
        wrapId: String(wrapForMe.id) as typeof Evolu.NonEmptyString1000.Type,
        rumorId: null,
        pubkey: myPubHex as typeof Evolu.NonEmptyString1000.Type,
        createdAtSec: baseEvent.created_at as typeof Evolu.PositiveInt.Type,
      });

      setChatDraft("");
    } catch (e) {
      setStatus(`${t("errorPrefix")}: ${String(e ?? "unknown")}`);
    }
  };

  const showGroupFilter = route.kind === "contacts" && groupNames.length > 0;
  const showNoGroupFilter = ungroupedCount > 0;

  const topbar = (() => {
    if (route.kind === "settings") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToContacts,
      };
    }

    if (route.kind === "profile") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToSettings,
      };
    }

    if (route.kind === "wallet") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToContacts,
      };
    }

    if (route.kind === "nostrRelays") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToSettings,
      };
    }

    if (route.kind === "nostrRelay") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToNostrRelays,
      };
    }

    if (route.kind === "nostrRelayNew") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToNostrRelays,
      };
    }

    if (route.kind === "contactNew") {
      return {
        icon: "<",
        label: t("close"),
        onClick: closeContactDetail,
      };
    }

    if (route.kind === "contact") {
      return {
        icon: "<",
        label: t("close"),
        onClick: closeContactDetail,
      };
    }

    if (route.kind === "contactEdit" || route.kind === "contactPay") {
      return {
        icon: "<",
        label: t("close"),
        onClick: () => navigateToContact(route.id),
      };
    }

    if (route.kind === "chat") {
      return {
        icon: "<",
        label: t("close"),
        onClick: () => navigateToContact(route.id),
      };
    }

    return {
      icon: "☰",
      label: t("settings"),
      onClick: toggleSettings,
    };
  })();

  const topbarRight = (() => {
    if (route.kind === "contacts") {
      return {
        icon: "+",
        label: t("addContact"),
        onClick: openNewContactPage,
      };
    }

    if (route.kind === "nostrRelays") {
      return {
        icon: "+",
        label: t("addRelay"),
        onClick: navigateToNewRelay,
      };
    }

    if (route.kind === "contact" && selectedContact) {
      return {
        icon: "✎",
        label: t("editContact"),
        onClick: () => navigateToContactEdit(selectedContact.id),
      };
    }

    if (route.kind === "profile") {
      return {
        icon: "✎",
        label: t("edit"),
        onClick: () => {
          if (isProfileEditing) {
            setIsProfileEditing(false);
            return;
          }

          const bestName = myProfileMetadata
            ? getBestNostrName(myProfileMetadata)
            : null;
          setProfileEditName(bestName ?? myProfileName ?? "");
          setProfileEditLnAddress(myProfileLnAddress ?? "");
          setIsProfileEditing(true);
        },
      };
    }

    return null;
  })();

  const topbarTitle = (() => {
    if (route.kind === "contacts") return t("contactsTitle");
    if (route.kind === "wallet") return t("wallet");
    if (route.kind === "settings") return t("menu");
    if (route.kind === "profile") return t("profile");
    if (route.kind === "nostrRelays") return t("nostrRelay");
    if (route.kind === "nostrRelay") return t("nostrRelay");
    if (route.kind === "nostrRelayNew") return t("nostrRelay");
    if (route.kind === "contactNew") return t("newContact");
    if (route.kind === "contact") return t("contact");
    if (route.kind === "contactEdit") return t("contactEditTitle");
    if (route.kind === "contactPay") return t("contactPayTitle");
    if (route.kind === "chat") return t("messagesTitle");
    return null;
  })();

  const saveProfileEdits = async () => {
    try {
      if (!currentNpub || !currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      const name = profileEditName.trim();
      const ln = profileEditLnAddress.trim();

      const { SimplePool, finalizeEvent, getPublicKey, nip19 } = await import(
        "nostr-tools"
      );

      const decoded = nip19.decode(currentNsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");
      const privBytes = decoded.data as Uint8Array;
      const pubkey = getPublicKey(privBytes);

      const cachedPrev =
        loadCachedProfileMetadata(currentNpub)?.metadata ?? null;
      const livePrev = await fetchNostrProfileMetadata(currentNpub, {
        relays: nostrFetchRelays,
      }).catch(() => null);

      const prev = (livePrev ??
        cachedPrev ??
        myProfileMetadata ??
        {}) as NostrProfileMetadata;

      const contentObj: Record<string, unknown> = {
        ...(prev.name ? { name: prev.name } : {}),
        ...(prev.displayName ? { display_name: prev.displayName } : {}),
        ...(prev.picture ? { picture: prev.picture } : {}),
        ...(prev.image ? { image: prev.image } : {}),
        ...(prev.lud16 ? { lud16: prev.lud16 } : {}),
        ...(prev.lud06 ? { lud06: prev.lud06 } : {}),
      };

      if (name) {
        contentObj.name = name;
        contentObj.display_name = name;
      }

      if (ln) {
        contentObj.lud16 = ln;
      }

      const baseEvent = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [] as string[][],
        content: JSON.stringify(contentObj),
        pubkey,
      } satisfies UnsignedEvent;

      const signed: NostrToolsEvent = finalizeEvent(baseEvent, privBytes);

      const relaysToUse =
        nostrFetchRelays.length > 0 ? nostrFetchRelays : NOSTR_RELAYS;
      const pool = new SimplePool();
      try {
        const publishResults = await Promise.allSettled(
          pool.publish(relaysToUse, signed)
        );

        const anySuccess = publishResults.some((r) => r.status === "fulfilled");
        if (!anySuccess) {
          const firstError = publishResults.find(
            (r): r is PromiseRejectedResult => r.status === "rejected"
          )?.reason;
          throw new Error(String(firstError ?? "publish failed"));
        }
      } finally {
        pool.close(relaysToUse);
      }

      const updatedMeta: NostrProfileMetadata = {
        ...prev,
        ...(name ? { name, displayName: name } : {}),
        ...(ln ? { lud16: ln } : {}),
      };

      saveCachedProfileMetadata(currentNpub, updatedMeta);
      setMyProfileMetadata(updatedMeta);
      if (name) setMyProfileName(name);
      setMyProfileLnAddress(ln || null);
      setIsProfileEditing(false);
    } catch (e) {
      setStatus(`${t("errorPrefix")}: ${String(e ?? "unknown")}`);
    }
  };

  const saveNewRelay = () => {
    const url = newRelayUrl.trim();
    if (!url) {
      setStatus(`${t("errorPrefix")}: ${t("fillAtLeastOne")}`);
      return;
    }

    const already = relayUrls.some((u) => u === url);
    if (already) {
      navigateToNostrRelays();
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
    navigateToNostrRelays();
  };

  const requestDeleteSelectedRelay = () => {
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
      navigateToNostrRelays();
      return;
    }

    setPendingRelayDeleteUrl(selectedRelayUrl);
    setStatus(t("deleteArmedHint"));
  };

  const displayUnit = useBitcoinSymbol ? "₿" : "sat";

  return (
    <div className={showGroupFilter ? "page has-group-filter" : "page"}>
      <header className="topbar">
        <button
          className="topbar-btn"
          onClick={topbar.onClick}
          aria-label={topbar.label}
          title={topbar.label}
        >
          <span aria-hidden="true">{topbar.icon}</span>
        </button>

        {topbarTitle ? (
          <div className="topbar-title" aria-label={topbarTitle}>
            {topbarTitle}
          </div>
        ) : (
          <span className="topbar-title-spacer" aria-hidden="true" />
        )}

        {topbarRight ? (
          <button
            className="topbar-btn"
            onClick={topbarRight.onClick}
            aria-label={topbarRight.label}
            title={topbarRight.label}
          >
            <span aria-hidden="true">{topbarRight.icon}</span>
          </button>
        ) : (
          <span className="topbar-spacer" aria-hidden="true" />
        )}
      </header>

      {route.kind === "settings" && (
        <section className="panel">
          <button
            type="button"
            className="profile-button"
            onClick={navigateToProfile}
            disabled={!currentNpub}
            aria-label={t("profile")}
            title={t("profile")}
          >
            <span className="profile-avatar" aria-hidden="true">
              {myProfilePicture ? (
                <img
                  src={myProfilePicture}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="profile-avatar-fallback">
                  {getInitials(myProfileName ?? t("profileNoName"))}
                </span>
              )}
            </span>
            <span className="profile-text">
              <span className="profile-name">
                {myProfileName ??
                  (currentNpub
                    ? formatShortNpub(currentNpub)
                    : t("profileNoName"))}
              </span>
            </span>
          </button>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-icon" aria-hidden="true">
                🔑
              </span>
              <span className="settings-label">{t("keys")}</span>
            </div>
            <div className="settings-right">
              <div className="badge-box">
                <button
                  className="ghost"
                  onClick={copyMnemonic}
                  disabled={!owner?.mnemonic}
                >
                  {t("copyCurrent")}
                </button>
                <button
                  className={isPasteArmed ? "danger" : "ghost"}
                  onClick={requestPasteKeys}
                  aria-label={t("paste")}
                  title={isPasteArmed ? t("pasteArmedHint") : t("paste")}
                >
                  {t("paste")}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-icon" aria-hidden="true">
                🦤
              </span>
              <span className="settings-label">{t("nostrKeys")}</span>
            </div>
            <div className="settings-right">
              <div className="badge-box">
                <button
                  className="ghost"
                  onClick={deriveAndStoreNostrKeys}
                  disabled={!owner?.mnemonic}
                >
                  {t("derive")}
                </button>
                <button
                  className="ghost"
                  onClick={copyNostrKeys}
                  disabled={!currentNsec}
                >
                  {t("copyCurrent")}
                </button>
                <button
                  className={isNostrPasteArmed ? "danger" : "ghost"}
                  onClick={requestPasteNostrKeys}
                  aria-label={t("paste")}
                  title={
                    isNostrPasteArmed ? t("nostrPasteArmedHint") : t("paste")
                  }
                >
                  {t("paste")}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="settings-row settings-link"
            onClick={navigateToNostrRelays}
            aria-label={t("nostrRelay")}
            title={t("nostrRelay")}
          >
            <div className="settings-left">
              <span className="settings-icon" aria-hidden="true">
                📡
              </span>
              <span className="settings-label">{t("nostrRelay")}</span>
            </div>
            <div className="settings-right">
              <span className="relay-count" aria-label="relay status">
                {connectedRelayCount}/{relayUrls.length}
              </span>
              <span className="settings-chevron" aria-hidden="true">
                &gt;
              </span>
            </div>
          </button>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-icon" aria-hidden="true">
                🏦
              </span>
              <span className="settings-label">{t("mints")}</span>
            </div>
            <div className="settings-right">
              {defaultMintDisplay ? (
                <span className="relay-url">{defaultMintDisplay}</span>
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-icon" aria-hidden="true">
                🌐
              </span>
              <span className="settings-label">{t("language")}</span>
            </div>
            <div className="settings-right">
              <select
                className="select"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                aria-label={t("language")}
              >
                <option value="cs">{t("czech")}</option>
                <option value="en">{t("english")}</option>
              </select>
            </div>
          </div>

          <div className="settings-row">
            <div className="settings-left">
              <span className="settings-icon" aria-hidden="true">
                ₿
              </span>
              <span className="settings-label">{t("unit")}</span>
            </div>
            <div className="settings-right">
              <label className="switch">
                <input
                  className="switch-input"
                  type="checkbox"
                  aria-label={t("unitUseBitcoin")}
                  checked={useBitcoinSymbol}
                  onChange={(e) => setUseBitcoinSymbol(e.target.checked)}
                />
              </label>
            </div>
          </div>

          <div className="settings-row">
            <button className="btn-wide" onClick={navigateToWallet}>
              {t("walletOpen")}
            </button>
          </div>

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "nostrRelays" && (
        <section className="panel">
          {relayUrls.length === 0 ? (
            <p className="lede">{t("noContactsYet")}</p>
          ) : (
            <div>
              {relayUrls.map((url) => {
                const state = relayStatusByUrl[url] ?? "checking";
                const dotClass =
                  state === "connected"
                    ? "status-dot connected"
                    : "status-dot disconnected";

                return (
                  <button
                    type="button"
                    className="settings-row settings-link"
                    key={url}
                    onClick={() => navigateToNostrRelay(url)}
                  >
                    <div className="settings-left">
                      <span className="relay-url">{url}</span>
                    </div>
                    <div className="settings-right">
                      <span
                        className={dotClass}
                        aria-label={state}
                        title={state}
                      />
                      <span className="settings-chevron" aria-hidden="true">
                        &gt;
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "nostrRelayNew" && (
        <section className="panel">
          <label htmlFor="relayUrl">{t("relayUrl")}</label>
          <input
            id="relayUrl"
            value={newRelayUrl}
            onChange={(e) => setNewRelayUrl(e.target.value)}
            placeholder="wss://..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />

          <div className="panel-header" style={{ marginTop: 14 }}>
            <button onClick={saveNewRelay}>{t("saveChanges")}</button>
          </div>

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "nostrRelay" && (
        <section className="panel">
          {selectedRelayUrl ? (
            <>
              <div className="settings-row">
                <div className="settings-left">
                  <span className="relay-url">{selectedRelayUrl}</span>
                </div>
              </div>

              <div className="settings-row">
                <button
                  className={
                    pendingRelayDeleteUrl === selectedRelayUrl
                      ? "btn-wide danger"
                      : "btn-wide"
                  }
                  onClick={requestDeleteSelectedRelay}
                >
                  {t("delete")}
                </button>
              </div>
            </>
          ) : (
            <p className="lede">{t("errorPrefix")}</p>
          )}

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "wallet" && (
        <section className="panel">
          <div className="panel-header">
            <div className="wallet-hero">
              <div className="balance-hero" aria-label={t("cashuBalance")}>
                <span className="balance-number">
                  {formatInteger(cashuBalance)}
                </span>
                <span className="balance-unit">{displayUnit}</span>
              </div>
            </div>
          </div>

          <label>{t("cashuToken")}</label>
          <textarea
            ref={cashuDraftRef}
            value={cashuDraft}
            onChange={(e) => setCashuDraft(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData?.getData("text") ?? "";
              const tokenRaw = String(text).trim();
              if (!tokenRaw) return;
              e.preventDefault();
              void saveCashuFromText(tokenRaw);
            }}
            placeholder={t("cashuPasteManualHint")}
          />

          <div className="ln-list">
            {cashuTokens.length === 0 ? (
              <p className="muted">{t("cashuEmpty")}</p>
            ) : (
              cashuTokens.map((token) => (
                <div
                  key={token.id as unknown as CashuTokenId}
                  className="ln-row"
                >
                  <div className="card-main">
                    <h4 className="cashu-mint">
                      {token.mint ? String(token.mint) : t("cashuToken")}
                    </h4>
                    {token.error ? (
                      <p className="muted">
                        {t("errorPrefix")}: {String(token.error)}
                      </p>
                    ) : null}
                  </div>
                  <div className="ln-actions">
                    <span className="pill">
                      {formatInteger(
                        Number((token.amount ?? 0) as unknown as number) || 0
                      )}
                    </span>
                    <button
                      className="ghost"
                      onClick={() => copyText(String(token.token ?? ""))}
                      disabled={!String(token.token ?? "").trim()}
                    >
                      {t("copy")}
                    </button>
                    <button
                      className={
                        pendingCashuDeleteId ===
                        (token.id as unknown as CashuTokenId)
                          ? "danger"
                          : "secondary"
                      }
                      onClick={() =>
                        requestDeleteCashuToken(
                          token.id as unknown as CashuTokenId
                        )
                      }
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "contact" && (
        <section className="panel">
          {!selectedContact ? (
            <p className="muted">Kontakt nenalezen.</p>
          ) : null}

          {selectedContact ? (
            <div className="contact-detail">
              <div className="contact-avatar is-xl" aria-hidden="true">
                {(() => {
                  const npub = String(selectedContact.npub ?? "").trim();
                  const url = npub ? nostrPictureByNpub[npub] : null;
                  return url ? (
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="contact-avatar-fallback">
                      {getInitials(String(selectedContact.name ?? ""))}
                    </span>
                  );
                })()}
              </div>

              {selectedContact.name ? (
                <h2 className="contact-detail-name">{selectedContact.name}</h2>
              ) : null}

              {(() => {
                const group = String(selectedContact.groupName ?? "").trim();
                if (!group) return null;
                return <p className="contact-detail-group">{group}</p>;
              })()}

              {(() => {
                const ln = String(selectedContact.lnAddress ?? "").trim();
                if (!ln) return null;
                return <p className="contact-detail-ln">{ln}</p>;
              })()}

              <div className="contact-detail-actions">
                {(() => {
                  const ln = String(selectedContact.lnAddress ?? "").trim();
                  if (!ln) return null;
                  return (
                    <button
                      className="btn-wide"
                      onClick={() => navigateToContactPay(selectedContact.id)}
                      disabled={cashuIsBusy || !canPayWithCashu}
                      title={
                        !canPayWithCashu ? t("payInsufficient") : undefined
                      }
                    >
                      {t("pay")}
                    </button>
                  );
                })()}

                {(() => {
                  const npub = String(selectedContact.npub ?? "").trim();
                  if (!npub) return null;
                  return (
                    <button
                      className="btn-wide secondary"
                      onClick={() => navigateToChat(selectedContact.id)}
                    >
                      {t("sendMessage")}
                    </button>
                  );
                })()}
              </div>
            </div>
          ) : null}

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "contactPay" && (
        <section className="panel">
          {!selectedContact ? (
            <p className="muted">Kontakt nenalezen.</p>
          ) : null}

          {selectedContact ? (
            <>
              <div className="contact-header">
                <div className="contact-avatar is-large" aria-hidden="true">
                  {(() => {
                    const npub = String(selectedContact.npub ?? "").trim();
                    const url = npub ? nostrPictureByNpub[npub] : null;
                    return url ? (
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="contact-avatar-fallback">
                        {getInitials(String(selectedContact.name ?? ""))}
                      </span>
                    );
                  })()}
                </div>
                <div className="contact-header-text">
                  {selectedContact.name ? (
                    <h3>{selectedContact.name}</h3>
                  ) : null}
                  <p className="muted">
                    {t("availablePrefix")} {formatInteger(cashuBalance)}{" "}
                    {displayUnit}
                  </p>
                </div>
              </div>

              {(() => {
                const ln = String(selectedContact.lnAddress ?? "").trim();
                if (!ln) return <p className="muted">{t("payMissingLn")}</p>;
                if (!canPayWithCashu)
                  return <p className="muted">{t("payInsufficient")}</p>;
                return null;
              })()}

              <div className="amount-display" aria-live="polite">
                {(() => {
                  const amountSat = Number.parseInt(payAmount.trim(), 10);
                  const display =
                    Number.isFinite(amountSat) && amountSat > 0 ? amountSat : 0;
                  return (
                    <>
                      <span className="amount-number">
                        {formatInteger(display)}
                      </span>
                      <span className="amount-unit">{displayUnit}</span>
                    </>
                  );
                })()}
              </div>

              <div
                className="keypad"
                role="group"
                aria-label={`${t("payAmount")} (${displayUnit})`}
              >
                {(
                  [
                    "1",
                    "2",
                    "3",
                    "4",
                    "5",
                    "6",
                    "7",
                    "8",
                    "9",
                    "C",
                    "0",
                    "⌫",
                  ] as const
                ).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      key === "C" || key === "⌫" ? "secondary" : "ghost"
                    }
                    onClick={() => {
                      if (cashuIsBusy) return;
                      if (key === "C") {
                        setPayAmount("");
                        return;
                      }
                      if (key === "⌫") {
                        setPayAmount((v) => v.slice(0, -1));
                        return;
                      }
                      setPayAmount((v) => {
                        const next = (v + key).replace(/^0+(\d)/, "$1");
                        return next;
                      });
                    }}
                    disabled={cashuIsBusy}
                    aria-label={
                      key === "C"
                        ? t("clearForm")
                        : key === "⌫"
                        ? t("delete")
                        : key
                    }
                  >
                    {key}
                  </button>
                ))}
              </div>

              {(() => {
                const ln = String(selectedContact.lnAddress ?? "").trim();
                const amountSat = Number.parseInt(payAmount.trim(), 10);
                const invalid =
                  !ln ||
                  !canPayWithCashu ||
                  !Number.isFinite(amountSat) ||
                  amountSat <= 0 ||
                  amountSat > cashuBalance;
                return (
                  <div className="actions">
                    <button
                      className="btn-wide"
                      onClick={() => void paySelectedContact()}
                      disabled={cashuIsBusy || invalid}
                      title={
                        amountSat > cashuBalance
                          ? t("payInsufficient")
                          : undefined
                      }
                    >
                      {t("paySend")}
                    </button>
                  </div>
                );
              })()}
            </>
          ) : null}

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "chat" && (
        <section className="panel">
          {!selectedContact ? (
            <p className="muted">Kontakt nenalezen.</p>
          ) : null}

          {selectedContact ? (
            <>
              <div className="contact-header">
                <div className="contact-avatar is-large" aria-hidden="true">
                  {(() => {
                    const npub = String(selectedContact.npub ?? "").trim();
                    const url = npub ? nostrPictureByNpub[npub] : null;
                    return url ? (
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="contact-avatar-fallback">
                        {getInitials(String(selectedContact.name ?? ""))}
                      </span>
                    );
                  })()}
                </div>
                <div className="contact-header-text">
                  {selectedContact.name ? (
                    <h3>{selectedContact.name}</h3>
                  ) : null}
                  {(() => {
                    const npub = String(selectedContact.npub ?? "").trim();
                    if (!npub) return null;
                    return <p className="muted profile-npub">{npub}</p>;
                  })()}
                </div>
              </div>

              {(() => {
                const npub = String(selectedContact.npub ?? "").trim();
                if (npub) return null;
                return <p className="muted">{t("chatMissingContactNpub")}</p>;
              })()}

              <div className="chat-messages" role="log" aria-live="polite">
                {chatMessages.length === 0 ? (
                  <p className="muted">{t("chatEmpty")}</p>
                ) : (
                  chatMessages.map((m) => {
                    const isOut = String(m.direction ?? "") === "out";
                    return (
                      <div
                        key={String(m.id)}
                        className={isOut ? "chat-bubble out" : "chat-bubble in"}
                      >
                        {String(m.content ?? "")}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="chat-compose">
                <textarea
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  placeholder={t("chatPlaceholder")}
                  disabled={!String(selectedContact.npub ?? "").trim()}
                />
                <button
                  className="btn-wide"
                  onClick={() => void sendChatMessage()}
                  disabled={
                    !chatDraft.trim() ||
                    !String(selectedContact.npub ?? "").trim()
                  }
                >
                  {t("send")}
                </button>
              </div>
            </>
          ) : null}

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "contactEdit" && (
        <section className="panel panel-plain">
          {!selectedContact ? (
            <p className="muted">Kontakt nenalezen.</p>
          ) : null}

          <div className="form-grid">
            <div className="form-col">
              <label>Jméno</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Např. Alice"
              />

              <label>npub</label>
              <input
                value={form.npub}
                onChange={(e) => setForm({ ...form, npub: e.target.value })}
                placeholder="nostr veřejný klíč"
              />

              <label>{t("lightningAddress")}</label>
              <input
                value={form.lnAddress}
                onChange={(e) =>
                  setForm({ ...form, lnAddress: e.target.value })
                }
                placeholder="např. alice@zapsat.cz"
              />

              <label>{t("group")}</label>
              <input
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
                placeholder="např. Friends"
                list={groupNames.length ? "group-options" : undefined}
              />
              {groupNames.length ? (
                <datalist id="group-options">
                  {groupNames.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
              ) : null}

              <div className="actions">
                <button onClick={handleSaveContact}>
                  {editingId ? t("saveChanges") : t("saveContact")}
                </button>
                <button
                  className={pendingDeleteId === editingId ? "danger" : "ghost"}
                  onClick={requestDeleteCurrentContact}
                  disabled={!editingId}
                  title={
                    pendingDeleteId === editingId
                      ? "Klikněte znovu pro smazání"
                      : t("delete")
                  }
                >
                  {t("delete")}
                </button>
              </div>
            </div>
          </div>

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "contactNew" && (
        <section className="panel panel-plain">
          <div className="form-grid">
            <div className="form-col">
              <label>Jméno</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Např. Alice"
              />

              <label>npub</label>
              <input
                value={form.npub}
                onChange={(e) => setForm({ ...form, npub: e.target.value })}
                placeholder="nostr veřejný klíč"
              />

              <label>{t("lightningAddress")}</label>
              <input
                value={form.lnAddress}
                onChange={(e) =>
                  setForm({ ...form, lnAddress: e.target.value })
                }
                placeholder="např. alice@zapsat.cz"
              />

              <label>{t("group")}</label>
              <input
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
                placeholder="např. Friends"
                list={groupNames.length ? "group-options" : undefined}
              />
              {groupNames.length ? (
                <datalist id="group-options">
                  {groupNames.map((group) => (
                    <option key={group} value={group} />
                  ))}
                </datalist>
              ) : null}

              <div className="actions">
                <button onClick={handleSaveContact}>{t("saveContact")}</button>
              </div>
            </div>
          </div>

          {status && <p className="status">{status}</p>}
        </section>
      )}

      {route.kind === "contacts" && (
        <>
          <section className="panel panel-plain">
            <div className="contact-list">
              {contacts.length === 0 && (
                <p className="muted">{t("noContactsYet")}</p>
              )}
              {visibleContacts.map((contact) => {
                const npub = String(contact.npub ?? "").trim();
                const avatarUrl = npub ? nostrPictureByNpub[npub] : null;
                const initials = getInitials(String(contact.name ?? ""));

                return (
                  <article
                    key={contact.id}
                    className="contact-card is-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openContactDetail(contact)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openContactDetail(contact);
                      }
                    }}
                  >
                    <div className="card-header">
                      <div className="contact-avatar" aria-hidden="true">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt=""
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="contact-avatar-fallback">
                            {initials}
                          </span>
                        )}
                      </div>
                      <div className="card-main">
                        <div className="card-title-row">
                          {contact.name ? (
                            <h4 className="contact-title">{contact.name}</h4>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {status && <p className="status">{status}</p>}
          </section>

          {showGroupFilter && (
            <nav className="group-filter-bar" aria-label={t("group")}>
              <div className="group-filter-inner">
                <button
                  type="button"
                  className={
                    activeGroup === null
                      ? "group-filter-btn is-active"
                      : "group-filter-btn"
                  }
                  onClick={() => setActiveGroup(null)}
                >
                  {t("all")}
                </button>
                {showNoGroupFilter ? (
                  <button
                    type="button"
                    className={
                      activeGroup === NO_GROUP_FILTER
                        ? "group-filter-btn is-active"
                        : "group-filter-btn"
                    }
                    onClick={() => setActiveGroup(NO_GROUP_FILTER)}
                  >
                    {t("noGroup")}
                  </button>
                ) : null}
                {groupNames.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={
                      activeGroup === group
                        ? "group-filter-btn is-active"
                        : "group-filter-btn"
                    }
                    onClick={() => setActiveGroup(group)}
                    title={group}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </nav>
          )}
        </>
      )}

      {route.kind === "profile" && (
        <section className="panel">
          {!currentNpub ? (
            <p className="muted">{t("profileMissingNpub")}</p>
          ) : (
            <>
              {isProfileEditing ? (
                <>
                  <label htmlFor="profileName">{t("name")}</label>
                  <input
                    id="profileName"
                    value={profileEditName}
                    onChange={(e) => setProfileEditName(e.target.value)}
                    placeholder={t("name")}
                  />

                  <label htmlFor="profileLn">{t("lightningAddress")}</label>
                  <input
                    id="profileLn"
                    value={profileEditLnAddress}
                    onChange={(e) => setProfileEditLnAddress(e.target.value)}
                    placeholder={t("lightningAddress")}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />

                  <div className="panel-header" style={{ marginTop: 14 }}>
                    <button onClick={() => void saveProfileEdits()}>
                      {t("saveChanges")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="profile-detail">
                    <div className="contact-avatar is-xl" aria-hidden="true">
                      {myProfilePicture ? (
                        <img
                          src={myProfilePicture}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="contact-avatar-fallback">
                          {getInitials(
                            myProfileName ?? formatShortNpub(currentNpub)
                          )}
                        </span>
                      )}
                    </div>

                    {myProfileQr ? (
                      <img
                        className="qr"
                        src={myProfileQr}
                        alt=""
                        onClick={() => {
                          if (!currentNpub) return;
                          void copyText(currentNpub);
                        }}
                      />
                    ) : (
                      <p className="muted">{currentNpub}</p>
                    )}

                    <h2 className="contact-detail-name">
                      {myProfileName ?? formatShortNpub(currentNpub)}
                    </h2>

                    {effectiveMyLightningAddress ? (
                      <p className="contact-detail-ln">
                        {effectiveMyLightningAddress}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </>
          )}

          {status && <p className="status">{status}</p>}
        </section>
      )}
    </div>
  );
};

export default App;
