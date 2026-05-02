import { describe, expect, it } from "vitest";
import { formatDisplayAmountParts } from "./displayAmounts";

const fiatRates = {
  czkPerBtc: 1_000_000,
  fetchedAtMs: 0,
  usdPerBtc: 50_000,
};

describe("formatDisplayAmountParts", () => {
  it("does not mark a real fiat zero as approximate", () => {
    expect(
      formatDisplayAmountParts(0, {
        displayCurrency: "czk",
        fiatRates,
        lang: "cs",
      }),
    ).toMatchObject({
      amountText: "0",
      approxPrefix: "",
      unitLabel: "Kč",
    });
  });

  it("marks a non-zero fiat amount rounded to zero as approximate", () => {
    expect(
      formatDisplayAmountParts(1, {
        displayCurrency: "usd",
        fiatRates,
        lang: "en",
      }),
    ).toMatchObject({
      amountText: "0",
      approxPrefix: "~",
      unitLabel: "USD",
    });
  });
});
