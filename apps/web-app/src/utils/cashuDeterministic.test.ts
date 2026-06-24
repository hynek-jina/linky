import { describe, expect, it } from "vitest";
import {
  CASHU_DETERMINISTIC_OUTPUT_BLOCK_SIZE,
  getCashuSwapCounterUsage,
  getCashuSwapOutputCounters,
} from "./cashuDeterministic";

describe("deterministic Cashu swap output ranges", () => {
  it("keeps send and change outputs in separate counter blocks", () => {
    expect(getCashuSwapOutputCounters(120)).toEqual({
      send: 120,
      keep: 120 + CASHU_DETERMINISTIC_OUTPUT_BLOCK_SIZE,
    });
  });

  it("advances beyond the reserved send block and used change outputs", () => {
    expect(getCashuSwapCounterUsage(3)).toBe(
      CASHU_DETERMINISTIC_OUTPUT_BLOCK_SIZE + 3,
    );
  });
});
