import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import { ContactsGuideOverlay } from "./ContactsGuideOverlay";
import { LightningInvoiceConfirmModal } from "./LightningInvoiceConfirmModal";
import { LnurlWithdrawConfirmModal } from "./LnurlWithdrawConfirmModal";
import { MenuModal } from "./MenuModal";
import { NfcWriteModal } from "./NfcWriteModal";
import { PaidOverlay } from "./PaidOverlay";
import { ProfileQrModal } from "./ProfileQrModal";
import { SaveContactPromptModal } from "./SaveContactPromptModal";
import { ScanModal } from "./ScanModal";
import { ShareOptionsModal } from "./ShareOptionsModal";
import { Topbar } from "./Topbar";

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
          displayCurrency={state.displayCurrency}
          lang={state.lang}
          openFeedbackContact={actions.openFeedbackContact}
          setDisplayCurrency={actions.setDisplayCurrency}
          setLang={actions.setLang}
          t={state.t}
        />
      ) : null}

      {children}

      {state.scanIsOpen && (
        <ScanModal
          closeScan={actions.closeScan}
          onIssueTokenFromScan={actions.openIssueTokenFromScan}
          onPickScanImage={actions.onPickScanImage}
          onScanImageSelected={actions.onScanImageSelected}
          onTypeManually={actions.openManualContactFromScan}
          pasteScanValue={actions.pasteScanValue}
          scanImageInputRef={state.scanImageInputRef}
          scanVideoRef={state.scanVideoRef}
          showTypeAction={state.scanAllowsManualContact}
          showWalletActions={!state.scanAllowsManualContact}
          t={state.t}
        />
      )}

      {state.profileQrIsOpen && (
        <ProfileQrModal
          canWriteToNfc={state.canWriteNfc}
          closeProfileQr={actions.closeProfileQr}
          copyText={actions.copyText}
          currentNpub={state.currentNpub}
          currentNsec={state.currentNsec}
          cycleProfileAvatarControl={actions.cycleProfileAvatarControl}
          derivedProfile={state.derivedProfile}
          effectiveMyLightningAddress={state.effectiveMyLightningAddress}
          effectiveProfileName={state.effectiveProfileName}
          effectiveProfilePicture={state.effectiveProfilePicture}
          isProfileEditing={state.isProfileEditing}
          myProfileQr={state.myProfileQr}
          onClose={actions.closeProfileQr}
          onPickProfilePhoto={actions.onPickProfilePhoto}
          onProfilePhotoSelected={actions.onProfilePhotoSelected}
          onSaveProfileEdits={actions.saveProfileEdits}
          profileCustomPictureUrl={state.profileCustomPictureUrl}
          profileEditInitialRef={state.profileEditInitialRef}
          profileEditLnAddress={state.profileEditLnAddress}
          profileEditName={state.profileEditName}
          profileEditPicture={state.profileEditPicture}
          profileEditsSavable={state.profileEditsSavable}
          profilePhotoInputRef={state.profilePhotoInputRef}
          profileSelectedPictureKind={state.profileSelectedPictureKind}
          setIsProfileEditing={actions.setIsProfileEditing}
          setProfileEditLnAddress={actions.setProfileEditLnAddress}
          setProfileEditName={actions.setProfileEditName}
          t={state.t}
          toggleProfileEditing={actions.toggleProfileEditing}
          writeCurrentNpubToNfc={actions.writeCurrentNpubToNfc}
        />
      )}

      {state.postPaySaveContact && !state.paidOverlayIsOpen ? (
        <SaveContactPromptModal
          amountSat={state.postPaySaveContact.amountSat}
          lnAddress={state.postPaySaveContact.lnAddress}
          onClose={() => actions.setPostPaySaveContact(null)}
          setContactNewPrefill={actions.setContactNewPrefill}
          t={state.t}
        />
      ) : null}

      {state.pendingLightningInvoiceConfirmation && !state.paidOverlayIsOpen ? (
        <LightningInvoiceConfirmModal
          cashuBalance={state.cashuBalance}
          cashuIsBusy={state.cashuIsBusy}
          confirmation={state.pendingLightningInvoiceConfirmation}
          onClose={actions.closeLightningInvoiceConfirmation}
          onConfirm={actions.confirmLightningInvoicePayment}
          t={state.t}
        />
      ) : null}

      {state.pendingLnurlWithdrawConfirmation && !state.paidOverlayIsOpen ? (
        <LnurlWithdrawConfirmModal
          confirmation={state.pendingLnurlWithdrawConfirmation}
          isBusy={state.lnurlWithdrawIsBusy}
          onClose={actions.closeLnurlWithdrawConfirmation}
          onConfirm={actions.confirmLnurlWithdraw}
          t={state.t}
        />
      ) : null}

      {state.paidOverlayIsOpen ? (
        <PaidOverlay paidOverlayTitle={state.paidOverlayTitle} t={state.t} />
      ) : null}

      {state.nfcWritePromptKind ? (
        <NfcWriteModal
          kind={state.nfcWritePromptKind}
          onCancel={actions.cancelPendingNfcWrite}
          t={state.t}
        />
      ) : null}

      {state.shareOptionsText ? (
        <ShareOptionsModal
          onClose={actions.closeShareOptions}
          onCopy={actions.copyShareOptionsText}
          onEmail={actions.shareOptionsViaEmail}
          onSms={actions.shareOptionsViaSms}
          onWhatsApp={actions.shareOptionsViaWhatsApp}
          shareText={state.shareOptionsText}
          t={state.t}
        />
      ) : null}
    </>
  );
}
