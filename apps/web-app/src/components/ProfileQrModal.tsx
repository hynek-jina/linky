import React from "react";
import {
  formatShortLightningAddress,
  formatShortNpub,
  getInitials,
} from "../utils/formatting";
import { ProfileQrButton } from "./ProfileQrButton";

interface ProfileQrModalProps {
  closeProfileQr: () => void;
  copyText: (text: string) => Promise<void>;
  currentNpub: string | null;
  currentNsec: string | null;
  derivedProfile: {
    lnAddress: string;
    name: string;
    pictureUrl: string;
  } | null;
  effectiveMyLightningAddress: string | null;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  isProfileEditing: boolean;
  myProfileQr: string | null;
  onClose: () => void;
  onPickProfilePhoto: () => void;
  onProfilePhotoSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveProfileEdits: () => void;
  profileEditInitialRef: React.MutableRefObject<{
    lnAddress: string;
    name: string;
    picture: string;
  } | null>;
  profileEditLnAddress: string;
  profileEditName: string;
  profileEditPicture: string;
  profileEditsSavable: boolean;
  profilePhotoInputRef: React.RefObject<HTMLInputElement | null>;
  setIsProfileEditing: (editing: boolean) => void;
  setProfileEditLnAddress: (value: string) => void;
  setProfileEditName: (value: string) => void;
  setProfileEditPicture: (value: string) => void;
  t: (key: string) => string;
  toggleProfileEditing: () => void;
}

export function ProfileQrModal({
  closeProfileQr,
  copyText,
  currentNpub,
  currentNsec,
  derivedProfile,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  isProfileEditing,
  myProfileQr,
  onClose,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  onSaveProfileEdits,
  profileEditInitialRef,
  profileEditLnAddress,
  profileEditName,
  profileEditPicture,
  profileEditsSavable,
  profilePhotoInputRef,
  setIsProfileEditing,
  setProfileEditLnAddress,
  setProfileEditName,
  setProfileEditPicture,
  t,
  toggleProfileEditing,
}: ProfileQrModalProps): React.ReactElement {
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
            <button
              className="topbar-btn"
              onClick={toggleProfileEditing}
              aria-label={t("edit")}
              title={t("edit")}
              disabled={!currentNpub || !currentNsec}
            >
              <span aria-hidden="true">✎</span>
            </button>
            <button
              className="topbar-btn"
              onClick={() => {
                setIsProfileEditing(false);
                profileEditInitialRef.current = null;
                onClose();
              }}
              aria-label={t("close")}
              title={t("close")}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>

        {!currentNpub ? (
          <p className="muted">{t("profileMissingNpub")}</p>
        ) : isProfileEditing ? (
          <>
            <div className="profile-detail" style={{ marginBottom: 10 }}>
              <div className="contact-avatar is-xl" aria-hidden="true">
                {profileEditPicture ? (
                  <img
                    src={profileEditPicture}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : effectiveProfilePicture ? (
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

              <input
                ref={profilePhotoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void onProfilePhotoSelected(e)}
                style={{ display: "none" }}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void onPickProfilePhoto()}
                >
                  {t("profileUploadPhoto")}
                </button>

                {derivedProfile &&
                profileEditPicture.trim() !== derivedProfile.pictureUrl ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setProfileEditPicture(derivedProfile.pictureUrl)
                    }
                    title={t("restore")}
                    aria-label={t("restore")}
                    style={{ paddingInline: 10, minWidth: 40 }}
                  >
                    ↺
                  </button>
                ) : null}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <label htmlFor="profileName">{t("name")}</label>
              {derivedProfile &&
              profileEditName.trim() !== derivedProfile.name ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setProfileEditName(derivedProfile.name)}
                  title={t("restore")}
                  aria-label={t("restore")}
                  style={{ paddingInline: 10, minWidth: 40 }}
                >
                  ↺
                </button>
              ) : null}
            </div>
            <input
              id="profileName"
              value={profileEditName}
              onChange={(e) => setProfileEditName(e.target.value)}
              placeholder={t("name")}
            />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <label htmlFor="profileLn">{t("lightningAddress")}</label>
              {derivedProfile &&
              profileEditLnAddress.trim() !== derivedProfile.lnAddress ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setProfileEditLnAddress(derivedProfile.lnAddress)
                  }
                  title={t("restore")}
                  aria-label={t("restore")}
                  style={{ paddingInline: 10, minWidth: 40 }}
                >
                  ↺
                </button>
              ) : null}
            </div>
            <input
              id="profileLn"
              value={profileEditLnAddress}
              onChange={(e) => setProfileEditLnAddress(e.target.value)}
              placeholder={t("lightningAddress")}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />

            <div className="panel-header" style={{ marginTop: 14 }}>
              {profileEditsSavable ? (
                <button onClick={() => void onSaveProfileEdits()}>
                  {t("saveChanges")}
                </button>
              ) : null}
            </div>
          </>
        ) : (
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
          </div>
        )}
      </div>
    </div>
  );
}
