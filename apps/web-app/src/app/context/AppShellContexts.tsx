/* eslint-disable react-refresh/only-export-components */
import React from "react";
import type {
  AvatarEditorControlId,
  DerivedProfileDefaults,
} from "../../derivedProfile";
import type { ContactId } from "../../evolu";
import type { Lang } from "../../i18n";
import type { LnurlWithdrawPreview } from "../../lnurlPay";
import type { Route } from "../../types/route";
import type {
  DisplayAmountParts,
  DisplayCurrency,
} from "../../utils/displayAmounts";
import type { LightningInvoicePreview } from "../../utils/lightningInvoice";
import type {
  MainSwipeRoutesProps,
  MoneyRoutesProps,
  PeopleRoutesProps,
  SystemRoutesProps,
} from "../routes/AppRouteContent";
import type { ContactsGuideStep, TopbarButton } from "../types/appTypes";

interface ChatContact {
  contactId: ContactId | null;
  isUnknownContact?: boolean;
  name: string | null;
  npub: string | null;
}

export interface AppShellCoreContextValue {
  cashuBalance: number;
  cashuIsBusy: boolean;
  canWriteNfc: boolean;
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
  displayCurrency: DisplayCurrency;
  derivedProfile: DerivedProfileDefaults | null;
  displayUnit: string;
  effectiveMyLightningAddress: string | null;
  effectiveProfileName: string | null;
  effectiveProfilePicture: string | null;
  applyAmountInputKey: (currentAmount: string, key: string) => string;
  formatDisplayedAmountParts: (amountSat: number) => DisplayAmountParts;
  formatDisplayedAmountText: (amountSat: number) => string;
  isProfileEditing: boolean;
  lang: Lang;
  menuIsOpen: boolean;
  myProfileQr: string | null;
  nfcWritePromptKind: "profile" | "token" | null;
  nostrPictureByNpub: Record<string, string | null>;
  paidOverlayIsOpen: boolean;
  paidOverlayTitle: string | null;
  pendingLnurlWithdrawConfirmation: LnurlWithdrawPreview | null;
  pendingLightningInvoiceConfirmation: LightningInvoicePreview | null;
  postPaySaveContact: {
    amountSat: number;
    lnAddress: string;
  } | null;
  profileEditInitialRef: React.MutableRefObject<{
    lnAddress: string;
    name: string;
    picture: string;
  } | null>;
  profileCustomPictureUrl: string;
  profileEditLnAddress: string;
  profileEditName: string;
  profileEditPicture: string;
  profileEditsSavable: boolean;
  profilePhotoInputRef: React.RefObject<HTMLInputElement | null>;
  profileSelectedPictureKind: "custom" | "generated";
  profileQrIsOpen: boolean;
  route: Route;
  scanAllowsManualContact: boolean;
  scanImageInputRef: React.RefObject<HTMLInputElement | null>;
  scanIsOpen: boolean;
  scanVideoRef: React.RefObject<HTMLVideoElement | null>;
  shareOptionsText: string | null;
  t: (key: string) => string;
  topbar: TopbarButton | null;
  topbarRight: TopbarButton | null;
  topbarTitle: string | null;
  lnurlWithdrawIsBusy: boolean;
}

export interface AppShellActionsContextValue {
  cancelPendingNfcWrite: () => void;
  closeMenu: () => void;
  closeShareOptions: () => void;
  closeLnurlWithdrawConfirmation: () => void;
  closeLightningInvoiceConfirmation: () => void;
  closeProfileQr: () => void;
  closeScan: () => void;
  confirmLnurlWithdraw: () => Promise<void>;
  confirmLightningInvoicePayment: () => Promise<void>;
  contactsGuideNav: {
    back: () => void;
    next: () => void;
  };
  copyText: (text: string) => Promise<void>;
  cycleProfileAvatarControl: (controlId: AvatarEditorControlId) => void;
  onPickProfilePhoto: () => void;
  onProfilePhotoSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPickScanImage: () => void;
  onScanImageSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  openFeedbackContact: () => void;
  openIssueTokenFromScan: () => void;
  openManualContactFromScan: () => void;
  openProfileQr: () => void;
  pasteScanValue: () => Promise<void>;
  copyShareOptionsText: () => Promise<void>;
  saveProfileEdits: () => void;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
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
  stopContactsGuide: () => void;
  shareOptionsViaEmail: () => void;
  shareOptionsViaSms: () => void;
  shareOptionsViaWhatsApp: () => void;
  toggleProfileEditing: () => void;
  writeCurrentNpubToNfc: () => Promise<void>;
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
