import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

const mocks = vi.hoisted(() => ({
  setCurrentNsec: vi.fn<(currentNsec: string | null) => void>(),
  useAppShellComposition: vi.fn(),
  useCurrentNsec: vi.fn(),
  useUnauthenticatedAppShellComposition: vi.fn(),
}));

vi.mock("./hooks/useCurrentNsec", () => ({
  useCurrentNsec: mocks.useCurrentNsec,
}));

vi.mock("./useAppShellComposition", () => ({
  useAppShellComposition: mocks.useAppShellComposition,
}));

vi.mock("./useUnauthenticatedAppShellComposition", () => ({
  useUnauthenticatedAppShellComposition:
    mocks.useUnauthenticatedAppShellComposition,
}));

vi.mock("../components/AuthenticatedLayout", () => ({
  AuthenticatedLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="authenticated">{children}</div>
  ),
}));

vi.mock("../components/UnauthenticatedLayout", () => ({
  UnauthenticatedLayout: () => <div data-testid="unauthenticated" />,
}));

vi.mock("../components/CashuContactSendBanner", () => ({
  CashuContactSendBanner: () => null,
}));

vi.mock("../components/InstallPwaBanner", () => ({
  InstallPwaBanner: () => null,
}));

vi.mock("../components/PwaUpdateBanner", () => ({
  PwaUpdateBanner: () => null,
}));

vi.mock("../components/ToastNotifications", () => ({
  ToastNotifications: () => null,
}));

vi.mock("./context/AppShellContexts", () => ({
  AppShellContextsProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("./routes/AppRouteContent", () => ({
  AppRouteContent: () => <div data-testid="route" />,
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
  writable: true,
});

const translate = (key: string): string => key;

const onboardingComposition = {
  confirmPendingOnboardingProfile: vi.fn(),
  createNewAccount: vi.fn(),
  cyclePendingOnboardingAvatarControl: vi.fn(),
  dismissToast: vi.fn(),
  lang: "en",
  onboardingIsBusy: false,
  onboardingPhotoInputRef: { current: null },
  onboardingStep: null,
  openReturningOnboarding: vi.fn(),
  onPendingOnboardingPhotoError: vi.fn(),
  onPendingOnboardingPhotoSelected: vi.fn(),
  pasteReturningSlip39FromClipboard: vi.fn(),
  pickPendingOnboardingPhoto: vi.fn(),
  selectPendingOnboardingGeneratedAvatar: vi.fn(),
  savePendingOnboardingBackupToPasswordManager: vi.fn(),
  selectReturningSlip39Suggestion: vi.fn(),
  setLang: vi.fn(),
  setOnboardingStep: vi.fn(),
  setPendingOnboardingName: vi.fn(),
  setReturningSlip39Input: vi.fn(),
  submitReturningSlip39: vi.fn(),
  t: translate,
  toasts: [],
};

const authenticatedComposition = {
  appActions: {},
  appState: {},
  cancelPendingCashuContactSend: vi.fn(),
  dismissToast: vi.fn(),
  formatDisplayedAmountText: vi.fn(),
  isMainSwipeRoute: false,
  mainSwipeRouteProps: {},
  moneyRouteProps: {},
  pageClassNameWithSwipe: "page",
  pendingCashuContactSend: null,
  peopleRouteProps: {},
  advancedSettingsContext: {},
  evoluSettingsContext: {},
  mintSettingsContext: {},
  relaySettingsContext: {},
  t: translate,
  toasts: [],
};

const renderAppShell = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<AppShell />);
  });

  return { container, root };
};

describe("AppShell composition boundary", () => {
  beforeEach(() => {
    mocks.setCurrentNsec.mockReset();
    mocks.useAppShellComposition.mockReset();
    mocks.useCurrentNsec.mockReset();
    mocks.useUnauthenticatedAppShellComposition.mockReset();
    mocks.useAppShellComposition.mockReturnValue(authenticatedComposition);
    mocks.useUnauthenticatedAppShellComposition.mockReturnValue(
      onboardingComposition,
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts neither composition while authentication is unresolved", async () => {
    mocks.useCurrentNsec.mockReturnValue({
      currentNsec: null,
      isResolved: false,
      setCurrentNsec: mocks.setCurrentNsec,
    });

    const { root } = await renderAppShell();

    expect(mocks.useAppShellComposition).not.toHaveBeenCalled();
    expect(mocks.useUnauthenticatedAppShellComposition).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });

  it("mounts only the onboarding composition when unauthenticated", async () => {
    mocks.useCurrentNsec.mockReturnValue({
      currentNsec: null,
      isResolved: true,
      setCurrentNsec: mocks.setCurrentNsec,
    });

    const { container, root } = await renderAppShell();

    expect(mocks.useUnauthenticatedAppShellComposition).toHaveBeenCalledOnce();
    expect(mocks.useAppShellComposition).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="unauthenticated"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });

  it("mounts only the full composition when authenticated", async () => {
    mocks.useCurrentNsec.mockReturnValue({
      currentNsec: "nsec1authenticated",
      isResolved: true,
      setCurrentNsec: mocks.setCurrentNsec,
    });

    const { container, root } = await renderAppShell();

    expect(mocks.useAppShellComposition).toHaveBeenCalledWith({
      currentNsec: "nsec1authenticated",
      setCurrentNsec: mocks.setCurrentNsec,
    });
    expect(mocks.useUnauthenticatedAppShellComposition).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="authenticated"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });
});
