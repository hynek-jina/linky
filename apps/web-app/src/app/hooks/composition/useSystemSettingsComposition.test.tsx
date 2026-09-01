import type { OwnerId } from "@evolu/common";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AdvancedSettingsContextValue,
  EvoluSettingsContextValue,
  MintSettingsContextValue,
  RelaySettingsContextValue,
} from "../../context/SystemSettingsContexts";
import {
  useSystemSettingsComposition,
  type SystemSettingsCompositionResult,
} from "./useSystemSettingsComposition";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const noop = (): void => {};
const noopAsync = async (): Promise<void> => {};
const translate = (key: string): string => key;

const createAdvancedSettings = (
  pushToast: (message: string) => void,
): AdvancedSettingsContextValue => ({
  bankPaymentOfferRecipientCount: 1,
  bankPaymentOfferStaggerDelaySec: 0,
  cashuAutoswapEnabled: true,
  copyNostrKeys: noopAsync,
  copySeed: noopAsync,
  dedupeContacts: noopAsync,
  dedupeContactsIsBusy: false,
  defaultMintDisplay: null,
  evoluConnectedServerCount: 0,
  evoluOverallStatus: "checking",
  evoluServerUrls: [],
  exportAppData: noop,
  handleImportAppDataFilePicked: noopAsync,
  importDataFileInputRef: React.createRef<HTMLInputElement>(),
  lightningInvoiceAutoPayLimit: 1,
  logoutArmed: false,
  passwordManagerSeedUsername: "",
  payWithCashuEnabled: true,
  pushToast,
  relayUrls: [],
  requestImportAppData: noop,
  requestLogout: noop,
  requestPasteNostrKeys: noopAsync,
  saveSeedToPasswordManager: async () => "saved",
  seedMnemonic: null,
  setBankPaymentOfferRecipientCount: noop,
  setBankPaymentOfferStaggerDelaySec: noop,
  setCashuAutoswapEnabled: noop,
  setLightningInvoiceAutoPayLimit: noop,
  setPayWithCashuEnabled: noop,
});

type EvoluSettingsInput = Omit<
  EvoluSettingsContextValue,
  "clearDatabaseArmed" | "requestClearDatabase"
>;

const createEvoluSettings = (
  wipeEvoluStorage: () => Promise<void>,
): EvoluSettingsInput => ({
  evoluCashuOwnerEditsUntilRotation: 0,
  evoluCashuOwnerId: null,
  evoluCashuOwnerIndex: 0,
  evoluCashuVisibleOwnerIds: [],
  evoluContactsOwnerEditCount: 0,
  evoluContactsOwnerEditsUntilRotation: 0,
  evoluContactsOwnerId: null,
  evoluContactsOwnerIndex: 0,
  evoluContactsOwnerNewContactsCount: 0,
  evoluContactsOwnerPointer: "",
  evoluDatabaseBytes: null,
  evoluHasError: false,
  evoluHistoryAllowedOwnerIds: [],
  evoluHistoryCount: null,
  evoluMessagesOwnerEditsUntilRotation: 0,
  evoluMessagesOwnerId: null,
  evoluMessagesOwnerIndex: 0,
  evoluMessagesVisibleOwnerIds: [],
  evoluServerStatusByUrl: {},
  evoluServerUrls: [],
  evoluServersReloadRequired: false,
  evoluTableCounts: {},
  evoluTransactionsOwnerEditsUntilRotation: 0,
  evoluTransactionsOwnerId: null,
  evoluTransactionsOwnerIndex: 0,
  evoluTransactionsOwnerPointer: "",
  evoluTransactionsVisibleOwnerIds: [],
  evoluWipeStorageIsBusy: false,
  isEvoluServerOffline: () => false,
  newEvoluServerUrl: "",
  pendingEvoluServerDeleteUrl: null,
  requestManualRotateCashuOwner: noopAsync,
  requestManualRotateContactsOwner: noopAsync,
  requestManualRotateMessagesOwner: noopAsync,
  requestManualRotateTransactionsOwner: noopAsync,
  rotateCashuOwnerIsBusy: false,
  rotateContactsOwnerIsBusy: false,
  rotateMessagesOwnerIsBusy: false,
  rotateTransactionsOwnerIsBusy: false,
  saveEvoluServerUrls: noop,
  setEvoluServerOffline: noop,
  setNewEvoluServerUrl: noop,
  setPendingEvoluServerDeleteUrl: noop,
  setStatus: noop,
  syncOwner: null,
  wipeEvoluStorage,
});

const appOwnerIdRef = React.createRef<OwnerId>();

