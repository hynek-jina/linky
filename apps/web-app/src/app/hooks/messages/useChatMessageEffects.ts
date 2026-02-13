import React from "react";
import { parseCredoMessage } from "../../../credo";
import type { Route } from "../../../types/route";
import type { LocalNostrMessage } from "../../types/appTypes";

interface UseChatMessageEffectsParams<
  TContact extends {
    id?: unknown;
    lnAddress?: unknown;
    name?: unknown;
    npub?: unknown;
  },
> {
  applyCredoSettlement: (args: {
    amount: number;
    promiseId: string;
    settledAtSec: number;
  }) => void;
  autoAcceptedChatMessageIdsRef: React.MutableRefObject<Set<string>>;
  cashuIsBusy: boolean;
  cashuTokensHydratedRef: React.MutableRefObject<boolean>;
  chatDidInitialScrollForContactRef: React.MutableRefObject<string | null>;
  chatForceScrollToBottomRef: React.MutableRefObject<boolean>;
  chatLastMessageCountRef: React.MutableRefObject<Record<string, number>>;
  chatMessageElByIdRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  chatMessages: LocalNostrMessage[];
  chatMessagesRef: React.RefObject<HTMLDivElement | null>;
  chatScrollTargetIdRef: React.MutableRefObject<string | null>;
  currentNpub: string | null;
  getCashuTokenMessageInfo: (
    text: string,
  ) => { isValid: boolean; tokenRaw: string } | null;
  insertCredoPromise: (args: {
    amount: number;
    createdAtSec: number;
    direction: "in" | "out";
    expiresAtSec: number;
    issuer: string;
    promiseId: string;
    recipient: string;
    token: string;
    unit: string;
  }) => void;
  isCashuTokenKnownAny: (tokenRaw: string) => boolean;
  isCashuTokenStored: (tokenRaw: string) => boolean;
  isCredoPromiseKnown: (promiseId: string) => boolean;
  nostrMessagesRecent: readonly Record<string, unknown>[];
  route: Route;
  saveCashuFromText: (
    text: string,
    options?: { navigateToWallet?: boolean },
  ) => Promise<void>;
  selectedContact: TContact | null;
}

export const useChatMessageEffects = <
  TContact extends {
    id?: unknown;
    lnAddress?: unknown;
    name?: unknown;
    npub?: unknown;
  },
