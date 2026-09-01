import { blankOutputCount } from "./blankOutputs";

describe("blankOutputCount", () => {
  it("matches cashu-ts's ceil(log2(excess)) || 1 rule", () => {
    expect(blankOutputCount(0)).toBe(0);
    expect(blankOutputCount(-3)).toBe(0);
    expect(blankOutputCount(1)).toBe(1);
    expect(blankOutputCount(2)).toBe(1);
    expect(blankOutputCount(3)).toBe(2);
    expect(blankOutputCount(4)).toBe(2);
    expect(blankOutputCount(5)).toBe(3);
    expect(blankOutputCount(1000)).toBe(10);
  });

  it("truncates fractions and ignores non-finite input", () => {
    expect(blankOutputCount(0.9)).toBe(0);
    expect(blankOutputCount(3.7)).toBe(2);
    expect(blankOutputCount(Number.NaN)).toBe(0);
    expect(blankOutputCount(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
