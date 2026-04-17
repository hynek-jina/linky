import React from "react";
import type {
  OnboardingStep,
  PendingOnboardingProfile,
  ReturningOnboardingStep,
  SaveKeysOnboardingStep,
} from "../app/hooks/useProfileAuthDomain";
import type { Lang } from "../i18n";
import { getInitials } from "../utils/formatting";
import { analyzeSlip39Input, SLIP39_WORD_COUNT } from "../utils/slip39Input";

type UnauthenticatedLayoutProps = {
  canLoadReturningSlip39FromPasswordManager: boolean;
  continueAfterPasswordManagerSave: () => void;
  confirmPendingOnboardingProfile: () => Promise<void>;
  createNewAccount: () => Promise<void>;
  lang: Lang;
  onboardingIsBusy: boolean;
  onboardingPhotoInputRef: React.RefObject<HTMLInputElement | null>;
  onboardingStep: OnboardingStep;
  openReturningOnboarding: () => void;
  onPendingOnboardingPhotoSelected: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  pasteReturningSlip39FromClipboard: () => Promise<void>;
  pickPendingOnboardingPhoto: () => Promise<void>;
  returningPasswordManagerUsername: string;
  selectReturningSlip39Suggestion: (value: string) => void;
  selectPendingOnboardingAvatar: (pictureUrl: string) => void;
  setReturningSlip39Input: (value: string) => void;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  setLang: (lang: Lang) => void;
  setPendingOnboardingName: (value: string) => void;
  submitReturningSlip39: (inputOverride?: string) => Promise<void>;
  t: (key: string) => string;
  triggerReturningSlip39PasswordManagerPrompt: (options?: {
    silentWhenMissing?: boolean;
  }) => Promise<boolean>;
};

const formatTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    String(vars[key] ?? ""),
  );

