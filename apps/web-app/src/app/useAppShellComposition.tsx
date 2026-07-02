import { Share } from "@capacitor/share";
import type { MintProofsConfig, OutputType, Proof } from "@cashu/cashu-ts";
import * as Evolu from "@evolu/common";
import { useOwner, useQuery } from "@evolu/react";
import {
  nip19,
  type Event as NostrToolsEvent,
  type UnsignedEvent,
} from "nostr-tools";
import React, { useMemo, useState } from "react";
import { createSendTokenWithTokensAtMint } from "../cashuSend";
import { ContactCard } from "../components/ContactCard";
import {
  DEFAULT_LIGHTNING_ADDRESS_DOMAIN,
  deriveDefaultLightningAddress,
  deriveDefaultProfile,
} from "../derivedProfile";
import {
  evolu,
  normalizeEvoluServerUrl,
  type CashuTokenId,
  type ContactId,
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
import {
  inferLightningAddressFromLnurlTarget,
  redeemLnurlWithdraw,
  type LnurlWithdrawPreview,
} from "../lnurlPay";
import {
  cacheProfileAvatarFromUrl,
  deleteCachedProfileAvatar,
  fetchNostrProfileMetadata,
  fetchNostrProfilePicture,
  getNostrProfilePictureUrl,
  isCachedProfilePictureStale,
  loadCachedProfileAvatarObjectUrl,
  loadCachedProfileMetadata,
  loadCachedProfilePicture,
  NOSTR_RELAYS,
  saveCachedProfileMetadata,
  saveCachedProfilePicture,
  type NostrProfileMetadata,
} from "../nostrProfile";
import {
  extractStatusFilterCurrencies,
  isStatusFilterValue,
  parseStatusFilterValue,
  PROFILE_STATUS_CURRENCIES,
} from "../nostrStatus";
import { writeClipboardText } from "../platform/clipboard";
import {
  persistSyncedActiveNostrIdentity,
  readStoredNostrNsec,
} from "../platform/identitySecrets";
import {
  cancelNativeNfcWrite,
  consumePendingIosNativeDeepLinkUrl,
  consumePendingNativeDeepLinkUrl,
  NATIVE_DEEP_LINK_EVENT,
  startNativeNfcWrite,
  supportsNativeNfcWrite,
} from "../platform/nativeBridge";
import {
  triggerPasswordManagerSeedSave,
  type PasswordManagerSaveResult,
} from "../platform/passwordManager";
import { isNativePlatform } from "../platform/runtime";
import {
  bumpCashuDeterministicCounter,
  ensureCashuDeterministicCounterAtLeast,
  getCashuDeterministicCounter,
  getCashuDeterministicSeedFromStorage,
  withCashuDeterministicCounterLock,
} from "../utils/cashuDeterministic";
import {
  isCashuOutputsAlreadySignedError,
  isCashuOutputsArePendingError,
} from "../utils/cashuErrors";
import { getCashuLib } from "../utils/cashuLib";
import {
  cashuAmountToNumber,
  sumCashuProofAmounts,
} from "../utils/cashuProofs";
import { createLoadedCashuWallet } from "../utils/cashuWallet";
import {
  ARCHIVED_CONTACTS_FILTER,
  BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY,
  CASHU_AUTOSWAP_MIN_SOURCE_SUM,
  CASHU_ONBOARDING_SET_MAIN_MINT_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_BACKUPED_KEYS_STORAGE_KEY,
  CONTACTS_ONBOARDING_HAS_PAID_STORAGE_KEY,
  FEEDBACK_CONTACT_NPUB,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
  LOCAL_PENDING_AUTOSWAP_CLAIM_STORAGE_KEY_PREFIX,
  LOCAL_PENDING_TOPUP_QUOTE_STORAGE_KEY_PREFIX,
  MAX_CONTACTS_PER_OWNER,
  NO_GROUP_FILTER,
  PENDING_DEEP_LINK_TEXT_STORAGE_KEY,
  WALLET_WARNING_BALANCE_THRESHOLD_SAT,
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
import { formatShortNpub, getBestNostrName } from "../utils/formatting";
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
import { resolveNpubCashServerBaseUrl } from "../utils/npubCashServer";
import {
  clearStoredPushNsec,
  setStoredPushNsec,
} from "../utils/pushNsecStorage";
import { openSpdPaymentInBank } from "../utils/spdPayment";
import {
  getInitialAllowedDisplayCurrencies,
  getInitialBankPaymentOfferRecipientCount,
  getInitialCashuAutoswapEnabled,
  getInitialDisplayCurrency,
  getInitialLightningInvoiceAutoPayLimit,
  getInitialNostrIdentitySource,
  getInitialNostrIdentitySwitchedAtSec,
  getInitialNostrNsec,
  getInitialPayWithCashuEnabled,
  getInitialShowProfileQrOnTiltEnabled,
  safeLocalStorageGet,
  safeLocalStorageGetJson,
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
  buildUnknownContactId,
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
import { useProfileStatusEditor } from "./hooks/profile/useProfileStatusEditor";
import { useProfileStatusSyncEffect } from "./hooks/profile/useProfileStatusSyncEffect";
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
import { usePortraitOrientationLock } from "./hooks/usePortraitOrientationLock";
import { useRelayDomain } from "./hooks/useRelayDomain";
import { useScannedTextHandler } from "./hooks/useScannedTextHandler";
import { useScannedTextHandlerRefBridge } from "./hooks/useScannedTextHandlerRefBridge";
import { useStatusToasts } from "./hooks/useStatusToasts";
import { useStoragePersistRequestEffect } from "./hooks/useStoragePersistRequestEffect";
import { resolveCashuRowStoredOwnerLane } from "./lib/cashuOwnerLane";
import { createCashuTokenId } from "./lib/cashuTokenIdentity";
import {
  createLinkyBankPaymentOfferEvent,
  getLinkyBankPaymentOfferInfo,
  getLinkyBankPaymentOfferStatusRank,
  isLinkyBankPaymentOfferTerminalStatus,
  LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT,
  LINKY_BANK_PAYMENT_OFFER_MAX_RECIPIENT_COUNT,
  LINKY_BANK_PAYMENT_OFFER_MIN_RECIPIENT_COUNT,
  LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC,
  LINKY_BANK_PAYMENT_OFFER_RECIPIENT_STATUS_CURRENCY,
  type LinkyBankPaymentOfferStatus,
} from "./lib/bankPaymentOffer";
import {
  CASHU_TOKEN_STATE_EXTERNALIZED,
  CASHU_TOKEN_STATE_RESERVED,
  isCashuTokenAcceptedState,
  isCashuTokenDefinitivelySpent,
  isCashuTokenEmittedState,
  isCashuTokenIssuedState,
  isCashuTokenReservedState,
} from "./lib/cashuTokenState";
import { isCashuRowCandidateBetter } from "./lib/cashuRowPreference";
import {
  buildIdentityChangeMessageContent,
  buildIdentityChangeMessageWrapId,
  type IdentityChangeMessageSource,
} from "./lib/identityChangeMessage";
import type { AppNostrPool } from "./lib/nostrPool";
import { getSharedAppNostrPool } from "./lib/nostrPool";
import {
  publishSingleWrappedWithRetry as publishSingleWrappedWithRetryBase,
  publishWrappedWithRetry as publishWrappedWithRetryBase,
} from "./lib/nostrPublishRetry";
import {
  buildPaymentAmountAttempts,
  buildPaymentFailureAmountAttempts,
  getPaymentAmountReserveCap,
  isRetryablePaymentAmountFailure,
} from "./lib/paymentAmountFallback";
import {
  buildCashuMintCandidates as buildCashuMintCandidatesBase,
  selectSingleMintCandidateForAmount,
} from "./lib/paymentMintSelection";
import {
  canOfferPaymentMintMelt,
  getPaymentMintMeltPlan,
} from "./lib/paymentMintMelt";
import {
  buildCashuPaymentRequestMessage,
  buildLinkyPaymentRequestDeclineMessage,
  parseCashuPaymentRequestMessage,
  type CashuPaymentRequestMessageInfo,
} from "./lib/paymentRequestMessage";
import {
  parsePrivateImageMessage,
  privateImagePreviewText,
} from "./lib/privateImageMessage";
import {
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
import type {
  ContactRowLike,
  LocalNostrMessage,
  PaymentLogData,
  PublishWrappedResult,
} from "./types/appTypes";

const inMemoryNostrPictureCache = new Map<string, string | null>();
const inMemoryMintIconCache = new Map<string, string | null>();
const INLINE_NPUB_PATTERN =
  /(?:nostr:)?npub1[023456789acdefghjklmnpqrstuvwxyz]+(?:@npub\.cash)?/gi;

type TranslationKey = keyof (typeof translations)["cs"];

const hasTranslationKey = (key: string): key is TranslationKey =>
  Object.prototype.hasOwnProperty.call(translations.cs, key);

const readObjectField = (value: unknown, field: string): unknown => {
  if (typeof value !== "object" || value === null) return undefined;
  return Reflect.get(value, field);
};

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

const extractMentionedNpubs = (content: string): string[] => {
  const matches = String(content ?? "").match(INLINE_NPUB_PATTERN);
  if (!matches) return [];

  const seen = new Set<string>();
  const npubs: string[] = [];

  for (const match of matches) {
    const npub = normalizeNpubIdentifier(match);
    if (!npub || seen.has(npub)) continue;
    seen.add(npub);
    npubs.push(npub);
  }

  return npubs;
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
const CLAIMED_AUTOSWAP_QUOTE_STORAGE_KEY_PREFIX = "linky.autoswap.claimed.v1";
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

const makeClaimedAutoswapQuoteStorageKey = (args: {
  mintUrl: string;
  ownerId: string;
  quote: string;
}): string => {
  return `${CLAIMED_AUTOSWAP_QUOTE_STORAGE_KEY_PREFIX}.${encodeStorageSegment(
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

interface AutoswapPendingClaim {
  amount: number;
  createdAtMs: number;
  invoice: string;
  mintUrl: string;
  quote: string;
  unit: string;
}

const isAutoswapPendingClaim = (
  value: unknown,
): value is AutoswapPendingClaim =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { amount?: unknown }).amount === "number" &&
  typeof (value as { createdAtMs?: unknown }).createdAtMs === "number" &&
  typeof (value as { invoice?: unknown }).invoice === "string" &&
  typeof (value as { mintUrl?: unknown }).mintUrl === "string" &&
  typeof (value as { quote?: unknown }).quote === "string" &&
  typeof (value as { unit?: unknown }).unit === "string";

const makePendingAutoswapClaimsKey = (ownerId: string): string =>
  `${LOCAL_PENDING_AUTOSWAP_CLAIM_STORAGE_KEY_PREFIX}.${encodeStorageSegment(
    ownerId,
  )}`;

const readPendingAutoswapClaims = (key: string): AutoswapPendingClaim[] => {
  const raw = safeLocalStorageGet(key);
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAutoswapPendingClaim);
  } catch {
    return [];
  }
};

const writePendingAutoswapClaims = (
  key: string,
  claims: AutoswapPendingClaim[],
): void => {
  if (claims.length === 0) {
    safeLocalStorageRemove(key);
    return;
  }
  safeLocalStorageSetJson(key, claims);
};

const appendPendingAutoswapClaim = (
  key: string,
  claim: AutoswapPendingClaim,
): void => {
  const existing = readPendingAutoswapClaims(key);
  const filtered = existing.filter(
    (entry) => entry.quote !== claim.quote || entry.mintUrl !== claim.mintUrl,
  );
  filtered.push(claim);
  writePendingAutoswapClaims(key, filtered);
};

const removePendingAutoswapClaim = (
  key: string,
  args: { mintUrl: string; quote: string },
): void => {
  const existing = readPendingAutoswapClaims(key);
  const next = existing.filter(
    (entry) => !(entry.quote === args.quote && entry.mintUrl === args.mintUrl),
  );
  writePendingAutoswapClaims(key, next);
};

const isLikelyCorsOrNetworkError = (message: string): boolean => {
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("cors") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  );
};

interface TopupMintProofsWalletLike {
  keysetId: string;
  mintProofsBolt11: (
    amount: number,
    quote: string,
    config?: MintProofsConfig,
    outputType?: OutputType,
  ) => Promise<Proof[]>;
  restore: (
    start: number,
    count: number,
    options?: { keysetId?: string },
  ) => Promise<{
    lastCounterWithSignature?: number;
    proofs: Proof[];
  }>;
  checkProofsStates: (proofs: Proof[]) => Promise<Array<{ state?: unknown }>>;
  unit: string;
}

const filterSpendableTopupProofs = async (
  wallet: TopupMintProofsWalletLike,
  proofs: Proof[],
): Promise<Proof[]> => {
  if (proofs.length === 0) return proofs;

  try {
    const states = await wallet.checkProofsStates(proofs);
    return proofs.filter((_, idx) => {
      const state = String(states[idx]?.state ?? "")
        .trim()
        .toUpperCase();
      return state === "UNSPENT";
    });
  } catch {
    return proofs;
  }
};

const findExactSubsetByAmount = (
  proofs: Proof[],
  target: number,
): Proof[] | null => {
  if (target <= 0) return null;
  const indexed = proofs
    .map((proof, idx) => ({
      idx,
      amount: cashuAmountToNumber(proof.amount),
      proof,
    }))
    .filter((entry) => entry.amount > 0 && entry.amount <= target)
    .sort((a, b) => b.amount - a.amount);
  if (indexed.length === 0) return null;

  const memo = new Set<string>();
  const dfs = (start: number, remaining: number): Proof[] | null => {
    if (remaining === 0) return [];
    if (start >= indexed.length) return null;
    const memoKey = `${start}|${remaining}`;
    if (memo.has(memoKey)) return null;
    for (let i = start; i < indexed.length; i += 1) {
      const entry = indexed[i];
      if (!entry || entry.amount > remaining) continue;
      const rest = dfs(i + 1, remaining - entry.amount);
      if (rest) return [entry.proof, ...rest];
    }
    memo.add(memoKey);
    return null;
  };

  return dfs(0, target);
};

type RestoreAlreadySignedResult =
  | {
      kind: "recovery";
      lastCounterWithSignature?: number;
      proofs: Proof[];
    }
  | {
      kind: "collision";
      lastCounterWithSignature?: number;
    }
  | { kind: "empty" };

const restoreAlreadySignedTopupProofs = async (args: {
  amount: number;
  counter: number;
  keysetId: string;
  wallet: TopupMintProofsWalletLike;
}): Promise<RestoreAlreadySignedResult> => {
  const restoreCount = 100;
  const restored = await args.wallet.restore(args.counter, restoreCount, {
    keysetId: args.keysetId,
  });

  if (restored.proofs.length === 0) {
    return { kind: "empty" };
  }

  const spendableProofs = await filterSpendableTopupProofs(
    args.wallet,
    restored.proofs,
  );

  const totalSpendable = sumCashuProofAmounts(spendableProofs);

  if (totalSpendable < args.amount) {
    // Mint has signatures here but they're (mostly) SPENT. Common cause:
    // the wallet's deterministic counter window overlaps proofs from a
    // prior unrelated operation (melt blanks, an old quote already
    // claimed and spent). The CURRENT quote was never issued — it's
    // still PAID at the mint. Caller must bump past `lastCounterWithSignature`
    // and retry `mintProofs` with fresh outputs against the same quote.
    const result: {
      kind: "collision";
      lastCounterWithSignature?: number;
    } = { kind: "collision" };
    if (restored.lastCounterWithSignature !== undefined) {
      result.lastCounterWithSignature = restored.lastCounterWithSignature;
    }
    return result;
  }

  // Prefer an exact subset matching `amount`; fall back to the full set.
  const exact = findExactSubsetByAmount(spendableProofs, args.amount);
  const proofs = exact ?? spendableProofs;

  const result: {
    kind: "recovery";
    lastCounterWithSignature?: number;
    proofs: Proof[];
  } = { kind: "recovery", proofs };
  if (restored.lastCounterWithSignature !== undefined) {
    result.lastCounterWithSignature = restored.lastCounterWithSignature;
  }
  return result;
};

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
    return await args.wallet.mintProofsBolt11(args.amount, args.quoteId);
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

      // OutputsArePending (NUT 11004) — orphan `c_ IS NULL` row matching one
      // of our B_'s. NUT-09 restore won't surface unsigned promises, so we
      // bump the counter by a fixed margin and retry.
      //
      // OutputsAlreadySigned (NUT 11005, some mints surface 11003) — disambiguate
      // via NUT-09 restore:
      // - Recovery: quote was issued in a prior session, restored proofs
      //   are still spendable. Use them.
      // - Collision: deterministic counter window overlaps spent proofs
      //   from an unrelated past operation. The current quote is still
      //   PAID; bump past `lastCounterWithSignature` and retry mintProofs
      //   with fresh outputs.
      let pendingRetries = 0;
      const maxPendingRetries = 5;
      let collisionRetries = 0;
      const maxCollisionRetries = 5;

      while (true) {
        try {
          const proofs = await args.wallet.mintProofsBolt11(
            args.amount,
            args.quoteId,
            undefined,
            { type: "deterministic", counter },
          );

          bumpCashuDeterministicCounter({
            mintUrl: args.mintUrl,
            unit,
            keysetId,
            used: proofs.length,
          });

          return proofs;
        } catch (error) {
          if (
            isCashuOutputsArePendingError(error) &&
            pendingRetries < maxPendingRetries
          ) {
            pendingRetries += 1;
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
            continue;
          }
          if (!isCashuOutputsAlreadySignedError(error)) throw error;
          if (collisionRetries >= maxCollisionRetries) throw error;
          collisionRetries += 1;

          let restored: RestoreAlreadySignedResult;
          try {
            restored = await restoreAlreadySignedTopupProofs({
              amount: args.amount,
              counter,
              keysetId,
              wallet: args.wallet,
            });
          } catch {
            throw error;
          }

          if (restored.kind === "recovery") {
            const lastCounter = restored.lastCounterWithSignature;
            ensureCashuDeterministicCounterAtLeast({
              mintUrl: args.mintUrl,
              unit,
              keysetId,
              atLeast:
                typeof lastCounter === "number" && Number.isFinite(lastCounter)
                  ? lastCounter + 1
                  : counter + restored.proofs.length,
            });
            return restored.proofs;
          }

          // Collision (or empty restore): bump past colliding range and
          // retry mintProofs against the still-PAID quote.
          if (
            restored.kind === "collision" &&
            typeof restored.lastCounterWithSignature === "number" &&
            Number.isFinite(restored.lastCounterWithSignature)
          ) {
            ensureCashuDeterministicCounterAtLeast({
              mintUrl: args.mintUrl,
              unit,
              keysetId,
              atLeast: restored.lastCounterWithSignature + 1,
            });
          } else {
            bumpCashuDeterministicCounter({
              mintUrl: args.mintUrl,
              unit,
              keysetId,
              used: 64,
            });
          }
          counter = getCashuDeterministicCounter({
            mintUrl: args.mintUrl,
            unit,
            keysetId,
          });
          continue;
        }
      }
    },
  );
};

interface AutoswapClaimContext {
  upsert: (
    table: "cashuToken",
    payload: {
      id: CashuTokenId;
      token: typeof Evolu.NonEmptyString.Type;
      state: typeof Evolu.NonEmptyString100.Type;
    },
    options?: { ownerId: Evolu.OwnerId },
  ) => { ok: boolean; error?: unknown; value?: { id: CashuTokenId } };
  isCashuTokenKnownAny: (token: string) => boolean;
  resolveOwnerIdForWrite: () => Promise<Evolu.OwnerId | null>;
}

type AutoswapClaimOutcome =
  | { kind: "claimed" }
  | { kind: "in_flight" }
  | { kind: "not_claimable_yet" }
  | { kind: "dropped"; reason: string }
  | { kind: "failed"; reason: string };

// Single source of truth for claiming a queued autoswap entry: load the
// target wallet, gate on a claimable mint quote, mint+restore proofs under
// the deterministic counter lock, encode + insert the resulting cashuToken,
// and clear the persisted entry. Sharing one in-flight set across the
// autoswap melt path and the 5s background tick guarantees a single
// minted-token writer per quote so isCashuTokenKnownAny dedup works
// correctly even when mintProofs and NUT-09 restore return proofs in
// different orders.
type LoadedCashuWallet = Awaited<ReturnType<typeof createLoadedCashuWallet>>;

const claimAutoswapPendingEntry = async (args: {
  claim: AutoswapPendingClaim;
  claimOwnerKey: string;
  claimsKey: string;
  ctx: AutoswapClaimContext;
  inFlightSet: Set<string>;
  // Optional cross-tick wallet cache. The background claim effect ticks
  // every 10s; if the mint quote isn't `PAID` yet we'd otherwise re-run
  // loadMint() (info+keysets+keys = 3 calls) on every tick until it flips.
  // Re-using the wallet handle skips those 3 calls per pending claim.
  walletCache?: Map<string, LoadedCashuWallet>;
}): Promise<AutoswapClaimOutcome> => {
  const key = `${args.claim.mintUrl}|${args.claim.quote}`;
  if (args.inFlightSet.has(key)) return { kind: "in_flight" };
  args.inFlightSet.add(key);

  try {
    const claimStorageKey = makeClaimedAutoswapQuoteStorageKey({
      ownerId: args.claimOwnerKey,
      mintUrl: args.claim.mintUrl,
      quote: args.claim.quote,
    });
    const insertClaimedToken = async (
      claimed: ClaimedTopupQuoteStorage,
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
      if (args.ctx.isCashuTokenKnownAny(claimed.token)) return { ok: true };

      const ownerId = await args.ctx.resolveOwnerIdForWrite();
      const payload = {
        id: createCashuTokenId(claimed.token),
        token: claimed.token as typeof Evolu.NonEmptyString.Type,
        state: "accepted" as typeof Evolu.NonEmptyString100.Type,
      };
      const result = ownerId
        ? args.ctx.upsert("cashuToken", payload, { ownerId })
        : args.ctx.upsert("cashuToken", payload);
      if (!result.ok) {
        return {
          ok: false,
          reason: getUnknownErrorMessage(result.error, "unknown"),
        };
      }
      return { ok: true };
    };

    const claimedBeforeRun = readClaimedTopupQuoteFromStorage(claimStorageKey);
    if (claimedBeforeRun) {
      const restored = await insertClaimedToken(claimedBeforeRun);
      if (!restored.ok) {
        return { kind: "failed", reason: restored.reason };
      }
      removePendingAutoswapClaim(args.claimsKey, {
        mintUrl: args.claim.mintUrl,
        quote: args.claim.quote,
      });
      return { kind: "claimed" };
    }

    const { Mint, Wallet, MintQuoteState, getEncodedToken } =
      await getCashuLib();
    const det = getCashuDeterministicSeedFromStorage();
    const walletCacheKey = `${args.claim.mintUrl}|${args.claim.unit || "sat"}`;
    let wallet = args.walletCache?.get(walletCacheKey);
    if (!wallet) {
      wallet = await createLoadedCashuWallet({
        Mint,
        Wallet,
        mintUrl: args.claim.mintUrl,
        unit: args.claim.unit || "sat",
        ...(det ? { bip39seed: det.bip39seed } : {}),
      });
      args.walletCache?.set(walletCacheKey, wallet);
    }

    const status = await wallet.checkMintQuoteBolt11(args.claim.quote);
    const state = readMintQuoteState(status);
    if (!isClaimableMintQuoteState(state, MintQuoteState)) {
      return { kind: "not_claimable_yet" };
    }

    const proofs = await mintTopupProofs({
      amount: args.claim.amount,
      mintUrl: args.claim.mintUrl,
      quoteId: args.claim.quote,
      unit: wallet.unit ?? args.claim.unit ?? "sat",
      wallet,
    });
    const token = String(
      getEncodedToken({
        mint: args.claim.mintUrl,
        proofs,
        unit: wallet.unit ?? args.claim.unit ?? "sat",
      }) ?? "",
    ).trim();
    if (!token) return { kind: "failed", reason: "empty token" };

    safeLocalStorageSetJson(claimStorageKey, {
      amount: args.claim.amount,
      claimedAtMs: Date.now(),
      mintUrl: args.claim.mintUrl,
      quote: args.claim.quote,
      token,
      unit: wallet.unit ?? args.claim.unit ?? "sat",
    });

    const inserted = await insertClaimedToken({
      amount: args.claim.amount,
      claimedAtMs: Date.now(),
      mintUrl: args.claim.mintUrl,
      quote: args.claim.quote,
      token,
      unit: wallet.unit ?? args.claim.unit ?? "sat",
    });
    if (!inserted.ok) {
      return { kind: "failed", reason: inserted.reason };
    }

    removePendingAutoswapClaim(args.claimsKey, {
      mintUrl: args.claim.mintUrl,
      quote: args.claim.quote,
    });
    return { kind: "claimed" };
  } catch (error) {
    if (isCashuOutputsAlreadySignedError(error)) {
      // mintTopupProofs has its own restore loop. Reaching here means
      // recovery exhausted the deterministic counter window for this
      // quote — keep retrying every 5s would loop forever. Drop the
      // entry; the user's separate Restore action can still recover any
      // stranded proofs at the mint via a wider counter scan.
      removePendingAutoswapClaim(args.claimsKey, {
        mintUrl: args.claim.mintUrl,
        quote: args.claim.quote,
      });
      return {
        kind: "dropped",
        reason: getUnknownErrorMessage(error, "outputs already signed"),
      };
    }
    return {
      kind: "failed",
      reason: getUnknownErrorMessage(error, "unknown"),
    };
  } finally {
    args.inFlightSet.delete(key);
  }
};

const logPayStep = (step: string, data?: PaymentLogData): void => {
  try {
    console.log("[linky][pay]", step, data ?? {});
  } catch {
    // ignore logging errors
  }
};

const clampBankPaymentOfferRecipientCount = (value: number): number => {
  if (!Number.isFinite(value)) {
    return LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT;
  }

  return Math.min(
    LINKY_BANK_PAYMENT_OFFER_MAX_RECIPIENT_COUNT,
    Math.max(LINKY_BANK_PAYMENT_OFFER_MIN_RECIPIENT_COUNT, Math.round(value)),
  );
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
  const transactionsOwnerIdRef = React.useRef<Evolu.OwnerId | null>(null);
  const recordTransactionsOwnerWriteRef = React.useRef<
    ((count?: number) => void) | null
  >(null);
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

  const route = useRouting();
  const { dismissToast, toasts, pushToast } = useToasts();

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
  const [isMainSwipeDragging, setIsMainSwipeDragging] = useState(false);
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
  const [showProfileQrOnTiltEnabled, setShowProfileQrOnTiltEnabled] =
    useState<boolean>(() => getInitialShowProfileQrOnTiltEnabled());
  const [lightningInvoiceAutoPayLimit, setLightningInvoiceAutoPayLimit] =
    useState<number>(() => getInitialLightningInvoiceAutoPayLimit());
  const [
    bankPaymentOfferRecipientCount,
    setBankPaymentOfferRecipientCountState,
  ] = useState<number>(() =>
    clampBankPaymentOfferRecipientCount(
      getInitialBankPaymentOfferRecipientCount(
        LINKY_BANK_PAYMENT_OFFER_DEFAULT_RECIPIENT_COUNT,
      ),
    ),
  );
  const [allowPromisesEnabled] = useState<boolean>(false);

  const setBankPaymentOfferRecipientCount = React.useCallback(
    (value: number) => {
      setBankPaymentOfferRecipientCountState(
        clampBankPaymentOfferRecipientCount(value),
      );
    },
    [],
  );

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
  }, [appOwnerId, makeLocalStorageKey]);

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
  const [nostrStatusByNpub, setNostrStatusByNpub] = useState<
    Record<string, string | null>
  >({});

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

  const [chatDraft, setChatDraft] = useState<string>("");
  const [pendingCashuTokenContactPickId, setPendingCashuTokenContactPickId] =
    useState<CashuTokenId | null>(null);
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

  const chatMessagesRef = React.useRef<HTMLDivElement | null>(null);
  const appendIdentityChangeNoticesRef = React.useRef<
    | ((args: {
        changedAtSec: number;
        identitySource: IdentityChangeMessageSource;
      }) => void)
    | null
  >(null);
  const chatMessageElByIdRef = React.useRef<Map<string, HTMLDivElement>>(
    new Map(),
  );
  const [bankPaymentOfferMessages, setBankPaymentOfferMessages] = useState<
    LocalNostrMessage[]
  >([]);
  const bankPaymentOfferSpdPayloadByOfferIdRef = React.useRef<
    Map<string, string>
  >(new Map());
  const autoSentBankDetailsOfferIdsRef = React.useRef<Set<string>>(new Set());
  const bankPaymentOfferExpiryInFlightRef = React.useRef(false);
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

  const upsertBankPaymentOfferMessage = React.useCallback(
    (message: LocalNostrMessage) => {
      const messageContactId = String(message.contactId ?? "").trim();
      const messageWrapId = String(message.wrapId ?? "").trim();
      const messageClientId = String(message.clientId ?? "").trim();
      const messageId = String(message.id ?? "").trim();
      const messageOfferId =
        getLinkyBankPaymentOfferInfo(String(message.content ?? ""))?.offerId ??
        "";
      const messageOfferKey =
        messageOfferId && messageContactId
          ? `${messageContactId}:${messageOfferId}`
          : "";

      setBankPaymentOfferMessages((prev) => {
        const existingOfferMessage = messageOfferKey
          ? (prev.find((existing) => {
              const existingContactId = String(existing.contactId ?? "").trim();
              const existingOfferId = getLinkyBankPaymentOfferInfo(
                String(existing.content ?? ""),
              )?.offerId;
              return (
                `${existingContactId}:${existingOfferId ?? ""}` ===
                messageOfferKey
              );
            }) ?? null)
          : null;
        const next = prev.filter((existing) => {
          const existingContactId = String(existing.contactId ?? "").trim();
          const existingOfferId = getLinkyBankPaymentOfferInfo(
            String(existing.content ?? ""),
          )?.offerId;
          if (
            messageOfferKey &&
            `${existingContactId}:${existingOfferId ?? ""}` === messageOfferKey
          ) {
            return false;
          }

          const existingWrapId = String(existing.wrapId ?? "").trim();
          const existingClientId = String(existing.clientId ?? "").trim();
          const existingId = String(existing.id ?? "").trim();

          if (messageWrapId && existingWrapId === messageWrapId) return false;
          if (messageClientId && existingClientId === messageClientId) {
            return false;
          }
          if (messageId && existingId === messageId) return false;
          return true;
        });

        const mergedMessage = existingOfferMessage
          ? (() => {
              const existingInfo = getLinkyBankPaymentOfferInfo(
                String(existingOfferMessage.content ?? ""),
              );
              const messageInfo = getLinkyBankPaymentOfferInfo(
                String(message.content ?? ""),
              );
              const existingCreatedAt =
                Number(existingOfferMessage.createdAtSec ?? 0) || 0;
              const messageCreatedAt = Number(message.createdAtSec ?? 0) || 0;
              const existingUpdatedAt =
                existingInfo?.statusUpdatedAtSec ?? existingCreatedAt;
              const messageUpdatedAt =
                messageInfo?.statusUpdatedAtSec ?? messageCreatedAt;
              const latest =
                messageUpdatedAt > existingUpdatedAt
                  ? message
                  : messageUpdatedAt < existingUpdatedAt
                    ? existingOfferMessage
                    : messageInfo && existingInfo
                      ? getLinkyBankPaymentOfferStatusRank(
                          messageInfo.status,
                        ) >=
                        getLinkyBankPaymentOfferStatusRank(existingInfo.status)
                        ? message
                        : existingOfferMessage
                      : messageCreatedAt >= existingCreatedAt
                        ? message
                        : existingOfferMessage;

              return {
                ...existingOfferMessage,
                ...latest,
                contactId: existingOfferMessage.contactId,
                createdAtSec:
                  existingCreatedAt && messageCreatedAt
                    ? Math.min(existingCreatedAt, messageCreatedAt)
                    : existingCreatedAt || messageCreatedAt,
                direction: existingOfferMessage.direction,
                id: messageOfferKey
                  ? `bank-payment-offer:${messageOfferKey}`
                  : latest.id,
              };
            })()
          : messageOfferKey
            ? {
                ...message,
                id: `bank-payment-offer:${messageOfferKey}`,
              }
            : message;

        next.push(mergedMessage);
        next.sort((a, b) => {
          const createdA = Number(a.createdAtSec ?? 0);
          const createdB = Number(b.createdAtSec ?? 0);
          return createdA - createdB;
        });
        return next;
      });
    },
    [],
  );

  const [myProfileName, setMyProfileName] = useState<string | null>(null);
  const [myProfilePicture, setMyProfilePicture] = useState<string | null>(null);
  const [myProfileQr, setMyProfileQr] = useState<string | null>(null);
  const [myProfileLnAddress, setMyProfileLnAddress] = useState<string | null>(
    null,
  );
  const [ownedProfileLightningAddresses, setOwnedProfileLightningAddresses] =
    useState<string[]>([]);
  const [
    ownedProfileLightningAddressesLoading,
    setOwnedProfileLightningAddressesLoading,
  ] = useState(true);
  const [myProfileStatus, setMyProfileStatus] = useState<string | null>(null);
  const [myProfileMetadata, setMyProfileMetadata] =
    useState<NostrProfileMetadata | null>(null);

  const npubCashClaimInFlightRef = React.useRef(false);
  const npubCashInfoInFlightRef = React.useRef(false);
  const npubCashInfoLoadedForNpubRef = React.useRef<string | null>(null);
  const npubCashInfoLoadedAtMsRef = React.useRef<number>(0);
  const npubCashMintSyncRef = React.useRef<string | null>(null);

  const nostrInFlight = React.useRef<Set<string>>(new Set());
  const nostrMetadataInFlight = React.useRef<Set<string>>(new Set());
  const nostrStatusInFlight = React.useRef<Set<string>>(new Set());
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

  const {
    activeNostrIdentitySource,
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
    requestPasteNostrKeys,
    requestLogout,
    savePendingOnboardingBackupToPasswordManager,
    seedMnemonic,
    cyclePendingOnboardingAvatarControl,
    selectReturningSlip39Suggestion,
    slip39Seed,
    setReturningSlip39Input,
    setOnboardingStep,
    setPendingOnboardingName,
    submitReturningSlip39,
  } = useProfileAuthComposition({
    appendIdentityChangeNoticesRef,
    currentNsec,
    lang,
    pushToast,
    t,
    upsert,
  });

  const {
    cashuOwnerId,
    cashuOwnerEditsUntilRotation,
    cashuOwnerIndex,
    cashuSyncOwner,
    cashuVisibleOwnerIds,
    contactsSyncOwner,
    contactsOwnerEditCount,
    contactsOwnerEditsUntilRotation,
    contactsOwnerId,
    contactsOwnerIndex,
    contactsOwnerNewContactsCount,
    contactsOwnerPointer,
    contactsVisibleOwnerIds,
    identityOwnerId,
    identitySyncOwner,
    metaOwnerId,
    metaSyncOwner,
    messagesBackupOwnerId,
    messagesOwnerId,
    messagesOwnerEditsUntilRotation,
    messagesOwnerIndex,
    messagesSyncOwner,
    messagesVisibleOwnerIds,
    recordContactsOwnerWrite,
    recordMessagesOwnerWrite,
    recordTransactionsOwnerWrite,
    requestManualRotateCashuOwner,
    requestManualRotateContactsOwner,
    requestManualRotateMessagesOwner,
    requestManualRotateTransactionsOwner,
    rotateCashuOwnerIsBusy,
    rotateContactsOwnerIsBusy,
    rotateMessagesOwnerIsBusy,
    rotateTransactionsOwnerIsBusy,
    transactionsBackupOwnerId,
    transactionsOwnerEditsUntilRotation,
    transactionsOwnerId,
    transactionsOwnerIndex,
    transactionsOwnerPointer,
    transactionsSyncOwner,
    transactionsVisibleOwnerIds,
  } = useEvoluContactsOwnerRotation({
    appOwnerId,
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
  useOwner(transactionsSyncOwner);
  useOwner(metaSyncOwner);
  useOwner(identitySyncOwner);

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

  React.useEffect(() => {
    cashuOwnerIdRef.current = cashuOwnerId;
  }, [cashuOwnerId]);

  const resolveOwnerIdForWrite = React.useCallback(async () => {
    if (cashuOwnerIdRef.current) return cashuOwnerIdRef.current;
    if (isSeedLogin) return null;
    try {
      const owner = await evolu.appOwner;
      return owner?.id ?? null;
    } catch {
      return null;
    }
  }, [isSeedLogin]);

  React.useEffect(() => {
    messagesOwnerIdRef.current = messagesOwnerId;
  }, [messagesOwnerId]);

  React.useEffect(() => {
    transactionsOwnerIdRef.current = transactionsOwnerId;
  }, [transactionsOwnerId]);

  React.useEffect(() => {
    recordTransactionsOwnerWriteRef.current = recordTransactionsOwnerWrite;
  }, [recordTransactionsOwnerWrite]);

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

  const visibleMessageOwnerIds = React.useMemo(() => {
    const ids = [
      String(appOwnerId ?? "").trim(),
      ...messagesVisibleOwnerIds.map((ownerId) => String(ownerId ?? "").trim()),
    ].filter(Boolean);
    return Array.from(new Set(ids));
  }, [appOwnerId, messagesVisibleOwnerIds]);

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

  useTopupInvoiceQuoteEffects({
    defaultMintUrl,
    effectiveMyLightningAddress:
      myProfileLnAddress ??
      (currentNpub ? deriveDefaultLightningAddress(currentNpub) : null),
    routeKind: route.kind,
    t,
    topupAmount,
    topupInvoice,
    topupInvoiceError,
    topupInvoiceIsBusy,
    topupInvoiceCashuRequest,
    topupInvoicePaidHandledRef,
    topupInvoiceQr,
    topupInvoiceQrPayload,
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
    allowPromisesEnabled,
    allowedDisplayCurrencies,
    cashuAutoswapEnabled,
    displayCurrency,
    bankPaymentOfferRecipientCount,
    lang,
    lightningInvoiceAutoPayLimit,
    payWithCashuEnabled,
    showProfileQrOnTiltEnabled,
  });

  usePortraitOrientationLock(showProfileQrOnTiltEnabled);

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
    visibleOwnerIds: contactsVisibleOwnerIds,
  });

  const activeContactsOwnerContactCount = contactsOwnerNewContactsCount;

  const cashuTokensAllQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db.selectFrom("cashuToken").selectAll().orderBy("createdAt", "desc"),
      ),
    [],
  );
  const cashuTokensAll = useQuery(cashuTokensAllQuery);

  const nostrIdentityQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("nostrIdentity")
          .selectAll()
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("createdAt", "desc"),
      ),
    [],
  );
  const nostrIdentityRows = useQuery(nostrIdentityQuery);

  const activeIdentityOwnerId = String(identityOwnerId ?? "").trim();
  const readOwnerId = React.useCallback((row: unknown): string => {
    if (typeof row !== "object" || row === null) return "";
    if (!("ownerId" in row)) return "";
    const ownerId = row.ownerId;
    return typeof ownerId === "string" ? ownerId.trim() : "";
  }, []);
  const readIdentityText = React.useCallback(
    (row: unknown, key: "nsec" | "npub" | "source"): string => {
      if (typeof row !== "object" || row === null) return "";
      const value = Reflect.get(row, key);
      return typeof value === "string" ? value.trim() : "";
    },
    [],
  );
  const readIdentitySwitchedAtSec = React.useCallback((row: unknown) => {
    if (typeof row !== "object" || row === null) return null;
    const value = Number(Reflect.get(row, "switchedAtSec"));
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.trunc(value);
  }, []);

  const activeSyncedNostrIdentity = React.useMemo(() => {
    if (!activeIdentityOwnerId) return null;

    const row = nostrIdentityRows.find(
      (candidate) => readOwnerId(candidate) === activeIdentityOwnerId,
    );
    if (!row) return null;

    const nsec = readIdentityText(row, "nsec");
    if (!nsec) return null;

    const source: "custom" | "derived" =
      readIdentityText(row, "source") === "custom" ? "custom" : "derived";

    return {
      nsec,
      npub: readIdentityText(row, "npub") || null,
      source,
      switchedAtSec: readIdentitySwitchedAtSec(row),
    };
  }, [
    activeIdentityOwnerId,
    nostrIdentityRows,
    readIdentitySwitchedAtSec,
    readIdentityText,
    readOwnerId,
  ]);

  React.useEffect(() => {
    if (!activeSyncedNostrIdentity) return;

    const localSource = getInitialNostrIdentitySource();
    const localSwitchedAtSec = getInitialNostrIdentitySwitchedAtSec();
    const localNsec = String(currentNsec ?? "").trim();
    const syncedSwitchedAtSec = activeSyncedNostrIdentity.switchedAtSec;
    const switchedAtMatches =
      localSwitchedAtSec === syncedSwitchedAtSec ||
      (!localSwitchedAtSec && !syncedSwitchedAtSec);
    const alreadyApplied =
      localNsec === activeSyncedNostrIdentity.nsec &&
      localSource === activeSyncedNostrIdentity.source &&
      switchedAtMatches;

    if (alreadyApplied) return;

    void persistSyncedActiveNostrIdentity({
      identitySource: activeSyncedNostrIdentity.source,
      nsec: activeSyncedNostrIdentity.nsec,
      switchedAtSec: activeSyncedNostrIdentity.switchedAtSec,
    }).then(() => {
      setCurrentNsec((current) =>
        current === activeSyncedNostrIdentity.nsec
          ? current
          : activeSyncedNostrIdentity.nsec,
      );
      globalThis.location.reload();
    });
  }, [activeSyncedNostrIdentity, currentNsec]);

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

  const cashuTokensFiltered = React.useMemo(() => {
    return dedupeVisibleCashuRows(cashuTokensAll).filter(
      (row) => !row.isDeleted,
    );
  }, [cashuTokensAll, dedupeVisibleCashuRows]);

  const cashuTokensAllFiltered = React.useMemo(() => {
    return dedupeVisibleCashuRows(cashuTokensAll);
  }, [cashuTokensAll, dedupeVisibleCashuRows]);

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
    knownNostrMessageIdentityIndex,
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
  }, [appendLocalNostrMessage, lastMessageByContactId]);

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

  const defaultLightningAddress = useMemo(() => {
    if (!currentNpub) return null;
    return deriveDefaultLightningAddress(currentNpub);
  }, [currentNpub]);

  const derivedProfile = useMemo(() => {
    if (!currentNpub) return null;
    return deriveDefaultProfile(currentNpub, lang);
  }, [currentNpub, lang]);

  const effectiveProfileName = myProfileName ?? derivedProfile?.name ?? null;
  const effectiveProfilePicture =
    myProfilePicture ?? derivedProfile?.pictureUrl ?? null;

  const effectiveMyLightningAddress =
    myProfileLnAddress ?? defaultLightningAddress;

  const npubCashServerBaseUrl = useMemo(() => {
    return resolveNpubCashServerBaseUrl(effectiveMyLightningAddress);
  }, [effectiveMyLightningAddress]);

  const profileClaimLightningAddressServerBaseUrl = useMemo(() => {
    return resolveNpubCashServerBaseUrl(
      `claim@${DEFAULT_LIGHTNING_ADDRESS_DOMAIN}`,
    );
  }, []);

  const {
    cycleProfileAvatarControl,
    isProfileEditing,
    onPickProfilePhoto,
    onProfilePhotoSelected,
    profileCustomPictureUrl,
    profileEditInitialRef,
    profileEditLnAddress,
    profileEditName,
    profileEditPicture,
    profileEditStatus,
    profileEditsSavable,
    profilePhotoInputRef,
    profileSelectedPictureKind,
    saveClaimedLightningAddress,
    saveProfileEdits,
    setIsProfileEditing,
    setProfileEditLnAddress,
    setProfileEditName,
    setProfileEditStatus,
    toggleProfileEditing,
  } = useProfileEditor({
    currentNpub,
    currentNsec,
    effectiveMyLightningAddress,
    effectiveProfileName,
    effectiveProfilePicture,
    myProfileMetadata,
    myProfileStatus,
    nostrFetchRelays,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
    setMyProfileStatus,
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
    currentNpub,
    currentNsec,
    enqueueCashuOp,
    ensureCashuTokenPersisted,
    formatDisplayedAmountParts,
    upsert,
    isMintDeleted,
    logPaymentEvent,
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

  useProfileMetadataSyncEffect({
    currentNpub,
    nostrFetchRelays,
    rememberBlobAvatarUrl,
    setMyProfileLnAddress,
    setMyProfileMetadata,
    setMyProfileName,
    setMyProfilePicture,
  });

  useProfileStatusSyncEffect({
    currentNpub,
    nostrFetchRelays,
    setMyProfileStatus,
  });

  const {
    profileStatusCurrencies,
    profileStatusIsSaving,
    selectedProfileStatusCurrencies,
    toggleProfileStatusCurrency,
  } = useProfileStatusEditor({
    currentNpub,
    currentNsec,
    myProfileStatus,
    nostrFetchRelays,
    setMyProfileStatus,
    setStatus,
    t,
  });

  useProfileNpubCashEffects({
    claimNpubCashOnce,
    claimNpubCashOnceLatestRef,
    currentNpub,
    currentNsec,
    hasMintOverrideRef,
    makeNip98AuthHeader,
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

  React.useEffect(() => {
    if (route.kind !== "profileEdit") {
      return;
    }

    if (!isProfileEditing) {
      toggleProfileEditing();
    }
  }, [isProfileEditing, route.kind, toggleProfileEditing]);

  // Intentionally no automatic publishing of kind-0 profile metadata.
  // We only publish profile changes when the user does so explicitly.

  useContactsNostrPrefetchEffects({
    appOwnerId: contactsOwnerId,
    contacts,
    nostrFetchRelays,
    nostrInFlight,
    nostrMetadataInFlight,
    nostrStatusByNpub,
    nostrStatusInFlight,
    rememberBlobAvatarUrl,
    routeKind: route.kind,
    setNostrPictureByNpub,
    setNostrStatusByNpub,
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
  });

  const { commitMainSwipe, handleMainSwipeScroll } = useMainSwipeNavigation({
    isMainSwipeRoute,
    mainSwipeProgressRef,
    mainSwipeRef,
    mainSwipeScrollTimerRef,
    routeKind: route.kind,
    setIsMainSwipeDragging,
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
      const ownPubkey = normalizePubkeyHex(chatOwnPubkeyHex);
      if (unknownPubkeyHex && ownPubkey && unknownPubkeyHex === ownPubkey) {
        continue;
      }

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

  React.useEffect(() => {
    for (const unknownContact of unknownContacts) {
      const unknownContactId = String(unknownContact.id ?? "").trim();
      const unknownNpub = normalizeNpubIdentifier(unknownContact.npub);
      if (!unknownContactId || !unknownNpub) continue;

      const knownContact = contacts.find((contact) => {
        const knownContactId = String(contact.id ?? "").trim();
        if (!knownContactId || knownContactId === unknownContactId) {
          return false;
        }
        return normalizeNpubIdentifier(contact.npub) === unknownNpub;
      });

      const knownContactId = String(knownContact?.id ?? "").trim();
      if (!knownContactId) continue;

      reassignLocalNostrMessagesContactId(unknownContactId, knownContactId);
      setContactAttentionById((prev) => {
        if (prev[unknownContactId] === undefined) return prev;
        const next = { ...prev };
        delete next[unknownContactId];
        return next;
      });
    }
  }, [
    contacts,
    reassignLocalNostrMessagesContactId,
    setContactAttentionById,
    unknownContacts,
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

  const chatMentionedNpubs = React.useMemo(() => {
    const seen = new Set<string>();
    const npubs: string[] = [];

    for (const message of chatMessages) {
      for (const npub of extractMentionedNpubs(String(message.content ?? ""))) {
        if (seen.has(npub)) continue;
        seen.add(npub);
        npubs.push(npub);
      }
    }

    return npubs;
  }, [chatMessages]);

  const prefetchedMessageNpubs = React.useMemo(() => {
    const seen = new Set<string>();
    const npubs: string[] = [];

    for (const npub of unknownContactNpubs) {
      if (seen.has(npub)) continue;
      seen.add(npub);
      npubs.push(npub);
    }

    for (const npub of chatMentionedNpubs) {
      if (seen.has(npub)) continue;
      seen.add(npub);
      npubs.push(npub);
    }

    return npubs;
  }, [chatMentionedNpubs, unknownContactNpubs]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const npub of prefetchedMessageNpubs) {
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
    prefetchedMessageNpubs,
    unknownNameByNpub,
  ]);

  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      for (const npub of prefetchedMessageNpubs) {
        const cached = loadCachedProfilePicture(npub);
        const shouldRefreshCachedPicture = isCachedProfilePictureStale(cached);

        if (cached) {
          setNostrPictureByNpub((prev) =>
            prev[npub] === cached.url ? prev : { ...prev, [npub]: cached.url },
          );
        }

        try {
          const blobUrl = await loadCachedProfileAvatarObjectUrl(npub);
          if (cancelled) return;
          if (blobUrl) {
            setNostrPictureByNpub((prev) => ({
              ...prev,
              [npub]: rememberBlobAvatarUrl(npub, blobUrl),
            }));
            if (!shouldRefreshCachedPicture) continue;
          }
        } catch {
          // ignore
        }

        if (cached && !shouldRefreshCachedPicture) continue;

        if (nostrInFlight.current.has(npub)) continue;
        nostrInFlight.current.add(npub);

        try {
          if (cached && shouldRefreshCachedPicture) {
            const metadata = await fetchNostrProfileMetadata(npub, {
              signal: controller.signal,
              relays: nostrFetchRelays,
            });
            if (cancelled) return;
            if (!metadata) continue;

            saveCachedProfileMetadata(npub, metadata);
            const refreshedUrl = getNostrProfilePictureUrl(metadata);
            if (refreshedUrl) {
              saveCachedProfilePicture(npub, refreshedUrl);
              const blobUrl = await cacheProfileAvatarFromUrl(
                npub,
                refreshedUrl,
                {
                  signal: controller.signal,
                },
              );
              if (cancelled) return;
              setNostrPictureByNpub((prev) => ({
                ...prev,
                [npub]: rememberBlobAvatarUrl(npub, blobUrl || refreshedUrl),
              }));
            } else {
              saveCachedProfilePicture(npub, null);
              void deleteCachedProfileAvatar(npub);
              rememberBlobAvatarUrl(npub, null);
              setNostrPictureByNpub((prev) => ({
                ...prev,
                [npub]: null,
              }));
            }
          } else {
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
                if (typeof existing === "string" && existing.trim())
                  return prev;
                if (existing === null) return prev;
                return { ...prev, [npub]: null };
              });
            }
          }
        } catch {
          if (cancelled) return;
          if (!cached) {
            saveCachedProfilePicture(npub, null);
            setNostrPictureByNpub((prev) => {
              const existing = prev[npub];
              if (typeof existing === "string" && existing.trim()) return prev;
              if (existing === null) return prev;
              return { ...prev, [npub]: null };
            });
          }
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
    prefetchedMessageNpubs,
    rememberBlobAvatarUrl,
    setNostrPictureByNpub,
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

  const displayContactById = React.useMemo(() => {
    const byId = new Map<string, DisplayContact>();
    for (const contact of displayContacts) {
      const id = String(contact.id ?? "").trim();
      if (!id) continue;
      byId.set(id, contact);
    }
    return byId;
  }, [displayContacts]);

  const displayContactsSearchData = React.useMemo(() => {
    return displayContacts.map((contact) => {
      const idKey = String(contact.id ?? "").trim();
      const groupName = String(contact.groupName ?? "").trim();
      const normalizedNpub = normalizeNpubIdentifier(contact.npub);
      const statusFilterValues = normalizedNpub
        ? extractStatusFilterCurrencies(nostrStatusByNpub[normalizedNpub])
        : [];
      const haystack = [
        contact.name,
        contact.npub,
        contact.lnAddress,
        contact.groupName,
        contact.unknownPubkeyHex,
        ...statusFilterValues,
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
        statusFilterValues,
      };
    });
  }, [displayContacts, nostrStatusByNpub]);

  const statusFilterCurrencies = React.useMemo(() => {
    const uniqueCurrencies = new Set<string>();

    for (const contact of displayContacts) {
      const normalizedNpub = normalizeNpubIdentifier(contact.npub);
      if (!normalizedNpub) continue;

      for (const currency of extractStatusFilterCurrencies(
        nostrStatusByNpub[normalizedNpub],
      )) {
        uniqueCurrencies.add(currency);
      }
    }

    return [...uniqueCurrencies].sort((left, right) => {
      const leftKnownIndex = PROFILE_STATUS_CURRENCIES.indexOf(
        left as (typeof PROFILE_STATUS_CURRENCIES)[number],
      );
      const rightKnownIndex = PROFILE_STATUS_CURRENCIES.indexOf(
        right as (typeof PROFILE_STATUS_CURRENCIES)[number],
      );

      if (leftKnownIndex >= 0 && rightKnownIndex >= 0) {
        return leftKnownIndex - rightKnownIndex;
      }
      if (leftKnownIndex >= 0) return -1;
      if (rightKnownIndex >= 0) return 1;
      return left.localeCompare(right);
    });
  }, [displayContacts, nostrStatusByNpub]);

  React.useEffect(() => {
    if (activeGroup === ARCHIVED_CONTACTS_FILTER) return;
    if (!isStatusFilterValue(activeGroup)) return;

    const selectedCurrency = parseStatusFilterValue(activeGroup);
    if (!selectedCurrency) {
      setActiveGroup(null);
      return;
    }

    if (!statusFilterCurrencies.includes(selectedCurrency)) {
      setActiveGroup(null);
    }
  }, [activeGroup, setActiveGroup, statusFilterCurrencies]);

  const visibleContacts = useVisibleContacts<DisplayContact>({
    activeGroup,
    contactAttentionById,
    contactNameCollator,
    contactsSearchData: displayContactsSearchData,
    contactsSearchParts,
    lastMessageByContactId,
    noGroupFilterValue: NO_GROUP_FILTER,
  });
  const bankPaymentOfferContacts = React.useMemo(() => {
    const sortedContacts = [
      ...visibleContacts.conversations,
      ...visibleContacts.others,
    ];
    return sortedContacts
      .filter((contact) => {
        const normalizedNpub = normalizeNpubIdentifier(contact.npub);
        if (!normalizedNpub) return false;

        return extractStatusFilterCurrencies(
          nostrStatusByNpub[normalizedNpub],
        ).includes(LINKY_BANK_PAYMENT_OFFER_RECIPIENT_STATUS_CURRENCY);
      })
      .slice(0, bankPaymentOfferRecipientCount);
  }, [
    bankPaymentOfferRecipientCount,
    nostrStatusByNpub,
    visibleContacts.conversations,
    visibleContacts.others,
  ]);

  const {
    autofillNewContactFromIdentifier,
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
    activeOwnerContactsCount: activeContactsOwnerContactCount,
    appOwnerId: contactsOwnerId,
    contactNewPrefill,
    contacts,
    currentNpub,
    insert,
    nostrFetchRelays,
    recordTransactionsOwnerWrite,
    route,
    selectedContact,
    setContactNewPrefill,
    setPendingDeleteId,
    recordContactsOwnerWrite,
    setStatus,
    t,
    transactionsOwnerId,
    update,
    upsert,
  });

  const closeContactDetail = () => {
    clearContactForm();
    setPendingDeleteId(null);
    navigateTo({ route: "contacts" });
  };

  const openNewContactPage = React.useCallback(() => {
    if (activeContactsOwnerContactCount >= MAX_CONTACTS_PER_OWNER) {
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
    activeContactsOwnerContactCount,
    clearContactForm,
    contactNewPrefill,
    pushToast,
    setContactNewPrefill,
    setForm,
    t,
  ]);

  const canAddContact =
    activeContactsOwnerContactCount < MAX_CONTACTS_PER_OWNER;

  const { closeMenu, menuIsOpen, navigateToMainReturn, toggleMenu } =
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
      );
    },
    [],
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

  const requestBankPaymentOffer = React.useCallback(
    async (args: {
      amountSat?: unknown;
      amountText: string;
      contacts: readonly { id?: unknown; name?: unknown; npub?: unknown }[];
      spdPayload?: unknown;
    }): Promise<boolean> => {
      const amountSatRaw = Number(args.amountSat ?? 0);
      const amountSat =
        Number.isFinite(amountSatRaw) && amountSatRaw > 0
          ? Math.round(amountSatRaw)
          : null;
      const amountText = String(args.amountText ?? "").trim();
      const spdPayload = String(args.spdPayload ?? "").trim();
      if (!amountText) {
        setStatus(t("spdPaymentOfferMissingAmount"));
        return false;
      }
      if (args.contacts.length === 0) {
        setStatus(t("spdPaymentOfferFailed"));
        return false;
      }
      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return false;
      }

      try {
        const { getPublicKey } = await import("nostr-tools");
        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          throw new Error("invalid nsec");
        }
        const privBytes = decodedMe.data;
        const myPubHex = getPublicKey(privBytes);

        const recipients: {
          contactId: string;
          contactPubHex: string;
        }[] = [];
        for (const contact of args.contacts) {
          const contactId = String(contact.id ?? "").trim();
          const contactNpub = normalizeNpubIdentifier(contact.npub);
          if (!contactId || !contactNpub) continue;

          const decodedContact = nip19.decode(contactNpub);
          if (
            decodedContact.type !== "npub" ||
            typeof decodedContact.data !== "string"
          ) {
            continue;
          }
          const contactPubHex = decodedContact.data.trim();
          if (!contactPubHex) continue;
          recipients.push({ contactId, contactPubHex });
        }

        if (recipients.length === 0) {
          setStatus(t("chatMissingContactNpub"));
          return false;
        }

        const offerId = makeLocalId();
        if (spdPayload) {
          bankPaymentOfferSpdPayloadByOfferIdRef.current.set(
            offerId,
            spdPayload,
          );
        }

        const pool = await getSharedAppNostrPool();
        let sentCount = 0;

        for (const recipient of recipients) {
          const clientId = makeLocalId();
          const baseEvent = createLinkyBankPaymentOfferEvent({
            amountSat,
            amountText,
            clientId,
            createdAt: Math.ceil(Date.now() / 1e3),
            offerId,
            offererPublicKey: myPubHex,
            recipientPublicKey: recipient.contactPubHex,
            senderPublicKey: myPubHex,
            status: "offered",
          });

          const wrapForMe = wrapEventWithoutPushMarker(
            baseEvent,
            privBytes,
            myPubHex,
          );
          const wrapForContact = wrapEventWithPushMarker(
            baseEvent,
            privBytes,
            recipient.contactPubHex,
          );

          const publishOutcome = await publishWrappedWithRetry(
            pool,
            NOSTR_RELAYS,
            wrapForMe,
            wrapForContact,
          );

          if (!publishOutcome.anySuccess) continue;
          sentCount += 1;

          const messageWrapId =
            String(wrapForMe.id ?? "").trim() ||
            String(wrapForContact.id ?? "").trim() ||
            `bank-payment-offer:${clientId}`;
          upsertBankPaymentOfferMessage({
            clientId,
            contactId: recipient.contactId,
            content: baseEvent.content,
            createdAtSec: baseEvent.created_at,
            direction: "out",
            id: `bank-payment-offer:${recipient.contactId}:${offerId}`,
            localOnly: true,
            pubkey: myPubHex,
            rumorId: null,
            status: "sent",
            wrapId: messageWrapId,
          });
        }

        if (sentCount === 0) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        return true;
      } catch (error) {
        setStatus(
          `${t("errorPrefix")}: ${getUnknownErrorMessage(error, "publish failed")}`,
        );
        return false;
      }
    },
    [
      currentNsec,
      publishWrappedWithRetry,
      setStatus,
      t,
      upsertBankPaymentOfferMessage,
    ],
  );

  const respondToBankPaymentOffer = React.useCallback(
    async (
      message: LocalNostrMessage,
      nextStatus: Exclude<LinkyBankPaymentOfferStatus, "offered">,
      options?: { spdPayload?: string | null },
    ): Promise<boolean> => {
      const offerInfo = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      );
      if (!offerInfo) {
        setStatus(t("spdPaymentOfferFailed"));
        return false;
      }
      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return false;
      }

      try {
        const { getPublicKey } = await import("nostr-tools");
        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          throw new Error("invalid nsec");
        }
        const privBytes = decodedMe.data;
        const myPubHex = getPublicKey(privBytes);
        const messageDirection = String(message.direction ?? "").trim();
        const offererPublicKey =
          String(offerInfo.offererPublicKey ?? "").trim() ||
          (messageDirection === "out"
            ? myPubHex
            : String(message.pubkey ?? "").trim());

        if (!offererPublicKey) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const messageContactId = String(message.contactId ?? "").trim();
        const messageContact =
          contacts.find(
            (contact) => String(contact.id ?? "").trim() === messageContactId,
          ) ?? null;
        const contactNpub = normalizeNpubIdentifier(messageContact?.npub);
        let contactPubkey: string | null = null;
        if (contactNpub) {
          const decodedContact = nip19.decode(contactNpub);
          if (
            decodedContact.type === "npub" &&
            typeof decodedContact.data === "string"
          ) {
            contactPubkey = decodedContact.data.trim() || null;
          }
        }

        const messagePubkey = String(message.pubkey ?? "").trim();
        const recipientPublicKey =
          offererPublicKey === myPubHex
            ? (contactPubkey ??
              (messagePubkey !== myPubHex ? messagePubkey : ""))
            : offererPublicKey;
        if (!recipientPublicKey || recipientPublicKey === myPubHex) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const clientId = makeLocalId();
        const baseEvent = createLinkyBankPaymentOfferEvent({
          amountSat: offerInfo.amountSat,
          amountText: offerInfo.amountText,
          clientId,
          createdAt: Math.ceil(Date.now() / 1e3),
          offerId: offerInfo.offerId,
          offererPublicKey,
          recipientPublicKey,
          senderPublicKey: myPubHex,
          spdPayload: options?.spdPayload ?? offerInfo.spdPayload,
          status: nextStatus,
        });

        const wrapForMe = wrapEventWithoutPushMarker(
          baseEvent,
          privBytes,
          myPubHex,
        );
        const wrapForContact = wrapEventWithPushMarker(
          baseEvent,
          privBytes,
          recipientPublicKey,
        );

        const pool = await getSharedAppNostrPool();
        const publishOutcome = await publishWrappedWithRetry(
          pool,
          NOSTR_RELAYS,
          wrapForMe,
          wrapForContact,
        );

        if (!publishOutcome.anySuccess) {
          setStatus(t("spdPaymentOfferFailed"));
          return false;
        }

        const messageWrapId =
          String(wrapForMe.id ?? "").trim() ||
          String(wrapForContact.id ?? "").trim() ||
          `bank-payment-offer:${clientId}`;
        upsertBankPaymentOfferMessage({
          clientId,
          contactId: String(message.contactId ?? "").trim(),
          content: baseEvent.content,
          createdAtSec: baseEvent.created_at,
          direction: offererPublicKey === myPubHex ? "out" : "in",
          id: `bank-payment-offer:${offerInfo.offerId}`,
          localOnly: true,
          pubkey: offererPublicKey === myPubHex ? myPubHex : offererPublicKey,
          rumorId: null,
          status: "sent",
          wrapId: messageWrapId,
        });

        return true;
      } catch (error) {
        setStatus(
          `${t("errorPrefix")}: ${getUnknownErrorMessage(error, "publish failed")}`,
        );
        return false;
      }
    },
    [
      currentNsec,
      contacts,
      publishWrappedWithRetry,
      setStatus,
      t,
      upsertBankPaymentOfferMessage,
    ],
  );

  const getBankPaymentOfferGroupMessages = React.useCallback(
    (message: LocalNostrMessage): LocalNostrMessage[] => {
      const offerInfo = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      );
      if (!offerInfo) return [message];

      const group = bankPaymentOfferMessages.filter((candidate) => {
        const candidateInfo = getLinkyBankPaymentOfferInfo(
          String(candidate.content ?? ""),
        );
        return candidateInfo?.offerId === offerInfo.offerId;
      });

      if (
        !group.some(
          (candidate) =>
            String(candidate.contactId ?? "").trim() ===
            String(message.contactId ?? "").trim(),
        )
      ) {
        group.push(message);
      }

      return group;
    },
    [bankPaymentOfferMessages],
  );

  const isBankPaymentOfferCanceled = React.useCallback(
    (offerId: string): boolean => {
      const normalizedOfferId = String(offerId ?? "").trim();
      if (!normalizedOfferId) return false;

      return bankPaymentOfferMessages.some((message) => {
        const info = getLinkyBankPaymentOfferInfo(
          String(message.content ?? ""),
        );
        return (
          info?.offerId === normalizedOfferId && info.status === "canceled"
        );
      });
    },
    [bankPaymentOfferMessages],
  );

  const respondToBankPaymentOfferWithGroupState = React.useCallback(
    async (
      message: LocalNostrMessage,
      nextStatus: Exclude<LinkyBankPaymentOfferStatus, "offered">,
      options?: { spdPayload?: string | null },
    ): Promise<boolean> => {
      if (nextStatus !== "canceled" && nextStatus !== "settled") {
        return await respondToBankPaymentOffer(message, nextStatus, options);
      }

      const group = getBankPaymentOfferGroupMessages(message);
      let sentAny = false;

      for (const groupMessage of group) {
        const info = getLinkyBankPaymentOfferInfo(
          String(groupMessage.content ?? ""),
        );
        if (!info) continue;
        if (info.status === nextStatus) {
          sentAny = true;
          continue;
        }
        if (nextStatus === "canceled" && info.status === "settled") continue;

        const sent = await respondToBankPaymentOffer(
          groupMessage,
          nextStatus,
          options,
        );
        sentAny = sentAny || sent;
      }

      return sentAny;
    },
    [getBankPaymentOfferGroupMessages, respondToBankPaymentOffer],
  );

  React.useEffect(() => {
    if (!currentNsec) return;
    if (bankPaymentOfferMessages.length === 0) return;

    let cancelled = false;

    const run = async () => {
      try {
        const { getPublicKey } = await import("nostr-tools");
        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          return;
        }

        const myPubHex = getPublicKey(decodedMe.data);
        const groups = new Map<
          string,
          {
            info: ReturnType<typeof getLinkyBankPaymentOfferInfo>;
            message: LocalNostrMessage;
          }[]
        >();

        for (const message of bankPaymentOfferMessages) {
          const info = getLinkyBankPaymentOfferInfo(
            String(message.content ?? ""),
          );
          if (!info) continue;
          if (String(info.offererPublicKey ?? "").trim() !== myPubHex) {
            continue;
          }

          const group = groups.get(info.offerId) ?? [];
          group.push({ info, message });
          groups.set(info.offerId, group);
        }

        for (const [offerId, group] of groups) {
          if (cancelled) return;

          const hasActiveBankDetails = group.some(
            (entry) =>
              entry.info?.status === "bank_details_sent" ||
              entry.info?.status === "bank_paid",
          );
          if (hasActiveBankDetails) continue;

          const accepted = group
            .filter((entry) => entry.info?.status === "accepted")
            .sort((a, b) => {
              const aSec =
                a.info?.statusUpdatedAtSec ??
                Number(a.message.createdAtSec ?? 0);
              const bSec =
                b.info?.statusUpdatedAtSec ??
                Number(b.message.createdAtSec ?? 0);
              if (aSec !== bSec) return aSec - bSec;
              return String(a.message.contactId ?? "").localeCompare(
                String(b.message.contactId ?? ""),
              );
            });

          const candidate = accepted[0] ?? null;
          if (!candidate?.info) continue;

          const spdPayload =
            bankPaymentOfferSpdPayloadByOfferIdRef.current.get(offerId) ?? "";
          if (!spdPayload) continue;

          const candidateKey = `${offerId}:${String(candidate.message.contactId ?? "").trim()}`;
          if (autoSentBankDetailsOfferIdsRef.current.has(candidateKey)) {
            continue;
          }

          autoSentBankDetailsOfferIdsRef.current.add(candidateKey);
          const sent = await respondToBankPaymentOffer(
            candidate.message,
            "bank_details_sent",
            { spdPayload },
          );
          if (!sent) {
            autoSentBankDetailsOfferIdsRef.current.delete(candidateKey);
          }
        }
      } catch {
        // Best effort; the sender can retry when the accepted event reappears.
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [bankPaymentOfferMessages, currentNsec, respondToBankPaymentOffer]);

  React.useEffect(() => {
    if (!currentNsec) return;
    if (bankPaymentOfferMessages.length === 0) return;

    let cancelled = false;

    const tick = async () => {
      if (bankPaymentOfferExpiryInFlightRef.current) return;

      bankPaymentOfferExpiryInFlightRef.current = true;
      try {
        const { getPublicKey } = await import("nostr-tools");
        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          return;
        }

        const myPubHex = getPublicKey(decodedMe.data);
        const nowSec = Math.floor(Date.now() / 1e3);
        const groups = new Map<
          string,
          {
            info: NonNullable<ReturnType<typeof getLinkyBankPaymentOfferInfo>>;
            message: LocalNostrMessage;
          }[]
        >();

        for (const message of bankPaymentOfferMessages) {
          const info = getLinkyBankPaymentOfferInfo(
            String(message.content ?? ""),
          );
          if (!info) continue;
          if (String(info.offererPublicKey ?? "").trim() !== myPubHex) {
            continue;
          }
          if (isLinkyBankPaymentOfferTerminalStatus(info.status)) continue;

          const group = groups.get(info.offerId) ?? [];
          group.push({ info, message });
          groups.set(info.offerId, group);
        }

        const statusPriority: LinkyBankPaymentOfferStatus[] = [
          "bank_paid",
          "bank_details_sent",
          "accepted",
          "offered",
        ];

        for (const group of groups.values()) {
          if (cancelled) return;

          const activeStatus = statusPriority.find((status) =>
            group.some((entry) => entry.info.status === status),
          );
          if (!activeStatus) continue;

          const phaseEntries = group.filter(
            (entry) => entry.info.status === activeStatus,
          );
          const phaseStartedAtSec = Math.min(
            ...phaseEntries.map(
              (entry) =>
                entry.info.statusUpdatedAtSec ||
                Number(entry.message.createdAtSec ?? 0) ||
                nowSec,
            ),
          );
          if (
            nowSec - phaseStartedAtSec <
            LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC
          ) {
            continue;
          }

          for (const entry of group) {
            if (cancelled) return;
            await respondToBankPaymentOffer(entry.message, "canceled");
          }
        }
      } finally {
        bankPaymentOfferExpiryInFlightRef.current = false;
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, 1_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [bankPaymentOfferMessages, currentNsec, respondToBankPaymentOffer]);

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
    contactsOnboardingHasPaid,
    contactsOnboardingHasSentMessage,
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

  const [walletWarningDismissed, setWalletWarningDismissed] =
    React.useState(false);

  const walletWarningApplies =
    cashuBalance > WALLET_WARNING_BALANCE_THRESHOLD_SAT;

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

  const handleDelete = (id: ContactId) => {
    const normalizedContactId = String(id ?? "").trim();
    const contactToArchive =
      contacts.find(
        (contact) => String(contact.id ?? "").trim() === normalizedContactId,
      ) ?? null;
    const archivedContactNpub = normalizeNpubIdentifier(contactToArchive?.npub);
    let unknownThreadContactId: string | null = null;
    if (archivedContactNpub) {
      try {
        const decodedContact = nip19.decode(archivedContactNpub);
        if (
          decodedContact.type === "npub" &&
          typeof decodedContact.data === "string"
        ) {
          unknownThreadContactId = buildUnknownContactId(decodedContact.data);
        }
      } catch {
        unknownThreadContactId = null;
      }
    }

    const archivedAtSec = Math.ceil(Date.now() / 1e3);
    const archivePayload = contactToArchive
      ? {
          id,
          archivedAtSec: archivedAtSec as typeof Evolu.PositiveInt.Type,
          name: String(contactToArchive.name ?? "").trim()
            ? (String(
                contactToArchive.name ?? "",
              ).trim() as typeof Evolu.NonEmptyString1000.Type)
            : null,
          npub: String(contactToArchive.npub ?? "").trim()
            ? (String(
                contactToArchive.npub ?? "",
              ).trim() as typeof Evolu.NonEmptyString1000.Type)
            : null,
          lnAddress: String(contactToArchive.lnAddress ?? "").trim()
            ? (String(
                contactToArchive.lnAddress ?? "",
              ).trim() as typeof Evolu.NonEmptyString1000.Type)
            : null,
          groupName: String(contactToArchive.groupName ?? "").trim()
            ? (String(
                contactToArchive.groupName ?? "",
              ).trim() as typeof Evolu.NonEmptyString1000.Type)
            : null,
        }
      : null;

    const result = contactsOwnerId
      ? (() => {
          if (archivePayload) {
            const scopedUpsert = upsert("contact", archivePayload, {
              ownerId: contactsOwnerId,
            });
            if (scopedUpsert.ok) return scopedUpsert;
          }
          const scoped = update(
            "contact",
            { id, archivedAtSec },
            { ownerId: contactsOwnerId },
          );
          if (scoped.ok) return scoped;
          return update("contact", { id, archivedAtSec });
        })()
      : update("contact", { id, archivedAtSec });
    if (result.ok) {
      if (
        unknownThreadContactId &&
        unknownThreadContactId !== normalizedContactId
      ) {
        reassignLocalNostrMessagesContactId(
          unknownThreadContactId,
          normalizedContactId,
        );
        clearContactAttention(unknownThreadContactId);
      }
      recordContactsOwnerWrite();
      setStatus(t("contactArchived"));
      closeContactDetail();
      return;
    }
    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  };

  const restoreArchivedContact = React.useCallback(
    (id: ContactId) => {
      const contactToRestore =
        contacts.find((contact) => contact.id === id) ?? null;
      const restorePayload = contactToRestore
        ? {
            id,
            archivedAtSec: null,
            name: String(contactToRestore.name ?? "").trim()
              ? (String(
                  contactToRestore.name ?? "",
                ).trim() as typeof Evolu.NonEmptyString1000.Type)
              : null,
            npub: String(contactToRestore.npub ?? "").trim()
              ? (String(
                  contactToRestore.npub ?? "",
                ).trim() as typeof Evolu.NonEmptyString1000.Type)
              : null,
            lnAddress: String(contactToRestore.lnAddress ?? "").trim()
              ? (String(
                  contactToRestore.lnAddress ?? "",
                ).trim() as typeof Evolu.NonEmptyString1000.Type)
              : null,
            groupName: String(contactToRestore.groupName ?? "").trim()
              ? (String(
                  contactToRestore.groupName ?? "",
                ).trim() as typeof Evolu.NonEmptyString1000.Type)
              : null,
          }
        : null;

      const result = contactsOwnerId
        ? (() => {
            if (restorePayload) {
              const scopedUpsert = upsert("contact", restorePayload, {
                ownerId: contactsOwnerId,
              });
              if (scopedUpsert.ok) return scopedUpsert;
            }
            const scoped = update(
              "contact",
              { id, archivedAtSec: null },
              { ownerId: contactsOwnerId },
            );
            if (scoped.ok) return scoped;
            return update("contact", { id, archivedAtSec: null });
          })()
        : update("contact", { id, archivedAtSec: null });

      if (result.ok) {
        recordContactsOwnerWrite();
        setStatus(t("contactRestored"));
        closeContactDetail();
        return;
      }

      setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
    },
    [
      closeContactDetail,
      contacts,
      contactsOwnerId,
      recordContactsOwnerWrite,
      setStatus,
      t,
      update,
      upsert,
    ],
  );

  const blockPubkeyAndPublishMuteList = React.useCallback(
    async (pubkeyHex: string): Promise<boolean> => {
      const normalizedPubkey = normalizePubkeyHex(pubkeyHex);
      if (!normalizedPubkey) return false;

      const mergedBlockedPubkeys = Array.from(
        new Set(
          safeLocalStorageGetJson(BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY, [])
            .map((entry) => normalizePubkeyHex(entry))
            .filter((entry): entry is string => Boolean(entry))
            .concat(normalizedPubkey),
        ),
      );

      safeLocalStorageSetJson(
        BLOCKED_NOSTR_PUBKEYS_STORAGE_KEY,
        mergedBlockedPubkeys,
      );

      if (!currentNsec) return true;

      try {
        const { finalizeEvent, getPublicKey } = await import("nostr-tools");

        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        ) {
          return true;
        }

        const relays = Array.from(
          new Set(
            nostrFetchRelays
              .map((relay) => String(relay ?? "").trim())
              .filter(Boolean),
          ),
        );
        if (relays.length === 0) return true;

        const privBytes = decodedMe.data;
        const pubkey = getPublicKey(privBytes);
        const baseEvent = {
          kind: 10000,
          created_at: Math.ceil(Date.now() / 1e3),
          tags: mergedBlockedPubkeys.map((blockedPubkey) => [
            "p",
            blockedPubkey,
          ]),
          content: "",
          pubkey,
        } satisfies UnsignedEvent;

        const signed = finalizeEvent(baseEvent, privBytes);
        const pool = await getSharedAppNostrPool();
        void Promise.allSettled(pool.publish(relays, signed));
      } catch {
        // Local blocklist still applies even if mute-list publish fails.
      }

      return true;
    },
    [currentNsec, nostrFetchRelays],
  );

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

  const openBankPaymentFromOffer = React.useCallback(
    async (spdPayload: string) => {
      try {
        await openSpdPaymentInBank(spdPayload);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;

        const message = error instanceof Error ? error.message : "";
        if (message === "spd-share-unavailable") {
          setStatus(t("spdPaymentShareUnavailable"));
          return;
        }
        if (message === "spd-service-worker-unavailable") {
          setStatus(t("spdPaymentServiceWorkerUnavailable"));
          return;
        }

        setStatus(t("spdPaymentOpenFailed"));
      }
    },
    [setStatus, t],
  );

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

  const requestDeleteCurrentContact = () => {
    if (!editingId) return;
    if (pendingDeleteId === editingId) {
      setPendingDeleteId(null);
      handleDelete(editingId);
      return;
    }
    setPendingDeleteId(editingId);
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

  const blockArchivedContact = React.useCallback(async () => {
    if (route.kind !== "contactEdit") return;
    if (!selectedContact?.id) return;

    const normalizedNpub = normalizeNpubIdentifier(selectedContact.npub);
    if (!normalizedNpub) {
      setStatus(t("chatMissingContactNpub"));
      return;
    }

    const confirmed = window.confirm(t("chatUnknownContactBlockConfirm"));
    if (!confirmed) return;

    let blockedPubkey: string | null = null;
    try {
      const decoded = nip19.decode(normalizedNpub);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        blockedPubkey = normalizePubkeyHex(decoded.data);
      }
    } catch {
      blockedPubkey = null;
    }

    if (!blockedPubkey) {
      setStatus(t("chatMissingContactNpub"));
      return;
    }

    await blockPubkeyAndPublishMuteList(blockedPubkey);

    const contactId = String(selectedContact.id ?? "").trim();
    if (contactId) {
      removeLocalNostrMessagesByContactId(contactId);
      clearContactAttention(contactId);
    }

    const result = contactsOwnerId
      ? (() => {
          const scoped = update(
            "contact",
            { id: selectedContact.id, isDeleted: Evolu.sqliteTrue },
            { ownerId: contactsOwnerId },
          );
          if (scoped.ok) return scoped;
          return update("contact", {
            id: selectedContact.id,
            isDeleted: Evolu.sqliteTrue,
          });
        })()
      : update("contact", {
          id: selectedContact.id,
          isDeleted: Evolu.sqliteTrue,
        });

    if (result.ok) {
      recordContactsOwnerWrite();
      setStatus(t("contactBlocked"));
      closeContactDetail();
      return;
    }

    setStatus(`${t("errorPrefix")}: ${String(result.error)}`);
  }, [
    blockPubkeyAndPublishMuteList,
    clearContactAttention,
    closeContactDetail,
    contactsOwnerId,
    recordContactsOwnerWrite,
    removeLocalNostrMessagesByContactId,
    route.kind,
    selectedContact,
    setStatus,
    t,
    update,
  ]);

  const openContactPay = (
    contactId: string,
    fromChat = false,
    intent: "pay" | "request" = "pay",
  ) => {
    const knownContact =
      contacts.find((row) => String(row.id ?? "").trim() === contactId) ?? null;
    if (!knownContact) return;

    contactPayBackToChatRef.current = fromChat ? knownContact.id : null;
    setContactPaymentIntent(intent);
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

  const blockUnknownContactFromChat = React.useCallback(async () => {
    if (route.kind !== "chat") return;
    if (!selectedChatContact?.isUnknownContact) return;

    const confirmed = window.confirm(t("chatUnknownContactBlockConfirm"));
    if (!confirmed) return;

    const contactId = String(selectedChatContact.id ?? "").trim();
    if (!contactId) return;

    const unknownPubkeyHex = (() => {
      const directPubkey = normalizePubkeyHex(
        selectedChatContact.unknownPubkeyHex,
      );
      if (directPubkey) return directPubkey;

      const normalizedNpub = normalizeNpubIdentifier(selectedChatContact.npub);
      if (!normalizedNpub) return null;

      try {
        const decoded = nip19.decode(normalizedNpub);
        if (decoded.type !== "npub" || typeof decoded.data !== "string") {
          return null;
        }
        return normalizePubkeyHex(decoded.data);
      } catch {
        return null;
      }
    })();

    if (!unknownPubkeyHex) return;

    await blockPubkeyAndPublishMuteList(unknownPubkeyHex);

    removeLocalNostrMessagesByContactId(contactId);
    clearContactAttention(contactId);
    setStatus(t("chatUnknownContactBlocked"));
    navigateTo({ route: "contacts" });
  }, [
    blockPubkeyAndPublishMuteList,
    clearContactAttention,
    removeLocalNostrMessagesByContactId,
    route.kind,
    selectedChatContact?.npub,
    selectedChatContact?.unknownPubkeyHex,
    selectedChatContact,
    setStatus,
    t,
  ]);

  const getNpubMessageContactInfo = React.useCallback(
    (rawNpub: string) => {
      const npub = normalizeNpubIdentifier(rawNpub);
      if (!npub) return null;

      const knownContact =
        contacts.find(
          (contact) => normalizeNpubIdentifier(contact.npub) === npub,
        ) ?? null;
      const derivedProfile = deriveDefaultProfile(npub, lang);
      const displayName = buildSavedContactName(
        String(knownContact?.name ?? "").trim() ||
          unknownNameByNpub[npub] ||
          null,
        npub,
      );
      const pictureUrl =
        nostrPictureByNpub[npub] ?? derivedProfile.pictureUrl ?? null;

      return {
        displayName,
        npub,
        pictureUrl,
      };
    },
    [
      buildSavedContactName,
      contacts,
      lang,
      nostrPictureByNpub,
      unknownNameByNpub,
    ],
  );

  const openNpubMessageContact = React.useCallback(
    (rawNpub: string) => {
      const npub = normalizeNpubIdentifier(rawNpub);
      if (!npub) return;

      const existing = contacts.find(
        (contact) => normalizeNpubIdentifier(contact.npub) === npub,
      );
      if (existing?.id) {
        navigateTo({ route: "contact", id: existing.id as ContactId });
        return;
      }

      const myNpub = normalizeNpubIdentifier(currentNpub);
      if (myNpub && myNpub === npub) {
        navigateTo({ route: "profile" });
        return;
      }

      if (activeContactsOwnerContactCount >= MAX_CONTACTS_PER_OWNER) {
        setStatus(
          t("contactsLimitReached").replace(
            "{max}",
            String(MAX_CONTACTS_PER_OWNER),
          ),
        );
        return;
      }

      const defaultProfile = deriveDefaultProfile(npub, lang);
      const payload = {
        name: buildSavedContactName(
          unknownNameByNpub[npub] ?? defaultProfile.name,
          npub,
        ) as typeof Evolu.NonEmptyString1000.Type,
        npub: npub as typeof Evolu.NonEmptyString1000.Type,
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
        return;
      }

      openScannedContactPendingNpubRef.current = npub;
      recordContactsOwnerWrite();
      setStatus(t("contactSaved"));
    },
    [
      activeContactsOwnerContactCount,
      buildSavedContactName,
      contacts,
      contactsOwnerId,
      currentNpub,
      insert,
      lang,
      openScannedContactPendingNpubRef,
      recordContactsOwnerWrite,
      setStatus,
      t,
      unknownNameByNpub,
    ],
  );

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
          onSelect={handleSelectContact}
          onMintIconLoad={handleMintIconLoad}
          onMintIconError={handleMintIconError}
        />
      );
    },
    [
      contactAttentionById,
      getMintIconUrl,
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
            issuedToken: split.sendToken,
          },
          fee: amountSat - split.sendAmount,
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

  useChatNostrSyncEffect({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    chatSeenWrapIdsRef,
    currentNsec,
    knownNostrMessageIdentityIndex,
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
    selectedContact:
      route.kind === "chat" ? selectedChatContact : selectedContact,
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

  const sendChatImage = React.useCallback(
    async (file: File) => {
      if (editContext) return;
      await sendChatMessage({
        clearDraft: false,
        imageFile: file,
      });
    },
    [editContext, sendChatMessage],
  );

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
      void sendReaction({
        emoji,
        messageAuthorPubkey,
        messageKind: parsePrivateImageMessage(message.content) ? 15 : 14,
        messageRumorId,
      });
    },
    [sendReaction],
  );

  const onCopyChatMessage = React.useCallback(
    (message: LocalNostrMessage) => {
      const content = String(message.content ?? "");
      const copyContent = parsePrivateImageMessage(content)
        ? privateImagePreviewText(t)
        : content;
      void copyText(copyContent);
    },
    [copyText, t],
  );

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

  const onDeclineChatPaymentRequest = React.useCallback(
    async (message: LocalNostrMessage) => {
      const requestRumorId = String(message.rumorId ?? "").trim();
      if (!requestRumorId) return;

      await sendChatMessage({
        clearDraft: false,
        replyContext: {
          replyToId: requestRumorId,
          rootMessageId:
            String(message.rootMessageId ?? "").trim() || requestRumorId,
          replyToContent: String(message.content ?? "").trim() || null,
        },
        text: buildLinkyPaymentRequestDeclineMessage(requestRumorId),
      });
    },
    [sendChatMessage],
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
    chatEditContactId:
      route.kind === "chat" && !selectedChatContact?.isUnknownContact
        ? (selectedContact?.id ?? null)
        : null,
    isProfileEditing,
    route,
    t,
    toggleMenu,
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

  const openInboxMessageToast = React.useCallback(
    (params: { contactId: string; messageId?: string }) => {
      const contactId = String(params.contactId ?? "").trim();
      if (!contactId) return;
      const messageId = String(params.messageId ?? "").trim();

      navigateTo({ route: "chat", id: contactId });
      triggerChatScrollToBottom(messageId || undefined);
    },
    [triggerChatScrollToBottom],
  );

  useInboxNotificationsSync({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    bankPaymentOfferMessages,
    contacts,
    currentNsec,
    maybeShowPwaNotification,
    nostrFetchRelays,
    knownNostrMessageIdentityIndex,
    nostrMessageWrapIdsRef,
    nostrMessagesLatestRef,
    nostrMessagesRecent,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    onBankPaymentOfferMessage: upsertBankPaymentOfferMessage,
    onOpenInboxMessageToast: openInboxMessageToast,
    pushToast,
    route,
    setContactAttentionById,
    softDeleteLocalNostrReactionsByWrapIds,
    t,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  });

  const openProfileQr = React.useCallback(() => {
    navigateTo({ route: "profile" });
  }, []);

  const closeProfileQr = React.useCallback(() => {}, []);

  const handleScannedText = useScannedTextHandler<(typeof contacts)[number]>({
    appOwnerId: contactsOwnerId,
    closeScan,
    contacts,
    currentNpub,
    extractCashuTokenFromText,
    insert,
    lightningInvoiceAutoPayLimit,
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

  const chatMessagesWithBankPaymentOffers = React.useMemo(() => {
    if (route.kind !== "chat") return chatMessages;

    const activeContactId = String(route.id ?? "").trim();
    if (!activeContactId) return chatMessages;

    const offerMessages = bankPaymentOfferMessages.filter(
      (message) => String(message.contactId ?? "").trim() === activeContactId,
    );
    if (offerMessages.length === 0) return chatMessages;

    const seenKeys = new Set<string>();
    for (const message of chatMessages) {
      const offerId = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      )?.offerId;
      if (offerId) seenKeys.add(`offer:${offerId}`);
      const wrapId = String(message.wrapId ?? "").trim();
      if (wrapId) seenKeys.add(`wrap:${wrapId}`);
      const clientId = String(message.clientId ?? "").trim();
      if (clientId) seenKeys.add(`client:${clientId}`);
      const id = String(message.id ?? "").trim();
      if (id) seenKeys.add(`id:${id}`);
    }

    const merged = [...chatMessages];
    for (const message of offerMessages) {
      const offerId = getLinkyBankPaymentOfferInfo(
        String(message.content ?? ""),
      )?.offerId;
      const wrapId = String(message.wrapId ?? "").trim();
      const clientId = String(message.clientId ?? "").trim();
      const id = String(message.id ?? "").trim();
      if (offerId && seenKeys.has(`offer:${offerId}`)) continue;
      if (wrapId && seenKeys.has(`wrap:${wrapId}`)) continue;
      if (clientId && seenKeys.has(`client:${clientId}`)) continue;
      if (id && seenKeys.has(`id:${id}`)) continue;

      merged.push(message);
      if (offerId) seenKeys.add(`offer:${offerId}`);
      if (wrapId) seenKeys.add(`wrap:${wrapId}`);
      if (clientId) seenKeys.add(`client:${clientId}`);
      if (id) seenKeys.add(`id:${id}`);
    }

    merged.sort((a, b) => {
      const createdA = Number(a.createdAtSec ?? 0);
      const createdB = Number(b.createdAtSec ?? 0);
      if (createdA !== createdB) return createdA - createdB;
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });

    return merged;
  }, [bankPaymentOfferMessages, chatMessages, route]);

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
      autofillNewContactFromIdentifier,
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
      onCopyText: copyText,
      onDeclinePaymentRequest: onDeclineChatPaymentRequest,
      onEdit: onEditChatMessage,
      onOpenBankPayment: openBankPaymentFromOffer,
      onOpenNpubContact: openNpubMessageContact,
      onPayPaymentRequest: onPayChatPaymentRequest,
      onRespondBankPaymentOffer: respondToBankPaymentOfferWithGroupState,
      onSettleBankPaymentOffer: settleBankPaymentOffer,
      cycleProfileAvatarControl,
      onPickProfilePhoto,
      onProfilePhotoSelected,
      onReact: onReactToChatMessage,
      onReply: onReplyToChatMessage,
      openContactPay,
      openScan,
      payAmount,
      payLightningInvoiceWithCashu,
      paySelectedContact,
      requestSelectedContact,
      payWithCashuEnabled,
      ownedLightningAddresses: ownedProfileLightningAddresses,
      ownedLightningAddressesLoading: ownedProfileLightningAddressesLoading,
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
      profileStatus: myProfileStatus,
      profilePhotoInputRef,
      profileSelectedPictureKind,
      blockArchivedContact,
      selectedProfileStatusCurrencies,
      restoreArchivedContact: () => {
        if (!editingId) return;
        restoreArchivedContact(editingId);
      },
      requestDeleteCurrentContact,
      resetEditedContactFieldFromNostr,
      replyContext,
      saveClaimedLightningAddress,
      saveProfileEdits,
      scanIsOpen,
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
    contactsPullProgress,
    groupNamesCount: groupNames.length,
    isMainSwipeRoute,
    mainSwipeRouteBuilderInput: {
      activeGroup,
      cashuBalance,
      cashuTotalBalance,
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
      handleMainSwipeTabChange: commitMainSwipe,
      isMainSwipeDragging,
      mainSwipeProgress,
      mainSwipeRef,
      NO_GROUP_FILTER,
      canAddContact,
      closeProfileQr,
      openNewContactPage,
      openProfileQr,
      openScan,
      openWalletScan,
      otherContactsLabel,
      renderContactCard: renderMainSwipeContactCard,
      route,
      scanIsOpen,
      showProfileQrOnTiltEnabled,
      setActiveGroup,
      setContactsSearch,
      showContactsOnboarding,
      showWalletWarning: walletWarningApplies && !walletWarningDismissed,
      statusFilterCurrencies,
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

  const appState = {
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
    evoluTransactionsVisibleOwnerIds: transactionsVisibleOwnerIds.map(
      (ownerId) => String(ownerId),
    ),
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
  };

  const appActions = {
    cancelPendingNfcWrite,
    closeMintAutoswapChangeConfirmation,
    closePaymentMintMeltConfirmation,
    closeLnurlWithdrawConfirmation,
    closeMenu,
    closeShareOptions,
    closeLightningInvoiceConfirmation,
    closeProfileQr,
    closeScan,
    confirmMintAutoswapChangeConfirmation,
    confirmPaymentMintMelt,
    confirmLnurlWithdraw,
    confirmLightningInvoicePayment,
    contactsGuideNav,
    copyShareOptionsText,
    copyText,
    cycleDisplayCurrency,
    cycleProfileAvatarControl,
    onPickProfilePhoto,
    onPickScanImage,
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
  };

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
