import * as Evolu from "@evolu/common";
import { useOwner, useQuery } from "@evolu/react";
import type { Event as NostrToolsEvent } from "nostr-tools";
import React, { useMemo, useState } from "react";
import "../App.css";
import { AuthenticatedLayout } from "../components/AuthenticatedLayout";
import { ContactCard } from "../components/ContactCard";
import { ToastNotifications } from "../components/ToastNotifications";
import { UnauthenticatedLayout } from "../components/UnauthenticatedLayout";
import { deriveDefaultProfile } from "../derivedProfile";
import type { CashuTokenId, ContactId } from "../evolu";
import {
  evolu,
  normalizeEvoluServerUrl,
  useEvolu,
  useEvoluDatabaseInfoState,
  useEvoluLastError,
  useEvoluServersManager,
  useEvoluSyncOwner,
  wipeEvoluStorage as wipeEvoluStorageImpl,
} from "../evolu";
import { useInit } from "../hooks/useInit";
import { navigateTo, useRouting } from "../hooks/useRouting";
import { useToasts } from "../hooks/useToasts";
import { getInitialLang, persistLang, translations, type Lang } from "../i18n";
import { type NostrProfileMetadata } from "../nostrProfile";
import { getCashuDeterministicSeedFromStorage } from "../utils/cashuDeterministic";
import { getCashuLib } from "../utils/cashuLib";
import {
  ALLOW_PROMISES_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  FEEDBACK_CONTACT_NPUB,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
  LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX,
  NO_GROUP_FILTER,
  PAY_WITH_CASHU_STORAGE_KEY,
  PROMISE_TOTAL_CAP_SAT,
  UNIT_TOGGLE_STORAGE_KEY,
} from "../utils/constants";
import { getCredoRemainingAmount } from "../utils/credo";
import { formatInteger } from "../utils/formatting";
import {
  CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY,
  CASHU_SEEN_MINTS_STORAGE_KEY,
  extractPpk,
  MAIN_MINT_URL,
  normalizeMintUrl,
  PRESET_MINTS,
} from "../utils/mint";
import {
  getInitialAllowPromisesEnabled,
  getInitialNostrNsec,
  getInitialPayWithCashuEnabled,
  getInitialUseBitcoinSymbol,
  safeLocalStorageGet,
  safeLocalStorageGetJson,
  safeLocalStorageSet,
  safeLocalStorageSetJson,
} from "../utils/storage";
import { makeLocalId } from "../utils/validation";
import { AppProvider } from "./context/AppContext";
import { useCashuDomain } from "./hooks/useCashuDomain";
import { useAppDataTransfer } from "./hooks/useAppDataTransfer";
import { useContactsDomain } from "./hooks/useContactsDomain";
import { useContactsNostrPrefetchEffects } from "./hooks/useContactsNostrPrefetchEffects";
import { useGuideScannerDomain } from "./hooks/useGuideScannerDomain";
import { useFeedbackContact } from "./hooks/useFeedbackContact";
import { useLightningPaymentsDomain } from "./hooks/useLightningPaymentsDomain";
import { useMainSwipePageEffects } from "./hooks/useMainSwipePageEffects";
import { useMessagesDomain } from "./hooks/useMessagesDomain";
import { useMintDomain } from "./hooks/useMintDomain";
import { usePaymentsDomain } from "./hooks/usePaymentsDomain";
import { useNpubCashMintSelection } from "./hooks/mint/useNpubCashMintSelection";
import { useProfileEditor } from "./hooks/profile/useProfileEditor";
import { useProfileAuthDomain } from "./hooks/useProfileAuthDomain";
import { useProfileMetadataSyncEffect } from "./hooks/profile/useProfileMetadataSyncEffect";
import { useTopupInvoiceQuoteEffects } from "./hooks/topup/useTopupInvoiceQuoteEffects";
import { useProfileNpubCashEffects } from "./hooks/useProfileNpubCashEffects";
import { useRelayDomain } from "./hooks/useRelayDomain";
import { useScannedTextHandler } from "./hooks/useScannedTextHandler";
import { useCashuTokenChecks } from "./hooks/cashu/useCashuTokenChecks";
import { useNpubCashClaim } from "./hooks/cashu/useNpubCashClaim";
import { useRestoreMissingTokens } from "./hooks/cashu/useRestoreMissingTokens";
import { useSaveCashuFromText } from "./hooks/cashu/useSaveCashuFromText";
import { useContactEditor } from "./hooks/contacts/useContactEditor";
import { useVisibleContacts } from "./hooks/contacts/useVisibleContacts";
import { useContactsOnboardingProgress } from "./hooks/guide/useContactsOnboardingProgress";
import { useMainMenuState } from "./hooks/layout/useMainMenuState";
import { useMainSwipeNavigation } from "./hooks/layout/useMainSwipeNavigation";
import { useNostrPendingFlush } from "./hooks/messages/useNostrPendingFlush";
import { useSendChatMessage } from "./hooks/messages/useSendChatMessage";
import { useChatNostrSyncEffect } from "./hooks/messages/useChatNostrSyncEffect";
import { useInboxNotificationsSync } from "./hooks/messages/useInboxNotificationsSync";
import { useChatMessageEffects } from "./hooks/messages/useChatMessageEffects";
import { usePayContactWithCashuMessage } from "./hooks/payments/usePayContactWithCashuMessage";
import {
  buildTopbar,
  buildTopbarRight,
  buildTopbarTitle,
} from "./lib/topbarConfig";
import { createPaySelectedContact } from "./lib/createPaySelectedContact";
import type { AppNostrPool } from "./lib/nostrPool";
import {
  extractCashuTokenFromText,
  extractCashuTokenMeta,
} from "./lib/tokenText";
import {
  getCashuTokenMessageInfo as getCashuTokenMessageInfoBase,
  getCredoTokenMessageInfo as getCredoTokenMessageInfoBase,
} from "./lib/tokenMessageInfo";
import { publishWrappedWithRetry as publishWrappedWithRetryBase } from "./lib/nostrPublishRetry";
import type { CredoTokenRow, LocalPaymentEvent } from "./types/appTypes";
import { AppRouteContent } from "./routes/AppRouteContent";
import { buildMoneyRouteProps } from "./routes/props/buildMoneyRouteProps";
import { buildPeopleRouteProps } from "./routes/props/buildPeopleRouteProps";
import { useSystemRouteProps } from "./routes/useSystemRouteProps";

const inMemoryNostrPictureCache = new Map<string, string | null>();
const inMemoryMintIconCache = new Map<string, string | null>();

const logPayStep = (step: string, data?: Record<string, unknown>): void => {
  try {
    console.log("[linky][pay]", step, data ?? {});
  } catch {
    // ignore logging errors
  }
};

