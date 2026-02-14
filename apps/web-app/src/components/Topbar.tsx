import React from "react";
import type { Route } from "../types/route";
import { formatShortNpub, getInitials } from "../utils/formatting";
import { normalizeNpubIdentifier } from "../utils/nostrNpub";

interface TopbarButton {
  icon: string;
  label: string;
  onClick: () => void;
}

interface ChatContact {
  name: string | null;
  npub: string | null;
}

interface TopbarProps {
  chatTopbarContact: ChatContact | null;
  currentNpub: string | null;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  nostrPictureByNpub: Record<string, string | null>;
  openProfileQr: () => void;
  route: Route;
  t: (key: string) => string;
  topbar: TopbarButton | null;
  topbarRight: TopbarButton | null;
  topbarTitle: string | null;
}

export function Topbar({
  chatTopbarContact,
  currentNpub,
  effectiveProfileName,
  effectiveProfilePicture,
  nostrPictureByNpub,
  openProfileQr,
  route,
  t,
  topbar,
  topbarRight,
  topbarTitle,
}: TopbarProps): React.ReactElement {
  return (
    <header className="topbar">
      <div className="topbar-left">
        {route.kind === "contacts" || route.kind === "wallet" ? (
          <button
            className="topbar-btn topbar-profile-btn"
            onClick={openProfileQr}
            aria-label={t("profile")}
            title={t("profile")}
            data-guide="profile-qr-button"
          >
            {effectiveProfilePicture ? (
              <img
                src={effectiveProfilePicture}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="topbar-profile-fallback">
                {getInitials(
                  effectiveProfileName ??
                    (currentNpub ? formatShortNpub(currentNpub) : "?"),
                )}
              </span>
            )}
          </button>
        ) : null}

        {topbar ? (
          <button
            className="topbar-btn"
            onClick={topbar.onClick}
            aria-label={topbar.label}
            title={topbar.label}
          >
            <span aria-hidden="true">{topbar.icon}</span>
          </button>
        ) : null}
      </div>

      {chatTopbarContact ? (
        <div className="topbar-chat" aria-label={t("messagesTitle")}>
          <span className="topbar-chat-avatar" aria-hidden="true">
            {(() => {
              const npub = normalizeNpubIdentifier(chatTopbarContact.npub);
              const url = npub ? nostrPictureByNpub[npub] : null;
              return url ? (
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="topbar-chat-avatar-fallback">
                  {getInitials(String(chatTopbarContact.name ?? ""))}
                </span>
              );
            })()}
          </span>
          <span className="topbar-chat-name">
            {String(chatTopbarContact.name ?? "").trim() || t("messagesTitle")}
          </span>
        </div>
      ) : topbarTitle ? (
        <div className="topbar-title" aria-label={topbarTitle}>
          {topbarTitle}
        </div>
      ) : (
        <span className="topbar-title-spacer" aria-hidden="true" />
      )}

      {topbarRight ? (
        <button
          className="topbar-btn"
          onClick={topbarRight.onClick}
          aria-label={topbarRight.label}
          title={topbarRight.label}
          {...(topbarRight.label === t("menu")
            ? { "data-guide": "open-menu" }
            : {})}
        >
          <span aria-hidden="true">{topbarRight.icon}</span>
        </button>
      ) : (
        <span className="topbar-spacer" aria-hidden="true" />
      )}
    </header>
  );
}
