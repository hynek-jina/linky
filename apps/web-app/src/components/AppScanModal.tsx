import React from "react";
import {
  useAppShellActions,
  useAppShellCore,
} from "../app/context/AppShellContexts";
import { ScanModal } from "./ScanModal";

export function AppScanModal(): React.ReactElement | null {
  const actions = useAppShellActions();
  const state = useAppShellCore();

  if (!state.scanIsOpen) return null;

  return (
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
  );
}
