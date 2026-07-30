import { describe, expect, it } from "vitest";
import {
  CONTACTS_PULL_REVEAL_DISTANCE_PX,
  getContactsPullProgress,
  shouldLockWalletWindowScroll,
} from "./useMainSwipePageEffects";

describe("getContactsPullProgress", () => {
  it("reveals the toolbar gradually across the full pull distance", () => {
    expect(getContactsPullProgress(0)).toBe(0);
    expect(getContactsPullProgress(CONTACTS_PULL_REVEAL_DISTANCE_PX / 2)).toBe(
      0.5,
    );
    expect(getContactsPullProgress(CONTACTS_PULL_REVEAL_DISTANCE_PX)).toBe(1);
  });

  it("clamps progress outside the reveal range", () => {
    expect(getContactsPullProgress(-20)).toBe(0);
    expect(getContactsPullProgress(CONTACTS_PULL_REVEAL_DISTANCE_PX * 2)).toBe(
      1,
    );
  });
});

describe("shouldLockWalletWindowScroll", () => {
  it("does not lock window scroll outside the wallet route", () => {
    expect(shouldLockWalletWindowScroll("contacts")).toBe(false);
    expect(shouldLockWalletWindowScroll("chat")).toBe(false);
  });

  it("locks window scroll on the wallet route", () => {
    expect(shouldLockWalletWindowScroll("wallet")).toBe(true);
  });
});
