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
    createNewAccount,
    currentNsec,
    displayUnit,
    isMainSwipeRoute,
    mainSwipeRouteProps,
    moneyRouteProps,
    onboardingIsBusy,
    onboardingStep,
    pageClassNameWithSwipe,
    pasteExistingNsec,
    peopleRouteProps,
    pushToast,
    recentlyReceivedToken,
    setOnboardingStep,
    setRecentlyReceivedToken,
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
        displayUnit={displayUnit}
        pushToast={pushToast}
        setRecentlyReceivedToken={setRecentlyReceivedToken}
        t={t}
      />

      {!currentNsec ? (
        <UnauthenticatedLayout
          onboardingStep={onboardingStep}
          onboardingIsBusy={onboardingIsBusy}
          setOnboardingStep={setOnboardingStep}
          createNewAccount={createNewAccount}
          pasteExistingNsec={pasteExistingNsec}
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
