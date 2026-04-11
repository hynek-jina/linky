import type { Proof } from "@cashu/cashu-ts";
import * as Evolu from "@evolu/common";
import { useOwner, useQuery } from "@evolu/react";
import { nip19, type Event as NostrToolsEvent } from "nostr-tools";
import React, { useMemo, useState } from "react";
import { ContactCard } from "../components/ContactCard";
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
import { navigateTo, useRouting } from "../hooks/useRouting";
import { useToasts } from "../hooks/useToasts";
import { getInitialLang, translations, type Lang } from "../i18n";
import { inferLightningAddressFromLnurlTarget } from "../lnurlPay";
import {
  cacheProfileAvatarFromUrl,
  fetchNostrProfileMetadata,
  fetchNostrProfilePicture,
  loadCachedProfileAvatarObjectUrl,
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
  type NostrProfileMetadata,
} from "../nostrProfile";
import { readStoredNostrNsec } from "../platform/identitySecrets";
import {
  cancelNativeNfcWrite,
  consumePendingNativeDeepLinkUrl,
  NATIVE_DEEP_LINK_EVENT,
  startNativeNfcWrite,
  supportsNativeNfcWrite,
} from "../platform/nativeBridge";
import {
  bumpCashuDeterministicCounter,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "../utils/cashuDeterministic";
import { getCashuLib } from "../utils/cashuLib";
import { createLoadedCashuWallet } from "../utils/cashuWallet";
import {
  BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY,
  CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  FEEDBACK_CONTACT_NPUB,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
  LOCAL_PENDING_TOPUP_QUOTE_STORAGE_KEY_PREFIX,
  MAX_CONTACTS_PER_OWNER,
  NO_GROUP_FILTER,
  PENDING_DEEP_LINK_TEXT_STORAGE_KEY,
} from "../utils/constants";
import { buildCashuDeepLink, parseNativeDeepLinkUrl } from "../utils/deepLinks";
import {
  applyAmountInputKey,
  formatDisplayAmountParts,
  formatDisplayAmountText,
  getDisplayUnitLabel,
  type DisplayCurrency,
} from "../utils/displayAmounts";
import { formatShortNpub, getBestNostrName } from "../utils/formatting";
import type { LightningInvoicePreview } from "../utils/lightningInvoice";
import {
  CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY,
  extractPpk,
  MAIN_MINT_URL,
  normalizeMintUrl,
  PRESET_MINTS,
} from "../utils/mint";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";
import {
  clearStoredPushNsec,
  setStoredPushNsec,
} from "../utils/pushNsecStorage";
import {
  getInitialDisplayCurrency,
  getInitialLightningInvoiceAutoPayLimit,
  getInitialNostrNsec,
  getInitialPayWithCashuEnabled,
  safeLocalStorageGet,
  safeLocalStorageGetJson,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeLocalStorageSetJson,
  withLocalStorageLeaseLock,
} from "../utils/storage";
import { getUnknownErrorMessage } from "../utils/unknown";
import { useCashuTokenChecks } from "./hooks/cashu/useCashuTokenChecks";
import { useNpubCashClaim } from "./hooks/cashu/useNpubCashClaim";
import { useRestoreMissingTokens } from "./hooks/cashu/useRestoreMissingTokens";
import { useSaveCashuFromText } from "./hooks/cashu/useSaveCashuFromText";
import { usePaymentMoneyComposition } from "./hooks/composition/usePaymentMoneyComposition";
import { useProfileAuthComposition } from "./hooks/composition/useProfileAuthComposition";
import { useProfilePeopleComposition } from "./hooks/composition/useProfilePeopleComposition";
import { useRoutingViewComposition } from "./hooks/composition/useRoutingViewComposition";
import { useSystemSettingsComposition } from "./hooks/composition/useSystemSettingsComposition";
import { useContactEditor } from "./hooks/contacts/useContactEditor";
import { useVisibleContacts } from "./hooks/contacts/useVisibleContacts";
import { useContactsOnboardingProgress } from "./hooks/guide/useContactsOnboardingProgress";
import { useMainMenuState } from "./hooks/layout/useMainMenuState";
import { useMainSwipeNavigation } from "./hooks/layout/useMainSwipeNavigation";
import {
  isUnknownContactId,
  normalizePubkeyHex,
} from "./hooks/messages/contactIdentity";
import { useChatMessageEffects } from "./hooks/messages/useChatMessageEffects";
import { useChatNostrSyncEffect } from "./hooks/messages/useChatNostrSyncEffect";
import {
  useEditChatMessage,
  type EditChatContext,
} from "./hooks/messages/useEditChatMessage";
import { useInboxNotificationsSync } from "./hooks/messages/useInboxNotificationsSync";
import { useNostrPendingFlush } from "./hooks/messages/useNostrPendingFlush";
import {
  useSendChatMessage,
  type ReplyContext,
} from "./hooks/messages/useSendChatMessage";
import { useSendReaction } from "./hooks/messages/useSendReaction";
import { useNpubCashMintSelection } from "./hooks/mint/useNpubCashMintSelection";
import { useContactPayMethod } from "./hooks/payments/useContactPayMethod";
import { usePayContactWithCashuMessage } from "./hooks/payments/usePayContactWithCashuMessage";
import { useRouteAmountResetEffects } from "./hooks/payments/useRouteAmountResetEffects";
import { useProfileEditor } from "./hooks/profile/useProfileEditor";
import { useProfileMetadataSyncEffect } from "./hooks/profile/useProfileMetadataSyncEffect";
import {
  isClaimableMintQuoteState,
  readMintQuoteState,
} from "./hooks/topup/topupMintQuoteState";
import {
  requestMintQuoteBolt11,
  useTopupInvoiceQuoteEffects,
  type TopupMintQuoteDraft,
} from "./hooks/topup/useTopupInvoiceQuoteEffects";
import { useAnonymousPaymentTelemetry } from "./hooks/useAnonymousPaymentTelemetry";
import { useAppDataTransfer } from "./hooks/useAppDataTransfer";
import { useAppPreferences } from "./hooks/useAppPreferences";
import { useArmedDeleteTimeouts } from "./hooks/useArmedDeleteTimeouts";
import { useCashuDomain } from "./hooks/useCashuDomain";
import { useContactsDomain } from "./hooks/useContactsDomain";
import { useContactsNostrPrefetchEffects } from "./hooks/useContactsNostrPrefetchEffects";
import { useEvoluContactsOwnerRotation } from "./hooks/useEvoluContactsOwnerRotation";
import { useFeedbackContact } from "./hooks/useFeedbackContact";
import { useFiatRates } from "./hooks/useFiatRates";
import { useGuideScannerDomain } from "./hooks/useGuideScannerDomain";
import { useLightningPaymentsDomain } from "./hooks/useLightningPaymentsDomain";
import { useMainSwipePageEffects } from "./hooks/useMainSwipePageEffects";
import { useMessagesDomain } from "./hooks/useMessagesDomain";
import { useMintDomain } from "./hooks/useMintDomain";
import { useOwnerScopedStorage } from "./hooks/useOwnerScopedStorage";
import { usePaidOverlayState } from "./hooks/usePaidOverlayState";
import { usePaymentsDomain } from "./hooks/usePaymentsDomain";
import { useProfileNpubCashEffects } from "./hooks/useProfileNpubCashEffects";
import { useRelayDomain } from "./hooks/useRelayDomain";
import { useScannedTextHandler } from "./hooks/useScannedTextHandler";
import { useScannedTextHandlerRefBridge } from "./hooks/useScannedTextHandlerRefBridge";
import { useStatusToasts } from "./hooks/useStatusToasts";
import { useStoragePersistRequestEffect } from "./hooks/useStoragePersistRequestEffect";
import {
  CASHU_TOKEN_STATE_EXTERNALIZED,
  isCashuTokenAcceptedState,
} from "./lib/cashuTokenState";
import type { AppNostrPool } from "./lib/nostrPool";
import {
  publishSingleWrappedWithRetry as publishSingleWrappedWithRetryBase,
  publishWrappedWithRetry as publishWrappedWithRetryBase,
} from "./lib/nostrPublishRetry";
import {
  buildPaymentAmountAttempts,
  buildPaymentFailureAmountAttempts,
  isRetryablePaymentAmountFailure,
} from "./lib/paymentAmountFallback";
import { buildCashuMintCandidates as buildCashuMintCandidatesBase } from "./lib/paymentMintSelection";
import { showPwaNotification } from "./lib/pwaNotifications";
import { getCashuTokenMessageInfo as getCashuTokenMessageInfoBase } from "./lib/tokenMessageInfo";
import {
  extractCashuTokenFromText,
  extractCashuTokenFromText as extractCashuTokenFromTextFromUrl,
  extractCashuTokenMeta,
} from "./lib/tokenText";
import {
  buildTopbar,
  buildTopbarRight,
  buildTopbarTitle,
} from "./lib/topbarConfig";
import type {
  ContactRowLike,
  LocalNostrMessage,
  PaymentLogData,
  PublishWrappedResult,
} from "./types/appTypes";

const inMemoryNostrPictureCache = new Map<string, string | null>();
const inMemoryMintIconCache = new Map<string, string | null>();

type TranslationKey = keyof (typeof translations)["cs"];

const hasTranslationKey = (key: string): key is TranslationKey =>
  Object.prototype.hasOwnProperty.call(translations.cs, key);

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};
interface PendingTopupQuoteStorage {
  amount: number;
  createdAtMs: number;
  invoice?: string | null;
  mintUrl: string;
  quote: string;
  unit: string | null;
}

interface ClaimedTopupQuoteStorage {
  amount: number;
  claimedAtMs: number;
  mintUrl: string;
  quote: string;
  token: string;
  unit: string | null;
}

const PENDING_TOPUP_QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLAIMED_TOPUP_QUOTE_STORAGE_KEY_PREFIX = "linky.topup.claimed.v1";
const CLAIMED_TOPUP_QUOTE_LOCK_STORAGE_KEY_PREFIX = "linky.topup.claimLock.v1";

const encodeStorageSegment = (value: string): string =>
  encodeURIComponent(String(value ?? "").trim());

const isExpiredPendingTopupQuote = (createdAtMs: number): boolean =>
  Date.now() - createdAtMs > PENDING_TOPUP_QUOTE_MAX_AGE_MS;

const isSameTopupMintQuote = (
  left: TopupMintQuoteDraft | null,
  right: TopupMintQuoteDraft | null,
): boolean => {
  if (!left || !right) return left === right;

  return (
    left.mintUrl === right.mintUrl &&
    left.quote === right.quote &&
    left.amount === right.amount &&
    left.unit === right.unit
  );
};

const toTopupMintQuoteDraft = (
  value: PendingTopupQuoteStorage,
): TopupMintQuoteDraft => ({
  mintUrl: value.mintUrl,
  quote: value.quote,
  amount: value.amount,
  invoice: typeof value.invoice === "string" ? value.invoice : null,
  unit: value.unit,
});

const toPendingTopupQuoteStorage = (
  value: TopupMintQuoteDraft,
): PendingTopupQuoteStorage => ({
  mintUrl: value.mintUrl,
  quote: value.quote,
  amount: value.amount,
  invoice: value.invoice,
  unit: value.unit,
  createdAtMs: Date.now(),
});

const isPendingTopupQuoteStorage = (
  value: unknown,
): value is PendingTopupQuoteStorage => {
  if (typeof value !== "object" || value === null) return false;

  const amount = readObjectField(value, "amount");
  const createdAtMs = readObjectField(value, "createdAtMs");
  const invoice = readObjectField(value, "invoice");
  const mintUrl = readObjectField(value, "mintUrl");
  const quote = readObjectField(value, "quote");
  const unit = readObjectField(value, "unit");

  return (
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount > 0 &&
    typeof createdAtMs === "number" &&
    Number.isFinite(createdAtMs) &&
    (invoice === undefined ||
      invoice === null ||
      typeof invoice === "string") &&
    typeof mintUrl === "string" &&
    mintUrl.trim().length > 0 &&
    typeof quote === "string" &&
    quote.trim().length > 0 &&
    (unit === null || typeof unit === "string")
  );
};

const isClaimedTopupQuoteStorage = (
  value: unknown,
): value is ClaimedTopupQuoteStorage => {
  if (typeof value !== "object" || value === null) return false;

  const amount = readObjectField(value, "amount");
  const claimedAtMs = readObjectField(value, "claimedAtMs");
  const mintUrl = readObjectField(value, "mintUrl");
  const quote = readObjectField(value, "quote");
  const token = readObjectField(value, "token");
  const unit = readObjectField(value, "unit");

  return (
    typeof amount === "number" &&
    typeof claimedAtMs === "number" &&
    typeof mintUrl === "string" &&
    typeof quote === "string" &&
    typeof token === "string" &&
    (unit === null || typeof unit === "string")
  );
};

const makeClaimedTopupQuoteStorageKey = (args: {
  mintUrl: string;
  ownerId: string;
  quote: string;
}): string => {
  return `${CLAIMED_TOPUP_QUOTE_STORAGE_KEY_PREFIX}.${encodeStorageSegment(
    args.ownerId,
  )}.${encodeStorageSegment(args.mintUrl)}.${encodeStorageSegment(args.quote)}`;
};

const makeClaimedTopupQuoteLockKey = (args: {
  mintUrl: string;
  ownerId: string;
  quote: string;
}): string => {
  return `${CLAIMED_TOPUP_QUOTE_LOCK_STORAGE_KEY_PREFIX}.${encodeStorageSegment(
    args.ownerId,
  )}.${encodeStorageSegment(args.mintUrl)}.${encodeStorageSegment(args.quote)}`;
};

