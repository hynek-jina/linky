import type { TokenRowId, WalletToken } from "@linky/linkshu";
import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import { isCashuTokenUnavailableState } from "../app/lib/cashuTokenState";
import type { MintUrlInput } from "../app/types/appTypes";
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
  onMintIconError: (origin: string, nextUrl: string | null) => void;
  onMintIconLoad: (origin: string, url: string | null) => void;
  onOpenToken: (id: TokenRowId) => void;
  token: WalletToken;
}

function areMintIconsEqual(previous: MintIcon, next: MintIcon) {
  return (
    previous.failed === next.failed &&
    previous.host === next.host &&
    previous.origin === next.origin &&
    previous.url === next.url
  );
}

function arePropsEqual(
  previous: CashuTokenPillProps,
  next: CashuTokenPillProps,
) {
  if (
    previous.ariaLabel !== next.ariaLabel ||
    previous.isError !== next.isError ||
    previous.onMintIconError !== next.onMintIconError ||
    previous.onMintIconLoad !== next.onMintIconLoad ||
    previous.onOpenToken !== next.onOpenToken ||
    previous.token !== next.token
  ) {
    return false;
  }

  if (previous.getMintIconUrl === next.getMintIconUrl) return true;

  return areMintIconsEqual(
    previous.getMintIconUrl(next.token.mint),
    next.getMintIconUrl(next.token.mint),
  );
}

export const CashuTokenPill = React.memo(function CashuTokenPill({
  ariaLabel,
  getMintIconUrl,
  isError = false,
  onMintIconError,
  onMintIconLoad,
  onOpenToken,
  token,
}: CashuTokenPillProps) {
  const { formatDisplayedAmountParts } = useAppShellCore();

  const icon = getMintIconUrl(token.mint);
  const showMintFallback = icon.failed || !icon.url;
  const displayAmount = formatDisplayedAmountParts(token.amount);
  const isMuted = isCashuTokenUnavailableState(token.state);
  const handleClick = React.useCallback(() => {
    onOpenToken(token.id);
  }, [onOpenToken, token.id]);

  return (
    <button
      className={
        isError ? "pill pill-error" : isMuted ? "pill pill-muted" : "pill"
      }
      onClick={handleClick}
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
          {displayAmount.unitLabel ? ` ${displayAmount.unitLabel}` : ""}
        </span>
      </span>
    </button>
  );
}, arePropsEqual);
