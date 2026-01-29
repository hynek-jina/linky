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

interface AuthenticatedLayoutProps {
  chatTopbarContact: ChatContact | null;
  children: React.ReactNode;
  closeMenu: () => void;
  closeProfileQr: () => void;
  closeScan: () => void;
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
  contactsGuideNav: {
    back: () => void;
    next: () => void;
  };
  copyText: (text: string) => Promise<void>;
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
  formatInteger: (value: number) => string;
  isProfileEditing: boolean;
  lang: Lang;
  menuIsOpen: boolean;
  myProfileQr: string | null;
  nostrPictureByNpub: Record<string, string | null>;
  onPickProfilePhoto: () => void;
  onProfilePhotoSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  openFeedbackContact: () => void;
  openProfileQr: () => void;
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
  saveProfileEdits: () => void;
  scanIsOpen: boolean;
  scanVideoRef: React.RefObject<HTMLVideoElement | null>;
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
  t: (key: string) => string;
  toggleProfileEditing: () => void;
  topbar: TopbarButton | null;
  topbarRight: TopbarButton | null;
  topbarTitle: string | null;
  useBitcoinSymbol: boolean;
}

export function AuthenticatedLayout({
  chatTopbarContact,
  children,
  closeMenu,
  closeProfileQr,
  closeScan,
  contactsGuide,
  contactsGuideActiveStep,
  contactsGuideHighlightRect,
  contactsGuideNav,
  copyText,
  currentNpub,
  currentNsec,
  derivedProfile,
  displayUnit,
  effectiveMyLightningAddress,
  effectiveProfileName,
  effectiveProfilePicture,
  formatInteger,
  isProfileEditing,
  lang,
  menuIsOpen,
  myProfileQr,
  nostrPictureByNpub,
  onPickProfilePhoto,
  onProfilePhotoSelected,
  openFeedbackContact,
  openProfileQr,
  paidOverlayIsOpen,
  paidOverlayTitle,
  postPaySaveContact,
  profileEditInitialRef,
  profileEditLnAddress,
  profileEditName,
  profileEditPicture,
  profileEditsSavable,
  profilePhotoInputRef,
  profileQrIsOpen,
  route,
  saveProfileEdits,
  scanIsOpen,
  scanVideoRef,
  setContactNewPrefill,
  setIsProfileEditing,
  setLang,
  setPostPaySaveContact,
  setProfileEditLnAddress,
  setProfileEditName,
  setProfileEditPicture,
  setUseBitcoinSymbol,
  stopContactsGuide,
  t,
  toggleProfileEditing,
  topbar,
  topbarRight,
  topbarTitle,
  useBitcoinSymbol,
}: AuthenticatedLayoutProps): React.ReactElement {
  return (
    <>
      <Topbar
        chatTopbarContact={chatTopbarContact}
        currentNpub={currentNpub}
        effectiveProfileName={effectiveProfileName}
        effectiveProfilePicture={effectiveProfilePicture}
        nostrPictureByNpub={nostrPictureByNpub}
        openProfileQr={openProfileQr}
        route={route}
        t={t}
        topbar={topbar}
        topbarRight={topbarRight}
        topbarTitle={topbarTitle}
      />

      {contactsGuide && contactsGuideActiveStep?.step ? (
        <ContactsGuideOverlay
          currentIdx={contactsGuideActiveStep.idx}
          highlightRect={contactsGuideHighlightRect}
          onBack={contactsGuideNav.back}
          onNext={contactsGuideNav.next}
          onSkip={stopContactsGuide}
          stepBodyKey={contactsGuideActiveStep.step.bodyKey}
          stepTitleKey={contactsGuideActiveStep.step.titleKey}
          t={t}
          totalSteps={contactsGuideActiveStep.total}
        />
      ) : null}

      {menuIsOpen ? (
        <MenuModal
          closeMenu={closeMenu}
          lang={lang}
          openFeedbackContact={openFeedbackContact}
          setLang={setLang}
          setUseBitcoinSymbol={setUseBitcoinSymbol}
          t={t}
          useBitcoinSymbol={useBitcoinSymbol}
        />
      ) : null}

      {children}

      {scanIsOpen && (
        <ScanModal closeScan={closeScan} scanVideoRef={scanVideoRef} t={t} />
      )}

      {profileQrIsOpen && (
        <ProfileQrModal
          closeProfileQr={closeProfileQr}
          currentNpub={currentNpub}
          currentNsec={currentNsec}
          derivedProfile={derivedProfile}
          effectiveMyLightningAddress={effectiveMyLightningAddress}
          effectiveProfileName={effectiveProfileName}
          effectiveProfilePicture={effectiveProfilePicture}
          isProfileEditing={isProfileEditing}
          myProfileQr={myProfileQr}
          onClose={closeProfileQr}
          onCopyNpub={() => {
            if (!currentNpub) return;
            void copyText(currentNpub);
          }}
          onPickProfilePhoto={onPickProfilePhoto}
          onProfilePhotoSelected={onProfilePhotoSelected}
          onSaveProfileEdits={saveProfileEdits}
          profileEditInitialRef={profileEditInitialRef}
          profileEditLnAddress={profileEditLnAddress}
          profileEditName={profileEditName}
          profileEditPicture={profileEditPicture}
          profileEditsSavable={profileEditsSavable}
          profilePhotoInputRef={profilePhotoInputRef}
          setIsProfileEditing={setIsProfileEditing}
          setProfileEditLnAddress={setProfileEditLnAddress}
          setProfileEditName={setProfileEditName}
          setProfileEditPicture={setProfileEditPicture}
          t={t}
          toggleProfileEditing={toggleProfileEditing}
        />
      )}

      {postPaySaveContact && !paidOverlayIsOpen ? (
        <SaveContactPromptModal
          amountSat={postPaySaveContact.amountSat}
          displayUnit={displayUnit}
          formatInteger={formatInteger}
          lnAddress={postPaySaveContact.lnAddress}
          onClose={() => setPostPaySaveContact(null)}
          setContactNewPrefill={setContactNewPrefill}
          t={t}
        />
      ) : null}

      {paidOverlayIsOpen ? (
        <PaidOverlay paidOverlayTitle={paidOverlayTitle} t={t} />
      ) : null}
    </>
  );
}
