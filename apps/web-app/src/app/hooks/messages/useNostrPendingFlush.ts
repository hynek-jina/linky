import {
  ClientId,
  Emoji,
  Pubkey,
  ReactionDraft,
  RumorId,
} from "@linky/linkstr";
import { sendReactionAtom, useAtomSet } from "@linky/linkstr-react";
import { Exit, Schema } from "effect";
import React from "react";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { NOSTR_RELAYS } from "../../../utils/nostrRelays";
import { appendPushDebugLog } from "../../../utils/pushDebugLog";
import { isCashuNotificationMessage } from "../../lib/cashuNotificationCopy";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import {
  buildPrivateImageEventTags,
  parsePrivateImageMessage,
} from "../../lib/privateImageMessage";
import {
  wrapEventWithPushMarker,
  wrapEventWithoutPushMarker,
} from "../../lib/pushWrappedEvent";
import type {
  ContactIdentityRowLike,
  LocalNostrReaction,
  PublishWrappedResult,
  UpdateLocalNostrMessage,
  UpdateLocalNostrReaction,
  LocalNostrMessage,
} from "../../types/appTypes";
import { resolveNostrChatIdentity } from "./contactIdentity";

const isPubkey = Schema.is(Pubkey);
const isRumorId = Schema.is(RumorId);
const isEmoji = Schema.is(Emoji);
const isClientId = Schema.is(ClientId);

interface UseNostrPendingFlushParams<TContact extends ContactIdentityRowLike> {
  activePublishClientIdsRef: React.MutableRefObject<Set<string>>;
  contacts: readonly TContact[];
  currentNsec: string | null;
  enabled?: boolean;
  nostrMessagesLocal: LocalNostrMessage[];
  nostrReactionsLocal: LocalNostrReaction[];
  publishWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    wrapForMe: NostrToolsEvent,
    wrapForContact: NostrToolsEvent,
  ) => Promise<PublishWrappedResult>;
  updateLocalNostrReaction: UpdateLocalNostrReaction;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

