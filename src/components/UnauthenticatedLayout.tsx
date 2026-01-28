import * as React from "react";

type OnboardingStep = {
  step: 1 | 2 | 3;
  derivedName: string | null;
  error: string | null;
} | null;

type UnauthenticatedLayoutProps = {
  onboardingStep: OnboardingStep;
  onboardingIsBusy: boolean;
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  createNewAccount: () => Promise<void>;
  pasteExistingNsec: () => Promise<void>;
  t: (key: string) => string;
};

export const UnauthenticatedLayout: React.FC<UnauthenticatedLayoutProps> = ({
  onboardingStep,
  onboardingIsBusy,
  setOnboardingStep,
  createNewAccount,
  pasteExistingNsec,
  t,
}) => {
  return (
    <section className="panel panel-plain onboarding-panel">
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

      {onboardingStep ? (
        <>
          <div className="settings-row">
            <div className="muted" style={{ lineHeight: 1.4 }}>
              {(() => {
                const format = (
                  template: string,
                  vars: Record<string, string>,
                ) =>
                  template.replace(/\{(\w+)\}/g, (_m, k: string) =>
                    String(vars[k] ?? ""),
                  );

                const name = onboardingStep.derivedName ?? "";
                if (onboardingStep.step === 1)
                  return format(t("onboardingStep1"), { name });
                if (onboardingStep.step === 2) return t("onboardingStep2");
                return t("onboardingStep3");
              })()}
            </div>
          </div>

          {onboardingStep.error ? (
            <div className="settings-row">
              <div className="status" role="status">
                {onboardingStep.error}
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
              {t("onboardingPasteNsec")}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
