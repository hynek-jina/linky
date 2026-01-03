import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import React, { useMemo, useState } from "react";
import "./App.css";
import { parseCashuToken } from "./cashu";
import type { CashuTokenId, ContactId, NostrIdentityId } from "./evolu";
import { evolu, useEvolu } from "./evolu";
import { getInitialLang, persistLang, translations, type Lang } from "./i18n";
import { INITIAL_MNEMONIC_STORAGE_KEY } from "./mnemonic";
import {
  NOSTR_RELAYS,
  fetchNostrProfileMetadata,
  fetchNostrProfilePicture,
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
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

  const [cashuDraft, setCashuDraft] = useState("");
  const cashuDraftRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [cashuIsBusy, setCashuIsBusy] = useState(false);

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

  const currentNpub =
    (storedNostrIdentity?.npub
      ? String(storedNostrIdentity.npub)
      : derivedNostrIdentity?.npub) ?? null;

  const currentNsec =
    (storedNostrIdentity?.nsec
      ? String(storedNostrIdentity.nsec)
      : derivedNostrIdentity?.nsec) ?? null;

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
    // Store derived Nostr identity into Evolu if none is present yet.
    if (!owner?.mnemonic) return;
    if (storedNostrIdentity) return;
    if (!derivedNostrIdentity) return;

    const result = insert("nostrIdentity", {
      nsec: derivedNostrIdentity.nsec as typeof Evolu.NonEmptyString1000.Type,
      npub: derivedNostrIdentity.npub as typeof Evolu.NonEmptyString1000.Type,
    });

    if (!result.ok) {
      // no status; keep silent
    }
  }, [owner?.mnemonic, storedNostrIdentity, derivedNostrIdentity, insert]);

  React.useEffect(() => {
    // Load current user's Nostr profile (name + picture) from relays.
    if (!currentNpub) return;

    const cachedPic = loadCachedProfilePicture(currentNpub);
    if (cachedPic) setMyProfilePicture(cachedPic.url);

    const cachedMeta = loadCachedProfileMetadata(currentNpub);
    if (cachedMeta?.metadata) {
      const bestName = getBestNostrName(cachedMeta.metadata);
      if (bestName) setMyProfileName(bestName);
    }

    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const [picture, metadata] = await Promise.all([
          fetchNostrProfilePicture(currentNpub, { signal: controller.signal }),
          fetchNostrProfileMetadata(currentNpub, { signal: controller.signal }),
        ]);

        if (cancelled) return;

        saveCachedProfilePicture(currentNpub, picture);
        if (picture) setMyProfilePicture(picture);

        saveCachedProfileMetadata(currentNpub, metadata);
        const bestName = metadata ? getBestNostrName(metadata) : null;
        if (bestName) setMyProfileName(bestName);
      } catch {
        // ignore
      }
    };

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentNpub]);

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
  }, [contacts, route.kind, update]);

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
          });
          saveCachedProfilePicture(npub, url);
          if (cancelled) return;
          setNostrPictureByNpub((prev) => ({ ...prev, [npub]: url }));
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
  }, [contacts, nostrPictureByNpub]);

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
      const { nip19, getPublicKey } = await import("nostr-tools");
      const decoded = nip19.decode(text);
      if (decoded.type !== "nsec") {
        setStatus(t("nostrPasteInvalid"));
        return;
      }

      const privBytes = decoded.data as Uint8Array;
      const pubHex = getPublicKey(privBytes);
      const npub = nip19.npubEncode(pubHex);

      if (storedNostrIdentity?.id) {
        const result = update("nostrIdentity", {
          id: storedNostrIdentity.id as unknown as NostrIdentityId,
          nsec: text as typeof Evolu.NonEmptyString1000.Type,
          npub: npub as typeof Evolu.NonEmptyString1000.Type,
        });
        if (!result.ok) {
          setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
          return;
        }
      } else {
        const result = insert("nostrIdentity", {
          nsec: text as typeof Evolu.NonEmptyString1000.Type,
          npub: npub as typeof Evolu.NonEmptyString1000.Type,
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

    if (storedNostrIdentity?.id) {
      const result = update("nostrIdentity", {
        id: storedNostrIdentity.id as unknown as NostrIdentityId,
        nsec: derived.nsec as typeof Evolu.NonEmptyString1000.Type,
        npub: derived.npub as typeof Evolu.NonEmptyString1000.Type,
      });
      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        return;
      }
    } else {
      const result = insert("nostrIdentity", {
        nsec: derived.nsec as typeof Evolu.NonEmptyString1000.Type,
        npub: derived.npub as typeof Evolu.NonEmptyString1000.Type,
      });
      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        return;
      }
    }

    setStatus(t("nostrKeysDerived"));
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

    if (route.kind === "contact" && selectedContact) {
      return {
        icon: "✎",
        label: t("editContact"),
        onClick: () => navigateToContactEdit(selectedContact.id),
      };
    }

    return null;
  })();

  const topbarTitle = (() => {
    if (route.kind === "contacts") return t("contactsTitle");
    if (route.kind === "wallet") return t("wallet");
    if (route.kind === "settings") return t("menu");
    if (route.kind === "profile") return t("profile");
    if (route.kind === "contactNew") return t("newContact");
    if (route.kind === "chat") {
      return selectedContact?.name ? String(selectedContact.name) : t("chat");
    }
    return null;
  })();

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
                {myProfileName ?? t("profileNoName")}
              </span>
              {currentNpub ? (
                <span className="profile-npub">{currentNpub}</span>
              ) : null}
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
              <p className="muted">{t("myNpubQr")}</p>
              {myProfileQr ? (
                <img
                  className="qr"
                  src={myProfileQr}
                  alt={t("myNpubQr")}
                  onClick={() => {
                    if (!currentNpub) return;
                    void copyText(currentNpub);
                  }}
                />
              ) : (
                <p className="muted">{currentNpub}</p>
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
