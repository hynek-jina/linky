import React from "react";
import { Languages, Settings } from "lucide-react";
import type {
  OnboardingStep,
  PendingOnboardingProfile,
  ReturningOnboardingStep,
} from "../app/hooks/useProfileAuthDomain";
import {
  AVATAR_EDITOR_CONTROLS,
  type AvatarEditorControlId,
} from "../derivedProfile";
import type { Lang } from "../i18n";
import { getInitials } from "../utils/formatting";
import { analyzeSlip39Input, SLIP39_WORD_COUNT } from "../utils/slip39Input";
import {
  PasswordManagerSaveForm,
  type PasswordManagerSaveFormHandle,
} from "./PasswordManagerSaveForm";
import { AvatarEditorIcon } from "./AvatarEditorIcon";
import { AvatarPhotoInput } from "./AvatarPhotoInput";
import { PasteIcon } from "./icons";

type UnauthenticatedLayoutProps = {
  confirmPendingOnboardingProfile: () => Promise<void>;
  createNewAccount: () => Promise<void>;
  cyclePendingOnboardingAvatarControl: (
    controlId: AvatarEditorControlId,
  ) => void;
  lang: Lang;
  onboardingIsBusy: boolean;
  onboardingPhotoInputRef: React.RefObject<HTMLInputElement | null>;
  onboardingStep: OnboardingStep;
  openReturningOnboarding: () => void;
  onPendingOnboardingPhotoError: (error: unknown) => void;
  onPendingOnboardingPhotoSelected: (dataUrl: string) => void;
  pasteReturningSlip39FromClipboard: () => Promise<void>;
  pickPendingOnboardingPhoto: () => Promise<void>;
  savePendingOnboardingBackupToPasswordManager: (
    username: string,
    password: string,
  ) => Promise<void>;
  selectReturningSlip39Suggestion: (value: string) => void;
  setReturningSlip39Input: (value: string) => void;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  setLang: (lang: Lang) => void;
  setPendingOnboardingName: (value: string) => void;
  submitReturningSlip39: (inputOverride?: string) => Promise<void>;
  t: (key: string) => string;
};

const formatTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    String(vars[key] ?? ""),
  );

