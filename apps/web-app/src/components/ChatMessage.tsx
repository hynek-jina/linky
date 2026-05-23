import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import type { CashuPaymentRequestMessageInfo } from "../app/lib/paymentRequestMessage";
import type { CashuTokenMessageInfo } from "../app/lib/tokenMessageInfo";
import type {
  ChatReactionChip,
  LocalNostrMessage,
  MintUrlInput,
} from "../app/types/appTypes";
import { deriveDefaultProfile } from "../derivedProfile";
import { getNextMintIconUrl } from "../utils/mint";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";
import {
  getInitialNostrIdentitySource,
  getInitialNostrIdentitySwitchedAtSec,
} from "../utils/storage";
import { EditIndicator } from "./EditIndicator";
import { MessageActionsMenu } from "./MessageActionsMenu";
import { MessageReactions } from "./MessageReactions";

interface MintIcon {
  failed: boolean;
  host: string | null;
  origin: string | null;
  url: string | null;
}

export interface NpubMessageContactInfo {
  displayName: string;
  npub: string;
  pictureUrl: string | null;
}

const MESSAGE_CASHU_PATTERN = /cashu[0-9A-Za-z_-]+={0,2}/gi;
const MESSAGE_NPUB_PATTERN =
  /^(?:nostr:)?npub1[023456789acdefghjklmnpqrstuvwxyz]+(?:@npub\.cash)?$/i;
const MESSAGE_INLINE_ENTITY_PATTERN =
  /(?:nostr:)?npub1[023456789acdefghjklmnpqrstuvwxyz]+(?:@npub\.cash)?|cashu[0-9A-Za-z_-]+={0,2}/gi;

