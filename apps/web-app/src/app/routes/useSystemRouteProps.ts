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
  canSaveNewRelay: SystemRoutesProps["nostrRelayNewProps"]["canSaveNewRelay"];
  cashuIsBusy: SystemRoutesProps["advancedProps"]["cashuIsBusy"];
  allowPromisesEnabled: SystemRoutesProps["advancedProps"]["allowPromisesEnabled"];
  connectedRelayCount: SystemRoutesProps["advancedProps"]["connectedRelayCount"];
  copyCashuSeed: SystemRoutesProps["advancedProps"]["copyCashuSeed"];
  copyNostrKeys: SystemRoutesProps["advancedProps"]["copyNostrKeys"];
  hasCustomNsecOverride: SystemRoutesProps["advancedProps"]["hasCustomNsecOverride"];
  copySeed: SystemRoutesProps["advancedProps"]["copySeed"];
  cashuSeedMnemonic: SystemRoutesProps["advancedProps"]["cashuSeedMnemonic"];
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
  evoluContactsOwnerId: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerId"];
  evoluContactsOwnerIndex: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerIndex"];
  evoluContactsOwnerNewContactsCount: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerNewContactsCount"];
  evoluContactsOwnerPointer: SystemRoutesProps["evoluDataDetailProps"]["evoluContactsOwnerPointer"];
  evoluContactsOwnerEditsUntilRotation: SystemRoutesProps["evoluHistoryDataProps"]["evoluContactsOwnerEditsUntilRotation"];
  evoluCashuOwnerEditsUntilRotation: SystemRoutesProps["evoluHistoryDataProps"]["evoluCashuOwnerEditsUntilRotation"];
  evoluHistoryAllowedOwnerIds: SystemRoutesProps["evoluHistoryDataProps"]["evoluHistoryAllowedOwnerIds"];
  evoluMessagesBackupOwnerId: SystemRoutesProps["evoluCurrentDataProps"]["evoluMessagesBackupOwnerId"];
  evoluMessagesOwnerId: SystemRoutesProps["evoluCurrentDataProps"]["evoluMessagesOwnerId"];
  evoluMessagesOwnerEditsUntilRotation: SystemRoutesProps["evoluHistoryDataProps"]["evoluMessagesOwnerEditsUntilRotation"];
  requestManualRotateContactsOwner: SystemRoutesProps["evoluCurrentDataProps"]["requestManualRotateContactsOwner"];
  requestManualRotateMessagesOwner: SystemRoutesProps["evoluCurrentDataProps"]["requestManualRotateMessagesOwner"];
  rotateContactsOwnerIsBusy: SystemRoutesProps["evoluCurrentDataProps"]["rotateContactsOwnerIsBusy"];
  rotateMessagesOwnerIsBusy: SystemRoutesProps["evoluCurrentDataProps"]["rotateMessagesOwnerIsBusy"];
  evoluWipeStorageIsBusy: SystemRoutesProps["evoluDataDetailProps"]["pendingClearDatabase"];
  exportAppData: SystemRoutesProps["advancedProps"]["exportAppData"];
  extractPpk: SystemRoutesProps["mintDetailProps"]["extractPpk"];
  getMintIconUrl: SystemRoutesProps["mintsProps"]["getMintIconUrl"];
  getMintRuntime: SystemRoutesProps["mintDetailProps"]["getMintRuntime"];
  handleImportAppDataFilePicked: SystemRoutesProps["advancedProps"]["handleImportAppDataFilePicked"];
  importDataFileInputRef: SystemRoutesProps["advancedProps"]["importDataFileInputRef"];
  isSeedLogin: SystemRoutesProps["advancedProps"]["isSeedLogin"];
  isEvoluServerOffline: SystemRoutesProps["evoluServerProps"]["isEvoluServerOffline"];
  lang: SystemRoutesProps["mintDetailProps"]["lang"];
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX: SystemRoutesProps["mintDetailProps"]["LOCAL_MINT_INFO_STORAGE_KEY_PREFIX"];
  logoutArmed: SystemRoutesProps["advancedProps"]["logoutArmed"];
  MAIN_MINT_URL: SystemRoutesProps["mintsProps"]["MAIN_MINT_URL"];
  mintInfoByUrl: SystemRoutesProps["mintDetailProps"]["mintInfoByUrl"];
  newEvoluServerUrl: SystemRoutesProps["evoluServerNewProps"]["newEvoluServerUrl"];
  newRelayUrl: SystemRoutesProps["nostrRelayNewProps"]["newRelayUrl"];
  normalizeEvoluServerUrl: SystemRoutesProps["evoluServerNewProps"]["normalizeEvoluServerUrl"];
  normalizeMintUrl: SystemRoutesProps["mintsProps"]["normalizeMintUrl"];
  nostrRelayOverallStatus: SystemRoutesProps["advancedProps"]["nostrRelayOverallStatus"];
  pendingEvoluServerDeleteUrl: SystemRoutesProps["evoluServerProps"]["pendingEvoluServerDeleteUrl"];
  pendingMintDeleteUrl: SystemRoutesProps["mintDetailProps"]["pendingMintDeleteUrl"];
  pendingRelayDeleteUrl: SystemRoutesProps["nostrRelayProps"]["pendingRelayDeleteUrl"];
  payWithCashuEnabled: SystemRoutesProps["advancedProps"]["payWithCashuEnabled"];
  PRESET_MINTS: SystemRoutesProps["mintsProps"]["PRESET_MINTS"];
  pushToast: SystemRoutesProps["evoluServerNewProps"]["pushToast"];
  refreshMintInfo: SystemRoutesProps["mintDetailProps"]["refreshMintInfo"];
  relayStatusByUrl: SystemRoutesProps["nostrRelaysProps"]["relayStatusByUrl"];
  relayUrls: SystemRoutesProps["advancedProps"]["relayUrls"];
  requestDeleteSelectedRelay: SystemRoutesProps["nostrRelayProps"]["requestDeleteSelectedRelay"];
  requestDeriveNostrKeys: SystemRoutesProps["advancedProps"]["requestDeriveNostrKeys"];
  requestImportAppData: SystemRoutesProps["advancedProps"]["requestImportAppData"];
  requestPasteNostrKeys: SystemRoutesProps["advancedProps"]["requestPasteNostrKeys"];
  requestLogout: SystemRoutesProps["advancedProps"]["requestLogout"];
  restoreMissingTokens: SystemRoutesProps["advancedProps"]["restoreMissingTokens"];
  route: Route;
  safeLocalStorageSetJson: SystemRoutesProps["mintDetailProps"]["safeLocalStorageSetJson"];
  saveEvoluServerUrls: SystemRoutesProps["evoluServerNewProps"]["saveEvoluServerUrls"];
  saveNewRelay: SystemRoutesProps["nostrRelayNewProps"]["saveNewRelay"];
  seedMnemonic: SystemRoutesProps["advancedProps"]["seedMnemonic"];
  selectedEvoluServerUrl: SystemRoutesProps["evoluServerProps"]["selectedEvoluServerUrl"];
  selectedRelayUrl: SystemRoutesProps["nostrRelayProps"]["selectedRelayUrl"];
  setAllowPromisesEnabled: SystemRoutesProps["advancedProps"]["setAllowPromisesEnabled"];
  setDefaultMintUrlDraft: SystemRoutesProps["mintsProps"]["setDefaultMintUrlDraft"];
  setEvoluServerOffline: SystemRoutesProps["evoluServerProps"]["setEvoluServerOffline"];
  setNewEvoluServerUrl: SystemRoutesProps["evoluServerNewProps"]["setNewEvoluServerUrl"];
  setNewRelayUrl: SystemRoutesProps["nostrRelayNewProps"]["setNewRelayUrl"];
  setPayWithCashuEnabled: SystemRoutesProps["advancedProps"]["setPayWithCashuEnabled"];
  setPendingEvoluServerDeleteUrl: SystemRoutesProps["evoluServerProps"]["setPendingEvoluServerDeleteUrl"];
  setPendingMintDeleteUrl: SystemRoutesProps["mintDetailProps"]["setPendingMintDeleteUrl"];
  setStatus: SystemRoutesProps["evoluServerNewProps"]["setStatus"];
  setMintInfoAllUnknown: SystemRoutesProps["mintDetailProps"]["setMintInfoAll"];
  syncOwner: SystemRoutesProps["evoluServerProps"]["syncOwner"];
  t: SystemRoutesProps["advancedProps"]["t"];
  tokensRestoreIsBusy: SystemRoutesProps["advancedProps"]["tokensRestoreIsBusy"];
  wipeEvoluStorage: SystemRoutesProps["evoluServerNewProps"]["wipeEvoluStorage"];
}

