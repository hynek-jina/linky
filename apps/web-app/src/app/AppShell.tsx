import React from "react";
import "../App.css";
import { AuthenticatedLayout } from "../components/AuthenticatedLayout";
import { CashuContactSendBanner } from "../components/CashuContactSendBanner";
import { InstallPwaBanner } from "../components/InstallPwaBanner";
import { PwaUpdateBanner } from "../components/PwaUpdateBanner";
import { ToastNotifications } from "../components/ToastNotifications";
import { UnauthenticatedLayout } from "../components/UnauthenticatedLayout";
import {
  AppShellContextsProvider,
  type AppShellActionsContextValue,
  type AppShellCoreContextValue,
  type AppShellRouteContextValue,
} from "./context/AppShellContexts";
import { AppRouteContent } from "./routes/AppRouteContent";
import { useAppShellComposition } from "./useAppShellComposition";

const AppShell = () => {
  if (import.meta.env.DEV) console.log("[linky][render] AppShell");
  const {
    appActions,
    appState,
    cancelPendingCashuContactSend,
    confirmPendingOnboardingProfile,
    createNewAccount,
    currentNsec,
    dismissToast,
    formatDisplayedAmountText,
    isMainSwipeRoute,
    lang,
    mainSwipeRouteProps,
    moneyRouteProps,
    onboardingIsBusy,
    onboardingPhotoInputRef,
    onboardingStep,
    openReturningOnboarding,
    onPendingOnboardingPhotoError,
    onPendingOnboardingPhotoSelected,
    pageClassNameWithSwipe,
    pasteReturningSlip39FromClipboard,
    peopleRouteProps,
    pendingCashuContactSend,
    pickPendingOnboardingPhoto,
    cyclePendingOnboardingAvatarControl,
    selectReturningSlip39Suggestion,
    savePendingOnboardingBackupToPasswordManager,
    setReturningSlip39Input,
    setOnboardingStep,
    setLang,
    setPendingOnboardingName,
    submitReturningSlip39,
    systemRouteProps,
    t,
    toasts,
  } = useAppShellComposition();

  const coreContextValue: AppShellCoreContextValue = appState;

  const actionsContextValue: AppShellActionsContextValue = appActions;

  const routeContextValue = React.useMemo<AppShellRouteContextValue>(
    () => ({
      isMainSwipeRoute,
      mainSwipeRoutes: mainSwipeRouteProps,
      moneyRoutes: moneyRouteProps,
      pageClassNameWithSwipe,
      peopleRoutes: peopleRouteProps,
      systemRoutes: systemRouteProps,
    }),
    [
      isMainSwipeRoute,
      mainSwipeRouteProps,
      moneyRouteProps,
      pageClassNameWithSwipe,
      peopleRouteProps,
      systemRouteProps,
    ],
  );

  return (
    <div className={pageClassNameWithSwipe}>
      <PwaUpdateBanner t={t} />
      <CashuContactSendBanner
        amountText={
          pendingCashuContactSend
            ? formatDisplayedAmountText(pendingCashuContactSend.amountSat)
            : null
        }
        onCancel={() => {
          void cancelPendingCashuContactSend();
        }}
        t={t}
      />
      <ToastNotifications toasts={toasts} dismissToast={dismissToast} />
      <InstallPwaBanner t={t} />

      {!currentNsec ? (
        <UnauthenticatedLayout
          confirmPendingOnboardingProfile={confirmPendingOnboardingProfile}
          onboardingStep={onboardingStep}
          onboardingIsBusy={onboardingIsBusy}
          lang={lang}
          onboardingPhotoInputRef={onboardingPhotoInputRef}
          openReturningOnboarding={openReturningOnboarding}
          onPendingOnboardingPhotoError={onPendingOnboardingPhotoError}
          onPendingOnboardingPhotoSelected={onPendingOnboardingPhotoSelected}
          setOnboardingStep={setOnboardingStep}
          createNewAccount={createNewAccount}
          cyclePendingOnboardingAvatarControl={
            cyclePendingOnboardingAvatarControl
          }
          pasteReturningSlip39FromClipboard={pasteReturningSlip39FromClipboard}
          pickPendingOnboardingPhoto={pickPendingOnboardingPhoto}
          selectReturningSlip39Suggestion={selectReturningSlip39Suggestion}
          savePendingOnboardingBackupToPasswordManager={
            savePendingOnboardingBackupToPasswordManager
          }
          setReturningSlip39Input={setReturningSlip39Input}
          setLang={setLang}
          setPendingOnboardingName={setPendingOnboardingName}
          submitReturningSlip39={submitReturningSlip39}
          t={t}
        />
      ) : null}

      {currentNsec ? (
        <AppShellContextsProvider
          actions={actionsContextValue}
          core={coreContextValue}
          routes={routeContextValue}
        >
          <AuthenticatedLayout>
            <AppRouteContent />
          </AuthenticatedLayout>
        </AppShellContextsProvider>
      ) : null}
    </div>
  );
};

export default AppShell;
