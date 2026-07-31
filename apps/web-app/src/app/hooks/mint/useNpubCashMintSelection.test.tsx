import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { nip19 } from "nostr-tools";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY } from "../../../utils/mint";
import {
  getMintSelectionAutoswapPlan,
  getMintSelectionDisplayName,
  resolveMintSyncServerBaseUrl,
  useNpubCashMintSelection,
} from "./useNpubCashMintSelection";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("getMintSelectionAutoswapPlan", () => {
  it("warns when changing the main mint would autoswap eligible balance", () => {
    expect(
      getMintSelectionAutoswapPlan({
        cashuAutoswapEnabled: true,
        currentMainMintAcceptedBalance: 128,
        currentMintUrl: "https://cashu.cz",
        nextMintUrl: "https://kashu.me",
      }),
    ).toEqual({
      shouldDisableAutoswapForTestMint: false,
      shouldWarnAboutMintChange: true,
    });
  });

  it("skips the warning when the current main-mint balance is below the autoswap threshold", () => {
    expect(
      getMintSelectionAutoswapPlan({
        cashuAutoswapEnabled: true,
        currentMainMintAcceptedBalance: 127,
        currentMintUrl: "https://cashu.cz",
        nextMintUrl: "https://kashu.me",
      }),
    ).toEqual({
      shouldDisableAutoswapForTestMint: false,
      shouldWarnAboutMintChange: false,
    });
  });

  it("disables autoswap instead of warning when the new mint is a test mint", () => {
    expect(
      getMintSelectionAutoswapPlan({
        cashuAutoswapEnabled: true,
        currentMainMintAcceptedBalance: 5_000,
        currentMintUrl: "https://cashu.cz",
        nextMintUrl: "https://testnut.cashu.space",
      }),
    ).toEqual({
      shouldDisableAutoswapForTestMint: true,
      shouldWarnAboutMintChange: false,
    });
  });
});

describe("getMintSelectionDisplayName", () => {
  it("returns the host for normalized mint URLs", () => {
    expect(getMintSelectionDisplayName("https://mint.minibits.cash")).toBe(
      "mint.minibits.cash",
    );
  });
});

describe("resolveMintSyncServerBaseUrl", () => {
  it("uses the dedicated Linky claim host when the user owns a hosted Linky alias", () => {
    expect(
      resolveMintSyncServerBaseUrl({
        npubCashServerBaseUrl: "https://npub.cash",
        ownedLightningAddresses: ["alice@linky.fit"],
        profileClaimLightningAddressServerBaseUrl: "https://npub.linky.fit",
      }),
    ).toBe("https://npub.linky.fit");
  });

  it("falls back to the current lightning-address host when no hosted Linky alias is owned", () => {
    expect(
      resolveMintSyncServerBaseUrl({
        npubCashServerBaseUrl: "https://npub.cash",
        ownedLightningAddresses: [],
        profileClaimLightningAddressServerBaseUrl: "https://npub.linky.fit",
      }),
    ).toBe("https://npub.cash");
  });
});

interface SelectionHarnessProps {
  applyRef: React.RefObject<((mintUrl: string) => Promise<void>) | null>;
  cashuAutoswapEnabled: boolean;
  currentMainMintAcceptedBalance: number;
  defaultMintUrl: string;
  makeLocalStorageKey: (prefix: string) => string;
  ownedLightningAddresses: readonly string[];
  pushToast: (message: string) => void;
  requestMintAutoswapChangeConfirmation: (args: {
    fromMint: string;
    toMint: string;
  }) => Promise<boolean>;
  setCashuAutoswapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setDefaultMintUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setDefaultMintUrlDraft: React.Dispatch<React.SetStateAction<string>>;
  setStatus: React.Dispatch<React.SetStateAction<string | null>>;
}

const validNsec = nip19.nsecEncode(
  Uint8Array.from({ length: 32 }, (_, index) => index + 1),
);

const SelectionHarness = ({
  applyRef,
  cashuAutoswapEnabled,
  currentMainMintAcceptedBalance,
  defaultMintUrl,
  makeLocalStorageKey,
  ownedLightningAddresses,
  pushToast,
  requestMintAutoswapChangeConfirmation,
  setCashuAutoswapEnabled,
  setDefaultMintUrl,
  setDefaultMintUrlDraft,
  setStatus,
}: SelectionHarnessProps): null => {
  const hasMintOverrideRef = React.useRef(false);
  const npubCashMintSyncRef = React.useRef<string | null>(null);
  const { applyDefaultMintSelection } = useNpubCashMintSelection({
    cashuAutoswapEnabled,
    currentMainMintAcceptedBalance,
    currentNpub: "npub-test",
    currentNsec: validNsec,
    defaultMintUrl,
    defaultMintUrlDraft: defaultMintUrl,
    hasMintOverrideRef,
    makeLocalStorageKey,
    npubCashMintSyncRef,
    npubCashServerBaseUrl: "https://npub.cash",
    ownedLightningAddresses,
    profileClaimLightningAddressServerBaseUrl: "https://npub.linky.fit",
    pushToast,
    requestMintAutoswapChangeConfirmation,
    setCashuAutoswapEnabled,
    setDefaultMintUrl,
    setDefaultMintUrlDraft,
    setStatus,
    t: (key) => key,
  });
  React.useEffect(() => {
    applyRef.current = applyDefaultMintSelection;
  }, [applyDefaultMintSelection, applyRef]);
  return null;
};

