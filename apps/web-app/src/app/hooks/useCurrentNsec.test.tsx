import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCurrentNsec } from "./useCurrentNsec";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const mocks = vi.hoisted(() => ({
  clearStoredPushNsec: vi.fn(),
  getInitialNostrNsec: vi.fn(),
  isNativePlatform: vi.fn(),
  readStoredNostrNsec: vi.fn(),
  setStoredPushNsec: vi.fn(),
}));

vi.mock("../../platform/identitySecrets", () => ({
  readStoredNostrNsec: mocks.readStoredNostrNsec,
}));

vi.mock("../../platform/runtime", () => ({
  isNativePlatform: mocks.isNativePlatform,
}));

vi.mock("../../utils/pushNsecStorage", () => ({
  clearStoredPushNsec: mocks.clearStoredPushNsec,
  setStoredPushNsec: mocks.setStoredPushNsec,
}));

vi.mock("../../utils/storage", () => ({
  getInitialNostrNsec: mocks.getInitialNostrNsec,
}));

const CurrentNsecProbe = () => {
  const { currentNsec, isResolved } = useCurrentNsec();
  return (
    <div>
      {String(isResolved)}:{currentNsec ?? "null"}
    </div>
  );
};

describe("useCurrentNsec", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("waits for native secret storage when its value diverges from localStorage", async () => {
    let resolveNativeRead: (value: string | null) => void = () => undefined;
    const nativeRead = new Promise<string | null>((resolve) => {
      resolveNativeRead = resolve;
    });
    mocks.getInitialNostrNsec.mockReturnValue("nsec1stale");
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.readStoredNostrNsec.mockReturnValue(nativeRead);

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<CurrentNsecProbe />);
    });

    expect(container.textContent).toBe("false:nsec1stale");

    await act(async () => {
      resolveNativeRead("nsec1authoritative");
      await nativeRead;
    });

    expect(container.textContent).toBe("true:nsec1authoritative");

    await act(async () => root.unmount());
  });
});
