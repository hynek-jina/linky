import { describe, expect, it, vi } from "vitest";
import type { CashuSendResult } from "../../../cashuSend";
import {
  buildCashuMessagePaymentPayload,
  buildCashuSendAmountAttempts,
} from "./buildCashuMessagePaymentPayload";
import type { SelectedCashuMessagePayment } from "./cashuMessagePaymentTypes";

const selection: SelectedCashuMessagePayment = {
  amountAttempts: [100, 99, 98, 97, 95],
  candidate: {
    mint: "https://mint.example",
    sum: 100,
    tokens: ["token-a", "token-b"],
  },
  candidates: [
    {
      mint: "https://mint.example",
      sum: 100,
      tokens: ["token-a", "token-b"],
    },
  ],
  kind: "selected",
  requestedAmountSat: 100,
};

const failure = (error: string): CashuSendResult => ({
  error,
  mint: "https://mint.example",
  ok: false,
  remainingAmount: 0,
  remainingToken: null,
  sendAmount: 100,
  unit: "sat",
});

const success = (sendAmount: number): CashuSendResult => ({
  mint: "https://mint.example",
  ok: true,
  remainingAmount: 100 - sendAmount,
  remainingToken: sendAmount < 100 ? "change-token" : null,
  sendAmount,
  sendProofs: [],
  sendToken: `send-${sendAmount}`,
  unit: "sat",
});

describe("buildCashuSendAmountAttempts", () => {
  it("uses the full-balance fee ladder within the reserve cap", () => {
    expect(
      buildCashuSendAmountAttempts({
        availableAmountSat: 100,
        maxReservedFeeSat: 5,
        requestedAmountSat: 100,
        reservedFeeSat: 0,
      }),
    ).toEqual([100, 99, 98, 97, 95]);
  });

  it("filters attempts beyond an already-used reserve", () => {
    expect(
      buildCashuSendAmountAttempts({
        availableAmountSat: 50,
        maxReservedFeeSat: 5,
        requestedAmountSat: 50,
        reservedFeeSat: 4,
      }),
    ).toEqual([50, 49]);
  });

  it("uses one attempt for a partial-balance send", () => {
    expect(
      buildCashuSendAmountAttempts({
        availableAmountSat: 60,
        maxReservedFeeSat: 5,
        requestedAmountSat: 50,
        reservedFeeSat: 0,
      }),
    ).toEqual([50]);
  });
});

describe("buildCashuMessagePaymentPayload", () => {
  it("retries returned and thrown retryable failures and carries actual amount", async () => {
    const createSendToken = vi
      .fn<
        (args: {
          amount: number;
          mint: string;
          tokens: string[];
          unit: string;
        }) => Promise<CashuSendResult>
      >()
      .mockResolvedValueOnce(failure("insufficient funds"))
      .mockRejectedValueOnce(new Error("not enough balance"))
      .mockResolvedValueOnce(success(98));
    const commitSwapState = vi.fn(async () => undefined);

    const result = await buildCashuMessagePaymentPayload({
      commitSwapState,
      createSendToken,
      logPayStep: vi.fn(),
      selection,
    });

    expect(createSendToken.mock.calls.map(([args]) => args.amount)).toEqual([
      100, 99, 98,
    ]);
    expect(createSendToken).toHaveBeenLastCalledWith({
      amount: 98,
      mint: "https://mint.example",
      tokens: ["token-a", "token-b"],
      unit: "sat",
    });
    expect(result).toMatchObject({
      batch: { amount: 98, token: "send-98" },
      gainedToken: "change-token",
      kind: "success",
      usedInputTokens: ["token-a", "token-b"],
    });
    expect(commitSwapState).toHaveBeenCalledOnce();
  });

  it.each([
    ["returned", false],
    ["thrown", true],
  ])("stops on a non-retryable %s failure", async (_label, throws) => {
    const createSendToken =
      vi.fn<
        (args: {
          amount: number;
          mint: string;
          tokens: string[];
          unit: string;
        }) => Promise<CashuSendResult>
      >();
    if (throws) {
      createSendToken.mockRejectedValue(new Error("invalid proof"));
    } else {
      createSendToken.mockResolvedValue(failure("invalid proof"));
    }

    const result = await buildCashuMessagePaymentPayload({
      commitSwapState: vi.fn(async () => undefined),
      createSendToken,
      logPayStep: vi.fn(),
      selection,
    });

    expect(createSendToken).toHaveBeenCalledOnce();
    expect(result).toEqual({
      error: throws ? "Error: invalid proof" : "invalid proof",
      kind: "failure",
      mint: "https://mint.example",
    });
  });

  it("commits recovery state and does not retry", async () => {
    const recovery: CashuSendResult = {
      error: "swap output recovery",
      mint: "https://mint.example",
      ok: false,
      remainingAmount: 100,
      remainingToken: "recovery-token",
      sendAmount: 100,
      unit: "sat",
    };
    const createSendToken = vi.fn(async () => recovery);
    let committed = false;

    const result = await buildCashuMessagePaymentPayload({
      commitSwapState: vi.fn(async () => {
        committed = true;
      }),
      createSendToken,
      logPayStep: vi.fn(),
      selection,
    });

    expect(committed).toBe(true);
    expect(createSendToken).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      kind: "recovery",
      recoveryAmount: 100,
      recoveryToken: "recovery-token",
    });
  });

  it("returns a failure when committing irreversible swap state fails", async () => {
    const result = await buildCashuMessagePaymentPayload({
      commitSwapState: vi.fn(async () => {
        throw new Error("persistence failed");
      }),
      createSendToken: vi.fn(async () => success(100)),
      logPayStep: vi.fn(),
      selection,
    });

    expect(result).toEqual({
      error: "Error: persistence failed",
      kind: "failure",
      mint: "https://mint.example",
    });
  });
});
