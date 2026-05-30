import * as Evolu from "@evolu/common";
import React from "react";
import { loadEvoluCurrentData, loadEvoluHistoryData } from "../../evolu";
import type { Route } from "../../types/route";
import type { SystemRoutesProps } from "./AppRouteContent";

type SystemRouteProps = SystemRoutesProps;

interface UseSystemRoutePropsParams {
  appOwnerIdRef: SystemRoutesProps["mintDetailProps"]["appOwnerIdRef"];
  appVersion: SystemRoutesProps["advancedProps"]["__APP_VERSION__"];
  applyDefaultMintSelection: SystemRoutesProps["mintsProps"]["applyDefaultMintSelection"];
  cashuMeltToMainMintButtonLabel: SystemRoutesProps["mintsProps"]["cashuMeltToMainMintButtonLabel"];
  canSaveNewRelay: SystemRoutesProps["nostrRelayNewProps"]["canSaveNewRelay"];
  cashuIsBusy: SystemRoutesProps["mintsProps"]["cashuIsBusy"];
  connectedRelayCount: SystemRoutesProps["advancedProps"]["connectedRelayCount"];
  copyNostrKeys: SystemRoutesProps["advancedProps"]["copyNostrKeys"];
  copySeed: SystemRoutesProps["advancedProps"]["copySeed"];
  activeNostrIdentitySource: SystemRoutesProps["advancedProps"]["activeNostrIdentitySource"];
  currentNpub: SystemRoutesProps["advancedProps"]["currentNpub"];
  currentNsec: SystemRoutesProps["advancedProps"]["currentNsec"];
  dedupeContacts: SystemRoutesProps["advancedProps"]["dedupeContacts"];
  dedupeContactsIsBusy: SystemRoutesProps["advancedProps"]["dedupeContactsIsBusy"];
  defaultMintDisplay: SystemRoutesProps["advancedProps"]["defaultMintDisplay"];
  defaultMintUrl: SystemRoutesProps["mintsProps"]["defaultMintUrl"];
  defaultMintUrlDraft: SystemRoutesProps["mintsProps"]["defaultMintUrlDraft"];
  evoluConnectedServerCount: SystemRoutesProps["advancedProps"]["evoluConnectedServerCount"];
  evoluDatabaseBytes: SystemRoutesProps["evoluDataDetailProps"]["evoluDatabaseBytes"];
  evoluHasError: SystemRoutesProps["evoluServerProps"]["evoluHasError"];
  evoluHistoryCount: SystemRoutesProps["evoluDataDetailProps"]["evoluHistoryCount"];
  evoluOverallStatus: SystemRoutesProps["advancedProps"]["evoluOverallStatus"];
  evoluServerStatusByUrl: SystemRoutesProps["evoluServerProps"]["evoluServerStatusByUrl"];
  evoluServerUrls: SystemRoutesProps["advancedProps"]["evoluServerUrls"];
  evoluServersReloadRequired: SystemRoutesProps["evoluServerProps"]["evoluServersReloadRequired"];
  evoluTableCounts: SystemRoutesProps["evoluDataDetailProps"]["evoluTableCounts"];
  evoluContactsOwnerEditCount: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerEditCount"];
  evoluCashuOwnerId: SystemRoutesProps["evoluCurrentDataProps"]["evoluCashuOwnerId"];
  evoluCashuOwnerIndex: SystemRoutesProps["evoluCurrentDataProps"]["evoluCashuOwnerIndex"];
  evoluContactsOwnerId: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerId"];
  evoluContactsOwnerIndex: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerIndex"];
  evoluContactsOwnerNewContactsCount: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerNewContactsCount"];
  evoluContactsOwnerPointer: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerPointer"];
  evoluTransactionsOwnerPointer: SystemRoutesProps["evoluDataDetailProps"]["evoluTransactionsOwnerPointer"];
  evoluContactsOwnerEditsUntilRotation: SystemRoutesProps["evoluHistoryDataProps"]["evoluContactsOwnerEditsUntilRotation"];
  evoluCashuOwnerEditsUntilRotation: SystemRoutesProps["evoluHistoryDataProps"]["evoluCashuOwnerEditsUntilRotation"];
  evoluHistoryAllowedOwnerIds: SystemRoutesProps["evoluHistoryDataProps"]["evoluHistoryAllowedOwnerIds"];
  evoluMessagesBackupOwnerId: SystemRoutesProps["evoluCurrentDataProps"]["evoluMessagesBackupOwnerId"];
  evoluMessagesOwnerId: SystemRoutesProps["evoluCurrentDataProps"]["evoluMessagesOwnerId"];
  evoluMessagesOwnerIndex: SystemRoutesProps["evoluCurrentDataProps"]["evoluMessagesOwnerIndex"];
  evoluMessagesOwnerEditsUntilRotation: SystemRoutesProps["evoluHistoryDataProps"]["evoluMessagesOwnerEditsUntilRotation"];
  evoluTransactionsBackupOwnerId: SystemRoutesProps["evoluCurrentDataProps"]["evoluTransactionsBackupOwnerId"];
  evoluTransactionsOwnerId: SystemRoutesProps["evoluCurrentDataProps"]["evoluTransactionsOwnerId"];
  evoluTransactionsOwnerIndex: SystemRoutesProps["evoluCurrentDataProps"]["evoluTransactionsOwnerIndex"];
  evoluTransactionsOwnerEditsUntilRotation: SystemRoutesProps["evoluHistoryDataProps"]["evoluTransactionsOwnerEditsUntilRotation"];
  requestManualRotateCashuOwner: SystemRoutesProps["evoluCurrentDataProps"]["requestManualRotateCashuOwner"];
  requestManualRotateContactsOwner: SystemRoutesProps["evoluCurrentDataProps"]["requestManualRotateContactsOwner"];
  requestManualRotateMessagesOwner: SystemRoutesProps["evoluCurrentDataProps"]["requestManualRotateMessagesOwner"];
  requestManualRotateTransactionsOwner: SystemRoutesProps["evoluCurrentDataProps"]["requestManualRotateTransactionsOwner"];
  rotateCashuOwnerIsBusy: SystemRoutesProps["evoluCurrentDataProps"]["rotateCashuOwnerIsBusy"];
  rotateContactsOwnerIsBusy: SystemRoutesProps["evoluCurrentDataProps"]["rotateContactsOwnerIsBusy"];
  rotateMessagesOwnerIsBusy: SystemRoutesProps["evoluCurrentDataProps"]["rotateMessagesOwnerIsBusy"];
  rotateTransactionsOwnerIsBusy: SystemRoutesProps["evoluCurrentDataProps"]["rotateTransactionsOwnerIsBusy"];
  evoluWipeStorageIsBusy: SystemRoutesProps["evoluDataDetailProps"]["pendingClearDatabase"];
  exportAppData: SystemRoutesProps["advancedProps"]["exportAppData"];
  extractPpk: SystemRoutesProps["mintDetailProps"]["extractPpk"];
  getMintIconUrl: SystemRoutesProps["mintsProps"]["getMintIconUrl"];
  getMintRuntime: SystemRoutesProps["mintDetailProps"]["getMintRuntime"];
  handleImportAppDataFilePicked: SystemRoutesProps["advancedProps"]["handleImportAppDataFilePicked"];
  importDataFileInputRef: SystemRoutesProps["advancedProps"]["importDataFileInputRef"];
  isSeedLogin: SystemRoutesProps["advancedProps"]["isSeedLogin"];
  isEvoluServerOffline: SystemRoutesProps["evoluServerProps"]["isEvoluServerOffline"];
  lightningInvoiceAutoPayLimit: SystemRoutesProps["advancedProps"]["lightningInvoiceAutoPayLimit"];
  lang: SystemRoutesProps["mintDetailProps"]["lang"];
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX: SystemRoutesProps["mintDetailProps"]["LOCAL_MINT_INFO_STORAGE_KEY_PREFIX"];
  logoutArmed: SystemRoutesProps["advancedProps"]["logoutArmed"];
  MAIN_MINT_URL: SystemRoutesProps["mintsProps"]["MAIN_MINT_URL"];
  meltLargestForeignMintToMainMint: SystemRoutesProps["mintsProps"]["meltLargestForeignMintToMainMint"];
  mintInfoByUrl: SystemRoutesProps["mintDetailProps"]["mintInfoByUrl"];
  newEvoluServerUrl: SystemRoutesProps["evoluServerNewProps"]["newEvoluServerUrl"];
  newRelayUrl: SystemRoutesProps["nostrRelayNewProps"]["newRelayUrl"];
  normalizeEvoluServerUrl: SystemRoutesProps["evoluServerNewProps"]["normalizeEvoluServerUrl"];
  normalizeMintUrl: SystemRoutesProps["mintsProps"]["normalizeMintUrl"];
  nostrRelayOverallStatus: SystemRoutesProps["advancedProps"]["nostrRelayOverallStatus"];
  passwordManagerSeedUsername: SystemRoutesProps["advancedProps"]["passwordManagerSeedUsername"];
  pendingEvoluServerDeleteUrl: SystemRoutesProps["evoluServerProps"]["pendingEvoluServerDeleteUrl"];
  pendingMintDeleteUrl: SystemRoutesProps["mintDetailProps"]["pendingMintDeleteUrl"];
  pendingRelayDeleteUrl: SystemRoutesProps["nostrRelayProps"]["pendingRelayDeleteUrl"];
  payWithCashuEnabled: SystemRoutesProps["advancedProps"]["payWithCashuEnabled"];
  cashuAutoswapEnabled: SystemRoutesProps["advancedProps"]["cashuAutoswapEnabled"];
  PRESET_MINTS: SystemRoutesProps["mintsProps"]["PRESET_MINTS"];
  pushToast: SystemRoutesProps["evoluServerNewProps"]["pushToast"];
  refreshMintInfo: SystemRoutesProps["mintDetailProps"]["refreshMintInfo"];
  relayStatusByUrl: SystemRoutesProps["nostrRelaysProps"]["relayStatusByUrl"];
  relayUrls: SystemRoutesProps["advancedProps"]["relayUrls"];
  requestDeleteSelectedRelay: SystemRoutesProps["nostrRelayProps"]["requestDeleteSelectedRelay"];
  requestDeriveNostrKeys: SystemRoutesProps["advancedProps"]["requestDeriveNostrKeys"];
  requestPasteNostrKeys: SystemRoutesProps["advancedProps"]["requestPasteNostrKeys"];
  requestImportAppData: SystemRoutesProps["advancedProps"]["requestImportAppData"];
  requestLogout: SystemRoutesProps["advancedProps"]["requestLogout"];
  saveSeedToPasswordManager: SystemRoutesProps["advancedProps"]["saveSeedToPasswordManager"];
  route: Route;
  safeLocalStorageSetJson: SystemRoutesProps["mintDetailProps"]["safeLocalStorageSetJson"];
  saveEvoluServerUrls: SystemRoutesProps["evoluServerNewProps"]["saveEvoluServerUrls"];
  saveNewRelay: SystemRoutesProps["nostrRelayNewProps"]["saveNewRelay"];
  seedMnemonic: SystemRoutesProps["advancedProps"]["seedMnemonic"];
  selectedEvoluServerUrl: SystemRoutesProps["evoluServerProps"]["selectedEvoluServerUrl"];
  selectedRelayUrl: SystemRoutesProps["nostrRelayProps"]["selectedRelayUrl"];
  setLightningInvoiceAutoPayLimit: SystemRoutesProps["advancedProps"]["setLightningInvoiceAutoPayLimit"];
  setDefaultMintUrlDraft: SystemRoutesProps["mintsProps"]["setDefaultMintUrlDraft"];
  setEvoluServerOffline: SystemRoutesProps["evoluServerProps"]["setEvoluServerOffline"];
  setNewEvoluServerUrl: SystemRoutesProps["evoluServerNewProps"]["setNewEvoluServerUrl"];
  setNewRelayUrl: SystemRoutesProps["nostrRelayNewProps"]["setNewRelayUrl"];
  setPayWithCashuEnabled: SystemRoutesProps["advancedProps"]["setPayWithCashuEnabled"];
  setCashuAutoswapEnabled: SystemRoutesProps["advancedProps"]["setCashuAutoswapEnabled"];
  setPendingEvoluServerDeleteUrl: SystemRoutesProps["evoluServerProps"]["setPendingEvoluServerDeleteUrl"];
  setPendingMintDeleteUrl: SystemRoutesProps["mintDetailProps"]["setPendingMintDeleteUrl"];
  setStatus: SystemRoutesProps["evoluServerNewProps"]["setStatus"];
  setMintInfoAllUnknown: SystemRoutesProps["mintDetailProps"]["setMintInfoAll"];
  syncOwner: SystemRoutesProps["evoluServerProps"]["syncOwner"];
  t: SystemRoutesProps["advancedProps"]["t"];
  wipeEvoluStorage: SystemRoutesProps["evoluServerNewProps"]["wipeEvoluStorage"];
}

