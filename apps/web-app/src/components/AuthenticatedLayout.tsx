import React from "react";
import type { Route } from "../types/route";
import type { Lang } from "../i18n";
import { Topbar } from "./Topbar";
import { ContactsGuideOverlay } from "./ContactsGuideOverlay";
import { MenuModal } from "./MenuModal";
import { ProfileQrModal } from "./ProfileQrModal";
import { ScanModal } from "./ScanModal";
import { SaveContactPromptModal } from "./SaveContactPromptModal";
import { PaidOverlay } from "./PaidOverlay";
import { useAppContext } from "../app/context/AppContext";

interface TopbarButton {
  icon: string;
  label: string;
  onClick: () => void;
}

interface ChatContact {
  name: string | null;
  npub: string | null;
}

interface ContactsGuideStep {
  bodyKey: string;
  id: string;
  titleKey: string;
}

interface LayoutState {
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
  derivedProfile: {
    lnAddress: string;
    name: string;
    pictureUrl: string;
  } | null;
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

interface LayoutActions {
  closeMenu: () => void;
  closeProfileQr: () => void;
  closeScan: () => void;
  contactsGuideNav: {
    back: () => void;
    next: () => void;
  };
  copyText: (text: string) => Promise<void>;
  onPickProfilePhoto: () => void;
  onProfilePhotoSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
  setPostPaySaveContact: (value: null) => void;
  setProfileEditLnAddress: (value: string) => void;
  setProfileEditName: (value: string) => void;
  setProfileEditPicture: (value: string) => void;
  setUseBitcoinSymbol: (value: boolean) => void;
  stopContactsGuide: () => void;
  toggleProfileEditing: () => void;
}

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps): React.ReactElement {
  const { actions, state } = useAppContext<LayoutState, LayoutActions>();

  return (
    <>
      <Topbar
        chatTopbarContact={state.chatTopbarContact}
        currentNpub={state.currentNpub}
        effectiveProfileName={state.effectiveProfileName}
        effectiveProfilePicture={state.effectiveProfilePicture}
        nostrPictureByNpub={state.nostrPictureByNpub}
        openProfileQr={actions.openProfileQr}
        route={state.route}
        t={state.t}
        topbar={state.topbar}
        topbarRight={state.topbarRight}
        topbarTitle={state.topbarTitle}
      />

      {state.contactsGuide && state.contactsGuideActiveStep?.step ? (
        <ContactsGuideOverlay
          currentIdx={state.contactsGuideActiveStep.idx}
          highlightRect={state.contactsGuideHighlightRect}
          onBack={actions.contactsGuideNav.back}
          onNext={actions.contactsGuideNav.next}
          onSkip={actions.stopContactsGuide}
          stepBodyKey={state.contactsGuideActiveStep.step.bodyKey}
          stepTitleKey={state.contactsGuideActiveStep.step.titleKey}
          t={state.t}
          totalSteps={state.contactsGuideActiveStep.total}
        />
      ) : null}

      {state.menuIsOpen ? (
        <MenuModal
          closeMenu={actions.closeMenu}
          lang={state.lang}
          openFeedbackContact={actions.openFeedbackContact}
          setLang={actions.setLang}
          setUseBitcoinSymbol={actions.setUseBitcoinSymbol}
          t={state.t}
          useBitcoinSymbol={state.useBitcoinSymbol}
        />
      ) : null}

      {children}

      {state.scanIsOpen && (
        <ScanModal
          closeScan={actions.closeScan}
          scanVideoRef={state.scanVideoRef}
          t={state.t}
        />
      )}

      {state.profileQrIsOpen && (
        <ProfileQrModal
          closeProfileQr={actions.closeProfileQr}
          currentNpub={state.currentNpub}
          currentNsec={state.currentNsec}
          derivedProfile={state.derivedProfile}
          effectiveMyLightningAddress={state.effectiveMyLightningAddress}
          effectiveProfileName={state.effectiveProfileName}
          effectiveProfilePicture={state.effectiveProfilePicture}
          isProfileEditing={state.isProfileEditing}
          myProfileQr={state.myProfileQr}
          onClose={actions.closeProfileQr}
          onCopyNpub={() => {
            if (!state.currentNpub) return;
            void actions.copyText(state.currentNpub);
          }}
          onPickProfilePhoto={actions.onPickProfilePhoto}
          onProfilePhotoSelected={actions.onProfilePhotoSelected}
          onSaveProfileEdits={actions.saveProfileEdits}
          profileEditInitialRef={state.profileEditInitialRef}
          profileEditLnAddress={state.profileEditLnAddress}
          profileEditName={state.profileEditName}
          profileEditPicture={state.profileEditPicture}
          profileEditsSavable={state.profileEditsSavable}
          profilePhotoInputRef={state.profilePhotoInputRef}
          setIsProfileEditing={actions.setIsProfileEditing}
          setProfileEditLnAddress={actions.setProfileEditLnAddress}
          setProfileEditName={actions.setProfileEditName}
          setProfileEditPicture={actions.setProfileEditPicture}
          t={state.t}
          toggleProfileEditing={actions.toggleProfileEditing}
        />
      )}

      {state.postPaySaveContact && !state.paidOverlayIsOpen ? (
        <SaveContactPromptModal
          amountSat={state.postPaySaveContact.amountSat}
          displayUnit={state.displayUnit}
          lnAddress={state.postPaySaveContact.lnAddress}
          onClose={() => actions.setPostPaySaveContact(null)}
          setContactNewPrefill={actions.setContactNewPrefill}
          t={state.t}
        />
      ) : null}

      {state.paidOverlayIsOpen ? (
        <PaidOverlay paidOverlayTitle={state.paidOverlayTitle} t={state.t} />
      ) : null}
    </>
  );
}
