import React from "react";
import "../App.css";
import { AuthenticatedLayout } from "../components/AuthenticatedLayout";
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
  const {
    appActions,
    appState,
    confirmPendingOnboardingProfile,
    createNewAccount,
    currentNsec,
    formatDisplayedAmountParts,
    isMainSwipeRoute,
    lang,
    mainSwipeRouteProps,
    moneyRouteProps,
    onboardingIsBusy,
    onboardingPhotoInputRef,
    onboardingStep,
    openReturningOnboarding,
    onPendingOnboardingPhotoSelected,
    pageClassNameWithSwipe,
    pasteReturningSlip39FromClipboard,
    peopleRouteProps,
    pickPendingOnboardingPhoto,
    pushToast,
    recentlyReceivedToken,
    selectReturningSlip39Suggestion,
    selectPendingOnboardingAvatar,
    setReturningSlip39Input,
    setOnboardingStep,
    setLang,
    setPendingOnboardingName,
    setRecentlyReceivedToken,
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
      <ToastNotifications
        recentlyReceivedToken={recentlyReceivedToken}
        toasts={toasts}
        formatDisplayedAmountParts={formatDisplayedAmountParts}
        pushToast={pushToast}
        setRecentlyReceivedToken={setRecentlyReceivedToken}
        t={t}
      />

      {!currentNsec ? (
        <UnauthenticatedLayout
          confirmPendingOnboardingProfile={confirmPendingOnboardingProfile}
          onboardingStep={onboardingStep}
          onboardingIsBusy={onboardingIsBusy}
          lang={lang}
          onboardingPhotoInputRef={onboardingPhotoInputRef}
          openReturningOnboarding={openReturningOnboarding}
          onPendingOnboardingPhotoSelected={onPendingOnboardingPhotoSelected}
          setOnboardingStep={setOnboardingStep}
          createNewAccount={createNewAccount}
          pasteReturningSlip39FromClipboard={pasteReturningSlip39FromClipboard}
          pickPendingOnboardingPhoto={pickPendingOnboardingPhoto}
          selectReturningSlip39Suggestion={selectReturningSlip39Suggestion}
          selectPendingOnboardingAvatar={selectPendingOnboardingAvatar}
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
