import React from "react";
import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { makeLocalId } from "../../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import type { LocalNostrMessage } from "../../types/appTypes";

type AppendLocalNostrMessage = (
  message: Omit<LocalNostrMessage, "id" | "status"> & {
    status?: "sent" | "pending";
  },
) => string;

type UpdateLocalNostrMessage = (
  id: string,
  updates: Partial<
    Pick<
      LocalNostrMessage,
      "wrapId" | "status" | "pubkey" | "content" | "clientId" | "localOnly"
    >
  >,
) => void;

interface UseSendChatMessageParams<
  TRoute extends { kind: string },
  TContact extends { id?: unknown; npub?: unknown },
> {
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
  ) => Promise<{ anySuccess: boolean; error: unknown | null }>;
  route: TRoute;
  selectedContact: TContact | null;
  setChatDraft: React.Dispatch<React.SetStateAction<string>>;
  setChatSendIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  triggerChatScrollToBottom: (messageId?: string) => void;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

export const useSendChatMessage = <
  TRoute extends { kind: string },
  TContact extends { id?: unknown; npub?: unknown },
>({
  appendLocalNostrMessage,
  chatDraft,
  chatSeenWrapIdsRef,
  chatSendIsBusy,
  currentNsec,
  publishWrappedWithRetry,
  route,
  selectedContact,
  setChatDraft,
  setChatSendIsBusy,
  setStatus,
  t,
  triggerChatScrollToBottom,
  updateLocalNostrMessage,
}: UseSendChatMessageParams<TRoute, TContact>) => {
  return React.useCallback(async () => {
    if (route.kind !== "chat") return;
    if (!selectedContact) return;

    const text = chatDraft.trim();
    if (!text) return;

    const contactNpub = String(selectedContact.npub ?? "").trim();
    if (!contactNpub) return;
    if (!currentNsec) {
      setStatus(t("profileMissingNpub"));
      return;
    }

    if (chatSendIsBusy) return;
    setChatSendIsBusy(true);

    try {
      const { nip19, getPublicKey } = await import("nostr-tools");
      const { wrapEvent } = await import("nostr-tools/nip59");

      const decodedMe = nip19.decode(currentNsec);
      if (decodedMe.type !== "nsec") throw new Error("invalid nsec");
      const privBytes = decodedMe.data as Uint8Array;
      const myPubHex = getPublicKey(privBytes);

      const decodedContact = nip19.decode(contactNpub);
      if (decodedContact.type !== "npub") throw new Error("invalid npub");
      const contactPubHex = decodedContact.data as string;

      const clientId = makeLocalId();
      const baseEvent = {
        created_at: Math.ceil(Date.now() / 1e3),
        kind: 14,
        pubkey: myPubHex,
        tags: [
          ["p", contactPubHex],
          ["p", myPubHex],
          ["client", clientId],
        ],
        content: text,
      } satisfies UnsignedEvent;

      const pendingId = appendLocalNostrMessage({
        contactId: String(selectedContact.id),
        direction: "out",
        content: text,
        wrapId: `pending:${clientId}`,
        rumorId: null,
        pubkey: myPubHex,
        createdAtSec: baseEvent.created_at,
        status: "pending",
        clientId,
      });
      triggerChatScrollToBottom(pendingId);

      const isOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (isOffline) {
        setChatDraft("");
        setStatus(t("chatQueued"));
        return;
      }

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

      const pool = await getSharedAppNostrPool();
      const publishOutcome = await publishWrappedWithRetry(
        pool,
        NOSTR_RELAYS,
        wrapForMe,
        wrapForContact,
      );

      if (!publishOutcome.anySuccess) {
        setChatDraft("");
        setStatus(t("chatQueued"));
        return;
      }

      chatSeenWrapIdsRef.current.add(String(wrapForMe.id ?? ""));
      if (pendingId) {
        updateLocalNostrMessage(pendingId, {
          status: "sent",
          wrapId: String(wrapForMe.id ?? ""),
          pubkey: myPubHex,
        });
      }

      setChatDraft("");
    } catch (e) {
      setStatus(`${t("errorPrefix")}: ${String(e ?? "unknown")}`);
    } finally {
      setChatSendIsBusy(false);
    }
  }, [
    appendLocalNostrMessage,
    chatDraft,
    chatSeenWrapIdsRef,
    chatSendIsBusy,
    currentNsec,
    publishWrappedWithRetry,
    route.kind,
    selectedContact,
    setChatDraft,
    setChatSendIsBusy,
    setStatus,
    t,
    triggerChatScrollToBottom,
    updateLocalNostrMessage,
  ]);
};
