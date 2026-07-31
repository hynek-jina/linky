import type { OwnerId } from "@evolu/common";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MintSettingsContextValue } from "../app/context/SystemSettingsContexts";
import { MintsPage } from "./MintsPage";

let mintSettings: MintSettingsContextValue;

vi.mock("../app/context/AppShellContexts", () => ({
  useAppShellCore: () => ({ t: (key: string) => key }),
}));

vi.mock("../app/context/SystemSettingsContexts", () => ({
  useMintSettingsContext: () => mintSettings,
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const appOwnerIdRef = React.createRef<OwnerId>();

const createMintSettings = (
  overrides: Partial<MintSettingsContextValue> = {},
): MintSettingsContextValue => ({
  appOwnerIdRef,
  applyDefaultMintSelection: vi.fn(async () => {}),
  cashuIsBusy: false,
  cashuMeltToMainMintButtonLabel: "Melt foreign balance",
  defaultMintUrl: "https://cashu.cz",
  defaultMintUrlDraft: "https://custom.example",
  getMintIconUrl: () => ({
    failed: false,
    host: null,
    origin: null,
    url: null,
  }),
  getMintRuntime: () => null,
  meltLargestForeignMintToMainMint: vi.fn(async () => {}),
  mintInfoByUrl: new Map(),
  pendingMintDeleteUrl: null,
  refreshMintInfo: async () => {},
  setDefaultMintUrlDraft: vi.fn(),
  setMintInfoAll: vi.fn(),
  setPendingMintDeleteUrl: vi.fn(),
  setStatus: vi.fn(),
  ...overrides,
});

const findButton = (
  container: HTMLElement,
  text: string,
): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`button missing: ${text}`);
  }
  return button;
};

const click = (button: HTMLButtonElement): void => {
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

describe("MintsPage", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("routes preset selection, custom save, and melt to their callbacks", async () => {
    const applyDefaultMintSelection = vi.fn(async () => {});
    const meltLargestForeignMintToMainMint = vi.fn(async () => {});
    mintSettings = createMintSettings({
      applyDefaultMintSelection,
      meltLargestForeignMintToMainMint,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<MintsPage />);
    });

    await act(async () => {
      click(findButton(container, "kashu.me"));
    });
    expect(applyDefaultMintSelection).toHaveBeenCalledWith("https://kashu.me");

    await act(async () => {
      click(findButton(container, "saveChanges"));
    });
    expect(applyDefaultMintSelection).toHaveBeenCalledWith(
      "https://custom.example",
    );

    await act(async () => {
      click(findButton(container, "Melt foreign balance"));
    });
    expect(meltLargestForeignMintToMainMint).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
  });

  it("updates the custom draft and blocks selection, save, and melt while busy", async () => {
    const applyDefaultMintSelection = vi.fn(async () => {});
    const meltLargestForeignMintToMainMint = vi.fn(async () => {});
    const setDefaultMintUrlDraft = vi.fn();
    mintSettings = createMintSettings({
      applyDefaultMintSelection,
      cashuIsBusy: true,
      meltLargestForeignMintToMainMint,
      setDefaultMintUrlDraft,
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<MintsPage />);
    });

    const input = container.querySelector("#defaultMintUrl");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("custom mint input missing");
    }
    expect(input.disabled).toBe(true);

    const presetButton = findButton(container, "kashu.me");
    const saveButton = findButton(container, "saveChanges");
    const meltButton = findButton(container, "Melt foreign balance");
    expect(presetButton.disabled).toBe(true);
    expect(saveButton.disabled).toBe(true);
    expect(meltButton.disabled).toBe(true);

    await act(async () => {
      click(presetButton);
      click(saveButton);
      click(meltButton);
    });
    expect(applyDefaultMintSelection).not.toHaveBeenCalled();
    expect(meltLargestForeignMintToMainMint).not.toHaveBeenCalled();
    expect(setDefaultMintUrlDraft).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});
