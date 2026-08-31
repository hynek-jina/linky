import { describe, expect, it } from "vitest";
import {
  selectSendMintForAmount,
  selectSingleMintCandidateForAmount,
} from "./paymentMintSelection";

describe("selectSingleMintCandidateForAmount", () => {
  it("selects the first mint that can cover the amount", () => {
    expect(
      selectSingleMintCandidateForAmount(
        [
          { mint: "https://a.example", sum: 120, tokens: ["a"] },
          { mint: "https://b.example", sum: 200, tokens: ["b"] },
        ],
        150,
      )?.mint,
    ).toBe("https://b.example");
  });

  it("does not combine balances across mints", () => {
    expect(
      selectSingleMintCandidateForAmount(
        [
          { mint: "https://a.example", sum: 120, tokens: ["a"] },
          { mint: "https://b.example", sum: 80, tokens: ["b"] },
        ],
        150,
      ),
    ).toBeNull();
  });

  it("falls back to the first candidate when the amount is unknown", () => {
    expect(
      selectSingleMintCandidateForAmount(
        [{ mint: "https://a.example", sum: 60, tokens: ["a"] }],
        0,
      )?.mint,
    ).toBe("https://a.example");
  });
});

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
