import React from "react";

interface CashuTokenInfo {
  amount: number | null;
  isValid: boolean;
  mintDisplay: string | null;
  mintUrl: string | null;
  tokenRaw: string;
}

interface CredoTokenInfo {
  amount: number | null;
  isValid: boolean;
}

interface LocalNostrMessage {
  content?: unknown;
  createdAtSec?: unknown;
  direction?: unknown;
}

interface Contact {
  groupName?: unknown;
  id?: unknown;
  lnAddress?: unknown;
  name?: unknown;
  npub?: unknown;
}
interface ContactCardProps {
  avatarUrl: string | null;
  contact: Contact;
  credoInfo: CredoTokenInfo | null;
  displayUnit: string;
  formatContactMessageTimestamp: (sec: number) => string;
  formatInteger: (num: number) => string;
  getInitials: (name: string) => string;
  hasAttention: boolean;
  lastMessage: LocalNostrMessage | null | undefined;
  promiseNet: number;
  tokenInfo: CashuTokenInfo | null;
  getMintIconUrl: (url: unknown) => {
    url: string | null;
    origin?: string | null;
    host?: string | null;
    failed?: boolean;
  };
  onSelect: (contact: Contact) => void;
  onMintIconLoad: (origin: string, url: string) => void;
  onMintIconError: (origin: string, nextUrl: string | null) => void;
}

export const ContactCard: React.FC<ContactCardProps> = ({
  contact,
  avatarUrl,
  lastMessage,
  hasAttention,
  promiseNet,
  displayUnit,
  tokenInfo,
  credoInfo,
  formatInteger,
  getInitials,
  formatContactMessageTimestamp,
  getMintIconUrl,
  onSelect,
  onMintIconLoad,
  onMintIconError,
}) => {
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

  const handleClick = () => onSelect(contact as any);
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
        </div>

        <div className="card-main">
          <div className="card-title-row">
            {contact.name ? (
              <h4 className="contact-title" style={{ flex: 1 }}>
                {String(contact.name)}
              </h4>
            ) : null}
            {lastTime || promiseNet !== 0 ? (
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
                {promiseNet !== 0 ? (
                  <span
                    style={{
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      color: promiseNet > 0 ? "#34d399" : "#f87171",
                    }}
                  >
                    {promiseNet < 0 ? "- " : ""}
                    {formatInteger(Math.abs(promiseNet))} {displayUnit}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>

          {credoInfo ? (
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
                className={
                  credoInfo.isValid ? "pill pill-credo" : "pill pill-muted"
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "1px 4px",
                  fontSize: 10,
                  lineHeight: "10px",
                }}
                aria-label={`${formatInteger(credoInfo.amount ?? 0)} sat`}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
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
            </div>
          ) : tokenInfo ? (
            <TokenPreview
              tokenInfo={tokenInfo}
              directionSymbol={directionSymbol}
              formatInteger={formatInteger}
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
  tokenInfo: CashuTokenInfo;
  directionSymbol: string;
  formatInteger: (num: number) => string;
  getMintIconUrl: (url: unknown) => {
    url: string | null;
    origin?: string | null;
    host?: string | null;
    failed?: boolean;
  };
  onIconLoad: (origin: string, url: string) => void;
  onIconError: (origin: string, nextUrl: string | null) => void;
}

const TokenPreview: React.FC<TokenPreviewProps> = ({
  tokenInfo,
  directionSymbol,
  formatInteger,
  getMintIconUrl,
  onIconLoad,
  onIconError,
}) => {
  const icon = getMintIconUrl(tokenInfo.mintUrl);

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
        aria-label={`${formatInteger(tokenInfo.amount ?? 0)} sat`}
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
                onIconLoad(icon.origin as string, icon.url as string);
              }
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
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
                onIconError(icon.origin as string, next);
              }
            }}
          />
        ) : null}
        <span>{formatInteger(tokenInfo.amount ?? 0)}</span>
      </span>
    </div>
  );
};
