import { describe, expect, it } from "vitest";
import { calculateTransactionHistoryFee } from "./transactionHistoryFee";

const buildCashuAToken = (amount: number): string => {
  const json = JSON.stringify({
    token: [{ mint: "https://mint.example", proofs: [{ amount }] }],
  });
  const encoded = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
  return `cashuA${encoded}`;
};

describe("calculateTransactionHistoryFee", () => {
  it("derives cashu send fee from used tokens minus sent amount minus change", () => {
    expect(
      calculateTransactionHistoryFee({
        amount: 60,
        fallbackFee: null,
        gainedTokens: [],
        usedTokens: [buildCashuAToken(61)],
      }),
    ).toBe(1);
  });

  it("derives lightning fee from used tokens minus lightning amount minus gained token", () => {
    expect(
      calculateTransactionHistoryFee({
        amount: 950,
        fallbackFee: null,
        gainedTokens: [buildCashuAToken(37)],
        usedTokens: [buildCashuAToken(1000)],
      }),
    ).toBe(13);
  });

  it("falls back to stored fee when old details do not contain used tokens", () => {
    expect(
      calculateTransactionHistoryFee({
        amount: 60,
        fallbackFee: 1,
        gainedTokens: [],
        usedTokens: [],
      }),
    ).toBe(1);
  });
});