export const UnauthenticatedLayout: React.FC<UnauthenticatedLayoutProps> = ({
  canLoadReturningSlip39FromPasswordManager,
  continueAfterPasswordManagerSave,
  confirmPendingOnboardingProfile,
  createNewAccount,
  lang,
  onboardingIsBusy,
  onboardingPhotoInputRef,
  onboardingStep,
  openReturningOnboarding,
  onPendingOnboardingPhotoSelected,
  pasteReturningSlip39FromClipboard,
  pickPendingOnboardingPhoto,
  returningPasswordManagerUsername,
  selectReturningSlip39Suggestion,
  selectPendingOnboardingAvatar,
  setReturningSlip39Input,
  setOnboardingStep,
  setLang,
  setPendingOnboardingName,
  submitReturningSlip39,
  t,
  triggerReturningSlip39PasswordManagerPrompt,
}) => {
  const showOnboardingHeader =
    onboardingStep?.kind !== "profile" && onboardingStep?.kind !== "returning";
  const [pickerMenuIsOpen, setPickerMenuIsOpen] = React.useState(false);
  const [
    returningPasswordManagerBridgeArmed,
    setReturningPasswordManagerBridgeArmed,
  ] = React.useState(false);
  const returningPasswordManagerUsernameRef =
    React.useRef<HTMLInputElement | null>(null);
  const returningPasswordManagerInputRef =
    React.useRef<HTMLInputElement | null>(null);
  const returningSeedTextareaRef = React.useRef<HTMLTextAreaElement | null>(
    null,
  );

  React.useEffect(() => {
    if (
      onboardingStep?.kind === "profile" ||
      onboardingStep?.kind === "returning"
    ) {
      return;
    }
    setPickerMenuIsOpen(false);
  }, [onboardingStep]);

  React.useEffect(() => {
    const input = returningPasswordManagerUsernameRef.current;
    if (!input) return;
    if (input.value === returningPasswordManagerUsername) return;

    input.value = returningPasswordManagerUsername;
  }, [returningPasswordManagerUsername]);

  React.useEffect(() => {
    if (onboardingStep?.kind === "returning") return;
    setReturningPasswordManagerBridgeArmed(false);
  }, [onboardingStep]);

  React.useEffect(() => {
    if (onboardingStep?.kind !== "returning") return;

    const input = returningPasswordManagerInputRef.current;
    if (!input) return;
    if (document.activeElement === input) return;
    if (input.value === onboardingStep.input) return;

    input.value = onboardingStep.input;
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

          <form
            className="onboarding-return-inputWrap"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) void submitReturningSlip39();
            }}
            autoComplete="on"
          >
            <label
              className="onboarding-avatar-nameLabel"
              htmlFor="onboarding-return-seed"
            >
              {t("seed")}
            </label>
            {canLoadReturningSlip39FromPasswordManager ? (
              <div
                className="onboarding-return-passwordManagerBridge"
                aria-hidden="true"
              >
                <input
                  id="onboarding-return-username"
                  ref={returningPasswordManagerUsernameRef}
                  type="text"
                  name="username"
                  autoComplete="username"
                  defaultValue={returningPasswordManagerUsername}
                  tabIndex={-1}
                />
              </div>
            ) : null}
            <div className="onboarding-return-inputRow">
              <textarea
                id="onboarding-return-seed"
                ref={returningSeedTextareaRef}
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
                autoComplete="off"
                spellCheck={false}
                rows={4}
              />
              {canLoadReturningSlip39FromPasswordManager ? (
                <input
                  id="onboarding-return-password-manager-seed"
                  ref={returningPasswordManagerInputRef}
                  className={
                    returningPasswordManagerBridgeArmed
                      ? "onboarding-return-passwordManagerInput is-armed"
                      : "onboarding-return-passwordManagerInput"
                  }
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  tabIndex={returningPasswordManagerBridgeArmed ? 0 : -1}
                  aria-hidden={!returningPasswordManagerBridgeArmed}
                  onBlur={() => {
                    setReturningPasswordManagerBridgeArmed(false);
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;

                    setReturningPasswordManagerBridgeArmed(false);
                    setReturningSlip39Input(value);
                    const filled = analyzeSlip39Input(value);
                    if (filled.isCompleteCandidate) {
                      void submitReturningSlip39(value);
                    }
                    globalThis.setTimeout(() => {
                      returningSeedTextareaRef.current?.focus();
                    }, 0);
                  }}
                />
              ) : null}
              <button
                type="button"
                className="onboarding-return-pasteBtn"
                onClick={() => void pasteReturningSlip39FromClipboard()}
                disabled={onboardingIsBusy}
                aria-label={t("onboardingReturnPasteButton")}
                title={t("onboardingReturnPasteButton")}
              >
                <svg
                  aria-hidden="true"
                  className="onboarding-return-pasteIcon"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <rect
                    x="5"
                    y="4"
                    width="11"
                    height="13"
                    rx="2.2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <rect
                    x="8"
                    y="7"
                    width="11"
                    height="13"
                    rx="2.2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
            </div>
          </form>

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
          {canLoadReturningSlip39FromPasswordManager ? (
            <button
              type="button"
              className="btn-wide secondary"
              onClick={async () => {
                setReturningPasswordManagerBridgeArmed(true);
                returningPasswordManagerInputRef.current?.focus();
                const loaded =
                  await triggerReturningSlip39PasswordManagerPrompt({
                    silentWhenMissing: true,
                  });
                if (!loaded) {
                  globalThis.setTimeout(() => {
                    returningPasswordManagerInputRef.current?.focus();
                  }, 0);
                } else {
                  globalThis.setTimeout(() => {
                    returningSeedTextareaRef.current?.focus();
                  }, 0);
                }
              }}
              disabled={onboardingIsBusy}
            >
              {t("onboardingReturnTrySavedKeys")}
            </button>
          ) : null}
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

          <div className="onboarding-avatar-scroll">
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
                <span
                  className="onboarding-avatar-choicePlus"
                  aria-hidden="true"
                >
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

  const renderSaveKeysStep = (step: SaveKeysOnboardingStep) => {
    return (
      <div className="onboarding-avatar-stage onboarding-return-stage">
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
              {t("onboardingSaveKeysIntro")}
            </p>
          </div>

          <form
            className="onboarding-return-inputWrap"
            action="/api/pm-noop"
            method="post"
            autoComplete="on"
          >
            <label
              className="onboarding-avatar-nameLabel"
              htmlFor="onboarding-save-keys-username"
            >
              {t("onboardingSaveKeysAccountName")}
            </label>
            <input
              id="onboarding-save-keys-username"
              type="text"
              name="username"
              autoComplete="username"
              defaultValue={step.accountName}
            />
            <input
              type="text"
              name="displayName"
              autoComplete="name"
              defaultValue={step.accountName}
              className="onboarding-save-keys-hiddenName"
              tabIndex={-1}
              aria-hidden="true"
            />
            <label
              className="onboarding-avatar-nameLabel"
              htmlFor="onboarding-save-keys-password"
            >
              {t("onboardingSaveKeysFieldLabel")}
            </label>
            <input
              id="onboarding-save-keys-password"
              type="password"
              name="password"
              autoComplete="new-password"
              defaultValue={step.seed}
              className="onboarding-return-passwordManagerInputVisible"
            />

            <div className="onboarding-avatar-actions onboarding-avatar-actionsAdaptive">
              <button
                type="submit"
                className="btn-wide"
                disabled={onboardingIsBusy}
              >
                {t("onboardingSaveKeysSubmit")}
              </button>
              <button
                type="button"
                className="btn-wide secondary"
                onClick={() => continueAfterPasswordManagerSave()}
                disabled={onboardingIsBusy}
              >
                {t("onboardingSaveKeysSkip")}
              </button>
            </div>
          </form>
        </div>
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
        ) : onboardingStep.kind === "returning" ? (
          renderReturnStep(onboardingStep)
        ) : onboardingStep.kind === "save-keys" ? (
          renderSaveKeysStep(onboardingStep)
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
