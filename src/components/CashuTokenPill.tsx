interface MintIcon {
  failed: boolean;
  host: string | null;
  origin: string | null;
  url: string | null;
}

interface CashuTokenPillProps {
  ariaLabel: string;
  formatInteger: (n: number) => string;
  getMintIconUrl: (mint: unknown) => MintIcon;
  isError?: boolean;
  onClick: () => void;
  onMintIconError: (origin: string, nextUrl: string | null) => void;
  onMintIconLoad: (origin: string, url: string | null) => void;
  token: unknown;
}

export function CashuTokenPill({
  ariaLabel,
  formatInteger,
  getMintIconUrl,
  isError = false,
  onClick,
  onMintIconError,
  onMintIconLoad,
  token,
}: CashuTokenPillProps) {
  const amount =
    Number((token as unknown as { amount?: unknown }).amount ?? 0) || 0;
  const mint = (token as unknown as { mint?: unknown }).mint;
  const icon = getMintIconUrl(mint);
  const showMintFallback = icon.failed || !icon.url;

  return (
    <button
      className={isError ? "pill pill-error" : "pill"}
      onClick={onClick}
      style={{ cursor: "pointer" }}
      aria-label={ariaLabel}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
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
                onMintIconError(icon.origin, next);
              }
            }}
          />
        ) : null}
        {showMintFallback && icon.host ? (
          <span className="muted" style={{ fontSize: 10, lineHeight: "14px" }}>
            {icon.host}
          </span>
        ) : null}
        <span>{formatInteger(amount)}</span>
      </span>
    </button>
  );
}
