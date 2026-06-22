import { beforeEach, describe, expect, it } from "vitest";
import { CASHU_AUTOSWAP_STORAGE_KEY } from "./constants";
import { getInitialCashuAutoswapEnabled } from "./storage";

describe("Cashu autoswap preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is disabled by default", () => {
    expect(getInitialCashuAutoswapEnabled()).toBe(false);
  });

  it("preserves an explicit opt-in", () => {
    localStorage.setItem(CASHU_AUTOSWAP_STORAGE_KEY, "1");
    expect(getInitialCashuAutoswapEnabled()).toBe(true);
  });
});
