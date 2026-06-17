import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import { STILL_IMAGE_QR_SCAN_EVENT } from "../app/lib/scanCapture";
import { ContactsGuideOverlay } from "./ContactsGuideOverlay";
import { LightningInvoiceConfirmModal } from "./LightningInvoiceConfirmModal";
import { LnurlWithdrawConfirmModal } from "./LnurlWithdrawConfirmModal";
import { MenuModal } from "./MenuModal";
import { MintAutoswapConfirmModal } from "./MintAutoswapConfirmModal";
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
  const scanCaptureInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const openStillImageQrScan = () => {
      scanCaptureInputRef.current?.click();
    };

    window.addEventListener(STILL_IMAGE_QR_SCAN_EVENT, openStillImageQrScan);
    return () => {
      window.removeEventListener(
        STILL_IMAGE_QR_SCAN_EVENT,
        openStillImageQrScan,
      );
    };
  }, []);

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
          t={state.t}
        />
      ) : null}

      {children}

      <input
        ref={scanCaptureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={actions.onScanImageSelected}
      />

      {state.scanIsOpen && (
        <ScanModal
          closeScan={actions.closeScan}
          onIssueToken={actions.openIssueTokenFromScan}
          onPickScanImage={actions.onPickScanImage}
          onScanImageSelected={actions.onScanImageSelected}
          onTypePayment={actions.openManualPayFromScan}
          onTypeManually={actions.openManualContactFromScan}
          pasteScanValue={actions.pasteScanValue}
          scanEntryPoint={state.scanEntryPoint}
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
          effectiveMyLightningAddress={state.effectiveMyLightningAddress}
          effectiveProfileName={state.effectiveProfileName}
          effectiveProfilePicture={state.effectiveProfilePicture}
          myProfileQr={state.myProfileQr}
          profileStatus={state.profileStatus}
          profileStatusCurrencies={state.profileStatusCurrencies}
          profileStatusIsSaving={state.profileStatusIsSaving}
          selectedProfileStatusCurrencies={
            state.selectedProfileStatusCurrencies
          }
          t={state.t}
          toggleProfileStatusCurrency={actions.toggleProfileStatusCurrency}
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

      {state.pendingMintAutoswapChangeConfirmation &&
      !state.paidOverlayIsOpen ? (
        <MintAutoswapConfirmModal
          fromMint={state.pendingMintAutoswapChangeConfirmation.fromMint}
          onClose={actions.closeMintAutoswapChangeConfirmation}
          onConfirm={actions.confirmMintAutoswapChangeConfirmation}
          t={state.t}
          toMint={state.pendingMintAutoswapChangeConfirmation.toMint}
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
