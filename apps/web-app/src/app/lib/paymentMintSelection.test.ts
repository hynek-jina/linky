import { describe, expect, it } from "vitest";
import { requiresMultipleMintsForAmount } from "./paymentMintSelection";

describe("requiresMultipleMintsForAmount", () => {
  it("returns true when combined balance is enough but no single mint covers the amount", () => {
    expect(
      requiresMultipleMintsForAmount([{ sum: 120 }, { sum: 80 }], 150),
    ).toBe(true);
  });

  it("returns false when a single mint can cover the amount", () => {
    expect(
      requiresMultipleMintsForAmount([{ sum: 200 }, { sum: 50 }], 150),
    ).toBe(false);
  });

  it("returns false when total balance is still insufficient", () => {
    expect(
      requiresMultipleMintsForAmount([{ sum: 60 }, { sum: 40 }], 150),
    ).toBe(false);
  });
});
