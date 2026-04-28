import { useCallback, useEffect, useRef, type FC } from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { aggregateReactions } from "../app/hooks/messages/chatNostrProtocol";
import type { EditChatContext } from "../app/hooks/messages/useEditChatMessage";
import type { ReplyContext } from "../app/hooks/messages/useSendChatMessage";
import { formatChatMessagePreviewText } from "../app/lib/chatMessageDisplay";
import {
  parseCashuPaymentRequestMessage,
  parseLinkyPaymentRequestDeclineMessage,
  type CashuPaymentRequestMessageInfo,
} from "../app/lib/paymentRequestMessage";
import type { CashuTokenMessageInfo } from "../app/lib/tokenMessageInfo";
import type {
  LocalNostrMessage,
  LocalNostrReaction,
  MintUrlInput,
} from "../app/types/appTypes";
import { ChatMessage } from "../components/ChatMessage";
import { ReplyPreview } from "../components/ReplyPreview";
import { formatChatDayLabel } from "../utils/formatting";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";

interface Contact {
  id: string;
  isUnknownContact?: boolean;
  npub?: string | null;
  unknownPubkeyHex?: string | null;
  lnAddress?: string | null;
}

interface ChatPageProps {
  cashuBalance: number;
  cashuIsBusy: boolean;
  chatDraft: string;
  chatMessageElByIdRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  chatMessages: LocalNostrMessage[];
  chatMessagesRef: React.RefObject<HTMLDivElement | null>;
  chatOwnPubkeyHex: string | null;
  chatSendIsBusy: boolean;
  editContext: EditChatContext | null;
  feedbackContactNpub: string;
  getCashuTokenMessageInfo: (id: string) => CashuTokenMessageInfo | null;
  getMintIconUrl: (mint: MintUrlInput) => {
    origin: string | null;
    url: string | null;
    host: string | null;
    failed: boolean;
  };
  lang: string;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  onAddUnknownContact: () => Promise<void>;
  onRemoveUnknownContactChat: () => Promise<void>;
  onCopy: (message: LocalNostrMessage) => void;
  onDeclinePaymentRequest: (message: LocalNostrMessage) => Promise<void>;
  onEdit: (message: LocalNostrMessage) => void;
  onPayPaymentRequest: (
    message: LocalNostrMessage,
    requestInfo: CashuPaymentRequestMessageInfo,
  ) => Promise<void>;
  onReact: (message: LocalNostrMessage, emoji: string) => void;
  onReply: (message: LocalNostrMessage) => void;
  openContactPay: (
    id: string,
    returnToChat?: boolean,
    intent?: "pay" | "request",
  ) => void;
  payWithCashuEnabled: boolean;
  reactionsByMessageId: Map<string, LocalNostrReaction[]>;
  replyContext: ReplyContext | null;
  selectedContact: Contact | null;
  sendChatMessage: () => Promise<void>;
  setChatDraft: (value: string) => void;
  setMintIconUrlByMint: React.Dispatch<
    React.SetStateAction<Record<string, string | null>>
  >;
  t: (key: string) => string;
}

