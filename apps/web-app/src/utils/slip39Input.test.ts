import { describe, expect, it } from "vitest";
import {
  analyzeSlip39Input,
  applySlip39Suggestion,
  normalizeSlip39Input,
} from "./slip39Input";

describe("normalizeSlip39Input", () => {
  it("normalizes commas and mixed whitespace into spaces", () => {
    expect(
      normalizeSlip39Input("  academic,ACID\nacne   acquire ; acrobat "),
    ).toBe("academic acid acne acquire acrobat");
  });
});

describe("analyzeSlip39Input", () => {
  it("keeps partial trailing words out of invalid state when they match prefixes", () => {
    expect(analyzeSlip39Input("academic ac").invalidWords).toEqual([]);
  });

  it("flags unknown completed words", () => {
    expect(analyzeSlip39Input("academic nope").invalidWords).toEqual(["nope"]);
  });

  it("offers suggestions for the active partial word", () => {
    expect(analyzeSlip39Input("academic ac").suggestions).toContain("acid");
  });
});

describe("applySlip39Suggestion", () => {
  it("replaces the active partial word with the selected suggestion", () => {
    expect(applySlip39Suggestion("academic ac", "acid")).toBe("academic acid");
  });

  it("appends a suggestion when the input ends with a separator", () => {
    expect(applySlip39Suggestion("academic ", "acid")).toBe("academic acid");
  });
});
