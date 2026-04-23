import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { appendPushDebugLog } from "../../../utils/pushDebugLog";
import { makeLocalId } from "../../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
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
import { readUnknownPubkeyHex } from "./contactIdentity";

type AppendLocalNostrMessage = (message: NewLocalNostrMessage) => string;

export interface ReplyContext {
  rootMessageId: string | null;
  replyToContent: string | null;
  replyToId: string;
}

interface SendChatMessageOptions {
  clearDraft?: boolean;
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
  chatSeenWrapIdsRef: React.MutableRefObject<Set<string>>;
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
  chatSeenWrapIdsRef,
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
      if (route.kind !== "chat" && route.kind !== "contactPay") return;
      if (!selectedContact) return;

      const text = String(options?.text ?? chatDraft).trim();
      if (!text) return;

      const contactNpub = normalizeNpubIdentifier(selectedContact.npub);
      const unknownPubkeyHex = readUnknownPubkeyHex(selectedContact);
      if (!contactNpub && !unknownPubkeyHex) {
        setStatus(t("chatMissingContactNpub"));
        return;
      }
      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      if (chatSendIsBusy) return;
      setChatSendIsBusy(true);

      let activeClientId: string | null = null;

      try {
        const { nip19, getEventHash, getPublicKey } =
          await import("nostr-tools");

        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        )
          throw new Error("invalid nsec");
        const privBytes = decodedMe.data;
        const myPubHex = getPublicKey(privBytes);

        let contactPubHex = unknownPubkeyHex;

        if (!contactPubHex) {
          if (!contactNpub) {
            setStatus(t("chatMissingContactNpub"));
            return;
          }
          let decodedContact: ReturnType<typeof nip19.decode> | null = null;
          try {
            decodedContact = nip19.decode(contactNpub);
          } catch {
            decodedContact = null;
          }
          if (
            !decodedContact ||
            decodedContact.type !== "npub" ||
            typeof decodedContact.data !== "string"
          ) {
            setStatus(t("chatMissingContactNpub"));
            return;
          }
          contactPubHex = decodedContact.data;
        }

        const clientId = makeLocalId();
        activeClientId = clientId;
        activePublishClientIdsRef.current.add(clientId);
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
          kind: 14,
          pubkey: myPubHex,
          tags,
          content: text,
        } satisfies UnsignedEvent;
        const rumorId = getEventHash(baseEvent);

        const pendingId = appendLocalNostrMessage({
          contactId: String(selectedContact.id),
          direction: "out",
          content: text,
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

        await appendPushDebugLog("client", "chat send wraps created", {
          clientId,
          contactPubHex,
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

        await appendPushDebugLog("client", "chat send publish outcome", {
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

        chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));
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
      chatSeenWrapIdsRef,
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