const readClaimedTopupQuoteFromStorage = (
  key: string,
): ClaimedTopupQuoteStorage | null => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isClaimedTopupQuoteStorage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const readPendingTopupQuoteFromStorage = (
  key: string,
): PendingTopupQuoteStorage | null => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isPendingTopupQuoteStorage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const isOutputsAlreadySignedError = (error: unknown): boolean => {
  const message = getUnknownErrorMessage(error, "").toLowerCase();
  return (
    message.includes("outputs have already been signed") ||
    message.includes("already been signed before") ||
    message.includes("keyset id already signed")
  );
};

interface TopupMintProofsWalletLike {
  keysetId: string;
  mintProofs: (
    amount: number,
    quote: string,
    options?: { counter?: number },
  ) => Promise<Proof[]>;
  unit: string;
}

const mintTopupProofs = async (args: {
  amount: number;
  mintUrl: string;
  quoteId: string;
  unit: string | null;
  wallet: TopupMintProofsWalletLike;
}): Promise<Proof[]> => {
  const det = getCashuDeterministicSeedFromStorage();
  const unit = String(args.wallet.unit ?? args.unit ?? "").trim();
  const keysetId = String(args.wallet.keysetId ?? "").trim();

  if (!(det && unit && keysetId)) {
    return await args.wallet.mintProofs(args.amount, args.quoteId);
  }

  return await withCashuDeterministicCounterLock(
    {
      mintUrl: args.mintUrl,
      unit,
      keysetId,
    },
    async () => {
      let counter = getCashuDeterministicCounter({
        mintUrl: args.mintUrl,
        unit,
        keysetId,
      });
      let proofs: Proof[] | null = null;
      let lastError: unknown;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          proofs = await args.wallet.mintProofs(args.amount, args.quoteId, {
            counter,
          });
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (!isOutputsAlreadySignedError(error)) throw error;

          bumpCashuDeterministicCounter({
            mintUrl: args.mintUrl,
            unit,
            keysetId,
            used: 64,
          });
          counter = getCashuDeterministicCounter({
            mintUrl: args.mintUrl,
            unit,
            keysetId,
          });
        }
      }

      if (!proofs) throw lastError ?? new Error("mint failed");

      bumpCashuDeterministicCounter({
        mintUrl: args.mintUrl,
        unit,
        keysetId,
        used: proofs.length,
      });

      return proofs;
    },
  );
};

const logPayStep = (step: string, data?: PaymentLogData): void => {
  try {
    console.log("[linky][pay]", step, data ?? {});
  } catch {
    // ignore logging errors
  }
};

interface UnknownChatContact extends ContactRowLike {
  id: string;
  isUnknownContact: true;
  unknownPubkeyHex: string | null;
}

type DisplayContact = ContactRowLike & {
  isUnknownContact?: boolean;
  unknownPubkeyHex?: string | null;
};

interface ChatSelectedContact {
  groupName?: string | null;
  id: string;
  isUnknownContact?: boolean;
  lnAddress?: string | null;
  name?: string | null;
  npub?: string | null;
  unknownPubkeyHex?: string | null;
}

const encodeUnknownNpub = (pubkeyHex: string | null): string | null => {
  if (!pubkeyHex) return null;
  try {
    return nip19.npubEncode(pubkeyHex);
  } catch {
    return null;
  }
};

