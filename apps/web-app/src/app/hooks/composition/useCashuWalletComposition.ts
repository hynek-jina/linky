import type { Proof } from "@cashu/cashu-ts";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { nip19, type UnsignedEvent } from "nostr-tools";
import React, { useMemo, useState } from "react";
import { createSendTokenWithTokensAtMint } from "../../../cashuSend";
import { deriveDefaultProfile } from "../../../derivedProfile";
import {
  evolu,
  useEvolu,
  type CashuTokenRow,
  type CashuTokenId,
  type ContactId,
} from "../../../evolu";
import { navigateTo, useRouting } from "../../../hooks/useRouting";
import type { Lang } from "../../../i18n";
import {
  inferLightningAddressFromLnurlTarget,
  redeemLnurlWithdraw,
  type LnurlWithdrawPreview,
} from "../../../lnurlPay";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { getCashuDeterministicSeedFromStorage } from "../../../utils/cashuDeterministic";
import { isCashuOutputsAlreadySignedError } from "../../../utils/cashuErrors";
import { getCashuLib } from "../../../utils/cashuLib";
import { cashuAmountToNumber } from "../../../utils/cashuProofs";
import { createLoadedCashuWallet } from "../../../utils/cashuWallet";
import {
  CASHU_AUTOSWAP_MIN_SOURCE_SUM,
  CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  LOCAL_PENDING_TOPUP_QUOTE_STORAGE_KEY_PREFIX,
  MAX_CONTACTS_PER_OWNER,
  WALLET_WARNING_BALANCE_THRESHOLD_SAT,
  WALLET_WARNING_DISMISSED_STORAGE_KEY,
} from "../../../utils/constants";
import { formatDisplayAmountParts } from "../../../utils/displayAmounts";
import {
  getLightningInvoicePreview,
  type LightningInvoicePreview,
} from "../../../utils/lightningInvoice";
import {
  CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY,
  isTestMintUrl,
  MAIN_MINT_URL,
  normalizeMintUrl,
} from "../../../utils/mint";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { parseNpubCashProfileInfo } from "../../../utils/npubCashInfo";
import {
  getInitialCashuAutoswapEnabled,
  getInitialLightningInvoiceAutoPayLimit,
  getInitialPayWithCashuEnabled,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
  safeLocalStorageSetJson,
  withLocalStorageLeaseLock,
} from "../../../utils/storage";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { makeLocalId } from "../../../utils/validation";
import { useCashuTokenChecks } from "../cashu/useCashuTokenChecks";
import { useNpubCashClaim } from "../cashu/useNpubCashClaim";
import { useRestoreMissingTokens } from "../cashu/useRestoreMissingTokens";
import { useSaveCashuFromText } from "../cashu/useSaveCashuFromText";
import { normalizePubkeyHex } from "../messages/contactIdentity";
import { useNpubCashMintSelection } from "../mint/useNpubCashMintSelection";
import { useContactPayMethod } from "../payments/useContactPayMethod";
import { usePayContactWithCashuMessage } from "../payments/usePayContactWithCashuMessage";
import { useRouteAmountResetEffects } from "../payments/useRouteAmountResetEffects";
import {
  isClaimableMintQuoteState,
  readMintQuoteState,
} from "../topup/topupMintQuoteState";
import {
  requestMintQuoteBolt11,
  useTopupInvoiceQuoteEffects,
  type TopupMintQuoteDraft,
} from "../topup/useTopupInvoiceQuoteEffects";
import { useAnonymousPaymentTelemetry } from "../useAnonymousPaymentTelemetry";
import { useCashuDomain } from "../useCashuDomain";
import { useLightningPaymentsDomain } from "../useLightningPaymentsDomain";
import { useMintDomain } from "../useMintDomain";
import { useOwnerScopedStorage } from "../useOwnerScopedStorage";
import { usePaidOverlayState } from "../usePaidOverlayState";
import { usePaymentsDomain } from "../usePaymentsDomain";
import { useProfileNpubCashEffects } from "../useProfileNpubCashEffects";
import {
  appendPendingAutoswapClaim,
  claimAutoswapPendingEntry,
  makePendingAutoswapClaimsKey,
  readPendingAutoswapClaims,
  type AutoswapPendingClaim,
} from "../../lib/autoswapClaim";
import { getLinkyBankPaymentOfferInfo } from "../../lib/bankPaymentOffer";
import {
  readCashuRowOwnerId,
  resolveCashuRowStoredOwnerLane,
} from "../../lib/cashuOwnerLane";
import { isCashuRowCandidateBetter } from "../../lib/cashuRowPreference";
import {
  createCashuTokenId,
  readCashuTokenAliases as readCashuRowAliases,
} from "../../lib/cashuTokenIdentity";
import {
  CASHU_TOKEN_STATE_RESERVED,
  isCashuTokenAcceptedState,
  isCashuTokenDefinitivelySpent,
  isCashuTokenEmittedState,
  isCashuTokenIssuedState,
  isCashuTokenReservedState,
} from "../../lib/cashuTokenState";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import {
  buildPaymentAmountAttempts,
  buildPaymentFailureAmountAttempts,
  getPaymentAmountReserveCap,
  isRetryablePaymentAmountFailure,
} from "../../lib/paymentAmountFallback";
import {
  canOfferPaymentMintMelt,
  getPaymentMintMeltPlan,
} from "../../lib/paymentMintMelt";
import {
  buildCashuMintCandidates as buildCashuMintCandidatesBase,
  selectSingleMintCandidateForAmount,
} from "../../lib/paymentMintSelection";
import {
  buildCashuPaymentRequestMessage,
  parseCashuPaymentRequestMessage,
  type CashuPaymentRequestMessageInfo,
} from "../../lib/paymentRequestMessage";
import {
  LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
  wrapEventWithoutPushMarker,
  wrapEventWithPushMarker,
} from "../../lib/pushWrappedEvent";
import { getCashuTokenMessageInfo as getCashuTokenMessageInfoBase } from "../../lib/tokenMessageInfo";
import {
  enrichCashuTokenRow,
  extractCashuTokenMeta,
} from "../../lib/tokenText";
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
} from "../../lib/topupQuoteStorage";
import { mintTopupProofs } from "../../lib/topupProofRecovery";
import type {
  ContactRowLike,
  LocalNostrMessage,
  PaymentLogData,
} from "../../types/appTypes";
import {
  useContactsMessagingComposition,
  type DisplayContact,
} from "./useContactsMessagingComposition";
import { useIdentityOwnersComposition } from "./useIdentityOwnersComposition";
import { useProfileComposition } from "./useProfileComposition";

