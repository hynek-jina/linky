import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../../utils/nostrRelays";
import { appendPushDebugLog } from "../../../utils/pushDebugLog";
import { makeLocalId } from "../../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import {
  buildPrivateImageEventTags,
  createPrivateImageSendPayload,
  parsePrivateImageMessage,
  privateImageUploadDebugPayload,
} from "../../lib/privateImageMessage";
import {
  wrapEventWithPushMarker,
  wrapEventWithoutPushMarker,
} from "../../lib/pushWrappedEvent";
import type {
  ContactIdentityRowLike,
  NewLocalNostrMessage,
  PublishWrappedResult,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";
import { resolveNostrChatIdentity } from "./contactIdentity";

type AppendLocalNostrMessage = (message: NewLocalNostrMessage) => string;

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
  publishWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    wrapForMe: NostrToolsEvent,
    wrapForContact: NostrToolsEvent,
  ) => Promise<PublishWrappedResult>;
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
  publishWrappedWithRetry,
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
        const { getEventHash } = await import("nostr-tools");
        const identity = await resolveNostrChatIdentity(
          currentNsec,
          selectedContact,
        );
        if (!identity) {
          setStatus(t("chatMissingContactNpub"));
          return;
        }
        const { contactPubHex, myPubHex, privBytes } = identity;

        const clientId = makeLocalId();
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
        const clearReplyContextIfCurrent = () => {
          if (!activeReplyToId) return;
          setReplyContext((previous) => {
            const previousReplyToId = String(previous?.replyToId ?? "").trim();
            return previousReplyToId === activeReplyToId ? null : previous;
          });
        };
        const tags: string[][] = [
          ["p", contactPubHex],
          ["p", myPubHex],
          ["client", clientId],
        ];
        if (mediaInfo) {
          tags.push(...buildPrivateImageEventTags(mediaInfo));
        }

        if (activeReplyContext?.replyToId) {
          const rootId =
            String(activeReplyContext.rootMessageId ?? "").trim() ||
            String(activeReplyContext.replyToId ?? "").trim();
          const replyId = String(activeReplyContext.replyToId ?? "").trim();
          if (rootId) tags.push(["e", rootId, "", "root"]);
          if (replyId) tags.push(["e", replyId, "", "reply"]);
        }

        const baseEvent = {
          created_at: Math.ceil(Date.now() / 1e3),
          kind: mediaInfo ? 15 : 14,
          pubkey: myPubHex,
          tags,
          content: mediaInfo ? mediaInfo.url : text,
        } satisfies UnsignedEvent;
        const rumorId = getEventHash(baseEvent);

        const pendingId = appendLocalNostrMessage({
          contactId: String(selectedContact.id),
          direction: "out",
          content: messageContent,
          wrapId: `pending:${clientId}`,
          rumorId,
          pubkey: myPubHex,
          createdAtSec: baseEvent.created_at,
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

        void appendPushDebugLog("client", "chat send wraps created", {
          clientId,
          contactPubHex,
          media: mediaInfo ? privateImageUploadDebugPayload(mediaInfo) : null,
          myPubHex,
          replyToId: activeReplyToId || null,
          rumorId,
          wrapForContactId: String(wrapForContact.id ?? "").trim() || null,
          wrapForContactPtags: wrapForContact.tags
            .filter((tag) => Array.isArray(tag) && tag[0] === "p")
            .map((tag) => String(tag[1] ?? "").trim())
            .filter(Boolean),
          wrapForMeId: String(wrapForMe.id ?? "").trim() || null,
          wrapForMePtags: wrapForMe.tags
            .filter((tag) => Array.isArray(tag) && tag[0] === "p")
            .map((tag) => String(tag[1] ?? "").trim())
            .filter(Boolean),
        });

        const pool = await getSharedAppNostrPool();
        const publishOutcome = await publishWrappedWithRetry(
          pool,
          NOSTR_RELAYS,
          wrapForMe,
          wrapForContact,
        );

        void appendPushDebugLog("client", "chat send publish outcome", {
          anySuccess: publishOutcome.anySuccess,
          clientId,
          error: publishOutcome.error,
          rumorId,
          wrapForContactId: String(wrapForContact.id ?? "").trim() || null,
          wrapForMeId: String(wrapForMe.id ?? "").trim() || null,
        });

        if (!publishOutcome.anySuccess) {
          setStatus(t("chatQueued"));
          return;
        }

        if (pendingId) {
          updateLocalNostrMessage(pendingId, {
            status: "sent",
            wrapId: String(wrapForMe.id ?? ""),
            pubkey: myPubHex,
            rumorId,
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
      publishWrappedWithRetry,
      replyContext,
      replyContextRef,
      route.kind,
      selectedContact,
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
