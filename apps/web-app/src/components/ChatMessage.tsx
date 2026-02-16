import React from "react";
import type {
  CashuTokenMessageInfo,
  CredoTokenMessageInfo,
} from "../app/lib/tokenMessageInfo";
import type {
  ChatReactionChip,
  LocalNostrMessage,
  MintUrlInput,
} from "../app/types/appTypes";
import { EditIndicator } from "./EditIndicator";
import { MessageActionsMenu } from "./MessageActionsMenu";
import { MessageReactions } from "./MessageReactions";

interface MintIcon {
  failed: boolean;
  host: string | null;
  origin: string | null;
  url: string | null;
}

interface ChatMessageProps {
  actionLabels: {
    copy: string;
    edit: string;
    edited: string;
    react: string;
    reply: string;
  };
  canEdit: boolean;
  canReplyOrReact: boolean;
  chatPendingLabel: string;
  contactAvatar: string | null;
  formatChatDayLabel: (ms: number) => string;
  formatInteger: (n: number) => string;
  getCashuTokenMessageInfo: (text: string) => CashuTokenMessageInfo | null;
  getCredoTokenMessageInfo: (text: string) => CredoTokenMessageInfo | null;
  getMintIconUrl: (mint: MintUrlInput) => MintIcon;
  locale: string;
  message: LocalNostrMessage;
  messageElRef?: (el: HTMLDivElement | null, messageId: string) => void;
  nextMessage: LocalNostrMessage | null;
  onCopy: (message: LocalNostrMessage) => void;
  onEdit: (message: LocalNostrMessage) => void;
  onMintIconError: (origin: string, nextUrl: string | null) => void;
  onMintIconLoad: (origin: string, url: string | null) => void;
  onReact: (message: LocalNostrMessage, emoji: string) => void;
  onReply: (message: LocalNostrMessage) => void;
  previousMessage: LocalNostrMessage | null;
  reactions: readonly ChatReactionChip[];
  replyQuoteText: string | null;
}

const SWIPE_REPLY_THRESHOLD = 48;
const SWIPE_REPLY_VERTICAL_TOLERANCE = 24;
const LONG_PRESS_MS = 450;

