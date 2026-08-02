import { Info, Plus, X } from "lucide-react";
import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import {
  isLinkyBankPaymentOfferTerminalStatus,
  LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC,
  type LinkyBankPaymentOfferInfo,
  type LinkyBankPaymentOfferStatus,
} from "../app/lib/bankPaymentOffer";
import { parseIdentityChangeMessageContent } from "../app/lib/identityChangeMessage";
import {
  extractMessageLinks,
  normalizeMessageLinkMatch,
} from "../app/lib/messageLinks";
import type { CashuPaymentRequestMessageInfo } from "../app/lib/paymentRequestMessage";
import { parsePrivateImageMessage } from "../app/lib/privateImageMessage";
import type { CashuTokenMessageInfo } from "../app/lib/tokenMessageInfo";
import { isStandaloneCashuTokenMessage } from "../app/lib/tokenText";
import type {
  ChatReactionChip,
  LocalNostrMessage,
  MintUrlInput,
} from "../app/types/appTypes";
import { deriveDefaultProfile } from "../derivedProfile";
import { getNextMintIconUrl } from "../utils/mint";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";
import { EditIndicator } from "./EditIndicator";
import { PayIcon } from "./icons";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { MessageActionsMenu } from "./MessageActionsMenu";
import { MessageReactions } from "./MessageReactions";
import { PrivateImageBubble } from "./PrivateImageBubble";

interface MintIcon {
  failed: boolean;
  host: string | null;
  origin: string | null;
  url: string | null;
}

export interface NpubMessageContactInfo {
  displayName: string;
  isSaved: boolean;
  npub: string;
  pictureUrl: string | null;
}

export type BankPaymentOfferPeerNotice =
  | "accepted_by_other"
  | "backup_recipient";

const MESSAGE_NPUB_PATTERN =
  /^(?:nostr:)?npub1[023456789acdefghjklmnpqrstuvwxyz]+(?:@npub\.cash)?$/i;
