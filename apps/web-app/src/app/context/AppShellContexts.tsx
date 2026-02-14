/* eslint-disable react-refresh/only-export-components */
import React from "react";
import type { Lang } from "../../i18n";
import type { Route } from "../../types/route";
import type { DerivedProfileDefaults } from "../../derivedProfile";
import type {
  MainSwipeRoutesProps,
  MoneyRoutesProps,
  PeopleRoutesProps,
  SystemRoutesProps,
} from "../routes/AppRouteContent";
import type { ContactsGuideStep, TopbarButton } from "../types/appTypes";

interface ChatContact {
  name: string | null;
  npub: string | null;
}

export interface AppShellCoreContextValue {
  chatTopbarContact: ChatContact | null;
  contactsGuide: { step: number; task: string } | null;
  contactsGuideActiveStep: {
    idx: number;
    step: ContactsGuideStep;
    total: number;
  } | null;
  contactsGuideHighlightRect: {
    height: number;
    left: number;
    top: number;
    width: number;
  } | null;
  currentNpub: string | null;
  currentNsec: string | null;
  derivedProfile: DerivedProfileDefaults | null;
  displayUnit: string;
  effectiveMyLightningAddress: string | null;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  isProfileEditing: boolean;
  lang: Lang;
  menuIsOpen: boolean;
  myProfileQr: string | null;
  nostrPictureByNpub: Record<string, string | null>;
  paidOverlayIsOpen: boolean;
  paidOverlayTitle: string | null;
  postPaySaveContact: {
    amountSat: number;
    lnAddress: string;
  } | null;
  profileEditInitialRef: React.MutableRefObject<{
    lnAddress: string;
    name: string;
    picture: string;
  } | null>;
  profileEditLnAddress: string;
  profileEditName: string;
  profileEditPicture: string;
  profileEditsSavable: boolean;
  profilePhotoInputRef: React.RefObject<HTMLInputElement | null>;
  profileQrIsOpen: boolean;
  route: Route;
  scanIsOpen: boolean;
  scanVideoRef: React.RefObject<HTMLVideoElement | null>;
  t: (key: string) => string;
  topbar: TopbarButton | null;
  topbarRight: TopbarButton | null;
  topbarTitle: string | null;
  useBitcoinSymbol: boolean;
}

export interface AppShellActionsContextValue {
  closeMenu: () => void;
  closeProfileQr: () => void;
  closeScan: () => void;
  contactsGuideNav: {
    back: () => void;
    next: () => void;
  };
  copyText: (text: string) => Promise<void>;
  onPickProfilePhoto: () => void;
  onProfilePhotoSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  openFeedbackContact: () => void;
  openProfileQr: () => void;
  saveProfileEdits: () => void;
  setContactNewPrefill: (prefill: {
    lnAddress: string;
    npub: string | null;
    suggestedName: string | null;
  }) => void;
  setIsProfileEditing: (editing: boolean) => void;
  setLang: (lang: Lang) => void;
  setPostPaySaveContact: (
    value: {
      amountSat: number;
      lnAddress: string;
    } | null,
  ) => void;
  setProfileEditLnAddress: (value: string) => void;
  setProfileEditName: (value: string) => void;
  setProfileEditPicture: (value: string) => void;
  setUseBitcoinSymbol: (value: boolean) => void;
  stopContactsGuide: () => void;
  toggleProfileEditing: () => void;
}

export interface AppShellRouteContextValue {
  isMainSwipeRoute: boolean;
  mainSwipeRoutes: MainSwipeRoutesProps;
  moneyRoutes: MoneyRoutesProps;
  pageClassNameWithSwipe: string;
  peopleRoutes: PeopleRoutesProps;
  systemRoutes: SystemRoutesProps;
}

interface AppShellContextsProviderProps {
  actions: AppShellActionsContextValue;
  children: React.ReactNode;
  core: AppShellCoreContextValue;
  routes: AppShellRouteContextValue;
}

const AppShellCoreContext =
  React.createContext<AppShellCoreContextValue | null>(null);
const AppShellActionsContext =
  React.createContext<AppShellActionsContextValue | null>(null);
const AppShellRouteContext =
  React.createContext<AppShellRouteContextValue | null>(null);

const useContextValue = <T,>(contextValue: T | null, hookName: string): T => {
  if (contextValue === null) {
    throw new Error(`${hookName} must be used within AppShellContextsProvider`);
  }

  return contextValue;
};

export const AppShellContextsProvider = ({
  actions,
  children,
  core,
  routes,
}: AppShellContextsProviderProps): React.ReactElement => {
  return (
    <AppShellCoreContext.Provider value={core}>
      <AppShellActionsContext.Provider value={actions}>
        <AppShellRouteContext.Provider value={routes}>
          {children}
        </AppShellRouteContext.Provider>
      </AppShellActionsContext.Provider>
    </AppShellCoreContext.Provider>
  );
};

export const useAppShellCore = (): AppShellCoreContextValue =>
  useContextValue(React.useContext(AppShellCoreContext), "useAppShellCore");

export const useAppShellActions = (): AppShellActionsContextValue =>
  useContextValue(
    React.useContext(AppShellActionsContext),
    "useAppShellActions",
  );

export const useAppShellRouteContext = (): AppShellRouteContextValue =>
  useContextValue(
    React.useContext(AppShellRouteContext),
    "useAppShellRouteContext",
  );

export const usePeopleRoutes = (): PeopleRoutesProps =>
  useAppShellRouteContext().peopleRoutes;

export const useMoneyRoutes = (): MoneyRoutesProps =>
  useAppShellRouteContext().moneyRoutes;

export const useMainSwipeRoutes = (): MainSwipeRoutesProps =>
  useAppShellRouteContext().mainSwipeRoutes;

export const useSystemRoutes = (): SystemRoutesProps =>
  useAppShellRouteContext().systemRoutes;
