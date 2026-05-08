import { describe, expect, it } from "vitest";
import {
  getMintSelectionAutoswapPlan,
  getMintSelectionDisplayName,
} from "./useNpubCashMintSelection";

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
