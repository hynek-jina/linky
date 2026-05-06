import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("../src/hooks/useRouting", () => ({
  useNavigation: () => mockNavigate,
}));

import { ScanModal } from "../src/components/ScanModal";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
  writable: true,
});

const translate = (key: string): string => {
  switch (key) {
    case "cashuEmit":
      return "Issue";
    case "close":
      return "Close";
    case "paste":
      return "Paste";
    case "scan":
      return "Scan";
    case "scanTypeManually":
      return "Type";
    default:
      return key;
  }
};

describe("ScanModal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    mockNavigate.mockReset();
  });

  const baseProps = {
    closeScan: () => {},
    onIssueToken: () => {},
    onPickScanImage: () => {},
    onScanImageSelected: () => {},
    onTypeManually: () => {},
    pasteScanValue: async () => {},
    scanEntryPoint: null,
    scanImageInputRef: { current: null },
    scanVideoRef: { current: null },
    showTypeAction: false,
    showWalletActions: false,
    t: translate,
  } satisfies React.ComponentProps<typeof ScanModal>;

  it("shows the manual action only when allowed", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<ScanModal {...baseProps} showTypeAction={true} />);
    });

    expect(container.textContent).toContain("Type");
    expect(container.textContent).toContain("Paste");

    await act(async () => {
      root.render(<ScanModal {...baseProps} showTypeAction={false} />);
    });

    expect(container.textContent).not.toContain("Type");
    expect(container.textContent).toContain("Paste");
  });

  it("calls the manual handler when the type button is pressed", async () => {
    const onTypeManually = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ScanModal
          {...baseProps}
          onTypeManually={onTypeManually}
          showTypeAction={true}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Type"),
    );

    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onTypeManually).toHaveBeenCalledTimes(1);
  });

  it("returns receive scan close to wallet", async () => {
    const closeScan = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ScanModal
          {...baseProps}
          closeScan={closeScan}
          scanEntryPoint="receive"
        />,
      );
    });

    const button = container.querySelector(".scan-header .topbar-btn");

    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(closeScan).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({ route: "wallet" });
  });

  it("shows issue action in send flow and calls it", async () => {
    const onIssueToken = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ScanModal
          {...baseProps}
          onIssueToken={onIssueToken}
          scanEntryPoint="send"
          showWalletActions={true}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll("button")).find(
      (element) => element.textContent?.includes("Issue"),
    );

    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onIssueToken).toHaveBeenCalledTimes(1);
  });
});