export const UnauthenticatedLayout: React.FC<UnauthenticatedLayoutProps> = ({
  confirmPendingOnboardingProfile,
  createNewAccount,
  cyclePendingOnboardingAvatarControl,
  lang,
  onboardingIsBusy,
  onboardingPhotoInputRef,
  onboardingStep,
  openReturningOnboarding,
  onPendingOnboardingPhotoError,
  onPendingOnboardingPhotoSelected,
  pasteReturningSlip39FromClipboard,
  pickPendingOnboardingPhoto,
  savePendingOnboardingBackupToPasswordManager,
  selectReturningSlip39Suggestion,
  setReturningSlip39Input,
  setOnboardingStep,
  setLang,
  setPendingOnboardingName,
  submitReturningSlip39,
  t,
}) => {
  const showOnboardingHeader =
    onboardingStep?.kind !== "profile" && onboardingStep?.kind !== "returning";
  const [pickerMenuIsOpen, setPickerMenuIsOpen] = React.useState(false);
  const passwordManagerSaveFormRef =
    React.useRef<PasswordManagerSaveFormHandle | null>(null);

  const renderPickerMenu = () => {
    if (!pickerMenuIsOpen) return null;

    return (
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
                <Languages size={18} />
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
    );
  };

  React.useEffect(() => {
    if (
      onboardingStep?.kind === "profile" ||
      onboardingStep?.kind === "returning"
    ) {
      return;
    }
    setPickerMenuIsOpen(false);
  }, [onboardingStep]);

  const renderPreparingStep = (
    step: Extract<OnboardingStep, { kind: "preparing" }>,
  ) => {
    return (
      <>
        <div className="settings-row">
          <div className="muted" style={{ lineHeight: 1.4 }}>
            {(() => {
              const name = step.derivedName ?? "";
              if (step.step === 1) {
                return formatTemplate(t("onboardingStep1"), { name });
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

  const renderReturnStep = (step: ReturningOnboardingStep) => {
    const analysis = analyzeSlip39Input(step.input);
    const canSubmit =
      analysis.wordCount === SLIP39_WORD_COUNT &&
      analysis.invalidWords.length === 0;
    const helperMessage = step.error
      ? step.error
      : analysis.wordCount > SLIP39_WORD_COUNT
        ? t("onboardingReturnTooManyWords")
        : analysis.invalidWords.length > 0
          ? formatTemplate(t("onboardingReturnUnknownWords"), {
              words: analysis.invalidWords.slice(0, 3).join(", "),
            })
          : analysis.hasSeparatorFixups
            ? t("onboardingReturnSeparatorHint")
            : analysis.wordCount > 0
              ? formatTemplate(t("onboardingReturnWordCount"), {
                  count: String(analysis.wordCount),
                  total: String(SLIP39_WORD_COUNT),
                })
              : t("onboardingReturnHint");
    const helperClassName = step.error
      ? "onboarding-return-feedback is-error"
      : analysis.wordCount > SLIP39_WORD_COUNT ||
          analysis.invalidWords.length > 0
        ? "onboarding-return-feedback is-warning"
        : "onboarding-return-feedback";

    return (
      <div className="onboarding-avatar-stage onboarding-return-stage">
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
          <div className="topbar-title" aria-label={t("onboardingReturn")}>
            {t("onboardingReturn")}
          </div>
          <button
            type="button"
            className="topbar-btn"
            onClick={() => setPickerMenuIsOpen((current) => !current)}
            aria-label={t("menu")}
            title={t("menu")}
          >
            <Settings size={20} aria-hidden="true" />
          </button>
        </header>

        {renderPickerMenu()}

        <div className="onboarding-return-scroll">
          <div className="onboarding-return-copy">
            <div
              className="onboarding-logo onboarding-return-logo"
              aria-hidden="true"
            >
              <img
                className="onboarding-logo-svg onboarding-return-logoSvg"
                src="/icon.svg"
                alt=""
                width={256}
                height={256}
                loading="eager"
                decoding="async"
              />
            </div>
            <p className="muted onboarding-avatar-copy onboarding-return-intro">
              {t("onboardingReturnIntro")}
            </p>
          </div>

          <div className="onboarding-return-inputWrap">
            <label
              className="onboarding-avatar-nameLabel"
              htmlFor="onboarding-return-seed"
            >
              {t("seed")}
            </label>
            <div className="onboarding-return-inputRow">
              <input
                id="onboarding-return-seed"
                name="password"
                type="password"
                value={step.input}
                onChange={(event) =>
                  setReturningSlip39Input(event.target.value)
                }
                onPaste={(event) => {
                  const text = event.clipboardData?.getData("text") ?? "";
                  if (!text) return;

                  event.preventDefault();
                  setReturningSlip39Input(text);

                  const pastedAnalysis = analyzeSlip39Input(text);
                  if (pastedAnalysis.isCompleteCandidate) {
                    void submitReturningSlip39(text);
                  }
                }}
                placeholder={t("onboardingReturnPlaceholder")}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="current-password"
                autoFocus
                spellCheck={false}
              />
              <button
                type="button"
                className="onboarding-return-pasteBtn"
                onClick={() => void pasteReturningSlip39FromClipboard()}
                disabled={onboardingIsBusy}
                aria-label={t("onboardingReturnPasteButton")}
                title={t("onboardingReturnPasteButton")}
              >
                <PasteIcon className="onboarding-return-pasteIcon" />
              </button>
            </div>
          </div>

          <div
            className={helperClassName}
            role={step.error ? "status" : undefined}
          >
            {helperMessage}
          </div>

          {analysis.suggestions.length > 0 ? (
            <div
              className="onboarding-return-suggestions"
              aria-label={t("onboardingReturnSuggestions")}
            >
              {analysis.suggestions.map((word) => (
                <button
                  key={word}
                  type="button"
                  className="pill pill-muted onboarding-return-suggestion"
                  onClick={() => selectReturningSlip39Suggestion(word)}
                  disabled={onboardingIsBusy}
                >
                  {word}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="onboarding-avatar-actions onboarding-avatar-actionsAdaptive">
          <button
            type="button"
            className="btn-wide"
            onClick={() => void submitReturningSlip39()}
            disabled={onboardingIsBusy || !canSubmit}
          >
            {t("onboardingReturnConfirm")}
          </button>
        </div>
      </div>
    );
  };

  const renderProfilePicker = (profile: PendingOnboardingProfile) => {
    const selectedGeneratedAvatar = profile.selectedPictureKind === "generated";
    const submitPasswordManagerForm = () => {
      passwordManagerSaveFormRef.current?.requestSave();
    };

    const submitProfile = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const username = profile.name.trim();
      const password = profile.slip39Seed;

      if (username && password) {
        submitPasswordManagerForm();
        await savePendingOnboardingBackupToPasswordManager(username, password);

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 150);
        });
      }

      await confirmPendingOnboardingProfile();
    };

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
            <Settings size={20} aria-hidden="true" />
          </button>
        </header>

        {renderPickerMenu()}

        <PasswordManagerSaveForm
          ref={passwordManagerSaveFormRef}
          username={profile.name.trim()}
          password={profile.slip39Seed}
        />

        <form
          className="onboarding-avatar-scroll"
          onSubmit={(event) => void submitProfile(event)}
        >
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
                name="profileName"
                value={profile.name}
                onChange={(event) =>
                  setPendingOnboardingName(event.target.value)
                }
                placeholder={t("namePlaceholder")}
                autoComplete="nickname"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>

          <AvatarPhotoInput
            inputRef={onboardingPhotoInputRef}
            onError={onPendingOnboardingPhotoError}
            onSelected={onPendingOnboardingPhotoSelected}
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
                onClick={() => cyclePendingOnboardingAvatarControl(control.id)}
                disabled={onboardingIsBusy}
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
              className={`onboarding-avatar-choice onboarding-avatar-choiceCustom${selectedGeneratedAvatar ? "" : " is-selected"}`}
              onClick={() => void pickPendingOnboardingPhoto()}
              disabled={onboardingIsBusy}
              aria-pressed={!selectedGeneratedAvatar}
            >
              <span className="onboarding-avatar-choicePlus" aria-hidden="true">
                {profile.customPictureUrl ? (
                  <img
                    src={profile.customPictureUrl}
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

          <div className="onboarding-avatar-actions onboarding-avatar-actionsAdaptive">
            <button
              type="submit"
              className="btn-wide"
              disabled={onboardingIsBusy}
            >
              {t("onboardingConfirmProfile")}
            </button>
          </div>
        </form>
      </div>
    );
  };

  return (
    <section
      className={`panel panel-plain onboarding-panel${showOnboardingHeader ? "" : " onboarding-panel-compact"}`}
    >
      {showOnboardingHeader ? (
        <>
          <header className="topbar onboarding-avatar-nav">
            <div className="topbar-left">
              <span className="topbar-spacer" aria-hidden="true" />
            </div>
            <span className="topbar-title-spacer" aria-hidden="true" />
            <button
              type="button"
              className="topbar-btn"
              onClick={() => setPickerMenuIsOpen((current) => !current)}
              aria-label={t("menu")}
              title={t("menu")}
              disabled={onboardingIsBusy}
            >
              <Settings size={20} aria-hidden="true" />
            </button>
          </header>

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

          {renderPickerMenu()}
        </>
      ) : null}

      {onboardingStep ? (
        onboardingStep.kind === "profile" ? (
          renderProfilePicker(onboardingStep)
        ) : onboardingStep.kind === "returning" ? (
          renderReturnStep(onboardingStep)
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
              onClick={() => openReturningOnboarding()}
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
