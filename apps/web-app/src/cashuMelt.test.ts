import { describe, expect, it } from "vitest";
import { getMeltSwapTargetAmount } from "./cashuMelt";

describe("getMeltSwapTargetAmount", () => {
  it("keeps the quoted total when there is no spare sat available", () => {
    expect(getMeltSwapTargetAmount(2339, 2339)).toBe(2339);
  });

  it("adds a one-sat buffer when the wallet can afford it", () => {
    expect(getMeltSwapTargetAmount(2339, 2340)).toBe(2340);
    expect(getMeltSwapTargetAmount(2339, 2500)).toBe(2340);
  });

  it("returns zero for invalid quoted totals", () => {
    expect(getMeltSwapTargetAmount(0, 10)).toBe(0);
  });
});
