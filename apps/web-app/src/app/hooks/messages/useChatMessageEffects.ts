import React from "react";
import type { Route } from "../../../types/route";
import type {
  ContactRowLike,
  LocalNostrMessage,
  NostrMessageSummaryRow,
} from "../../types/appTypes";

interface UseChatMessageEffectsParams<TContact extends ContactRowLike> {
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
  getCashuTokenMessageInfo: (
    text: string,
  ) => { isValid: boolean; tokenRaw: string } | null;
  isCashuTokenKnownAny: (tokenRaw: string) => boolean;
  isCashuTokenStored: (tokenRaw: string) => boolean;
  nostrMessagesRecent: readonly NostrMessageSummaryRow[];
  route: Route;
  saveCashuFromText: (
    text: string,
    options?: { navigateToTokens?: boolean; navigateToWallet?: boolean },
  ) => Promise<void>;
  selectedContact: TContact | null;
}

export const useChatMessageEffects = <TContact extends ContactRowLike>({
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
  getCashuTokenMessageInfo,
  isCashuTokenKnownAny,
  isCashuTokenStored,
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
      const id = String(message.id ?? "");
      if (!id) continue;
      if (autoAcceptedChatMessageIdsRef.current.has(id)) continue;

      const isOut = String(message.direction ?? "") === "out";
      if (isOut) continue;

      const content = String(message.content ?? "");
      const info = getCashuTokenMessageInfo(content);
      if (!info) continue;

      // Mark it as processed so we don't keep retrying every render.
      autoAcceptedChatMessageIdsRef.current.add(id);

      // Only accept if it's not already in our wallet.
      if (!info.isValid) continue;
      if (isCashuTokenKnownAny(info.tokenRaw)) continue;
      if (isCashuTokenStored(info.tokenRaw)) continue;

      void saveCashuFromText(info.tokenRaw);
      break;
    }
  }, [
    autoAcceptedChatMessageIdsRef,
    cashuIsBusy,
    chatMessages,
    getCashuTokenMessageInfo,
    isCashuTokenKnownAny,
    isCashuTokenStored,
    route.kind,
    saveCashuFromText,
    cashuTokensHydratedRef,
  ]);

  React.useEffect(() => {
    // Auto-accept Cashu tokens from incoming messages even when chat isn't open.
    if (cashuIsBusy) return;
    if (!cashuTokensHydratedRef.current) return;

    for (const message of nostrMessagesRecent) {
      const id = String(message.id ?? "");
      if (!id) continue;
      if (autoAcceptedChatMessageIdsRef.current.has(id)) continue;

      const direction = String(message.direction ?? "");
      if (direction !== "in") continue;

      const content = String(message.content ?? "");
      const info = getCashuTokenMessageInfo(content);
      if (!info) continue;

      autoAcceptedChatMessageIdsRef.current.add(id);
      if (!info.isValid) continue;
      if (isCashuTokenKnownAny(info.tokenRaw)) continue;
      if (isCashuTokenStored(info.tokenRaw)) continue;

      void saveCashuFromText(info.tokenRaw);
      break;
    }
  }, [
    autoAcceptedChatMessageIdsRef,
    cashuIsBusy,
    getCashuTokenMessageInfo,
    isCashuTokenKnownAny,
    isCashuTokenStored,
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
      const targetId = String(target.id ?? "");

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