type LoadedCashuWallet = Awaited<ReturnType<typeof createLoadedCashuWallet>>;

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

export const logPayStep = (step: string, data?: PaymentLogData): void => {
  try {
    console.log("[linky][pay]", step, data ?? {});
  } catch {
    // ignore logging errors
  }
};

type IdentityOwnersCompositionResult = ReturnType<
  typeof useIdentityOwnersComposition
>;
type ContactsMessagingCompositionResult = ReturnType<
  typeof useContactsMessagingComposition
>;
type ProfileCompositionResult = ReturnType<typeof useProfileComposition>;
type OwnerScopedStorageResult = ReturnType<typeof useOwnerScopedStorage>;
type EvoluMutations = ReturnType<typeof useEvolu>;

interface UseCashuWalletCompositionParams {
  cashuTokensAll: readonly CashuTokenRow[];
  contactPayBackToChatRef: React.MutableRefObject<ContactId | null>;
  contactsMessaging: Pick<
    ContactsMessagingCompositionResult,
    | "activeContactsOwnerContactCount"
    | "activeNostrMessagePublishClientIdsRef"
    | "appendLocalNostrMessage"
    | "buildSavedContactName"
    | "chatMessages"
    | "chatSeenWrapIdsRef"
    | "contacts"
    | "enqueuePendingPayment"
    | "isBankPaymentOfferCanceled"
    | "nostrBootstrapReady"
    | "nostrMessagesLocal"
    | "nostrMessagesRecent"
    | "nostrPictureByNpub"
    | "openScannedContactPendingNpubRef"
    | "pendingPayments"
    | "publishSingleWrappedWithRetry"
    | "publishWrappedWithRetry"
    | "removePendingPayment"
    | "respondToBankPaymentOfferWithGroupState"
    | "selectedChatContact"
    | "selectedContact"
    | "sendChatMessage"
    | "setContactsOnboardingHasPaid"
    | "unknownNameByNpub"
    | "updateLocalNostrMessage"
  >;
  formatDisplayedAmountParts: (
    amountSat: number,
  ) => ReturnType<typeof formatDisplayAmountParts>;
  formatDisplayedAmountText: (amountSat: number) => string;
  identity: Pick<
    IdentityOwnersCompositionResult,
    | "appOwnerId"
    | "appOwnerIdRef"
    | "cashuOwnerId"
    | "cashuOwnerIdRef"
    | "cashuVisibleOwnerIds"
    | "contactsOwnerId"
    | "currentNpub"
    | "currentNsec"
    | "isSeedLogin"
    | "metaOwnerId"
    | "transactionsOwnerId"
  >;
  insert: EvoluMutations["insert"];
  lang: Lang;
  maybeShowPwaNotification: (
    title: string,
    body: string,
    tag?: string,
  ) => Promise<void>;
  ownerScopedStorage: Pick<
    OwnerScopedStorageResult,
    | "logPaymentEvent"
    | "makeLocalStorageKey"
    | "migrateLegacyPaymentEventsToEvolu"
    | "readSeenMintsFromStorage"
    | "rememberSeenMint"
  >;
  payAmount: string;
  profile: Pick<
    ProfileCompositionResult,
    | "effectiveMyLightningAddress"
    | "myProfileName"
    | "npubCashInfoInFlightRef"
    | "npubCashInfoLoadedAtMsRef"
    | "npubCashInfoLoadedForNpubRef"
    | "npubCashServerBaseUrl"
    | "ownedProfileLightningAddresses"
    | "profileClaimLightningAddressServerBaseUrl"
    | "setIsProfileEditing"
    | "setMyProfileQr"
    | "setOwnedProfileLightningAddresses"
    | "setOwnedProfileLightningAddressesLoading"
  >;
  pushToast: (message: string) => void;
  route: ReturnType<typeof useRouting>;
  setContactPaymentIntent: React.Dispatch<
    React.SetStateAction<"pay" | "request">
  >;
  setPayAmount: React.Dispatch<React.SetStateAction<string>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  update: EvoluMutations["update"];
  upsert: EvoluMutations["upsert"];
}

