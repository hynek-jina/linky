import { Share } from "@capacitor/share";
import { nip19 } from "nostr-tools";
import React from "react";
import type { CashuTokenId, useEvolu } from "../../../evolu";
import { navigateTo, useRouting } from "../../../hooks/useRouting";
import { NOSTR_RELAYS } from "../../../nostrProfile";
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
} from "../../../platform/nativeBridge";
import { isNativePlatform } from "../../../platform/runtime";
import { PENDING_DEEP_LINK_TEXT_STORAGE_KEY } from "../../../utils/constants";
import {
  buildCashuDeepLink,
  parseNativeDeepLinkUrl,
} from "../../../utils/deepLinks";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "../../../utils/storage";
import { useContactsOnboardingProgress } from "../guide/useContactsOnboardingProgress";
import {
  extractClientTag,
  extractEditedFromTag,
  extractReplyContextFromTags,
  isInvalidInnerRumorPubkey,
  isNestedEncryptedNip44PayloadForAnyPubkey,
} from "../messages/chatNostrProtocol";
import {
  buildUnknownContactId,
  normalizePubkeyHex,
} from "../messages/contactIdentity";
import { hasKnownNostrMessageIdentity } from "../messages/messageHelpers";
import { useGuideScannerDomain } from "../useGuideScannerDomain";
import { useScannedTextHandler } from "../useScannedTextHandler";
import { useScannedTextHandlerRefBridge } from "../useScannedTextHandlerRefBridge";
import {
  getLinkyBankPaymentOfferInfo,
  isLinkyBankPaymentOfferEvent,
  setLinkyBankPaymentOfferMinimized,
} from "../../lib/bankPaymentOffer";
import {
  CASHU_TOKEN_STATE_EXTERNALIZED,
  isCashuTokenAcceptedState,
} from "../../lib/cashuTokenState";
import {
  consumeNotificationOpenDetailFromHash,
  readNotificationOpenRoute,
  readNotificationOpenTarget,
} from "../../lib/notificationOpenTarget";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import { privateImageMessageFromEvent } from "../../lib/privateImageMessage";
import {
  getLinkyBankPaymentOfferPaymentNoticeOfferId,
  isLinkyBankPaymentOfferPaymentNoticeEvent,
} from "../../lib/pushWrappedEvent";
import {
  extractCashuTokenFromText,
  extractCashuTokenFromText as extractCashuTokenFromTextFromUrl,
} from "../../lib/tokenText";
import type { LocalNostrMessage } from "../../types/appTypes";
import type { useCashuWalletComposition } from "./useCashuWalletComposition";
import type { useContactsMessagingComposition } from "./useContactsMessagingComposition";
import type { useIdentityOwnersComposition } from "./useIdentityOwnersComposition";

type CashuWalletCompositionResult = ReturnType<
  typeof useCashuWalletComposition
>;
type ContactsMessagingCompositionResult = ReturnType<
  typeof useContactsMessagingComposition
>;
type EvoluMutations = ReturnType<typeof useEvolu>;
type IdentityOwnersCompositionResult = ReturnType<
  typeof useIdentityOwnersComposition
>;

interface QueuedNotificationOpenDetail {
  value: unknown;
}