const AppShell = () => {
  const { insert, update, upsert } = useEvolu();

  const hasMintOverrideRef = React.useRef(false);

  const appOwnerIdRef = React.useRef<Evolu.OwnerId | null>(null);

  const makeLocalStorageKey = React.useCallback((prefix: string): string => {
    const ownerId = appOwnerIdRef.current;
    return `${prefix}.${String(ownerId ?? "anon")}`;
  }, []);

  const readSeenMintsFromStorage = React.useCallback((): string[] => {
    try {
      const raw = localStorage.getItem(
        makeLocalStorageKey(CASHU_SEEN_MINTS_STORAGE_KEY),
      );
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v) => normalizeMintUrl(String(v ?? "")))
        .filter(Boolean);
    } catch {
      return [];
    }
  }, [makeLocalStorageKey]);

  const rememberSeenMint = React.useCallback(
    (mintUrl: unknown): void => {
      const cleaned = normalizeMintUrl(mintUrl);
      if (!cleaned) return;
      try {
        const key = makeLocalStorageKey(CASHU_SEEN_MINTS_STORAGE_KEY);
        const existing = new Set(readSeenMintsFromStorage());
        existing.add(cleaned);
        localStorage.setItem(
          key,
          JSON.stringify(Array.from(existing).slice(0, 50)),
        );
      } catch {
        // ignore
      }
    },
    [makeLocalStorageKey, readSeenMintsFromStorage],
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

      const existing = safeLocalStorageGetJson(
        makeLocalStorageKey(LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX),
        [] as LocalPaymentEvent[],
      );
      const next = [entry, ...existing].slice(0, 250);
      safeLocalStorageSetJson(
        makeLocalStorageKey(LOCAL_PAYMENT_EVENTS_STORAGE_KEY_PREFIX),
        next,
      );
    },
    [makeLocalStorageKey],
  );

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
    null,
  );
  const [pendingCashuDeleteId, setPendingCashuDeleteId] =
    useState<CashuTokenId | null>(null);
  const [pendingMintDeleteUrl, setPendingMintDeleteUrl] = useState<
    string | null
  >(null);
  const [pendingEvoluServerDeleteUrl, setPendingEvoluServerDeleteUrl] =
    useState<string | null>(null);
  const [contactsHeaderVisible, setContactsHeaderVisible] = useState(false);
  const [contactsPullProgress, setContactsPullProgress] = useState(0);
  const contactsPullDistanceRef = React.useRef(0);
  const mainSwipeRef = React.useRef<HTMLDivElement | null>(null);
  const [mainSwipeProgress, setMainSwipeProgress] = useState(() =>
    route.kind === "wallet" ? 1 : 0,
  );
  const [mainSwipeScrollY, setMainSwipeScrollY] = useState(0);
  const mainSwipeProgressRef = React.useRef(route.kind === "wallet" ? 1 : 0);
  const mainSwipeScrollTimerRef = React.useRef<number | null>(null);

  const [contactsOnboardingHasPaid, setContactsOnboardingHasPaid] =
    useState<boolean>(
      () =>
        safeLocalStorageGet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY) === "1",
    );

  const [
    contactsOnboardingHasBackedUpKeys,
    setContactsOnboardingHasBackedUpKeys,
  ] = useState<boolean>(
    () =>
      safeLocalStorageGet(CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY) ===
      "1",
  );

  // Ephemeral per-contact activity indicator.
  // When a message/payment arrives, we show a dot and temporarily bump the
  // contact to the top until the user opens it.
  const [contactAttentionById, setContactAttentionById] = useState<
    Record<string, number>
  >(() => ({}));
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const [useBitcoinSymbol, setUseBitcoinSymbol] = useState<boolean>(() =>
    getInitialUseBitcoinSymbol(),
  );
  const [payWithCashuEnabled, setPayWithCashuEnabled] = useState<boolean>(() =>
    getInitialPayWithCashuEnabled(),
  );
  const [allowPromisesEnabled, setAllowPromisesEnabled] = useState<boolean>(
    () => getInitialAllowPromisesEnabled(),
  );

  const displayUnit = useBitcoinSymbol ? "₿" : "sat";

  const [currentNsec] = useState<string | null>(() => getInitialNostrNsec());

  // Evolu is local-first; to get automatic cross-device/browser sync you must
  // "use" an owner (which starts syncing over configured transports).
  // We only enable it after the user has an nsec (our identity gate).
  const syncOwner = useEvoluSyncOwner(Boolean(currentNsec));

  useOwner(syncOwner);

  const evoluLastError = useEvoluLastError({ logToConsole: true });
  const evoluHasError = Boolean(evoluLastError);

  React.useEffect(() => {
    if (!evoluLastError) return;
    const message = String(evoluLastError ?? "");
    if (!message.includes("WebAssembly.Memory(): could not allocate memory")) {
      return;
    }
    const key = "linky.evolu.autoWipeOnWasmOom.v1";
    const alreadyTried = String(safeLocalStorageGet(key) ?? "").trim() === "1";
    if (alreadyTried) return;
    safeLocalStorageSet(key, "1");
    // Last-resort recovery: wipe local Evolu storage and reload.
    try {
      wipeEvoluStorageImpl();
    } catch {
      // ignore
    }
  }, [evoluLastError]);

  const evoluDbInfo = useEvoluDatabaseInfoState({ enabled: true });

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
      (url) => evoluServerStatusByUrl[url] ?? "checking",
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
    const overrideRaw = safeLocalStorageGet(
      makeLocalStorageKey(CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY),
    );
    const override = normalizeMintUrl(overrideRaw);
    if (override) {
      hasMintOverrideRef.current = true;
      setDefaultMintUrl(override);
      setDefaultMintUrlDraft(override);
    } else {
      hasMintOverrideRef.current = false;
    }
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

  // Evolu error subscription handled by useEvoluLastError.

  const [evoluWipeStorageIsBusy, setEvoluWipeStorageIsBusy] =
    useState<boolean>(false);

  const wipeEvoluStorage = React.useCallback(async () => {
    if (evoluWipeStorageIsBusy) return;
    setEvoluWipeStorageIsBusy(true);

    try {
      wipeEvoluStorageImpl();
    } catch {
      pushToast(t("evoluWipeStorageFailed"));
    } finally {
      setEvoluWipeStorageIsBusy(false);
    }
  }, [evoluWipeStorageIsBusy, lang, pushToast]);

  const [nostrPictureByNpub, setNostrPictureByNpub] = useState<
    Record<string, string | null>
  >(() => Object.fromEntries(inMemoryNostrPictureCache.entries()));

  const avatarObjectUrlsByNpubRef = React.useRef<Map<string, string>>(
    new Map(),
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

      if (existing && existing.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(existing);
        } catch {
          // ignore
        }
      }

      avatarObjectUrlsByNpubRef.current.delete(key);
      return url;
    },
    [],
  );

  const [cashuDraft, setCashuDraft] = useState("");
  const cashuDraftRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [cashuIsBusy, setCashuIsBusy] = useState(false);
  const [cashuBulkCheckIsBusy, setCashuBulkCheckIsBusy] = useState(false);
  const [tokensRestoreIsBusy, setTokensRestoreIsBusy] = useState(false);

  const cashuOpQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const enqueueCashuOp = React.useCallback((op: () => Promise<void>) => {
    const next = cashuOpQueueRef.current.then(op, op);
    cashuOpQueueRef.current = next.catch(() => {});
    return next;
  }, []);

  const [defaultMintUrl, setDefaultMintUrl] = useState<string | null>(null);
  const [defaultMintUrlDraft, setDefaultMintUrlDraft] = useState<string>("");

  const [payAmount, setPayAmount] = useState<string>("");

  const [topupAmount, setTopupAmount] = useState<string>("");
  const [topupInvoice, setTopupInvoice] = useState<string | null>(null);
  const [topupInvoiceQr, setTopupInvoiceQr] = useState<string | null>(null);
  const [topupInvoiceError, setTopupInvoiceError] = useState<string | null>(
    null,
  );
  const [topupInvoiceIsBusy, setTopupInvoiceIsBusy] = useState(false);
  const [topupDebug, setTopupDebug] = useState<string | null>(null);
  const [topupMintQuote, setTopupMintQuote] = useState<null | {
    mintUrl: string;
    quote: string;
    amount: number;
    unit: string | null;
  }>(null);

  const [chatDraft, setChatDraft] = useState<string>("");
  const [chatSendIsBusy, setChatSendIsBusy] = useState(false);
  const chatSeenWrapIdsRef = React.useRef<Set<string>>(new Set());
  const autoAcceptedChatMessageIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    for (const [npub, url] of Object.entries(nostrPictureByNpub)) {
      inMemoryNostrPictureCache.set(npub, url ?? null);
    }
  }, [nostrPictureByNpub]);

  const [profileQrIsOpen, setProfileQrIsOpen] = useState(false);

  const chatMessagesRef = React.useRef<HTMLDivElement | null>(null);
  const chatMessageElByIdRef = React.useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );
  const chatDidInitialScrollForContactRef = React.useRef<string | null>(null);
  const chatForceScrollToBottomRef = React.useRef(false);
  const chatScrollTargetIdRef = React.useRef<string | null>(null);
  const chatLastMessageCountRef = React.useRef<Record<string, number>>({});

  const triggerChatScrollToBottom = React.useCallback((messageId?: string) => {
    chatForceScrollToBottomRef.current = true;
    if (messageId) chatScrollTargetIdRef.current = messageId;

    const tryScroll = (attempt: number) => {
      const targetId = chatScrollTargetIdRef.current;
      if (targetId) {
        const el = chatMessageElByIdRef.current.get(targetId);
        if (el) {
          el.scrollIntoView({ block: "end" });
          return;
        }
      }

      const c = chatMessagesRef.current;
      if (c) c.scrollTop = c.scrollHeight;

      if (attempt < 6) {
        requestAnimationFrame(() => tryScroll(attempt + 1));
      }
    };

    requestAnimationFrame(() => tryScroll(0));
  }, []);

  const [myProfileName, setMyProfileName] = useState<string | null>(null);
  const [myProfilePicture, setMyProfilePicture] = useState<string | null>(null);
  const [myProfileQr, setMyProfileQr] = useState<string | null>(null);
  const [myProfileLnAddress, setMyProfileLnAddress] = useState<string | null>(
    null,
  );
  const [myProfileMetadata, setMyProfileMetadata] =
    useState<NostrProfileMetadata | null>(null);

  const npubCashClaimInFlightRef = React.useRef(false);
  const npubCashInfoInFlightRef = React.useRef(false);
  const npubCashInfoLoadedForNpubRef = React.useRef<string | null>(null);
  const npubCashInfoLoadedAtMsRef = React.useRef<number>(0);
  const npubCashMintSyncRef = React.useRef<string | null>(null);

  const nostrInFlight = React.useRef<Set<string>>(new Set());
  const nostrMetadataInFlight = React.useRef<Set<string>>(new Set());

  const t = React.useCallback(
    (key: string) =>
      (translations[lang] as unknown as Record<string, string>)[key] ?? key,
    [lang],
  );

  const {
    createNewAccount,
    currentNpub,
    logoutArmed,
    onboardingIsBusy,
    onboardingStep,
    pasteExistingNsec,
    requestLogout,
    seedMnemonic,
    setOnboardingStep,
  } = useProfileAuthDomain({
    currentNsec,
    pushToast,
    t,
  });

  const {
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
  } = useRelayDomain({
    currentNpub,
    currentNsec,
    route,
    setStatus,
    t,
  });

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
      const resolved = title ?? t("paid");
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
    [lang],
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
    [t],
  );

  const contactNameCollator = useMemo(
    () =>
      new Intl.Collator(lang, {
        usage: "sort",
        numeric: true,
        sensitivity: "variant",
      }),
    [lang],
  );

  const contactPayBackToChatRef = React.useRef<ContactId | null>(null);

  React.useEffect(() => {
    // Reset pay amount when leaving the pay page.
    if (route.kind !== "contactPay") {
      contactPayBackToChatRef.current = null;
      setPayAmount("");
    }
  }, [contactsHeaderVisible, route.kind]);

  useTopupInvoiceQuoteEffects({
    currentNpub,
    defaultMintUrl,
    routeKind: route.kind,
    t,
    topupAmount,
    topupInvoice,
    topupInvoiceError,
    topupInvoiceIsBusy,
    topupInvoicePaidHandledRef,
    topupInvoiceQr,
    topupInvoiceStartBalanceRef,
    topupPaidNavTimerRef,
    topupRefreshKey: myProfileName,
    setTopupAmount,
    setTopupDebug,
    setTopupInvoice,
    setTopupInvoiceError,
    setTopupInvoiceIsBusy,
    setTopupInvoiceQr,
    setTopupMintQuote,
  });

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
        useBitcoinSymbol ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [useBitcoinSymbol]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        PAY_WITH_CASHU_STORAGE_KEY,
        payWithCashuEnabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [payWithCashuEnabled]);

  React.useEffect(() => {
    try {
      localStorage.setItem(
        ALLOW_PROMISES_STORAGE_KEY,
        allowPromisesEnabled ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [allowPromisesEnabled]);

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
    if (!pendingMintDeleteUrl) return;
    const timeoutId = window.setTimeout(() => {
      setPendingMintDeleteUrl(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingMintDeleteUrl]);

  React.useEffect(() => {
    if (!pendingEvoluServerDeleteUrl) return;
    const timeoutId = window.setTimeout(() => {
      setPendingEvoluServerDeleteUrl(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [pendingEvoluServerDeleteUrl]);

  React.useEffect(() => {
    if (!status) return;
    pushToast(status);
    setStatus(null);
  }, [pushToast, status]);

  React.useEffect(() => {
    if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
      return;
    if (!("serviceWorker" in navigator)) return;
    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      } catch {
        // ignore
      }
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  const {
    activeGroup,
    contacts,
    contactsSearch,
    contactsSearchData,
    contactsSearchInputRef,
    contactsSearchParts,
    dedupeContacts,
    dedupeContactsIsBusy,
    groupNames,
    selectedContact,
    setActiveGroup,
    setContactsSearch,
    ungroupedCount,
  } = useContactsDomain({
    appOwnerId,
    currentNsec,
    noGroupFilterValue: NO_GROUP_FILTER,
    pushToast,
    route,
    t,
    update,
    upsert,
  });

  const cashuTokensQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("cashuToken")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAt", "desc"),
      ),
    [],
  );

  const cashuTokens = useQuery(cashuTokensQuery);

  const cashuTokensAllQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db.selectFrom("cashuToken").selectAll().orderBy("createdAt", "desc"),
      ),
    [],
  );
  const cashuTokensAll = useQuery(cashuTokensAllQuery);

  const cashuTokensWithMeta = useMemo(
    () =>
      cashuTokens.map((row) => {
        const meta = extractCashuTokenMeta(
          row as {
            token?: unknown;
            rawToken?: unknown;
            mint?: unknown;
            unit?: unknown;
            amount?: unknown;
          },
        );
        return {
          ...row,
          mint: meta.mint ?? null,
          unit: meta.unit ?? null,
          amount: meta.amount ?? null,
          tokenText: meta.tokenText,
        };
      }),
    [cashuTokens],
  );

  const credoTokensQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("credoToken")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAt", "desc"),
      ),
    [],
  );

  const credoTokens = useQuery(credoTokensQuery);

  const credoTokensAllQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db.selectFrom("credoToken").selectAll().orderBy("createdAt", "desc"),
      ),
    [],
  );
  const credoTokensAll = useQuery(credoTokensAllQuery);

  const {
    applyCredoSettlement,
    cashuTokensHydratedRef,
    ensureCashuTokenPersisted,
    insertCredoPromise,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    isCredoPromiseKnown,
  } = useCashuDomain({
    appOwnerId,
    appOwnerIdRef,
    cashuTokensAll,
    contacts,
    credoTokensAll,
    insert,
    logPaymentEvent,
    update,
  });

  React.useEffect(() => {
    if (route.kind !== "topupInvoice") return;
    if (!topupMintQuote) return;

    let cancelled = false;
    const run = async () => {
      try {
        const { CashuMint, CashuWallet, MintQuoteState, getEncodedToken } =
          await getCashuLib();
        const det = getCashuDeterministicSeedFromStorage();
        const wallet = new CashuWallet(new CashuMint(topupMintQuote.mintUrl), {
          ...(topupMintQuote.unit ? { unit: topupMintQuote.unit } : {}),
          ...(det ? { bip39seed: det.bip39seed } : {}),
        });
        await wallet.loadMint();

        const quoteId = String(topupMintQuote.quote ?? "").trim();
        if (!quoteId) return;

        const status = await wallet.checkMintQuote(quoteId);
        const state = String(
          (status as unknown as { state?: unknown; status?: unknown }).state ??
            (status as unknown as { status?: unknown }).status ??
            "",
        ).toLowerCase();
        const paid =
          state === "paid" ||
          (typeof MintQuoteState === "object" &&
            (status as unknown as { state?: unknown }).state ===
              (MintQuoteState as unknown as { PAID?: unknown }).PAID);
        if (!paid) return;

        const proofs = await wallet.mintProofs(topupMintQuote.amount, quoteId);
        const unit = wallet.unit ?? null;
        const token = getEncodedToken({
          mint: topupMintQuote.mintUrl,
          proofs,
          ...(unit ? { unit } : {}),
        });

        const ownerId = await resolveOwnerIdForWrite();
        const payload = {
          token: token as typeof Evolu.NonEmptyString.Type,
          state: "accepted" as typeof Evolu.NonEmptyString100.Type,
          error: null,
        };

        const result = ownerId
          ? insert("cashuToken", payload, { ownerId })
          : insert("cashuToken", payload);
        if (!result.ok) {
          setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
          return;
        }

        ensureCashuTokenPersisted(String(token ?? ""));
        if (!cancelled) setTopupMintQuote(null);
      } catch {
        // ignore
      }
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    insert,
    resolveOwnerIdForWrite,
    route.kind,
    topupMintQuote,
    t,
    ensureCashuTokenPersisted,
  ]);

  const {
    getMintIconUrl,
    getMintRuntime,
    isMintDeleted,
    mintIconUrlByMint,
    mintInfoByUrl,
    mintInfoDeduped,
    refreshMintInfo,
    setMintIconUrlByMint,
    setMintInfoAll,
    touchMintInfo,
  } = useMintDomain({
    appOwnerId,
    appOwnerIdRef,
    cashuTokensAll,
    defaultMintUrl,
    rememberSeenMint,
  });

  React.useEffect(() => {
    for (const [origin, url] of Object.entries(mintIconUrlByMint)) {
      inMemoryMintIconCache.set(origin, url ?? null);
    }
  }, [mintIconUrlByMint]);

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

  const {
    appendLocalNostrMessage,
    chatMessages,
    chatMessagesLatestRef,
    enqueuePendingPayment,
    lastMessageByContactId,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrMessagesRecent,
    pendingPayments,
    refreshLocalNostrMessages,
    removePendingPayment,
    updateLocalNostrMessage,
  } = useMessagesDomain({
    appOwnerId,
    appOwnerIdRef,
    chatForceScrollToBottomRef,
    chatMessagesRef,
    route,
  });

  React.useEffect(() => {
    const pendingTokens = cashuTokensAll.filter((row) => {
      const state = String((row as unknown as { state?: unknown }).state ?? "");
      if (state !== "pending") return false;
      const isDeleted = Boolean(
        (row as unknown as { isDeleted?: unknown }).isDeleted,
      );
      return !isDeleted;
    });
    if (pendingTokens.length === 0) return;

    for (const row of pendingTokens) {
      const tokenText = String(
        (row as unknown as { token?: unknown; rawToken?: unknown }).token ??
          (row as unknown as { rawToken?: unknown }).rawToken ??
          "",
      ).trim();
      if (!tokenText) continue;
      const hasMessage = nostrMessagesLocal.some((m) => {
        const isOut = String(m.direction ?? "") === "out";
        const matches = String(m.content ?? "").trim() === tokenText;
        const status = String(m.status ?? "sent");
        return isOut && matches && status !== "pending";
      });
      if (!hasMessage) continue;
      update("cashuToken", {
        id: row.id as CashuTokenId,
        isDeleted: Evolu.sqliteTrue,
      });
    }
  }, [cashuTokensAll, nostrMessagesLocal, update]);

  // lastMessageByContactId provided by the derived Nostr index above.

  const cashuBalance = useMemo(() => {
    return cashuTokensWithMeta.reduce((sum, token) => {
      const state = String(token.state ?? "");
      if (state !== "accepted") return sum;
      const amount = Number((token.amount ?? 0) as unknown as number);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [cashuTokensWithMeta]);

  const credoTokensActive = useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    return credoTokens.filter((row) => {
      const r = row as CredoTokenRow;
      const expiresAt = Number(r.expiresAtSec ?? 0) || 0;
      if (expiresAt && nowSec >= expiresAt) return false;
      return getCredoRemainingAmount(row) > 0;
    });
  }, [credoTokens]);

  const totalCredoOutstandingOut = useMemo(() => {
    return credoTokensActive.reduce((sum, row) => {
      const dir = String((row as CredoTokenRow)?.direction ?? "");
      if (dir !== "out") return sum;
      return sum + getCredoRemainingAmount(row);
    }, 0);
  }, [credoTokensActive]);

  const totalCredoOutstandingIn = useMemo(() => {
    return credoTokensActive.reduce((sum, row) => {
      const dir = String((row as CredoTokenRow)?.direction ?? "");
      if (dir !== "in") return sum;
      return sum + getCredoRemainingAmount(row);
    }, 0);
  }, [credoTokensActive]);

  const credoOweTokens = useMemo(
    () =>
      credoTokensActive.filter(
        (row) => String((row as CredoTokenRow)?.direction ?? "") === "out",
      ),
    [credoTokensActive],
  );

  const credoPromisedTokens = useMemo(
    () =>
      credoTokensActive.filter(
        (row) => String((row as CredoTokenRow)?.direction ?? "") === "in",
      ),
    [credoTokensActive],
  );

  const canPayWithCashu = cashuBalance > 0;

  const getCredoAvailableForContact = React.useCallback(
    (contactNpub: string): number => {
      const npub = String(contactNpub ?? "").trim();
      if (!npub) return 0;
      const nowSec = Math.floor(Date.now() / 1000);
      return credoTokensActive.reduce((sum, row) => {
        const r = row as CredoTokenRow;
        const dir = String(r.direction ?? "");
        const issuer = String(r.issuer ?? "").trim();
        const expiresAt = Number(r.expiresAtSec ?? 0) || 0;
        if (expiresAt && nowSec >= expiresAt) return sum;
        if (dir !== "in" || issuer !== npub) return sum;
        return sum + getCredoRemainingAmount(row);
      }, 0);
    },
    [credoTokensActive],
  );

  const getCredoNetForContact = React.useCallback(
    (contactNpub: string): number => {
      const npub = String(contactNpub ?? "").trim();
      if (!npub) return 0;
      const nowSec = Math.floor(Date.now() / 1000);
      let promised = 0;
      let owe = 0;
      for (const row of credoTokensActive) {
        const r = row as CredoTokenRow;
        const dir = String(r.direction ?? "");
        const issuer = String(r.issuer ?? "").trim();
        const recipient = String(r.recipient ?? "").trim();
        const expiresAt = Number(r.expiresAtSec ?? 0) || 0;
        if (expiresAt && nowSec >= expiresAt) continue;
        const remaining = getCredoRemainingAmount(row);
        if (remaining <= 0) continue;
        if (dir === "in" && issuer === npub) promised += remaining;
        if (dir === "out" && recipient === npub) owe += remaining;
      }
      return promised - owe;
    },
    [credoTokensActive],
  );

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
        .replace("{unit}", displayUnit),
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
      navigateTo({ route: "wallet" });
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

  const {
    isProfileEditing,
    onPickProfilePhoto,
    onProfilePhotoSelected,
    profileEditInitialRef,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditsSavable,
    profilePhotoInputRef,
    saveProfileEdits,
    setIsProfileEditing,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditPicture,
    toggleProfileEditing,
  } = useProfileEditor({
    currentNpub,
    currentNsec,
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    myProfileMetadata,
    nostrFetchRelays,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
    setStatus,
    t,
  });

  const defaultMintDisplay = useMemo(() => {
    if (!defaultMintUrl) return null;
    try {
      const u = new URL(defaultMintUrl);
      return u.host;
    } catch {
      return defaultMintUrl;
    }
  }, [defaultMintUrl]);

  const { applyDefaultMintSelection, makeNip98AuthHeader } =
    useNpubCashMintSelection({
      currentNpub,
      currentNsec,
      defaultMintUrl,
      defaultMintUrlDraft,
      hasMintOverrideRef,
      makeLocalStorageKey,
      npubCashMintSyncRef,
      pushToast,
      setDefaultMintUrl,
      setDefaultMintUrlDraft,
      setStatus,
      t,
    });

  const { claimNpubCashOnce, claimNpubCashOnceLatestRef } = useNpubCashClaim({
    cashuIsBusy,
    cashuTokensAll,
    currentNpub,
    currentNsec,
    displayUnit,
    enqueueCashuOp,
    ensureCashuTokenPersisted,
    formatInteger,
    insert,
    isMintDeleted,
    logPaymentEvent,
    makeNip98AuthHeader,
    maybeShowPwaNotification,
    mintInfoByUrl,
    npubCashClaimInFlightRef,
    recentlyReceivedTokenTimerRef,
    refreshMintInfo,
    resolveOwnerIdForWrite,
    routeKind: route.kind,
    setCashuIsBusy,
    setRecentlyReceivedToken,
    setStatus,
    showPaidOverlay,
    t,
    touchMintInfo,
  });

  useProfileMetadataSyncEffect({
    currentNpub,
    nostrFetchRelays,
    rememberBlobAvatarUrl,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
  });

  useProfileNpubCashEffects({
    claimNpubCashOnce,
    claimNpubCashOnceLatestRef,
    currentNpub,
    currentNsec,
    hasMintOverrideRef,
    makeNip98AuthHeader,
    npubCashInfoInFlightRef,
    npubCashInfoLoadedAtMsRef,
    npubCashInfoLoadedForNpubRef,
    profileQrIsOpen,
    routeKind: route.kind,
    setDefaultMintUrl,
    setDefaultMintUrlDraft,
    setIsProfileEditing,
    setMyProfileQr,
  });

  // Intentionally no automatic publishing of kind-0 profile metadata.
  // We only publish profile changes when the user does so explicitly.

  useContactsNostrPrefetchEffects({
    contacts,
    nostrFetchRelays,
    nostrInFlight,
    nostrMetadataInFlight,
    nostrPictureByNpub,
    rememberBlobAvatarUrl,
    routeKind: route.kind,
    setNostrPictureByNpub,
    update,
  });

  const { isMainSwipeRoute } = useMainSwipePageEffects({
    contactsHeaderVisible,
    contactsPullDistanceRef,
    contactsPullProgress,
    routeKind: route.kind,
    setContactsHeaderVisible,
    setContactsPullProgress,
    setMainSwipeScrollY,
  });

  const { handleMainSwipeScroll } = useMainSwipeNavigation({
    isMainSwipeRoute,
    mainSwipeProgressRef,
    mainSwipeRef,
    mainSwipeScrollTimerRef,
    routeKind: route.kind,
    setMainSwipeProgress,
  });

  const visibleContacts = useVisibleContacts<(typeof contacts)[number]>({
    activeGroup,
    contactAttentionById,
    contactNameCollator,
    contactsSearchData,
    contactsSearchParts,
    lastMessageByContactId,
    noGroupFilterValue: NO_GROUP_FILTER,
  });

  const {
    clearContactForm,
    contactEditsSavable,
    editingId,
    form,
    handleSaveContact,
    isSavingContact,
    openScannedContactPendingNpubRef,
    refreshContactFromNostr,
    resetEditedContactFieldFromNostr,
    setForm,
  } = useContactEditor({
    appOwnerId,
    contactNewPrefill,
    contacts,
    insert,
    nostrFetchRelays,
    route,
    selectedContact,
    setContactNewPrefill,
    setPendingDeleteId,
    setStatus,
    t,
    update,
  });

  const closeContactDetail = () => {
    clearContactForm();
    setPendingDeleteId(null);
    navigateTo({ route: "contacts" });
  };

  const openNewContactPage = () => {
    setPendingDeleteId(null);
    setPayAmount("");
    clearContactForm();
    const prefill = contactNewPrefill;
    setContactNewPrefill(null);
    if (prefill) {
      setForm({
        name: String(prefill.suggestedName ?? ""),
        npub: String(prefill.npub ?? ""),
        lnAddress: String(prefill.lnAddress ?? ""),
        group: "",
      });
    }
    navigateTo({ route: "contactNew" });
  };

  const { closeMenu, menuIsOpen, navigateToMainReturn, openMenu, toggleMenu } =
    useMainMenuState({
      onClose: () => {
        setPendingDeleteId(null);
        setPayAmount("");
      },
      onOpen: () => {
        setPendingDeleteId(null);
        setPayAmount("");
      },
      route,
    });

  const [contactPayMethod, setContactPayMethod] = useState<
    null | "cashu" | "lightning"
  >(null);

  React.useEffect(() => {
    if (route.kind !== "contactPay") {
      setContactPayMethod(null);
      return;
    }

    const npub = String(selectedContact?.npub ?? "").trim();
    const ln = String(selectedContact?.lnAddress ?? "").trim();
    const canUseCashu =
      (payWithCashuEnabled || allowPromisesEnabled) && Boolean(npub);
    const canUseLightning = Boolean(ln);

    // Default: prefer Cashu when possible.
    if (canUseCashu) {
      setContactPayMethod("cashu");
      return;
    }

    if (canUseLightning) {
      setContactPayMethod("lightning");
      return;
    }

    // No usable method; keep a stable default for UI.
    setContactPayMethod("lightning");
  }, [allowPromisesEnabled, payWithCashuEnabled, route.kind, selectedContact]);

  const buildCashuMintCandidates = React.useCallback(
    (
      mintGroups: Map<string, { tokens: string[]; sum: number }>,
      preferredMint: string | null,
    ) => {
      const preferred = normalizeMintUrl(preferredMint ?? "");
      return Array.from(mintGroups.entries())
        .map(([mint, info]) => ({ mint, ...info }))
        .sort((a, b) => {
          const normalize = (u: string) =>
            String(u ?? "")
              .trim()
              .replace(/\/+$/, "");
          const mpp = (mint: string) => {
            const row = mintInfoByUrl.get(normalize(mint));
            return String(
              (row as unknown as { supportsMpp?: unknown })?.supportsMpp ?? "",
            ) === "1"
              ? 1
              : 0;
          };

          const aPreferred = preferred && normalize(a.mint) === preferred;
          const bPreferred = preferred && normalize(b.mint) === preferred;
          if (aPreferred !== bPreferred) return aPreferred ? 1 : -1;

          const dmpp = mpp(b.mint) - mpp(a.mint);
          if (dmpp !== 0) return dmpp;
          return b.sum - a.sum;
        });
    },
    [mintInfoByUrl],
  );

  const publishWrappedWithRetry = React.useCallback(
    async (
      pool: AppNostrPool,
      relays: string[],
      wrapForMe: NostrToolsEvent,
      wrapForContact: NostrToolsEvent,
    ): Promise<{ anySuccess: boolean; error: unknown | null }> => {
      return await publishWrappedWithRetryBase({
        pool,
        relays,
        wrapForMe,
        wrapForContact,
      });
    },
    [],
  );

  const payContactWithCashuMessage = usePayContactWithCashuMessage<
    (typeof contacts)[number]
  >({
    allowPromisesEnabled,
    appendLocalNostrMessage,
    applyCredoSettlement,
    buildCashuMintCandidates,
    cashuBalance,
    cashuTokensWithMeta,
    chatSeenWrapIdsRef,
    credoTokensActive,
    currentNpub,
    currentNsec,
    defaultMintUrl,
    displayUnit,
    enqueuePendingPayment,
    formatInteger,
    getCredoAvailableForContact,
    insert,
    insertCredoPromise,
    logPayStep,
    logPaymentEvent,
    nostrMessagesLocal,
    payWithCashuEnabled,
    publishWrappedWithRetry,
    pushToast,
    setContactsOnboardingHasPaid,
    setStatus,
    showPaidOverlay,
    t,
    totalCredoOutstandingOut,
    update,
    updateLocalNostrMessage,
  });

  useNostrPendingFlush({
    chatSeenWrapIdsRef,
    contacts,
    currentNsec,
    nostrMessagesLocal,
    publishWrappedWithRetry,
    updateLocalNostrMessage,
  });

  usePaymentsDomain({
    cashuIsBusy,
    contacts,
    currentNpub,
    currentNsec,
    payContactWithCashuMessage,
    pendingPayments,
    pushToast,
    removePendingPayment,
    setCashuIsBusy,
    t,
  });

  const paySelectedContact = createPaySelectedContact({
    allowPromisesEnabled,
    appendLocalNostrMessage,
    applyCredoSettlement,
    buildCashuMintCandidates,
    cashuBalance,
    cashuIsBusy,
    cashuTokensWithMeta,
    chatForceScrollToBottomRef,
    chatSeenWrapIdsRef,
    contactPayMethod,
    credoTokensActive,
    currentNpub,
    currentNsec,
    defaultMintUrl,
    displayUnit,
    enqueuePendingPayment,
    formatInteger,
    getCredoAvailableForContact,
    getCredoRemainingAmount,
    insert,
    insertCredoPromise,
    logPayStep,
    logPaymentEvent,
    normalizeMintUrl,
    payAmount,
    payWithCashuEnabled,
    publishWrappedWithRetry,
    pushToast,
    refreshLocalNostrMessages,
    route,
    selectedContact,
    setCashuIsBusy,
    setContactPayMethod,
    setContactsOnboardingHasPaid,
    setStatus,
    showPaidOverlay,
    t,
    totalCredoOutstandingOut,
    triggerChatScrollToBottom,
    update,
    updateLocalNostrMessage,
  });

  const { payLightningAddressWithCashu, payLightningInvoiceWithCashu } =
    useLightningPaymentsDomain({
      buildCashuMintCandidates,
      canPayWithCashu,
      cashuBalance,
      cashuIsBusy,
      cashuTokensWithMeta,
      contacts,
      defaultMintUrl,
      displayUnit,
      formatInteger,
      insert,
      logPaymentEvent,
      mintInfoByUrl,
      normalizeMintUrl,
      setCashuIsBusy,
      setContactsOnboardingHasPaid,
      setPostPaySaveContact,
      setStatus,
      showPaidOverlay,
      t,
      update,
    });

  const contactsOnboardingHasSentMessage = useMemo(() => {
    return nostrMessagesRecent.some(
      (m) =>
        String((m as unknown as { direction?: unknown }).direction ?? "") ===
        "out",
    );
  }, [nostrMessagesRecent]);

  const scannedTextHandlerRef = React.useRef<
    (rawValue: string) => Promise<void>
  >(async () => {});

  const {
    closeScan,
    contactsGuide,
    contactsGuideActiveStep,
    contactsGuideHighlightRect,
    contactsGuideNav,
    openScan,
    scanIsOpen,
    scanVideoRef,
    startContactsGuide,
    stopContactsGuide,
  } = useGuideScannerDomain({
    cashuBalance,
    contacts,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    openMenu,
    openNewContactPage,
    onScannedText: (rawValue: string) =>
      scannedTextHandlerRef.current(rawValue),
    pushToast,
    route,
    t,
  });

  const {
    contactsOnboardingCelebrating,
    contactsOnboardingTasks,
    dismissContactsOnboarding,
    showContactsOnboarding,
  } = useContactsOnboardingProgress({
    cashuBalance,
    contactsCount: contacts.length,
    contactsOnboardingHasBackedUpKeys,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    routeKind: route.kind,
    stopContactsGuide,
    t,
  });

  const saveCashuFromText = useSaveCashuFromText({
    displayUnit,
    enqueueCashuOp,
    ensureCashuTokenPersisted,
    formatInteger,
    insert,
    isCashuTokenStored,
    isMintDeleted,
    logPaymentEvent,
    mintInfoByUrl,
    recentlyReceivedTokenTimerRef,
    refreshMintInfo,
    resolveOwnerIdForWrite,
    setCashuDraft,
    setCashuIsBusy,
    setRecentlyReceivedToken,
    setStatus,
    showPaidOverlay,
    t,
    touchMintInfo,
  });

  const handleDelete = (id: ContactId) => {
    const result = appOwnerId
      ? update(
          "contact",
          { id, isDeleted: Evolu.sqliteTrue },
          { ownerId: appOwnerId },
        )
      : update("contact", { id, isDeleted: Evolu.sqliteTrue });
    if (result.ok) {
      setStatus(t("contactDeleted"));
      closeContactDetail();
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const {
    checkAllCashuTokensAndDeleteInvalid,
    checkAndRefreshCashuToken,
    requestDeleteCashuToken,
  } = useCashuTokenChecks({
    appOwnerId,
    cashuBulkCheckIsBusy,
    cashuIsBusy,
    cashuTokensAll,
    pendingCashuDeleteId,
    pushToast,
    setCashuBulkCheckIsBusy,
    setCashuIsBusy,
    setPendingCashuDeleteId,
    setStatus,
    t,
    update,
  });

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

  const { openFeedbackContact } = useFeedbackContact<(typeof contacts)[number]>(
    {
      appOwnerId,
      contacts,
      insert,
      pushToast,
      t,
      update,
    },
  );

  const openContactPay = (contactId: ContactId, fromChat = false) => {
    contactPayBackToChatRef.current = fromChat ? contactId : null;
    navigateTo({ route: "contactPay", id: contactId });
  };

  const openContactDetail = (contact: (typeof contacts)[number]) => {
    setPendingDeleteId(null);
    setContactAttentionById((prev) => {
      const key = String(contact.id ?? "");
      if (!key || prev[key] === undefined) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    contactPayBackToChatRef.current = null;
    const npub = String(contact.npub ?? "").trim();
    const ln = String(contact.lnAddress ?? "").trim();
    if (!npub) {
      if (ln) {
        openContactPay(contact.id as ContactId);
        return;
      }
      navigateTo({ route: "contact", id: contact.id });
      return;
    }
    navigateTo({ route: "chat", id: contact.id });
  };

  const renderContactCard = (contact: (typeof contacts)[number]) => {
    const npub = String(contact.npub ?? "").trim();
    const avatarUrl = npub ? nostrPictureByNpub[npub] : null;
    const contactId = String(contact.id ?? "").trim();
    const last = contactId ? lastMessageByContactId.get(contactId) : null;
    const lastText = String(last?.content ?? "").trim();
    const tokenInfo = lastText ? getCashuTokenMessageInfo(lastText) : null;
    const credoInfo = lastText ? getCredoTokenMessageInfo(lastText) : null;
    const promiseNet = npub ? getCredoNetForContact(npub) : 0;
    const hasAttention = Boolean(
      contactAttentionById[String(contact.id ?? "")],
    );

    return (
      <ContactCard
        key={String(contact.id ?? "")}
        contact={contact}
        avatarUrl={avatarUrl}
        lastMessage={last ?? null}
        hasAttention={hasAttention}
        promiseNet={promiseNet}
        displayUnit={displayUnit}
        tokenInfo={tokenInfo}
        credoInfo={credoInfo}
        getMintIconUrl={getMintIconUrl}
        onSelect={() => openContactDetail(contact)}
        onMintIconLoad={(origin, url) => {
          setMintIconUrlByMint((prev) => ({
            ...prev,
            [origin]: url,
          }));
        }}
        onMintIconError={(origin, url) => {
          setMintIconUrlByMint((prev) => ({
            ...prev,
            [origin]: url,
          }));
        }}
      />
    );
  };

  const renderMainSwipeContactCard = (contact: unknown): React.ReactNode =>
    renderContactCard(contact as (typeof contacts)[number]);

  const conversationsLabel = t("conversations");
  const otherContactsLabel = t("otherContacts");

  const { exportAppData, handleImportAppDataFilePicked, requestImportAppData } =
    useAppDataTransfer<(typeof contacts)[number], (typeof cashuTokens)[number]>(
      {
        appOwnerId,
        cashuTokens,
        cashuTokensAll,
        contacts,
        importDataFileInputRef,
        insert,
        pushToast,
        t,
        update,
      },
    );

  const copyNostrKeys = async () => {
    if (!currentNsec) return;
    await navigator.clipboard?.writeText(currentNsec);
    safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY, "1");
    setContactsOnboardingHasBackedUpKeys(true);
    pushToast(t("nostrKeysCopied"));
  };

  const copySeed = async () => {
    const value = String(seedMnemonic ?? "").trim();
    if (!value) return;
    await navigator.clipboard?.writeText(value);
    pushToast(t("seedCopied"));
  };

  const restoreMissingTokens = useRestoreMissingTokens({
    cashuIsBusy,
    cashuTokensAll,
    defaultMintUrl,
    enqueueCashuOp,
    insert,
    isMintDeleted,
    logPaymentEvent,
    mintInfoDeduped,
    pushToast,
    readSeenMintsFromStorage,
    rememberSeenMint,
    resolveOwnerIdForWrite,
    setCashuIsBusy,
    setTokensRestoreIsBusy,
    t,
    tokensRestoreIsBusy,
  });

  useChatNostrSyncEffect({
    appendLocalNostrMessage,
    chatMessages,
    chatMessagesLatestRef,
    chatSeenWrapIdsRef,
    currentNsec,
    logPayStep,
    nostrMessageWrapIdsRef,
    route,
    selectedContact,
    updateLocalNostrMessage,
  });

  const sendChatMessage = useSendChatMessage({
    appendLocalNostrMessage,
    chatDraft,
    chatSeenWrapIdsRef,
    chatSendIsBusy,
    currentNsec,
    publishWrappedWithRetry,
    route,
    selectedContact,
    setChatDraft,
    setChatSendIsBusy,
    setStatus,
    t,
    triggerChatScrollToBottom,
    updateLocalNostrMessage,
  });

  const contactsToolbarProgress =
    route.kind === "contacts"
      ? contactsHeaderVisible
        ? 1
        : contactsPullProgress
      : 0;
  const showContactsToolbar = contactsToolbarProgress > 0;
  const showGroupFilter = showContactsToolbar && groupNames.length > 0;
  const showNoGroupFilter = ungroupedCount > 0;

  const contactsToolbarStyle = {
    opacity: contactsToolbarProgress,
    maxHeight: `${Math.round(220 * contactsToolbarProgress)}px`,
    transform: `translateY(${(1 - contactsToolbarProgress) * -12}px)`,
    pointerEvents: contactsToolbarProgress > 0.02 ? "auto" : "none",
  } satisfies React.CSSProperties;

  const topbar = buildTopbar({
    closeContactDetail,
    contactPayBackToChatId: contactPayBackToChatRef.current,
    navigateToMainReturn,
    route,
    t,
  });

  const topbarRight = buildTopbarRight({
    route,
    selectedContact,
    t,
    toggleMenu,
    toggleProfileEditing,
  });

  const topbarTitle = buildTopbarTitle(route, t);

  const chatTopbarContact =
    route.kind === "chat" && selectedContact ? selectedContact : null;

  const getCashuTokenMessageInfo = React.useCallback(
    (text: string) => getCashuTokenMessageInfoBase(text, cashuTokensAll),
    [cashuTokensAll],
  );

  const getCredoTokenMessageInfo = React.useCallback(
    (text: string) => getCredoTokenMessageInfoBase(text),
    [],
  );

  useInboxNotificationsSync({
    appendLocalNostrMessage,
    contacts,
    currentNsec,
    getCashuTokenMessageInfo,
    getCredoTokenMessageInfo,
    maybeShowPwaNotification,
    nostrFetchRelays,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesRecent,
    route,
    setContactAttentionById,
    t,
    updateLocalNostrMessage,
  });

  const openProfileQr = React.useCallback(() => {
    setProfileQrIsOpen(true);
  }, []);

  const closeProfileQr = React.useCallback(() => {
    setProfileQrIsOpen(false);
  }, []);

  const handleScannedText = useScannedTextHandler<(typeof contacts)[number]>({
    appOwnerId,
    closeScan,
    contacts,
    extractCashuTokenFromText,
    insert,
    openScannedContactPendingNpubRef,
    payLightningInvoiceWithCashu,
    refreshContactFromNostr,
    saveCashuFromText,
    setStatus,
    t,
  });

  React.useEffect(() => {
    scannedTextHandlerRef.current = handleScannedText;
  }, [handleScannedText]);

  useChatMessageEffects({
    applyCredoSettlement,
    autoAcceptedChatMessageIdsRef,
    cashuIsBusy,
    cashuTokensHydratedRef,
    chatDidInitialScrollForContactRef,
    chatForceScrollToBottomRef,
    chatLastMessageCountRef,
    chatMessageElByIdRef,
    chatMessages,
    chatMessagesRef,
    chatScrollTargetIdRef,
    currentNpub,
    getCashuTokenMessageInfo,
    insertCredoPromise,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    isCredoPromiseKnown,
    nostrMessagesRecent,
    route,
    saveCashuFromText,
    selectedContact,
  });

  const bottomTabActive =
    route.kind === "wallet"
      ? "wallet"
      : route.kind === "contacts"
        ? "contacts"
        : null;

  const pageClassName = showGroupFilter
    ? "page has-group-filter"
    : route.kind === "chat"
      ? "page chat-page"
      : "page";
  const pageClassNameWithSwipe = isMainSwipeRoute
    ? `${pageClassName} main-swipe-active`
    : pageClassName;

  const systemRouteProps = useSystemRouteProps({
    appOwnerIdRef,
    appVersion: __APP_VERSION__,
    applyDefaultMintSelection,
    canSaveNewRelay,
    cashuIsBusy,
    allowPromisesEnabled,
    connectedRelayCount,
    copyNostrKeys,
    copySeed,
    currentNpub,
    currentNsec,
    dedupeContacts,
    dedupeContactsIsBusy,
    defaultMintDisplay,
    defaultMintUrl,
    defaultMintUrlDraft,
    evoluConnectedServerCount,
    evoluDatabaseBytes: evoluDbInfo.info.bytes,
    evoluHasError,
    evoluHistoryCount: evoluDbInfo.info.historyCount,
    evoluOverallStatus,
    evoluServerStatusByUrl,
    evoluServerUrls,
    evoluServersReloadRequired,
    evoluTableCounts: evoluDbInfo.info.tableCounts,
    evoluWipeStorageIsBusy,
    exportAppData,
    extractPpk,
    getMintIconUrl,
    getMintRuntime,
    handleImportAppDataFilePicked,
    importDataFileInputRef,
    isEvoluServerOffline,
    lang,
    LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
    logoutArmed,
    MAIN_MINT_URL,
    mintInfoByUrl,
    newEvoluServerUrl,
    newRelayUrl,
    normalizeEvoluServerUrl,
    normalizeMintUrl,
    nostrRelayOverallStatus,
    pendingEvoluServerDeleteUrl,
    pendingMintDeleteUrl,
    pendingRelayDeleteUrl,
    payWithCashuEnabled,
    PRESET_MINTS,
    pushToast,
    refreshMintInfo,
    relayStatusByUrl,
    relayUrls,
    requestDeleteSelectedRelay,
    requestImportAppData,
    requestLogout,
    restoreMissingTokens,
    route,
    safeLocalStorageSetJson,
    saveEvoluServerUrls,
    saveNewRelay,
    seedMnemonic,
    selectedEvoluServerUrl,
    selectedRelayUrl,
    setAllowPromisesEnabled,
    setDefaultMintUrlDraft,
    setEvoluServerOffline,
    setNewEvoluServerUrl,
    setNewRelayUrl,
    setPayWithCashuEnabled,
    setPendingEvoluServerDeleteUrl,
    setPendingMintDeleteUrl,
    setStatus,
    setMintInfoAllUnknown: setMintInfoAll as (
      updater: (prev: unknown[]) => unknown[],
    ) => void,
    syncOwner,
    t,
    tokensRestoreIsBusy,
    wipeEvoluStorage,
  });

  const peopleRouteProps = buildPeopleRouteProps({
    activeGroup,
    allowPromisesEnabled,
    bottomTabActive,
    cashuBalance,
    cashuIsBusy,
    chatDraft,
    chatMessageElByIdRef,
    chatMessages,
    chatMessagesRef,
    chatSendIsBusy,
    contactEditsSavable,
    contactPayMethod,
    contacts,
    contactsOnboardingCelebrating,
    contactsOnboardingTasks,
    contactsSearch,
    contactsSearchInputRef,
    contactsToolbarStyle,
    conversationsLabel,
    copyText,
    currentNpub,
    derivedProfile,
    dismissContactsOnboarding,
    displayUnit,
    editingId,
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    feedbackContactNpub: FEEDBACK_CONTACT_NPUB,
    form,
    getCashuTokenMessageInfo,
    getCredoAvailableForContact,
    getCredoTokenMessageInfo,
    getMintIconUrl,
    groupNames,
    handleMainSwipeScroll,
    handleSaveContact,
    isProfileEditing,
    isSavingContact,
    lang,
    mainSwipeProgress,
    mainSwipeRef,
    mainSwipeScrollY,
    myProfileQr,
    NO_GROUP_FILTER,
    nostrPictureByNpub,
    onPickProfilePhoto,
    onProfilePhotoSelected,
    openContactPay,
    openNewContactPage,
    openScan,
    otherContactsLabel,
    payAmount,
    paySelectedContact,
    payWithCashuEnabled,
    pendingDeleteId,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditsSavable,
    profilePhotoInputRef,
    promiseTotalCapSat: PROMISE_TOTAL_CAP_SAT,
    renderContactCard: renderMainSwipeContactCard,
    requestDeleteCurrentContact,
    resetEditedContactFieldFromNostr,
    route,
    saveProfileEdits,
    scanIsOpen,
    selectedContact,
    sendChatMessage,
    setActiveGroup,
    setChatDraft,
    setContactPayMethod,
    setContactsSearch,
    setForm,
    setMintIconUrlByMint,
    setPayAmount,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditPicture,
    showContactsOnboarding,
    showGroupFilter,
    showNoGroupFilter,
    startContactsGuide,
    t,
    totalCredoOutstandingOut,
    visibleContacts,
  });

  const moneyRouteProps = buildMoneyRouteProps({
    canPayWithCashu,
    cashuBalance,
    cashuBulkCheckIsBusy,
    cashuDraft,
    cashuDraftRef,
    cashuIsBusy,
    cashuTokensAll,
    cashuTokensWithMeta,
    checkAllCashuTokensAndDeleteInvalid,
    checkAndRefreshCashuToken,
    contacts,
    copyText,
    credoOweTokens,
    credoPromisedTokens,
    credoTokensAll,
    currentNpub,
    displayUnit,
    effectiveProfileName,
    effectiveProfilePicture,
    getCredoRemainingAmount,
    getMintIconUrl,
    lnAddressPayAmount,
    nostrPictureByNpub,
    npubCashLightningAddress,
    payLightningAddressWithCashu,
    pendingCashuDeleteId,
    requestDeleteCashuToken,
    route,
    saveCashuFromText,
    setCashuDraft,
    setLnAddressPayAmount,
    setMintIconUrlByMint,
    setTopupAmount,
    t,
    topupAmount,
    topupDebug,
    topupInvoice,
    topupInvoiceError,
    topupInvoiceIsBusy,
    topupInvoiceQr,
    totalCredoOutstandingIn,
    totalCredoOutstandingOut,
  });

  const appState = {
    chatTopbarContact,
    contactsGuide,
    contactsGuideActiveStep,
    contactsGuideHighlightRect,
    currentNpub,
    currentNsec,
    derivedProfile,
    displayUnit,
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    isProfileEditing,
    lang,
    menuIsOpen,
    myProfileQr,
    nostrPictureByNpub,
    paidOverlayIsOpen,
    paidOverlayTitle,
    postPaySaveContact,
    profileEditInitialRef,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditsSavable,
    profilePhotoInputRef,
    profileQrIsOpen,
    route,
    scanIsOpen,
    scanVideoRef,
    t,
    topbar,
    topbarRight,
    topbarTitle,
    useBitcoinSymbol,
  };

  const appActions = {
    closeMenu,
    closeProfileQr,
    closeScan,
    contactsGuideNav,
    copyText,
    onPickProfilePhoto,
    onProfilePhotoSelected,
    openFeedbackContact,
    openProfileQr,
    saveProfileEdits,
    setContactNewPrefill,
    setIsProfileEditing,
    setLang,
    setPostPaySaveContact,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditPicture,
    setUseBitcoinSymbol,
    stopContactsGuide,
    toggleProfileEditing,
  };

  return (
    <div className={pageClassNameWithSwipe}>
      <ToastNotifications
        recentlyReceivedToken={recentlyReceivedToken}
        toasts={toasts}
        displayUnit={displayUnit}
        pushToast={pushToast}
        setRecentlyReceivedToken={setRecentlyReceivedToken}
        t={t}
      />

      {!currentNsec ? (
        <UnauthenticatedLayout
          onboardingStep={onboardingStep}
          onboardingIsBusy={onboardingIsBusy}
          setOnboardingStep={setOnboardingStep}
          createNewAccount={createNewAccount}
          pasteExistingNsec={pasteExistingNsec}
          t={t}
        />
      ) : null}

      {currentNsec ? (
        <AppProvider actions={appActions} state={appState}>
          <AuthenticatedLayout>
            <AppRouteContent
              {...systemRouteProps}
              {...peopleRouteProps}
              {...moneyRouteProps}
              isMainSwipeRoute={isMainSwipeRoute}
              route={route}
            />
          </AuthenticatedLayout>
        </AppProvider>
      ) : null}
    </div>
  );
};

export default AppShell;