export const useCashuWalletComposition = ({
  cashuTokensAll,
  contactPayBackToChatRef,
  contactsMessaging,
  formatDisplayedAmountParts,
  formatDisplayedAmountText,
  identity,
  insert,
  lang,
  maybeShowPwaNotification,
  ownerScopedStorage,
  payAmount,
  profile,
  pushToast,
  route,
  setContactPaymentIntent,
  setPayAmount,
  setStatus,
  t,
  update,
  upsert,
}: UseCashuWalletCompositionParams) => {
  const {
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
    transactionsOwnerId,
  } = identity;
  const {
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
  } = contactsMessaging;
  const {
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
  } = profile;
  const {
    logPaymentEvent,
    makeLocalStorageKey,
    migrateLegacyPaymentEventsToEvolu,
    readSeenMintsFromStorage,
    rememberSeenMint,
  } = ownerScopedStorage;

  const hasMintOverrideRef = React.useRef(false);

  const topupInvoiceStartBalanceRef = React.useRef<number | null>(null);
  const topupInvoicePaidHandledRef = React.useRef(false);
  const [pendingCashuDeleteId, setPendingCashuDeleteId] =
    useState<CashuTokenId | null>(null);
  const [pendingMintDeleteUrl, setPendingMintDeleteUrl] = useState<
    string | null
  >(null);

  const [payWithCashuEnabled, setPayWithCashuEnabled] = useState<boolean>(() =>
    getInitialPayWithCashuEnabled(),
  );
  const [cashuAutoswapEnabled, setCashuAutoswapEnabled] = useState<boolean>(
    () => getInitialCashuAutoswapEnabled(),
  );
  const [lightningInvoiceAutoPayLimit, setLightningInvoiceAutoPayLimit] =
    useState<number>(() => getInitialLightningInvoiceAutoPayLimit());

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

  const [cashuDraft, setCashuDraft] = useState("");
  const cashuDraftRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [cashuEmitAmount, setCashuEmitAmount] = useState("");
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

  useRouteAmountResetEffects({
    contactPayBackToChatRef,
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
  const dedupeVisibleCashuRows = React.useCallback(
    function dedupeVisibleCashuRows(
      rows: readonly CashuTokenRow[],
    ): CashuTokenRow[] {
      if (visibleCashuOwnerIds.size === 0) return [];

      const ownerRank = new Map<string, number>();
      let rank = 0;
      for (const normalizedOwnerId of visibleCashuOwnerIds) {
        if (!normalizedOwnerId || ownerRank.has(normalizedOwnerId)) continue;
        ownerRank.set(normalizedOwnerId, rank);
        rank += 1;
      }

      const canonicalByAlias = new Map<string, string>();
      const bestByCanonical = new Map<string, CashuTokenRow>();
      const readRowCandidates = (row: CashuTokenRow): string[] => [
        String(row.id),
        ...readCashuRowAliases(row),
      ];

      const isCandidateBetter = (
        candidate: CashuTokenRow,
        existing: CashuTokenRow,
      ): boolean => {
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
    [activeCashuOwnerId, visibleCashuOwnerIds],
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
        const enriched = enrichCashuTokenRow(row);
        return enriched ? [enriched] : [];
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
          id: row.id,
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
        if (isCashuOutputsAlreadySignedError(error) && !cancelled) {
          // mintTopupProofs exhausted deterministic recovery; clearing the
          // quote prevents the five-second poll from repeating the failed claim.
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
        id: row.id,
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
    const targets = cashuOwnSpentTokens;
    if (targets.length === 0) return;

    setDeleteSpentCashuTokensIsBusy(true);
    try {
      const fallbackOwnerId = await resolveOwnerIdForWrite();
      let deleted = 0;
      for (const token of targets) {
        const payload = {
          id: token.id,
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

  const [postPaySaveContact, setPostPaySaveContact] = React.useState<null | {
    lnAddress: string;
    amountSat: number;
  }>(null);

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
              const deleted = updateCashuToken(
                { id: row.id, isDeleted: Evolu.sqliteTrue },
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
    [cashuTokensAll, resolveOwnerIdForWrite, setStatus, t, update],
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
      activeNostrMessagePublishClientIdsRef,
      appendLocalNostrMessage,
      cashuTokensAllFiltered,
      chatSeenWrapIdsRef,
      currentNsec,
      logPaymentEvent,
      deleteCashuToken,
      publishWrappedWithRetry,
      setStatus,
      t,
      updateLocalNostrMessage,
    ],
  );

  const handleMintIconLoad = React.useCallback(
    (origin: string, url: string | null) => {
      setMintIconUrlByMint((prev) => ({
        ...prev,
        [origin]: url,
      }));
    },
    [setMintIconUrlByMint],
  );

  const handleMintIconError = React.useCallback(
    (origin: string, url: string | null) => {
      setMintIconUrlByMint((prev) => ({
        ...prev,
        [origin]: url,
      }));
    },
    [setMintIconUrlByMint],
  );

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
      rows: readonly Pick<CashuTokenRow, "id" | "ownerId">[],
      fallbackOwnerId?: Evolu.OwnerId | null,
    ) => {
      for (const row of rows) {
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

    type DeletableCashuRow = Pick<CashuTokenRow, "id"> &
      Partial<Pick<CashuTokenRow, "ownerId">>;

    const markRowsDeleted = async (
      rows: DeletableCashuRow[],
      fallbackOwnerId?: Evolu.OwnerId | null,
    ) => {
      for (const row of rows) {
        const payload = { id: row.id, isDeleted: Evolu.sqliteTrue };
        const ownerId = row.ownerId ?? fallbackOwnerId;
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
        await import("../../../cashuMelt");

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

      let activeSourceRows: DeletableCashuRow[] = sourceRows;
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
    contactPayBackToChatRef,
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

  const getCashuTokenMessageInfo = React.useCallback(
    (text: string) =>
      getCashuTokenMessageInfoBase(text, cashuTokensAllFiltered),
    [cashuTokensAllFiltered],
  );

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

  return {
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
  };
};
