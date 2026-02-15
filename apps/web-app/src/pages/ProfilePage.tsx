import React from "react";
import { formatShortNpub, getInitials } from "../utils/formatting";

interface DerivedProfile {
  lnAddress: string;
  name: string;
  pictureUrl: string;
}

interface ProfilePageProps {
  copyText: (text: string) => Promise<void>;
  currentNpub: string | null;
  derivedProfile: DerivedProfile | null;
  effectiveMyLightningAddress: string | null;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  isProfileEditing: boolean;
  myProfileQr: string | null;
  onPickProfilePhoto: () => Promise<void>;
  onProfilePhotoSelected: (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  profileEditLnAddress: string;
  profileEditName: string;
  profileEditPicture: string;
  profileEditsSavable: boolean;
  profilePhotoInputRef: React.RefObject<HTMLInputElement | null>;
  saveProfileEdits: () => Promise<void>;
  setProfileEditLnAddress: (value: string) => void;
  setProfileEditName: (value: string) => void;
  setProfileEditPicture: (value: string) => void;
  t: (key: string) => string;
}

export function ProfilePage({
  copyText,
  currentNpub,
  derivedProfile,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  isProfileEditing,
  myProfileQr,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  profileEditLnAddress,
  profileEditName,
  profileEditPicture,
  profileEditsSavable,
  profilePhotoInputRef,
  saveProfileEdits,
  setProfileEditLnAddress,
  setProfileEditName,
  setProfileEditPicture,
  t,
}: ProfilePageProps): React.ReactElement {
  return (
    <section className="panel">
      {!currentNpub ? (
        <p className="muted">{t("profileMissingNpub")}</p>
      ) : (
        <>
          {isProfileEditing ? (
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
                  <button onClick={() => void saveProfileEdits()}>
                    {t("saveChanges")}
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="profile-detail">
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

                {myProfileQr ? (
                  <button
                    type="button"
                    className="qr-copy-button"
                    onClick={() => {
                      if (!currentNpub) return;
                      void copyText(currentNpub);
                    }}
                    aria-label={t("copy")}
                    title={t("copy")}
                  >
                    <img className="qr" src={myProfileQr} alt="" />
                  </button>
                ) : (
                  <p className="muted">{currentNpub}</p>
                )}

                <h2 className="contact-detail-name">
                  {effectiveProfileName ?? formatShortNpub(currentNpub)}
                </h2>

                {effectiveMyLightningAddress ? (
                  <p className="contact-detail-ln">
                    {effectiveMyLightningAddress}
                  </p>
                ) : null}

                <p className="muted profile-note">{t("profileMessagesHint")}</p>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
