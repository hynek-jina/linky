import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import {
  getInitialNostrIdentitySource,
  getInitialNostrIdentitySwitchedAtSec,
} from "../../../utils/storage";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import type {
  ContactIdentityRowLike,
  LocalNostrMessage,
  LocalNostrReaction,
  NewLocalNostrMessage,
  NewLocalNostrReaction,
  PaymentLogData,
  UpdateLocalNostrMessage,
  UpdateLocalNostrReaction,
} from "../../types/appTypes";
import {
  normalizePubkeyHex,
  readUnknownPubkeyHex,
  resolveNostrChatIdentity,
} from "./contactIdentity";
import type { KnownNostrMessageIdentityIndex } from "./messageHelpers";
import {
  createNostrInboxSeenState,
  processNostrInboxWrap,
  resolveNostrInboxRelays,
} from "./nostrInboxPipeline";

const normalizeText = (value: unknown): string => String(value ?? "").trim();

interface UseChatNostrSyncEffectParams {
  appendLocalNostrMessage: (message: NewLocalNostrMessage) => string;
  appendLocalNostrReaction: (reaction: NewLocalNostrReaction) => string;
  chatMessages: readonly LocalNostrMessage[];
  chatMessagesLatestRef: React.MutableRefObject<LocalNostrMessage[]>;
  currentNsec: string | null;
  enabled?: boolean;
  knownNostrMessageIdentityIndex: KnownNostrMessageIdentityIndex;
  logPayStep: (step: string, data?: PaymentLogData) => void;
  nostrFetchRelays: string[];
  nostrMessageWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrReactionWrapIdsRef: React.MutableRefObject<Set<string>>;
  nostrReactionsLatestRef: React.MutableRefObject<LocalNostrReaction[]>;
  route: { kind: string };
  selectedContact: ContactIdentityRowLike | null;
  softDeleteLocalNostrReactionsByWrapIds: (wrapIds: readonly string[]) => void;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
  updateLocalNostrReaction: UpdateLocalNostrReaction;
}

