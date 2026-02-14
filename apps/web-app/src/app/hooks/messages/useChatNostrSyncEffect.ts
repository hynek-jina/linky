import type { Event as NostrToolsEvent } from "nostr-tools";
import React from "react";
import { NOSTR_RELAYS } from "../../../nostrProfile";
import { normalizeNpubIdentifier } from "../../../utils/nostrNpub";
import { getSharedAppNostrPool } from "../../lib/nostrPool";
import type {
  ChatMessageRowLike,
  ContactIdentityRowLike,
  PaymentLogData,
} from "../../types/appTypes";

interface UseChatNostrSyncEffectParams {
  appendLocalNostrMessage: (message: {
    clientId?: string;
    contactId: string;
    content: string;
    createdAtSec: number;
    direction: "in" | "out";
    pubkey: string;
    rumorId: string | null;
    wrapId: string;
  }) => string;
  chatMessages: readonly ChatMessageRowLike[];
  chatMessagesLatestRef: React.MutableRefObject<readonly ChatMessageRowLike[]>;
  chatSeenWrapIdsRef: React.MutableRefObject<Set<string>>;
  currentNsec: string | null;
  logPayStep: (step: string, data?: PaymentLogData) => void;
  nostrMessageWrapIdsRef: React.MutableRefObject<Set<string>>;
  route: { kind: string };
  selectedContact: ContactIdentityRowLike | null;
  updateLocalNostrMessage: (
    id: string,
    updates: Partial<{
      clientId: string;
      pubkey: string;
      status: "sent" | "pending";
      wrapId: string;
    }>,
  ) => void;
}

