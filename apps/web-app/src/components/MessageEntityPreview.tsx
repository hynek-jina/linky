import React from "react";
import { useAppShellCore } from "../app/context/AppShellContexts";
import type { CashuTokenMessageInfo } from "../app/lib/tokenMessageInfo";
import type { MintUrlInput } from "../app/types/appTypes";
import { deriveDefaultProfile } from "../derivedProfile";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";
import type { NpubMessageContactInfo } from "./ChatMessage";

const ENTITY_PATTERN =
  /(?:nostr:)?npub1[023456789acdefghjklmnpqrstuvwxyz]+(?:@npub\.cash)?|cashu[0-9A-Za-z_-]+={0,2}/gi;

interface MessageEntityPreviewProps {
  className?: string;
  content: string;
  directionSymbol?: string;
  getCashuTokenMessageInfo: (text: string) => CashuTokenMessageInfo | null;
  getMintIconUrl: (mint: MintUrlInput) => {
    url: string | null;
  };
  getNpubMessageContactInfo: (npub: string) => NpubMessageContactInfo | null;
  onOpenNpubContact?: (npub: string) => void;
}

export const MessageEntityPreview: React.FC<MessageEntityPreviewProps> = ({
  className,
  content,
  directionSymbol,
  getCashuTokenMessageInfo,
  getMintIconUrl,
  getNpubMessageContactInfo,
  onOpenNpubContact,
}) => {
  const { formatDisplayedAmountText } = useAppShellCore();
  const matches = Array.from(content.matchAll(ENTITY_PATTERN));
  const segments: React.ReactNode[] = [];
  let cursor = 0;

  if (directionSymbol) segments.push(`${directionSymbol} `);

  for (const match of matches) {
    const text = String(match[0] ?? "");
    const start = match.index ?? 0;
    if (start > cursor) segments.push(content.slice(cursor, start));

    const npub = normalizeNpubIdentifier(text);
    const contactInfo = npub ? getNpubMessageContactInfo(npub) : null;
    const tokenInfo = npub ? null : getCashuTokenMessageInfo(text);

    if (contactInfo) {
      const avatar = contactInfo.pictureUrl;
      const label = contactInfo.displayName;
      const pillContent = (
        <>
          <span className="chat-contact-pill-avatar" aria-hidden="true">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="chat-contact-pill-avatar-fallback">
                {deriveDefaultProfile(contactInfo.npub).name.charAt(0)}
              </span>
            )}
          </span>
          <span className="chat-contact-pill-label">{label}</span>
        </>
      );
      segments.push(
        onOpenNpubContact ? (
          <button
            key={`${start}-npub`}
            type="button"
            className="pill chat-contact-pill"
            onClick={() => onOpenNpubContact(contactInfo.npub)}
          >
            {pillContent}
          </button>
        ) : (
          <span key={`${start}-npub`} className="pill chat-contact-pill">
            {pillContent}
          </span>
        ),
      );
    } else if (tokenInfo) {
      const icon = getMintIconUrl(tokenInfo.mintUrl);
      segments.push(
        <span
          key={`${start}-cashu`}
          className={
            tokenInfo.isValid
              ? "pill chat-token-pill"
              : "pill pill-muted chat-token-pill"
          }
        >
          {icon.url ? (
            <img
              src={icon.url}
              alt=""
              width={14}
              height={14}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <span>{formatDisplayedAmountText(tokenInfo.amount ?? 0)}</span>
        </span>,
      );
    } else {
      segments.push(text);
    }
    cursor = start + text.length;
  }

  if (cursor < content.length) segments.push(content.slice(cursor));

  return <div className={className}>{segments}</div>;
};
