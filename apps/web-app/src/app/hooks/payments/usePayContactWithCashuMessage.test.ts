import { describe, expect, it } from "vitest";
import { buildCashuSendAmountAttempts } from "./usePayContactWithCashuMessage";

describe("buildCashuSendAmountAttempts", () => {
  it("uses the full-balance fee ladder when there is reserve budget left", () => {
    expect(
      buildCashuSendAmountAttempts({
        requestedAmountSat: 100,
        availableAmountSat: 100,
        reservedFeeSat: 0,
        maxReservedFeeSat: 5,
      }),
    ).toEqual([100, 99, 98, 97, 95]);
  });

  it("filters out attempts that would exceed the shared reserve budget", () => {
    expect(
      buildCashuSendAmountAttempts({
        requestedAmountSat: 50,
        availableAmountSat: 50,
        reservedFeeSat: 4,
        maxReservedFeeSat: 5,
      }),
    ).toEqual([50, 49]);
  });

  it("keeps a single attempt when not spending the whole mint balance", () => {
    expect(
      buildCashuSendAmountAttempts({
        requestedAmountSat: 50,
        availableAmountSat: 60,
        reservedFeeSat: 0,
        maxReservedFeeSat: 5,
      }),
    ).toEqual([50]);
  });
});
