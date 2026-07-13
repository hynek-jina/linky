import React from "react";
import {
  AVATAR_EDITOR_CONTROLS,
  type AvatarEditorControlId,
} from "../derivedProfile";
import { formatShortNpub, getInitials } from "../utils/formatting";
import { AvatarEditorIcon } from "./AvatarEditorIcon";
import { AvatarPhotoInput } from "./AvatarPhotoInput";

interface ProfileAvatarEditorProps {
  currentNpub: string;
  cycleProfileAvatarControl: (controlId: AvatarEditorControlId) => void;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  onProfilePhotoError: (error: unknown) => void;
  onPickProfilePhoto: () => void;
  onProfilePhotoSelected: (dataUrl: string) => void;
  profileCustomPictureUrl: string;
  profileEditName: string;
  profileEditPicture: string;
  profilePhotoInputRef: React.RefObject<HTMLInputElement | null>;
  profileSelectedPictureKind: "custom" | "generated";
  t: (key: string) => string;
}

export function ProfileAvatarEditor({
  currentNpub,
  cycleProfileAvatarControl,
  effectiveProfileName,
  effectiveProfilePicture,
  onProfilePhotoError,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  profileCustomPictureUrl,
  profileEditName,
  profileEditPicture,
  profilePhotoInputRef,
  profileSelectedPictureKind,
  t,
}: ProfileAvatarEditorProps): React.ReactElement {
  const previewPicture = profileEditPicture || effectiveProfilePicture;
  const previewName =
    profileEditName.trim() ||
    effectiveProfileName ||
    formatShortNpub(currentNpub);

  return (
    <div className="profile-avatar-editor">
      <div className="onboarding-avatar-preview">
        <div
          className="contact-avatar is-xl onboarding-avatar-previewImage"
          aria-hidden="true"
        >
          {previewPicture ? (
            <img
              src={previewPicture}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="contact-avatar-fallback">
              {getInitials(previewName)}
            </span>
          )}
        </div>
      </div>

      <AvatarPhotoInput
        inputRef={profilePhotoInputRef}
        onError={onProfilePhotoError}
        onSelected={onProfilePhotoSelected}
        t={t}
      />

      <div
        className="onboarding-avatar-grid"
        role="list"
        aria-label={t("onboardingAvatarGridLabel")}
      >
        {AVATAR_EDITOR_CONTROLS.map((control) => (
          <button
            key={control.id}
            type="button"
            className="onboarding-avatar-choice onboarding-avatar-editButton"
            onClick={() => cycleProfileAvatarControl(control.id)}
            aria-label={control.label}
            title={control.label}
          >
            <span
              className="onboarding-avatar-choicePlus onboarding-avatar-editEmoji"
              aria-hidden="true"
            >
              <AvatarEditorIcon controlId={control.id} />
            </span>
          </button>
        ))}

        <button
          type="button"
          className={`onboarding-avatar-choice onboarding-avatar-choiceCustom${profileSelectedPictureKind === "custom" ? " is-selected" : ""}`}
          onClick={() => void onPickProfilePhoto()}
          aria-pressed={profileSelectedPictureKind === "custom"}
        >
          <span className="onboarding-avatar-choicePlus" aria-hidden="true">
            {profileCustomPictureUrl ? (
              <img
                src={profileCustomPictureUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : (
              "+"
            )}
          </span>
          <span className="onboarding-avatar-choiceLabel">
            {t("profileUploadPhoto")}
          </span>
        </button>
      </div>
    </div>
  );
}