export const useChatNostrSyncEffect = ({
  appendLocalNostrMessage,
  chatMessages,
  chatMessagesLatestRef,
  chatSeenWrapIdsRef,
  currentNsec,
  logPayStep,
  nostrMessageWrapIdsRef,
  route,
  selectedContact,
  updateLocalNostrMessage,
}: UseChatNostrSyncEffectParams) => {
  React.useEffect(() => {
    // NIP-17 inbox sync + subscription while a chat is open.
    if (route.kind !== "chat") return;
    if (!selectedContact) return;

    const contactNpub = normalizeNpubIdentifier(selectedContact.npub);
    if (!contactNpub) return;
    if (!currentNsec) return;

    let cancelled = false;

    const existingWrapIds = chatSeenWrapIdsRef.current;
    for (const m of chatMessages) {
      const id = String(m.wrapId ?? "");
      if (id) existingWrapIds.add(id);
    }

    const run = async () => {
      try {
        const { nip19, getPublicKey } = await import("nostr-tools");
        const { unwrapEvent } = await import("nostr-tools/nip17");

        const decodedMe = nip19.decode(currentNsec);
        if (
          decodedMe.type !== "nsec" ||
          !(decodedMe.data instanceof Uint8Array)
        )
          return;
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
          return;
        }
        const contactPubHex = decodedContact.data;

        const pool = await getSharedAppNostrPool();

        const processWrap = (wrap: NostrToolsEvent) => {
          try {
            const wrapId = String(wrap?.id ?? "");
            if (!wrapId) return;
            if (existingWrapIds.has(wrapId)) return;
            if (nostrMessageWrapIdsRef.current.has(wrapId)) return;
            existingWrapIds.add(wrapId);

            const inner = unwrapEvent(wrap, privBytes) as NostrToolsEvent;
            if (!inner || inner.kind !== 14) return;

            const innerPub = String(inner.pubkey ?? "");
            const tags = Array.isArray(inner.tags) ? inner.tags : [];
            const content = String(inner.content ?? "").trim();

            const createdAtSecRaw = Number(inner.created_at ?? 0);
            const createdAtSec =
              Number.isFinite(createdAtSecRaw) && createdAtSecRaw > 0
                ? Math.trunc(createdAtSecRaw)
                : Math.ceil(Date.now() / 1e3);

            const isIncoming = innerPub === contactPubHex;
            const isOutgoing = innerPub === myPubHex;
            if (!isIncoming && !isOutgoing) return;

            if (!content) return;

            // Ensure outgoing messages are for this contact.
            const pTags = tags
              .filter((t) => Array.isArray(t) && t[0] === "p")
              .map((t) => String(t[1] ?? "").trim());
            const mentionsContact = pTags.includes(contactPubHex);
            if (isOutgoing && !mentionsContact) return;

            if (cancelled) return;

            if (isOutgoing) {
              const messages = chatMessagesLatestRef.current;
              const clientId = tags
                .find((t) => Array.isArray(t) && t[0] === "client")
                ?.at(1);
              const pending = messages.find((m) => {
                const isOut = String(m.direction ?? "") === "out";
                const isPending = String(m.status ?? "sent") === "pending";
                if (!isOut || !isPending) return false;
                if (clientId)
                  return String(m.clientId ?? "") === String(clientId);
                return String(m.content ?? "").trim() === content;
              });
              if (pending) {
                const pendingWrapId = String(pending.wrapId ?? "");
                if (
                  String(pending.status ?? "sent") === "sent" &&
                  pendingWrapId &&
                  pendingWrapId === wrapId
                ) {
                  return;
                }
                updateLocalNostrMessage(String(pending.id ?? ""), {
                  status: "sent",
                  wrapId,
                  pubkey: innerPub,
                });
                logPayStep("message-ack", {
                  contactId: String(selectedContact.id ?? ""),
                  clientId: clientId ? String(clientId) : null,
                  wrapId,
                });
                return;
              }

              const existing = messages.find((m) => {
                const isOut = String(m.direction ?? "") === "out";
                if (!isOut) return false;
                if (clientId)
                  return String(m.clientId ?? "") === String(clientId);
                return String(m.content ?? "").trim() === content;
              });
              if (existing) {
                const existingWrapId = String(existing.wrapId ?? "");
                if (
                  String(existing.status ?? "sent") === "sent" &&
                  existingWrapId &&
                  existingWrapId === wrapId
                ) {
                  return;
                }
                updateLocalNostrMessage(String(existing.id ?? ""), {
                  status: "sent",
                  wrapId,
                  pubkey: innerPub,
                });
                logPayStep("message-ack", {
                  contactId: String(selectedContact.id ?? ""),
                  clientId: clientId ? String(clientId) : null,
                  wrapId,
                });
                return;
              }
            }

            const tagClientId = tags.find(
              (t) => Array.isArray(t) && t[0] === "client",
            )?.[1];

            if (isOutgoing) {
              const messages = chatMessagesLatestRef.current;
              const byClient = tagClientId
                ? messages.find(
                    (m) =>
                      String(m.direction ?? "") === "out" &&
                      String(m.clientId ?? "") === String(tagClientId),
                  )
                : null;
              const byContent = !tagClientId
                ? messages.find(
                    (m) =>
                      String(m.direction ?? "") === "out" &&
                      String(m.content ?? "").trim() === content,
                  )
                : null;
              const existingMessage = byClient ?? byContent;

              if (existingMessage) {
                updateLocalNostrMessage(String(existingMessage.id ?? ""), {
                  status: "sent",
                  wrapId,
                  pubkey: innerPub,
                  ...(tagClientId ? { clientId: String(tagClientId) } : {}),
                });
                return;
              }
            }

            appendLocalNostrMessage({
              contactId: String(selectedContact.id),
              direction: isIncoming ? "in" : "out",
              content,
              wrapId,
              rumorId: inner.id ? String(inner.id) : null,
              pubkey: innerPub,
              createdAtSec,
              ...(tagClientId ? { clientId: String(tagClientId) } : {}),
            });
          } catch {
            // ignore individual events
          }
        };

        const existing = await pool.querySync(
          NOSTR_RELAYS,
          { kinds: [1059], "#p": [myPubHex], limit: 50 },
          { maxWait: 5000 },
        );

        if (!cancelled) {
          for (const e of Array.isArray(existing)
            ? (existing as NostrToolsEvent[])
            : [])
            processWrap(e);
        }

        const sub = pool.subscribe(
          NOSTR_RELAYS,
          { kinds: [1059], "#p": [myPubHex] },
          {
            onevent: (e: NostrToolsEvent) => {
              if (cancelled) return;
              processWrap(e);
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
    appendLocalNostrMessage,
    chatMessages,
    chatMessagesLatestRef,
    chatSeenWrapIdsRef,
    currentNsec,
    logPayStep,
    nostrMessageWrapIdsRef,
    route.kind,
    selectedContact,
    updateLocalNostrMessage,
  ]);
};
