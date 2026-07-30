import { Share } from "@capacitor/share";
import type { Proof } from "@cashu/cashu-ts";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { nip19, type UnsignedEvent } from "nostr-tools";
import React, { useMemo, useState } from "react";
import { createSendTokenWithTokensAtMint } from "../cashuSend";
import { ContactCard } from "../components/ContactCard";
import { deriveDefaultProfile } from "../derivedProfile";
import {
  evolu,
  normalizeEvoluServerUrl,
  useEvolu,
  useEvoluDatabaseInfoState,
  useEvoluLastError,
  useEvoluServersManager,
  wipeEvoluStorage as wipeEvoluStorageImpl,
  type CashuTokenId,
  type ContactId,
} from "../evolu";
import { navigateTo, useRouting } from "../hooks/useRouting";
import { useToasts } from "../hooks/useToasts";
import { getInitialLang, translations, type Lang } from "../i18n";
import {
  inferLightningAddressFromLnurlTarget,
  redeemLnurlWithdraw,
  type LnurlWithdrawPreview,
} from "../lnurlPay";
import { NOSTR_RELAYS } from "../nostrProfile";
import { writeClipboardText } from "../platform/clipboard";
import {
  cancelNativeNfcWrite,
  consumePendingIosNativeDeepLinkUrl,
  consumePendingNativeDeepLinkUrl,
  consumePendingNativeNotificationOpenDetail,
  consumePendingNativeNotificationRoute,
  NATIVE_DEEP_LINK_EVENT,
  NATIVE_NOTIFICATION_OPEN_EVENT,
  NATIVE_PUSH_ACTION_EVENT,
  startNativeNfcWrite,
  supportsNativeNfcWrite,
} from "../platform/nativeBridge";
import {
  triggerPasswordManagerSeedSave,
  type PasswordManagerSaveResult,
} from "../platform/passwordManager";
import { isNativePlatform } from "../platform/runtime";
import { getCashuDeterministicSeedFromStorage } from "../utils/cashuDeterministic";
import {
  isCashuOutputsAlreadySignedError,
  isCashuOutputsArePendingError,
} from "../utils/cashuErrors";
import { getCashuLib } from "../utils/cashuLib";
import { cashuAmountToNumber } from "../utils/cashuProofs";
import { createLoadedCashuWallet } from "../utils/cashuWallet";
import {
  CASHU_AUTOSWAP_MIN_SOURCE_SUM,
  CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  FEEDBACK_CONTACT_NPUB,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
  LOCAL_PENDING_TOPUP_QUOTE_STORAGE_KEY_PREFIX,
  MAX_CONTACTS_PER_OWNER,
  PENDING_DEEP_LINK_TEXT_STORAGE_KEY,
  WALLET_WARNING_BALANCE_THRESHOLD_SAT,
  WALLET_WARNING_DISMISSED_STORAGE_KEY,
} from "../utils/constants";
import { buildCashuDeepLink, parseNativeDeepLinkUrl } from "../utils/deepLinks";
import {
  applyAmountInputKey,
  formatDisplayAmountParts,
  formatDisplayAmountText,
  getDisplayUnitLabel,
  getNextDisplayCurrency,
  normalizeAllowedDisplayCurrencies,
  type DisplayCurrency,
} from "../utils/displayAmounts";
import {
  getLightningInvoicePreview,
  type LightningInvoicePreview,
} from "../utils/lightningInvoice";
import {
  CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY,
  extractPpk,
  isTestMintUrl,
  MAIN_MINT_URL,
  normalizeMintUrl,
  PRESET_MINTS,
} from "../utils/mint";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";
import { parseNpubCashProfileInfo } from "../utils/npubCashInfo";
import {
  getInitialAllowedDisplayCurrencies,
  getInitialCashuAutoswapEnabled,
  getInitialDisplayCurrency,
  getInitialLightningInvoiceAutoPayLimit,
  getInitialPayWithCashuEnabled,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeLocalStorageSetJson,
  withLocalStorageLeaseLock,
} from "../utils/storage";
import { getUnknownErrorMessage } from "../utils/unknown";
import { makeLocalId } from "../utils/validation";
import { useCashuTokenChecks } from "./hooks/cashu/useCashuTokenChecks";
import { useNpubCashClaim } from "./hooks/cashu/useNpubCashClaim";
import { useRestoreMissingTokens } from "./hooks/cashu/useRestoreMissingTokens";
import { useSaveCashuFromText } from "./hooks/cashu/useSaveCashuFromText";
import { useIdentityOwnersComposition } from "./hooks/composition/useIdentityOwnersComposition";
import { usePaymentMoneyComposition } from "./hooks/composition/usePaymentMoneyComposition";
import { useProfileComposition } from "./hooks/composition/useProfileComposition";
import { useProfilePeopleComposition } from "./hooks/composition/useProfilePeopleComposition";
import { useRoutingViewComposition } from "./hooks/composition/useRoutingViewComposition";
import { useSystemSettingsComposition } from "./hooks/composition/useSystemSettingsComposition";
import { useContactsOnboardingProgress } from "./hooks/guide/useContactsOnboardingProgress";
import { useMainMenuState } from "./hooks/layout/useMainMenuState";
import { useMainSwipeNavigation } from "./hooks/layout/useMainSwipeNavigation";
import {
  extractClientTag,
  extractEditedFromTag,
  extractReplyContextFromTags,
  isInvalidInnerRumorPubkey,
  isNestedEncryptedNip44PayloadForAnyPubkey,
} from "./hooks/messages/chatNostrProtocol";
import {
  buildUnknownContactId,
  isUnknownContactId,
  normalizePubkeyHex,
} from "./hooks/messages/contactIdentity";
import { hasKnownNostrMessageIdentity } from "./hooks/messages/messageHelpers";
import { useChatMessageEffects } from "./hooks/messages/useChatMessageEffects";
import { useNpubCashMintSelection } from "./hooks/mint/useNpubCashMintSelection";
import { useContactPayMethod } from "./hooks/payments/useContactPayMethod";
import { usePayContactWithCashuMessage } from "./hooks/payments/usePayContactWithCashuMessage";
import { useRouteAmountResetEffects } from "./hooks/payments/useRouteAmountResetEffects";
import { shouldKeepTopupQuoteAfterClaimError } from "./hooks/topup/topupMintClaim";
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
import { useFiatRates } from "./hooks/useFiatRates";
import { useGuideScannerDomain } from "./hooks/useGuideScannerDomain";
import { useLightningPaymentsDomain } from "./hooks/useLightningPaymentsDomain";
import { useMainSwipePageEffects } from "./hooks/useMainSwipePageEffects";
import { useMintDomain } from "./hooks/useMintDomain";
import { useOwnerScopedStorage } from "./hooks/useOwnerScopedStorage";
import { usePaidOverlayState } from "./hooks/usePaidOverlayState";
import { usePaymentsDomain } from "./hooks/usePaymentsDomain";
import { useProfileNpubCashEffects } from "./hooks/useProfileNpubCashEffects";
import { useScannedTextHandler } from "./hooks/useScannedTextHandler";
import { useScannedTextHandlerRefBridge } from "./hooks/useScannedTextHandlerRefBridge";
import { useStatusToasts } from "./hooks/useStatusToasts";
import { useStoragePersistRequestEffect } from "./hooks/useStoragePersistRequestEffect";
import {
  appendPendingAutoswapClaim,
  claimAutoswapPendingEntry,
  makePendingAutoswapClaimsKey,
  readPendingAutoswapClaims,
  type AutoswapPendingClaim,
} from "./lib/autoswapClaim";
import {
  getLinkyBankPaymentOfferInfo,
  isLinkyBankPaymentOfferEvent,
  setLinkyBankPaymentOfferMinimized,
} from "./lib/bankPaymentOffer";
import { resolveCashuRowStoredOwnerLane } from "./lib/cashuOwnerLane";
import { isCashuRowCandidateBetter } from "./lib/cashuRowPreference";
import { createCashuTokenId } from "./lib/cashuTokenIdentity";
import {
  CASHU_TOKEN_STATE_EXTERNALIZED,
  CASHU_TOKEN_STATE_RESERVED,
  isCashuTokenAcceptedState,
  isCashuTokenDefinitivelySpent,
  isCashuTokenEmittedState,
  isCashuTokenIssuedState,
  isCashuTokenReservedState,
} from "./lib/cashuTokenState";
import {
  buildIdentityChangeMessageContent,
  buildIdentityChangeMessageWrapId,
} from "./lib/identityChangeMessage";
import {
  consumeNotificationOpenDetailFromHash,
  readNotificationOpenRoute,
  readNotificationOpenTarget,
} from "./lib/notificationOpenTarget";
import { getSharedAppNostrPool } from "./lib/nostrPool";
import {
  buildPaymentAmountAttempts,
  buildPaymentFailureAmountAttempts,
  getPaymentAmountReserveCap,
  isRetryablePaymentAmountFailure,
} from "./lib/paymentAmountFallback";
import {
  canOfferPaymentMintMelt,
  getPaymentMintMeltPlan,
} from "./lib/paymentMintMelt";
import {
  buildCashuMintCandidates as buildCashuMintCandidatesBase,
  selectSingleMintCandidateForAmount,
} from "./lib/paymentMintSelection";
import {
  buildCashuPaymentRequestMessage,
  parseCashuPaymentRequestMessage,
  type CashuPaymentRequestMessageInfo,
} from "./lib/paymentRequestMessage";
import {
  parsePrivateImageMessage,
  privateImageMessageFromEvent,
} from "./lib/privateImageMessage";
import {
  getLinkyBankPaymentOfferPaymentNoticeOfferId,
  isLinkyBankPaymentOfferPaymentNoticeEvent,
  LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
  wrapEventWithoutPushMarker,
  wrapEventWithPushMarker,
} from "./lib/pushWrappedEvent";
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
import {
  isExpiredPendingTopupQuote,
  isLikelyCorsOrNetworkError,
  isSameTopupMintQuote,
  makeClaimedTopupQuoteLockKey,
  makeClaimedTopupQuoteStorageKey,
  readClaimedTopupQuoteFromStorage,
  readPendingTopupQuoteFromStorage,
  toPendingTopupQuoteStorage,
  toTopupMintQuoteDraft,
  type ClaimedTopupQuoteStorage,
} from "./lib/topupQuoteStorage";
import { mintTopupProofs } from "./lib/topupProofRecovery";
import type {
  ContactRowLike,
  LocalNostrMessage,
  PaymentLogData,
} from "./types/appTypes";
import {
  useContactsMessagingComposition,
  type DisplayContact,
} from "./hooks/composition/useContactsMessagingComposition";

type TranslationKey = keyof (typeof translations)["cs"];
type LoadedCashuWallet = Awaited<ReturnType<typeof createLoadedCashuWallet>>;

const hasTranslationKey = (key: string): key is TranslationKey =>
  Object.prototype.hasOwnProperty.call(translations.cs, key);

type CashuProofPayload = Record<string, unknown> & {
  C: string;
  amount: number;
  secret: string;
};

const isCashuProofPayload = (value: unknown): value is CashuProofPayload => {
  if (typeof value !== "object" || value === null) return false;
  return (
    Reflect.get(value, "amount") !== undefined &&
    typeof Reflect.get(value, "secret") === "string" &&
    typeof Reflect.get(value, "C") === "string"
  );
};

const normalizeCashuProofPayload = (
  proof: unknown,
): CashuProofPayload | null => {
  if (!isCashuProofPayload(proof)) return null;
  return {
    ...proof,
    amount: cashuAmountToNumber(Reflect.get(proof, "amount")),
  };
};

const logPayStep = (step: string, data?: PaymentLogData): void => {
  try {
    console.log("[linky][pay]", step, data ?? {});
  } catch {
    // ignore logging errors
  }
};

interface QueuedNotificationOpenDetail {
  value: unknown;
}

