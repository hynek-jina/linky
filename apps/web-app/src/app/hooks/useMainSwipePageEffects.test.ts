import { describe, expect, it } from "vitest";
import { shouldLockWalletWindowScroll } from "./useMainSwipePageEffects";

describe("shouldLockWalletWindowScroll", () => {
  it("does not lock window scroll outside the wallet route", () => {
    expect(shouldLockWalletWindowScroll("contacts")).toBe(false);
    expect(shouldLockWalletWindowScroll("chat")).toBe(false);
  });

  it("locks window scroll on the wallet route", () => {
    expect(shouldLockWalletWindowScroll("wallet")).toBe(true);
  });
});