interface ChatMessageProps {
  actionLabels: {
    copy: string;
    edit: string;
    edited: string;
    react: string;
    reply: string;
  };
  canEdit: boolean;
  canActOnPaymentRequest: boolean;
  canReplyOrReact: boolean;
  chatPendingLabel: string;
  declineInfo: { requestRumorId: string | null } | null;
  formatChatDayLabel: (ms: number) => string;
  getCashuTokenMessageInfo: (text: string) => CashuTokenMessageInfo | null;
  getMintIconUrl: (mint: MintUrlInput) => MintIcon;
  getNpubMessageContactInfo: (npub: string) => NpubMessageContactInfo | null;
  locale: string;
  message: LocalNostrMessage;
  messageElRef?: (el: HTMLDivElement | null, messageId: string) => void;
  nextMessage: LocalNostrMessage | null;
  onCopy: (message: LocalNostrMessage) => void;
  onDeclinePaymentRequest: () => void;
  onEdit: (message: LocalNostrMessage) => void;
  onMintIconError: (origin: string, nextUrl: string | null) => void;
  onMintIconLoad: (origin: string, url: string | null) => void;
  onOpenNpubContact: (npub: string) => void;
  onPayPaymentRequest: (requestInfo: CashuPaymentRequestMessageInfo) => void;
  onReact: (message: LocalNostrMessage, emoji: string) => void;
  onReply: (message: LocalNostrMessage) => void;
  payPaymentRequestDisabled: boolean;
  paymentRequestInfo: CashuPaymentRequestMessageInfo | null;
  paymentRequestStatus: "declined" | "paid" | "requested" | null;
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
  canActOnPaymentRequest,
  canReplyOrReact,
  chatPendingLabel,
  declineInfo,
  formatChatDayLabel,
  getCashuTokenMessageInfo,
  getMintIconUrl,
  getNpubMessageContactInfo,
  locale,
  message,
  messageElRef,
  nextMessage,
  onCopy,
  onDeclinePaymentRequest,
  onEdit,
  onMintIconError,
  onMintIconLoad,
  onOpenNpubContact,
  onPayPaymentRequest,
  onReact,
  onReply,
  payPaymentRequestDisabled,
  paymentRequestInfo,
  paymentRequestStatus,
  previousMessage,
  reactions,
  replyQuoteText,
}: ChatMessageProps) {
  const { formatDisplayedAmountParts, formatDisplayedAmountText, t } =
    useAppShellCore();
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
  const identityChangedAtSec = React.useMemo(() => {
    if (getInitialNostrIdentitySource() !== "custom") return null;
    return getInitialNostrIdentitySwitchedAtSec();
  }, []);
  const showIdentityChangeSeparator =
    identityChangedAtSec !== null &&
    createdAtSec >= identityChangedAtSec &&
    (!previousMessage || prevSec < identityChangedAtSec);
  const showTime = nextMinuteKey !== minuteKey;

  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

  const tokenInfo = getCashuTokenMessageInfo(content);
  const isDeclineMessage = Boolean(declineInfo);

  const renderCashuTokenPill = React.useCallback(
    (info: CashuTokenMessageInfo, key?: string) => {
      const icon = getMintIconUrl(info.mintUrl);
      const showMintFallback = icon.failed || !icon.url;
      const displayAmount = formatDisplayedAmountParts(info.amount ?? 0);
      const displayAmountText = formatDisplayedAmountText(info.amount ?? 0);
      const displayUnitLabel = String(displayAmount.unitLabel ?? "").trim();

      return (
        <span
          key={key}
          className={
            info.isValid
              ? "pill chat-token-pill"
              : "pill pill-muted chat-token-pill"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
          aria-label={
            info.mintDisplay
              ? `${displayAmountText} · ${info.mintDisplay}`
              : displayAmountText
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
              onError={() => {
                if (icon.origin) {
                  const next = getNextMintIconUrl(icon.url, icon.origin);
                  onMintIconError(icon.origin, next);
                }
              }}
            />
          ) : null}
          {showMintFallback && icon.host ? (
            <span
              className="muted chat-token-pill-fallback"
              style={{
                fontSize: 10,
                lineHeight: "14px",
              }}
            >
              {icon.host}
            </span>
          ) : null}
          <span className="chat-token-pill-label">
            {displayAmount.approxPrefix}
            {displayAmount.amountText}
            {displayUnitLabel ? ` ${displayUnitLabel}` : ""}
          </span>
        </span>
      );
    },
    [
      formatDisplayedAmountParts,
      formatDisplayedAmountText,
      getMintIconUrl,
      onMintIconError,
      onMintIconLoad,
    ],
  );

  const inlineMessageContent = React.useMemo(() => {
    if (paymentRequestInfo || isDeclineMessage) return null;

    const segments: React.ReactNode[] = [];
    const matches = Array.from(content.matchAll(MESSAGE_INLINE_ENTITY_PATTERN));
    if (matches.length === 0) return null;

    let cursor = 0;
    let replacementCount = 0;

    for (const match of matches) {
      const matchedText = String(match[0] ?? "");
      const start = match.index ?? 0;
      const end = start + matchedText.length;

      if (start > cursor) {
        segments.push(content.slice(cursor, start));
      }

      const normalizedNpub = MESSAGE_NPUB_PATTERN.test(matchedText)
        ? normalizeNpubIdentifier(matchedText)
        : null;
      if (normalizedNpub) {
        const npubContactInfo = getNpubMessageContactInfo(normalizedNpub);
        if (!npubContactInfo) {
          segments.push(matchedText);
        } else {
          replacementCount += 1;
          segments.push(
            <button
              key={`${messageId}-npub-${start}`}
              type="button"
              className="pill chat-contact-pill"
              onClick={() => onOpenNpubContact(npubContactInfo.npub)}
              aria-label={npubContactInfo.displayName}
            >
              <span className="chat-contact-pill-avatar" aria-hidden="true">
                {npubContactInfo.pictureUrl ? (
                  <img
                    src={npubContactInfo.pictureUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="chat-contact-pill-avatar-fallback">
                    {deriveDefaultProfile(npubContactInfo.npub).name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="chat-contact-pill-label">
                {npubContactInfo.displayName}
              </span>
            </button>,
          );
        }
      } else {
        const inlineTokenInfo = getCashuTokenMessageInfo(matchedText);
        if (!inlineTokenInfo) {
          segments.push(matchedText);
        } else {
          replacementCount += 1;
          segments.push(
            renderCashuTokenPill(
              inlineTokenInfo,
              `${messageId}-cashu-${start}`,
            ),
          );
        }
      }

      cursor = end;
    }

    if (cursor < content.length) {
      segments.push(content.slice(cursor));
    }

    return replacementCount > 0 ? segments : null;
  }, [
    content,
    getCashuTokenMessageInfo,
    getNpubMessageContactInfo,
    isDeclineMessage,
    messageId,
    onOpenNpubContact,
    paymentRequestInfo,
    renderCashuTokenPill,
  ]);

  const isStandaloneTokenMessage = React.useMemo(() => {
    if (!tokenInfo) return false;
    const trimmed = content.trim();
    const tokenMatch = trimmed.match(MESSAGE_CASHU_PATTERN);
    return tokenMatch?.[0] === trimmed;
  }, [content, tokenInfo]);

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

      {showIdentityChangeSeparator ? (
        <div className="chat-day-separator" role="note">
          {t("chatIdentityChangedNotice")}
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
            {paymentRequestInfo ? (
              <div className="chat-payment-request-card">
                <div className="chat-payment-request-header">
                  <span className="chat-payment-request-title">
                    {t("requestPaymentLabel")}
                  </span>
                  <span
                    className={`chat-payment-request-status is-${paymentRequestStatus ?? "requested"}`}
                  >
                    {paymentRequestStatus === "paid"
                      ? t("paymentRequestStatusPaid")
                      : paymentRequestStatus === "declined"
                        ? t("paymentRequestStatusDeclined")
                        : t("paymentRequestStatusRequested")}
                  </span>
                </div>
                <div className="chat-payment-request-amount">
                  {formatDisplayedAmountText(paymentRequestInfo.amount)}
                </div>
                {canActOnPaymentRequest ? (
                  <div className="chat-payment-request-actions">
                    <button
                      type="button"
                      className="btn-wide chat-payment-request-pay"
                      disabled={payPaymentRequestDisabled}
                      onClick={() => onPayPaymentRequest(paymentRequestInfo)}
                      title={
                        payPaymentRequestDisabled
                          ? t("payInsufficient")
                          : undefined
                      }
                    >
                      {t("pay")}
                    </button>
                    <button
                      type="button"
                      className="btn-wide secondary chat-payment-request-decline"
                      onClick={onDeclinePaymentRequest}
                    >
                      {t("decline")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : isDeclineMessage ? (
              <span className="pill pill-muted">
                {t("paymentRequestDeclinedMessage")}
              </span>
            ) : inlineMessageContent ? (
              inlineMessageContent
            ) : tokenInfo && isStandaloneTokenMessage ? (
              renderCashuTokenPill(tokenInfo)
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