export const useAppShellComposition = () => {
  const { insert, update, upsert } = useEvolu();

  const hasMintOverrideRef = React.useRef(false);

  const route = useRouting();
  const { dismissToast, toasts, pushToast } = useToasts();
  const [lang, setLang] = useState<Lang>(() => getInitialLang());
  const t = React.useCallback(
    (key: string) => (hasTranslationKey(key) ? translations[lang][key] : key),
    [lang],
  );
  const {
    activeNostrIdentitySource,
    activeSyncedNostrIdentity,
    appOwnerId,
    appOwnerIdRef,
    appendIdentityChangeNoticesRef,
    cashuOwnerEditsUntilRotation,
    cashuOwnerId,
    cashuOwnerIdRef,
    cashuOwnerIndex,
    cashuVisibleOwnerIds,
    confirmPendingOnboardingProfile,
    contactsOwnerEditCount,
    contactsOwnerEditsUntilRotation,
    contactsOwnerId,
    contactsOwnerIndex,
    contactsOwnerNewContactsCount,
    contactsOwnerPointer,
    contactsVisibleOwnerIds,
    createNewAccount,
    currentNpub,
    currentNsec,
    historicalOwnerSetsReady,
    identityOwnerId,
    isSeedLogin,
    legacyIdentitiesOwnerId,
    legacyMessagesIdentityOwnerId,
    logoutArmed,
    messagesBackupOwnerId,
    messagesOwnerEditsUntilRotation,
    messagesOwnerId,
    messagesOwnerIdRef,
    messagesOwnerIndex,
    messagesVisibleOwnerIds,
    metaOwnerId,
    nostrIdentityRows,
    onboardingIsBusy,
    onboardingPhotoInputRef,
    onboardingStep,
    openReturningOnboarding,
    onPendingOnboardingPhotoError,
    onPendingOnboardingPhotoSelected,
    pasteReturningSlip39FromClipboard,
    pickPendingOnboardingPhoto,
    recordContactsOwnerWrite,
    recordMessagesOwnerWrite,
    recordTransactionsOwnerWrite,
    recordTransactionsOwnerWriteRef,
    requestDeriveNostrKeys,
    requestLogout,
    requestManualRotateCashuOwner,
    requestManualRotateContactsOwner,
    requestManualRotateMessagesOwner,
    requestManualRotateTransactionsOwner,
    requestPasteNostrKeys,
    rotateCashuOwnerIsBusy,
    rotateContactsOwnerIsBusy,
    rotateMessagesOwnerIsBusy,
    rotateTransactionsOwnerIsBusy,
    savePendingOnboardingBackupToPasswordManager,
    seedMnemonic,
    cyclePendingOnboardingAvatarControl,
    selectReturningSlip39Suggestion,
    setOnboardingStep,
    setPendingOnboardingName,
    setReturningSlip39Input,
    slip39Seed,
    submitReturningSlip39,
    syncedNostrIdentityMatchesLocal,
    syncedNostrIdentityResolution,
    syncOwner,
    transactionsBackupOwnerId,
    transactionsBootstrapSnapshot,
    transactionsOwnerEditsUntilRotation,
    transactionsOwnerId,
    transactionsOwnerIdRef,
    transactionsOwnerIndex,
    transactionsOwnerPointer,
    transactionsVisibleOwnerIds,
  } = useIdentityOwnersComposition({
    evolu,
    lang,
    navigation: globalThis.location,
    pushToast,
    t,
    upsert,
  });

  const {
    logPaymentEvent,
    makeLocalStorageKey,
    migrateLegacyPaymentEventsToEvolu,
    readSeenMintsFromStorage,
    rememberSeenMint,
  } = useOwnerScopedStorage({
    appOwnerIdRef,
    insert,
    recordTransactionsOwnerWriteRef,
    transactionsOwnerIdRef,
  });

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

  const topupInvoiceStartBalanceRef = React.useRef<number | null>(null);
  const topupInvoicePaidHandledRef = React.useRef(false);
  const [pendingCashuDeleteId, setPendingCashuDeleteId] =
    useState<CashuTokenId | null>(null);
  const [pendingMintDeleteUrl, setPendingMintDeleteUrl] = useState<
    string | null
  >(null);
  const [pendingEvoluServerDeleteUrl, setPendingEvoluServerDeleteUrl] =
    useState<string | null>(null);
  const [contactsHeaderVisible, setContactsHeaderVisible] = useState(false);
  const [contactsPulling, setContactsPulling] = useState(false);
  const contactsPullDistanceRef = React.useRef(0);
  const mainSwipeRef = React.useRef<HTMLDivElement | null>(null);
  const mainSwipeScrollTimerRef = React.useRef<number | null>(null);
  const [allowedDisplayCurrencies, setAllowedDisplayCurrencies] = useState<
    DisplayCurrency[]
  >(() => getInitialAllowedDisplayCurrencies());
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>(() =>
    getInitialDisplayCurrency(),
  );
  const [payWithCashuEnabled, setPayWithCashuEnabled] = useState<boolean>(() =>
    getInitialPayWithCashuEnabled(),
  );
  const [cashuAutoswapEnabled, setCashuAutoswapEnabled] = useState<boolean>(
    () => getInitialCashuAutoswapEnabled(),
  );
  const [lightningInvoiceAutoPayLimit, setLightningInvoiceAutoPayLimit] =
    useState<number>(() => getInitialLightningInvoiceAutoPayLimit());

  const pendingNotificationOpenDetailsRef = React.useRef<
    QueuedNotificationOpenDetail[]
  >([]);

  React.useEffect(() => {
    if (allowedDisplayCurrencies.includes(displayCurrency)) return;
    setDisplayCurrency(allowedDisplayCurrencies[0] ?? "sat");
  }, [allowedDisplayCurrencies, displayCurrency]);

  const setDisplayCurrencyIfAllowed = React.useCallback(
    (currency: DisplayCurrency) => {
      if (!allowedDisplayCurrencies.includes(currency)) return;
      setDisplayCurrency(currency);
    },
    [allowedDisplayCurrencies],
  );

  const cycleDisplayCurrency = React.useCallback(() => {
    setDisplayCurrency((current) =>
      getNextDisplayCurrency(current, allowedDisplayCurrencies),
    );
  }, [allowedDisplayCurrencies]);

  const toggleAllowedDisplayCurrency = React.useCallback(
    (currency: DisplayCurrency) => {
      setAllowedDisplayCurrencies((current) => {
        if (current.includes(currency)) {
          if (current.length <= 1) return current;
          return current.filter((candidate) => candidate !== currency);
        }

        return normalizeAllowedDisplayCurrencies(
          current.concat(currency),
          currency,
        );
      });
    },
    [],
  );

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
        // Mirror the onboarding-seeded value into Evolu so a brand-new
        // account converges to cashu.cz across devices even before the user
        // touches the mint UI.
        upsertDefaultMintToOwnerMetaRef.current(seededMint);
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
  }, [appOwnerId, appOwnerIdRef, makeLocalStorageKey]);

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

  const [cashuDraft, setCashuDraft] = useState("");
  const cashuDraftRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [cashuEmitAmount, setCashuEmitAmount] = useState("");
  const [cashuIsBusy, setCashuIsBusy] = useState(false);
  const [cashuBulkCheckIsBusy, setCashuBulkCheckIsBusy] = useState(false);
  const [tokensRestoreIsBusy, setTokensRestoreIsBusy] = useState(false);
  const [shareOptionsText, setShareOptionsText] = useState<string | null>(null);

  const cashuOpQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const enqueueCashuOp = React.useCallback((op: () => Promise<void>) => {
    const next = cashuOpQueueRef.current.then(op, op);
    cashuOpQueueRef.current = next.catch(() => {});
    return next;
  }, []);

  const [defaultMintUrl, setDefaultMintUrl] = useState<string | null>(null);
  const [defaultMintUrlDraft, setDefaultMintUrlDraft] = useState<string>("");

  const [contactPaymentIntent, setContactPaymentIntent] = useState<
    "pay" | "request"
  >("pay");
  const [payAmount, setPayAmount] = useState<string>("");
  const [lnAddressPayAmount, setLnAddressPayAmount] = useState<string>("");

  const [topupAmount, setTopupAmount] = useState<string>("");
  const [topupInvoice, setTopupInvoice] = useState<string | null>(null);
  const [topupInvoiceCashuRequest, setTopupInvoiceCashuRequest] = useState<
    string | null
  >(null);
  const [topupInvoiceQr, setTopupInvoiceQr] = useState<string | null>(null);
  const [topupInvoiceQrPayload, setTopupInvoiceQrPayload] = useState<
    string | null
  >(null);
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
  const [pendingCashuTokenContactPickId, setPendingCashuTokenContactPickId] =
    useState<CashuTokenId | null>(null);

  const [
    pendingLightningInvoiceConfirmation,
    setPendingLightningInvoiceConfirmation,
  ] = useState<LightningInvoicePreview | null>(null);
  const [
    pendingLnurlWithdrawConfirmation,
    setPendingLnurlWithdrawConfirmation,
  ] = useState<LnurlWithdrawPreview | null>(null);
  const [
    pendingMintAutoswapChangeConfirmation,
    setPendingMintAutoswapChangeConfirmation,
  ] = useState<{
    fromMint: string;
    toMint: string;
  } | null>(null);
  const pendingMintAutoswapChangeResolverRef = React.useRef<
    ((confirmed: boolean) => void) | null
  >(null);
  const [
    pendingPaymentMintMeltConfirmation,
    setPendingPaymentMintMeltConfirmation,
  ] = useState<{
    fromMint: string;
    toMint: string;
  } | null>(null);
  const meltLargestForeignMintToMainMintRef = React.useRef<() => Promise<void>>(
    async () => {},
  );
  const [lnurlWithdrawIsBusy, setLnurlWithdrawIsBusy] = useState(false);

  const npubCashClaimInFlightRef = React.useRef(false);
  const npubCashMintSyncRef = React.useRef<string | null>(null);

  const {
    paidOverlayIsOpen,
    paidOverlayTitle,
    showPaidOverlay,
    topupPaidNavTimerRef,
  } = usePaidOverlayState({
    t,
  });

  const finalizeTopupInvoicePaid = React.useCallback(
    (args: { amountSat: number; gainedToken?: string | null }) => {
      if (topupInvoicePaidHandledRef.current) return;

      const amountSat = args.amountSat;
      const topupInvoice = topupMintQuote?.invoice ?? null;
      const topupInvoicePreview = topupInvoice
        ? getLightningInvoicePreview(topupInvoice)
        : null;

      logPaymentEvent({
        amount: amountSat,
        details:
          topupInvoice || args.gainedToken
            ? {
                ...(args.gainedToken ? { gainedToken: args.gainedToken } : {}),
                ...(topupInvoice ? { lightningInvoice: topupInvoice } : {}),
                ...(topupInvoicePreview?.description
                  ? { lightningMemo: topupInvoicePreview.description }
                  : {}),
              }
            : null,
        direction: "in",
        method: "lightning_invoice",
        mint: topupMintQuote?.mintUrl ?? defaultMintUrl ?? null,
        status: "ok",
        unit: topupMintQuote?.unit ?? "sat",
      });

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
      defaultMintUrl,
      formatDisplayedAmountParts,
      logPaymentEvent,
      setTopupAmount,
      setTopupInvoice,
      setTopupInvoiceError,
      setTopupInvoiceIsBusy,
      setTopupInvoiceQr,
      showPaidOverlay,
      t,
      topupMintQuote,
      topupPaidNavTimerRef,
    ],
  );

  // Default mint cross-tab + cross-device sync via Evolu `ownerMeta`.
  //
  // Background: the per-owner localStorage override
  // (`linky.cashu.defaultMintOverride.v1.<owner>`) is tab-local, so other
  // tabs (and other devices) don't see the change until reload. ownerMeta is
  // an Evolu lane that already propagates via BroadcastChannel (same-origin
  // tabs, instant) and via the Evolu sync server (other devices), so we
  // mirror the default-mint value into it.
  const ownerMetaDefaultMintRowId = React.useMemo(
    () => Evolu.createIdFromString<"OwnerMeta">("owner-pointer-defaultMint"),
    [],
  );

  const ownerMetaDefaultMintQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("ownerMeta")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where(
            "scope",
            "=",
            "defaultMint" as typeof Evolu.NonEmptyString100.Type,
          ),
      ),
    [],
  );
  const ownerMetaDefaultMintRows = useQuery(ownerMetaDefaultMintQuery);

  const ownerMetaDefaultMintValue = React.useMemo(() => {
    for (const row of ownerMetaDefaultMintRows) {
      if (typeof row !== "object" || row === null) continue;
      if (!("value" in row)) continue;
      const raw = String(row.value ?? "").trim();
      if (!raw) continue;
      const cleaned = normalizeMintUrl(raw);
      if (cleaned) return cleaned;
    }
    return null;
  }, [ownerMetaDefaultMintRows]);

  // ownerMeta -> local state: when another tab/device wrote a different
  // default mint, pick it up here. This is the ONLY direction watched as an
  // effect. A symmetric `defaultMintUrl -> ownerMeta` watcher would
  // ping-pong with the remote: in the same render where this effect queues
  // setDefaultMintUrl(remoteValue), the symmetric effect would read the
  // STALE local `defaultMintUrl` and upsert it back, racing with the remote
  // value. Two devices in this state oscillate every few ms (visible in
  // ownerMeta CRDT history). Explicit pushes happen instead from
  // `upsertDefaultMintToOwnerMeta` called by user actions and the seed
  // effect.
  React.useEffect(() => {
    if (!ownerMetaDefaultMintValue) return;
    if (!appOwnerId) return;
    const current = normalizeMintUrl(defaultMintUrl ?? "");
    if (current === ownerMetaDefaultMintValue) return;
    setDefaultMintUrl(ownerMetaDefaultMintValue);
    setDefaultMintUrlDraft(ownerMetaDefaultMintValue);
    hasMintOverrideRef.current = true;
    try {
      const overrideKey = makeLocalStorageKey(
        CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY,
      );
      safeLocalStorageSet(overrideKey, ownerMetaDefaultMintValue);
    } catch {
      // ignore
    }
  }, [
    appOwnerId,
    defaultMintUrl,
    makeLocalStorageKey,
    ownerMetaDefaultMintValue,
  ]);

  const upsertDefaultMintToOwnerMeta = React.useCallback(
    (mintUrl: string | null | undefined) => {
      if (!metaOwnerId) return;
      const cleaned = normalizeMintUrl(mintUrl ?? "");
      if (!cleaned) return;
      if (cleaned === ownerMetaDefaultMintValue) return;
      upsert(
        "ownerMeta",
        {
          id: ownerMetaDefaultMintRowId,
          scope: "defaultMint" as typeof Evolu.NonEmptyString100.Type,
          value: cleaned as typeof Evolu.NonEmptyString1000.Type,
        },
        { ownerId: metaOwnerId },
      );
    },
    [metaOwnerId, ownerMetaDefaultMintRowId, ownerMetaDefaultMintValue, upsert],
  );

  const upsertDefaultMintToOwnerMetaRef = React.useRef(
    upsertDefaultMintToOwnerMeta,
  );
  React.useEffect(() => {
    upsertDefaultMintToOwnerMetaRef.current = upsertDefaultMintToOwnerMeta;
  }, [upsertDefaultMintToOwnerMeta]);

  const resolveOwnerIdForWrite = React.useCallback(async () => {
    if (cashuOwnerIdRef.current) return cashuOwnerIdRef.current;
    if (isSeedLogin) return null;
    try {
      const owner = await evolu.appOwner;
      return owner?.id ?? null;
    } catch {
      return null;
    }
  }, [cashuOwnerIdRef, isSeedLogin]);

  React.useEffect(() => {
    if (!appOwnerId) return;
    migrateLegacyPaymentEventsToEvolu(appOwnerId, transactionsOwnerId);
  }, [appOwnerId, migrateLegacyPaymentEventsToEvolu, transactionsOwnerId]);

  const evoluHistoryAllowedOwnerIds = React.useMemo(() => {
    const ids = [
      String(appOwnerId ?? "").trim(),
      ...cashuVisibleOwnerIds.map((ownerId) => String(ownerId ?? "").trim()),
      ...messagesVisibleOwnerIds.map((ownerId) => String(ownerId ?? "").trim()),
      ...transactionsVisibleOwnerIds.map((ownerId) =>
        String(ownerId ?? "").trim(),
      ),
      String(metaOwnerId ?? "").trim(),
      ...contactsVisibleOwnerIds.map((ownerId) => String(ownerId ?? "").trim()),
    ].filter(Boolean);
    return Array.from(new Set(ids));
  }, [
    appOwnerId,
    cashuVisibleOwnerIds,
    contactsVisibleOwnerIds,
    messagesVisibleOwnerIds,
    metaOwnerId,
    transactionsVisibleOwnerIds,
  ]);

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

  const contactPayBackToChatRef = React.useRef<ContactId | null>(null);

  useRouteAmountResetEffects({
    contactPayBackToChatRef,
    contactsHeaderVisible,
    routeKind: route.kind,
    setContactPaymentIntent,
    setLnAddressPayAmount,
    setPayAmount,
  });

  const topupRecipientNprofile = React.useMemo(() => {
    try {
      const decoded = nip19.decode(currentNpub ?? "");
      if (decoded.type !== "npub" || typeof decoded.data !== "string") {
        return null;
      }
      return nip19.nprofileEncode({
        pubkey: decoded.data,
        relays: NOSTR_RELAYS,
      });
    } catch {
      return null;
    }
  }, [currentNpub]);

  useStatusToasts({
    pushToast,
    setStatus,
    status,
  });

  const cashuTokensAllQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db.selectFrom("cashuToken").selectAll().orderBy("createdAt", "desc"),
      ),
    [],
  );
  const cashuTokensAll = useQuery(cashuTokensAllQuery);

  const copyText = React.useCallback(
    async (value: string) => {
      try {
        const copied = await writeClipboardText(value);
        if (!copied) {
          pushToast(t("copyFailed"));
          return;
        }
        pushToast(t("copiedToClipboard"));
      } catch {
        pushToast(t("copyFailed"));
      }
    },
    [pushToast, t],
  );

  const {
    activeContactsOwnerContactCount,
    activeGroup,
    activeNostrMessagePublishClientIdsRef,
    addNewContactFromIdentifier,
    addNewContactFromSearchResult,
    addUnknownContactFromChat,
    appendLocalNostrMessage,
    autoAcceptedChatMessageIdsRef,
    bankPaymentOfferContacts,
    bankPaymentOfferMessages,
    bankPaymentOfferRecipientCount,
    blockArchivedContact,
    blockUnknownContactFromChat,
    buildSavedContactName,
    canAddContact,
    canSaveNewRelay,
    chatDidInitialScrollForContactRef,
    chatDraft,
    chatForceScrollToBottomRef,
    chatLastMessageCountRef,
    chatMessageElByIdRef,
    chatMessages,
    chatMessagesRef,
    chatMessagesWithBankPaymentOffers,
    chatOwnPubkeyHex,
    chatScrollTargetIdRef,
    chatSeenWrapIdsRef,
    chatSendIsBusy,
    closeContactDetail,
    connectedRelayCount,
    contactAttentionById,
    contactEditsSavable,
    contactFilterOptions,
    contactSuggestions,
    contacts,
    contactsLatestRef,
    contactsOnboardingHasBackedUpKeys,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    contactsSearch,
    contactsSearchInputRef,
    dedupeContacts,
    dedupeContactsIsBusy,
    displayContactById,
    displayContacts,
    editContext,
    editingId,
    enqueuePendingPayment,
    form,
    getNpubMessageContactInfo,
    groupNames,
    handleSaveContact,
    isBankPaymentOfferCanceled,
    isSavingContact,
    knownNostrMessageIdentityIndex,
    lastMessageByContactId,
    mentionContacts,
    newRelayUrl,
    nostrBootstrapReady,
    nostrFetchRelays,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesLocal,
    nostrMessagesRecent,
    nostrPictureByNpub,
    nostrRelayOverallStatus,
    nostrStatusByNpub,
    onCancelEdit,
    onCancelReply,
    onCopyChatMessage,
    onDeclineChatPaymentRequest,
    onEditChatMessage,
    onReactToChatMessage,
    onReplyToChatMessage,
    openContactDetail,
    openContactPay,
    openFeedbackContact,
    openNewContactPage,
    openNpubMessageContact,
    openScannedContactPendingNpubRef,
    pendingDeleteId,
    pendingPayments,
    pendingRelayDeleteUrl,
    publishSingleWrappedWithRetry,
    publishWrappedWithRetry,
    reactionsByMessageId,
    refreshContactFromNostr,
    relayStatusByUrl,
    relayUrls,
    rememberBlobAvatarUrl,
    removePendingPayment,
    replyContext,
    requestBankPaymentOffer,
    requestDeleteCurrentContact,
    requestDeleteSelectedRelay,
    resetEditedContactFieldFromNostr,
    respondToBankPaymentOfferWithGroupState,
    restoreArchivedContact,
    saveNewRelay,
    searchNewContact,
    selectedChatContact,
    selectedContact,
    selectedRelayUrl,
    sendChatImage,
    sendChatMessage,
    sendChatOrEditMessage,
    setActiveGroup,
    setBankPaymentOfferRecipientCount,
    setChatDraft,
    setContactNewPrefill,
    setContactsOnboardingHasBackedUpKeys,
    setContactsOnboardingHasPaid,
    setContactsSearch,
    setForm,
    setNewRelayUrl,
    setPendingDeleteId,
    statusFilterCurrencies,
    triggerChatScrollToBottom,
    ungroupedCount,
    unknownNameByNpub,
    updateLocalNostrMessage,
    upsertBankPaymentOfferMessage,
    visibleContacts,
  } = useContactsMessagingComposition({
    activeSyncedNostrIdentity,
    appOwnerId,
    appOwnerIdRef,
    cashuOwnerId,
    cashuTokensAll,
    contactPayBackToChatRef,
    contactsOwnerId,
    contactsOwnerNewContactsCount,
    contactsVisibleOwnerIds,
    copyText,
    currentNpub,
    currentNsec,
    formatDisplayedAmountText,
    historicalOwnerSetsReady,
    identityOwnerId,
    insert,
    isSeedLogin,
    lang,
    legacyIdentitiesOwnerId,
    legacyMessagesIdentityOwnerId,
    logPayStep,
    maybeShowPwaNotification,
    messagesOwnerId,
    messagesOwnerIdRef,
    messagesVisibleOwnerIds,
    metaOwnerId,
    nostrIdentityRows,
    pushToast,
    recordContactsOwnerWrite,
    recordMessagesOwnerWrite,
    recordTransactionsOwnerWrite,
    route,
    setContactPaymentIntent,
    setPayAmount,
    setStatus,
    syncedNostrIdentityMatchesLocal,
    syncedNostrIdentityResolution,
    t,
    transactionsBootstrapSnapshot,
    transactionsOwnerId,
    update,
    upsert,
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

  const activeCashuOwnerId = String(cashuOwnerId ?? "").trim();
  const visibleCashuOwnerIds = React.useMemo(
    () =>
      new Set(
        cashuVisibleOwnerIds
          .map((ownerId) => String(ownerId ?? "").trim())
          .filter(Boolean),
      ),
    [cashuVisibleOwnerIds],
  );
  const readCashuRowOwnerId = React.useCallback((row: unknown): string => {
    if (typeof row !== "object" || row === null) return "";
    if (!("ownerId" in row)) return "";
    const ownerId = row.ownerId;
    if (typeof ownerId !== "string") return "";
    return ownerId.trim();
  }, []);

  const readCashuRowAliases = React.useCallback(
    (row: { rawToken?: string | null; token?: string | null } | null) => {
      return [
        String(row?.rawToken ?? "").trim(),
        String(row?.token ?? "").trim(),
      ].filter(Boolean);
    },
    [],
  );

  const dedupeVisibleCashuRows = React.useCallback(
    function dedupeVisibleCashuRows<
      TRow extends {
        id?: string | null;
        isDeleted?: unknown;
        ownerId?: unknown;
        rawToken?: string | null;
        state?: unknown;
        token?: string | null;
      },
    >(rows: readonly TRow[]): TRow[] {
      if (visibleCashuOwnerIds.size === 0) return [];

      const ownerRank = new Map<string, number>();
      let rank = 0;
      for (const normalizedOwnerId of visibleCashuOwnerIds) {
        if (!normalizedOwnerId || ownerRank.has(normalizedOwnerId)) continue;
        ownerRank.set(normalizedOwnerId, rank);
        rank += 1;
      }

      const canonicalByAlias = new Map<string, string>();
      const bestByCanonical = new Map<string, TRow>();
      const readRowCandidates = (row: TRow): string[] => {
        const id = String(row.id ?? "").trim();
        return id
          ? [id, ...readCashuRowAliases(row)]
          : readCashuRowAliases(row);
      };

      const isCandidateBetter = (candidate: TRow, existing: TRow): boolean => {
        return isCashuRowCandidateBetter({
          activeOwnerId: activeCashuOwnerId,
          candidate,
          existing,
          ownerRank,
        });
      };

      for (const row of rows) {
        const ownerId = readCashuRowOwnerId(row);
        if (!visibleCashuOwnerIds.has(ownerId)) continue;

        const rowCandidates = readRowCandidates(row);
        if (rowCandidates.length === 0) continue;

        const canonicalKey =
          rowCandidates.find((candidate) => canonicalByAlias.has(candidate)) ??
          rowCandidates[0];
        const existing = bestByCanonical.get(canonicalKey);

        if (!existing || isCandidateBetter(row, existing)) {
          bestByCanonical.set(canonicalKey, row);
        }

        for (const candidate of rowCandidates) {
          canonicalByAlias.set(candidate, canonicalKey);
        }
      }

      return rows.filter((row) => {
        const rowCandidates = readRowCandidates(row);
        if (rowCandidates.length === 0) return false;

        const canonicalKey =
          rowCandidates.find((candidate) => canonicalByAlias.has(candidate)) ??
          rowCandidates[0];
        return bestByCanonical.get(canonicalKey) === row;
      });
    },
    [
      activeCashuOwnerId,
      readCashuRowAliases,
      readCashuRowOwnerId,
      visibleCashuOwnerIds,
    ],
  );

  const cashuTokensAllFiltered = React.useMemo(() => {
    return dedupeVisibleCashuRows(cashuTokensAll);
  }, [cashuTokensAll, dedupeVisibleCashuRows]);

  const cashuTokensFiltered = React.useMemo(
    () => cashuTokensAllFiltered.filter((row) => !row.isDeleted),
    [cashuTokensAllFiltered],
  );

  const cashuTokensWithMeta = useMemo(
    () =>
      cashuTokensFiltered.flatMap((row) => {
        const meta = extractCashuTokenMeta({
          amount: row.amount,
          mint: row.mint,
          rawToken: row.rawToken,
          token: row.token,
          unit: row.unit,
        });
        const amount = meta.amount ?? 0;
        if (amount <= 0) return [];

        return [
          {
            ...row,
            mint: meta.mint ?? null,
            unit: meta.unit ?? null,
            amount,
            tokenText: meta.tokenText,
          },
        ];
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
    upsert,
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
      const identityToken = String(row.rawToken ?? row.token ?? "").trim();
      const rowCandidates = [
        String(row.id ?? "").trim(),
        identityToken ? String(createCashuTokenId(identityToken)) : "",
        String(row.rawToken ?? "").trim(),
        String(row.token ?? "").trim(),
      ].filter(Boolean);
      if (rowCandidates.length === 0) return false;

      return activeRows.some((activeRow) => {
        const activeIdentityToken = String(
          activeRow.rawToken ?? activeRow.token ?? "",
        ).trim();
        const activeCandidates = [
          String(activeRow.id ?? "").trim(),
          activeIdentityToken
            ? String(createCashuTokenId(activeIdentityToken))
            : "",
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

      if (!hasActiveDuplicate(row)) {
        const token = String(row.token ?? row.rawToken ?? "").trim();
        const rawToken = String(row.rawToken ?? "").trim();
        const state = String(row.state ?? "").trim() || "accepted";
        const error = String(row.error ?? "").trim();

        if (token) {
          const payload: {
            id: CashuTokenId;
            token: typeof Evolu.NonEmptyString.Type;
            state: typeof Evolu.NonEmptyString100.Type;
            error?: typeof Evolu.NonEmptyString1000.Type;
          } = {
            id: createCashuTokenId(rawToken || token),
            token: token as typeof Evolu.NonEmptyString.Type,
            state: state as typeof Evolu.NonEmptyString100.Type,
          };

          if (error) {
            payload.error = error as typeof Evolu.NonEmptyString1000.Type;
          }

          const insertResult = upsert("cashuToken", payload, {
            ownerId: cashuOwnerId,
          });
          if (!insertResult.ok) continue;
        }
      }

      migratedMisplacedCashuTokenIdsRef.current.add(rowId);

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
    upsert,
    readCashuRowOwnerId,
    update,
  ]);

  React.useEffect(() => {
    if (!topupMintQuote) return;

    let cancelled = false;
    let claimInFlight = false;
    let lastLoggedClaimError = "";
    // Cache the loaded wallet across the 5s polling ticks within this
    // effect mount. Each tick only does a `checkMintQuote` + the eventual
    // mintProofs, neither of which needs a fresh `loadMint()`. The effect
    // tears down when topupMintQuote changes, so the cache is naturally
    // scoped to one quote / one mintUrl+unit pair.
    let cachedWallet: LoadedCashuWallet | null = null;
    const run = async () => {
      if (claimInFlight) return;
      claimInFlight = true;
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
            id: createCashuTokenId(claimed.token),
            token: claimed.token as typeof Evolu.NonEmptyString.Type,
            state: "accepted" as typeof Evolu.NonEmptyString100.Type,
          };

          const result = ownerId
            ? upsert("cashuToken", payload, { ownerId })
            : upsert("cashuToken", payload);
          if (!result.ok) {
            setStatus(
              `${t("errorPrefix")}: ${getUnknownErrorMessage(result.error, "unknown")}`,
            );
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
              finalizeTopupInvoicePaid({
                amountSat: claimedBeforeRun.amount,
                gainedToken: claimedBeforeRun.token,
              });
            }
            setTopupMintQuote(null);
          }
          return;
        }

        const { Mint, Wallet, MintQuoteState, getEncodedToken } =
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
                  finalizeTopupInvoicePaid({
                    amountSat: alreadyClaimed.amount,
                    gainedToken: alreadyClaimed.token,
                  });
                }
                setTopupMintQuote(null);
              }
              return;
            }

            let wallet = cachedWallet;
            if (!wallet) {
              const det = getCashuDeterministicSeedFromStorage();
              wallet = await createLoadedCashuWallet({
                Mint,
                Wallet,
                mintUrl: topupMintQuote.mintUrl,
                ...(topupMintQuote.unit ? { unit: topupMintQuote.unit } : {}),
                ...(det ? { bip39seed: det.bip39seed } : {}),
              });
              cachedWallet = wallet;
            }

            const status = await wallet.checkMintQuoteBolt11(quoteId);
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
                id: createCashuTokenId(token),
                token: token as typeof Evolu.NonEmptyString.Type,
                state: "accepted" as typeof Evolu.NonEmptyString100.Type,
              };

              const result = ownerId
                ? upsert("cashuToken", payload, { ownerId })
                : upsert("cashuToken", payload);
              if (!result.ok) {
                setStatus(
                  `${t("errorPrefix")}: ${getUnknownErrorMessage(result.error, "unknown")}`,
                );
                return;
              }
            }

            if (route.kind === "topupInvoice") {
              finalizeTopupInvoicePaid({
                amountSat: topupMintQuote.amount,
                gainedToken: token,
              });
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
      } catch (error) {
        const message = getUnknownErrorMessage(error, "unknown");
        const errorKey = `${topupMintQuote.mintUrl}:${message}`;
        if (errorKey !== lastLoggedClaimError) {
          lastLoggedClaimError = errorKey;
          console.warn("[linky][topup] mint claim failed", {
            error: message,
            likelyCors: isLikelyCorsOrNetworkError(message),
            mintUrl: topupMintQuote.mintUrl,
            route: route.kind,
          });
        }
        if (
          shouldKeepTopupQuoteAfterClaimError(
            error,
            (e: unknown) =>
              isCashuOutputsAlreadySignedError(e) ||
              isCashuOutputsArePendingError(e),
          )
        ) {
          setStatus(`${t("restoreFailed")}: ${message}`);
        } else if (isCashuOutputsAlreadySignedError(error) && !cancelled) {
          // Recovery already ran inside mintTopupProofs. Drop the pending
          // quote so the 5s tick stops re-issuing the same failing mint
          // call against the same deterministic counter.
          setTopupMintQuote(null);
        }
      } finally {
        claimInFlight = false;
      }
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, 5000);
    const runWhenVisible = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      void run();
    };

    window.addEventListener("focus", runWhenVisible);
    window.addEventListener("pageshow", runWhenVisible);
    window.addEventListener("online", runWhenVisible);
    document.addEventListener("visibilitychange", runWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runWhenVisible);
      window.removeEventListener("pageshow", runWhenVisible);
      window.removeEventListener("online", runWhenVisible);
      document.removeEventListener("visibilitychange", runWhenVisible);
    };
  }, [
    appOwnerId,
    formatDisplayedAmountParts,
    finalizeTopupInvoicePaid,
    upsert,
    isCashuTokenKnownAny,
    resolveOwnerIdForWrite,
    topupMintQuote,
    t,
    route.kind,
    showPaidOverlay,
    setStatus,
  ]);

  const {
    getMintIconUrl,
    getMintRuntime,
    isMintDeleted,
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

  // Tutorial progress remains local-only.

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

  React.useEffect(() => {
    appendIdentityChangeNoticesRef.current = ({
      changedAtSec,
      identitySource,
    }) => {
      if (!Number.isFinite(changedAtSec) || changedAtSec <= 0) return;

      for (const contactId of lastMessageByContactId.keys()) {
        const normalizedContactId = String(contactId ?? "").trim();
        if (!normalizedContactId) continue;
        if (isUnknownContactId(normalizedContactId)) continue;

        appendLocalNostrMessage({
          contactId: normalizedContactId,
          content: buildIdentityChangeMessageContent({
            changedAtSec,
            source: identitySource,
          }),
          createdAtSec: Math.trunc(changedAtSec),
          direction: "out",
          localOnly: true,
          pubkey: "",
          rumorId: null,
          wrapId: buildIdentityChangeMessageWrapId({
            changedAtSec,
            contactId: normalizedContactId,
            source: identitySource,
          }),
        });
      }
    };

    return () => {
      appendIdentityChangeNoticesRef.current = null;
    };
  }, [
    appendIdentityChangeNoticesRef,
    appendLocalNostrMessage,
    lastMessageByContactId,
  ]);

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
      // Target the lane that holds the row (Evolu keys rows by (ownerId, id));
      // deleting under the active lane no-ops on rows in older cashu-n lanes.
      const rowOwnerId = resolveCashuRowStoredOwnerLane(row) ?? cashuOwnerId;
      if (rowOwnerId) {
        update("cashuToken", payload, { ownerId: rowOwnerId });
      } else {
        update("cashuToken", payload);
      }
    }
  }, [cashuOwnerId, cashuTokensAllFiltered, nostrMessagesLocal, update]);

  // lastMessageByContactId provided by the derived Nostr index above.

  const cashuTotalBalance = useMemo(() => {
    return cashuTokensWithMeta.reduce((sum, token) => {
      if (!isCashuTokenAcceptedState(token.state)) return sum;
      const amount = Number(token.amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }, [cashuTokensWithMeta]);

  const cashuAcceptedMintBalances = useMemo(() => {
    const balances = new Map<string, number>();
    for (const token of cashuTokensWithMeta) {
      if (!isCashuTokenAcceptedState(token.state)) continue;

      const mint = normalizeMintUrl(String(token.mint ?? "").trim());
      if (!mint) continue;

      const amount = Number(token.amount ?? 0);
      const nextAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
      balances.set(mint, (balances.get(mint) ?? 0) + nextAmount);
    }

    return balances;
  }, [cashuTokensWithMeta]);

  const cashuBalance = useMemo(() => {
    let largestBalance = 0;
    for (const balance of cashuAcceptedMintBalances.values()) {
      if (balance > largestBalance) largestBalance = balance;
    }

    return largestBalance;
  }, [cashuAcceptedMintBalances]);

  const paymentMintMeltPlan = React.useMemo(() => {
    return getPaymentMintMeltPlan({
      mainMint: normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL),
      balances: Array.from(cashuAcceptedMintBalances, ([mint, sum]) => ({
        mint,
        sum,
      })),
    });
  }, [cashuAcceptedMintBalances, defaultMintUrl]);

  const cashuBalanceAfterMelt = Math.max(
    cashuBalance,
    paymentMintMeltPlan?.maxBalanceAfterMelt ?? 0,
  );

  const requestPaymentMintMelt = React.useCallback(
    (amountSat: number): boolean => {
      if (
        !canOfferPaymentMintMelt({
          amountSat,
          currentBalance: cashuBalance,
          plan: paymentMintMeltPlan,
        }) ||
        !paymentMintMeltPlan
      ) {
        return false;
      }

      setPendingPaymentMintMeltConfirmation({
        fromMint: paymentMintMeltPlan.fromMint,
        toMint: paymentMintMeltPlan.toMint,
      });
      return true;
    },
    [cashuBalance, paymentMintMeltPlan],
  );

  const cashuHasMultipleAcceptedMints = cashuAcceptedMintBalances.size > 1;

  const cashuOwnTokens = React.useMemo(
    () =>
      cashuTokensWithMeta.filter(
        (token) =>
          !isCashuTokenEmittedState(token.state) &&
          !isCashuTokenReservedState(token.state),
      ),
    [cashuTokensWithMeta],
  );

  const cashuIssuedTokens = React.useMemo(
    () =>
      cashuTokensWithMeta.filter(
        (token) =>
          isCashuTokenEmittedState(token.state) ||
          isCashuTokenReservedState(token.state),
      ),
    [cashuTokensWithMeta],
  );

  const cashuOwnSpentTokens = React.useMemo(
    () =>
      cashuOwnTokens.filter((token) =>
        isCashuTokenDefinitivelySpent({
          state: token.state,
          error: token.error,
        }),
      ),
    [cashuOwnTokens],
  );

  const [deleteSpentCashuTokensIsBusy, setDeleteSpentCashuTokensIsBusy] =
    useState(false);
  const deleteSpentCashuTokens = React.useCallback(async () => {
    if (deleteSpentCashuTokensIsBusy) return;
    const targets = cashuOwnSpentTokens.filter((token) => Boolean(token.id));
    if (targets.length === 0) return;

    setDeleteSpentCashuTokensIsBusy(true);
    try {
      const fallbackOwnerId = await resolveOwnerIdForWrite();
      let deleted = 0;
      for (const token of targets) {
        const payload = {
          id: token.id as CashuTokenId,
          isDeleted: Evolu.sqliteTrue,
        };
        // Delete in the row's own lane; Evolu keys rows by (ownerId, id) so a
        // delete under the active lane silently misses rows in older lanes.
        const ownerId =
          resolveCashuRowStoredOwnerLane(token) ?? fallbackOwnerId;
        const result = ownerId
          ? update("cashuToken", payload, { ownerId })
          : update("cashuToken", payload);
        if (result.ok) deleted += 1;
      }
      if (deleted > 0) {
        setStatus(
          t("cashuDeleteSpentDone").replace("{count}", String(deleted)),
        );
      }
    } finally {
      setDeleteSpentCashuTokensIsBusy(false);
    }
  }, [
    cashuOwnSpentTokens,
    deleteSpentCashuTokensIsBusy,
    resolveOwnerIdForWrite,
    setStatus,
    t,
    update,
  ]);

  const canPayWithCashu = cashuBalance > 0;

  React.useEffect(() => {
    if (route.kind !== "topupInvoice") return;
    if (topupInvoiceIsBusy) return;
    if (!topupInvoice || !topupInvoiceQr) return;

    const amountSat = Number.parseInt(topupAmount.trim(), 10);
    if (!Number.isFinite(amountSat) || amountSat <= 0) return;

    if (topupInvoiceStartBalanceRef.current === null) {
      topupInvoiceStartBalanceRef.current = cashuTotalBalance;
      return;
    }

    if (topupInvoicePaidHandledRef.current) return;

    const start = topupInvoiceStartBalanceRef.current ?? 0;
    const expected = start + amountSat;
    if (cashuTotalBalance < expected) return;

    finalizeTopupInvoicePaid({ amountSat });
  }, [
    cashuTotalBalance,
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

  const {
    cycleProfileAvatarControl,
    derivedProfile,
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    isProfileEditing,
    myProfileName,
    myProfileQr,
    myProfileStatus,
    npubCashInfoInFlightRef,
    npubCashInfoLoadedAtMsRef,
    npubCashInfoLoadedForNpubRef,
    npubCashServerBaseUrl,
    onPickProfilePhoto,
    onProfilePhotoError,
    onProfilePhotoSelected,
    openProfileQr,
    ownedProfileLightningAddresses,
    profileClaimLightningAddressServerBaseUrl,
    profileCustomPictureUrl,
    profileEditInitialRef,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditStatus,
    profileEditsSavable,
    profilePhotoInputRef,
    profileSelectedPictureKind,
    profileStatusCurrencies,
    profileStatusIsSaving,
    saveClaimedLightningAddress,
    saveProfileEdits,
    selectedProfileStatusCurrencies,
    setIsProfileEditing,
    setMyProfileQr,
    setOwnedProfileLightningAddresses,
    setOwnedProfileLightningAddressesLoading,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditStatus,
    setShowProfileQrOnTiltEnabled,
    showProfileQrOnTiltEnabled,
    toggleProfileEditing,
    toggleProfileStatusCurrency,
    unregisteredOwnLightningAddress,
  } = useProfileComposition({
    currentNpub,
    currentNsec,
    lang,
    nostrBootstrapReady,
    nostrFetchRelays,
    rememberBlobAvatarUrl,
    route,
    setStatus,
    t,
  });

  useTopupInvoiceQuoteEffects({
    defaultMintUrl,
    effectiveMyLightningAddress,
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
    topupRecipientNprofile,
    setTopupAmount,
    setTopupInvoice,
    setTopupInvoiceCashuRequest,
    setTopupInvoiceError,
    setTopupInvoiceIsBusy,
    setTopupInvoiceQr,
    setTopupInvoiceQrPayload,
    setTopupMintQuote,
  });

  useAppPreferences({
    allowedDisplayCurrencies,
    cashuAutoswapEnabled,
    displayCurrency,
    bankPaymentOfferRecipientCount,
    lang,
    lightningInvoiceAutoPayLimit,
    payWithCashuEnabled,
    showProfileQrOnTiltEnabled,
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

  const currentMainMintAcceptedBalance = React.useMemo(() => {
    const currentMainMint = normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL);
    if (!currentMainMint) return 0;

    let sum = 0;
    for (const row of cashuTokensWithMeta) {
      if (!isCashuTokenAcceptedState(row.state)) continue;

      const mint = normalizeMintUrl(String(row.mint ?? "").trim());
      if (mint !== currentMainMint) continue;

      const amount = Number(row.amount ?? 0);
      if (Number.isFinite(amount) && amount > 0) {
        sum += amount;
      }
    }

    return sum;
  }, [cashuTokensWithMeta, defaultMintUrl]);

  const {
    applyDefaultMintSelection: applyDefaultMintSelectionInner,
    makeNip98AuthHeader,
  } = useNpubCashMintSelection({
    cashuAutoswapEnabled,
    currentMainMintAcceptedBalance,
    currentNpub,
    currentNsec,
    defaultMintUrl,
    defaultMintUrlDraft,
    hasMintOverrideRef,
    makeLocalStorageKey,
    npubCashServerBaseUrl,
    ownedLightningAddresses: ownedProfileLightningAddresses,
    profileClaimLightningAddressServerBaseUrl,
    npubCashMintSyncRef,
    pushToast,
    requestMintAutoswapChangeConfirmation: React.useCallback(
      (args: { fromMint: string; toMint: string }) => {
        pendingMintAutoswapChangeResolverRef.current?.(false);
        return new Promise<boolean>((resolve) => {
          pendingMintAutoswapChangeResolverRef.current = resolve;
          setPendingMintAutoswapChangeConfirmation(args);
        });
      },
      [],
    ),
    setCashuAutoswapEnabled,
    setDefaultMintUrl,
    setDefaultMintUrlDraft,
    setStatus,
    t,
  });

  const applyDefaultMintSelection = React.useCallback(
    async (mintUrl: string): Promise<void> => {
      await applyDefaultMintSelectionInner(mintUrl);
      // Mirror the user's explicit choice into Evolu's ownerMeta so other
      // tabs/devices converge. Done here (not in a defaultMintUrl-watch
      // effect) to avoid stale-closure ping-pong with the remote.
      upsertDefaultMintToOwnerMetaRef.current(mintUrl);
    },
    [applyDefaultMintSelectionInner],
  );

  React.useEffect(() => {
    if (!currentNpub || !currentNsec) {
      setOwnedProfileLightningAddresses([]);
      setOwnedProfileLightningAddressesLoading(false);
      return;
    }

    setOwnedProfileLightningAddresses([]);
    setOwnedProfileLightningAddressesLoading(true);

    const controller = new AbortController();
    let cancelled = false;

    const loadOwnedLightningAddresses = async () => {
      try {
        const url = `${profileClaimLightningAddressServerBaseUrl}/api/v1/info`;
        const auth = await makeNip98AuthHeader(url, "GET");
        const response = await fetch(url, {
          method: "GET",
          headers: { Authorization: auth },
          signal: controller.signal,
        });
        if (!response.ok) {
          if (!cancelled) {
            setOwnedProfileLightningAddresses([]);
            setOwnedProfileLightningAddressesLoading(false);
          }
          return;
        }

        const json = await response.json();
        if (cancelled) return;

        const info = parseNpubCashProfileInfo(json);
        setOwnedProfileLightningAddresses(info.ownedLightningAddresses);
        setOwnedProfileLightningAddressesLoading(false);
      } catch {
        if (cancelled) return;
        setOwnedProfileLightningAddresses([]);
        setOwnedProfileLightningAddressesLoading(false);
      }
    };

    void loadOwnedLightningAddresses();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    currentNpub,
    currentNsec,
    makeNip98AuthHeader,
    profileClaimLightningAddressServerBaseUrl,
    setOwnedProfileLightningAddresses,
    setOwnedProfileLightningAddressesLoading,
  ]);

  React.useEffect(() => {
    const selectedMint = normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL);
    if (!cashuAutoswapEnabled) return;
    if (!isTestMintUrl(selectedMint)) return;
    setCashuAutoswapEnabled(false);
  }, [cashuAutoswapEnabled, defaultMintUrl, setCashuAutoswapEnabled]);

  const resolvePendingMintAutoswapChangeConfirmation = React.useCallback(
    (confirmed: boolean) => {
      const resolve = pendingMintAutoswapChangeResolverRef.current;
      pendingMintAutoswapChangeResolverRef.current = null;
      setPendingMintAutoswapChangeConfirmation(null);
      resolve?.(confirmed);
    },
    [],
  );

  const closeMintAutoswapChangeConfirmation = React.useCallback(() => {
    resolvePendingMintAutoswapChangeConfirmation(false);
  }, [resolvePendingMintAutoswapChangeConfirmation]);

  const confirmMintAutoswapChangeConfirmation = React.useCallback(() => {
    resolvePendingMintAutoswapChangeConfirmation(true);
  }, [resolvePendingMintAutoswapChangeConfirmation]);

  React.useEffect(() => {
    return () => {
      pendingMintAutoswapChangeResolverRef.current?.(false);
      pendingMintAutoswapChangeResolverRef.current = null;
    };
  }, []);

  const { claimNpubCashOnce, claimNpubCashOnceLatestRef } = useNpubCashClaim({
    cashuIsBusy,
    cashuTokensAll,
    currentNpub: nostrBootstrapReady ? currentNpub : null,
    currentNsec: nostrBootstrapReady ? currentNsec : null,
    enqueueCashuOp,
    ensureCashuTokenPersisted,
    formatDisplayedAmountParts,
    upsert,
    isMintDeleted,
    logPaymentEvent,
    makeLocalStorageKey,
    makeNip98AuthHeader,
    maybeShowPwaNotification,
    mintInfoByUrl,
    npubCashServerBaseUrl,
    npubCashClaimInFlightRef,
    refreshMintInfo,
    resolveOwnerIdForWrite,
    rememberCashuTokenKnown,
    routeKind: route.kind,
    setCashuIsBusy,
    setStatus,
    showPaidOverlay,
    t,
    touchMintInfo,
  });

  useProfileNpubCashEffects({
    claimNpubCashOnce,
    claimNpubCashOnceLatestRef,
    currentNpub,
    currentNsec,
    hasMintOverrideRef,
    makeNip98AuthHeader,
    networkEnabled: nostrBootstrapReady,
    npubCashServerBaseUrl,
    npubCashInfoInFlightRef,
    npubCashInfoLoadedAtMsRef,
    npubCashInfoLoadedForNpubRef,
    routeKind: route.kind,
    setDefaultMintUrl,
    setDefaultMintUrlDraft,
    setIsProfileEditing,
    setMyProfileQr,
  });

  const { isMainSwipeRoute } = useMainSwipePageEffects({
    contactsHeaderVisible,
    contactsPullDistanceRef,
    routeKind: route.kind,
    setContactsHeaderVisible,
    setContactsPulling,
  });

  const { commitMainSwipe, handleMainSwipeScroll } = useMainSwipeNavigation({
    isMainSwipeRoute,
    mainSwipeRef,
    mainSwipeScrollTimerRef,
    routeKind: route.kind,
  });

  const clearPendingDeleteOnMenuChange = React.useCallback(() => {
    setPendingDeleteId(null);
  }, []);

  const { closeMenu, menuIsOpen, navigateToMainReturn, toggleMenu } =
    useMainMenuState({
      onClose: clearPendingDeleteOnMenuChange,
      onOpen: clearPendingDeleteOnMenuChange,
      route,
    });

  const [contactPayMethod, setContactPayMethod] = useState<
    null | "cashu" | "lightning"
  >(null);
  useContactPayMethod({
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
      );
    },
    [],
  );

  const payContactWithCashuMessage =
    usePayContactWithCashuMessage<ContactRowLike>({
      activePublishClientIdsRef: activeNostrMessagePublishClientIdsRef,
      appendLocalNostrMessage,
      buildCashuMintCandidates,
      cashuBalance,
      cashuTokensAll,
      cashuTokensWithMeta,
      chatSeenWrapIdsRef,
      currentNpub,
      currentNsec,
      defaultMintUrl,
      enqueuePendingPayment,
      formatDisplayedAmountParts,
      upsert,
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

  const settleBankPaymentOffer = React.useCallback(
    async (message: LocalNostrMessage) => {
      if (cashuIsBusy) return;

      const offerInfo = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      );
      if (!offerInfo || offerInfo.status !== "bank_paid") {
        setStatus(t("spdPaymentOfferFailed"));
        return;
      }
      if (isBankPaymentOfferCanceled(offerInfo.offerId)) {
        setStatus(t("bankPaymentOfferStatusCanceled"));
        return;
      }
      if (!offerInfo.amountSat) {
        setStatus(t("payInvalidAmount"));
        return;
      }

      const contactId = String(message.contactId ?? "").trim();
      const contact =
        contacts.find(
          (candidate) => String(candidate.id ?? "").trim() === contactId,
        ) ?? null;
      if (!contact) {
        setStatus(t("contactNotFound"));
        return;
      }

      setCashuIsBusy(true);
      try {
        const result = await payContactWithCashuMessage({
          contact,
          amountSat: offerInfo.amountSat,
          logCompletedOnly: true,
          paymentNoticeContext: LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
          paymentNoticeOfferId: offerInfo.offerId,
        });
        if (!result.ok) return;

        await respondToBankPaymentOfferWithGroupState(message, "settled");
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      cashuIsBusy,
      contacts,
      isBankPaymentOfferCanceled,
      payContactWithCashuMessage,
      respondToBankPaymentOfferWithGroupState,
      setCashuIsBusy,
      setStatus,
      t,
    ],
  );

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

    if (amountSat > cashuBalance) {
      if (!requestPaymentMintMelt(amountSat)) {
        setStatus(t("payInsufficient"));
      }
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
    cashuBalance,
    contactPayMethod,
    payAmount,
    payContactWithCashuMessage,
    requestPaymentMintMelt,
    route.kind,
    selectedContact,
    setCashuIsBusy,
    setLnAddressPayAmount,
    setStatus,
    t,
  ]);

  const findContactForCashuPaymentRequest = React.useCallback(
    (requestInfo: CashuPaymentRequestMessageInfo) => {
      const requestPubkeyHex = normalizePubkeyHex(
        requestInfo.transportPubkeyHex,
      );
      if (!requestPubkeyHex) return null;

      for (const contact of contacts) {
        const normalizedNpub = normalizeNpubIdentifier(contact.npub);
        if (!normalizedNpub) continue;

        try {
          const decoded = nip19.decode(normalizedNpub);
          if (decoded.type !== "npub") continue;
          if (typeof decoded.data !== "string") continue;
          if (decoded.data === requestPubkeyHex) return contact;
        } catch {
          // ignore malformed contact npubs
        }
      }

      return null;
    },
    [contacts],
  );

  const ensureContactForCashuPaymentRequest = React.useCallback(
    (requestInfo: CashuPaymentRequestMessageInfo): ContactRowLike | null => {
      const existing = findContactForCashuPaymentRequest(requestInfo);
      if (existing?.id) return existing;

      const requestPubkeyHex = normalizePubkeyHex(
        requestInfo.transportPubkeyHex,
      );
      if (!requestPubkeyHex) return null;

      let npub: string | null = null;
      try {
        npub = nip19.npubEncode(requestPubkeyHex);
      } catch {
        return null;
      }

      const normalizedNpub = normalizeNpubIdentifier(npub);
      if (!normalizedNpub) return null;

      const duplicate = contacts.find(
        (contact) => normalizeNpubIdentifier(contact.npub) === normalizedNpub,
      );
      if (duplicate?.id) return duplicate;

      if (activeContactsOwnerContactCount >= MAX_CONTACTS_PER_OWNER) {
        setStatus(
          t("contactsLimitReached").replace(
            "{max}",
            String(MAX_CONTACTS_PER_OWNER),
          ),
        );
        return null;
      }

      const defaultProfile = deriveDefaultProfile(normalizedNpub, lang);
      const contactName = buildSavedContactName(
        unknownNameByNpub[normalizedNpub] ?? defaultProfile.name,
        normalizedNpub,
      );
      const payload = {
        name: contactName as typeof Evolu.NonEmptyString1000.Type,
        npub: normalizedNpub as typeof Evolu.NonEmptyString1000.Type,
        lnAddress: null,
        groupName: null,
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
        setStatus(`${t("errorPrefix")}: ${String(result.error ?? "")}`);
        return null;
      }

      recordContactsOwnerWrite();
      openScannedContactPendingNpubRef.current = normalizedNpub;

      return {
        id: result.value.id,
        name: contactName,
        npub: normalizedNpub,
        lnAddress: null,
        groupName: null,
        ownerId: contactsOwnerId,
      };
    },
    [
      activeContactsOwnerContactCount,
      buildSavedContactName,
      contacts,
      contactsOwnerId,
      findContactForCashuPaymentRequest,
      insert,
      lang,
      openScannedContactPendingNpubRef,
      recordContactsOwnerWrite,
      setStatus,
      t,
      unknownNameByNpub,
    ],
  );

  const findPreviousCashuPaymentRequestMessage = React.useCallback(
    (
      requestInfo: CashuPaymentRequestMessageInfo,
      contactId: string,
    ): LocalNostrMessage | null => {
      const normalizedContactId = String(contactId ?? "").trim();
      if (!normalizedContactId) return null;

      const requestId = String(requestInfo.requestId ?? "").trim();
      const encodedRequest = String(requestInfo.encodedRequest ?? "").trim();
      if (!requestId && !encodedRequest) return null;

      const candidates = [
        ...chatMessages,
        ...nostrMessagesRecent,
        ...nostrMessagesLocal,
      ];

      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const message = candidates[index];
        if (String(message.contactId ?? "").trim() !== normalizedContactId) {
          continue;
        }
        if (String(message.direction ?? "").trim() !== "in") continue;

        const rumorId = String(message.rumorId ?? "").trim();
        if (!rumorId) continue;

        const previousInfo = parseCashuPaymentRequestMessage(
          String(message.content ?? ""),
        );
        if (!previousInfo) continue;

        const previousRequestId = String(previousInfo.requestId ?? "").trim();
        if (requestId && previousRequestId === requestId) return message;

        if (
          !requestId &&
          String(previousInfo.encodedRequest ?? "").trim() === encodedRequest
        ) {
          return message;
        }
      }

      return null;
    },
    [chatMessages, nostrMessagesLocal, nostrMessagesRecent],
  );

  const payCashuPaymentRequestViaPost = React.useCallback(
    async (requestInfo: CashuPaymentRequestMessageInfo): Promise<boolean> => {
      const postUrlRaw = String(requestInfo.transportPostUrl ?? "").trim();
      if (!postUrlRaw) return false;

      let postUrl: URL;
      try {
        postUrl = new URL(postUrlRaw);
      } catch {
        setStatus(t("paymentRequestUnknownContact"));
        return false;
      }

      if (postUrl.protocol !== "https:" && postUrl.protocol !== "http:") {
        setStatus(t("paymentRequestUnknownContact"));
        return false;
      }

      if (cashuBalance < requestInfo.amount) {
        setStatus(t("payInsufficient"));
        return true;
      }

      setCashuIsBusy(true);

      const cashuWriteOwnerId = await resolveOwnerIdForWrite();
      const insertCashuToken = (args: {
        amount: number | null;
        mint: string | null;
        state: "accepted" | "pending";
        token: string;
        unit: string | null;
      }) => {
        const payload: {
          id: CashuTokenId;
          token: typeof Evolu.NonEmptyString.Type;
          state: typeof Evolu.NonEmptyString100.Type;
        } = {
          id: createCashuTokenId(args.token),
          token: args.token as typeof Evolu.NonEmptyString.Type,
          state: args.state as typeof Evolu.NonEmptyString100.Type,
        };

        return cashuWriteOwnerId
          ? upsert("cashuToken", payload, { ownerId: cashuWriteOwnerId })
          : upsert("cashuToken", payload);
      };

      const updateCashuToken = (
        payload: {
          id: CashuTokenId;
          isDeleted: typeof Evolu.sqliteTrue;
        },
        targetOwnerId?: Evolu.OwnerId | null,
      ) => {
        const ownerId = targetOwnerId ?? cashuWriteOwnerId;
        return ownerId
          ? update("cashuToken", payload, { ownerId })
          : update("cashuToken", payload);
      };

      let sentAmountSat = 0;
      let usedMint: string | null = null;
      let usedInputTokens: string[] = [];
      let sendToken: string | null = null;
      let sendTokenAmount = 0;
      let sendProofs: Proof[] = [];
      let sendTokenUnit: string | null = null;
      let gainedToken: string | null = null;
      let lastError: unknown = null;

      try {
        const requestedMints = new Set<string>();
        for (const mintUrl of requestInfo.mintUrls) {
          const normalizedMint = normalizeMintUrl(mintUrl);
          if (normalizedMint) requestedMints.add(normalizedMint);
        }

        const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
        for (const row of cashuTokensWithMeta) {
          if (!isCashuTokenAcceptedState(row.state)) continue;
          const mint = normalizeMintUrl(String(row.mint ?? "").trim());
          if (!mint) continue;
          if (requestedMints.size > 0 && !requestedMints.has(mint)) continue;

          const tokenText = String(row.token ?? row.rawToken ?? "").trim();
          if (!tokenText) continue;

          const amount = Number(row.amount ?? 0) || 0;
          const entry = mintGroups.get(mint) ?? { tokens: [], sum: 0 };
          entry.tokens.push(tokenText);
          entry.sum += amount;
          mintGroups.set(mint, entry);
        }

        const preferredMint =
          requestInfo.mintUrls
            .map((mintUrl) => normalizeMintUrl(mintUrl))
            .find((mintUrl) => Boolean(mintUrl)) ??
          normalizeMintUrl(defaultMintUrl ?? "");
        const candidates = buildCashuMintCandidates(mintGroups, preferredMint);
        const candidate = selectSingleMintCandidateForAmount(
          candidates,
          requestInfo.amount,
        );
        if (!candidate) {
          setStatus(t("payInsufficient"));
          return true;
        }

        usedInputTokens = [...candidate.tokens];
        const maxReservedFeeSat = getPaymentAmountReserveCap(
          requestInfo.amount,
          candidate.sum,
        );
        const attempts = buildPaymentAmountAttempts(
          requestInfo.amount,
          candidate.sum,
        ).filter((attemptAmountSat) => {
          return requestInfo.amount - attemptAmountSat <= maxReservedFeeSat;
        });

        for (let index = 0; index < attempts.length; index += 1) {
          const attemptAmountSat = attempts[index];
          const hasLowerAmountFallback = index < attempts.length - 1;

          try {
            const split = await createSendTokenWithTokensAtMint({
              amount: attemptAmountSat,
              mint: candidate.mint,
              tokens: candidate.tokens,
              unit: "sat",
            });

            if (!split.ok) {
              lastError = split.error;
              if (
                hasLowerAmountFallback &&
                isRetryablePaymentAmountFailure(String(split.error ?? ""))
              ) {
                continue;
              }
              break;
            }

            const spentRows = cashuTokensWithMeta.filter((row) => {
              if (!isCashuTokenAcceptedState(row.state)) return false;
              const tokenText = String(row.token ?? row.rawToken ?? "").trim();
              return candidate.tokens.includes(tokenText);
            });
            for (const row of spentRows) {
              const rowId = row.id;
              if (!rowId) continue;
              const deleted = updateCashuToken(
                { id: rowId as CashuTokenId, isDeleted: Evolu.sqliteTrue },
                resolveCashuRowStoredOwnerLane(row),
              );
              if (!deleted.ok) throw deleted.error;
            }

            if (split.remainingToken && split.remainingAmount > 0) {
              gainedToken = split.remainingToken;
              const inserted = insertCashuToken({
                token: split.remainingToken,
                mint: split.mint,
                unit: split.unit ?? null,
                amount: split.remainingAmount,
                state: "accepted",
              });
              if (!inserted.ok) throw inserted.error;
            }

            sendToken = split.sendToken;
            sendTokenAmount = split.sendAmount;
            sendProofs = split.sendProofs;
            sendTokenUnit = split.unit ?? null;
            sentAmountSat = split.sendAmount;
            usedMint = split.mint;
            break;
          } catch (error) {
            lastError = error;
            if (
              hasLowerAmountFallback &&
              isRetryablePaymentAmountFailure(
                getUnknownErrorMessage(error, "unknown"),
              )
            ) {
              continue;
            }
            break;
          }
        }

        if (!sendToken) {
          const errorMessage = getUnknownErrorMessage(
            lastError,
            "insufficient funds",
          );
          logPaymentEvent({
            direction: "out",
            status: "error",
            amount: requestInfo.amount,
            fee: null,
            mint: usedMint,
            unit: "sat",
            error: errorMessage,
            contactId: null,
            method: "cashu_chat",
            phase: "swap",
          });
          setStatus(`${t("payFailed")}: ${errorMessage}`);
          return true;
        }

        const proofs = sendProofs.flatMap((proof) => {
          const normalized = normalizeCashuProofPayload(proof);
          return normalized ? [normalized] : [];
        });
        if (proofs.length === 0) throw new Error("empty payment proofs");

        const body: Record<string, unknown> = {
          mint: usedMint,
          unit: sendTokenUnit ?? "sat",
          proofs,
        };
        if (requestInfo.requestId) body.id = requestInfo.requestId;
        if (requestInfo.description) body.memo = requestInfo.description;

        const response = await fetch(postUrl.toString(), {
          method: "POST",
          cache: "no-store",
          credentials: "omit",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          mode: "cors",
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`Payment request POST ${response.status}`);
        }

        logPaymentEvent({
          direction: "out",
          status: "ok",
          amount: sentAmountSat,
          details: {
            ...(gainedToken ? { gainedToken } : {}),
            ...(requestInfo.requestId
              ? { requestId: requestInfo.requestId }
              : {}),
            postUrl: postUrl.toString(),
            usedInputTokens,
          },
          fee: null,
          mint: usedMint,
          unit: sendTokenUnit ?? "sat",
          error: null,
          contactId: null,
          method: "cashu_chat",
          phase: "complete",
        });

        const displayAmount = formatDisplayedAmountParts(sentAmountSat);
        showPaidOverlay(
          t("paidSentTo")
            .replace(
              "{amount}",
              `${displayAmount.approxPrefix}${displayAmount.amountText}`,
            )
            .replace("{unit}", displayAmount.unitLabel)
            .replace(
              "{name}",
              requestInfo.description || postUrl.hostname || t("appTitle"),
            ),
        );
        safeLocalStorageSet(CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY, "1");
        setContactsOnboardingHasPaid(true);
        return true;
      } catch (error) {
        if (sendToken) {
          const inserted = insertCashuToken({
            token: sendToken,
            mint: usedMint,
            unit: sendTokenUnit,
            amount: sendTokenAmount,
            state: "accepted",
          });
          if (!inserted.ok) {
            console.warn("[linky][payment-request] recovery insert failed", {
              error: String(inserted.error ?? ""),
            });
          }
        }

        const errorMessage = getUnknownErrorMessage(error, "unknown");
        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: requestInfo.amount,
          fee: null,
          mint: usedMint,
          unit: sendTokenUnit ?? "sat",
          error: errorMessage,
          contactId: null,
          method: "cashu_chat",
          phase: "publish",
        });
        setStatus(`${t("payFailed")}: ${errorMessage}`);
        return true;
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      buildCashuMintCandidates,
      cashuBalance,
      cashuTokensWithMeta,
      defaultMintUrl,
      formatDisplayedAmountParts,
      logPaymentEvent,
      resolveOwnerIdForWrite,
      setCashuIsBusy,
      setContactsOnboardingHasPaid,
      setStatus,
      showPaidOverlay,
      t,
      update,
      upsert,
    ],
  );

  const payCashuPaymentRequest = React.useCallback(
    async (requestInfo: CashuPaymentRequestMessageInfo) => {
      if (cashuIsBusy) return;
      if (requestInfo.amount > cashuBalance) {
        const requestedMints = requestInfo.mintUrls.flatMap((mintUrl) => {
          const normalizedMint = normalizeMintUrl(mintUrl);
          return normalizedMint ? [normalizedMint] : [];
        });
        const targetMainMint = paymentMintMeltPlan?.toMint ?? "";
        const mainMintIsAccepted =
          requestedMints.length === 0 ||
          (Boolean(targetMainMint) && requestedMints.includes(targetMainMint));
        if (
          !mainMintIsAccepted ||
          !requestPaymentMintMelt(requestInfo.amount)
        ) {
          setStatus(t("payInsufficient"));
        }
        return;
      }

      const contact = ensureContactForCashuPaymentRequest(requestInfo);
      if (!contact?.id) {
        if (await payCashuPaymentRequestViaPost(requestInfo)) return;
        setStatus(t("paymentRequestUnknownContact"));
        return;
      }

      setCashuIsBusy(true);
      try {
        const previousRequestMessage = findPreviousCashuPaymentRequestMessage(
          requestInfo,
          String(contact.id ?? ""),
        );
        const previousRequestRumorId = String(
          previousRequestMessage?.rumorId ?? "",
        ).trim();

        await payContactWithCashuMessage({
          contact,
          amountSat: requestInfo.amount,
          paymentRequestId: requestInfo.requestId,
          ...(previousRequestRumorId
            ? {
                replyContext: {
                  replyToId: previousRequestRumorId,
                  rootMessageId:
                    String(
                      previousRequestMessage?.rootMessageId ?? "",
                    ).trim() || previousRequestRumorId,
                  replyToContent:
                    String(previousRequestMessage?.content ?? "").trim() ||
                    null,
                },
              }
            : {}),
        });
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      cashuIsBusy,
      cashuBalance,
      ensureContactForCashuPaymentRequest,
      findPreviousCashuPaymentRequestMessage,
      payCashuPaymentRequestViaPost,
      payContactWithCashuMessage,
      paymentMintMeltPlan?.toMint,
      requestPaymentMintMelt,
      setCashuIsBusy,
      setStatus,
      t,
    ],
  );

  const {
    payLightningAddressWithCashu: payLightningAddressWithCashuBase,
    payLightningInvoiceWithCashu: payLightningInvoiceWithCashuBase,
  } = useLightningPaymentsDomain({
    buildCashuMintCandidates,
    canPayWithCashu,
    cashuBalance,
    cashuIsBusy,
    cashuOwnerId,
    cashuTokensAll,
    cashuTokensWithMeta,
    cashuVisibleOwnerIds,
    contacts,
    defaultMintUrl,
    formatDisplayedAmountParts,
    upsert,
    logPaymentEvent,
    normalizeMintUrl,
    setCashuIsBusy,
    setContactsOnboardingHasPaid,
    setPostPaySaveContact,
    setStatus,
    showPaidOverlay,
    t,
    update,
  });

  const payLightningAddressWithCashu = React.useCallback(
    async (lnAddress: string, amountSat: number): Promise<void> => {
      if (amountSat > cashuBalance) {
        if (!requestPaymentMintMelt(amountSat)) {
          setStatus(t("payInsufficient"));
        }
        return;
      }
      const paid = await payLightningAddressWithCashuBase(lnAddress, amountSat);
      if (paid) navigateTo({ route: "wallet" });
    },
    [
      cashuBalance,
      payLightningAddressWithCashuBase,
      requestPaymentMintMelt,
      setStatus,
      t,
    ],
  );

  const payLightningInvoiceWithCashu = React.useCallback(
    async (invoice: string): Promise<boolean> => {
      const amountSat = getLightningInvoicePreview(invoice)?.amountSat ?? null;
      if (amountSat !== null && amountSat > cashuBalance) {
        if (!requestPaymentMintMelt(amountSat)) {
          setStatus(t("payInsufficient"));
        }
        return false;
      }
      const paid = await payLightningInvoiceWithCashuBase(invoice);
      if (paid && route.kind === "manualPay") {
        navigateTo({ route: "wallet" });
      }
      return paid;
    },
    [
      cashuBalance,
      payLightningInvoiceWithCashuBase,
      requestPaymentMintMelt,
      route.kind,
      setStatus,
      t,
    ],
  );

  const closeLightningInvoiceConfirmation = React.useCallback(() => {
    setPendingLightningInvoiceConfirmation(null);
  }, []);

  const confirmLightningInvoicePayment = React.useCallback(async () => {
    const pending = pendingLightningInvoiceConfirmation;
    if (!pending) return;

    const ok = await payLightningInvoiceWithCashu(pending.invoice);
    if (ok) setPendingLightningInvoiceConfirmation(null);
  }, [payLightningInvoiceWithCashu, pendingLightningInvoiceConfirmation]);

  const closeLnurlWithdrawConfirmation = React.useCallback(() => {
    if (lnurlWithdrawIsBusy) return;
    setPendingLnurlWithdrawConfirmation(null);
  }, [lnurlWithdrawIsBusy]);

  const confirmLnurlWithdraw = React.useCallback(async () => {
    const pending = pendingLnurlWithdrawConfirmation;
    if (!pending || lnurlWithdrawIsBusy) return;

    const mintUrl = normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL);
    if (!mintUrl) {
      setStatus(t("topupInvoiceFailed"));
      return;
    }

    setLnurlWithdrawIsBusy(true);
    try {
      setStatus(t("lnurlWithdrawPreparing"));
      const { invoice, quoteId } = await requestMintQuoteBolt11({
        amountSat: pending.amountSat,
        mintUrl,
      });
      await redeemLnurlWithdraw({
        callback: pending.callback,
        invoice,
        k1: pending.k1,
      });
      setTopupMintQuote({
        amount: pending.amountSat,
        invoice,
        mintUrl,
        quote: quoteId,
        unit: "sat",
      });
      setPendingLnurlWithdrawConfirmation(null);
      setStatus(t("lnurlWithdrawPending"));
    } catch (error) {
      const message = getUnknownErrorMessage(error, t("lnurlWithdrawFailed"));
      setStatus(`${t("errorPrefix")}: ${message}`);
    } finally {
      setLnurlWithdrawIsBusy(false);
    }
  }, [
    defaultMintUrl,
    lnurlWithdrawIsBusy,
    pendingLnurlWithdrawConfirmation,
    setStatus,
    t,
  ]);

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
    openReceiveScan,
    openWalletScan,
    scanAllowsManualContact,
    scanEntryPoint,
    scanIsOpen,
    scanVideoRef,
    startContactsGuide,
    stopContactsGuide,
  } = useGuideScannerDomain({
    cashuBalance,
    contacts,
    contactsOnboardingHasBackedUpKeys,
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
    openNewContactPage,
    onScannedText: (rawValue: string) =>
      scannedTextHandlerRef.current(rawValue),
    pushToast,
    route,
    t,
  });
  const contactsGuideNavRef = React.useRef(contactsGuideNav);
  React.useLayoutEffect(() => {
    contactsGuideNavRef.current = contactsGuideNav;
  }, [contactsGuideNav]);
  const stableContactsGuideNav = React.useMemo(
    () => ({
      back: () => {
        contactsGuideNavRef.current.back();
      },
      next: () => {
        contactsGuideNavRef.current.next();
      },
    }),
    [],
  );

  const openManualContactFromScan = React.useCallback(() => {
    closeScan();
    if (route.kind === "contactNew") return;
    openNewContactPage();
  }, [closeScan, openNewContactPage, route.kind]);

  const scanImageInputRef = React.useRef<HTMLInputElement | null>(null);

  const openIssueTokenFromScan = React.useCallback(() => {
    closeScan();
    if (route.kind === "cashuTokenEmit") return;
    navigateTo({ route: "cashuTokenEmit" });
  }, [closeScan, route.kind]);

  const openManualPayFromScan = React.useCallback(() => {
    closeScan();
    if (route.kind === "manualPay") return;
    navigateTo({ route: "manualPay" });
  }, [closeScan, route.kind]);

  const onPickScanImage = React.useCallback(() => {
    scanImageInputRef.current?.click();
  }, []);

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

  const [walletWarningDismissed, setWalletWarningDismissed] = React.useState(
    () => safeLocalStorageGet(WALLET_WARNING_DISMISSED_STORAGE_KEY) === "1",
  );

  const walletWarningApplies =
    cashuBalance > WALLET_WARNING_BALANCE_THRESHOLD_SAT;

  const dismissWalletWarning = React.useCallback(() => {
    safeLocalStorageSet(WALLET_WARNING_DISMISSED_STORAGE_KEY, "1");
    setWalletWarningDismissed(true);
  }, []);

  const saveCashuFromText = useSaveCashuFromText({
    enqueueCashuOp,
    ensureCashuTokenPersisted,
    formatDisplayedAmountParts,
    upsert,
    isCashuTokenStored,
    isMintDeleted,
    logPaymentEvent,
    mintInfoByUrl,
    refreshMintInfo,
    resolveOwnerIdForWrite,
    rememberCashuTokenKnown,
    setCashuDraft,
    setCashuIsBusy,
    setStatus,
    showPaidOverlay,
    t,
    touchMintInfo,
  });

  const {
    checkAllCashuTokensAndDeleteInvalid,
    checkAndRefreshCashuToken,
    checkIssuedCashuTokensAndDeleteClaimed,
    checkSingleIssuedCashuTokenIsClaimed,
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

  // Background check for issued-token claims (issue #86). Runs once on
  // mount and every 60s thereafter while we have any issued tokens —
  // wallet.checkProofsStates is the passive NUT-07 query that doesn't
  // consume proofs. The helper itself skips when cashuIsBusy /
  // bulkCheckIsBusy is true, so concurrent send/melt operations aren't
  // disturbed. Detection deletes the row, so the issued list cleans up
  // even when the user isn't sitting on #wallet/tokens.
  //
  // The helper's callback identity changes every time cashuTokensAll
  // updates (Evolu emits frequently). Stashing it in a ref keeps the
  // 60s interval from being torn down + restarted on every churn — the
  // earlier inline-deps version was firing the check roughly every
  // second under load.
  const hasAnyIssuedTokensForBackgroundCheck = cashuIssuedTokens.length > 0;
  const checkIssuedCashuTokensRef = React.useRef(
    checkIssuedCashuTokensAndDeleteClaimed,
  );
  React.useEffect(() => {
    checkIssuedCashuTokensRef.current = checkIssuedCashuTokensAndDeleteClaimed;
  }, [checkIssuedCashuTokensAndDeleteClaimed]);
  const formatDisplayedAmountTextRef = React.useRef(formatDisplayedAmountText);
  React.useEffect(() => {
    formatDisplayedAmountTextRef.current = formatDisplayedAmountText;
  }, [formatDisplayedAmountText]);
  const pushToastRef = React.useRef(pushToast);
  React.useEffect(() => {
    pushToastRef.current = pushToast;
  }, [pushToast]);
  const claimToastTRef = React.useRef(t);
  React.useEffect(() => {
    claimToastTRef.current = t;
  }, [t]);
  React.useEffect(() => {
    if (!hasAnyIssuedTokensForBackgroundCheck) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const outcome = await checkIssuedCashuTokensRef.current();
        if (cancelled) return;
        if (outcome.claimed.length === 0) return;
        // Background detection — surface a toast so the user knows the
        // issued token was redeemed even when they aren't on the QR
        // screen (the CashuTokenPage poll handles the in-page UX with a
        // checkmark overlay).
        const formatter = formatDisplayedAmountTextRef.current;
        const tt = claimToastTRef.current;
        for (const entry of outcome.claimed) {
          const message =
            entry.amount > 0
              ? tt("cashuTokenClaimedWithAmount").replace(
                  "{amount}",
                  formatter(entry.amount),
                )
              : tt("cashuTokenClaimed");
          pushToastRef.current(message);
        }
      } catch {
        // ignore — the helper already swallows mint-side errors.
      }
    };
    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasAnyIssuedTokensForBackgroundCheck]);

  const closeShareOptions = React.useCallback(() => {
    setShareOptionsText(null);
  }, []);

  const openShareOptionsUrl = React.useCallback((url: string) => {
    if (typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
    setShareOptionsText(null);
  }, []);

  const copyShareOptionsText = React.useCallback(async () => {
    const text = String(shareOptionsText ?? "").trim();
    if (!text) return;
    await copyText(text);
    setShareOptionsText(null);
  }, [copyText, shareOptionsText]);

  const shareOptionsViaEmail = React.useCallback(() => {
    const text = String(shareOptionsText ?? "").trim();
    if (!text) return;
    openShareOptionsUrl(`mailto:?body=${encodeURIComponent(text)}`);
  }, [openShareOptionsUrl, shareOptionsText]);

  const shareOptionsViaSms = React.useCallback(() => {
    const text = String(shareOptionsText ?? "").trim();
    if (!text) return;
    openShareOptionsUrl(`sms:?body=${encodeURIComponent(text)}`);
  }, [openShareOptionsUrl, shareOptionsText]);

  const shareOptionsViaWhatsApp = React.useCallback(() => {
    const text = String(shareOptionsText ?? "").trim();
    if (!text) return;
    openShareOptionsUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }, [openShareOptionsUrl, shareOptionsText]);

  const shareText = React.useCallback(
    async (value: string) => {
      const text = String(value ?? "").trim();
      if (!text) {
        pushToast(t("errorPrefix"));
        return;
      }

      if (isNativePlatform()) {
        try {
          await Share.share({ text });
          return;
        } catch (error) {
          const errorMessage =
            typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof error.message === "string"
              ? error.message
              : "";
          if (
            /cancel/i.test(errorMessage) ||
            /abort/i.test(errorMessage) ||
            /dismiss/i.test(errorMessage)
          ) {
            return;
          }
          pushToast(t("shareFailed"));
          return;
        }
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
          pushToast(t("shareFailed"));
          return;
        }
      }

      pushToast(t("shareUnavailable"));
    },
    [pushToast, t],
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
        if (progress.status === "armed" && progress.prompt === "web") {
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

  const returnCashuTokenToWallet = React.useCallback(
    async (id: CashuTokenId) => {
      const ownerId = await resolveOwnerIdForWrite();
      const payload = {
        id,
        state: "accepted" as typeof Evolu.NonEmptyString100.Type,
        error: null,
      };
      const result = ownerId
        ? update("cashuToken", payload, { ownerId })
        : update("cashuToken", payload);

      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        return;
      }

      setStatus(t("cashuReturnedToWallet"));
    },
    [resolveOwnerIdForWrite, setStatus, t, update],
  );

  const pendingCashuContactSend = React.useMemo(() => {
    if (!pendingCashuTokenContactPickId) return null;

    const row = cashuTokensAllFiltered.find(
      (candidate) =>
        candidate.id === pendingCashuTokenContactPickId &&
        !candidate.isDeleted &&
        isCashuTokenIssuedState(candidate.state),
    );
    if (!row) return null;

    const meta = extractCashuTokenMeta(row);
    const amountSat = Number(meta.amount ?? row.amount ?? 0);
    if (!Number.isFinite(amountSat) || amountSat <= 0) return null;

    return {
      amountSat: Math.floor(amountSat),
      tokenId: pendingCashuTokenContactPickId,
    };
  }, [cashuTokensAllFiltered, pendingCashuTokenContactPickId]);

  const cancelPendingCashuContactSend = React.useCallback(async () => {
    const tokenId = pendingCashuContactSend?.tokenId ?? null;
    setPendingCashuTokenContactPickId(null);
    if (!tokenId) return;

    await returnCashuTokenToWallet(tokenId);
  }, [pendingCashuContactSend, returnCashuTokenToWallet]);

  const reserveCashuToken = React.useCallback(
    async (id: CashuTokenId) => {
      const ownerId = await resolveOwnerIdForWrite();
      const payload = {
        id,
        state:
          CASHU_TOKEN_STATE_RESERVED as typeof Evolu.NonEmptyString100.Type,
        error: null,
      };
      const result = ownerId
        ? update("cashuToken", payload, { ownerId })
        : update("cashuToken", payload);

      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        return;
      }

      setStatus(t("cashuReserved"));
    },
    [resolveOwnerIdForWrite, setStatus, t, update],
  );

  const markCashuTokenIssued = React.useCallback(
    async (id: CashuTokenId): Promise<boolean> => {
      const ownerId = await resolveOwnerIdForWrite();
      const payload = {
        id,
        state: "issued" as typeof Evolu.NonEmptyString100.Type,
        error: null,
      };
      const result = ownerId
        ? update("cashuToken", payload, { ownerId })
        : update("cashuToken", payload);

      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        return false;
      }

      return true;
    },
    [resolveOwnerIdForWrite, setStatus, t, update],
  );

  const deleteCashuToken = React.useCallback(
    async (id: CashuTokenId): Promise<boolean> => {
      const matchingAliases = new Set<string>();

      for (const row of cashuTokensAll) {
        if (row.isDeleted || row.id !== id) continue;
        for (const alias of readCashuRowAliases(row)) {
          matchingAliases.add(alias);
        }
      }

      let aliasesExpanded = true;
      while (aliasesExpanded) {
        aliasesExpanded = false;

        for (const row of cashuTokensAll) {
          if (row.isDeleted) continue;
          const rowAliases = readCashuRowAliases(row);
          if (
            rowAliases.length === 0 ||
            !rowAliases.some((alias) => matchingAliases.has(alias))
          ) {
            continue;
          }

          for (const alias of rowAliases) {
            if (matchingAliases.has(alias)) continue;
            matchingAliases.add(alias);
            aliasesExpanded = true;
          }
        }
      }

      const rowsToDelete =
        matchingAliases.size > 0
          ? cashuTokensAll.filter((row) => {
              if (row.isDeleted) return false;
              return readCashuRowAliases(row).some((alias) =>
                matchingAliases.has(alias),
              );
            })
          : [];

      if (rowsToDelete.length > 0) {
        for (const row of rowsToDelete) {
          const rowOwnerId = readCashuRowOwnerId(row);
          const payload = {
            id: row.id,
            isDeleted: Evolu.sqliteTrue,
          };
          const result = rowOwnerId
            ? update("cashuToken", payload, { ownerId: row.ownerId })
            : update("cashuToken", payload);

          if (!result.ok) {
            setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
            return false;
          }
        }

        return true;
      }

      const ownerId = await resolveOwnerIdForWrite();
      const payload = {
        id,
        isDeleted: Evolu.sqliteTrue,
      };
      const result = ownerId
        ? update("cashuToken", payload, { ownerId })
        : update("cashuToken", payload);

      if (!result.ok) {
        setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
        return false;
      }

      return true;
    },
    [
      cashuTokensAll,
      readCashuRowAliases,
      readCashuRowOwnerId,
      resolveOwnerIdForWrite,
      setStatus,
      t,
      update,
    ],
  );

  const startSendCashuTokenToContact = React.useCallback(
    async (id: CashuTokenId) => {
      setPendingCashuTokenContactPickId(id);
      setStatus(t("cashuSelectContactToSend"));
      navigateTo({ route: "contacts" });
    },
    [setStatus, t],
  );

  const sendCashuTokenToContact = React.useCallback(
    async (contact: DisplayContact, tokenId: CashuTokenId) => {
      setPendingCashuTokenContactPickId(null);

      const row = cashuTokensAllFiltered.find(
        (candidate) => candidate.id === tokenId && !candidate.isDeleted,
      );
      const tokenMeta = row ? extractCashuTokenMeta(row) : null;
      const tokenText = String(tokenMeta?.tokenText ?? "").trim();

      if (!row || !tokenText || !isCashuTokenIssuedState(row.state)) {
        setStatus(t("cashuInvalid"));
        return;
      }

      const contactId = String(contact.id ?? "").trim();
      if (!contactId) {
        setStatus(t("contactNotFound"));
        return;
      }

      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      let contactPubHex = normalizePubkeyHex(contact.unknownPubkeyHex);
      const contactNpub = normalizeNpubIdentifier(contact.npub);

      if (!contactPubHex && contactNpub) {
        let decodedContact: ReturnType<typeof nip19.decode> | null = null;
        try {
          decodedContact = nip19.decode(contactNpub);
        } catch {
          decodedContact = null;
        }
        if (
          decodedContact &&
          decodedContact.type === "npub" &&
          typeof decodedContact.data === "string"
        ) {
          contactPubHex = decodedContact.data;
        }
      }

      if (!contactPubHex) {
        setStatus(t("chatMissingContactNpub"));
        return;
      }

      const transactionNote =
        String(contact.name ?? "").trim() ||
        String(contact.lnAddress ?? "").trim() ||
        null;
      const logIssuedTokenSendTransaction = (phase: "complete" | "publish") => {
        logPaymentEvent({
          amount: tokenMeta?.amount ?? null,
          contactId: contact.id as ContactId,
          details: {
            usedInputTokens: [tokenText],
          },
          direction: "out",
          error: null,
          fee: null,
          method: "cashu_chat",
          mint: tokenMeta?.mint ?? null,
          note: transactionNote,
          phase,
          status: "ok",
          unit: tokenMeta?.unit ?? null,
        });
      };

      let activeClientId: string | null = null;

      try {
        const { getEventHash, getPublicKey } = await import("nostr-tools");

        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          throw new Error("invalid nsec");
        }

        const privBytes = decodedMe.data;
        const myPubHex = getPublicKey(privBytes);
        const clientId = makeLocalId();
        activeClientId = clientId;
        activeNostrMessagePublishClientIdsRef.current.add(clientId);

        const baseEvent = {
          created_at: Math.ceil(Date.now() / 1e3),
          kind: 14,
          pubkey: myPubHex,
          tags: [
            ["p", contactPubHex],
            ["p", myPubHex],
            ["client", clientId],
          ],
          content: tokenText,
        } satisfies UnsignedEvent;

        const rumorId = getEventHash(baseEvent);
        const pendingId = appendLocalNostrMessage({
          contactId,
          direction: "out",
          content: tokenText,
          wrapId: `pending:${clientId}`,
          rumorId,
          pubkey: myPubHex,
          createdAtSec: baseEvent.created_at,
          status: "pending",
          clientId,
        });

        const deleted = await deleteCashuToken(tokenId);
        if (!deleted) {
          return;
        }

        navigateTo({ route: "chat", id: contactId });

        const isOffline =
          typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          logIssuedTokenSendTransaction("publish");
          setStatus(t("chatQueued"));
          return;
        }

        const wrapForMe = wrapEventWithoutPushMarker(
          baseEvent,
          privBytes,
          myPubHex,
        );
        const wrapForContact = wrapEventWithPushMarker(
          baseEvent,
          privBytes,
          contactPubHex,
        );

        const pool = await getSharedAppNostrPool();
        const publishOutcome = await publishWrappedWithRetry(
          pool,
          NOSTR_RELAYS,
          wrapForMe,
          wrapForContact,
        );

        if (!publishOutcome.anySuccess) {
          logIssuedTokenSendTransaction("publish");
          setStatus(t("chatQueued"));
          return;
        }

        chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));
        if (pendingId) {
          updateLocalNostrMessage(pendingId, {
            status: "sent",
            wrapId: String(wrapForMe.id ?? ""),
            pubkey: myPubHex,
            rumorId,
          });
        }

        logIssuedTokenSendTransaction("complete");
      } catch (error) {
        setStatus(`${t("errorPrefix")}: ${String(error ?? "unknown")}`);
      } finally {
        if (activeClientId) {
          activeNostrMessagePublishClientIdsRef.current.delete(activeClientId);
        }
      }
    },
    [
      appendLocalNostrMessage,
      cashuTokensAllFiltered,
      currentNsec,
      logPaymentEvent,
      deleteCashuToken,
      publishWrappedWithRetry,
      setStatus,
      t,
      updateLocalNostrMessage,
    ],
  );

  const shareCashuTokenText = React.useCallback(
    async (id: CashuTokenId, text: string) => {
      const trimmed = String(text ?? "").trim();
      if (!trimmed) {
        pushToast(t("cashuInvalid"));
        return;
      }

      const row = cashuTokensAllFiltered.find(
        (candidate) => candidate.id === id && !candidate.isDeleted,
      );
      if (!row) {
        pushToast(t("cashuInvalid"));
        return;
      }

      if (isNativePlatform() || typeof navigator.share === "function") {
        await shareText(trimmed);
      } else {
        setShareOptionsText(trimmed);
      }

      if (isCashuTokenAcceptedState(row.state)) {
        await markCashuTokenIssued(id);
      }
    },
    [cashuTokensAllFiltered, markCashuTokenIssued, pushToast, shareText, t],
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

  const handleSelectContact = React.useCallback(
    (contact: DisplayContact) => {
      if (pendingCashuTokenContactPickId) {
        void sendCashuTokenToContact(contact, pendingCashuTokenContactPickId);
        return;
      }

      openContactDetail(contact);
    },
    [
      openContactDetail,
      pendingCashuTokenContactPickId,
      sendCashuTokenToContact,
    ],
  );

  const handleMintIconLoad = React.useCallback(
    (origin: string, url: string | null) => {
      setMintIconUrlByMint((prev) => ({
        ...prev,
        [origin]: url,
      }));
    },
    [],
  );

  const handleMintIconError = React.useCallback(
    (origin: string, url: string | null) => {
      setMintIconUrlByMint((prev) => ({
        ...prev,
        [origin]: url,
      }));
    },
    [],
  );

  const renderContactCard = React.useCallback(
    (contact: DisplayContact) => {
      const npub = normalizeNpubIdentifier(contact.npub);
      const avatarUrl = npub ? nostrPictureByNpub[npub] : null;
      const statusText = npub ? (nostrStatusByNpub[npub] ?? null) : null;
      const contactId = String(contact.id ?? "").trim();
      const last = contactId ? lastMessageByContactId.get(contactId) : null;
      const lastText = String(last?.content ?? "").trim();
      const tokenInfo =
        lastText && !parsePrivateImageMessage(lastText)
          ? getCashuTokenMessageInfo(lastText)
          : null;
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
          statusText={statusText}
          tokenInfo={tokenInfo}
          getMintIconUrl={getMintIconUrl}
          getNpubMessageContactInfo={getNpubMessageContactInfo}
          onSelect={handleSelectContact}
          onMintIconLoad={handleMintIconLoad}
          onMintIconError={handleMintIconError}
        />
      );
    },
    [
      contactAttentionById,
      getMintIconUrl,
      getNpubMessageContactInfo,
      handleMintIconError,
      handleMintIconLoad,
      handleSelectContact,
      lastMessageByContactId,
      nostrPictureByNpub,
      nostrStatusByNpub,
    ],
  );

  const renderMainSwipeContactCard = React.useCallback(
    (contact: ContactRowLike): React.ReactNode => {
      const id = String(contact.id ?? "").trim();
      if (!id) return null;
      const matched = displayContactById.get(id) ?? null;
      if (!matched) return null;
      return renderContactCard(matched);
    },
    [displayContactById, renderContactCard],
  );

  const conversationsLabel = t("conversations");
  const otherContactsLabel = t("otherContacts");

  const { exportAppData, handleImportAppDataFilePicked, requestImportAppData } =
    useAppDataTransfer<
      (typeof contacts)[number],
      (typeof cashuTokensAll)[number]
    >({
      appOwnerId: contactsOwnerId,
      cashuOwnerId,
      cashuTokens: cashuTokensFiltered,
      cashuTokensAll: cashuTokensAllFiltered,
      contacts,
      importDataFileInputRef,
      insert,
      upsert,
      pushToast,
      t,
      update,
    });

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

  const saveSeedToPasswordManager =
    async (): Promise<PasswordManagerSaveResult> => {
      const password = String(slip39Seed ?? "").trim();
      const username = String(effectiveProfileName ?? currentNpub ?? "").trim();
      if (!password || !username) return "failed";

      return triggerPasswordManagerSeedSave({
        displayName: username,
        password,
        username,
      });
    };

  const restoreMissingTokens = useRestoreMissingTokens({
    cashuIsBusy,
    cashuTokensAll: cashuTokensAllFiltered,
    defaultMintUrl,
    enqueueCashuOp,
    upsert,
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

  const emitCashuToken = React.useCallback(async () => {
    const amountSat = Number.parseInt(cashuEmitAmount.trim(), 10);
    if (!Number.isFinite(amountSat) || amountSat <= 0) {
      setStatus(t("payInvalidAmount"));
      return;
    }

    if (cashuIsBusy) return;
    if (cashuBalance < amountSat) {
      setStatus(t("payInsufficient"));
      return;
    }

    const insertCashuTokenRecord = async (args: {
      amount?: number | null;
      mint?: string | null;
      state: "accepted" | "issued";
      token: string;
      unit?: string | null;
    }) => {
      const targetAliases = readCashuRowAliases({
        rawToken: null,
        token: args.token,
      });
      const targetId = String(createCashuTokenId(args.token));
      const ownerId = await resolveOwnerIdForWrite();
      const existingRow = cashuTokensAll.find((row) => {
        return (
          String(row.id ?? "") === targetId ||
          readCashuRowAliases(row).some((alias) =>
            targetAliases.includes(alias),
          )
        );
      });

      if (existingRow) {
        return {
          ownerId,
          ok: true,
          error: null,
          rowId: existingRow.id,
          skippedDuplicate: true,
        };
      }

      const payload: {
        id: CashuTokenId;
        token: typeof Evolu.NonEmptyString.Type;
        state: typeof Evolu.NonEmptyString100.Type;
      } = {
        id: createCashuTokenId(args.token),
        token: args.token as typeof Evolu.NonEmptyString.Type,
        state: args.state as typeof Evolu.NonEmptyString100.Type,
      };

      const result = ownerId
        ? upsert("cashuToken", payload, { ownerId })
        : upsert("cashuToken", payload);
      return {
        ownerId,
        ok: result.ok,
        error: result.ok
          ? null
          : getUnknownErrorMessage(result.error, "unknown"),
        rowId: result.ok ? result.value.id : null,
        skippedDuplicate: false,
      };
    };

    const deleteCashuRows = async (
      rows: readonly {
        id?: CashuTokenId | string | null;
        ownerId?: unknown;
      }[],
      fallbackOwnerId?: Evolu.OwnerId | null,
    ) => {
      for (const row of rows) {
        if (!row.id) continue;
        const payload = { id: row.id, isDeleted: Evolu.sqliteTrue };
        const ownerId = resolveCashuRowStoredOwnerLane(row) ?? fallbackOwnerId;
        const result = ownerId
          ? update("cashuToken", payload, { ownerId })
          : update("cashuToken", payload);
        if (!result.ok) {
          throw new Error(getUnknownErrorMessage(result.error, "unknown"));
        }
      }
    };

    setCashuIsBusy(true);
    setStatus(t("cashuEmitting"));

    try {
      const mintGroups = new Map<string, { tokens: string[]; sum: number }>();
      for (const row of cashuTokensWithMeta) {
        if (!isCashuTokenAcceptedState(row.state)) continue;

        const mint = String(row.mint ?? "").trim();
        if (!mint) continue;

        const tokenText = String(row.token ?? row.rawToken ?? "").trim();
        if (!tokenText) continue;

        const amount = Number(row.amount ?? 0) || 0;
        const entry = mintGroups.get(mint) ?? { tokens: [], sum: 0 };
        entry.tokens.push(tokenText);
        entry.sum += amount;
        mintGroups.set(mint, entry);
      }

      const preferredMint = normalizeMintUrl(defaultMintUrl ?? "");
      const candidates = buildCashuMintCandidates(mintGroups, preferredMint);

      if (candidates.length === 0) {
        setStatus(t("payInsufficient"));
        return;
      }

      const candidate = selectSingleMintCandidateForAmount(
        candidates,
        amountSat,
      );
      if (!candidate) {
        setStatus(t("payInsufficient"));
        return;
      }

      const maxReservedFeeSat = getPaymentAmountReserveCap(
        amountSat,
        candidate.sum,
      );

      let selectedTokenId: CashuTokenId | null = null;
      let finalError: string | null = null;

      const attempts = buildPaymentAmountAttempts(
        amountSat,
        candidate.sum,
      ).filter((attemptAmountSat) => {
        return amountSat - attemptAmountSat <= maxReservedFeeSat;
      });

      if (attempts.length === 0) {
        setStatus(t("payInsufficient"));
        return;
      }

      for (const attemptAmountSat of attempts) {
        const split = await createSendTokenWithTokensAtMint({
          amount: attemptAmountSat,
          mint: candidate.mint,
          tokens: candidate.tokens,
          unit: "sat",
        });

        if (!split.ok) {
          finalError = String(split.error ?? "unknown");

          if (split.remainingToken && split.remainingAmount > 0) {
            const recoveryInsert = await insertCashuTokenRecord({
              token: split.remainingToken,
              mint: split.mint,
              unit: split.unit,
              amount: split.remainingAmount,
              state: "accepted",
            });
            if (!recoveryInsert.ok) {
              throw new Error(String(recoveryInsert.error));
            }

            const spentRows = cashuTokensWithMeta.filter((row) => {
              return (
                isCashuTokenAcceptedState(row.state) &&
                String(row.mint ?? "").trim() === candidate.mint
              );
            });
            await deleteCashuRows(spentRows, recoveryInsert.ownerId);
            break;
          }

          if (isRetryablePaymentAmountFailure(finalError)) {
            continue;
          }
          break;
        }

        const spentRows = cashuTokensWithMeta.filter((row) => {
          return (
            isCashuTokenAcceptedState(row.state) &&
            String(row.mint ?? "").trim() === candidate.mint
          );
        });
        const spentOwnerId = await resolveOwnerIdForWrite();
        await deleteCashuRows(spentRows, spentOwnerId);

        if (split.remainingToken && split.remainingAmount > 0) {
          const remainingInsert = await insertCashuTokenRecord({
            token: split.remainingToken,
            mint: split.mint,
            unit: split.unit,
            amount: split.remainingAmount,
            state: "accepted",
          });
          if (!remainingInsert.ok) {
            throw new Error(String(remainingInsert.error));
          }
        }

        const issuedInsert = await insertCashuTokenRecord({
          token: split.sendToken,
          mint: split.mint,
          unit: split.unit,
          amount: split.sendAmount,
          state: "issued",
        });
        if (!issuedInsert.ok || !issuedInsert.rowId) {
          throw new Error(
            String(issuedInsert.error ?? "missing issued token id"),
          );
        }

        selectedTokenId = issuedInsert.rowId;
        logPaymentEvent({
          direction: "out",
          status: "ok",
          amount: split.sendAmount,
          details: {
            ...(split.remainingToken
              ? { gainedToken: split.remainingToken }
              : {}),
            issuedToken: split.sendToken,
            usedInputTokens: candidate.tokens,
          },
          fee: null,
          mint: split.mint,
          unit: split.unit,
          error: null,
          contactId: null,
          method: "unknown",
          phase: "swap",
        });
        break;
      }

      if (!selectedTokenId) {
        const errorMessage = finalError ?? t("payInsufficient");
        logPaymentEvent({
          direction: "out",
          status: "error",
          amount: amountSat,
          fee: null,
          mint: null,
          unit: "sat",
          error: errorMessage,
          contactId: null,
          method: "unknown",
          phase: "swap",
        });
        setStatus(`${t("payFailed")}: ${errorMessage}`);
        return;
      }

      setCashuEmitAmount("");
      navigateTo({ route: "cashuToken", id: selectedTokenId });
    } catch (error) {
      const errorMessage = getUnknownErrorMessage(error, "unknown");
      logPaymentEvent({
        direction: "out",
        status: "error",
        amount: amountSat,
        fee: null,
        mint: null,
        unit: "sat",
        error: errorMessage,
        contactId: null,
        method: "unknown",
        phase: "swap",
      });
      setStatus(`${t("payFailed")}: ${errorMessage}`);
    } finally {
      setCashuIsBusy(false);
    }
  }, [
    buildCashuMintCandidates,
    cashuBalance,
    cashuEmitAmount,
    cashuIsBusy,
    cashuTokensAll,
    cashuTokensWithMeta,
    defaultMintUrl,
    logPaymentEvent,
    readCashuRowAliases,
    resolveOwnerIdForWrite,
    setCashuEmitAmount,
    setStatus,
    t,
    update,
    upsert,
  ]);

  // Shared per-quote in-flight set so the inline claim trigger in the
  // autoswap path and the 5s background tick can never both successfully
  // call mintTopupProofs for the same quote. Without this, the second path
  // would land in the NUT-09 restore branch, return proofs in a different
  // order than the first, encode a different token string, miss the
  // isCashuTokenKnownAny dedup, and insert a duplicate cashuToken row.
  const autoswapClaimInFlightRef = React.useRef<Set<string>>(new Set());
  // Cross-tick cache so the background claim effect doesn't reload the
  // target-mint wallet (info+keysets+keys) every tick while a quote is
  // still PENDING at the mint. Keyed by `mintUrl|unit`; entries cleared
  // on logout (effect cleanup).
  const autoswapClaimWalletCacheRef = React.useRef<
    Map<string, LoadedCashuWallet>
  >(new Map());

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
      id: CashuTokenId;
      state: "accepted";
      token: string;
    }

    const insertAcceptedToken = async (args: {
      amount?: number | null;
      mint?: string | null;
      rawToken?: string | null;
      token: string;
      unit?: string | null;
    }) => {
      const targetAliases = readCashuRowAliases({
        rawToken: args.rawToken ?? null,
        token: args.token,
      });
      const targetId = String(createCashuTokenId(args.rawToken || args.token));
      const ownerId = await resolveOwnerIdForWrite();
      const existingRow = cashuTokensAll.find((row) => {
        return (
          String(row.id ?? "") === targetId ||
          readCashuRowAliases(row).some((alias) =>
            targetAliases.includes(alias),
          )
        );
      });

      if (existingRow) {
        return {
          ownerId,
          ok: true,
          error: null,
          rowId: existingRow.id,
          skippedDuplicate: true,
        };
      }

      const payload: AcceptedCashuTokenPayload = {
        id: createCashuTokenId(args.rawToken || args.token),
        token: args.token,
        state: "accepted",
      };

      const result = ownerId
        ? upsert("cashuToken", payload, { ownerId })
        : upsert("cashuToken", payload);
      return {
        ownerId,
        ok: result.ok,
        error: result.ok
          ? null
          : getUnknownErrorMessage(result.error, "unknown"),
        rowId: result.ok ? result.value.id : null,
        skippedDuplicate: false,
      };
    };

    const markRowsDeleted = async (
      rows: Array<{
        id?: CashuTokenId | string | null;
        ownerId?: unknown;
      }>,
      fallbackOwnerId?: Evolu.OwnerId | null,
    ) => {
      for (const row of rows) {
        if (!row.id) continue;
        const payload = { id: row.id, isDeleted: Evolu.sqliteTrue };
        const ownerId = resolveCashuRowStoredOwnerLane(row) ?? fallbackOwnerId;
        const result = ownerId
          ? update("cashuToken", payload, { ownerId })
          : update("cashuToken", payload);
        if (!result.ok) {
          throw new Error(getUnknownErrorMessage(result.error, "unknown"));
        }
      }
    };

    const initialAmountAttempts = buildPaymentAmountAttempts(
      sourceBalance,
      sourceBalance,
    );
    // Cap retries hard. Each iteration creates a fresh top-up quote at the
    // target mint, and most mints rate-limit quote creation aggressively
    // (we have hit 429 on `/v1/mint/quote/bolt11` and even `/v1/info` on
    // mint.lnpay.cz). Eight matches buildPaymentAmountAttempts's natural
    // stepping schedule [0,1,2,3,5,8,13,21] so we can reach a 21-sat drop
    // off the source balance — enough headroom for percentage fee_reserve
    // schedules (e.g. 1% with min) on borderline balances.
    const MAX_AMOUNT_ATTEMPTS = 8;
    const queuedAmountAttempts = [...initialAmountAttempts].slice(
      0,
      MAX_AMOUNT_ATTEMPTS,
    );
    const seenAmountAttempts = new Set(queuedAmountAttempts);
    let finalError = t("cashuMeltToMainMintFailed");

    setCashuIsBusy(true);
    setStatus(t("cashuMeltToMainMintProcessing"));

    try {
      rememberSeenMint(targetMint);
      // Skip refreshMintInfo here: the mint store already
      // gates on a once-per-session ref (useMintInfoStore.ts) and the boot
      // effect auto-refreshes the default mint at app startup. The wallet
      // load below independently fetches info+keysets+keys via cashu-ts,
      // which is what melt actually needs.

      const { Mint, Wallet } = await getCashuLib();
      const det = getCashuDeterministicSeedFromStorage();
      const targetWallet = await createLoadedCashuWallet({
        Mint,
        Wallet,
        mintUrl: targetMint,
        unit: "sat",
        ...(det ? { bip39seed: det.bip39seed } : {}),
      });
      const { meltInvoiceWithTokensAtMint, prepareMeltMintContext } =
        await import("../cashuMelt");

      // Pre-load source-mint context (info+keysets+keys+checkstate) once.
      // Each retry only varies the amount; reusing the wallet handle and the
      // already-state-checked spendable proofs across attempts cuts ~4
      // mint round-trips per iteration. The melt-quote / swap / melt steps
      // still run per-attempt because they bind to the per-attempt invoice.
      let sourceMeltContext: Awaited<
        ReturnType<typeof prepareMeltMintContext>
      > | null = null;
      try {
        sourceMeltContext = await prepareMeltMintContext({
          mint: sourceMint,
          tokens: sourceTokens,
          unit: "sat",
        });
      } catch (error) {
        finalError = getUnknownErrorMessage(error, "unknown");
      }

      // Pre-flight fee discovery: ask source mint how much fee_reserve + input
      // fee it will charge for a probe invoice of the full sourceBalance, then
      // size the first target-mint invoice as
      //   sourceAmount = sourceBalance - fee_reserve - input_fee
      // so the first real melt attempt has the right headroom instead of
      // burning the entire retry ladder hitting Insufficient.
      if (sourceMeltContext) {
        try {
          const probe = await requestMintQuoteBolt11({
            amountSat: sourceBalance,
            mintUrl: targetMint,
          });
          const probeMeltQuote =
            await sourceMeltContext.wallet.createMeltQuoteBolt11(probe.invoice);
          const probeFeeReserve = cashuAmountToNumber(
            probeMeltQuote.fee_reserve,
          );
          const probeInputFee = cashuAmountToNumber(
            sourceMeltContext.wallet.getFeesForProofs(
              sourceMeltContext.spendableProofs,
            ),
          );
          const sizedAmount = Math.max(
            1,
            sourceBalance - probeFeeReserve - probeInputFee,
          );
          if (
            Number.isFinite(sizedAmount) &&
            sizedAmount >= 1 &&
            sizedAmount < sourceBalance
          ) {
            // Drop the no-fee-reserve attempts that we now know will fail and
            // promote the discovered sized amount to the front of the queue.
            const tail = queuedAmountAttempts.filter(
              (candidate) => candidate < sizedAmount,
            );
            queuedAmountAttempts.length = 0;
            queuedAmountAttempts.push(sizedAmount, ...tail);
            seenAmountAttempts.clear();
            for (const candidate of queuedAmountAttempts) {
              seenAmountAttempts.add(candidate);
            }
          }
        } catch {
          // Probe failed (rate-limited mint, network error, etc.). Fall
          // through to the original retry strategy starting from sourceBalance.
        }
      }

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
            ...(sourceMeltContext ? { context: sourceMeltContext } : {}),
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
                if (!recoveryInsert.ok || !recoveryInsert.rowId) {
                  throw new Error(
                    String(recoveryInsert.error ?? "missing recovery token id"),
                  );
                }

                await markRowsDeleted(activeSourceRows, activeSourceOwnerId);

                activeSourceRows = [
                  {
                    id: recoveryInsert.rowId,
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
              if (!recoveryInsert.ok) {
                throw new Error(String(recoveryInsert.error));
              }
              await markRowsDeleted(activeSourceRows, activeSourceOwnerId);
              finalError = errorMessage;
              break;
            }

            if (
              isRetryablePaymentAmountFailure(errorMessage) &&
              queuedAmountAttempts.length < MAX_AMOUNT_ATTEMPTS
            ) {
              // Prefer stepping by the exact shortage the mint reported
              // (`need X, have Y`), then fall back through the fee ladder.
              // For tiny balances this matters: 2 sats with a 1-sat input
              // fee should retry 1 sat, not drop straight to 0.
              const candidates = buildPaymentFailureAmountAttempts(
                amountSat,
                errorMessage,
              );
              for (const retryAmount of candidates) {
                if (seenAmountAttempts.has(retryAmount)) continue;
                seenAmountAttempts.add(retryAmount);
                queuedAmountAttempts.push(retryAmount);
                if (queuedAmountAttempts.length >= MAX_AMOUNT_ATTEMPTS) break;
              }
              // Brief pause before re-hitting the mint quote endpoint —
              // back-to-back POSTs trigger 429 on most public mints.
              await new Promise<void>((resolve) => {
                window.setTimeout(resolve, 800);
              });
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
            if (!remainingInsert.ok) {
              throw new Error(String(remainingInsert.error));
            }
          }

          const mintedUnit = targetWallet.unit ?? "sat";

          // Persist the pending claim BEFORE deleting the source rows so
          // the background autoswap-claim effect can recover after a crash.
          // The actual mintProofs + insert is shared with that effect via
          // claimAutoswapPendingEntry + a per-quote in-flight set, so we
          // can fire it inline here for instant UX without any duplicate
          // risk: if the 5s tick happens to overlap, the second caller
          // sees in_flight and bails.
          const pendingClaimOwnerKey = String(appOwnerId ?? "anon");
          const pendingClaimsKey =
            makePendingAutoswapClaimsKey(pendingClaimOwnerKey);
          const pendingClaim: AutoswapPendingClaim = {
            amount: amountSat,
            createdAtMs: Date.now(),
            invoice,
            mintUrl: targetMint,
            quote: quoteId,
            unit: mintedUnit,
          };
          appendPendingAutoswapClaim(pendingClaimsKey, pendingClaim);

          await markRowsDeleted(activeSourceRows, activeSourceOwnerId);

          void (async () => {
            // Best-effort instant claim. Failures (mint quote not yet
            // claimable, network error, 429) are picked up by the
            // background tick on its next 5s pass.
            const outcome = await claimAutoswapPendingEntry({
              claim: pendingClaim,
              claimOwnerKey: pendingClaimOwnerKey,
              claimsKey: pendingClaimsKey,
              ctx: {
                upsert,
                isCashuTokenKnownAny,
                resolveOwnerIdForWrite,
              },
              inFlightSet: autoswapClaimInFlightRef.current,
              walletCache: autoswapClaimWalletCacheRef.current,
            });
            if (outcome.kind === "claimed") {
              const okAmount = formatDisplayedAmountParts(amountSat);
              setStatus(
                t("cashuMeltToMainMintDone")
                  .replace(
                    "{amount}",
                    `${okAmount.approxPrefix}${okAmount.amountText}`,
                  )
                  .replace("{unit}", okAmount.unitLabel)
                  .replace("{mint}", formatMintButtonLabel(targetMint)),
              );
            }
          })();

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
    cashuTokensAll,
    cashuTokensWithMeta,
    defaultMintUrl,
    appOwnerId,
    formatDisplayedAmountParts,
    formatMintButtonLabel,
    upsert,
    isCashuTokenKnownAny,
    readCashuRowAliases,
    rememberSeenMint,
    resolveOwnerIdForWrite,
    setCashuIsBusy,
    setStatus,
    t,
    update,
  ]);

  const autoswapAttemptedSignatureRef = React.useRef<string | null>(null);
  const autoswapInFlightRef = React.useRef(false);
  React.useEffect(() => {
    meltLargestForeignMintToMainMintRef.current =
      meltLargestForeignMintToMainMint;
  }, [meltLargestForeignMintToMainMint]);

  const closePaymentMintMeltConfirmation = React.useCallback(() => {
    if (cashuIsBusy) return;
    setPendingPaymentMintMeltConfirmation(null);
  }, [cashuIsBusy]);

  const confirmPaymentMintMelt = React.useCallback(async () => {
    if (cashuIsBusy) return;
    setPendingPaymentMintMeltConfirmation(null);
    await meltLargestForeignMintToMainMintRef.current();
  }, [cashuIsBusy]);

  // Below this threshold the melt fee_reserve typically dominates the
  // foreign-mint balance, so the swap fails with "Insufficient funds" and
  // we end up with stranded dust at both the source and target mints. The
  // user can still trigger the manual `Melt to <main mint>` button for any
  // amount.
  const autoswapSignature = React.useMemo(() => {
    if (!largestForeignMintForTokenList) return null;
    if (largestForeignMintForTokenList.sum < CASHU_AUTOSWAP_MIN_SOURCE_SUM) {
      return null;
    }
    return `${largestForeignMintForTokenList.mint}|${largestForeignMintForTokenList.sum}|${largestForeignMintForTokenList.tokens.length}`;
  }, [largestForeignMintForTokenList]);

  React.useEffect(() => {
    if (!cashuAutoswapEnabled) return;
    if (cashuIsBusy) return;
    if (autoswapInFlightRef.current) return;
    if (!autoswapSignature) {
      autoswapAttemptedSignatureRef.current = null;
      return;
    }
    if (autoswapAttemptedSignatureRef.current === autoswapSignature) return;

    const timeoutId = window.setTimeout(() => {
      autoswapAttemptedSignatureRef.current = autoswapSignature;
      autoswapInFlightRef.current = true;
      void (async () => {
        try {
          await meltLargestForeignMintToMainMintRef.current();
        } finally {
          autoswapInFlightRef.current = false;
        }
      })();
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoswapSignature, cashuAutoswapEnabled, cashuIsBusy]);

  const appOwnerIdValue = appOwnerId;
  React.useEffect(() => {
    const ownerKey = String(appOwnerIdValue ?? "anon");
    const claimSources = [
      {
        claimsKey: makePendingAutoswapClaimsKey(ownerKey),
        ownerKey,
      },
    ];
    if (ownerKey !== "anon") {
      claimSources.push({
        claimsKey: makePendingAutoswapClaimsKey("anon"),
        ownerKey: "anon",
      });
    }
    const inFlightSet = autoswapClaimInFlightRef.current;
    const walletCache = autoswapClaimWalletCacheRef.current;

    let cancelled = false;
    let tickInFlight = false;
    let lastWarnedKey = "";

    const tick = async () => {
      if (cancelled || tickInFlight) return;
      const pendingSources = claimSources
        .map((source) => ({
          ...source,
          pending: readPendingAutoswapClaims(source.claimsKey),
        }))
        .filter((source) => source.pending.length > 0);
      if (pendingSources.length === 0) return;
      tickInFlight = true;
      try {
        for (const source of pendingSources) {
          for (const claim of source.pending) {
            if (cancelled) break;
            const outcome = await claimAutoswapPendingEntry({
              claim,
              claimOwnerKey: source.ownerKey,
              claimsKey: source.claimsKey,
              ctx: {
                upsert,
                isCashuTokenKnownAny,
                resolveOwnerIdForWrite,
              },
              inFlightSet,
              walletCache,
            });
            if (outcome.kind === "failed") {
              const warnKey = `${claim.mintUrl}:${claim.quote}:${outcome.reason}`;
              if (warnKey !== lastWarnedKey) {
                lastWarnedKey = warnKey;
                console.warn("[linky][autoswap] background claim failed", {
                  error: outcome.reason,
                  mintUrl: claim.mintUrl,
                  quote: claim.quote,
                });
              }
            }
          }
        }
      } finally {
        tickInFlight = false;
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      walletCache.clear();
    };
  }, [appOwnerIdValue, isCashuTokenKnownAny, resolveOwnerIdForWrite, upsert]);

  const requestSelectedContact = React.useCallback(async () => {
    if (route.kind !== "contactPay") return;
    if (!selectedContact) return;

    const amountSat = Number.parseInt(String(payAmount ?? "").trim(), 10);
    if (!Number.isFinite(amountSat) || amountSat <= 0) {
      setStatus(t("payInvalidAmount"));
      return;
    }

    const normalizedNpub = normalizeNpubIdentifier(selectedContact.npub);
    if (!normalizedNpub) {
      setStatus(t("chatMissingContactNpub"));
      return;
    }

    let recipientPubkeyHex: string | null = null;
    try {
      const decoded = nip19.decode(currentNpub ?? "");
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        recipientPubkeyHex = decoded.data;
      }
    } catch {
      recipientPubkeyHex = null;
    }

    if (!recipientPubkeyHex) {
      setStatus(t("profileMissingNpub"));
      return;
    }

    const recipientNprofile = nip19.nprofileEncode({
      pubkey: recipientPubkeyHex,
      relays: NOSTR_RELAYS,
    });
    const preferredMint =
      normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL) ?? MAIN_MINT_URL;
    const requestId = makeLocalId();
    const requestText = buildCashuPaymentRequestMessage({
      amount: amountSat,
      mintUrls: [preferredMint],
      recipientNprofile,
      requestId,
    });

    await sendChatMessage({
      clearDraft: false,
      text: requestText,
    });

    logPaymentEvent({
      amount: amountSat,
      contactId: selectedContact.id,
      details: {
        mintUrls: [preferredMint],
        recipientNprofile,
        requestId,
        requestText,
      },
      direction: "in",
      method: "cashu_chat",
      mint: preferredMint,
      note: t("requestPaymentLabel"),
      status: "ok",
      unit: "sat",
    });

    if (
      String(contactPayBackToChatRef.current ?? "") ===
      String(selectedContact.id)
    ) {
      navigateTo({ route: "chat", id: selectedContact.id });
      return;
    }

    navigateTo({ route: "contact", id: selectedContact.id });
  }, [
    currentNpub,
    defaultMintUrl,
    payAmount,
    route.kind,
    selectedContact,
    sendChatMessage,
    logPaymentEvent,
    setStatus,
    t,
  ]);

  const onPayChatPaymentRequest = React.useCallback(
    async (
      message: LocalNostrMessage,
      requestInfo: CashuPaymentRequestMessageInfo,
    ) => {
      if (cashuIsBusy) return;
      if (!selectedChatContact || selectedChatContact.isUnknownContact) return;
      if (!selectedContact) return;

      const requestRumorId = String(message.rumorId ?? "").trim();
      if (!requestRumorId) return;

      setCashuIsBusy(true);
      try {
        await payContactWithCashuMessage({
          contact: selectedContact,
          amountSat: requestInfo.amount,
          paymentRequestId: requestInfo.requestId,
          replyContext: {
            replyToId: requestRumorId,
            rootMessageId:
              String(message.rootMessageId ?? "").trim() || requestRumorId,
            replyToContent: String(message.content ?? "").trim() || null,
          },
        });
      } finally {
        setCashuIsBusy(false);
      }
    },
    [
      cashuIsBusy,
      payContactWithCashuMessage,
      selectedChatContact,
      selectedContact,
      setCashuIsBusy,
    ],
  );

  const contactPayBackToChatId = contactPayBackToChatRef.current;
  const topbar = React.useMemo(
    () =>
      buildTopbar({
        closeContactDetail,
        contactPayBackToChatId,
        navigateToMainReturn,
        route,
        t,
      }),
    [
      closeContactDetail,
      contactPayBackToChatId,
      navigateToMainReturn,
      route,
      t,
    ],
  );

  const chatEditContactId =
    route.kind === "chat" && !selectedChatContact?.isUnknownContact
      ? (selectedContact?.id ?? null)
      : null;
  const topbarRight = React.useMemo(
    () =>
      buildTopbarRight({
        chatEditContactId,
        isProfileEditing,
        openScan,
        route,
        t,
        toggleMenu,
      }),
    [chatEditContactId, isProfileEditing, openScan, route, t, toggleMenu],
  );

  const topbarTitle = React.useMemo(
    () => buildTopbarTitle(route, t),
    [route, t],
  );

  const chatTopbarContact = React.useMemo(
    () =>
      route.kind === "chat" && selectedChatContact
        ? {
            contactId: selectedChatContact.isUnknownContact
              ? null
              : (selectedContact?.id ?? null),
            isUnknownContact: Boolean(selectedChatContact.isUnknownContact),
            name: String(selectedChatContact.name ?? "").trim() || null,
            npub: normalizeNpubIdentifier(selectedChatContact.npub),
          }
        : null,
    [route.kind, selectedChatContact, selectedContact?.id],
  );

  const getCashuTokenMessageInfo = React.useCallback(
    (text: string) =>
      getCashuTokenMessageInfoBase(text, cashuTokensAllFiltered),
    [cashuTokensAllFiltered],
  );

  const openNotificationChat = React.useCallback(
    async (rawDetail: unknown): Promise<boolean> => {
      const target = readNotificationOpenTarget(rawDetail);
      if (!target || !currentNsec) {
        return false;
      }

      let openedFromNotificationData = false;
      try {
        const decoded = nip19.decode(currentNsec);
        if (decoded.type !== "nsec" || !(decoded.data instanceof Uint8Array)) {
          return false;
        }

        const { getPublicKey } = await import("nostr-tools");
        const { unwrapEvent } = await import("nostr-tools/nip17");

        const privBytes = decoded.data;
        const myPubHex = getPublicKey(privBytes);
        if (target.recipientPubkey !== myPubHex) {
          return false;
        }

        const findKnownContact = (peerPubkey: string) =>
          contactsLatestRef.current.find((contact) => {
            const normalizedNpub = normalizeNpubIdentifier(contact.npub);
            if (!normalizedNpub) {
              return false;
            }

            try {
              const decodedContact = nip19.decode(normalizedNpub);
              return (
                decodedContact.type === "npub" &&
                typeof decodedContact.data === "string" &&
                normalizePubkeyHex(decodedContact.data) === peerPubkey
              );
            } catch {
              return false;
            }
          }) ?? null;

        const openKnownNotificationContact = (peerPubkey: string): boolean => {
          const knownContact = findKnownContact(peerPubkey);
          const knownContactId = String(knownContact?.id ?? "").trim();
          if (!knownContactId) {
            return false;
          }

          setPendingDeleteId(null);
          navigateTo({ route: "chat", id: knownContactId });
          return true;
        };

        openedFromNotificationData = target.senderPubkey
          ? openKnownNotificationContact(target.senderPubkey)
          : false;

        const relays = Array.from(
          new Set([...target.relayHints, ...nostrFetchRelays, ...NOSTR_RELAYS]),
        );
        const pool = await getSharedAppNostrPool();
        const wraps = await pool.querySync(
          relays,
          {
            ids: [target.outerEventId],
            kinds: [1059],
            "#p": [myPubHex],
            limit: 1,
          },
          { maxWait: 2500 },
        );
        const wrap = wraps[0] ?? null;
        if (!wrap) {
          return (
            openedFromNotificationData ||
            (target.senderPubkey
              ? openKnownNotificationContact(target.senderPubkey)
              : false)
          );
        }

        const wrapId = String(wrap.id ?? "").trim();
        if (!wrapId) {
          return openedFromNotificationData;
        }

        const inner = unwrapEvent(wrap, privBytes);
        if (!inner) {
          return openedFromNotificationData;
        }

        const senderPub = normalizePubkeyHex(inner.pubkey);
        const tags = Array.isArray(inner.tags) ? inner.tags : [];
        const pTags = tags
          .filter((tag) => Array.isArray(tag) && tag[0] === "p")
          .map((tag) => normalizePubkeyHex(tag[1]))
          .filter((pubkey): pubkey is string => Boolean(pubkey));

        const peerPubkey =
          senderPub && senderPub !== myPubHex
            ? senderPub
            : (pTags.find((pubkey) => pubkey !== myPubHex) ?? null);
        if (!peerPubkey) {
          return openedFromNotificationData;
        }

        const knownContact = findKnownContact(peerPubkey);

        const contactId = knownContact
          ? String(knownContact.id ?? "").trim()
          : String(buildUnknownContactId(peerPubkey) ?? "").trim();
        if (!contactId) {
          return false;
        }

        let insertedMessageId: string | null = null;

        if (isLinkyBankPaymentOfferPaymentNoticeEvent(inner)) {
          const taggedOfferId =
            getLinkyBankPaymentOfferPaymentNoticeOfferId(inner);
          const matchingOffer = taggedOfferId
            ? null
            : bankPaymentOfferMessages.reduce<{
                createdAtSec: number;
                offerId: string;
              } | null>((latest, message) => {
                if (String(message.contactId ?? "").trim() !== contactId) {
                  return latest;
                }

                const info = getLinkyBankPaymentOfferInfo(
                  String(message.content ?? ""),
                );
                if (!info) return latest;

                const createdAtSec = Number(message.createdAtSec ?? 0);
                if (latest && latest.createdAtSec >= createdAtSec) {
                  return latest;
                }
                return { createdAtSec, offerId: info.offerId };
              }, null);
          const offerId =
            taggedOfferId ?? matchingOffer?.offerId ?? `expired:${wrapId}`;

          if (taggedOfferId || matchingOffer) {
            setLinkyBankPaymentOfferMinimized(contactId, offerId, false);
          }
          setPendingDeleteId(null);
          navigateTo({
            route: "bankPaymentOffer",
            chatId: contactId,
            offerId,
          });
          return true;
        }

        if (isLinkyBankPaymentOfferEvent(inner)) {
          const content = String(inner.content ?? "");
          const offerInfo = getLinkyBankPaymentOfferInfo(content);
          if (!offerInfo || !pTags.includes(myPubHex)) {
            return openedFromNotificationData;
          }

          const offererPubkey =
            String(offerInfo.offererPublicKey ?? "").trim() ||
            senderPub ||
            peerPubkey;
          const isOutgoing = offererPubkey === myPubHex;
          const tagClientId = extractClientTag(tags);
          const createdAtSecRaw = Number(inner.created_at ?? 0);
          const createdAtSec =
            Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
              ? Math.trunc(createdAtSecRaw)
              : Math.floor(Date.now() / 1_000);
          const offerMessage: LocalNostrMessage = {
            contactId,
            content,
            createdAtSec,
            direction: isOutgoing ? "out" : "in",
            id: `bank-payment-offer:${wrapId}`,
            localOnly: true,
            pubkey: isOutgoing ? myPubHex : offererPubkey,
            rumorId: null,
            status: "sent",
            wrapId,
          };
          if (tagClientId) {
            offerMessage.clientId = tagClientId;
          }
          upsertBankPaymentOfferMessage(offerMessage);
          setLinkyBankPaymentOfferMinimized(
            contactId,
            offerInfo.offerId,
            false,
          );
          setPendingDeleteId(null);
          navigateTo({
            route: "bankPaymentOffer",
            chatId: contactId,
            offerId: offerInfo.offerId,
          });
          return true;
        }

        if (inner.kind === 14 || inner.kind === 15) {
          const existingByWrap = nostrMessagesLatestRef.current.find(
            (message) => String(message.wrapId ?? "").trim() === wrapId,
          );
          if (existingByWrap) {
            insertedMessageId = String(existingByWrap.id ?? "").trim() || null;
          } else if (
            !hasKnownNostrMessageIdentity(knownNostrMessageIdentityIndex, {
              wrapId,
            }) &&
            !isInvalidInnerRumorPubkey(senderPub, wrap.pubkey)
          ) {
            const content =
              inner.kind === 15
                ? (privateImageMessageFromEvent(inner) ?? "")
                : String(inner.content ?? "");

            if (content.trim()) {
              const taggedPeerPub =
                pTags.find((pubkey) => pubkey !== myPubHex) ?? "";
              const nestedEncryptedPayload =
                inner.kind === 14 &&
                isNestedEncryptedNip44PayloadForAnyPubkey(
                  content,
                  [senderPub, taggedPeerPub, wrap.pubkey],
                  privBytes,
                );

              if (!nestedEncryptedPayload) {
                const tagClientId = extractClientTag(tags);
                const rumorId = inner.id ? String(inner.id).trim() : "";
                const matchedOutgoingMessage =
                  senderPub === myPubHex
                    ? null
                    : (nostrMessagesLatestRef.current.find((message) => {
                        if (String(message.direction ?? "").trim() !== "out") {
                          return false;
                        }
                        if (
                          tagClientId &&
                          String(message.clientId ?? "").trim() ===
                            String(tagClientId).trim()
                        ) {
                          return true;
                        }
                        return (
                          rumorId &&
                          String(message.rumorId ?? "").trim() === rumorId
                        );
                      }) ?? null);

                const addressesMe = pTags.includes(myPubHex);
                const isOutgoing =
                  senderPub === myPubHex ||
                  (addressesMe && Boolean(matchedOutgoingMessage));

                if (addressesMe || isOutgoing) {
                  const messageDirection = isOutgoing ? "out" : "in";
                  const { replyToId, rootMessageId } =
                    extractReplyContextFromTags(tags);
                  const editedFromId = extractEditedFromTag(tags);
                  const effectivePubkey = isOutgoing ? myPubHex : peerPubkey;
                  const normalizedIncomingPeerPubkey = isOutgoing
                    ? null
                    : normalizePubkeyHex(effectivePubkey);
                  const createdAtSecRaw = Number(inner.created_at ?? 0);
                  const createdAtSec =
                    Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
                      ? Math.trunc(createdAtSecRaw)
                      : Math.ceil(Date.now() / 1e3);

                  const matchesStoredIncomingPeer = (
                    message: LocalNostrMessage,
                  ): boolean => {
                    if (isOutgoing || !normalizedIncomingPeerPubkey) {
                      return false;
                    }

                    return (
                      normalizePubkeyHex(message.pubkey) ===
                      normalizedIncomingPeerPubkey
                    );
                  };

                  if (
                    !hasKnownNostrMessageIdentity(
                      knownNostrMessageIdentityIndex,
                      {
                        contactId,
                        direction: messageDirection,
                        ...(tagClientId ? { clientId: tagClientId } : {}),
                        ...(rumorId ? { rumorId } : {}),
                        wrapId,
                      },
                    )
                  ) {
                    if (editedFromId) {
                      const targetMessage = nostrMessagesLatestRef.current.find(
                        (message) => {
                          const matchesContactId =
                            String(message.contactId ?? "") ===
                            String(contactId);
                          if (
                            !matchesContactId &&
                            !matchesStoredIncomingPeer(message)
                          ) {
                            return false;
                          }
                          if (
                            String(message.direction ?? "") !== messageDirection
                          ) {
                            return false;
                          }
                          return (
                            String(message.rumorId ?? "").trim() ===
                              editedFromId ||
                            String(message.editedFromId ?? "").trim() ===
                              editedFromId
                          );
                        },
                      );

                      if (targetMessage) {
                        const targetMessageId = String(
                          targetMessage.id ?? "",
                        ).trim();
                        if (targetMessageId) {
                          const existingOriginal =
                            String(
                              targetMessage.originalContent ?? "",
                            ).trim() || String(targetMessage.content ?? "");
                          updateLocalNostrMessage(targetMessageId, {
                            content,
                            status: "sent",
                            wrapId,
                            pubkey: effectivePubkey,
                            ...(tagClientId ? { clientId: tagClientId } : {}),
                            ...(rumorId ? { rumorId } : {}),
                            editedAtSec: createdAtSec,
                            editedFromId,
                            isEdited: true,
                            originalContent: existingOriginal || null,
                          });
                          insertedMessageId = targetMessageId;
                        }
                      }
                    }

                    if (!insertedMessageId) {
                      const existingMessage =
                        nostrMessagesLatestRef.current.find((message) => {
                          const matchesContactId =
                            String(message.contactId ?? "") ===
                            String(contactId);
                          if (
                            !matchesContactId &&
                            !matchesStoredIncomingPeer(message)
                          ) {
                            return false;
                          }
                          if (
                            String(message.direction ?? "") !== messageDirection
                          ) {
                            return false;
                          }
                          if (
                            rumorId &&
                            String(message.rumorId ?? "").trim() === rumorId
                          ) {
                            return true;
                          }
                          if (tagClientId) {
                            return (
                              String(message.clientId ?? "").trim() ===
                              String(tagClientId).trim()
                            );
                          }
                          return (
                            String(message.content ?? "").trim() ===
                            content.trim()
                          );
                        });

                      if (existingMessage) {
                        const existingMessageId = String(
                          existingMessage.id ?? "",
                        ).trim();
                        if (existingMessageId) {
                          updateLocalNostrMessage(existingMessageId, {
                            status: "sent",
                            wrapId,
                            pubkey: effectivePubkey,
                            ...(tagClientId ? { clientId: tagClientId } : {}),
                            ...(rumorId ? { rumorId } : {}),
                            ...(replyToId ? { replyToId } : {}),
                            ...(rootMessageId ? { rootMessageId } : {}),
                            ...(editedFromId ? { editedFromId } : {}),
                          });
                          insertedMessageId = existingMessageId;
                        }
                      } else {
                        insertedMessageId = appendLocalNostrMessage({
                          contactId,
                          content,
                          createdAtSec,
                          direction: messageDirection,
                          pubkey: effectivePubkey,
                          rumorId: rumorId || null,
                          wrapId,
                          ...(tagClientId ? { clientId: tagClientId } : {}),
                          ...(replyToId ? { replyToId } : {}),
                          ...(rootMessageId ? { rootMessageId } : {}),
                          ...(editedFromId
                            ? {
                                editedAtSec: createdAtSec,
                                editedFromId,
                                isEdited: true,
                              }
                            : {}),
                        });
                      }

                      nostrMessageWrapIdsRef.current.add(wrapId);
                    }
                  }
                }
              }
            }
          }
        }

        setPendingDeleteId(null);
        navigateTo({ route: "chat", id: contactId });
        if (insertedMessageId) {
          triggerChatScrollToBottom(insertedMessageId);
        }
        return true;
      } catch {
        return openedFromNotificationData;
      }
    },
    [
      appendLocalNostrMessage,
      bankPaymentOfferMessages,
      currentNsec,
      knownNostrMessageIdentityIndex,
      nostrFetchRelays,
      nostrMessagesLatestRef,
      nostrMessageWrapIdsRef,
      setPendingDeleteId,
      triggerChatScrollToBottom,
      updateLocalNostrMessage,
      upsertBankPaymentOfferMessage,
    ],
  );

  const handleContactIdentifierScanned = React.useCallback(
    async (identifier: string) => {
      await addNewContactFromIdentifier(identifier);
    },
    [addNewContactFromIdentifier],
  );

  const handleScannedText = useScannedTextHandler<(typeof contacts)[number]>({
    appOwnerId: contactsOwnerId,
    closeScan,
    contacts,
    currentNpub,
    extractCashuTokenFromText,
    insert,
    lightningInvoiceAutoPayLimit,
    onContactIdentifierScanned:
      route.kind === "contactNew" ? handleContactIdentifierScanned : null,
    openScannedContactPendingNpubRef,
    payCashuPaymentRequest,
    payLightningInvoiceWithCashu,
    refreshContactFromNostr,
    requestLightningInvoiceConfirmation: setPendingLightningInvoiceConfirmation,
    requestLnurlWithdrawConfirmation: setPendingLnurlWithdrawConfirmation,
    saveCashuFromText,
    scanAcceptsBankPayment:
      scanEntryPoint === "send" || route.kind === "manualPay",
    scanEntryPoint,
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
    void consumePendingIosNativeDeepLinkUrl().then(acceptDeepLinkUrl);

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
    const openNotificationRoute = (rawRoute: unknown) => {
      const routeValue = readNotificationOpenRoute(rawRoute);
      if (routeValue === "#contacts") {
        navigateTo({ route: "contacts" });
        return;
      }
      if (routeValue === "#wallet") {
        navigateTo({ route: "wallet" });
      }
    };

    const openNotification = (rawDetail: unknown) => {
      if (!nostrBootstrapReady) {
        pendingNotificationOpenDetailsRef.current.push({ value: rawDetail });
        return;
      }

      void openNotificationChat(rawDetail).then((opened) => {
        if (opened) {
          return;
        }

        openNotificationRoute(rawDetail);
      });
    };

    const pendingNotificationDetail =
      consumePendingNativeNotificationOpenDetail();
    const pendingHashNotificationDetail =
      consumeNotificationOpenDetailFromHash();
    if (pendingNotificationDetail) {
      openNotification(pendingNotificationDetail);
    } else if (pendingHashNotificationDetail) {
      openNotification(pendingHashNotificationDetail);
    } else {
      openNotificationRoute(consumePendingNativeNotificationRoute());
    }

    if (nostrBootstrapReady) {
      const queuedDetails = pendingNotificationOpenDetailsRef.current.splice(0);
      for (const detail of queuedDetails) {
        openNotification(detail.value);
      }
    }

    const onNotificationOpen: EventListener = (event) => {
      if (!(event instanceof CustomEvent)) {
        return;
      }

      const detail = event.detail;
      if (typeof detail !== "object" || detail === null) {
        return;
      }

      openNotification(detail);
    };

    window.addEventListener(NATIVE_NOTIFICATION_OPEN_EVENT, onNotificationOpen);
    window.addEventListener(NATIVE_PUSH_ACTION_EVENT, onNotificationOpen);
    const onServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data;
      if (typeof data !== "object" || data === null) {
        return;
      }
      if (Reflect.get(data, "type") !== "notification-open") {
        return;
      }

      openNotification(Reflect.get(data, "detail"));
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "message",
        onServiceWorkerMessage,
      );
    }

    return () => {
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          onServiceWorkerMessage,
        );
      }

      window.removeEventListener(
        NATIVE_NOTIFICATION_OPEN_EVENT,
        onNotificationOpen,
      );
      window.removeEventListener(NATIVE_PUSH_ACTION_EVENT, onNotificationOpen);
    };
  }, [nostrBootstrapReady, openNotificationChat]);

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
      try {
        text = await navigator.clipboard.readText();
      } catch {
        if (
          typeof window !== "undefined" &&
          typeof window.prompt === "function"
        ) {
          text = String(window.prompt(t("scanPastePrompt")) ?? "");
        } else {
          pushToast(t("pasteNotAvailable"));
          return;
        }
      }
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

  const onScanImageSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0] ?? null;
      input.value = "";

      if (!file) {
        return;
      }

      const loadImage = async (imageFile: File): Promise<HTMLImageElement> => {
        const objectUrl = URL.createObjectURL(imageFile);

        try {
          return await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("image-load-failed"));
            image.src = objectUrl;
          });
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };

      try {
        const image = await loadImage(file);
        const detectorCtor = window.BarcodeDetector;

        if (detectorCtor) {
          const detector = new detectorCtor({ formats: ["qr_code"] });
          const detectorValue = String(
            (await detector.detect(image))?.[0]?.rawValue ?? "",
          ).trim();

          if (detectorValue) {
            await handleScannedText(detectorValue);
            return;
          }
        }

        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (width <= 0 || height <= 0) {
          pushToast(t("scanImageUnsupported"));
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          pushToast(t("scanImageUnsupported"));
          return;
        }

        ctx.drawImage(image, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const jsQr = (await import("jsqr")).default;
        const qrValue = String(
          jsQr(imageData.data, width, height)?.data ?? "",
        ).trim();

        if (!qrValue) {
          pushToast(t("scanImageUnsupported"));
          return;
        }

        await handleScannedText(qrValue);
      } catch {
        pushToast(t("scanImageUnsupported"));
      }
    },
    [handleScannedText, pushToast, t],
  );

  const onSubmitManualPayText = React.useCallback(
    async (text: string) => {
      await handleScannedText(text);
    },
    [handleScannedText],
  );

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
    chatMessages: chatMessagesWithBankPaymentOffers,
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
      canRestoreTokens: String(seedMnemonic ?? "").trim().length > 0,
      canSendCashuTokenToContact: contacts.length > 0,
      canWriteNfc,
      canPayWithCashu,
      cashuBalance,
      cashuBalanceAfterMelt,
      cashuTotalBalance,
      cashuBulkCheckIsBusy,
      cashuDraft,
      cashuDraftRef,
      cashuEmitAmount,
      cashuHasMultipleAcceptedMints,
      cashuIsBusy,
      cashuIssuedTokens,
      cashuMeltToMainMintButtonLabel,
      cashuTokensAll: cashuTokensAllFiltered,
      cashuOwnTokens,
      cashuOwnSpentTokensCount: cashuOwnSpentTokens.length,
      bankPaymentOfferContacts,
      bankPaymentOfferRecipientCount,
      deleteSpentCashuTokens,
      deleteSpentCashuTokensIsBusy,
      checkAllCashuTokensAndDeleteInvalid,
      checkAndRefreshCashuToken,
      checkIssuedCashuTokensAndDeleteClaimed,
      checkSingleIssuedCashuTokenIsClaimed,
      showPaidOverlay,
      copyText,
      currentNpub,
      displayUnit,
      effectiveProfileName,
      effectiveProfilePicture,
      emitCashuToken,
      getMintIconUrl,
      knownLnAddressPayContact,
      knownLnAddressPayContactPictureUrl,
      lnAddressPayAmount,
      manualPayContacts: contacts,
      manualPayNostrPictureByNpub: nostrPictureByNpub,
      onRequestBankPaymentOffer: requestBankPaymentOffer,
      onSubmitManualPayText,
      meltLargestForeignMintToMainMint,
      payLightningAddressWithCashu,
      pendingCashuDeleteId,
      restoreMissingTokens,
      reserveCashuToken,
      requestDeleteCashuToken,
      returnCashuTokenToWallet,
      startSendCashuTokenToContact,
      route,
      saveCashuFromText,
      setCashuEmitAmount,
      setCashuDraft,
      setLnAddressPayAmount,
      setMintIconUrlByMint,
      shareCashuTokenText,
      setTopupAmount,
      t,
      topupAmount,
      topupInvoice,
      topupInvoiceError,
      topupInvoiceIsBusy,
      topupInvoiceCashuRequest,
      topupMintUrl:
        topupMintQuote?.mintUrl ??
        normalizeMintUrl(defaultMintUrl ?? MAIN_MINT_URL) ??
        MAIN_MINT_URL,
      topupInvoiceQr,
      topupInvoiceQrPayload,
      tokensRestoreIsBusy,
      writeCashuTokenToNfc,
    },
  });

  const restoreEditingContact = React.useCallback(() => {
    if (!editingId) return;
    restoreArchivedContact(editingId);
  }, [editingId, restoreArchivedContact]);

  const restoreCurrentContact = React.useCallback(() => {
    if (!selectedContact) return;
    restoreArchivedContact(selectedContact.id);
  }, [restoreArchivedContact, selectedContact]);

  const { peopleRouteProps } = useProfilePeopleComposition({
    peopleRouteBuilderInput: {
      cashuBalance,
      cashuBalanceAfterMelt,
      cashuIsBusy,
      chatSelectedContact: selectedChatContact,
      chatDraft,
      chatMessageElByIdRef,
      chatMessages: chatMessagesWithBankPaymentOffers,
      bankPaymentOfferMessages,
      chatMessagesRef,
      chatOwnPubkeyHex,
      chatSendIsBusy,
      canWriteNfc,
      contactEditsSavable,
      contactPaymentIntent,
      contactPayMethod,
      addNewContactFromSearchResult,
      contactSuggestions,
      contacts,
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
      getNpubMessageContactInfo,
      groupNames,
      handleSaveContact,
      isProfileEditing,
      isBankPaymentOfferCanceled,
      isSavingContact,
      lang,
      mentionContacts,
      makeNip98AuthHeader,
      myProfileQr,
      profileStatusCurrencies,
      profileStatusIsSaving,
      nostrPictureByNpub,
      onCancelEdit,
      onCancelReply,
      onAddUnknownContact: addUnknownContactFromChat,
      onBlockUnknownContact: blockUnknownContactFromChat,
      onCopy: onCopyChatMessage,
      onDeclinePaymentRequest: onDeclineChatPaymentRequest,
      onEdit: onEditChatMessage,
      onOpenNpubContact: openNpubMessageContact,
      onPayPaymentRequest: onPayChatPaymentRequest,
      onRespondBankPaymentOffer: respondToBankPaymentOfferWithGroupState,
      onSettleBankPaymentOffer: settleBankPaymentOffer,
      cycleProfileAvatarControl,
      onPickProfilePhoto,
      onProfilePhotoError,
      onProfilePhotoSelected,
      onReact: onReactToChatMessage,
      onReply: onReplyToChatMessage,
      openContactPay,
      searchNewContact,
      payAmount,
      payLightningInvoiceWithCashu,
      paySelectedContact,
      requestSelectedContact,
      payWithCashuEnabled,
      ownedLightningAddresses: ownedProfileLightningAddresses,
      route,
      selectedContactStatusText: (() => {
        const npub = normalizeNpubIdentifier(selectedContact?.npub);
        return npub ? (nostrStatusByNpub[npub] ?? null) : null;
      })(),
      pendingDeleteId,
      reactionsByMessageId,
      profileClaimLightningAddressServerBaseUrl,
      profileCustomPictureUrl,
      profileEditLnAddress,
      profileEditName,
      profileEditPicture,
      profileEditStatus,
      profileEditsSavable,
      unregisteredOwnLightningAddress,
      profileStatus: myProfileStatus,
      profilePhotoInputRef,
      profileSelectedPictureKind,
      blockArchivedContact,
      selectedProfileStatusCurrencies,
      restoreArchivedContact: restoreEditingContact,
      restoreSelectedContact: restoreCurrentContact,
      requestDeleteCurrentContact,
      resetEditedContactFieldFromNostr,
      replyContext,
      saveClaimedLightningAddress,
      saveProfileEdits,
      selectedContact,
      sendChatImage,
      sendChatMessage: sendChatOrEditMessage,
      setChatDraft,
      setContactPayMethod,
      setForm,
      setMintIconUrlByMint,
      setPayAmount,
      setProfileEditLnAddress,
      setProfileEditName,
      setProfileEditStatus,
      t,
      toggleProfileStatusCurrency,
      writeCurrentNpubToNfc,
    },
  });

  const {
    mainSwipeRouteProps,
    pageClassNameWithSwipe,
    selectedEvoluServerUrl,
  } = useRoutingViewComposition({
    contactsHeaderVisible,
    contactsPulling,
    groupNamesCount: groupNames.length,
    isMainSwipeRoute,
    mainSwipeRouteBuilderInput: {
      activeGroup,
      bankPaymentOfferMessages,
      cashuBalance,
      cashuTotalBalance,
      chatOwnPubkeyHex,
      contacts: displayContacts,
      contactsOnboardingCelebrating,
      contactsOnboardingTasks,
      contactsSearch,
      contactsSearchInputRef,
      contactFilterOptions,
      conversationsLabel,
      dismissContactsOnboarding,
      dismissWalletWarning,
      handleMainSwipeScroll,
      handleMainSwipeTabChange: commitMainSwipe,
      mainSwipeRef,
      canAddContact,
      openNewContactPage,
      openProfileQr,
      openWalletScan,
      otherContactsLabel,
      nostrPictureByNpub,
      renderContactCard: renderMainSwipeContactCard,
      route,
      scanIsOpen,
      showProfileQrOnTiltEnabled,
      setActiveGroup,
      setContactsSearch,
      showContactsOnboarding,
      showWalletWarning: walletWarningApplies && !walletWarningDismissed,
      startContactsGuide,
      t,
      visibleContacts,
    },
    statusFilterCount: statusFilterCurrencies.length,
    ungroupedCount,
  });

  const { systemRouteProps } = useSystemSettingsComposition({
    systemRouteBuilderInput: {
      appOwnerIdRef,
      appVersion: __APP_VERSION__,
      applyDefaultMintSelection,
      cashuIsBusy,
      cashuMeltToMainMintButtonLabel,
      canSaveNewRelay,
      connectedRelayCount,
      copyNostrKeys,
      copySeed,
      passwordManagerSeedUsername: String(
        effectiveProfileName ?? currentNpub ?? "",
      ).trim(),
      activeNostrIdentitySource,
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
      evoluCashuOwnerIndex: cashuOwnerIndex,
      evoluCashuVisibleOwnerIds: cashuVisibleOwnerIds,
      evoluContactsOwnerId: contactsOwnerId,
      evoluContactsOwnerIndex: contactsOwnerIndex,
      evoluContactsOwnerNewContactsCount: contactsOwnerNewContactsCount,
      evoluContactsOwnerPointer: contactsOwnerPointer,
      evoluMessagesVisibleOwnerIds: messagesVisibleOwnerIds,
      evoluTransactionsOwnerId: transactionsOwnerId,
      evoluTransactionsOwnerIndex: transactionsOwnerIndex,
      evoluTransactionsOwnerPointer: transactionsOwnerPointer,
      evoluTransactionsVisibleOwnerIds: transactionsVisibleOwnerIds,
      evoluContactsOwnerEditsUntilRotation: contactsOwnerEditsUntilRotation,
      evoluCashuOwnerEditsUntilRotation: cashuOwnerEditsUntilRotation,
      evoluHistoryAllowedOwnerIds,
      evoluMessagesBackupOwnerId: messagesBackupOwnerId,
      evoluMessagesOwnerId: messagesOwnerId,
      evoluMessagesOwnerIndex: messagesOwnerIndex,
      evoluMessagesOwnerEditsUntilRotation: messagesOwnerEditsUntilRotation,
      evoluTransactionsBackupOwnerId: transactionsBackupOwnerId,
      evoluTransactionsOwnerEditsUntilRotation:
        transactionsOwnerEditsUntilRotation,
      requestManualRotateCashuOwner,
      requestManualRotateContactsOwner,
      requestManualRotateMessagesOwner,
      requestManualRotateTransactionsOwner,
      rotateCashuOwnerIsBusy,
      rotateContactsOwnerIsBusy,
      rotateMessagesOwnerIsBusy,
      rotateTransactionsOwnerIsBusy,
      exportAppData,
      extractPpk,
      getMintIconUrl,
      getMintRuntime,
      handleImportAppDataFilePicked,
      importDataFileInputRef,
      isSeedLogin,
      isEvoluServerOffline,
      bankPaymentOfferRecipientCount,
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
      cashuAutoswapEnabled,
      showProfileQrOnTiltEnabled,
      PRESET_MINTS,
      pushToast,
      refreshMintInfo,
      relayStatusByUrl,
      relayUrls,
      requestDeleteSelectedRelay,
      requestImportAppData,
      requestDeriveNostrKeys,
      requestPasteNostrKeys,
      requestLogout,
      saveSeedToPasswordManager,
      route,
      safeLocalStorageSetJson,
      saveEvoluServerUrls,
      saveNewRelay,
      seedMnemonic,
      selectedEvoluServerUrl,
      selectedRelayUrl,
      setBankPaymentOfferRecipientCount,
      setDefaultMintUrlDraft,
      setEvoluServerOffline,
      setLightningInvoiceAutoPayLimit,
      setNewEvoluServerUrl,
      setNewRelayUrl,
      setPayWithCashuEnabled,
      setCashuAutoswapEnabled,
      setShowProfileQrOnTiltEnabled,
      setPendingEvoluServerDeleteUrl,
      setPendingMintDeleteUrl,
      setStatus,
      setMintInfoAllUnknown: setMintInfoAll,
      syncOwner,
      t,
      wipeEvoluStorage,
    },
  });

  const evoluTransactionsVisibleOwnerIds = React.useMemo(
    () => transactionsVisibleOwnerIds.map((ownerId) => String(ownerId)),
    [transactionsVisibleOwnerIds],
  );

  const appState = React.useMemo(
    () => ({
      allowedDisplayCurrencies,
      applyAmountInputKey: applyDisplayedAmountInputKey,
      cashuBalance,
      cashuBalanceAfterMelt,
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
      evoluAppOwnerId: appOwnerId ? String(appOwnerId) : null,
      evoluTransactionsVisibleOwnerIds,
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
      pendingMintAutoswapChangeConfirmation,
      pendingPaymentMintMeltConfirmation,
      pendingLnurlWithdrawConfirmation,
      pendingLightningInvoiceConfirmation,
      postPaySaveContact,
      profileCustomPictureUrl,
      profileEditInitialRef,
      profileEditLnAddress,
      profileEditName,
      profileEditPicture,
      profileEditStatus,
      profileEditsSavable,
      profileStatus: myProfileStatus,
      profileStatusCurrencies,
      profileStatusIsSaving,
      profilePhotoInputRef,
      selectedProfileStatusCurrencies,
      profileSelectedPictureKind,
      route,
      scanAllowsManualContact,
      scanEntryPoint,
      scanImageInputRef,
      scanIsOpen,
      shareOptionsText,
      scanVideoRef,
      t,
      topbar,
      topbarRight,
      topbarTitle,
      lnurlWithdrawIsBusy,
    }),
    [
      allowedDisplayCurrencies,
      applyDisplayedAmountInputKey,
      appOwnerId,
      cashuBalance,
      cashuBalanceAfterMelt,
      cashuIsBusy,
      canWriteNfc,
      chatTopbarContact,
      contactsGuide,
      contactsGuideActiveStep,
      contactsGuideHighlightRect,
      currentNpub,
      currentNsec,
      derivedProfile,
      displayCurrency,
      displayUnit,
      effectiveMyLightningAddress,
      effectiveProfileName,
      effectiveProfilePicture,
      evoluTransactionsVisibleOwnerIds,
      formatDisplayedAmountParts,
      formatDisplayedAmountText,
      isProfileEditing,
      lang,
      lnurlWithdrawIsBusy,
      menuIsOpen,
      myProfileQr,
      myProfileStatus,
      nfcWritePromptKind,
      nostrPictureByNpub,
      paidOverlayIsOpen,
      paidOverlayTitle,
      pendingLightningInvoiceConfirmation,
      pendingLnurlWithdrawConfirmation,
      pendingMintAutoswapChangeConfirmation,
      pendingPaymentMintMeltConfirmation,
      postPaySaveContact,
      profileCustomPictureUrl,
      profileEditInitialRef,
      profileEditLnAddress,
      profileEditName,
      profileEditPicture,
      profileEditStatus,
      profileEditsSavable,
      profilePhotoInputRef,
      profileSelectedPictureKind,
      profileStatusCurrencies,
      profileStatusIsSaving,
      route,
      scanAllowsManualContact,
      scanEntryPoint,
      scanImageInputRef,
      scanIsOpen,
      scanVideoRef,
      selectedProfileStatusCurrencies,
      shareOptionsText,
      t,
      topbar,
      topbarRight,
      topbarTitle,
    ],
  );

  const appActions = React.useMemo(
    () => ({
      cancelPendingNfcWrite,
      closeMintAutoswapChangeConfirmation,
      closePaymentMintMeltConfirmation,
      closeLnurlWithdrawConfirmation,
      closeMenu,
      closeShareOptions,
      closeLightningInvoiceConfirmation,
      closeScan,
      confirmMintAutoswapChangeConfirmation,
      confirmPaymentMintMelt,
      confirmLnurlWithdraw,
      confirmLightningInvoicePayment,
      contactsGuideNav: stableContactsGuideNav,
      copyShareOptionsText,
      copyText,
      cycleDisplayCurrency,
      cycleProfileAvatarControl,
      onPickProfilePhoto,
      onPickScanImage,
      onProfilePhotoError,
      onProfilePhotoSelected,
      onScanImageSelected,
      openFeedbackContact,
      openIssueTokenFromScan,
      openManualContactFromScan,
      openManualPayFromScan,
      openProfileQr,
      openReceiveScan,
      openWalletScan,
      pasteScanValue,
      saveProfileEdits,
      setContactNewPrefill,
      setIsProfileEditing,
      setLang,
      setLightningInvoiceAutoPayLimit,
      setPostPaySaveContact,
      setProfileEditLnAddress,
      setProfileEditName,
      setProfileEditStatus,
      setDisplayCurrency: setDisplayCurrencyIfAllowed,
      stopContactsGuide,
      shareOptionsViaEmail,
      shareOptionsViaSms,
      shareOptionsViaWhatsApp,
      toggleAllowedDisplayCurrency,
      toggleProfileEditing,
      toggleProfileStatusCurrency,
      writeCurrentNpubToNfc,
    }),
    [
      cancelPendingNfcWrite,
      closeLightningInvoiceConfirmation,
      closeLnurlWithdrawConfirmation,
      closeMenu,
      closeMintAutoswapChangeConfirmation,
      closePaymentMintMeltConfirmation,
      closeScan,
      closeShareOptions,
      confirmLightningInvoicePayment,
      confirmLnurlWithdraw,
      confirmMintAutoswapChangeConfirmation,
      confirmPaymentMintMelt,
      stableContactsGuideNav,
      copyShareOptionsText,
      copyText,
      cycleDisplayCurrency,
      cycleProfileAvatarControl,
      onPickProfilePhoto,
      onPickScanImage,
      onProfilePhotoError,
      onProfilePhotoSelected,
      onScanImageSelected,
      openFeedbackContact,
      openIssueTokenFromScan,
      openManualContactFromScan,
      openManualPayFromScan,
      openProfileQr,
      openReceiveScan,
      openWalletScan,
      pasteScanValue,
      saveProfileEdits,
      setContactNewPrefill,
      setDisplayCurrencyIfAllowed,
      setIsProfileEditing,
      setLang,
      setLightningInvoiceAutoPayLimit,
      setPostPaySaveContact,
      setProfileEditLnAddress,
      setProfileEditName,
      setProfileEditStatus,
      shareOptionsViaEmail,
      shareOptionsViaSms,
      shareOptionsViaWhatsApp,
      stopContactsGuide,
      toggleAllowedDisplayCurrency,
      toggleProfileEditing,
      toggleProfileStatusCurrency,
      writeCurrentNpubToNfc,
    ],
  );

  return {
    appActions,
    appState,
    cancelPendingCashuContactSend,
    confirmPendingOnboardingProfile,
    createNewAccount,
    currentNsec,
    dismissToast,
    displayUnit,
    formatDisplayedAmountParts,
    formatDisplayedAmountText,
    isMainSwipeRoute,
    lang,
    mainSwipeRouteProps,
    moneyRouteProps,
    onboardingIsBusy,
    onboardingPhotoInputRef,
    onboardingStep,
    openReturningOnboarding,
    onPendingOnboardingPhotoError,
    onPendingOnboardingPhotoSelected,
    pageClassNameWithSwipe,
    pasteReturningSlip39FromClipboard,
    pickPendingOnboardingPhoto,
    peopleRouteProps,
    pendingCashuContactSend,
    pushToast,
    route,
    cyclePendingOnboardingAvatarControl,
    selectReturningSlip39Suggestion,
    savePendingOnboardingBackupToPasswordManager,
    setLang,
    setReturningSlip39Input,
    setOnboardingStep,
    setPendingOnboardingName,
    submitReturningSlip39,
    systemRouteProps,
    t,
    toasts,
  };
};