const readApplyMintSelection = (
  applyRef: React.RefObject<((mintUrl: string) => Promise<void>) | null>,
): ((mintUrl: string) => Promise<void>) => {
  if (applyRef.current === null) {
    throw new Error("mint selection callback missing");
  }
  return applyRef.current;
};

interface RenderSelectionHarnessOptions {
  cashuAutoswapEnabled?: boolean;
  currentMainMintAcceptedBalance?: number;
  defaultMintUrl?: string;
  ownedLightningAddresses?: readonly string[];
  requestConfirmationResult?: boolean;
}

const renderSelectionHarness = async ({
  cashuAutoswapEnabled = true,
  currentMainMintAcceptedBalance = 1_000,
  defaultMintUrl = "https://cashu.cz",
  ownedLightningAddresses = ["alice@linky.fit"],
  requestConfirmationResult = true,
}: RenderSelectionHarnessOptions = {}) => {
  const pushToast = vi.fn();
  const requestMintAutoswapChangeConfirmation = vi.fn(
    async () => requestConfirmationResult,
  );
  const setCashuAutoswapEnabled =
    vi.fn<React.Dispatch<React.SetStateAction<boolean>>>();
  const setDefaultMintUrl =
    vi.fn<React.Dispatch<React.SetStateAction<string | null>>>();
  const setDefaultMintUrlDraft =
    vi.fn<React.Dispatch<React.SetStateAction<string>>>();
  const setStatus =
    vi.fn<React.Dispatch<React.SetStateAction<string | null>>>();
  const makeLocalStorageKey = (prefix: string): string => `${prefix}.owner`;
  const applyRef = React.createRef<
    ((mintUrl: string) => Promise<void>) | null
  >();
  const root = createRoot(document.createElement("div"));

  await act(async () => {
    root.render(
      <SelectionHarness
        applyRef={applyRef}
        cashuAutoswapEnabled={cashuAutoswapEnabled}
        currentMainMintAcceptedBalance={currentMainMintAcceptedBalance}
        defaultMintUrl={defaultMintUrl}
        makeLocalStorageKey={makeLocalStorageKey}
        ownedLightningAddresses={ownedLightningAddresses}
        pushToast={pushToast}
        requestMintAutoswapChangeConfirmation={
          requestMintAutoswapChangeConfirmation
        }
        setCashuAutoswapEnabled={setCashuAutoswapEnabled}
        setDefaultMintUrl={setDefaultMintUrl}
        setDefaultMintUrlDraft={setDefaultMintUrlDraft}
        setStatus={setStatus}
      />,
    );
  });

  return {
    applyRef,
    makeLocalStorageKey,
    pushToast,
    requestMintAutoswapChangeConfirmation,
    root,
    setCashuAutoswapEnabled,
    setDefaultMintUrl,
    setDefaultMintUrlDraft,
    setStatus,
  };
};

describe("useNpubCashMintSelection", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("does not persist a mint when hosted mint sync fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const harness = await renderSelectionHarness();

    await act(async () => {
      await readApplyMintSelection(harness.applyRef)("https://kashu.me");
    });

    expect(
      localStorage.getItem(
        harness.makeLocalStorageKey(CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY),
      ),
    ).toBeNull();
    expect(harness.setDefaultMintUrl).not.toHaveBeenCalled();
    expect(harness.setDefaultMintUrlDraft).not.toHaveBeenCalled();
    expect(harness.setCashuAutoswapEnabled).not.toHaveBeenCalled();
    expect(harness.pushToast).toHaveBeenCalledWith("mintUpdateFailed");

    await act(async () => {
      harness.root.unmount();
    });
  });

  it("saves the synced mint but disables autoswap when migration is declined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const harness = await renderSelectionHarness({
      requestConfirmationResult: false,
    });

    await act(async () => {
      await readApplyMintSelection(harness.applyRef)("https://kashu.me");
    });

    expect(
      localStorage.getItem(
        harness.makeLocalStorageKey(CASHU_DEFAULT_MINT_OVERRIDE_STORAGE_KEY),
      ),
    ).toBe("https://kashu.me");
    expect(harness.requestMintAutoswapChangeConfirmation).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.setDefaultMintUrl).toHaveBeenCalledWith("https://kashu.me");
    expect(harness.setDefaultMintUrlDraft).toHaveBeenCalledWith(
      "https://kashu.me",
    );
    expect(harness.setCashuAutoswapEnabled).toHaveBeenCalledWith(false);
    expect(harness.setStatus).toHaveBeenLastCalledWith(
      "mintSavedAutoswapDisabled",
    );

    await act(async () => {
      harness.root.unmount();
    });
  });

  it("disables autoswap for a test mint without showing migration confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    const harness = await renderSelectionHarness();

    await act(async () => {
      await readApplyMintSelection(harness.applyRef)(
        "https://testnut.cashu.space",
      );
    });

    expect(
      harness.requestMintAutoswapChangeConfirmation,
    ).not.toHaveBeenCalled();
    expect(harness.setDefaultMintUrl).toHaveBeenCalledWith(
      "https://testnut.cashu.space",
    );
    expect(harness.setCashuAutoswapEnabled).toHaveBeenCalledWith(false);
    expect(harness.setStatus).toHaveBeenLastCalledWith(
      "mintSavedAutoswapDisabledTestMint",
    );

    await act(async () => {
      harness.root.unmount();
    });
  });
});