export const useSystemRouteProps = ({
  appOwnerIdRef,
  appVersion,
  applyDefaultMintSelection,
  cashuIsBusy,
  cashuMeltToMainMintButtonLabel,
  canSaveNewRelay,
  connectedRelayCount,
  copyNostrKeys,
  copySeed,
  activeNostrIdentitySource,
  currentNpub,
  currentNsec,
  dedupeContacts,
  dedupeContactsIsBusy,
  defaultMintDisplay,
  defaultMintUrl,
  defaultMintUrlDraft,
  evoluConnectedServerCount,
  evoluDatabaseBytes,
  evoluHasError,
  evoluHistoryCount,
  evoluOverallStatus,
  evoluServerStatusByUrl,
  evoluServerUrls,
  evoluServersReloadRequired,
  evoluTableCounts,
  evoluContactsOwnerEditCount,
  evoluCashuOwnerId,
  evoluCashuOwnerIndex,
  evoluContactsOwnerId,
  evoluContactsOwnerIndex,
  evoluContactsOwnerNewContactsCount,
  evoluContactsOwnerPointer,
  evoluTransactionsOwnerPointer,
  evoluContactsOwnerEditsUntilRotation,
  evoluCashuOwnerEditsUntilRotation,
  evoluHistoryAllowedOwnerIds,
  evoluMessagesBackupOwnerId,
  evoluMessagesOwnerId,
  evoluMessagesOwnerIndex,
  evoluMessagesOwnerEditsUntilRotation,
  evoluTransactionsBackupOwnerId,
  evoluTransactionsOwnerId,
  evoluTransactionsOwnerIndex,
  evoluTransactionsOwnerEditsUntilRotation,
  requestManualRotateCashuOwner,
  requestManualRotateContactsOwner,
  requestManualRotateMessagesOwner,
  requestManualRotateTransactionsOwner,
  rotateCashuOwnerIsBusy,
  rotateContactsOwnerIsBusy,
  rotateMessagesOwnerIsBusy,
  rotateTransactionsOwnerIsBusy,
  evoluWipeStorageIsBusy,
  exportAppData,
  extractPpk,
  getMintIconUrl,
  getMintRuntime,
  handleImportAppDataFilePicked,
  importDataFileInputRef,
  isSeedLogin,
  isEvoluServerOffline,
  lightningInvoiceAutoPayLimit,
  lang,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
  logoutArmed,
  MAIN_MINT_URL,
  meltLargestForeignMintToMainMint,
  mintInfoByUrl,
  newEvoluServerUrl,
  newRelayUrl,
  normalizeEvoluServerUrl,
  normalizeMintUrl,
  nostrRelayOverallStatus,
  passwordManagerSeedUsername,
  pendingEvoluServerDeleteUrl,
  pendingMintDeleteUrl,
  pendingRelayDeleteUrl,
  payWithCashuEnabled,
  cashuAutoswapEnabled,
  PRESET_MINTS,
  pushToast,
  refreshMintInfo,
  relayStatusByUrl,
  relayUrls,
  requestDeleteSelectedRelay,
  requestDeriveNostrKeys,
  requestPasteNostrKeys,
  requestImportAppData,
  requestLogout,
  saveSeedToPasswordManager,
  route,
  safeLocalStorageSetJson,
  saveEvoluServerUrls,
  saveNewRelay,
  seedMnemonic,
  selectedEvoluServerUrl,
  selectedRelayUrl,
  setLightningInvoiceAutoPayLimit,
  setDefaultMintUrlDraft,
  setEvoluServerOffline,
  setNewEvoluServerUrl,
  setNewRelayUrl,
  setPayWithCashuEnabled,
  setCashuAutoswapEnabled,
  setPendingEvoluServerDeleteUrl,
  setPendingMintDeleteUrl,
  setStatus,
  setMintInfoAllUnknown,
  syncOwner,
  t,
  wipeEvoluStorage,
}: UseSystemRoutePropsParams): SystemRouteProps => {
  const [clearDatabaseArmed, setClearDatabaseArmed] = React.useState(false);

  const requestClearDatabase = React.useCallback(() => {
    if (!clearDatabaseArmed) {
      setClearDatabaseArmed(true);
      pushToast(t("deleteArmedHint"));
      return;
    }

    setClearDatabaseArmed(false);
    void wipeEvoluStorage();
  }, [clearDatabaseArmed, pushToast, t, wipeEvoluStorage]);

  React.useEffect(() => {
    if (!clearDatabaseArmed) return;

    const timeoutId = window.setTimeout(() => {
      setClearDatabaseArmed(false);
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [clearDatabaseArmed]);

  return {
    advancedProps: {
      activeNostrIdentitySource,
      currentNpub,
      currentNsec,
      seedMnemonic,
      payWithCashuEnabled,
      cashuAutoswapEnabled,
      pushToast,
      relayUrls,
      connectedRelayCount,
      nostrRelayOverallStatus,
      evoluServerUrls,
      evoluConnectedServerCount,
      evoluOverallStatus,
      defaultMintDisplay,
      dedupeContactsIsBusy,
      logoutArmed,
      importDataFileInputRef,
      isSeedLogin,
      lightningInvoiceAutoPayLimit,
      copyNostrKeys,
      copySeed,
      passwordManagerSeedUsername,
      saveSeedToPasswordManager,
      setLightningInvoiceAutoPayLimit,
      setPayWithCashuEnabled,
      setCashuAutoswapEnabled,
      exportAppData,
      requestImportAppData,
      requestDeriveNostrKeys,
      requestPasteNostrKeys,
      dedupeContacts,
      handleImportAppDataFilePicked,
      requestLogout,
      t,
      __APP_VERSION__: appVersion,
    },
    advancedAutoPayLimitProps: {
      lightningInvoiceAutoPayLimit,
      setLightningInvoiceAutoPayLimit,
      t,
    },
    advancedPushDebugProps: {
      currentNsec,
      t,
    },
    evoluCurrentDataProps: {
      evoluCashuOwnerEditsUntilRotation,
      evoluCashuOwnerId,
      evoluCashuOwnerIndex,
      evoluContactsOwnerEditsUntilRotation,
      evoluContactsOwnerId,
      evoluContactsOwnerIndex,
      evoluMessagesOwnerEditsUntilRotation,
      evoluMessagesBackupOwnerId,
      evoluMessagesOwnerId,
      evoluMessagesOwnerIndex,
      evoluTransactionsOwnerEditsUntilRotation,
      evoluTransactionsBackupOwnerId,
      evoluTransactionsOwnerId,
      evoluTransactionsOwnerIndex,
      requestManualRotateCashuOwner,
      requestManualRotateContactsOwner,
      requestManualRotateMessagesOwner,
      requestManualRotateTransactionsOwner,
      rotateCashuOwnerIsBusy,
      rotateContactsOwnerIsBusy,
      rotateMessagesOwnerIsBusy,
      rotateTransactionsOwnerIsBusy,
      loadCurrentData: loadEvoluCurrentData,
      t,
    },
    evoluDataDetailProps: {
      evoluDatabaseBytes,
      evoluTableCounts,
      evoluHistoryCount,
      evoluContactsOwnerEditCount,
      evoluContactsOwnerId,
      evoluContactsOwnerIndex,
      evoluContactsOwnerNewContactsCount,
      evoluContactsOwnerPointer,
      evoluTransactionsOwnerId,
      evoluTransactionsOwnerIndex,
      evoluTransactionsOwnerPointer,
      clearDatabaseArmed,
      pendingClearDatabase: evoluWipeStorageIsBusy,
      requestClearDatabase,
      loadHistoryData: loadEvoluHistoryData,
      loadCurrentData: loadEvoluCurrentData,
      t,
    },
    evoluHistoryDataProps: {
      evoluContactsOwnerEditsUntilRotation,
      evoluCashuOwnerEditsUntilRotation,
      evoluHistoryAllowedOwnerIds,
      evoluMessagesOwnerEditsUntilRotation,
      evoluTransactionsOwnerEditsUntilRotation,
      loadHistoryData: loadEvoluHistoryData,
      t,
    },
    evoluServerNewProps: {
      newEvoluServerUrl,
      evoluServerUrls,
      evoluWipeStorageIsBusy,
      setNewEvoluServerUrl,
      normalizeEvoluServerUrl,
      saveEvoluServerUrls,
      setStatus,
      pushToast,
      wipeEvoluStorage,
      t,
    },
    evoluServerProps: {
      selectedEvoluServerUrl,
      evoluServersReloadRequired,
      evoluServerStatusByUrl,
      evoluHasError,
      syncOwner,
      isEvoluServerOffline,
      setEvoluServerOffline,
      pendingEvoluServerDeleteUrl,
      setPendingEvoluServerDeleteUrl,
      evoluServerUrls,
      saveEvoluServerUrls,
      setStatus,
      t,
    },
    evoluServersProps: {
      evoluHasError,
      evoluHistoryCount,
      evoluServerStatusByUrl,
      evoluServerUrls,
      evoluTableCounts,
      isEvoluServerOffline,
      clearDatabaseArmed,
      pendingClearDatabase: evoluWipeStorageIsBusy,
      requestClearDatabase,
      syncOwner,
      t,
    },
    mintDetailProps: {
      mintUrl: route.kind === "mint" ? route.mintUrl : "",
      normalizeMintUrl,
      mintInfoByUrl,
      getMintRuntime,
      refreshMintInfo,
      pendingMintDeleteUrl,
      setPendingMintDeleteUrl,
      setStatus,
      setMintInfoAll: setMintInfoAllUnknown,
      appOwnerIdRef,
      Evolu,
      LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
      safeLocalStorageSetJson,
      extractPpk,
      lang,
      t,
    },
    mintsProps: {
      cashuIsBusy,
      defaultMintUrl,
      defaultMintUrlDraft,
      cashuMeltToMainMintButtonLabel,
      setDefaultMintUrlDraft,
      normalizeMintUrl,
      MAIN_MINT_URL,
      PRESET_MINTS,
      getMintIconUrl,
      applyDefaultMintSelection,
      meltLargestForeignMintToMainMint,
      t,
    },
    nostrRelayNewProps: {
      newRelayUrl,
      canSaveNewRelay,
      setNewRelayUrl,
      saveNewRelay,
      t,
    },
    nostrRelayProps: {
      selectedRelayUrl,
      pendingRelayDeleteUrl,
      requestDeleteSelectedRelay,
      t,
    },
    nostrRelaysProps: {
      relayUrls,
      relayStatusByUrl,
      t,
    },
  };
};
