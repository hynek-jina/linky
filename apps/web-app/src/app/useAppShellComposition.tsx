import { Share } from "@capacitor/share";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { nip19 } from "nostr-tools";
import React, { useMemo, useState } from "react";
import { ContactCard } from "../components/ContactCard";
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
import {
  CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY,
  FEEDBACK_CONTACT_NPUB,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
  PENDING_DEEP_LINK_TEXT_STORAGE_KEY,
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
  extractPpk,
  MAIN_MINT_URL,
  normalizeMintUrl,
  PRESET_MINTS,
} from "../utils/mint";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";
import {
  getInitialAllowedDisplayCurrencies,
  getInitialDisplayCurrency,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeLocalStorageSetJson,
} from "../utils/storage";
import {
  createCashuTokensAllQuery,
  logPayStep,
  useCashuWalletComposition,
} from "./hooks/composition/useCashuWalletComposition";
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
import { useAppDataTransfer } from "./hooks/useAppDataTransfer";
import { useAppPreferences } from "./hooks/useAppPreferences";
import { useArmedDeleteTimeouts } from "./hooks/useArmedDeleteTimeouts";
import { useFiatRates } from "./hooks/useFiatRates";
import { useGuideScannerDomain } from "./hooks/useGuideScannerDomain";
import { useMainSwipePageEffects } from "./hooks/useMainSwipePageEffects";
import { useOwnerScopedStorage } from "./hooks/useOwnerScopedStorage";
import { useScannedTextHandler } from "./hooks/useScannedTextHandler";
import { useScannedTextHandlerRefBridge } from "./hooks/useScannedTextHandlerRefBridge";
import { useStatusToasts } from "./hooks/useStatusToasts";
import { useStoragePersistRequestEffect } from "./hooks/useStoragePersistRequestEffect";
import {
  getLinkyBankPaymentOfferInfo,
  isLinkyBankPaymentOfferEvent,
  setLinkyBankPaymentOfferMinimized,
} from "./lib/bankPaymentOffer";
import {
  CASHU_TOKEN_STATE_EXTERNALIZED,
  isCashuTokenAcceptedState,
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
  parsePrivateImageMessage,
  privateImageMessageFromEvent,
} from "./lib/privateImageMessage";
import {
  getLinkyBankPaymentOfferPaymentNoticeOfferId,
  isLinkyBankPaymentOfferPaymentNoticeEvent,
} from "./lib/pushWrappedEvent";
import { showPwaNotification } from "./lib/pwaNotifications";
import {
  extractCashuTokenFromText,
  extractCashuTokenFromText as extractCashuTokenFromTextFromUrl,
} from "./lib/tokenText";
import {
  buildTopbar,
  buildTopbarRight,
  buildTopbarTitle,
} from "./lib/topbarConfig";
import type { ContactRowLike, LocalNostrMessage } from "./types/appTypes";
import {
  useContactsMessagingComposition,
  type DisplayContact,
} from "./hooks/composition/useContactsMessagingComposition";

type TranslationKey = keyof (typeof translations)["cs"];

const hasTranslationKey = (key: string): key is TranslationKey =>
  Object.prototype.hasOwnProperty.call(translations.cs, key);

interface QueuedNotificationOpenDetail {
  value: unknown;
}