export const ChatPage: FC<ChatPageProps> = ({
  cashuBalance,
  cashuIsBusy,
  chatDraft,
  chatMessageElByIdRef,
  chatMessages,
  chatMessagesRef,
  chatOwnPubkeyHex,
  chatSendIsBusy,
  editContext,
  feedbackContactNpub,
  getCashuTokenMessageInfo,
  getMintIconUrl,
  lang,
  onCancelEdit,
  onCancelReply,
  onAddUnknownContact,
  onRemoveUnknownContactChat,
  onCopy,
  onDeclinePaymentRequest,
  onEdit,
  onPayPaymentRequest,
  onReact,
  onReply,
  openContactPay,
  payWithCashuEnabled,
  reactionsByMessageId,
  replyContext,
  selectedContact,
  sendChatMessage,
  setChatDraft,
  setMintIconUrlByMint,
  t,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const composeInputRef = useRef<HTMLTextAreaElement | null>(null);
  const composeContainerRef = useRef<HTMLDivElement | null>(null);
  const npub = selectedContact
    ? normalizeNpubIdentifier(selectedContact.npub)
    : null;
  const hasUnknownPubkeyHex = Boolean(
    String(selectedContact?.unknownPubkeyHex ?? "").trim(),
  );
  const isDesktop =
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const focusComposeInput = useCallback(() => {
    const input = composeInputRef.current;
    if (!input || input.disabled) return false;

    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }

    const length = input.value.length;
    input.setSelectionRange(length, length);
    return document.activeElement === input;
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const body = document.body;
    const pendingRefreshTimeouts = new Set<number>();

    // Prevent body scroll when keyboard opens on iOS
    const prevHtmlOverflow = root.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";

    const updateViewportHeight = () => {
      const vp = window.visualViewport;
      const nextHeight = vp?.height ?? window.innerHeight;
      const nextOffsetTop = vp?.offsetTop ?? 0;
      const visibleHeight = Math.min(
        window.innerHeight,
        Math.max(0, nextHeight + nextOffsetTop),
      );
      const viewportKeyboardInset = Math.max(
        0,
        window.innerHeight - visibleHeight,
      );
      const nativeKeyboardInset = Number.parseFloat(
        getComputedStyle(root).getPropertyValue("--native-keyboard-inset"),
      );
      const keyboardInset = Math.max(
        viewportKeyboardInset,
        Number.isFinite(nativeKeyboardInset) ? nativeKeyboardInset : 0,
      );
      root.style.setProperty(
        "--chat-viewport-height",
        `${Math.round(window.innerHeight - keyboardInset)}px`,
      );
      root.style.setProperty(
        "--chat-keyboard-inset",
        `${Math.round(keyboardInset)}px`,
      );
      if (keyboardInset > 0) {
        root.dataset.chatKeyboardOpen = "true";
      } else {
        delete root.dataset.chatKeyboardOpen;
      }
      // Reset any page scroll caused by keyboard focus on iOS
      if (window.scrollY > 0) {
        window.scrollTo(0, 0);
      }
      // Keep chat scrolled to bottom when keyboard opens/closes
      requestAnimationFrame(() => {
        const input = composeInputRef.current;
        if (input && document.activeElement === input) {
          input.scrollIntoView({ block: "nearest" });
        }
        const c = chatMessagesRef.current;
        if (c) c.scrollTop = c.scrollHeight;
      });
    };

    const scheduleViewportRefresh = () => {
      updateViewportHeight();

      requestAnimationFrame(() => {
        updateViewportHeight();
      });

      for (const delayMs of [120, 280]) {
        const timeoutId = window.setTimeout(() => {
          pendingRefreshTimeouts.delete(timeoutId);
          updateViewportHeight();
        }, delayMs);
        pendingRefreshTimeouts.add(timeoutId);
      }
    };

    const handleComposeFocusChange = (event: FocusEvent) => {
      const input = composeInputRef.current;
      if (!input) return;
      if (event.target !== input) return;
      scheduleViewportRefresh();
    };

    updateViewportHeight();

    const viewport = window.visualViewport;
    window.addEventListener("resize", updateViewportHeight);
    window.addEventListener("linky-native-window-insets", updateViewportHeight);
    document.addEventListener("focusin", handleComposeFocusChange);
    document.addEventListener("focusout", handleComposeFocusChange);
    viewport?.addEventListener("resize", updateViewportHeight);
    viewport?.addEventListener("scroll", updateViewportHeight);

    return () => {
      window.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener(
        "linky-native-window-insets",
        updateViewportHeight,
      );
      document.removeEventListener("focusin", handleComposeFocusChange);
      document.removeEventListener("focusout", handleComposeFocusChange);
      viewport?.removeEventListener("resize", updateViewportHeight);
      viewport?.removeEventListener("scroll", updateViewportHeight);
      for (const timeoutId of pendingRefreshTimeouts) {
        window.clearTimeout(timeoutId);
      }
      pendingRefreshTimeouts.clear();
      root.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      root.style.removeProperty("--chat-viewport-height");
      root.style.removeProperty("--chat-keyboard-inset");
      delete root.dataset.chatKeyboardOpen;
    };
  }, [chatMessagesRef]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const compose = composeContainerRef.current;
    if (!compose) return;

    const updateComposeHeight = () => {
      root.style.setProperty(
        "--chat-compose-height",
        `${Math.round(compose.getBoundingClientRect().height)}px`,
      );
    };

    updateComposeHeight();

    window.addEventListener("resize", updateComposeHeight);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateComposeHeight);
      observer.observe(compose);
    }

    return () => {
      window.removeEventListener("resize", updateComposeHeight);
      observer?.disconnect();
      root.style.removeProperty("--chat-compose-height");
    };
  }, [
    editContext,
    payWithCashuEnabled,
    replyContext,
    selectedContact?.id,
    selectedContact?.isUnknownContact,
    selectedContact?.lnAddress,
    npub,
  ]);

  useEffect(() => {
    if (!replyContext && !editContext) return;
    if (!npub && !hasUnknownPubkeyHex) return;
    focusComposeInput();
  }, [replyContext, editContext, focusComposeInput, hasUnknownPubkeyHex, npub]);

  if (!selectedContact) {
    return (
      <section className="panel">
        <p className="muted">{t("contactNotFound")}</p>
      </section>
    );
  }

  const ln = String(selectedContact.lnAddress ?? "").trim();
  const isUnknownContact = Boolean(selectedContact.isUnknownContact);
  const canPayThisContact =
    !isUnknownContact &&
    (Boolean(ln) || (payWithCashuEnabled && Boolean(npub)));
  const canStartPay =
    (Boolean(ln) && cashuBalance > 0) || (Boolean(npub) && cashuBalance > 0);
  const canRequestThisContact =
    !isUnknownContact && Boolean(npub || hasUnknownPubkeyHex);
  const isFeedbackContact = npub === feedbackContactNpub;

  const byRumorId = new Map<string, LocalNostrMessage>();
  for (const message of chatMessages) {
    const rumorId = String(message.rumorId ?? "").trim();
    if (!rumorId) continue;
    byRumorId.set(rumorId, message);
  }

  const replyPreviewText = replyContext?.replyToContent
    ? formatChatMessagePreviewText({
        content: replyContext.replyToContent,
        formatDisplayedAmountText,
        t,
      })
    : replyContext?.replyToId
      ? formatChatMessagePreviewText({
          content: byRumorId.get(replyContext.replyToId)?.content ?? "",
          direction: byRumorId.get(replyContext.replyToId)?.direction ?? null,
          formatDisplayedAmountText,
          t,
        })
      : "";
  const latestRequestResponseByRumorId = new Map<
    string,
    {
      respondedAtSec: number;
      status: "declined" | "paid";
    }
  >();

  for (const message of chatMessages) {
    const replyToId = String(message.replyToId ?? "").trim();
    if (!replyToId) continue;

    const createdAtSec = Number(message.createdAtSec ?? 0) || 0;
    const isPaymentReply = Boolean(
      getCashuTokenMessageInfo(String(message.content ?? "")),
    );
    const isDeclineReply = Boolean(
      parseLinkyPaymentRequestDeclineMessage(String(message.content ?? "")),
    );
    if (!isPaymentReply && !isDeclineReply) continue;

    const previous = latestRequestResponseByRumorId.get(replyToId);
    if (previous && previous.respondedAtSec > createdAtSec) continue;
    latestRequestResponseByRumorId.set(replyToId, {
      respondedAtSec: createdAtSec,
      status: isPaymentReply ? "paid" : "declined",
    });
  }
  const hasDraftText = Boolean(chatDraft.trim());

  const canSendChat = Boolean(
    !chatSendIsBusy && hasDraftText && (npub || hasUnknownPubkeyHex),
  );

  return (
    <section className="panel chat-panel">
      {isUnknownContact ? (
        <div className="chat-unknown-warning">
          <p>{t("chatUnknownContactWarning")}</p>
          <div className="chat-unknown-warning-actions">
            <button
              className="btn-wide chat-unknown-primary"
              type="button"
              onClick={() => {
                void onAddUnknownContact();
              }}
            >
              {t("addContact")}
            </button>
            <button
              className="btn-wide secondary"
              type="button"
              onClick={() => {
                void onRemoveUnknownContactChat();
              }}
            >
              {t("removeChat")}
            </button>
          </div>
        </div>
      ) : null}

      {!npub && !hasUnknownPubkeyHex && (
        <p className="muted">{t("chatMissingContactNpub")}</p>
      )}

      <div
        className="chat-messages"
        role="log"
        aria-live="polite"
        ref={chatMessagesRef}
      >
        {chatMessages.length === 0 ? (
          <p className="muted">{t("chatEmpty")}</p>
        ) : (
          chatMessages.map((message, idx) => {
            const prev = idx > 0 ? chatMessages[idx - 1] : null;
            const next =
              idx + 1 < chatMessages.length ? chatMessages[idx + 1] : null;
            const formatChatDayLabelForLang = (timestamp: number) =>
              formatChatDayLabel(timestamp, lang, t);

            const rumorId = String(message.rumorId ?? "").trim();
            const reactions = rumorId
              ? aggregateReactions(
                  reactionsByMessageId.get(rumorId) ?? [],
                  chatOwnPubkeyHex,
                )
              : [];
            const paymentRequestInfo = parseCashuPaymentRequestMessage(
              String(message.content ?? ""),
            );
            const paymentRequestStatus = rumorId
              ? (latestRequestResponseByRumorId.get(rumorId)?.status ??
                "requested")
              : "requested";
            const replyToId = String(message.replyToId ?? "").trim();
            const fallbackReplyContent =
              String(message.replyToContent ?? "").trim() || null;
            const replyQuoteText = replyToId
              ? formatChatMessagePreviewText({
                  content:
                    byRumorId.get(replyToId)?.content ??
                    fallbackReplyContent ??
                    "",
                  direction: byRumorId.get(replyToId)?.direction ?? null,
                  formatDisplayedAmountText,
                  t,
                })
              : fallbackReplyContent
                ? formatChatMessagePreviewText({
                    content: fallbackReplyContent,
                    formatDisplayedAmountText,
                    t,
                  })
                : null;
            const isOwnTextMessage =
              String(message.direction ?? "") === "out" &&
              Boolean(String(message.rumorId ?? "").trim()) &&
              !getCashuTokenMessageInfo(String(message.content ?? "")) &&
              !paymentRequestInfo &&
              !parseLinkyPaymentRequestDeclineMessage(
                String(message.content ?? ""),
              );

            return (
              <ChatMessage
                key={String(message.id)}
                message={message}
                previousMessage={prev}
                nextMessage={next}
                locale={lang === "cs" ? "cs-CZ" : "en-US"}
                formatChatDayLabel={formatChatDayLabelForLang}
                getCashuTokenMessageInfo={getCashuTokenMessageInfo}
                getMintIconUrl={getMintIconUrl}
                onMintIconLoad={(origin, url) => {
                  setMintIconUrlByMint((prevByMint) => ({
                    ...prevByMint,
                    [origin]: url,
                  }));
                }}
                onMintIconError={(origin, nextUrl) => {
                  setMintIconUrlByMint((prevByMint) => ({
                    ...prevByMint,
                    [origin]: nextUrl,
                  }));
                }}
                actionLabels={{
                  copy: t("copy"),
                  edit: t("chatEditAction"),
                  edited: t("chatEdited"),
                  react: t("chatReactAction"),
                  reply: t("chatReplyAction"),
                }}
                canEdit={isOwnTextMessage}
                canReplyOrReact={Boolean(rumorId)}
                reactions={reactions}
                paymentRequestInfo={paymentRequestInfo}
                paymentRequestStatus={
                  paymentRequestInfo ? paymentRequestStatus : null
                }
                declineInfo={parseLinkyPaymentRequestDeclineMessage(
                  String(message.content ?? ""),
                )}
                onDeclinePaymentRequest={() => {
                  void onDeclinePaymentRequest(message);
                }}
                onPayPaymentRequest={(requestInfo) => {
                  void onPayPaymentRequest(message, requestInfo);
                }}
                canActOnPaymentRequest={
                  Boolean(paymentRequestInfo) &&
                  String(message.direction ?? "") === "in" &&
                  paymentRequestStatus === "requested"
                }
                payPaymentRequestDisabled={
                  !paymentRequestInfo ||
                  cashuIsBusy ||
                  paymentRequestInfo.amount > cashuBalance
                }
                replyQuoteText={replyQuoteText}
                onCopy={onCopy}
                onEdit={onEdit}
                onReact={onReact}
                onReply={onReply}
                chatPendingLabel={t("chatPendingShort")}
                messageElRef={(el, messageId) => {
                  const map = chatMessageElByIdRef.current;
                  if (el) map.set(messageId, el);
                  else map.delete(messageId);
                }}
              />
            );
          })
        )}
      </div>

      <div className="chat-compose" ref={composeContainerRef}>
        {replyContext && (
          <ReplyPreview
            label={t("chatReplyingTo")}
            body={replyPreviewText || t("chatReplyUnavailable")}
            onCancel={onCancelReply}
          />
        )}
        {editContext && (
          <ReplyPreview
            label={t("chatEditing")}
            body={editContext.originalContent || t("chatEmpty")}
            onCancel={onCancelEdit}
          />
        )}
        <div className="chat-compose-input-wrap">
          <textarea
            ref={composeInputRef}
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => {
              if (!isDesktop) return;
              if (e.key !== "Enter" || !e.metaKey) return;
              if (!canSendChat) return;
              e.preventDefault();
              void sendChatMessage();
            }}
            placeholder={t("chatPlaceholder")}
            disabled={!npub && !hasUnknownPubkeyHex}
            data-guide="chat-input"
          />
          {hasDraftText ? (
            <button
              type="button"
              className="chat-compose-send-button"
              onClick={() => {
                void sendChatMessage();
                focusComposeInput();
              }}
              disabled={!canSendChat}
              aria-label={editContext ? t("chatSaveAction") : t("send")}
              title={editContext ? t("chatSaveAction") : t("send")}
              data-guide="chat-send"
            >
              <span className="chat-compose-send-icon" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M21 3L10 14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M21 3L14 21L10 14L3 10L21 3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          ) : null}
        </div>
        {canPayThisContact && (
          <div className="chat-compose-payment-actions">
            {canRequestThisContact && (
              <button
                className="btn-wide secondary chat-pay-button"
                onClick={() =>
                  openContactPay(selectedContact.id, true, "request")
                }
                disabled={cashuIsBusy}
                data-guide="chat-request"
              >
                <span className="btn-label-with-icon">
                  <span className="btn-label-icon" aria-hidden="true">
                    ←
                  </span>
                  <span>{t("requestPayment")}</span>
                </span>
              </button>
            )}
            <button
              className="btn-wide secondary chat-pay-button"
              onClick={() => openContactPay(selectedContact.id, true)}
              disabled={cashuIsBusy || !canStartPay}
              title={!canStartPay ? t("payInsufficient") : undefined}
              data-guide="chat-pay"
            >
              <span className="btn-label-with-icon">
                <span className="btn-label-icon" aria-hidden="true">
                  ₿
                </span>
                <span>{isFeedbackContact ? "Donate" : t("pay")}</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
