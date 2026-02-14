import React from "react";
import { Topbar } from "./Topbar";
import { ContactsGuideOverlay } from "./ContactsGuideOverlay";
import { MenuModal } from "./MenuModal";
import { ProfileQrModal } from "./ProfileQrModal";
import { ScanModal } from "./ScanModal";
import { SaveContactPromptModal } from "./SaveContactPromptModal";
import { PaidOverlay } from "./PaidOverlay";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps): React.ReactElement {
  const actions = useAppShellActions();
  const state = useAppShellCore();

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