const MESSAGE_INLINE_ENTITY_PATTERN =
  /(?:nostr:)?npub1[023456789acdefghjklmnpqrstuvwxyz]+(?:@npub\.cash)?|cashu[0-9A-Za-z_-]+={0,2}|(?:https?:\/\/|www\.)[^\s<>"']+/gi;

interface ChatMessageProps {
  actionLabels: {
    copy: string;
    edit: string;
    edited: string;
    react: string;
    reply: string;
  };
  bankPaymentOfferInfo: LinkyBankPaymentOfferInfo | null;
  bankPaymentOfferPeerNotice: BankPaymentOfferPeerNotice | null;
  canOpenBankPaymentOfferDetails: boolean;
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
  onOpenBankPaymentOfferDetails: () => void;
  onDeclinePaymentRequest: () => void;
  onEdit: (message: LocalNostrMessage) => void;
  onMintIconError: (origin: string, nextUrl: string | null) => void;
  onMintIconLoad: (origin: string, url: string | null) => void;
  onAddNpubContacts: (npubs: readonly string[]) => void;
  onOpenNpubContact: (npub: string) => void;
  onPayPaymentRequest: (requestInfo: CashuPaymentRequestMessageInfo) => void;
  onReact: (message: LocalNostrMessage, emoji: string) => void;
  onReply: (message: LocalNostrMessage) => void;
  payPaymentRequestBusy: boolean;
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
const chatTimeFormatters = new Map<string, Intl.DateTimeFormat>();

const getChatTimeFormatter = (locale: string): Intl.DateTimeFormat => {
  const cached = chatTimeFormatters.get(locale);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  chatTimeFormatters.set(locale, formatter);
  return formatter;
};

const formatRemainingTime = (
  remainingSec: number,
  t: (key: string) => string,
): string => {
  if (remainingSec <= 0) return t("bankPaymentOfferExpired");

  const minutes = Math.floor(remainingSec / 60);
  const seconds = Math.max(0, remainingSec % 60);
  return t("bankPaymentOfferTimeRemainingClock")
    .replace("{minutes}", String(minutes))
    .replace("{seconds}", String(seconds).padStart(2, "0"));
};

const getBankPaymentOfferDescription = (
  status: LinkyBankPaymentOfferStatus,
  amountText: string,
  isOut: boolean,
  t: (key: string) => string,
): string => {
  const key =
    status === "accepted"
      ? isOut
        ? "bankPaymentOfferDescriptionAccepted"
        : "bankPaymentOfferDescriptionAcceptedIncoming"
      : status === "accepted_by_other"
        ? "bankPaymentOfferAcceptedByOther"
        : status === "bank_details_sent"
          ? ""
          : status === "bank_paid"
            ? isOut
              ? "bankPaymentOfferDescriptionBankPaid"
              : "bankPaymentOfferDescriptionBankPaidIncoming"
            : status === "canceled"
              ? ""
              : status === "declined"
                ? "bankPaymentOfferDescriptionDeclined"
                : status === "settled"
                  ? ""
                  : "bankPaymentOfferDescriptionOffered";

  return key ? t(key).replace("{amount}", amountText) : "";
};

function ChatMessageComponent({
  actionLabels,
  bankPaymentOfferInfo,
  bankPaymentOfferPeerNotice,
  canOpenBankPaymentOfferDetails,
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
  onAddNpubContacts,
  onOpenBankPaymentOfferDetails,
  onOpenNpubContact,
  onPayPaymentRequest,
  onReact,
  onReply,
  payPaymentRequestBusy,
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
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  const longPressTimerRef = React.useRef<number | null>(null);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const swipeTriggeredRef = React.useRef(false);
  const messageDivRef = React.useRef<HTMLDivElement | null>(null);

  const isOut = String(message.direction ?? "") === "out";
  const isPending = isOut && String(message.status ?? "sent") === "pending";
  const content = String(message.content ?? "");
  const privateImageInfo = React.useMemo(
    () => parsePrivateImageMessage(content),
    [content],
  );
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
  const isIdentityChangeMessage =
    parseIdentityChangeMessageContent(content) !== null;

  const showDaySeparator = prevDayKey !== dayKey;
  const showTime = !isIdentityChangeMessage && nextMinuteKey !== minuteKey;

  const timeLabel = getChatTimeFormatter(locale).format(d);

  const tokenInfo = privateImageInfo ? null : getCashuTokenMessageInfo(content);
  const isDeclineMessage = Boolean(declineInfo);
  const bankOfferDisplayAmount = bankPaymentOfferInfo?.amountSat
    ? formatDisplayedAmountText(bankPaymentOfferInfo.amountSat)
    : (bankPaymentOfferInfo?.amountText ?? "");
  const bankOfferDescription = bankPaymentOfferInfo
    ? getBankPaymentOfferDescription(
        bankPaymentOfferInfo.status,
        bankOfferDisplayAmount,
        isOut,
        t,
      )
    : "";
  const bankOfferPhaseTtlSec =
    bankPaymentOfferInfo &&
    (bankPaymentOfferInfo.status === "accepted" ||
      bankPaymentOfferInfo.status === "bank_details_sent" ||
      bankPaymentOfferInfo.status === "bank_paid" ||
      bankPaymentOfferInfo.status === "offered")
      ? LINKY_BANK_PAYMENT_OFFER_PHASE_TTL_SEC
      : null;
  const bankOfferPhaseStartedAtSec =
    bankPaymentOfferInfo?.statusUpdatedAtSec ?? createdAtSec;
  const bankOfferRemainingSec =
    bankOfferPhaseTtlSec && bankOfferPhaseStartedAtSec > 0
      ? bankOfferPhaseStartedAtSec +
        bankOfferPhaseTtlSec -
        Math.floor(nowMs / 1000)
      : null;
  const bankOfferTimeLabel =
    bankOfferRemainingSec === null
      ? null
      : formatRemainingTime(bankOfferRemainingSec, t);
  const bankOfferPeerNoticeText =
    bankPaymentOfferPeerNotice === "accepted_by_other"
      ? t("bankPaymentOfferAcceptedByOther")
      : bankPaymentOfferPeerNotice === "backup_recipient"
        ? t("bankPaymentOfferBackupRecipient")
        : "";

  React.useEffect(() => {
    if (!bankOfferPhaseTtlSec) return;
    if (bankOfferPhaseStartedAtSec <= 0) return;

    const expiresAtMs =
      (bankOfferPhaseStartedAtSec + bankOfferPhaseTtlSec) * 1_000;
    if (Date.now() >= expiresAtMs) return;

    let timeoutId: number | null = null;
    const scheduleNextTick = () => {
      const currentNowMs = Date.now();
      if (currentNowMs >= expiresAtMs) return;

      const nextSecondMs = (Math.floor(currentNowMs / 1_000) + 1) * 1_000;
      const nextBoundaryMs = Math.min(nextSecondMs, expiresAtMs);
      timeoutId = window.setTimeout(() => {
        setNowMs(Date.now());
        scheduleNextTick();
      }, nextBoundaryMs - currentNowMs);
    };

    scheduleNextTick();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [bankOfferPhaseStartedAtSec, bankOfferPhaseTtlSec]);

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
    if (
      paymentRequestInfo ||
      isDeclineMessage ||
      bankPaymentOfferInfo ||
      privateImageInfo
    ) {
      return null;
    }

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

      const messageLink = normalizeMessageLinkMatch(matchedText);
      const normalizedNpub = MESSAGE_NPUB_PATTERN.test(matchedText)
        ? normalizeNpubIdentifier(matchedText)
        : null;
      if (messageLink) {
        replacementCount += 1;
        segments.push(
          <a
            key={`${messageId}-link-${start}`}
            className="chat-message-link"
            href={messageLink.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {messageLink.displayText}
          </a>,
        );
        if (messageLink.trailingText) {
          segments.push(messageLink.trailingText);
        }
      } else if (normalizedNpub) {
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
              {!npubContactInfo.isSaved ? (
                <span className="chat-contact-pill-add" aria-hidden="true">
                  <Plus size={12} strokeWidth={2.5} />
                </span>
              ) : null}
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
    bankPaymentOfferInfo,
    isDeclineMessage,
    messageId,
    onOpenNpubContact,
    paymentRequestInfo,
    privateImageInfo,
    renderCashuTokenPill,
  ]);

  const unsavedMessageContactNpubs = React.useMemo(() => {
    if (
      isOut ||
      paymentRequestInfo ||
      isDeclineMessage ||
      bankPaymentOfferInfo ||
      privateImageInfo
    ) {
      return [];
    }

    const npubs: string[] = [];
    const seenNpubs = new Set<string>();
    const matches = Array.from(content.matchAll(MESSAGE_INLINE_ENTITY_PATTERN));

    for (const match of matches) {
      const matchedText = String(match[0] ?? "");
      if (!MESSAGE_NPUB_PATTERN.test(matchedText)) continue;

      const normalizedNpub = normalizeNpubIdentifier(matchedText);
      if (!normalizedNpub || seenNpubs.has(normalizedNpub)) continue;

      const contactInfo = getNpubMessageContactInfo(normalizedNpub);
      if (!contactInfo || contactInfo.isSaved) continue;

      seenNpubs.add(normalizedNpub);
      npubs.push(contactInfo.npub);
    }

    return npubs;
  }, [
    bankPaymentOfferInfo,
    content,
    getNpubMessageContactInfo,
    isDeclineMessage,
    isOut,
    paymentRequestInfo,
    privateImageInfo,
  ]);

  const isStandaloneTokenMessage = React.useMemo(() => {
    if (!tokenInfo) return false;
    return isStandaloneCashuTokenMessage(content);
  }, [content, tokenInfo]);

  const previewUrl = React.useMemo(() => {
    if (
      paymentRequestInfo ||
      bankPaymentOfferInfo ||
      isDeclineMessage ||
      privateImageInfo ||
      isStandaloneTokenMessage
    ) {
      return null;
    }
    return extractMessageLinks(content)[0]?.url ?? null;
  }, [
    bankPaymentOfferInfo,
    content,
    isDeclineMessage,
    isStandaloneTokenMessage,
    paymentRequestInfo,
    privateImageInfo,
  ]);

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

      {isIdentityChangeMessage ? (
        <div className="chat-day-separator" role="note">
          {t("chatIdentityChangedNotice")}
        </div>
      ) : null}

      {isIdentityChangeMessage ? null : (
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
              {bankPaymentOfferInfo ? (
                <div className="chat-payment-request-card chat-bank-payment-offer-card">
                  <div className="chat-payment-request-header">
                    <span className="chat-payment-request-title">
                      {t("bankPaymentOfferTitle")}
                    </span>
                    <span
                      className={`chat-payment-request-status is-${bankPaymentOfferInfo.status}`}
                    >
                      {bankPaymentOfferInfo.status === "accepted"
                        ? t("bankPaymentOfferStatusAccepted")
                        : bankPaymentOfferInfo.status === "accepted_by_other"
                          ? t("bankPaymentOfferStatusAcceptedByOther")
                          : bankPaymentOfferInfo.status === "bank_details_sent"
                            ? isOut
                              ? t("bankPaymentOfferStatusBankDetailsSent")
                              : t("bankPaymentOfferStatusBankDetailsReceived")
                            : bankPaymentOfferInfo.status === "bank_paid"
                              ? t("bankPaymentOfferStatusBankPaid")
                              : bankPaymentOfferInfo.status === "canceled"
                                ? t("bankPaymentOfferStatusCanceled")
                                : bankPaymentOfferInfo.status === "declined"
                                  ? t("bankPaymentOfferStatusDeclined")
                                  : bankPaymentOfferInfo.status === "settled"
                                    ? t("bankPaymentOfferStatusSettled")
                                    : t("bankPaymentOfferStatusOffered")}
                    </span>
                  </div>
                  <div className="chat-bank-payment-amount-row">
                    <div className="chat-payment-request-amount">
                      {bankOfferDisplayAmount}
                    </div>
                  </div>
                  {bankOfferDescription ? (
                    <div className="chat-payment-request-description">
                      {bankOfferDescription}
                    </div>
                  ) : null}
                  {bankOfferPeerNoticeText ? (
                    <div className="chat-payment-request-description">
                      {bankOfferPeerNoticeText}
                    </div>
                  ) : null}
                  {bankOfferTimeLabel ? (
                    <div className="chat-bank-payment-timer">
                      {bankOfferTimeLabel}
                    </div>
                  ) : null}
                  {canOpenBankPaymentOfferDetails &&
                  !isLinkyBankPaymentOfferTerminalStatus(
                    bankPaymentOfferInfo.status,
                  ) ? (
                    <button
                      type="button"
                      className="btn-wide chat-payment-request-pay"
                      onClick={onOpenBankPaymentOfferDetails}
                    >
                      <span className="btn-label-with-icon">
                        <span className="btn-label-icon" aria-hidden="true">
                          <Info size={18} />
                        </span>
                        <span>{t("details")}</span>
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : paymentRequestInfo ? (
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
                          payPaymentRequestDisabled && !payPaymentRequestBusy
                            ? t("payInsufficient")
                            : undefined
                        }
                      >
                        <span className="btn-label-with-icon">
                          <span className="btn-label-icon" aria-hidden="true">
                            {payPaymentRequestBusy ? (
                              <span className="btn-spinner" />
                            ) : (
                              <PayIcon size={18} />
                            )}
                          </span>
                          <span>
                            {payPaymentRequestBusy ? t("payPaying") : t("pay")}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn-wide secondary chat-payment-request-decline"
                        onClick={onDeclinePaymentRequest}
                      >
                        <span className="btn-label-with-icon">
                          <span className="btn-label-icon" aria-hidden="true">
                            <X size={18} />
                          </span>
                          <span>{t("decline")}</span>
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : isDeclineMessage ? (
                <span className="pill pill-muted">
                  {t("paymentRequestDeclinedMessage")}
                </span>
              ) : privateImageInfo ? (
                <PrivateImageBubble payload={privateImageInfo} t={t} />
              ) : tokenInfo && isStandaloneTokenMessage ? (
                renderCashuTokenPill(tokenInfo)
              ) : inlineMessageContent ? (
                inlineMessageContent
              ) : (
                content
              )}
              {unsavedMessageContactNpubs.length > 1 ? (
                <button
                  type="button"
                  className="chat-add-all-contacts"
                  onClick={() => onAddNpubContacts(unsavedMessageContactNpubs)}
                >
                  <Plus size={15} strokeWidth={2.5} aria-hidden="true" />
                  <span>{t("addAllContacts")}</span>
                </button>
              ) : null}
              {previewUrl ? (
                <LinkPreviewCard key={previewUrl} url={previewUrl} />
              ) : null}
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
      )}
    </React.Fragment>
  );
}

export const ChatMessage = React.memo(ChatMessageComponent);
