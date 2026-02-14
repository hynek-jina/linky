import React from "react";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import type {
  ContactIdentityRowLike,
  LocalNostrReaction,
  PublishWrappedResult,
  UpdateLocalNostrMessage,
  UpdateLocalNostrReaction,
  LocalNostrMessage,
} from "../../types/appTypes";

interface UseNostrPendingFlushParams<TContact extends ContactIdentityRowLike> {
  chatSeenWrapIdsRef: React.MutableRefObject<Set<string>>;
  contacts: readonly TContact[];
  currentNsec: string | null;
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
  chatSeenWrapIdsRef,
  contacts,
  currentNsec,
  nostrMessagesLocal,
  nostrReactionsLocal,
  publishWrappedWithRetry,
  updateLocalNostrReaction,
  updateLocalNostrMessage,
}: UseNostrPendingFlushParams<TContact>) => {
  const nostrPendingFlushRef = React.useRef<Promise<void> | null>(null);

  const flushPendingNostrMessages = React.useCallback(async () => {
    if (!currentNsec) return;
    if (nostrPendingFlushRef.current) return;

    const pending = nostrMessagesLocal
      .filter(
        (message) =>
          String(message.direction ?? "") === "out" &&
          String(message.status ?? "sent") === "pending" &&
          !message.localOnly,
      )
      .sort((a, b) => (a.createdAtSec ?? 0) - (b.createdAtSec ?? 0));

    if (pending.length === 0) return;

    const run = (async () => {
      try {
        const { nip19, getEventHash, getPublicKey } =
          await import("nostr-tools");
        const { wrapEvent } = await import("nostr-tools/nip59");

        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        )
          return;
        const privBytes = decodedMe.data;
        const myPubHex = getPublicKey(privBytes);

        const pool = await getSharedAppNostrPool();

        for (const message of pending) {
          const contact = contacts.find(
            (candidate) =>
              String(candidate.id ?? "") === String(message.contactId ?? ""),
          );
          const contactNpub = normalizeNpubIdentifier(contact?.npub);
          if (!contactNpub) continue;

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
            continue;
          }
          const contactPubHex = decodedContact.data;

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

          const createdAt = Number(message.createdAtSec ?? 0) || 0;
          const baseEvent = {
            created_at: createdAt > 0 ? createdAt : Math.ceil(Date.now() / 1e3),
            kind: 14,
            pubkey: myPubHex,
            tags,
            content: String(message.content ?? ""),
          } satisfies UnsignedEvent;

          const wrapForMe = wrapEvent(
            baseEvent,
            privBytes,
            myPubHex,
          ) as NostrToolsEvent;
          const wrapForContact = wrapEvent(
            baseEvent,
            privBytes,
            contactPubHex,
          ) as NostrToolsEvent;

          const publishOutcome = await publishWrappedWithRetry(
            pool,
            NOSTR_RELAYS,
            wrapForMe,
            wrapForContact,
          );

          if (!publishOutcome.anySuccess) continue;

          chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));
          updateLocalNostrMessage(String(message.id ?? ""), {
            status: "sent",
            wrapId: String(wrapForMe.id ?? ""),
            pubkey: myPubHex,
          });
        }

        const pendingReactions = nostrReactionsLocal
          .filter((reaction) => String(reaction.status ?? "sent") === "pending")
          .sort((a, b) => (a.createdAtSec ?? 0) - (b.createdAtSec ?? 0));

        for (const reaction of pendingReactions) {
          const messageRumorId = String(reaction.messageId ?? "").trim();
          if (!messageRumorId) continue;

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
          const contactNpub = normalizeNpubIdentifier(contact?.npub);
          if (!contactNpub) continue;

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
            continue;
          }
          const contactPubHex = decodedContact.data;

          const emoji = String(reaction.emoji ?? "").trim();
          if (!emoji) continue;

          const clientId = String(reaction.clientId ?? "").trim();
          const tags: string[][] = [
            ["p", String(targetMessage.pubkey ?? "").trim() || contactPubHex],
            ["p", contactPubHex],
            ["p", myPubHex],
            ["e", messageRumorId],
            ["k", "14"],
          ];
          if (clientId) tags.push(["client", clientId]);

          const createdAt = Number(reaction.createdAtSec ?? 0) || 0;
          const reactionEvent = {
            created_at: createdAt > 0 ? createdAt : Math.ceil(Date.now() / 1e3),
            kind: 7,
            pubkey: myPubHex,
            tags,
            content: emoji,
          } satisfies UnsignedEvent;
          const reactionRumorId = getEventHash(reactionEvent);

          const wrapForMe = wrapEvent(
            reactionEvent,
            privBytes,
            myPubHex,
          ) as NostrToolsEvent;
          const wrapForContact = wrapEvent(
            reactionEvent,
            privBytes,
            contactPubHex,
          ) as NostrToolsEvent;

          const publishOutcome = await publishWrappedWithRetry(
            pool,
            NOSTR_RELAYS,
            wrapForMe,
            wrapForContact,
          );
          if (!publishOutcome.anySuccess) continue;

          updateLocalNostrReaction(String(reaction.id ?? ""), {
            status: "sent",
            wrapId: reactionRumorId,
          });
        }
      } finally {
        nostrPendingFlushRef.current = null;
      }
    })();

    nostrPendingFlushRef.current = run;
    await run;
  }, [
    chatSeenWrapIdsRef,
    contacts,
    currentNsec,
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
