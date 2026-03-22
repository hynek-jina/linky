import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScanModal } from "../src/components/ScanModal";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  configurable: true,
  writable: true,
});

const translate = (key: string): string => {
  switch (key) {
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
  });

  it("shows the manual action only when allowed", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ScanModal
          closeScan={() => {}}
          onTypeManually={() => {}}
          pasteScanValue={async () => {}}
          scanVideoRef={{ current: null }}
          showTypeAction={true}
          t={translate}
        />,
      );
    });

    expect(container.textContent).toContain("Type");
    expect(container.textContent).toContain("Paste");

    await act(async () => {
      root.render(
        <ScanModal
          closeScan={() => {}}
          onTypeManually={() => {}}
          pasteScanValue={async () => {}}
          scanVideoRef={{ current: null }}
          showTypeAction={false}
          t={translate}
        />,
      );
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
          closeScan={() => {}}
          onTypeManually={onTypeManually}
          pasteScanValue={async () => {}}
          scanVideoRef={{ current: null }}
          showTypeAction={true}
          t={translate}
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
});
