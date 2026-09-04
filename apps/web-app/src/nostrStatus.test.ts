import { describe, expect, it } from "vitest";
import {
  parseProfileExchangeStatusCurrencies,
  PROFILE_STATUS_CURRENCIES,
} from "./nostrStatus";

describe("profile exchange status currencies", () => {
  it("offers EUR instead of USD in the profile", () => {
    expect(PROFILE_STATUS_CURRENCIES).toEqual(["BTC", "CZK", "EUR"]);
  });

  it("silently removes legacy USD while preserving supported currencies", () => {
    expect(parseProfileExchangeStatusCurrencies("BTC, CZK, USD")).toEqual([
      "BTC",
      "CZK",
    ]);
    expect(parseProfileExchangeStatusCurrencies("USD")).toEqual([]);
  });
});
