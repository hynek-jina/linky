import React from "react";
import { navigateTo } from "../hooks/useRouting";
import { parseProfileGeneralStatusText } from "../nostrStatus";
import {
  formatShortLightningAddress,
  formatShortNpub,
  getInitials,
} from "../utils/formatting";
import { NfcIcon } from "./NfcIcon";
import { ProfileQrButton } from "./ProfileQrButton";

interface ProfileQrModalProps {
  canWriteToNfc: boolean;
  closeProfileQr: () => void;
  copyText: (text: string) => Promise<void>;
  currentNpub: string | null;
  currentNsec: string | null;
  effectiveMyLightningAddress: string | null;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  myProfileQr: string | null;
  profileStatus: string | null;
  profileStatusIsSaving: boolean;
  profileStatusCurrencies: readonly import("../nostrStatus").ProfileStatusCurrency[];
  selectedProfileStatusCurrencies: readonly import("../nostrStatus").ProfileStatusCurrency[];
  t: (key: string) => string;
  toggleProfileStatusCurrency: (
    currency: import("../nostrStatus").ProfileStatusCurrency,
  ) => Promise<void>;
  writeCurrentNpubToNfc: () => Promise<void>;
}

export function ProfileQrModal({
  canWriteToNfc,
  closeProfileQr,
  copyText,
  currentNpub,
  currentNsec,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  myProfileQr,
  profileStatus,
  profileStatusCurrencies,
  profileStatusIsSaving,
  selectedProfileStatusCurrencies,
  t,
  toggleProfileStatusCurrency,
  writeCurrentNpubToNfc,
}: ProfileQrModalProps): React.ReactElement {
  const profileStatusText = parseProfileGeneralStatusText(profileStatus);

  const handleCopyNpub = () => {
    if (!currentNpub) return;
    void copyText(currentNpub);
  };

  const handleCopyLightningAddress = () => {
    if (!effectiveMyLightningAddress) return;
    void copyText(effectiveMyLightningAddress);
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("profile")}
      onClick={closeProfileQr}
    >
      <div
        className="modal-sheet profile-qr-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">{t("profile")}</div>
          <div style={{ display: "inline-flex", gap: 8 }}>
            {canWriteToNfc ? (
              <button
                className="topbar-btn"
                onClick={() => void writeCurrentNpubToNfc()}
                aria-label={t("uploadProfileToNfc")}
                title={t("uploadProfileToNfc")}
                disabled={!currentNpub}
              >
                <span
                  aria-hidden="true"
                  style={{ display: "inline-flex", width: 18, height: 18 }}
                >
                  <NfcIcon />
                </span>
              </button>
            ) : null}
            <button
              className="topbar-btn"
              onClick={() => {
                closeProfileQr();
                navigateTo({ route: "profileEdit" });
              }}
              aria-label={t("edit")}
              title={t("edit")}
              disabled={!currentNpub || !currentNsec}
            >
              <span aria-hidden="true">✎</span>
            </button>
            <button
              className="topbar-btn"
              onClick={closeProfileQr}
              aria-label={t("close")}
              title={t("close")}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>

        {!currentNpub ? (
          <p className="muted">{t("profileMissingNpub")}</p>
        ) : (
          <>
            <div className="profile-detail" style={{ marginTop: 8 }}>
              <div className="contact-avatar is-xl" aria-hidden="true">
                {effectiveProfilePicture ? (
                  <img
                    src={effectiveProfilePicture}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="contact-avatar-fallback">
                    {getInitials(
                      effectiveProfileName ?? formatShortNpub(currentNpub),
                    )}
                  </span>
                )}
              </div>

              <h2 className="contact-detail-name">
                {effectiveProfileName ?? formatShortNpub(currentNpub)}
              </h2>

              {myProfileQr ? (
                <ProfileQrButton
                  qrSrc={myProfileQr}
                  qrAlt={t("myNpubQr")}
                  copyLabel={t("copy")}
                  onCopy={handleCopyNpub}
                />
              ) : (
                <p className="muted">{currentNpub}</p>
              )}

              {effectiveMyLightningAddress ? (
                <button
                  type="button"
                  className="copyable contact-detail-ln contact-detail-copy"
                  onClick={handleCopyLightningAddress}
                  title={effectiveMyLightningAddress}
                  aria-label={t("lightningAddress")}
                >
                  <span aria-hidden="true">⚡️</span>
                  <span className="contact-detail-copyText">
                    {formatShortLightningAddress(effectiveMyLightningAddress)}
                  </span>
                  <span className="contact-detail-copyIcon" aria-hidden="true">
                    ⧉
                  </span>
                </button>
              ) : null}

              {profileStatusText ? (
                <p className="muted" style={{ marginTop: 8 }}>
                  {profileStatusText}
                </p>
              ) : null}
            </div>

            <div className="profile-status-row">
              <div className="profile-status-label">
                {t("profileExchangeStatusLabel")}
              </div>
              <div className="profile-status-buttons">
                {profileStatusCurrencies.map((currency) => {
                  const isActive =
                    selectedProfileStatusCurrencies.includes(currency);

                  return (
                    <button
                      key={currency}
                      type="button"
                      className={
                        isActive
                          ? "profile-status-chip"
                          : "secondary profile-status-chip"
                      }
                      aria-pressed={isActive}
                      disabled={!currentNpub || profileStatusIsSaving}
                      onClick={() => {
                        void toggleProfileStatusCurrency(currency);
                      }}
                    >
                      {currency}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