export const useChatNostrSyncEffect = ({
  appendLocalNostrMessage,
  appendLocalNostrReaction,
  chatMessages,
  chatMessagesLatestRef,
  currentNsec,
  enabled = true,
  knownNostrMessageIdentityIndex,
  logPayStep,
  nostrFetchRelays,
  nostrMessageWrapIdsRef,
  nostrReactionWrapIdsRef,
  nostrReactionsLatestRef,
  route,
  selectedContact,
  softDeleteLocalNostrReactionsByWrapIds,
  updateLocalNostrMessage,
  updateLocalNostrReaction,
}: UseChatNostrSyncEffectParams) => {
  const latestValuesRef = React.useRef({
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    knownNostrMessageIdentityIndex,
    logPayStep,
    nostrMessageWrapIdsRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    selectedContact,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  });

  React.useEffect(() => {
    latestValuesRef.current = {
      appendLocalNostrMessage,
      appendLocalNostrReaction,
      chatMessages,
      chatMessagesLatestRef,
      knownNostrMessageIdentityIndex,
      logPayStep,
      nostrMessageWrapIdsRef,
      nostrReactionWrapIdsRef,
      nostrReactionsLatestRef,
      selectedContact,
      softDeleteLocalNostrReactionsByWrapIds,
      updateLocalNostrMessage,
      updateLocalNostrReaction,
    };
  }, [
    appendLocalNostrMessage,
    appendLocalNostrReaction,
    chatMessages,
    chatMessagesLatestRef,
    knownNostrMessageIdentityIndex,
    logPayStep,
    nostrMessageWrapIdsRef,
    nostrReactionWrapIdsRef,
    nostrReactionsLatestRef,
    selectedContact,
    softDeleteLocalNostrReactionsByWrapIds,
    updateLocalNostrMessage,
    updateLocalNostrReaction,
  ]);

  const selectedContactId = normalizeText(selectedContact?.id);
  const selectedContactNpub = normalizeText(selectedContact?.npub);
  const selectedContactUnknownPubkeyHex =
    readUnknownPubkeyHex(selectedContact) ?? "";
  const relaySignature = resolveNostrInboxRelays(nostrFetchRelays).join("\n");

  React.useEffect(() => {
    if (!enabled || route.kind !== "chat" || !currentNsec) return;
    const selectedContactAtStart = latestValuesRef.current.selectedContact;
    if (!selectedContactAtStart) return;

    let cancelled = false;
    const relays = relaySignature.split("\n");
    const identitySinceSec =
      getInitialNostrIdentitySource() === "custom"
        ? getInitialNostrIdentitySwitchedAtSec()
        : null;
    const seen = createNostrInboxSeenState();
    for (const message of latestValuesRef.current.chatMessages) {
      const wrapId = normalizeText(message.wrapId);
      if (wrapId) seen.wrapIds.add(wrapId);
    }

    const run = async () => {
      try {
        const { unwrapEvent } = await import("nostr-tools/nip17");
        const resolvedIdentity = await resolveNostrChatIdentity(
          currentNsec,
          selectedContactAtStart,
        );
        if (!resolvedIdentity) return;
        const { contactPubHex, myPubHex, privBytes } = resolvedIdentity;
        const normalizedContactPubkey = normalizePubkeyHex(contactPubHex);
        if (!normalizedContactPubkey) return;

        const processWrap = (
          wrap: NostrToolsEvent,
          delivery: "backfill" | "live",
        ) => {
          try {
            const latest = latestValuesRef.current;
            processNostrInboxWrap({
              delivery,
              effects: {
                acknowledgeOutgoingMessage: (acknowledgement) => {
                  latest.logPayStep("message-ack", {
                    contactId: acknowledgement.contactId,
                    clientId: acknowledgement.clientId,
                    wrapId: acknowledgement.wrapId,
                  });
                },
                appendMessage: latest.appendLocalNostrMessage,
                appendReaction: latest.appendLocalNostrReaction,
                deleteReactionsByWrapIds:
                  latest.softDeleteLocalNostrReactionsByWrapIds,
                updateMessage: latest.updateLocalNostrMessage,
                updateReaction: latest.updateLocalNostrReaction,
              },
              identity: {
                identitySinceSec,
                privateKey: privBytes,
                pubkey: myPubHex,
              },
              policy: {
                handlesSpecialEvents: false,
                isBlockedIncomingPubkey: () => false,
                isCancelled: () => cancelled,
                ownsConversation: ({ contactId }) =>
                  contactId === normalizeText(selectedContactAtStart.id),
                resolveConversation: (peerPubkey) =>
                  normalizePubkeyHex(peerPubkey) === normalizedContactPubkey
                    ? { contactId: normalizeText(selectedContactAtStart.id) }
                    : null,
                resolveUnknownConversation: () => null,
              },
              seen,
              snapshot: {
                knownMessageIdentities: latest.knownNostrMessageIdentityIndex,
                messageWrapIds: latest.nostrMessageWrapIdsRef.current,
                messages: latest.chatMessagesLatestRef.current,
                reactionWrapIds: latest.nostrReactionWrapIdsRef.current,
                reactions: latest.nostrReactionsLatestRef.current,
              },
              unwrapEvent,
              wrap,
            });
          } catch {
            return;
          }
        };

        const pool = await getSharedAppNostrPool();
        const existing = await pool.querySync(
          relays,
          { kinds: [1059], "#p": [myPubHex], limit: 50 },
          { maxWait: 5000 },
        );
        if (!cancelled) {
          for (const event of existing) processWrap(event, "backfill");
        }

        const sub = pool.subscribe(
          relays,
          { kinds: [1059], "#p": [myPubHex] },
          {
            onevent: (event: NostrToolsEvent) => {
              if (!cancelled) processWrap(event, "live");
            },
          },
        );
        return () => {
          void sub.close("chat closed");
        };
      } catch {
        return;
      }
    };

    let cleanup: (() => void) | undefined;
    void run().then((nextCleanup) => {
      if (cancelled) {
        nextCleanup?.();
        return;
      }
      cleanup = nextCleanup;
    });

    return () => {
      cancelled = true;
      cleanup?.();
      cleanup = undefined;
    };
  }, [
    currentNsec,
    enabled,
    relaySignature,
    route.kind,
    selectedContactId,
    selectedContactNpub,
    selectedContactUnknownPubkeyHex,
  ]);
};