export const useSystemRouteProps = ({
  appOwnerIdRef,
  appVersion,
  applyDefaultMintSelection,
  canSaveNewRelay,
  cashuIsBusy,
  connectedRelayCount,
  copyCashuSeed,
  copyNostrKeys,
  hasCustomNsecOverride,
  copySeed,
  cashuSeedMnemonic,
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
  evoluContactsOwnerId,
  evoluContactsOwnerIndex,
  evoluContactsOwnerNewContactsCount,
  evoluContactsOwnerPointer,
  evoluContactsOwnerEditsUntilRotation,
  evoluCashuOwnerEditsUntilRotation,
  evoluHistoryAllowedOwnerIds,
  evoluMessagesBackupOwnerId,
  evoluMessagesOwnerId,
  evoluMessagesOwnerEditsUntilRotation,
  requestManualRotateContactsOwner,
  requestManualRotateMessagesOwner,
  rotateContactsOwnerIsBusy,
  rotateMessagesOwnerIsBusy,
  evoluWipeStorageIsBusy,
  exportAppData,
  extractPpk,
  getMintIconUrl,
  getMintRuntime,
  handleImportAppDataFilePicked,
  importDataFileInputRef,
  isSeedLogin,
  isEvoluServerOffline,
  lang,
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX,
  logoutArmed,
  MAIN_MINT_URL,
  mintInfoByUrl,
  newEvoluServerUrl,
  newRelayUrl,
  normalizeEvoluServerUrl,
  normalizeMintUrl,
  nostrRelayOverallStatus,
  pendingEvoluServerDeleteUrl,
  pendingMintDeleteUrl,
  pendingRelayDeleteUrl,
  payWithCashuEnabled,
  allowPromisesEnabled,
  PRESET_MINTS,
  pushToast,
  refreshMintInfo,
  relayStatusByUrl,
  relayUrls,
  requestDeleteSelectedRelay,
  requestDeriveNostrKeys,
  requestImportAppData,
  requestPasteNostrKeys,
  requestLogout,
  restoreMissingTokens,
  route,
  safeLocalStorageSetJson,
  saveEvoluServerUrls,
  saveNewRelay,
  seedMnemonic,
  selectedEvoluServerUrl,
  selectedRelayUrl,
  setAllowPromisesEnabled,
  setDefaultMintUrlDraft,
  setEvoluServerOffline,
  setNewEvoluServerUrl,
  setNewRelayUrl,
  setPayWithCashuEnabled,
  setPendingEvoluServerDeleteUrl,
  setPendingMintDeleteUrl,
  setStatus,
  setMintInfoAllUnknown,
  syncOwner,
  t,
  tokensRestoreIsBusy,
  wipeEvoluStorage,
}: UseSystemRoutePropsParams): SystemRouteProps => {
  const requestClearDatabase = React.useCallback(() => {
    if (window.confirm(t("evoluClearDatabaseConfirm"))) {
      void wipeEvoluStorage();
    }
  }, [t, wipeEvoluStorage]);

  return {
    advancedProps: {
      currentNpub,
      currentNsec,
      cashuSeedMnemonic,
      seedMnemonic,
      tokensRestoreIsBusy,
      cashuIsBusy,
      payWithCashuEnabled,
      pushToast,
      allowPromisesEnabled,
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
      copyCashuSeed,
      copyNostrKeys,
      hasCustomNsecOverride,
      copySeed,
      restoreMissingTokens,
      setPayWithCashuEnabled,
      setAllowPromisesEnabled,
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
    evoluCurrentDataProps: {
      evoluCashuOwnerId,
      evoluContactsOwnerId,
      evoluMessagesBackupOwnerId,
      evoluMessagesOwnerId,
      requestManualRotateContactsOwner,
      requestManualRotateMessagesOwner,
      rotateContactsOwnerIsBusy,
      rotateMessagesOwnerIsBusy,
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
      evoluDatabaseBytes,
      evoluHasError,
      evoluHistoryCount,
      evoluServerStatusByUrl,
      evoluServerUrls,
      evoluTableCounts,
      isEvoluServerOffline,
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
      defaultMintUrl,
      defaultMintUrlDraft,
      setDefaultMintUrlDraft,
      normalizeMintUrl,
      MAIN_MINT_URL,
      PRESET_MINTS,
      getMintIconUrl,
      applyDefaultMintSelection,
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
