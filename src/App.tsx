import * as Evolu from "@evolu/common";
import { useOwner, useQuery } from "@evolu/react";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React, { useMemo, useState } from "react";
import "./App.css";
import { parseCashuToken } from "./cashu";
import { deriveDefaultProfile } from "./derivedProfile";
import type { CashuTokenId, ContactId, MintId } from "./evolu";
import {
  createJournalEntryPayload,
  evolu,
  normalizeEvoluServerUrl,
  useEvolu,
  useEvoluLastError,
  useEvoluServersManager,
  useEvoluSyncOwner,
  wipeEvoluStorage as wipeEvoluStorageImpl,
} from "./evolu";
import { useInit } from "./hooks/useInit";
import {
  navigateToAdvanced,
  navigateToCashuToken,
  navigateToCashuTokenNew,
  navigateToChat,
  navigateToContact,
  navigateToContactEdit,
  navigateToContactPay,
  navigateToContacts,
  navigateToEvoluServer,
  navigateToEvoluServers,
  navigateToLnAddressPay,
  navigateToMint,
  navigateToMints,
  navigateToNewContact,
  navigateToNewEvoluServer,
  navigateToNewRelay,
  navigateToNostrRelay,
  navigateToNostrRelays,
  navigateToPaymentsHistory,
  navigateToProfile,
  navigateToSettings,
  navigateToTopup,
  navigateToTopupInvoice,
  navigateToWallet,
  useRouting,
} from "./hooks/useRouting";
import { useToasts } from "./hooks/useToasts";
import { getInitialLang, persistLang, translations, type Lang } from "./i18n";
import LinkyLogo from "./LinkyLogo.tsx";
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
import { publishKind0ProfileMetadata } from "./nostrPublish";
import type { Route } from "./types/route";
import {
  CONTACTS_ONBOARDING_DISMISSED_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  FEEDBACK_CONTACT_NPUB,
  NO_GROUP_FILTER,
  NOSTR_NSEC_STORAGE_KEY,
  UNIT_TOGGLE_STORAGE_KEY,
} from "./utils/constants";
import {
  safeLocalStorageGet,
  safeLocalStorageGetJson,
  safeLocalStorageSet,
  safeLocalStorageSetJson,
} from "./utils/storage";

const LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY = "linky.lastAcceptedCashuToken.v1";

const LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX = "linky.local.paymentEvents.v1";
const LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX = "linky.local.nostrMessages.v1";
const LOCAL_MINT_INFO_STORAGE_KEY_PREFIX = "linky.local.mintInfo.v1";

type LocalPaymentEvent = {
  id: string;
  createdAtSec: number;
  direction: "in" | "out";
  status: "ok" | "error";
  amount: number | null;
  fee: number | null;
  mint: string | null;
  unit: string | null;
  error: string | null;
  contactId: string | null;
};

type LocalNostrMessage = {
  id: string;
  contactId: string;
  direction: "in" | "out";
  content: string;
  wrapId: string;
  rumorId: string | null;
  pubkey: string;
  createdAtSec: number;
};

type LocalMintInfoRow = {
  id: string;
  url: string;
  isDeleted?: unknown;
  firstSeenAtSec?: unknown;
  lastSeenAtSec?: unknown;
  supportsMpp?: unknown;
  feesJson?: unknown;
  infoJson?: unknown;
  lastCheckedAtSec?: unknown;
};

type AppNostrPool = {
  publish: (
    relays: string[],
    event: NostrToolsEvent
  ) => Array<Promise<unknown>>;
  querySync: (
    relays: string[],
    filter: Record<string, unknown>,
    opts: { maxWait: number }
  ) => Promise<unknown>;
  subscribe: (
    relays: string[],
    filter: Record<string, unknown>,
    opts: { onevent: (event: NostrToolsEvent) => void }
  ) => { close: (reason?: string) => Promise<void> | void };
};

type ContactsGuideKey = "add_contact" | "topup" | "pay" | "message";

type ContactsGuideStep = {
  id: string;
  selector: string;
  titleKey: keyof typeof translations.cs;
  bodyKey: keyof typeof translations.cs;
  ensure?: () => void;
};

let sharedAppNostrPoolPromise: Promise<AppNostrPool> | null = null;
const getSharedAppNostrPool = async (): Promise<AppNostrPool> => {
  if (sharedAppNostrPoolPromise) return sharedAppNostrPoolPromise;

  sharedAppNostrPoolPromise = (async () => {
    const { SimplePool } = await import("nostr-tools");
    const pool = new SimplePool();
    return pool as unknown as AppNostrPool;
  })().catch((error) => {
    sharedAppNostrPoolPromise = null;
    throw error;
  });

  return sharedAppNostrPoolPromise;
};

