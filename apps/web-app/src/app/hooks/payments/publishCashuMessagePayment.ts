import {
  CashuTokenText,
  ClientId,
  PaymentNoticeDraft,
  Pubkey,
  RumorId,
  TokenMessageDraft,
} from "@linky/linkstr";
import type {
  ChatMessageReceipt,
  PaymentNoticeContext,
  PaymentNoticeReceipt,
} from "@linky/linkstr";
import { Cause, Either, Exit, Option, Schema } from "effect";
import { nip19 } from "nostr-tools";
import type { ContactId } from "../../../evolu";
import { previewTokenText } from "../../../utils/formatting";
import { getUnknownErrorMessage } from "../../../utils/unknown";
import { makeLocalId } from "../../../utils/validation";
import type {
  LocalNostrMessage,
  NewLocalNostrMessage,
  PaymentLogData,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";
import type { ReplyContext } from "../messages/useSendChatMessage";
import type {
  CashuMessagePaymentPublishingOutcome,
  CashuMessagePaymentSendBatch,
} from "./cashuMessagePaymentTypes";

type SendExit<A> = Exit.Exit<A, { readonly _tag: string }>;

export type SendTokenMessage = (
  draft: TokenMessageDraft,
) => Promise<SendExit<ChatMessageReceipt>>;

export type SendPaymentNotice = (
  draft: PaymentNoticeDraft,
) => Promise<SendExit<PaymentNoticeReceipt>>;

interface PublishCashuMessagePaymentDependencies {
  makeId?: () => string;
  nowSec?: () => number;
}

interface PublishCashuMessagePaymentArgs {
  activePublishClientIds: Set<string>;
  appendLocalNostrMessage: (message: NewLocalNostrMessage) => string;
  batches: readonly CashuMessagePaymentSendBatch[];
  contactId: ContactId;
  contactNpub: string;
  currentNpub: string;
  dependencies?: PublishCashuMessagePaymentDependencies;
  logPayStep: (step: string, data?: PaymentLogData) => void;
  nostrMessagesLocal: readonly LocalNostrMessage[];
  paymentNoticeContext?: PaymentNoticeContext;
  paymentNoticeOfferId?: string;
  pendingMessageId: string | null;
  replyContext?: ReplyContext | null;
  sendPaymentNotice: SendPaymentNotice;
  sendTokenMessage: SendTokenMessage;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

const isPubkey = Schema.is(Pubkey);
const isRumorId = Schema.is(RumorId);
const decodeCashuTokenText = Schema.decodeUnknownEither(CashuTokenText);

const decodeNpub = (npub: string): Pubkey => {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub" || !isPubkey(decoded.data)) {
    throw new Error("invalid npub");
  }
  return decoded.data;
};

const failureMessage = (
  cause: Cause.Cause<{ readonly _tag: string }>,
): string =>
  Option.match(Cause.failureOption(cause), {
    onNone: () => Cause.pretty(cause),
    onSome: (failure) => failure._tag,
  });

export const publishCashuMessagePayment = async ({
  activePublishClientIds,
  appendLocalNostrMessage,
  batches,
  contactId,
  contactNpub,
  currentNpub,
  dependencies,
  logPayStep,
  nostrMessagesLocal,
  paymentNoticeContext,
  paymentNoticeOfferId,
  pendingMessageId,
  replyContext,
  sendPaymentNotice,
  sendTokenMessage,
  updateLocalNostrMessage,
}: PublishCashuMessagePaymentArgs): Promise<CashuMessagePaymentPublishingOutcome> => {
  const myPublicKey = decodeNpub(currentNpub);
  const contactPublicKey = decodeNpub(contactNpub);

  const createId = dependencies?.makeId ?? makeLocalId;
  const nowSec = dependencies?.nowSec ?? (() => Math.ceil(Date.now() / 1_000));

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

  const replyToRaw = String(replyContext?.replyToId ?? "").trim();
  const replyTo = isRumorId(replyToRaw) ? replyToRaw : undefined;
  const rootRaw = String(replyContext?.rootMessageId ?? "").trim();
  const root =
    replyTo !== undefined && isRumorId(rootRaw) ? rootRaw : undefined;

  for (const batch of [...batches].reverse()) {
    const messageText = String(batch.token ?? "").trim();
    logPayStep("plan-send-token", {
      amount: batch.amount,
      mint: batch.mint,
      token: previewTokenText(batch.token),
    });

    const clientId = ClientId.make(createId());
    activePublishClientIds.add(clientId);
    logPayStep("publish-pending", {
      clientId,
      token: previewTokenText(messageText),
    });

    let localMessageId = "";
    let selfWrapId: string | null = null;
    let sendError: string | null = null;
    try {
      const token = decodeCashuTokenText(messageText);
      if (Either.isLeft(token)) {
        sendError = "invalid cashu token";
      } else {
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
            createdAtSec: nowSec(),
            direction: "out",
            pubkey: myPublicKey,
            rumorId: null,
            status: "pending",
            wrapId: `pending:${clientId}`,
          });
        }

        const exit = await sendTokenMessage(
          new TokenMessageDraft({
            to: contactPublicKey,
            token: token.right,
            clientId,
            ...(replyTo === undefined ? {} : { replyTo }),
            ...(root === undefined ? {} : { root }),
          }),
        );
        if (Exit.isSuccess(exit)) {
          selfWrapId = exit.value.selfCopy.wrapId;
        } else {
          sendError = failureMessage(exit.cause);
        }
      }
    } catch (error) {
      sendError = getUnknownErrorMessage(error, "publish failed");
    } finally {
      activePublishClientIds.delete(clientId);
    }

    if (selfWrapId === null) {
      const error = sendError ?? "publish failed";
      logPayStep("publish-failed", { clientId, error });
      unpublishedTokenTexts.add(messageText);
      publishErrors.push({ clientId, error, token: messageText });
      continue;
    }

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
    const clientId = ClientId.make(createId());
    const offerId = String(paymentNoticeOfferId ?? "").trim();
    let anySuccess = false;
    let error: string | null = null;
    let wrapId: string | null = null;
    try {
      const exit = await sendPaymentNotice(
        new PaymentNoticeDraft({
          to: contactPublicKey,
          clientId,
          ...(paymentNoticeContext === undefined
            ? {}
            : { context: paymentNoticeContext }),
          ...(offerId === "" ? {} : { offerId }),
        }),
      );
      if (Exit.isSuccess(exit)) {
        anySuccess = true;
        wrapId = exit.value.recipientCopy.wrapId;
      } else {
        error = failureMessage(exit.cause);
      }
    } catch (caught) {
      error = getUnknownErrorMessage(caught, "publish failed");
    }
    paymentNoticeError = anySuccess ? null : (error ?? "publish failed");
    logPayStep("payment-notice-publish", {
      anySuccess,
      clientId,
      error,
      wrapId,
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
