import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import { shouldRenderNativeNfcWritePrompt } from "../platform/nativeBridge";
import { useDesktopSplitView } from "../hooks/useDesktopSplitView";
import { AppScanModal } from "./AppScanModal";
import { ContactsGuideOverlay } from "./ContactsGuideOverlay";
import { AppTopbar } from "./AppTopbar";
import { LightningInvoiceConfirmModal } from "./LightningInvoiceConfirmModal";
import { LnurlWithdrawConfirmModal } from "./LnurlWithdrawConfirmModal";
import { MenuModal } from "./MenuModal";
import { MintAutoswapConfirmModal } from "./MintAutoswapConfirmModal";
import { NfcWriteModal } from "./NfcWriteModal";
import { PaidOverlay } from "./PaidOverlay";
import { PaymentMintMeltConfirmModal } from "./PaymentMintMeltConfirmModal";
import { SaveContactPromptModal } from "./SaveContactPromptModal";
import { ShareOptionsModal } from "./ShareOptionsModal";

interface AuthenticatedLayoutProps {
  children: React.ReactNode;
}

export function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps): React.ReactElement {
  const actions = useAppShellActions();
  const state = useAppShellCore();
  const isDesktopSplitView = useDesktopSplitView();

  return (
    <>
      <AppTopbar className="mobile-app-topbar" />

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

      {!isDesktopSplitView ? <AppScanModal /> : null}

      {state.postPaySaveContact && !state.paidOverlayIsOpen ? (
        <SaveContactPromptModal
          amountSat={state.postPaySaveContact.amountSat}
          lnAddress={state.postPaySaveContact.lnAddress}
          onClose={() => actions.setPostPaySaveContact(null)}
          setContactNewPrefill={actions.setContactNewPrefill}
          t={state.t}
        />
      ) : null}

      {state.pendingLightningInvoiceConfirmation &&
      !state.pendingPaymentMintMeltConfirmation &&
      !state.paidOverlayIsOpen ? (
        <LightningInvoiceConfirmModal
          cashuBalance={state.cashuBalanceAfterMelt}
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

      {state.pendingPaymentMintMeltConfirmation && !state.paidOverlayIsOpen ? (
        <PaymentMintMeltConfirmModal
          fromMint={state.pendingPaymentMintMeltConfirmation.fromMint}
          isBusy={state.cashuIsBusy}
          onClose={actions.closePaymentMintMeltConfirmation}
          onConfirm={actions.confirmPaymentMintMelt}
          t={state.t}
          toMint={state.pendingPaymentMintMeltConfirmation.toMint}
        />
      ) : null}

      {state.paidOverlayIsOpen ? (
        <PaidOverlay paidOverlayTitle={state.paidOverlayTitle} t={state.t} />
      ) : null}

      {state.nfcWritePromptKind && shouldRenderNativeNfcWritePrompt() ? (
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
