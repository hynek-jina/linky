import React from "react";
import type {
  CashuTokenMessageInfo,
  CredoTokenMessageInfo,
} from "../app/lib/tokenMessageInfo";
import type { LocalNostrMessage, MintUrlInput } from "../app/types/appTypes";

interface MintIcon {
  failed: boolean;
  host: string | null;
  origin: string | null;
  url: string | null;
}

interface ChatMessageProps {
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
  onMintIconError: (origin: string, nextUrl: string | null) => void;
  onMintIconLoad: (origin: string, url: string | null) => void;
  previousMessage: LocalNostrMessage | null;
}

export function ChatMessage({
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
  onMintIconError,
  onMintIconLoad,
  previousMessage,
}: ChatMessageProps) {
  const isOut = String(message.direction ?? "") === "out";
  const isPending = isOut && String(message.status ?? "sent") === "pending";
  const content = String(message.content ?? "");
  const messageId = String(message.id ?? "");
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

  return (
    <React.Fragment key={messageId}>
      {showDaySeparator ? (
        <div className="chat-day-separator" aria-hidden="true">
          {formatChatDayLabel(ms)}
        </div>
      ) : null}

      <div
        className={`chat-message ${isOut ? "out" : "in"}${isPending ? " pending" : ""}`}
        ref={(el) => {
          if (messageElRef && messageId) {
            messageElRef(el, messageId);
          }
        }}
      >
        <div className={isOut ? "chat-bubble out" : "chat-bubble in"}>
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

        {showTime ? (
          <div className="chat-time">
            {timeLabel}
            {isPending ? ` · ${chatPendingLabel}` : ""}
          </div>
        ) : null}
      </div>
    </React.Fragment>
  );
}
