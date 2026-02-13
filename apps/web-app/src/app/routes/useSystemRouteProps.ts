import * as Evolu from "@evolu/common";
import React from "react";
import { loadEvoluCurrentData, loadEvoluHistoryData } from "../../evolu";
import type { AppRouteContentProps } from "./AppRouteContent";

type SystemRouteProps = Pick<
  AppRouteContentProps,
  | "advancedProps"
  | "evoluCurrentDataProps"
  | "evoluDataDetailProps"
  | "evoluHistoryDataProps"
  | "evoluServerNewProps"
  | "evoluServerProps"
  | "evoluServersProps"
  | "mintDetailProps"
  | "mintsProps"
  | "nostrRelayNewProps"
  | "nostrRelayProps"
  | "nostrRelaysProps"
>;

interface UseSystemRoutePropsParams {
  appOwnerIdRef: AppRouteContentProps["mintDetailProps"]["appOwnerIdRef"];
  appVersion: AppRouteContentProps["advancedProps"]["__APP_VERSION__"];
  applyDefaultMintSelection: AppRouteContentProps["mintsProps"]["applyDefaultMintSelection"];
  canSaveNewRelay: AppRouteContentProps["nostrRelayNewProps"]["canSaveNewRelay"];
  cashuIsBusy: AppRouteContentProps["advancedProps"]["cashuIsBusy"];
  allowPromisesEnabled: AppRouteContentProps["advancedProps"]["allowPromisesEnabled"];
  connectedRelayCount: AppRouteContentProps["advancedProps"]["connectedRelayCount"];
  copyNostrKeys: AppRouteContentProps["advancedProps"]["copyNostrKeys"];
  copySeed: AppRouteContentProps["advancedProps"]["copySeed"];
  currentNpub: AppRouteContentProps["advancedProps"]["currentNpub"];
  currentNsec: AppRouteContentProps["advancedProps"]["currentNsec"];
  dedupeContacts: AppRouteContentProps["advancedProps"]["dedupeContacts"];
  dedupeContactsIsBusy: AppRouteContentProps["advancedProps"]["dedupeContactsIsBusy"];
  defaultMintDisplay: AppRouteContentProps["advancedProps"]["defaultMintDisplay"];
  defaultMintUrl: AppRouteContentProps["mintsProps"]["defaultMintUrl"];
  defaultMintUrlDraft: AppRouteContentProps["mintsProps"]["defaultMintUrlDraft"];
  evoluConnectedServerCount: AppRouteContentProps["advancedProps"]["evoluConnectedServerCount"];
  evoluDatabaseBytes: AppRouteContentProps["evoluDataDetailProps"]["evoluDatabaseBytes"];
  evoluHasError: AppRouteContentProps["evoluServerProps"]["evoluHasError"];
  evoluHistoryCount: AppRouteContentProps["evoluDataDetailProps"]["evoluHistoryCount"];
  evoluOverallStatus: AppRouteContentProps["advancedProps"]["evoluOverallStatus"];
  evoluServerStatusByUrl: AppRouteContentProps["evoluServerProps"]["evoluServerStatusByUrl"];
  evoluServerUrls: AppRouteContentProps["advancedProps"]["evoluServerUrls"];
  evoluServersReloadRequired: AppRouteContentProps["evoluServerProps"]["evoluServersReloadRequired"];
  evoluTableCounts: AppRouteContentProps["evoluDataDetailProps"]["evoluTableCounts"];
  evoluWipeStorageIsBusy: AppRouteContentProps["evoluDataDetailProps"]["pendingClearDatabase"];
  exportAppData: AppRouteContentProps["advancedProps"]["exportAppData"];
  extractPpk: AppRouteContentProps["mintDetailProps"]["extractPpk"];
  getMintIconUrl: AppRouteContentProps["mintsProps"]["getMintIconUrl"];
  getMintRuntime: AppRouteContentProps["mintDetailProps"]["getMintRuntime"];
  handleImportAppDataFilePicked: AppRouteContentProps["advancedProps"]["handleImportAppDataFilePicked"];
  importDataFileInputRef: AppRouteContentProps["advancedProps"]["importDataFileInputRef"];
  isEvoluServerOffline: AppRouteContentProps["evoluServerProps"]["isEvoluServerOffline"];
  lang: AppRouteContentProps["mintDetailProps"]["lang"];
  LOCAL_MINT_INFO_STORAGE_KEY_PREFIX: AppRouteContentProps["mintDetailProps"]["LOCAL_MINT_INFO_STORAGE_KEY_PREFIX"];
  logoutArmed: AppRouteContentProps["advancedProps"]["logoutArmed"];
  MAIN_MINT_URL: AppRouteContentProps["mintsProps"]["MAIN_MINT_URL"];
  mintInfoByUrl: AppRouteContentProps["mintDetailProps"]["mintInfoByUrl"];
  newEvoluServerUrl: AppRouteContentProps["evoluServerNewProps"]["newEvoluServerUrl"];
  newRelayUrl: AppRouteContentProps["nostrRelayNewProps"]["newRelayUrl"];
  normalizeEvoluServerUrl: AppRouteContentProps["evoluServerNewProps"]["normalizeEvoluServerUrl"];
  normalizeMintUrl: AppRouteContentProps["mintsProps"]["normalizeMintUrl"];
  nostrRelayOverallStatus: AppRouteContentProps["advancedProps"]["nostrRelayOverallStatus"];
  pendingEvoluServerDeleteUrl: AppRouteContentProps["evoluServerProps"]["pendingEvoluServerDeleteUrl"];
  pendingMintDeleteUrl: AppRouteContentProps["mintDetailProps"]["pendingMintDeleteUrl"];
  pendingRelayDeleteUrl: AppRouteContentProps["nostrRelayProps"]["pendingRelayDeleteUrl"];
  payWithCashuEnabled: AppRouteContentProps["advancedProps"]["payWithCashuEnabled"];
  PRESET_MINTS: AppRouteContentProps["mintsProps"]["PRESET_MINTS"];
  pushToast: AppRouteContentProps["evoluServerNewProps"]["pushToast"];
  refreshMintInfo: AppRouteContentProps["mintDetailProps"]["refreshMintInfo"];
  relayStatusByUrl: AppRouteContentProps["nostrRelaysProps"]["relayStatusByUrl"];
  relayUrls: AppRouteContentProps["advancedProps"]["relayUrls"];
  requestDeleteSelectedRelay: AppRouteContentProps["nostrRelayProps"]["requestDeleteSelectedRelay"];
  requestImportAppData: AppRouteContentProps["advancedProps"]["requestImportAppData"];
  requestLogout: AppRouteContentProps["advancedProps"]["requestLogout"];
  restoreMissingTokens: AppRouteContentProps["advancedProps"]["restoreMissingTokens"];
  route: AppRouteContentProps["route"];
  safeLocalStorageSetJson: AppRouteContentProps["mintDetailProps"]["safeLocalStorageSetJson"];
  saveEvoluServerUrls: AppRouteContentProps["evoluServerNewProps"]["saveEvoluServerUrls"];
  saveNewRelay: AppRouteContentProps["nostrRelayNewProps"]["saveNewRelay"];
  seedMnemonic: AppRouteContentProps["advancedProps"]["seedMnemonic"];
  selectedEvoluServerUrl: AppRouteContentProps["evoluServerProps"]["selectedEvoluServerUrl"];
  selectedRelayUrl: AppRouteContentProps["nostrRelayProps"]["selectedRelayUrl"];
  setAllowPromisesEnabled: AppRouteContentProps["advancedProps"]["setAllowPromisesEnabled"];
  setDefaultMintUrlDraft: AppRouteContentProps["mintsProps"]["setDefaultMintUrlDraft"];
  setEvoluServerOffline: AppRouteContentProps["evoluServerProps"]["setEvoluServerOffline"];
  setNewEvoluServerUrl: AppRouteContentProps["evoluServerNewProps"]["setNewEvoluServerUrl"];
  setNewRelayUrl: AppRouteContentProps["nostrRelayNewProps"]["setNewRelayUrl"];
  setPayWithCashuEnabled: AppRouteContentProps["advancedProps"]["setPayWithCashuEnabled"];
  setPendingEvoluServerDeleteUrl: AppRouteContentProps["evoluServerProps"]["setPendingEvoluServerDeleteUrl"];
  setPendingMintDeleteUrl: AppRouteContentProps["mintDetailProps"]["setPendingMintDeleteUrl"];
  setStatus: AppRouteContentProps["evoluServerNewProps"]["setStatus"];
  setMintInfoAllUnknown: AppRouteContentProps["mintDetailProps"]["setMintInfoAll"];
  syncOwner: AppRouteContentProps["evoluServerProps"]["syncOwner"];
  t: AppRouteContentProps["advancedProps"]["t"];
  tokensRestoreIsBusy: AppRouteContentProps["advancedProps"]["tokensRestoreIsBusy"];
  wipeEvoluStorage: AppRouteContentProps["evoluServerNewProps"]["wipeEvoluStorage"];
}

export const useSystemRouteProps = ({
  appOwnerIdRef,
  appVersion,
  applyDefaultMintSelection,
  canSaveNewRelay,
  cashuIsBusy,
  connectedRelayCount,
  copyNostrKeys,
  copySeed,
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