interface UseScanNativeCompositionParams {
  addNewContactFromIdentifier: ContactsMessagingCompositionResult["addNewContactFromIdentifier"];
  appendLocalNostrMessage: ContactsMessagingCompositionResult["appendLocalNostrMessage"];
  bankPaymentOfferMessages: ContactsMessagingCompositionResult["bankPaymentOfferMessages"];
  cashuBalance: CashuWalletCompositionResult["cashuBalance"];
  cashuOwnerId: IdentityOwnersCompositionResult["cashuOwnerId"];
  cashuTokensAllFiltered: CashuWalletCompositionResult["cashuTokensAllFiltered"];
  contacts: ContactsMessagingCompositionResult["contacts"];
  contactsLatestRef: ContactsMessagingCompositionResult["contactsLatestRef"];
  contactsOnboardingHasBackedUpKeys: ContactsMessagingCompositionResult["contactsOnboardingHasBackedUpKeys"];
  contactsOnboardingHasPaid: ContactsMessagingCompositionResult["contactsOnboardingHasPaid"];
  contactsOnboardingHasSentMessage: ContactsMessagingCompositionResult["contactsOnboardingHasSentMessage"];
  contactsOwnerId: IdentityOwnersCompositionResult["contactsOwnerId"];
  copyText: (value: string) => Promise<void>;
  currentNpub: string | null;
  currentNsec: string | null;
  insert: EvoluMutations["insert"];
  knownNostrMessageIdentityIndex: ContactsMessagingCompositionResult["knownNostrMessageIdentityIndex"];
  lightningInvoiceAutoPayLimit: CashuWalletCompositionResult["lightningInvoiceAutoPayLimit"];
  markCashuTokenIssued: CashuWalletCompositionResult["markCashuTokenIssued"];
  nostrBootstrapReady: ContactsMessagingCompositionResult["nostrBootstrapReady"];
  nostrFetchRelays: ContactsMessagingCompositionResult["nostrFetchRelays"];
  nostrMessagesLatestRef: ContactsMessagingCompositionResult["nostrMessagesLatestRef"];
  nostrMessageWrapIdsRef: ContactsMessagingCompositionResult["nostrMessageWrapIdsRef"];
  openNewContactPage: ContactsMessagingCompositionResult["openNewContactPage"];
  openScannedContactPendingNpubRef: ContactsMessagingCompositionResult["openScannedContactPendingNpubRef"];
  payCashuPaymentRequest: CashuWalletCompositionResult["payCashuPaymentRequest"];
  payLightningInvoiceWithCashu: CashuWalletCompositionResult["payLightningInvoiceWithCashu"];
  pushToast: (message: string) => void;
  refreshContactFromNostr: ContactsMessagingCompositionResult["refreshContactFromNostr"];
  route: ReturnType<typeof useRouting>;
  saveCashuFromText: CashuWalletCompositionResult["saveCashuFromText"];
  setPendingDeleteId: ContactsMessagingCompositionResult["setPendingDeleteId"];
  setPendingLightningInvoiceConfirmation: CashuWalletCompositionResult["setPendingLightningInvoiceConfirmation"];
  setPendingLnurlWithdrawConfirmation: CashuWalletCompositionResult["setPendingLnurlWithdrawConfirmation"];
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  triggerChatScrollToBottom: ContactsMessagingCompositionResult["triggerChatScrollToBottom"];
  update: EvoluMutations["update"];
  updateLocalNostrMessage: ContactsMessagingCompositionResult["updateLocalNostrMessage"];
  upsertBankPaymentOfferMessage: ContactsMessagingCompositionResult["upsertBankPaymentOfferMessage"];
}

export const useScanNativeComposition = ({
  addNewContactFromIdentifier,
  appendLocalNostrMessage,
  bankPaymentOfferMessages,
  cashuBalance,
  cashuOwnerId,
  cashuTokensAllFiltered,
  contacts,
  contactsLatestRef,
  contactsOnboardingHasBackedUpKeys,
  contactsOnboardingHasPaid,
  contactsOnboardingHasSentMessage,
  contactsOwnerId,
  copyText,
  currentNpub,
  currentNsec,
  insert,
  knownNostrMessageIdentityIndex,
  lightningInvoiceAutoPayLimit,
  markCashuTokenIssued,
  nostrBootstrapReady,
  nostrFetchRelays,
  nostrMessagesLatestRef,
  nostrMessageWrapIdsRef,
  openNewContactPage,
  openScannedContactPendingNpubRef,
  payCashuPaymentRequest,
  payLightningInvoiceWithCashu,
  pushToast,
  refreshContactFromNostr,
  route,
  saveCashuFromText,
  setPendingDeleteId,
  setPendingLightningInvoiceConfirmation,
  setPendingLnurlWithdrawConfirmation,
  setStatus,
  t,
  triggerChatScrollToBottom,
  update,
  updateLocalNostrMessage,
  upsertBankPaymentOfferMessage,
}: UseScanNativeCompositionParams) => {
  const pendingNotificationOpenDetailsRef = React.useRef<
    QueuedNotificationOpenDetail[]
  >([]);
  const [shareOptionsText, setShareOptionsText] = React.useState<string | null>(
    null,
  );
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
        state: CASHU_TOKEN_STATE_EXTERNALIZED,
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

  return {
    cancelPendingNfcWrite,
    canWriteNfc,
    closeScan,
    closeShareOptions,
    contactsGuide,
    contactsGuideActiveStep,
    contactsGuideHighlightRect,
    contactsOnboardingCelebrating,
    contactsOnboardingTasks,
    copyShareOptionsText,
    dismissContactsOnboarding,
    nfcWritePromptKind,
    onPickScanImage,
    onScanImageSelected,
    onSubmitManualPayText,
    openIssueTokenFromScan,
    openManualContactFromScan,
    openManualPayFromScan,
    openReceiveScan,
    openScan,
    openWalletScan,
    pasteScanValue,
    scanAllowsManualContact,
    scanEntryPoint,
    scanImageInputRef,
    scanIsOpen,
    scanVideoRef,
    shareCashuTokenText,
    shareOptionsText,
    shareOptionsViaEmail,
    shareOptionsViaSms,
    shareOptionsViaWhatsApp,
    showContactsOnboarding,
    stableContactsGuideNav,
    startContactsGuide,
    stopContactsGuide,
    writeCashuTokenToNfc,
    writeCurrentNpubToNfc,
  };
};
