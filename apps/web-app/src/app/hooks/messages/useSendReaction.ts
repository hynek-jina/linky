import {
  ClientId,
  Emoji,
  Pubkey,
  ReactionDraft,
  RetractionDraft,
  RumorId,
} from "@linky/linkstr";
import {
  retractReactionAtom,
  sendReactionAtom,
  useAtomSet,
} from "@linky/linkstr-react";
import { Cause, Exit, Option, Schema } from "effect";
import React from "react";
import { makeLocalId } from "../../../utils/validation";
import type {
  ContactIdentityRowLike,
  LocalNostrReaction,
  NewLocalNostrReaction,
  UpdateLocalNostrReaction,
} from "../../types/appTypes";
import { resolveNostrChatIdentity } from "./contactIdentity";

const isPubkey = Schema.is(Pubkey);
const isRumorId = Schema.is(RumorId);
const isEmoji = Schema.is(Emoji);

type AppendLocalNostrReaction = (reaction: NewLocalNostrReaction) => string;

interface SendReactionArgs {
  emoji: string;
  messageAuthorPubkey: string;
  messageKind?: 14 | 15;
  messageRumorId: string;
}

interface UseSendReactionParams<
  TRoute extends { kind: string },
  TContact extends ContactIdentityRowLike,
> {
  appendLocalNostrReaction: AppendLocalNostrReaction;
  currentNsec: string | null;
  reactionsByMessageId: Map<string, LocalNostrReaction[]>;
  route: TRoute;
  selectedContact: TContact | null;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  softDeleteLocalNostrReaction: (id: string) => void;
  t: (key: string) => string;
  updateLocalNostrReaction: UpdateLocalNostrReaction;
}

export const useSendReaction = <
  TRoute extends { kind: string },
  TContact extends ContactIdentityRowLike,
>({
  appendLocalNostrReaction,
  currentNsec,
  reactionsByMessageId,
  route,
  selectedContact,
  setStatus,
  softDeleteLocalNostrReaction,
  t,
  updateLocalNostrReaction,
}: UseSendReactionParams<TRoute, TContact>) => {
  const linkstrReact = useAtomSet(sendReactionAtom, { mode: "promiseExit" });
  const linkstrRetract = useAtomSet(retractReactionAtom, {
    mode: "promiseExit",
  });

  return React.useCallback(
    async (args: SendReactionArgs) => {
      if (route.kind !== "chat") return;
      if (!selectedContact) return;
      if (!currentNsec) {
        setStatus(t("profileMissingNpub"));
        return;
      }

      const messageRumorId = args.messageRumorId.trim();
      const emoji = String(args.emoji ?? "").trim();
      const messageAuthorPubkey = args.messageAuthorPubkey.trim();
      if (
        !isRumorId(messageRumorId) ||
        !isEmoji(emoji) ||
        !isPubkey(messageAuthorPubkey)
      ) {
        return;
      }

      try {
        const identity = await resolveNostrChatIdentity(
          currentNsec,
          selectedContact,
        );
        if (!identity || !isPubkey(identity.contactPubHex)) {
          setStatus(t("chatMissingContactNpub"));
          return;
        }
        const { contactPubHex, myPubHex } = identity;
        const isOffline =
          typeof navigator !== "undefined" && navigator.onLine === false;

        // One reaction per user per message: replace mine, or toggle off on
        // the same emoji. UX policy lives here, not in linkstr.
        const myReactions = (
          reactionsByMessageId.get(messageRumorId) ?? []
        ).filter(
          (reaction) =>
            String(reaction.reactorPubkey ?? "").trim() === myPubHex,
        );
        const hasSameEmoji = myReactions.some(
          (reaction) => String(reaction.emoji ?? "").trim() === emoji,
        );

        if (myReactions.length > 0) {
          for (const reaction of myReactions) {
            softDeleteLocalNostrReaction(reaction.id);
          }
          const [head, ...tail] = myReactions
            .map((reaction) => String(reaction.wrapId ?? "").trim())
            .filter(isRumorId);
          if (head !== undefined && !isOffline) {
            const exit = await linkstrRetract(
              new RetractionDraft({
                to: contactPubHex,
                reactionIds: [head, ...tail],
              }),
            );
            if (Exit.isFailure(exit)) setStatus(t("chatQueued"));
          }
          if (hasSameEmoji) return;
        }

        const clientId = ClientId.make(makeLocalId());
        const pendingReactionId = appendLocalNostrReaction({
          messageId: messageRumorId,
          reactorPubkey: myPubHex,
          emoji,
          createdAtSec: Math.ceil(Date.now() / 1e3),
          wrapId: `pending:${clientId}`,
          clientId,
          status: "pending",
        });

        if (isOffline) {
          setStatus(t("chatQueued"));
          return;
        }

        const exit = await linkstrReact(
          new ReactionDraft({
            to: contactPubHex,
            target: messageRumorId,
            targetKind: args.messageKind === 15 ? "image" : "text",
            targetAuthor: messageAuthorPubkey,
            emoji,
            clientId,
          }),
        );

        if (Exit.isSuccess(exit)) {
          if (pendingReactionId) {
            updateLocalNostrReaction(pendingReactionId, {
              status: "sent",
              wrapId: exit.value.reactionId,
            });
          }
          return;
        }

        const failure = Cause.failureOption(exit.cause);
        if (
          Option.isSome(failure) &&
          failure.value._tag !== "LinkstrNotConfigured"
        ) {
          // Row stays pending for the flush; remember the rumor id so the
          // relay echo can still reconcile by wrapId.
          if (pendingReactionId) {
            updateLocalNostrReaction(pendingReactionId, {
              wrapId: failure.value.rumorId,
            });
          }
          setStatus(t("chatQueued"));
          return;
        }
        setStatus(`${t("errorPrefix")}: ${Cause.pretty(exit.cause)}`);
      } catch (e) {
        setStatus(`${t("errorPrefix")}: ${String(e ?? "unknown")}`);
      }
    },
    [
      appendLocalNostrReaction,
      currentNsec,
      linkstrReact,
      linkstrRetract,
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
