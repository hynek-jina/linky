/* eslint-disable react-refresh/only-export-components */
import type { OwnerId, SyncOwner } from "@evolu/common";
import React from "react";
import type { EvoluServerStatus } from "../../evolu";
import type { PasswordManagerSaveResult } from "../../platform/passwordManager";
import type { LocalMintInfoRow, MintUrlInput } from "../types/appTypes";

export interface AdvancedSettingsContextValue {
  bankPaymentOfferRecipientCount: number;
  cashuAutoswapEnabled: boolean;
  connectedRelayCount: number;
  copyNostrKeys: () => Promise<void>;
  copySeed: () => Promise<void>;
  dedupeContacts: () => Promise<void>;
  dedupeContactsIsBusy: boolean;
  defaultMintDisplay: string | null;
  evoluConnectedServerCount: number;
  evoluOverallStatus: EvoluServerStatus;
  evoluServerUrls: string[];
  exportAppData: () => void;
  handleImportAppDataFilePicked: (file: File | null) => Promise<void>;
  importDataFileInputRef: React.RefObject<HTMLInputElement | null>;
  lightningInvoiceAutoPayLimit: number;
  logoutArmed: boolean;
  nostrRelayOverallStatus: EvoluServerStatus;
  passwordManagerSeedUsername: string;
  payWithCashuEnabled: boolean;
  pushToast: (message: string) => void;
  relayUrls: string[];
  requestImportAppData: () => void;
  requestLogout: () => void;
  requestPasteNostrKeys: () => Promise<void>;
  saveSeedToPasswordManager: () => Promise<PasswordManagerSaveResult>;
  seedMnemonic: string | null;
  setBankPaymentOfferRecipientCount: (value: number) => void;
  setCashuAutoswapEnabled: (value: boolean) => void;
  setLightningInvoiceAutoPayLimit: (value: number) => void;
  setPayWithCashuEnabled: (value: boolean) => void;
}

export interface EvoluSettingsContextValue {
  clearDatabaseArmed: boolean;
  evoluCashuOwnerEditsUntilRotation: number;
  evoluCashuOwnerId: OwnerId | null;
  evoluCashuOwnerIndex: number;
  evoluCashuVisibleOwnerIds: readonly OwnerId[];
  evoluContactsOwnerEditCount: number;
  evoluContactsOwnerEditsUntilRotation: number;
  evoluContactsOwnerId: OwnerId | null;
  evoluContactsOwnerIndex: number;
  evoluContactsOwnerNewContactsCount: number;
  evoluContactsOwnerPointer: string;
  evoluDatabaseBytes: number | null;
  evoluHasError: boolean;
  evoluHistoryAllowedOwnerIds: readonly string[];
  evoluHistoryCount: number | null;
  evoluMessagesOwnerEditsUntilRotation: number;
  evoluMessagesOwnerId: OwnerId | null;
  evoluMessagesOwnerIndex: number;
  evoluMessagesVisibleOwnerIds: readonly OwnerId[];
  evoluServerStatusByUrl: Record<string, EvoluServerStatus>;
  evoluServerUrls: string[];
  evoluServersReloadRequired: boolean;
  evoluTableCounts: Record<string, number | null>;
  evoluTransactionsOwnerEditsUntilRotation: number;
  evoluTransactionsOwnerId: OwnerId | null;
  evoluTransactionsOwnerIndex: number;
  evoluTransactionsOwnerPointer: string;
  evoluTransactionsVisibleOwnerIds: readonly OwnerId[];
  evoluWipeStorageIsBusy: boolean;
  isEvoluServerOffline: (url: string) => boolean;
  newEvoluServerUrl: string;
  pendingEvoluServerDeleteUrl: string | null;
  requestClearDatabase: () => void;
  requestManualRotateCashuOwner: () => Promise<void>;
  requestManualRotateContactsOwner: () => Promise<void>;
  requestManualRotateMessagesOwner: () => Promise<void>;
  requestManualRotateTransactionsOwner: () => Promise<void>;
  rotateCashuOwnerIsBusy: boolean;
  rotateContactsOwnerIsBusy: boolean;
  rotateMessagesOwnerIsBusy: boolean;
  rotateTransactionsOwnerIsBusy: boolean;
  saveEvoluServerUrls: (urls: string[]) => void;
  setEvoluServerOffline: (url: string, offline: boolean) => void;
  setNewEvoluServerUrl: (url: string) => void;
  setPendingEvoluServerDeleteUrl: (url: string | null) => void;
  setStatus: (message: string) => void;
  syncOwner: SyncOwner | null;
  wipeEvoluStorage: () => Promise<void>;
}