export function ChatMessage({
  actionLabels,
  canEdit,
  canReplyOrReact,
  chatPendingLabel,
  contactAvatar,
  formatChatDayLabel,
  formatInteger,
  getCashuTokenMessageInfo,
  getCredoTokenMessageInfo,
  getMintIconUrl,
  locale,
  message,
  messageElRef,
  nextMessage,
  onCopy,
  onEdit,
  onMintIconError,
  onMintIconLoad,
  onReact,
  onReply,
  previousMessage,
  reactions,
  replyQuoteText,
}: ChatMessageProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const longPressTimerRef = React.useRef<number | null>(null);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const swipeTriggeredRef = React.useRef(false);
  const messageDivRef = React.useRef<HTMLDivElement | null>(null);

  const isOut = String(message.direction ?? "") === "out";
  const isPending = isOut && String(message.status ?? "sent") === "pending";
  const content = String(message.content ?? "");
  const messageId = String(message.id ?? "");
  const rumorId = String(message.rumorId ?? "").trim() || null;
  const replyToId = String(message.replyToId ?? "").trim() || null;
  const rootMessageId = String(message.rootMessageId ?? "").trim() || null;
  const createdAtSec = Number(message.createdAtSec ?? 0) || 0;
  const ms = createdAtSec * 1000;
  const d = new Date(ms);
  const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const minuteKey = Math.floor(createdAtSec / 60);

  const prevSec = previousMessage
    ? Number(previousMessage.createdAtSec ?? 0) || 0
    : 0;
  const prevDate = previousMessage ? new Date(prevSec * 1000) : null;
  const prevDayKey = prevDate
    ? `${prevDate.getFullYear()}-${prevDate.getMonth() + 1}-${prevDate.getDate()}`
    : null;

  const nextSec = nextMessage ? Number(nextMessage.createdAtSec ?? 0) || 0 : 0;
  const nextMinuteKey = nextMessage ? Math.floor(nextSec / 60) : null;

  const showDaySeparator = prevDayKey !== dayKey;
  const showTime = nextMinuteKey !== minuteKey;

  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

  const tokenInfo = getCashuTokenMessageInfo(content);
  const credoInfo = getCredoTokenMessageInfo(content);

  const openMenu = React.useCallback(() => {
    setMenuOpen(true);
  }, []);

  const clearLongPress = React.useCallback(() => {
    if (longPressTimerRef.current == null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !canReplyOrReact) return;

    touchStartRef.current = { x: event.clientX, y: event.clientY };
    swipeTriggeredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      openMenu();
    }, LONG_PRESS_MS);
  };

  const resetSwipeTransform = React.useCallback(() => {
    const el = messageDivRef.current;
    if (!el) return;
    el.style.transition = "transform 0.2s ease";
    el.style.transform = "";
    const onEnd = () => {
      el.style.transition = "";
      el.removeEventListener("transitionend", onEnd);
    };
    el.addEventListener("transitionend", onEnd);
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !canReplyOrReact) return;
    if (!touchStartRef.current) return;

    const dx = event.clientX - touchStartRef.current.x;
    const dy = event.clientY - touchStartRef.current.y;
    if (Math.abs(dy) > SWIPE_REPLY_VERTICAL_TOLERANCE) {
      clearLongPress();
      touchStartRef.current = null;
      resetSwipeTransform();
      return;
    }

    if (dx > 0 && !swipeTriggeredRef.current) {
      const clamped = Math.min(dx, SWIPE_REPLY_THRESHOLD);
      const el = messageDivRef.current;
      if (el) {
        el.style.transform = `translateX(${clamped}px)`;
      }
    }

    if (dx >= SWIPE_REPLY_THRESHOLD && !swipeTriggeredRef.current) {
      swipeTriggeredRef.current = true;
      clearLongPress();
      resetSwipeTransform();
      onReply(message);
    }
  };

  const handlePointerUp = () => {
    clearLongPress();
    touchStartRef.current = null;
    swipeTriggeredRef.current = false;
    resetSwipeTransform();
  };

  return (
    <React.Fragment key={messageId}>
      {showDaySeparator ? (
        <div className="chat-day-separator" aria-hidden="true">
          {formatChatDayLabel(ms)}
        </div>
      ) : null}

      <div
        className={`chat-message ${isOut ? "out" : "in"}${isPending ? " pending" : ""}`}
        data-message-id={messageId || undefined}
        data-rumor-id={rumorId ?? undefined}
        data-reply-to-id={replyToId ?? undefined}
        data-root-message-id={rootMessageId ?? undefined}
        ref={(el) => {
          messageDivRef.current = el;
          if (messageElRef && messageId) {
            messageElRef(el, messageId);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <MessageActionsMenu
          canEdit={canEdit}
          canReplyOrReact={canReplyOrReact}
          isOpen={menuOpen}
          labels={actionLabels}
          onReply={() => onReply(message)}
          onEdit={() => onEdit(message)}
          onReact={(emoji) => onReact(message, emoji)}
          onCopy={() => onCopy(message)}
          onClose={() => setMenuOpen(false)}
        />

        <div className="chat-bubble-wrap">
          <div className="chat-message-tools">
            <button
              type="button"
              className="chat-message-action-btn"
              onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
              aria-label="Message actions"
            >
              ⋯
            </button>
          </div>
          <div className={isOut ? "chat-bubble out" : "chat-bubble in"}>
            {replyQuoteText && (
              <div className="chat-reply-quote">
                <span>{replyQuoteText}</span>
              </div>
            )}
            {credoInfo ? (
              <span
                className={
                  credoInfo.isValid ? "pill pill-credo" : "pill pill-muted"
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                aria-label={`${formatInteger(credoInfo.amount ?? 0)} sat`}
              >
                {contactAvatar ? (
                  <img
                    src={contactAvatar}
                    alt=""
                    width={14}
                    height={14}
                    style={{
                      borderRadius: 9999,
                      objectFit: "cover",
                    }}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <span>{formatInteger(credoInfo.amount ?? 0)}</span>
              </span>
            ) : tokenInfo ? (
              (() => {
                const icon = getMintIconUrl(tokenInfo.mintUrl);
                const showMintFallback = icon.failed || !icon.url;
                return (
                  <span
                    className={tokenInfo.isValid ? "pill" : "pill pill-muted"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    aria-label={
                      tokenInfo.mintDisplay
                        ? `${formatInteger(tokenInfo.amount ?? 0)} sat · ${tokenInfo.mintDisplay}`
                        : `${formatInteger(tokenInfo.amount ?? 0)} sat`
                    }
                  >
                    {icon.url ? (
                      <img
                        src={icon.url}
                        alt=""
                        width={14}
                        height={14}
                        style={{
                          borderRadius: 9999,
                          objectFit: "cover",
                        }}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onLoad={() => {
                          if (icon.origin) {
                            onMintIconLoad(icon.origin, icon.url);
                          }
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          if (icon.origin) {
                            const duck = icon.host
                              ? `https://icons.duckduckgo.com/ip3/${icon.host}.ico`
                              : null;
                            const favicon = `${icon.origin}/favicon.ico`;
                            let next: string | null = null;
                            if (duck && icon.url !== duck) {
                              next = duck;
                            } else if (icon.url !== favicon) {
                              next = favicon;
                            }
                            onMintIconError(icon.origin, next);
                          }
                        }}
                      />
                    ) : null}
                    {showMintFallback && icon.host ? (
                      <span
                        className="muted"
                        style={{
                          fontSize: 10,
                          lineHeight: "14px",
                        }}
                      >
                        {icon.host}
                      </span>
                    ) : null}
                    {!showMintFallback && tokenInfo.mintDisplay ? (
                      <span
                        className="muted"
                        style={{
                          fontSize: 10,
                          lineHeight: "14px",
                          maxWidth: 140,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tokenInfo.mintDisplay}
                      </span>
                    ) : null}
                    <span>{formatInteger(tokenInfo.amount ?? 0)}</span>
                  </span>
                );
              })()
            ) : (
              content
            )}
          </div>
        </div>

        <MessageReactions
          reactions={reactions}
          showAddButton={false}
          onReact={(emoji) => onReact(message, emoji)}
        />

        {showTime ? (
          <div className="chat-time">
            {timeLabel}
            {message.isEdited ? (
              <>
                {" "}
                ·{" "}
                <EditIndicator
                  label={actionLabels.edited}
                  originalContent={message.originalContent ?? null}
                />
              </>
            ) : null}
            {isPending ? ` · ${chatPendingLabel}` : ""}
          </div>
        ) : null}
      </div>
    </React.Fragment>
  );
}
