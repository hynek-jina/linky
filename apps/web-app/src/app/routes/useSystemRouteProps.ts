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
  requestImportAppData: SystemRoutesProps["advancedProps"]["requestImportAppData"];
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
  requestImportAppData,
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
      copySeed,
      restoreMissingTokens,
      setPayWithCashuEnabled,
      setAllowPromisesEnabled,
      exportAppData,
      requestImportAppData,
      dedupeContacts,
      handleImportAppDataFilePicked,
      requestLogout,
      t,
      __APP_VERSION__: appVersion,
    },
    evoluCurrentDataProps: {
      loadCurrentData: loadEvoluCurrentData,
      t,
    },
    evoluDataDetailProps: {
      evoluDatabaseBytes,
      evoluTableCounts,
      evoluHistoryCount,
      pendingClearDatabase: evoluWipeStorageIsBusy,
      requestClearDatabase,
      loadHistoryData: loadEvoluHistoryData,
      loadCurrentData: loadEvoluCurrentData,
      t,
    },
    evoluHistoryDataProps: {
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