interface MintIcon {
  failed: boolean;
  host: string | null;
  origin: string | null;
  url: string | null;
}

export interface MintSettingsContextValue {
  appOwnerIdRef: React.RefObject<OwnerId | null>;
  applyDefaultMintSelection: (mint: string) => Promise<void>;
  cashuIsBusy: boolean;
  cashuMeltToMainMintButtonLabel: string | null;
  defaultMintUrl: string | null;
  defaultMintUrlDraft: string;
  getMintIconUrl: (mint: MintUrlInput) => MintIcon;
  getMintRuntime: (
    url: string,
  ) => { lastCheckedAtSec: number; latencyMs: number | null } | null;
  meltLargestForeignMintToMainMint: () => Promise<void>;
  mintInfoByUrl: Map<string, LocalMintInfoRow>;
  pendingMintDeleteUrl: string | null;
  refreshMintInfo: (url: string) => Promise<void>;
  setDefaultMintUrlDraft: (value: string) => void;
  setMintInfoAll: React.Dispatch<React.SetStateAction<LocalMintInfoRow[]>>;
  setPendingMintDeleteUrl: (url: string | null) => void;
  setStatus: (message: string) => void;
}

export interface RelaySettingsContextValue {
  canSaveNewRelay: boolean;
  newRelayUrl: string;
  pendingRelayDeleteUrl: string | null;
  relayStatusByUrl: Record<string, EvoluServerStatus>;
  relayUrls: string[];
  requestDeleteSelectedRelay: () => void;
  saveNewRelay: () => void;
  selectedRelayUrl: string | null;
  setNewRelayUrl: (url: string) => void;
}

interface SystemSettingsContextsProviderProps {
  advancedSettings: AdvancedSettingsContextValue;
  children: React.ReactNode;
  evoluSettings: EvoluSettingsContextValue;
  mintSettings: MintSettingsContextValue;
  relaySettings: RelaySettingsContextValue;
}

const AdvancedSettingsContext =
  React.createContext<AdvancedSettingsContextValue | null>(null);
const EvoluSettingsContext =
  React.createContext<EvoluSettingsContextValue | null>(null);
const MintSettingsContext =
  React.createContext<MintSettingsContextValue | null>(null);
const RelaySettingsContext =
  React.createContext<RelaySettingsContextValue | null>(null);

const useRequiredContext = <T,>(
  contextValue: T | null,
  hookName: string,
): T => {
  if (contextValue === null) {
    throw new Error(
      `${hookName} must be used within SystemSettingsContextsProvider`,
    );
  }

  return contextValue;
};

export const SystemSettingsContextsProvider = ({
  advancedSettings,
  children,
  evoluSettings,
  mintSettings,
  relaySettings,
}: SystemSettingsContextsProviderProps): React.ReactElement => (
  <AdvancedSettingsContext.Provider value={advancedSettings}>
    <EvoluSettingsContext.Provider value={evoluSettings}>
      <MintSettingsContext.Provider value={mintSettings}>
        <RelaySettingsContext.Provider value={relaySettings}>
          {children}
        </RelaySettingsContext.Provider>
      </MintSettingsContext.Provider>
    </EvoluSettingsContext.Provider>
  </AdvancedSettingsContext.Provider>
);

export const useAdvancedSettingsContext = (): AdvancedSettingsContextValue =>
  useRequiredContext(
    React.useContext(AdvancedSettingsContext),
    "useAdvancedSettingsContext",
  );

export const useEvoluSettingsContext = (): EvoluSettingsContextValue =>
  useRequiredContext(
    React.useContext(EvoluSettingsContext),
    "useEvoluSettingsContext",
  );

export const useMintSettingsContext = (): MintSettingsContextValue =>
  useRequiredContext(
    React.useContext(MintSettingsContext),
    "useMintSettingsContext",
  );

export const useRelaySettingsContext = (): RelaySettingsContextValue =>
  useRequiredContext(
    React.useContext(RelaySettingsContext),
    "useRelaySettingsContext",
  );