type ContactFormState = {
  name: string;
  npub: string;
  lnAddress: string;
  group: string;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const getInitialUseBitcoinSymbol = (): boolean => {
  try {
    return localStorage.getItem(UNIT_TOGGLE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const getInitialNostrNsec = (): string | null => {
  try {
    const raw = localStorage.getItem(NOSTR_NSEC_STORAGE_KEY);
    const v = String(raw ?? "").trim();
    return v ? v : null;
  } catch {
    return null;
  }
};

const makeEmptyForm = (): ContactFormState => ({
  name: "",
  npub: "",
  lnAddress: "",
  group: "",
});

const App = () => {
  const { insert, update, upsert } = useEvolu();

  const normalizeMintUrl = (value: unknown): string => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    const stripped = raw.replace(/\/+$/, "");

    try {
      const u = new URL(stripped);
      const host = u.host.toLowerCase();
      const pathname = u.pathname.replace(/\/+$/, "");

      // Canonicalize our main mint: always use the /Bitcoin variant.
      if (host === "mint.minibits.cash") {
        return "https://mint.minibits.cash/Bitcoin";
      }

      // Keep path for other mints (some are hosted under a path), but drop
      // search/hash for stable identity.
      return `${u.origin}${pathname}`.replace(/\/+$/, "");
    } catch {
      return stripped;
    }
  };

  const MAIN_MINT_URL = "https://mint.minibits.cash/Bitcoin";

  const appOwnerIdRef = React.useRef<Evolu.OwnerId | null>(null);

  const makeLocalStorageKey = React.useCallback((prefix: string): string => {
    const ownerId = appOwnerIdRef.current;
    return `${prefix}.${String(ownerId ?? "anon")}`;
  }, []);

  const makeLocalId = (): string => {
    try {
      return globalThis.crypto?.randomUUID?.() ?? "";
    } catch {
      // ignore
    }
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const [paymentEvents, setPaymentEvents] = useState<LocalPaymentEvent[]>(
    () => []
  );

  const route = useRouting();
  const { toasts, pushToast } = useToasts();

  const evoluServers = useEvoluServersManager();
  const evoluServerUrls = evoluServers.configuredUrls;
  const evoluActiveServerUrls = evoluServers.activeUrls;
  const evoluServerStatusByUrl = evoluServers.statusByUrl;
  const evoluServersReloadRequired = evoluServers.reloadRequired;
  const saveEvoluServerUrls = evoluServers.setServerUrls;
  const isEvoluServerOffline = evoluServers.isOffline;
  const setEvoluServerOffline = evoluServers.setServerOffline;

  const [newEvoluServerUrl, setNewEvoluServerUrl] = useState("");

  const logPaymentEvent = React.useCallback(
    (event: {
      direction: "in" | "out";
      status: "ok" | "error";
      amount?: number | null;
      fee?: number | null;
      mint?: string | null;
      unit?: string | null;
      error?: string | null;
      contactId?: ContactId | null;
    }) => {
      const ownerId = appOwnerIdRef.current;
      if (!ownerId) return;

      const nowSec = Math.floor(Date.now() / 1000);
      const amount =
        typeof event.amount === "number" && event.amount > 0
          ? Math.floor(event.amount)
          : null;
      const fee =
        typeof event.fee === "number" && event.fee > 0
          ? Math.floor(event.fee)
          : null;

      const mint = String(event.mint ?? "").trim();
      const unit = String(event.unit ?? "").trim();
      const err = String(event.error ?? "").trim();

      const entry: LocalPaymentEvent = {
        id: makeLocalId(),
        createdAtSec: nowSec,
        direction: event.direction,
        status: event.status,
        amount,
        fee,
        mint: mint || null,
        unit: unit || null,
        error: err ? err.slice(0, 1000) : null,
        contactId: event.contactId ? String(event.contactId) : null,
      };

      setPaymentEvents((prev) => {
        const next = [entry, ...prev].slice(0, 250);
        safeLocalStorageSetJson(
          makeLocalStorageKey(LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX),
          next
        );
        return next;
      });
    },
    [makeLocalStorageKey]
  );

  const [form, setForm] = useState<ContactFormState>(makeEmptyForm());
  const [editingId, setEditingId] = useState<ContactId | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const importDataFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [recentlyReceivedToken, setRecentlyReceivedToken] = useState<null | {
    token: string;
    amount: number | null;
  }>(null);
  const recentlyReceivedTokenTimerRef = React.useRef<number | null>(null);

  const [paidOverlayIsOpen, setPaidOverlayIsOpen] = useState(false);
  const [paidOverlayTitle, setPaidOverlayTitle] = useState<string | null>(null);
  const paidOverlayTimerRef = React.useRef<number | null>(null);
  const topupPaidNavTimerRef = React.useRef<number | null>(null);
  const topupInvoiceStartBalanceRef = React.useRef<number | null>(null);
  const topupInvoicePaidHandledRef = React.useRef(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<ContactId | null>(
    null
  );
  const [pendingCashuDeleteId, setPendingCashuDeleteId] =
    useState<CashuTokenId | null>(null);
  const [pendingRelayDeleteUrl, setPendingRelayDeleteUrl] = useState<
    string | null
  >(null);
  const [pendingMintDeleteUrl, setPendingMintDeleteUrl] = useState<
    string | null
  >(null);
  const [logoutArmed, setLogoutArmed] = useState(false);
  const [dedupeContactsIsBusy, setDedupeContactsIsBusy] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const [contactsOnboardingDismissed, setContactsOnboardingDismissed] =
    useState<boolean>(
      () =>
        safeLocalStorageGet(CONTACTS_ONBOARDING_DISMISSED_STORAGE_KEY) === "1"
    );

  const [contactsOnboardingHasPaid, setContactsOnboardingHasPaid] =
    useState<boolean>(
      () =>
        safeLocalStorageGet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY) === "1"
    );

  const [contactsOnboardingCelebrating, setContactsOnboardingCelebrating] =
    useState(false);

  const [contactsGuide, setContactsGuide] = useState<null | {
    task: ContactsGuideKey;
    step: number;
  }>(null);

  const [contactsGuideTargetContactId, setContactsGuideTargetContactId] =
    React.useState<ContactId | null>(null);

  const [contactsGuideHighlightRect, setContactsGuideHighlightRect] =
    useState<null | {
      top: number;
      left: number;
      width: number;
      height: number;
    }>(null);

  // Ephemeral per-contact activity indicator.
  // When a message/payment arrives, we show a dot and temporarily bump the
  // contact to the top until the user opens it.
  const [contactAttentionById, setContactAttentionById] = useState<
    Record<string, number>
  >(() => ({}));
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const [useBitcoinSymbol, setUseBitcoinSymbol] = useState<boolean>(() =>
    getInitialUseBitcoinSymbol()
  );

  const displayUnit = useBitcoinSymbol ? "₿" : "sat";

  const [currentNsec] = useState<string | null>(() => getInitialNostrNsec());
  const [currentNpub, setCurrentNpub] = useState<string | null>(null);

  // Evolu is local-first; to get automatic cross-device/browser sync you must
  // "use" an owner (which starts syncing over configured transports).
  // We only enable it after the user has an nsec (our identity gate).
  const syncOwner = useEvoluSyncOwner(Boolean(currentNsec));

  useOwner(syncOwner);

  const evoluLastError = useEvoluLastError({ logToConsole: true });
  const evoluHasError = Boolean(evoluLastError);

  const evoluConnectedServerCount = useMemo(() => {
    if (evoluHasError) return 0;
    return evoluActiveServerUrls.reduce((sum, url) => {
      return sum + (evoluServerStatusByUrl[url] === "connected" ? 1 : 0);
    }, 0);
  }, [evoluActiveServerUrls, evoluHasError, evoluServerStatusByUrl]);

  const evoluOverallStatus = useMemo(() => {
    if (!syncOwner) return "disconnected" as const;
    if (evoluHasError) return "disconnected" as const;
    if (evoluActiveServerUrls.length === 0) return "disconnected" as const;
    const states = evoluActiveServerUrls.map(
      (url) => evoluServerStatusByUrl[url] ?? "checking"
    );
    if (states.some((s) => s === "connected")) return "connected" as const;
    if (states.some((s) => s === "checking")) return "checking" as const;
    return "disconnected" as const;
  }, [evoluActiveServerUrls, evoluHasError, evoluServerStatusByUrl, syncOwner]);

  const selectedEvoluServerUrl = useMemo(() => {
    if (route.kind !== "evoluServer") return null;
    const url = String(route.id ?? "").trim();
    return url || null;
  }, [route]);

  const appOwnerId =
    (syncOwner as unknown as { id?: Evolu.OwnerId } | null)?.id ?? null;

  React.useEffect(() => {
    appOwnerIdRef.current = appOwnerId;
    if (!appOwnerId) return;
    setPaymentEvents(
      safeLocalStorageGetJson(
        `${LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX}.${String(appOwnerId)}`,
        [] as LocalPaymentEvent[]
      )
    );
  }, [appOwnerId]);

  const resolveOwnerIdForWrite = React.useCallback(async () => {
    if (appOwnerIdRef.current) return appOwnerIdRef.current;
    try {
      const owner = await evolu.appOwner;
      return (owner as unknown as { id?: Evolu.OwnerId } | null)?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  const [onboardingIsBusy, setOnboardingIsBusy] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<null | {
    step: 1 | 2 | 3;
    derivedName: string | null;
    error: string | null;
  }>(null);

  // Evolu error subscription handled by useEvoluLastError.

  const [evoluWipeStorageIsBusy, setEvoluWipeStorageIsBusy] =
    useState<boolean>(false);

  const wipeEvoluStorage = React.useCallback(async () => {
    if (evoluWipeStorageIsBusy) return;
    setEvoluWipeStorageIsBusy(true);

    try {
      wipeEvoluStorageImpl();
    } catch {
      pushToast(
        lang === "cs"
          ? "Chybí uložený mnemonic (nelze vyčistit Evolu storage)."
          : "Missing stored mnemonic (cannot clear Evolu storage)."
      );
    } finally {
      setEvoluWipeStorageIsBusy(false);
    }
  }, [evoluWipeStorageIsBusy, lang, pushToast]);

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

  useInit(() => {
    const urlMap = avatarObjectUrlsByNpubRef.current;

    return () => {
      for (const url of urlMap.values()) {
        if (!url || !url.startsWith("blob:")) continue;
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
      urlMap.clear();
    };
  });

  const [cashuDraft, setCashuDraft] = useState("");
  const cashuDraftRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [cashuIsBusy, setCashuIsBusy] = useState(false);

  const cashuOpQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const enqueueCashuOp = React.useCallback((op: () => Promise<void>) => {
    const next = cashuOpQueueRef.current.then(op, op);
    cashuOpQueueRef.current = next.catch(() => {});
    return next;
  }, []);

  const [defaultMintUrl, setDefaultMintUrl] = useState<string | null>(null);

  const [newRelayUrl, setNewRelayUrl] = useState<string>("");
  const [relayStatusByUrl, setRelayStatusByUrl] = useState<
    Record<string, "checking" | "connected" | "disconnected">
  >(() => ({}));

  const [payAmount, setPayAmount] = useState<string>("");

  const [topupAmount, setTopupAmount] = useState<string>("");
  const [topupInvoice, setTopupInvoice] = useState<string | null>(null);
  const [topupInvoiceQr, setTopupInvoiceQr] = useState<string | null>(null);
  const [topupInvoiceError, setTopupInvoiceError] = useState<string | null>(
    null
  );
  const [topupInvoiceIsBusy, setTopupInvoiceIsBusy] = useState(false);

  const [chatDraft, setChatDraft] = useState<string>("");
  const chatSeenWrapIdsRef = React.useRef<Set<string>>(new Set());
  const autoAcceptedChatMessageIdsRef = React.useRef<Set<string>>(new Set());

  const [mintIconUrlByMint, setMintIconUrlByMint] = useState<
    Record<string, string | null>
  >(() => ({}));

  const [scanIsOpen, setScanIsOpen] = useState(false);
  const [scanStream, setScanStream] = useState<MediaStream | null>(null);
  const scanVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const scanOpenRequestIdRef = React.useRef(0);
  const scanIsOpenRef = React.useRef(false);

  React.useEffect(() => {
    scanIsOpenRef.current = scanIsOpen;
  }, [scanIsOpen]);

  const chatMessagesRef = React.useRef<HTMLDivElement | null>(null);
  const chatMessageElByIdRef = React.useRef<Map<string, HTMLDivElement>>(
    new Map()
  );
  const chatDidInitialScrollForContactRef = React.useRef<string | null>(null);

  const getMintOriginAndHost = React.useCallback(
    (mint: unknown): { origin: string | null; host: string | null } => {
      const raw = String(mint ?? "").trim();
      if (!raw) return { origin: null, host: null };
      try {
        const u = new URL(raw);
        return { origin: u.origin, host: u.host };
      } catch {
        return { origin: null, host: raw };
      }
    },
    []
  );

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
  const [profileEditPicture, setProfileEditPicture] = useState<string>("");
  const profilePhotoInputRef = React.useRef<HTMLInputElement | null>(null);

  const profileEditInitialRef = React.useRef<{
    name: string;
    lnAddress: string;
    picture: string;
  } | null>(null);

  const profileFetchToastShownForNpubRef = React.useRef<string | null>(null);

  const contactEditInitialRef = React.useRef<{
    id: ContactId;
    name: string;
    npub: string;
    lnAddress: string;
    group: string;
  } | null>(null);

  const npubCashClaimInFlightRef = React.useRef(false);

  const nostrInFlight = React.useRef<Set<string>>(new Set());
  const nostrMetadataInFlight = React.useRef<Set<string>>(new Set());

  const t = React.useCallback(
    (key: string) =>
      (translations[lang] as unknown as Record<string, string>)[key] ?? key,
    [lang]
  );

  React.useEffect(() => {
    const storage = (
      navigator as unknown as {
        storage?: {
          persisted?: () => Promise<boolean>;
          persist?: () => Promise<boolean>;
        };
      }
    ).storage;
    if (!storage?.persisted || !storage?.persist) return;

    let cancelled = false;
    void (async () => {
      try {
        const persisted = await storage.persisted!();
        if (cancelled) return;
        if (persisted) return;

        await storage.persist!();
        if (cancelled) return;

        await storage.persisted!();
        if (cancelled) return;
        // We still attempt to request persistent storage, but we no longer
        // show a toast if it can't be obtained (private browsing, etc.).
        // (Intentionally silent.)
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pushToast, t]);

  useInit(() => {
    const paidTimerRef = paidOverlayTimerRef;
    const topupNavTimerRef = topupPaidNavTimerRef;
    return () => {
      if (paidTimerRef.current !== null) {
        try {
          window.clearTimeout(paidTimerRef.current);
        } catch {
          // ignore
        }
      }
      paidTimerRef.current = null;

      if (topupNavTimerRef.current !== null) {
        try {
          window.clearTimeout(topupNavTimerRef.current);
        } catch {
          // ignore
        }
      }
      topupNavTimerRef.current = null;
    };
  });

  const showPaidOverlay = React.useCallback(
    (title?: string) => {
      const resolved = title ?? (lang === "cs" ? "Zaplaceno" : "Paid");
      setPaidOverlayTitle(resolved);
      setPaidOverlayIsOpen(true);
      if (paidOverlayTimerRef.current !== null) {
        try {
          window.clearTimeout(paidOverlayTimerRef.current);
        } catch {
          // ignore
        }
      }
      paidOverlayTimerRef.current = window.setTimeout(() => {
        setPaidOverlayIsOpen(false);
        paidOverlayTimerRef.current = null;
      }, 3000);
    },
    [lang]
  );

  const maybeShowPwaNotification = React.useCallback(
    async (title: string, body: string, tag?: string) => {
      // Best-effort: only notify when the app isn't currently visible.
      try {
        if (document.visibilityState === "visible") return;
      } catch {
        // ignore
      }

      if (!("Notification" in globalThis)) return;

      let permission = Notification.permission;
      if (permission === "default") {
        try {
          permission = await Notification.requestPermission();
        } catch {
          return;
        }
      }
      if (permission !== "granted") return;

      const safeTitle = String(title ?? "").trim() || t("appTitle");
      const safeBody = String(body ?? "").trim();
      const options: NotificationOptions = tag
        ? { body: safeBody, tag: String(tag) }
        : { body: safeBody };

      try {
        if ("serviceWorker" in navigator) {
          const reg = await navigator.serviceWorker.ready.catch(() => null);
          if (reg) {
            await reg.showNotification(safeTitle, options);
            return;
          }
        }
      } catch {
        // ignore
      }

      try {
        // Fallback for browsers that allow direct notifications.
        new Notification(safeTitle, options);
      } catch {
        // ignore
      }
    },
    [t]
  );

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

  const formatMiddleDots = (value: string, maxLen: number): string => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return "";
    if (!Number.isFinite(maxLen) || maxLen <= 0) return trimmed;
    if (trimmed.length <= maxLen) return trimmed;
    if (maxLen <= 6) return `${trimmed.slice(0, maxLen)}`;

    const remaining = maxLen - 3;
    const startLen = Math.ceil(remaining / 2);
    const endLen = Math.floor(remaining / 2);
    return `${trimmed.slice(0, startLen)}...${trimmed.slice(-endLen)}`;
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
  const formatInteger = React.useCallback(
    (value: number) =>
      numberFormatter.format(
        Number.isFinite(value) ? Math.trunc(value) : Math.trunc(0)
      ),
    [numberFormatter]
  );

  React.useEffect(() => {
    // Reset pay amount when leaving the pay page.
    if (route.kind !== "contactPay") {
      setPayAmount("");
    }
  }, [route.kind]);

  React.useEffect(() => {
    // Reset topup state when leaving the topup flow.
    if (route.kind !== "topup" && route.kind !== "topupInvoice") {
      setTopupAmount("");
      setTopupInvoice(null);
      setTopupInvoiceQr(null);
      setTopupInvoiceError(null);
      setTopupInvoiceIsBusy(false);

      topupInvoiceStartBalanceRef.current = null;
      topupInvoicePaidHandledRef.current = false;
      if (topupPaidNavTimerRef.current !== null) {
        try {
          window.clearTimeout(topupPaidNavTimerRef.current);
        } catch {
          // ignore
        }
        topupPaidNavTimerRef.current = null;
      }
    }
  }, [route.kind]);

  React.useEffect(() => {
    if (route.kind !== "topupInvoice") return;

    const lnAddress = currentNpub ? `${currentNpub}@npub.cash` : "";
    const amountSat = Number.parseInt(topupAmount.trim(), 10);
    const invalid = !lnAddress || !Number.isFinite(amountSat) || amountSat <= 0;
    if (invalid) {
      setTopupInvoice(null);
      setTopupInvoiceQr(null);
      setTopupInvoiceError(null);
      setTopupInvoiceIsBusy(false);
      return;
    }

    let cancelled = false;
    setTopupInvoice(null);
    setTopupInvoiceQr(null);
    setTopupInvoiceError(null);
    setTopupInvoiceIsBusy(true);

    topupInvoiceStartBalanceRef.current = null;
    topupInvoicePaidHandledRef.current = false;

    void (async () => {
      try {
        const { fetchLnurlInvoiceForLightningAddress } = await import(
          "./lnurlPay"
        );

        const displayName = (() => {
          if (myProfileName) return String(myProfileName).trim();
          if (!currentNpub) return "";
          return (
            deriveDefaultProfile(currentNpub)?.name ??
            formatShortNpub(currentNpub)
          );
        })();

        const invoiceComment = `${displayName || t("appTitle")}`;

        const invoice = await fetchLnurlInvoiceForLightningAddress(
          lnAddress,
          amountSat,
          invoiceComment
        );
        if (cancelled) return;

        setTopupInvoice(invoice);

        const QRCode = await import("qrcode");
        const qr = await QRCode.toDataURL(invoice, {
          margin: 1,
          width: 320,
        });
        if (cancelled) return;
        setTopupInvoiceQr(qr);
      } catch {
        if (!cancelled) setTopupInvoiceError(t("topupInvoiceFailed"));
      } finally {
        if (!cancelled) setTopupInvoiceIsBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentNpub, myProfileName, route.kind, t, topupAmount]);

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
    if (!pendingMintDeleteUrl) return;
    const timeoutId = window.setTimeout(() => {
      setPendingMintDeleteUrl(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingMintDeleteUrl]);

  React.useEffect(() => {
    if (!logoutArmed) return;
    const timeoutId = window.setTimeout(() => {
      setLogoutArmed(false);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [logoutArmed]);

  React.useEffect(() => {
    if (!status) return;
    pushToast(status);
    setStatus(null);
  }, [pushToast, status]);

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

  const dedupeContacts = React.useCallback(async () => {
    if (dedupeContactsIsBusy) return;
    setDedupeContactsIsBusy(true);

    const fmt = (template: string, vars: Record<string, string | number>) => {
      return String(template ?? "").replace(/\{(\w+)\}/g, (_m, k: string) =>
        String(vars[k] ?? "")
      );
    };

    const normalize = (value: unknown): string => {
      return String(value ?? "")
        .trim()
        .toLowerCase();
    };

    const fieldScore = (value: unknown): number => (normalize(value) ? 1 : 0);

    try {
      const n = contacts.length;
      if (n === 0) {
        pushToast(t("dedupeContactsNone"));
        return;
      }

      const parent = Array.from({ length: n }, (_v, i) => i);
      const find = (i: number): number => {
        let x = i;
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]];
          x = parent[x];
        }
        return x;
      };
      const union = (a: number, b: number) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[rb] = ra;
      };

      const keyToIndex = new Map<string, number>();
      for (let i = 0; i < n; i += 1) {
        const c = contacts[i];
        const npub = normalize(c.npub);
        const ln = normalize(c.lnAddress);
        const keys: string[] = [];
        if (npub) keys.push(`npub:${npub}`);
        if (ln) keys.push(`ln:${ln}`);

        for (const k of keys) {
          const prev = keyToIndex.get(k);
          if (prev == null) keyToIndex.set(k, i);
          else union(i, prev);
        }
      }

      const groups = new Map<number, number[]>();
      for (let i = 0; i < n; i += 1) {
        const root = find(i);
        const arr = groups.get(root);
        if (arr) arr.push(i);
        else groups.set(root, [i]);
      }

      const dupGroups = [...groups.values()].filter((g) => g.length > 1);
      if (dupGroups.length === 0) {
        pushToast(t("dedupeContactsNone"));
        return;
      }

      let removedContacts = 0;
      const movedMessages = 0;

      for (const idxs of dupGroups) {
        const group = idxs.map((i) => contacts[i]);

        // Keep the most complete contact (tie-breaker: newest).
        let keep = group[0];
        let keepScore =
          fieldScore(keep.name) +
          fieldScore(keep.npub) +
          fieldScore(keep.lnAddress) +
          fieldScore(keep.groupName);
        let keepCreated = Number(keep.createdAt ?? 0);

        for (const c of group.slice(1)) {
          const score =
            fieldScore(c.name) +
            fieldScore(c.npub) +
            fieldScore(c.lnAddress) +
            fieldScore(c.groupName);
          const created = Number(c.createdAt ?? 0);
          if (
            score > keepScore ||
            (score === keepScore && created > keepCreated)
          ) {
            keep = c;
            keepScore = score;
            keepCreated = created;
          }
        }

        const keepId = keep.id as ContactId;
        let mergedName = normalize(keep.name) ? keep.name : null;
        let mergedNpub = normalize(keep.npub) ? keep.npub : null;
        let mergedLn = normalize(keep.lnAddress) ? keep.lnAddress : null;
        let mergedGroup = normalize(keep.groupName) ? keep.groupName : null;

        for (const c of group) {
          if (!mergedName && normalize(c.name)) mergedName = c.name;
          if (!mergedNpub && normalize(c.npub)) mergedNpub = c.npub;
          if (!mergedLn && normalize(c.lnAddress)) mergedLn = c.lnAddress;
          if (!mergedGroup && normalize(c.groupName)) mergedGroup = c.groupName;
        }

        const keepNeedsUpdate =
          (keep.name ?? null) !== (mergedName ?? null) ||
          (keep.npub ?? null) !== (mergedNpub ?? null) ||
          (keep.lnAddress ?? null) !== (mergedLn ?? null) ||
          (keep.groupName ?? null) !== (mergedGroup ?? null);

        if (keepNeedsUpdate) {
          const result = appOwnerId
            ? update(
                "contact",
                {
                  id: keepId,
                  name: mergedName as
                    | typeof Evolu.NonEmptyString1000.Type
                    | null,
                  npub: mergedNpub as
                    | typeof Evolu.NonEmptyString1000.Type
                    | null,
                  lnAddress: mergedLn as
                    | typeof Evolu.NonEmptyString1000.Type
                    | null,
                  groupName: mergedGroup as
                    | typeof Evolu.NonEmptyString1000.Type
                    | null,
                },
                { ownerId: appOwnerId }
              )
            : update("contact", {
                id: keepId,
                name: mergedName as typeof Evolu.NonEmptyString1000.Type | null,
                npub: mergedNpub as typeof Evolu.NonEmptyString1000.Type | null,
                lnAddress: mergedLn as
                  | typeof Evolu.NonEmptyString1000.Type
                  | null,
                groupName: mergedGroup as
                  | typeof Evolu.NonEmptyString1000.Type
                  | null,
              });
          if (!result.ok) {
            throw new Error(String(result.error ?? "contact update failed"));
          }
        }

        for (const c of group) {
          const dupId = c.id as ContactId;
          if (dupId === keepId) continue;

          const del = appOwnerId
            ? update(
                "contact",
                { id: dupId, isDeleted: Evolu.sqliteTrue },
                { ownerId: appOwnerId }
              )
            : update("contact", { id: dupId, isDeleted: Evolu.sqliteTrue });
          if (del.ok) removedContacts += 1;
        }
      }

      pushToast(
        fmt(t("dedupeContactsResult"), {
          groups: dupGroups.length,
          removed: removedContacts,
          moved: movedMessages,
        })
      );
    } catch (e) {
      console.log("[linky] dedupe contacts failed", e);
      pushToast(t("dedupeContactsFailed"));
    } finally {
      setDedupeContactsIsBusy(false);
    }
  }, [appOwnerId, contacts, dedupeContactsIsBusy, pushToast, t, update]);

  React.useEffect(() => {
    // One-time migration: if this device/browser previously created contacts
    // under a different (random) owner, they will never sync to other browsers
    // even after we restore the AppOwner.
    // Re-emitting contacts via upsert with the correct ownerId makes them
    // available to sync transports.
    if (!currentNsec) return;
    if (!appOwnerId) return;
    if (contacts.length === 0) return;

    const ownerKey = String(appOwnerId);
    const migrationKey = `linky.contacts_owner_migrated_v1:${ownerKey}`;

    try {
      if (localStorage.getItem(migrationKey) === "1") return;
    } catch {
      // ignore
    }

    let okCount = 0;
    let failCount = 0;

    for (const c of contacts) {
      const payload = {
        id: c.id as ContactId,
        name: String(c.name ?? "").trim()
          ? (String(
              c.name ?? ""
            ).trim() as typeof Evolu.NonEmptyString1000.Type)
          : null,
        npub: String(c.npub ?? "").trim()
          ? (String(
              c.npub ?? ""
            ).trim() as typeof Evolu.NonEmptyString1000.Type)
          : null,
        lnAddress: String(c.lnAddress ?? "").trim()
          ? (String(
              c.lnAddress ?? ""
            ).trim() as typeof Evolu.NonEmptyString1000.Type)
          : null,
        groupName: String(c.groupName ?? "").trim()
          ? (String(
              c.groupName ?? ""
            ).trim() as typeof Evolu.NonEmptyString1000.Type)
          : null,
      };

      const r = upsert("contact", payload, { ownerId: appOwnerId });
      if (r.ok) okCount += 1;
      else failCount += 1;
    }

    try {
      localStorage.setItem(migrationKey, "1");
    } catch {
      // ignore
    }

    console.log("[linky][evolu] migrated contacts to appOwner", {
      ownerId: ownerKey.length > 10 ? `${ownerKey.slice(0, 10)}…` : ownerKey,
      ok: okCount,
      failed: failCount,
    });
  }, [appOwnerId, contacts, currentNsec, upsert]);

  React.useEffect(() => {
    const nsec = String(currentNsec ?? "").trim();
    if (!nsec) {
      setCurrentNpub(null);
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
        setCurrentNpub(npub);
      } catch {
        if (cancelled) return;
        setCurrentNpub(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [currentNsec]);

  const [relayUrls, setRelayUrls] = useState<string[]>(() => [...NOSTR_RELAYS]);

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
  }, [checkRelayConnection, relayUrls]);

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

      const { finalizeEvent, getPublicKey, nip19 } = await import(
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

      const pool = await getSharedAppNostrPool();
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
        const { nip19 } = await import("nostr-tools");

        const decoded = nip19.decode(currentNpub);
        if (decoded.type !== "npub") return;
        const pubkey = decoded.data as string;

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
          { maxWait: 5000 }
        );

        const relayListEvents = Array.isArray(events)
          ? (events as NostrToolsEvent[])
          : [];

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

  const cashuTokensAllRef = React.useRef(cashuTokensAll);
  React.useEffect(() => {
    cashuTokensAllRef.current = cashuTokensAll;
  }, [cashuTokensAll]);

  const ensuredTokenRef = React.useRef<Set<string>>(new Set());
  const ensureCashuTokenPersisted = React.useCallback(
    (token: string) => {
      const remembered = String(token ?? "").trim();
      if (!remembered) return;

      // Delay to give Evolu time to reflect the insert in queries.
      window.setTimeout(() => {
        try {
          const ownerId = appOwnerIdRef.current;
          if (!ownerId) return;

          const current = cashuTokensAllRef.current;
          const exists = current.some((row) => {
            const r = row as unknown as {
              token?: unknown;
              rawToken?: unknown;
              isDeleted?: unknown;
            };
            if (r.isDeleted) return false;
            const stored = String(r.token ?? r.rawToken ?? "").trim();
            return stored && stored === remembered;
          });
          if (exists) {
            safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
            return;
          }

          // Prevent repeated inserts for the same token string in one session.
          if (ensuredTokenRef.current.has(remembered)) return;
          ensuredTokenRef.current.add(remembered);

          const parsed = parseCashuToken(remembered);
          const mint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
          const amount =
            parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

          const r = insert(
            "cashuToken",
            {
              token: remembered as typeof Evolu.NonEmptyString.Type,
              rawToken: null,
              mint: mint
                ? (mint as typeof Evolu.NonEmptyString1000.Type)
                : null,
              unit: null,
              amount:
                typeof amount === "number" && amount > 0
                  ? (Math.floor(amount) as typeof Evolu.PositiveInt.Type)
                  : null,
              state: "accepted" as typeof Evolu.NonEmptyString100.Type,
              error: null,
            },
            { ownerId }
          );

          if (r.ok) {
            logPaymentEvent({
              direction: "in",
              status: "ok",
              amount: typeof amount === "number" ? amount : null,
              fee: null,
              mint,
              unit: null,
              error: null,
              contactId: null,
            });
            safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
          }
        } catch {
          // ignore
        }
      }, 800);
    },
    [insert, logPaymentEvent]
  );

  React.useEffect(() => {
    // If we have a remembered accepted token (from previous session) and it's
    // missing in the DB, try to restore it automatically.
    const remembered = String(
      safeLocalStorageGet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY) ?? ""
    ).trim();
    if (!remembered) return;
    ensureCashuTokenPersisted(remembered);
  }, [cashuTokensAll, ensureCashuTokenPersisted]);

  const autoRestoreLastAcceptedTokenAttemptedRef = React.useRef(false);
  React.useEffect(() => {
    // Best-effort recovery: if the app previously accepted a token but the
    // local DB is empty/missing it (storage cleared, etc.), restore it
    // automatically without showing UI.
    if (autoRestoreLastAcceptedTokenAttemptedRef.current) return;
    autoRestoreLastAcceptedTokenAttemptedRef.current = true;

    const remembered = String(
      safeLocalStorageGet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY) ?? ""
    ).trim();
    if (!remembered) return;

    const ownerId = appOwnerIdRef.current;
    if (!ownerId) return;

    const exists = cashuTokensAll.some((row) => {
      const r = row as unknown as {
        token?: unknown;
        rawToken?: unknown;
        isDeleted?: unknown;
      };
      if (r.isDeleted) return false;
      const stored = String(r.token ?? r.rawToken ?? "").trim();
      return stored && stored === remembered;
    });

    if (exists) {
      safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
      return;
    }

    const parsed = parseCashuToken(remembered);
    const mint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
    const amount = parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

    const r = insert(
      "cashuToken",
      {
        token: remembered as typeof Evolu.NonEmptyString.Type,
        rawToken: null,
        mint: mint ? (mint as typeof Evolu.NonEmptyString1000.Type) : null,
        unit: null,
        amount:
          typeof amount === "number" && amount > 0
            ? (Math.floor(amount) as typeof Evolu.PositiveInt.Type)
            : null,
        state: "accepted" as typeof Evolu.NonEmptyString100.Type,
        error: null,
      },
      { ownerId }
    );

    if (r.ok) {
      logPaymentEvent({
        direction: "in",
        status: "ok",
        amount: typeof amount === "number" ? amount : null,
        fee: null,
        mint,
        unit: null,
        error: null,
        contactId: null,
      });
      safeLocalStorageSet(LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY, "");
    }
  }, [cashuTokensAll, insert, logPaymentEvent]);

  const [mintInfoAll, setMintInfoAll] = useState<LocalMintInfoRow[]>(() => []);

  React.useEffect(() => {
    const ownerId = appOwnerIdRef.current;
    if (!ownerId) {
      setMintInfoAll([]);
      return;
    }
    setMintInfoAll(
      safeLocalStorageGetJson(
        `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
        [] as LocalMintInfoRow[]
      )
    );
  }, [appOwnerId]);

  const mintInfo = useMemo(() => {
    return [...mintInfoAll]
      .filter(
        (row) =>
          String(
            (row as unknown as { isDeleted?: unknown }).isDeleted ?? ""
          ) !== String(Evolu.sqliteTrue)
      )
      .sort((a, b) => {
        const aSeen = Number(a.lastSeenAtSec ?? 0) || 0;
        const bSeen = Number(b.lastSeenAtSec ?? 0) || 0;
        return bSeen - aSeen;
      });
  }, [mintInfoAll]);

  const mintInfoDeduped = useMemo(() => {
    const bestByUrl = new Map<string, (typeof mintInfo)[number]>();
    for (const row of mintInfo) {
      const urlRaw = String((row as unknown as { url?: unknown }).url ?? "");
      const key = normalizeMintUrl(urlRaw);
      if (!key) continue;

      const existing = bestByUrl.get(key);
      if (!existing) {
        bestByUrl.set(key, row);
        continue;
      }

      const existingSeen =
        Number(
          (existing as unknown as { lastSeenAtSec?: unknown }).lastSeenAtSec ??
            0
        ) || 0;
      const rowSeen =
        Number(
          (row as unknown as { lastSeenAtSec?: unknown }).lastSeenAtSec ?? 0
        ) || 0;

      const existingHasInfo = Boolean(
        String(
          (existing as unknown as { infoJson?: unknown }).infoJson ?? ""
        ).trim().length
      );
      const rowHasInfo = Boolean(
        String((row as unknown as { infoJson?: unknown }).infoJson ?? "").trim()
          .length
      );

      const existingHasFees = Boolean(
        String(
          (existing as unknown as { feesJson?: unknown }).feesJson ?? ""
        ).trim().length
      );
      const rowHasFees = Boolean(
        String((row as unknown as { feesJson?: unknown }).feesJson ?? "").trim()
          .length
      );

      // Prefer the row with more metadata, then most recently seen.
      const existingScore =
        (existingHasInfo ? 2 : 0) + (existingHasFees ? 1 : 0) + existingSeen;
      const rowScore = (rowHasInfo ? 2 : 0) + (rowHasFees ? 1 : 0) + rowSeen;
      if (rowScore > existingScore) bestByUrl.set(key, row);
    }

    const main = normalizeMintUrl(MAIN_MINT_URL);

    return Array.from(bestByUrl.entries())
      .sort((a, b) => {
        const aIsMain = main ? a[0] === main : false;
        const bIsMain = main ? b[0] === main : false;
        if (aIsMain !== bIsMain) return aIsMain ? -1 : 1;

        const aSeen =
          Number(
            (a[1] as unknown as { lastSeenAtSec?: unknown }).lastSeenAtSec ?? 0
          ) || 0;
        const bSeen =
          Number(
            (b[1] as unknown as { lastSeenAtSec?: unknown }).lastSeenAtSec ?? 0
          ) || 0;
        return bSeen - aSeen;
      })
      .map(([canonicalUrl, row]) => ({ canonicalUrl, row }));
  }, [mintInfo, normalizeMintUrl]);

  const mintInfoByUrl = useMemo(() => {
    const map = new Map<string, (typeof mintInfoAll)[number]>();
    for (const row of mintInfoAll) {
      const url = normalizeMintUrl(
        String((row as unknown as { url?: unknown }).url ?? "")
      );
      if (!url) continue;
      const existing = map.get(url) as
        | (Record<string, unknown> & { isDeleted?: unknown })
        | undefined;
      if (!existing) {
        map.set(url, row);
        continue;
      }

      const existingDeleted =
        String(existing.isDeleted ?? "") === String(Evolu.sqliteTrue);
      const rowDeleted =
        String((row as unknown as { isDeleted?: unknown }).isDeleted ?? "") ===
        String(Evolu.sqliteTrue);

      // Prefer a non-deleted row if we have one.
      if (existingDeleted && !rowDeleted) map.set(url, row);
    }
    return map;
  }, [mintInfoAll]);

  const isMintDeleted = React.useCallback(
    (mintUrl: string): boolean => {
      const cleaned = normalizeMintUrl(mintUrl);
      if (!cleaned) return false;
      return mintInfoAll.some((row) => {
        const url = normalizeMintUrl(
          String((row as unknown as { url?: unknown }).url ?? "")
        );
        if (url !== cleaned) return false;
        return (
          String(
            (row as unknown as { isDeleted?: unknown }).isDeleted ?? ""
          ) === String(Evolu.sqliteTrue)
        );
      });
    },
    [mintInfoAll]
  );

  const touchMintInfo = React.useCallback(
    (_mintUrl: string, nowSec: number): void => {
      const cleaned = normalizeMintUrl(_mintUrl);
      if (!cleaned) return;
      if (isMintDeleted(cleaned)) return;

      const existing = mintInfoByUrl.get(cleaned) as
        | (Record<string, unknown> & {
            id?: unknown;
            isDeleted?: unknown;
            firstSeenAtSec?: unknown;
          })
        | undefined;

      const now = Math.floor(nowSec) as typeof Evolu.PositiveInt.Type;

      const ownerId = appOwnerIdRef.current;
      if (!ownerId) return;

      setMintInfoAll((prev) => {
        const next = [...prev];
        const firstSeen =
          existing && Number(existing.firstSeenAtSec ?? 0) > 0
            ? Math.floor(Number(existing.firstSeenAtSec))
            : now;

        if (
          existing &&
          String(existing.isDeleted ?? "") !== String(Evolu.sqliteTrue)
        ) {
          const id = String(existing.id ?? "");
          const idx = next.findIndex((r) => String(r.id ?? "") === id);
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              url: cleaned,
              firstSeenAtSec: firstSeen,
              lastSeenAtSec: now,
            };
          }
        } else {
          next.push({
            id: makeLocalId(),
            url: cleaned,
            firstSeenAtSec: now,
            lastSeenAtSec: now,
            supportsMpp: null,
            feesJson: null,
            infoJson: null,
          });
        }

        safeLocalStorageSetJson(
          `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
          next
        );
        return next;
      });
    },
    [isMintDeleted, makeLocalId, mintInfoByUrl, normalizeMintUrl]
  );

  const encounteredMintUrls = useMemo(() => {
    const set = new Set<string>();
    for (const row of cashuTokensAll) {
      const state = String((row as unknown as { state?: unknown }).state ?? "");
      if (state !== "accepted") continue;
      const mint = String(
        (row as unknown as { mint?: unknown }).mint ?? ""
      ).trim();
      const normalized = normalizeMintUrl(mint);
      if (normalized) set.add(normalized);
    }
    return Array.from(set.values()).sort();
  }, [cashuTokensAll, normalizeMintUrl]);

  const [mintRuntimeByUrl, setMintRuntimeByUrl] = useState<
    Record<string, { lastCheckedAtSec: number; latencyMs: number | null }>
  >(() => ({}));

  const getMintRuntime = React.useCallback(
    (mintUrl: string) => {
      const key = normalizeMintUrl(mintUrl);
      if (!key) return null;
      return mintRuntimeByUrl[key] ?? null;
    },
    [mintRuntimeByUrl, normalizeMintUrl]
  );

  const recordMintRuntime = React.useCallback(
    (
      mintUrl: string,
      patch: { lastCheckedAtSec: number; latencyMs: number | null }
    ) => {
      const key = normalizeMintUrl(mintUrl);
      if (!key) return;
      setMintRuntimeByUrl((prev) => ({ ...prev, [key]: patch }));
    },
    [normalizeMintUrl]
  );

  const extractPpk = (value: unknown): number | null => {
    const seen = new Set<unknown>();
    const queue: Array<{ v: unknown; depth: number }> = [
      { v: value, depth: 0 },
    ];
    while (queue.length) {
      const item = queue.shift();
      if (!item) break;
      const { v, depth } = item;
      if (!v || typeof v !== "object") continue;
      if (seen.has(v)) continue;
      seen.add(v);

      const rec = v as Record<string, unknown>;
      for (const [k, inner] of Object.entries(rec)) {
        if (k.toLowerCase() === "ppk") {
          if (typeof inner === "number" && Number.isFinite(inner)) return inner;
          const num = Number(String(inner ?? "").trim());
          if (Number.isFinite(num)) return num;
        }
        if (depth < 3 && inner && typeof inner === "object") {
          queue.push({ v: inner, depth: depth + 1 });
        }
      }
    }
    return null;
  };

  const refreshMintInfo = React.useCallback(
    async (mintUrl: string) => {
      const cleaned = normalizeMintUrl(mintUrl);
      if (!cleaned) return;

      if (isMintDeleted(cleaned)) return;

      const ownerId = appOwnerIdRef.current;
      if (!ownerId) return;

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const startedAt =
          typeof performance !== "undefined" &&
          typeof performance.now === "function"
            ? performance.now()
            : Date.now();

        const tryUrls = [`${cleaned}/v1/info`, `${cleaned}/info`];
        let info: unknown = null;
        let lastErr: unknown = null;
        for (const u of tryUrls) {
          try {
            const res = await fetch(u, {
              method: "GET",
              headers: { accept: "application/json" },
              signal: controller.signal,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            info = await res.json();
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!info) throw lastErr ?? new Error("No info");

        const nuts =
          (info as unknown as { nuts?: unknown }).nuts ??
          (info as unknown as { NUTS?: unknown }).NUTS ??
          null;
        const nut15 = (() => {
          if (!nuts || typeof nuts !== "object") return null;
          const rec = nuts as Record<string, unknown>;
          return rec["15"] ?? rec["nut15"] ?? (rec["NUT15"] as unknown) ?? null;
        })();
        const supportsMpp = Boolean(nut15);

        const feesRaw =
          (info as unknown as { fees?: unknown }).fees ??
          (info as unknown as { fee?: unknown }).fee ??
          null;
        const ppk = extractPpk(feesRaw) ?? extractPpk(info);
        const fees = ppk !== null ? { ppk, raw: feesRaw } : feesRaw;

        const nowSec = Math.floor(Date.now() / 1000);
        const toJson = (value: unknown): string | null => {
          try {
            const s = JSON.stringify(value);
            const trimmed = String(s ?? "").trim();
            if (
              !trimmed ||
              trimmed === "null" ||
              trimmed === "{}" ||
              trimmed === "[]"
            )
              return null;
            return trimmed.slice(0, 1000);
          } catch {
            return null;
          }
        };

        const existing = mintInfoByUrl.get(cleaned) as
          | (Record<string, unknown> & {
              id?: unknown;
              isDeleted?: unknown;
              firstSeenAtSec?: unknown;
            })
          | undefined;

        if (
          existing &&
          String(existing.isDeleted ?? "") !== String(Evolu.sqliteTrue)
        ) {
          setMintInfoAll((prev) => {
            const next = [...prev];
            const id = String(existing.id ?? "");
            const idx = next.findIndex((r) => String(r.id ?? "") === id);
            if (idx >= 0) {
              next[idx] = {
                ...next[idx],
                supportsMpp: supportsMpp ? "1" : null,
                feesJson: toJson(fees),
                infoJson: toJson(info),
                lastCheckedAtSec: nowSec,
              };
              safeLocalStorageSetJson(
                `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
                next
              );
            }
            return next;
          });

          const finishedAt =
            typeof performance !== "undefined" &&
            typeof performance.now === "function"
              ? performance.now()
              : Date.now();
          const latencyMs = Math.max(0, Math.round(finishedAt - startedAt));
          recordMintRuntime(cleaned, { lastCheckedAtSec: nowSec, latencyMs });
          return;
        }

        // If no row exists yet (or it was deleted), just ensure it exists.
        // A subsequent render can refresh again without creating duplicates.
        touchMintInfo(cleaned, nowSec);

        // Also store fetched metadata.
        setMintInfoAll((prev) => {
          const next = [...prev];
          const idx = next
            .map((r) => ({ r, url: normalizeMintUrl(String(r.url ?? "")) }))
            .findIndex((x) => x.url === cleaned);
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              supportsMpp: supportsMpp ? "1" : null,
              feesJson: toJson(fees),
              infoJson: toJson(info),
              lastCheckedAtSec: nowSec,
            };
            safeLocalStorageSetJson(
              `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
              next
            );
          }
          return next;
        });

        const finishedAt =
          typeof performance !== "undefined" &&
          typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        const latencyMs = Math.max(0, Math.round(finishedAt - startedAt));
        recordMintRuntime(cleaned, { lastCheckedAtSec: nowSec, latencyMs });
      } catch {
        // ignore
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [
      extractPpk,
      isMintDeleted,
      mintInfoByUrl,
      normalizeMintUrl,
      recordMintRuntime,
      touchMintInfo,
      setMintInfoAll,
    ]
  );

  React.useEffect(() => {
    // Ensure every user has the default mint in their mint list.
    const cleaned = normalizeMintUrl(MAIN_MINT_URL);
    if (!cleaned) return;

    if (isMintDeleted(cleaned)) return;

    const existing = mintInfoByUrl.get(cleaned) as
      | (Record<string, unknown> & {
          isDeleted?: unknown;
          firstSeenAtSec?: unknown;
          lastCheckedAtSec?: unknown;
        })
      | undefined;

    const nowSec = Math.floor(Date.now() / 1000);
    if (!existing) {
      touchMintInfo(cleaned, nowSec);
      return;
    }

    const runtime = getMintRuntime(cleaned);
    if (!runtime) void refreshMintInfo(cleaned);
  }, [
    appOwnerId,
    getMintRuntime,
    isMintDeleted,
    mintInfoByUrl,
    normalizeMintUrl,
    refreshMintInfo,
    touchMintInfo,
  ]);

  React.useEffect(() => {
    if (encounteredMintUrls.length === 0) return;

    const nowSec = Math.floor(Date.now() / 1000);
    for (const mintUrl of encounteredMintUrls) {
      const cleaned = String(mintUrl ?? "")
        .trim()
        .replace(/\/+$/, "");
      if (!cleaned) continue;

      const existing = mintInfoByUrl.get(cleaned) as
        | (Record<string, unknown> & {
            isDeleted?: unknown;
            firstSeenAtSec?: unknown;
            lastCheckedAtSec?: unknown;
          })
        | undefined;

      // Respect user deletion across any owner scope (don't auto-recreate).
      if (isMintDeleted(cleaned)) continue;

      // If we don't have a row yet, create it first and let a later rerender
      // trigger the refresh to avoid duplicate inserts.
      if (!existing) {
        touchMintInfo(cleaned, nowSec);
        continue;
      }

      touchMintInfo(cleaned, nowSec);

      const lastChecked = getMintRuntime(cleaned)?.lastCheckedAtSec ?? 0;
      const oneDay = 86_400;
      if (lastChecked === 0 || nowSec - lastChecked > oneDay) {
        void refreshMintInfo(cleaned);
      }
    }
  }, [
    appOwnerId,
    encounteredMintUrls,
    getMintRuntime,
    isMintDeleted,
    mintInfoByUrl,
    refreshMintInfo,
    touchMintInfo,
  ]);

  const mintDedupeRanRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    // Best-effort: remove duplicate mint rows (same canonical URL) by marking
    // all but the best row as deleted, and normalize the kept row's url.
    const active = mintInfoAll.filter(
      (row) =>
        String((row as unknown as { isDeleted?: unknown }).isDeleted ?? "") !==
        String(Evolu.sqliteTrue)
    ) as Array<Record<string, unknown> & { id?: unknown; url?: unknown }>;
    if (active.length < 2) return;

    const groups = new Map<string, typeof active>();
    for (const row of active) {
      const key = normalizeMintUrl(String(row.url ?? ""));
      if (!key) continue;
      const arr = groups.get(key);
      if (arr) arr.push(row);
      else groups.set(key, [row]);
    }

    const signature = Array.from(groups.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(
        ([k, rows]) =>
          `${k}:${rows
            .map((r) => String(r.id ?? ""))
            .sort()
            .join(",")}`
      )
      .sort()
      .join("|");

    if (!signature) return;
    if (mintDedupeRanRef.current === signature) return;
    mintDedupeRanRef.current = signature;

    const ownerId = appOwnerIdRef.current;
    if (!ownerId) return;

    let didChange = false;
    const next = [...mintInfoAll];
    const applyPatch = (patch: Partial<LocalMintInfoRow> & { id: MintId }) => {
      const id = String(patch.id ?? "");
      if (!id) return;
      const idx = next.findIndex((r) => String(r.id ?? "") === id);
      if (idx < 0) return;
      next[idx] = { ...next[idx], ...patch };
      didChange = true;
    };

    for (const [key, rows] of groups.entries()) {
      if (rows.length <= 1) continue;

      const best = [...rows].sort((a, b) => {
        const aSeen = Number(a.lastSeenAtSec ?? 0) || 0;
        const bSeen = Number(b.lastSeenAtSec ?? 0) || 0;
        const aInfo = String(a.infoJson ?? "").trim() ? 1 : 0;
        const bInfo = String(b.infoJson ?? "").trim() ? 1 : 0;
        const aFees = String(a.feesJson ?? "").trim() ? 1 : 0;
        const bFees = String(b.feesJson ?? "").trim() ? 1 : 0;
        const aScore = aInfo * 2 + aFees + aSeen;
        const bScore = bInfo * 2 + bFees + bSeen;
        return bScore - aScore;
      })[0];

      const bestId = best?.id as MintId | undefined;
      if (!bestId) continue;

      const bestUrl = normalizeMintUrl(String(best.url ?? ""));
      if (bestUrl && bestUrl !== key) {
        applyPatch({ id: bestId, url: key });
      }

      for (const row of rows) {
        const id = row.id as MintId | undefined;
        if (!id) continue;
        if (String(id) === String(bestId)) continue;
        applyPatch({ id, isDeleted: Evolu.sqliteTrue });
      }
    }

    if (!didChange) return;
    setMintInfoAll(next);
    safeLocalStorageSetJson(
      `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
      next
    );
  }, [mintInfoAll, normalizeMintUrl]);

  // Payment history and tutorial state are local-only (not stored in Evolu).

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;

    try {
      if (localStorage.getItem("linky_debug_evolu_snapshot") !== "1") return;
    } catch {
      return;
    }

    // Debug: log Evolu state without secrets.
    // NOTE: Relays and derived npub are Nostr/runtime state, not stored in Evolu.
    console.log("[linky][evolu] snapshot", {
      nostrIdentity: {
        hasNsec: Boolean(currentNsec),
        hasNpub: Boolean(currentNpub),
      },
      cashuTokens: cashuTokens.map((t) => ({
        id: String(t.id ?? ""),
        mint: String(t.mint ?? ""),
        amount: Number(t.amount ?? 0) || 0,
        state: String(t.state ?? ""),
      })),
      cashuTokensAll: {
        count: cashuTokensAll.length,
        newest10: cashuTokensAll.slice(0, 10).map((t) => ({
          id: String(t.id ?? ""),
          mint: String(t.mint ?? ""),
          amount: Number(t.amount ?? 0) || 0,
          state: String(t.state ?? ""),
          isDeleted: Boolean(t.isDeleted),
        })),
      },
    });
  }, [cashuTokens, cashuTokensAll, currentNpub, currentNsec]);

  const [nostrMessagesLocal, setNostrMessagesLocal] = useState<
    LocalNostrMessage[]
  >(() => []);

  React.useEffect(() => {
    const ownerId = appOwnerIdRef.current;
    if (!ownerId) {
      setNostrMessagesLocal([]);
      return;
    }
    setNostrMessagesLocal(
      safeLocalStorageGetJson(
        `${LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
        [] as LocalNostrMessage[]
      )
    );
  }, [appOwnerId]);

  const appendLocalNostrMessage = React.useCallback(
    (msg: Omit<LocalNostrMessage, "id">) => {
      const ownerId = appOwnerIdRef.current;
      if (!ownerId) return;

      const entry: LocalNostrMessage = {
        id: makeLocalId(),
        ...msg,
      };

      setNostrMessagesLocal((prev) => {
        // Avoid duplicates by wrapId.
        if (prev.some((m) => String(m.wrapId) === String(entry.wrapId)))
          return prev;

        const next = [...prev, entry]
          .sort((a, b) => a.createdAtSec - b.createdAtSec)
          .slice(-500);

        safeLocalStorageSetJson(
          `${LOCAL_NOSTR_MESSAGES_STORAGE_KEY_PREFIX}.${String(ownerId)}`,
          next
        );
        return next;
      });
    },
    [appOwnerId]
  );

  const chatContactId = route.kind === "chat" ? route.id : null;

  const chatMessages = useMemo(() => {
    const id = String(chatContactId ?? "").trim();
    if (!id) return [] as LocalNostrMessage[];
    return nostrMessagesLocal
      .filter((m) => String(m.contactId) === id)
      .sort((a, b) => a.createdAtSec - b.createdAtSec);
  }, [chatContactId, nostrMessagesLocal]);

  const nostrMessagesRecent = useMemo(() => {
    return [...nostrMessagesLocal]
      .sort((a, b) => b.createdAtSec - a.createdAtSec)
      .slice(0, 100);
  }, [nostrMessagesLocal]);

  const cashuBalance = useMemo(() => {
    return cashuTokens.reduce((sum, token) => {
      const state = String(token.state ?? "");
      if (state !== "accepted") return sum;
      const amount = Number((token.amount ?? 0) as unknown as number);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [cashuTokens]);

  const canPayWithCashu = cashuBalance > 0;

  React.useEffect(() => {
    if (route.kind !== "topupInvoice") return;
    if (topupInvoiceIsBusy) return;
    if (!topupInvoice || !topupInvoiceQr) return;

    const amountSat = Number.parseInt(topupAmount.trim(), 10);
    if (!Number.isFinite(amountSat) || amountSat <= 0) return;

    if (topupInvoiceStartBalanceRef.current === null) {
      topupInvoiceStartBalanceRef.current = cashuBalance;
      return;
    }

    if (topupInvoicePaidHandledRef.current) return;

    const start = topupInvoiceStartBalanceRef.current ?? 0;
    const expected = start + amountSat;
    if (cashuBalance < expected) return;

    topupInvoicePaidHandledRef.current = true;
    showPaidOverlay(
      t("topupOverlay")
        .replace("{amount}", formatInteger(amountSat))
        .replace("{unit}", displayUnit)
    );

    if (topupPaidNavTimerRef.current !== null) {
      try {
        window.clearTimeout(topupPaidNavTimerRef.current);
      } catch {
        // ignore
      }
    }
    topupPaidNavTimerRef.current = window.setTimeout(() => {
      topupPaidNavTimerRef.current = null;
      navigateToWallet();
    }, 1400);
  }, [
    cashuBalance,
    displayUnit,
    formatInteger,
    lang,
    route.kind,
    showPaidOverlay,
    t,
    topupAmount,
    topupInvoice,
    topupInvoiceIsBusy,
    topupInvoiceQr,
  ]);

  const [lnAddressPayAmount, setLnAddressPayAmount] = useState<string>("");
  React.useEffect(() => {
    if (route.kind !== "lnAddressPay") {
      setLnAddressPayAmount("");
    }
  }, [route.kind]);

  const [contactNewPrefill, setContactNewPrefill] = React.useState<null | {
    lnAddress: string;
    npub: string | null;
    suggestedName: string | null;
  }>(null);

  const [postPaySaveContact, setPostPaySaveContact] = React.useState<null | {
    lnAddress: string;
    amountSat: number;
  }>(null);

  const npubCashLightningAddress = useMemo(() => {
    if (!currentNpub) return null;
    return `${currentNpub}@npub.cash`;
  }, [currentNpub]);

  const derivedProfile = useMemo(() => {
    if (!currentNpub) return null;
    return deriveDefaultProfile(currentNpub);
  }, [currentNpub]);

  const effectiveProfileName = myProfileName ?? derivedProfile?.name ?? null;
  const effectiveProfilePicture =
    myProfilePicture ?? derivedProfile?.pictureUrl ?? null;

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
    async (url: string, method: string, payload?: Record<string, unknown>) => {
      if (!currentNsec) throw new Error("Missing nsec");
      const { nip19, nip98, finalizeEvent } = await import("nostr-tools");
      const decoded = nip19.decode(currentNsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");
      const privBytes = decoded.data as Uint8Array;

      const token = await nip98.getToken(
        url,
        method,
        async (event) => finalizeEvent(event, privBytes),
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

      await enqueueCashuOp(async () => {
        setCashuIsBusy(true);

        const parsed = parseCashuToken(tokenRaw);
        const parsedMint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
        const parsedAmount =
          parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

        try {
          // De-dupe: don't accept/store the same token twice.
          const alreadyStored = cashuTokensAll.some((row) => {
            const r = row as unknown as {
              rawToken?: unknown;
              token?: unknown;
              isDeleted?: unknown;
            };
            if (r.isDeleted) return false;
            const stored = String(r.rawToken ?? r.token ?? "").trim();
            return stored && stored === tokenRaw;
          });
          if (alreadyStored) return;

          const ownerId = await resolveOwnerIdForWrite();

          const { acceptCashuToken } = await import("./cashuAccept");
          const accepted = await acceptCashuToken(tokenRaw);

          const result = ownerId
            ? insert(
                "cashuToken",
                {
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
                },
                { ownerId }
              )
            : insert("cashuToken", {
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
          if (!result.ok) {
            setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
            return;
          }

          // Remember the last successfully accepted token so we can recover it
          // if storage gets wiped (e.g., private browsing) or if persistence
          // glitches.
          safeLocalStorageSet(
            LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
            String(accepted.token ?? "")
          );
          ensureCashuTokenPersisted(String(accepted.token ?? ""));

          // Minimal receive-only banner: click to copy token.
          if (recentlyReceivedTokenTimerRef.current !== null) {
            try {
              window.clearTimeout(recentlyReceivedTokenTimerRef.current);
            } catch {
              // ignore
            }
          }
          setRecentlyReceivedToken({
            token: String(accepted.token ?? "").trim(),
            amount:
              typeof accepted.amount === "number" && accepted.amount > 0
                ? accepted.amount
                : null,
          });
          recentlyReceivedTokenTimerRef.current = window.setTimeout(() => {
            setRecentlyReceivedToken(null);
            recentlyReceivedTokenTimerRef.current = null;
          }, 25_000);

          const cleanedMint = String(accepted.mint ?? "")
            .trim()
            .replace(/\/+$/, "");
          if (cleanedMint) {
            const nowSec = Math.floor(Date.now() / 1000);
            const existing = mintInfoByUrl.get(cleanedMint) as
              | (Record<string, unknown> & {
                  isDeleted?: unknown;
                  lastCheckedAtSec?: unknown;
                })
              | undefined;

            if (isMintDeleted(cleanedMint)) {
              // Respect user deletion across any owner scope.
            } else {
              touchMintInfo(cleanedMint, nowSec);

              const lastChecked = Number(existing?.lastCheckedAtSec ?? 0) || 0;
              if (existing && !lastChecked) void refreshMintInfo(cleanedMint);
            }
          }

          logPaymentEvent({
            direction: "in",
            status: "ok",
            amount: accepted.amount,
            fee: null,
            mint: accepted.mint,
            unit: accepted.unit,
            error: null,
            contactId: null,
          });

          if (route.kind !== "topupInvoice") {
            const title =
              accepted.amount && accepted.amount > 0
                ? t("paidReceived")
                    .replace("{amount}", formatInteger(accepted.amount))
                    .replace("{unit}", displayUnit)
                : t("cashuAccepted");
            showPaidOverlay(title);
          }

          const body =
            accepted.amount && accepted.amount > 0
              ? `${accepted.amount} sat`
              : t("cashuAccepted");
          void maybeShowPwaNotification(t("mints"), body, "cashu_claim");
        } catch (error) {
          const message = String(error).trim() || "Accept failed";

          logPaymentEvent({
            direction: "in",
            status: "error",
            amount: parsedAmount,
            fee: null,
            mint: parsedMint,
            unit: null,
            error: message,
            contactId: null,
          });

          const ownerId = await resolveOwnerIdForWrite();
          if (ownerId) {
            insert(
              "cashuToken",
              {
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
                error: message.slice(
                  0,
                  1000
                ) as typeof Evolu.NonEmptyString1000.Type,
              },
              { ownerId }
            );
          } else {
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
              error: message.slice(
                0,
                1000
              ) as typeof Evolu.NonEmptyString1000.Type,
            });
          }
          setStatus(`${t("cashuAcceptFailed")}: ${message}`);
        } finally {
          setCashuIsBusy(false);
        }
      });
    },
    [
      cashuTokensAll,
      displayUnit,
      enqueueCashuOp,
      formatInteger,
      insert,
      logPaymentEvent,
      mintInfoByUrl,
      maybeShowPwaNotification,
      route.kind,
      refreshMintInfo,
      resolveOwnerIdForWrite,
      showPaidOverlay,
      t,
      upsert,
    ]
  );

  const claimNpubCashOnce = React.useCallback(async () => {
    // Don't claim while we are paying/accepting, otherwise we risk consuming
    // the claim response and then skipping token processing.
    if (cashuIsBusy) return;
    if (!currentNpub) return;
    if (!currentNsec) return;
    if (npubCashClaimInFlightRef.current) return;

    npubCashClaimInFlightRef.current = true;
    const baseUrl = "https://npub.cash";
    try {
      const url = `${baseUrl}/api/v1/claim`;
      const auth = await makeNip98AuthHeader(url, "GET");
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: auth },
      });
      if (!res.ok) return;
      const json = (await res.json()) as unknown;
      const root = asRecord(json);
      if (!root || root.error) return;

      const tokens: string[] = [];
      const data = asRecord(root.data);
      const token = String(data?.token ?? root.token ?? "").trim();
      if (token) tokens.push(token);
      const dataTokens = data?.tokens;
      if (Array.isArray(dataTokens)) {
        for (const t of dataTokens) {
          const txt = String(t ?? "").trim();
          if (txt) tokens.push(txt);
        }
      }
      if (tokens.length === 0) return;

      for (const tkn of tokens) {
        await acceptAndStoreCashuToken(tkn);
      }
    } catch {
      // ignore
    } finally {
      npubCashClaimInFlightRef.current = false;
    }
  }, [
    acceptAndStoreCashuToken,
    cashuIsBusy,
    currentNpub,
    currentNsec,
    makeNip98AuthHeader,
  ]);

  React.useEffect(() => {
    // Load current user's Nostr profile (name + picture) from relays.
    if (!currentNpub) return;

    // One toast per npub so we don't spam when deps change.
    if (profileFetchToastShownForNpubRef.current !== currentNpub) {
      profileFetchToastShownForNpubRef.current = currentNpub;
      pushToast(t("profileFetching"));
    }

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
  }, [currentNpub, nostrFetchRelays, pushToast, rememberBlobAvatarUrl, t]);

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
    // Always active when we have Nostr keys so payments to the derived
    // `${npub}@npub.cash` keep working even if the user sets a custom address.
    if (!currentNpub) return;
    if (!currentNsec) return;

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
          const root = asRecord(data);
          if (!root) return "";

          const direct = String(root.mintUrl ?? "").trim();
          if (direct) return direct;

          const wrapped = asRecord(root.data);
          if (!wrapped) return "";
          return String(wrapped.mintUrl ?? wrapped.mintURL ?? "").trim();
        })();
        if (cancelled) return;
        if (mintUrl) setDefaultMintUrl(mintUrl);
      } catch {
        // ignore
      }
    };

    const claimOnce = async () => {
      if (cancelled) return;
      await claimNpubCashOnce();
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
  }, [claimNpubCashOnce, currentNpub, currentNsec, makeNip98AuthHeader]);

  React.useEffect(() => {
    // While user is looking at the top-up invoice, poll more frequently so we
    // detect the paid invoice quickly.
    if (route.kind !== "topupInvoice") return;

    void claimNpubCashOnce();
    const intervalId = window.setInterval(() => {
      void claimNpubCashOnce();
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [claimNpubCashOnce, route.kind]);

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
  }, [contacts, route.kind, update, nostrFetchRelays]);

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
  }, [contacts, nostrPictureByNpub, rememberBlobAvatarUrl, nostrFetchRelays]);

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

    return [...filtered].sort((a, b) => {
      const aKey = String(a.id ?? "");
      const bKey = String(b.id ?? "");
      const aAttention = aKey ? contactAttentionById[aKey] ?? 0 : 0;
      const bAttention = bKey ? contactAttentionById[bKey] ?? 0 : 0;
      if (aAttention !== bAttention) return bAttention - aAttention;
      return contactNameCollator.compare(
        String(a.name ?? ""),
        String(b.name ?? "")
      );
    });
  }, [activeGroup, contactAttentionById, contactNameCollator, contacts]);

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
    setPayAmount("");
    setEditingId(null);
    const prefill = contactNewPrefill;
    setContactNewPrefill(null);
    setForm(
      prefill
        ? {
            name: String(prefill.suggestedName ?? ""),
            npub: String(prefill.npub ?? ""),
            lnAddress: String(prefill.lnAddress ?? ""),
            group: "",
          }
        : makeEmptyForm()
    );
    navigateToNewContact();
  };

  const toggleSettings = () => {
    if (route.kind === "settings") {
      navigateToContacts();
    } else {
      navigateToSettings();
    }
    setPendingDeleteId(null);
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
      let invoice: string;
      try {
        const { fetchLnurlInvoiceForLightningAddress } = await import(
          "./lnurlPay"
        );
        invoice = await fetchLnurlInvoiceForLightningAddress(
          lnAddress,
          amountSat
        );
      } catch (e) {
        setStatus(`${t("payFailed")}: ${String(e)}`);
        return;
      }

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
        .sort((a, b) => {
          const normalize = (u: string) =>
            String(u ?? "")
              .trim()
              .replace(/\/+$/, "");
          const mpp = (mint: string) => {
            const row = mintInfoByUrl.get(normalize(mint));
            return String(
              (row as unknown as { supportsMpp?: unknown })?.supportsMpp ?? ""
            ) === "1"
              ? 1
              : 0;
          };
          const dmpp = mpp(b.mint) - mpp(a.mint);
          if (dmpp !== 0) return dmpp;
          return b.sum - a.sum;
        });

      if (candidates.length === 0) {
        setStatus(t("payInsufficient"));
        return;
      }

      let lastError: unknown = null;
      let lastMint: string | null = null;
      for (const candidate of candidates) {
        try {
          const { meltInvoiceWithTokensAtMint } = await import("./cashuMelt");
          const result = await meltInvoiceWithTokensAtMint({
            invoice,
            mint: candidate.mint,
            tokens: candidate.tokens,
            unit: "sat",
          });

          if (!result.ok) {
            // Best-effort recovery: if we swapped, persist the recovery token
            // and remove old rows so the wallet doesn't keep stale proofs.
            if (result.remainingToken && result.remainingAmount > 0) {
              const recoveryToken = result.remainingToken;
              const inserted = insert("cashuToken", {
                token: recoveryToken as typeof Evolu.NonEmptyString.Type,
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

              if (inserted.ok) {
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
              }
            }

            lastError = result.error;
            lastMint = candidate.mint;

            // If the mint didn't swap (no remainingToken), it's safe to try
            // another mint (e.g. a larger token or higher fee reserve).
            if (!result.remainingToken) {
              continue;
            }

            logPaymentEvent({
              direction: "out",
              status: "error",
              amount: amountSat,
              fee: null,
              mint: result.mint,
              unit: result.unit,
              error: String(result.error ?? "unknown"),
              contactId: selectedContact.id,
            });

            // Stop here: at this point the mint may have swapped proofs.
            setStatus(
              `${t("payFailed")}: ${String(result.error ?? "unknown")}`
            );
            return;
          }

          // Persist change first, then remove old rows for that mint.
          if (result.remainingToken && result.remainingAmount > 0) {
            const inserted = insert("cashuToken", {
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
            if (!inserted.ok) throw inserted.error;
          }

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

          logPaymentEvent({
            direction: "out",
            status: "ok",
            amount: result.paidAmount,
            fee: (() => {
              const feePaid = Number(
                (result as unknown as { feePaid?: unknown }).feePaid ?? 0
              );
              return Number.isFinite(feePaid) && feePaid > 0 ? feePaid : null;
            })(),
            mint: result.mint,
            unit: result.unit,
            error: null,
            contactId: selectedContact.id,
          });

          const displayName =
            String(selectedContact.name ?? "").trim() ||
            String(selectedContact.lnAddress ?? "").trim() ||
            t("appTitle");

          showPaidOverlay(
            t("paidSentTo")
              .replace("{amount}", formatInteger(result.paidAmount))
              .replace("{unit}", displayUnit)
              .replace("{name}", displayName)
          );

          setStatus(t("paySuccess"));
          safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
          setContactsOnboardingHasPaid(true);
          navigateToContact(selectedContact.id);
          return;
        } catch (e) {
          lastError = e;
          lastMint = candidate.mint;
        }
      }

      logPaymentEvent({
        direction: "out",
        status: "error",
        amount: amountSat,
        fee: null,
        mint: lastMint,
        unit: "sat",
        error: String(lastError ?? "unknown"),
        contactId: selectedContact.id,
      });
      setStatus(`${t("payFailed")}: ${String(lastError ?? "unknown")}`);
    } finally {
      setCashuIsBusy(false);
    }
  };

  const payLightningInvoiceWithCashu = React.useCallback(
    async (invoice: string) => {
      const normalized = invoice.trim();
      if (!normalized) return;

      if (cashuIsBusy) return;
      if (cashuBalance <= 0) {
        setStatus(t("payInsufficient"));
        return;
      }

      setCashuIsBusy(true);
      try {
        setStatus(t("payPaying"));

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
          .sort((a, b) => {
            const normalize = (u: string) =>
              String(u ?? "")
                .trim()
                .replace(/\/+$/, "");
            const mpp = (mint: string) => {
              const row = mintInfoByUrl.get(normalize(mint));
              return String(
                (row as unknown as { supportsMpp?: unknown })?.supportsMpp ?? ""
              ) === "1"
                ? 1
                : 0;
            };
            const dmpp = mpp(b.mint) - mpp(a.mint);
            if (dmpp !== 0) return dmpp;
            return b.sum - a.sum;
          });

        if (candidates.length === 0) {
          setStatus(t("payInsufficient"));
          return;
        }

        let lastError: unknown = null;
        let lastMint: string | null = null;
        for (const candidate of candidates) {
          try {
            const { meltInvoiceWithTokensAtMint } = await import("./cashuMelt");
            const result = await meltInvoiceWithTokensAtMint({
              invoice: normalized,
              mint: candidate.mint,
              tokens: candidate.tokens,
              unit: "sat",
            });

            if (!result.ok) {
              if (result.remainingToken && result.remainingAmount > 0) {
                const recoveryToken = result.remainingToken;
                const inserted = insert("cashuToken", {
                  token: recoveryToken as typeof Evolu.NonEmptyString.Type,
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

                if (inserted.ok) {
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
                }
              }

              lastError = result.error;
              lastMint = candidate.mint;

              // If no swap happened, we can safely try other mints.
              if (!result.remainingToken) {
                continue;
              }

              logPaymentEvent({
                direction: "out",
                status: "error",
                amount: null,
                fee: null,
                mint: result.mint,
                unit: result.unit,
                error: String(result.error ?? "unknown"),
                contactId: null,
              });

              setStatus(
                `${t("payFailed")}: ${String(result.error ?? "unknown")}`
              );
              return;
            }

            if (result.remainingToken && result.remainingAmount > 0) {
              const inserted = insert("cashuToken", {
                token:
                  result.remainingToken as typeof Evolu.NonEmptyString.Type,
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
              if (!inserted.ok) throw inserted.error;
            }

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

            logPaymentEvent({
              direction: "out",
              status: "ok",
              amount: result.paidAmount,
              fee: (() => {
                const feePaid = Number(
                  (result as unknown as { feePaid?: unknown }).feePaid ?? 0
                );
                return Number.isFinite(feePaid) && feePaid > 0 ? feePaid : null;
              })(),
              mint: result.mint,
              unit: result.unit,
              error: null,
              contactId: null,
            });

            showPaidOverlay(
              t("paidSent")
                .replace("{amount}", formatInteger(result.paidAmount))
                .replace("{unit}", displayUnit)
            );

            setStatus(t("paySuccess"));
            safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
            setContactsOnboardingHasPaid(true);
            return;
          } catch (e) {
            lastError = e;
            lastMint = candidate.mint;
          }
        }

        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: null,
          fee: null,
          mint: lastMint,
          unit: "sat",
          error: String(lastError ?? "unknown"),
          contactId: null,
        });
        setStatus(`${t("payFailed")}: ${String(lastError ?? "unknown")}`);
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      cashuBalance,
      cashuIsBusy,
      cashuTokens,
      displayUnit,
      formatInteger,
      insert,
      logPaymentEvent,
      mintInfoByUrl,
      showPaidOverlay,
      t,
      update,
    ]
  );

  const payLightningAddressWithCashu = React.useCallback(
    async (lnAddress: string, amountSat: number) => {
      const address = String(lnAddress ?? "").trim();
      if (!address) return;
      if (!Number.isFinite(amountSat) || amountSat <= 0) {
        setStatus(`${t("errorPrefix")}: ${t("payInvalidAmount")}`);
        return;
      }
      if (!canPayWithCashu) return;
      if (cashuIsBusy) return;
      setCashuIsBusy(true);

      const knownContact = contacts.find(
        (c) =>
          String(c.lnAddress ?? "")
            .trim()
            .toLowerCase() === address.toLowerCase()
      );
      const shouldOfferSave = !knownContact?.id;

      try {
        setStatus(t("payFetchingInvoice"));
        let invoice: string;
        try {
          const { fetchLnurlInvoiceForLightningAddress } = await import(
            "./lnurlPay"
          );
          invoice = await fetchLnurlInvoiceForLightningAddress(
            address,
            amountSat
          );
        } catch (e) {
          setStatus(`${t("payFailed")}: ${String(e)}`);
          return;
        }

        setStatus(t("payPaying"));

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
          .sort((a, b) => {
            const normalize = (u: string) =>
              String(u ?? "")
                .trim()
                .replace(/\/+$/, "");
            const mpp = (mint: string) => {
              const row = mintInfoByUrl.get(normalize(mint));
              return String(
                (row as unknown as { supportsMpp?: unknown })?.supportsMpp ?? ""
              ) === "1"
                ? 1
                : 0;
            };
            const dmpp = mpp(b.mint) - mpp(a.mint);
            if (dmpp !== 0) return dmpp;
            return b.sum - a.sum;
          });

        if (candidates.length === 0) {
          setStatus(t("payInsufficient"));
          return;
        }

        let lastError: unknown = null;
        let lastMint: string | null = null;
        for (const candidate of candidates) {
          try {
            const { meltInvoiceWithTokensAtMint } = await import("./cashuMelt");
            const result = await meltInvoiceWithTokensAtMint({
              invoice,
              mint: candidate.mint,
              tokens: candidate.tokens,
              unit: "sat",
            });

            if (!result.ok) {
              if (result.remainingToken && result.remainingAmount > 0) {
                const recoveryToken = result.remainingToken;
                const inserted = insert("cashuToken", {
                  token: recoveryToken as typeof Evolu.NonEmptyString.Type,
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

                if (inserted.ok) {
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
                }
              }

              lastError = result.error;
              lastMint = candidate.mint;

              if (!result.remainingToken) {
                continue;
              }

              logPaymentEvent({
                direction: "out",
                status: "error",
                amount: amountSat,
                fee: null,
                mint: result.mint,
                unit: result.unit,
                error: String(result.error ?? "unknown"),
                contactId: null,
              });

              setStatus(
                `${t("payFailed")}: ${String(result.error ?? "unknown")}`
              );
              return;
            }

            if (result.remainingToken && result.remainingAmount > 0) {
              const inserted = insert("cashuToken", {
                token:
                  result.remainingToken as typeof Evolu.NonEmptyString.Type,
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
              if (!inserted.ok) throw inserted.error;
            }

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

            const feePaid = Number(
              (result as unknown as { feePaid?: unknown }).feePaid ?? 0
            );

            logPaymentEvent({
              direction: "out",
              status: "ok",
              amount: result.paidAmount,
              fee: Number.isFinite(feePaid) && feePaid > 0 ? feePaid : null,
              mint: result.mint,
              unit: result.unit,
              error: null,
              contactId: null,
            });

            showPaidOverlay(
              t("paidSentTo")
                .replace("{amount}", formatInteger(result.paidAmount))
                .replace("{unit}", displayUnit)
                .replace(
                  "{name}",
                  String(knownContact?.name ?? "").trim() || address
                )
            );

            safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
            setContactsOnboardingHasPaid(true);

            // Offer to save as a contact after a successful pay to a new address.
            if (shouldOfferSave) {
              setPostPaySaveContact({
                lnAddress: address,
                amountSat: result.paidAmount,
              });
            }
            return;
          } catch (e) {
            lastError = e;
            lastMint = candidate.mint;
          }
        }

        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: amountSat,
          fee: null,
          mint: lastMint,
          unit: "sat",
          error: String(lastError ?? "unknown"),
          contactId: null,
        });
        setStatus(`${t("payFailed")}: ${String(lastError ?? "unknown")}`);
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      canPayWithCashu,
      cashuIsBusy,
      cashuTokens,
      contacts,
      displayUnit,
      formatInteger,
      insert,
      logPaymentEvent,
      mintInfoByUrl,
      setContactsOnboardingHasPaid,
      showPaidOverlay,
      t,
      update,
    ]
  );

  const contactsOnboardingHasSentMessage = useMemo(() => {
    return nostrMessagesRecent.some(
      (m) =>
        String((m as unknown as { direction?: unknown }).direction ?? "") ===
        "out"
    );
  }, [nostrMessagesRecent]);

  const contactsOnboardingTasks = useMemo(() => {
    const tasks = [
      {
        key: "add_contact",
        label: t("contactsOnboardingTaskAddContact"),
        done: contacts.length > 0,
      },
      {
        key: "topup",
        label: t("contactsOnboardingTaskTopup"),
        done: cashuBalance > 0,
      },
      {
        key: "pay",
        label: t("contactsOnboardingTaskPay"),
        done: contactsOnboardingHasPaid,
      },
      {
        key: "message",
        label: t("contactsOnboardingTaskMessage"),
        done: contactsOnboardingHasSentMessage,
      },
    ] as const;

    const done = tasks.reduce((sum, t) => sum + (t.done ? 1 : 0), 0);
    const total = tasks.length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { tasks, done, total, percent };
  }, [
    cashuBalance,
    contacts.length,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    t,
  ]);

  const showContactsOnboarding =
    !contactsOnboardingDismissed && route.kind === "contacts";

  const dismissContactsOnboarding = () => {
    safeLocalStorageSet(CONTACTS_ONBOARDING_DISMISSED_STORAGE_KEY, "1");
    setContactsOnboardingDismissed(true);
    setContactsGuide(null);
  };

  const startContactsGuide = (task: ContactsGuideKey) => {
    setContactsGuideTargetContactId(null);
    setContactsGuide({ task, step: 0 });
  };

  const stopContactsGuide = () => {
    setContactsGuideTargetContactId(null);
    setContactsGuide(null);
  };

  const contactsGuideSteps = useMemo(() => {
    if (!contactsGuide) return null;

    const firstContactId = (contacts[0]?.id ?? null) as ContactId | null;
    const routeContactId =
      route.kind === "contact" ||
      route.kind === "contactPay" ||
      route.kind === "chat"
        ? ((route as unknown as { id?: unknown }).id as ContactId | null)
        : null;
    const targetContactId =
      contactsGuideTargetContactId ?? routeContactId ?? firstContactId;

    const ensureRoute = (kind: Route["kind"], contactId?: ContactId | null) => {
      if (route.kind === kind) {
        if (kind === "contact" || kind === "contactPay" || kind === "chat") {
          const currentId = (route as unknown as { id?: unknown }).id as
            | ContactId
            | undefined;
          if (contactId && currentId && currentId !== contactId) {
            if (kind === "contact") navigateToContact(contactId);
            if (kind === "contactPay") navigateToContactPay(contactId);
            if (kind === "chat") navigateToChat(contactId);
          }
        }
        return;
      }

      if (kind === "contacts") navigateToContacts();
      if (kind === "settings") navigateToSettings();
      if (kind === "wallet") navigateToWallet();
      if (kind === "topup") navigateToTopup();
      if (kind === "topupInvoice") navigateToTopupInvoice();
      if (kind === "contactNew") openNewContactPage();
      if (kind === "contact" && contactId) navigateToContact(contactId);
      if (kind === "contactPay" && contactId) navigateToContactPay(contactId);
      if (kind === "chat" && contactId) navigateToChat(contactId);
    };

    const stepsByTask: Record<ContactsGuideKey, ContactsGuideStep[]> = {
      add_contact: [
        {
          id: "add_contact_1",
          selector: '[data-guide="contacts-add"]',
          titleKey: "guideAddContactStep1Title",
          bodyKey: "guideAddContactStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "add_contact_2",
          selector: '[data-guide="contact-save"]',
          titleKey: "guideAddContactStep2Title",
          bodyKey: "guideAddContactStep2Body",
          ensure: () => ensureRoute("contactNew"),
        },
        {
          id: "add_contact_3",
          selector: '[data-guide="scan-button"]',
          titleKey: "guideAddContactStep3Title",
          bodyKey: "guideAddContactStep3Body",
          ensure: () => ensureRoute("settings"),
        },
      ],
      topup: [
        {
          id: "topup_1",
          selector: '[data-guide="topbar-menu"]',
          titleKey: "guideTopupStep1Title",
          bodyKey: "guideTopupStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "topup_2",
          selector: '[data-guide="open-wallet"]',
          titleKey: "guideTopupStep2Title",
          bodyKey: "guideTopupStep2Body",
          ensure: () => ensureRoute("settings"),
        },
        {
          id: "topup_3",
          selector: '[data-guide="wallet-topup"]',
          titleKey: "guideTopupStep3Title",
          bodyKey: "guideTopupStep3Body",
          ensure: () => ensureRoute("wallet"),
        },
        {
          id: "topup_4",
          selector: '[data-guide="topup-show-invoice"]',
          titleKey: "guideTopupStep4Title",
          bodyKey: "guideTopupStep4Body",
          ensure: () => ensureRoute("topup"),
        },
      ],
      pay: [
        {
          id: "pay_1",
          selector: '[data-guide="contact-card"]',
          titleKey: "guidePayStep1Title",
          bodyKey: "guidePayStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "pay_2",
          selector: '[data-guide="contact-pay"]',
          titleKey: "guidePayStep2Title",
          bodyKey: "guidePayStep2Body",
          ensure: () => ensureRoute("contact", targetContactId),
        },
        {
          id: "pay_3",
          selector: '[data-guide="pay-step3"]',
          titleKey: "guidePayStep3Title",
          bodyKey: "guidePayStep3Body",
          ensure: () => ensureRoute("contactPay", targetContactId),
        },
      ],
      message: [
        {
          id: "message_1",
          selector: '[data-guide="contact-card"]',
          titleKey: "guideMessageStep1Title",
          bodyKey: "guideMessageStep1Body",
          ensure: () => ensureRoute("contacts"),
        },
        {
          id: "message_2",
          selector: '[data-guide="contact-message"]',
          titleKey: "guideMessageStep2Title",
          bodyKey: "guideMessageStep2Body",
          ensure: () => ensureRoute("contact", targetContactId),
        },
        {
          id: "message_3",
          selector: '[data-guide="chat-input"]',
          titleKey: "guideMessageStep3Title",
          bodyKey: "guideMessageStep3Body",
          ensure: () => ensureRoute("chat", targetContactId),
        },
        {
          id: "message_4",
          selector: '[data-guide="chat-send"]',
          titleKey: "guideMessageStep4Title",
          bodyKey: "guideMessageStep4Body",
          ensure: () => ensureRoute("chat", targetContactId),
        },
      ],
    };

    return stepsByTask[contactsGuide.task] ?? null;
  }, [
    contacts,
    contactsGuide,
    contactsGuideTargetContactId,
    openNewContactPage,
    route,
    t,
  ]);

  const contactsGuideActiveStep = useMemo(() => {
    if (!contactsGuide || !contactsGuideSteps) return null;
    const idx = Math.min(
      Math.max(contactsGuide.step, 0),
      Math.max(contactsGuideSteps.length - 1, 0)
    );
    return {
      idx,
      step: contactsGuideSteps[idx] ?? null,
      total: contactsGuideSteps.length,
    };
  }, [contactsGuide, contactsGuideSteps]);

  React.useEffect(() => {
    const active = contactsGuideActiveStep?.step ?? null;
    if (!contactsGuide || !active) return;
    try {
      active.ensure?.();
    } catch {
      // ignore
    }
  }, [contactsGuide, contactsGuideActiveStep]);

  const contactsGuidePrevRouteRef = React.useRef<{
    kind: Route["kind"];
    id: string | null;
  } | null>(null);

  React.useEffect(() => {
    if (!contactsGuide || !contactsGuideActiveStep?.step) {
      contactsGuidePrevRouteRef.current = {
        kind: route.kind,
        id:
          route.kind === "contact" ||
          route.kind === "contactPay" ||
          route.kind === "chat"
            ? String((route as unknown as { id?: unknown }).id ?? "") || null
            : null,
      };
      return;
    }

    const prev = contactsGuidePrevRouteRef.current;
    const current = {
      kind: route.kind,
      id:
        route.kind === "contact" ||
        route.kind === "contactPay" ||
        route.kind === "chat"
          ? String((route as unknown as { id?: unknown }).id ?? "") || null
          : null,
    };
    contactsGuidePrevRouteRef.current = current;

    const id = contactsGuideActiveStep.step.id;

    const goToStep = (step: number) => {
      setContactsGuide((prevGuide) => {
        if (!prevGuide) return prevGuide;
        if (prevGuide.task !== contactsGuide.task) return prevGuide;
        if (prevGuide.step === step) return prevGuide;
        return { ...prevGuide, step };
      });
    };

    const transition = (from: Route["kind"], to: Route["kind"]) =>
      Boolean(prev && prev.kind === from && current.kind === to);

    // Capture which contact the user actually picked so we don't auto-open another one.
    if (
      (contactsGuide.task === "pay" || contactsGuide.task === "message") &&
      transition("contacts", "contact") &&
      current.id
    ) {
      setContactsGuideTargetContactId(current.id as ContactId);
    }

    // Advance by performing the demonstrated navigation (route transitions).
    if (id === "add_contact_1" && transition("contacts", "contactNew"))
      goToStep(1);
    if (
      id === "add_contact_2" &&
      prev &&
      prev.kind === "contactNew" &&
      current.kind !== "contactNew"
    ) {
      goToStep(2);
    }

    if (id === "topup_1" && transition("contacts", "settings")) goToStep(1);
    if (id === "topup_2" && transition("settings", "wallet")) goToStep(2);
    if (id === "topup_3" && transition("wallet", "topup")) goToStep(3);
    if (id === "topup_4" && transition("topup", "topupInvoice"))
      stopContactsGuide();

    if (id === "pay_1" && transition("contacts", "contact")) goToStep(1);
    if (id === "pay_2" && transition("contact", "contactPay")) goToStep(2);

    if (id === "message_1" && transition("contacts", "contact")) goToStep(1);
    if (id === "message_2" && transition("contact", "chat")) goToStep(2);

    // Auto-finish when the underlying task becomes completed.
    if (contactsGuide.task === "topup" && cashuBalance > 0) stopContactsGuide();
    if (contactsGuide.task === "pay" && contactsOnboardingHasPaid)
      stopContactsGuide();
    if (contactsGuide.task === "message" && contactsOnboardingHasSentMessage)
      stopContactsGuide();
  }, [
    cashuBalance,
    contactsGuide,
    contactsGuideActiveStep?.step,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    route,
    stopContactsGuide,
  ]);

  React.useEffect(() => {
    const active = contactsGuideActiveStep?.step ?? null;
    if (!contactsGuide || !active) {
      setContactsGuideHighlightRect(null);
      return;
    }

    const updateRect = () => {
      const el = document.querySelector(active.selector) as HTMLElement | null;
      if (!el) {
        setContactsGuideHighlightRect(null);
        return;
      }
      try {
        el.scrollIntoView({ block: "center", inline: "center" });
      } catch {
        // ignore
      }
      const r = el.getBoundingClientRect();
      const pad = 8;
      setContactsGuideHighlightRect({
        top: Math.max(r.top - pad, 8),
        left: Math.max(r.left - pad, 8),
        width: Math.min(r.width + pad * 2, window.innerWidth - 16),
        height: Math.min(r.height + pad * 2, window.innerHeight - 16),
      });
    };

    updateRect();

    const onResize = () => updateRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize);
    };
  }, [contactsGuide, contactsGuideActiveStep, route.kind]);

  const contactsGuideNav = {
    back: () => {
      if (!contactsGuide) return;
      setContactsGuide((prev) =>
        prev ? { ...prev, step: Math.max(prev.step - 1, 0) } : prev
      );
    },
    next: () => {
      if (!contactsGuideSteps || !contactsGuide) return;
      setContactsGuide((prev) => {
        if (!prev) return prev;
        const max = Math.max(contactsGuideSteps.length - 1, 0);
        if (prev.step >= max) return null;
        return { ...prev, step: prev.step + 1 };
      });
    },
  };

  React.useEffect(() => {
    if (contactsOnboardingDismissed) return;
    if (!showContactsOnboarding) return;
    if (contactsOnboardingCelebrating) return;

    const total = contactsOnboardingTasks.total;
    if (!total) return;
    if (contactsOnboardingTasks.done !== total) return;

    setContactsOnboardingCelebrating(true);
    setContactsGuide(null);
    const timeoutId = window.setTimeout(() => {
      dismissContactsOnboarding();
      setContactsOnboardingCelebrating(false);
    }, 1400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    contactsOnboardingCelebrating,
    contactsOnboardingDismissed,
    contactsOnboardingTasks.done,
    contactsOnboardingTasks.total,
    dismissContactsOnboarding,
    showContactsOnboarding,
  ]);

  const saveCashuFromText = React.useCallback(
    async (
      tokenText: string,
      options?: {
        navigateToWallet?: boolean;
      }
    ) => {
      const tokenRaw = tokenText.trim();
      if (!tokenRaw) {
        setStatus(t("pasteEmpty"));
        return;
      }
      setCashuDraft("");
      setStatus(t("cashuAccepting"));

      // Parse best-effort metadata for display / fallback.
      const parsed = parseCashuToken(tokenRaw);
      const parsedMint = parsed?.mint?.trim() ? parsed.mint.trim() : null;
      const parsedAmount =
        parsed?.amount && parsed.amount > 0 ? parsed.amount : null;

      await enqueueCashuOp(async () => {
        setCashuIsBusy(true);
        try {
          const ownerId = await resolveOwnerIdForWrite();

          const { acceptCashuToken } = await import("./cashuAccept");
          const accepted = await acceptCashuToken(tokenRaw);

          const result = ownerId
            ? insert(
                "cashuToken",
                {
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
                },
                { ownerId }
              )
            : insert("cashuToken", {
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
          if (!result.ok) {
            setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
            return;
          }

          safeLocalStorageSet(
            LAST_ACCEPTED_CASHU_TOKEN_STORAGE_KEY,
            String(accepted.token ?? "")
          );
          ensureCashuTokenPersisted(String(accepted.token ?? ""));

          if (recentlyReceivedTokenTimerRef.current !== null) {
            try {
              window.clearTimeout(recentlyReceivedTokenTimerRef.current);
            } catch {
              // ignore
            }
          }
          setRecentlyReceivedToken({
            token: String(accepted.token ?? "").trim(),
            amount:
              typeof accepted.amount === "number" && accepted.amount > 0
                ? accepted.amount
                : null,
          });
          recentlyReceivedTokenTimerRef.current = window.setTimeout(() => {
            setRecentlyReceivedToken(null);
            recentlyReceivedTokenTimerRef.current = null;
          }, 25_000);

          const cleanedMint = String(accepted.mint ?? "")
            .trim()
            .replace(/\/+$/, "");
          if (cleanedMint) {
            const nowSec = Math.floor(Date.now() / 1000);
            const existing = mintInfoByUrl.get(cleanedMint) as
              | (Record<string, unknown> & {
                  isDeleted?: unknown;
                  lastCheckedAtSec?: unknown;
                })
              | undefined;

            if (isMintDeleted(cleanedMint)) {
              // Respect user deletion across any owner scope.
            } else {
              touchMintInfo(cleanedMint, nowSec);

              const lastChecked = Number(existing?.lastCheckedAtSec ?? 0) || 0;
              if (existing && !lastChecked) void refreshMintInfo(cleanedMint);
            }
          }

          logPaymentEvent({
            direction: "in",
            status: "ok",
            amount: accepted.amount,
            fee: null,
            mint: accepted.mint,
            unit: accepted.unit,
            error: null,
            contactId: null,
          });

          const title =
            accepted.amount && accepted.amount > 0
              ? t("paidReceived")
                  .replace("{amount}", formatInteger(accepted.amount))
                  .replace("{unit}", displayUnit)
              : t("cashuAccepted");
          showPaidOverlay(title);

          if (options?.navigateToWallet) {
            navigateToWallet();
          }
        } catch (error) {
          const message = String(error).trim() || "Accept failed";
          logPaymentEvent({
            direction: "in",
            status: "error",
            amount: parsedAmount,
            fee: null,
            mint: parsedMint,
            unit: null,
            error: message,
            contactId: null,
          });
          const ownerId = await resolveOwnerIdForWrite();
          const result = ownerId
            ? insert(
                "cashuToken",
                {
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
                  error: message.slice(
                    0,
                    1000
                  ) as typeof Evolu.NonEmptyString1000.Type,
                },
                { ownerId }
              )
            : insert("cashuToken", {
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
                error: message.slice(
                  0,
                  1000
                ) as typeof Evolu.NonEmptyString1000.Type,
              });
          if (result.ok) {
            setStatus(`${t("cashuAcceptFailed")}: ${message}`);
          } else {
            setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
          }
        } finally {
          setCashuIsBusy(false);
        }
      });
    },
    [
      displayUnit,
      enqueueCashuOp,
      formatInteger,
      insert,
      logPaymentEvent,
      mintInfoByUrl,
      refreshMintInfo,
      resolveOwnerIdForWrite,
      showPaidOverlay,
      t,
      upsert,
    ]
  );

  const handleDelete = (id: ContactId) => {
    const existing = contacts.find(
      (c) => String(c.id ?? "") === String(id as unknown as string)
    );
    const result = appOwnerId
      ? update(
          "contact",
          { id, isDeleted: Evolu.sqliteTrue },
          { ownerId: appOwnerId }
        )
      : update("contact", { id, isDeleted: Evolu.sqliteTrue });
    if (result.ok) {
      const journalPayload = createJournalEntryPayload({
        action: "contact.delete",
        entity: "contact",
        entityId: id,
        summary:
          String(existing?.name ?? "").trim() ||
          String(existing?.npub ?? "").trim() ||
          String(existing?.lnAddress ?? "").trim() ||
          String(id as unknown as string),
        payload: {
          name: String(existing?.name ?? "").trim() || null,
          npub: String(existing?.npub ?? "").trim() || null,
          lnAddress: String(existing?.lnAddress ?? "").trim() || null,
          groupName: String(existing?.groupName ?? "").trim() || null,
        },
      });
      try {
        appOwnerId
          ? insert("journalEntry", journalPayload as any, {
              ownerId: appOwnerId,
            })
          : insert("journalEntry", journalPayload as any);
      } catch {
        // ignore
      }
      setStatus(t("contactDeleted"));
      closeContactDetail();
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const handleDeleteCashuToken = (id: CashuTokenId) => {
    const result = appOwnerId
      ? update(
          "cashuToken",
          { id, isDeleted: Evolu.sqliteTrue },
          { ownerId: appOwnerId }
        )
      : update("cashuToken", { id, isDeleted: Evolu.sqliteTrue });
    if (result.ok) {
      setStatus(t("cashuDeleted"));
      setPendingCashuDeleteId(null);
      navigateToWallet();
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const checkAndRefreshCashuToken = React.useCallback(
    async (id: CashuTokenId) => {
      const row = cashuTokensAll.find(
        (tkn) =>
          String(tkn?.id ?? "") === String(id as unknown as string) &&
          !tkn?.isDeleted
      );

      if (!row) {
        pushToast(t("errorPrefix"));
        return;
      }

      const tokenText = String(row.token ?? row.rawToken ?? "").trim();
      if (!tokenText) {
        pushToast(t("errorPrefix"));
        return;
      }

      if (cashuIsBusy) return;
      setCashuIsBusy(true);
      setStatus(t("cashuChecking"));

      const looksLikeTransientError = (message: string) => {
        const m = message.toLowerCase();
        return (
          m.includes("failed to fetch") ||
          m.includes("networkerror") ||
          m.includes("network error") ||
          m.includes("timeout") ||
          m.includes("timed out") ||
          m.includes("econn") ||
          m.includes("enotfound") ||
          m.includes("dns") ||
          m.includes("offline") ||
          m.includes("503") ||
          m.includes("502") ||
          m.includes("504")
        );
      };

      const looksLikeDefinitiveInvalid = (message: string) => {
        const m = message.toLowerCase();
        return (
          m.includes("spent") ||
          m.includes("already spent") ||
          m.includes("invalid proof") ||
          m.includes("invalid proofs") ||
          m.includes("token proofs missing") ||
          m.includes("invalid token")
        );
      };

      try {
        const { getCashuLib } = await import("./utils/cashuLib");
        const { CashuMint, CashuWallet, getDecodedToken, getEncodedToken } =
          await getCashuLib();

        const decoded = getDecodedToken(tokenText);
        const mint = String(decoded?.mint ?? row.mint ?? "").trim();
        if (!mint) throw new Error("Token mint missing");

        const unit = String(decoded?.unit ?? row.unit ?? "").trim() || null;
        const proofs = Array.isArray(decoded?.proofs) ? decoded.proofs : [];
        if (!proofs.length) throw new Error("Token proofs missing");

        const total = proofs.reduce(
          (sum: number, p: { amount?: unknown }) =>
            sum + (Number(p?.amount ?? 0) || 0),
          0
        );
        if (!Number.isFinite(total) || total <= 0) {
          throw new Error("Invalid token amount");
        }

        const wallet = new CashuWallet(
          new CashuMint(mint),
          unit ? { unit } : undefined
        );
        await wallet.loadMint();

        const swapped = await wallet.swap(total, proofs);
        const newProofs = [
          ...((swapped?.keep as unknown as unknown[]) ?? []),
          ...((swapped?.send as unknown as unknown[]) ?? []),
        ] as Array<{ amount: number; secret: string; C: string; id: string }>;

        const newTotal = newProofs.reduce(
          (sum, p) => sum + (Number(p?.amount ?? 0) || 0),
          0
        );
        if (!Number.isFinite(newTotal) || newTotal <= 0) {
          throw new Error("Swap produced empty token");
        }

        const refreshedToken = getEncodedToken({
          mint,
          proofs: newProofs,
          ...(unit ? { unit } : {}),
        });

        const result = update("cashuToken", {
          id: row.id as CashuTokenId,
          token: refreshedToken as typeof Evolu.NonEmptyString.Type,
          rawToken: null,
          mint: mint ? (mint as typeof Evolu.NonEmptyString1000.Type) : null,
          unit: unit ? (unit as typeof Evolu.NonEmptyString100.Type) : null,
          amount:
            newTotal > 0
              ? (Math.floor(newTotal) as typeof Evolu.PositiveInt.Type)
              : null,
          state: "accepted" as typeof Evolu.NonEmptyString100.Type,
          error: null,
        });

        if (!result.ok) {
          throw new Error(String(result.error));
        }

        setStatus(t("cashuCheckOk"));
        pushToast(t("cashuCheckOk"));
      } catch (e) {
        const message = String(e).trim() || "Token invalid";
        const definitive = looksLikeDefinitiveInvalid(message);
        const transient = looksLikeTransientError(message);

        if (definitive && !transient) {
          update("cashuToken", {
            id: row.id as CashuTokenId,
            state: "error" as typeof Evolu.NonEmptyString100.Type,
            error: message.slice(
              0,
              1000
            ) as typeof Evolu.NonEmptyString1000.Type,
          });
          setStatus(`${t("cashuCheckFailed")}: ${message}`);
          pushToast(t("cashuInvalid"));
        } else {
          // Don't mark token invalid on transient mint/network issues.
          setStatus(`${t("cashuCheckFailed")}: ${message}`);
          pushToast(`${t("cashuCheckFailed")}: ${message}`);
        }
      } finally {
        setCashuIsBusy(false);
      }
    },
    [cashuIsBusy, cashuTokensAll, pushToast, t, update]
  );

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
      pushToast(t("copiedToClipboard"));
    } catch {
      pushToast(t("copyFailed"));
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

  const deriveEvoluMnemonicFromNsec = React.useCallback(
    async (nsec: string): Promise<Evolu.Mnemonic | null> => {
      const raw = String(nsec ?? "").trim();
      if (!raw) return null;
      try {
        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(raw);
        if (decoded.type !== "nsec") return null;
        const privBytes = decoded.data as Uint8Array;

        const prefix = new TextEncoder().encode("linky-evolu-v1:");
        const data = new Uint8Array(prefix.length + privBytes.length);
        data.set(prefix);
        data.set(privBytes, prefix.length);

        const hashBuf = await crypto.subtle.digest(
          "SHA-256",
          data as unknown as BufferSource
        );
        const hash = new Uint8Array(hashBuf);
        const entropy = hash.slice(0, 16); // 128-bit -> 12 words
        const phrase = entropyToMnemonic(entropy, wordlist);
        const validated = Evolu.Mnemonic.fromUnknown(phrase);
        if (!validated.ok) return null;
        return validated.value;
      } catch {
        return null;
      }
    },
    []
  );

  React.useEffect(() => {
    if (!currentNsec) return;
    let cancelled = false;

    (async () => {
      const nsec = String(currentNsec).trim();
      const storedMnemonic = (() => {
        try {
          return String(
            localStorage.getItem(INITIAL_MNEMONIC_STORAGE_KEY) ?? ""
          ).trim();
        } catch {
          return "";
        }
      })();

      const derivedMnemonic = await deriveEvoluMnemonicFromNsec(nsec);
      if (cancelled) return;

      const ownerSecretPreview = (() => {
        if (!derivedMnemonic) return null;
        try {
          const ownerSecret = Evolu.mnemonicToOwnerSecret(
            derivedMnemonic as unknown as Evolu.Mnemonic
          ) as unknown;

          if (ownerSecret instanceof Uint8Array) {
            const hex = Array.from(ownerSecret.slice(0, 8))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
            return `${hex}…`;
          }

          const s = String(ownerSecret);
          return s.length > 24 ? `${s.slice(0, 24)}…` : s;
        } catch {
          return null;
        }
      })();

      const evoluOwnerInfo = await (async () => {
        try {
          const owner = await evolu.appOwner;
          const ownerId = String((owner as unknown as { id?: unknown })?.id);
          return ownerId ? ownerId : null;
        } catch {
          return null;
        }
      })();

      const expectedOwnerId = (() => {
        if (!derivedMnemonic) return null;
        try {
          const appOwner = Evolu.createAppOwner(
            Evolu.mnemonicToOwnerSecret(
              derivedMnemonic as unknown as Evolu.Mnemonic
            ) as unknown as Evolu.OwnerSecret
          ) as unknown as { id?: unknown };

          const id = String(appOwner?.id ?? "").trim();
          return id ? id : null;
        } catch {
          return null;
        }
      })();

      const previewId = (id: string | null) =>
        id ? (id.length > 10 ? `${id.slice(0, 10)}…` : id) : null;

      console.log("[linky][debug] identity", {
        origin: globalThis.location?.origin ?? null,
        href: globalThis.location?.href ?? null,
        npub: currentNpub,
        hasNsec: Boolean(nsec),
        contactsCount: contacts.length,
        contactsIdPreview: contacts.slice(0, 5).map((c) => c.id),
        evoluAppOwnerId: previewId(evoluOwnerInfo),
        expectedAppOwnerId: previewId(expectedOwnerId),
        appOwnerMatchesExpected: Boolean(
          evoluOwnerInfo &&
            expectedOwnerId &&
            evoluOwnerInfo === expectedOwnerId
        ),
        storedMnemonic: storedMnemonic || null,
        derivedMnemonic: derivedMnemonic ?? null,
        mnemonicMatches: Boolean(
          derivedMnemonic &&
            storedMnemonic &&
            derivedMnemonic === storedMnemonic
        ),
        ownerSecretPreview,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [contacts, currentNpub, currentNsec, deriveEvoluMnemonicFromNsec]);

  const setIdentityFromNsecAndReload = React.useCallback(
    async (nsec: string) => {
      const raw = String(nsec ?? "").trim();
      if (!raw) {
        pushToast(t("onboardingInvalidNsec"));
        return;
      }

      const mnemonic = await deriveEvoluMnemonicFromNsec(raw);
      if (!mnemonic) {
        pushToast(t("onboardingInvalidNsec"));
        return;
      }

      try {
        localStorage.setItem(NOSTR_NSEC_STORAGE_KEY, raw);
        localStorage.setItem(INITIAL_MNEMONIC_STORAGE_KEY, mnemonic);
      } catch {
        // ignore
      }

      // Important: a browser that opened Linky before setting the mnemonic
      // will have a random persisted Evolu AppOwner in its local DB. If we just
      // set localStorage and reload, Evolu may keep using that persisted owner,
      // causing "same nsec, different contacts" across browsers.
      // Restoring the AppOwner ensures the DB owner matches the mnemonic.
      try {
        await evolu.restoreAppOwner(mnemonic as unknown as Evolu.Mnemonic, {
          reload: false,
        });
      } catch (e) {
        console.log("[linky][evolu] restoreAppOwner failed", {
          error: String(e ?? "unknown"),
        });
      }

      try {
        window.location.hash = "#";
      } catch {
        // ignore
      }
      globalThis.location.reload();
    },
    [deriveEvoluMnemonicFromNsec, pushToast, t]
  );

  const createNewAccount = React.useCallback(async () => {
    if (onboardingIsBusy) return;
    setOnboardingIsBusy(true);
    setOnboardingStep({ step: 1, derivedName: null, error: null });
    try {
      const { nip19, getPublicKey } = await import("nostr-tools");
      const generateRandomSecretKey = (): Uint8Array => {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        return bytes;
      };

      let privBytes: Uint8Array | null = null;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const candidate = generateRandomSecretKey();
        try {
          getPublicKey(candidate);
          privBytes = candidate;
          break;
        } catch {
          // try again
        }
      }

      if (!privBytes) {
        pushToast(t("onboardingCreateFailed"));
        setOnboardingStep({
          step: 1,
          derivedName: null,
          error: t("onboardingCreateFailed"),
        });
        return;
      }

      const pubkeyHex = getPublicKey(privBytes);
      const npub = nip19.npubEncode(pubkeyHex);

      const defaults = deriveDefaultProfile(npub);
      setOnboardingStep({ step: 1, derivedName: defaults.name, error: null });

      // Step 2: deterministic avatar.
      setOnboardingStep({ step: 2, derivedName: defaults.name, error: null });

      // Step 3: lightning address + publish defaults to Nostr.
      setOnboardingStep({ step: 3, derivedName: defaults.name, error: null });

      try {
        const content: Record<string, unknown> = {
          name: defaults.name,
          display_name: defaults.name,
          picture: defaults.pictureUrl,
          image: defaults.pictureUrl,
          lud16: defaults.lnAddress,
        };

        const relaysToUse = NOSTR_RELAYS;
        const result = await publishKind0ProfileMetadata({
          privBytes,
          relays: relaysToUse,
          content,
        });

        if (!result.anySuccess) {
          throw new Error("nostr publish failed");
        }

        // Cache locally so the profile looks correct immediately after reload.
        saveCachedProfileMetadata(npub, {
          name: defaults.name,
          displayName: defaults.name,
          lud16: defaults.lnAddress,
          picture: defaults.pictureUrl,
          image: defaults.pictureUrl,
        });
        saveCachedProfilePicture(npub, defaults.pictureUrl);
      } catch (e) {
        const msg = `${t("errorPrefix")}: ${String(e ?? "unknown")}`;
        setOnboardingStep({ step: 3, derivedName: defaults.name, error: msg });
        pushToast(msg);
        return;
      }

      const nsec = nip19.nsecEncode(privBytes);
      await setIdentityFromNsecAndReload(nsec);
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [onboardingIsBusy, pushToast, setIdentityFromNsecAndReload, t]);

  const pasteExistingNsec = React.useCallback(async () => {
    if (onboardingIsBusy) return;
    setOnboardingIsBusy(true);
    try {
      if (!navigator.clipboard?.readText) {
        pushToast(t("pasteNotAvailable"));
        return;
      }
      const text = await navigator.clipboard.readText();
      const raw = String(text ?? "").trim();
      if (!raw) {
        pushToast(t("pasteEmpty"));
        return;
      }
      await setIdentityFromNsecAndReload(raw);
    } catch {
      pushToast(t("pasteNotAvailable"));
    } finally {
      setOnboardingIsBusy(false);
    }
  }, [onboardingIsBusy, pushToast, setIdentityFromNsecAndReload, t]);

  const requestLogout = React.useCallback(() => {
    if (!logoutArmed) {
      setLogoutArmed(true);
      pushToast(t("logoutArmedHint"));
      return;
    }

    setLogoutArmed(false);
    try {
      localStorage.removeItem(NOSTR_NSEC_STORAGE_KEY);
      localStorage.removeItem(INITIAL_MNEMONIC_STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      window.location.hash = "#";
    } catch {
      // ignore
    }
    globalThis.location.reload();
  }, [logoutArmed, pushToast, t]);

  const openFeedbackContactPendingRef = React.useRef(false);

  const openScannedContactPendingNpubRef = React.useRef<string | null>(null);

  const openFeedbackContact = React.useCallback(() => {
    const targetNpub = FEEDBACK_CONTACT_NPUB;
    const existing = contacts.find(
      (c) => String(c.npub ?? "").trim() === targetNpub
    );

    if (existing?.id) {
      if (String(existing.name ?? "") === "Feedback") {
        update("contact", { id: existing.id, name: null });
      }
      openFeedbackContactPendingRef.current = false;
      navigateToContact(existing.id);
      return;
    }

    openFeedbackContactPendingRef.current = true;

    const payload = {
      name: null,
      npub: targetNpub as typeof Evolu.NonEmptyString1000.Type,
      lnAddress: null,
      groupName: null,
    };

    const result = appOwnerId
      ? insert("contact", payload, { ownerId: appOwnerId })
      : insert("contact", payload);

    if (!result.ok) {
      openFeedbackContactPendingRef.current = false;
      pushToast(`${t("errorPrefix")}: ${String(result.error)}`);
    }
  }, [appOwnerId, contacts, insert, pushToast, t, update]);

  React.useEffect(() => {
    if (!openFeedbackContactPendingRef.current) return;
    const targetNpub = FEEDBACK_CONTACT_NPUB;
    const existing = contacts.find(
      (c) => String(c.npub ?? "").trim() === targetNpub
    );
    if (!existing?.id) return;
    openFeedbackContactPendingRef.current = false;
    navigateToContact(existing.id);
  }, [contacts]);

  const openContactDetail = (contact: (typeof contacts)[number]) => {
    setPendingDeleteId(null);
    setContactAttentionById((prev) => {
      const key = String(contact.id ?? "");
      if (!key || prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    navigateToContact(contact.id);
  };

  React.useEffect(() => {
    if (route.kind === "contactNew") {
      setPendingDeleteId(null);
      setEditingId(null);
      setForm(makeEmptyForm());
      if (contactNewPrefill) {
        setForm({
          name: contactNewPrefill.suggestedName ?? "",
          npub: contactNewPrefill.npub ?? "",
          lnAddress: contactNewPrefill.lnAddress,
          group: "",
        });
        setContactNewPrefill(null);
      }
      return;
    }

    if (route.kind !== "contactEdit") return;
    setPendingDeleteId(null);

    if (!selectedContact) {
      setEditingId(null);
      setForm(makeEmptyForm());
      return;
    }

    setEditingId(selectedContact.id);
    if (contactEditInitialRef.current?.id !== selectedContact.id) {
      contactEditInitialRef.current = {
        id: selectedContact.id as ContactId,
        name: String(selectedContact.name ?? ""),
        npub: String(selectedContact.npub ?? ""),
        lnAddress: String(selectedContact.lnAddress ?? ""),
        group: String(selectedContact.groupName ?? ""),
      };
    }
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
      const result = appOwnerId
        ? update(
            "contact",
            { id: editingId, ...payload },
            { ownerId: appOwnerId }
          )
        : update("contact", { id: editingId, ...payload });
      if (result.ok) {
        const initial = contactEditInitialRef.current;
        const changes: Record<
          string,
          { from: string | null; to: string | null }
        > = {};
        if (initial?.id === editingId) {
          const nextName = payload.name ? String(payload.name) : null;
          const nextNpub = payload.npub ? String(payload.npub) : null;
          const nextLn = payload.lnAddress ? String(payload.lnAddress) : null;
          const nextGroup = payload.groupName
            ? String(payload.groupName)
            : null;

          const prevName = initial.name || null;
          const prevNpub = initial.npub || null;
          const prevLn = initial.lnAddress || null;
          const prevGroup = initial.group || null;

          if ((prevName ?? "") !== (nextName ?? ""))
            changes.name = { from: prevName, to: nextName };
          if ((prevNpub ?? "") !== (nextNpub ?? ""))
            changes.npub = { from: prevNpub, to: nextNpub };
          if ((prevLn ?? "") !== (nextLn ?? ""))
            changes.lnAddress = { from: prevLn, to: nextLn };
          if ((prevGroup ?? "") !== (nextGroup ?? ""))
            changes.group = { from: prevGroup, to: nextGroup };
        }

        const journalPayload = createJournalEntryPayload({
          action: "contact.edit",
          entity: "contact",
          entityId: editingId,
          summary:
            (payload.name ? String(payload.name) : "") ||
            (payload.npub ? String(payload.npub) : "") ||
            (payload.lnAddress ? String(payload.lnAddress) : ""),
          payload: {
            changes,
            next: {
              name: payload.name ? String(payload.name) : null,
              npub: payload.npub ? String(payload.npub) : null,
              lnAddress: payload.lnAddress ? String(payload.lnAddress) : null,
              groupName: payload.groupName ? String(payload.groupName) : null,
            },
          },
        });
        try {
          appOwnerId
            ? insert("journalEntry", journalPayload as any, {
                ownerId: appOwnerId,
              })
            : insert("journalEntry", journalPayload as any);
        } catch {
          // ignore
        }
        setStatus(t("contactUpdated"));
      } else {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    } else {
      const result = appOwnerId
        ? insert("contact", payload, { ownerId: appOwnerId })
        : insert("contact", payload);
      if (result.ok) {
        const journalPayload = createJournalEntryPayload({
          action: "contact.add",
          entity: "contact",
          entityId: result.value.id,
          summary:
            (payload.name ? String(payload.name) : "") ||
            (payload.npub ? String(payload.npub) : "") ||
            (payload.lnAddress ? String(payload.lnAddress) : ""),
          payload: {
            name: payload.name ? String(payload.name) : null,
            npub: payload.npub ? String(payload.npub) : null,
            lnAddress: payload.lnAddress ? String(payload.lnAddress) : null,
            groupName: payload.groupName ? String(payload.groupName) : null,
          },
        });
        try {
          appOwnerId
            ? insert("journalEntry", journalPayload as any, {
                ownerId: appOwnerId,
              })
            : insert("journalEntry", journalPayload as any);
        } catch {
          // ignore
        }
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

  const refreshContactFromNostr = React.useCallback(
    async (contactId: ContactId, npub: string) => {
      const trimmed = String(npub ?? "").trim();
      if (!trimmed) return;

      try {
        const metadata = await fetchNostrProfileMetadata(trimmed, {
          relays: nostrFetchRelays,
        });

        saveCachedProfileMetadata(trimmed, metadata);
        if (!metadata) return;

        const bestName = getBestNostrName(metadata);
        const ln =
          String(metadata.lud16 ?? "").trim() ||
          String(metadata.lud06 ?? "").trim();

        const patch: Partial<{
          name: typeof Evolu.NonEmptyString1000.Type;
          lnAddress: typeof Evolu.NonEmptyString1000.Type;
        }> = {};

        if (bestName) {
          patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
        }
        if (ln) {
          patch.lnAddress = ln as typeof Evolu.NonEmptyString1000.Type;
        }

        if (Object.keys(patch).length > 0) {
          update("contact", { id: contactId, ...patch });
        }
      } catch {
        // ignore
      }
    },
    [nostrFetchRelays, update]
  );

  React.useEffect(() => {
    const targetNpub = openScannedContactPendingNpubRef.current;
    if (!targetNpub) return;
    const existing = contacts.find(
      (c) => String(c.npub ?? "").trim() === targetNpub
    );
    if (!existing?.id) return;
    openScannedContactPendingNpubRef.current = null;
    navigateToContact(existing.id);
    void refreshContactFromNostr(existing.id, targetNpub);
  }, [contacts, refreshContactFromNostr]);

  const resetEditedContactFieldFromNostr = React.useCallback(
    async (field: "name" | "lnAddress") => {
      if (route.kind !== "contactEdit") return;
      if (!editingId) return;

      const npub = String(form.npub ?? "").trim();

      // First clear the custom value.
      if (field === "name") {
        setForm((prev) => ({ ...prev, name: "" }));
        update("contact", { id: editingId, name: null });
      } else {
        setForm((prev) => ({ ...prev, lnAddress: "" }));
        update("contact", { id: editingId, lnAddress: null });
      }

      if (!npub) return;

      // Then fetch Nostr metadata and repopulate.
      try {
        const metadata = await fetchNostrProfileMetadata(npub, {
          relays: nostrFetchRelays,
        });
        saveCachedProfileMetadata(npub, metadata);
        if (!metadata) return;

        const bestName = getBestNostrName(metadata);
        const ln =
          String(metadata.lud16 ?? "").trim() ||
          String(metadata.lud06 ?? "").trim();

        if (bestName) {
          setForm((prev) => ({ ...prev, name: bestName }));
        }
        if (ln) {
          setForm((prev) => ({ ...prev, lnAddress: ln }));
        }

        const patch: Partial<{
          name: typeof Evolu.NonEmptyString1000.Type;
          lnAddress: typeof Evolu.NonEmptyString1000.Type;
        }> = {};
        if (bestName)
          patch.name = bestName as typeof Evolu.NonEmptyString1000.Type;
        if (ln) patch.lnAddress = ln as typeof Evolu.NonEmptyString1000.Type;
        if (Object.keys(patch).length > 0) {
          update("contact", { id: editingId, ...patch });
        }
      } catch {
        // ignore
      }
    },
    [editingId, form.npub, nostrFetchRelays, route.kind, update]
  );

  const exportAppData = React.useCallback(() => {
    try {
      const now = new Date();
      const filenameDate = now.toISOString().slice(0, 10);

      const payload = {
        app: "linky",
        version: 1,
        exportedAt: now.toISOString(),
        contacts: contacts.map((c) => ({
          name: String(c.name ?? "").trim() || null,
          npub: String(c.npub ?? "").trim() || null,
          lnAddress: String(c.lnAddress ?? "").trim() || null,
          groupName: String(c.groupName ?? "").trim() || null,
        })),
        cashuTokens: cashuTokens.map((t) => ({
          token: String(t.token ?? "").trim(),
          rawToken: String(t.rawToken ?? "").trim() || null,
          mint: String(t.mint ?? "").trim() || null,
          unit: String(t.unit ?? "").trim() || null,
          amount:
            typeof t.amount === "number" && Number.isFinite(t.amount)
              ? t.amount
              : t.amount
              ? Number(t.amount)
              : null,
          state: String(t.state ?? "").trim() || null,
          error: String(t.error ?? "").trim() || null,
        })),
      };

      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `linky-export-${filenameDate}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }, 1000);

      pushToast(t("exportDone"));
    } catch {
      pushToast(t("exportFailed"));
    }
  }, [cashuTokens, contacts, pushToast, t]);

  const requestImportAppData = React.useCallback(() => {
    const el = importDataFileInputRef.current;
    if (!el) return;
    try {
      el.click();
    } catch {
      // ignore
    }
  }, []);

  const importAppDataFromText = React.useCallback(
    (text: string) => {
      const sanitizeText = (value: unknown, maxLen: number): string | null => {
        const raw = String(value ?? "").trim();
        if (!raw) return null;
        return raw.length > maxLen ? raw.slice(0, maxLen) : raw;
      };

      let parsed: unknown;
      try {
        parsed = JSON.parse(String(text ?? ""));
      } catch {
        pushToast(t("importInvalid"));
        return;
      }

      const root = asRecord(parsed);
      if (!root) {
        pushToast(t("importInvalid"));
        return;
      }

      const importedContacts = Array.isArray(root.contacts)
        ? root.contacts
        : [];
      const importedTokens = Array.isArray(root.cashuTokens)
        ? root.cashuTokens
        : [];

      const existingByNpub = new Map<string, (typeof contacts)[number]>();
      const existingByLn = new Map<string, (typeof contacts)[number]>();
      for (const c of contacts) {
        const npub = String(c.npub ?? "").trim();
        const ln = String(c.lnAddress ?? "")
          .trim()
          .toLowerCase();
        if (npub) existingByNpub.set(npub, c);
        if (ln) existingByLn.set(ln, c);
      }

      const existingTokenSet = new Set<string>();
      for (const tok of cashuTokensAll) {
        const token = String(tok.token ?? "").trim();
        const raw = String(tok.rawToken ?? "").trim();
        if (token) existingTokenSet.add(token);
        if (raw) existingTokenSet.add(raw);
      }

      let addedContacts = 0;
      let updatedContacts = 0;
      let addedTokens = 0;

      for (const item of importedContacts) {
        const rec = asRecord(item);
        if (!rec) continue;

        const name = sanitizeText(rec.name, 1000);
        const npub = sanitizeText(rec.npub, 1000);
        const lnAddressRaw = sanitizeText(rec.lnAddress, 1000);
        const lnAddress = lnAddressRaw ? lnAddressRaw : null;
        const groupName = sanitizeText(rec.groupName, 1000);

        if (!name && !npub && !lnAddress) continue;

        const existing =
          (npub ? existingByNpub.get(npub) : undefined) ??
          (lnAddress
            ? existingByLn.get(String(lnAddress).toLowerCase())
            : undefined);

        const payload = {
          name: name ? (name as typeof Evolu.NonEmptyString1000.Type) : null,
          npub: npub ? (npub as typeof Evolu.NonEmptyString1000.Type) : null,
          lnAddress: lnAddress
            ? (lnAddress as typeof Evolu.NonEmptyString1000.Type)
            : null,
          groupName: groupName
            ? (groupName as typeof Evolu.NonEmptyString1000.Type)
            : null,
        };

        if (existing && existing.id) {
          const id = existing.id as ContactId;
          const merged = {
            id,
            name:
              payload.name ??
              (String(existing.name ?? "").trim()
                ? (String(
                    existing.name ?? ""
                  ).trim() as typeof Evolu.NonEmptyString1000.Type)
                : null),
            npub:
              payload.npub ??
              (String(existing.npub ?? "").trim()
                ? (String(
                    existing.npub ?? ""
                  ).trim() as typeof Evolu.NonEmptyString1000.Type)
                : null),
            lnAddress:
              payload.lnAddress ??
              (String(existing.lnAddress ?? "").trim()
                ? (String(
                    existing.lnAddress ?? ""
                  ).trim() as typeof Evolu.NonEmptyString1000.Type)
                : null),
            groupName:
              payload.groupName ??
              (String(existing.groupName ?? "").trim()
                ? (String(
                    existing.groupName ?? ""
                  ).trim() as typeof Evolu.NonEmptyString1000.Type)
                : null),
          };

          const r = appOwnerId
            ? update("contact", merged, { ownerId: appOwnerId })
            : update("contact", merged);
          if (r.ok) updatedContacts += 1;
        } else {
          const r = appOwnerId
            ? insert("contact", payload, { ownerId: appOwnerId })
            : insert("contact", payload);
          if (r.ok) addedContacts += 1;
        }
      }

      for (const item of importedTokens) {
        const rec = asRecord(item);
        if (!rec) continue;
        const token = String(rec.token ?? "").trim();
        if (!token) continue;
        if (existingTokenSet.has(token)) continue;

        const rawToken = sanitizeText(rec.rawToken, 100000);
        const mint = sanitizeText(rec.mint, 1000);
        const unit = sanitizeText(rec.unit, 100);
        const state = sanitizeText(rec.state, 100);
        const error = sanitizeText(rec.error, 1000);
        const amountNum = Math.trunc(
          Number((rec as Record<string, unknown>).amount ?? 0)
        );
        const amount =
          Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null;

        const r = insert("cashuToken", {
          token: token as typeof Evolu.NonEmptyString.Type,
          rawToken: rawToken
            ? (rawToken as typeof Evolu.NonEmptyString.Type)
            : null,
          mint: mint ? (mint as typeof Evolu.NonEmptyString1000.Type) : null,
          unit: unit ? (unit as typeof Evolu.NonEmptyString100.Type) : null,
          amount: amount ? (amount as typeof Evolu.PositiveInt.Type) : null,
          state: state ? (state as typeof Evolu.NonEmptyString100.Type) : null,
          error: error ? (error as typeof Evolu.NonEmptyString1000.Type) : null,
        });
        if (r.ok) {
          addedTokens += 1;
          existingTokenSet.add(token);
          if (rawToken) existingTokenSet.add(rawToken);
        }
      }

      if (addedContacts === 0 && updatedContacts === 0 && addedTokens === 0) {
        pushToast(t("importNothing"));
        return;
      }

      pushToast(
        `${t(
          "importDone"
        )} (${addedContacts}/${updatedContacts}/${addedTokens})`
      );
    },
    [appOwnerId, cashuTokensAll, contacts, insert, pushToast, t, update]
  );

  const handleImportAppDataFilePicked = React.useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        importAppDataFromText(text);
      } catch {
        pushToast(t("importFailed"));
      }
    },
    [importAppDataFromText, pushToast, t]
  );

  const copyNostrKeys = async () => {
    if (!currentNsec) return;
    await navigator.clipboard?.writeText(currentNsec);
    pushToast(t("nostrKeysCopied"));
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
        const { nip19, getPublicKey } = await import("nostr-tools");
        const { unwrapEvent } = await import("nostr-tools/nip17");

        const decodedMe = nip19.decode(currentNsec);
        if (decodedMe.type !== "nsec") return;
        const privBytes = decodedMe.data as Uint8Array;
        const myPubHex = getPublicKey(privBytes);

        const decodedContact = nip19.decode(contactNpub);
        if (decodedContact.type !== "npub") return;
        const contactPubHex = decodedContact.data as string;

        const pool = await getSharedAppNostrPool();

        const processWrap = (wrap: NostrToolsEvent) => {
          try {
            const wrapId = String(wrap?.id ?? "");
            if (!wrapId) return;
            if (existingWrapIds.has(wrapId)) return;
            existingWrapIds.add(wrapId);

            const inner = unwrapEvent(wrap, privBytes) as NostrToolsEvent;
            if (!inner || inner.kind !== 14) return;

            const innerPub = String(inner.pubkey ?? "");
            const tags = Array.isArray(inner.tags) ? inner.tags : [];
            const content = String(inner.content ?? "").trim();

            const createdAtSecRaw = Number(inner.created_at ?? 0);
            const createdAtSec =
              Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
                ? Math.trunc(createdAtSecRaw)
                : Math.ceil(Date.now() / 1e3);

            const isIncoming = innerPub === contactPubHex;
            const isOutgoing = innerPub === myPubHex;
            if (!isIncoming && !isOutgoing) return;

            if (!content) return;

            // Ensure outgoing messages are for this contact.
            const pTags = tags
              .filter((t) => Array.isArray(t) && t[0] === "p")
              .map((t) => String(t[1] ?? "").trim());
            const mentionsContact = pTags.includes(contactPubHex);
            if (isOutgoing && !mentionsContact) return;

            if (cancelled) return;

            appendLocalNostrMessage({
              contactId: String(selectedContact.id),
              direction: isIncoming ? "in" : "out",
              content,
              wrapId,
              rumorId: inner.id ? String(inner.id) : null,
              pubkey: innerPub,
              createdAtSec,
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
          for (const e of Array.isArray(existing)
            ? (existing as NostrToolsEvent[])
            : [])
            processWrap(e);
        }

        const sub = pool.subscribe(
          NOSTR_RELAYS,
          { kinds: [1059], "#p": [myPubHex] },
          {
            onevent: (e: NostrToolsEvent) => {
              if (cancelled) return;
              processWrap(e);
            },
          }
        );

        return () => {
          void sub.close("chat closed");
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
    appendLocalNostrMessage,
    currentNsec,
    route.kind,
    selectedContact,
    chatMessages,
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
      const { nip19, getPublicKey } = await import("nostr-tools");
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
        pubkey: myPubHex,
        tags: [
          ["p", contactPubHex],
          ["p", myPubHex],
        ],
        content: text,
      } satisfies UnsignedEvent;

      const wrapForMe = wrapEvent(
        baseEvent,
        privBytes,
        myPubHex
      ) as NostrToolsEvent;
      const wrapForContact = wrapEvent(
        baseEvent,
        privBytes,
        contactPubHex
      ) as NostrToolsEvent;

      chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));

      const pool = await getSharedAppNostrPool();
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

      appendLocalNostrMessage({
        contactId: String(selectedContact.id),
        direction: "out",
        content: text,
        wrapId: String(wrapForMe.id ?? ""),
        rumorId: null,
        pubkey: myPubHex,
        createdAtSec: baseEvent.created_at,
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

    if (route.kind === "advanced") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToSettings,
      };
    }

    if (route.kind === "paymentsHistory") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToAdvanced,
      };
    }

    if (route.kind === "mints") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToAdvanced,
      };
    }

    if (route.kind === "mint") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToMints,
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

    if (route.kind === "topup") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToWallet,
      };
    }

    if (route.kind === "topupInvoice") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToTopup,
      };
    }

    if (route.kind === "cashuTokenNew" || route.kind === "cashuToken") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToWallet,
      };
    }

    if (route.kind === "lnAddressPay") {
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
        onClick: navigateToAdvanced,
      };
    }

    if (route.kind === "evoluServers") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToAdvanced,
      };
    }

    if (route.kind === "nostrRelay") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToNostrRelays,
      };
    }

    if (route.kind === "evoluServer") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToEvoluServers,
      };
    }

    if (route.kind === "evoluServerNew") {
      return {
        icon: "<",
        label: t("close"),
        onClick: navigateToEvoluServers,
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

    if (route.kind === "evoluServers") {
      return {
        icon: "+",
        label: t("evoluAddServerLabel"),
        onClick: navigateToNewEvoluServer,
      };
    }

    if (route.kind === "wallet") {
      return {
        icon: "+",
        label: t("cashuAddToken"),
        onClick: navigateToCashuTokenNew,
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
            profileEditInitialRef.current = null;
            return;
          }

          const bestName = myProfileMetadata
            ? getBestNostrName(myProfileMetadata)
            : null;
          const initialName = bestName ?? effectiveProfileName ?? "";
          const initialLn = effectiveMyLightningAddress ?? "";

          const metaPic = String(
            myProfileMetadata?.picture ??
              myProfileMetadata?.image ??
              effectiveProfilePicture ??
              ""
          ).trim();

          setProfileEditName(initialName);
          setProfileEditLnAddress(initialLn);
          setProfileEditPicture(metaPic);

          profileEditInitialRef.current = {
            name: initialName,
            lnAddress: initialLn,
            picture: metaPic,
          };

          setIsProfileEditing(true);
        },
      };
    }

    return null;
  })();

  const topbarTitle = (() => {
    if (route.kind === "contacts") return t("contactsTitle");
    if (route.kind === "wallet") return t("wallet");
    if (route.kind === "topup") return t("topupTitle");
    if (route.kind === "topupInvoice") return t("topupInvoiceTitle");
    if (route.kind === "lnAddressPay") return t("pay");
    if (route.kind === "cashuTokenNew") return t("cashuToken");
    if (route.kind === "cashuToken") return t("cashuToken");
    if (route.kind === "settings") return t("menu");
    if (route.kind === "advanced") return t("advanced");
    if (route.kind === "paymentsHistory") return t("paymentsHistory");
    if (route.kind === "mints") return t("mints");
    if (route.kind === "mint") return t("mints");
    if (route.kind === "profile") return t("profile");
    if (route.kind === "nostrRelays") return t("nostrRelay");
    if (route.kind === "nostrRelay") return t("nostrRelay");
    if (route.kind === "nostrRelayNew") return t("nostrRelay");
    if (route.kind === "evoluServers") return t("evoluServer");
    if (route.kind === "evoluServer") return t("evoluServer");
    if (route.kind === "evoluServerNew") return t("evoluAddServerLabel");
    if (route.kind === "contactNew") return t("newContact");
    if (route.kind === "contact") return t("contact");
    if (route.kind === "contactEdit") return t("contactEditTitle");
    if (route.kind === "contactPay") return t("contactPayTitle");
    if (route.kind === "chat") return t("messagesTitle");
    return null;
  })();

  const canSaveNewRelay = Boolean(String(newRelayUrl ?? "").trim());

  const profileEditsDirty = (() => {
    if (!isProfileEditing) return false;
    if (!profileEditInitialRef.current) return false;
    const initial = profileEditInitialRef.current;
    const name = profileEditName.trim();
    const ln = profileEditLnAddress.trim();
    const pic = profileEditPicture.trim();
    return (
      name !== initial.name.trim() ||
      ln !== initial.lnAddress.trim() ||
      pic !== initial.picture.trim()
    );
  })();

  const profileEditsSavable =
    profileEditsDirty && Boolean(currentNpub && currentNsec);

  const contactEditsSavable = (() => {
    if (!editingId) return false;
    if (route.kind !== "contactEdit") return false;
    const initial = contactEditInitialRef.current;
    if (!initial || initial.id !== editingId) return false;

    const name = form.name.trim();
    const npub = form.npub.trim();
    const lnAddress = form.lnAddress.trim();
    const group = form.group.trim();

    const hasRequired = Boolean(name || npub || lnAddress);
    if (!hasRequired) return false;

    const dirty =
      name !== initial.name.trim() ||
      npub !== initial.npub.trim() ||
      lnAddress !== initial.lnAddress.trim() ||
      group !== initial.group.trim();

    return dirty;
  })();

  const saveProfileEdits = async () => {
    try {
      if (!currentNpub || !currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      const name = profileEditName.trim();
      const ln = profileEditLnAddress.trim();
      const picture = profileEditPicture.trim();

      const { nip19 } = await import("nostr-tools");

      const decoded = nip19.decode(currentNsec);
      if (decoded.type !== "nsec") throw new Error("Invalid nsec");
      const privBytes = decoded.data as Uint8Array;

      const cachedPrev =
        loadCachedProfileMetadata(currentNpub)?.metadata ?? null;
      const livePrev = await Promise.race([
        fetchNostrProfileMetadata(currentNpub, {
          relays: nostrFetchRelays,
        }).catch(() => null),
        new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), 2000)
        ),
      ]);

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
      } else {
        delete contentObj.name;
        delete contentObj.display_name;
      }

      if (ln) contentObj.lud16 = ln;
      else {
        delete contentObj.lud16;
        delete contentObj.lud06;
      }

      if (picture) {
        contentObj.picture = picture;
        contentObj.image = picture;
      } else {
        delete contentObj.picture;
        delete contentObj.image;
      }

      const relaysToUse =
        nostrFetchRelays.length > 0 ? nostrFetchRelays : NOSTR_RELAYS;

      const publish = await publishKind0ProfileMetadata({
        privBytes,
        relays: relaysToUse,
        content: contentObj,
      });
      if (!publish.anySuccess) throw new Error("publish failed");

      const updatedMeta: NostrProfileMetadata = { ...prev };
      if (name) {
        updatedMeta.name = name;
        updatedMeta.displayName = name;
      } else {
        delete updatedMeta.name;
        delete updatedMeta.displayName;
      }

      if (ln) {
        updatedMeta.lud16 = ln;
      } else {
        delete updatedMeta.lud16;
        delete updatedMeta.lud06;
      }

      if (picture) {
        updatedMeta.picture = picture;
        updatedMeta.image = picture;
      } else {
        delete updatedMeta.picture;
        delete updatedMeta.image;
      }

      saveCachedProfileMetadata(currentNpub, updatedMeta);
      saveCachedProfilePicture(currentNpub, picture || null);
      setMyProfileMetadata(updatedMeta);

      setMyProfileName(name || null);
      setMyProfileLnAddress(ln || null);
      setMyProfilePicture(picture || null);
      if (!picture) {
        void deleteCachedProfileAvatar(currentNpub);
      }
      setIsProfileEditing(false);
      profileEditInitialRef.current = null;
    } catch (e) {
      setStatus(`${t("errorPrefix")}: ${String(e ?? "unknown")}`);
    }
  };

  const createSquareAvatarDataUrl = React.useCallback(
    async (file: File, sizePx: number): Promise<string> => {
      if (!file.type.startsWith("image/")) {
        throw new Error("Unsupported file");
      }

      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("Image load failed"));
          el.src = objectUrl;
        });

        const sw = img.naturalWidth || img.width;
        const sh = img.naturalHeight || img.height;
        if (!sw || !sh) throw new Error("Invalid image");

        const side = Math.min(sw, sh);
        const sx = Math.floor((sw - side) / 2);
        const sy = Math.floor((sh - side) / 2);

        const canvas = document.createElement("canvas");
        canvas.width = sizePx;
        canvas.height = sizePx;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not available");

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, side, side, 0, 0, sizePx, sizePx);

        return canvas.toDataURL("image/jpeg", 0.85);
      } finally {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    },
    []
  );

  const onPickProfilePhoto = React.useCallback(async () => {
    profilePhotoInputRef.current?.click();
  }, []);

  const onProfilePhotoSelected = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      e.target.value = "";
      if (!file) return;
      try {
        const dataUrl = await createSquareAvatarDataUrl(file, 160);
        setProfileEditPicture(dataUrl);
      } catch (err) {
        setStatus(`${t("errorPrefix")}: ${String(err ?? "unknown")}`);
      }
    },
    [createSquareAvatarDataUrl, setStatus, t]
  );

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

  const getMintIconUrl = React.useCallback(
    (
      mint: unknown
    ): { origin: string | null; url: string | null; host: string | null } => {
      const { origin, host } = getMintOriginAndHost(mint);
      if (!origin) return { origin: null, url: null, host };

      if (Object.prototype.hasOwnProperty.call(mintIconUrlByMint, origin)) {
        const stored = mintIconUrlByMint[origin];
        return { origin, url: stored ?? null, host };
      }

      return { origin, url: `${origin}/favicon.ico`, host };
    },
    [getMintOriginAndHost, mintIconUrlByMint]
  );

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

  const chatTopbarContact =
    route.kind === "chat" && selectedContact ? selectedContact : null;

  const formatChatDayLabel = (ms: number): string => {
    const d = new Date(ms);
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const startOfThatDay = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate()
    ).getTime();

    const diffDays = Math.round((startOfToday - startOfThatDay) / 86_400_000);
    if (diffDays === 0) return lang === "cs" ? "Dnes" : "Today";
    if (diffDays === 1) return lang === "cs" ? "Včera" : "Yesterday";

    const locale = lang === "cs" ? "cs-CZ" : "en-US";
    const weekday = new Intl.DateTimeFormat(locale, {
      weekday: "short",
    }).format(d);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    // Match desired style like "Pá 2. 1." (cs) / "Fri 1/2" (en-ish).
    if (lang === "cs") return `${weekday} ${day}. ${month}.`;
    return `${weekday} ${month}/${day}`;
  };

  const extractCashuTokenFromText = React.useCallback(
    (text: string): string | null => {
      const raw0 = String(text ?? "").trim();
      if (!raw0) return null;

      const normalizeCandidate = (value: string): string =>
        value.replace(/^cashu/i, "cashu");

      const tryToken = (value: string): string | null => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) return null;
        const normalized = normalizeCandidate(trimmed);
        return parseCashuToken(normalized) ? normalized : null;
      };

      const tokenRegex = /cashu[0-9A-Za-z_-]+={0,2}/gi;

      const tryInText = (value: string): string | null => {
        const raw = String(value ?? "").trim();
        if (!raw) return null;

        const stripped = raw
          .replace(/^web\+cashu:/i, "")
          .replace(/^cashu:/i, "")
          .replace(/^nostr:/i, "")
          .replace(/^lightning:/i, "")
          .trim();

        const direct = tryToken(stripped);
        if (direct) return direct;

        for (const m of stripped.matchAll(tokenRegex)) {
          const candidate = tryToken(String(m[0] ?? ""));
          if (candidate) return candidate;
        }

        const compact = stripped.replace(/\s+/g, "");
        if (compact && compact !== stripped) {
          const compactDirect = tryToken(compact);
          if (compactDirect) return compactDirect;
          for (const m of compact.matchAll(tokenRegex)) {
            const candidate = tryToken(String(m[0] ?? ""));
            if (candidate) return candidate;
          }
        }

        // URL formats: try common query params and fragments.
        if (/^https?:\/\//i.test(stripped)) {
          try {
            const u = new URL(stripped);
            const keys = ["token", "cashu", "cashutoken", "cashu_token", "t"];
            for (const key of keys) {
              const v = u.searchParams.get(key);
              if (v) {
                const decoded = (() => {
                  try {
                    return decodeURIComponent(v);
                  } catch {
                    return v;
                  }
                })();
                const found = tryInText(decoded);
                if (found) return found;
              }
            }

            const hash = String(u.hash ?? "").replace(/^#/, "");
            if (hash) {
              const decodedHash = (() => {
                try {
                  return decodeURIComponent(hash);
                } catch {
                  return hash;
                }
              })();
              const found = tryInText(decodedHash);
              if (found) return found;
            }
          } catch {
            // ignore
          }
        }

        // JSON wrapper formats (e.g. {"token":"cashuA..."}).
        const tokenField = stripped.match(/"token"\s*:\s*"([^"]+)"/i);
        if (tokenField?.[1]) {
          const decoded = (() => {
            try {
              return decodeURIComponent(tokenField[1]);
            } catch {
              return tokenField[1];
            }
          })();
          const found = tryInText(decoded);
          if (found) return found;
        }

        // Last resort: parse JSON object directly if supported by parseCashuToken.
        const firstBrace = stripped.indexOf("{");
        const lastBrace = stripped.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          const candidate = stripped.slice(firstBrace, lastBrace + 1).trim();
          const maybe = tryToken(candidate);
          if (maybe) return maybe;
        }

        return null;
      };

      const foundRaw = tryInText(raw0);
      if (foundRaw) return foundRaw;

      // Some QR generators percent-encode the full payload.
      if (/%[0-9A-Fa-f]{2}/.test(raw0)) {
        try {
          const decoded = decodeURIComponent(raw0);
          const foundDecoded = tryInText(decoded);
          if (foundDecoded) return foundDecoded;
        } catch {
          // ignore
        }
      }

      return null;
    },
    []
  );

  const getCashuTokenMessageInfo = React.useCallback(
    (
      text: string
    ): {
      tokenRaw: string;
      mintDisplay: string | null;
      mintUrl: string | null;
      amount: number | null;
      isValid: boolean;
    } | null => {
      const tokenRaw = extractCashuTokenFromText(text);
      if (!tokenRaw) return null;
      const parsed = parseCashuToken(tokenRaw);
      if (!parsed) return null;

      const mintDisplay = (() => {
        const mintText = String(parsed.mint ?? "").trim();
        if (!mintText) return null;
        try {
          return new URL(mintText).host;
        } catch {
          return mintText;
        }
      })();

      const known = cashuTokensAll.some((row) => {
        const r = row as unknown as {
          rawToken?: unknown;
          token?: unknown;
          isDeleted?: unknown;
        };
        if (r.isDeleted) return false;
        const stored = String(r.rawToken ?? r.token ?? "").trim();
        return stored && stored === tokenRaw;
      });

      return {
        tokenRaw,
        mintDisplay,
        mintUrl: parsed.mint ? String(parsed.mint) : null,
        amount: Number.isFinite(parsed.amount) ? parsed.amount : null,
        // Best-effort: "valid" means not yet imported into wallet.
        isValid: !known,
      };
    },
    [cashuTokensAll, extractCashuTokenFromText]
  );

  React.useEffect(() => {
    // Best-effort: keep syncing NIP-17 inbox when not inside a chat so we can
    // show PWA notifications for new messages / incoming Cashu tokens.
    if (!currentNsec) return;

    const activeChatId = route.kind === "chat" ? String(route.id ?? "") : null;

    let cancelled = false;

    const seenWrapIds = new Set<string>();
    for (const m of nostrMessagesRecent) {
      const wrapId = String(
        (m as unknown as { wrapId?: unknown } | null)?.wrapId ?? ""
      ).trim();
      if (wrapId) seenWrapIds.add(wrapId);
    }

    const run = async () => {
      try {
        const { nip19, getPublicKey } = await import("nostr-tools");
        const { unwrapEvent } = await import("nostr-tools/nip17");

        const decodedMe = nip19.decode(currentNsec);
        if (decodedMe.type !== "nsec") return;
        const privBytes = decodedMe.data as Uint8Array;
        const myPubHex = getPublicKey(privBytes);

        // Map known contact pubkeys -> contact info.
        const contactByPubHex = new Map<
          string,
          { id: ContactId; name: string | null }
        >();
        for (const c of contacts) {
          const npub = String(c.npub ?? "").trim();
          if (!npub) continue;
          try {
            const d = nip19.decode(npub);
            if (d.type !== "npub") continue;
            const pub = String(d.data ?? "").trim();
            if (!pub) continue;
            const name = String(c.name ?? "").trim() || null;
            contactByPubHex.set(pub, { id: c.id as ContactId, name });
          } catch {
            // ignore
          }
        }

        const pool = await getSharedAppNostrPool();

        const processWrap = (wrap: NostrToolsEvent) => {
          try {
            const wrapId = String(wrap?.id ?? "");
            if (!wrapId) return;
            if (seenWrapIds.has(wrapId)) return;
            seenWrapIds.add(wrapId);

            const inner = unwrapEvent(wrap, privBytes) as NostrToolsEvent;
            if (!inner || inner.kind !== 14) return;

            const senderPub = String(inner.pubkey ?? "");
            const content = String(inner.content ?? "").trim();
            if (!senderPub) return;

            const createdAtSecRaw = Number(inner.created_at ?? 0);
            const createdAtSec =
              Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
                ? Math.trunc(createdAtSecRaw)
                : Math.ceil(Date.now() / 1e3);

            const pTags = Array.isArray(inner.tags)
              ? inner.tags
                  .filter((t) => Array.isArray(t) && t[0] === "p")
                  .map((t) => String(t[1] ?? "").trim())
                  .filter(Boolean)
              : [];

            // Only accept messages addressed to us.
            if (!pTags.includes(myPubHex) && senderPub !== myPubHex) return;

            const isOutgoing = senderPub === myPubHex;
            const otherPub = isOutgoing
              ? pTags.find((p) => p && p !== myPubHex) ?? ""
              : senderPub;
            if (!otherPub) return;

            const contact = contactByPubHex.get(otherPub);
            if (!contact) return;

            const isActiveChatContact =
              Boolean(activeChatId) &&
              String(contact.id ?? "") === String(activeChatId);

            if (!content) return;

            if (cancelled) return;

            if (!isOutgoing) {
              if (!isActiveChatContact) {
                setContactAttentionById((prev) => ({
                  ...prev,
                  [String(contact.id)]: Date.now(),
                }));
              }

              const title = contact.name ?? t("appTitle");
              void maybeShowPwaNotification(title, content, `msg_${otherPub}`);

              const tokenInfo = getCashuTokenMessageInfo(content);
              if (tokenInfo?.isValid) {
                const body = tokenInfo.amount
                  ? `${tokenInfo.amount} sat`
                  : t("cashuAccepted");
                void maybeShowPwaNotification(
                  t("mints"),
                  body,
                  `cashu_${otherPub}`
                );
              }
            }

            // Avoid duplicate inserts while the active chat subscription is
            // handling messages for that contact.
            if (isActiveChatContact) return;

            appendLocalNostrMessage({
              contactId: String(contact.id),
              direction: isOutgoing ? "out" : "in",
              content,
              wrapId,
              rumorId: inner.id ? String(inner.id) : null,
              pubkey: senderPub,
              createdAtSec,
            });
          } catch {
            // ignore individual events
          }
        };

        const relays = nostrFetchRelays.length
          ? nostrFetchRelays
          : NOSTR_RELAYS;

        const existing = await pool.querySync(
          relays,
          { kinds: [1059], "#p": [myPubHex], limit: 50 },
          { maxWait: 5000 }
        );

        if (!cancelled) {
          for (const e of Array.isArray(existing)
            ? (existing as NostrToolsEvent[])
            : [])
            processWrap(e);
        }

        const sub = pool.subscribe(
          relays,
          { kinds: [1059], "#p": [myPubHex] },
          {
            onevent: (e: NostrToolsEvent) => {
              if (cancelled) return;
              processWrap(e);
            },
          }
        );

        return () => {
          void sub.close("inbox sync closed");
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
    contacts,
    currentNsec,
    getCashuTokenMessageInfo,
    insert,
    maybeShowPwaNotification,
    nostrFetchRelays,
    nostrMessagesRecent,
    route,
    t,
  ]);

  const closeScan = React.useCallback(() => {
    // Invalidate any in-flight getUserMedia request.
    scanOpenRequestIdRef.current += 1;

    setScanIsOpen(false);

    const video = scanVideoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
      try {
        (video as unknown as { srcObject: MediaStream | null }).srcObject =
          null;
      } catch {
        // ignore
      }
    }

    setScanStream((prev) => {
      if (prev) {
        for (const track of prev.getTracks()) {
          try {
            track.stop();
          } catch {
            // ignore
          }
        }
      }
      return null;
    });
  }, []);

  const openScan = React.useCallback(() => {
    setScanIsOpen(true);

    // Make this call cancelable: if the user closes the scan dialog before
    // getUserMedia resolves, immediately stop the acquired stream.
    const requestId = (scanOpenRequestIdRef.current += 1);

    const media = navigator.mediaDevices as
      | { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> }
      | undefined;
    if (!media?.getUserMedia) {
      pushToast(t("scanCameraError"));
      closeScan();
      return;
    }

    // Many browsers (esp. mobile/Brave) require a secure context for camera.
    // When running over http (e.g. LAN IP), the error often looks like
    // NotAllowedError / permission denied.
    if (typeof globalThis.isSecureContext === "boolean" && !isSecureContext) {
      pushToast(t("scanRequiresHttps"));
      closeScan();
      return;
    }

    // On iOS/WebKit (incl. Brave), requesting camera access must happen in the
    // click handler (user gesture). Doing it inside useEffect can prevent retry
    // after denying permission.
    void (async () => {
      try {
        const acceptStream = (stream: MediaStream) => {
          if (
            requestId !== scanOpenRequestIdRef.current ||
            !scanIsOpenRef.current
          ) {
            for (const track of stream.getTracks()) {
              try {
                track.stop();
              } catch {
                // ignore
              }
            }
            return false;
          }

          setScanStream(stream);
          return true;
        };

        const tryGet = async (constraints: MediaStreamConstraints) => {
          const stream = await media.getUserMedia!(constraints);
          return acceptStream(stream);
        };

        // Prefer back camera but keep it as an *ideal* constraint to avoid
        // breaking on browsers/devices that don't support it.
        const ok = await tryGet({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        }).catch(() => false);

        if (!ok) {
          await tryGet({ video: true, audio: false });
        }
      } catch (e) {
        const err = e as unknown as { name?: unknown; message?: unknown };
        const name = String(err?.name ?? "").trim();
        const message = String(err?.message ?? e ?? "").trim();

        let permissionState: string | null = null;
        try {
          const permissions = (
            navigator as unknown as {
              permissions?: {
                query?: (desc: unknown) => Promise<{ state?: unknown }>;
              };
            }
          ).permissions;
          const res = await permissions?.query?.({ name: "camera" });
          permissionState = String(res?.state ?? "").trim() || null;
        } catch {
          // ignore
        }

        console.log("[linky][scan] getUserMedia failed", {
          name,
          message,
          permissionState,
          href: globalThis.location?.href ?? null,
          isSecureContext:
            typeof globalThis.isSecureContext === "boolean"
              ? globalThis.isSecureContext
              : null,
        });

        const isPermissionDenied =
          name === "NotAllowedError" ||
          /permission/i.test(message) ||
          /denied/i.test(message);

        if (isPermissionDenied) pushToast(t("scanPermissionDenied"));
        else pushToast(t("scanCameraError"));
        closeScan();
      }
    })();
  }, [closeScan, pushToast, t]);

  const handleScannedText = React.useCallback(
    async (rawValue: string) => {
      const raw = String(rawValue ?? "").trim();
      if (!raw) return;

      const normalized = raw
        .replace(/^nostr:/i, "")
        .replace(/^lightning:/i, "")
        .replace(/^cashu:/i, "")
        .trim();

      const cashu =
        extractCashuTokenFromText(normalized) ?? extractCashuTokenFromText(raw);
      if (cashu) {
        closeScan();
        await saveCashuFromText(cashu, { navigateToWallet: true });
        return;
      }

      try {
        const { nip19 } = await import("nostr-tools");
        const decoded = nip19.decode(normalized);
        if (decoded.type === "npub") {
          const already = contacts.some(
            (c) => String(c.npub ?? "").trim() === normalized
          );
          if (already) {
            setStatus(t("contactExists"));
            const existing = contacts.find(
              (c) => String(c.npub ?? "").trim() === normalized
            );
            closeScan();
            if (existing?.id) {
              navigateToContact(existing.id);
              void refreshContactFromNostr(existing.id, normalized);
            }
            return;
          }

          const result = appOwnerId
            ? insert(
                "contact",
                {
                  name: null,
                  npub: normalized as typeof Evolu.NonEmptyString1000.Type,
                  lnAddress: null,
                  groupName: null,
                },
                { ownerId: appOwnerId }
              )
            : insert("contact", {
                name: null,
                npub: normalized as typeof Evolu.NonEmptyString1000.Type,
                lnAddress: null,
                groupName: null,
              });

          if (result.ok) {
            setStatus(t("contactSaved"));
            openScannedContactPendingNpubRef.current = normalized;
          } else setStatus(`${t("errorPrefix")}: ${String(result.error)}`);

          closeScan();
          return;
        }
      } catch {
        // ignore
      }

      const maybeLnAddress = String(normalized ?? "").trim();
      const isLnAddress = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(maybeLnAddress);
      if (isLnAddress) {
        const needle = maybeLnAddress.toLowerCase();
        const existing = contacts.find(
          (c) =>
            String(c.lnAddress ?? "")
              .trim()
              .toLowerCase() === needle
        );

        closeScan();
        if (existing?.id) {
          navigateToContactPay(existing.id);
          return;
        }

        // New address: open pay screen and offer to save contact after success.
        navigateToLnAddressPay(maybeLnAddress);
        return;
      }

      if (/^(lnbc|lntb|lnbcrt)/i.test(normalized)) {
        closeScan();
        await payLightningInvoiceWithCashu(normalized);
        return;
      }

      setStatus(`${t("errorPrefix")}: ${t("scanUnsupported")}`);
      closeScan();
    },
    [
      appOwnerId,
      closeScan,
      contacts,
      extractCashuTokenFromText,
      insert,
      payLightningInvoiceWithCashu,
      refreshContactFromNostr,
      saveCashuFromText,
      t,
    ]
  );

  // Keep a stable ref so the scan loop effect doesn't restart and stop the
  // camera whenever dependent state (e.g. contacts) changes.
  const handleScannedTextRef = React.useRef(handleScannedText);
  React.useEffect(() => {
    handleScannedTextRef.current = handleScannedText;
  }, [handleScannedText]);

  React.useEffect(() => {
    if (!scanIsOpen) return;
    if (!scanStream) return;

    let cancelled = false;
    let stream: MediaStream | null = scanStream;
    let rafId: number | null = null;
    let lastScanAt = 0;
    let handled = false;

    const stop = () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      rafId = null;

      const video = scanVideoRef.current;
      if (video) {
        try {
          video.pause();
        } catch {
          // ignore
        }
        try {
          (video as unknown as { srcObject: MediaStream | null }).srcObject =
            null;
        } catch {
          // ignore
        }
      }

      if (stream) {
        for (const track of stream.getTracks()) {
          try {
            track.stop();
          } catch {
            // ignore
          }
        }
      }
      stream = null;
    };

    const run = async () => {
      if (cancelled) {
        stop();
        return;
      }

      const video = scanVideoRef.current;
      if (!video) {
        stop();
        return;
      }

      try {
        video.srcObject = stream;
      } catch {
        // ignore
      }

      try {
        video.setAttribute("playsinline", "true");
        video.muted = true;
      } catch {
        // ignore
      }

      try {
        await video.play();
      } catch {
        // ignore
      }

      type BarcodeDetectorInstance = {
        detect: (
          image: HTMLVideoElement
        ) => Promise<Array<{ rawValue?: unknown }>>;
      };
      type BarcodeDetectorConstructor = new (options: {
        formats: string[];
      }) => BarcodeDetectorInstance;

      const detectorCtor = (
        window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector;

      const detector = detectorCtor
        ? new detectorCtor({ formats: ["qr_code"] })
        : null;

      const jsQr = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (cancelled) return;
        if (!video || video.readyState < 2) {
          rafId = window.requestAnimationFrame(() => void tick());
          return;
        }

        const now = Date.now();
        if (now - lastScanAt < 200) {
          rafId = window.requestAnimationFrame(() => void tick());
          return;
        }
        lastScanAt = now;

        try {
          if (handled) return;

          if (detector) {
            const codes = await detector.detect(video);
            const value = String(codes?.[0]?.rawValue ?? "").trim();
            if (value) {
              handled = true;
              stop();
              await handleScannedTextRef.current(value);
              return;
            }
          } else if (jsQr && ctx) {
            const w = video.videoWidth || 0;
            const h = video.videoHeight || 0;
            if (w > 0 && h > 0) {
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              const imageData = ctx.getImageData(0, 0, w, h);
              const result = jsQr(imageData.data, w, h);
              const value = String(result?.data ?? "").trim();
              if (value) {
                handled = true;
                stop();
                await handleScannedTextRef.current(value);
                return;
              }
            }
          }
        } catch {
          // ignore and continue scanning
        }

        rafId = window.requestAnimationFrame(() => void tick());
      };

      rafId = window.requestAnimationFrame(() => void tick());
    };

    void run();
    return () => {
      cancelled = true;
      stop();
    };
  }, [scanIsOpen, scanStream]);

  React.useEffect(() => {
    // Auto-accept Cashu tokens received from others into the wallet.
    if (route.kind !== "chat") return;
    if (cashuIsBusy) return;

    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const m = chatMessages[i];
      const id = String((m as unknown as { id?: unknown } | null)?.id ?? "");
      if (!id) continue;
      if (autoAcceptedChatMessageIdsRef.current.has(id)) continue;

      const isOut =
        String(
          (m as unknown as { direction?: unknown } | null)?.direction ?? ""
        ) === "out";
      if (isOut) continue;

      const content = String(
        (m as unknown as { content?: unknown } | null)?.content ?? ""
      );
      const info = getCashuTokenMessageInfo(content);
      if (!info) continue;

      // Mark it as processed so we don't keep retrying every render.
      autoAcceptedChatMessageIdsRef.current.add(id);

      // Only accept if it's not already in our wallet.
      if (!info.isValid) continue;

      void saveCashuFromText(info.tokenRaw);
      break;
    }
  }, [
    cashuIsBusy,
    chatMessages,
    getCashuTokenMessageInfo,
    route.kind,
    saveCashuFromText,
  ]);

  React.useEffect(() => {
    // Auto-accept Cashu tokens from incoming messages even when chat isn't open.
    if (cashuIsBusy) return;

    for (const m of nostrMessagesRecent) {
      const id = String((m as unknown as { id?: unknown } | null)?.id ?? "");
      if (!id) continue;
      if (autoAcceptedChatMessageIdsRef.current.has(id)) continue;

      const dir = String(
        (m as unknown as { direction?: unknown } | null)?.direction ?? ""
      );
      if (dir !== "in") continue;

      const content = String(
        (m as unknown as { content?: unknown } | null)?.content ?? ""
      );
      const info = getCashuTokenMessageInfo(content);
      if (!info) continue;

      autoAcceptedChatMessageIdsRef.current.add(id);
      if (!info.isValid) continue;

      void saveCashuFromText(info.tokenRaw);
      break;
    }
  }, [
    cashuIsBusy,
    getCashuTokenMessageInfo,
    nostrMessagesRecent,
    saveCashuFromText,
  ]);

  React.useEffect(() => {
    if (route.kind !== "chat") {
      chatDidInitialScrollForContactRef.current = null;
    }
  }, [route.kind]);

  React.useEffect(() => {
    // Scroll chat to newest message on open.
    if (route.kind !== "chat") return;
    if (!selectedContact) return;

    const contactId = String(selectedContact.id ?? "");
    if (!contactId) return;

    const container = chatMessagesRef.current;
    if (!container) return;

    const last = chatMessages.length
      ? chatMessages[chatMessages.length - 1]
      : null;

    const firstForThisContact =
      chatDidInitialScrollForContactRef.current !== contactId;

    if (firstForThisContact) {
      chatDidInitialScrollForContactRef.current = contactId;

      const target = last;
      const targetId = String(
        (target as unknown as { id?: unknown } | null)?.id ?? ""
      );

      const tryScroll = (attempt: number) => {
        const el = targetId ? chatMessageElByIdRef.current.get(targetId) : null;
        if (el) {
          el.scrollIntoView({ block: "end" });
          return;
        }
        if (attempt < 6) {
          requestAnimationFrame(() => tryScroll(attempt + 1));
          return;
        }
        const c = chatMessagesRef.current;
        if (c) c.scrollTop = c.scrollHeight;
      };

      requestAnimationFrame(() => {
        tryScroll(0);
      });
      return;
    }

    // Keep pinned to bottom if already near bottom.
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      requestAnimationFrame(() => {
        const c = chatMessagesRef.current;
        if (!c) return;
        c.scrollTop = c.scrollHeight;
      });
    }
  }, [route.kind, selectedContact, chatMessages]);

  return (
    <div className={showGroupFilter ? "page has-group-filter" : "page"}>
      {recentlyReceivedToken?.token ? (
        <div className="toast-container" aria-live="polite">
          <div
            className="toast"
            role="status"
            onClick={() => {
              const token = String(recentlyReceivedToken.token ?? "").trim();
              if (!token) return;
              void (async () => {
                try {
                  await navigator.clipboard?.writeText(token);
                  pushToast(t("copiedToClipboard"));
                  setRecentlyReceivedToken(null);
                } catch {
                  pushToast(t("copyFailed"));
                }
              })();
            }}
            style={{ cursor: "pointer" }}
            title={
              lang === "cs"
                ? "Klikni pro zkopírování tokenu"
                : "Click to copy token"
            }
          >
            {(() => {
              const amount =
                typeof recentlyReceivedToken.amount === "number"
                  ? recentlyReceivedToken.amount
                  : null;
              if (lang === "cs") {
                return amount
                  ? `Přijato ${formatInteger(
                      amount
                    )} ${displayUnit}. Klikni pro zkopírování tokenu.`
                  : "Token přijat. Klikni pro zkopírování tokenu.";
              }
              return amount
                ? `Received ${formatInteger(
                    amount
                  )} ${displayUnit}. Click to copy token.`
                : "Token accepted. Click to copy token.";
            })()}
          </div>
        </div>
      ) : null}

      {toasts.length ? (
        <div className="toast-container" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast">
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}

      {!currentNsec ? (
        <section className="panel panel-plain onboarding-panel">
          <div className="onboarding-logo" aria-hidden="true">
            <LinkyLogo className="onboarding-logo-svg" />
          </div>
          <h1 className="page-title">{t("onboardingTitle")}</h1>

          <p
            className="muted"
            style={{
              margin: "6px 0 12px",
              lineHeight: 1.4,
              textAlign: "center",
            }}
          >
            {t("onboardingSubtitle")}
          </p>

          {onboardingStep ? (
            <>
              <div className="settings-row">
                <div className="muted" style={{ lineHeight: 1.4 }}>
                  {(() => {
                    const format = (
                      template: string,
                      vars: Record<string, string>
                    ) =>
                      template.replace(/\{(\w+)\}/g, (_m, k: string) =>
                        String(vars[k] ?? "")
                      );

                    const name = onboardingStep.derivedName ?? "";
                    if (onboardingStep.step === 1)
                      return format(t("onboardingStep1"), { name });
                    if (onboardingStep.step === 2) return t("onboardingStep2");
                    return t("onboardingStep3");
                  })()}
                </div>
              </div>

              {onboardingStep.error ? (
                <div className="settings-row">
                  <div className="status" role="status">
                    {onboardingStep.error}
                  </div>
                </div>
              ) : null}

              <div className="settings-row">
                <button
                  type="button"
                  className="btn-wide secondary"
                  onClick={() => setOnboardingStep(null)}
                  disabled={onboardingIsBusy}
                >
                  {t("onboardingRetry")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="settings-row">
                <button
                  type="button"
                  className="btn-wide"
                  onClick={() => void createNewAccount()}
                  disabled={onboardingIsBusy}
                >
                  {t("onboardingCreate")}
                </button>
              </div>

              <div className="settings-row">
                <button
                  type="button"
                  className="btn-wide secondary"
                  onClick={() => void pasteExistingNsec()}
                  disabled={onboardingIsBusy}
                >
                  {t("onboardingPasteNsec")}
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {currentNsec ? (
        <>
          <header className="topbar">
            <button
              className="topbar-btn"
              onClick={topbar.onClick}
              aria-label={topbar.label}
              title={topbar.label}
              data-guide={route.kind === "contacts" ? "topbar-menu" : undefined}
            >
              <span aria-hidden="true">{topbar.icon}</span>
            </button>

            {chatTopbarContact ? (
              <div className="topbar-chat" aria-label={t("messagesTitle")}>
                <span className="topbar-chat-avatar" aria-hidden="true">
                  {(() => {
                    const npub = String(chatTopbarContact.npub ?? "").trim();
                    const url = npub ? nostrPictureByNpub[npub] : null;
                    return url ? (
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="topbar-chat-avatar-fallback">
                        {getInitials(String(chatTopbarContact.name ?? ""))}
                      </span>
                    );
                  })()}
                </span>
                <span className="topbar-chat-name">
                  {String(chatTopbarContact.name ?? "").trim() ||
                    t("messagesTitle")}
                </span>
              </div>
            ) : topbarTitle ? (
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
                data-guide={
                  route.kind === "contacts" ? "contacts-add" : undefined
                }
              >
                <span aria-hidden="true">{topbarRight.icon}</span>
              </button>
            ) : (
              <span className="topbar-spacer" aria-hidden="true" />
            )}
          </header>

          {contactsGuide && contactsGuideActiveStep?.step ? (
            <div className="guide-overlay" aria-live="polite">
              {contactsGuideHighlightRect ? (
                <div
                  className="guide-highlight"
                  aria-hidden="true"
                  style={{
                    top: contactsGuideHighlightRect.top,
                    left: contactsGuideHighlightRect.left,
                    width: contactsGuideHighlightRect.width,
                    height: contactsGuideHighlightRect.height,
                  }}
                />
              ) : null}

              <div className="guide-card" role="dialog" aria-modal="false">
                <div className="guide-step">
                  {contactsGuideActiveStep.idx + 1} /{" "}
                  {contactsGuideActiveStep.total}
                </div>
                <div className="guide-title">
                  {t(contactsGuideActiveStep.step.titleKey)}
                </div>
                <div className="guide-body">
                  {t(contactsGuideActiveStep.step.bodyKey)}
                </div>
                <div className="guide-actions">
                  <button
                    type="button"
                    className="guide-btn secondary"
                    onClick={stopContactsGuide}
                  >
                    {t("guideSkip")}
                  </button>
                  <button
                    type="button"
                    className="guide-btn secondary"
                    onClick={contactsGuideNav.back}
                    disabled={contactsGuideActiveStep.idx === 0}
                  >
                    {t("guideBack")}
                  </button>
                  <button
                    type="button"
                    className="guide-btn primary"
                    onClick={contactsGuideNav.next}
                  >
                    {contactsGuideActiveStep.idx + 1 >=
                    contactsGuideActiveStep.total
                      ? t("guideDone")
                      : t("guideNext")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

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

              <button
                type="button"
                className="settings-row settings-link"
                onClick={navigateToAdvanced}
                aria-label={t("advanced")}
                title={t("advanced")}
              >
                <div className="settings-left">
                  <span className="settings-icon" aria-hidden="true">
                    ⚙️
                  </span>
                  <span className="settings-label">{t("advanced")}</span>
                </div>
                <div className="settings-right">
                  <span className="settings-chevron" aria-hidden="true">
                    &gt;
                  </span>
                </div>
              </button>

              <button
                type="button"
                className="settings-row settings-link"
                onClick={openFeedbackContact}
                aria-label={t("feedback")}
                title={t("feedback")}
              >
                <div className="settings-left">
                  <span className="settings-icon" aria-hidden="true">
                    💬
                  </span>
                  <span className="settings-label">{t("feedback")}</span>
                </div>
                <div className="settings-right">
                  <span className="settings-chevron" aria-hidden="true">
                    &gt;
                  </span>
                </div>
              </button>

              <div className="settings-row">
                <button
                  className="btn-wide"
                  onClick={navigateToWallet}
                  data-guide="open-wallet"
                >
                  {t("walletOpen")}
                </button>
              </div>

              <div className="settings-row">
                <button
                  className="btn-wide secondary"
                  onClick={() => {
                    openScan();
                  }}
                  data-guide="scan-button"
                >
                  {t("scan")}
                </button>
              </div>
            </section>
          )}

          {route.kind === "advanced" && (
            <section className="panel">
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
                      onClick={copyNostrKeys}
                      disabled={!currentNsec}
                    >
                      {t("copyCurrent")}
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

              <button
                type="button"
                className="settings-row settings-link"
                onClick={navigateToEvoluServers}
                aria-label={t("evoluServer")}
                title={t("evoluServer")}
              >
                <div className="settings-left">
                  <span className="settings-icon" aria-hidden="true">
                    ☁
                  </span>
                  <span className="settings-label">{t("evoluServer")}</span>
                </div>
                <div className="settings-right">
                  <span className="relay-count" aria-label="evolu sync status">
                    {evoluConnectedServerCount}/{evoluServerUrls.length}
                  </span>
                  <span
                    className={
                      evoluOverallStatus === "connected"
                        ? "status-dot connected"
                        : evoluOverallStatus === "checking"
                        ? "status-dot checking"
                        : "status-dot disconnected"
                    }
                    aria-label={evoluOverallStatus}
                    title={evoluOverallStatus}
                    style={{ marginLeft: 10 }}
                  />
                  <span className="settings-chevron" aria-hidden="true">
                    &gt;
                  </span>
                </div>
              </button>

              <button
                type="button"
                className="settings-row settings-link"
                onClick={navigateToMints}
                aria-label={t("mints")}
                title={t("mints")}
              >
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
                  <span className="settings-chevron" aria-hidden="true">
                    &gt;
                  </span>
                </div>
              </button>

              <button
                type="button"
                className="settings-row settings-link"
                onClick={navigateToPaymentsHistory}
                aria-label={t("paymentsHistory")}
                title={t("paymentsHistory")}
              >
                <div className="settings-left">
                  <span className="settings-icon" aria-hidden="true">
                    🧾
                  </span>
                  <span className="settings-label">{t("paymentsHistory")}</span>
                </div>
                <div className="settings-right">
                  <span className="settings-chevron" aria-hidden="true">
                    &gt;
                  </span>
                </div>
              </button>

              <div className="settings-row">
                <div className="settings-left">
                  <span className="settings-icon" aria-hidden="true">
                    📦
                  </span>
                  <span className="settings-label">{t("data")}</span>
                </div>
                <div className="settings-right">
                  <div className="badge-box">
                    <button className="ghost" onClick={exportAppData}>
                      {t("exportData")}
                    </button>
                    <button className="ghost" onClick={requestImportAppData}>
                      {t("importData")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <button
                  type="button"
                  className="btn-wide secondary"
                  onClick={() => {
                    void dedupeContacts();
                  }}
                  disabled={dedupeContactsIsBusy}
                >
                  {t("dedupeContacts")}
                </button>
              </div>

              <input
                ref={importDataFileInputRef}
                type="file"
                accept=".txt,.json,application/json,text/plain"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.currentTarget.value = "";
                  void handleImportAppDataFilePicked(file);
                }}
              />

              <div className="settings-row">
                <button
                  type="button"
                  className={logoutArmed ? "btn-wide danger" : "btn-wide"}
                  onClick={requestLogout}
                >
                  {t("logout")}
                </button>
              </div>

              <div
                className="muted"
                style={{ marginTop: 14, textAlign: "center", fontSize: 12 }}
              >
                {t("appVersionLabel")}: v{__APP_VERSION__}
              </div>
            </section>
          )}

          {route.kind === "paymentsHistory" && (
            <section className="panel">
              {paymentEvents.length === 0 ? (
                <p className="muted">{t("paymentsHistoryEmpty")}</p>
              ) : (
                <div>
                  {paymentEvents.map((ev) => {
                    const createdAtSec =
                      Number(
                        (ev as unknown as { createdAtSec?: unknown })
                          .createdAtSec ?? 0
                      ) || 0;
                    const direction = String(
                      (ev as unknown as { direction?: unknown }).direction ?? ""
                    ).trim();
                    const status = String(
                      (ev as unknown as { status?: unknown }).status ?? ""
                    ).trim();
                    const amount =
                      Number(
                        (ev as unknown as { amount?: unknown }).amount ?? 0
                      ) || 0;
                    const fee =
                      Number((ev as unknown as { fee?: unknown }).fee ?? 0) ||
                      0;
                    const mintText = String(
                      (ev as unknown as { mint?: unknown }).mint ?? ""
                    ).trim();
                    const errorText = String(
                      (ev as unknown as { error?: unknown }).error ?? ""
                    ).trim();

                    const locale = lang === "cs" ? "cs-CZ" : "en-US";
                    const timeLabel = createdAtSec
                      ? new Intl.DateTimeFormat(locale, {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(createdAtSec * 1000))
                      : "";

                    const mintDisplay = (() => {
                      if (!mintText) return null;
                      try {
                        return new URL(mintText).host;
                      } catch {
                        return mintText;
                      }
                    })();

                    const isError = status === "error";
                    const directionLabel =
                      direction === "in"
                        ? t("paymentsHistoryIncoming")
                        : t("paymentsHistoryOutgoing");

                    return (
                      <div
                        key={
                          String(
                            (ev as unknown as { id?: unknown }).id ?? ""
                          ) || timeLabel
                        }
                      >
                        <div
                          className="settings-row"
                          style={{ alignItems: "flex-start" }}
                        >
                          <div
                            className="settings-left"
                            style={{ minWidth: 0 }}
                          >
                            <div style={{ fontWeight: 900, color: "#e2e8f0" }}>
                              {directionLabel}
                              {isError
                                ? ` · ${t("paymentsHistoryFailed")}`
                                : ""}
                            </div>
                            <div
                              className="muted"
                              style={{ marginTop: 2, lineHeight: 1.35 }}
                            >
                              {timeLabel}
                              {mintDisplay ? ` · ${mintDisplay}` : ""}
                            </div>
                            {isError && errorText ? (
                              <div
                                className="muted"
                                style={{ marginTop: 6, lineHeight: 1.35 }}
                              >
                                {errorText}
                              </div>
                            ) : null}
                          </div>

                          <div
                            className="settings-right"
                            style={{ textAlign: "right" }}
                          >
                            <div style={{ fontWeight: 900, color: "#e2e8f0" }}>
                              {amount > 0
                                ? `${formatInteger(amount)} ${displayUnit}`
                                : "—"}
                            </div>
                            <div className="muted" style={{ marginTop: 2 }}>
                              {fee > 0
                                ? `${t("paymentsHistoryFee")}: ${formatInteger(
                                    fee
                                  )} ${displayUnit}`
                                : ""}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {route.kind === "mints" && (
            <section className="panel">
              {mintInfoDeduped.length === 0 ? (
                <p className="muted">{t("mintsEmpty")}</p>
              ) : (
                <div>
                  {mintInfoDeduped.map(({ canonicalUrl }) => {
                    const url = String(canonicalUrl ?? "").trim();
                    if (!url) return null;

                    const isMain = normalizeMintUrl(url) === MAIN_MINT_URL;

                    return (
                      <button
                        key={url}
                        type="button"
                        className="settings-row settings-link"
                        onClick={() => navigateToMint(url)}
                        aria-label={url}
                        title={url}
                      >
                        <div className="settings-left">
                          <span className="settings-icon" aria-hidden="true">
                            {(() => {
                              const icon = getMintIconUrl(url);
                              if (!icon.url) return "🏦";
                              return (
                                <img
                                  src={icon.url}
                                  alt=""
                                  width={18}
                                  height={18}
                                  style={{
                                    borderRadius: 9999,
                                    objectFit: "cover",
                                  }}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (
                                      e.currentTarget as HTMLImageElement
                                    ).style.display = "none";
                                    if (icon.origin) {
                                      setMintIconUrlByMint((prev) => ({
                                        ...prev,
                                        [icon.origin as string]: null,
                                      }));
                                    }
                                  }}
                                />
                              );
                            })()}
                          </span>
                          <span className="settings-label">
                            {url}
                            {isMain ? (
                              <span
                                className="relay-count"
                                title="Main mint"
                                style={{ marginLeft: 8 }}
                              >
                                ★
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="settings-right">
                          <span className="settings-chevron" aria-hidden="true">
                            &gt;
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {route.kind === "mint" && (
            <section className="panel">
              {(() => {
                const cleaned = normalizeMintUrl(route.mintUrl);
                const row = mintInfoByUrl.get(cleaned) ?? null;
                if (!row) return <p className="muted">{t("mintNotFound")}</p>;

                const supportsMpp =
                  String(
                    (row as unknown as { supportsMpp?: unknown }).supportsMpp ??
                      ""
                  ) === "1";
                const feesJson = String(
                  (row as unknown as { feesJson?: unknown }).feesJson ?? ""
                ).trim();

                const runtime = getMintRuntime(cleaned);
                const lastCheckedAtSec = runtime?.lastCheckedAtSec ?? 0;
                const latencyMs = runtime?.latencyMs ?? null;

                const ppk = (() => {
                  if (!feesJson) return null;
                  try {
                    const parsed = JSON.parse(feesJson) as unknown;
                    const found = extractPpk(parsed);
                    if (typeof found === "number" && Number.isFinite(found)) {
                      return found;
                    }
                    return null;
                  } catch {
                    return null;
                  }
                })();

                return (
                  <div>
                    <div className="settings-row">
                      <div className="settings-left">
                        <span className="settings-icon" aria-hidden="true">
                          🔗
                        </span>
                        <span className="settings-label">{t("mintUrl")}</span>
                      </div>
                      <div className="settings-right">
                        <span className="relay-url">{cleaned}</span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-left">
                        <span className="settings-icon" aria-hidden="true">
                          🧩
                        </span>
                        <span className="settings-label">{t("mintMpp")}</span>
                      </div>
                      <div className="settings-right">
                        <span className={supportsMpp ? "relay-count" : "muted"}>
                          {supportsMpp ? "MPP" : t("unknown")}
                        </span>
                      </div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-left">
                        <span className="settings-icon" aria-hidden="true">
                          💸
                        </span>
                        <span className="settings-label">{t("mintFees")}</span>
                      </div>
                      <div className="settings-right">
                        {ppk !== null ? (
                          <span className="relay-url">ppk: {ppk}</span>
                        ) : feesJson ? (
                          <span className="relay-url">{feesJson}</span>
                        ) : (
                          <span className="muted">{t("unknown")}</span>
                        )}
                      </div>
                    </div>

                    <div className="settings-row">
                      <div className="settings-left">
                        <span className="settings-icon" aria-hidden="true">
                          ⏱
                        </span>
                        <span className="settings-label">Latency</span>
                      </div>
                      <div className="settings-right">
                        {latencyMs !== null ? (
                          <span className="relay-url">{latencyMs} ms</span>
                        ) : (
                          <span className="muted">{t("unknown")}</span>
                        )}
                      </div>
                    </div>

                    <div className="settings-row">
                      <button
                        type="button"
                        className="btn-wide secondary"
                        onClick={() => {
                          void refreshMintInfo(cleaned);
                        }}
                      >
                        {t("mintRefresh")}
                      </button>
                    </div>

                    <div className="settings-row">
                      <button
                        type="button"
                        className={
                          pendingMintDeleteUrl === cleaned
                            ? "btn-wide danger"
                            : "btn-wide"
                        }
                        onClick={() => {
                          if (pendingMintDeleteUrl === cleaned) {
                            const ownerId = appOwnerIdRef.current;
                            if (ownerId) {
                              setMintInfoAll((prev) => {
                                const next = prev.map((row) => {
                                  const url = normalizeMintUrl(
                                    String(
                                      (row as unknown as { url?: unknown })
                                        .url ?? ""
                                    )
                                  );
                                  if (url !== cleaned) return row;
                                  return {
                                    ...row,
                                    isDeleted: Evolu.sqliteTrue,
                                  };
                                });
                                safeLocalStorageSetJson(
                                  `${LOCAL_MINT_INFO_STORAGE_KEY_PREFIX}.${String(
                                    ownerId
                                  )}`,
                                  next
                                );
                                return next;
                              });
                            }

                            setPendingMintDeleteUrl(null);
                            navigateToMints();
                            return;
                          }
                          setStatus(t("deleteArmedHint"));
                          setPendingMintDeleteUrl(cleaned);
                        }}
                      >
                        {t("mintDelete")}
                      </button>
                    </div>

                    {lastCheckedAtSec ? (
                      <p className="muted" style={{ marginTop: 10 }}>
                        {t("mintLastChecked")}:{" "}
                        {new Date(lastCheckedAtSec * 1000).toLocaleString(
                          lang === "cs" ? "cs-CZ" : "en-US"
                        )}
                      </p>
                    ) : null}
                  </div>
                );
              })()}
            </section>
          )}

          {route.kind === "evoluServers" && (
            <section className="panel">
              {evoluServerUrls.length === 0 ? (
                <p className="muted" style={{ marginTop: 0 }}>
                  {t("evoluServersEmpty")}
                </p>
              ) : (
                <div>
                  {evoluServerUrls.map((url) => {
                    const offline = isEvoluServerOffline(url);
                    const state = offline
                      ? "disconnected"
                      : evoluHasError
                      ? "disconnected"
                      : evoluServerStatusByUrl[url] ?? "checking";

                    const isSynced =
                      Boolean(syncOwner) &&
                      !evoluHasError &&
                      !offline &&
                      state === "connected";

                    return (
                      <button
                        type="button"
                        className="settings-row settings-link"
                        key={url}
                        onClick={() => navigateToEvoluServer(url)}
                      >
                        <div className="settings-left">
                          <span className="relay-url">{url}</span>
                        </div>
                        <div className="settings-right">
                          <span
                            className={
                              state === "connected"
                                ? "status-dot connected"
                                : state === "checking"
                                ? "status-dot checking"
                                : "status-dot disconnected"
                            }
                            aria-label={state}
                            title={state}
                          />
                          <span className="muted" style={{ marginLeft: 10 }}>
                            {offline
                              ? t("evoluServerOfflineStatus")
                              : isSynced
                              ? t("evoluSyncOk")
                              : state === "checking"
                              ? t("evoluSyncing")
                              : t("evoluNotSynced")}
                          </span>
                          <span className="settings-chevron" aria-hidden="true">
                            &gt;
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {route.kind === "evoluServer" && (
            <section className="panel">
              {evoluServersReloadRequired ? (
                <>
                  <p className="muted" style={{ marginTop: 2 }}>
                    {t("evoluServersReloadHint")}
                  </p>
                  <div className="settings-row">
                    <button
                      type="button"
                      className="btn-wide secondary"
                      onClick={() => window.location.reload()}
                    >
                      {t("evoluServersReloadButton")}
                    </button>
                  </div>
                </>
              ) : null}

              {selectedEvoluServerUrl ? (
                <>
                  {(() => {
                    const offline = isEvoluServerOffline(
                      selectedEvoluServerUrl
                    );
                    const state = evoluHasError
                      ? "disconnected"
                      : offline
                      ? "disconnected"
                      : evoluServerStatusByUrl[selectedEvoluServerUrl] ??
                        "checking";
                    const isSynced =
                      Boolean(syncOwner) &&
                      !evoluHasError &&
                      !offline &&
                      state === "connected";

                    return (
                      <>
                        <div className="settings-row">
                          <div className="settings-left">
                            <span className="relay-url">
                              {selectedEvoluServerUrl}
                            </span>
                          </div>
                          <div className="settings-right">
                            <span
                              className={
                                state === "connected"
                                  ? "status-dot connected"
                                  : state === "checking"
                                  ? "status-dot checking"
                                  : "status-dot disconnected"
                              }
                              aria-label={state}
                              title={state}
                            />
                          </div>
                        </div>

                        <div className="settings-row">
                          <div className="settings-left">
                            <span className="settings-label">
                              {t("evoluSyncLabel")}
                            </span>
                          </div>
                          <div className="settings-right">
                            <span className="muted">
                              {offline
                                ? t("evoluServerOfflineStatus")
                                : isSynced
                                ? t("evoluSyncOk")
                                : state === "checking"
                                ? t("evoluSyncing")
                                : t("evoluNotSynced")}
                            </span>
                          </div>
                        </div>

                        <div className="settings-row">
                          <div className="settings-left">
                            <span className="settings-label">
                              {t("evoluServerOfflineLabel")}
                            </span>
                          </div>
                          <div className="settings-right">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setEvoluServerOffline(
                                  selectedEvoluServerUrl,
                                  !offline
                                );
                              }}
                            >
                              {offline
                                ? t("evoluServerOfflineEnable")
                                : t("evoluServerOfflineDisable")}
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  <div className="settings-row" style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn-wide danger"
                      onClick={() => {
                        void wipeEvoluStorage();
                      }}
                      disabled={evoluWipeStorageIsBusy}
                    >
                      {evoluWipeStorageIsBusy
                        ? t("evoluWipeStorageBusy")
                        : t("evoluWipeStorage")}
                    </button>
                  </div>
                </>
              ) : (
                <p className="lede">{t("errorPrefix")}</p>
              )}
            </section>
          )}

          {route.kind === "evoluServerNew" && (
            <section className="panel">
              <label htmlFor="evoluServerUrl">{t("evoluAddServerLabel")}</label>
              <input
                id="evoluServerUrl"
                value={newEvoluServerUrl}
                onChange={(e) => setNewEvoluServerUrl(e.target.value)}
                placeholder="wss://..."
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />

              <div className="panel-header" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    const normalized =
                      normalizeEvoluServerUrl(newEvoluServerUrl);
                    if (!normalized) {
                      pushToast(t("evoluAddServerInvalid"));
                      return;
                    }
                    if (
                      evoluServerUrls.some(
                        (u) => u.toLowerCase() === normalized.toLowerCase()
                      )
                    ) {
                      pushToast(t("evoluAddServerAlready"));
                      navigateToEvoluServers();
                      return;
                    }

                    saveEvoluServerUrls([...evoluServerUrls, normalized]);
                    setNewEvoluServerUrl("");
                    setStatus(t("evoluAddServerSaved"));
                    navigateToEvoluServers();
                  }}
                  disabled={!normalizeEvoluServerUrl(newEvoluServerUrl)}
                >
                  {t("evoluAddServerButton")}
                </button>
              </div>

              <div className="settings-row">
                <button
                  type="button"
                  className="btn-wide danger"
                  onClick={() => {
                    void wipeEvoluStorage();
                  }}
                  disabled={evoluWipeStorageIsBusy}
                >
                  {evoluWipeStorageIsBusy
                    ? t("evoluWipeStorageBusy")
                    : t("evoluWipeStorage")}
                </button>
              </div>
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
                {canSaveNewRelay ? (
                  <button onClick={saveNewRelay}>{t("saveChanges")}</button>
                ) : null}
              </div>
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
            </section>
          )}

          {route.kind === "wallet" && (
            <section className="panel wallet-panel">
              <div className="wallet-warning" role="alert">
                <div className="wallet-warning-icon" aria-hidden="true">
                  ⚠
                </div>
                <div className="wallet-warning-text">
                  <div className="wallet-warning-title">
                    {t("walletEarlyWarningTitle")}
                  </div>
                  <div className="wallet-warning-body">
                    {t("walletEarlyWarningBody")}
                  </div>
                </div>
              </div>
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
              <div className="ln-list wallet-token-list">
                {cashuTokens.length === 0 ? (
                  <p className="muted">{t("cashuEmpty")}</p>
                ) : (
                  <div className="ln-tags">
                    {cashuTokens.map((token) => (
                      <button
                        key={token.id as unknown as CashuTokenId}
                        className={
                          String(token.state ?? "") === "error"
                            ? "pill pill-error"
                            : "pill"
                        }
                        onClick={() =>
                          navigateToCashuToken(
                            token.id as unknown as CashuTokenId
                          )
                        }
                        style={{ cursor: "pointer" }}
                        aria-label={t("cashuToken")}
                      >
                        {(() => {
                          const amount =
                            Number((token.amount ?? 0) as unknown as number) ||
                            0;
                          const icon = getMintIconUrl(token.mint);
                          const showMintFallback = !icon.url;
                          return (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              {icon.url ? (
                                <img
                                  src={icon.url}
                                  alt=""
                                  width={14}
                                  height={14}
                                  style={{
                                    borderRadius: 9999,
                                    objectFit: "cover",
                                  }}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (
                                      e.currentTarget as HTMLImageElement
                                    ).style.display = "none";
                                    if (icon.origin) {
                                      setMintIconUrlByMint((prev) => ({
                                        ...prev,
                                        [icon.origin as string]: null,
                                      }));
                                    }
                                  }}
                                />
                              ) : null}
                              {showMintFallback && icon.host ? (
                                <span
                                  className="muted"
                                  style={{ fontSize: 10, lineHeight: "14px" }}
                                >
                                  {icon.host}
                                </span>
                              ) : null}
                              <span>{formatInteger(amount)}</span>
                            </span>
                          );
                        })()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="wallet-bottom-bar">
                <div className="wallet-bottom-inner">
                  <button
                    className="btn-wide"
                    onClick={navigateToTopup}
                    data-guide="wallet-topup"
                  >
                    {t("topup")}
                  </button>
                </div>
              </div>
            </section>
          )}

          {route.kind === "topup" && (
            <section className="panel">
              <div className="contact-header">
                <div className="contact-avatar is-large" aria-hidden="true">
                  {effectiveProfilePicture ? (
                    <img
                      src={effectiveProfilePicture}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="contact-avatar-fallback">
                      {getInitials(
                        effectiveProfileName ??
                          (currentNpub ? formatShortNpub(currentNpub) : "")
                      )}
                    </span>
                  )}
                </div>
                <div className="contact-header-text">
                  <h3>
                    {effectiveProfileName ??
                      (currentNpub
                        ? formatShortNpub(currentNpub)
                        : t("appTitle"))}
                  </h3>
                  <p className="muted">
                    {formatMiddleDots(
                      String(npubCashLightningAddress ?? ""),
                      36
                    )}
                  </p>
                </div>
              </div>

              <div className="amount-display" aria-live="polite">
                {(() => {
                  const amountSat = Number.parseInt(topupAmount.trim(), 10);
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
                      if (topupInvoiceIsBusy) return;
                      if (key === "C") {
                        setTopupAmount("");
                        return;
                      }
                      if (key === "⌫") {
                        setTopupAmount((v) => v.slice(0, -1));
                        return;
                      }
                      setTopupAmount((v) => {
                        const next = (v + key).replace(/^0+(\d)/, "$1");
                        return next;
                      });
                    }}
                    disabled={topupInvoiceIsBusy}
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
                const ln = String(npubCashLightningAddress ?? "").trim();
                const amountSat = Number.parseInt(topupAmount.trim(), 10);
                const invalid =
                  !ln ||
                  !Number.isFinite(amountSat) ||
                  amountSat <= 0 ||
                  topupInvoiceIsBusy;

                return (
                  <div className="actions">
                    <button
                      className="btn-wide"
                      onClick={() => {
                        if (invalid) return;
                        navigateToTopupInvoice();
                      }}
                      disabled={invalid}
                      data-guide="topup-show-invoice"
                    >
                      {t("topupShowInvoice")}
                    </button>
                  </div>
                );
              })()}
            </section>
          )}

          {route.kind === "topupInvoice" && (
            <section className="panel">
              {(() => {
                const amountSat = Number.parseInt(topupAmount.trim(), 10);
                if (!Number.isFinite(amountSat) || amountSat <= 0) return null;
                return (
                  <p className="muted" style={{ margin: "0 0 10px" }}>
                    {t("topupInvoiceAmount")
                      .replace("{amount}", formatInteger(amountSat))
                      .replace("{unit}", displayUnit)}
                  </p>
                );
              })()}

              {topupInvoiceQr ? (
                <img
                  className="qr"
                  src={topupInvoiceQr}
                  alt=""
                  onClick={() => {
                    if (!topupInvoice) return;
                    void copyText(topupInvoice);
                  }}
                />
              ) : topupInvoiceError ? (
                <p className="muted">{topupInvoiceError}</p>
              ) : topupInvoiceIsBusy ? (
                <p className="muted">{t("topupFetchingInvoice")}</p>
              ) : (
                <p className="muted">{t("topupFetchingInvoice")}</p>
              )}
            </section>
          )}

          {route.kind === "cashuTokenNew" && (
            <section className="panel">
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
                  void saveCashuFromText(tokenRaw, { navigateToWallet: true });
                }}
                placeholder={t("cashuPasteManualHint")}
              />

              <div className="settings-row">
                <button
                  className="btn-wide"
                  onClick={() =>
                    void saveCashuFromText(cashuDraft, {
                      navigateToWallet: true,
                    })
                  }
                  disabled={!cashuDraft.trim() || cashuIsBusy}
                >
                  {t("cashuSave")}
                </button>
              </div>
            </section>
          )}

          {route.kind === "cashuToken" && (
            <section className="panel">
              {(() => {
                const row = cashuTokensAll.find(
                  (tkn) =>
                    String(tkn?.id ?? "") ===
                      String(route.id as unknown as string) && !tkn?.isDeleted
                );

                if (!row) {
                  return <p className="muted">{t("errorPrefix")}</p>;
                }

                const tokenText = String(row.token ?? row.rawToken ?? "");
                const mintText = String(row.mint ?? "").trim();
                const mintDisplay = (() => {
                  if (!mintText) return null;
                  try {
                    return new URL(mintText).host;
                  } catch {
                    return mintText;
                  }
                })();

                return (
                  <>
                    {mintDisplay ? (
                      <p className="muted" style={{ margin: "0 0 10px" }}>
                        {mintDisplay}
                      </p>
                    ) : null}

                    {String(row.state ?? "") === "error" ? (
                      <p
                        className="muted"
                        style={{ margin: "0 0 10px", color: "#fca5a5" }}
                      >
                        {String(row.error ?? "").trim() || t("cashuInvalid")}
                      </p>
                    ) : null}

                    <div className="settings-row">
                      <button
                        className="btn-wide"
                        onClick={() =>
                          void checkAndRefreshCashuToken(
                            route.id as unknown as CashuTokenId
                          )
                        }
                        disabled={cashuIsBusy}
                      >
                        {t("cashuCheckToken")}
                      </button>
                    </div>
                    <label>{t("cashuToken")}</label>
                    <textarea readOnly value={tokenText} />

                    <div className="settings-row">
                      <button
                        className="btn-wide secondary"
                        onClick={() => void copyText(tokenText)}
                        disabled={!tokenText.trim()}
                      >
                        {t("copy")}
                      </button>
                    </div>

                    <div className="settings-row">
                      <button
                        className={
                          pendingCashuDeleteId === (route.id as CashuTokenId)
                            ? "btn-wide secondary danger-armed"
                            : "btn-wide secondary"
                        }
                        onClick={() => requestDeleteCashuToken(route.id)}
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </>
                );
              })()}
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
                    <h2 className="contact-detail-name">
                      {selectedContact.name}
                    </h2>
                  ) : null}

                  {(() => {
                    const group = String(
                      selectedContact.groupName ?? ""
                    ).trim();
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

                      const npub = String(selectedContact.npub ?? "").trim();
                      const isFeedbackContact = npub === FEEDBACK_CONTACT_NPUB;
                      return (
                        <button
                          className="btn-wide"
                          onClick={() =>
                            navigateToContactPay(selectedContact.id)
                          }
                          disabled={cashuIsBusy || !canPayWithCashu}
                          title={
                            !canPayWithCashu ? t("payInsufficient") : undefined
                          }
                          data-guide="contact-pay"
                        >
                          {isFeedbackContact ? "Donate" : t("pay")}
                        </button>
                      );
                    })()}

                    {(() => {
                      const npub = String(selectedContact.npub ?? "").trim();
                      if (!npub) return null;
                      const isFeedbackContact = npub === FEEDBACK_CONTACT_NPUB;
                      return (
                        <button
                          className="btn-wide secondary"
                          onClick={() => navigateToChat(selectedContact.id)}
                          data-guide="contact-message"
                        >
                          {isFeedbackContact ? "Feedback" : t("sendMessage")}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
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
                    if (!ln)
                      return <p className="muted">{t("payMissingLn")}</p>;
                    if (!canPayWithCashu)
                      return <p className="muted">{t("payInsufficient")}</p>;
                    return null;
                  })()}

                  <div data-guide="pay-step3">
                    <div className="amount-display" aria-live="polite">
                      {(() => {
                        const amountSat = Number.parseInt(payAmount.trim(), 10);
                        const display =
                          Number.isFinite(amountSat) && amountSat > 0
                            ? amountSat
                            : 0;
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
                            data-guide="pay-send"
                          >
                            {t("paySend")}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </>
              ) : null}
            </section>
          )}

          {route.kind === "lnAddressPay" && (
            <section className="panel">
              <div className="contact-header">
                <div className="contact-avatar is-large" aria-hidden="true">
                  <span className="contact-avatar-fallback">⚡</span>
                </div>
                <div className="contact-header-text">
                  <h3>{t("payTo")}</h3>
                  <p className="muted">
                    {formatMiddleDots(String(route.lnAddress ?? ""), 36)}
                  </p>
                  <p className="muted">
                    {t("availablePrefix")} {formatInteger(cashuBalance)}{" "}
                    {displayUnit}
                  </p>
                </div>
              </div>

              {!canPayWithCashu ? (
                <p className="muted">{t("payInsufficient")}</p>
              ) : null}

              <div className="amount-display" aria-live="polite">
                {(() => {
                  const amountSat = Number.parseInt(
                    lnAddressPayAmount.trim(),
                    10
                  );
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
                        setLnAddressPayAmount("");
                        return;
                      }
                      if (key === "⌫") {
                        setLnAddressPayAmount((v) => v.slice(0, -1));
                        return;
                      }
                      setLnAddressPayAmount((v) => {
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
                const amountSat = Number.parseInt(
                  lnAddressPayAmount.trim(),
                  10
                );
                const invalid =
                  !canPayWithCashu ||
                  !Number.isFinite(amountSat) ||
                  amountSat <= 0 ||
                  amountSat > cashuBalance;
                return (
                  <div className="actions">
                    <button
                      className="btn-wide"
                      onClick={() => {
                        if (invalid) return;
                        void payLightningAddressWithCashu(
                          route.lnAddress,
                          amountSat
                        );
                      }}
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
            </section>
          )}

          {route.kind === "chat" && (
            <section className="panel">
              {!selectedContact ? (
                <p className="muted">Kontakt nenalezen.</p>
              ) : null}

              {selectedContact ? (
                <>
                  {(() => {
                    const npub = String(selectedContact.npub ?? "").trim();
                    if (npub) return null;
                    return (
                      <p className="muted">{t("chatMissingContactNpub")}</p>
                    );
                  })()}

                  <div
                    className="chat-messages"
                    role="log"
                    aria-live="polite"
                    ref={chatMessagesRef}
                  >
                    {chatMessages.length === 0 ? (
                      <p className="muted">{t("chatEmpty")}</p>
                    ) : (
                      chatMessages.map((m, idx) => {
                        const isOut = String(m.direction ?? "") === "out";
                        const content = String(m.content ?? "");
                        const messageId = String(m.id ?? "");
                        const createdAtSec = Number(m.createdAtSec ?? 0) || 0;
                        const ms = createdAtSec * 1000;
                        const d = new Date(ms);
                        const dayKey = `${d.getFullYear()}-${
                          d.getMonth() + 1
                        }-${d.getDate()}`;
                        const minuteKey = Math.floor(createdAtSec / 60);

                        const prev = idx > 0 ? chatMessages[idx - 1] : null;
                        const prevSec = prev
                          ? Number(prev.createdAtSec ?? 0) || 0
                          : 0;
                        const prevDate = prev ? new Date(prevSec * 1000) : null;
                        const prevDayKey = prevDate
                          ? `${prevDate.getFullYear()}-${
                              prevDate.getMonth() + 1
                            }-${prevDate.getDate()}`
                          : null;

                        const next =
                          idx + 1 < chatMessages.length
                            ? chatMessages[idx + 1]
                            : null;
                        const nextSec = next
                          ? Number(next.createdAtSec ?? 0) || 0
                          : 0;
                        const nextMinuteKey = next
                          ? Math.floor(nextSec / 60)
                          : null;

                        const showDaySeparator = prevDayKey !== dayKey;
                        const showTime = nextMinuteKey !== minuteKey;

                        const locale = lang === "cs" ? "cs-CZ" : "en-US";
                        const timeLabel = new Intl.DateTimeFormat(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(d);

                        const tokenInfo = getCashuTokenMessageInfo(content);

                        return (
                          <React.Fragment key={String(m.id)}>
                            {showDaySeparator ? (
                              <div
                                className="chat-day-separator"
                                aria-hidden="true"
                              >
                                {formatChatDayLabel(ms)}
                              </div>
                            ) : null}

                            <div
                              className={
                                isOut ? "chat-message out" : "chat-message in"
                              }
                              ref={(el) => {
                                if (!messageId) return;
                                const map = chatMessageElByIdRef.current;
                                if (el) map.set(messageId, el);
                                else map.delete(messageId);
                              }}
                            >
                              <div
                                className={
                                  isOut ? "chat-bubble out" : "chat-bubble in"
                                }
                              >
                                {tokenInfo
                                  ? (() => {
                                      const icon = getMintIconUrl(
                                        tokenInfo.mintUrl
                                      );
                                      const showMintFallback = !icon.url;
                                      return (
                                        <span
                                          className={
                                            tokenInfo.isValid
                                              ? "pill"
                                              : "pill pill-muted"
                                          }
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 6,
                                          }}
                                          aria-label={
                                            tokenInfo.mintDisplay
                                              ? `${formatInteger(
                                                  tokenInfo.amount ?? 0
                                                )} sat · ${
                                                  tokenInfo.mintDisplay
                                                }`
                                              : `${formatInteger(
                                                  tokenInfo.amount ?? 0
                                                )} sat`
                                          }
                                        >
                                          {icon.url ? (
                                            <img
                                              src={icon.url}
                                              alt=""
                                              width={14}
                                              height={14}
                                              style={{
                                                borderRadius: 9999,
                                                objectFit: "cover",
                                              }}
                                              loading="lazy"
                                              referrerPolicy="no-referrer"
                                              onError={(e) => {
                                                (
                                                  e.currentTarget as HTMLImageElement
                                                ).style.display = "none";
                                                if (icon.origin) {
                                                  setMintIconUrlByMint(
                                                    (prev) => ({
                                                      ...prev,
                                                      [icon.origin as string]:
                                                        null,
                                                    })
                                                  );
                                                }
                                              }}
                                            />
                                          ) : null}
                                          {showMintFallback && icon.host ? (
                                            <span
                                              className="muted"
                                              style={{
                                                fontSize: 10,
                                                lineHeight: "14px",
                                              }}
                                            >
                                              {icon.host}
                                            </span>
                                          ) : null}
                                          {!showMintFallback &&
                                          tokenInfo.mintDisplay ? (
                                            <span
                                              className="muted"
                                              style={{
                                                fontSize: 10,
                                                lineHeight: "14px",
                                                maxWidth: 140,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                              }}
                                            >
                                              {tokenInfo.mintDisplay}
                                            </span>
                                          ) : null}
                                          <span>
                                            {formatInteger(
                                              tokenInfo.amount ?? 0
                                            )}
                                          </span>
                                        </span>
                                      );
                                    })()
                                  : content}
                              </div>

                              {showTime ? (
                                <div className="chat-time">{timeLabel}</div>
                              ) : null}
                            </div>
                          </React.Fragment>
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
                      data-guide="chat-input"
                    />
                    <button
                      className="btn-wide"
                      onClick={() => void sendChatMessage()}
                      disabled={
                        !chatDraft.trim() ||
                        !String(selectedContact.npub ?? "").trim()
                      }
                      data-guide="chat-send"
                    >
                      {t("send")}
                    </button>
                  </div>
                </>
              ) : null}
            </section>
          )}

          {route.kind === "contactEdit" && (
            <section className="panel panel-plain">
              {!selectedContact ? (
                <p className="muted">Kontakt nenalezen.</p>
              ) : null}

              <div className="form-grid">
                <div className="form-col">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <label>Jméno</label>
                    {String(form.npub ?? "").trim() &&
                    String(form.name ?? "").trim() ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          void resetEditedContactFieldFromNostr("name")
                        }
                        title={lang === "cs" ? "Obnovit" : "Reset"}
                        aria-label={lang === "cs" ? "Obnovit" : "Reset"}
                        style={{ paddingInline: 10, minWidth: 40 }}
                      >
                        ↺
                      </button>
                    ) : null}
                  </div>
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

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <label>{t("lightningAddress")}</label>
                    {String(form.npub ?? "").trim() &&
                    String(form.lnAddress ?? "").trim() ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() =>
                          void resetEditedContactFieldFromNostr("lnAddress")
                        }
                        title={lang === "cs" ? "Obnovit" : "Reset"}
                        aria-label={lang === "cs" ? "Obnovit" : "Reset"}
                        style={{ paddingInline: 10, minWidth: 40 }}
                      >
                        ↺
                      </button>
                    ) : null}
                  </div>
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
                    onChange={(e) =>
                      setForm({ ...form, group: e.target.value })
                    }
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
                    {editingId ? (
                      contactEditsSavable ? (
                        <button onClick={handleSaveContact}>
                          {t("saveChanges")}
                        </button>
                      ) : null
                    ) : (
                      <button
                        onClick={handleSaveContact}
                        data-guide="contact-save"
                      >
                        {t("saveContact")}
                      </button>
                    )}
                    <button
                      className={
                        pendingDeleteId === editingId ? "danger" : "ghost"
                      }
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
                    onChange={(e) =>
                      setForm({ ...form, group: e.target.value })
                    }
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
                      {t("saveContact")}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {showContactsOnboarding && (
            <section className="panel panel-plain contacts-checklist">
              <div className="contacts-checklist-header">
                <div className="contacts-checklist-title">
                  {t("contactsOnboardingTitle")}
                </div>
                <button
                  type="button"
                  className="contacts-checklist-close"
                  onClick={dismissContactsOnboarding}
                  aria-label={t("contactsOnboardingDismiss")}
                  title={t("contactsOnboardingDismiss")}
                >
                  ×
                </button>
              </div>

              <div className="contacts-checklist-progressRow">
                <div className="contacts-checklist-progress" aria-hidden="true">
                  <div
                    className="contacts-checklist-progressFill"
                    style={{ width: `${contactsOnboardingTasks.percent}%` }}
                  />
                </div>
                <div className="contacts-checklist-progressText">
                  {String(t("contactsOnboardingProgress"))
                    .replace(/\{done\}/g, String(contactsOnboardingTasks.done))
                    .replace(
                      /\{total\}/g,
                      String(contactsOnboardingTasks.total)
                    )}
                </div>
              </div>

              {contactsOnboardingCelebrating ||
              contactsOnboardingTasks.done === contactsOnboardingTasks.total ? (
                <div className="contacts-checklist-done" role="status">
                  <span
                    className="contacts-checklist-doneIcon"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  <span>
                    <div className="contacts-checklist-doneTitle">
                      {t("contactsOnboardingCompletedTitle")}
                    </div>
                    <div className="contacts-checklist-doneBody">
                      {t("contactsOnboardingCompletedBody")}
                    </div>
                  </span>
                </div>
              ) : (
                <div className="contacts-checklist-items" role="list">
                  {(() => {
                    const task =
                      contactsOnboardingTasks.tasks.find((x) => !x.done) ??
                      null;
                    if (!task) return null;
                    return (
                      <div
                        key={task.key}
                        className="contacts-checklist-item"
                        role="listitem"
                      >
                        <span
                          className="contacts-checklist-check"
                          aria-hidden="true"
                        >
                          ✓
                        </span>
                        <span className="contacts-checklist-label">
                          {task.label}
                        </span>
                        <button
                          type="button"
                          className="contacts-checklist-how"
                          onClick={() => startContactsGuide(task.key)}
                        >
                          {t("contactsOnboardingShowHow")}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
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
                    const hasAttention = Boolean(
                      contactAttentionById[String(contact.id ?? "")]
                    );

                    return (
                      <article
                        key={contact.id}
                        className="contact-card is-clickable"
                        data-guide="contact-card"
                        data-guide-contact-id={String(contact.id)}
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
                          <div
                            className="contact-avatar with-badge"
                            aria-hidden="true"
                          >
                            <span className="contact-avatar-inner">
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
                            </span>
                            {hasAttention ? (
                              <span
                                className="contact-unread-dot"
                                aria-hidden="true"
                              />
                            ) : null}
                          </div>
                          <div className="card-main">
                            <div className="card-title-row">
                              {contact.name ? (
                                <h4 className="contact-title">
                                  {contact.name}
                                </h4>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
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
                      <div
                        className="profile-detail"
                        style={{ marginBottom: 10 }}
                      >
                        <div
                          className="contact-avatar is-xl"
                          aria-hidden="true"
                        >
                          {profileEditPicture ? (
                            <img
                              src={profileEditPicture}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : effectiveProfilePicture ? (
                            <img
                              src={effectiveProfilePicture}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="contact-avatar-fallback">
                              {getInitials(
                                effectiveProfileName ??
                                  formatShortNpub(currentNpub)
                              )}
                            </span>
                          )}
                        </div>

                        <input
                          ref={profilePhotoInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => void onProfilePhotoSelected(e)}
                          style={{ display: "none" }}
                        />

                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => void onPickProfilePhoto()}
                          >
                            {t("profileUploadPhoto")}
                          </button>

                          {derivedProfile &&
                          profileEditPicture.trim() !==
                            derivedProfile.pictureUrl ? (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() =>
                                setProfileEditPicture(derivedProfile.pictureUrl)
                              }
                              title={lang === "cs" ? "Obnovit" : "Reset"}
                              aria-label={lang === "cs" ? "Obnovit" : "Reset"}
                              style={{ paddingInline: 10, minWidth: 40 }}
                            >
                              ↺
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <label htmlFor="profileName">{t("name")}</label>
                        {derivedProfile &&
                        profileEditName.trim() !== derivedProfile.name ? (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              setProfileEditName(derivedProfile.name)
                            }
                            title={lang === "cs" ? "Obnovit" : "Reset"}
                            aria-label={lang === "cs" ? "Obnovit" : "Reset"}
                            style={{ paddingInline: 10, minWidth: 40 }}
                          >
                            ↺
                          </button>
                        ) : null}
                      </div>
                      <input
                        id="profileName"
                        value={profileEditName}
                        onChange={(e) => setProfileEditName(e.target.value)}
                        placeholder={t("name")}
                      />

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <label htmlFor="profileLn">
                          {t("lightningAddress")}
                        </label>
                        {derivedProfile &&
                        profileEditLnAddress.trim() !==
                          derivedProfile.lnAddress ? (
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              setProfileEditLnAddress(derivedProfile.lnAddress)
                            }
                            title={lang === "cs" ? "Obnovit" : "Reset"}
                            aria-label={lang === "cs" ? "Obnovit" : "Reset"}
                            style={{ paddingInline: 10, minWidth: 40 }}
                          >
                            ↺
                          </button>
                        ) : null}
                      </div>
                      <input
                        id="profileLn"
                        value={profileEditLnAddress}
                        onChange={(e) =>
                          setProfileEditLnAddress(e.target.value)
                        }
                        placeholder={t("lightningAddress")}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />

                      <div className="panel-header" style={{ marginTop: 14 }}>
                        {profileEditsSavable ? (
                          <button onClick={() => void saveProfileEdits()}>
                            {t("saveChanges")}
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="profile-detail">
                        <div
                          className="contact-avatar is-xl"
                          aria-hidden="true"
                        >
                          {effectiveProfilePicture ? (
                            <img
                              src={effectiveProfilePicture}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="contact-avatar-fallback">
                              {getInitials(
                                effectiveProfileName ??
                                  formatShortNpub(currentNpub)
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
                          {effectiveProfileName ?? formatShortNpub(currentNpub)}
                        </h2>

                        {effectiveMyLightningAddress ? (
                          <p className="contact-detail-ln">
                            {effectiveMyLightningAddress}
                          </p>
                        ) : null}

                        <p className="muted profile-note">
                          {t("profileMessagesHint")}
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {scanIsOpen && (
            <div className="scan-overlay" role="dialog" aria-label={t("scan")}>
              <div className="scan-sheet">
                <div className="scan-header">
                  <div className="scan-title">{t("scan")}</div>
                  <button
                    className="topbar-btn"
                    onClick={closeScan}
                    aria-label={t("close")}
                    title={t("close")}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>

                <video ref={scanVideoRef} className="scan-video" />

                <div className="scan-hints" aria-label={t("scan")}>
                  {t("scanHintInvoice")}, {t("scanHintContact")},{" "}
                  {t("scanHintWithdraw")}
                </div>
              </div>
            </div>
          )}

          {postPaySaveContact && !paidOverlayIsOpen ? (
            <div
              className="modal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label={t("saveContactPromptTitle")}
            >
              <div className="modal-sheet">
                <div className="modal-title">{t("saveContactPromptTitle")}</div>
                <div className="modal-body">
                  {t("saveContactPromptBody")
                    .replace(
                      "{amount}",
                      formatInteger(postPaySaveContact.amountSat)
                    )
                    .replace("{unit}", displayUnit)
                    .replace("{lnAddress}", postPaySaveContact.lnAddress)}
                </div>
                <div className="modal-actions">
                  <button
                    className="btn-wide"
                    onClick={() => {
                      const ln = String(
                        postPaySaveContact.lnAddress ?? ""
                      ).trim();

                      const npub = (() => {
                        const lower = ln.toLowerCase();
                        if (!lower.endsWith("@npub.cash")) return null;
                        const left = ln.slice(0, -"@npub.cash".length).trim();
                        return left || null;
                      })();

                      setPostPaySaveContact(null);
                      setContactNewPrefill({
                        lnAddress: ln,
                        npub,
                        suggestedName: null,
                      });
                      navigateToNewContact();
                    }}
                  >
                    {t("saveContactPromptSave")}
                  </button>
                  <button
                    className="btn-wide secondary"
                    onClick={() => setPostPaySaveContact(null)}
                  >
                    {t("saveContactPromptSkip")}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {paidOverlayIsOpen ? (
            <div className="paid-overlay" role="status" aria-live="assertive">
              <div className="paid-sheet">
                <div className="paid-check" aria-hidden="true">
                  ✓
                </div>
                <div className="paid-title">
                  {paidOverlayTitle ?? (lang === "cs" ? "Zaplaceno" : "Paid")}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default App;
