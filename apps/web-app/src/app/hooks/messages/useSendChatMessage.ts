import {
  ClientId,
  ImageMessageDraft,
  MessageText,
  PrivateImage,
  Pubkey,
  RumorId,
  TextMessageDraft,
} from "@linky/linkstr";
import {
  sendChatImageAtom,
  sendChatTextAtom,
  useAtomSet,
} from "@linky/linkstr-react";
import { Cause, Either, Exit, Option, Schema } from "effect";
import React from "react";
import { appendPushDebugLog } from "../../../utils/pushDebugLog";
import { makeLocalId } from "../../../utils/validation";
import {
  createPrivateImageSendPayload,
  parsePrivateImageMessage,
  privateImageUploadDebugPayload,
} from "../../lib/privateImageMessage";
import type {
  ContactIdentityRowLike,
  NewLocalNostrMessage,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";
import { resolveNostrChatIdentity } from "./contactIdentity";

type AppendLocalNostrMessage = (message: NewLocalNostrMessage) => string;

const isPubkey = Schema.is(Pubkey);
const isRumorId = Schema.is(RumorId);
const decodeMessageText = Schema.decodeUnknownEither(MessageText);
const decodePrivateImage = Schema.decodeUnknownEither(PrivateImage);

export interface ReplyContext {
  rootMessageId: string | null;
  replyToContent: string | null;
  replyToId: string;
}

interface SendChatMessageOptions {
  clearDraft?: boolean;
  imageFile?: File | null;
  replyContext?: ReplyContext | null;
  text?: string;
}

interface UseSendChatMessageParams<
  TRoute extends { kind: string },
  TContact extends ContactIdentityRowLike,
> {
  activePublishClientIdsRef: React.MutableRefObject<Set<string>>;
  appendLocalNostrMessage: AppendLocalNostrMessage;
  chatDraft: string;
  chatSendIsBusy: boolean;
  currentNsec: string | null;
  route: TRoute;
  replyContext: ReplyContext | null;
  replyContextRef: React.MutableRefObject<ReplyContext | null>;
  selectedContact: TContact | null;
  setReplyContext: React.Dispatch<React.SetStateAction<ReplyContext | null>>;
  setChatDraft: React.Dispatch<React.SetStateAction<string>>;
  setChatSendIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  triggerChatScrollToBottom: (messageId?: string) => void;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

export const useSendChatMessage = <
  TRoute extends { kind: string },
  TContact extends ContactIdentityRowLike,
>({
  activePublishClientIdsRef,
  appendLocalNostrMessage,
  chatDraft,
  chatSendIsBusy,
  currentNsec,
  route,
  replyContext,
  replyContextRef,
  selectedContact,
  setReplyContext,
  setChatDraft,
  setChatSendIsBusy,
  setStatus,
  t,
  triggerChatScrollToBottom,
  updateLocalNostrMessage,
}: UseSendChatMessageParams<TRoute, TContact>) => {
  const sendTextMessage = useAtomSet(sendChatTextAtom, {
    mode: "promiseExit",
  });
  const sendImageMessage = useAtomSet(sendChatImageAtom, {
    mode: "promiseExit",
  });

  return React.useCallback(
    async (options?: SendChatMessageOptions) => {
      if (
        route.kind !== "chat" &&
        route.kind !== "contactPay" &&
        route.kind !== "bankPaymentOffer"
      )
        return;
      if (!selectedContact) return;

      const imageFile = options?.imageFile ?? null;
      const text = String(options?.text ?? chatDraft).trim();
      if (!text && !imageFile) return;

      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      if (chatSendIsBusy) return;
      setChatSendIsBusy(true);

      let activeClientId: string | null = null;

      try {
        const identity = await resolveNostrChatIdentity(
          currentNsec,
          selectedContact,
        );
        if (!identity || !isPubkey(identity.contactPubHex)) {
          setStatus(t("chatMissingContactNpub"));
          return;
        }
        const { contactPubHex, myPubHex, privBytes } = identity;

        const clientId = ClientId.make(makeLocalId());
        activeClientId = clientId;
        activePublishClientIdsRef.current.add(clientId);
        const imagePayload = imageFile
          ? await createPrivateImageSendPayload(imageFile, {
              privateKey: privBytes,
              pubkey: myPubHex,
            })
          : null;
        const messageContent = imagePayload?.content ?? text;
        const mediaInfo = parsePrivateImageMessage(messageContent);
        const activeReplyContext =
          options?.replyContext ??
          replyContextRef.current ??
          replyContext ??
          null;
        const activeReplyToId = String(
          activeReplyContext?.replyToId ?? "",
        ).trim();
        const replyTo = isRumorId(activeReplyToId)
          ? activeReplyToId
          : undefined;
        const rootId =
          String(activeReplyContext?.rootMessageId ?? "").trim() || replyTo;
        const root =
          replyTo !== undefined && isRumorId(rootId) ? rootId : undefined;
        const clearReplyContextIfCurrent = () => {
          if (!activeReplyToId) return;
          setReplyContext((previous) => {
            const previousReplyToId = String(previous?.replyToId ?? "").trim();
            return previousReplyToId === activeReplyToId ? null : previous;
          });
        };
        const createdAtSec = Math.ceil(Date.now() / 1e3);

        let draft: TextMessageDraft | ImageMessageDraft;
        if (imageFile) {
          const image = decodePrivateImage(mediaInfo);
          if (Either.isLeft(image)) {
            throw new Error("invalid private image");
          }
          draft = new ImageMessageDraft({
            to: contactPubHex,
            image: image.right,
            clientId,
            ...(replyTo === undefined ? {} : { replyTo }),
            ...(root === undefined ? {} : { root }),
          });
        } else {
          const content = decodeMessageText(text);
          if (Either.isLeft(content)) {
            throw new Error("invalid message text");
          }
          draft = new TextMessageDraft({
            to: contactPubHex,
            content: content.right,
            clientId,
            ...(replyTo === undefined ? {} : { replyTo }),
            ...(root === undefined ? {} : { root }),
          });
        }

        const pendingId = appendLocalNostrMessage({
          contactId: String(selectedContact.id),
          direction: "out",
          content: messageContent,
          wrapId: `pending:${clientId}`,
          rumorId: null,
          pubkey: myPubHex,
          createdAtSec,
          status: "pending",
          clientId,
          ...(activeReplyContext?.replyToId
            ? {
                replyToId: activeReplyContext.replyToId,
                replyToContent: activeReplyContext.replyToContent,
                rootMessageId:
                  String(activeReplyContext.rootMessageId ?? "").trim() ||
                  activeReplyContext.replyToId,
              }
            : {}),
        });
        triggerChatScrollToBottom(pendingId);
        if (options?.clearDraft !== false) {
          setChatDraft("");
          clearReplyContextIfCurrent();
        }

        const isOffline =
          typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          setStatus(t("chatQueued"));
          return;
        }

        void appendPushDebugLog("client", "chat send draft created", {
          clientId,
          contactPubHex,
          media: mediaInfo ? privateImageUploadDebugPayload(mediaInfo) : null,
          myPubHex,
          replyToId: activeReplyToId || null,
        });

        const exit =
          draft instanceof ImageMessageDraft
            ? await sendImageMessage(draft)
            : await sendTextMessage(draft);
        const failure = Exit.isFailure(exit)
          ? Cause.failureOption(exit.cause)
          : Option.none();

        void appendPushDebugLog("client", "chat send publish outcome", {
          clientId,
          failureTag: Option.isSome(failure) ? failure.value._tag : null,
          messageId: Exit.isSuccess(exit) ? exit.value.messageId : null,
          recipientWrapId: Exit.isSuccess(exit)
            ? exit.value.recipientCopy.wrapId
            : null,
          selfWrapId: Exit.isSuccess(exit) ? exit.value.selfCopy.wrapId : null,
          success: Exit.isSuccess(exit),
        });

        if (Exit.isFailure(exit)) {
          setStatus(t("chatQueued"));
          return;
        }

        if (pendingId) {
          updateLocalNostrMessage(pendingId, {
            status: "sent",
            wrapId: exit.value.selfCopy.wrapId,
            pubkey: myPubHex,
            rumorId: exit.value.messageId,
          });
        }
      } catch (e) {
        setStatus(`${t("errorPrefix")}: ${String(e ?? "unknown")}`);
      } finally {
        if (activeClientId) {
          activePublishClientIdsRef.current.delete(activeClientId);
        }
        setChatSendIsBusy(false);
      }
    },
    [
      activePublishClientIdsRef,
      appendLocalNostrMessage,
      chatDraft,
      chatSendIsBusy,
      currentNsec,
      replyContext,
      replyContextRef,
      route.kind,
      selectedContact,
      sendImageMessage,
      sendTextMessage,
      setReplyContext,
      setChatDraft,
      setChatSendIsBusy,
      setStatus,
      t,
      triggerChatScrollToBottom,
      updateLocalNostrMessage,
    ],
  );
};
