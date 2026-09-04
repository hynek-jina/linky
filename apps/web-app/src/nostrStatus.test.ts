import { describe, expect, it } from "vitest";
import { parseProfileExchangeStatusCurrencies } from "./nostrStatus";

describe("profile exchange status currencies", () => {
  it("silently removes legacy USD while preserving supported currencies", () => {
    expect(parseProfileExchangeStatusCurrencies("BTC, CZK, USD")).toEqual([
      "BTC",
      "CZK",
    ]);
    expect(parseProfileExchangeStatusCurrencies("USD")).toEqual([]);
  });
});