>({
  applyCredoSettlement,
  autoAcceptedChatMessageIdsRef,
  cashuIsBusy,
  cashuTokensHydratedRef,
  chatDidInitialScrollForContactRef,
  chatForceScrollToBottomRef,
  chatLastMessageCountRef,
  chatMessageElByIdRef,
  chatMessages,
  chatMessagesRef,
  chatScrollTargetIdRef,
  currentNpub,
  getCashuTokenMessageInfo,
  insertCredoPromise,
  isCashuTokenKnownAny,
  isCashuTokenStored,
  isCredoPromiseKnown,
  nostrMessagesRecent,
  route,
  saveCashuFromText,
  selectedContact,
}: UseChatMessageEffectsParams<TContact>) => {
  React.useEffect(() => {
    // Auto-accept Cashu tokens received from others into the wallet.
    if (route.kind !== "chat") return;
    if (cashuIsBusy) return;
    if (!cashuTokensHydratedRef.current) return;

    for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
      const message = chatMessages[i];
      const id = String((message as { id?: unknown } | null)?.id ?? "");
      if (!id) continue;
      if (autoAcceptedChatMessageIdsRef.current.has(id)) continue;

      const isOut =
        String((message as { direction?: unknown } | null)?.direction ?? "") ===
        "out";
      if (isOut) continue;

      const content = String(
        (message as { content?: unknown } | null)?.content ?? "",
      );
      const info = getCashuTokenMessageInfo(content);
      const credoParsed = parseCredoMessage(content);
      if (!info && !credoParsed) continue;

      // Mark it as processed so we don't keep retrying every render.
      autoAcceptedChatMessageIdsRef.current.add(id);

      if (credoParsed && credoParsed.isValid) {
        if (credoParsed.kind === "promise") {
          if (!isCredoPromiseKnown(credoParsed.promiseId)) {
            const promise = credoParsed.promise;
            const issuer = String(promise.issuer ?? "").trim();
            const recipient = String(promise.recipient ?? "").trim();
            const direction =
              currentNpub && issuer === currentNpub ? "out" : "in";
            insertCredoPromise({
              promiseId: credoParsed.promiseId,
              token: credoParsed.token,
              issuer,
              recipient,
              amount: Number(promise.amount ?? 0) || 0,
              unit: String(promise.unit ?? "sat"),
              createdAtSec: Number(promise.created_at ?? 0) || 0,
              expiresAtSec: Number(promise.expires_at ?? 0) || 0,
              direction,
            });
          }
        } else if (credoParsed.kind === "settlement") {
          const settlement = credoParsed.settlement;
          applyCredoSettlement({
            promiseId: String(settlement.promise_id ?? ""),
            amount:
              typeof settlement.amount === "number" && settlement.amount > 0
                ? settlement.amount
                : Number.MAX_SAFE_INTEGER,
            settledAtSec: Number(settlement.settled_at ?? 0) || 0,
          });
        }
      }

      if (!info) continue;

      // Only accept if it's not already in our wallet.
      if (!info.isValid) continue;
      if (isCashuTokenKnownAny(info.tokenRaw)) continue;
      if (isCashuTokenStored(info.tokenRaw)) continue;

      void saveCashuFromText(info.tokenRaw);
      break;
    }
  }, [
    applyCredoSettlement,
    autoAcceptedChatMessageIdsRef,
    cashuIsBusy,
    chatMessages,
    currentNpub,
    getCashuTokenMessageInfo,
    insertCredoPromise,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    isCredoPromiseKnown,
    route.kind,
    saveCashuFromText,
    cashuTokensHydratedRef,
  ]);

  React.useEffect(() => {
    // Auto-accept Cashu tokens from incoming messages even when chat isn't open.
    if (cashuIsBusy) return;
    if (!cashuTokensHydratedRef.current) return;

    for (const message of nostrMessagesRecent) {
      const id = String((message as { id?: unknown } | null)?.id ?? "");
      if (!id) continue;
      if (autoAcceptedChatMessageIdsRef.current.has(id)) continue;

      const direction = String(
        (message as { direction?: unknown } | null)?.direction ?? "",
      );
      if (direction !== "in") continue;

      const content = String(
        (message as { content?: unknown } | null)?.content ?? "",
      );
      const info = getCashuTokenMessageInfo(content);
      const credoParsed = parseCredoMessage(content);
      if (!info && !credoParsed) continue;

      autoAcceptedChatMessageIdsRef.current.add(id);

      if (credoParsed && credoParsed.isValid) {
        if (credoParsed.kind === "promise") {
          if (!isCredoPromiseKnown(credoParsed.promiseId)) {
            const promise = credoParsed.promise;
            const issuer = String(promise.issuer ?? "").trim();
            const recipient = String(promise.recipient ?? "").trim();
            const direction =
              currentNpub && issuer === currentNpub ? "out" : "in";
            insertCredoPromise({
              promiseId: credoParsed.promiseId,
              token: credoParsed.token,
              issuer,
              recipient,
              amount: Number(promise.amount ?? 0) || 0,
              unit: String(promise.unit ?? "sat"),
              createdAtSec: Number(promise.created_at ?? 0) || 0,
              expiresAtSec: Number(promise.expires_at ?? 0) || 0,
              direction,
            });
          }
        } else if (credoParsed.kind === "settlement") {
          const settlement = credoParsed.settlement;
          applyCredoSettlement({
            promiseId: String(settlement.promise_id ?? ""),
            amount:
              typeof settlement.amount === "number" && settlement.amount > 0
                ? settlement.amount
                : Number.MAX_SAFE_INTEGER,
            settledAtSec: Number(settlement.settled_at ?? 0) || 0,
          });
        }
      }

      if (!info) continue;
      if (!info.isValid) continue;
      if (isCashuTokenKnownAny(info.tokenRaw)) continue;
      if (isCashuTokenStored(info.tokenRaw)) continue;

      void saveCashuFromText(info.tokenRaw);
      break;
    }
  }, [
    applyCredoSettlement,
    autoAcceptedChatMessageIdsRef,
    cashuIsBusy,
    currentNpub,
    getCashuTokenMessageInfo,
    insertCredoPromise,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    isCredoPromiseKnown,
    nostrMessagesRecent,
    saveCashuFromText,
    cashuTokensHydratedRef,
  ]);

  React.useEffect(() => {
    if (route.kind !== "chat") {
      chatDidInitialScrollForContactRef.current = null;
    }
  }, [route.kind, chatDidInitialScrollForContactRef]);

  React.useEffect(() => {
    // Scroll chat to newest message on open.
    if (route.kind !== "chat") return;
    if (!selectedContact) return;

    const contactId = String(selectedContact.id ?? "");
    if (!contactId) return;

    const container = chatMessagesRef.current;
    if (!container) return;

    const last = chatMessages.length
      ? chatMessages[chatMessages.length - 1]
      : null;
    if (!last) return;

    const prevCount = chatLastMessageCountRef.current[contactId] ?? 0;
    chatLastMessageCountRef.current[contactId] = chatMessages.length;

    const firstForThisContact =
      chatDidInitialScrollForContactRef.current !== contactId;

    if (firstForThisContact) {
      chatDidInitialScrollForContactRef.current = contactId;

      const target = last;
      const targetId = String((target as { id?: unknown } | null)?.id ?? "");

      const tryScroll = (attempt: number) => {
        const el = targetId ? chatMessageElByIdRef.current.get(targetId) : null;
        if (el) {
          el.scrollIntoView({ block: "end" });
          return;
        }
        if (attempt < 6) {
          requestAnimationFrame(() => tryScroll(attempt + 1));
          return;
        }
        const chatContainer = chatMessagesRef.current;
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
      };

      requestAnimationFrame(() => {
        tryScroll(0);
      });
      return;
    }

    if (chatForceScrollToBottomRef.current) {
      const targetId = chatScrollTargetIdRef.current;

      const tryScroll = (attempt: number) => {
        if (targetId) {
          const el = chatMessageElByIdRef.current.get(targetId);
          if (el) {
            el.scrollIntoView({ block: "end" });
            chatScrollTargetIdRef.current = null;
            chatForceScrollToBottomRef.current = false;
            return;
          }
        }

        const chatContainer = chatMessagesRef.current;
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;

        if (attempt < 6) {
          requestAnimationFrame(() => tryScroll(attempt + 1));
          return;
        }

        chatScrollTargetIdRef.current = null;
        chatForceScrollToBottomRef.current = false;
      };

      requestAnimationFrame(() => tryScroll(0));
      return;
    }

    if (chatMessages.length > prevCount) {
      const isOut =
        String((last as LocalNostrMessage).direction ?? "") === "out";
      if (isOut) {
        requestAnimationFrame(() => {
          const chatContainer = chatMessagesRef.current;
          if (chatContainer)
            chatContainer.scrollTop = chatContainer.scrollHeight;
        });
        return;
      }
    }

    // Keep pinned to bottom if already near bottom.
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      requestAnimationFrame(() => {
        const chatContainer = chatMessagesRef.current;
        if (!chatContainer) return;
        chatContainer.scrollTop = chatContainer.scrollHeight;
      });
    }
  }, [
    route.kind,
    selectedContact,
    chatMessages,
    chatMessagesRef,
    chatLastMessageCountRef,
    chatDidInitialScrollForContactRef,
    chatMessageElByIdRef,
    chatForceScrollToBottomRef,
    chatScrollTargetIdRef,
  ]);
};