export const useNostrPendingFlush = <TContact extends ContactIdentityRowLike>({
  activePublishClientIdsRef,
  contacts,
  currentNsec,
  enabled = true,
  nostrMessagesLocal,
  nostrReactionsLocal,
  publishWrappedWithRetry,
  updateLocalNostrReaction,
  updateLocalNostrMessage,
}: UseNostrPendingFlushParams<TContact>) => {
  const nostrPendingFlushRef = React.useRef<Promise<void> | null>(null);
  const linkstrReact = useAtomSet(sendReactionAtom, { mode: "promiseExit" });

  const flushPendingNostrMessages = React.useCallback(async () => {
    if (!enabled) return;
    if (!currentNsec) return;
    if (nostrPendingFlushRef.current) return;

    const pending = nostrMessagesLocal
      .filter((message) => {
        const clientId = String(message.clientId ?? "").trim();
        return (
          String(message.direction ?? "") === "out" &&
          String(message.status ?? "sent") === "pending" &&
          !message.localOnly &&
          (!clientId || !activePublishClientIdsRef.current.has(clientId))
        );
      })
      .sort((a, b) => (a.createdAtSec ?? 0) - (b.createdAtSec ?? 0));

    const pendingReactions = nostrReactionsLocal
      .filter((reaction) => String(reaction.status ?? "sent") === "pending")
      .sort((a, b) => (a.createdAtSec ?? 0) - (b.createdAtSec ?? 0));

    if (pending.length === 0 && pendingReactions.length === 0) return;

    const run = (async () => {
      try {
        const pool = await getSharedAppNostrPool();

        for (const message of pending) {
          const contact = contacts.find(
            (candidate) =>
              String(candidate.id ?? "") === String(message.contactId ?? ""),
          );
          if (!contact) continue;
          const identity = await resolveNostrChatIdentity(currentNsec, contact);
          if (!identity) continue;
          const { contactPubHex, myPubHex, privBytes } = identity;

          const tags: string[][] = [
            ["p", contactPubHex],
            ["p", myPubHex],
          ];
          const clientId = String(message.clientId ?? "").trim();
          if (clientId) tags.push(["client", clientId]);

          const replyToId = String(message.replyToId ?? "").trim();
          if (replyToId) {
            const rootId =
              String(message.rootMessageId ?? "").trim() || replyToId;
            if (rootId) tags.push(["e", rootId, "", "root"]);
            tags.push(["e", replyToId, "", "reply"]);
          }

          const editedFromId = String(message.editedFromId ?? "").trim();
          if (editedFromId) tags.push(["edited_from", editedFromId]);

          const mediaInfo = parsePrivateImageMessage(message.content);
          if (mediaInfo) {
            tags.push(...buildPrivateImageEventTags(mediaInfo));
          }

          const createdAt = Number(message.createdAtSec ?? 0) || 0;
          const baseEvent = {
            created_at: createdAt > 0 ? createdAt : Math.ceil(Date.now() / 1e3),
            kind: mediaInfo ? 15 : 14,
            pubkey: myPubHex,
            tags,
            content: mediaInfo ? mediaInfo.url : String(message.content ?? ""),
          } satisfies UnsignedEvent;

          const wrapForMe = wrapEventWithoutPushMarker(
            baseEvent,
            privBytes,
            myPubHex,
          );
          const wrapForContact = isCashuNotificationMessage(baseEvent.content)
            ? wrapEventWithoutPushMarker(baseEvent, privBytes, contactPubHex)
            : wrapEventWithPushMarker(baseEvent, privBytes, contactPubHex);

          void appendPushDebugLog(
            "client",
            "chat pending flush wraps created",
            {
              clientId: clientId || null,
              contactId: String(message.contactId ?? "").trim() || null,
              contactPubHex,
              myPubHex,
              rumorId: String(message.rumorId ?? "").trim() || null,
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
            },
          );

          const publishOutcome = await publishWrappedWithRetry(
            pool,
            NOSTR_RELAYS,
            wrapForMe,
            wrapForContact,
          );

          void appendPushDebugLog(
            "client",
            "chat pending flush publish outcome",
            {
              anySuccess: publishOutcome.anySuccess,
              clientId: clientId || null,
              contactId: String(message.contactId ?? "").trim() || null,
              error: publishOutcome.error,
              rumorId: String(message.rumorId ?? "").trim() || null,
              wrapForContactId: String(wrapForContact.id ?? "").trim() || null,
              wrapForMeId: String(wrapForMe.id ?? "").trim() || null,
            },
          );

          if (!publishOutcome.anySuccess) continue;

          updateLocalNostrMessage(String(message.id ?? ""), {
            status: "sent",
            wrapId: String(wrapForMe.id ?? ""),
            pubkey: myPubHex,
          });
        }

        for (const reaction of pendingReactions) {
          const messageRumorId = String(reaction.messageId ?? "").trim();
          if (!isRumorId(messageRumorId)) continue;

          const targetMessage = nostrMessagesLocal.find(
            (message) =>
              String(message.rumorId ?? "").trim() === messageRumorId,
          );
          if (!targetMessage) continue;

          const contact = contacts.find(
            (candidate) =>
              String(candidate.id ?? "") ===
              String(targetMessage.contactId ?? ""),
          );
          if (!contact) continue;
          const identity = await resolveNostrChatIdentity(currentNsec, contact);
          if (!identity || !isPubkey(identity.contactPubHex)) continue;
          const { contactPubHex } = identity;

          const emoji = String(reaction.emoji ?? "").trim();
          if (!isEmoji(emoji)) continue;

          const targetAuthor = String(targetMessage.pubkey ?? "").trim();
          const clientId = String(reaction.clientId ?? "").trim();
          const exit = await linkstrReact(
            new ReactionDraft({
              to: contactPubHex,
              target: messageRumorId,
              targetKind: parsePrivateImageMessage(targetMessage.content)
                ? "image"
                : "text",
              targetAuthor: isPubkey(targetAuthor)
                ? targetAuthor
                : contactPubHex,
              emoji,
              ...(isClientId(clientId) ? { clientId } : {}),
            }),
          );
          if (Exit.isFailure(exit)) continue;

          updateLocalNostrReaction(String(reaction.id ?? ""), {
            status: "sent",
            wrapId: exit.value.reactionId,
          });
        }
      } catch {
        return;
      } finally {
        nostrPendingFlushRef.current = null;
      }
    })();

    nostrPendingFlushRef.current = run;
    await run;
  }, [
    activePublishClientIdsRef,
    contacts,
    currentNsec,
    enabled,
    linkstrReact,
    nostrMessagesLocal,
    nostrReactionsLocal,
    publishWrappedWithRetry,
    updateLocalNostrReaction,
    updateLocalNostrMessage,
  ]);

  React.useEffect(() => {
    const handleOnline = () => {
      void flushPendingNostrMessages();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [flushPendingNostrMessages]);

  React.useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void flushPendingNostrMessages();
    }
  }, [currentNsec, contacts, flushPendingNostrMessages]);
};