export const useAppShellComposition = () => {
  const { insert, update, upsert } = useEvolu();

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

  const [shareOptionsText, setShareOptionsText] = useState<string | null>(null);

  const [contactPaymentIntent, setContactPaymentIntent] = useState<
    "pay" | "request"
  >("pay");
  const [payAmount, setPayAmount] = useState<string>("");

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

  useStatusToasts({
    pushToast,
    setStatus,
    status,
  });

  const cashuTokensAllQuery = useMemo(createCashuTokensAllQuery, []);
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

  const {
    applyDefaultMintSelection,
    canPayWithCashu,
    cancelPendingCashuContactSend,
    cashuAutoswapEnabled,
    cashuBalance,
    cashuBalanceAfterMelt,
    cashuBulkCheckIsBusy,
    cashuDraft,
    cashuDraftRef,
    cashuEmitAmount,
    cashuHasMultipleAcceptedMints,
    cashuIsBusy,
    cashuIssuedTokens,
    cashuMeltToMainMintButtonLabel,
    cashuOwnSpentTokens,
    cashuOwnTokens,
    cashuTokensAllFiltered,
    cashuTokensFiltered,
    cashuTokensHydratedRef,
    cashuTotalBalance,
    checkAllCashuTokensAndDeleteInvalid,
    checkAndRefreshCashuToken,
    checkIssuedCashuTokensAndDeleteClaimed,
    checkSingleIssuedCashuTokenIsClaimed,
    closeLightningInvoiceConfirmation,
    closeLnurlWithdrawConfirmation,
    closeMintAutoswapChangeConfirmation,
    closePaymentMintMeltConfirmation,
    confirmLightningInvoicePayment,
    confirmLnurlWithdraw,
    confirmMintAutoswapChangeConfirmation,
    confirmPaymentMintMelt,
    contactPayMethod,
    defaultMintDisplay,
    defaultMintUrl,
    defaultMintUrlDraft,
    deleteSpentCashuTokens,
    deleteSpentCashuTokensIsBusy,
    dismissWalletWarning,
    emitCashuToken,
    getCashuTokenMessageInfo,
    getMintIconUrl,
    getMintRuntime,
    handleMintIconError,
    handleMintIconLoad,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    knownLnAddressPayContact,
    knownLnAddressPayContactPictureUrl,
    lightningInvoiceAutoPayLimit,
    lnAddressPayAmount,
    lnurlWithdrawIsBusy,
    makeNip98AuthHeader,
    markCashuTokenIssued,
    meltLargestForeignMintToMainMint,
    mintInfoByUrl,
    onPayChatPaymentRequest,
    paidOverlayIsOpen,
    paidOverlayTitle,
    payCashuPaymentRequest,
    payLightningAddressWithCashu,
    payLightningInvoiceWithCashu,
    paySelectedContact,
    payWithCashuEnabled,
    pendingCashuContactSend,
    pendingCashuDeleteId,
    pendingCashuTokenContactPickId,
    pendingLightningInvoiceConfirmation,
    pendingLnurlWithdrawConfirmation,
    pendingMintAutoswapChangeConfirmation,
    pendingMintDeleteUrl,
    pendingPaymentMintMeltConfirmation,
    postPaySaveContact,
    refreshMintInfo,
    requestDeleteCashuToken,
    requestSelectedContact,
    reserveCashuToken,
    restoreMissingTokens,
    returnCashuTokenToWallet,
    saveCashuFromText,
    sendCashuTokenToContact,
    setCashuAutoswapEnabled,
    setCashuDraft,
    setCashuEmitAmount,
    setContactPayMethod,
    setDefaultMintUrlDraft,
    setLightningInvoiceAutoPayLimit,
    setLnAddressPayAmount,
    setMintIconUrlByMint,
    setMintInfoAll,
    setPayWithCashuEnabled,
    setPendingCashuDeleteId,
    setPendingLightningInvoiceConfirmation,
    setPendingLnurlWithdrawConfirmation,
    setPendingMintDeleteUrl,
    setPostPaySaveContact,
    setTopupAmount,
    settleBankPaymentOffer,
    showPaidOverlay,
    startSendCashuTokenToContact,
    tokensRestoreIsBusy,
    topupAmount,
    topupInvoice,
    topupInvoiceCashuRequest,
    topupInvoiceError,
    topupInvoiceIsBusy,
    topupInvoiceQr,
    topupInvoiceQrPayload,
    topupMintQuote,
    walletWarningApplies,
    walletWarningDismissed,
  } = useCashuWalletComposition({
    cashuTokensAll,
    contactPayBackToChatRef,
    contactsHeaderVisible,
    contactsMessaging: {
      activeContactsOwnerContactCount,
      activeNostrMessagePublishClientIdsRef,
      appendLocalNostrMessage,
      buildSavedContactName,
      chatMessages,
      chatSeenWrapIdsRef,
      contacts,
      enqueuePendingPayment,
      isBankPaymentOfferCanceled,
      nostrBootstrapReady,
      nostrMessagesLocal,
      nostrMessagesRecent,
      nostrPictureByNpub,
      openScannedContactPendingNpubRef,
      pendingPayments,
      publishSingleWrappedWithRetry,
      publishWrappedWithRetry,
      removePendingPayment,
      respondToBankPaymentOfferWithGroupState,
      selectedChatContact,
      selectedContact,
      sendChatMessage,
      setContactsOnboardingHasPaid,
      unknownNameByNpub,
      updateLocalNostrMessage,
    },
    formatDisplayedAmountParts,
    formatDisplayedAmountText,
    identity: {
      appOwnerId,
      appOwnerIdRef,
      cashuOwnerId,
      cashuOwnerIdRef,
      cashuVisibleOwnerIds,
      contactsOwnerId,
      currentNpub,
      currentNsec,
      isSeedLogin,
      metaOwnerId,
      recordContactsOwnerWrite,
      transactionsOwnerId,
    },
    insert,
    lang,
    maybeShowPwaNotification,
    ownerScopedStorage: {
      logPaymentEvent,
      makeLocalStorageKey,
      migrateLegacyPaymentEventsToEvolu,
      readSeenMintsFromStorage,
      rememberSeenMint,
    },
    payAmount,
    profile: {
      effectiveMyLightningAddress,
      myProfileName,
      npubCashInfoInFlightRef,
      npubCashInfoLoadedAtMsRef,
      npubCashInfoLoadedForNpubRef,
      npubCashServerBaseUrl,
      ownedProfileLightningAddresses,
      profileClaimLightningAddressServerBaseUrl,
      setIsProfileEditing,
      setMyProfileQr,
      setOwnedProfileLightningAddresses,
      setOwnedProfileLightningAddressesLoading,
    },
    pushToast,
    route,
    setContactPaymentIntent,
    setPayAmount,
    setStatus,
    t,
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
