import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import type { CashuTokenMessageInfo } from "../app/lib/tokenMessageInfo";
import type {
  ContactRowLike,
  LocalNostrMessage,
  MintUrlInput,
} from "../app/types/appTypes";
import {
  formatContactMessageTimestamp,
  getInitials,
} from "../utils/formatting";
import { getNextMintIconUrl } from "../utils/mint";

interface ContactCardProps {
  avatarUrl: string | null;
  contact: ContactRowLike;
  getMintIconUrl: (url: MintUrlInput) => {
    url: string | null;
    origin?: string | null;
    host?: string | null;
    failed?: boolean;
  };
  hasAttention: boolean;
  lastMessage?: LocalNostrMessage | null;
  onMintIconError: (origin: string, nextUrl: string | null) => void;
  onMintIconLoad: (origin: string, url: string | null) => void;
  onSelect: (contact: ContactRowLike) => void;
  tokenInfo: CashuTokenMessageInfo | null;
  isUnknownContact?: boolean;
}

export const ContactCard: React.FC<ContactCardProps> = ({
  avatarUrl,
  contact,
  getMintIconUrl,
  hasAttention,
  lastMessage,
  onMintIconError,
  onMintIconLoad,
  onSelect,
  tokenInfo,
  isUnknownContact = false,
}) => {
  const { formatDisplayedAmountParts, formatDisplayedAmountText } =
    useAppShellCore();
  const initials = getInitials(String(contact.name ?? ""));
  const lastText = String(lastMessage?.content ?? "").trim();
  const preview = lastText.length > 40 ? `${lastText.slice(0, 40)}…` : lastText;
  const lastTime = lastMessage
    ? formatContactMessageTimestamp(Number(lastMessage.createdAtSec ?? 0))
    : "";

  const directionSymbol = (() => {
    const dir = String(lastMessage?.direction ?? "").trim();
    if (dir === "out") return "↗";
    if (dir === "in") return "↘";
    return "";
  })();

  const previewText = preview
    ? directionSymbol
      ? `${directionSymbol} ${preview}`
      : preview
    : "";

  const handleClick = () => onSelect(contact);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <article
      className="contact-card is-clickable"
      data-guide="contact-card"
      data-guide-contact-id={String(contact.id)}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="card-header">
        <div className="contact-avatar with-badge" aria-hidden="true">
          <span className="contact-avatar-inner">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="contact-avatar-fallback">{initials}</span>
            )}
          </span>
          {hasAttention ? (
            <span className="contact-unread-dot" aria-hidden="true" />
          ) : null}
          {isUnknownContact ? (
            <span className="contact-unknown-badge" aria-hidden="true">
              ?
            </span>
          ) : null}
        </div>

        <div className="card-main">
          <div className="card-title-row">
            {contact.name ? (
              <h4 className="contact-title" style={{ flex: 1 }}>
                {String(contact.name)}
              </h4>
            ) : null}
            {lastTime ? (
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 2,
                }}
              >
                {lastTime ? (
                  <span
                    className="muted"
                    style={{ fontSize: 10, whiteSpace: "nowrap" }}
                  >
                    {lastTime}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>

          {tokenInfo ? (
            <TokenPreview
              tokenInfo={tokenInfo}
              directionSymbol={directionSymbol}
              formatDisplayedAmountParts={formatDisplayedAmountParts}
              formatDisplayedAmountText={formatDisplayedAmountText}
              getMintIconUrl={getMintIconUrl}
              onIconLoad={onMintIconLoad}
              onIconError={onMintIconError}
            />
          ) : previewText ? (
            <div
              className="muted"
              style={{ fontSize: 12, marginTop: 4, lineHeight: 1.2 }}
            >
              {previewText}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
};

interface TokenPreviewProps {
  directionSymbol: string;
  formatDisplayedAmountParts: (amountSat: number) => {
    amountText: string;
    approxPrefix: string;
    unitLabel: string;
  };
  formatDisplayedAmountText: (amountSat: number) => string;
  getMintIconUrl: (url: MintUrlInput) => {
    url: string | null;
    origin?: string | null;
    host?: string | null;
    failed?: boolean;
  };
  onIconError: (origin: string, nextUrl: string | null) => void;
  onIconLoad: (origin: string, url: string | null) => void;
  tokenInfo: CashuTokenMessageInfo;
}

const TokenPreview: React.FC<TokenPreviewProps> = ({
  directionSymbol,
  formatDisplayedAmountParts,
  formatDisplayedAmountText,
  getMintIconUrl,
  onIconError,
  onIconLoad,
  tokenInfo,
}) => {
  const icon = getMintIconUrl(tokenInfo.mintUrl);
  const displayAmount = formatDisplayedAmountParts(tokenInfo.amount ?? 0);
  const displayAmountText = formatDisplayedAmountText(tokenInfo.amount ?? 0);

  return (
    <div
      className="muted"
      style={{
        fontSize: 12,
        marginTop: 4,
        lineHeight: 1.2,
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {directionSymbol ? <span>{directionSymbol}</span> : null}
      <span
        className={tokenInfo.isValid ? "pill" : "pill pill-muted"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "1px 4px",
          fontSize: 10,
          lineHeight: "10px",
        }}
        aria-label={displayAmountText}
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
              if (icon.origin && icon.url) {
                onIconLoad(icon.origin, icon.url);
              }
            }}
            onError={() => {
              if (icon.origin) {
                const next = getNextMintIconUrl(icon.url, icon.origin);
                onIconError(icon.origin, next);
              }
            }}
          />
        ) : null}
        <span>
          {displayAmount.approxPrefix}
          {displayAmount.amountText}
        </span>
      </span>
    </div>
  );
};
