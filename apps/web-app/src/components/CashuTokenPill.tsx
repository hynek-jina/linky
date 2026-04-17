import { useAppShellCore } from "../app/context/AppShellContexts";
import { isCashuTokenUnavailableState } from "../app/lib/cashuTokenState";
import type { CashuTokenRowLike, MintUrlInput } from "../app/types/appTypes";
import { parseCashuToken } from "../cashu";
import { getNextMintIconUrl } from "../utils/mint";

interface MintIcon {
  failed: boolean;
  host: string | null;
  origin: string | null;
  url: string | null;
}

interface CashuTokenPillProps {
  ariaLabel: string;
  getMintIconUrl: (mint: MintUrlInput) => MintIcon;
  isError?: boolean;
  onClick: () => void;
  onMintIconError: (origin: string, nextUrl: string | null) => void;
  onMintIconLoad: (origin: string, url: string | null) => void;
  token: CashuTokenRowLike;
}

export function CashuTokenPill({
  ariaLabel,
  getMintIconUrl,
  isError = false,
  onClick,
  onMintIconError,
  onMintIconLoad,
  token,
}: CashuTokenPillProps) {
  const { formatDisplayedAmountParts } = useAppShellCore();
  const tokenText = String(token.token ?? token.rawToken ?? "").trim();
  const storedAmount = Number(token.amount ?? 0);
  const storedMint = String(token.mint ?? "").trim();

  const parsed =
    !storedMint || !(storedAmount > 0)
      ? tokenText
        ? parseCashuToken(tokenText)
        : null
      : null;

  const amount =
    (Number.isFinite(storedAmount) && storedAmount > 0
      ? storedAmount
      : parsed && Number.isFinite(parsed.amount) && parsed.amount > 0
        ? parsed.amount
        : 0) || 0;

  const mint = storedMint
    ? storedMint
    : parsed?.mint
      ? String(parsed.mint).trim()
      : null;
  const icon = getMintIconUrl(mint);
  const showMintFallback = icon.failed || !icon.url;
  const displayAmount = formatDisplayedAmountParts(amount);
  const isMuted = isCashuTokenUnavailableState(token.state);

  return (
    <button
      className={
        isError ? "pill pill-error" : isMuted ? "pill pill-muted" : "pill"
      }
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
            onError={() => {
              if (icon.origin) {
                const next = getNextMintIconUrl(icon.url, icon.origin);
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
        <span>
          {displayAmount.approxPrefix}
          {displayAmount.amountText}
        </span>
      </span>
    </button>
  );
}
