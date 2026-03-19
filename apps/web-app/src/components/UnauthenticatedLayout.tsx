import React from "react";
import type {
  OnboardingStep,
  PendingOnboardingProfile,
} from "../app/hooks/useProfileAuthDomain";
import type { Lang } from "../i18n";
import { getInitials } from "../utils/formatting";

type UnauthenticatedLayoutProps = {
  confirmPendingOnboardingProfile: () => Promise<void>;
  createNewAccount: () => Promise<void>;
  lang: Lang;
  onboardingIsBusy: boolean;
  onboardingPhotoInputRef: React.RefObject<HTMLInputElement | null>;
  onboardingStep: OnboardingStep;
  onPendingOnboardingPhotoSelected: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  pasteExistingNsec: () => Promise<void>;
  pickPendingOnboardingPhoto: () => Promise<void>;
  selectPendingOnboardingAvatar: (pictureUrl: string) => void;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  setLang: (lang: Lang) => void;
  setPendingOnboardingName: (value: string) => void;
  t: (key: string) => string;
};

export const UnauthenticatedLayout: React.FC<UnauthenticatedLayoutProps> = ({
  confirmPendingOnboardingProfile,
  createNewAccount,
  lang,
  onboardingIsBusy,
  onboardingPhotoInputRef,
  onboardingStep,
  onPendingOnboardingPhotoSelected,
  pasteExistingNsec,
  pickPendingOnboardingPhoto,
  selectPendingOnboardingAvatar,
  setOnboardingStep,
  setLang,
  setPendingOnboardingName,
  t,
}) => {
  const showOnboardingHeader = onboardingStep?.kind !== "profile";
  const [pickerMenuIsOpen, setPickerMenuIsOpen] = React.useState(false);

  React.useEffect(() => {
    if (onboardingStep?.kind === "profile") return;
    setPickerMenuIsOpen(false);
  }, [onboardingStep]);

  const renderPreparingStep = (
    step: Exclude<OnboardingStep, PendingOnboardingProfile | null>,
  ) => {
    return (
      <>
        <div className="settings-row">
          <div className="muted" style={{ lineHeight: 1.4 }}>
            {(() => {
              const format = (template: string, vars: Record<string, string>) =>
                template.replace(/\{(\w+)\}/g, (_match, key: string) =>
                  String(vars[key] ?? ""),
                );

              const name = step.derivedName ?? "";
              if (step.step === 1) {
                return format(t("onboardingStep1"), { name });
              }
              return t("onboardingStep2");
            })()}
          </div>
        </div>

        {step.error ? (
          <div className="settings-row">
            <div className="status" role="status">
              {step.error}
            </div>
          </div>
        ) : null}

        <div className="settings-row">
          <button
            type="button"
            className="btn-wide secondary"
            onClick={() => setOnboardingStep(null)}
            disabled={onboardingIsBusy}
          >
            {t("onboardingRetry")}
          </button>
        </div>
      </>
    );
  };

  const renderProfilePicker = (profile: PendingOnboardingProfile) => {
    const selectedGeneratedAvatar = profile.avatarChoices.some(
      (choice) => choice.pictureUrl === profile.pictureUrl,
    );

    return (
      <div className="onboarding-avatar-stage">
        <header className="topbar onboarding-avatar-nav">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-btn"
              onClick={() => {
                setPickerMenuIsOpen(false);
                setOnboardingStep(null);
              }}
              disabled={onboardingIsBusy}
              aria-label={t("back")}
              title={t("back")}
            >
              <span aria-hidden="true">&lt;</span>
            </button>
          </div>
          <div className="topbar-title" aria-label={t("onboardingAvatarTitle")}>
            {t("onboardingAvatarTitle")}
          </div>
          <button
            type="button"
            className="topbar-btn"
            onClick={() => setPickerMenuIsOpen((current) => !current)}
            aria-label={t("menu")}
            title={t("menu")}
          >
            <span aria-hidden="true">☰</span>
          </button>
        </header>

        {pickerMenuIsOpen ? (
          <div
            className="menu-modal-overlay"
            role="dialog"
            aria-modal="false"
            aria-label={t("menu")}
            onClick={() => setPickerMenuIsOpen(false)}
          >
            <div
              className="menu-modal-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="settings-row">
                <div className="settings-left">
                  <span className="settings-icon" aria-hidden="true">
                    🌐
                  </span>
                  <span className="settings-label">{t("language")}</span>
                </div>
                <div className="settings-right">
                  <select
                    className="select"
                    value={lang}
                    onChange={(event) =>
                      setLang(event.target.value === "cs" ? "cs" : "en")
                    }
                    aria-label={t("language")}
                  >
                    <option value="cs">{t("czech")}</option>
                    <option value="en">{t("english")}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <>
          <p className="muted onboarding-avatar-copy">
            {t("onboardingAvatarIntro")}
          </p>

          <div className="onboarding-avatar-preview">
            <div
              className="contact-avatar is-xl onboarding-avatar-previewImage"
              aria-hidden="true"
            >
              {profile.pictureUrl ? (
                <img
                  src={profile.pictureUrl}
                  alt=""
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="contact-avatar-fallback">
                  {getInitials(profile.name || t("profileNoName"))}
                </span>
              )}
            </div>

            <div className="onboarding-avatar-nameWrap">
              <label
                className="onboarding-avatar-nameLabel"
                htmlFor="onboarding-profile-name"
              >
                {t("name")}
              </label>
              <input
                id="onboarding-profile-name"
                value={profile.name}
                onChange={(event) =>
                  setPendingOnboardingName(event.target.value)
                }
                placeholder={t("namePlaceholder")}
                autoFocus
              />
            </div>
          </div>

          <input
            ref={onboardingPhotoInputRef}
            type="file"
            accept="image/*"
            onChange={(event) => void onPendingOnboardingPhotoSelected(event)}
            style={{ display: "none" }}
          />

          <div
            className="onboarding-avatar-grid"
            role="list"
            aria-label={t("onboardingAvatarGridLabel")}
          >
            {profile.avatarChoices.map((choice) => {
              const isSelected = choice.pictureUrl === profile.pictureUrl;

              return (
                <button
                  key={choice.id}
                  type="button"
                  className={`onboarding-avatar-choice${isSelected ? " is-selected" : ""}`}
                  onClick={() =>
                    selectPendingOnboardingAvatar(choice.pictureUrl)
                  }
                  aria-pressed={isSelected}
                >
                  <span
                    className="contact-avatar onboarding-avatar-choiceImage"
                    aria-hidden="true"
                  >
                    <img
                      src={choice.pictureUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              className={`onboarding-avatar-choice onboarding-avatar-choiceCustom${selectedGeneratedAvatar ? "" : " is-selected"}`}
              onClick={() => void pickPendingOnboardingPhoto()}
              aria-pressed={!selectedGeneratedAvatar}
            >
              <span className="onboarding-avatar-choicePlus" aria-hidden="true">
                {profile.pictureUrl && !selectedGeneratedAvatar ? (
                  <img
                    src={profile.pictureUrl}
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

          {profile.error ? (
            <div className="settings-row">
              <div className="status" role="status">
                {profile.error}
              </div>
            </div>
          ) : null}

          <div className="onboarding-avatar-actions">
            <button
              type="button"
              className="btn-wide"
              onClick={() => void confirmPendingOnboardingProfile()}
              disabled={onboardingIsBusy}
            >
              {t("onboardingConfirmProfile")}
            </button>
          </div>
        </>
      </div>
    );
  };

  return (
    <section
      className={`panel panel-plain onboarding-panel${showOnboardingHeader ? "" : " onboarding-panel-compact"}`}
    >
      {showOnboardingHeader ? (
        <>
          <div className="onboarding-logo" aria-hidden="true">
            <img
              className="onboarding-logo-svg"
              src="/icon.svg"
              alt=""
              width={256}
              height={256}
              loading="eager"
              decoding="async"
            />
          </div>
          <h1 className="page-title">{t("onboardingTitle")}</h1>

          <p
            className="muted"
            style={{
              margin: "6px 0 12px",
              lineHeight: 1.4,
              textAlign: "center",
            }}
          >
            {t("onboardingSubtitle")}
          </p>
        </>
      ) : null}

      {onboardingStep ? (
        onboardingStep.kind === "profile" ? (
          renderProfilePicker(onboardingStep)
        ) : (
          renderPreparingStep(onboardingStep)
        )
      ) : (
        <>
          <div className="settings-row">
            <button
              type="button"
              className="btn-wide"
              onClick={() => void createNewAccount()}
              disabled={onboardingIsBusy}
            >
              {t("onboardingCreate")}
            </button>
          </div>

          <div className="settings-row">
            <button
              type="button"
              className="btn-wide secondary"
              onClick={() => void pasteExistingNsec()}
              disabled={onboardingIsBusy}
            >
              {t("onboardingReturn")}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
