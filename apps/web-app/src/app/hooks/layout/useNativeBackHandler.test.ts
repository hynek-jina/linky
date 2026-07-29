import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveNativeBackAction } from "./useNativeBackHandler";

const closeMenu = vi.fn();
const closeScan = vi.fn();
const dismissTopModal = vi.fn();
const navigateBack = vi.fn();

const targets = {
  closeMenu,
  closeScan,
  dismissTopModal: null,
  menuIsOpen: false,
  navigateBack: null,
  scanIsOpen: false,
};

beforeEach(() => {
  closeMenu.mockClear();
  closeScan.mockClear();
  dismissTopModal.mockClear();
  navigateBack.mockClear();
});

describe("resolveNativeBackAction", () => {
  it("returns null when there is nothing to go back to", () => {
    expect(resolveNativeBackAction(targets)).toBeNull();
  });

  it("dismisses an open modal instead of navigating the route underneath", () => {
    resolveNativeBackAction({ ...targets, dismissTopModal, navigateBack })?.();

    expect(dismissTopModal).toHaveBeenCalledTimes(1);
    expect(navigateBack).not.toHaveBeenCalled();
  });

  it("dismisses an open modal on a root screen that cannot navigate back", () => {
    resolveNativeBackAction({ ...targets, dismissTopModal })?.();

    expect(dismissTopModal).toHaveBeenCalledTimes(1);
  });

  it("dismisses a modal stacked over the scan overlay before closing the scan", () => {
    resolveNativeBackAction({
      ...targets,
      dismissTopModal,
      scanIsOpen: true,
    })?.();

    expect(dismissTopModal).toHaveBeenCalledTimes(1);
    expect(closeScan).not.toHaveBeenCalled();
  });

  it("closes the scan overlay before the menu", () => {
    resolveNativeBackAction({
      ...targets,
      menuIsOpen: true,
      scanIsOpen: true,
    })?.();

    expect(closeScan).toHaveBeenCalledTimes(1);
    expect(closeMenu).not.toHaveBeenCalled();
  });

  it("closes the menu before navigating the route", () => {
    resolveNativeBackAction({ ...targets, menuIsOpen: true, navigateBack })?.();

    expect(closeMenu).toHaveBeenCalledTimes(1);
    expect(navigateBack).not.toHaveBeenCalled();
  });

  it("navigates to the parent route when no overlay is open", () => {
    resolveNativeBackAction({ ...targets, navigateBack })?.();

    expect(navigateBack).toHaveBeenCalledTimes(1);
  });
});