export const useAppShellComposition = () => {
  const { insert, update, upsert } = useEvolu();

  const hasMintOverrideRef = React.useRef(false);

  const appOwnerIdRef = React.useRef<Evolu.OwnerId | null>(null);
  const cashuOwnerIdRef = React.useRef<Evolu.OwnerId | null>(null);
  const messagesOwnerIdRef = React.useRef<Evolu.OwnerId | null>(null);
  const {
    logPaymentEvent,
    makeLocalStorageKey,
    readSeenMintsFromStorage,
    rememberSeenMint,
  } = useOwnerScopedStorage({
    appOwnerIdRef,
  });

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

  const [status, setStatus] = useState<string | null>(null);
  const importDataFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [recentlyReceivedToken, setRecentlyReceivedToken] = useState<null | {
    token: string;
    amount: number | null;
  }>(null);
  const recentlyReceivedTokenTimerRef = React.useRef<number | null>(null);

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
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() =>
    getInitialDisplayCurrency(),
  );
  const [payWithCashuEnabled, setPayWithCashuEnabled] = useState<boolean>(() =>
    getInitialPayWithCashuEnabled(),
  );
  const [lightningInvoiceAutoPayLimit, setLightningInvoiceAutoPayLimit] =
    useState<number>(() => getInitialLightningInvoiceAutoPayLimit());
  const [allowPromisesEnabled] = useState<boolean>(false);

  const fiatRates = useFiatRates();
  const displayUnit = getDisplayUnitLabel(displayCurrency, lang);
  const applyDisplayedAmountInputKey = React.useCallback(
    (currentAmount: string, key: string) =>
      applyAmountInputKey(currentAmount, key, {
        displayCurrency,
        fiatRates,
        lang,
      }),
    [displayCurrency, fiatRates, lang],
  );
  const formatDisplayedAmountParts = React.useCallback(
    (amountSat: number) =>
      formatDisplayAmountParts(amountSat, {
        displayCurrency,
        fiatRates,
        lang,
      }),
    [displayCurrency, fiatRates, lang],
  );
  const formatDisplayedAmountText = React.useCallback(
    (amountSat: number) =>
      formatDisplayAmountText(amountSat, {
        displayCurrency,
        fiatRates,
        lang,
      }),
    [displayCurrency, fiatRates, lang],
  );

  const [currentNsec, setCurrentNsec] = useState<string | null>(() =>
    getInitialNostrNsec(),
  );
  const [chatOwnPubkeyHex, setChatOwnPubkeyHex] = useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const storedNsec = await readStoredNostrNsec();
      if (cancelled) return;
      setCurrentNsec((current) =>
        current === storedNsec ? current : storedNsec,
      );
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Evolu is local-first; to get automatic cross-device/browser sync you must
  // "use" an owner (which starts syncing over configured transports).
  // We only enable it after the user has an nsec (our identity gate).
  const syncOwner = useEvoluSyncOwner(Boolean(currentNsec));

  useOwner(syncOwner);

  const evoluLastError = useEvoluLastError({ logToConsole: true });
  const evoluHasError = Boolean(evoluLastError);

  React.useEffect(() => {
    if (!currentNsec) {
      setChatOwnPubkeyHex(null);
      return;
    }

    let cancelled = false;
    void import("nostr-tools")
      .then(({ getPublicKey, nip19 }) => {
        const decoded = nip19.decode(currentNsec);
        if (decoded.type !== "nsec" || !(decoded.data instanceof Uint8Array)) {
          if (!cancelled) setChatOwnPubkeyHex(null);
          return;
        }
        if (!cancelled) {
          setChatOwnPubkeyHex(getPublicKey(decoded.data));
        }
      })
      .catch(() => {
        if (!cancelled) setChatOwnPubkeyHex(null);
      });

    return () => {
      cancelled = true;
    };
  }, [currentNsec]);

  React.useEffect(() => {
    void (async () => {
      try {
        if (currentNsec) {
          await setStoredPushNsec(currentNsec);
        } else {
          await clearStoredPushNsec();
        }
      } catch {
        // ignore
      }
    })();
  }, [currentNsec]);

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

  const appOwnerId = syncOwner?.id ?? null;
  const pendingTopupStorageKey = `${LOCAL_PENDING_TOPUP_QUOTE_STORAGE_KEY_PREFIX}.${String(appOwnerId ?? "anon")}`;

  useAnonymousPaymentTelemetry({
    appOwnerId,
    makeLocalStorageKey,
  });

  React.useEffect(() => {
    appOwnerIdRef.current = appOwnerId;
    if (!appOwnerId) return;
    const overrideKey = makeLocalStorageKey(
      CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY,
    );
    const overrideRaw = safeLocalStorageGet(overrideKey);
    const override = normalizeMintUrl(overrideRaw);
    const shouldSeedMainMint =
      safeLocalStorageGet(CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY) === "1";

    if (!override && shouldSeedMainMint) {
      const seededMint = normalizeMintUrl(MAIN_MINT_URL);
      if (seededMint) {
        safeLocalStorageSet(overrideKey, seededMint);
        safeLocalStorageRemove(CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY);
        hasMintOverrideRef.current = true;
        setDefaultMintUrl(seededMint);
        setDefaultMintUrlDraft(seededMint);
        return;
      }
    }

    if (override) {
      hasMintOverrideRef.current = true;
      setDefaultMintUrl(override);
      setDefaultMintUrlDraft(override);
    } else {
      if (shouldSeedMainMint) {
        safeLocalStorageRemove(CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY);
      }
      hasMintOverrideRef.current = false;
    }
  }, [appOwnerId, makeLocalStorageKey]);

  const resolveOwnerIdForWrite = React.useCallback(async () => {
    if (cashuOwnerIdRef.current) return cashuOwnerIdRef.current;
    try {
      const owner = await evolu.appOwner;
      return owner?.id ?? null;
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
      const failMessage =
        translations[lang].evoluWipeStorageFailed ?? "evoluWipeStorageFailed";
      pushToast(failMessage);
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
  const [lnAddressPayAmount, setLnAddressPayAmount] = useState<string>("");

  const [topupAmount, setTopupAmount] = useState<string>("");
  const [topupInvoice, setTopupInvoice] = useState<string | null>(null);
  const [topupInvoiceQr, setTopupInvoiceQr] = useState<string | null>(null);
  const [topupInvoiceError, setTopupInvoiceError] = useState<string | null>(
    null,
  );
  const [topupInvoiceIsBusy, setTopupInvoiceIsBusy] = useState(false);
  const [topupMintQuote, setTopupMintQuote] =
    useState<TopupMintQuoteDraft | null>(null);

  React.useEffect(() => {
    if (!appOwnerId) {
      setTopupMintQuote(null);
      return;
    }

    const stored = readPendingTopupQuoteFromStorage(pendingTopupStorageKey);
    if (!stored) {
      safeLocalStorageRemove(pendingTopupStorageKey);
      setTopupMintQuote(null);
      return;
    }

    if (isExpiredPendingTopupQuote(stored.createdAtMs)) {
      safeLocalStorageRemove(pendingTopupStorageKey);
      setTopupMintQuote(null);
      return;
    }

    const nextQuote = toTopupMintQuoteDraft(stored);
    setTopupMintQuote((current) => {
      if (isSameTopupMintQuote(current, nextQuote)) return current;
      return nextQuote;
    });
  }, [appOwnerId, pendingTopupStorageKey]);

  React.useEffect(() => {
    if (!appOwnerId) return;

    if (!topupMintQuote) {
      safeLocalStorageRemove(pendingTopupStorageKey);
      return;
    }

    safeLocalStorageSet(
      pendingTopupStorageKey,
      JSON.stringify(toPendingTopupQuoteStorage(topupMintQuote)),
    );
  }, [appOwnerId, pendingTopupStorageKey, topupMintQuote]);

  const showRecentlyReceivedTokenToast = React.useCallback(
    (token: string, amount: number | null) => {
      if (recentlyReceivedTokenTimerRef.current !== null) {
        try {
          window.clearTimeout(recentlyReceivedTokenTimerRef.current);
        } catch {
          // ignore
        }
      }

      setRecentlyReceivedToken({ token, amount });
      recentlyReceivedTokenTimerRef.current = window.setTimeout(() => {
        setRecentlyReceivedToken(null);
        recentlyReceivedTokenTimerRef.current = null;
      }, 25_000);
    },
    [setRecentlyReceivedToken],
  );

  const [chatDraft, setChatDraft] = useState<string>("");
  const [chatSendIsBusy, setChatSendIsBusy] = useState(false);
  const [replyContext, setReplyContext] = useState<ReplyContext | null>(null);
  const replyContextRef = React.useRef<ReplyContext | null>(null);
  const [editContext, setEditContext] = useState<EditChatContext | null>(null);
  const activeNostrMessagePublishClientIdsRef = React.useRef<Set<string>>(
    new Set(),
  );
  const chatSeenWrapIdsRef = React.useRef<Set<string>>(new Set());
  const autoAcceptedChatMessageIdsRef = React.useRef<Set<string>>(new Set());
  const activeChatRouteId = route.kind === "chat" ? String(route.id ?? "") : "";

  React.useEffect(() => {
    if (route.kind === "chat") return;
    setReplyContext(null);
    setEditContext(null);
  }, [route.kind]);

  React.useEffect(() => {
    if (!activeChatRouteId) return;
    setReplyContext(null);
    setEditContext(null);
  }, [activeChatRouteId]);

  React.useEffect(() => {
    replyContextRef.current = replyContext;
  }, [replyContext]);

  React.useEffect(() => {
    for (const [npub, url] of Object.entries(nostrPictureByNpub)) {
      inMemoryNostrPictureCache.set(npub, url ?? null);
    }
  }, [nostrPictureByNpub]);

  const [profileQrIsOpen, setProfileQrIsOpen] = useState(false);
  const [
    pendingLightningInvoiceConfirmation,
    setPendingLightningInvoiceConfirmation,
  ] = useState<LightningInvoicePreview | null>(null);

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
  const pendingUnknownContactAddRef = React.useRef<{
    sourceContactId: string;
    targetNpub: string;
  } | null>(null);

  const t = React.useCallback(
    (key: string) => (hasTranslationKey(key) ? translations[lang][key] : key),
    [lang],
  );

  const {
    paidOverlayIsOpen,
    paidOverlayTitle,
    showPaidOverlay,
    topupPaidNavTimerRef,
  } = usePaidOverlayState({
    t,
  });

  const finalizeTopupInvoicePaid = React.useCallback(
    (amountSat: number) => {
      if (topupInvoicePaidHandledRef.current) return;

      topupInvoicePaidHandledRef.current = true;
      topupInvoiceStartBalanceRef.current = null;
      setTopupAmount("");
      setTopupInvoice(null);
      setTopupInvoiceQr(null);
      setTopupInvoiceError(null);
      setTopupInvoiceIsBusy(false);

      const displayAmount = formatDisplayedAmountParts(amountSat);
      showPaidOverlay(
        t("topupOverlay")
          .replace(
            "{amount}",
            `${displayAmount.approxPrefix}${displayAmount.amountText}`,
          )
          .replace("{unit}", displayAmount.unitLabel),
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
    },
    [
      formatDisplayedAmountParts,
      setTopupAmount,
      setTopupInvoice,
      setTopupInvoiceError,
      setTopupInvoiceIsBusy,
      setTopupInvoiceQr,
      showPaidOverlay,
      t,
      topupPaidNavTimerRef,
    ],
  );

  const {
    confirmPendingOnboardingProfile,
    createNewAccount,
    currentNpub,
    isSeedLogin,
    logoutArmed,
    onboardingIsBusy,
    onboardingPhotoInputRef,
    onboardingStep,
    openReturningOnboarding,
    onPendingOnboardingPhotoSelected,
    pasteReturningSlip39FromClipboard,
    pickPendingOnboardingPhoto,
    requestDeriveNostrKeys,
    requestLogout,
    seedMnemonic,
    selectReturningSlip39Suggestion,
    selectPendingOnboardingAvatar,
    slip39Seed,
    setReturningSlip39Input,
    setOnboardingStep,
    setPendingOnboardingName,
    submitReturningSlip39,
  } = useProfileAuthComposition({
    currentNsec,
    pushToast,
    t,
  });

  const contactsForRotationRef = React.useRef<readonly ContactRowLike[]>([]);

  const {
    cashuOwnerId,
    cashuOwnerEditsUntilRotation,
    cashuSyncOwner,
    contactsBackupOwnerId,
    contactsSyncOwner,
    contactsOwnerEditCount,
    contactsOwnerEditsUntilRotation,
    contactsOwnerId,
    contactsOwnerIndex,
    contactsOwnerNewContactsCount,
    contactsOwnerPointer,
    metaOwnerId,
    metaSyncOwner,
    messagesBackupOwnerId,
    messagesOwnerId,
    messagesOwnerEditsUntilRotation,
    messagesSyncOwner,
    recordContactsOwnerWrite,
    recordMessagesOwnerWrite,
    requestManualRotateContactsOwner,
    requestManualRotateMessagesOwner,
    rotateContactsOwnerIsBusy,
    rotateMessagesOwnerIsBusy,
  } = useEvoluContactsOwnerRotation({
    appOwnerId,
    getContactsForRotation: () => contactsForRotationRef.current,
    isSeedLogin,
    pushToast,
    slip39Seed,
    t,
    update,
    upsert,
  });

  useOwner(contactsSyncOwner);
  useOwner(cashuSyncOwner);
  useOwner(messagesSyncOwner);
  useOwner(metaSyncOwner);

  React.useEffect(() => {
    cashuOwnerIdRef.current = cashuOwnerId;
  }, [cashuOwnerId]);

  const evoluHistoryAllowedOwnerIds = React.useMemo(() => {
    const ids = [
      String(appOwnerId ?? "").trim(),
      String(contactsOwnerId ?? "").trim(),
      String(cashuOwnerId ?? "").trim(),
      String(contactsBackupOwnerId ?? "").trim(),
      String(messagesOwnerId ?? "").trim(),
      String(messagesBackupOwnerId ?? "").trim(),
      String(metaOwnerId ?? "").trim(),
    ].filter(Boolean);
    return Array.from(new Set(ids));
  }, [
    appOwnerId,
    cashuOwnerId,
    contactsBackupOwnerId,
    contactsOwnerId,
    messagesBackupOwnerId,
    messagesOwnerId,
    metaOwnerId,
  ]);

  const visibleMessageOwnerIds = React.useMemo(() => {
    const ids = [
      String(messagesOwnerId ?? "").trim(),
      String(messagesBackupOwnerId ?? "").trim(),
      String(appOwnerId ?? "").trim(),
    ].filter(Boolean);
    return Array.from(new Set(ids));
  }, [appOwnerId, messagesBackupOwnerId, messagesOwnerId]);

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

  useStoragePersistRequestEffect({ refreshKey: t });

  const maybeShowPwaNotification = React.useCallback(
    async (title: string, body: string, tag?: string) => {
      await showPwaNotification({
        appTitle: t("appTitle"),
        body,
        title,
        ...(tag === undefined ? {} : { tag }),
      });
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

  useRouteAmountResetEffects({
    contactPayBackToChatRef,
    contactsHeaderVisible,
    routeKind: route.kind,
    setLnAddressPayAmount,
    setPayAmount,
  });

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
    topupMintQuote,
    topupPaidNavTimerRef,
    topupRefreshKey: myProfileName,
    setTopupAmount,
    setTopupInvoice,
    setTopupInvoiceError,
    setTopupInvoiceIsBusy,
    setTopupInvoiceQr,
    setTopupMintQuote,
  });

  useAppPreferences({
    allowPromisesEnabled,
    displayCurrency,
    lang,
    lightningInvoiceAutoPayLimit,
    payWithCashuEnabled,
  });

  useArmedDeleteTimeouts({
    pendingCashuDeleteId,
    pendingDeleteId,
    pendingEvoluServerDeleteUrl,
    pendingMintDeleteUrl,
    setPendingCashuDeleteId,
    setPendingDeleteId,
    setPendingEvoluServerDeleteUrl,
    setPendingMintDeleteUrl,
  });

  useStatusToasts({
    pushToast,
    setStatus,
    status,
  });

  const {
    activeGroup,
    contacts,
    contactsSearch,
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
    appOwnerId: contactsOwnerId,
    currentNsec,
    isSeedLogin,
    noGroupFilterValue: NO_GROUP_FILTER,
    pushToast,
    route,
    t,
    update,
    upsert,
  });

  React.useEffect(() => {
    contactsForRotationRef.current = contacts;
  }, [contacts]);

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

  const activeCashuOwnerId = String(cashuOwnerId ?? "").trim();
  const readCashuRowOwnerId = React.useCallback((row: unknown): string => {
    if (typeof row !== "object" || row === null) return "";
    if (!("ownerId" in row)) return "";
    const ownerId = row.ownerId;
    if (typeof ownerId !== "string") return "";
    return ownerId.trim();
  }, []);

  const cashuTokensFiltered = React.useMemo(() => {
    if (!activeCashuOwnerId) return [] as typeof cashuTokens;
    return cashuTokens.filter(
      (row) => readCashuRowOwnerId(row) === activeCashuOwnerId,
    );
  }, [activeCashuOwnerId, cashuTokens, readCashuRowOwnerId]);

  const cashuTokensAllFiltered = React.useMemo(() => {
    if (!activeCashuOwnerId) return [] as typeof cashuTokensAll;
    return cashuTokensAll.filter(
      (row) => readCashuRowOwnerId(row) === activeCashuOwnerId,
    );
  }, [activeCashuOwnerId, cashuTokensAll, readCashuRowOwnerId]);

  const cashuTokensWithMeta = useMemo(
    () =>
      cashuTokensFiltered.map((row) => {
        const meta = extractCashuTokenMeta({
          amount: row.amount,
          mint: row.mint,
          rawToken: row.rawToken,
          token: row.token,
          unit: row.unit,
        });
        return {
          ...row,
          mint: meta.mint ?? null,
          unit: meta.unit ?? null,
          amount: meta.amount ?? null,
          tokenText: meta.tokenText,
        };
      }),
    [cashuTokensFiltered],
  );

  const {
    cashuTokensHydratedRef,
    ensureCashuTokenPersisted,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    rememberCashuTokenKnown,
  } = useCashuDomain({
    appOwnerId: cashuOwnerId,
    appOwnerIdRef: cashuOwnerIdRef,
    cashuTokensAll,
    insert,
    logPaymentEvent,
  });

  const migratedMisplacedCashuTokenIdsRef = React.useRef<Set<string>>(
    new Set(),
  );

  React.useEffect(() => {
    if (!appOwnerId) return;

    const sourceOwnerId = String(appOwnerId ?? "").trim();
    if (!sourceOwnerId) return;
    if (!activeCashuOwnerId) return;
    if (sourceOwnerId === activeCashuOwnerId) return;
    if (!cashuOwnerId) return;

    const activeRows = cashuTokensAll.filter((row) => {
      if (row.isDeleted) return false;
      return readCashuRowOwnerId(row) === activeCashuOwnerId;
    });

    const hasActiveDuplicate = (row: (typeof cashuTokensAll)[number]) => {
      const rowCandidates = [
        String(row.rawToken ?? "").trim(),
        String(row.token ?? "").trim(),
      ].filter(Boolean);
      if (rowCandidates.length === 0) return false;

      return activeRows.some((activeRow) => {
        const activeCandidates = [
          String(activeRow.rawToken ?? "").trim(),
          String(activeRow.token ?? "").trim(),
        ].filter(Boolean);

        return rowCandidates.some((candidate) =>
          activeCandidates.includes(candidate),
        );
      });
    };

    const misplacedRows = cashuTokensAll.filter((row) => {
      if (row.isDeleted) return false;
      return readCashuRowOwnerId(row) === sourceOwnerId;
    });

    for (const row of misplacedRows) {
      const rowId = String(row.id ?? "").trim();
      if (!rowId) continue;
      if (migratedMisplacedCashuTokenIdsRef.current.has(rowId)) continue;

      migratedMisplacedCashuTokenIdsRef.current.add(rowId);

      if (!hasActiveDuplicate(row)) {
        const token = String(row.token ?? row.rawToken ?? "").trim();
        const rawToken = String(row.rawToken ?? "").trim();
        const mint = String(row.mint ?? "").trim();
        const unit = String(row.unit ?? "").trim();
        const state = String(row.state ?? "").trim() || "accepted";
        const error = String(row.error ?? "").trim();
        const amount = Number(row.amount ?? 0);

        if (token) {
          const payload: {
            token: typeof Evolu.NonEmptyString.Type;
            state: typeof Evolu.NonEmptyString100.Type;
            amount?: typeof Evolu.PositiveInt.Type;
            error?: typeof Evolu.NonEmptyString1000.Type;
            mint?: typeof Evolu.NonEmptyString1000.Type;
            rawToken?: typeof Evolu.NonEmptyString.Type;
            unit?: typeof Evolu.NonEmptyString100.Type;
          } = {
            token: token as typeof Evolu.NonEmptyString.Type,
            state: state as typeof Evolu.NonEmptyString100.Type,
          };

          if (rawToken) {
            payload.rawToken = rawToken as typeof Evolu.NonEmptyString.Type;
          }
          if (mint) {
            payload.mint = mint as typeof Evolu.NonEmptyString1000.Type;
          }
          if (unit) {
            payload.unit = unit as typeof Evolu.NonEmptyString100.Type;
          }
          if (Number.isFinite(amount) && amount > 0) {
            payload.amount = Math.trunc(
              amount,
            ) as typeof Evolu.PositiveInt.Type;
          }
          if (error) {
            payload.error = error as typeof Evolu.NonEmptyString1000.Type;
          }

          insert("cashuToken", payload, { ownerId: cashuOwnerId });
        }
      }

      update(
        "cashuToken",
        {
          id: row.id as CashuTokenId,
          isDeleted: Evolu.sqliteTrue,
        },
        { ownerId: appOwnerId },
      );
    }
  }, [
    activeCashuOwnerId,
    appOwnerId,
    cashuOwnerId,
    cashuTokensAll,
    insert,
    readCashuRowOwnerId,
    update,
  ]);

  React.useEffect(() => {
    if (!topupMintQuote) return;

    let cancelled = false;
    const run = async () => {
      try {
        const quoteId = String(topupMintQuote.quote ?? "").trim();
        if (!quoteId) return;

        const topupOwnerKey = String(appOwnerId ?? "anon");
        const claimStorageKey = makeClaimedTopupQuoteStorageKey({
          ownerId: topupOwnerKey,
          mintUrl: topupMintQuote.mintUrl,
          quote: quoteId,
        });
        const claimLockKey = makeClaimedTopupQuoteLockKey({
          ownerId: topupOwnerKey,
          mintUrl: topupMintQuote.mintUrl,
          quote: quoteId,
        });

        const insertClaimedTopupToken = async (
          claimed: ClaimedTopupQuoteStorage,
        ) => {
          if (isCashuTokenKnownAny(claimed.token)) return true;

          const ownerId = await resolveOwnerIdForWrite();
          const payload = {
            token: claimed.token as typeof Evolu.NonEmptyString.Type,
            state: "accepted" as typeof Evolu.NonEmptyString100.Type,
          };

          const result = ownerId
            ? insert("cashuToken", payload, { ownerId })
            : insert("cashuToken", payload);
          if (!result.ok) {
            setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
            return false;
          }

          return true;
        };

        const claimedBeforeRun =
          readClaimedTopupQuoteFromStorage(claimStorageKey);
        if (claimedBeforeRun) {
          const restored = await insertClaimedTopupToken(claimedBeforeRun);
          if (restored && !cancelled) {
            if (route.kind === "topupInvoice" && claimedBeforeRun.amount > 0) {
              finalizeTopupInvoicePaid(claimedBeforeRun.amount);
            }
            setTopupMintQuote(null);
          }
          return;
        }

        const { CashuMint, CashuWallet, MintQuoteState, getEncodedToken } =
          await getCashuLib();
        await withLocalStorageLeaseLock({
          key: claimLockKey,
          ttlMs: 15_000,
          timeoutMs: 2_000,
          waitMs: 50,
          fn: async () => {
            const alreadyClaimed =
              readClaimedTopupQuoteFromStorage(claimStorageKey);
            if (alreadyClaimed) {
              const restored = await insertClaimedTopupToken(alreadyClaimed);
              if (restored && !cancelled) {
                if (
                  route.kind === "topupInvoice" &&
                  alreadyClaimed.amount > 0
                ) {
                  finalizeTopupInvoicePaid(alreadyClaimed.amount);
                }
                setTopupMintQuote(null);
              }
              return;
            }

            const det = getCashuDeterministicSeedFromStorage();
            const wallet = await createLoadedCashuWallet({
              CashuMint,
              CashuWallet,
              mintUrl: topupMintQuote.mintUrl,
              ...(topupMintQuote.unit ? { unit: topupMintQuote.unit } : {}),
              ...(det ? { bip39seed: det.bip39seed } : {}),
            });

            const status = await wallet.checkMintQuote(quoteId);
            const quoteState = readMintQuoteState(status);
            if (!isClaimableMintQuoteState(quoteState, MintQuoteState)) {
              return;
            }

            const unit = wallet.unit ?? topupMintQuote.unit ?? null;
            const proofs = await mintTopupProofs({
              amount: topupMintQuote.amount,
              mintUrl: topupMintQuote.mintUrl,
              quoteId,
              unit,
              wallet,
            });
            const token = String(
              getEncodedToken({
                mint: topupMintQuote.mintUrl,
                proofs,
                ...(unit ? { unit } : {}),
              }) ?? "",
            ).trim();
            if (!token) throw new Error("Mint produced empty token");

            safeLocalStorageSetJson(claimStorageKey, {
              amount: topupMintQuote.amount,
              claimedAtMs: Date.now(),
              mintUrl: topupMintQuote.mintUrl,
              quote: quoteId,
              token,
              unit,
            });

            if (!isCashuTokenKnownAny(token)) {
              const ownerId = await resolveOwnerIdForWrite();
              const payload = {
                token: token as typeof Evolu.NonEmptyString.Type,
                state: "accepted" as typeof Evolu.NonEmptyString100.Type,
              };

              const result = ownerId
                ? insert("cashuToken", payload, { ownerId })
                : insert("cashuToken", payload);
              if (!result.ok) {
                setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
                return;
              }
            }

            showRecentlyReceivedTokenToast(
              token,
              topupMintQuote.amount > 0 ? topupMintQuote.amount : null,
            );

            if (route.kind === "topupInvoice") {
              finalizeTopupInvoicePaid(topupMintQuote.amount);
            } else {
              const displayAmount = formatDisplayedAmountParts(
                topupMintQuote.amount,
              );
              showPaidOverlay(
                t("topupOverlay")
                  .replace(
                    "{amount}",
                    `${displayAmount.approxPrefix}${displayAmount.amountText}`,
                  )
                  .replace("{unit}", displayAmount.unitLabel),
              );
            }

            if (!cancelled) setTopupMintQuote(null);
          },
        });
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
    appOwnerId,
    formatDisplayedAmountParts,
    finalizeTopupInvoicePaid,
    insert,
    isCashuTokenKnownAny,
    resolveOwnerIdForWrite,
    topupMintQuote,
    t,
    route.kind,
    showRecentlyReceivedTokenToast,
    showPaidOverlay,
    setStatus,
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
    cashuTokensAll: cashuTokensAllFiltered,
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
      cashuTokens: cashuTokensFiltered.map((t) => ({
        id: String(t.id ?? ""),
        mint: String(t.mint ?? ""),
        amount: Number(t.amount ?? 0) || 0,
        state: String(t.state ?? ""),
      })),
      cashuTokensAll: {
        count: cashuTokensAllFiltered.length,
        newest10: cashuTokensAllFiltered.slice(0, 10).map((t) => ({
          id: String(t.id ?? ""),
          mint: String(t.mint ?? ""),
          amount: Number(t.amount ?? 0) || 0,
          state: String(t.state ?? ""),
          isDeleted: Boolean(t.isDeleted),
        })),
      },
    });
  }, [cashuTokensAllFiltered, cashuTokensFiltered, currentNpub, currentNsec]);

  const {
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    enqueuePendingPayment,
    lastMessageByContactId,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    nostrReactionsLocal,
    pendingPayments,
    reactionsByMessageId,
    reassignLocalNostrMessagesContactId,
    removeLocalNostrMessagesByContactId,
    removePendingPayment,
    softDeleteLocalNostrReaction,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  } = useMessagesDomain({
    appOwnerId,
    appOwnerIdRef,
    chatForceScrollToBottomRef,
    chatMessagesRef,
    messagesOwnerId,
    messagesOwnerIdRef,
    recordMessagesOwnerWrite,
    route,
    visibleMessageOwnerIds,
  });

  React.useEffect(() => {
    const pendingTokens = cashuTokensAllFiltered.filter((row) => {
      const state = String(row.state ?? "");
      if (state !== "pending") return false;
      const isDeleted = Boolean(row.isDeleted);
      return !isDeleted;
    });
    if (pendingTokens.length === 0) return;

    for (const row of pendingTokens) {
      const tokenText = String(row.token ?? row.rawToken ?? "").trim();
      if (!tokenText) continue;
      const hasMessage = nostrMessagesLocal.some((m) => {
        const isOut = String(m.direction ?? "") === "out";
        const matches = String(m.content ?? "").trim() === tokenText;
        const status = String(m.status ?? "sent");
        return isOut && matches && status !== "pending";
      });
      if (!hasMessage) continue;
      const payload = {
        id: row.id as CashuTokenId,
        isDeleted: Evolu.sqliteTrue,
      };
      if (cashuOwnerId) {
        update("cashuToken", payload, { ownerId: cashuOwnerId });
      } else {
        update("cashuToken", payload);
      }
    }
  }, [cashuOwnerId, cashuTokensAllFiltered, nostrMessagesLocal, update]);

  // lastMessageByContactId provided by the derived Nostr index above.

  const cashuBalance = useMemo(() => {
    return cashuTokensWithMeta.reduce((sum, token) => {
      if (!isCashuTokenAcceptedState(token.state)) return sum;
      const amount = Number(token.amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [cashuTokensWithMeta]);

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

    finalizeTopupInvoicePaid(amountSat);
  }, [
    cashuBalance,
    finalizeTopupInvoicePaid,
    formatDisplayedAmountParts,
    route.kind,
    showPaidOverlay,
    t,
    topupAmount,
    topupInvoice,
    topupInvoiceIsBusy,
    topupPaidNavTimerRef,
    topupInvoiceQr,
  ]);

  const [contactNewPrefill, setContactNewPrefill] = React.useState<null | {
    lnAddress: string;
    npub: string | null;
    suggestedName: string | null;
  }>(null);
  const [pendingDeepLinkText, setPendingDeepLinkText] = React.useState<
    string | null
  >(() => {
    const stored = String(
      safeLocalStorageGet(PENDING_DEEP_LINK_TEXT_STORAGE_KEY) ?? "",
    ).trim();
    return stored || null;
  });

  const updatePendingDeepLinkText = React.useCallback(
    (value: string | null) => {
      const normalized = String(value ?? "").trim();

      if (!normalized) {
        safeLocalStorageRemove(PENDING_DEEP_LINK_TEXT_STORAGE_KEY);
        setPendingDeepLinkText(null);
        return;
      }

      safeLocalStorageSet(PENDING_DEEP_LINK_TEXT_STORAGE_KEY, normalized);
      setPendingDeepLinkText(normalized);
    },
    [],
  );

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
    enqueueCashuOp,
    ensureCashuTokenPersisted,
    formatDisplayedAmountParts,
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
    rememberCashuTokenKnown,
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
    appOwnerId: contactsOwnerId,
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

  const [unknownNameByNpub, setUnknownNameByNpub] = useState<
    Record<string, string | null>
  >({});

  const buildUnknownDisplayName = React.useCallback(
    (name: string | null, npub: string | null) => {
      const prefix = t("unknownContactNamePrefix");
      const normalizedName = String(name ?? "").trim();
      const fallback = npub ? formatShortNpub(npub) : t("unknownContactTitle");
      return `${prefix} ${normalizedName || fallback}`.trim();
    },
    [t],
  );

  const buildSavedContactName = React.useCallback(
    (name: string | null, npub: string | null) => {
      const normalizedName = String(name ?? "").trim();
      return (
        normalizedName ||
        (npub ? formatShortNpub(npub) : t("unknownContactTitle"))
      );
    },
    [t],
  );

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

  const unknownContacts = React.useMemo<UnknownChatContact[]>(() => {
    const blockedPubkeys = new Set(
      safeLocalStorageGetJson(BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY, [])
        .map((entry) => normalizePubkeyHex(entry))
        .filter((entry): entry is string => Boolean(entry)),
    );

    const unknownById = new Map<string, UnknownChatContact>();

    for (const [contactId, lastMessage] of lastMessageByContactId.entries()) {
      const normalizedContactId = String(contactId ?? "").trim();
      if (!normalizedContactId) continue;
      if (!isUnknownContactId(normalizedContactId)) continue;

      const candidatePubkeyFromLast = normalizePubkeyHex(lastMessage.pubkey);
      const candidatePubkeyFromThread = nostrMessagesLocal
        .filter(
          (message) =>
            String(message.contactId ?? "").trim() === normalizedContactId,
        )
        .map((message) => normalizePubkeyHex(message.pubkey))
        .find((pubkey) => {
          if (!pubkey) return false;
          if (blockedPubkeys.has(pubkey)) return false;
          const ownPubkey = normalizePubkeyHex(chatOwnPubkeyHex);
          if (ownPubkey && ownPubkey === pubkey) return false;
          return true;
        });

      const unknownPubkeyHex =
        candidatePubkeyFromThread ?? candidatePubkeyFromLast ?? null;
      if (unknownPubkeyHex && blockedPubkeys.has(unknownPubkeyHex)) continue;

      const unknownNpub = encodeUnknownNpub(unknownPubkeyHex);
      const bestName = unknownNpub
        ? (unknownNameByNpub[unknownNpub] ?? null)
        : null;

      unknownById.set(normalizedContactId, {
        id: normalizedContactId,
        name: buildUnknownDisplayName(bestName, unknownNpub),
        npub: unknownNpub,
        lnAddress: null,
        groupName: null,
        isUnknownContact: true,
        unknownPubkeyHex,
      });
    }

    return Array.from(unknownById.values());
  }, [
    buildUnknownDisplayName,
    chatOwnPubkeyHex,
    lastMessageByContactId,
    nostrMessagesLocal,
    unknownNameByNpub,
  ]);

  const unknownContactNpubs = React.useMemo(() => {
    const seen = new Set<string>();
    const npubs: string[] = [];

    for (const contact of unknownContacts) {
      const npub = normalizeNpubIdentifier(contact.npub);
      if (!npub) continue;
      if (seen.has(npub)) continue;
      seen.add(npub);
      npubs.push(npub);
    }

    return npubs;
  }, [unknownContacts]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const npub of unknownContactNpubs) {
        if (unknownNameByNpub[npub] !== undefined) continue;

        const cached = loadCachedProfileMetadata(npub);
        if (cached) {
          const cachedName = cached.metadata
            ? getBestNostrName(cached.metadata)
            : null;
          if (!cancelled) {
            setUnknownNameByNpub((prev) =>
              prev[npub] !== undefined ? prev : { ...prev, [npub]: cachedName },
            );
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
          setUnknownNameByNpub((prev) => ({
            ...prev,
            [npub]: metadata ? getBestNostrName(metadata) : null,
          }));
        } catch {
          saveCachedProfileMetadata(npub, null);
          if (cancelled) return;
          setUnknownNameByNpub((prev) => ({
            ...prev,
            [npub]: null,
          }));
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
  }, [
    nostrFetchRelays,
    nostrMetadataInFlight,
    unknownContactNpubs,
    unknownNameByNpub,
  ]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const npub of unknownContactNpubs) {
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
            prev[npub] !== undefined ? prev : { ...prev, [npub]: cached.url },
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
            setNostrPictureByNpub((prev) => {
              const existing = prev[npub];
              if (typeof existing === "string" && existing.trim()) return prev;
              if (existing === null) return prev;
              return { ...prev, [npub]: null };
            });
          }
        } catch {
          saveCachedProfilePicture(npub, null);
          if (cancelled) return;
          setNostrPictureByNpub((prev) => {
            const existing = prev[npub];
            if (typeof existing === "string" && existing.trim()) return prev;
            if (existing === null) return prev;
            return { ...prev, [npub]: null };
          });
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
    nostrFetchRelays,
    nostrInFlight,
    nostrPictureByNpub,
    rememberBlobAvatarUrl,
    setNostrPictureByNpub,
    unknownContactNpubs,
  ]);

  const unknownContactById = React.useMemo(() => {
    const byId = new Map<string, UnknownChatContact>();
    for (const contact of unknownContacts) {
      const id = String(contact.id ?? "").trim();
      if (!id) continue;
      byId.set(id, contact);
    }
    return byId;
  }, [unknownContacts]);

  const selectedChatContact = React.useMemo<ChatSelectedContact | null>(() => {
    if (route.kind !== "chat") return null;

    const chatId = String(route.id ?? "").trim();
    if (!chatId) return null;

    const source = selectedContact ?? unknownContactById.get(chatId) ?? null;
    if (!source) return null;

    const normalizedId = String(source.id ?? "").trim();
    if (!normalizedId) return null;

    const normalizedNpub = normalizeNpubIdentifier(source.npub);
    const normalizedUnknownPubkeyHex = normalizePubkeyHex(
      readObjectField(source, "unknownPubkeyHex"),
    );
    const sourceGroupName = String(source.groupName ?? "").trim();
    const isUnknownContact =
      readObjectField(source, "isUnknownContact") === true;

    return {
      id: normalizedId,
      ...(sourceGroupName ? { groupName: sourceGroupName } : {}),
      ...(source.name !== undefined
        ? { name: String(source.name ?? "").trim() || null }
        : {}),
      ...(source.lnAddress !== undefined
        ? { lnAddress: String(source.lnAddress ?? "").trim() || null }
        : {}),
      ...(normalizedNpub ? { npub: normalizedNpub } : {}),
      ...(normalizedUnknownPubkeyHex
        ? { unknownPubkeyHex: normalizedUnknownPubkeyHex }
        : {}),
      ...(isUnknownContact ? { isUnknownContact: true } : {}),
    };
  }, [route, selectedContact, unknownContactById]);

  const displayContacts = React.useMemo<DisplayContact[]>(() => {
    return [...contacts, ...unknownContacts];
  }, [contacts, unknownContacts]);

  const displayContactsSearchData = React.useMemo(() => {
    return displayContacts.map((contact) => {
      const idKey = String(contact.id ?? "").trim();
      const groupName = String(contact.groupName ?? "").trim();
      const haystack = [
        contact.name,
        contact.npub,
        contact.lnAddress,
        contact.groupName,
        contact.unknownPubkeyHex,
      ]
        .map((value) =>
          String(value ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean)
        .join(" ");

      return {
        contact,
        idKey,
        groupName,
        haystack,
      };
    });
  }, [displayContacts]);

  const visibleContacts = useVisibleContacts<DisplayContact>({
    activeGroup,
    contactAttentionById,
    contactNameCollator,
    contactsSearchData: displayContactsSearchData,
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
    appOwnerId: contactsOwnerId,
    contactNewPrefill,
    contacts,
    currentNpub,
    insert,
    nostrFetchRelays,
    route,
    selectedContact,
    setContactNewPrefill,
    setPendingDeleteId,
    recordContactsOwnerWrite,
    setStatus,
    t,
    update,
  });

  const closeContactDetail = () => {
    clearContactForm();
    setPendingDeleteId(null);
    navigateTo({ route: "contacts" });
  };

  const openNewContactPage = React.useCallback(() => {
    if (contacts.length >= MAX_CONTACTS_PER_OWNER) {
      const message = t("contactsLimitReached").replace(
        "{max}",
        String(MAX_CONTACTS_PER_OWNER),
      );
      pushToast(message);
      return;
    }

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
  }, [
    clearContactForm,
    contactNewPrefill,
    contacts.length,
    pushToast,
    setContactNewPrefill,
    setForm,
    t,
  ]);

  const canAddContact = contacts.length < MAX_CONTACTS_PER_OWNER;

  const { closeMenu, menuIsOpen, navigateToMainReturn, openMenu, toggleMenu } =
    useMainMenuState({
      onClose: () => {
        setPendingDeleteId(null);
      },
      onOpen: () => {
        setPendingDeleteId(null);
      },
      route,
    });

  const [contactPayMethod, setContactPayMethod] = useState<
    null | "cashu" | "lightning"
  >(null);
  useContactPayMethod({
    allowPromisesEnabled,
    payWithCashuEnabled,
    routeKind: route.kind,
    selectedContactLnAddress: String(selectedContact?.lnAddress ?? ""),
    selectedContactNpub: String(selectedContact?.npub ?? ""),
    setContactPayMethod,
  });

  const buildCashuMintCandidates = React.useCallback(
    (
      mintGroups: Map<string, { tokens: string[]; sum: number }>,
      preferredMint: string | null,
    ) => {
      return buildCashuMintCandidatesBase(
        mintGroups,
        normalizeMintUrl(preferredMint ?? ""),
        mintInfoByUrl,
      );
    },
    [mintInfoByUrl],
  );

  const publishWrappedWithRetry = React.useCallback(
    async (
      pool: AppNostrPool,
      relays: string[],
      wrapForMe: NostrToolsEvent,
      wrapForContact: NostrToolsEvent,
    ): Promise<PublishWrappedResult> => {
      return await publishWrappedWithRetryBase({
        pool,
        relays,
        wrapForMe,
        wrapForContact,
      });
    },
    [],
  );

  const publishSingleWrappedWithRetry = React.useCallback(
    async (
      pool: AppNostrPool,
      relays: string[],
      event: NostrToolsEvent,
    ): Promise<{ anySuccess: boolean; error: string | null }> => {
      return await publishSingleWrappedWithRetryBase({
        event,
        pool,
        relays,
      });
    },
    [],
  );

  const payContactWithCashuMessage = usePayContactWithCashuMessage<
    (typeof contacts)[number]
  >({
    activePublishClientIdsRef: activeNostrMessagePublishClientIdsRef,
    appendLocalNostrMessage,
    buildCashuMintCandidates,
    cashuBalance,
    cashuTokensWithMeta,
    chatSeenWrapIdsRef,
    currentNpub,
    currentNsec,
    defaultMintUrl,
    enqueuePendingPayment,
    formatDisplayedAmountParts,
    insert,
    logPayStep,
    logPaymentEvent,
    nostrMessagesLocal,
    payWithCashuEnabled,
    publishSingleWrappedWithRetry,
    publishWrappedWithRetry,
    pushToast,
    resolveOwnerIdForWrite,
    setContactsOnboardingHasPaid,
    setStatus,
    showPaidOverlay,
    t,
    update,
    updateLocalNostrMessage,
  });

  useNostrPendingFlush({
    activePublishClientIdsRef: activeNostrMessagePublishClientIdsRef,
    chatSeenWrapIdsRef,
    contacts,
    currentNsec,
    nostrMessagesLocal,
    nostrReactionsLocal,
    publishWrappedWithRetry,
    updateLocalNostrReaction,
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

  const paySelectedContact = React.useCallback(async () => {
    if (cashuIsBusy) return;
    if (route.kind !== "contactPay") return;
    if (!selectedContact) return;

    const amountSat = Number.parseInt(String(payAmount ?? "").trim(), 10);
    if (!Number.isFinite(amountSat) || amountSat <= 0) {
      setStatus(t("payInvalidAmount"));
      return;
    }

    const normalizedMethod =
      contactPayMethod === "lightning" || contactPayMethod === "cashu"
        ? contactPayMethod
        : "cashu";

    if (normalizedMethod === "lightning") {
      const lnAddress = String(selectedContact.lnAddress ?? "").trim();
      if (!lnAddress) {
        setStatus(t("payMissingLn"));
        return;
      }
      setLnAddressPayAmount(String(amountSat));
      navigateTo({ route: "lnAddressPay", lnAddress });
      return;
    }

    setCashuIsBusy(true);
    try {
      await payContactWithCashuMessage({
        contact: selectedContact,
        amountSat,
      });
    } finally {
      setCashuIsBusy(false);
    }
  }, [
    cashuIsBusy,
    contactPayMethod,
    payAmount,
    payContactWithCashuMessage,
    route.kind,
    selectedContact,
    setCashuIsBusy,
    setLnAddressPayAmount,
    setStatus,
    t,
  ]);

  const { payLightningAddressWithCashu, payLightningInvoiceWithCashu } =
    useLightningPaymentsDomain({
      buildCashuMintCandidates,
      canPayWithCashu,
      cashuBalance,
      cashuIsBusy,
      cashuOwnerId,
      cashuTokensWithMeta,
      contacts,
      defaultMintUrl,
      formatDisplayedAmountParts,
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

  const closeLightningInvoiceConfirmation = React.useCallback(() => {
    setPendingLightningInvoiceConfirmation(null);
  }, []);

  const confirmLightningInvoicePayment = React.useCallback(async () => {
    const pending = pendingLightningInvoiceConfirmation;
    if (!pending) return;

    const ok = await payLightningInvoiceWithCashu(pending.invoice);
    if (ok) setPendingLightningInvoiceConfirmation(null);
  }, [payLightningInvoiceWithCashu, pendingLightningInvoiceConfirmation]);

  const contactsOnboardingHasSentMessage = useMemo(() => {
    return nostrMessagesRecent.some((m) => String(m.direction ?? "") === "out");
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
    openWalletScan,
    scanAllowsManualContact,
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

  const openManualContactFromScan = React.useCallback(() => {
    closeScan();
    if (route.kind === "contactNew") return;
    openNewContactPage();
  }, [closeScan, openNewContactPage, route.kind]);

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

  const [walletWarningDismissed, setWalletWarningDismissed] =
    React.useState(false);

  const walletWarningApplies = cashuBalance > lightningInvoiceAutoPayLimit;

  React.useEffect(() => {
    if (!walletWarningApplies) {
      setWalletWarningDismissed(false);
    }
  }, [walletWarningApplies]);

  const dismissWalletWarning = React.useCallback(() => {
    setWalletWarningDismissed(true);
  }, []);

  const saveCashuFromText = useSaveCashuFromText({
    enqueueCashuOp,
    ensureCashuTokenPersisted,
    formatDisplayedAmountParts,
    insert,
    isCashuTokenStored,
    isMintDeleted,
    logPaymentEvent,
    mintInfoByUrl,
    recentlyReceivedTokenTimerRef,
    refreshMintInfo,
    resolveOwnerIdForWrite,
    rememberCashuTokenKnown,
    setCashuDraft,
    setCashuIsBusy,
    setRecentlyReceivedToken,
    setStatus,
    showPaidOverlay,
    t,
    touchMintInfo,
  });

  const handleDelete = (id: ContactId) => {
    const result = contactsOwnerId
      ? (() => {
          const scoped = update(
            "contact",
            { id, isDeleted: Evolu.sqliteTrue },
            { ownerId: contactsOwnerId },
          );
          if (scoped.ok) return scoped;
          return update("contact", { id, isDeleted: Evolu.sqliteTrue });
        })()
      : update("contact", { id, isDeleted: Evolu.sqliteTrue });
    if (result.ok) {
      recordContactsOwnerWrite();
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
    appOwnerId: cashuOwnerId,
    cashuBulkCheckIsBusy,
    cashuIsBusy,
    cashuTokensAll: cashuTokensAllFiltered,
    pendingCashuDeleteId,
    pushToast,
    setCashuBulkCheckIsBusy,
    setCashuIsBusy,
    setPendingCashuDeleteId,
    setStatus,
    t,
    update,
  });

  const copyText = React.useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard?.writeText(value);
        pushToast(t("copiedToClipboard"));
      } catch {
        pushToast(t("copyFailed"));
      }
    },
    [pushToast, t],
  );

  const shareText = React.useCallback(
    async (value: string) => {
      const text = String(value ?? "").trim();
      if (!text) {
        pushToast(t("errorPrefix"));
        return;
      }

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ text });
          return;
        } catch (error) {
          const errorName =
            typeof error === "object" &&
            error !== null &&
            "name" in error &&
            typeof error.name === "string"
              ? error.name
              : "";
          if (errorName === "AbortError") return;
        }
      }

      await copyText(text);
    },
    [copyText, pushToast, t],
  );

  const canWriteNfc = supportsNativeNfcWrite();
  const [nfcWritePromptKind, setNfcWritePromptKind] = React.useState<
    "profile" | "token" | null
  >(null);
  const nfcWriteCancelledByUserRef = React.useRef(false);

  const cancelPendingNfcWrite = React.useCallback(() => {
    nfcWriteCancelledByUserRef.current = true;
    setNfcWritePromptKind(null);
    cancelNativeNfcWrite();
  }, []);

  const writeNfcUriWithToast = React.useCallback(
    async (
      url: string,
      successKey: "nfcWriteProfileSuccess" | "nfcWriteTokenSuccess",
      promptKind: "profile" | "token",
    ): Promise<boolean> => {
      nfcWriteCancelledByUserRef.current = false;

      const result = await startNativeNfcWrite(url, (progress) => {
        if (progress.status === "armed") {
          setNfcWritePromptKind(promptKind);
        }
      });

      setNfcWritePromptKind(null);

      if (result === null || result.status === "unsupported") {
        pushToast(t("nfcWriteUnsupported"));
        return false;
      }

      if (result.status === "success") {
        pushToast(t(successKey));
        return true;
      }

      if (result.status === "disabled") {
        pushToast(t("nfcWriteDisabled"));
        return false;
      }

      if (result.status === "busy") {
        pushToast(t("nfcWriteBusy"));
        return false;
      }

      if (result.status === "cancelled") {
        if (nfcWriteCancelledByUserRef.current) {
          nfcWriteCancelledByUserRef.current = false;
          return false;
        }

        pushToast(t("nfcWriteCancelled"));
        return false;
      }

      nfcWriteCancelledByUserRef.current = false;

      const message = String(result.message ?? "").trim();
      pushToast(
        message ? `${t("nfcWriteFailed")}: ${message}` : t("nfcWriteFailed"),
      );

      return false;
    },
    [pushToast, t],
  );

  const writeCashuTokenToNfc = React.useCallback(
    async (id: CashuTokenId, tokenText: string) => {
      const trimmed = String(tokenText ?? "").trim();
      const deepLink = buildCashuDeepLink(trimmed);
      if (!deepLink) {
        pushToast(t("cashuInvalid"));
        return;
      }

      const wrote = await writeNfcUriWithToast(
        deepLink,
        "nfcWriteTokenSuccess",
        "token",
      );

      if (!wrote) return;

      const payload = {
        id,
        rawToken: trimmed as typeof Evolu.NonEmptyString.Type,
        state:
          CASHU_TOKEN_STATE_EXTERNALIZED as typeof Evolu.NonEmptyString100.Type,
        error: null,
      };

      const result = cashuOwnerId
        ? update("cashuToken", payload, { ownerId: cashuOwnerId })
        : update("cashuToken", payload);

      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
      }
    },
    [cashuOwnerId, pushToast, setStatus, t, update, writeNfcUriWithToast],
  );

  const shareCashuTokenDeepLink = React.useCallback(
    async (tokenText: string) => {
      const deepLink = buildCashuDeepLink(tokenText);
      if (!deepLink) {
        pushToast(t("cashuInvalid"));
        return;
      }

      await shareText(deepLink);
    },
    [pushToast, shareText, t],
  );

  const writeCurrentNpubToNfc = React.useCallback(async () => {
    const npub = normalizeNpubIdentifier(currentNpub);
    if (!npub) {
      pushToast(t("profileMissingNpub"));
      return;
    }

    await writeNfcUriWithToast(
      `nostr://${npub}`,
      "nfcWriteProfileSuccess",
      "profile",
    );
  }, [currentNpub, pushToast, t, writeNfcUriWithToast]);

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
      appOwnerId: contactsOwnerId,
      contacts,
      insert,
      pushToast,
      t,
      update,
    },
  );

  const clearContactAttention = React.useCallback((contactId: string) => {
    const normalizedContactId = String(contactId ?? "").trim();
    if (!normalizedContactId) return;

    setContactAttentionById((prev) => {
      if (prev[normalizedContactId] === undefined) return prev;
      const next = { ...prev };
      delete next[normalizedContactId];
      return next;
    });
  }, []);

  const openContactPay = (contactId: string, fromChat = false) => {
    const knownContact =
      contacts.find((row) => String(row.id ?? "").trim() === contactId) ?? null;
    if (!knownContact) return;

    contactPayBackToChatRef.current = fromChat ? knownContact.id : null;
    navigateTo({ route: "contactPay", id: knownContact.id });
  };

  const openContactDetail = (contact: DisplayContact) => {
    const contactId = String(contact.id ?? "").trim();
    if (!contactId) return;

    setPendingDeleteId(null);
    clearContactAttention(contactId);
    contactPayBackToChatRef.current = null;

    if (contact.isUnknownContact) {
      navigateTo({ route: "chat", id: contactId });
      return;
    }

    const knownContact =
      contacts.find((row) => String(row.id ?? "").trim() === contactId) ?? null;
    if (!knownContact) {
      navigateTo({ route: "contacts" });
      return;
    }

    const npub = String(knownContact.npub ?? "").trim();
    const ln = String(knownContact.lnAddress ?? "").trim();
    if (!npub) {
      if (ln) {
        openContactPay(knownContact.id);
        return;
      }
      navigateTo({ route: "contact", id: knownContact.id });
      return;
    }
    navigateTo({ route: "chat", id: String(knownContact.id) });
  };

  const addUnknownContactFromChat = React.useCallback(async () => {
    if (route.kind !== "chat") return;
    if (!selectedChatContact?.isUnknownContact) return;

    const contactId = String(selectedChatContact.id ?? "").trim();
    const npub = normalizeNpubIdentifier(selectedChatContact.npub);
    if (!contactId || !npub) {
      setStatus(t("chatUnknownContactAddFailed"));
      return;
    }

    const existing = contacts.find(
      (contact) => normalizeNpubIdentifier(contact.npub) === npub,
    );

    if (existing?.id) {
      reassignLocalNostrMessagesContactId(contactId, existing.id);
      clearContactAttention(contactId);
      setStatus(t("contactSaved"));
      navigateTo({ route: "chat", id: String(existing.id) });
      return;
    }

    const bestName = unknownNameByNpub[npub] ?? null;
    const savedName = buildSavedContactName(bestName, npub);
    const payload = {
      name: savedName as typeof Evolu.NonEmptyString1000.Type,
      npub: npub as typeof Evolu.NonEmptyString1000.Type,
      lnAddress: null,
      groupName: null,
    };

    pendingUnknownContactAddRef.current = {
      sourceContactId: contactId,
      targetNpub: npub,
    };

    const result = contactsOwnerId
      ? (() => {
          const scoped = insert("contact", payload, {
            ownerId: contactsOwnerId,
          });
          if (scoped.ok) return scoped;
          return insert("contact", payload);
        })()
      : insert("contact", payload);

    if (!result.ok) {
      pendingUnknownContactAddRef.current = null;
      setStatus(`${t("errorPrefix")}: ${String(result.error ?? "")}`);
      return;
    }

    recordContactsOwnerWrite();
  }, [
    clearContactAttention,
    contactsOwnerId,
    buildSavedContactName,
    contacts,
    insert,
    pendingUnknownContactAddRef,
    recordContactsOwnerWrite,
    reassignLocalNostrMessagesContactId,
    route.kind,
    selectedChatContact,
    setStatus,
    t,
    unknownNameByNpub,
  ]);

  const removeUnknownContactChatFromChat = React.useCallback(async () => {
    if (route.kind !== "chat") return;
    if (!selectedChatContact?.isUnknownContact) return;

    const confirmed = window.confirm(t("chatUnknownContactRemoveConfirm"));
    if (!confirmed) return;

    const contactId = String(selectedChatContact.id ?? "").trim();
    if (!contactId) return;

    removeLocalNostrMessagesByContactId(contactId);
    clearContactAttention(contactId);
    setStatus(t("chatUnknownContactRemoved"));
    navigateTo({ route: "contacts" });
  }, [
    clearContactAttention,
    removeLocalNostrMessagesByContactId,
    route.kind,
    selectedChatContact,
    setStatus,
    t,
  ]);

  React.useEffect(() => {
    const pending = pendingUnknownContactAddRef.current;
    if (!pending) return;

    const existing = contacts.find(
      (contact) =>
        normalizeNpubIdentifier(contact.npub) === pending.targetNpub &&
        Boolean(contact.id),
    );
    if (!existing?.id) return;

    pendingUnknownContactAddRef.current = null;
    reassignLocalNostrMessagesContactId(pending.sourceContactId, existing.id);
    clearContactAttention(pending.sourceContactId);
    setStatus(t("contactSaved"));
    navigateTo({ route: "chat", id: String(existing.id) });
  }, [
    clearContactAttention,
    contacts,
    reassignLocalNostrMessagesContactId,
    setStatus,
    t,
  ]);

  const renderContactCard = (contact: DisplayContact) => {
    const npub = normalizeNpubIdentifier(contact.npub);
    const avatarUrl = npub ? nostrPictureByNpub[npub] : null;
    const contactId = String(contact.id ?? "").trim();
    const last = contactId ? lastMessageByContactId.get(contactId) : null;
    const lastText = String(last?.content ?? "").trim();
    const tokenInfo = lastText ? getCashuTokenMessageInfo(lastText) : null;
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
        isUnknownContact={Boolean(contact.isUnknownContact)}
        tokenInfo={tokenInfo}
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

  const renderMainSwipeContactCard = (
    contact: ContactRowLike,
  ): React.ReactNode => {
    const id = String(contact.id ?? "").trim();
    if (!id) return null;
    const matched =
      displayContacts.find((row) => String(row.id ?? "").trim() === id) ?? null;
    if (!matched) return null;
    return renderContactCard(matched);
  };

  const conversationsLabel = t("conversations");
  const otherContactsLabel = t("otherContacts");

  const { exportAppData, handleImportAppDataFilePicked, requestImportAppData } =
    useAppDataTransfer<(typeof contacts)[number], (typeof cashuTokens)[number]>(
      {
        appOwnerId: contactsOwnerId,
        cashuOwnerId,
        cashuTokens: cashuTokensFiltered,
        cashuTokensAll: cashuTokensAllFiltered,
        contacts,
        importDataFileInputRef,
        insert,
        pushToast,
        t,
        update,
      },
    );

  const copyNostrKeys = async () => {
    const nsec = String(currentNsec ?? "").trim();
    if (!nsec) return;
    await navigator.clipboard?.writeText(nsec);
    pushToast(t("nostrKeysCopied"));
  };

  const copySeed = async () => {
    const value = String(slip39Seed ?? "").trim();
    if (value) {
      await navigator.clipboard?.writeText(value);
      safeLocalStorageSet(
        CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY,
        "1",
      );
      setContactsOnboardingHasBackedUpKeys(true);
      pushToast(t("seedCopied"));
      return;
    }

    pushToast(t("seedMissing"));
  };

  const restoreMissingTokens = useRestoreMissingTokens({
    cashuIsBusy,
    cashuTokensAll: cashuTokensAllFiltered,
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

  const mainMintForTokenList = React.useMemo(
    () => normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL),
    [defaultMintUrl],
  );

  const largestForeignMintForTokenList = React.useMemo(() => {
    if (!mainMintForTokenList) return null;

    const groups = new Map<
      string,
      { mint: string; sum: number; tokens: string[] }
    >();
    for (const row of cashuTokensWithMeta) {
      if (!isCashuTokenAcceptedState(row.state)) continue;

      const mint = normalizeMintUrl(String(row.mint ?? "").trim());
      if (!mint || mint === mainMintForTokenList) continue;

      const tokenText = String(row.token ?? row.rawToken ?? "").trim();
      if (!tokenText) continue;

      const amount = Number(row.amount ?? 0);
      const nextAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
      const entry = groups.get(mint) ?? { mint, sum: 0, tokens: [] };
      entry.sum += nextAmount;
      entry.tokens.push(tokenText);
      groups.set(mint, entry);
    }

    let selected: { mint: string; sum: number; tokens: string[] } | null = null;
    for (const entry of groups.values()) {
      if (!selected || entry.sum > selected.sum) {
        selected = entry;
      }
    }

    return selected;
  }, [cashuTokensWithMeta, mainMintForTokenList]);

  const formatMintButtonLabel = React.useCallback((mintUrl: string) => {
    try {
      return new URL(mintUrl).host || mintUrl.replace(/^https?:\/\//i, "");
    } catch {
      return mintUrl.replace(/^https?:\/\//i, "");
    }
  }, []);

  const cashuMeltToMainMintButtonLabel =
    mainMintForTokenList && largestForeignMintForTokenList
      ? t("cashuMeltToMainMint").replace(
          "{mint}",
          formatMintButtonLabel(mainMintForTokenList),
        )
      : null;

  const meltLargestForeignMintToMainMint = React.useCallback(async () => {
    if (cashuIsBusy) return;

    const targetMint = normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL);
    if (!targetMint) {
      setStatus(t("mintUrlInvalid"));
      return;
    }

    const sourceGroups = new Map<string, { mint: string; sum: number }>();
    for (const row of cashuTokensWithMeta) {
      if (!isCashuTokenAcceptedState(row.state)) continue;

      const mint = normalizeMintUrl(String(row.mint ?? "").trim());
      if (!mint || mint === targetMint) continue;

      const amount = Number(row.amount ?? 0);
      const nextAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
      const entry = sourceGroups.get(mint) ?? { mint, sum: 0 };
      entry.sum += nextAmount;
      sourceGroups.set(mint, entry);
    }

    let sourceMint: string | null = null;
    let sourceBalance = 0;
    for (const entry of sourceGroups.values()) {
      if (!sourceMint || entry.sum > sourceBalance) {
        sourceMint = entry.mint;
        sourceBalance = entry.sum;
      }
    }

    if (!sourceMint || sourceBalance <= 0) {
      setStatus(t("cashuMeltToMainMintUnavailable"));
      return;
    }

    const sourceRows = cashuTokensWithMeta.filter((row) => {
      if (!isCashuTokenAcceptedState(row.state)) return false;
      return normalizeMintUrl(String(row.mint ?? "").trim()) === sourceMint;
    });
    const sourceTokens = sourceRows
      .map((row) => String(row.token ?? row.rawToken ?? "").trim())
      .filter((tokenText) => tokenText.length > 0);

    if (sourceTokens.length === 0) {
      setStatus(t("cashuMeltToMainMintUnavailable"));
      return;
    }

    interface AcceptedCashuTokenPayload {
      amount?: number;
      mint?: string;
      rawToken?: string;
      state: "accepted";
      token: string;
      unit?: string;
    }

    const insertAcceptedToken = async (args: {
      amount?: number | null;
      mint?: string | null;
      rawToken?: string | null;
      token: string;
      unit?: string | null;
    }) => {
      const payload: AcceptedCashuTokenPayload = {
        token: args.token,
        state: "accepted",
      };
      if (args.rawToken) payload.rawToken = args.rawToken;
      if (args.mint) payload.mint = args.mint;
      if (args.unit) payload.unit = args.unit;
      if (typeof args.amount === "number" && args.amount > 0) {
        payload.amount = args.amount;
      }

      const ownerId = await resolveOwnerIdForWrite();
      const result = ownerId
        ? insert("cashuToken", payload, { ownerId })
        : insert("cashuToken", payload);
      return { ownerId, result };
    };

    const markRowsDeleted = async (
      rows: Array<{ id?: CashuTokenId | string | null }>,
      ownerIdOverride?: Evolu.OwnerId | null,
    ) => {
      for (const row of rows) {
        if (!row.id) continue;
        const payload = { id: row.id, isDeleted: Evolu.sqliteTrue };
        const result = ownerIdOverride
          ? update("cashuToken", payload, { ownerId: ownerIdOverride })
          : update("cashuToken", payload);
        if (!result.ok) {
          throw new Error(String(result.error));
        }
      }
    };

    const initialAmountAttempts = buildPaymentAmountAttempts(
      sourceBalance,
      sourceBalance,
    );
    const queuedAmountAttempts = [...initialAmountAttempts];
    const seenAmountAttempts = new Set(queuedAmountAttempts);
    let finalError = t("cashuMeltToMainMintFailed");

    setCashuIsBusy(true);
    setStatus(t("cashuMeltToMainMintProcessing"));

    try {
      rememberSeenMint(targetMint);
      await refreshMintInfo(targetMint);

      const { CashuMint, CashuWallet, MintQuoteState, getEncodedToken } =
        await getCashuLib();
      const det = getCashuDeterministicSeedFromStorage();
      const targetWallet = await createLoadedCashuWallet({
        CashuMint,
        CashuWallet,
        mintUrl: targetMint,
        unit: "sat",
        ...(det ? { bip39seed: det.bip39seed } : {}),
      });
      const waitForClaimableQuote = async (quoteId: string) => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const status = await targetWallet.checkMintQuote(quoteId);
          const state = readMintQuoteState(status);
          if (isClaimableMintQuoteState(state, MintQuoteState)) {
            return true;
          }
          if (attempt < 11) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 500);
            });
          }
        }

        return false;
      };
      const { meltInvoiceWithTokensAtMint } = await import("../cashuMelt");

      let activeSourceRows: Array<{ id?: CashuTokenId | string | null }> =
        sourceRows;
      let activeSourceOwnerId = cashuOwnerId;
      let activeSourceTokens = sourceTokens;

      for (
        let attemptIndex = 0;
        attemptIndex < queuedAmountAttempts.length;
        attemptIndex += 1
      ) {
        const amountSat = queuedAmountAttempts[attemptIndex];
        let quoteId = "";
        let invoice = "";

        try {
          const requestedQuote = await requestMintQuoteBolt11({
            amountSat,
            mintUrl: targetMint,
          });
          quoteId = requestedQuote.quoteId;
          invoice = requestedQuote.invoice;

          const meltResult = await meltInvoiceWithTokensAtMint({
            invoice,
            mint: sourceMint,
            tokens: activeSourceTokens,
            unit: "sat",
          });

          if (!meltResult.ok) {
            const errorMessage = String(meltResult.error ?? "unknown");

            if (meltResult.remainingToken && meltResult.remainingAmount > 0) {
              const retryable = isRetryablePaymentAmountFailure(errorMessage);

              if (retryable) {
                const recoveryInsert = await insertAcceptedToken({
                  token: meltResult.remainingToken,
                  mint: meltResult.mint,
                  unit: meltResult.unit,
                  amount: meltResult.remainingAmount,
                });
                if (!recoveryInsert.result.ok) {
                  throw new Error(String(recoveryInsert.result.error));
                }

                await markRowsDeleted(activeSourceRows, activeSourceOwnerId);

                activeSourceRows = [
                  {
                    id: recoveryInsert.result.value.id,
                  },
                ];
                activeSourceOwnerId = recoveryInsert.ownerId;
                activeSourceTokens = [meltResult.remainingToken];

                finalError = errorMessage;
                break;
              }

              const recoveryInsert = await insertAcceptedToken({
                token: meltResult.remainingToken,
                mint: meltResult.mint,
                unit: meltResult.unit,
                amount: meltResult.remainingAmount,
              });
              if (!recoveryInsert.result.ok) {
                throw new Error(String(recoveryInsert.result.error));
              }
              await markRowsDeleted(activeSourceRows, activeSourceOwnerId);
              finalError = errorMessage;
              break;
            }

            if (isRetryablePaymentAmountFailure(errorMessage)) {
              const retryAmounts = buildPaymentFailureAmountAttempts(
                amountSat,
                errorMessage,
              );
              for (const retryAmount of retryAmounts) {
                if (seenAmountAttempts.has(retryAmount)) continue;
                seenAmountAttempts.add(retryAmount);
                queuedAmountAttempts.push(retryAmount);
              }
            }

            finalError = errorMessage;
            continue;
          }

          if (meltResult.remainingToken && meltResult.remainingAmount > 0) {
            const remainingInsert = await insertAcceptedToken({
              token: meltResult.remainingToken,
              mint: meltResult.mint,
              unit: meltResult.unit,
              amount: meltResult.remainingAmount,
            });
            if (!remainingInsert.result.ok) {
              throw new Error(String(remainingInsert.result.error));
            }
          }

          await markRowsDeleted(activeSourceRows, activeSourceOwnerId);

          setTopupMintQuote({
            invoice,
            mintUrl: targetMint,
            quote: quoteId,
            amount: amountSat,
            unit: targetWallet.unit ?? "sat",
          });

          const claimable = await waitForClaimableQuote(quoteId);

          if (!claimable) {
            const displayAmount = formatDisplayedAmountParts(amountSat);
            setStatus(
              t("cashuMeltToMainMintPending")
                .replace(
                  "{amount}",
                  `${displayAmount.approxPrefix}${displayAmount.amountText}`,
                )
                .replace("{unit}", displayAmount.unitLabel),
            );
            return;
          }

          const mintedUnit = targetWallet.unit ?? "sat";
          const mintedProofs = await mintTopupProofs({
            amount: amountSat,
            mintUrl: targetMint,
            quoteId,
            unit: mintedUnit,
            wallet: targetWallet,
          });
          const mintedToken = String(
            getEncodedToken({
              mint: targetMint,
              proofs: mintedProofs,
              unit: mintedUnit,
            }) ?? "",
          ).trim();
          if (!mintedToken) {
            throw new Error("Mint produced empty token");
          }

          const mintedInsert = await insertAcceptedToken({
            token: mintedToken,
            mint: targetMint,
            unit: mintedUnit,
            amount: amountSat,
          });
          if (!mintedInsert.result.ok) {
            throw new Error(String(mintedInsert.result.error));
          }

          setTopupMintQuote(null);

          const displayAmount = formatDisplayedAmountParts(amountSat);
          setStatus(
            t("cashuMeltToMainMintDone")
              .replace(
                "{amount}",
                `${displayAmount.approxPrefix}${displayAmount.amountText}`,
              )
              .replace("{unit}", displayAmount.unitLabel)
              .replace("{mint}", formatMintButtonLabel(targetMint)),
          );
          return;
        } catch (error) {
          finalError = getUnknownErrorMessage(error, "unknown");
          if (!isRetryablePaymentAmountFailure(finalError)) {
            break;
          }
        }
      }

      setStatus(`${t("cashuMeltToMainMintFailed")}: ${finalError}`);
    } finally {
      setCashuIsBusy(false);
    }
  }, [
    cashuIsBusy,
    cashuOwnerId,
    cashuTokensWithMeta,
    defaultMintUrl,
    formatDisplayedAmountParts,
    formatMintButtonLabel,
    insert,
    refreshMintInfo,
    rememberSeenMint,
    resolveOwnerIdForWrite,
    setCashuIsBusy,
    setStatus,
    t,
    update,
  ]);

  useChatNostrSyncEffect({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    chatSeenWrapIdsRef,
    currentNsec,
    logPayStep,
    nostrMessageWrapIdsRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    route,
    selectedContact: selectedChatContact,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  });

  const sendChatMessage = useSendChatMessage({
    activePublishClientIdsRef: activeNostrMessagePublishClientIdsRef,
    appendLocalNostrMessage,
    chatDraft,
    chatSeenWrapIdsRef,
    chatSendIsBusy,
    currentNsec,
    publishWrappedWithRetry,
    route,
    replyContext,
    replyContextRef,
    selectedContact: selectedChatContact,
    setReplyContext,
    setChatDraft,
    setChatSendIsBusy,
    setStatus,
    t,
    triggerChatScrollToBottom,
    updateLocalNostrMessage,
  });

  const editChatMessage = useEditChatMessage({
    chatDraft,
    chatSendIsBusy,
    currentNsec,
    editContext,
    publishWrappedWithRetry,
    route,
    selectedContact: selectedChatContact,
    setChatDraft,
    setChatSendIsBusy,
    setEditContext,
    setStatus,
    t,
    updateLocalNostrMessage,
  });

  const sendReaction = useSendReaction({
    appendLocalNostrReaction,
    currentNsec,
    publishWrappedWithRetry,
    reactionsByMessageId,
    route,
    selectedContact: selectedChatContact,
    setStatus,
    softDeleteLocalNostrReaction,
    t,
    updateLocalNostrReaction,
  });

  const sendChatOrEditMessage = React.useCallback(async () => {
    if (editContext) {
      await editChatMessage();
      return;
    }
    await sendChatMessage();
  }, [editChatMessage, editContext, sendChatMessage]);

  const onReplyToChatMessage = React.useCallback(
    (message: LocalNostrMessage) => {
      const rumorId = String(message.rumorId ?? "").trim();
      if (!rumorId) return;
      setEditContext(null);
      setReplyContext({
        replyToId: rumorId,
        rootMessageId: String(message.rootMessageId ?? "").trim() || rumorId,
        replyToContent: String(message.content ?? "").trim() || null,
      });
    },
    [],
  );

  const onEditChatMessage = React.useCallback((message: LocalNostrMessage) => {
    const isOut = String(message.direction ?? "") === "out";
    if (!isOut) return;
    const rumorId = String(message.rumorId ?? "").trim();
    if (!rumorId) return;
    const messageId = String(message.id ?? "").trim();
    if (!messageId) return;

    setReplyContext(null);
    const content = String(message.content ?? "");
    setEditContext({
      messageId,
      rumorId,
      originalContent:
        String(message.originalContent ?? "").trim() || content || "",
    });
    setChatDraft(content);
  }, []);

  const onReactToChatMessage = React.useCallback(
    (message: LocalNostrMessage, emoji: string) => {
      const messageRumorId = String(message.rumorId ?? "").trim();
      const messageAuthorPubkey = String(message.pubkey ?? "").trim();
      if (!messageRumorId || !messageAuthorPubkey) return;
      void sendReaction({ emoji, messageAuthorPubkey, messageRumorId });
    },
    [sendReaction],
  );

  const onCopyChatMessage = React.useCallback(
    (message: LocalNostrMessage) => {
      void copyText(String(message.content ?? ""));
    },
    [copyText],
  );

  const onCancelReply = React.useCallback(() => {
    setReplyContext(null);
  }, []);

  const onCancelEdit = React.useCallback(() => {
    setEditContext(null);
    setChatDraft("");
  }, []);

  const topbar = buildTopbar({
    closeContactDetail,
    contactPayBackToChatId: contactPayBackToChatRef.current,
    navigateToMainReturn,
    route,
    t,
  });

  const topbarRight = buildTopbarRight({
    route,
    t,
    toggleMenu,
    toggleProfileEditing,
  });

  const topbarTitle = buildTopbarTitle(route, t);

  const chatTopbarContact =
    route.kind === "chat" && selectedChatContact
      ? {
          contactId: selectedChatContact.isUnknownContact
            ? null
            : (selectedContact?.id ?? null),
          isUnknownContact: Boolean(selectedChatContact.isUnknownContact),
          name: String(selectedChatContact.name ?? "").trim() || null,
          npub: normalizeNpubIdentifier(selectedChatContact.npub),
        }
      : null;

  const getCashuTokenMessageInfo = React.useCallback(
    (text: string) =>
      getCashuTokenMessageInfoBase(text, cashuTokensAllFiltered),
    [cashuTokensAllFiltered],
  );

  useInboxNotificationsSync({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    contacts,
    currentNsec,
    maybeShowPwaNotification,
    nostrFetchRelays,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    pushToast,
    route,
    setContactAttentionById,
    softDeleteLocalNostrReactionsByWrapIds,
    t,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  });

  const openProfileQr = React.useCallback(() => {
    setProfileQrIsOpen(true);
  }, []);

  const closeProfileQr = React.useCallback(() => {
    setProfileQrIsOpen(false);
  }, []);

  const handleScannedText = useScannedTextHandler<(typeof contacts)[number]>({
    appOwnerId: contactsOwnerId,
    closeScan,
    contacts,
    currentNpub,
    extractCashuTokenFromText,
    insert,
    lightningInvoiceAutoPayLimit,
    openScannedContactPendingNpubRef,
    payLightningInvoiceWithCashu,
    refreshContactFromNostr,
    requestLightningInvoiceConfirmation: setPendingLightningInvoiceConfirmation,
    saveCashuFromText,
    setStatus,
    t,
  });

  React.useEffect(() => {
    const acceptDeepLinkUrl = (rawUrl: unknown) => {
      const parsed = parseNativeDeepLinkUrl(rawUrl);
      if (!parsed) {
        return;
      }

      setPendingDeleteId(null);
      updatePendingDeepLinkText(parsed.text);
      consumePendingNativeDeepLinkUrl();
    };

    acceptDeepLinkUrl(consumePendingNativeDeepLinkUrl());

    const onDeepLink: EventListener = (event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail;
      if (typeof detail !== "object" || detail === null) {
        return;
      }

      acceptDeepLinkUrl(Reflect.get(detail, "url"));
    };

    window.addEventListener(NATIVE_DEEP_LINK_EVENT, onDeepLink);
    return () => window.removeEventListener(NATIVE_DEEP_LINK_EVENT, onDeepLink);
  }, [setPendingDeleteId, updatePendingDeepLinkText]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawHash = String(window.location.hash ?? "");
    const token = extractCashuTokenFromTextFromUrl(rawHash);
    if (!token) {
      return;
    }

    setPendingDeleteId(null);
    updatePendingDeepLinkText(`cashu:${token}`);

    const cleanHash = rawHash.split("?")[0] ?? "#wallet";
    const nextHash = cleanHash || "#wallet";
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${nextHash}`,
    );
  }, [setPendingDeleteId, updatePendingDeepLinkText]);

  React.useEffect(() => {
    if (!pendingDeepLinkText) {
      return;
    }

    if (!currentNsec || !cashuOwnerId) {
      return;
    }

    updatePendingDeepLinkText(null);
    void handleScannedText(pendingDeepLinkText).catch(() => {
      updatePendingDeepLinkText(pendingDeepLinkText);
    });
  }, [
    cashuOwnerId,
    currentNsec,
    handleScannedText,
    pendingDeepLinkText,
    updatePendingDeepLinkText,
  ]);

  const pasteScanValue = React.useCallback(async () => {
    let text = "";

    if (navigator.clipboard?.readText) {
      text = await navigator.clipboard.readText();
    } else if (
      typeof window !== "undefined" &&
      typeof window.prompt === "function"
    ) {
      text = String(window.prompt(t("scanPastePrompt")) ?? "");
    } else {
      pushToast(t("pasteNotAvailable"));
      return;
    }

    const raw = String(text ?? "").trim();
    if (!raw) {
      pushToast(t("pasteEmpty"));
      return;
    }

    await handleScannedText(raw);
  }, [handleScannedText, pushToast, t]);

  useScannedTextHandlerRefBridge({
    handleScannedText,
    scannedTextHandlerRef,
  });

  useChatMessageEffects({
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
    getCashuTokenMessageInfo,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    nostrMessagesRecent,
    route,
    saveCashuFromText,
    selectedContact: selectedChatContact,
  });
  const knownLnAddressPayContact = React.useMemo(() => {
    if (route.kind !== "lnAddressPay") return null;

    const inferredLnAddress = inferLightningAddressFromLnurlTarget(
      route.lnAddress,
    );
    if (!inferredLnAddress) return null;

    return (
      contacts.find(
        (contact) =>
          String(contact.lnAddress ?? "")
            .trim()
            .toLowerCase() === inferredLnAddress.toLowerCase(),
      ) ?? null
    );
  }, [contacts, route]);
  const knownLnAddressPayContactPictureUrl = React.useMemo(() => {
    const npub = normalizeNpubIdentifier(knownLnAddressPayContact?.npub);
    return npub ? (nostrPictureByNpub[npub] ?? null) : null;
  }, [knownLnAddressPayContact, nostrPictureByNpub]);

  const { moneyRouteProps } = usePaymentMoneyComposition({
    moneyRouteBuilderInput: {
      canWriteNfc,
      canPayWithCashu,
      cashuBalance,
      cashuBulkCheckIsBusy,
      cashuDraft,
      cashuDraftRef,
      cashuIsBusy,
      cashuMeltToMainMintButtonLabel,
      cashuTokensAll: cashuTokensAllFiltered,
      cashuTokensWithMeta,
      checkAllCashuTokensAndDeleteInvalid,
      checkAndRefreshCashuToken,
      copyText,
      currentNpub,
      displayUnit,
      effectiveProfileName,
      effectiveProfilePicture,
      getMintIconUrl,
      knownLnAddressPayContact,
      knownLnAddressPayContactPictureUrl,
      lnAddressPayAmount,
      meltLargestForeignMintToMainMint,
      payLightningAddressWithCashu,
      pendingCashuDeleteId,
      requestDeleteCashuToken,
      route,
      saveCashuFromText,
      setCashuDraft,
      setLnAddressPayAmount,
      setMintIconUrlByMint,
      shareCashuTokenDeepLink,
      setTopupAmount,
      t,
      topupAmount,
      topupInvoice,
      topupInvoiceError,
      topupInvoiceIsBusy,
      topupMintUrl:
        topupMintQuote?.mintUrl ??
        normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL) ??
        MAIN_MINT_URL,
      topupInvoiceQr,
      writeCashuTokenToNfc,
    },
  });

  const { peopleRouteProps } = useProfilePeopleComposition({
    peopleRouteBuilderInput: {
      cashuBalance,
      cashuIsBusy,
      chatSelectedContact: selectedChatContact,
      chatDraft,
      chatMessageElByIdRef,
      chatMessages,
      chatMessagesRef,
      chatOwnPubkeyHex,
      chatSendIsBusy,
      contactEditsSavable,
      contactPayMethod,
      copyText,
      currentNpub,
      derivedProfile,
      displayUnit,
      editingId,
      editContext,
      effectiveMyLightningAddress,
      effectiveProfileName,
      effectiveProfilePicture,
      feedbackContactNpub: FEEDBACK_CONTACT_NPUB,
      form,
      getCashuTokenMessageInfo,
      getMintIconUrl,
      groupNames,
      handleSaveContact,
      isProfileEditing,
      isSavingContact,
      lang,
      myProfileQr,
      nostrPictureByNpub,
      onCancelEdit,
      onCancelReply,
      onAddUnknownContact: addUnknownContactFromChat,
      onRemoveUnknownContactChat: removeUnknownContactChatFromChat,
      onCopy: onCopyChatMessage,
      onEdit: onEditChatMessage,
      onPickProfilePhoto,
      onProfilePhotoSelected,
      onReact: onReactToChatMessage,
      onReply: onReplyToChatMessage,
      openContactPay,
      openScan,
      payAmount,
      paySelectedContact,
      payWithCashuEnabled,
      pendingDeleteId,
      reactionsByMessageId,
      profileEditLnAddress,
      profileEditName,
      profileEditPicture,
      profileEditsSavable,
      profilePhotoInputRef,
      requestDeleteCurrentContact,
      resetEditedContactFieldFromNostr,
      replyContext,
      saveProfileEdits,
      scanIsOpen,
      selectedContact,
      sendChatMessage: sendChatOrEditMessage,
      setChatDraft,
      setContactPayMethod,
      setForm,
      setMintIconUrlByMint,
      setPayAmount,
      setProfileEditLnAddress,
      setProfileEditName,
      setProfileEditPicture,
      t,
    },
  });

  const {
    mainSwipeRouteProps,
    pageClassNameWithSwipe,
    selectedEvoluServerUrl,
  } = useRoutingViewComposition({
    contactsHeaderVisible,
    contactsPullProgress,
    groupNamesCount: groupNames.length,
    isMainSwipeRoute,
    mainSwipeRouteBuilderInput: {
      activeGroup,
      cashuBalance,
      contacts: displayContacts,
      contactsOnboardingCelebrating,
      contactsOnboardingTasks,
      contactsSearch,
      contactsSearchInputRef,
      conversationsLabel,
      dismissContactsOnboarding,
      dismissWalletWarning,
      groupNames,
      handleMainSwipeScroll,
      mainSwipeProgress,
      mainSwipeRef,
      mainSwipeScrollY,
      NO_GROUP_FILTER,
      canAddContact,
      openNewContactPage,
      openScan,
      openWalletScan,
      otherContactsLabel,
      renderContactCard: renderMainSwipeContactCard,
      route,
      scanIsOpen,
      setActiveGroup,
      setContactsSearch,
      showContactsOnboarding,
      showWalletWarning: walletWarningApplies && !walletWarningDismissed,
      startContactsGuide,
      t,
      visibleContacts,
    },
    ungroupedCount,
  });

  const { systemRouteProps } = useSystemSettingsComposition({
    systemRouteBuilderInput: {
      appOwnerIdRef,
      appVersion: __APP_VERSION__,
      applyDefaultMintSelection,
      cashuMeltToMainMintButtonLabel,
      canSaveNewRelay,
      cashuIsBusy,
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
      evoluContactsOwnerEditCount: contactsOwnerEditCount,
      evoluCashuOwnerId: cashuOwnerId,
      evoluContactsOwnerId: contactsOwnerId,
      evoluContactsOwnerIndex: contactsOwnerIndex,
      evoluContactsOwnerNewContactsCount: contactsOwnerNewContactsCount,
      evoluContactsOwnerPointer: contactsOwnerPointer,
      evoluContactsOwnerEditsUntilRotation: contactsOwnerEditsUntilRotation,
      evoluCashuOwnerEditsUntilRotation: cashuOwnerEditsUntilRotation,
      evoluHistoryAllowedOwnerIds,
      evoluMessagesBackupOwnerId: messagesBackupOwnerId,
      evoluMessagesOwnerId: messagesOwnerId,
      evoluMessagesOwnerEditsUntilRotation: messagesOwnerEditsUntilRotation,
      requestManualRotateContactsOwner,
      requestManualRotateMessagesOwner,
      rotateContactsOwnerIsBusy,
      rotateMessagesOwnerIsBusy,
      exportAppData,
      extractPpk,
      getMintIconUrl,
      getMintRuntime,
      handleImportAppDataFilePicked,
      importDataFileInputRef,
      isSeedLogin,
      isEvoluServerOffline,
      lightningInvoiceAutoPayLimit,
      lang,
      LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
      logoutArmed,
      MAIN_MINT_URL,
      meltLargestForeignMintToMainMint,
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
      requestDeriveNostrKeys,
      requestLogout,
      restoreMissingTokens,
      route,
      safeLocalStorageSetJson,
      saveEvoluServerUrls,
      saveNewRelay,
      seedMnemonic,
      selectedEvoluServerUrl,
      selectedRelayUrl,
      setDefaultMintUrlDraft,
      setEvoluServerOffline,
      setLightningInvoiceAutoPayLimit,
      setNewEvoluServerUrl,
      setNewRelayUrl,
      setPayWithCashuEnabled,
      setPendingEvoluServerDeleteUrl,
      setPendingMintDeleteUrl,
      setStatus,
      setMintInfoAllUnknown: setMintInfoAll,
      syncOwner,
      t,
      tokensRestoreIsBusy,
      wipeEvoluStorage,
    },
  });

  const appState = {
    applyAmountInputKey: applyDisplayedAmountInputKey,
    cashuBalance,
    cashuIsBusy,
    canWriteNfc,
    chatTopbarContact,
    contactsGuide,
    contactsGuideActiveStep,
    contactsGuideHighlightRect,
    currentNpub,
    currentNsec,
    displayCurrency,
    derivedProfile,
    displayUnit,
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    formatDisplayedAmountParts,
    formatDisplayedAmountText,
    isProfileEditing,
    lang,
    menuIsOpen,
    myProfileQr,
    nfcWritePromptKind,
    nostrPictureByNpub,
    paidOverlayIsOpen,
    paidOverlayTitle,
    pendingLightningInvoiceConfirmation,
    postPaySaveContact,
    profileEditInitialRef,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditsSavable,
    profilePhotoInputRef,
    profileQrIsOpen,
    route,
    scanAllowsManualContact,
    scanIsOpen,
    scanVideoRef,
    t,
    topbar,
    topbarRight,
    topbarTitle,
  };

  const appActions = {
    cancelPendingNfcWrite,
    closeMenu,
    closeLightningInvoiceConfirmation,
    closeProfileQr,
    closeScan,
    confirmLightningInvoicePayment,
    contactsGuideNav,
    copyText,
    onPickProfilePhoto,
    onProfilePhotoSelected,
    openFeedbackContact,
    openManualContactFromScan,
    openProfileQr,
    pasteScanValue,
    saveProfileEdits,
    setDisplayCurrency,
    setContactNewPrefill,
    setIsProfileEditing,
    setLang,
    setLightningInvoiceAutoPayLimit,
    setPostPaySaveContact,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditPicture,
    stopContactsGuide,
    toggleProfileEditing,
    writeCurrentNpubToNfc,
  };

  return {
    appActions,
    appState,
    confirmPendingOnboardingProfile,
    createNewAccount,
    currentNsec,
    displayUnit,
    formatDisplayedAmountParts,
    isMainSwipeRoute,
    lang,
    mainSwipeRouteProps,
    moneyRouteProps,
    onboardingIsBusy,
    onboardingPhotoInputRef,
    onboardingStep,
    openReturningOnboarding,
    onPendingOnboardingPhotoSelected,
    pageClassNameWithSwipe,
    pasteReturningSlip39FromClipboard,
    pickPendingOnboardingPhoto,
    peopleRouteProps,
    pushToast,
    recentlyReceivedToken,
    route,
    selectReturningSlip39Suggestion,
    selectPendingOnboardingAvatar,
    setLang,
    setReturningSlip39Input,
    setOnboardingStep,
    setPendingOnboardingName,
    setRecentlyReceivedToken,
    submitReturningSlip39,
    systemRouteProps,
    t,
    toasts,
  };
};
