import type { Event as NostrToolsEvent, UnsignedEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { makeLocalId } from "../../../utils/validation";
import { getSharedAppNostrPool, type AppNostrPool } from "../../lib/nostrPool";
import type {
  ContactIdentityRowLike,
  PublishWrappedResult,
  UpdateLocalNostrMessage,
} from "../../types/appTypes";

export interface EditChatContext {
  messageId: string;
  originalContent: string;
  rumorId: string;
}

interface UseEditChatMessageParams<
  TRoute extends { kind: string },
  TContact extends ContactIdentityRowLike,
> {
  chatDraft: string;
  chatSendIsBusy: boolean;
  currentNsec: string | null;
  editContext: EditChatContext | null;
  publishWrappedWithRetry: (
    pool: AppNostrPool,
    relays: string[],
    wrapForMe: NostrToolsEvent,
    wrapForContact: NostrToolsEvent,
  ) => Promise<PublishWrappedResult>;
  route: TRoute;
  selectedContact: TContact | null;
  setChatDraft: React.Dispatch<React.SetStateAction<string>>;
  setChatSendIsBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setEditContext: React.Dispatch<React.SetStateAction<EditChatContext | null>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string) => string;
  updateLocalNostrMessage: UpdateLocalNostrMessage;
}

export const useEditChatMessage = <
  TRoute extends { kind: string },
  TContact extends ContactIdentityRowLike,
>({
  chatDraft,
  chatSendIsBusy,
  currentNsec,
  editContext,
  publishWrappedWithRetry,
  route,
  selectedContact,
  setChatDraft,
  setChatSendIsBusy,
  setEditContext,
  setStatus,
  t,
  updateLocalNostrMessage,
}: UseEditChatMessageParams<TRoute, TContact>) => {
  return React.useCallback(async () => {
    if (route.kind !== "chat") return;
    if (!selectedContact) return;
    if (!editContext) return;

    const editedFromId = String(editContext.rumorId ?? "").trim();
    if (!editedFromId) return;

    const text = chatDraft.trim();
    if (!text) return;

    const contactNpub = normalizeNpubIdentifier(selectedContact.npub);
    if (!contactNpub) {
      setStatus(t("chatMissingContactNpub"));
      return;
    }
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
      if (decodedMe.type !== "nsec" || !(decodedMe.data instanceof Uint8Array))
        throw new Error("invalid nsec");
      const privBytes = decodedMe.data;
      const myPubHex = getPublicKey(privBytes);

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
      const contactPubHex = decodedContact.data;

      const clientId = makeLocalId();
      const baseEvent = {
        created_at: Math.ceil(Date.now() / 1e3),
        kind: 14,
        pubkey: myPubHex,
        tags: [
          ["p", contactPubHex],
          ["p", myPubHex],
          ["edited_from", editedFromId],
          ["client", clientId],
        ],
        content: text,
      } satisfies UnsignedEvent;

      updateLocalNostrMessage(String(editContext.messageId ?? ""), {
        content: text,
        status: "pending",
        wrapId: `pending:edit:${clientId}`,
        pubkey: myPubHex,
        clientId,
        rumorId: editedFromId,
        isEdited: true,
        editedAtSec: baseEvent.created_at,
        editedFromId,
        originalContent: String(editContext.originalContent ?? "").trim()
          ? editContext.originalContent
          : null,
      });

      const isOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      if (isOffline) {
        setChatDraft("");
        setEditContext(null);
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
        setEditContext(null);
        setStatus(t("chatQueued"));
        return;
      }

      updateLocalNostrMessage(String(editContext.messageId ?? ""), {
        status: "sent",
        wrapId: String(wrapForMe.id ?? ""),
        pubkey: myPubHex,
        rumorId: editedFromId,
      });

      setChatDraft("");
      setEditContext(null);
    } catch (e) {
      setStatus(`${t("errorPrefix")}: ${String(e ?? "unknown")}`);
    } finally {
      setChatSendIsBusy(false);
    }
  }, [
    chatDraft,
    chatSendIsBusy,
    currentNsec,
    editContext,
    publishWrappedWithRetry,
    route.kind,
    selectedContact,
    setChatDraft,
    setChatSendIsBusy,
    setEditContext,
    setStatus,
    t,
    updateLocalNostrMessage,
  ]);
};
