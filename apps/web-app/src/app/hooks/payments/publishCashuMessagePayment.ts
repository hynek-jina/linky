import {
  getPublicKey,
  nip19,
  type Event as NostrToolsEvent,
  type UnsignedEvent,
} from "nostr-tools";
import type { ContactId } from "../../../evolu";
import { previewTokenText } from "../../../utils/formatting";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { makeLocalId } from "../../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import {
  createLinkyPaymentNoticeEvent,
  LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER,
  wrapEventWithPushMarker,
  wrapEventWithoutPushMarker,
} from "../../lib/pushWrappedEvent";
import type {
  LocalNostrMessage,
  NewLocalNostrMessage,
  PaymentLogData,
  PublishWrappedResult,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";
import type { ReplyContext } from "../messages/useSendChatMessage";
import type {
  CashuMessagePaymentPublishingOutcome,
  CashuMessagePaymentSendBatch,
} from "./cashuMessagePaymentTypes";

interface PublishCashuMessagePaymentDependencies {
  createPaymentNoticeEvent?: typeof createLinkyPaymentNoticeEvent;
  decodeNip19?: typeof nip19.decode;
  getPool?: () => Promise<AppNostrPool>;
  getPublicKey?: typeof getPublicKey;
  makeId?: () => string;
  nowSec?: () => number;
  wrapWithPushMarker?: typeof wrapEventWithPushMarker;
  wrapWithoutPushMarker?: typeof wrapEventWithoutPushMarker;
}

interface PublishCashuMessagePaymentArgs {
  activePublishClientIds: Set<string>;
  appendLocalNostrMessage: (message: NewLocalNostrMessage) => string;
  batches: readonly CashuMessagePaymentSendBatch[];
  chatSeenWrapIds: Set<string>;
  contactId: ContactId;
  contactNpub: string;
  currentNsec: string;
  dependencies?: PublishCashuMessagePaymentDependencies;
  logPayStep: (step: string, data?: PaymentLogData) => void;
  nostrMessagesLocal: readonly LocalNostrMessage[];
  paymentNoticeContext?: typeof LINKY_PAYMENT_NOTICE_CONTEXT_BANK_PAYMENT_OFFER;
  paymentNoticeOfferId?: string;
  pendingMessageId: string | null;
  publishSingleWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    event: NostrToolsEvent,
  ) => Promise<{ anySuccess: boolean; error: string | null }>;
  publishWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    wrapForMe: NostrToolsEvent,
    wrapForContact: NostrToolsEvent,
  ) => Promise<PublishWrappedResult>;
  relays: string[];
  replyContext?: ReplyContext | null;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

