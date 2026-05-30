import React from "react";
import { ProfileAvatarEditor } from "../components/ProfileAvatarEditor";
import { ProfileQrButton } from "../components/ProfileQrButton";
import type { AvatarEditorControlId } from "../derivedProfile";
import { useNavigation } from "../hooks/useRouting";
import {
  parseProfileGeneralStatusText,
  type ProfileStatusCurrency,
} from "../nostrStatus";
import {
  formatShortLightningAddress,
  formatShortNpub,
  getInitials,
} from "../utils/formatting";

interface DerivedProfile {
  lnAddress: string;
  name: string;
  pictureUrl: string;
}

interface ProfilePageProps {
  copyText: (text: string) => Promise<void>;
  currentNpub: string | null;
  cycleProfileAvatarControl: (controlId: AvatarEditorControlId) => void;
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
  ownedLightningAddresses: readonly string[];
  profileCustomPictureUrl: string;
  profileEditLnAddress: string;
  profileEditName: string;
  profileEditPicture: string;
  profileEditStatus: string;
  profileEditsSavable: boolean;
  profileStatus: string | null;
  profileStatusCurrencies: readonly ProfileStatusCurrency[];
  profileStatusIsSaving: boolean;
  profilePhotoInputRef: React.RefObject<HTMLInputElement | null>;
  profileSelectedPictureKind: "custom" | "generated";
  saveProfileEdits: () => Promise<void>;
  selectedProfileStatusCurrencies: readonly ProfileStatusCurrency[];
  setProfileEditLnAddress: (value: string) => void;
  setProfileEditName: (value: string) => void;
  setProfileEditStatus: (value: string) => void;
  t: (key: string) => string;
  toggleProfileStatusCurrency: (
    currency: ProfileStatusCurrency,
  ) => Promise<void>;
}

export function ProfilePage({
  copyText,
  currentNpub,
  cycleProfileAvatarControl,
  derivedProfile,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  isProfileEditing,
  myProfileQr,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  ownedLightningAddresses,
  profileCustomPictureUrl,
  profileEditLnAddress,
  profileEditName,
  profileEditPicture,
  profileEditStatus,
  profileEditsSavable,
  profileStatus,
  profileStatusCurrencies,
  profileStatusIsSaving,
  profilePhotoInputRef,
  profileSelectedPictureKind,
  saveProfileEdits,
  selectedProfileStatusCurrencies,
  setProfileEditLnAddress,
  setProfileEditName,
  setProfileEditStatus,
  t,
  toggleProfileStatusCurrency,
}: ProfilePageProps): React.ReactElement {
  const navigateTo = useNavigation();
  const profileStatusText = parseProfileGeneralStatusText(profileStatus);
  const hasOwnedLightningAddress = ownedLightningAddresses.length > 0;

  return (
    <section className="panel">
      {!currentNpub ? (
        <p className="muted">{t("profileMissingNpub")}</p>
      ) : (
        <>
          {isProfileEditing ? (
            <>
              <ProfileAvatarEditor
                currentNpub={currentNpub}
                cycleProfileAvatarControl={cycleProfileAvatarControl}
                effectiveProfileName={effectiveProfileName}
                effectiveProfilePicture={effectiveProfilePicture}
                onPickProfilePhoto={onPickProfilePhoto}
                onProfilePhotoSelected={onProfilePhotoSelected}
                profileCustomPictureUrl={profileCustomPictureUrl}
                profileEditName={profileEditName}
                profileEditPicture={profileEditPicture}
                profilePhotoInputRef={profilePhotoInputRef}
                profileSelectedPictureKind={profileSelectedPictureKind}
                t={t}
              />

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <label htmlFor="profileName">{t("name")}</label>
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
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      navigateTo({ route: "profileClaimLightningAddress" })
                    }
                    style={{ paddingInline: 10 }}
                  >
                    {t("claimOwnLightningAddressAction")}
                  </button>
                  {!hasOwnedLightningAddress &&
                  derivedProfile &&
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

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <label htmlFor="profileStatus">{t("status")}</label>
              </div>
              <input
                id="profileStatus"
                value={profileEditStatus}
                onChange={(e) => setProfileEditStatus(e.target.value)}
                placeholder={t("status")}
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

                <h2 className="contact-detail-name">
                  {effectiveProfileName ?? formatShortNpub(currentNpub)}
                </h2>

                {myProfileQr ? (
                  <ProfileQrButton
                    qrSrc={myProfileQr}
                    qrAlt={t("myNpubQr")}
                    copyLabel={t("copy")}
                    onCopy={() => {
                      if (!currentNpub) return;
                      void copyText(currentNpub);
                    }}
                  />
                ) : (
                  <p className="muted">{currentNpub}</p>
                )}

                {effectiveMyLightningAddress ? (
                  <button
                    type="button"
                    className="copyable contact-detail-ln contact-detail-copy"
                    onClick={() => void copyText(effectiveMyLightningAddress)}
                    title={effectiveMyLightningAddress}
                    aria-label={t("lightningAddress")}
                  >
                    <span aria-hidden="true">⚡️</span>
                    <span className="contact-detail-copyText">
                      {formatShortLightningAddress(effectiveMyLightningAddress)}
                    </span>
                    <span
                      className="contact-detail-copyIcon"
                      aria-hidden="true"
                    >
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
            </>
          )}

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
    </section>
  );
}
