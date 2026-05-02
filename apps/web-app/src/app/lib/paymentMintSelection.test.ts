import { describe, expect, it } from "vitest";
import { selectSingleMintCandidateForAmount } from "./paymentMintSelection";

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