export const publishCashuMessagePayment = async ({
  activePublishClientIds,
  appendLocalNostrMessage,
  batches,
  chatSeenWrapIds,
  contactId,
  contactNpub,
  currentNsec,
  dependencies,
  logPayStep,
  nostrMessagesLocal,
  paymentNoticeContext,
  paymentNoticeOfferId,
  pendingMessageId,
  publishSingleWrappedWithRetry,
  publishWrappedWithRetry,
  relays,
  replyContext,
  updateLocalNostrMessage,
}: PublishCashuMessagePaymentArgs): Promise<CashuMessagePaymentPublishingOutcome> => {
  const decodeNip19 = dependencies?.decodeNip19 ?? nip19.decode;
  const decodedMe = decodeNip19(currentNsec);
  if (decodedMe.type !== "nsec") throw new Error("invalid nsec");
  const privateKey = decodedMe.data;
  const derivePublicKey = dependencies?.getPublicKey ?? getPublicKey;
  const myPublicKey = derivePublicKey(privateKey);

  const decodedContact = decodeNip19(contactNpub);
  if (decodedContact.type !== "npub") throw new Error("invalid npub");
  const contactPublicKey = decodedContact.data;

  const pool = await (dependencies?.getPool ?? getSharedAppNostrPool)();
  const createId = dependencies?.makeId ?? makeLocalId;
  const nowSec = dependencies?.nowSec ?? (() => Math.ceil(Date.now() / 1_000));
  const wrapWithoutPush =
    dependencies?.wrapWithoutPushMarker ?? wrapEventWithoutPushMarker;
  const wrapWithPush =
    dependencies?.wrapWithPushMarker ?? wrapEventWithPushMarker;
  const createPaymentNotice =
    dependencies?.createPaymentNoticeEvent ?? createLinkyPaymentNoticeEvent;

  const publishedTokenTexts = new Set<string>();
  const unpublishedTokenTexts = new Set<string>();
  const publishErrors: CashuMessagePaymentPublishingOutcome["publishErrors"] =
    [];
  let reusedPendingMessage = false;
  let publishedAnyTokenMessage = false;

  const canReusePendingMessage = Boolean(
    pendingMessageId &&
    nostrMessagesLocal.some(
      (message) => String(message.id ?? "") === pendingMessageId,
    ),
  );

  for (const batch of [...batches].reverse()) {
    const messageText = String(batch.token ?? "").trim();
    logPayStep("plan-send-token", {
      amount: batch.amount,
      mint: batch.mint,
      token: previewTokenText(batch.token),
    });

    const clientId = createId();
    activePublishClientIds.add(clientId);
    logPayStep("publish-pending", {
      clientId,
      token: previewTokenText(messageText),
    });

    let localMessageId = "";
    let wrapForMe: NostrToolsEvent | null = null;
    let publishOutcome: PublishWrappedResult = {
      anySuccess: false,
      error: "publish failed",
    };
    try {
      const tags: string[][] = [
        ["p", contactPublicKey],
        ["p", myPublicKey],
        ["client", clientId],
      ];
      if (replyContext?.replyToId) {
        const rootId =
          String(replyContext.rootMessageId ?? "").trim() ||
          String(replyContext.replyToId ?? "").trim();
        const replyId = String(replyContext.replyToId ?? "").trim();
        if (rootId) tags.push(["e", rootId, "", "root"]);
        if (replyId) tags.push(["e", replyId, "", "reply"]);
      }
      const baseEvent: UnsignedEvent = {
        content: messageText,
        created_at: nowSec(),
        kind: 14,
        pubkey: myPublicKey,
        tags,
      };

      if (canReusePendingMessage && !reusedPendingMessage) {
        localMessageId = pendingMessageId ?? "";
        reusedPendingMessage = true;
        updateLocalNostrMessage(localMessageId, {
          clientId,
          content: messageText,
          localOnly: false,
          pubkey: myPublicKey,
          status: "pending",
          wrapId: `pending:${clientId}`,
        });
      } else {
        localMessageId = appendLocalNostrMessage({
          ...(replyContext?.replyToId
            ? {
                replyToContent: replyContext.replyToContent,
                replyToId: replyContext.replyToId,
                rootMessageId:
                  String(replyContext.rootMessageId ?? "").trim() ||
                  replyContext.replyToId,
              }
            : {}),
          clientId,
          contactId: String(contactId),
          content: messageText,
          createdAtSec: baseEvent.created_at,
          direction: "out",
          pubkey: myPublicKey,
          rumorId: null,
          status: "pending",
          wrapId: `pending:${clientId}`,
        });
      }

      wrapForMe = wrapWithoutPush(baseEvent, privateKey, myPublicKey);
      const wrapForContact = wrapWithoutPush(
        baseEvent,
        privateKey,
        contactPublicKey,
      );
      publishOutcome = await publishWrappedWithRetry(
        pool,
        relays,
        wrapForMe,
        wrapForContact,
      );
    } catch (error) {
      publishOutcome = {
        anySuccess: false,
        error: getUnknownErrorMessage(error, "publish failed"),
      };
    } finally {
      activePublishClientIds.delete(clientId);
    }

    if (!publishOutcome.anySuccess || !wrapForMe) {
      const error = getUnknownErrorMessage(
        publishOutcome.error,
        "publish failed",
      );
      logPayStep("publish-failed", { clientId, error });
      unpublishedTokenTexts.add(messageText);
      publishErrors.push({ clientId, error, token: messageText });
      continue;
    }

    const selfWrapId = String(wrapForMe.id ?? "");
    chatSeenWrapIds.add(selfWrapId);
    if (localMessageId) {
      updateLocalNostrMessage(localMessageId, {
        pubkey: myPublicKey,
        status: "sent",
        wrapId: selfWrapId,
      });
    }
    logPayStep("publish-ok", { clientId, wrapId: selfWrapId });
    publishedAnyTokenMessage = true;
    publishedTokenTexts.add(messageText);
  }

  let paymentNoticeError: string | null = null;
  if (publishedAnyTokenMessage) {
    const clientId = createId();
    const event = createPaymentNotice({
      clientId,
      ...(paymentNoticeContext ? { context: paymentNoticeContext } : {}),
      createdAt: nowSec(),
      ...(paymentNoticeOfferId ? { offerId: paymentNoticeOfferId } : {}),
      recipientPublicKey: contactPublicKey,
      senderPublicKey: myPublicKey,
    });
    const wrap = wrapWithPush(event, privateKey, contactPublicKey);
    let outcome: { anySuccess: boolean; error: string | null };
    try {
      outcome = await publishSingleWrappedWithRetry(pool, relays, wrap);
    } catch (error) {
      outcome = {
        anySuccess: false,
        error: getUnknownErrorMessage(error, "publish failed"),
      };
    }
    paymentNoticeError = outcome.anySuccess
      ? null
      : getUnknownErrorMessage(outcome.error, "publish failed");
    logPayStep("payment-notice-publish", {
      anySuccess: outcome.anySuccess,
      clientId,
      error: outcome.error,
      wrapId: String(wrap.id ?? ""),
    });
  }

  return {
    hasPendingMessages: unpublishedTokenTexts.size > 0,
    paymentNoticeError,
    publishErrors,
    publishedTokenTexts: Array.from(publishedTokenTexts),
    unpublishedTokenTexts: Array.from(unpublishedTokenTexts),
  };
};