const createMintSettings = (draft: string): MintSettingsContextValue => ({
  appOwnerIdRef,
  applyDefaultMintSelection: noopAsync,
  cashuIsBusy: false,
  cashuMeltToMainMintButtonLabel: null,
  defaultMintUrl: null,
  defaultMintUrlDraft: draft,
  getMintIconUrl: () => ({
    failed: false,
    host: null,
    origin: null,
    url: null,
  }),
  getMintRuntime: () => null,
  meltLargestForeignMintToMainMint: noopAsync,
  mintInfoByUrl: new Map(),
  pendingMintDeleteUrl: null,
  probeLightningFee: null,
  refreshMintInfo: noopAsync,
  setDefaultMintUrlDraft: noop,
  setMintInfoAll: noop,
  setPendingMintDeleteUrl: noop,
  setStatus: noop,
});

const relaySettings: RelaySettingsContextValue = {
  canSaveNewRelay: false,
  newRelayUrl: "",
  pendingRelayDeleteUrl: null,
  relayUrls: [],
  requestDeleteSelectedRelay: noop,
  saveNewRelay: noop,
  selectedRelayUrl: null,
  setNewRelayUrl: noop,
};

interface HarnessProps {
  advancedSettingsInput: AdvancedSettingsContextValue;
  evoluSettingsInput: EvoluSettingsInput;
  mintDraft: string;
  resultRef: React.RefObject<SystemSettingsCompositionResult | null>;
}

const Harness = ({
  advancedSettingsInput,
  evoluSettingsInput,
  mintDraft,
  resultRef,
}: HarnessProps): null => {
  const result = useSystemSettingsComposition({
    advancedSettingsInput,
    evoluSettingsInput,
    mintSettingsInput: createMintSettings(mintDraft),
    relaySettingsInput: relaySettings,
    t: translate,
  });
  React.useEffect(() => {
    resultRef.current = result;
  }, [result, resultRef]);
  return null;
};

const readResult = (
  resultRef: React.RefObject<SystemSettingsCompositionResult | null>,
): SystemSettingsCompositionResult => {
  if (resultRef.current === null) {
    throw new Error("system settings composition result missing");
  }
  return resultRef.current;
};

describe("useSystemSettingsComposition", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("arms, confirms, and times out database clearing", async () => {
    vi.useFakeTimers();
    const pushToast = vi.fn();
    const wipeEvoluStorage = vi.fn(noopAsync);
    const advancedSettingsInput = createAdvancedSettings(pushToast);
    const evoluSettingsInput = createEvoluSettings(wipeEvoluStorage);
    const resultRef = React.createRef<SystemSettingsCompositionResult | null>();
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <Harness
          advancedSettingsInput={advancedSettingsInput}
          evoluSettingsInput={evoluSettingsInput}
          mintDraft=""
          resultRef={resultRef}
        />,
      );
    });

    act(() => {
      readResult(resultRef).evoluSettingsContext.requestClearDatabase();
    });
    expect(readResult(resultRef).evoluSettingsContext.clearDatabaseArmed).toBe(
      true,
    );
    expect(pushToast).toHaveBeenCalledWith("deleteArmedHint");
    expect(wipeEvoluStorage).not.toHaveBeenCalled();

    act(() => {
      readResult(resultRef).evoluSettingsContext.requestClearDatabase();
    });
    expect(readResult(resultRef).evoluSettingsContext.clearDatabaseArmed).toBe(
      false,
    );
    expect(wipeEvoluStorage).toHaveBeenCalledTimes(1);

    act(() => {
      readResult(resultRef).evoluSettingsContext.requestClearDatabase();
    });
    expect(readResult(resultRef).evoluSettingsContext.clearDatabaseArmed).toBe(
      true,
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(readResult(resultRef).evoluSettingsContext.clearDatabaseArmed).toBe(
      false,
    );

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps unrelated context references stable when the mint draft changes", async () => {
    const advancedSettingsInput = createAdvancedSettings(noop);
    const evoluSettingsInput = createEvoluSettings(noopAsync);
    const resultRef = React.createRef<SystemSettingsCompositionResult | null>();
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <Harness
          advancedSettingsInput={advancedSettingsInput}
          evoluSettingsInput={evoluSettingsInput}
          mintDraft="https://one.example"
          resultRef={resultRef}
        />,
      );
    });
    const initial = readResult(resultRef);

    await act(async () => {
      root.render(
        <Harness
          advancedSettingsInput={advancedSettingsInput}
          evoluSettingsInput={evoluSettingsInput}
          mintDraft="https://two.example"
          resultRef={resultRef}
        />,
      );
    });
    const updated = readResult(resultRef);

    expect(updated.advancedSettingsContext).toBe(
      initial.advancedSettingsContext,
    );
    expect(updated.evoluSettingsContext).toBe(initial.evoluSettingsContext);
    expect(updated.relaySettingsContext).toBe(initial.relaySettingsContext);
    expect(updated.mintSettingsContext).not.toBe(initial.mintSettingsContext);

    await act(async () => {
      root.unmount();
    });
  });
});
