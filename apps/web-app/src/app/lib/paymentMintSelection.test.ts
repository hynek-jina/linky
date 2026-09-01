import { describe, expect, it } from "vitest";
import { selectSendMintForAmount } from "./paymentMintSelection";

const balances = [
  { amount: 50, mint: "https://main.mint" },
  { amount: 200, mint: "https://big.foreign" },
  { amount: 80, mint: "https://small.foreign" },
];

describe("selectSendMintForAmount", () => {
  it("prefers the largest foreign mint over the default mint", () => {
    expect(selectSendMintForAmount(balances, "https://main.mint", 40)).toBe(
      "https://big.foreign",
    );
  });

  it("falls back to the default mint when no foreign mint covers the amount", () => {
    const lowForeign = [
      { amount: 5, mint: "https://big.foreign" },
      { amount: 50, mint: "https://main.mint" },
    ];
    expect(selectSendMintForAmount(lowForeign, "https://main.mint", 40)).toBe(
      "https://main.mint",
    );
  });

  it("matches the preferred mint regardless of trailing slash", () => {
    expect(selectSendMintForAmount(balances, "https://big.foreign/", 40)).toBe(
      "https://small.foreign",
    );
  });

  it("returns null when no mint covers the amount or the amount is invalid", () => {
    expect(selectSendMintForAmount(balances, null, 500)).toBeNull();
    expect(selectSendMintForAmount(balances, null, 0)).toBeNull();
    expect(selectSendMintForAmount(balances, null, Number.NaN)).toBeNull();
  });
});
