import type { AvatarEditorControlId } from "../derivedProfile";
import { AVATAR_EDITOR_CONTROLS } from "../derivedProfile";
import { AvatarEditorIcon } from "./AvatarEditorIcon";

interface AvatarControlGridProps {
  customPictureUrl: string | null;
  disabled?: boolean;
  isCustomSelected: boolean;
  onCycle: (controlId: AvatarEditorControlId) => void;
  onPickCustom: () => void;
  t: (key: string) => string;
}

export function AvatarControlGrid({
  customPictureUrl,
  disabled = false,
  isCustomSelected,
  onCycle,
  onPickCustom,
  t,
}: AvatarControlGridProps) {
  return (
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
          onClick={() => onCycle(control.id)}
          disabled={disabled}
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
        className={`onboarding-avatar-choice onboarding-avatar-choiceCustom${isCustomSelected ? " is-selected" : ""}`}
        onClick={onPickCustom}
        disabled={disabled}
        aria-pressed={isCustomSelected}
      >
        <span className="onboarding-avatar-choicePlus" aria-hidden="true">
          {customPictureUrl ? (
            <img
              src={customPictureUrl}
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
  );
}
