import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { makeLocalId } from "../../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import { wrapEventWithoutPushMarker } from "../../lib/pushWrappedEvent";
import type {
  ContactIdentityRowLike,
  LocalNostrReaction,
  NewLocalNostrReaction,
  PublishWrappedResult,
  UpdateLocalNostrReaction,
} from "../../types/appTypes";
import { resolveNostrChatIdentity } from "./contactIdentity";

interface UseSendReactionParams<
  TRoute extends { kind: string },
  TContact extends ContactIdentityRowLike,
> {
  appendLocalNostrReaction: (reaction: NewLocalNostrReaction) => string;
  currentNsec: string | null;
  publishWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    wrapForMe: NostrToolsEvent,
    wrapForContact: NostrToolsEvent,
  ) => Promise<PublishWrappedResult>;
  reactionsByMessageId: Map<string, LocalNostrReaction[]>;
  route: TRoute;
  selectedContact: TContact | null;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  softDeleteLocalNostrReaction: (id: string) => void;
  t: (key: string) => string;
  updateLocalNostrReaction: UpdateLocalNostrReaction;
}

interface SendReactionArgs {
  emoji: string;
  messageAuthorPubkey: string;
  messageKind?: 14 | 15;
  messageRumorId: string;
}

const toTrimmedText = (value: unknown): string => String(value ?? "").trim();

export const useSendReaction = <
  TRoute extends { kind: string },
  TContact extends ContactIdentityRowLike,
>({
  appendLocalNostrReaction,
  currentNsec,
  publishWrappedWithRetry,
  reactionsByMessageId,
  route,
  selectedContact,
  setStatus,
  softDeleteLocalNostrReaction,
  t,
  updateLocalNostrReaction,
}: UseSendReactionParams<TRoute, TContact>) => {
  return React.useCallback(
    async (args: SendReactionArgs) => {
      if (route.kind !== "chat") return;
      if (!selectedContact) return;
      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      const messageRumorId = toTrimmedText(args.messageRumorId);
      const emoji = String(args.emoji ?? "").trim();
      const messageAuthorPubkey = toTrimmedText(args.messageAuthorPubkey);
      const messageKind = args.messageKind === 15 ? 15 : 14;
      if (!messageRumorId || !emoji || !messageAuthorPubkey) return;

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

        // One reaction per user per message: find all my reactions
        const myReactions = (
          reactionsByMessageId.get(messageRumorId) ?? []
        ).filter(
          (reaction) => toTrimmedText(reaction.reactorPubkey) === myPubHex,
        );

        const hasSameEmoji = myReactions.some(
          (reaction) => toTrimmedText(reaction.emoji) === emoji,
        );

        const pool = await getSharedAppNostrPool();

        // Delete existing reactions if any (toggle-off or replace)
        if (myReactions.length > 0) {
          for (const reaction of myReactions) {
            softDeleteLocalNostrReaction(reaction.id);
          }

          const clientId = makeLocalId();
          const deleteTags: string[][] = [
            ["p", contactPubHex],
            ["p", myPubHex],
            ["p", messageAuthorPubkey],
          ];
          for (const reaction of myReactions) {
            const reactionId = toTrimmedText(reaction.wrapId);
            if (!reactionId) continue;
            deleteTags.push(["e", reactionId]);
          }
          deleteTags.push(["client", clientId]);

          const deleteEvent = {
            created_at: Math.ceil(Date.now() / 1e3),
            kind: 5,
            pubkey: myPubHex,
            tags: deleteTags,
            content: "",
          } satisfies UnsignedEvent;

          const wrapForMe = wrapEventWithoutPushMarker(
            deleteEvent,
            privBytes,
            myPubHex,
          );
          const wrapForContact = wrapEventWithoutPushMarker(
            deleteEvent,
            privBytes,
            contactPubHex,
          );

          const publishOutcome = await publishWrappedWithRetry(
            pool,
            NOSTR_RELAYS,
            wrapForMe,
            wrapForContact,
          );
          if (!publishOutcome.anySuccess) setStatus(t("chatQueued"));

          // Same emoji clicked → toggle off (remove reaction), done
          if (hasSameEmoji) return;
        }

        const clientId = makeLocalId();
        const reactionEvent = {
          created_at: Math.ceil(Date.now() / 1e3),
          kind: 7,
          pubkey: myPubHex,
          tags: [
            ["p", messageAuthorPubkey],
            ["p", contactPubHex],
            ["p", myPubHex],
            ["e", messageRumorId],
            ["k", String(messageKind)],
            ["client", clientId],
          ],
          content: emoji,
        } satisfies UnsignedEvent;
        const reactionRumorId = getEventHash(reactionEvent);

        const pendingReactionId = appendLocalNostrReaction({
          messageId: messageRumorId,
          reactorPubkey: myPubHex,
          emoji,
          createdAtSec: reactionEvent.created_at,
          wrapId: reactionRumorId,
          clientId,
          status: "pending",
        });

        const isOffline =
          typeof navigator !== "undefined" && navigator.onLine === false;
        if (isOffline) {
          setStatus(t("chatQueued"));
          return;
        }

        const wrapForMe = wrapEventWithoutPushMarker(
          reactionEvent,
          privBytes,
          myPubHex,
        );
        const wrapForContact = wrapEventWithoutPushMarker(
          reactionEvent,
          privBytes,
          contactPubHex,
        );

        const publishOutcome = await publishWrappedWithRetry(
          pool,
          NOSTR_RELAYS,
          wrapForMe,
          wrapForContact,
        );

        if (!pendingReactionId) return;
        if (!publishOutcome.anySuccess) {
          setStatus(t("chatQueued"));
          return;
        }

        updateLocalNostrReaction(pendingReactionId, {
          status: "sent",
          wrapId: reactionRumorId,
        });
      } catch (error) {
        setStatus(`${t("errorPrefix")}: ${String(error ?? "unknown")}`);
      }
    },
    [
      appendLocalNostrReaction,
      currentNsec,
      publishWrappedWithRetry,
      reactionsByMessageId,
      route.kind,
      selectedContact,
      setStatus,
      softDeleteLocalNostrReaction,
      t,
      updateLocalNostrReaction,
    ],
  );
};
